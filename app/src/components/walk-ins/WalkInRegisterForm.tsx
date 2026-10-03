import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { formatTicket } from "@/lib/walkIns";
import { insforge } from "@/lib/insforgeClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { VoiceIntakeButton, type VoiceFields } from "@/components/VoiceIntakeButton";
import type { Service } from "@/types/domain";

// Radix Select no admite un item con value "": este valor representa "sin elegir".
const NONE = "none";
// Segundos antes de registrar solo lo que se dictó (se puede cancelar o corregir).
const AUTO_SUBMIT_SECONDS = 3;
const EMPTY_FORM = { name: "", phone: "", serviceId: NONE, notes: "", partySize: "" };

interface Props {
  organizationId: string;
  services: Service[];
  showPartySize: boolean;
  onRegistered: () => void;
}

/** Registrar a quien llega sin reserva, escribiendo o dictando los datos. */
export function WalkInRegisterForm({ organizationId, services, showPartySize, onRegistered }: Props) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  // Cuenta regresiva del registro automático después de dictar.
  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) {
      setCountdown(null);
      formRef.current?.requestSubmit();
      return;
    }
    const t = setTimeout(() => setCountdown(countdown - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  function applyVoice(fields: VoiceFields) {
    setForm((prev) => ({
      name: fields.customer_name ?? prev.name,
      phone: fields.phone ?? prev.phone,
      serviceId: fields.service_id ?? prev.serviceId,
      notes: fields.notes ?? prev.notes,
      partySize: fields.party_size ? String(fields.party_size) : prev.partySize
    }));
    if (fields.customer_name) {
      setCountdown(AUTO_SUBMIT_SECONDS);
    } else {
      toast.info("No se entendió el nombre. Completalo y tocá Agregar a la fila.");
    }
  }

  function updateForm(patch: Partial<typeof EMPTY_FORM>) {
    // Si alguien corrige un campo, el registro automático espera a que confirme.
    setCountdown(null);
    setForm((prev) => ({ ...prev, ...patch }));
  }

  async function registerArrival(e: React.FormEvent) {
    e.preventDefault();
    setCountdown(null);
    if (!form.name.trim()) return;
    const party = form.partySize.trim() ? Number(form.partySize) : null;
    if (party !== null && (!Number.isInteger(party) || party < 1 || party > 200)) {
      toast.error("El número de personas no es válido.");
      return;
    }
    setSaving(true);
    const { data, error } = await insforge.database.from("walk_ins").insert([
      {
        organization_id: organizationId,
        customer_name: form.name.trim(),
        customer_phone: form.phone.trim() || null,
        service_id: form.serviceId === NONE ? null : form.serviceId,
        notes: form.notes.trim() || null,
        party_size: party
      }
    ]).select("ticket_number");
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    const ticket = formatTicket((data as { ticket_number: number | null }[] | null)?.[0]?.ticket_number);
    toast.success(`${form.name.trim()} quedó en la fila${ticket ? ` con el ticket ${ticket}` : ""}.`);
    setForm(EMPTY_FORM);
    onRegistered();
  }

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
        <CardTitle>Registrar llegada sin reserva</CardTitle>
        <VoiceIntakeButton organizationId={organizationId} onResult={applyVoice} />
      </CardHeader>
      <CardContent>
        <form
          ref={formRef}
          onSubmit={registerArrival}
          className={`grid grid-cols-1 gap-3 sm:grid-cols-2 lg:items-end ${showPartySize ? "lg:grid-cols-6" : "lg:grid-cols-5"}`}
        >
          <div className="space-y-1.5">
            <Label htmlFor="walkin-name">Nombre *</Label>
            <Input id="walkin-name" value={form.name} onChange={(e) => updateForm({ name: e.target.value })} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="walkin-phone">Teléfono</Label>
            <Input
              id="walkin-phone"
              inputMode="tel"
              value={form.phone}
              onChange={(e) => updateForm({ phone: e.target.value })}
              placeholder="Para guardarlo como cliente"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="walkin-service">Servicio</Label>
            <Select value={form.serviceId} onValueChange={(v) => updateForm({ serviceId: v })}>
              <SelectTrigger id="walkin-service">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Sin definir</SelectItem>
                {services.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name} · {s.duration_minutes} min
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {showPartySize && (
            <div className="space-y-1.5">
              <Label htmlFor="walkin-party">Personas</Label>
              <Input id="walkin-party" inputMode="numeric" value={form.partySize} onChange={(e) => updateForm({ partySize: e.target.value })} />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="walkin-notes">Notas</Label>
            <Input id="walkin-notes" value={form.notes} onChange={(e) => updateForm({ notes: e.target.value })} placeholder="Ej: placa, pedido especial" />
          </div>
          {countdown !== null ? (
            <div className="flex gap-2">
              <Button type="submit" className="flex-1" disabled={saving}>
                Registrando en {countdown}…
              </Button>
              <Button type="button" variant="ghost" onClick={() => setCountdown(null)}>
                Cancelar
              </Button>
            </div>
          ) : (
            <Button type="submit" disabled={saving || !form.name.trim()}>
              Agregar a la fila
            </Button>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
