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
  notes: "Placa GHT331"
};

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

  it("shows the business and its active services without internal ids", async () => {
    const res = await request(app).get("/api/public/businesses/lavadero-aguaclara");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: "Lavadero Aguaclara", businessType: "car_wash", services: [{ id: SERVICE_ID, price: 35000 }] });
    expect(res.body.organizationId).toBeUndefined();
  });

  it("answers the same 404 for a missing, suspended or opted-out business", async () => {
    for (const org of [null, { ...ACTIVE_ORG, status: "suspended" }, { ...ACTIVE_ORG, disabled_modules: ["public_booking"] }]) {
      insforgeMockInstance = mockFor(org);
      const res = await request(app).get("/api/public/businesses/lavadero-aguaclara");
      expect(res.status).toBe(404);
      expect(res.body.error.message).toBe("Este negocio no tiene reservas en línea disponibles.");
    }
  });

  it("returns slot times without revealing which resource is free", async () => {
    const res = await request(app).get(`/api/public/businesses/lavadero-aguaclara/availability?serviceId=${SERVICE_ID}&date=2026-10-01`);
    expect(res.status).toBe(200);
    expect(res.body.slots).toEqual([{ start: SLOT.start, end: SLOT.end }]);
  });

  it("books a still-free slot on the first free resource with a normalized phone", async () => {
    const res = await request(app).post("/api/public/businesses/lavadero-aguaclara/reservations").set("X-Forwarded-For", nextIp()).send(validBooking);
    expect(res.status).toBe(201);
    expect(findOrCreateCustomerByPhoneMock).toHaveBeenCalledWith("org-1", "+573001112233", "Carlos Ruiz", undefined);
    expect(createReservationMock).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: "org-1", resourceId: "bay-2", source: "web", specialRequests: "Placa GHT331" })
    );
  });

  it("refuses a slot that was taken while the visitor filled the form", async () => {
    getAvailableSlotsMock.mockResolvedValue({ slots: [], timezone: "America/Bogota" });
    const res = await request(app).post("/api/public/businesses/lavadero-aguaclara/reservations").set("X-Forwarded-For", nextIp()).send(validBooking);
    expect(res.status).toBe(409);
    expect(createReservationMock).not.toHaveBeenCalled();
  });

  it("rejects bots that fill the hidden field and invalid phones", async () => {
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
