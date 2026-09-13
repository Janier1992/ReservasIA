import { Navigate, Outlet } from "react-router-dom";
import { useOrganization } from "@/hooks/useOrganization";
import { usePendingInvitesForMe } from "@/hooks/usePendingInvites";
import { AcceptInvites } from "./AcceptInvites";
import { FullscreenLoader } from "./RequireAuth";

/**
 * Si el usuario todavía no tiene ninguna organización, revisa primero si
 * tiene invitaciones pendientes (de un owner/admin que lo invitó) antes de
 * mandarlo al wizard de onboarding para crear un negocio propio.
 */
export function RequireOrganization() {
  const { memberships, isLoading, currentOrganizationId } = useOrganization();
  const { data: pendingInvites = [], isLoading: invitesLoading, refetch: refetchInvites } = usePendingInvitesForMe();

  if (isLoading || invitesLoading) return <FullscreenLoader />;

  if (memberships.length === 0 || !currentOrganizationId) {
    if (pendingInvites.length > 0) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-background px-4">
          <div className="w-full max-w-md space-y-4">
            <div className="text-center">
              <h1 className="text-xl font-semibold">Te invitaron a un equipo</h1>
              <p className="text-sm text-muted-foreground">Aceptá para empezar a colaborar.</p>
            </div>
            <AcceptInvites onAccepted={() => refetchInvites()} />
          </div>
        </div>
      );
    }
    return <Navigate to="/onboarding" replace />;
  }

  return <Outlet />;
}
