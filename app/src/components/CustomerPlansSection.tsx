import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Gift, Plus } from "lucide-react";
import { insforge } from "@/lib/insforgeClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CustomerPlanCard } from "@/components/CustomerPlanCard";
import { PaymentDialog, type PaymentDraft } from "@/components/PaymentDialog";
import { customerPlanFromCatalog, PLAN_KIND_LABEL } from "@/lib/plans";
import { upcomingDates } from "@/lib/publicBookingUtils";
import { formatCurrency } from "@/lib/currency";
import type { CustomerPlan, PackagePlan } from "@/types/domain";

interface Props {
  organizationId: string;
  customerId: string;
  timezone: string;
  cashEnabled: boolean;
  canManage: boolean;
}

/** Planes del cliente (bonos, membresías, sellos) y venta de uno nuevo desde el catálogo. */
export function CustomerPlansSection({ organizationId, customerId, timezone, cashEnabled, canManage }: Props) {
  const queryClient = useQueryClient();
  const [selling, setSelling] = useState(false);
  const [planId, setPlanId] = useState("");
  const [startsOn, setStartsOn] = useState("");
  const [saving, setSaving] = useState(false);
  const [paymentDraft, setPaymentDraft] = useState<PaymentDraft | null>(null);
  const queryKey = ["customer-plans", organizationId, customerId];

  const { data: plans = [] } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await insforge.database
        .from("customer_plans")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("customer_id", customerId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as CustomerPlan[];
    }
  });

  const { data: catalog = [] } = useQuery({
    queryKey: ["package-plans-active", organizationId],
    enabled: selling,
    queryFn: async () => {
      const { data, error } = await insforge.database
        .from("package_plans")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("is_active", true)
        .order("name", { ascending: true });
      if (error) throw error;
      return data as PackagePlan[];
    }
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey });
    queryClient.invalidateQueries({ queryKey: ["customer-plans-org", organizationId] });
  };

  function startSelling() {
    setStartsOn(upcomingDates(timezone, 1)[0]);
    setPlanId("");
    setSelling(true);
  }

  async function sell(e: React.FormEvent) {
    e.preventDefault();
    const plan = catalog.find((p) => p.id === planId);
    if (!plan || !startsOn) return;
    setSaving(true);
    const { data, error } = await insforge.database
      .from("customer_plans")
      .insert([customerPlanFromCatalog(plan, organizationId, customerId, startsOn)])
      .select("id")
      .single();
    setSaving(false);
    if (error) {
      toast.error(error.message ?? "No se pudo vender el plan.");
      return;
    }
    toast.success(`${plan.name} activado.`);
    setSelling(false);
    refresh();
    if (cashEnabled && plan.price) {
      setPaymentDraft({
        amount: plan.price,
        currency: plan.currency,
        concept: plan.name,
        customerId,
        customerPlanId: (data as { id: string }).id
      });
    }
  }

  const selected = catalog.find((p) => p.id === planId);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h4 className="font-medium">Planes</h4>
        {!selling && (
          <Button size="sm" variant="outline" onClick={startSelling}>
            <Plus className="h-4 w-4" /> Vender plan
          </Button>
        )}
      </div>

      {selling && (
        <form onSubmit={sell} className="mb-3 space-y-3 rounded-md border border-primary/30 bg-primary/5 p-3">
          {catalog.length === 0 ? (
            <p className="text-muted-foreground">No hay planes activos en el catálogo. Creálos en Planes.</p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_10rem]">
              <div className="space-y-1.5">
                <Label htmlFor="sell-plan">Plan</Label>
                <Select value={planId} onValueChange={setPlanId}>
                  <SelectTrigger id="sell-plan">
                    <SelectValue placeholder="Elegí un plan" />
                  </SelectTrigger>
                  <SelectContent>
                    {catalog.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name} · {PLAN_KIND_LABEL[p.kind]}
                        {p.price ? ` · ${formatCurrency(p.price, p.currency)}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sell-start">Desde</Label>
                <Input id="sell-start" type="date" required value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />
              </div>
            </div>
          )}
          {selected?.reward_text && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Gift className="h-3.5 w-3.5" /> Premio: {selected.reward_text}
            </p>
          )}
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={saving || !selected}>
              {cashEnabled && selected?.price ? "Vender y cobrar" : "Vender"}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setSelling(false)}>
              Cancelar
            </Button>
          </div>
        </form>
      )}

      <div className="space-y-2">
        {plans.map((plan) => (
          <CustomerPlanCard key={plan.id} plan={plan} canManage={canManage} onChanged={refresh} />
        ))}
        {plans.length === 0 && !selling && <p className="text-muted-foreground">Sin planes.</p>}
      </div>

      <PaymentDialog
        open={!!paymentDraft}
        onOpenChange={(open) => !open && setPaymentDraft(null)}
        organizationId={organizationId}
        draft={paymentDraft ?? {}}
        title="Cobrar plan"
      />
    </div>
  );
}
