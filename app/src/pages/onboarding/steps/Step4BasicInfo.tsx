import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export interface BasicInfo {
  address: string;
  phone: string;
  email: string;
  website: string;
  description: string;
}

export function Step4BasicInfo({ value, onNext, onBack }: { value: BasicInfo; onNext: (info: BasicInfo) => void; onBack: () => void }) {
  const [info, setInfo] = useState(value);
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Información básica</h2>
        <p className="text-sm text-muted-foreground">Estos datos los usará el agente para responder a tus clientes.</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Teléfono</Label>
          <Input value={info.phone} onChange={(e) => setInfo({ ...info, phone: e.target.value })} placeholder="+57 300 000 0000" />
        </div>
        <div className="space-y-1.5">
          <Label>Email</Label>
          <Input value={info.email} onChange={(e) => setInfo({ ...info, email: e.target.value })} placeholder="contacto@negocio.com" />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Dirección</Label>
        <Input value={info.address} onChange={(e) => setInfo({ ...info, address: e.target.value })} />
      </div>
      <div className="space-y-1.5">
        <Label>Sitio web (opcional)</Label>
        <Input value={info.website} onChange={(e) => setInfo({ ...info, website: e.target.value })} placeholder="https://" />
      </div>
      <div className="space-y-1.5">
        <Label>Descripción</Label>
        <Textarea value={info.description} onChange={(e) => setInfo({ ...info, description: e.target.value })} />
      </div>
      <div className="flex gap-2">
        <Button variant="outline" onClick={onBack} className="flex-1">
          Atrás
        </Button>
        <Button className="flex-1" onClick={() => onNext(info)}>
          Continuar
        </Button>
      </div>
    </div>
  );
}
