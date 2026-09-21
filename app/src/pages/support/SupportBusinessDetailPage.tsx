import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Trash2 } from "lucide-react";
import { insforge } from "@/lib/insforgeClient";
import { useAuth } from "@/hooks/useAuth";
import { useSupportStaff } from "@/hooks/useSupportStaff";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { EmptyTableRow } from "@/components/EmptyTableRow";
import { QueryErrorState } from "@/components/QueryErrorState";
import { reservationStatusLabel, reservationStatusVariant } from "@/lib/reservationStatus";
import { paymentStatusLabel, paymentStatusVariant } from "@/lib/paymentStatus";
import type { AgentConfig, BusinessProfile, Conversation, Organization, Reservation, SupportNote } from "@/types/domain";

const ORG_STATUS_LABEL: Record<Organization["status"], string> = {
  active: "Activo",
  suspended: "Suspendido",
  cancelled: "Cancelado"
};

const PROVIDER_LABEL: Record<string, string> = {
  telegram: "Telegram",
  twilio: "WhatsApp (Twilio)",
  google_calendar: "Google Calendar"
};

export function SupportBusinessDetailPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const { user } = useAuth();
  const { role: supportRole } = useSupportStaff();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [noteDraft, setNoteDraft] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const {
    data: org,
    isError: orgError,
    refetch: refetchOrg
  } = useQuery({
    queryKey: ["support-business-org", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await insforge.database.from("organizations").select("*").eq("id", orgId).maybeSingle();
      if (error) throw error;
      return data as Organization | null;
    }
  });

  const { data: profile } = useQuery({
    queryKey: ["support-business-profile", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await insforge.database.from("business_profiles").select("*").eq("organization_id", orgId).maybeSingle();
      if (error) throw error;
      return data as BusinessProfile | null;
    }
  });

  const { data: agent, refetch: refetchAgent } = useQuery({
    queryKey: ["support-business-agent", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await insforge.database.from("agents").select("*").eq("organization_id", orgId).maybeSingle();
      if (error) throw error;
      return data as AgentConfig | null;
    }
  });

  const { data: integrations = [] } = useQuery({
    queryKey: ["support-business-integrations", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await insforge.database.from("integrations").select("provider, status, connected_at").eq("organization_id", orgId);
      if (error) throw error;
      return data as { provider: string; status: string; connected_at: string | null }[];
    }
  });

  const { data: reservations = [] } = useQuery({
    queryKey: ["support-business-reservations", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await insforge.database
        .from("reservations")
        .select("*")
        .eq("organization_id", orgId)
        .order("start_at", { ascending: false })
        .limit(15);
      if (error) throw error;
      return data as Reservation[];
    }
  });

  const { data: conversations = [] } = useQuery({
    queryKey: ["support-business-conversations", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await insforge.database
        .from("conversations")
        .select("*, customers(name, phone)")
        .eq("organization_id", orgId)
        .order("updated_at", { ascending: false })
        .limit(15);
      if (error) throw error;
      return data as Conversation[];
    }
  });

  const {
    data: notes = [],
    refetch: refetchNotes
  } = useQuery({
    queryKey: ["support-notes", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await insforge.database
        .from("support_notes")
        .select("*")
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as SupportNote[];
    }
  });

  async function toggleAgent() {
    if (!agent) return;
    const { error } = await insforge.database.from("agents").update({ enabled: !agent.enabled }).eq("organization_id", orgId);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(agent.enabled ? "Agente pausado." : "Agente reactivado.");
    refetchAgent();
    queryClient.invalidateQueries({ queryKey: ["support-businesses"] });
  }

  async function toggleOrgStatus() {
    if (!org || !orgId) return;
    const nextStatus = org.status === "active" ? "suspended" : "active";
    setUpdatingStatus(true);
    const { error } = await insforge.database.from("organizations").update({ status: nextStatus }).eq("id", orgId);
    setUpdatingStatus(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(nextStatus === "suspended" ? "Negocio suspendido: el dueño y el agente quedan bloqueados." : "Negocio reactivado.");
    refetchOrg();
    queryClient.invalidateQueries({ queryKey: ["support-businesses"] });
  }

  async function deleteOrganization() {
    if (!org || !orgId) return;
    const confirmed = window.confirm(
      `¿Eliminar PERMANENTEMENTE "${org.name}"? Esto borra todas sus reservas, clientes, conversaciones y configuración. No se puede deshacer.`
    );
    if (!confirmed) return;

    setDeleting(true);
    const { error } = await insforge.database.from("organizations").delete().eq("id", orgId);
    setDeleting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Negocio eliminado.");
    queryClient.invalidateQueries({ queryKey: ["support-businesses"] });
    navigate("/soporte", { replace: true });
  }

  async function addNote() {
    if (!noteDraft.trim() || !orgId || !user) return;
    setSavingNote(true);
    const { error } = await insforge.database.from("support_notes").insert([{ organization_id: orgId, author_user_id: user.id, note: noteDraft.trim() }]);
    setSavingNote(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setNoteDraft("");
    refetchNotes();
  }

  if (orgError) {
    return <QueryErrorState onRetry={() => refetchOrg()} message="No se pudo cargar este negocio." />;
  }

  return (
    <div className="space-y-6">
      <Link to="/soporte" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Volver a negocios
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold">{org?.name ?? "Cargando..."}</h1>
            {org && <Badge variant={org.status === "active" ? "success" : "destructive"}>{ORG_STATUS_LABEL[org.status]}</Badge>}
          </div>
          <p className="text-sm text-muted-foreground">
            {org?.business_type} · Alta {org ? new Date(org.created_at).toLocaleDateString() : "—"}
          </p>
        </div>
        {org && org.status !== "cancelled" && (
          <Button variant={org.status === "active" ? "destructive" : "outline"} size="sm" onClick={toggleOrgStatus} disabled={updatingStatus}>
            {org.status === "active" ? "Suspender negocio" : "Reactivar negocio"}
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Agente</CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant={agent?.enabled ? "success" : "muted"}>{agent?.enabled ? "Activo" : "Pausado"}</Badge>
              <Switch checked={!!agent?.enabled} onCheckedChange={toggleAgent} disabled={!agent} />
            </div>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">{agent?.name ?? "Sin configurar"}</CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Contacto y perfil</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-2 text-sm">
            <p>
              <span className="text-muted-foreground">Teléfono: </span>
              {profile?.phone || "—"}
            </p>
            <p>
              <span className="text-muted-foreground">Email: </span>
              {profile?.email || "—"}
            </p>
            <p className="col-span-2">
              <span className="text-muted-foreground">Dirección: </span>
              {profile?.address || "—"}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Integraciones</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          {["telegram", "twilio", "google_calendar"].map((provider) => {
            const row = integrations.find((i) => i.provider === provider);
            const connected = row?.status === "connected";
            return (
              <div key={provider} className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
                <Badge variant={connected ? "success" : "muted"}>{connected ? "Conectado" : "Desconectado"}</Badge>
                {PROVIDER_LABEL[provider]}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Reservas recientes</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-2">Fecha</th>
                  <th className="px-4 py-2">Cliente</th>
                  <th className="px-4 py-2">Estado</th>
                  <th className="px-4 py-2">Pago</th>
                </tr>
              </thead>
              <tbody>
                {reservations.map((r) => (
                  <tr key={r.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2">{new Date(r.start_at).toLocaleString()}</td>
                    <td className="px-4 py-2">{r.customer_name || "—"}</td>
                    <td className="px-4 py-2">
                      <Badge variant={reservationStatusVariant(r.status)}>{reservationStatusLabel(r.status)}</Badge>
                    </td>
                    <td className="px-4 py-2">
                      <Badge variant={paymentStatusVariant(r.payment_status)}>{paymentStatusLabel(r.payment_status)}</Badge>
                    </td>
                  </tr>
                ))}
                {reservations.length === 0 && <EmptyTableRow colSpan={4} message="Sin reservas todavía." />}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Conversaciones recientes</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-2">Cliente</th>
                  <th className="px-4 py-2">Canal</th>
                  <th className="px-4 py-2">Estado</th>
                  <th className="px-4 py-2">Actualizada</th>
                </tr>
              </thead>
              <tbody>
                {conversations.map((c) => (
                  <tr key={c.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2">{c.customers?.name || c.customers?.phone || "—"}</td>
                    <td className="px-4 py-2 capitalize">{c.channel}</td>
                    <td className="px-4 py-2">
                      <Badge variant={c.status === "active" ? "success" : "muted"}>{c.status}</Badge>
                    </td>
                    <td className="px-4 py-2">{new Date(c.updated_at).toLocaleString()}</td>
                  </tr>
                ))}
                {conversations.length === 0 && <EmptyTableRow colSpan={4} message="Sin conversaciones todavía." />}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Notas internas de soporte</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">Solo visibles para el equipo de soporte — el negocio nunca las ve.</p>
          <div className="space-y-2">
            {notes.map((n) => (
              <div key={n.id} className="rounded-md border border-border p-3 text-sm">
                <p>{n.note}</p>
                <p className="mt-1 text-xs text-muted-foreground">{new Date(n.created_at).toLocaleString()}</p>
              </div>
            ))}
            {notes.length === 0 && <p className="text-sm text-muted-foreground">Sin notas todavía.</p>}
          </div>
          <div className="space-y-2">
            <Textarea
              placeholder="Ej: llamó el 19/09 por problema con Telegram, se resolvió reconectando el bot."
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
            />
            <Button size="sm" onClick={addNote} disabled={savingNote || !noteDraft.trim()}>
              Agregar nota
            </Button>
          </div>
        </CardContent>
      </Card>

      {supportRole === "admin" && (
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="text-base text-destructive">Zona de peligro</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              Elimina el negocio y TODA su data (reservas, clientes, conversaciones, configuración) de forma permanente.
            </p>
            <Button variant="destructive" size="sm" onClick={deleteOrganization} disabled={deleting || !org}>
              <Trash2 className="h-4 w-4" /> Eliminar negocio
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
