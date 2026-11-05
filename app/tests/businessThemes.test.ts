import { describe, expect, it } from "vitest";
import { BUSINESS_THEMES, buildBusinessThemeCss, darkSurfaces, getBusinessTheme, lightSurfaces, mixRgb } from "@/lib/businessThemes";
import { BUSINESS_TYPES } from "@/lib/businessTypes";

// Fondo y tarjeta del modo oscuro base (index.css): en oscuro los temas no
// cambian el fondo, así que el acento se mide contra estos.
const DARK_BACKGROUND = "27 24 21";
const DARK_CARD = "33 29 25";
const WHITE = "255 255 255";

function luminance(rgb: string): number {
  const [r, g, b] = rgb.split(" ").map((c) => {
    const v = Number(c) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe("temas de color por rubro", () => {
  it("tiene un tema para cada tipo de negocio del catálogo de alta", () => {
    for (const type of BUSINESS_TYPES) {
      expect(getBusinessTheme(type.value).businessType, type.value).toBe(type.value);
    }
  });

  it("usa el aspecto base para un tipo de negocio desconocido", () => {
    const theme = getBusinessTheme("floristeria");
    expect(theme.light).toBeNull();
    expect(theme.vocabulary.reservations).toBe("Reservas");
    expect(buildBusinessThemeCss(theme)).toBe("");
  });

  it("mantiene un contraste de texto legible (WCAG AA 4.5:1) en cada paleta clara", () => {
    for (const { businessType, light } of BUSINESS_THEMES) {
      if (!light) continue;
      const surfaces = lightSurfaces(light);
      const pairs: [string, string, string][] = [
        ["primary text on primary", light.primaryForeground, light.primary],
        ["primary as text on background", light.primary, light.background],
        ["primary as text on card", light.primary, WHITE],
        ["foreground on background", light.foreground, light.background],
        ["muted text on background", light.mutedForeground, light.background],
        ["muted text on card", light.mutedForeground, WHITE],
        ["sidebar text", surfaces.sidebarForeground, surfaces.sidebar],
        ["sidebar muted text", surfaces.sidebarMuted, surfaces.sidebar],
        ["active nav item", surfaces.sidebarActiveForeground, surfaces.sidebarActive]
      ];
      for (const [label, fg, bg] of pairs) {
        expect(contrast(fg, bg), `${businessType}: ${label}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("mantiene un contraste de texto legible en cada paleta oscura", () => {
    for (const { businessType, dark } of BUSINESS_THEMES) {
      if (!dark) continue;
      const surfaces = darkSurfaces(dark);
      const pairs: [string, string, string][] = [
        ["primary text on primary", dark.primaryForeground, dark.primary],
        ["primary as text on background", dark.primary, DARK_BACKGROUND],
        ["primary as text on card", dark.primary, DARK_CARD],
        ["sidebar text", surfaces.sidebarForeground, surfaces.sidebar],
        ["sidebar muted text", surfaces.sidebarMuted, surfaces.sidebar],
        ["active nav item", surfaces.sidebarActiveForeground, surfaces.sidebarActive]
      ];
      for (const [label, fg, bg] of pairs) {
        expect(contrast(fg, bg), `${businessType} (dark): ${label}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("mezcla colores para el tono suave de acento", () => {
    expect(mixRgb("0 0 0", "255 255 255", 0.1)).toBe("230 230 230");
  });

  it("limita la paleta clara para que nunca pise el modo oscuro", () => {
    const css = buildBusinessThemeCss(getBusinessTheme("car_wash"));
    expect(css).toContain(':root[data-business-theme="car_wash"]:not(.dark) {');
    expect(css).toContain(':root[data-business-theme="car_wash"].dark {');
    expect(css).toContain('--font-display: "Sora"');
  });

  it("nombra las secciones con las palabras del propio negocio", () => {
    expect(getBusinessTheme("restaurant").vocabulary.resources).toBe("Mesas");
    expect(getBusinessTheme("dental").vocabulary.customers).toBe("Pacientes");
    expect(getBusinessTheme("car_wash").vocabulary.resources).toBe("Bahías de lavado");
  });
});
