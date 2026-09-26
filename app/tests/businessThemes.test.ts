import { describe, expect, it } from "vitest";
import { BUSINESS_THEMES, buildBusinessThemeCss, getBusinessTheme } from "@/lib/businessThemes";
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

describe("business themes", () => {
  it("has a theme for every business type in the onboarding catalog", () => {
    for (const type of BUSINESS_TYPES) {
      expect(getBusinessTheme(type.value).businessType, type.value).toBe(type.value);
    }
  });

  it("falls back to the base look for an unknown business type", () => {
    const theme = getBusinessTheme("floristeria");
    expect(theme.light).toBeNull();
    expect(theme.vocabulary.reservations).toBe("Reservas");
    expect(buildBusinessThemeCss(theme)).toBe("");
  });

  it("keeps readable text contrast (WCAG AA 4.5:1) in every light palette", () => {
    for (const { businessType, light } of BUSINESS_THEMES) {
      if (!light) continue;
      const pairs: [string, string, string][] = [
        ["primary text on primary", light.primaryForeground, light.primary],
        ["primary as text on background", light.primary, light.background],
        ["primary as text on card", light.primary, WHITE],
        ["foreground on background", light.foreground, light.background],
        ["muted text on background", light.mutedForeground, light.background],
        ["sidebar text", light.sidebarForeground, light.sidebar],
        ["sidebar muted text", light.sidebarMuted, light.sidebar],
        ["active nav item", light.sidebarActiveForeground, light.sidebarActive],
        ["hero text", light.heroForeground, light.hero]
      ];
      for (const [label, fg, bg] of pairs) {
        expect(contrast(fg, bg), `${businessType}: ${label}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("keeps readable text contrast in every dark palette", () => {
    for (const { businessType, dark } of BUSINESS_THEMES) {
      if (!dark) continue;
      const pairs: [string, string, string][] = [
        ["primary text on primary", dark.primaryForeground, dark.primary],
        ["primary as text on background", dark.primary, DARK_BACKGROUND],
        ["primary as text on card", dark.primary, DARK_CARD],
        ["sidebar text", dark.sidebarForeground, dark.sidebar],
        ["sidebar muted text", dark.sidebarMuted, dark.sidebar],
        ["active nav item", dark.sidebarActiveForeground, dark.sidebarActive],
        ["hero text", dark.heroForeground, dark.hero]
      ];
      for (const [label, fg, bg] of pairs) {
        expect(contrast(fg, bg), `${businessType} (dark): ${label}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("scopes the light palette away from dark mode so it never overrides it", () => {
    const css = buildBusinessThemeCss(getBusinessTheme("car_wash"));
    expect(css).toContain(':root[data-business-theme="car_wash"]:not(.dark) {');
    expect(css).toContain(':root[data-business-theme="car_wash"].dark {');
    expect(css).toContain('--font-display: "Sora"');
  });

  it("names sections in the business's own words", () => {
    expect(getBusinessTheme("restaurant").vocabulary.resources).toBe("Mesas");
    expect(getBusinessTheme("dental").vocabulary.customers).toBe("Pacientes");
    expect(getBusinessTheme("car_wash").vocabulary.resources).toBe("Bahías de lavado");
  });
});
