import { randomUUID } from "node:crypto";
import { insforgeAdmin } from "./insforge.js";
import { logger } from "./logger.js";

/**
 * Identifica a esta instancia del server frente a las demás (Railway puede
 * correr varias réplicas). Cambia en cada arranque.
 */
export const INSTANCE_ID = process.env.RAILWAY_REPLICA_ID || randomUUID();

/**
 * ¿Le toca a esta instancia correr esta vuelta de la tarea? Pide el turno
 * a la base (ver migración 20261017100000_scheduler-leases.sql). Si la base
 * no lo puede dar (ej. migración sin aplicar), corre igual: con una sola
 * instancia es el comportamiento de siempre.
 */
export async function acquireLease(job: string, ttlMs: number): Promise<boolean> {
  const { data, error } = await insforgeAdmin.database.rpc("acquire_scheduler_lease", {
    p_job: job,
    p_holder: INSTANCE_ID,
    p_ttl_seconds: Math.max(1, Math.round(ttlMs / 1000))
  });
  if (error) {
    logger.warn({ job, err: error }, "scheduler_lease_unavailable_running_anyway");
    return true;
  }
  return data === true;
}

export interface ScheduledJob {
  start(): void;
  stop(): void;
  /** Una vuelta (para tests). */
  tick(): Promise<void>;
}

/**
 * Tarea periódica segura con varias instancias: cada vuelta corre en una
 * sola (la que tiene el turno), nunca se solapa consigo misma y un error no
 * detiene las vueltas siguientes.
 */
export function createScheduledJob(name: string, intervalMs: number, run: () => Promise<unknown>): ScheduledJob {
  let timer: NodeJS.Timeout | null = null;
  let running = false;
  // El turno dura un poco menos que el intervalo: la instancia que lo tiene
  // lo renueva en su vuelta siguiente; si se cae, otra lo toma.
  const ttlMs = Math.max(5_000, Math.floor(intervalMs * 0.9));

  async function tick(): Promise<void> {
    if (running) return;
    running = true;
    try {
      if (!(await acquireLease(name, ttlMs))) return;
      await run();
    } catch (err) {
      logger.error({ err, job: name }, "scheduled_job_failed");
    } finally {
      running = false;
    }
  }

  return {
    start() {
      void tick();
      timer = setInterval(() => void tick(), intervalMs);
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
    },
    tick
  };
}
