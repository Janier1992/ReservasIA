import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { UserPlus, X } from "lucide-react";
import { insforge } from "@/lib/insforgeClient";
import { useOrganization } from "@/hooks/useOrganization";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { OrganizationRole } from "@/types/domain";

interface TeamMemberRow {
  id: string;
  user_id: string;
  role: OrganizationRole;
}

interface TeamMemberProfile extends TeamMemberRow {
  fullName: string | null;
}

interface InviteRow {
  id: string;
  email: string;
  role: "admin" | "staff";
  status: string;
}

export function TeamPage() {
  const { currentOrganizationId, currentRole } = useOrganization();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [invite, setInvite] = useState({ email: "", role: "staff" as "admin" | "staff" });
  const canManage = currentRole === "owner" || currentRole === "admin";

  const { data: members = [] } = useQuery({
    queryKey: ["team-members", currentOrganizationId],
    enabled: !!currentOrganizationId,
    queryFn: async () => {
      const { data, error } = await insforge.database
        .from("organization_members")
        .select("id, user_id, role")
        .eq("organization_id", currentOrganizationId)
        .order("created_at", { ascending: true });
      if (error) throw error;

      const rows = (data ?? []) as TeamMemberRow[];
      const withProfiles = await Promise.all(
        rows.map(async (m) => {
          const { data: profile } = await insforge.auth.getProfile(m.user_id);
          return { ...m, fullName: (profile as { name?: string } | null)?.name ?? null } as TeamMemberProfile;
        })
      );
      return withProfiles;
    }
  });

  const { data: invites = [] } = useQuery({
    queryKey: ["team-invites", currentOrganizationId],
    enabled: !!currentOrganizationId && canManage,
    queryFn: async () => {
      const { data, error } = await insforge.database
        .from("organization_invites")
        .select("id, email, role, status")
        .eq("organization_id", currentOrganizationId)
        .eq("status", "pending")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as InviteRow[];
    }
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["team-members", currentOrganizationId] });
    queryClient.invalidateQueries({ queryKey: ["team-invites", currentOrganizationId] });
  };

  async function sendInvite() {
    if (!invite.email.trim() || !currentOrganizationId) return;
    try {
      const { data: userResult } = await insforge.auth.getCurrentUser();
      const { error } = await insforge.database.from("organization_invites").insert([
        {
          organization_id: currentOrganizationId,
          email: invite.email.trim().toLowerCase(),
          role: invite.role,
          invited_by: userResult?.user?.id
        }
      ]);
      if (error) throw error;
      toast.success("Invitación creada. Pedile a la persona que inicie sesión con ese email y la acepte.");
      setInvite({ email: "", role: "staff" });
      setDialogOpen(false);
      invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo crear la invitación.");
    }
  }

  async function revokeInvite(inviteId: string) {
    const { error } = await insforge.database.from("organization_invites").delete().eq("id", inviteId);
    if (error) {
      toast.error(error.message);
      return;
    }
    invalidate();
  }

  async function changeRole(memberId: string, role: "admin" | "staff") {
    const { error } = await insforge.database.from("organization_members").update({ role }).eq("id", memberId);
    if (error) {
      toast.error(error.message);
      return;
    }
    invalidate();
  }

  async function revoke(memberId: string) {
    const { error } = await insforge.database.from("organization_members").delete().eq("id", memberId);
    if (error) {
      toast.error(error.message);
      return;
    }
    invalidate();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Equipo</h1>
          <p className="text-sm text-muted-foreground">Gestioná quién tiene acceso a tu negocio.</p>
        </div>
        {canManage && (
          <Button onClick={() => setDialogOpen(true)}>
            <UserPlus className="h-4 w-4" /> Invitar usuario
          </Button>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Nombre</th>
              <th className="px-4 py-3">Rol</th>
              {canManage && <th className="px-4 py-3" />}
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3">{m.fullName || "Sin nombre"}</td>
                <td className="px-4 py-3">
                  {canManage && m.role !== "owner" ? (
                    <Select value={m.role} onValueChange={(v) => changeRole(m.id, v as "admin" | "staff")}>
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="staff">Staff</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <Badge variant={m.role === "owner" ? "default" : "muted"} className="capitalize">
                      {m.role}
                    </Badge>
                  )}
                </td>
                {canManage && (
                  <td className="px-4 py-3">
                    {m.role !== "owner" && (
                      <Button variant="ghost" size="sm" onClick={() => revoke(m.id)}>
                        Revocar
                      </Button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {canManage && invites.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="mb-2 text-sm font-semibold">Invitaciones pendientes</h3>
          <div className="space-y-2">
            {invites.map((i) => (
              <div key={i.id} className="flex items-center justify-between rounded-md border border-border p-2 text-sm">
                <span>
                  {i.email} · <span className="capitalize text-muted-foreground">{i.role}</span>
                </span>
                <Button variant="ghost" size="icon" onClick={() => revokeInvite(i.id)}>
                  <X className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invitar usuario</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              La persona invitada debe registrarse o iniciar sesión con este email para poder aceptar la invitación.
            </p>
            <Input placeholder="email@negocio.com" value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} />
            <Select value={invite.role} onValueChange={(v) => setInvite({ ...invite, role: v as "admin" | "staff" })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="staff">Staff</SelectItem>
              </SelectContent>
            </Select>
            <Button className="w-full" onClick={sendInvite}>
              Crear invitación
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
