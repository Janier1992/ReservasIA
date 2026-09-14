import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { insforge } from "@/lib/insforgeClient";
import { useOrganization } from "@/hooks/useOrganization";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CURRENCY_OPTIONS } from "@/lib/currency";
import { PushNotificationsCard } from "@/components/PushNotificationsCard";
import type { BusinessHourPeriod, BusinessProfile } from "@/types/domain";

const DAY_NAMES = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

export function SettingsPage() {
  const { currentOrganizationId, currentRole } = useOrganization();
  const queryClient = useQueryClient();
  const readOnly = currentRole === "staff";
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [hours, setHours] = useState<BusinessHourPeriod[]>([]);

  const { data: profileData } = useQuery({
    queryKey: ["business-profile", currentOrganizationId],
    enabled: !!currentOrganizationId,
    queryFn: async () => {
      const { data, error } = await insforge.database.from("business_profiles").select("*").eq("organization_id", currentOrganizationId).single();
      if (error) throw error;
      return data as BusinessProfile;
    }
  });

  const { data: hoursData } = useQuery({
    queryKey: ["business-hours", currentOrganizationId],
    enabled: !!currentOrganizationId,
    queryFn: async () => {
      const { data, error } = await insforge.database
        .from("business_hour_periods")
        .select("*")
        .eq("organization_id", currentOrganizationId)
        .order("day_of_week", { ascending: true });
      if (error) throw error;
      return data as BusinessHourPeriod[];
    }
  });

  useEffect(() => setProfile(profileData ?? null), [profileData]);
  useEffect(() => setHours(hoursData ?? []), [hoursData]);

  async function saveProfile() {
    if (!profile) return;
    const { error } = await insforge.database
      .from("business_profiles")
      .update({
        name: profile.name,
        description: profile.description,
        address: profile.address,
        phone: profile.phone,
        email: profile.email,
        website: profile.website,
        currency: profile.currency,
        capacity_total: profile.capacity_total,
        reservation_duration_minutes: profile.reservation_duration_minutes,
        slot_interval_minutes: profile.slot_interval_minutes,
        advance_booking_hours: profile.advance_booking_hours,
        max_booking_days: profile.max_booking_days,
        cancellation_policy: profile.cancellation_policy,
        special_instructions: profile.special_instructions
      })
      .eq("organization_id", currentOrganizationId);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Configuración guardada.");
    queryClient.invalidateQueries({ queryKey: ["business-profile", currentOrganizationId] });
  }

  async function saveHours() {
    if (!currentOrganizationId) return;
    for (const h of hours) {
      await insforge.database
        .from("business_hour_periods")
        .update({ is_closed: h.is_closed, opening_time: h.is_closed ? null : h.opening_time, closing_time: h.is_closed ? null : h.closing_time })
        .eq("id", h.id);
    }
    toast.success("Horarios actualizados.");
    queryClient.invalidateQueries({ queryKey: ["business-hours", currentOrganizationId] });
  }

  if (!profile) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Configuración del negocio</h1>
        <p className="text-sm text-muted-foreground">Datos operativos que usa el motor de disponibilidad y el agente.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Información general</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Nombre</Label>
              <Input disabled={readOnly} value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Teléfono</Label>
              <Input disabled={readOnly} value={profile.phone ?? ""} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Moneda</Label>
            <Select
              disabled={readOnly}
              value={profile.currency}
              onValueChange={(currency) => setProfile({ ...profile, currency })}
            >
              <SelectTrigger className="w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CURRENCY_OPTIONS.map((c) => (
                  <SelectItem key={c.code} value={c.code}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Moneda en la que se muestran y guardan los precios de tus servicios.</p>
          </div>
          <div className="space-y-1.5">
            <Label>Descripción</Label>
            <Textarea
              disabled={readOnly}
              value={profile.description ?? ""}
              onChange={(e) => setProfile({ ...profile, description: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Política de cancelación</Label>
            <Textarea
              disabled={readOnly}
              value={profile.cancellation_policy ?? ""}
              onChange={(e) => setProfile({ ...profile, cancellation_policy: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="space-y-1.5">
              <Label>Duración por defecto (min)</Label>
              <Input
                type="number"
                disabled={readOnly}
                value={profile.reservation_duration_minutes}
                onChange={(e) => setProfile({ ...profile, reservation_duration_minutes: Number(e.target.value) })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Intervalo de slots (min)</Label>
              <Input
                type="number"
                disabled={readOnly}
                value={profile.slot_interval_minutes}
                onChange={(e) => setProfile({ ...profile, slot_interval_minutes: Number(e.target.value) })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Anticipación mínima (horas)</Label>
              <Input
                type="number"
                disabled={readOnly}
                value={profile.advance_booking_hours}
                onChange={(e) => setProfile({ ...profile, advance_booking_hours: Number(e.target.value) })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Máximo días a futuro</Label>
              <Input
                type="number"
                disabled={readOnly}
                value={profile.max_booking_days}
                onChange={(e) => setProfile({ ...profile, max_booking_days: Number(e.target.value) })}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Capacidad total (dejalo vacío si usás recursos individuales)</Label>
            <Input
              type="number"
              disabled={readOnly}
              value={profile.capacity_total ?? ""}
              onChange={(e) => setProfile({ ...profile, capacity_total: e.target.value ? Number(e.target.value) : null })}
            />
          </div>
          {!readOnly && <Button onClick={saveProfile}>Guardar</Button>}
        </CardContent>
      </Card>

      {currentOrganizationId && <PushNotificationsCard organizationId={currentOrganizationId} />}

      <Card>
        <CardHeader>
          <CardTitle>Horarios</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {hours.map((h) => (
            <div key={h.id} className="flex items-center gap-3 rounded-md border border-border p-2">
              <span className="w-24 text-sm font-medium">{DAY_NAMES[h.day_of_week]}</span>
              <Switch
                disabled={readOnly}
                checked={!h.is_closed}
                onCheckedChange={(checked) => setHours((prev) => prev.map((p) => (p.id === h.id ? { ...p, is_closed: !checked } : p)))}
              />
              {!h.is_closed ? (
                <div className="flex items-center gap-2">
                  <Input
                    type="time"
                    className="w-28"
                    disabled={readOnly}
                    value={h.opening_time?.slice(0, 5) ?? ""}
                    onChange={(e) => setHours((prev) => prev.map((p) => (p.id === h.id ? { ...p, opening_time: e.target.value } : p)))}
                  />
                  <span className="text-sm text-muted-foreground">a</span>
                  <Input
                    type="time"
                    className="w-28"
                    disabled={readOnly}
                    value={h.closing_time?.slice(0, 5) ?? ""}
                    onChange={(e) => setHours((prev) => prev.map((p) => (p.id === h.id ? { ...p, closing_time: e.target.value } : p)))}
                  />
                </div>
              ) : (
                <span className="text-sm text-muted-foreground">Cerrado</span>
              )}
            </div>
          ))}
          {!readOnly && <Button onClick={saveHours}>Guardar horarios</Button>}
        </CardContent>
      </Card>
    </div>
  );
}
