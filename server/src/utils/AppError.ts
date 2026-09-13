export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode = 400
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const ErrorCodes = {
  UNAUTHENTICATED: "UNAUTHENTICATED",
  FORBIDDEN: "FORBIDDEN",
  NOT_A_MEMBER: "NOT_A_MEMBER",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  ORGANIZATION_NOT_FOUND: "ORGANIZATION_NOT_FOUND",
  RESERVATION_NOT_AVAILABLE: "RESERVATION_NOT_AVAILABLE",
  RESERVATION_NOT_FOUND: "RESERVATION_NOT_FOUND",
  RESERVATION_IN_PAST: "RESERVATION_IN_PAST",
  RESERVATION_INVALID_RANGE: "RESERVATION_INVALID_RANGE",
  RESERVATION_NOT_MODIFIABLE: "RESERVATION_NOT_MODIFIABLE",
  BUSINESS_CLOSED: "BUSINESS_CLOSED",
  OUTSIDE_BOOKING_WINDOW: "OUTSIDE_BOOKING_WINDOW",
  CUSTOMER_NOT_FOUND: "CUSTOMER_NOT_FOUND",
  SERVICE_NOT_FOUND: "SERVICE_NOT_FOUND",
  RESOURCE_NOT_FOUND: "RESOURCE_NOT_FOUND",
  INTEGRATION_NOT_CONNECTED: "INTEGRATION_NOT_CONNECTED",
  WEBHOOK_INVALID_SIGNATURE: "WEBHOOK_INVALID_SIGNATURE",
  WEBHOOK_INVALID_PAYLOAD: "WEBHOOK_INVALID_PAYLOAD",
  RATE_LIMITED: "RATE_LIMITED",
  INTERNAL_ERROR: "INTERNAL_ERROR"
} as const;

/** Traduce los códigos lanzados por las funciones RPC de Postgres a AppError. */
export function mapPostgresErrorMessage(message: string): AppError | null {
  const known: Record<string, { code: string; status: number; friendly: string }> = {
    RESERVATION_NOT_AVAILABLE: {
      code: ErrorCodes.RESERVATION_NOT_AVAILABLE,
      status: 409,
      friendly: "El horario solicitado ya no está disponible."
    },
    RESERVATION_NOT_FOUND: {
      code: ErrorCodes.RESERVATION_NOT_FOUND,
      status: 404,
      friendly: "La reserva no existe."
    },
    RESERVATION_IN_PAST: {
      code: ErrorCodes.RESERVATION_IN_PAST,
      status: 422,
      friendly: "No se puede reservar en el pasado."
    },
    RESERVATION_INVALID_RANGE: {
      code: ErrorCodes.RESERVATION_INVALID_RANGE,
      status: 422,
      friendly: "El rango de horario indicado no es válido."
    },
    RESERVATION_NOT_MODIFIABLE: {
      code: ErrorCodes.RESERVATION_NOT_MODIFIABLE,
      status: 422,
      friendly: "La reserva ya no se puede modificar."
    },
    FORBIDDEN: {
      code: ErrorCodes.FORBIDDEN,
      status: 403,
      friendly: "No tenés permiso para realizar esta acción."
    },
    SERVICE_NOT_FOUND: {
      code: ErrorCodes.SERVICE_NOT_FOUND,
      status: 422,
      friendly: "El servicio seleccionado no existe."
    },
    RESOURCE_NOT_FOUND: {
      code: ErrorCodes.RESOURCE_NOT_FOUND,
      status: 422,
      friendly: "El recurso seleccionado no existe."
    }
  };

  for (const key of Object.keys(known)) {
    if (message.includes(key)) {
      const entry = known[key];
      return new AppError(entry.code, entry.friendly, entry.status);
    }
  }
  return null;
}
