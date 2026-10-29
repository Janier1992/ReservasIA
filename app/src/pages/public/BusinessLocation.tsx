import { MapPin, Navigation } from "lucide-react";
import type { PublicBusiness } from "@/lib/publicApi";

/** Dirección del negocio, sus indicaciones y el enlace para abrirla en el mapa. */
export function BusinessLocation({ business }: { business: Pick<PublicBusiness, "address" | "addressDetails" | "mapsUrl"> }) {
  if (!business.address && !business.mapsUrl) return null;
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
      {business.address && (
        <span className="flex items-center gap-1.5">
          <MapPin className="h-4 w-4 shrink-0" /> {business.address}
          {business.addressDetails && <span className="text-muted-foreground/80">({business.addressDetails})</span>}
        </span>
      )}
      {business.mapsUrl && (
        <a
          href={business.mapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline"
        >
          <Navigation className="h-3.5 w-3.5" /> Cómo llegar
        </a>
      )}
    </span>
  );
}
