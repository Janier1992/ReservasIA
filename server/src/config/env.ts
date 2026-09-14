import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3001),

  INSFORGE_URL: z.string().url(),
  INSFORGE_API_KEY: z.string().min(1),

  OPENAI_API_KEY: z.string().min(1),
  OPENAI_MODEL: z.string().min(1).default("gpt-4o"),
  OPENAI_BASE_URL: z.string().optional().default(""),

  TWILIO_ACCOUNT_SID: z.string().optional().default(""),
  TWILIO_AUTH_TOKEN: z.string().optional().default(""),
  TWILIO_WHATSAPP_NUMBER: z.string().optional().default(""),
  TWILIO_VALIDATE_SIGNATURE: z
    .string()
    .optional()
    .default("true")
    .transform((v) => v !== "false"),

  GOOGLE_CLIENT_ID: z.string().optional().default(""),
  GOOGLE_CLIENT_SECRET: z.string().optional().default(""),
  GOOGLE_REDIRECT_URI: z.string().optional().default(""),

  VAPID_PUBLIC_KEY: z.string().optional().default(""),
  VAPID_PRIVATE_KEY: z.string().optional().default(""),
  VAPID_SUBJECT: z.string().optional().default("mailto:soporte@reservasai.app"),

  APP_URL: z.string().url().default("http://localhost:5173"),
  API_URL: z.string().url().default("http://localhost:3001"),

  DEFAULT_TIMEZONE: z.string().default("America/Bogota"),

  OAUTH_STATE_SECRET: z.string().min(8).default("change-me-in-production")
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment configuration:", parsed.error.flatten().fieldErrors);
  throw new Error("Invalid environment configuration. Check your .env file against .env.example.");
}

export const env = parsed.data;

export const MAX_TOOL_ROUNDS = 8;
export const MAX_MESSAGE_LENGTH = 4000;
export const MAX_CONVERSATION_HISTORY_MESSAGES = 20;
export const AGENT_TIMEOUT_MS = 20000;
