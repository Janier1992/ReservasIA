import { useEffect } from "react";
import { useOrganization } from "./useOrganization";
import { buildBusinessThemeCss, getBusinessTheme, type BusinessTheme } from "@/lib/businessThemes";

const STYLE_ID = "business-theme-style";
const FONT_LINK_ID = "business-theme-font";

/** Tema del negocio activo, sin aplicarlo (para leer vocabulario e ícono). */
export function useCurrentBusinessTheme(): BusinessTheme {
  const { memberships, currentOrganizationId } = useOrganization();
  const businessType = memberships.find((m) => m.organization_id === currentOrganizationId)?.organizations.business_type;
  return getBusinessTheme(businessType);
}

/**
 * Aplica el tema del rubro a toda la página mientras el dashboard está
 * montado: `data-business-theme` en <html> más una <style> con sus
 * variables, y carga la tipografía de títulos solo de ese rubro. Al salir
 * (ej. al ir a /soporte) se limpia y vuelve la apariencia base.
 */
export function useApplyBusinessTheme(): BusinessTheme {
  const theme = useCurrentBusinessTheme();

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-business-theme", theme.businessType);

    let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      document.head.appendChild(style);
    }
    style.textContent = buildBusinessThemeCss(theme);

    document.getElementById(FONT_LINK_ID)?.remove();
    if (theme.displayFont) {
      const link = document.createElement("link");
      link.id = FONT_LINK_ID;
      link.rel = "stylesheet";
      link.href = `https://fonts.googleapis.com/css2?family=${theme.displayFont.googleSpec}&display=swap`;
      document.head.appendChild(link);
    }

    return () => {
      root.removeAttribute("data-business-theme");
      document.getElementById(STYLE_ID)?.remove();
      document.getElementById(FONT_LINK_ID)?.remove();
    };
  }, [theme]);

  return theme;
}
