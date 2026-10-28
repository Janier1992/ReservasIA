import { insforgeAdmin } from "../../lib/insforge.js";
import { logger } from "../../lib/logger.js";
import { createScheduledJob } from "../../lib/scheduledJob.js";

/**
 * Los chats con los clientes no se guardan para siempre (Ley 1581: los datos
 * personales se conservan solo mientras hagan falta). Se borran los mensajes
 * de más de un año y las conversaciones que quedan vacías (ver migración
 * 20261028100000_customer-erasure-and-chat-retention.sql).
 */
export const CHAT_RETENTION_DAYS = 365;
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // la retención es de meses: no hace falta más seguido.

export async function purgeOldChatHistory(): Promise<void> {
  const { data, error } = await insforgeAdmin.database.rpc("purge_old_chat_history", { p_retention_days: CHAT_RETENTION_DAYS });
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as { deleted_messages?: number; deleted_conversations?: number } | null;
  if (row?.deleted_messages || row?.deleted_conversations) {
    logger.info({ deletedMessages: row.deleted_messages, deletedConversations: row.deleted_conversations }, "chat_history_purged");
  }
}

// Con varias instancias del server, cada vuelta corre en una sola (ver lib/scheduledJob.ts).
const job = createScheduledJob("chat_retention", CHECK_INTERVAL_MS, purgeOldChatHistory);

export function startChatRetentionScheduler(): void {
  job.start();
}

export function stopChatRetentionScheduler(): void {
  job.stop();
}
