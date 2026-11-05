/**
 * Límite de velocidad de los turnos del agente: frena ráfagas anormales de
 * mensajes (un bot, un error en bucle, alguien abusando) antes de que cada
 * uno se convierta en una llamada paga a la IA. NO limita cuántos mensajes
 * tiene una conversación en total (decisión del negocio): solo cuántos por
 * minuto.
 *
 * - Por cliente: una persona real casi nunca manda más de 10 mensajes por
 *   minuto, aunque escriba en mensajes cortos.
 * - Por negocio: tope para que una ráfaga en un negocio no deje sin agente
 *   a los demás (todos comparten el mismo server).
 *
 * El mensaje frenado igual queda guardado (se ve en la Bandeja y el agente
 * lo lee en el siguiente turno permitido). Vive en memoria: alcanza con un
 * solo server, que es como corre hoy (ver conversationLocks en agentRuntime).
 */

const WINDOW_MS = 60_000;
export const MAX_TURNS_PER_CUSTOMER_PER_MINUTE = 10;
export const MAX_TURNS_PER_BUSINESS_PER_MINUTE = 120;

/** Momentos (ms) de los turnos permitidos dentro de la ventana, por clave. */
const recentTurns = new Map<string, number[]>();
/** Clientes a los que ya se les avisó en la ventana actual, para avisar una sola vez. */
const noticeSentAt = new Map<string, number>();

function countRecent(key: string, now: number): number[] {
  const kept = (recentTurns.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (kept.length > 0) recentTurns.set(key, kept);
  else recentTurns.delete(key);
  return kept;
}

export type AgentTurnDecision =
  /** Puede correr el agente. */
  | "allowed"
  /** Frenado; es el primero de la ráfaga: conviene avisarle al cliente que espere. */
  | "limited_notify"
  /** Frenado; ya se le avisó en esta ventana. */
  | "limited";

/**
 * Decide si el mensaje de `customerKey` (por ejemplo "whatsapp:+57300...")
 * en el negocio `organizationId` puede correr un turno del agente, y lo
 * cuenta si puede.
 */
export function checkAgentTurn(organizationId: string, customerKey: string, now: number = Date.now()): AgentTurnDecision {
  const customer = `${organizationId}|${customerKey}`;
  const business = `${organizationId}|*`;
  const customerTurns = countRecent(customer, now);
  const businessTurns = countRecent(business, now);

  if (customerTurns.length < MAX_TURNS_PER_CUSTOMER_PER_MINUTE && businessTurns.length < MAX_TURNS_PER_BUSINESS_PER_MINUTE) {
    recentTurns.set(customer, [...customerTurns, now]);
    recentTurns.set(business, [...businessTurns, now]);
    return "allowed";
  }

  const lastNotice = noticeSentAt.get(customer);
  if (lastNotice !== undefined && now - lastNotice < WINDOW_MS) return "limited";
  noticeSentAt.set(customer, now);
  for (const [key, at] of noticeSentAt) if (now - at >= WINDOW_MS) noticeSentAt.delete(key);
  return "limited_notify";
}

/** Lo que se le contesta al cliente la primera vez que lo frena el límite. */
export const RATE_LIMIT_NOTICE =
  "Recibimos varios mensajes seguidos. Dame un minuto y te respondo; no hace falta que los repitas.";

/** Solo para pruebas. */
export function resetAgentRateLimit(): void {
  recentTurns.clear();
  noticeSentAt.clear();
}
