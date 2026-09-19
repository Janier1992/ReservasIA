import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { insforge } from "@/lib/insforgeClient";
import { useOrganization } from "@/hooks/useOrganization";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { EmptyTableRow } from "@/components/EmptyTableRow";
import { QueryErrorState } from "@/components/QueryErrorState";
import { isPositiveInteger } from "@/lib/validation";
import type { Resource } from "@/types/domain";

export function ResourcesPage() {
  const { currentOrganizationId } = useOrganization();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ name: "", resource_type: "", capacity: 1 });

  const {
    data: resources = [],
    isError,
    isLoading,
    refetch
  } = useQuery({
    queryKey: ["resources-page", currentOrganizationId],
    enabled: !!currentOrganizationId,
    queryFn: async () => {
      const { data, error } = await insforge.database
        .from("resources")
        .select("*")
        .eq("organization_id", currentOrganizationId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as Resource[];
    }
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["resources-page", currentOrganizationId] });

  async function addResource() {
    if (!form.name.trim() || !currentOrganizationId) return;
    if (!isPositiveInteger(form.capacity)) {
      toast.error("La capacidad debe ser un número entero mayor a 0.");
      return;
    }
    const { error } = await insforge.database.from("resources").insert([
      {
        organization_id: currentOrganizationId,
        name: form.name.trim(),
        resource_type: form.resource_type || null,
        capacity: form.capacity
      }
    ]);
    if (error) {
      toast.error(error.message);
      return;
    }
    setForm({ name: "", resource_type: "", capacity: 1 });
    invalidate();
  }

  async function toggleActive(resource: Resource) {
    await insforge.database.from("resources").update({ is_active: !resource.is_active }).eq("id", resource.id);
    invalidate();
  }

  async function remove(resource: Resource) {
    await insforge.database.from("resources").delete().eq("id", resource.id);
    invalidate();
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Recursos</h1>
        <p className="text-sm text-muted-foreground">Mesas, personal o cualquier unidad que se reserva individualmente.</p>
      </div>

      <div className="flex flex-wrap items-end gap-2 rounded-lg border border-border bg-card p-4">
        <div className="flex-1 space-y-1">
          <label className="text-xs text-muted-foreground">Nombre</label>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ej: Mesa 1" />
        </div>
        <div className="w-40 space-y-1">
          <label className="text-xs text-muted-foreground">Tipo</label>
          <Input value={form.resource_type} onChange={(e) => setForm({ ...form, resource_type: e.target.value })} placeholder="table" />
        </div>
        <div className="w-24 space-y-1">
          <label className="text-xs text-muted-foreground">Capacidad</label>
          <Input type="number" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: Number(e.target.value) })} />
        </div>
        <Button onClick={addResource}>
          <Plus className="h-4 w-4" /> Agregar
        </Button>
      </div>

      {isError ? (
        <QueryErrorState onRetry={() => refetch()} message="No se pudieron cargar los recursos." />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Nombre</th>
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3">Capacidad</th>
                <th className="px-4 py-3">Activo</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {resources.map((r) => (
                <tr key={r.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-medium">{r.name}</td>
                  <td className="px-4 py-3">{r.resource_type || "—"}</td>
                  <td className="px-4 py-3">{r.capacity}</td>
                  <td className="px-4 py-3">
                    <Switch checked={r.is_active} onCheckedChange={() => toggleActive(r)} />
                  </td>
                  <td className="px-4 py-3">
                    <Button variant="ghost" size="icon" onClick={() => remove(r)} title="Eliminar" aria-label="Eliminar recurso">
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </td>
                </tr>
              ))}
              {!isLoading && resources.length === 0 && <EmptyTableRow colSpan={5} message="Todavía no cargaste ningún recurso." />}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
