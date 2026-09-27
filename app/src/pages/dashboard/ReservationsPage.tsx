import { useCallback, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarOff, Plus, Star, Trash2 } from "lucide-react";
import { insforge } from "@/lib/insforgeClient";
import { useOrganization } from "@/hooks/useOrganization";
import { useCurrentBusinessTheme } from "@/hooks/useBusinessTheme";
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
import { functionsClient } from "@/lib/functionsClient";
import { getAssetDefinition } from "@/lib/assetTypes";
import { getWorkflow, fillNotifyMessage } from "@/lib/workflows";
import { isModuleEnabled } from "@/lib/modules";
import { useBusinessBranding } from "@/hooks/useBusinessBranding";
import { AssetSelect, ReservationsBoardView, StageSelect, type ReservationWithAsset } from "./reservations/ReservationWorkflow";
import { PaymentDialog, type PaymentDraft } from "@/components/PaymentDialog";
import { ScheduleBlocksDialog } from "@/components/ScheduleBlocksDialog";
import { SurveyShareDialog, type SurveyTarget } from "@/components/SurveyShareDialog";
import type { CustomerAsset, Reservation } from "@/types/domain";

export function ReservationsPage() {
  const { currentOrganizationId, currentRole, memberships } = useOrganization();
  const { vocabulary } = useCurrentBusinessTheme();
  const [blocksOpen, setBlocksOpen] = useState(false);
  const currentOrg = memberships.find((m) => m.organization_id === currentOrganizationId)?.organizations;
  const timezone = currentOrg?.timezone ?? "UTC";
  const workflow = isModuleEnabled(currentOrg?.disabled_modules, "workflow") ? getWorkflow(currentOrg?.business_type) : null;
  const assetDefinition = isModuleEnabled(currentOrg?.disabled_modules, "assets") ? getAssetDefinition(currentOrg?.business_type) : null;
  const cashEnabled = isModuleEnabled(currentOrg?.disabled_modules, "cash");
  const plansEnabled = isModuleEnabled(currentOrg?.disabled_modules, "plans");
  const [paymentDraft, setPaymentDraft] = useState<PaymentDraft | null>(null);
  const surveysEnabled = isModuleEnabled(currentOrg?.disabled_modules, "surveys");
  const [surveyTarget, setSurveyTarget] = useState<SurveyTarget | null>(null);
  const closeSurvey = useCallback((open: boolean) => !open && setSurveyTarget(null), []);
  const branding = useBusinessBranding();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [view, setView] = useState<"list" | "calendar" | "board">(() => (workflow ? "board" : "list"));
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
        .select("*, customers(*), services(*), resources(*), customer_assets(label, asset_type)")
        .eq("organization_id", currentOrganizationId)
        .order("start_at", { ascending: true });
      if (statusFilter !== "all") query = query.eq("status", statusFilter);
      const { data, error } = await query;
      if (error) throw error;
      return data as ReservationWithAsset[];
    }
  });

  const upcoming = useMemo(() => reservations, [reservations]);

  // Fichas de los clientes que aparecen en la lista, para vincularlas a su reserva.
  const customerIds = useMemo(
    () => [...new Set(reservations.map((r) => r.customer_id).filter((id): id is string => !!id))].sort(),
    [reservations]
  );
  const { data: assets = [] } = useQuery({
    queryKey: ["customer-assets-by-org", currentOrganizationId, customerIds],
    enabled: !!currentOrganizationId && !!assetDefinition && customerIds.length > 0,
    queryFn: async () => {
      const { data, error } = await insforge.database
        .from("customer_assets")
        .select("*")
        .eq("organization_id", currentOrganizationId)
        .in("customer_id", customerIds);
      if (error) throw error;
      return data as CustomerAsset[];
    }
  });

  // Reservas completadas ya cobradas en caja o cubiertas por un plan: no piden "Cobrar".
  const completedIds = useMemo(() => reservations.filter((r) => r.status === "completed").map((r) => r.id).sort(), [reservations]);
  const { data: settledIds = new Set<string>() } = useQuery({
    queryKey: ["reservations-settled", currentOrganizationId, completedIds],
    enabled: !!currentOrganizationId && cashEnabled && completedIds.length > 0,
    queryFn: async () => {
      const [paid, covered] = await Promise.all([
        insforge.database.from("payments").select("reservation_id").eq("organization_id", currentOrganizationId).in("reservation_id", completedIds),
        plansEnabled
          ? insforge.database
              .from("customer_plan_usages")
              .select("reservation_id, customer_plans(kind)")
              .eq("organization_id", currentOrganizationId)
              .in("reservation_id", completedIds)
          : Promise.resolve({ data: [], error: null })
      ]);
      if (paid.error) throw paid.error;
      if (covered.error) throw covered.error;
      // Un sello no paga la atención; un bono o una membresía sí.
      const prepaid = ((covered.data ?? []) as { reservation_id: string; customer_plans: { kind: string } | null }[]).filter(
        (u) => u.customer_plans?.kind !== "stamps"
      );
      return new Set([...((paid.data ?? []) as { reservation_id: string }[]), ...prepaid].map((row) => row.reservation_id));
    }
  });

  // Calificación de cada atención completada (si ya respondió la encuesta).
  const { data: ratings = new Map<string, number | null>() } = useQuery({
    queryKey: ["reservations-surveys", currentOrganizationId, completedIds],
    enabled: !!currentOrganizationId && surveysEnabled && completedIds.length > 0,
    queryFn: async () => {
      const { data, error } = await insforge.database
        .from("survey_requests")
        .select("reservation_id, rating")
        .eq("organization_id", currentOrganizationId)
        .in("reservation_id", completedIds);
      if (error) throw error;
      return new Map(((data ?? []) as { reservation_id: string; rating: number | null }[]).map((s) => [s.reservation_id, s.rating]));
    }
  });

  function charge(r: Reservation) {
    setPaymentDraft({
      amount: r.services?.price ?? null,
      currency: r.services?.currency ?? null,
      concept: r.services?.name ?? null,
      reservationId: r.id,
      customerId: r.customer_id
    });
  }

  async function updateReservation(id: string, patch: Partial<Pick<Reservation, "stage" | "asset_id">>, success?: string) {
    const { error } = await insforge.database.from("reservations").update(patch).eq("id", id);
    if (error) {
      toast.error("No se pudo actualizar la reserva.");
      return;
    }
    if (success) toast.success(success);
    refetch();
  }

  async function notifyCustomer(r: Reservation) {
    if (!workflow?.notifyMessage || !r.conversation_id || !currentOrganizationId) return;
    const content = fillNotifyMessage(workflow.notifyMessage, r.customer_name || r.customers?.name, branding?.name ?? currentOrg?.name ?? "");
    if (!window.confirm(`Se enviará este mensaje al cliente por su chat:\n\n"${content}"`)) return;
    try {
      await functionsClient.post("conversations-reply", { organization_id: currentOrganizationId, conversation_id: r.conversation_id, content });
      toast.success("Cliente avisado.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo enviar el aviso.");
    }
  }

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
          <h1 className="font-display text-2xl font-semibold">{vocabulary.reservations}</h1>
          <p className="text-sm text-muted-foreground">Gestioná las reservas de tu negocio.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setBlocksOpen(true)}>
            <CalendarOff className="h-4 w-4" /> Bloqueos
          </Button>
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4" /> Nueva reserva
          </Button>
        </div>
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

        <Tabs value={view} onValueChange={(v) => setView(v as "list" | "calendar" | "board")}>
          <TabsList>
            {workflow && <TabsTrigger value="board">Tablero</TabsTrigger>}
            <TabsTrigger value="list">Lista</TabsTrigger>
            <TabsTrigger value="calendar">Calendario</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {isError ? (
        <QueryErrorState onRetry={() => refetch()} message="No se pudieron cargar las reservas." />
      ) : view === "board" && workflow ? (
        <ReservationsBoardView
          workflow={workflow}
          reservations={upcoming}
          timezone={timezone}
          onStageChange={(r, stage) => updateReservation(r.id, { stage })}
          onNotify={notifyCustomer}
          onComplete={(r) => updateStatus(r.id, "completed")}
        />
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
                {workflow && <th className="px-4 py-3">Etapa</th>}
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
                    {assetDefinition && r.customer_id && (
                      <AssetSelect
                        assets={assets.filter((a) => a.customer_id === r.customer_id)}
                        reservation={r}
                        label={assetDefinition.singular}
                        onChange={(assetId) => updateReservation(r.id, { asset_id: assetId })}
                      />
                    )}
                  </td>
                  <td className="px-4 py-3">{r.services?.name ?? "—"}</td>
                  <td className="px-4 py-3">{r.resources?.name ?? "—"}</td>
                  {workflow && (
                    <td className="px-4 py-3">
                      {r.status === "pending" || r.status === "confirmed" ? (
                        <StageSelect workflow={workflow} reservation={r} onChange={(stage) => updateReservation(r.id, { stage })} />
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  )}
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
                    {surveysEnabled && r.status === "completed" && (
                      ratings.get(r.id) ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium" title="Calificación del cliente">
                          <Star className="h-3.5 w-3.5 fill-primary text-primary" /> {ratings.get(r.id)}
                        </span>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            setSurveyTarget({
                              reservationId: r.id,
                              customerId: r.customer_id,
                              customerName: r.customer_name || r.customers?.name || null,
                              phone: r.customers?.phone ?? null,
                              conversationId: r.conversation_id ?? null
                            })
                          }
                        >
                          {ratings.has(r.id) ? "Reenviar opinión" : "Pedir opinión"}
                        </Button>
                      )
                    )}
                    {cashEnabled && r.status === "completed" && !settledIds.has(r.id) && (
                      <Button size="sm" variant="outline" onClick={() => charge(r)}>
                        Cobrar
                      </Button>
                    )}
                    {(r.status === "cancelled" || r.status === "completed" || r.status === "no_show") && (
                      <Button size="sm" variant="ghost" onClick={() => remove(r.id)} title="Eliminar reserva" aria-label="Eliminar reserva">
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
              {!isLoading && upcoming.length === 0 && <EmptyTableRow colSpan={workflow ? 8 : 7} message="No hay reservas para este filtro." />}
            </tbody>
          </table>
        </div>
      )}

      {currentOrganizationId && surveysEnabled && (
        <SurveyShareDialog
          target={surveyTarget}
          organizationId={currentOrganizationId}
          businessName={branding?.name ?? currentOrg?.name ?? ""}
          onOpenChange={closeSurvey}
          onSent={() => queryClient.invalidateQueries({ queryKey: ["reservations-surveys", currentOrganizationId] })}
        />
      )}

      {currentOrganizationId && (
        <ScheduleBlocksDialog
          open={blocksOpen}
          onOpenChange={setBlocksOpen}
          organizationId={currentOrganizationId}
          timezone={timezone}
          resources={resources}
          resourceLabel={vocabulary.resources}
          canManageAll={currentRole === "owner" || currentRole === "admin"}
          reservations={reservations}
        />
      )}

      {currentOrganizationId && cashEnabled && (
        <PaymentDialog
          open={!!paymentDraft}
          onOpenChange={(open) => !open && setPaymentDraft(null)}
          organizationId={currentOrganizationId}
          draft={paymentDraft ?? {}}
          onSaved={() => queryClient.invalidateQueries({ queryKey: ["reservations-settled", currentOrganizationId] })}
        />
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
