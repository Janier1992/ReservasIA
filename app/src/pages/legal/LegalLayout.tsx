import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { CalendarClock } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";

export const LEGAL_CONTACT_EMAIL = "synflow.ia@gmail.com";
export const LEGAL_UPDATED_AT = "23 de octubre de 2026";

/** Página legal pública (sin sesión): la enlazan Google, el login y el registro. */
export function LegalLayout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-4">
          <Link to="/login" className="flex items-center gap-2 font-semibold">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <CalendarClock className="h-5 w-5" aria-hidden="true" />
            </span>
            ReservasIA
          </Link>
          <ThemeToggle />
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="font-display text-3xl font-semibold">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">Última actualización: {LEGAL_UPDATED_AT}</p>
        <div className="legal-content mt-8 space-y-6 text-sm leading-relaxed text-foreground/90 [&_h2]:mt-10 [&_h2]:font-display [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-foreground [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-1.5">
          {children}
        </div>
      </main>
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-6 text-xs text-muted-foreground">
          <span>© 2026 ReservasIA</span>
          <Link to="/privacidad" className="hover:text-foreground hover:underline">
            Política de privacidad
          </Link>
          <Link to="/terminos" className="hover:text-foreground hover:underline">
            Condiciones del servicio
          </Link>
          <a href={`mailto:${LEGAL_CONTACT_EMAIL}`} className="hover:text-foreground hover:underline">
            {LEGAL_CONTACT_EMAIL}
          </a>
        </div>
      </footer>
    </div>
  );
}

/** Enlaces a las páginas legales, para el pie del login y el registro. */
export function LegalLinks() {
  return (
    <p className="text-center text-xs text-muted-foreground">
      <Link to="/privacidad" className="hover:text-foreground hover:underline">
        Política de privacidad
      </Link>
      {" · "}
      <Link to="/terminos" className="hover:text-foreground hover:underline">
        Condiciones del servicio
      </Link>
    </p>
  );
}
