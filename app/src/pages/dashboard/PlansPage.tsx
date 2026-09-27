import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { insforge } from "@/lib/insforgeClient";
import { useOrganization } from "@/hooks/useOrganization";
import { useCurrentBusinessTheme } from "@/hooks/useBusinessTheme";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { QueryErrorState } from "@/components/QueryErrorState";
import { CustomerPlanCard } from "@/components/CustomerPlanCard";
import { CURRENCY_OPTIONS, DEFAULT_CURRENCY, formatCurrency } from "@/lib/currency";
import { PLAN_KIND_HELP, PLAN_KIND_LABEL } from "@/lib/plans";
import { parseAmount } from "@/lib/payments";
import type { CustomerPlan, PackagePlan, PlanKind, Service } from "@/types/domain";

interface PlanForm {
  id: string | null;
  name: string;
  kind: PlanKind;
  sessionsTotal: string;
  validityDays: string;
  price: string;
  currency: string;
  serviceIds: string[];
  rewardText: string;
  isActive: boolean;
}

const EMPTY_FORM: PlanForm = {
  id: null,
  name: "",
  kind: "sessions",
  sessionsTotal: "5",
  validityDays: "",
  price: "",
  currency: DEFAULT_CURRENCY,
  serviceIds: [],
  rewardText: "",
  isActive: true
};

function toForm(plan: PackagePlan): PlanForm {
  return {
    id: plan.id,
    name: plan.name,
    kind: plan.kind,
    sessionsTotal: plan.sessions_total ? String(plan.sessions_total) : "",
    validityDays: plan.validity_days ? String(plan.validity_days) : "",
    price: plan.price ? String(plan.price) : "",
    currency: plan.currency,
    serviceIds: plan.service_ids ?? [],
    rewardText: plan.reward_text ?? "",
    isActive: plan.is_active
  };
}

function positiveInt(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export function PlansPage() {
  const { currentOrganizationId, currentRole } = useOrganization();
  const { vocabulary } = useCurrentBusinessTheme();
  const queryClient = useQueryClient();
  const canManage = currentRole === "owner" || currentRole === "admin";
  const [form, setForm] = useState<PlanForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<"open" | "all">("open");

  const catalogKey = ["package-plans", currentOrganizationId];
  const {
    data: catalog = [],
    isError,
    refetch
  } = useQuery({
    queryKey: catalogKey,
    enabled: !!currentOrganizationId,
    queryFn: async () => {
      const { data, error } = await insforge.database
        .from("package_plans")
        .select("*")
        .eq("organization_id", currentOrganizationId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as PackagePlan[];
    }
  });

  const { data: services = [] } = useQuery({
    queryKey: ["plans-services", currentOrganizationId],
    enabled: !!currentOrganizationId,
    queryFn: async () => {
      const { data, error } = await insforge.database
        .from("services")
        .select("*")
        .eq("organization_id", currentOrganizationId)
        .eq("is_active", true)
        .order("name", { ascending: true });
      if (error) throw error;
      return data as Service[];
    }
  });

  const soldKey = ["customer-plans-org", currentOrganizationId, filter];
  const { data: sold = [] } = useQuery({
    queryKey: soldKey,
    enabled: !!currentOrganizationId,
    queryFn: async () => {
      let query = insforge.database
        .from("customer_plans")
        .select("*, customers(name, phone)")
        .eq("organization_id", currentOrganizationId)
        .order("created_at", { ascending: false })
        .limit(200);
      if (filter === "open") query = query.in("status", ["active", "reward_ready"]);
      const { data, error } = await query;
      if (error) throw error;
      return data as CustomerPlan[];
    }
  });

  const serviceName = (id: string) => services.find((s) => s.id === id)?.name;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form || !currentOrganizationId || !form.name.trim()) return;
    const sessionsTotal = form.kind === "membership" ? null : positiveInt(form.sessionsTotal);
    const validityDays = form.validityDays.trim() ? positiveInt(form.validityDays) : null;
    if (form.kind !== "membership" && (!sessionsTotal || sessionsTotal > 1000)) {
      toast.error(form.kind === "stamps" ? "Indicá cuántos sellos completan la tarjeta (1 a 1000)." : "Indicá cuántas sesiones incluye (1 a 1000).");
      return;
    }
    if (form.kind === "membership" && !validityDays) {
      toast.error("Una membresía necesita días de vigencia (ej. 30).");
      return;
    }
    if (form.validityDays.trim() && !validityDays) {
      toast.error("La vigencia debe ser un número entero de días.");
      return;
    }
    const price = form.price.trim() ? parseAmount(form.price) : null;
    if (form.price.trim() && price === null) {
      toast.error("El precio no es válido.");
      return;
    }
    const row = {
      organization_id: currentOrganizationId,
      name: form.name.trim(),
      kind: form.kind,
      sessions_total: sessionsTotal,
      validity_days: validityDays,
      price,
      currency: form.currency,
      service_ids: form.serviceIds,
      reward_text: form.kind === "stamps" ? form.rewardText.trim() || null : null,
      is_active: form.isActive
    };
    setSaving(true);
    const { error } = form.id
      ? await insforge.database.from("package_plans").update(row).eq("id", form.id)
      : await insforge.database.from("package_plans").insert([row]);
    setSaving(false);
    if (error) {
      toast.error(error.message ?? "No se pudo guardar el plan.");
      return;
    }
    toast.success(form.id ? "Plan actualizado." : "Plan creado.");
    setForm(null);
    queryClient.invalidateQueries({ queryKey: catalogKey });
  }

  async function remove(plan: PackagePlan) {
    if (!window.confirm(`¿Eliminar "${plan.name}" del catálogo? Los planes ya vendidos se conservan.`)) return;
    const { error } = await insforge.database.from("package_plans").delete().eq("id", plan.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    queryClient.invalidateQueries({ queryKey: catalogKey });
  }

  function toggleService(id: string) {
    if (!form) return;
    const serviceIds = form.serviceIds.includes(id) ? form.serviceIds.filter((s) => s !== id) : [...form.serviceIds, id];
    setForm({ ...form, serviceIds });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">Planes y paquetes</h1>
          <p className="text-sm text-muted-foreground">
            Bonos, membresías y tarjetas de sellos. Se descuentan solos cuando completás {vocabulary.reservations.toLowerCase()} del cliente.
          </p>
        </div>
        {canManage && (
          <Button onClick={() => setForm(EMPTY_FORM)}>
            <Plus className="h-4 w-4" /> Nuevo plan
          </Button>
        )}
      </div>

      {isError ? (
        <QueryErrorState onRetry={() => refetch()} message="No se pudo cargar el catálogo de planes." />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Catálogo</CardTitle>
          </CardHeader>
          <CardContent className="divide-y divide-border">
            {catalog.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Todavía no hay planes. Ejemplos: "5 lavados por el precio de 4", "Membresía mensual ilimitada", "10 cortes = 1 gratis".
              </p>
            )}
            {catalog.map((plan) => (
              <div key={plan.id} className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {plan.name} {!plan.is_active && <Badge variant="muted">Inactivo</Badge>}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {[
                      PLAN_KIND_LABEL[plan.kind],
                      plan.kind === "sessions" && `${plan.sessions_total} sesiones`,
                      plan.kind === "stamps" && `${plan.sessions_total} sellos`,
                      plan.validity_days && `${plan.validity_days} días`,
                      plan.service_ids.length > 0 ? plan.service_ids.map(serviceName).filter(Boolean).join(", ") : "Todos los servicios"
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <span className="text-sm font-medium">{plan.price ? formatCurrency(plan.price, plan.currency) : "—"}</span>
                {canManage && (
                  <div className="flex">
                    <Button size="icon" variant="ghost" aria-label={`Editar ${plan.name}`} onClick={() => setForm(toForm(plan))}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" aria-label={`Eliminar ${plan.name}`} onClick={() => remove(plan)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-lg font-semibold">Planes vendidos</h2>
          <Tabs value={filter} onValueChange={(v) => setFilter(v as "open" | "all")}>
            <TabsList>
              <TabsTrigger value="open">Vigentes</TabsTrigger>
              <TabsTrigger value="all">Todos</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <p className="text-sm text-muted-foreground">Para vender un plan, abrí la ficha del cliente en {vocabulary.customers}.</p>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {sold.map((plan) => (
            <CustomerPlanCard
              key={plan.id}
              plan={plan}
              canManage={canManage}
              showCustomer
              onChanged={() => queryClient.invalidateQueries({ queryKey: ["customer-plans-org", currentOrganizationId] })}
            />
          ))}
        </div>
        {sold.length === 0 && <p className="text-sm text-muted-foreground">No hay planes {filter === "open" ? "vigentes" : "vendidos"}.</p>}
      </div>

      <Dialog open={!!form} onOpenChange={(open) => !open && setForm(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form?.id ? "Editar plan" : "Nuevo plan"}</DialogTitle>
            <DialogDescription>Los cambios no afectan los planes que ya vendiste.</DialogDescription>
          </DialogHeader>
          {form && (
            <form onSubmit={save} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="plan-name">Nombre *</Label>
                <Input
                  id="plan-name"
                  required
                  maxLength={80}
                  placeholder="Ej: 5 lavados"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="plan-kind">Tipo</Label>
                <Select value={form.kind} onValueChange={(v) => setForm({ ...form, kind: v as PlanKind })}>
                  <SelectTrigger id="plan-kind">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(PLAN_KIND_LABEL) as PlanKind[]).map((k) => (
                      <SelectItem key={k} value={k}>
                        {PLAN_KIND_LABEL[k]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">{PLAN_KIND_HELP[form.kind]}</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {form.kind !== "membership" && (
                  <div className="space-y-1.5">
                    <Label htmlFor="plan-sessions">{form.kind === "stamps" ? "Sellos para el premio *" : "Sesiones *"}</Label>
                    <Input
                      id="plan-sessions"
                      inputMode="numeric"
                      value={form.sessionsTotal}
                      onChange={(e) => setForm({ ...form, sessionsTotal: e.target.value })}
                    />
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label htmlFor="plan-validity">Vigencia en días{form.kind === "membership" ? " *" : ""}</Label>
                  <Input
                    id="plan-validity"
                    inputMode="numeric"
                    placeholder={form.kind === "membership" ? "30" : "Sin vencimiento"}
                    value={form.validityDays}
                    onChange={(e) => setForm({ ...form, validityDays: e.target.value })}
                  />
                </div>
              </div>
              {form.kind === "stamps" && (
                <div className="space-y-1.5">
                  <Label htmlFor="plan-reward">Premio</Label>
                  <Input
                    id="plan-reward"
                    maxLength={120}
                    placeholder="Ej: un corte gratis"
                    value={form.rewardText}
                    onChange={(e) => setForm({ ...form, rewardText: e.target.value })}
                  />
                </div>
              )}
              <div className="grid grid-cols-[1fr_7rem] gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="plan-price">Precio</Label>
                  <Input
                    id="plan-price"
                    inputMode="decimal"
                    placeholder={form.kind === "stamps" ? "Gratis" : "120.000"}
                    value={form.price}
                    onChange={(e) => setForm({ ...form, price: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="plan-currency">Moneda</Label>
                  <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v })}>
                    <SelectTrigger id="plan-currency">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CURRENCY_OPTIONS.map((c) => (
                        <SelectItem key={c.code} value={c.code}>
                          {c.code}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {services.length > 0 && (
                <fieldset className="space-y-1.5">
                  <legend className="text-sm font-medium">Servicios que cubre</legend>
                  <p className="text-xs text-muted-foreground">Sin marcar ninguno, cubre todos.</p>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {services.map((s) => (
                      <Button
                        key={s.id}
                        type="button"
                        size="sm"
                        variant={form.serviceIds.includes(s.id) ? "default" : "outline"}
                        aria-pressed={form.serviceIds.includes(s.id)}
                        onClick={() => toggleService(s.id)}
                      >
                        {s.name}
                      </Button>
                    ))}
                  </div>
                </fieldset>
              )}
              <div className="flex items-center gap-2">
                <Switch id="plan-active" checked={form.isActive} onCheckedChange={(v) => setForm({ ...form, isActive: v })} />
                <Label htmlFor="plan-active">Disponible para vender</Label>
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setForm(null)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={saving || !form.name.trim()}>
                  Guardar
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
