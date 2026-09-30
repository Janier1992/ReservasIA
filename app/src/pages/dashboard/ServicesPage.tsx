import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, UploadCloud, Pencil, Check, X } from "lucide-react";
import { insforge } from "@/lib/insforgeClient";
import { useOrganization } from "@/hooks/useOrganization";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CURRENCY_OPTIONS, DEFAULT_CURRENCY, formatCurrency } from "@/lib/currency";
import { BulkUploadServicesDialog } from "./services/BulkUploadServicesDialog";
import { EmptyTableRow } from "@/components/EmptyTableRow";
import { QueryErrorState } from "@/components/QueryErrorState";
import { isNonNegativeNumber, isPositiveInteger } from "@/lib/validation";
import type { Service, ServicePackage } from "@/types/domain";

export function ServicesPage() {
  const { currentOrganizationId } = useOrganization();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ name: "", duration_minutes: 60, price: "", currency: DEFAULT_CURRENCY });
  const [bulkUploadOpen, setBulkUploadOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: "", duration_minutes: 60, price: "", currency: DEFAULT_CURRENCY });
  const [packageForm, setPackageForm] = useState({ name: "", serviceId: "", totalSessions: 10, price: "", currency: DEFAULT_CURRENCY });

  const {
    data: services = [],
    isError,
    isLoading,
    refetch
  } = useQuery({
    queryKey: ["services-page", currentOrganizationId],
    enabled: !!currentOrganizationId,
    queryFn: async () => {
      const { data, error } = await insforge.database
        .from("services")
        .select("*")
        .eq("organization_id", currentOrganizationId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as Service[];
    }
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["services-page", currentOrganizationId] });

  const {
    data: packages = [],
    isError: packagesError,
    refetch: refetchPackages
  } = useQuery({
    queryKey: ["service-packages", currentOrganizationId],
    enabled: !!currentOrganizationId,
    queryFn: async () => {
      const { data, error } = await insforge.database
        .from("service_packages")
        .select("*")
        .eq("organization_id", currentOrganizationId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as ServicePackage[];
    }
  });

  async function addPackage() {
    if (!packageForm.name.trim() || !currentOrganizationId) return;
    if (!isPositiveInteger(packageForm.totalSessions)) {
      toast.error("La cantidad de sesiones debe ser un número entero mayor a 0.");
      return;
    }
    if (packageForm.price && !isNonNegativeNumber(Number(packageForm.price))) {
      toast.error("El precio debe ser un número mayor o igual a 0.");
      return;
    }
    const { error } = await insforge.database.from("service_packages").insert([
      {
        organization_id: currentOrganizationId,
        service_id: packageForm.serviceId || null,
        name: packageForm.name.trim(),
        total_sessions: packageForm.totalSessions,
        price: packageForm.price ? Number(packageForm.price) : null,
        currency: packageForm.currency
      }
    ]);
    if (error) {
      toast.error(error.message);
      return;
    }
    setPackageForm({ name: "", serviceId: "", totalSessions: 10, price: "", currency: packageForm.currency });
    refetchPackages();
  }

  async function togglePackageActive(pkg: ServicePackage) {
    await insforge.database.from("service_packages").update({ is_active: !pkg.is_active }).eq("id", pkg.id);
    refetchPackages();
  }

  async function removePackage(pkg: ServicePackage) {
    await insforge.database.from("service_packages").delete().eq("id", pkg.id);
    refetchPackages();
  }

  async function addService() {
    if (!form.name.trim() || !currentOrganizationId) return;
    if (!isPositiveInteger(form.duration_minutes)) {
      toast.error("La duración debe ser un número entero mayor a 0.");
      return;
    }
    if (form.price && !isNonNegativeNumber(Number(form.price))) {
      toast.error("El precio debe ser un número mayor o igual a 0.");
      return;
    }
    const { error } = await insforge.database.from("services").insert([
      {
        organization_id: currentOrganizationId,
        name: form.name.trim(),
        duration_minutes: form.duration_minutes,
        price: form.price ? Number(form.price) : null,
        currency: form.currency
      }
    ]);
    if (error) {
      toast.error(error.message);
      return;
    }
    setForm({ name: "", duration_minutes: 60, price: "", currency: form.currency });
    invalidate();
  }

  async function toggleActive(service: Service) {
    await insforge.database.from("services").update({ is_active: !service.is_active }).eq("id", service.id);
    invalidate();
  }

  async function remove(service: Service) {
    await insforge.database.from("services").delete().eq("id", service.id);
    invalidate();
  }

  function startEdit(service: Service) {
    setEditingId(service.id);
    setEditForm({
      name: service.name,
      duration_minutes: service.duration_minutes,
      price: service.price?.toString() ?? "",
      currency: service.currency
    });
  }

  async function saveEdit(id: string) {
    if (!editForm.name.trim()) return;
    if (!isPositiveInteger(editForm.duration_minutes)) {
      toast.error("La duración debe ser un número entero mayor a 0.");
      return;
    }
    if (editForm.price && !isNonNegativeNumber(Number(editForm.price))) {
      toast.error("El precio debe ser un número mayor o igual a 0.");
      return;
    }
    const { error } = await insforge.database
      .from("services")
      .update({
        name: editForm.name.trim(),
        duration_minutes: editForm.duration_minutes,
        price: editForm.price ? Number(editForm.price) : null,
        currency: editForm.currency
      })
      .eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setEditingId(null);
    invalidate();
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Servicios</h1>
        <p className="text-sm text-muted-foreground">Catálogo de servicios que ofrece tu negocio.</p>
      </div>

      <div className="flex flex-wrap items-end gap-2 rounded-lg border border-border bg-card p-4">
        <div className="flex-1 space-y-1">
          <label className="text-xs text-muted-foreground">Nombre</label>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ej: Corte de cabello" />
        </div>
        <div className="w-28 space-y-1">
          <label className="text-xs text-muted-foreground">Duración (min)</label>
          <Input type="number" value={form.duration_minutes} onChange={(e) => setForm({ ...form, duration_minutes: Number(e.target.value) })} />
        </div>
        <div className="w-32 space-y-1">
          <label className="text-xs text-muted-foreground">Precio</label>
          <Input type="number" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
        </div>
        <div className="w-36 space-y-1">
          <label className="text-xs text-muted-foreground">Moneda</label>
          <Select value={form.currency} onValueChange={(currency) => setForm({ ...form, currency })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CURRENCY_OPTIONS.map((c) => (
                <SelectItem key={c.code} value={c.code}>
                  {c.code}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={addService}>
          <Plus className="h-4 w-4" /> Agregar
        </Button>
        <Button type="button" variant="outline" onClick={() => setBulkUploadOpen(true)}>
          <UploadCloud className="h-4 w-4" /> Carga masiva
        </Button>
      </div>

      {isError ? (
        <QueryErrorState onRetry={() => refetch()} message="No se pudieron cargar los servicios." />
      ) : (
      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Nombre</th>
              <th className="px-4 py-3">Duración</th>
              <th className="px-4 py-3">Precio</th>
              <th className="px-4 py-3">Activo</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {services.map((s) =>
              editingId === s.id ? (
                <tr key={s.id} className="border-b border-border bg-muted/30 last:border-0">
                  <td className="px-4 py-2">
                    <Input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
                  </td>
                  <td className="px-4 py-2">
                    <Input
                      type="number"
                      className="w-24"
                      value={editForm.duration_minutes}
                      onChange={(e) => setEditForm({ ...editForm, duration_minutes: Number(e.target.value) })}
                    />
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        className="w-28"
                        value={editForm.price}
                        onChange={(e) => setEditForm({ ...editForm, price: e.target.value })}
                      />
                      <Select value={editForm.currency} onValueChange={(currency) => setEditForm({ ...editForm, currency })}>
                        <SelectTrigger className="w-24">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CURRENCY_OPTIONS.map((c) => (
                            <SelectItem key={c.code} value={c.code}>
                              {c.code}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Switch checked={s.is_active} onCheckedChange={() => toggleActive(s)} />
                  </td>
                  <td className="space-x-1 px-4 py-3">
                    <Button variant="ghost" size="icon" onClick={() => saveEdit(s.id)} title="Guardar" aria-label="Guardar">
                      <Check className="h-4 w-4 text-success" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setEditingId(null)} title="Cancelar" aria-label="Cancelar">
                      <X className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ) : (
                <tr key={s.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-medium">{s.name}</td>
                  <td className="px-4 py-3">{s.duration_minutes} min</td>
                  <td className="px-4 py-3">{s.price ? formatCurrency(s.price, s.currency) : "—"}</td>
                  <td className="px-4 py-3">
                    <Switch checked={s.is_active} onCheckedChange={() => toggleActive(s)} />
                  </td>
                  <td className="space-x-1 px-4 py-3">
                    <Button variant="ghost" size="icon" onClick={() => startEdit(s)} title="Editar" aria-label="Editar">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => remove(s)} title="Eliminar" aria-label="Eliminar">
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </td>
                </tr>
              )
            )}
            {!isLoading && services.length === 0 && <EmptyTableRow colSpan={5} message="Todavía no cargaste ningún servicio." />}
          </tbody>
        </table>
      </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Paquetes de sesiones</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Para negocios que venden sesiones por adelantado (ej. "10 sesiones de fisioterapia"). Se venden a un cliente puntual
            desde su ficha en Clientes, y el agente descuenta una sesión cada vez que reserva usando el paquete.
          </p>
          <div className="flex flex-wrap items-end gap-2 rounded-md border border-border p-3">
            <div className="flex-1 space-y-1">
              <Label className="text-xs text-muted-foreground">Nombre del paquete</Label>
              <Input
                value={packageForm.name}
                onChange={(e) => setPackageForm({ ...packageForm, name: e.target.value })}
                placeholder="Ej: 10 sesiones de fisioterapia"
              />
            </div>
            <div className="w-48 space-y-1">
              <Label className="text-xs text-muted-foreground">Servicio (opcional)</Label>
              <Select
                value={packageForm.serviceId || "none"}
                onValueChange={(v) => setPackageForm({ ...packageForm, serviceId: v === "none" ? "" : v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin servicio específico</SelectItem>
                  {services.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-28 space-y-1">
              <Label className="text-xs text-muted-foreground">Sesiones</Label>
              <Input
                type="number"
                value={packageForm.totalSessions}
                onChange={(e) => setPackageForm({ ...packageForm, totalSessions: Number(e.target.value) })}
              />
            </div>
            <div className="w-32 space-y-1">
              <Label className="text-xs text-muted-foreground">Precio</Label>
              <Input type="number" value={packageForm.price} onChange={(e) => setPackageForm({ ...packageForm, price: e.target.value })} />
            </div>
            <div className="w-28 space-y-1">
              <Label className="text-xs text-muted-foreground">Moneda</Label>
              <Select value={packageForm.currency} onValueChange={(currency) => setPackageForm({ ...packageForm, currency })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCY_OPTIONS.map((c) => (
                    <SelectItem key={c.code} value={c.code}>
                      {c.code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={addPackage}>
              <Plus className="h-4 w-4" /> Agregar
            </Button>
          </div>

          {packagesError ? (
            <QueryErrorState onRetry={() => refetchPackages()} message="No se pudieron cargar los paquetes." />
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Nombre</th>
                    <th className="px-4 py-3">Servicio</th>
                    <th className="px-4 py-3">Sesiones</th>
                    <th className="px-4 py-3">Precio</th>
                    <th className="px-4 py-3">Activo</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {packages.map((p) => (
                    <tr key={p.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-3 font-medium">{p.name}</td>
                      <td className="px-4 py-3">{services.find((s) => s.id === p.service_id)?.name ?? "—"}</td>
                      <td className="px-4 py-3">{p.total_sessions}</td>
                      <td className="px-4 py-3">{p.price ? formatCurrency(p.price, p.currency) : "—"}</td>
                      <td className="px-4 py-3">
                        <Switch checked={p.is_active} onCheckedChange={() => togglePackageActive(p)} />
                      </td>
                      <td className="px-4 py-3">
                        <Button variant="ghost" size="icon" onClick={() => removePackage(p)} title="Eliminar" aria-label="Eliminar">
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {packages.length === 0 && <EmptyTableRow colSpan={6} message="Todavía no creaste ningún paquete." />}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {currentOrganizationId && (
        <BulkUploadServicesDialog
          open={bulkUploadOpen}
          onOpenChange={setBulkUploadOpen}
          organizationId={currentOrganizationId}
          defaultCurrency={form.currency}
          onUploaded={invalidate}
        />
      )}
    </div>
  );
}
