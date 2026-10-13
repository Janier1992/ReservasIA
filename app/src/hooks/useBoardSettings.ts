import { useQuery, useQueryClient } from "@tanstack/react-query";
import { insforge } from "@/lib/insforgeClient";
import { useOrganization } from "@/hooks/useOrganization";

export interface BoardSettings {
  /** Minutos de espera para marcar "Demorado" y sonar; null = sin alerta. */
  wait_alert_minutes: number | null;
  /** Modo pantalla: sin precios ni totales. */
  display_hide_prices: boolean;
  /** Modo pantalla: nombres abreviados ("Andrea G."). */
  display_hide_names: boolean;
}

export const DEFAULT_BOARD_SETTINGS: BoardSettings = { wait_alert_minutes: 15, display_hide_prices: false, display_hide_names: false };

/** Ajustes del tablero de Atención en sitio, guardados en el perfil del negocio. */
export function useBoardSettings() {
  const { currentOrganizationId } = useOrganization();
  const queryClient = useQueryClient();
  const queryKey = ["board-settings", currentOrganizationId];

  const { data } = useQuery({
    queryKey,
    enabled: !!currentOrganizationId,
    queryFn: async (): Promise<BoardSettings> => {
      const { data, error } = await insforge.database
        .from("business_profiles")
        .select("wait_alert_minutes, display_hide_prices, display_hide_names")
        .eq("organization_id", currentOrganizationId)
        .maybeSingle();
      // Sin la migración todavía (columnas inexistentes): valores por defecto.
      if (error || !data) return DEFAULT_BOARD_SETTINGS;
      return { ...DEFAULT_BOARD_SETTINGS, ...(data as Partial<BoardSettings>) };
    }
  });

  async function save(next: BoardSettings): Promise<string | null> {
    const { error } = await insforge.database.from("business_profiles").update(next).eq("organization_id", currentOrganizationId);
    if (error) return error.message ?? "No se pudieron guardar los ajustes.";
    queryClient.setQueryData(queryKey, next);
    return null;
  }

  return { settings: data ?? DEFAULT_BOARD_SETTINGS, save };
}
