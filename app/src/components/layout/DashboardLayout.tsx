import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  CalendarClock,
  Inbox,
  Users,
  Sparkles,
  Boxes,
  Bot,
  Plug,
  UsersRound,
  Settings,
  LogOut,
  LayoutDashboard,
  Menu,
  X
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useOrganization } from "@/hooks/useOrganization";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const NAV_ITEMS = [
  { to: "/dashboard", label: "Inicio", icon: LayoutDashboard, end: true },
  { to: "/dashboard/inbox", label: "Inbox", icon: Inbox },
  { to: "/dashboard/reservations", label: "Reservas", icon: CalendarClock },
  { to: "/dashboard/customers", label: "Clientes", icon: Users },
  { to: "/dashboard/services", label: "Servicios", icon: Sparkles },
  { to: "/dashboard/resources", label: "Recursos", icon: Boxes },
  { to: "/dashboard/agent", label: "Agente IA", icon: Bot },
  { to: "/dashboard/integrations", label: "Integraciones", icon: Plug },
  { to: "/dashboard/team", label: "Equipo", icon: UsersRound },
  { to: "/dashboard/settings", label: "Configuración", icon: Settings }
];

export function DashboardLayout() {
  const { user, signOut } = useAuth();
  const { memberships, currentOrganizationId, setCurrentOrganizationId } = useOrganization();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const location = useLocation();

  // Cierra el drawer al navegar, así el usuario no tiene que cerrarlo manualmente en cada tap.
  useEffect(() => setMobileNavOpen(false), [location.pathname]);

  const sidebarContent = (
    <>
      <div className="flex h-16 items-center gap-2 border-b border-border px-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <CalendarClock className="h-4 w-4" />
        </div>
        <span className="font-semibold">Reservas AI</span>
        <button
          className="ml-auto rounded-md p-1.5 text-foreground/60 hover:bg-muted lg:hidden"
          onClick={() => setMobileNavOpen(false)}
          aria-label="Cerrar menú"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {memberships.length > 1 && (
        <div className="p-3">
          <Select value={currentOrganizationId ?? undefined} onValueChange={setCurrentOrganizationId}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {memberships.map((m) => (
                <SelectItem key={m.organization_id} value={m.organization_id}>
                  {m.organizations.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive ? "bg-primary/10 text-primary" : "text-foreground/80 hover:bg-muted"
              )
            }
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-border p-3">
        <div className="mb-2 truncate text-xs text-muted-foreground">{user?.email}</div>
        <button
          onClick={() => signOut()}
          className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-foreground/80 hover:bg-muted"
        >
          <LogOut className="h-4 w-4" /> Cerrar sesión
        </button>
      </div>
    </>
  );

  return (
    <div className="flex h-dvh bg-background">
      {/* Sidebar: drawer deslizable en mobile, fija en desktop (lg+) */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] shrink-0 flex-col border-r border-border bg-card transition-transform duration-200 ease-in-out lg:static lg:z-auto lg:w-64 lg:max-w-none lg:translate-x-0",
          mobileNavOpen ? "translate-x-0 shadow-xl" : "-translate-x-full"
        )}
      >
        {sidebarContent}
      </aside>

      {mobileNavOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={() => setMobileNavOpen(false)}
          aria-hidden="true"
        />
      )}

      <div className="flex h-dvh flex-1 flex-col overflow-hidden">
        {/* Barra superior: sólo visible en mobile, para abrir el menú (la sidebar ya está siempre visible en desktop).
            shrink-0 + el contenedor padre con overflow-hidden y altura fija (h-dvh) es lo que la mantiene
            estática: sin una altura fija acá, el navegador scrollea toda la página en vez de sólo <main>,
            y esta barra se desplaza con el resto en vez de quedar fija arriba. */}
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-card px-4 lg:hidden">
          <button
            className="rounded-md p-1.5 text-foreground/70 hover:bg-muted"
            onClick={() => setMobileNavOpen(true)}
            aria-label="Abrir menú"
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className="flex-1 font-semibold">Reservas AI</span>
        </header>

        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
