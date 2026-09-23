import { useQuery } from "@tanstack/react-query";
import { insforge } from "@/lib/insforgeClient";
import { useOrganization } from "./useOrganization";

interface BusinessBranding {
  name: string;
  logo_url: string | null;
}

/**
 * Nombre y logo del negocio para reemplazar el branding genérico
 * "ReservasIA" en el menú lateral. Consulta liviana (2 columnas), separada
 * del query completo de business_profiles que usa SettingsPage.
 */
export function useBusinessBranding(): BusinessBranding | null {
  const { currentOrganizationId } = useOrganization();

  const { data } = useQuery({
    queryKey: ["business-branding", currentOrganizationId],
    enabled: !!currentOrganizationId,
    queryFn: async () => {
      const { data, error } = await insforge.database
        .from("business_profiles")
        .select("name, logo_url")
        .eq("organization_id", currentOrganizationId)
        .single();
      if (error) throw error;
      return data as BusinessBranding;
    }
  });

  return data ?? null;
}
