import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { Button, buttonVariants } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { AuthLayout } from "./AuthLayout";

const MIN_PASSWORD_LENGTH = 6;

/**
 * Destino del enlace del correo de recuperación, cuando InsForge está
 * configurado para mandar un enlace en vez de un código. InsForge redirige
 * acá con ?token=... (y insforge_status=error si el enlace venció o ya se
 * usó); con ese token se guarda la contraseña nueva.
 */
export function ResetPasswordPage() {
  const { resetPassword } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get("token");
  const linkFailed = params.get("insforge_status") === "error";
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!token || linkFailed) {
    return (
      <AuthLayout title="El enlace no funciona" subtitle="Puede haber vencido o ya haberse usado">
        <div className="space-y-4 text-center">
          <p className="text-sm">Pedí un correo nuevo para restablecer tu contraseña.</p>
          <Link to="/forgot-password" className={buttonVariants({ className: "w-full" })}>
            Pedir otro correo
          </Link>
        </div>
      </AuthLayout>
    );
  }

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setError(`La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await resetPassword(newPassword, token);
      toast.success("Contraseña actualizada. Iniciá sesión con tu nueva contraseña.");
      navigate("/login", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo restablecer la contraseña. Pedí un correo nuevo.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout title="Nueva contraseña" subtitle="Elegí la contraseña con la que vas a entrar">
      <form className="space-y-4" onSubmit={onSubmit}>
        <div className="space-y-1.5">
          <Label htmlFor="newPassword">Nueva contraseña</Label>
          <PasswordInput id="newPassword" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="confirmPassword">Repetí la contraseña</Label>
          <PasswordInput id="confirmPassword" autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting ? "Guardando..." : "Guardar contraseña"}
        </Button>
      </form>
      <p className="mt-4 text-center text-sm text-muted-foreground">
        <Link to="/forgot-password" className="font-medium text-primary hover:underline">
          Pedir otro correo
        </Link>
      </p>
    </AuthLayout>
  );
}
