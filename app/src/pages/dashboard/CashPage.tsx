import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { insforge } from "@/lib/insforgeClient";
import { useOrganization } from "@/hooks/useOrganization";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { QueryErrorState } from "@/components/QueryErrorState";
import { PaymentDialog } from "@/components/PaymentDialog";
import { formatCurrency } from "@/lib/currency";
import { PAYMENT_METHODS, PAYMENT_METHOD_LABEL, totalByCurrency, totalsByMethod, zonedDayRange } from "@/lib/payments";
import { upcomingDates } from "@/lib/publicBookingUtils";
import type { Payment } from "@/types/domain";

function formatTotals(totals: Record<string, number> | undefined): string {
  const entries = Object.entries(totals ?? {});
  if (entries.length === 0) return formatCurrency(0, null);
  return entries.map(([currency, amount]) => formatCurrency(amount, currency)).join(" + ");
}

export function CashPage() {
  const { currentOrganizationId, currentRole, memberships } = useOrganization();
  const timezone = memberships.find((m) => m.organization_id === currentOrganizationId)?.organizations.timezone ?? "UTC";
  const canDelete = currentRole === "owner" || currentRole === "admin";
  const queryClient = useQueryClient();
  const today = upcomingDates(timezone, 1)[0];
  const [date, setDate] = useState(today);
  const [dialogOpen, setDialogOpen] = useState(false);

  const queryKey = ["payments", currentOrganizationId, date, timezone];
  const {
    data: payments = [],
    isError,
    isLoading,
    refetch
  } = useQuery({
    queryKey,
    enabled: !!currentOrganizationId && !!date,
    queryFn: async () => {
      const { from, to } = zonedDayRange(date, timezone);
      const { data, error } = await insforge.database
        .from("payments")
        .select("*, customers(name)")
        .eq("organization_id", currentOrganizationId)
        .gte("paid_at", from)
        .lt("paid_at", to)
        .order("paid_at", { ascending: false });
      if (error) throw error;
      return data as Payment[];
    }
  });

  const byMethod = totalsByMethod(payments);
  const total = totalByCurrency(payments);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["payments", currentOrganizationId] });

  async function remove(payment: Payment) {
    if (!window.confirm(`¿Borrar el cobro de ${formatCurrency(payment.amount, payment.currency)}?`)) return;
    const { error } = await insforge.database.from("payments").delete().eq("id", payment.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Cobro borrado.");
    refresh();
  }

  const time = (iso: string) => new Date(iso).toLocaleTimeString("es-CO", { timeZone: timezone, hour: "2-digit", minute: "2-digit" });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">Caja</h1>
          <p className="text-sm text-muted-foreground">Lo que realmente entró, por medio de pago. Al final del día, compará con lo que hay en caja.</p>
        </div>
        <div className="flex items-end gap-2">
          <div className="space-y-1.5">
            <Label htmlFor="cash-date">Día</Label>
            <Input id="cash-date" type="date" max={today} value={date} onChange={(e) => setDate(e.target.value || today)} />
          </div>
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4" /> Registrar cobro
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="col-span-2 lg:col-span-1">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total del día</p>
            <p className="font-display text-2xl font-semibold">{formatTotals(total)}</p>
            <p className="text-xs text-muted-foreground">
              {payments.length} {payments.length === 1 ? "cobro" : "cobros"}
            </p>
          </CardContent>
        </Card>
        {PAYMENT_METHODS.filter((m) => byMethod[m] || m === "cash").map((m) => (
          <Card key={m}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{PAYMENT_METHOD_LABEL[m]}</p>
              <p className="font-display text-lg font-semibold">{formatTotals(byMethod[m])}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {isError ? (
        <QueryErrorState onRetry={() => refetch()} message="No se pudo cargar la caja." />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Movimientos</CardTitle>
          </CardHeader>
          <CardContent className="divide-y divide-border">
            {!isLoading && payments.length === 0 && <p className="text-sm text-muted-foreground">No hay cobros registrados este día.</p>}
            {payments.map((p) => (
              <div key={p.id} className="flex items-center gap-3 py-2 text-sm first:pt-0 last:pb-0">
                <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground sm:w-16">{time(p.paid_at)}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{p.concept || p.customers?.name || "Cobro"}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    <span className="sm:hidden">{PAYMENT_METHOD_LABEL[p.method]}</span>
                    {p.concept && p.customers?.name && (
                      <>
                        <span className="sm:hidden"> · </span>
                        {p.customers.name}
                      </>
                    )}
                  </p>
                </div>
                <Badge variant="muted" className="hidden sm:inline-flex">
                  {PAYMENT_METHOD_LABEL[p.method]}
                </Badge>
                <span className="shrink-0 text-right font-medium tabular-nums sm:w-28">{formatCurrency(p.amount, p.currency)}</span>
                {canDelete && (
                  <Button size="icon" variant="ghost" aria-label="Borrar cobro" onClick={() => remove(p)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {currentOrganizationId && (
        <PaymentDialog open={dialogOpen} onOpenChange={setDialogOpen} organizationId={currentOrganizationId} draft={{}} onSaved={refresh} />
      )}
    </div>
  );
}
