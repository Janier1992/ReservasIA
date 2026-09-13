import OpenAI from "openai";
import { env } from "../config/env.js";

// OPENAI_BASE_URL es opcional: permite apuntar a un endpoint compatible con
// la API de OpenAI (p. ej. OpenRouter) para desarrollo local sin necesitar
// una key propia de OpenAI. En producción se deja sin definir y se usa la
// API oficial de OpenAI, tal como pide el prompt maestro.
export const openai = new OpenAI({
  apiKey: env.OPENAI_API_KEY,
  baseURL: env.OPENAI_BASE_URL || undefined
});

/** Modelo configurado centralmente. No hardcodear "gpt-4o" en otros archivos. */
export const OPENAI_MODEL = env.OPENAI_MODEL;
