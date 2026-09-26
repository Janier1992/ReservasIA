import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Clock, DoorOpen, Hourglass, UserCheck, UserX } from "lucide-react";
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
import { formatWait, minutesBetween, walkInErrorMessage, walkInStats } from "@/lib/walkIns";
import type { Resource, Service, WalkIn } from "@/types/domain";

// Radix Select no admite un item con value "": este valor representa "sin elegir".
const NONE = "none";
const WALK_IN_SELECT = "*, services(name, duration_minutes), reservations(resource_id, resources(name))";

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function WalkInsPage() {
  const { currentOrganizationId } = useOrganization();
  const { vocabulary } = useCurrentBusinessTheme();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ name: "", phone: "", serviceId: NONE, notes: "" });
  const [saving, setSaving] = useState(false);
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

  const waiting = walkIns.filter((w) => w.status === "waiting");
  const inService = walkIns.filter((w) => w.status === "in_service");
  const finishedToday = walkIns.filter((w) => w.status === "done" || w.status === "left");
  const stats = walkInStats(walkIns.filter((w) => new Date(w.arrived_at) >= startOfToday()));
  const busyResourceIds = new Set(inService.map((w) => w.reservations?.resource_id).filter(Boolean));

  const refresh = () => queryClient.invalidateQueries({ queryKey });

  async function registerArrival(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !currentOrganizationId) return;
    setSaving(true);
    const { error } = await insforge.database.from("walk_ins").insert([
      {
        organization_id: currentOrganizationId,
        customer_name: form.name.trim(),
        customer_phone: form.phone.trim() || null,
        service_id: form.serviceId === NONE ? null : form.serviceId,
        notes: form.notes.trim() || null
      }
    ]);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`${form.name.trim()} quedó en la fila.`);
    setForm({ name: "", phone: "", serviceId: NONE, notes: "" });
    refresh();
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold">Atención en sitio</h1>
        <p className="text-sm text-muted-foreground">
          Registrá a quien llega sin cita, pasalo a atención y finalizalo. Cada atención queda guardada en {vocabulary.reservations.toLowerCase()} y en la ficha del cliente.
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
        <CardHeader>
          <CardTitle>Registrar llegada</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={registerArrival} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5 lg:items-end">
            <div className="space-y-1.5">
              <Label htmlFor="walkin-name">Nombre *</Label>
              <Input id="walkin-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="walkin-phone">Teléfono</Label>
              <Input
                id="walkin-phone"
                inputMode="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="Para guardarlo como cliente"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="walkin-service">Servicio</Label>
              <Select value={form.serviceId} onValueChange={(v) => setForm({ ...form, serviceId: v })}>
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
            <div className="space-y-1.5">
              <Label htmlFor="walkin-notes">Notas</Label>
              <Input
                id="walkin-notes"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Ej: placa, pedido especial"
              />
            </div>
            <Button type="submit" disabled={saving || !form.name.trim()}>
              Agregar a la fila
            </Button>
          </form>
        </CardContent>
      </Card>

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
                      <p className="font-medium">{w.customer_name}</p>
                      <p className="text-sm text-muted-foreground">
                        {[w.services?.name ?? "Servicio sin definir", w.notes].filter(Boolean).join(" · ")}
                      </p>
                      <p className="text-xs text-muted-foreground">Esperando: {formatWait(minutesBetween(w.arrived_at, now))}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {resources.length > 0 && (
                      <Select
                        value={resourceChoice[w.id] ?? NONE}
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
                    <p className="text-sm text-muted-foreground">
                      {[w.services?.name ?? "Servicio sin definir", w.reservations?.resources?.name, w.notes].filter(Boolean).join(" · ")}
                    </p>
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
                <span className="text-muted-foreground">
                  {new Date(w.arrived_at).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}
                </span>
                <Badge variant={w.status === "done" ? "success" : "muted"}>{w.status === "done" ? "Atendido" : "Se fue"}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
