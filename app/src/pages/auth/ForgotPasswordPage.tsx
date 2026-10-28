import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useCountdown } from "@/hooks/useCountdown";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { AuthLayout } from "./AuthLayout";

const emailSchema = z.object({ email: z.string().email("Ingresá un email válido") });
type EmailValues = z.infer<typeof emailSchema>;

/** Espera antes de poder pedir otro correo: InsForge limita los reenvíos seguidos. */
const RESEND_WAIT_SECONDS = 60;

interface SentReset {
  email: string;
  /** "code": el correo trae un código para escribir acá; "link": trae un enlace a /reset-password. */
  method: "code" | "link";
}

export function ForgotPasswordPage() {
  const { sendPasswordReset, getResetPasswordMethod, exchangeResetCode, resetPassword } = useAuth();
  const navigate = useNavigate();
  const [sent, setSent] = useState<SentReset | null>(null);
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const resendWait = useCountdown();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm<EmailValues>({ resolver: zodResolver(emailSchema) });

  const onSendCode = async (values: EmailValues) => {
    try {
      const [, method] = await Promise.all([sendPasswordReset(values.email), getResetPasswordMethod()]);
      setSent({ email: values.email, method });
      resendWait.start(RESEND_WAIT_SECONDS);
      toast.success(method === "link" ? "Te enviamos un enlace para restablecer tu contraseña." : "Te enviamos un código para restablecer tu contraseña.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo enviar el código.");
    }
  };

  const onResend = async () => {
    if (!sent) return;
    setResending(true);
    try {
      await sendPasswordReset(sent.email);
      resendWait.start(RESEND_WAIT_SECONDS);
      toast.success(`Te lo enviamos de nuevo a ${sent.email}.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo reenviar el correo.");
    } finally {
      setResending(false);
    }
  };

  const onResetPassword = async () => {
    if (!sent || code.length < 4 || newPassword.length < 6) return;
    setSubmitting(true);
    try {
      const token = await exchangeResetCode(sent.email, code);
      await resetPassword(newPassword, token);
      toast.success("Contraseña actualizada. Iniciá sesión con tu nueva contraseña.");
      navigate("/login", { replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo restablecer la contraseña.");
    } finally {
      setSubmitting(false);
    }
  };

  if (sent) {
    const what = sent.method === "link" ? "enlace" : "código";
    const resendHelp = (
      <div className="space-y-3 border-t border-border pt-4 text-center">
        <p className="text-xs text-muted-foreground">
          ¿No te llegó? Puede tardar unos minutos. Revisá también las carpetas de spam y Promociones, y que{" "}
          <span className="font-medium">{sent.email}</span> sea el correo con el que creaste la cuenta.
        </p>
        <Button type="button" variant="outline" className="w-full" onClick={onResend} disabled={resending || resendWait.remaining > 0}>
          {resending ? "Reenviando..." : resendWait.remaining > 0 ? `Reenviar ${what} (${resendWait.remaining} s)` : `Reenviar ${what}`}
        </Button>
        <button type="button" className="text-sm font-medium text-primary hover:underline" onClick={() => setSent(null)}>
          Usar otro correo
        </button>
      </div>
    );

    if (sent.method === "link") {
      return (
        <AuthLayout title="Revisá tu correo" subtitle={`Te enviamos un enlace a ${sent.email}`}>
          <div className="space-y-4">
            <p className="text-sm">Abrí el enlace del correo para elegir tu nueva contraseña. El enlace vence después de un rato: si no te funciona, pedí otro.</p>
            {resendHelp}
          </div>
        </AuthLayout>
      );
    }

    return (
      <AuthLayout title="Nueva contraseña" subtitle={`Ingresá el código enviado a ${sent.email} y tu nueva contraseña`}>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="code">Código</Label>
            <Input id="code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" maxLength={6} inputMode="numeric" autoComplete="one-time-code" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="newPassword">Nueva contraseña</Label>
            <PasswordInput id="newPassword" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          </div>
          <Button className="w-full" onClick={onResetPassword} disabled={submitting}>
            {submitting ? "Guardando..." : "Restablecer contraseña"}
          </Button>
          {resendHelp}
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Recuperar contraseña" subtitle="Te enviaremos un código por email">
      <form className="space-y-4" onSubmit={handleSubmit(onSendCode)}>
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" autoComplete="email" {...register("email")} />
          {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
        </div>
        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? "Enviando..." : "Enviar código"}
        </Button>
      </form>
      <p className="mt-4 text-center text-sm text-muted-foreground">
        <Link to="/login" className="font-medium text-primary hover:underline">
          Volver a iniciar sesión
        </Link>
      </p>
    </AuthLayout>
  );
}
