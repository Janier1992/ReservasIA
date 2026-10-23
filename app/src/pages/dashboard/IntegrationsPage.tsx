import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { CalendarDays, MessageCircle, Send } from "lucide-react";
import { insforge } from "@/lib/insforgeClient";
import { functionsClient } from "@/lib/functionsClient";
import { env } from "@/lib/env";
import { useOrganization } from "@/hooks/useOrganization";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { QueryErrorState } from "@/components/QueryErrorState";

interface IntegrationRow {
  provider: "twilio" | "google_calendar" | "telegram" | "ycloud";
  status: "connected" | "disconnected" | "error";
  metadata: Record<string, unknown>;
  connected_at: string | null;
}

export function IntegrationsPage() {
  const { currentOrganizationId } = useOrganization();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [twilioForm, setTwilioForm] = useState({ accountSid: "", authToken: "", whatsappNumber: "" });
  const [telegramToken, setTelegramToken] = useState("");
  const [ycloudForm, setYcloudForm] = useState({ apiKey: "", phoneNumber: "" });
  const [ycloudSaving, setYcloudSaving] = useState(false);

  const {
    data: integrations = [],
    isLoading,
    isError,
    refetch
  } = useQuery({
    queryKey: ["integrations-status", currentOrganizationId],
    enabled: !!currentOrganizationId,
    queryFn: async () => {
      const { data, error } = await insforge.database
        .from("integrations")
        .select("provider, status, metadata, connected_at")
        .eq("organization_id", currentOrganizationId);
      if (error) throw error;
      return (data ?? []) as IntegrationRow[];
    }
  });

  const twilio = integrations.find((i) => i.provider === "twilio");
  const google = integrations.find((i) => i.provider === "google_calendar");
  const telegram = integrations.find((i) => i.provider === "telegram");
  const ycloud = integrations.find((i) => i.provider === "ycloud");

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["integrations-status", currentOrganizationId] });

  useEffect(() => {
    const googleParam = searchParams.get("google");
    if (googleParam === "connected") {
      toast.success("Google Calendar conectado.");
      invalidate();
    } else if (googleParam === "error") {
      toast.error("No se pudo conectar Google Calendar. Intentá de nuevo.");
    }
    if (googleParam) {
      searchParams.delete("google");
      setSearchParams(searchParams, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function connectGoogle() {
    try {
      const { url } = await functionsClient.get<{ url: string }>("google-oauth-start", {
        organization_id: currentOrganizationId
      });
      window.location.href = url;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo iniciar la conexión con Google.");
    }
  }

  async function disconnectGoogle() {
    try {
      await functionsClient.post("google-disconnect", { organization_id: currentOrganizationId });
      toast.success("Google Calendar desconectado.");
      invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo desconectar Google Calendar.");
    }
  }

  async function saveTwilio() {
    try {
      await functionsClient.post("twilio-connect", { organization_id: currentOrganizationId, ...twilioForm });
      toast.success("WhatsApp conectado.");
      setTwilioForm({ accountSid: "", authToken: "", whatsappNumber: "" });
      invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo conectar WhatsApp.");
    }
  }

  async function disconnectTwilio() {
    try {
      await functionsClient.post("twilio-disconnect", { organization_id: currentOrganizationId });
      toast.success("WhatsApp desconectado.");
      invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo desconectar WhatsApp.");
    }
  }

  async function connectYCloud() {
    setYcloudSaving(true);
    try {
      const res = await functionsClient.post<{ phoneNumber: string }>("ycloud-connect", {
        organization_id: currentOrganizationId,
        apiKey: ycloudForm.apiKey,
        phoneNumber: ycloudForm.phoneNumber || undefined,
        webhookBaseUrl: env.API_URL
      });
      toast.success(`WhatsApp conectado: ${res.phoneNumber}`);
      setYcloudForm({ apiKey: "", phoneNumber: "" });
      invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo conectar WhatsApp.");
    } finally {
      setYcloudSaving(false);
    }
  }

  async function disconnectYCloud() {
    try {
      await functionsClient.post("ycloud-disconnect", { organization_id: currentOrganizationId });
      toast.success("WhatsApp desconectado. Tu número sigue funcionando normal en la app.");
      invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo desconectar WhatsApp.");
    }
  }

  async function connectTelegram() {
    try {
      const res = await functionsClient.post<{ botUsername: string | null }>("telegram-connect", {
        organization_id: currentOrganizationId,
        botToken: telegramToken
      });
      toast.success(res.botUsername ? `Telegram conectado: @${res.botUsername}` : "Telegram conectado.");
      setTelegramToken("");
      invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo conectar Telegram.");
    }
  }

  async function disconnectTelegram() {
    try {
      await functionsClient.post("telegram-disconnect", { organization_id: currentOrganizationId });
      toast.success("Telegram desconectado.");
      invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo desconectar Telegram.");
    }
  }

  if (isError) {
    return <QueryErrorState onRetry={() => refetch()} message="No se pudo cargar el estado de las integraciones." />;
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold">Integraciones</h1>
        <p className="text-sm text-muted-foreground">Conectá los canales que usa tu agente para atender clientes.</p>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div className="flex items-center gap-2">
            <Send className="h-5 w-5 text-primary" />
            <CardTitle>Telegram</CardTitle>
          </div>
          <Badge variant={telegram?.status === "connected" ? "success" : "muted"}>
            {telegram?.status === "connected" ? "Connected" : "Disconnected"}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-3">
          <CardDescription>
            Canal gratuito y sin límites: creá un bot con{" "}
            <a href="https://t.me/BotFather" target="_blank" rel="noreferrer" className="text-primary hover:underline">
              @BotFather
            </a>{" "}
            en Telegram y pegá acá el token que te da.
          </CardDescription>
          {telegram?.status === "connected" ? (
            <>
              <p className="text-sm text-muted-foreground">Bot: @{String(telegram.metadata?.bot_username ?? "—")}</p>
              <Button variant="outline" onClick={disconnectTelegram}>
                Desconectar
              </Button>
            </>
          ) : (
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                placeholder="123456789:AAExxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                value={telegramToken}
                onChange={(e) => setTelegramToken(e.target.value)}
              />
              <Button onClick={connectTelegram}>Conectar Telegram</Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-success" />
            <CardTitle>WhatsApp Business (YCloud)</CardTitle>
          </div>
          <Badge variant={ycloud?.status === "connected" ? "success" : "muted"}>
            {ycloud?.status === "connected" ? "Connected" : "Disconnected"}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-3">
          <CardDescription>
            Tu agente atiende en tu mismo número de WhatsApp, y vos seguís usando la app de WhatsApp Business en el celular. Si respondés
            vos desde la app, el agente se pausa 30 minutos en ese chat para no pisarte.
          </CardDescription>
          {ycloud?.status === "connected" ? (
            <>
              <p className="text-sm text-muted-foreground">
                Número: {String(ycloud.metadata?.display_phone_number ?? ycloud.metadata?.phone_number ?? "—")}
                {ycloud.metadata?.verified_name ? ` · ${String(ycloud.metadata.verified_name)}` : ""}
              </p>
              <Button variant="outline" onClick={disconnectYCloud}>
                Desconectar
              </Button>
            </>
          ) : (
            <>
              <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
                <li>
                  Creá tu cuenta en{" "}
                  <a href="https://www.ycloud.com" target="_blank" rel="noreferrer" className="text-primary hover:underline">
                    YCloud
                  </a>
                  .
                </li>
                <li>Conectá ahí tu número de WhatsApp Business eligiendo la opción de usarlo también en la app (coexistencia).</li>
                <li>Copiá tu API key de YCloud (Desarrolladores → API Keys) y pegala acá.</li>
              </ol>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="ycloud-key">API key de YCloud</Label>
                  <PasswordInput
                    id="ycloud-key"
                    autoComplete="off"
                    value={ycloudForm.apiKey}
                    onChange={(e) => setYcloudForm({ ...ycloudForm, apiKey: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="ycloud-phone">Número (solo si tenés varios en YCloud)</Label>
                  <Input
                    id="ycloud-phone"
                    inputMode="tel"
                    placeholder="+57 300 123 4567"
                    value={ycloudForm.phoneNumber}
                    onChange={(e) => setYcloudForm({ ...ycloudForm, phoneNumber: e.target.value })}
                  />
                </div>
              </div>
              <Button onClick={connectYCloud} disabled={!ycloudForm.apiKey.trim() || ycloudSaving}>
                {ycloudSaving ? "Conectando..." : "Conectar WhatsApp"}
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-success" />
            <CardTitle>WhatsApp (Twilio)</CardTitle>
          </div>
          <Badge variant={twilio?.status === "connected" ? "success" : "muted"}>
            {twilio?.status === "connected" ? "Connected" : "Disconnected"}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-3">
          {twilio?.status === "connected" ? (
            <>
              <p className="text-sm text-muted-foreground">Número: {String(twilio.metadata?.whatsapp_number ?? "—")}</p>
              <p className="text-sm text-muted-foreground">
                Recordatorios automáticos:{" "}
                {twilio.metadata?.reminder_template_sid
                  ? "configurados (la primera vez, Meta puede tardar hasta 24-48h en aprobar la plantilla)."
                  : "no se pudieron configurar automáticamente — contactá a soporte para activarlos."}
              </p>
              <Button variant="outline" onClick={disconnectTwilio}>
                Desconectar
              </Button>
            </>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <Label>Account SID</Label>
                <Input value={twilioForm.accountSid} onChange={(e) => setTwilioForm({ ...twilioForm, accountSid: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Auth Token</Label>
                <Input
                  type="password"
                  value={twilioForm.authToken}
                  onChange={(e) => setTwilioForm({ ...twilioForm, authToken: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>Número de WhatsApp</Label>
                <Input
                  placeholder="whatsapp:+14155238886"
                  value={twilioForm.whatsappNumber}
                  onChange={(e) => setTwilioForm({ ...twilioForm, whatsappNumber: e.target.value })}
                />
              </div>
              <Button onClick={saveTwilio} className="sm:col-span-3">
                Conectar WhatsApp
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-secondary" />
            <CardTitle>Google Calendar</CardTitle>
          </div>
          <Badge variant={google?.status === "connected" ? "success" : "muted"}>
            {google?.status === "connected" ? "Connected" : "Disconnected"}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-3">
          {google?.status === "connected" ? (
            <>
              <CardDescription>Cuenta conectada: {String(google.metadata?.email ?? "—")}</CardDescription>
              <div className="flex gap-2">
                <Button variant="outline" onClick={connectGoogle}>
                  Reconectar
                </Button>
                <Button variant="destructive" onClick={disconnectGoogle}>
                  Desconectar
                </Button>
              </div>
            </>
          ) : (
            <Button onClick={connectGoogle}>Conectar con Google</Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
