import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarCheck, Clock, DoorOpen, Hourglass, UserCheck, UserX } from "lucide-react";
import { insforge } from "@/lib/insforgeClient";
import { useOrganization } from "@/hooks/useOrganization";
import { useCurrentBusinessTheme } from "@/hooks/useBusinessTheme";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { QueryErrorState } from "@/components/QueryErrorState";
import { VoiceIntakeButton, type VoiceFields } from "@/components/VoiceIntakeButton";
import { formatWait, minutesBetween, walkInErrorMessage, walkInStats } from "@/lib/walkIns";
import { zonedDayRange } from "@/lib/payments";
import { upcomingDates } from "@/lib/publicBookingUtils";
import type { Reservation, Resource, Service, WalkIn } from "@/types/domain";

// Radix Select no admite un item con value "": este valor representa "sin elegir".
const NONE = "none";
const WALK_IN_SELECT = "*, services(name, duration_minutes), reservations(resource_id, start_at, source, resources(name))";
// Segundos antes de registrar solo lo que se dictó (se puede cancelar o corregir).
const AUTO_SUBMIT_SECONDS = 3;

type TodayReservation = Reservation;

const EMPTY_FORM = { name: "", phone: "", serviceId: NONE, notes: "", partySize: "" };

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function WalkInsPage() {
  const { currentOrganizationId, memberships } = useOrganization();
  const currentOrg = memberships.find((m) => m.organization_id === currentOrganizationId)?.organizations;
  const timezone = currentOrg?.timezone ?? "UTC";
  const showPartySize = currentOrg?.business_type === "restaurant";
  const { vocabulary } = useCurrentBusinessTheme();
  const queryClient = useQueryClient();
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [resourceChoice, setResourceChoice] = useState<Record<string, string>>({});
  const [now, setNow] = useState(() => new Date());
  const [countdown, setCountdown] = useState<number | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  // Refresca los tiempos de espera sin volver a pedir datos.
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);

  // Cuenta regresiva del registro automático después de dictar.
  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) {
      setCountdown(null);
      formRef.current?.requestSubmit();
      return;
    }
    const t = setTimeout(() => setCountdown(countdown - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

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

  function applyVoice(fields: VoiceFields) {
    setForm((prev) => ({
      name: fields.customer_name ?? prev.name,
      phone: fields.phone ?? prev.phone,
      serviceId: fields.service_id ?? prev.serviceId,
      notes: fields.notes ?? prev.notes,
      partySize: fields.party_size ? String(fields.party_size) : prev.partySize
    }));
    if (fields.customer_name) {
      setCountdown(AUTO_SUBMIT_SECONDS);
    } else {
      toast.info("No se entendió el nombre. Completalo y tocá Agregar a la fila.");
    }
  }

  function updateForm(patch: Partial<typeof EMPTY_FORM>) {
    // Si alguien corrige un campo, el registro automático espera a que confirme.
    setCountdown(null);
    setForm((prev) => ({ ...prev, ...patch }));
  }

  async function registerArrival(e: React.FormEvent) {
    e.preventDefault();
    setCountdown(null);
    if (!form.name.trim() || !currentOrganizationId) return;
    const party = form.partySize.trim() ? Number(form.partySize) : null;
    if (party !== null && (!Number.isInteger(party) || party < 1 || party > 200)) {
      toast.error("El número de personas no es válido.");
      return;
    }
    setSaving(true);
    const { error } = await insforge.database.from("walk_ins").insert([
      {
        organization_id: currentOrganizationId,
        customer_name: form.name.trim(),
        customer_phone: form.phone.trim() || null,
        service_id: form.serviceId === NONE ? null : form.serviceId,
        notes: form.notes.trim() || null,
        party_size: party
      }
    ]);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`${form.name.trim()} quedó en la fila.`);
    setForm(EMPTY_FORM);
    refresh();
  }

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

  async function finish(walkIn: WalkIn) {
    setBusyId(walkIn.id);
    const { error } = await insforge.database.rpc("finish_walk_in", { p_walk_in_id: walkIn.id });
    setBusyId(null);
    if (error) {
      toast.error(walkInErrorMessage(error));
      refresh();
      return;
    }
    toast.success(`Atención de ${walkIn.customer_name} finalizada.`);
    refresh();
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

  const detail = (w: WalkIn) =>
    [w.services?.name ?? "Servicio sin definir", w.party_size ? `${w.party_size} personas` : null, w.reservations?.resources?.name, w.notes]
      .filter(Boolean)
      .join(" · ");

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

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
          <CardTitle>Registrar llegada sin reserva</CardTitle>
          {currentOrganizationId && <VoiceIntakeButton organizationId={currentOrganizationId} onResult={applyVoice} />}
        </CardHeader>
        <CardContent>
          <form
            ref={formRef}
            onSubmit={registerArrival}
            className={`grid grid-cols-1 gap-3 sm:grid-cols-2 lg:items-end ${showPartySize ? "lg:grid-cols-6" : "lg:grid-cols-5"}`}
          >
            <div className="space-y-1.5">
              <Label htmlFor="walkin-name">Nombre *</Label>
              <Input id="walkin-name" value={form.name} onChange={(e) => updateForm({ name: e.target.value })} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="walkin-phone">Teléfono</Label>
              <Input
                id="walkin-phone"
                inputMode="tel"
                value={form.phone}
                onChange={(e) => updateForm({ phone: e.target.value })}
                placeholder="Para guardarlo como cliente"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="walkin-service">Servicio</Label>
              <Select value={form.serviceId} onValueChange={(v) => updateForm({ serviceId: v })}>
                <SelectTrigger id="walkin-service">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Sin definir</SelectItem>
                  {services.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name} · {s.duration_minutes} min
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {showPartySize && (
              <div className="space-y-1.5">
                <Label htmlFor="walkin-party">Personas</Label>
                <Input id="walkin-party" inputMode="numeric" value={form.partySize} onChange={(e) => updateForm({ partySize: e.target.value })} />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="walkin-notes">Notas</Label>
              <Input
                id="walkin-notes"
                value={form.notes}
                onChange={(e) => updateForm({ notes: e.target.value })}
                placeholder="Ej: placa, pedido especial"
              />
            </div>
            {countdown !== null ? (
              <div className="flex gap-2">
                <Button type="submit" className="flex-1" disabled={saving}>
                  Registrando en {countdown}…
                </Button>
                <Button type="button" variant="ghost" onClick={() => setCountdown(null)}>
                  Cancelar
                </Button>
              </div>
            ) : (
              <Button type="submit" disabled={saving || !form.name.trim()}>
                Agregar a la fila
              </Button>
            )}
          </form>
        </CardContent>
      </Card>

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
                <div key={w.id} className="flex flex-col gap-3 rounded-lg border border-border p-3 sm:flex-row sm:items-center">
                  <div className="flex flex-1 items-start gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary font-semibold text-primary-foreground">
                      {index + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 font-medium">
                        {w.customer_name}
                        {w.reservations && w.reservations.source !== "walk_in" && (
                          <Badge variant="default">Reserva {time(w.reservations.start_at)}</Badge>
                        )}
                      </p>
                      <p className="text-sm text-muted-foreground">{detail(w)}</p>
                      <p className="text-xs text-muted-foreground">Esperando: {formatWait(minutesBetween(w.arrived_at, now))}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {resources.length > 0 && (
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
                    )}
                    <Button size="sm" onClick={() => serve(w)} disabled={busyId === w.id}>
                      Atender
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => markLeft(w)}
                      disabled={busyId === w.id}
                      title="Se fue sin ser atendido"
                      aria-label={`${w.customer_name} se fue sin ser atendido`}
                    >
                      <UserX className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
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
                <div key={w.id} className="flex flex-col gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{w.customer_name}</p>
                    <p className="text-sm text-muted-foreground">{detail(w)}</p>
                    {w.served_at && (
                      <p className="text-xs text-muted-foreground">En atención hace {formatWait(minutesBetween(w.served_at, now))}</p>
                    )}
                  </div>
                  <Button size="sm" onClick={() => finish(w)} disabled={busyId === w.id}>
                    Finalizar
                  </Button>
                </div>
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
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
