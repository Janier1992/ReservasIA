import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { BoardSettings } from "@/hooks/useBoardSettings";

interface Props {
  open: boolean;
  settings: BoardSettings;
  onClose: () => void;
  onSave: (next: BoardSettings) => Promise<string | null>;
}

/** Ajustes del tablero: alerta de demora y qué ve el público en modo pantalla. */
export function BoardSettingsDialog({ open, settings, onClose, onSave }: Props) {
  const [alertOn, setAlertOn] = useState(settings.wait_alert_minutes !== null);
  const [minutes, setMinutes] = useState(String(settings.wait_alert_minutes ?? 15));
  const [hidePrices, setHidePrices] = useState(settings.display_hide_prices);
  const [hideNames, setHideNames] = useState(settings.display_hide_names);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setAlertOn(settings.wait_alert_minutes !== null);
    setMinutes(String(settings.wait_alert_minutes ?? 15));
    setHidePrices(settings.display_hide_prices);
    setHideNames(settings.display_hide_names);
  }, [open, settings]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const value = Number(minutes);
    if (alertOn && (!Number.isInteger(value) || value < 1 || value > 240)) {
      toast.error("Los minutos de la alerta van de 1 a 240.");
      return;
    }
    setSaving(true);
    const error = await onSave({ wait_alert_minutes: alertOn ? value : null, display_hide_prices: hidePrices, display_hide_names: hideNames });
    setSaving(false);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success("Ajustes del tablero guardados.");
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ajustes del tablero</DialogTitle>
          <DialogDescription>Valen para todo el equipo y todas las pantallas del negocio.</DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="space-y-6">
          <section className="space-y-3">
            <div className="flex items-start justify-between gap-4">
              <div>
                <Label htmlFor="bs-alert">Alerta de demora</Label>
                <p className="text-sm text-muted-foreground">La tarjeta se resalta como "Demorado" y suena un aviso cuando alguien lleva esperando más de este tiempo.</p>
              </div>
              <Switch id="bs-alert" checked={alertOn} onCheckedChange={setAlertOn} />
            </div>
            {alertOn && (
              <div className="flex items-center gap-2">
                <Input
                  id="bs-minutes"
                  type="number"
                  min={1}
                  max={240}
                  className="w-24"
                  value={minutes}
                  onChange={(e) => setMinutes(e.target.value)}
                  aria-label="Minutos de espera para la alerta"
                />
                <span className="text-sm text-muted-foreground">minutos de espera</span>
              </div>
            )}
          </section>
          <section className="space-y-3">
            <p className="text-sm font-medium">Modo pantalla (lo que ve el público)</p>
            <div className="flex items-start justify-between gap-4">
              <div>
                <Label htmlFor="bs-prices">Ocultar precios y totales</Label>
                <p className="text-sm text-muted-foreground">En el panel del equipo se siguen viendo.</p>
              </div>
              <Switch id="bs-prices" checked={hidePrices} onCheckedChange={setHidePrices} />
            </div>
            <div className="flex items-start justify-between gap-4">
              <div>
                <Label htmlFor="bs-names">Abreviar nombres de clientes</Label>
                <p className="text-sm text-muted-foreground">Ej: "Andrea G." en vez del nombre completo.</p>
              </div>
              <Switch id="bs-names" checked={hideNames} onCheckedChange={setHideNames} />
            </div>
          </section>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Guardando..." : "Guardar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
