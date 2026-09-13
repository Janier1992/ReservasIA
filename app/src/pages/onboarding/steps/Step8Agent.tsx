import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export interface AgentDraft {
  agentName: string;
  agentTone: string;
  agentLanguage: string;
}

export function Step8Agent({ value, onNext, onBack }: { value: AgentDraft; onNext: (agent: AgentDraft) => void; onBack: () => void }) {
  const [agent, setAgent] = useState(value);
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Configurá tu agente de IA</h2>
        <p className="text-sm text-muted-foreground">Vas a poder ajustar el resto de la configuración desde el dashboard.</p>
      </div>
      <div className="space-y-1.5">
        <Label>Nombre del agente</Label>
        <Input value={agent.agentName} onChange={(e) => setAgent({ ...agent, agentName: e.target.value })} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Tono</Label>
          <Select value={agent.agentTone} onValueChange={(v) => setAgent({ ...agent, agentTone: v })}>
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
        <div className="space-y-1.5">
          <Label>Idioma</Label>
          <Select value={agent.agentLanguage} onValueChange={(v) => setAgent({ ...agent, agentLanguage: v })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="es">Español</SelectItem>
              <SelectItem value="en">Inglés</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" onClick={onBack} className="flex-1">
          Atrás
        </Button>
        <Button className="flex-1" onClick={() => onNext(agent)}>
          Continuar
        </Button>
      </div>
    </div>
  );
}
