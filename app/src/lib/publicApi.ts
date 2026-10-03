import { env } from "./env";

// Cliente de la API pública del compute service (server/src/routes/public.ts).
// Sin sesión: la usa la página /r/:slug que ven los clientes del negocio.

export interface PublicService {
  id: string;
  name: string;
  description: string | null;
  durationMinutes: number;
  price: number | null;
  currency: string;
}

export interface PublicBusiness {
  slug: string;
  /** "order": pedido inmediato a la fila (QR del local); "booking": reserva con día y hora. */
  mode: "order" | "booking";
  businessType: string;
  timezone: string;
  name: string;
  description: string | null;
  address: string | null;
  phone: string | null;
  logoUrl: string | null;
  maxBookingDays: number;
  services: PublicService[];
}

export interface PublicSlot {
  start: string;
  end: string;
}

export interface PublicOrder {
  code: string;
  /** Número de ticket del día; ausente si respondió un server anterior. */
  ticketNumber?: number | null;
  position: number;
  /** Resumen legible del pedido ("2× Hamburguesa y Limonada"). */
  serviceName: string;
  /** Ausentes si respondió un server anterior al carrito. */
  items?: { name: string; quantity: number }[];
  total?: number | null;
  currency?: string | null;
  telegramUrl: string | null;
  whatsappUrl: string | null;
}

export interface PublicBooking {
  id: string;
  start_at: string;
  end_at: string;
  timezone: string;
  /** "Avisame por..." para recibir la confirmación y el recordatorio por chat; ausentes en un server anterior. */
  telegramUrl?: string | null;
  whatsappUrl?: string | null;
}

export class PublicApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  if (!env.API_URL) throw new PublicApiError(503, "NOT_CONFIGURED", "Las reservas en línea no están disponibles en este momento.");
  const res = await fetch(`${env.API_URL}/api/public${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) }
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new PublicApiError(res.status, body?.error?.code ?? "UNKNOWN", body?.error?.message ?? "No se pudo completar la solicitud.");
  }
  return body as T;
}

export const publicApi = {
  business: (slug: string) => call<PublicBusiness>(`/businesses/${encodeURIComponent(slug)}`),
  availability: (slug: string, serviceId: string, date: string) =>
    call<{ timezone: string; reason?: string; slots: PublicSlot[] }>(
      `/businesses/${encodeURIComponent(slug)}/availability?serviceId=${encodeURIComponent(serviceId)}&date=${date}`
    ),
  book: (
    slug: string,
    body: { serviceId: string; date: string; start: string; name: string; phone: string; email?: string; notes?: string; website?: string; healthDataConsent?: boolean }
  ) =>
    call<PublicBooking>(`/businesses/${encodeURIComponent(slug)}/reservations`, {
      method: "POST",
      body: JSON.stringify(body)
    }),
  order: (
    slug: string,
    body: { items: { serviceId: string; quantity: number }[]; name: string; phone?: string; notes?: string; website?: string }
  ) =>
    call<PublicOrder>(`/businesses/${encodeURIComponent(slug)}/orders`, { method: "POST", body: JSON.stringify(body) })
};
