import { insforgeAdmin } from "../../lib/insforge.js";
import { logger } from "../../lib/logger.js";
import { reportCriticalFailure } from "../../lib/alerts.js";
import { createScheduledJob } from "../../lib/scheduledJob.js";
import { credentialsKeyFingerprint, tryDecryptCredentials } from "../../lib/credentialsCrypto.js";

/**
 * Credenciales de integraciones (Telegram, WhatsApp/YCloud, Google) que el
 * server no puede descifrar: pasa cuando se cambia INTEGRATIONS_ENCRYPTION_KEY
 * después de guardarlas, o cuando el server (Railway) y las Edge Functions
 * (InsForge) tienen claves distintas. Antes, una sola fila ilegible hacía
 * fallar a todas (p. ej. el Telegram de todos los negocios); ahora esa
 * integración se salta, queda en "Reconectar" en el panel y llega una alerta.
 */

/** Motivo que queda en integrations.metadata.last_error y que el panel muestra. */
export const CREDENTIALS_UNREADABLE = "credentials_unreadable";

/**
 * Descifra las credenciales de una integración; si no se puede, lo registra,
 * avisa y devuelve null (el que llama la trata como no conectada).
 */
export function readIntegrationCredentials(
  provider: string,
  organizationId: string,
  value: Record<string, unknown> | null | undefined
): Record<string, unknown> | null {
  const credentials = tryDecryptCredentials(value);
  if (credentials === null) {
    logger.error({ provider, organizationId, keyFingerprint: credentialsKeyFingerprint() }, "integration_credentials_unreadable");
    reportCriticalFailure("integration_credentials_unreadable", new Error(`${provider} de ${organizationId}`));
  }
  return credentials;
}

interface IntegrationRow {
  id: string;
  organization_id: string;
  provider: string;
  status: string;
  credentials: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
}

export interface CredentialsCheckSummary {
  readable: number;
  unreadable: number;
  /** Pasaron a "Reconectar" en esta vuelta. */
  marked: number;
  /** Volvieron a "conectada": se habían marcado ilegibles y ahora se leen (p. ej. se corrigió la clave). */
  restored: number;
}

/**
 * Revisa todas las integraciones guardadas: las que no se pueden leer pasan
 * a status "error" (el panel pide reconectarlas) y las que se habían marcado
 * así pero ahora se leen bien vuelven a "connected". Lo segundo importa: si
 * la clave estuvo mal un rato y se corrige, nadie tiene que reconectar nada.
 */
export async function checkIntegrationCredentials(): Promise<CredentialsCheckSummary> {
  const { data, error } = await insforgeAdmin.database
    .from("integrations")
    .select("id, organization_id, provider, status, credentials, metadata")
    .in("status", ["connected", "error"]);
  if (error) throw error;

  const summary: CredentialsCheckSummary = { readable: 0, unreadable: 0, marked: 0, restored: 0 };
  const unreadableRows: { provider: string; organizationId: string }[] = [];

  for (const row of (data ?? []) as IntegrationRow[]) {
    const metadata = row.metadata ?? {};
    const markedUnreadable = metadata.last_error === CREDENTIALS_UNREADABLE;
    const readable = tryDecryptCredentials(row.credentials) !== null;

    if (readable) {
      summary.readable++;
      if (row.status === "error" && markedUnreadable) {
        const { last_error: _cleared, ...rest } = metadata;
        await insforgeAdmin.database.from("integrations").update({ status: "connected", metadata: rest }).eq("id", row.id);
        summary.restored++;
      }
      continue;
    }

    summary.unreadable++;
    unreadableRows.push({ provider: row.provider, organizationId: row.organization_id });
    if (row.status === "connected") {
      await insforgeAdmin.database
        .from("integrations")
        .update({ status: "error", metadata: { ...metadata, last_error: CREDENTIALS_UNREADABLE } })
        .eq("id", row.id);
      summary.marked++;
    }
  }

  const log = { ...summary, keyFingerprint: credentialsKeyFingerprint(), unreadableRows };
  if (summary.unreadable > 0) {
    logger.error(log, "integration_credentials_check");
    if (summary.marked > 0) {
      reportCriticalFailure("integration_credentials_unreadable", new Error(`${summary.marked} integraciones pasaron a "Reconectar"`));
    }
  } else {
    logger.info(log, "integration_credentials_check");
  }
  return summary;
}

// Al arrancar (justo después de un cambio de clave en Railway) y cada 15 minutos.
const CHECK_INTERVAL_MS = 15 * 60 * 1000;
const job = createScheduledJob("integration_credentials_check", CHECK_INTERVAL_MS, checkIntegrationCredentials);

export function startIntegrationCredentialsCheck(): void {
  job.start();
}

export function stopIntegrationCredentialsCheck(): void {
  job.stop();
}
