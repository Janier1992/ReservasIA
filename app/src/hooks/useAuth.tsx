import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { insforge } from "@/lib/insforgeClient";

interface AuthUser {
  id: string;
  email: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  signUp: (email: string, password: string, fullName: string) => Promise<{ requireEmailVerification: boolean }>;
  verifyEmailCode: (email: string, otp: string) => Promise<void>;
  resendVerificationEmail: (email: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  /** Cómo manda InsForge la recuperación: un código para escribir o un enlace para abrir. */
  getResetPasswordMethod: () => Promise<"code" | "link">;
  exchangeResetCode: (email: string, code: string) => Promise<string>;
  resetPassword: (newPassword: string, otp: string) => Promise<void>;
  refreshUser: () => Promise<void>;
  /** Proveedores de OAuth habilitados en el backend (ej. ["google", "github"]). */
  getOAuthProviders: () => Promise<string[]>;
  /** Redirige al proveedor; la pestaña navega fuera, no hay nada que esperar después. */
  signInWithOAuth: (provider: string) => Promise<void>;
  /** Pide un código de acceso sin contraseña por email ("magic code"). */
  sendLoginCode: (email: string) => Promise<void>;
  /** Verifica el código pedido con sendLoginCode y crea la sesión. */
  signInWithLoginCode: (email: string, otp: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function unwrap<T>(result: { data: T | null; error: { message?: string } | null }): T {
  if (result.error) throw new Error(result.error.message ?? "Ocurrió un error inesperado.");
  return result.data as T;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  async function hydrate() {
    const { data, error } = await insforge.auth.getCurrentUser();
    setUser(error ? null : (data?.user as AuthUser | null) ?? null);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await hydrate();
      if (!cancelled) setLoading(false);
    })();
    const unsubscribe = insforge.auth.onAuthStateChange(() => {
      hydrate();
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const value: AuthContextValue = {
    user,
    loading,
    signUp: async (email, password, fullName) => {
      const result = unwrap(
        await insforge.auth.signUp({
          email,
          password,
          name: fullName,
          redirectTo: `${window.location.origin}/login`
        })
      );
      if (!result.requireEmailVerification && result.user) {
        setUser(result.user as AuthUser);
      }
      return { requireEmailVerification: !!result.requireEmailVerification };
    },
    verifyEmailCode: async (email, otp) => {
      const result = unwrap(await insforge.auth.verifyEmail({ email, otp }));
      setUser(result.user as AuthUser);
    },
    resendVerificationEmail: async (email) => {
      unwrap(await insforge.auth.resendVerificationEmail({ email, redirectTo: `${window.location.origin}/login` }));
    },
    signIn: async (email, password) => {
      const result = unwrap(await insforge.auth.signInWithPassword({ email, password }));
      setUser(result.user as AuthUser);
    },
    signOut: async () => {
      await insforge.auth.signOut();
      setUser(null);
    },
    sendPasswordReset: async (email) => {
      unwrap(
        await insforge.auth.sendResetPasswordEmail({ email, redirectTo: `${window.location.origin}/reset-password` })
      );
    },
    getResetPasswordMethod: async () => {
      // Si no se puede leer la configuración, se asume código: es lo que
      // InsForge usa por defecto y la pantalla de código sigue sirviendo.
      const { data } = await insforge.auth.getPublicAuthConfig();
      return data?.resetPasswordMethod === "link" ? "link" : "code";
    },
    exchangeResetCode: async (email, code) => {
      const result = unwrap(await insforge.auth.exchangeResetPasswordToken({ email, code }));
      return result.token;
    },
    resetPassword: async (newPassword, otp) => {
      unwrap(await insforge.auth.resetPassword({ newPassword, otp }));
    },
    refreshUser: hydrate,
    getOAuthProviders: async () => {
      const { data } = await insforge.auth.getPublicAuthConfig();
      return data?.oAuthProviders ?? [];
    },
    signInWithOAuth: async (provider) => {
      const { error } = await insforge.auth.signInWithOAuth(provider, {
        redirectTo: `${window.location.origin}/dashboard`
      });
      if (error) throw new Error(error.message ?? "No se pudo iniciar sesión.");
    },
    sendLoginCode: async (email) => {
      unwrap(await insforge.auth.signInWithOtp({ email }));
    },
    signInWithLoginCode: async (email, otp) => {
      const result = unwrap(await insforge.auth.verifyOtp({ email, otp }));
      setUser(result.user as AuthUser);
    }
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de <AuthProvider>");
  return ctx;
}
