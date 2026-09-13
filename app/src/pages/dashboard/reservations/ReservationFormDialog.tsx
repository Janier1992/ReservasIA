import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { fromZonedTime } from "date-fns-tz";
import { insforge } from "@/lib/insforgeClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Resource, Service } from "@/types/domain";

const schema = z.object({
  date: z.string().min(1, "Requerido"),
  time: z.string().min(1, "Requerido"),
  customerName: z.string().min(1, "Requerido"),
  customerPhone: z.string().min(5, "Requerido"),
  customerEmail: z.string().email("Email inválido").optional().or(z.literal("")),
  serviceId: z.string().optional(),
  resourceId: z.string().optional(),
  partySize: z.coerce.number().int().positive().optional(),
  notes: z.string().optional()
});

type FormValues = z.infer<typeof schema>;

export function ReservationFormDialog({
  open,
  onOpenChange,
  organizationId,
  timezone,
  services,
  resources,
  onCreated
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  timezone: string;
  services: Service[];
  resources: Resource[];
  onCreated: () => void;
}) {
  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors, isSubmitting }
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = async (values: FormValues) => {
    try {
      // Se resuelve el cliente ANTES de reservar (y no al revés, como hacía
      // antes) para poder pasar su id real a book_reservation: sin eso, la
      // reserva quedaba sin customer_id y, por ejemplo, nunca podíamos
      // invitarlo a su Google Calendar porque no había forma de encontrar su
      // email desde la reserva.
      const { data: existingCustomer } = await insforge.database
        .from("customers")
        .select("id, name, email")
        .eq("organization_id", organizationId)
        .eq("phone", values.customerPhone)
        .maybeSingle();

      let customerId: string;
      if (existingCustomer) {
        customerId = existingCustomer.id;
        const patch: Record<string, string> = {};
        if (!existingCustomer.name && values.customerName) patch.name = values.customerName;
        if (!existingCustomer.email && values.customerEmail) patch.email = values.customerEmail;
        if (Object.keys(patch).length > 0) {
          await insforge.database.from("customers").update(patch).eq("id", customerId);
        }
      } else {
        const { data: created, error: createCustomerError } = await insforge.database
          .from("customers")
          .insert([
            {
              organization_id: organizationId,
              phone: values.customerPhone,
              name: values.customerName,
              email: values.customerEmail || null
            }
          ])
          .select("id")
          .single();
        if (createCustomerError || !created) throw createCustomerError ?? new Error("No se pudo crear el cliente.");
        customerId = created.id;
      }

      const service = services.find((s) => s.id === values.serviceId);
      const durationMinutes = service?.duration_minutes ?? 60;
      const startAt = fromZonedTime(`${values.date}T${values.time}:00`, timezone);
      const endAt = new Date(startAt.getTime() + durationMinutes * 60_000);

      const { error } = await insforge.database.rpc("book_reservation", {
        p_organization_id: organizationId,
        p_customer_id: customerId,
        p_service_id: values.serviceId || null,
        p_resource_id: values.resourceId || null,
        p_conversation_id: null,
        p_start_at: startAt.toISOString(),
        p_end_at: endAt.toISOString(),
        p_party_size: values.partySize ?? null,
        p_customer_name: values.customerName,
        p_special_requests: values.notes || null,
        p_source: "dashboard"
      });

      if (error) throw error;

      toast.success("Reserva creada.");
      reset();
      onOpenChange(false);
      onCreated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo crear la reserva.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nueva reserva</DialogTitle>
        </DialogHeader>
        <form className="space-y-3" onSubmit={handleSubmit(onSubmit)}>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Fecha</Label>
              <Input type="date" {...register("date")} />
              {errors.date && <p className="text-xs text-destructive">{errors.date.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Hora</Label>
              <Input type="time" {...register("time")} />
              {errors.time && <p className="text-xs text-destructive">{errors.time.message}</p>}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Nombre del cliente</Label>
              <Input {...register("customerName")} />
              {errors.customerName && <p className="text-xs text-destructive">{errors.customerName.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Teléfono</Label>
              <Input {...register("customerPhone")} placeholder="+57 300 000 0000" />
              {errors.customerPhone && <p className="text-xs text-destructive">{errors.customerPhone.message}</p>}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Email (opcional)</Label>
            <Input type="email" {...register("customerEmail")} placeholder="cliente@email.com" />
            {errors.customerEmail && <p className="text-xs text-destructive">{errors.customerEmail.message}</p>}
            <p className="text-xs text-muted-foreground">
              Si el negocio tiene Google Calendar conectado, se le manda la invitación del turno a este email.
            </p>
          </div>
          {services.length > 0 && (
            <div className="space-y-1.5">
              <Label>Servicio</Label>
              <Controller
                control={control}
                name="serviceId"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar servicio" />
                    </SelectTrigger>
                    <SelectContent>
                      {services.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          )}
          {resources.length > 0 && (
            <div className="space-y-1.5">
              <Label>Recurso</Label>
              <Controller
                control={control}
                name="resourceId"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar recurso" />
                    </SelectTrigger>
                    <SelectContent>
                      {resources.map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          {r.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Cantidad de personas (opcional)</Label>
            <Input type="number" {...register("partySize")} />
          </div>
          <div className="space-y-1.5">
            <Label>Notas</Label>
            <Textarea {...register("notes")} />
          </div>
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? "Creando..." : "Crear reserva"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
