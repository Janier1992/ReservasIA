import { insforgeAdmin } from "../../lib/insforge.js";
import { AppError, ErrorCodes } from "../../utils/AppError.js";

const TELEGRAM_API_BASE = "https://api.telegram.org";

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

export async function sendTelegramMessage(botToken: string, chatId: string | number, text: string): Promise<void> {
  const res = await fetch(`${TELEGRAM_API_BASE}/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text })
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new AppError(ErrorCodes.INTERNAL_ERROR, `No se pudo enviar el mensaje de Telegram (${res.status}): ${body}`, 502);
  }
}

export interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    date: number;
    chat: { id: number; type: string };
    from?: { id: number; first_name?: string; username?: string };
    text?: string;
  };
}

export async function getTelegramUpdates(botToken: string, offset: number, timeoutSeconds: number, signal: AbortSignal): Promise<TelegramUpdate[]> {
  const url = `${TELEGRAM_API_BASE}/bot${botToken}/getUpdates?timeout=${timeoutSeconds}&offset=${offset}&allowed_updates=%5B%22message%22%5D`;
  const res = await fetch(url, { signal });

  if (!res.ok) {
    throw new AppError(ErrorCodes.INTERNAL_ERROR, `getUpdates falló con status ${res.status}`, 502);
  }

  const data = (await res.json()) as { ok: boolean; result?: TelegramUpdate[]; description?: string };
  if (!data.ok) {
    throw new AppError(ErrorCodes.INTERNAL_ERROR, data.description ?? "getUpdates devolvió ok=false", 502);
  }

  return data.result ?? [];
}
