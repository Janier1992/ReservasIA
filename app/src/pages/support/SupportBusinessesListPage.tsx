import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Send, MessageCircle, CalendarDays, Bot } from "lucide-react";
import { insforge } from "@/lib/insforgeClient";
import { Badge } from "@/components/ui/badge";
import { EmptyTableRow } from "@/components/EmptyTableRow";
import { QueryErrorState } from "@/components/QueryErrorState";
import type { Organization } from "@/types/domain";

interface BusinessRow extends Organization {
  displayName: string;
  agentEnabled: boolean | null;
  telegramConnected: boolean;
  whatsappConnected: boolean;
  googleCalendarConnected: boolean;
  reservationsLast7Days: number;
}

function ChannelDot({ connected, label, icon: Icon }: { connected: boolean; label: string; icon: React.ElementType }) {
  return (
    <span
      title={`${label}: ${connected ? "conectado" : "desconectado"}`}
      className={`inline-flex h-6 w-6 items-center justify-center rounded-md ${
        connected ? "bg-success/10 text-success" : "bg-muted text-muted-foreground/50"
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
    </span>
  );
}

export function SupportBusinessesListPage() {
  const {
    data: businesses = [],
    isLoading,
    isError,
    refetch
  } = useQuery({
    queryKey: ["support-businesses"],
    queryFn: async () => {
      const { data: orgs, error: orgsError } = await insforge.database
        .from("organizations")
        .select("*")
        .order("created_at", { ascending: false });
      if (orgsError) throw orgsError;

      const orgIds = (orgs ?? []).map((o) => o.id as string);
      if (orgIds.length === 0) return [] as BusinessRow[];

      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

      const [agentsRes, integrationsRes, reservationsRes, profilesRes] = await Promise.all([
        insforge.database.from("agents").select("organization_id, enabled").in("organization_id", orgIds),
        insforge.database.from("integrations").select("organization_id, provider, status").in("organization_id", orgIds),
        insforge.database.from("reservations").select("organization_id").in("organization_id", orgIds).gte("created_at", sevenDaysAgo),
        insforge.database.from("business_profiles").select("organization_id, name").in("organization_id", orgIds)
      ]);
      if (agentsRes.error) throw agentsRes.error;
      if (integrationsRes.error) throw integrationsRes.error;
      if (reservationsRes.error) throw reservationsRes.error;
      if (profilesRes.error) throw profilesRes.error;

      // organizations.name es el nombre interno con el que se creó la cuenta y
      // NUNCA se actualiza; el nombre real del negocio (el que el dueño edita
      // desde Configuración) vive en business_profiles.name. Mostrar el de
      // organizations acá confunde muchísimo cuando el negocio se renombró.
      const profileNameByOrg = new Map(
        (profilesRes.data ?? []).map((p: { organization_id: string; name: string | null }) => [p.organization_id, p.name])
      );
      const agentByOrg = new Map((agentsRes.data ?? []).map((a: { organization_id: string; enabled: boolean }) => [a.organization_id, a.enabled]));
      const reservationCountByOrg = new Map<string, number>();
      for (const r of (reservationsRes.data ?? []) as { organization_id: string }[]) {
        reservationCountByOrg.set(r.organization_id, (reservationCountByOrg.get(r.organization_id) ?? 0) + 1);
      }
      const integrationsByOrg = new Map<string, { provider: string; status: string }[]>();
      for (const i of (integrationsRes.data ?? []) as { organization_id: string; provider: string; status: string }[]) {
        const list = integrationsByOrg.get(i.organization_id) ?? [];
        list.push(i);
        integrationsByOrg.set(i.organization_id, list);
      }

      return ((orgs ?? []) as Organization[]).map((org) => {
        const orgIntegrations = integrationsByOrg.get(org.id) ?? [];
        return {
          ...org,
          displayName: profileNameByOrg.get(org.id) || org.name,
          agentEnabled: agentByOrg.get(org.id) ?? null,
          telegramConnected: orgIntegrations.some((i) => i.provider === "telegram" && i.status === "connected"),
          whatsappConnected: orgIntegrations.some((i) => i.provider === "twilio" && i.status === "connected"),
          googleCalendarConnected: orgIntegrations.some((i) => i.provider === "google_calendar" && i.status === "connected"),
          reservationsLast7Days: reservationCountByOrg.get(org.id) ?? 0
        } satisfies BusinessRow;
      });
    }
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Negocios registrados</h1>
        <p className="text-sm text-muted-foreground">Estado general de cada negocio en la plataforma.</p>
      </div>

      {isError ? (
        <QueryErrorState onRetry={() => refetch()} message="No se pudieron cargar los negocios." />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Negocio</th>
                <th className="px-4 py-3">Rubro</th>
                <th className="px-4 py-3">Alta</th>
                <th className="px-4 py-3">Cuenta</th>
                <th className="px-4 py-3">Agente</th>
                <th className="px-4 py-3">Canales</th>
                <th className="px-4 py-3">Reservas (7 días)</th>
              </tr>
            </thead>
            <tbody>
              {businesses.map((b) => (
                <tr key={b.id} className="border-b border-border last:border-0 hover:bg-muted/50">
                  <td className="px-4 py-3 font-medium">
                    <Link to={`/soporte/negocios/${b.id}`} className="hover:underline">
                      {b.displayName}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{b.business_type}</td>
                  <td className="px-4 py-3 text-muted-foreground">{new Date(b.created_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    <Badge variant={b.status === "active" ? "success" : "destructive"}>
                      {b.status === "active" ? "Activa" : b.status === "suspended" ? "Suspendida" : "Cancelada"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={b.agentEnabled ? "success" : "muted"}>{b.agentEnabled ? "Activo" : "Pausado"}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1.5">
                      <ChannelDot connected={b.telegramConnected} label="Telegram" icon={Send} />
                      <ChannelDot connected={b.whatsappConnected} label="WhatsApp" icon={MessageCircle} />
                      <ChannelDot connected={b.googleCalendarConnected} label="Google Calendar" icon={CalendarDays} />
                    </div>
                  </td>
                  <td className="px-4 py-3">{b.reservationsLast7Days}</td>
                </tr>
              ))}
              {!isLoading && businesses.length === 0 && <EmptyTableRow colSpan={7} message="No hay negocios registrados todavía." />}
            </tbody>
          </table>
        </div>
      )}

      {!isLoading && businesses.length > 0 && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Bot className="h-3.5 w-3.5" /> Click en un negocio para ver el detalle y las acciones de soporte.
        </p>
      )}
    </div>
  );
}
