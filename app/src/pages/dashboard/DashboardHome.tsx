import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarCheck, MessageSquare, UserPlus, Bot, MessageCircle, CalendarDays, Send, TrendingUp } from "lucide-react";
import { insforge } from "@/lib/insforgeClient";
import { useOrganization } from "@/hooks/useOrganization";
import { useCurrentBusinessTheme } from "@/hooks/useBusinessTheme";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { QueryErrorState } from "@/components/QueryErrorState";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatCurrency } from "@/lib/currency";
import {
  computeNoShowRate,
  computeOccupancyByHour,
  computeRevenueByCurrency,
  computeTopService,
  type ReportReservationRow
} from "@/lib/businessReport";

function StatCard({
  icon: Icon,
  label,
  value,
  loading
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  loading?: boolean;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <div className="flex-1">
          {loading ? <Skeleton className="h-7 w-12" /> : <p className="font-display text-2xl font-semibold">{value}</p>}
          <p className="text-sm text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

const PERIOD_OPTIONS = [
  { value: "7", label: "7 días" },
  { value: "30", label: "30 días" },
  { value: "90", label: "90 días" }
];

export function DashboardHome() {
  const { currentOrganizationId, currentRole } = useOrganization();
  const [periodDays, setPeriodDays] = useState("30");
  const theme = useCurrentBusinessTheme();
  const HeroIcon = theme.icon;
  const todayLabel = new Date().toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" });

  const {
    data: stats,
    isLoading: statsLoading,
    isError: statsError,
    refetch: refetchStats
  } = useQuery({
    queryKey: ["dashboard-stats", currentOrganizationId],
    enabled: !!currentOrganizationId,
    queryFn: async () => {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date();
      endOfDay.setHours(23, 59, 59, 999);

      const [today, upcoming, pendingConversations, newCustomers, agent] = await Promise.all([
        insforge.database
          .from("reservations")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", currentOrganizationId)
          .gte("start_at", startOfDay.toISOString())
          .lte("start_at", endOfDay.toISOString())
          .in("status", ["pending", "confirmed"]),
        insforge.database
          .from("reservations")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", currentOrganizationId)
          .gt("start_at", endOfDay.toISOString())
          .in("status", ["pending", "confirmed"]),
        insforge.database
          .from("conversations")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", currentOrganizationId)
          .eq("status", "active"),
        insforge.database
          .from("customers")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", currentOrganizationId)
          .gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
        insforge.database.from("agents").select("*").eq("organization_id", currentOrganizationId).maybeSingle()
      ]);

      return {
        today: today.count ?? 0,
        upcoming: upcoming.count ?? 0,
        pendingConversations: pendingConversations.count ?? 0,
        newCustomers: newCustomers.count ?? 0,
        agentEnabled: agent.data?.enabled ?? false,
        agentName: agent.data?.name ?? "Agente"
      };
    }
  });

  const { data: integrations } = useQuery({
    queryKey: ["integrations-summary", currentOrganizationId],
    enabled: !!currentOrganizationId && (currentRole === "owner" || currentRole === "admin"),
    queryFn: async () => {
      const { data, error } = await insforge.database
        .from("integrations")
        .select("provider, status")
        .eq("organization_id", currentOrganizationId);
      if (error) throw error;
      const rows = (data ?? []) as { provider: string; status: string }[];
      return {
        telegram: { status: rows.find((r) => r.provider === "telegram")?.status ?? "disconnected" },
        twilio: { status: rows.find((r) => r.provider === "twilio")?.status ?? "disconnected" },
        google_calendar: { status: rows.find((r) => r.provider === "google_calendar")?.status ?? "disconnected" }
      };
    },
    retry: false
  });

  const {
    data: reportRows,
    isLoading: reportLoading,
    isError: reportError,
    refetch: refetchReport
  } = useQuery({
    queryKey: ["dashboard-report", currentOrganizationId, periodDays],
    enabled: !!currentOrganizationId,
    queryFn: async () => {
      const since = new Date(Date.now() - Number(periodDays) * 24 * 60 * 60 * 1000);
      const { data, error } = await insforge.database
        .from("reservations")
        .select("status, start_at, services(name, price, currency)")
        .eq("organization_id", currentOrganizationId)
        .gte("start_at", since.toISOString());
      if (error) throw error;
      return data as unknown as ReportReservationRow[];
    }
  });

  const revenueByCurrency = reportRows ? computeRevenueByCurrency(reportRows) : {};
  const topService = reportRows ? computeTopService(reportRows) : null;
  const noShowRate = reportRows ? computeNoShowRate(reportRows) : 0;
  const occupancyByHour = reportRows ? computeOccupancyByHour(reportRows) : [];
  const maxOccupancy = occupancyByHour[0]?.count ?? 0;

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-xl bg-hero px-5 py-6 text-hero-foreground sm:px-8 sm:py-7">
        <div className="relative z-10 max-w-xl space-y-1">
          <p className="text-sm font-medium capitalize opacity-80">{todayLabel}</p>
          <h1 className="font-display text-2xl font-bold leading-tight sm:text-3xl">{theme.heroTitle}</h1>
          <p className="text-sm opacity-90 sm:text-base">
            {statsLoading
              ? theme.heroSubtitle
              : `${theme.vocabulary.reservations}: ${stats?.today ?? 0} hoy · ${stats?.upcoming ?? 0} por venir`}
          </p>
        </div>
        {/* Ícono del rubro como marca de agua: identifica el negocio sin tapar el texto. */}
        <HeroIcon
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-6 right-2 h-32 w-32 opacity-15 sm:right-8 sm:h-40 sm:w-40"
          strokeWidth={1.25}
        />
      </section>

      {statsError ? (
        <QueryErrorState onRetry={() => refetchStats()} message="No se pudieron cargar las estadísticas." />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard icon={CalendarCheck} label={`${theme.vocabulary.reservations} de hoy`} value={stats?.today ?? 0} loading={statsLoading} />
          <StatCard icon={CalendarCheck} label={`${theme.vocabulary.reservations} por venir`} value={stats?.upcoming ?? 0} loading={statsLoading} />
          <StatCard icon={MessageSquare} label="Conversaciones activas" value={stats?.pendingConversations ?? 0} loading={statsLoading} />
          <StatCard icon={UserPlus} label={`${theme.vocabulary.customers} · nuevos (7 días)`} value={stats?.newCustomers ?? 0} loading={statsLoading} />
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="flex items-center gap-2">
              <Bot className="h-4 w-4" /> Agente
            </CardTitle>
            <Badge variant={stats?.agentEnabled ? "success" : "muted"}>{stats?.agentEnabled ? "Activo" : "Desactivado"}</Badge>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">{stats?.agentName ?? "Sin configurar"}</CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="flex items-center gap-2">
              <Send className="h-4 w-4" /> Telegram
            </CardTitle>
            <Badge variant={integrations?.telegram.status === "connected" ? "success" : "muted"}>
              {integrations ? (integrations.telegram.status === "connected" ? "Conectado" : "Desconectado") : "—"}
            </Badge>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">Canal gratuito</CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="flex items-center gap-2">
              <MessageCircle className="h-4 w-4" /> WhatsApp
            </CardTitle>
            <Badge variant={integrations?.twilio.status === "connected" ? "success" : "muted"}>
              {integrations ? (integrations.twilio.status === "connected" ? "Conectado" : "Desconectado") : "—"}
            </Badge>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">Vía Twilio</CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4" /> Google Calendar
            </CardTitle>
            <Badge variant={integrations?.google_calendar.status === "connected" ? "success" : "muted"}>
              {integrations ? (integrations.google_calendar.status === "connected" ? "Conectado" : "Desconectado") : "—"}
            </Badge>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">Sincronización de reservas</CardContent>
        </Card>
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Reportes</h2>
          <Tabs value={periodDays} onValueChange={setPeriodDays}>
            <TabsList>
              {PERIOD_OPTIONS.map((opt) => (
                <TabsTrigger key={opt.value} value={opt.value}>
                  {opt.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        {reportError ? (
          <QueryErrorState onRetry={() => refetchReport()} message="No se pudieron cargar los reportes." />
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <TrendingUp className="h-4 w-4" /> Ingresos (completadas)
                </CardTitle>
              </CardHeader>
              <CardContent>
                {reportLoading ? (
                  <Skeleton className="h-7 w-32" />
                ) : Object.keys(revenueByCurrency).length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sin reservas completadas en este período.</p>
                ) : (
                  <div className="space-y-1">
                    {Object.entries(revenueByCurrency).map(([currency, amount]) => (
                      <p key={currency} className="text-xl font-semibold">
                        {formatCurrency(amount, currency)}
                      </p>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Servicio más vendido</CardTitle>
              </CardHeader>
              <CardContent>
                {reportLoading ? (
                  <Skeleton className="h-7 w-32" />
                ) : topService ? (
                  <p className="text-sm">
                    <span className="text-xl font-semibold">{topService.name}</span>
                    <span className="text-muted-foreground"> · {topService.count} reserva(s)</span>
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">Sin datos suficientes todavía.</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Tasa de no-show</CardTitle>
              </CardHeader>
              <CardContent>
                {reportLoading ? (
                  <Skeleton className="h-7 w-16" />
                ) : (
                  <p className="text-xl font-semibold">{noShowRate.toFixed(0)}%</p>
                )}
                <p className="text-xs text-muted-foreground">Sobre reservas completadas + no asistió.</p>
              </CardContent>
            </Card>

            <Card className="lg:col-span-3">
              <CardHeader>
                <CardTitle className="text-base">Franjas horarias con más reservas</CardTitle>
              </CardHeader>
              <CardContent>
                {reportLoading ? (
                  <Skeleton className="h-24 w-full" />
                ) : occupancyByHour.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sin reservas en este período.</p>
                ) : (
                  <div className="space-y-2">
                    {occupancyByHour.map((slot) => (
                      <div key={slot.hour} className="flex items-center gap-3 text-sm">
                        <span className="w-14 shrink-0 text-muted-foreground">{String(slot.hour).padStart(2, "0")}:00</span>
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-primary"
                            style={{ width: `${maxOccupancy ? (slot.count / maxOccupancy) * 100 : 0}%` }}
                          />
                        </div>
                        <span className="w-6 shrink-0 text-right font-medium">{slot.count}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
