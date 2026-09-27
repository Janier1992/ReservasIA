import type { LucideIcon } from "lucide-react";
import { MapPin, Phone } from "lucide-react";
import type { PublicBusiness } from "@/lib/publicApi";

/** Logo, nombre y datos de contacto del negocio en sus páginas públicas. */
export function PublicBusinessHeader({ business, icon: Icon }: { business: PublicBusiness; icon: LucideIcon }) {
  return (
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
  );
}
