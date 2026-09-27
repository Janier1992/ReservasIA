import { useState } from "react";
import { toast } from "sonner";
import { Gift } from "lucide-react";
import { insforge } from "@/lib/insforgeClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CUSTOMER_PLAN_STATUS_LABEL, PLAN_KIND_LABEL, planBalanceText, planProgress } from "@/lib/plans";
import type { CustomerPlan } from "@/types/domain";

const STATUS_VARIANT: Record<CustomerPlan["status"], "success" | "warning" | "muted" | "default"> = {
  active: "success",
  reward_ready: "warning",
  exhausted: "muted",
  redeemed: "muted",
  expired: "muted",
  cancelled: "muted"
};

interface Props {
  plan: CustomerPlan;
  canManage: boolean;
  showCustomer?: boolean;
  onChanged: () => void;
}

export function CustomerPlanCard({ plan, canManage, showCustomer, onChanged }: Props) {
  const [busy, setBusy] = useState(false);
  const progress = planProgress(plan);

  async function setStatus(status: "redeemed" | "cancelled", success: string) {
    setBusy(true);
    const { error } = await insforge.database.from("customer_plans").update({ status }).eq("id", plan.id).eq("status", plan.status);
    setBusy(false);
    if (error) {
      toast.error(error.message ?? "No se pudo actualizar el plan.");
      return;
    }
    toast.success(success);
    onChanged();
  }

  return (
    <div className="space-y-2 rounded-md border border-border p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium leading-tight">{plan.name}</p>
          <p className="text-xs text-muted-foreground">
            {[showCustomer && (plan.customers?.name || plan.customers?.phone), PLAN_KIND_LABEL[plan.kind]].filter(Boolean).join(" · ")}
          </p>
        </div>
        <Badge variant={STATUS_VARIANT[plan.status]}>{CUSTOMER_PLAN_STATUS_LABEL[plan.status]}</Badge>
      </div>

      {progress !== null && (
        <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full rounded-full bg-primary" style={{ width: `${progress * 100}%` }} />
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        {planBalanceText(plan)}
        {plan.kind !== "membership" && plan.expires_on ? ` · vence ${plan.expires_on}` : ""}
      </p>
      {plan.kind === "stamps" && plan.reward_text && (
        <p className="flex items-center gap-1.5 text-xs">
          <Gift className="h-3.5 w-3.5 text-primary" /> {plan.reward_text}
        </p>
      )}

      {(plan.status === "reward_ready" || (plan.status === "active" && canManage)) && (
        <div className="flex gap-2">
          {plan.status === "reward_ready" && (
            <Button size="sm" disabled={busy} onClick={() => setStatus("redeemed", "Premio canjeado.")}>
              <Gift className="h-3.5 w-3.5" /> Canjear premio
            </Button>
          )}
          {plan.status === "active" && canManage && (
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => window.confirm(`¿Cancelar "${plan.name}"? Deja de descontarse.`) && setStatus("cancelled", "Plan cancelado.")}
            >
              Cancelar plan
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
