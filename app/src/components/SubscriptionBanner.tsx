import { Link } from "react-router-dom";
import { Sparkles, CalendarClock } from "lucide-react";
import { useOrganization } from "@/hooks/useOrganization";
import { daysLeftLabel, subscriptionState } from "@/lib/subscription";
import { cn } from "@/lib/utils";

/**
 * Aviso arriba del panel: días de prueba gratis o vencimiento cercano, con
 * el acceso directo para reportar el pago. Solo lo ven dueño y admin.
 */
export function SubscriptionBanner() {
  const { memberships, currentOrganizationId, currentRole } = useOrganization();
  const org = memberships.find((m) => m.organization_id === currentOrganizationId)?.organizations;
  if (!org || currentRole === "staff") return null;
  const state = subscriptionState(org);
  if (state.kind === "ok") return null;
  const urgent = state.daysLeft <= 3;

  return (
    <div
      role="status"
      className={cn(
        "mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border px-4 py-2.5 text-sm",
        urgent ? "border-destructive/40 bg-destructive/5" : "border-primary/30 bg-primary/5"
      )}
    >
      {state.kind === "trial" ? <Sparkles className="h-4 w-4 shrink-0 text-primary" /> : <CalendarClock className="h-4 w-4 shrink-0 text-primary" />}
      <p className="flex-1">
        {state.kind === "trial" ? (
          <>
            <span className="font-semibold">Prueba gratis:</span> {daysLeftLabel(state.daysLeft)}. Al terminar, el servicio se pausa hasta registrar el pago.
          </>
        ) : (
          <>
            <span className="font-semibold">Tu suscripción {state.daysLeft <= 0 ? "vence hoy" : `vence en ${state.daysLeft} ${state.daysLeft === 1 ? "día" : "días"}`}.</span> Reportá el pago
            para no tener interrupciones.
          </>
        )}
      </p>
      <Link to="/dashboard/settings#suscripcion" className="font-semibold text-primary underline-offset-4 hover:underline">
        {state.kind === "trial" ? "Activar suscripción" : "Pagar ahora"}
      </Link>
    </div>
  );
}
