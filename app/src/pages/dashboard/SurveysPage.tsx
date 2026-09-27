import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Star } from "lucide-react";
import { insforge } from "@/lib/insforgeClient";
import { useOrganization } from "@/hooks/useOrganization";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { QueryErrorState } from "@/components/QueryErrorState";
import { ratingStats } from "@/lib/engagement";
import type { BusinessProfile, SurveyRequest } from "@/types/domain";

const PERIODS = [
  { value: "30", label: "30 días" },
  { value: "90", label: "90 días" },
  { value: "365", label: "1 año" }
];

function Stars({ value }: { value: number }) {
  return (
    <span className="inline-flex" aria-label={`${value} de 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={i <= value ? "h-3.5 w-3.5 fill-primary text-primary" : "h-3.5 w-3.5 text-border"} />
      ))}
    </span>
  );
}

export function SurveysPage() {
  const { currentOrganizationId, currentRole, memberships } = useOrganization();
  const timezone = memberships.find((m) => m.organization_id === currentOrganizationId)?.organizations.timezone ?? "UTC";
  const canManage = currentRole === "owner" || currentRole === "admin";
  const queryClient = useQueryClient();
  const [period, setPeriod] = useState("90");
  const [reviewUrl, setReviewUrl] = useState("");
  const [autoSend, setAutoSend] = useState(true);

  const { data: profile } = useQuery({
    queryKey: ["business-profile", currentOrganizationId],
    enabled: !!currentOrganizationId,
    queryFn: async () => {
      const { data, error } = await insforge.database.from("business_profiles").select("*").eq("organization_id", currentOrganizationId).single();
      if (error) throw error;
      return data as BusinessProfile;
    }
  });

  useEffect(() => {
    setReviewUrl(profile?.review_url ?? "");
    setAutoSend(profile?.survey_auto_send ?? true);
  }, [profile]);

  const {
    data: requests = [],
    isError,
    refetch
  } = useQuery({
    queryKey: ["survey-requests", currentOrganizationId, period],
    enabled: !!currentOrganizationId,
    queryFn: async () => {
      const since = new Date(Date.now() - Number(period) * 86_400_000).toISOString();
      const { data, error } = await insforge.database
        .from("survey_requests")
        .select("*, customers(name, phone)")
        .eq("organization_id", currentOrganizationId)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return data as SurveyRequest[];
    }
  });

  const stats = ratingStats(requests);
  const answered = requests.filter((r) => r.rating !== null);

  async function saveSettings(e: React.FormEvent) {
    e.preventDefault();
    const url = reviewUrl.trim();
    if (url && !/^https:\/\/\S+$/.test(url)) {
      toast.error("El enlace de reseñas tiene que empezar con https://");
      return;
    }
    const { error } = await insforge.database
      .from("business_profiles")
      .update({ review_url: url || null, survey_auto_send: autoSend })
      .eq("organization_id", currentOrganizationId);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Ajustes de opiniones guardados.");
    queryClient.invalidateQueries({ queryKey: ["business-profile", currentOrganizationId] });
  }

  const when = (iso: string) => new Date(iso).toLocaleDateString("es-CO", { timeZone: timezone, day: "numeric", month: "short" });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">Opiniones</h1>
          <p className="text-sm text-muted-foreground">Lo que dicen tus clientes después de cada atención. Pedí la opinión desde las reservas completadas.</p>
        </div>
        <Tabs value={period} onValueChange={setPeriod}>
          <TabsList>
            {PERIODS.map((p) => (
              <TabsTrigger key={p.value} value={p.value}>
                {p.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {isError ? (
        <QueryErrorState onRetry={() => refetch()} message="No se pudieron cargar las opiniones." />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              { label: "Calificación promedio", value: stats.average === null ? "—" : `${stats.average.toLocaleString("es-CO")} / 5` },
              { label: "Respuestas", value: `${stats.answered} de ${stats.sent}` },
              { label: "Tasa de respuesta", value: stats.responseRate === null ? "—" : `${stats.responseRate}%` },
              { label: "Muy contentos (4-5)", value: stats.answered ? `${Math.round((stats.promoters / stats.answered) * 100)}%` : "—" }
            ].map((k) => (
              <Card key={k.label}>
                <CardContent className="p-4">
                  <p className="font-display text-xl font-semibold">{k.value}</p>
                  <p className="text-xs text-muted-foreground">{k.label}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_20rem]">
            <Card>
              <CardHeader>
                <CardTitle>Comentarios</CardTitle>
              </CardHeader>
              <CardContent className="divide-y divide-border">
                {answered.length === 0 && <p className="text-sm text-muted-foreground">Todavía no hay respuestas en este período.</p>}
                {answered.map((r) => (
                  <div key={r.id} className="space-y-1 py-3 text-sm first:pt-0 last:pb-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{r.customers?.name || "Cliente"}</span>
                      <span className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Stars value={r.rating ?? 0} /> {r.answered_at && when(r.answered_at)}
                      </span>
                    </div>
                    {r.comment ? <p className="text-muted-foreground">{r.comment}</p> : <p className="text-xs text-muted-foreground">Sin comentario</p>}
                  </div>
                ))}
              </CardContent>
            </Card>

            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Distribución</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {([5, 4, 3, 2, 1] as const).map((n) => (
                    <div key={n} className="flex items-center gap-2 text-sm">
                      <span className="w-3 tabular-nums">{n}</span>
                      <Star className="h-3.5 w-3.5 fill-primary text-primary" />
                      <div className="h-2 flex-1 rounded-full bg-muted" aria-hidden="true">
                        <div
                          className="h-2 rounded-full bg-primary"
                          style={{ width: `${stats.answered ? (stats.distribution[n] / stats.answered) * 100 : 0}%` }}
                        />
                      </div>
                      <span className="w-6 text-right tabular-nums text-muted-foreground">{stats.distribution[n]}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>

              {canManage && (
                <Card>
                  <CardHeader>
                    <CardTitle>Ajustes</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <form onSubmit={saveSettings} className="space-y-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="review-url">Enlace de reseñas de Google</Label>
                        <Input
                          id="review-url"
                          type="url"
                          placeholder="https://g.page/r/..."
                          value={reviewUrl}
                          onChange={(e) => setReviewUrl(e.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">
                          En tu Perfil de Empresa de Google: "Pedir reseñas" → copiar enlace. Se muestra solo a quien califica 4 o 5.
                        </p>
                      </div>
                      <div className="flex items-start gap-2">
                        <Switch id="survey-auto" checked={autoSend} onCheckedChange={setAutoSend} />
                        <Label htmlFor="survey-auto" className="leading-snug">
                          Enviar la encuesta sola unas horas después de cada atención (clientes de Telegram, o de WhatsApp que escribieron en las
                          últimas 24 horas)
                        </Label>
                      </div>
                      <Button type="submit" size="sm">
                        Guardar
                      </Button>
                    </form>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
