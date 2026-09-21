import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy } from "lucide-react";
import { insforge } from "@/lib/insforgeClient";
import { useOrganization } from "@/hooks/useOrganization";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CURRENCY_OPTIONS } from "@/lib/currency";
import { PushNotificationsCard } from "@/components/PushNotificationsCard";
import { Skeleton } from "@/components/ui/skeleton";
import { QueryErrorState } from "@/components/QueryErrorState";
import { isNonNegativeNumber, isPositiveInteger, isValidEmail } from "@/lib/validation";
import type { BusinessHourPeriod, BusinessProfile } from "@/types/domain";

const DAY_NAMES = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

export function SettingsPage() {
  const { currentOrganizationId, currentRole } = useOrganization();
  const queryClient = useQueryClient();
  const readOnly = currentRole === "staff";
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [hours, setHours] = useState<BusinessHourPeriod[]>([]);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [copySourceId, setCopySourceId] = useState<string | null>(null);
  const [copyTargetDays, setCopyTargetDays] = useState<Set<number>>(new Set());

  const {
    data: profileData,
    isError: profileError,
    refetch: refetchProfile
  } = useQuery({
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
    if (profile.email?.trim() && !isValidEmail(profile.email)) {
      toast.error("Ingresá un correo de contacto válido.");
      return;
    }
    if (
      !isPositiveInteger(profile.reservation_duration_minutes) ||
      !isPositiveInteger(profile.slot_interval_minutes) ||
      !isNonNegativeNumber(profile.advance_booking_hours) ||
      !isPositiveInteger(profile.max_booking_days) ||
      (profile.capacity_total !== null && !isPositiveInteger(profile.capacity_total))
    ) {
      toast.error("Revisá los campos numéricos: deben ser números válidos mayores a 0.");
      return;
    }
    if (profile.deposit_enabled) {
      if (!profile.nequi_phone?.trim()) {
        toast.error("Ingresá el número de Nequi del negocio para poder pedir anticipos.");
        return;
      }
      if (!profile.deposit_percentage || profile.deposit_percentage <= 0 || profile.deposit_percentage > 100) {
        toast.error("El porcentaje del anticipo debe ser un número entre 1 y 100.");
        return;
      }
    }
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
        special_instructions: profile.special_instructions,
        nequi_phone: profile.nequi_phone,
        deposit_enabled: profile.deposit_enabled,
        deposit_mandatory: profile.deposit_mandatory,
        deposit_percentage: profile.deposit_percentage
      })
      .eq("organization_id", currentOrganizationId);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Configuración guardada.");
    queryClient.invalidateQueries({ queryKey: ["business-profile", currentOrganizationId] });
  }

  async function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // permite volver a elegir el mismo archivo si hace falta reintentar
    if (!file || !currentOrganizationId) return;

    if (!file.type.startsWith("image/")) {
      toast.error("El logo debe ser una imagen.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error("La imagen no puede superar 2 MB.");
      return;
    }

    setUploadingLogo(true);
    // Key fijo por organización (sin extensión): cada subida reemplaza la
    // anterior en vez de ir acumulando archivos huérfanos en el bucket.
    const { data: uploadData, error: uploadError } = await insforge.storage
      .from("business-logos")
      .upload(`${currentOrganizationId}/logo`, file);

    if (uploadError || !uploadData) {
      toast.error(uploadError?.message ?? "No se pudo subir el logo.");
      setUploadingLogo(false);
      return;
    }

    const { error: updateError } = await insforge.database
      .from("business_profiles")
      .update({ logo_url: uploadData.url })
      .eq("organization_id", currentOrganizationId);

    setUploadingLogo(false);
    if (updateError) {
      toast.error(updateError.message);
      return;
    }

    setProfile((prev) => (prev ? { ...prev, logo_url: uploadData.url } : prev));
    queryClient.invalidateQueries({ queryKey: ["business-profile", currentOrganizationId] });
    queryClient.invalidateQueries({ queryKey: ["business-branding", currentOrganizationId] });
    toast.success("Logo actualizado.");
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

  function toggleCopyTargetDay(dayOfWeek: number) {
    setCopyTargetDays((prev) => {
      const next = new Set(prev);
      if (next.has(dayOfWeek)) next.delete(dayOfWeek);
      else next.add(dayOfWeek);
      return next;
    });
  }

  function applyCopyToTargetDays() {
    const source = hours.find((h) => h.id === copySourceId);
    if (!source) return;

    setHours((prev) =>
      prev.map((h) =>
        copyTargetDays.has(h.day_of_week)
          ? { ...h, is_closed: source.is_closed, opening_time: source.opening_time, closing_time: source.closing_time }
          : h
      )
    );
    toast.success(`Horario de ${DAY_NAMES[source.day_of_week]} copiado a ${copyTargetDays.size} día(s). No olvides guardar.`);
    setCopySourceId(null);
    setCopyTargetDays(new Set());
  }

  if (profileError) {
    return <QueryErrorState onRetry={() => refetchProfile()} message="No se pudo cargar la configuración del negocio." />;
  }

  if (!profile) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-80 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

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
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted">
              {profile.logo_url ? (
                <img src={profile.logo_url} alt={profile.name} className="h-full w-full object-cover" />
              ) : (
                <span className="text-center text-[10px] leading-tight text-muted-foreground">Sin logo</span>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="logo-upload">Logo del negocio</Label>
              <input
                id="logo-upload"
                type="file"
                accept="image/*"
                disabled={readOnly || uploadingLogo}
                onChange={handleLogoChange}
                className="block text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-primary-foreground file:hover:opacity-90 disabled:opacity-60"
              />
              <p className="text-xs text-muted-foreground">
                Reemplaza el ícono y el nombre "Reservas AI" del menú por el logo y el nombre de tu negocio. PNG o JPG,
                máx. 2&nbsp;MB.
              </p>
            </div>
          </div>
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
            <Label>Correo de contacto</Label>
            <Input
              type="email"
              disabled={readOnly}
              value={profile.email ?? ""}
              onChange={(e) => setProfile({ ...profile, email: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              Correo público del negocio (ej: para que te contacten clientes). Es distinto del correo con el que iniciás sesión.
            </p>
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

      <Card>
        <CardHeader>
          <CardTitle>Pagos con Nequi</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Si lo activás, el agente puede pedirle al cliente un anticipo por Nequi antes de confirmar una reserva. El cliente manda la foto del
            comprobante por el mismo chat, y alguien del negocio confirma el pago desde el Inbox: el agente nunca confirma un pago por su cuenta.
          </p>
          <div className="flex items-center gap-3 rounded-md border border-border p-3">
            <Switch
              disabled={readOnly}
              checked={profile.deposit_enabled}
              onCheckedChange={(checked) => setProfile({ ...profile, deposit_enabled: checked })}
            />
            <span className="text-sm font-medium">Pedir anticipo por Nequi</span>
          </div>
          {profile.deposit_enabled && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Número de Nequi</Label>
                  <Input
                    disabled={readOnly}
                    value={profile.nequi_phone ?? ""}
                    placeholder="3001234567"
                    onChange={(e) => setProfile({ ...profile, nequi_phone: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Porcentaje del anticipo</Label>
                  <Input
                    type="number"
                    min={1}
                    max={100}
                    disabled={readOnly}
                    value={profile.deposit_percentage ?? ""}
                    onChange={(e) => setProfile({ ...profile, deposit_percentage: e.target.value ? Number(e.target.value) : null })}
                  />
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-md border border-border p-3">
                <Switch
                  disabled={readOnly}
                  checked={profile.deposit_mandatory}
                  onCheckedChange={(checked) => setProfile({ ...profile, deposit_mandatory: checked })}
                />
                <div>
                  <span className="text-sm font-medium">Anticipo obligatorio</span>
                  <p className="text-xs text-muted-foreground">
                    Si lo apagás, el cliente puede elegir entre pagar el anticipo por Nequi o pagar todo en el sitio.
                  </p>
                </div>
              </div>
            </div>
          )}
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
              {!readOnly && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto"
                  onClick={() => {
                    setCopySourceId(h.id);
                    setCopyTargetDays(new Set());
                  }}
                  title={`Copiar el horario de ${DAY_NAMES[h.day_of_week]} a otros días`}
                  aria-label={`Copiar el horario de ${DAY_NAMES[h.day_of_week]} a otros días`}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}
          {!readOnly && <Button onClick={saveHours}>Guardar horarios</Button>}
        </CardContent>
      </Card>

      <Dialog open={!!copySourceId} onOpenChange={(open) => !open && setCopySourceId(null)}>
        <DialogContent>
          {copySourceId &&
            (() => {
              const source = hours.find((h) => h.id === copySourceId);
              if (!source) return null;
              return (
                <>
                  <DialogHeader>
                    <DialogTitle>Copiar horario de {DAY_NAMES[source.day_of_week]}</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      {source.is_closed
                        ? "Cerrado"
                        : `${source.opening_time?.slice(0, 5)} a ${source.closing_time?.slice(0, 5)}`}
                      . Elegí a qué días aplicarlo:
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {hours
                        .filter((h) => h.id !== source.id)
                        .map((h) => (
                          <label key={h.id} className="flex items-center gap-2 rounded-md border border-border p-2 text-sm">
                            <input
                              type="checkbox"
                              checked={copyTargetDays.has(h.day_of_week)}
                              onChange={() => toggleCopyTargetDay(h.day_of_week)}
                            />
                            {DAY_NAMES[h.day_of_week]}
                          </label>
                        ))}
                    </div>
                    <Button onClick={applyCopyToTargetDays} disabled={copyTargetDays.size === 0}>
                      Aplicar a {copyTargetDays.size || ""} día(s)
                    </Button>
                  </div>
                </>
              );
            })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
