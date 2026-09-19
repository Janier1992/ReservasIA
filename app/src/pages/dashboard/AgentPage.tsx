import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Send, Trash2 } from "lucide-react";
import { insforge } from "@/lib/insforgeClient";
import { functionsClient } from "@/lib/functionsClient";
import { useOrganization } from "@/hooks/useOrganization";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { QueryErrorState } from "@/components/QueryErrorState";
import type { AgentConfig, AgentRule } from "@/types/domain";

export function AgentPage() {
  const { currentOrganizationId } = useOrganization();
  const queryClient = useQueryClient();
  const [draftConfig, setDraftConfig] = useState<AgentConfig | null>(null);
  const [newRule, setNewRule] = useState({ name: "", instruction: "" });
  const [chatInput, setChatInput] = useState("");
  const [chatLog, setChatLog] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [sending, setSending] = useState(false);

  const {
    data: config,
    isError: configError,
    refetch: refetchConfig
  } = useQuery({
    queryKey: ["agent-config", currentOrganizationId],
    enabled: !!currentOrganizationId,
    queryFn: async () => {
      const { data, error } = await insforge.database.from("agents").select("*").eq("organization_id", currentOrganizationId).single();
      if (error) throw error;
      return data as AgentConfig;
    }
  });

  useEffect(() => setDraftConfig(config ?? null), [config]);

  const { data: rules = [] } = useQuery({
    queryKey: ["agent-rules", currentOrganizationId],
    enabled: !!currentOrganizationId,
    queryFn: async () => {
      const { data, error } = await insforge.database
        .from("agent_rules")
        .select("*")
        .eq("organization_id", currentOrganizationId)
        .order("priority", { ascending: true });
      if (error) throw error;
      return data as AgentRule[];
    }
  });

  async function saveConfig() {
    if (!draftConfig) return;
    const { error } = await insforge.database
      .from("agents")
      .update({
        name: draftConfig.name,
        language: draftConfig.language,
        tone: draftConfig.tone,
        system_instructions: draftConfig.system_instructions,
        enabled: draftConfig.enabled,
        booking_enabled: draftConfig.booking_enabled,
        cancellation_enabled: draftConfig.cancellation_enabled,
        rescheduling_enabled: draftConfig.rescheduling_enabled
      })
      .eq("id", draftConfig.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Configuración guardada.");
    queryClient.invalidateQueries({ queryKey: ["agent-config", currentOrganizationId] });
  }

  async function addRule() {
    if (!newRule.name.trim() || !newRule.instruction.trim() || !currentOrganizationId) return;
    const { error } = await insforge.database.from("agent_rules").insert([
      {
        organization_id: currentOrganizationId,
        name: newRule.name.trim(),
        instruction: newRule.instruction.trim(),
        priority: rules.length * 10
      }
    ]);
    if (error) {
      toast.error(error.message);
      return;
    }
    setNewRule({ name: "", instruction: "" });
    queryClient.invalidateQueries({ queryKey: ["agent-rules", currentOrganizationId] });
  }

  async function removeRule(id: string) {
    await insforge.database.from("agent_rules").delete().eq("id", id);
    queryClient.invalidateQueries({ queryKey: ["agent-rules", currentOrganizationId] });
  }

  async function sendPreviewMessage() {
    if (!chatInput.trim() || !currentOrganizationId) return;
    const message = chatInput.trim();
    setChatLog((prev) => [...prev, { role: "user", content: message }]);
    setChatInput("");
    setSending(true);
    try {
      const res = await functionsClient.post<{ reply: string | null }>("agent-preview", {
        organization_id: currentOrganizationId,
        message
      });
      setChatLog((prev) => [...prev, { role: "assistant", content: res.reply ?? "(El agente está desactivado)" }]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo consultar al agente.");
    } finally {
      setSending(false);
    }
  }

  if (configError) {
    return <QueryErrorState onRetry={() => refetchConfig()} message="No se pudo cargar la configuración del agente." />;
  }

  if (!draftConfig) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <div>
          <h1 className="text-2xl font-semibold">Agente de IA</h1>
          <p className="text-sm text-muted-foreground">Personalizá el comportamiento de tu asistente virtual.</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Configuración general</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <Label>Agente activado</Label>
              <Switch checked={draftConfig.enabled} onCheckedChange={(v) => setDraftConfig({ ...draftConfig, enabled: v })} />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Nombre del agente</Label>
                <Input value={draftConfig.name} onChange={(e) => setDraftConfig({ ...draftConfig, name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Tono</Label>
                <Select value={draftConfig.tone} onValueChange={(v) => setDraftConfig({ ...draftConfig, tone: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="friendly">Amable</SelectItem>
                    <SelectItem value="formal">Formal</SelectItem>
                    <SelectItem value="casual">Casual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Instrucciones personalizadas del negocio</Label>
              <Textarea
                value={draftConfig.system_instructions ?? ""}
                onChange={(e) => setDraftConfig({ ...draftConfig, system_instructions: e.target.value })}
                placeholder="Ej: Siempre ofrecé el especial del día."
              />
              <p className="text-xs text-muted-foreground">
                Estas instrucciones se agregan después de las reglas críticas del sistema (no pueden contradecirlas).
              </p>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Permitir crear reservas</Label>
                <Switch checked={draftConfig.booking_enabled} onCheckedChange={(v) => setDraftConfig({ ...draftConfig, booking_enabled: v })} />
              </div>
              <div className="flex items-center justify-between">
                <Label>Permitir cancelaciones</Label>
                <Switch
                  checked={draftConfig.cancellation_enabled}
                  onCheckedChange={(v) => setDraftConfig({ ...draftConfig, cancellation_enabled: v })}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label>Permitir reprogramaciones</Label>
                <Switch
                  checked={draftConfig.rescheduling_enabled}
                  onCheckedChange={(v) => setDraftConfig({ ...draftConfig, rescheduling_enabled: v })}
                />
              </div>
            </div>
            <Button onClick={saveConfig}>Guardar cambios</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Reglas adicionales del negocio</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Las 20 reglas críticas de reservas (confirmación explícita, no inventar horarios, etc.) están siempre activas y no
              pueden desactivarse desde acá.
            </p>
            {rules.map((r) => (
              <div key={r.id} className="flex items-start justify-between gap-2 rounded-md border border-border p-2">
                <div>
                  <p className="text-sm font-medium">{r.name}</p>
                  <p className="text-xs text-muted-foreground">{r.instruction}</p>
                </div>
                <Button variant="ghost" size="icon" onClick={() => removeRule(r.id)} title="Eliminar regla" aria-label="Eliminar regla">
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input placeholder="Nombre de la regla" value={newRule.name} onChange={(e) => setNewRule({ ...newRule, name: e.target.value })} />
              <Input
                placeholder="Instrucción"
                value={newRule.instruction}
                onChange={(e) => setNewRule({ ...newRule, instruction: e.target.value })}
              />
              <Button onClick={addRule}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <div>
        <Card className="flex h-[420px] flex-col lg:h-[600px]">
          <CardHeader>
            <CardTitle>Preview de conversación</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col overflow-hidden">
            <div className="flex-1 space-y-2 overflow-y-auto">
              {chatLog.map((m, i) => (
                <div key={i} className={m.role === "user" ? "text-right" : "text-left"}>
                  <span
                    className={`inline-block max-w-[85%] rounded-lg px-3 py-1.5 text-sm ${
                      m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"
                    }`}
                  >
                    {m.content}
                  </span>
                </div>
              ))}
              {chatLog.length === 0 && <p className="text-xs text-muted-foreground">Probá tu agente sin riesgo: no crea reservas reales.</p>}
            </div>
            <div className="mt-2 flex gap-2">
              <Input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendPreviewMessage()}
                placeholder="Escribí como si fueras un cliente..."
                disabled={sending}
              />
              <Button onClick={sendPreviewMessage} disabled={sending} aria-label="Enviar mensaje de prueba">
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
