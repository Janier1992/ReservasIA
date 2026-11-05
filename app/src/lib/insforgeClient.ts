// Antes que el SDK: sessionHint lee el código de Google de la dirección antes de que el SDK lo borre.
import "./sessionHint";
import { createClient } from "@insforge/sdk";
import { env } from "./env";

export const insforge = createClient({
  baseUrl: env.INSFORGE_URL,
  anonKey: env.INSFORGE_ANON_KEY
});
