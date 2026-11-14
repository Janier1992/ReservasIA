/**
 * Lo que se puede registrar de un error de Google. El error completo de
 * googleapis trae la petición (nombre y correo del cliente invitado y, según
 * la versión, el encabezado Authorization): nunca va entero a los logs.
 */
export function googleErrorSummary(err: unknown): { message: string; status?: number; reason?: string } {
  const e = err as {
    message?: string;
    status?: number;
    code?: number | string;
    response?: { status?: number; data?: { error?: string | { status?: string; errors?: { reason?: string }[] } } };
  };
  const data = e?.response?.data?.error;
  const reason = typeof data === "string" ? data : data?.errors?.[0]?.reason ?? data?.status;
  const status = e?.response?.status ?? e?.status ?? (typeof e?.code === "number" ? e.code : undefined);
  return { message: (e?.message ?? String(err)).slice(0, 300), ...(status ? { status } : {}), ...(reason ? { reason } : {}) };
}
