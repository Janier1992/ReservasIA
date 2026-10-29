import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useCountdown } from "@/hooks/useCountdown";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { OAuthButtons } from "@/components/auth/OAuthButtons";
import { AuthLayout } from "./AuthLayout";

const schema = z.object({
  email: z.string().email("Ingresá un email válido"),
  password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres")
});

const emailSchema = z.object({ email: z.string().email("Ingresá un email válido") });

type FormValues = z.infer<typeof schema>;
type EmailValues = z.infer<typeof emailSchema>;

/** Espera antes de poder pedir otro código: InsForge limita los reenvíos seguidos. */
const RESEND_WAIT_SECONDS = 60;

export function LoginPage() {
  const { signIn, sendLoginCode, signInWithLoginCode } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [useCode, setUseCode] = useState(false);
  const [codeSentTo, setCodeSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const resendWait = useCountdown();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const {
    register: registerEmail,
    handleSubmit: handleEmailSubmit,
    formState: { errors: emailErrors, isSubmitting: sendingCode }
  } = useForm<EmailValues>({ resolver: zodResolver(emailSchema) });

  const goToApp = () => {
    const from = (location.state as { from?: Location })?.from?.pathname ?? "/dashboard";
    navigate(from, { replace: true });
  };

  const onSubmit = async (values: FormValues) => {
    try {
      await signIn(values.email, values.password);
      goToApp();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo iniciar sesión.");
    }
  };

  const onSendCode = async (values: EmailValues) => {
    try {
      await sendLoginCode(values.email);
      setCodeSentTo(values.email);
      resendWait.start(RESEND_WAIT_SECONDS);
      toast.success("Te enviamos un código de acceso a tu email.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo enviar el código.");
    }
  };

  const onResendCode = async () => {
    if (!codeSentTo) return;
    setResending(true);
    try {
      await sendLoginCode(codeSentTo);
      resendWait.start(RESEND_WAIT_SECONDS);
      toast.success(`Te lo enviamos de nuevo a ${codeSentTo}.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo reenviar el código.");
    } finally {
      setResending(false);
    }
  };

  const onVerifyCode = async () => {
    if (!codeSentTo || code.length < 4) return;
    setVerifying(true);
    try {
      await signInWithLoginCode(codeSentTo, code);
      goToApp();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Código inválido o expirado.");
    } finally {
      setVerifying(false);
    }
  };

  const resetToStart = () => {
    setUseCode(false);
    setCodeSentTo(null);
    setCode("");
  };

  if (codeSentTo) {
    return (
      <AuthLayout title="Ingresá tu código" subtitle={`Te enviamos un código de acceso a ${codeSentTo}`}>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="login-code">Código</Label>
            <Input
              id="login-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="123456"
              maxLength={6}
              inputMode="numeric"
              autoComplete="one-time-code"
            />
          </div>
          <Button className="w-full" onClick={onVerifyCode} disabled={verifying}>
            {verifying ? "Verificando..." : "Ingresar"}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={onResendCode}
            disabled={resending || resendWait.remaining > 0}
          >
            {resending ? "Reenviando..." : resendWait.remaining > 0 ? `Reenviar código (${resendWait.remaining} s)` : "Reenviar código"}
          </Button>
          <button type="button" className="w-full text-center text-sm text-primary hover:underline" onClick={resetToStart}>
            Volver a iniciar sesión con contraseña
          </button>
        </div>
      </AuthLayout>
    );
  }

  if (useCode) {
    return (
      <AuthLayout title="Entrar con un código" subtitle="Te mandamos un código de acceso a tu email, sin contraseña">
        <form className="space-y-4" onSubmit={handleEmailSubmit(onSendCode)}>
          <div className="space-y-1.5">
            <Label htmlFor="code-email">Email</Label>
            <Input id="code-email" type="email" autoComplete="email" {...registerEmail("email")} />
            {emailErrors.email && <p className="text-xs text-destructive">{emailErrors.email.message}</p>}
          </div>
          <Button type="submit" className="w-full" disabled={sendingCode}>
            {sendingCode ? "Enviando..." : "Enviar código"}
          </Button>
          <button type="button" className="w-full text-center text-sm text-primary hover:underline" onClick={resetToStart}>
            Volver a iniciar sesión con contraseña
          </button>
        </form>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Iniciar sesión" subtitle="Accedé al panel de tu negocio">
      <div className="space-y-4">
        <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" autoComplete="email" {...register("email")} />
            {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Contraseña</Label>
              <Link to="/forgot-password" className="text-xs text-primary hover:underline">
                ¿Olvidaste tu contraseña?
              </Link>
            </div>
            <PasswordInput id="password" autoComplete="current-password" {...register("password")} />
            {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
          </div>
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? "Ingresando..." : "Ingresar"}
          </Button>
        </form>
        <button type="button" className="w-full text-center text-sm text-primary hover:underline" onClick={() => setUseCode(true)}>
          Entrar sin contraseña, con un código por email
        </button>
        <OAuthButtons />
      </div>
      <p className="mt-4 text-center text-sm text-muted-foreground">
        ¿No tenés cuenta?{" "}
        <Link to="/register" className="font-medium text-primary hover:underline">
          Registrate
        </Link>
      </p>
    </AuthLayout>
  );
}
