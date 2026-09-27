import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { formatInTimeZone } from "date-fns-tz";
import { es } from "date-fns/locale";
import { CalendarCheck, Check, Clock, MapPin, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/currency";
import { getBusinessTheme } from "@/lib/businessThemes";
import { useApplyTheme } from "@/hooks/useBusinessTheme";
import { PublicApiError, publicApi, type PublicService, type PublicSlot } from "@/lib/publicApi";
import { upcomingDates } from "@/lib/publicBookingUtils";

const DAYS_SHOWN = 14;

function SectionTitle({ step, children }: { step: number; children: React.ReactNode }) {
  return (
    <h2 className="flex items-center gap-3 font-display text-lg font-semibold">
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-sm text-primary-foreground">{step}</span>
      {children}
    </h2>
  );
}

export function PublicBookingPage() {
  const { slug = "" } = useParams<{ slug: string }>();
  const [service, setService] = useState<PublicService | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [slot, setSlot] = useState<PublicSlot | null>(null);
  const [form, setForm] = useState({ name: "", phone: "", email: "", notes: "", website: "" });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<{ start_at: string } | null>(null);

  const businessQuery = useQuery({
    queryKey: ["public-business", slug],
    queryFn: () => publicApi.business(slug),
    retry: false
  });
  const business = businessQuery.data;
  const theme = getBusinessTheme(business?.businessType);
  useApplyTheme(theme);
  const Icon = theme.icon;

  const dates = useMemo(
    () => (business ? upcomingDates(business.timezone, Math.min(DAYS_SHOWN, business.maxBookingDays + 1)) : []),
    [business]
  );

  const slotsQuery = useQuery({
    queryKey: ["public-slots", slug, service?.id, date],
    enabled: !!business && !!service && !!date,
    queryFn: () => publicApi.availability(slug, service!.id, date!),
    retry: false
  });

  const tz = business?.timezone ?? "UTC";
  const fmt = (iso: string, pattern: string) => formatInTimeZone(new Date(iso), tz, pattern, { locale: es });
  const dayLabel = (ymd: string) => fmt(`${ymd}T12:00:00Z`, "EEE d");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!service || !date || !slot) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const result = await publicApi.book(slug, {
        serviceId: service.id,
        date,
        start: slot.start,
        name: form.name,
        phone: form.phone,
        email: form.email || undefined,
        notes: form.notes || undefined,
        website: form.website || undefined
      });
      setConfirmed({ start_at: result.start_at });
    } catch (err) {
      setSubmitError(err instanceof PublicApiError ? err.message : "No se pudo completar la reserva. Intentá de nuevo.");
      if (err instanceof PublicApiError && err.status === 409) {
        setSlot(null);
        slotsQuery.refetch();
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (businessQuery.isLoading) {
    return (
      <main className="mx-auto max-w-2xl space-y-4 px-4 py-12">
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-32 w-full" />
      </main>
    );
  }

  if (businessQuery.isError || !business) {
    const message =
      businessQuery.error instanceof PublicApiError ? businessQuery.error.message : "No pudimos cargar esta página.";
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 px-4 text-center">
        <CalendarCheck className="h-10 w-10 text-muted-foreground" />
        <h1 className="font-display text-2xl font-semibold">Reservas en línea no disponibles</h1>
        <p className="text-sm text-muted-foreground">{message}</p>
      </main>
    );
  }

  if (confirmed) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Check className="h-7 w-7" />
        </div>
        <h1 className="font-display text-3xl font-semibold">¡Listo, {form.name.split(" ")[0]}!</h1>
        <p className="text-muted-foreground">
          Tu reserva de <strong className="text-foreground">{service?.name}</strong> en {business.name} quedó para el{" "}
          <strong className="text-foreground">{fmt(confirmed.start_at, "EEEE d 'de' MMMM 'a las' h:mm a")}</strong>.
        </p>
        {business.address && (
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <MapPin className="h-4 w-4" /> {business.address}
          </p>
        )}
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-4 pb-16 pt-10 sm:pt-16">
      <header className="mb-10 flex items-start gap-4">
        {business.logoUrl ? (
          <img src={business.logoUrl} alt="" className="h-14 w-14 shrink-0 rounded-2xl object-cover" />
        ) : (
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Icon className="h-7 w-7" />
          </div>
        )}
        <div className="min-w-0 space-y-1">
          <h1 className="font-display text-3xl font-semibold leading-tight sm:text-4xl">{business.name}</h1>
          {business.description && <p className="text-muted-foreground">{business.description}</p>}
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {business.address && (
              <span className="flex items-center gap-1.5">
                <MapPin className="h-4 w-4" /> {business.address}
              </span>
            )}
            {business.phone && (
              <span className="flex items-center gap-1.5">
                <Phone className="h-4 w-4" /> {business.phone}
              </span>
            )}
          </div>
        </div>
      </header>

      <div className="space-y-10">
        <section className="space-y-4">
          <SectionTitle step={1}>Elegí el servicio</SectionTitle>
          {business.services.length === 0 ? (
            <p className="text-sm text-muted-foreground">Este negocio todavía no publicó servicios.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {business.services.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    setService(s);
                    setSlot(null);
                    if (!date) setDate(dates[0] ?? null);
                  }}
                  aria-pressed={service?.id === s.id}
                  className={cn(
                    "flex flex-col items-start gap-1 rounded-2xl border bg-card p-4 text-left transition-colors hover:border-primary/60",
                    service?.id === s.id ? "border-primary ring-2 ring-primary/20" : "border-border"
                  )}
                >
                  <span className="font-medium">{s.name}</span>
                  <span className="flex items-center gap-3 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" /> {s.durationMinutes} min
                    </span>
                    {s.price !== null && <span>{formatCurrency(s.price, s.currency)}</span>}
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>

        {service && (
          <section className="space-y-4">
            <SectionTitle step={2}>Elegí día y hora</SectionTitle>
            <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
              {dates.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => {
                    setDate(d);
                    setSlot(null);
                  }}
                  aria-pressed={date === d}
                  className={cn(
                    "min-w-[4.5rem] shrink-0 rounded-xl border px-3 py-2 text-sm capitalize transition-colors",
                    date === d ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:border-primary/60"
                  )}
                >
                  {dayLabel(d)}
                </button>
              ))}
            </div>

            {slotsQuery.isLoading ? (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                {Array.from({ length: 10 }).map((_, i) => (
                  <Skeleton key={i} className="h-10" />
                ))}
              </div>
            ) : slotsQuery.isError ? (
              <p className="text-sm text-destructive">No pudimos cargar los horarios. Probá de nuevo en un momento.</p>
            ) : slotsQuery.data && slotsQuery.data.slots.length === 0 ? (
              <p className="text-sm text-muted-foreground">{slotsQuery.data.reason ?? "No hay horarios disponibles ese día."}</p>
            ) : (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                {slotsQuery.data?.slots.map((s) => (
                  <button
                    key={s.start}
                    type="button"
                    onClick={() => setSlot(s)}
                    aria-pressed={slot?.start === s.start}
                    className={cn(
                      "rounded-xl border py-2 text-sm tabular-nums transition-colors",
                      slot?.start === s.start ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:border-primary/60"
                    )}
                  >
                    {fmt(s.start, "h:mm a")}
                  </button>
                ))}
              </div>
            )}
          </section>
        )}

        {slot && (
          <section className="space-y-4">
            <SectionTitle step={3}>Tus datos</SectionTitle>
            <form onSubmit={submit} className="space-y-4 rounded-2xl border border-border bg-card p-5">
              <p className="text-sm text-muted-foreground">
                {service?.name} · <span className="inline-block first-letter:uppercase">{fmt(slot.start, "EEEE d 'de' MMMM, h:mm a")}</span>
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="pb-name">Nombre *</Label>
                  <Input id="pb-name" autoComplete="name" required minLength={2} maxLength={80} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pb-phone">Celular *</Label>
                  <Input id="pb-phone" type="tel" autoComplete="tel" required maxLength={20} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="pb-email">Email (opcional)</Label>
                  <Input id="pb-email" type="email" autoComplete="email" maxLength={120} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="pb-notes">Notas (opcional)</Label>
                  <Input id="pb-notes" maxLength={300} placeholder="Algo que el negocio deba saber" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                </div>
                {/* Campo trampa para bots: fuera de pantalla y fuera del orden de tabulación. */}
                <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
                  <label htmlFor="pb-website">Sitio web</label>
                  <input id="pb-website" tabIndex={-1} autoComplete="off" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} />
                </div>
              </div>
              {submitError && (
                <p role="alert" className="text-sm text-destructive">
                  {submitError}
                </p>
              )}
              <Button type="submit" size="lg" className="w-full" disabled={submitting}>
                {submitting ? "Reservando..." : "Confirmar reserva"}
              </Button>
              <p className="text-xs text-muted-foreground">Al reservar, {business.name} recibe tu nombre y celular para gestionar la cita.</p>
            </form>
          </section>
        )}
      </div>

      <footer className="mt-16 text-center text-xs text-muted-foreground">Reservas con ReservasIA</footer>
    </main>
  );
}
