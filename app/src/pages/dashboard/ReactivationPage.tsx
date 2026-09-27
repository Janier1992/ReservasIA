import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { MessageCircle, Send, X } from "lucide-react";
import { insforge } from "@/lib/insforgeClient";
import { functionsClient } from "@/lib/functionsClient";
import { useOrganization } from "@/hooks/useOrganization";
import { useBusinessBranding } from "@/hooks/useBusinessBranding";
import { useCurrentBusinessTheme } from "@/hooks/useBusinessTheme";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { QueryErrorState } from "@/components/QueryErrorState";
import { DEFAULT_REACTIVATION_TEMPLATE, fillReactivationTemplate, sinceLabel, whatsappLink } from "@/lib/engagement";
import type { BusinessProfile, ReactivationCandidate } from "@/types/domain";

const TEMPLATE_KEY = "reactivation-template";

function loadTemplate(orgId: string | null): string {
  try {
    return (orgId && localStorage.getItem(`${TEMPLATE_KEY}:${orgId}`)) || DEFAULT_REACTIVATION_TEMPLATE;
  } catch {
    return DEFAULT_REACTIVATION_TEMPLATE;
  }
}

export function ReactivationPage() {
  const { currentOrganizationId, currentRole, memberships } = useOrganization();
  const currentOrg = memberships.find((m) => m.organization_id === currentOrganizationId)?.organizations;
  const branding = useBusinessBranding();
  const { vocabulary } = useCurrentBusinessTheme();
  const businessName = branding?.name ?? currentOrg?.name ?? "";
  const canManage = currentRole === "owner" || currentRole === "admin";
  const queryClient = useQueryClient();
  const [template, setTemplate] = useState(() => loadTemplate(currentOrganizationId));
  const [days, setDays] = useState("45");
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    try {
      if (currentOrganizationId) localStorage.setItem(`${TEMPLATE_KEY}:${currentOrganizationId}`, template);
    } catch {
      // Sin almacenamiento local el texto vuelve al predeterminado; no es grave.
    }
  }, [template, currentOrganizationId]);

  const { data: profile } = useQuery({
    queryKey: ["business-profile", currentOrganizationId],
    enabled: !!currentOrganizationId,
    queryFn: async () => {
      const { data, error } = await insforge.database.from("business_profiles").select("*").eq("organization_id", currentOrganizationId).single();
      if (error) throw error;
      return data as BusinessProfile;
    }
  });
  useEffect(() => setDays(String(profile?.reactivation_days ?? 45)), [profile]);

  const queryKey = ["reactivation-candidates", currentOrganizationId];
  const {
    data: candidates = [],
    isError,
    isLoading,
    refetch
  } = useQuery({
    queryKey,
    enabled: !!currentOrganizationId,
    queryFn: async () => {
      const { data, error } = await insforge.database.rpc("get_reactivation_candidates", { p_organization_id: currentOrganizationId });
      if (error) throw error;
      return (data ?? []) as ReactivationCandidate[];
    }
  });

  async function record(customerId: string, channel: "whatsapp_link" | "chat" | "dismissed") {
    const { error } = await insforge.database
      .from("reactivation_contacts")
      .insert([{ organization_id: currentOrganizationId, customer_id: customerId, channel }]);
    if (error) {
      toast.error(error.message);
      return false;
    }
    // Sale de la lista al instante; la base lo confirma en el próximo refetch.
    queryClient.setQueryData<ReactivationCandidate[]>(queryKey, (prev) => (prev ?? []).filter((c) => c.customer_id !== customerId));
    return true;
  }

  async function sendByChat(c: ReactivationCandidate) {
    if (!c.conversation_id) return;
    setBusyId(c.customer_id);
    try {
      await functionsClient.post("conversations-reply", {
        organization_id: currentOrganizationId,
        conversation_id: c.conversation_id,
        content: fillReactivationTemplate(template, c.name, businessName)
      });
      await record(c.customer_id, "chat");
      toast.success(`Mensaje enviado a ${c.name || "el cliente"}.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo enviar.");
    } finally {
      setBusyId(null);
    }
  }

  async function saveDays(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(days);
    if (!Number.isInteger(n) || n < 7 || n > 365) {
      toast.error("Indicá entre 7 y 365 días.");
      return;
    }
    const { error } = await insforge.database.from("business_profiles").update({ reactivation_days: n }).eq("organization_id", currentOrganizationId);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Guardado.");
    queryClient.invalidateQueries({ queryKey: ["business-profile", currentOrganizationId] });
    refetch();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold">Recuperar clientes</h1>
        <p className="text-sm text-muted-foreground">
          {vocabulary.customers} que no vuelven hace más de {profile?.reactivation_days ?? 45} días y no tienen nada agendado. Los que más veces
          vinieron, primero.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-3">
          {isError ? (
            <QueryErrorState onRetry={() => refetch()} message="No se pudo cargar la lista." />
          ) : (
            <>
              {!isLoading && candidates.length === 0 && (
                <Card>
                  <CardContent className="p-6 text-sm text-muted-foreground">No hay clientes para recuperar ahora mismo. ¡Buena señal!</CardContent>
                </Card>
              )}
              {candidates.map((c) => {
                const text = fillReactivationTemplate(template, c.name, businessName);
                const wa = whatsappLink(c.phone, text);
                return (
                  <div key={c.customer_id} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{c.name || c.phone}</p>
                      <p className="text-sm text-muted-foreground">
                        {[
                          `Última visita ${sinceLabel(c.last_visit_at)}`,
                          `${c.visits} ${Number(c.visits) === 1 ? "visita" : "visitas"}`,
                          c.last_service_name
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                      {c.last_contacted_at && <p className="text-xs text-muted-foreground">Contactado {sinceLabel(c.last_contacted_at)}</p>}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {wa && (
                        <a
                          href={wa}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() => void record(c.customer_id, "whatsapp_link")}
                          className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90"
                        >
                          <MessageCircle className="h-4 w-4" /> WhatsApp
                        </a>
                      )}
                      {c.conversation_id && (
                        <Button size="sm" variant="outline" disabled={busyId === c.customer_id} onClick={() => sendByChat(c)}>
                          <Send className="h-4 w-4" /> Chat
                        </Button>
                      )}
                      <Button
                        size="icon"
                        variant="ghost"
                        title="Quitar de la lista por ahora"
                        aria-label={`Quitar a ${c.name || c.phone} de la lista`}
                        onClick={() => void record(c.customer_id, "dismissed")}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Mensaje</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Textarea rows={5} value={template} onChange={(e) => setTemplate(e.target.value)} aria-label="Mensaje para recuperar clientes" />
              <p className="text-xs text-muted-foreground">
                {"{nombre}"} y {"{negocio}"} se reemplazan solos. Tip: sumá un incentivo ("10% de descuento esta semana").
              </p>
              {template !== DEFAULT_REACTIVATION_TEMPLATE && (
                <Button size="sm" variant="ghost" onClick={() => setTemplate(DEFAULT_REACTIVATION_TEMPLATE)}>
                  Volver al texto sugerido
                </Button>
              )}
            </CardContent>
          </Card>

          {canManage && (
            <Card>
              <CardHeader>
                <CardTitle>¿Cuándo se considera perdido?</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={saveDays} className="flex items-end gap-2">
                  <div className="flex-1 space-y-1.5">
                    <Label htmlFor="reactivation-days">Días sin volver</Label>
                    <Input id="reactivation-days" inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} />
                  </div>
                  <Button type="submit" size="sm" className="h-10">
                    Guardar
                  </Button>
                </form>
                <p className="mt-2 text-xs text-muted-foreground">Un cliente contactado vuelve a aparecer después de este mismo plazo si no regresó.</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
