import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarCheck, Clock, DoorOpen, Hourglass, Pencil, Trash2, UserCheck, Wallet } from "lucide-react";
import { insforge } from "@/lib/insforgeClient";
import { useOrganization } from "@/hooks/useOrganization";
import { useCurrentBusinessTheme } from "@/hooks/useBusinessTheme";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { QueryErrorState } from "@/components/QueryErrorState";
import { PaymentDialog } from "@/components/PaymentDialog";
import { WalkInCard } from "@/components/walk-ins/WalkInCard";
import { WalkInEditDialog } from "@/components/walk-ins/WalkInEditDialog";
import { WalkInRegisterForm } from "@/components/walk-ins/WalkInRegisterForm";
import { isModuleEnabled } from "@/lib/modules";
import { formatWait, walkInErrorMessage, walkInStats } from "@/lib/walkIns";
import { zonedDayRange } from "@/lib/payments";
import { upcomingDates } from "@/lib/publicBookingUtils";
import type { Reservation, Resource, Service, WalkIn } from "@/types/domain";

// Radix Select no admite un item con value "": este valor representa "sin elegir".
const NONE = "none";
const WALK_IN_SELECT = "*, services(name, duration_minutes, price, currency), reservations(resource_id, start_at, source, resources(name))";

type TodayReservation = Reservation;

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function WalkInsPage() {
  const { currentOrganizationId, currentRole, memberships } = useOrganization();
  const currentOrg = memberships.find((m) => m.organization_id === currentOrganizationId)?.organizations;
  const timezone = currentOrg?.timezone ?? "UTC";
  const showPartySize = currentOrg?.business_type === "restaurant";
  const canDelete = currentRole === "owner" || currentRole === "admin";
  const salesEnabled = isModuleEnabled(currentOrg?.disabled_modules, "cash");
  const [editing, setEditing] = useState<WalkIn | null>(null);
  const [saleFor, setSaleFor] = useState<WalkIn | null>(null);
  const { vocabulary } = useCurrentBusinessTheme();
  const queryClient = useQueryClient();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [resourceChoice, setResourceChoice] = useState<Record<string, string>>({});
  const [now, setNow] = useState(() => new Date());

  // Refresca los tiempos de espera sin volver a pedir datos.
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const queryKey = ["walk-ins", currentOrganizationId];
  const {
    data: walkIns = [],
    isError,
    refetch
  } = useQuery({
    queryKey,
    enabled: !!currentOrganizationId,
    // Varias personas del equipo pueden estar atendiendo la misma fila.
    refetchInterval: 15_000,
    queryFn: async () => {
      const [active, today] = await Promise.all([
        insforge.database
          .from("walk_ins")
          .select(WALK_IN_SELECT)
          .eq("organization_id", currentOrganizationId)
          .in("status", ["waiting", "in_service"])
          .order("arrived_at", { ascending: true }),
        insforge.database
          .from("walk_ins")
          .select(WALK_IN_SELECT)
          .eq("organization_id", currentOrganizationId)
          .in("status", ["done", "left"])
          .gte("arrived_at", startOfToday().toISOString())
          .order("arrived_at", { ascending: false })
      ]);
      if (active.error) throw active.error;
      if (today.error) throw today.error;
      return [...(active.data ?? []), ...(today.data ?? [])] as WalkIn[];
    }
  });

  // Reservas de hoy que todavía no llegaron (quien reservó por chat, página pública o teléfono).
  const todayKey = ["walk-ins-today-reservations", currentOrganizationId, timezone];
  const { data: todayReservations = [] } = useQuery({
    queryKey: todayKey,
    enabled: !!currentOrganizationId,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { from, to } = zonedDayRange(upcomingDates(timezone, 1)[0], timezone);
      const { data, error } = await insforge.database
        .from("reservations")
        .select("*, customers(name, phone), services(name), resources(name)")
        .eq("organization_id", currentOrganizationId)
        .in("status", ["pending", "confirmed"])
        .neq("source", "walk_in")
        .gte("start_at", from)
        .lt("start_at", to)
        .order("start_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as TodayReservation[];
    }
  });

  const { data: services = [] } = useQuery({
    queryKey: ["walk-ins-services", currentOrganizationId],
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

  const { data: resources = [] } = useQuery({
    queryKey: ["walk-ins-resources", currentOrganizationId],
    enabled: !!currentOrganizationId,
    queryFn: async () => {
      const { data, error } = await insforge.database
        .from("resources")
        .select("*")
        .eq("organization_id", currentOrganizationId)
        .eq("is_active", true)
        .order("name", { ascending: true });
      if (error) throw error;
      return data as Resource[];
    }
  });

  // Las que ya llegaron están en la fila (o ya se atendieron hoy): no se repiten arriba.
  const arrivedReservationIds = new Set(walkIns.map((w) => w.reservation_id).filter(Boolean));
  const pendingArrivals = todayReservations.filter((r) => !arrivedReservationIds.has(r.id));
  const waiting = walkIns.filter((w) => w.status === "waiting");
  const inService = walkIns.filter((w) => w.status === "in_service");
  const finishedToday = walkIns.filter((w) => w.status === "done" || w.status === "left");
  const stats = walkInStats(walkIns.filter((w) => new Date(w.arrived_at) >= startOfToday()));
  const busyResourceIds = new Set(inService.map((w) => w.reservations?.resource_id).filter(Boolean));

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey });
    queryClient.invalidateQueries({ queryKey: todayKey });
  };

  const time = (iso: string) => new Date(iso).toLocaleTimeString("es-CO", { timeZone: timezone, hour: "2-digit", minute: "2-digit" });

  async function checkIn(r: TodayReservation) {
    setBusyId(r.id);
    const { error } = await insforge.database.rpc("check_in_reservation", { p_reservation_id: r.id });
    setBusyId(null);
    if (error) {
      toast.error(walkInErrorMessage(error));
      refresh();
      return;
    }
    toast.success(`${r.customer_name || r.customers?.name || "El cliente"} llegó y quedó en la fila.`);
    refresh();
  }

  async function markNoShow(r: TodayReservation) {
    if (!window.confirm(`¿Marcar que ${r.customer_name || r.customers?.name || "el cliente"} no vino?`)) return;
    setBusyId(r.id);
    const { error } = await insforge.database.from("reservations").update({ status: "no_show" }).eq("id", r.id);
    setBusyId(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    refresh();
    queryClient.invalidateQueries({ queryKey: ["reservations"] });
  }

  async function serve(walkIn: WalkIn) {
    const choice = resourceChoice[walkIn.id];
    setBusyId(walkIn.id);
    const { error } = await insforge.database.rpc("serve_walk_in", {
      p_walk_in_id: walkIn.id,
      p_resource_id: choice && choice !== NONE ? choice : null
    });
    setBusyId(null);
    if (error) {
      toast.error(walkInErrorMessage(error));
      refresh();
      return;
    }
    toast.success(`${walkIn.customer_name} pasó a atención.`);
    refresh();
    queryClient.invalidateQueries({ queryKey: ["reservations"] });
  }

  /** Finalizar (en atención) o "Atendido" directo desde la espera: complete_walk_in hace ambos. */
  async function complete(walkIn: WalkIn) {
    setBusyId(walkIn.id);
    const { data, error } = await insforge.database.rpc("complete_walk_in", { p_walk_in_id: walkIn.id });
    setBusyId(null);
    if (error) {
      toast.error(walkInErrorMessage(error));
      refresh();
      return;
    }
    const done = (data ?? walkIn) as WalkIn;
    const message = `Atención de ${walkIn.customer_name} finalizada.`;
    if (salesEnabled) {
      toast.success(message, { action: { label: "Registrar venta", onClick: () => setSaleFor({ ...walkIn, ...done }) } });
    } else {
      toast.success(message);
    }
    refresh();
    queryClient.invalidateQueries({ queryKey: ["reservations"] });
  }

  async function markReady(walkIn: WalkIn) {
    setBusyId(walkIn.id);
    const { error } = await insforge.database.from("walk_ins").update({ ready_at: new Date().toISOString() }).eq("id", walkIn.id);
    setBusyId(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(
      walkIn.notify_channel
        ? `Listo: le avisamos a ${walkIn.customer_name} por ${walkIn.notify_channel === "telegram" ? "Telegram" : "WhatsApp"}.`
        : `Listo. ${walkIn.customer_name} no pidió aviso por chat: llamalo en persona.`
    );
    refresh();
  }

  async function remove(walkIn: WalkIn) {
    if (!window.confirm(`¿Eliminar el registro de ${walkIn.customer_name}? No se puede deshacer.`)) return;
    setBusyId(walkIn.id);
    const { error } = await insforge.database.rpc("delete_walk_in", { p_walk_in_id: walkIn.id });
    setBusyId(null);
    if (error) {
      toast.error(walkInErrorMessage(error));
      return;
    }
    toast.success("Registro eliminado.");
    refresh();
    queryClient.invalidateQueries({ queryKey: ["reservations"] });
  }

  async function markLeft(walkIn: WalkIn) {
    setBusyId(walkIn.id);
    const { error } = await insforge.database
      .from("walk_ins")
      .update({ status: "left", finished_at: new Date().toISOString() })
      .eq("id", walkIn.id)
      .eq("status", "waiting");
    setBusyId(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    refresh();
  }

  const cardProps = (w: WalkIn) => ({
    walkIn: w,
    now,
    busy: busyId === w.id,
    canDelete,
    timeLabel: time,
    onComplete: () => complete(w),
    onReady: () => markReady(w),
    onEdit: () => setEditing(w),
    onDelete: () => remove(w)
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold">Atención en sitio</h1>
        <p className="text-sm text-muted-foreground">
          Recibí a quien llega (con o sin reserva), pasalo a atención y finalizalo. Cada atención queda guardada en{" "}
          {vocabulary.reservations.toLowerCase()} y en la ficha del cliente.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { icon: Hourglass, label: "Esperando", value: stats.waiting },
          { icon: UserCheck, label: "En atención", value: stats.inService },
          { icon: DoorOpen, label: "Atendidos hoy", value: stats.done },
          { icon: Clock, label: "Espera promedio", value: stats.averageWaitMinutes === null ? "—" : formatWait(stats.averageWaitMinutes) }
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <s.icon className="h-5 w-5" />
              </div>
              <div>
                <p className="font-display text-xl font-semibold">{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {currentOrganizationId && (
        <WalkInRegisterForm organizationId={currentOrganizationId} services={services} showPartySize={showPartySize} onRegistered={refresh} />
      )}

      {pendingArrivals.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarCheck className="h-5 w-5 text-primary" /> {vocabulary.reservations} de hoy ({pendingArrivals.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="divide-y divide-border">
            {pendingArrivals.map((r) => {
              const late = new Date(r.start_at).getTime() < now.getTime() - 15 * 60_000;
              return (
                <div key={r.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center">
                  <span className={`w-24 shrink-0 whitespace-nowrap font-display text-base font-semibold tabular-nums ${late ? "text-destructive" : ""}`}>
                    {time(r.start_at)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{r.customer_name || r.customers?.name || "Cliente"}</p>
                    <p className="text-sm text-muted-foreground">
                      {[r.services?.name, r.party_size ? `${r.party_size} personas` : null, r.resources?.name, r.special_requests]
                        .filter(Boolean)
                        .join(" · ") || "Sin detalles"}
                      {late && <span className="text-destructive"> · Atrasado</span>}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => checkIn(r)} disabled={busyId === r.id}>
                      Llegó
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => markNoShow(r)} disabled={busyId === r.id}>
                      No vino
                    </Button>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {isError ? (
        <QueryErrorState onRetry={() => refetch()} message="No se pudo cargar la fila de atención." />
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>En espera ({waiting.length})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {waiting.length === 0 && <p className="text-sm text-muted-foreground">No hay nadie esperando.</p>}
              {waiting.map((w, index) => (
                <WalkInCard
                  key={w.id}
                  {...cardProps(w)}
                  position={index + 1}
                  onServe={() => serve(w)}
                  onLeft={() => markLeft(w)}
                  resourceSelect={
                    resources.length > 0 && (
                      <Select
                        value={resourceChoice[w.id] ?? w.reservations?.resource_id ?? NONE}
                        onValueChange={(v) => setResourceChoice({ ...resourceChoice, [w.id]: v })}
                      >
                        <SelectTrigger className="w-40" aria-label={`Recurso para ${w.customer_name}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE}>Sin asignar</SelectItem>
                          {resources.map((r) => (
                            <SelectItem key={r.id} value={r.id} disabled={busyResourceIds.has(r.id)}>
                              {r.name}
                              {busyResourceIds.has(r.id) ? " (ocupado)" : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )
                  }
                />
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>En atención ({inService.length})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {inService.length === 0 && <p className="text-sm text-muted-foreground">Nadie en atención ahora.</p>}
              {inService.map((w) => (
                <WalkInCard key={w.id} {...cardProps(w)} />
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {finishedToday.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Hoy ({finishedToday.length})</CardTitle>
          </CardHeader>
          <CardContent className="divide-y divide-border">
            {finishedToday.map((w) => (
              <div key={w.id} className="flex items-center gap-3 py-2 text-sm">
                <span className="flex-1 font-medium">{w.customer_name}</span>
                <span className="hidden text-muted-foreground sm:inline">{w.services?.name ?? "—"}</span>
                <span className="text-muted-foreground">{time(w.arrived_at)}</span>
                <Badge variant={w.status === "done" ? "success" : "muted"}>{w.status === "done" ? "Atendido" : "Se fue"}</Badge>
                <Button size="icon" variant="ghost" title="Editar registro" aria-label={`Editar el registro de ${w.customer_name}`} onClick={() => setEditing(w)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                {salesEnabled && w.status === "done" && (
                  <Button size="icon" variant="ghost" title="Registrar venta" aria-label={`Registrar venta de ${w.customer_name}`} onClick={() => setSaleFor(w)}>
                    <Wallet className="h-4 w-4" />
                  </Button>
                )}
                {canDelete && (
                  <Button
                    size="icon"
                    variant="ghost"
                    title="Eliminar registro"
                    aria-label={`Eliminar el registro de ${w.customer_name}`}
                    disabled={busyId === w.id}
                    onClick={() => remove(w)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <WalkInEditDialog walkIn={editing} services={services} showPartySize={showPartySize} onClose={() => setEditing(null)} onSaved={refresh} />
      {currentOrganizationId && (
        <PaymentDialog
          open={!!saleFor}
          onOpenChange={(open) => !open && setSaleFor(null)}
          organizationId={currentOrganizationId}
          title="Registrar venta"
          draft={
            saleFor
              ? {
                  serviceId: saleFor.service_id,
                  customerId: saleFor.customer_id,
                  reservationId: saleFor.reservation_id,
                  concept: saleFor.services?.name ?? null
                }
              : {}
          }
        />
      )}
    </div>
  );
}
