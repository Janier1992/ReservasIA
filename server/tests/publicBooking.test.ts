import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createInsforgeMock } from "./helpers/insforgeMock.js";

const getAvailableSlotsMock = vi.fn();
const findOrCreateCustomerByPhoneMock = vi.fn();
const createReservationMock = vi.fn();

vi.mock("../src/services/availability/availabilityService.js", () => ({
  getAvailableSlots: (...args: unknown[]) => getAvailableSlotsMock(...args)
}));
vi.mock("../src/services/customers/customersService.js", () => ({
  findOrCreateCustomerByPhone: (...args: unknown[]) => findOrCreateCustomerByPhoneMock(...args)
}));
vi.mock("../src/services/reservations/reservationsService.js", () => ({
  createReservation: (...args: unknown[]) => createReservationMock(...args)
}));

const SERVICE_ID = "11111111-1111-4111-8111-111111111111";
const ACTIVE_ORG = { id: "org-1", slug: "lavadero-aguaclara", business_type: "car_wash", timezone: "America/Bogota", status: "active", disabled_modules: [] };

function mockFor(org: Record<string, unknown> | null) {
  return createInsforgeMock({
    organizations: { data: org, error: null },
    business_profiles: {
      data: { name: "Lavadero Aguaclara", description: null, address: "Calle 1", phone: "300", logo_url: null, max_booking_days: 30 },
      error: null
    },
    services: [
      { data: [{ id: SERVICE_ID, name: "Lavado general", description: null, duration_minutes: 60, price: 35000, currency: "COP" }], error: null },
      { data: { id: SERVICE_ID, duration_minutes: 60 }, error: null }
    ]
  });
}

let insforgeMockInstance = mockFor(ACTIVE_ORG);
vi.mock("../src/lib/insforge.js", () => ({
  get insforgeAdmin() {
    return insforgeMockInstance;
  }
}));

const { createApp } = await import("../src/app.js");
const app = createApp();

const SLOT = { start: "2026-10-01T15:00:00.000Z", end: "2026-10-01T16:00:00.000Z", availableResourceIds: ["bay-2", "bay-3"] };
const validBooking = {
  serviceId: SERVICE_ID,
  date: "2026-10-01",
  start: SLOT.start,
  name: "Carlos Ruiz",
  phone: "+57 300 111 2233",
  notes: "Placa GHT331",
  dataConsent: true
};

/** Copia de un objeto sin una de sus claves. */
function without<T extends object, K extends keyof T>(obj: T, key: K): Omit<T, K> {
  const copy = { ...obj };
  delete copy[key];
  return copy;
}

// Cada test usa su propia IP para no chocar con el límite de reservas por IP.
let ip = 0;
const nextIp = () => `10.0.0.${++ip}`;

describe("public booking API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    insforgeMockInstance = mockFor(ACTIVE_ORG);
    getAvailableSlotsMock.mockResolvedValue({ slots: [SLOT], timezone: "America/Bogota" });
    findOrCreateCustomerByPhoneMock.mockResolvedValue({ id: "cust-1" });
    createReservationMock.mockResolvedValue({ id: "res-1", start_at: SLOT.start, end_at: SLOT.end });
  });

  it("muestra el negocio y sus servicios activos sin identificadores internos", async () => {
    const res = await request(app).get("/api/public/businesses/lavadero-aguaclara");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: "Lavadero Aguaclara", businessType: "car_wash", services: [{ id: SERVICE_ID, price: 35000 }] });
    expect(res.body.organizationId).toBeUndefined();
  });

  it("responde el mismo 404 para un negocio inexistente, suspendido o sin página pública", async () => {
    for (const org of [null, { ...ACTIVE_ORG, status: "suspended" }, { ...ACTIVE_ORG, disabled_modules: ["public_booking"] }]) {
      insforgeMockInstance = mockFor(org);
      const res = await request(app).get("/api/public/businesses/lavadero-aguaclara");
      expect(res.status).toBe(404);
      expect(res.body.error.message).toBe("Este negocio no tiene reservas en línea disponibles.");
    }
  });

  it("devuelve los horarios sin revelar qué recurso está libre", async () => {
    const res = await request(app).get(`/api/public/businesses/lavadero-aguaclara/availability?serviceId=${SERVICE_ID}&date=2026-10-01`);
    expect(res.status).toBe(200);
    expect(res.body.slots).toEqual([{ start: SLOT.start, end: SLOT.end }]);
  });

  it("reserva un horario todavía libre en el primer recurso libre, con el teléfono normalizado", async () => {
    const res = await request(app).post("/api/public/businesses/lavadero-aguaclara/reservations").set("X-Forwarded-For", nextIp()).send(validBooking);
    expect(res.status).toBe(201);
    expect(findOrCreateCustomerByPhoneMock).toHaveBeenCalledWith("org-1", "+573001112233", "Carlos Ruiz", undefined);
    // Queda la prueba de la autorización en el cliente (Ley 1581, art. 9).
    expect(insforgeMockInstance.database.from).toHaveBeenCalledWith("customers");
    expect(createReservationMock).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: "org-1", resourceId: "bay-2", source: "web", specialRequests: "Placa GHT331" })
    );
  });

  it("no reserva sin la autorización de tratamiento de datos, antes de crear nada", async () => {
    const withoutConsent = without(validBooking, "dataConsent");
    for (const body of [withoutConsent, { ...validBooking, dataConsent: false }]) {
      const res = await request(app).post("/api/public/businesses/lavadero-aguaclara/reservations").set("X-Forwarded-For", nextIp()).send(body);
      expect(res.status).toBe(400);
      expect(res.body.error.message).toMatch(/autorizar el tratamiento de tus datos/);
    }
    expect(findOrCreateCustomerByPhoneMock).not.toHaveBeenCalled();
    expect(createReservationMock).not.toHaveBeenCalled();
  });

  it("en un consultorio odontológico descarta el motivo de la consulta salvo que el paciente marque la autorización de datos de salud", async () => {
    const dental = { ...ACTIVE_ORG, slug: "consultorio", business_type: "dental" };
    insforgeMockInstance = mockFor(dental);
    const body = { ...validBooking, notes: "Dolor de muela" };

    let res = await request(app).post("/api/public/businesses/consultorio/reservations").set("X-Forwarded-For", nextIp()).send(body);
    expect(res.status).toBe(201);
    expect(createReservationMock).toHaveBeenLastCalledWith(expect.objectContaining({ specialRequests: null }));

    insforgeMockInstance = mockFor(dental);
    res = await request(app)
      .post("/api/public/businesses/consultorio/reservations")
      .set("X-Forwarded-For", nextIp())
      .send({ ...body, healthDataConsent: true });
    expect(res.status).toBe(201);
    expect(createReservationMock).toHaveBeenLastCalledWith(expect.objectContaining({ specialRequests: "Dolor de muela" }));
  });

  it("reserva un servicio que no está en la lista, descrito por el cliente, con la duración por defecto", async () => {
    const rest = without(validBooking, "serviceId");
    const res = await request(app)
      .post("/api/public/businesses/lavadero-aguaclara/reservations")
      .set("X-Forwarded-For", nextIp())
      .send({ ...rest, customService: "Lavado de tapicería del techo" });
    expect(res.status).toBe(201);
    expect(getAvailableSlotsMock).toHaveBeenLastCalledWith(expect.objectContaining({ serviceId: undefined }));
    expect(createReservationMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        serviceId: null,
        endAt: new Date(SLOT.end),
        specialRequests: "Servicio solicitado: Lavado de tapicería del techo. Placa GHT331"
      })
    );
  });

  it("pide exactamente uno: un servicio de la lista o una descripción", async () => {
    const rest = without(validBooking, "serviceId");
    for (const body of [rest, { ...validBooking, customService: "Otra cosa" }]) {
      const res = await request(app).post("/api/public/businesses/lavadero-aguaclara/reservations").set("X-Forwarded-For", nextIp()).send(body);
      expect(res.status).toBe(400);
    }
    expect(createReservationMock).not.toHaveBeenCalled();
  });

  it("ofrece horarios para un servicio que no está en la lista", async () => {
    const res = await request(app).get("/api/public/businesses/lavadero-aguaclara/availability?date=2026-10-01");
    expect(res.status).toBe(200);
    expect(res.body.slots).toEqual([{ start: SLOT.start, end: SLOT.end }]);
  });

  it("rechaza un horario que se ocupó mientras el visitante llenaba el formulario", async () => {
    getAvailableSlotsMock.mockResolvedValue({ slots: [], timezone: "America/Bogota" });
    const res = await request(app).post("/api/public/businesses/lavadero-aguaclara/reservations").set("X-Forwarded-For", nextIp()).send(validBooking);
    expect(res.status).toBe(409);
    expect(createReservationMock).not.toHaveBeenCalled();
  });

  it("rechaza los bots que llenan el campo oculto y los teléfonos inválidos", async () => {
    for (const body of [{ ...validBooking, website: "http://spam" }, { ...validBooking, phone: "123" }]) {
      const res = await request(app).post("/api/public/businesses/lavadero-aguaclara/reservations").set("X-Forwarded-For", nextIp()).send(body);
      expect(res.status).toBe(400);
    }
    expect(createReservationMock).not.toHaveBeenCalled();
  });

  it("limits how many bookings one connection can make", async () => {
    const sameIp = nextIp();
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      const res = await request(app).post("/api/public/businesses/lavadero-aguaclara/reservations").set("X-Forwarded-For", sameIp).send(validBooking);
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 5).every((s) => s === 201)).toBe(true);
    expect(statuses[5]).toBe(429);
  });
});
