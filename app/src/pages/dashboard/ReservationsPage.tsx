import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { insforge } from "@/lib/insforgeClient";
import { useOrganization } from "@/hooks/useOrganization";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ReservationFormDialog } from "./reservations/ReservationFormDialog";
import { ReservationsCalendarView } from "./reservations/ReservationsCalendarView";
import { EmptyTableRow } from "@/components/EmptyTableRow";
import { QueryErrorState } from "@/components/QueryErrorState";
import { RESERVATION_STATUS_LABEL, reservationStatusLabel, reservationStatusVariant } from "@/lib/reservationStatus";
import { paymentStatusLabel, paymentStatusVariant } from "@/lib/paymentStatus";
import type { Reservation } from "@/types/domain";

export function ReservationsPage() {
  const { currentOrganizationId, memberships } = useOrganization();
  const timezone = memberships.find((m) => m.organization_id === currentOrganizationId)?.organizations.timezone ?? "UTC";
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [view, setView] = useState<"list" | "calendar">("list");
  const queryClient = useQueryClient();

  const { data: services = [] } = useQuery({
    queryKey: ["services-all", currentOrganizationId],
    enabled: !!currentOrganizationId,
    queryFn: async () => {
      const { data } = await insforge.database.from("services").select("*").eq("organization_id", currentOrganizationId).eq("is_active", true);
      return data ?? [];
    }
  });

  const { data: resources = [] } = useQuery({
    queryKey: ["resources-all", currentOrganizationId],
    enabled: !!currentOrganizationId,
    queryFn: async () => {
      const { data } = await insforge.database.from("resources").select("*").eq("organization_id", currentOrganizationId).eq("is_active", true);
      return data ?? [];
    }
  });

  const {
    data: reservations = [],
    refetch,
    isError,
    isLoading
  } = useQuery({
    queryKey: ["reservations", currentOrganizationId, statusFilter],
    enabled: !!currentOrganizationId,
    queryFn: async () => {
      let query = insforge.database
        .from("reservations")
        .select("*, customers(*), services(*), resources(*)")
        .eq("organization_id", currentOrganizationId)
        .order("start_at", { ascending: true });
      if (statusFilter !== "all") query = query.eq("status", statusFilter);
      const { data, error } = await query;
      if (error) throw error;
      return data as Reservation[];
    }
  });

  const upcoming = useMemo(() => reservations, [reservations]);

  async function updateStatus(id: string, status: "completed" | "no_show") {
    const { error } = await insforge.database.from("reservations").update({ status }).eq("id", id);
    if (error) {
      toast.error("No se pudo actualizar la reserva.");
      return;
    }
    refetch();
  }

  async function cancel(id: string) {
    const { error } = await insforge.database.rpc("cancel_reservation", { p_reservation_id: id });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Reserva cancelada.");
    refetch();
  }

  async function confirmPayment(id: string) {
    const { error } = await insforge.database.from("reservations").update({ payment_status: "paid" }).eq("id", id);
    if (error) {
      toast.error("No se pudo confirmar el pago.");
      return;
    }
    toast.success("Pago confirmado.");
    refetch();
  }

  async function remove(id: string) {
    const { error } = await insforge.database.from("reservations").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Reserva eliminada.");
    refetch();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Reservas</h1>
          <p className="text-sm text-muted-foreground">Gestioná las reservas de tu negocio.</p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4" /> Nueva reserva
        </Button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los estados</SelectItem>
            {Object.entries(RESERVATION_STATUS_LABEL).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Tabs value={view} onValueChange={(v) => setView(v as "list" | "calendar")}>
          <TabsList>
            <TabsTrigger value="list">Lista</TabsTrigger>
            <TabsTrigger value="calendar">Calendario</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {isError ? (
        <QueryErrorState onRetry={() => refetch()} message="No se pudieron cargar las reservas." />
      ) : view === "calendar" ? (
        <ReservationsCalendarView
          reservations={upcoming}
          onComplete={(id) => updateStatus(id, "completed")}
          onNoShow={(id) => updateStatus(id, "no_show")}
          onCancel={cancel}
          onRemove={remove}
          onConfirmPayment={confirmPayment}
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Servicio</th>
                <th className="px-4 py-3">Recurso</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3">Pago</th>
                <th className="px-4 py-3">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {upcoming.map((r) => (
                <tr key={r.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3">{new Date(r.start_at).toLocaleString()}</td>
                  <td className="px-4 py-3">
                    {r.customer_name || r.customers?.name || r.customers?.phone}
                    {r.special_requests && <p className="max-w-xs text-xs text-muted-foreground">{r.special_requests}</p>}
                  </td>
                  <td className="px-4 py-3">{r.services?.name ?? "—"}</td>
                  <td className="px-4 py-3">{r.resources?.name ?? "—"}</td>
                  <td className="px-4 py-3">
                    <Badge variant={reservationStatusVariant(r.status)}>{reservationStatusLabel(r.status)}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    {r.payment_status !== "not_required" ? (
                      <Badge variant={paymentStatusVariant(r.payment_status)}>{paymentStatusLabel(r.payment_status)}</Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="space-x-1 px-4 py-3">
                    {r.payment_status === "awaiting_confirmation" && (
                      <Button size="sm" onClick={() => confirmPayment(r.id)}>
                        Confirmar pago
                      </Button>
                    )}
                    {(r.status === "pending" || r.status === "confirmed") && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => updateStatus(r.id, "completed")}>
                          Completar
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => updateStatus(r.id, "no_show")}>
                          No-show
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => cancel(r.id)}>
                          Cancelar
                        </Button>
                      </>
                    )}
                    {(r.status === "cancelled" || r.status === "completed" || r.status === "no_show") && (
                      <Button size="sm" variant="ghost" onClick={() => remove(r.id)} title="Eliminar reserva" aria-label="Eliminar reserva">
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
              {!isLoading && upcoming.length === 0 && <EmptyTableRow colSpan={7} message="No hay reservas para este filtro." />}
            </tbody>
          </table>
        </div>
      )}

      {currentOrganizationId && (
        <ReservationFormDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          organizationId={currentOrganizationId}
          timezone={timezone}
          services={services}
          resources={resources}
          onCreated={() => {
            queryClient.invalidateQueries({ queryKey: ["reservations", currentOrganizationId] });
          }}
        />
      )}
    </div>
  );
}
