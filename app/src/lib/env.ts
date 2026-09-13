function requireEnv(name: string): string {
  const value = import.meta.env[name];
  if (!value) {
    throw new Error(`Falta la variable de entorno ${name}. Revisá tu archivo .env (ver .env.example).`);
  }
  return value;
}

export const env = {
  INSFORGE_URL: requireEnv("VITE_INSFORGE_URL"),
  INSFORGE_ANON_KEY: requireEnv("VITE_INSFORGE_ANON_KEY")
};
