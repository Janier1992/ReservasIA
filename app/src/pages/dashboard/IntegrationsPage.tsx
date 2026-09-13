import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { CalendarDays, MessageCircle, Send } from "lucide-react";
import { insforge } from "@/lib/insforgeClient";
import { functionsClient } from "@/lib/functionsClient";
import { useOrganization } from "@/hooks/useOrganization";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

interface IntegrationRow {
  provider: "twilio" | "google_calendar" | "telegram";
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

  const { data: integrations = [], isLoading } = useQuery({
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

  if (isLoading) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Integraciones</h1>
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
