import { describe, expect, it } from "vitest";
import { boardDensity, cardSizeFor, formatTicket, formatWait, minutesBetween, notifyStatus, serviceProgress, walkInAssetLabel, walkInErrorMessage, walkInStats, walkInTotal, sumWalkInTotals, isWaitOverdue, shortName } from "@/lib/walkIns";
import type { WalkIn } from "@/types/domain";

function walkIn(partial: Partial<WalkIn>): WalkIn {
  return {
    id: "w",
    organization_id: "org",
    customer_id: null,
    customer_name: "Ana",
    customer_phone: null,
    service_id: null,
    notes: null,
    status: "waiting",
    reservation_id: null,
    arrived_at: "2026-09-26T10:00:00Z",
    served_at: null,
    finished_at: null,
    party_size: null,
    source: "staff",
    notify_channel: null,
    notify_identity: null,
    ready_at: null,
    notified_at: null,
    notify_error: null,
    order_items: null,
    ...partial
  };
}

describe("utilidades de atención en sitio", () => {
  it("da formato al tiempo de espera de la fila", () => {
    expect(formatWait(0)).toBe("recién llegó");
    expect(formatWait(25)).toBe("25 min");
    expect(formatWait(60)).toBe("1 h");
    expect(formatWait(95)).toBe("1 h 35 min");
  });

  it("nunca informa una espera negativa cuando los relojes no coinciden", () => {
    expect(minutesBetween("2026-09-26T10:05:00Z", "2026-09-26T10:00:00Z")).toBe(0);
  });

  it("resume el día y promedia la espera solo de las llegadas atendidas", () => {
    const stats = walkInStats([
      walkIn({ status: "waiting" }),
      walkIn({ status: "in_service", served_at: "2026-09-26T10:10:00Z" }),
      walkIn({ status: "done", served_at: "2026-09-26T10:20:00Z" }),
      walkIn({ status: "left" })
    ]);
    expect(stats).toEqual({ waiting: 1, inService: 1, done: 1, left: 1, averageWaitMinutes: 15 });
  });

  it("has no average wait before anyone was served", () => {
    expect(walkInStats([walkIn({})]).averageWaitMinutes).toBeNull();
  });

  it("traduce los códigos de error de la base para el equipo", () => {
    expect(walkInErrorMessage({ message: "RESERVATION_NOT_AVAILABLE" })).toContain("ocupado");
    expect(walkInErrorMessage(new Error("WALK_IN_NOT_WAITING"))).toContain("ya fue atendida");
    expect(walkInErrorMessage({ message: "network down" })).toBe("network down");
    expect(walkInErrorMessage({ message: "FORBIDDEN" })).toContain("administrador");
  });

  it("describe el aviso de listo en cada paso", () => {
    expect(notifyStatus(walkIn({}))).toBeNull();
    expect(notifyStatus(walkIn({ source: "qr" }))?.label).toBe("Sin aviso");
    expect(notifyStatus(walkIn({ notify_channel: "telegram" }))?.label).toBe("Aviso por Telegram");
    const ready = { ready_at: "2026-09-26T10:30:00Z" };
    expect(notifyStatus(walkIn({ ...ready, notify_channel: "telegram" }))?.label).toBe("Avisando…");
    expect(notifyStatus(walkIn({ ...ready, notify_channel: "whatsapp", notified_at: "2026-09-26T10:30:05Z" }))?.label).toBe("Avisado por WhatsApp");
    expect(notifyStatus(walkIn({ ...ready, notify_channel: "telegram", notify_error: "blocked" }))?.variant).toBe("destructive");
    expect(notifyStatus(walkIn(ready))?.label).toBe("Listo · llamalo en persona");
  });
});

describe("serviceProgress", () => {
  const now = new Date("2026-09-26T10:30:00Z");

  it("compara el tiempo en atención con la duración del servicio", () => {
    const p = serviceProgress(walkIn({ served_at: "2026-09-26T10:16:00Z", services: { name: "Lavado", duration_minutes: 20, price: null, currency: "COP" } }), now);
    expect(p).toEqual({ elapsed: 14, expected: 20, remaining: 6, ratio: 0.7, overdue: false });
  });

  it("marca las atenciones que se pasaron de tiempo", () => {
    const p = serviceProgress(walkIn({ served_at: "2026-09-26T10:05:00Z", services: { name: "Lavado", duration_minutes: 20, price: null, currency: "COP" } }), now);
    expect(p).toMatchObject({ elapsed: 25, remaining: -5, ratio: 1, overdue: true });
  });

  it("usa la duración de la reserva cuando no hay servicio", () => {
    const p = serviceProgress(
      walkIn({
        served_at: "2026-09-26T10:20:00Z",
        reservations: { resource_id: null, start_at: "2026-09-26T10:00:00Z", end_at: "2026-09-26T10:45:00Z", source: "public_page", resources: null }
      }),
      now
    );
    expect(p).toMatchObject({ elapsed: 10, expected: 45, remaining: 35 });
  });

  it("solo informa el tiempo transcurrido cuando no se conoce la duración", () => {
    expect(serviceProgress(walkIn({ served_at: "2026-09-26T10:20:00Z" }), now)).toEqual({ elapsed: 10, expected: null, remaining: null, ratio: null, overdue: false });
  });

  it("titula la tarjeta con la placa o la mascota de la reserva", () => {
    const reservations = { resource_id: null, start_at: "2026-09-26T10:00:00Z", source: "chat", resources: null };
    expect(walkInAssetLabel(walkIn({ reservations: { ...reservations, customer_assets: { label: "GHT331", asset_type: "vehicle" } } }))).toBe("GHT331");
    expect(walkInAssetLabel(walkIn({ reservations }))).toBeNull();
  });
});

describe("formatTicket", () => {
  it("completa con ceros el número de ticket del día", () => {
    expect(formatTicket(7)).toBe("#007");
    expect(formatTicket(1234)).toBe("#1234");
    expect(formatTicket(null)).toBe("");
  });
});

describe("densidad del tablero", () => {
  it("achica las tarjetas a medida que llegan más atenciones", () => {
    expect(boardDensity(0)).toBe("comfortable");
    expect(boardDensity(6)).toBe("comfortable");
    expect(boardDensity(7)).toBe("compact");
    expect(boardDensity(12)).toBe("compact");
    expect(boardDensity(13)).toBe("dense");
  });

  it("empieza un tamaño más grande en el modo pantalla", () => {
    expect(cardSizeFor("comfortable", true)).toBe("lg");
    expect(cardSizeFor("comfortable", false)).toBe("md");
    expect(cardSizeFor("dense", true)).toBe("sm");
    expect(cardSizeFor("dense", false)).toBe("xs");
  });
});

describe("walkInTotal", () => {
  const item = (unit_price: number | null, quantity: number) => ({ service_id: `s${quantity}${unit_price}`, name: "x", quantity, unit_price, currency: "COP" });

  it("suma los productos del pedido con el precio guardado", () => {
    expect(walkInTotal(walkIn({ order_items: [item(20000, 2), item(9000, 1)] }))).toEqual({ amount: 49000, currency: "COP" });
  });

  it("acepta precios que llegan como texto (numeric de Postgres)", () => {
    expect(walkInTotal(walkIn({ order_items: [item("15000" as unknown as number, 2)] }))?.amount).toBe(30000);
  });

  it("usa el precio del servicio cuando no hay pedido", () => {
    expect(walkInTotal(walkIn({ services: { name: "Lavado", duration_minutes: 30, price: 35000, currency: "COP" } }))).toEqual({ amount: 35000, currency: "COP" });
  });

  it("marca el total como parcial si hay productos fuera de la carta sin precio", () => {
    const custom = { service_id: null, name: "Arepa con queso", quantity: 1, unit_price: null, currency: null, custom: true };
    expect(walkInTotal(walkIn({ order_items: [item(20000, 2), custom] }))).toEqual({ amount: 40000, currency: "COP", partial: true });
  });

  it("devuelve null si nada tiene precio", () => {
    expect(walkInTotal(walkIn({ order_items: [item(null, 1)] }))).toBeNull();
    expect(walkInTotal(walkIn({}))).toBeNull();
  });

  it("suma varias atenciones ignorando las que no tienen precio", () => {
    const total = sumWalkInTotals([walkIn({ order_items: [item(20000, 1)] }), walkIn({}), walkIn({ order_items: [item(5000, 2)] })]);
    expect(total).toEqual({ amount: 30000, currency: "COP" });
    expect(sumWalkInTotals([walkIn({})])).toBeNull();
  });
});

describe("isWaitOverdue", () => {
  const now = new Date("2026-09-26T10:20:00Z");

  it("marca demorado a quien espera más que el umbral", () => {
    expect(isWaitOverdue(walkIn({ arrived_at: "2026-09-26T10:00:00Z" }), now, 15)).toBe(true);
    expect(isWaitOverdue(walkIn({ arrived_at: "2026-09-26T10:10:00Z" }), now, 15)).toBe(false);
  });

  it("no alerta si está apagada, en atención o ya listo", () => {
    const old = { arrived_at: "2026-09-26T09:00:00Z" };
    expect(isWaitOverdue(walkIn(old), now, null)).toBe(false);
    expect(isWaitOverdue(walkIn({ ...old, status: "in_service" }), now, 15)).toBe(false);
    expect(isWaitOverdue(walkIn({ ...old, ready_at: "2026-09-26T09:30:00Z" }), now, 15)).toBe(false);
  });
});

describe("shortName", () => {
  it("abrevia el apellido para la pantalla pública", () => {
    expect(shortName("Andrea Gil Restrepo")).toBe("Andrea G.");
    expect(shortName("  ana  ")).toBe("ana");
    expect(shortName("luis pérez")).toBe("luis P.");
  });
});

describe("isOnMenuAlready", () => {
  it("compara sin mayúsculas ni espacios de más", async () => {
    const { isOnMenuAlready } = await import("@/lib/menuDays");
    expect(isOnMenuAlready("  arepa  con QUESO ", [{ name: "Arepa con queso" }])).toBe(true);
    expect(isOnMenuAlready("Arepa sola", [{ name: "Arepa con queso" }])).toBe(false);
  });
});
