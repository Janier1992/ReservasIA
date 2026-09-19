import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { insforge } from "@/lib/insforgeClient";
import { useOrganization } from "@/hooks/useOrganization";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { EmptyTableRow } from "@/components/EmptyTableRow";
import { QueryErrorState } from "@/components/QueryErrorState";
import { reservationStatusLabel, reservationStatusVariant } from "@/lib/reservationStatus";
import { isValidEmail } from "@/lib/validation";
import type { Customer, Reservation } from "@/types/domain";

export function CustomersPage() {
  const { currentOrganizationId } = useOrganization();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Customer | null>(null);
  const [editForm, setEditForm] = useState({ name: "", email: "", notes: "" });

  useEffect(() => {
    if (selected) setEditForm({ name: selected.name ?? "", email: selected.email ?? "", notes: selected.notes ?? "" });
  }, [selected]);

  const {
    data: customers = [],
    isError,
    isLoading,
    refetch
  } = useQuery({
    queryKey: ["customers", currentOrganizationId, search],
    enabled: !!currentOrganizationId,
    queryFn: async () => {
      let query = insforge.database
        .from("customers")
        .select("*")
        .eq("organization_id", currentOrganizationId)
        .order("created_at", { ascending: false });
      if (search.trim()) query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%`);
      const { data, error } = await query;
      if (error) throw error;
      return data as Customer[];
    }
  });

  const { data: customerReservations = [] } = useQuery({
    queryKey: ["customer-detail-reservations", selected?.id],
    enabled: !!selected,
    queryFn: async () => {
      const { data, error } = await insforge.database
        .from("reservations")
        .select("*")
        .eq("customer_id", selected!.id)
        .order("start_at", { ascending: false });
      if (error) throw error;
      return data as Reservation[];
    }
  });

  async function removeCustomer(customer: Customer) {
    const { error } = await insforge.database.from("customers").delete().eq("id", customer.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Cliente eliminado.");
    if (selected?.id === customer.id) setSelected(null);
    queryClient.invalidateQueries({ queryKey: ["customers", currentOrganizationId] });
  }

  async function saveCustomerDetails() {
    if (!selected) return;
    if (editForm.email.trim() && !isValidEmail(editForm.email)) {
      toast.error("El email no tiene un formato válido.");
      return;
    }
    const { error } = await insforge.database
      .from("customers")
      .update({
        name: editForm.name.trim() || null,
        email: editForm.email.trim() || null,
        notes: editForm.notes.trim() || null
      })
      .eq("id", selected.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Cliente actualizado.");
    queryClient.invalidateQueries({ queryKey: ["customers", currentOrganizationId] });
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Clientes</h1>
        <p className="text-sm text-muted-foreground">Historial y datos de contacto.</p>
      </div>

      <Input placeholder="Buscar por nombre o teléfono..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />

      {isError ? (
        <QueryErrorState onRetry={() => refetch()} message="No se pudieron cargar los clientes." />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Nombre</th>
                <th className="px-4 py-3">Teléfono</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Notas</th>
                <th className="px-4 py-3">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.id} className="cursor-pointer border-b border-border last:border-0 hover:bg-muted/50" onClick={() => setSelected(c)}>
                  <td className="px-4 py-3 font-medium">{c.name || "Sin nombre"}</td>
                  <td className="px-4 py-3">{c.phone}</td>
                  <td className="px-4 py-3">{c.email || "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{c.notes || "—"}</td>
                  <td className="px-4 py-3">
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Eliminar cliente"
                      aria-label="Eliminar cliente"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeCustomer(c);
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </td>
                </tr>
              ))}
              {!isLoading && customers.length === 0 && <EmptyTableRow colSpan={5} message="No hay clientes todavía." />}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selected?.name || "Cliente"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-sm">
            <p className="text-muted-foreground">{selected?.phone}</p>

            <div className="space-y-3 rounded-md border border-border p-3">
              <div className="space-y-1.5">
                <Label>Nombre</Label>
                <Input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  placeholder="cliente@email.com"
                />
                <p className="text-xs text-muted-foreground">
                  Si el negocio tiene Google Calendar conectado, sus próximas reservas se le invitan a este email.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>Notas</Label>
                <Textarea value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} />
              </div>
              <Button size="sm" onClick={saveCustomerDetails}>
                Guardar
              </Button>
            </div>

            <div>
              <h4 className="mb-2 font-medium">Historial de reservas</h4>
              <div className="space-y-2">
                {customerReservations.map((r) => (
                  <div key={r.id} className="flex items-center justify-between rounded-md border border-border p-2">
                    <span>{new Date(r.start_at).toLocaleString()}</span>
                    <Badge variant={reservationStatusVariant(r.status)}>{reservationStatusLabel(r.status)}</Badge>
                  </div>
                ))}
                {customerReservations.length === 0 && <p className="text-muted-foreground">Sin reservas.</p>}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
