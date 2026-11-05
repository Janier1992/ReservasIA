import "dotenv/config";
import { z } from "zod";

/** Valor de ejemplo (público en el repositorio): en producción no sirve para firmar nada. */
export const DEFAULT_OAUTH_STATE_SECRET = "change-me-in-production";

/** Valor de ejemplo (público en el repositorio): en producción no sirve para cifrar nada real. */
export const DEFAULT_INTEGRATIONS_ENCRYPTION_KEY = "change-me-in-production-integrations-key";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3001),

  INSFORGE_URL: z.string().url(),
  INSFORGE_API_KEY: z.string().min(1),

  OPENAI_API_KEY: z.string().min(1),
  OPENAI_MODEL: z.string().min(1).default("gpt-4o"),
  OPENAI_BASE_URL: z.string().optional().default(""),

  GOOGLE_CLIENT_ID: z.string().optional().default(""),
  GOOGLE_CLIENT_SECRET: z.string().optional().default(""),
  GOOGLE_REDIRECT_URI: z.string().optional().default(""),

  VAPID_PUBLIC_KEY: z.string().optional().default(""),
  VAPID_PRIVATE_KEY: z.string().optional().default(""),
  VAPID_SUBJECT: z.string().optional().default("mailto:soporte@reservasai.app"),

  APP_URL: z.string().url().default("http://localhost:5173"),
  API_URL: z.string().url().default("http://localhost:3001"),

  DEFAULT_TIMEZONE: z.string().default("America/Bogota"),

  OAUTH_STATE_SECRET: z.string().min(8).default(DEFAULT_OAUTH_STATE_SECRET),

  // Cifra integrations.credentials antes de guardarlo (AES-256-GCM). Debe
  // configurarse IDÉNTICO como secreto de InsForge (INTEGRATIONS_ENCRYPTION_KEY)
  // para que las Edge Functions que conectan/desconectan canales (que también
  // leen y escriben esa columna) cifren y descifren con la misma clave.
  INTEGRATIONS_ENCRYPTION_KEY: z.string().min(8).default(DEFAULT_INTEGRATIONS_ENCRYPTION_KEY),

  // Correo (o varios, separados por coma) que recibe las alertas cuando algo
  // empieza a fallar seguido (ver lib/alerts.ts). Vacío = solo quedan en el log.
  ALERT_EMAIL: z.string().optional().default(""),

  // "true" en el .env LOCAL: no arranca el poller de Telegram ni los
  // schedulers. Si no, un server local con las credenciales de producción
  // lee los mismos bots que Railway (Telegram entrega cada mensaje a ambos) —
  // causa de los incidentes del 25 y 26 de septiembre. Por defecto activos.
  DISABLE_BACKGROUND_WORKERS: z
    .string()
    .optional()
    .default("false")
    .transform((v) => v === "true"),

  // Telegram: "polling" (por defecto, un solo server) o "webhook" (Telegram
  // le envía cada mensaje al server; permite correr varias instancias).
  // El modo webhook necesita la URL pública del server y un secreto propio;
  // sin ellos se queda en polling.
  TELEGRAM_MODE: z.enum(["polling", "webhook"]).default("polling"),
  TELEGRAM_WEBHOOK_BASE_URL: z.string().optional().default(""),
  TELEGRAM_WEBHOOK_SECRET: z.string().optional().default(""),

  // Railway lo inyecta solo en cada deploy; se expone en /api/health para
  // poder confirmar qué commit está corriendo.
  RAILWAY_GIT_COMMIT_SHA: z.string().optional().default("")
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment configuration:", parsed.error.flatten().fieldErrors);
  throw new Error("Invalid environment configuration. Check your .env file against .env.example.");
}

export const env = parsed.data;

/**
 * Corre en un servidor real: NODE_ENV=production o desplegado en Railway (que
 * siempre inyecta RAILWAY_GIT_COMMIT_SHA), aunque NODE_ENV no esté puesto.
 */
export function isDeployed(): boolean {
  return env.NODE_ENV === "production" || Boolean(env.RAILWAY_GIT_COMMIT_SHA);
}

export const MAX_MESSAGE_LENGTH = 4000;
export const MAX_CONVERSATION_HISTORY_MESSAGES = 20;
export const AGENT_TIMEOUT_MS = 20000;
