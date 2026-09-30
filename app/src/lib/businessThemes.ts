import {
  Activity,
  CalendarClock,
  Droplets,
  Dumbbell,
  Flower2,
  GraduationCap,
  Palette,
  PawPrint,
  Scissors,
  Smile,
  Sparkles,
  Stethoscope,
  UtensilsCrossed,
  Wrench,
  type LucideIcon
} from "lucide-react";

/**
 * Apariencia del dashboard según el rubro del negocio: colores, tipografía
 * de títulos, ícono y cómo se llaman las secciones ("Mesas" en un
 * restaurante, "Bahías" en un lavadero). Solo cambia la presentación: el
 * motor de reservas y los datos son los mismos para todos los rubros.
 *
 * Los colores van como "R G B" (sin coma) porque así los consume Tailwind
 * vía `rgb(var(--color-x) / <alpha>)` (ver index.css y tailwind.config.ts).
 */

type Rgb = string;

interface ThemePalette {
  primary: Rgb;
  primaryForeground: Rgb;
  background: Rgb;
  foreground: Rgb;
  border: Rgb;
  muted: Rgb;
  mutedForeground: Rgb;
}

// En oscuro se conserva el fondo neutro de la app y solo cambia el acento.
type DarkPalette = Pick<ThemePalette, "primary" | "primaryForeground">;

export interface BusinessVocabulary {
  reservations: string;
  customers: string;
  services: string;
  resources: string;
}

export interface BusinessTheme {
  businessType: string;
  icon: LucideIcon;
  // Familia de Google Fonts para títulos (null = la tipografía base).
  displayFont: { family: string; googleSpec: string } | null;
  light: ThemePalette | null;
  dark: DarkPalette | null;
  vocabulary: BusinessVocabulary;
  heroTitle: string;
  heroSubtitle: string;
}

const DEFAULT_VOCABULARY: BusinessVocabulary = {
  reservations: "Reservas",
  customers: "Clientes",
  services: "Servicios",
  resources: "Recursos"
};

const THEMES: BusinessTheme[] = [
  {
    businessType: "restaurant",
    icon: UtensilsCrossed,
    displayFont: { family: "Fraunces", googleSpec: "Fraunces:opsz,wght@9..144,600;9..144,700" },
    light: {
      primary: "180 68 31", // #B4441F terracota
      primaryForeground: "255 247 237",
      background: "251 246 239",
      foreground: "42 26 18",
      border: "234 215 197",
      muted: "245 233 220",
      mutedForeground: "110 82 66"
    },
    dark: {
      primary: "232 132 96",
      primaryForeground: "32 18 12"
    },
    vocabulary: { reservations: "Reservas de mesa", customers: "Comensales", services: "Carta y servicios", resources: "Mesas" },
    heroTitle: "Tu servicio de hoy",
    heroSubtitle: "Mesas reservadas, comensales y conversaciones de tus clientes."
  },
  {
    businessType: "barbershop",
    icon: Scissors,
    displayFont: { family: "Playfair Display", googleSpec: "Playfair+Display:wght@700;800" },
    light: {
      primary: "166 27 41", // #A61B29 rojo barbero
      primaryForeground: "255 255 255",
      background: "245 242 236",
      foreground: "22 24 29",
      border: "221 214 202",
      muted: "236 231 222",
      mutedForeground: "92 88 80"
    },
    dark: {
      primary: "232 100 110",
      primaryForeground: "22 24 29"
    },
    vocabulary: { reservations: "Turnos", customers: "Clientes", services: "Cortes y servicios", resources: "Barberos" },
    heroTitle: "Tu barbería hoy",
    heroSubtitle: "Turnos del día, barberos y clientes en un vistazo."
  },
  {
    businessType: "beauty_salon",
    icon: Sparkles,
    displayFont: { family: "Cormorant Garamond", googleSpec: "Cormorant+Garamond:wght@600;700" },
    light: {
      primary: "163 49 101", // #A33165 frambuesa
      primaryForeground: "255 255 255",
      background: "251 243 245",
      foreground: "61 31 43",
      border: "240 214 223",
      muted: "247 230 236",
      mutedForeground: "112 76 90"
    },
    dark: {
      primary: "240 140 184",
      primaryForeground: "48 18 32"
    },
    vocabulary: { reservations: "Citas", customers: "Clientas y clientes", services: "Servicios de belleza", resources: "Estilistas" },
    heroTitle: "Tu salón hoy",
    heroSubtitle: "Citas, estilistas y clientas del día."
  },
  {
    businessType: "spa",
    icon: Flower2,
    displayFont: { family: "Marcellus", googleSpec: "Marcellus" },
    light: {
      primary: "47 107 92", // #2F6B5C salvia profunda
      primaryForeground: "255 255 255",
      background: "243 246 242",
      foreground: "30 58 51",
      border: "214 226 218",
      muted: "230 238 232",
      mutedForeground: "78 100 92"
    },
    dark: {
      primary: "134 196 178",
      primaryForeground: "18 38 33"
    },
    vocabulary: { reservations: "Citas", customers: "Clientes", services: "Tratamientos", resources: "Cabinas y terapeutas" },
    heroTitle: "Tu spa hoy",
    heroSubtitle: "Tratamientos agendados, cabinas y clientes del día."
  },
  {
    businessType: "dental",
    icon: Smile,
    displayFont: { family: "Manrope", googleSpec: "Manrope:wght@700;800" },
    light: {
      primary: "15 98 176", // #0F62B0 azul clínico
      primaryForeground: "255 255 255",
      background: "242 247 251",
      foreground: "11 37 64",
      border: "213 228 240",
      muted: "228 239 248",
      mutedForeground: "72 94 116"
    },
    dark: {
      primary: "110 176 238",
      primaryForeground: "8 28 48"
    },
    vocabulary: { reservations: "Citas", customers: "Pacientes", services: "Tratamientos", resources: "Consultorios" },
    heroTitle: "Tu consultorio hoy",
    heroSubtitle: "Citas del día, pacientes y consultorios."
  },
  {
    businessType: "clinic",
    icon: Stethoscope,
    displayFont: { family: "Manrope", googleSpec: "Manrope:wght@700;800" },
    light: {
      primary: "13 110 90", // #0D6E5A verde salud
      primaryForeground: "255 255 255",
      background: "241 248 246",
      foreground: "11 43 37",
      border: "208 229 223",
      muted: "226 240 236",
      mutedForeground: "68 98 90"
    },
    dark: {
      primary: "110 204 180",
      primaryForeground: "8 36 30"
    },
    vocabulary: { reservations: "Citas", customers: "Pacientes", services: "Consultas y servicios", resources: "Profesionales" },
    heroTitle: "Tu consulta hoy",
    heroSubtitle: "Citas, pacientes y profesionales del día."
  },
  {
    businessType: "physiotherapy",
    icon: Activity,
    displayFont: { family: "Outfit", googleSpec: "Outfit:wght@600;700" },
    light: {
      primary: "180 72 20", // #B44814 naranja energía
      primaryForeground: "255 255 255",
      background: "246 245 241",
      foreground: "31 47 70",
      border: "224 220 210",
      muted: "238 235 227",
      mutedForeground: "86 94 106"
    },
    dark: {
      primary: "240 146 92",
      primaryForeground: "31 24 18"
    },
    vocabulary: { reservations: "Sesiones", customers: "Pacientes", services: "Terapias", resources: "Fisioterapeutas" },
    heroTitle: "Tus sesiones de hoy",
    heroSubtitle: "Terapias agendadas, pacientes y fisioterapeutas."
  },
  {
    businessType: "veterinary",
    icon: PawPrint,
    displayFont: { family: "Nunito", googleSpec: "Nunito:wght@800;900" },
    light: {
      primary: "46 110 42", // #2E6E2A verde amigable
      primaryForeground: "255 255 255",
      background: "244 248 239",
      foreground: "31 45 20",
      border: "218 230 204",
      muted: "233 241 222",
      mutedForeground: "84 100 70"
    },
    dark: {
      primary: "140 200 120",
      primaryForeground: "20 34 14"
    },
    vocabulary: { reservations: "Citas", customers: "Dueños y mascotas", services: "Servicios veterinarios", resources: "Consultorios" },
    heroTitle: "Tu veterinaria hoy",
    heroSubtitle: "Citas del día, mascotas y sus dueños."
  },
  {
    businessType: "auto_repair",
    icon: Wrench,
    displayFont: { family: "Barlow Condensed", googleSpec: "Barlow+Condensed:wght@600;700" },
    light: {
      primary: "180 60 10", // #B43C0A naranja de seguridad (oscurecido para contraste)
      primaryForeground: "255 255 255",
      background: "239 239 236",
      foreground: "30 34 39",
      border: "213 216 220",
      muted: "229 230 227",
      mutedForeground: "84 90 98"
    },
    dark: {
      primary: "240 130 70",
      primaryForeground: "30 34 39"
    },
    vocabulary: { reservations: "Citas de taller", customers: "Clientes y vehículos", services: "Servicios", resources: "Bahías y mecánicos" },
    heroTitle: "Tablero del taller",
    heroSubtitle: "Citas, vehículos y bahías del día."
  },
  {
    businessType: "car_wash",
    icon: Droplets,
    displayFont: { family: "Sora", googleSpec: "Sora:wght@600;700" },
    light: {
      primary: "10 95 120", // #0A5F78 agua profunda
      primaryForeground: "255 255 255",
      background: "238 246 249",
      foreground: "11 39 51",
      border: "211 230 238",
      muted: "226 240 246",
      mutedForeground: "68 98 110"
    },
    dark: {
      primary: "112 196 222",
      primaryForeground: "8 32 42"
    },
    vocabulary: { reservations: "Reservas de lavado", customers: "Clientes y vehículos", services: "Servicios de lavado", resources: "Bahías de lavado" },
    heroTitle: "Tu lavadero hoy",
    heroSubtitle: "Vehículos agendados, bahías y clientes del día."
  },
  {
    businessType: "academy",
    icon: GraduationCap,
    displayFont: { family: "Lora", googleSpec: "Lora:wght@600;700" },
    light: {
      primary: "180 83 9", // #B45309 ámbar de tiza
      primaryForeground: "255 255 255",
      background: "247 244 236",
      foreground: "30 42 36",
      border: "226 219 202",
      muted: "239 234 220",
      mutedForeground: "88 94 84"
    },
    dark: {
      primary: "245 180 90",
      primaryForeground: "36 26 10"
    },
    vocabulary: { reservations: "Clases", customers: "Estudiantes", services: "Cursos y clases", resources: "Profesores y salones" },
    heroTitle: "Tus clases de hoy",
    heroSubtitle: "Clases agendadas, estudiantes y profesores."
  },
  {
    businessType: "gym",
    icon: Dumbbell,
    displayFont: { family: "Oswald", googleSpec: "Oswald:wght@600;700" },
    light: {
      primary: "63 98 18", // #3F6212 lima profunda
      primaryForeground: "255 255 255",
      background: "243 244 241",
      foreground: "17 19 21",
      border: "218 221 214",
      muted: "232 234 228",
      mutedForeground: "84 88 92"
    },
    dark: {
      primary: "163 230 53",
      primaryForeground: "17 19 21"
    },
    vocabulary: { reservations: "Reservas de clase", customers: "Miembros", services: "Clases y planes", resources: "Entrenadores y salas" },
    heroTitle: "Tu gimnasio hoy",
    heroSubtitle: "Clases, cupos y miembros del día."
  },
  {
    businessType: "studio",
    icon: Palette,
    displayFont: { family: "Space Grotesk", googleSpec: "Space+Grotesk:wght@600;700" },
    light: {
      primary: "109 40 217", // #6D28D9 violeta creativo
      primaryForeground: "255 255 255",
      background: "246 243 251",
      foreground: "31 21 53",
      border: "224 214 242",
      muted: "236 230 248",
      mutedForeground: "92 80 118"
    },
    dark: {
      primary: "180 150 250",
      primaryForeground: "28 16 52"
    },
    vocabulary: { reservations: "Sesiones", customers: "Clientes", services: "Servicios", resources: "Salas" },
    heroTitle: "Tu estudio hoy",
    heroSubtitle: "Sesiones, salas y clientes del día."
  }
];

// Rubro "Otro" o desconocido: la paleta base de la app, sin cambios.
const FALLBACK_THEME: BusinessTheme = {
  businessType: "other",
  icon: CalendarClock,
  displayFont: null,
  light: null,
  dark: null,
  vocabulary: DEFAULT_VOCABULARY,
  heroTitle: "Tu negocio hoy",
  heroSubtitle: "Reservas, conversaciones y clientes en un vistazo."
};

export const BUSINESS_THEMES: readonly BusinessTheme[] = THEMES;

export function getBusinessTheme(businessType: string | null | undefined): BusinessTheme {
  return THEMES.find((t) => t.businessType === businessType) ?? FALLBACK_THEME;
}

// Estilo minimalista: la identidad del rubro vive en UN acento (primary), la
// tipografía y el ícono. Menú lateral y banner son superficies neutras que se
// derivan acá, en vez de colores propios por rubro.
const LIGHT_CARD = "255 255 255";
const DARK_CARD = "33 29 25";
const DARK_FOREGROUND = "242 236 224";
const DARK_MUTED_FOREGROUND = "167 156 140";
const DARK_BORDER = "58 51 44";

/** Mezcla dos colores "R G B": weight = proporción del primero. */
export function mixRgb(a: Rgb, b: Rgb, weight: number): Rgb {
  const pa = a.split(" ").map(Number);
  const pb = b.split(" ").map(Number);
  return pa.map((v, i) => Math.round(v * weight + pb[i] * (1 - weight))).join(" ");
}

function luminance(rgb: Rgb): number {
  const [r, g, b] = rgb.split(" ").map((c) => {
    const v = Number(c) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Acerca `fg` a `towards` de a poco hasta leerse bien (4.5:1) sobre `bg`. */
function ensureContrast(fg: Rgb, bg: Rgb, towards: Rgb): Rgb {
  let color = fg;
  for (let step = 1; contrastRatio(color, bg) < 4.5 && step <= 10; step++) {
    color = mixRgb(towards, fg, step / 10);
  }
  return color;
}

export interface SurfaceTokens {
  sidebar: Rgb;
  sidebarForeground: Rgb;
  sidebarMuted: Rgb;
  sidebarBorder: Rgb;
  sidebarActive: Rgb;
  sidebarActiveForeground: Rgb;
}

/** Superficies claras: menú blanco, ítem activo con un tinte suave del acento. */
export function lightSurfaces(p: ThemePalette): SurfaceTokens {
  const active = mixRgb(p.primary, LIGHT_CARD, 0.1);
  return {
    sidebar: LIGHT_CARD,
    sidebarForeground: p.foreground,
    sidebarMuted: p.mutedForeground,
    sidebarBorder: p.border,
    sidebarActive: active,
    sidebarActiveForeground: ensureContrast(p.primary, active, p.foreground)
  };
}

export function darkSurfaces(p: DarkPalette): SurfaceTokens {
  const active = mixRgb(p.primary, DARK_CARD, 0.16);
  return {
    sidebar: DARK_CARD,
    sidebarForeground: DARK_FOREGROUND,
    sidebarMuted: DARK_MUTED_FOREGROUND,
    sidebarBorder: DARK_BORDER,
    sidebarActive: active,
    sidebarActiveForeground: ensureContrast(p.primary, active, DARK_FOREGROUND)
  };
}

const VARS: Record<keyof ThemePalette | keyof SurfaceTokens, string> = {
  primary: "--color-primary",
  primaryForeground: "--color-primary-foreground",
  background: "--color-background",
  foreground: "--color-foreground",
  border: "--color-border",
  muted: "--color-muted",
  mutedForeground: "--color-muted-foreground",
  sidebar: "--color-sidebar",
  sidebarForeground: "--color-sidebar-foreground",
  sidebarMuted: "--color-sidebar-muted",
  sidebarBorder: "--color-sidebar-border",
  sidebarActive: "--color-sidebar-active",
  sidebarActiveForeground: "--color-sidebar-active-foreground"
};

function declarations(tokens: Partial<Record<keyof typeof VARS, Rgb>>): string {
  return (Object.keys(tokens) as (keyof typeof VARS)[]).map((key) => `${VARS[key]}: ${tokens[key]};`).join(" ");
}

/**
 * CSS de un tema, aplicado vía `data-business-theme` en <html>. Los
 * selectores llevan `:not(.dark)` / `.dark` para ganarle en especificidad a
 * los `:root` y `.dark` base de index.css sin que el tema claro pise al
 * oscuro.
 */
export function buildBusinessThemeCss(theme: BusinessTheme): string {
  const selector = `:root[data-business-theme="${theme.businessType}"]`;
  const rules: string[] = [];
  if (theme.light) rules.push(`${selector}:not(.dark) { ${declarations({ ...theme.light, ...lightSurfaces(theme.light) })} }`);
  if (theme.dark) rules.push(`${selector}.dark { ${declarations({ ...theme.dark, ...darkSurfaces(theme.dark) })} }`);
  if (theme.displayFont) rules.push(`${selector} { --font-display: "${theme.displayFont.family}"; }`);
  return rules.join("\n");
}
