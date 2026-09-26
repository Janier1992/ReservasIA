import { Link, Outlet } from "react-router-dom";
import { Lock } from "lucide-react";
import { useOrganization } from "@/hooks/useOrganization";
import { isModuleEnabled, type ModuleKey } from "@/lib/modules";
import { buttonVariants } from "@/components/ui/button";

/**
 * Bloquea una sección del dashboard si soporte apagó su módulo para este
 * negocio. El menú ya la esconde; esto cubre el acceso por URL directa o
 * por un link desde otra pantalla.
 */
export function RequireModule({ module }: { module: ModuleKey }) {
  const { memberships, currentOrganizationId } = useOrganization();
  const disabled = memberships.find((m) => m.organization_id === currentOrganizationId)?.organizations.disabled_modules;

  if (isModuleEnabled(disabled, module)) return <Outlet />;

  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <div className="max-w-md space-y-4 rounded-lg border border-border bg-card p-6 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Lock className="h-5 w-5" />
        </div>
        <h1 className="font-display text-xl font-semibold">Módulo no disponible</h1>
        <p className="text-sm text-muted-foreground">
          Esta sección no está habilitada para tu negocio. Si la necesitás, escribinos a soporte: synflow.ia@gmail.com
        </p>
        <Link to="/dashboard" className={buttonVariants({ variant: "outline" })}>
          Volver al inicio
        </Link>
      </div>
    </div>
  );
}
