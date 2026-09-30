import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ShieldCheck, ShieldOff } from "lucide-react";
import { insforge } from "@/lib/insforgeClient";
import { Button } from "@/components/ui/button";
import { HEALTH_CONSENT_SOURCE_LABEL } from "@/lib/healthData";
import type { Customer } from "@/types/domain";

interface Props {
  customer: Customer;
  timezone: string;
  onChanged: (patch: Partial<Customer>) => void;
}

/**
 * Autorización de datos de salud del paciente (Ley 1581): estado, registrarla
 * cuando el paciente la da en persona, o retirarla y borrar el motivo de
 * consulta guardado en sus reservas y llegadas.
 */
export function HealthConsentSection({ customer, timezone, onChanged }: Props) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const consentAt = customer.health_data_consent_at;

  async function grant() {
    if (!window.confirm("¿El paciente autorizó expresamente guardar el motivo de su consulta?")) return;
    setBusy(true);
    const patch = { health_data_consent_at: new Date().toISOString(), health_data_consent_source: "panel" };
    const { error } = await insforge.database.from("customers").update(patch).eq("id", customer.id);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Autorización registrada.");
    onChanged(patch);
  }

  async function revokeAndErase() {
    if (
      !window.confirm(
        "Se retira la autorización y se borra el motivo de consulta de todas las reservas y llegadas de este paciente. No se puede deshacer. ¿Continuar?"
      )
    ) {
      return;
    }
    setBusy(true);
    const [reservations, walkIns, customerUpdate] = await Promise.all([
      insforge.database.from("reservations").update({ special_requests: null }).eq("customer_id", customer.id),
      insforge.database.from("walk_ins").update({ notes: null }).eq("customer_id", customer.id),
      insforge.database.from("customers").update({ health_data_consent_at: null, health_data_consent_source: null }).eq("id", customer.id)
    ]);
    setBusy(false);
    const error = reservations.error ?? walkIns.error ?? customerUpdate.error;
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Autorización retirada y datos de salud borrados.");
    onChanged({ health_data_consent_at: null, health_data_consent_source: null });
    queryClient.invalidateQueries({ queryKey: ["customer-detail-reservations", customer.id] });
    queryClient.invalidateQueries({ queryKey: ["reservations"] });
  }

  return (
    <div className="space-y-2 rounded-md border border-border p-3">
      <h4 className="flex items-center gap-2 font-medium">
        {consentAt ? <ShieldCheck className="h-4 w-4 text-success" /> : <ShieldOff className="h-4 w-4 text-muted-foreground" />}
        Datos de salud
      </h4>
      {consentAt ? (
        <p className="text-muted-foreground">
          Autorizó guardar el motivo de consulta el{" "}
          {new Date(consentAt).toLocaleDateString("es-CO", { timeZone: timezone, day: "numeric", month: "long", year: "numeric" })}
          {customer.health_data_consent_source ? ` (${HEALTH_CONSENT_SOURCE_LABEL[customer.health_data_consent_source] ?? customer.health_data_consent_source})` : ""}.
        </p>
      ) : (
        <p className="text-muted-foreground">
          Sin autorización: el motivo de consulta no se guarda (ni desde el chat ni desde la página de reservas). Registrala solo si el paciente la da
          expresamente.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {!consentAt && (
          <Button size="sm" variant="outline" disabled={busy} onClick={grant}>
            Registrar autorización
          </Button>
        )}
        <Button size="sm" variant="ghost" disabled={busy} onClick={revokeAndErase}>
          {consentAt ? "Retirar y borrar datos de salud" : "Borrar datos de salud guardados"}
        </Button>
      </div>
    </div>
  );
}
