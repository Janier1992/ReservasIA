function requireEnv(name: string): string {
  const value = import.meta.env[name];
  if (!value) {
    throw new Error(`Falta la variable de entorno ${name}. Revisá tu archivo .env (ver .env.example).`);
  }
  return value;
}

export const env = {
  INSFORGE_URL: requireEnv("VITE_INSFORGE_URL"),
  INSFORGE_ANON_KEY: requireEnv("VITE_INSFORGE_ANON_KEY"),
  // Opcional a propósito: sin esta clave las notificaciones push simplemente
  // quedan deshabilitadas (ver lib/pushNotifications.ts), el resto de la app
  // funciona igual.
  VAPID_PUBLIC_KEY: import.meta.env.VITE_VAPID_PUBLIC_KEY ?? "",
  // URL del compute service (Railway), sin barra final. Opcional: sin ella
  // la página pública de reservas (/r/:slug) muestra que no está disponible.
  API_URL: (import.meta.env.VITE_API_URL ?? "").replace(/\/+$/, "")
};
