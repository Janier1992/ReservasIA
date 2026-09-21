import { insforgeAdmin } from "../../lib/insforge.js";
import { AppError, ErrorCodes } from "../../utils/AppError.js";

const TELEGRAM_API_BASE = "https://api.telegram.org";
const SEND_TIMEOUT_MS = 10_000;
const SEND_MAX_ATTEMPTS = 3;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * fetch con timeout propio: sin esto, un `fetch` colgado (red inestable,
 * Telegram con un hiccup) nunca falla ni se resuelve, y como
 * processUpdate() lo espera con await, congela TODO el loop de esa
 * organización — ningún mensaje más se procesa hasta que el fetch termine
 * (que puede ser nunca).
 */
async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

interface TelegramCredentials {
  bot_token: string;
}

export interface ConnectedTelegramBot {
  organizationId: string;
  botToken: string;
}

/** Todas las organizaciones con Telegram conectado en este momento. */
export async function listConnectedTelegramBots(): Promise<ConnectedTelegramBot[]> {
  const { data, error } = await insforgeAdmin.database
    .from("integrations")
    .select("organization_id, credentials, status")
    .eq("provider", "telegram")
    .eq("status", "connected");

  if (error) throw new AppError(ErrorCodes.INTERNAL_ERROR, "No se pudieron cargar las integraciones de Telegram.", 500);

  return (data ?? [])
    .filter((row) => (row.credentials as TelegramCredentials | null)?.bot_token)
    .map((row) => ({
      organizationId: row.organization_id as string,
      botToken: (row.credentials as TelegramCredentials).bot_token
    }));
}

/**
 * La respuesta del agente ya quedó guardada en la conversación (y visible
 * en el Inbox) antes de llamar a esta función — si el envío real a
 * Telegram falla en silencio, el negocio ve "ya respondí" en el dashboard
 * mientras el cliente nunca recibe nada. Por eso reintenta ante fallas
 * transitorias (timeout, error de red, 5xx, 429) en vez de tirar la toalla
 * al primer intento.
 */
export async function sendTelegramMessage(botToken: string, chatId: string | number, text: string): Promise<void> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= SEND_MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetchWithTimeout(
        `${TELEGRAM_API_BASE}/bot${botToken}/sendMessage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: chatId, text })
        },
        SEND_TIMEOUT_MS
      );

      if (res.ok) return;

      const body = await res.text().catch(() => "");

      // 429: Telegram nos dice cuánto esperar antes de reintentar.
      if (res.status === 429) {
        const retryAfterSeconds = parseRetryAfterSeconds(body);
        lastError = new AppError(ErrorCodes.INTERNAL_ERROR, `Telegram rate limit (429): ${body}`, 502);
        if (attempt < SEND_MAX_ATTEMPTS) await sleep((retryAfterSeconds ?? 1) * 1000);
        continue;
      }

      // 5xx: probablemente transitorio del lado de Telegram, reintentar.
      if (res.status >= 500) {
        lastError = new AppError(ErrorCodes.INTERNAL_ERROR, `Telegram devolvió ${res.status}: ${body}`, 502);
        if (attempt < SEND_MAX_ATTEMPTS) await sleep(attempt * 500);
        continue;
      }

      // Otro 4xx (chat_id inválido, bot bloqueado por el usuario, token
      // revocado, etc.): reintentar no va a cambiar el resultado.
      throw new AppError(ErrorCodes.INTERNAL_ERROR, `No se pudo enviar el mensaje de Telegram (${res.status}): ${body}`, 502);
    } catch (err) {
      if (err instanceof AppError) throw err;
      // AbortError (timeout) o error de red: transitorio, reintentar.
      lastError = err;
      if (attempt < SEND_MAX_ATTEMPTS) await sleep(attempt * 500);
    }
  }

  throw lastError instanceof AppError
    ? lastError
    : new AppError(ErrorCodes.INTERNAL_ERROR, `No se pudo enviar el mensaje de Telegram tras ${SEND_MAX_ATTEMPTS} intentos.`, 502);
}

function parseRetryAfterSeconds(body: string): number | undefined {
  try {
    const parsed = JSON.parse(body) as { parameters?: { retry_after?: number } };
    return parsed.parameters?.retry_after;
  } catch {
    return undefined;
  }
}

/**
 * Manda el indicador de "escribiendo..." (best-effort, nunca bloquea el
 * flujo si falla). El agente puede tardar varios segundos en responder
 * (modelo lento + varias rondas de tool-calling), y sin este indicador el
 * cliente no tiene ninguna señal de que el mensaje llegó y se está
 * procesando.
 */
export async function sendTelegramTypingAction(botToken: string, chatId: string | number): Promise<void> {
  try {
    await fetchWithTimeout(
      `${TELEGRAM_API_BASE}/bot${botToken}/sendChatAction`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, action: "typing" })
      },
      SEND_TIMEOUT_MS
    );
  } catch {
    // best-effort
  }
}

export interface TelegramPhotoSize {
  file_id: string;
  file_unique_id: string;
  width: number;
  height: number;
  file_size?: number;
}

export interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    date: number;
    chat: { id: number; type: string };
    from?: { id: number; first_name?: string; last_name?: string; username?: string };
    text?: string;
    photo?: TelegramPhotoSize[];
  };
}

export async function getTelegramUpdates(botToken: string, offset: number, timeoutSeconds: number, signal: AbortSignal): Promise<TelegramUpdate[]> {
  const url = `${TELEGRAM_API_BASE}/bot${botToken}/getUpdates?timeout=${timeoutSeconds}&offset=${offset}&allowed_updates=%5B%22message%22%5D`;

  // Telegram debería responder dentro de `timeoutSeconds` (long-poll), pero
  // sin un límite propio un cuelgue de red dejaría este fetch esperando
  // para siempre, congelando el loop de esa organización. Se combina el
  // signal del poller (para poder cortar en un shutdown) con un timeout
  // propio a mano — sin depender de AbortSignal.any, que en algunos
  // entornos de Node puede no estar disponible y tira todo el poller en un
  // loop de error silencioso (nunca llega a intentar el fetch).
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  signal.addEventListener("abort", onAbort);
  const timer = setTimeout(() => controller.abort(), (timeoutSeconds + 10) * 1000);

  let res: Response;
  try {
    res = await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", onAbort);
  }

  if (!res.ok) {
    throw new AppError(ErrorCodes.INTERNAL_ERROR, `getUpdates falló con status ${res.status}`, 502);
  }

  const data = (await res.json()) as { ok: boolean; result?: TelegramUpdate[]; description?: string };
  if (!data.ok) {
    throw new AppError(ErrorCodes.INTERNAL_ERROR, data.description ?? "getUpdates devolvió ok=false", 502);
  }

  return data.result ?? [];
}

/**
 * Descarga la variante de mayor resolución de una foto enviada por Telegram
 * (el array `photo` viene ordenado de menor a mayor tamaño). Usa el flujo
 * oficial de dos pasos: getFile para resolver la ruta interna, y luego el
 * endpoint estático de archivos para bajar los bytes.
 */
export async function downloadTelegramPhoto(
  botToken: string,
  photoSizes: TelegramPhotoSize[]
): Promise<{ bytes: Uint8Array; mimeType: string }> {
  const largest = photoSizes[photoSizes.length - 1];

  const fileRes = await fetch(`${TELEGRAM_API_BASE}/bot${botToken}/getFile?file_id=${largest.file_id}`);
  if (!fileRes.ok) {
    throw new AppError(ErrorCodes.INTERNAL_ERROR, `getFile falló con status ${fileRes.status}`, 502);
  }
  const fileData = (await fileRes.json()) as { ok: boolean; result?: { file_path?: string }; description?: string };
  if (!fileData.ok || !fileData.result?.file_path) {
    throw new AppError(ErrorCodes.INTERNAL_ERROR, fileData.description ?? "getFile no devolvió file_path", 502);
  }

  const downloadRes = await fetch(`${TELEGRAM_API_BASE}/file/bot${botToken}/${fileData.result.file_path}`);
  if (!downloadRes.ok) {
    throw new AppError(ErrorCodes.INTERNAL_ERROR, `Descarga de archivo de Telegram falló con status ${downloadRes.status}`, 502);
  }

  const buffer = await downloadRes.arrayBuffer();
  const extension = fileData.result.file_path.split(".").pop()?.toLowerCase();
  const mimeType = extension === "png" ? "image/png" : "image/jpeg";
  return { bytes: new Uint8Array(buffer), mimeType };
}
