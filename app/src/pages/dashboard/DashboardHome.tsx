import { useQuery } from "@tanstack/react-query";
import { CalendarCheck, MessageSquare, UserPlus, Bot, MessageCircle, CalendarDays, Send } from "lucide-react";
import { insforge } from "@/lib/insforgeClient";
import { useOrganization } from "@/hooks/useOrganization";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { QueryErrorState } from "@/components/QueryErrorState";

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
          {loading ? <Skeleton className="h-7 w-12" /> : <p className="text-2xl font-semibold">{value}</p>}
          <p className="text-sm text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export function DashboardHome() {
  const { currentOrganizationId, currentRole } = useOrganization();

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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Resumen</h1>
        <p className="text-sm text-muted-foreground">Estado general de tu negocio.</p>
      </div>

      {statsError ? (
        <QueryErrorState onRetry={() => refetchStats()} message="No se pudieron cargar las estadísticas." />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard icon={CalendarCheck} label="Reservas de hoy" value={stats?.today ?? 0} loading={statsLoading} />
          <StatCard icon={CalendarCheck} label="Reservas próximas" value={stats?.upcoming ?? 0} loading={statsLoading} />
          <StatCard icon={MessageSquare} label="Conversaciones activas" value={stats?.pendingConversations ?? 0} loading={statsLoading} />
          <StatCard icon={UserPlus} label="Clientes nuevos (7 días)" value={stats?.newCustomers ?? 0} loading={statsLoading} />
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
    </div>
  );
}
