/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_INSFORGE_URL: string;
  readonly VITE_INSFORGE_ANON_KEY: string;
  readonly VITE_VAPID_PUBLIC_KEY?: string;
  readonly VITE_API_URL?: string;
  readonly VITE_SUBSCRIPTION_NEQUI_NUMBER?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
