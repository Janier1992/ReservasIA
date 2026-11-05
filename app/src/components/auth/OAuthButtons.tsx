import { useEffect, useState } from "react";
import { Github } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";

const PROVIDER_LABELS: Record<string, string> = {
  google: "Google",
  github: "GitHub"
};

function GoogleIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3C33.7 32.9 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.3-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.6 16 18.9 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4c-7.5 0-14 4.3-17.7 10.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.5 0 10.4-2 14.1-5.4l-6.5-5.5C29.5 34.7 26.9 36 24 36c-5.3 0-9.7-3.1-11.3-7.6l-6.5 5C9.9 39.6 16.4 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.2-4.3 5.5l6.5 5.5C40.9 36.5 44 31 44 24c0-1.2-.1-2.3-.4-3.5z"
      />
    </svg>
  );
}

/** Botones "Continuar con…" para los proveedores de OAuth habilitados en InsForge (ver getPublicAuthConfig). */
export function OAuthButtons() {
  const { getOAuthProviders, signInWithOAuth } = useAuth();
  const [providers, setProviders] = useState<string[]>([]);
  const [loadingProvider, setLoadingProvider] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getOAuthProviders().then((list) => {
      if (!cancelled) setProviders(list);
    });
    return () => {
      cancelled = true;
    };
  }, [getOAuthProviders]);

  if (providers.length === 0) return null;

  const onClick = async (provider: string) => {
    setLoadingProvider(provider);
    try {
      await signInWithOAuth(provider);
      // Si signInWithOAuth no lanzó, la pestaña ya está navegando al proveedor.
    } catch (err) {
      setLoadingProvider(null);
      toast.error(err instanceof Error ? err.message : "No se pudo continuar con ese proveedor.");
    }
  };

  return (
    <div className="space-y-3">
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center text-xs">
          <span className="bg-card px-2 text-muted-foreground">o continuá con</span>
        </div>
      </div>
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${providers.length}, minmax(0, 1fr))` }}>
        {providers.map((provider) => (
          <Button
            key={provider}
            type="button"
            variant="outline"
            className="w-full gap-2"
            disabled={loadingProvider !== null}
            onClick={() => onClick(provider)}
          >
            {provider === "google" ? <GoogleIcon /> : <Github className="h-4 w-4" />}
            {loadingProvider === provider ? "Redirigiendo..." : PROVIDER_LABELS[provider] ?? provider}
          </Button>
        ))}
      </div>
    </div>
  );
}
