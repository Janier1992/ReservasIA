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
  sidebar: Rgb;
  sidebarForeground: Rgb;
  sidebarMuted: Rgb;
  sidebarBorder: Rgb;
  sidebarActive: Rgb;
  sidebarActiveForeground: Rgb;
  hero: Rgb;
  heroForeground: Rgb;
}

// En oscuro se conserva el fondo neutro de la app y solo se adapta la
// identidad del rubro: acento, menú lateral y banner.
type DarkPalette = Pick<
  ThemePalette,
  | "primary"
  | "primaryForeground"
  | "sidebar"
  | "sidebarForeground"
  | "sidebarMuted"
  | "sidebarBorder"
  | "sidebarActive"
  | "sidebarActiveForeground"
  | "hero"
  | "heroForeground"
>;

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
      mutedForeground: "110 82 66",
      sidebar: "59 31 20", // #3B1F14 madera oscura
      sidebarForeground: "246 231 216",
      sidebarMuted: "214 180 156",
      sidebarBorder: "84 50 36",
      sidebarActive: "180 68 31",
      sidebarActiveForeground: "255 247 237",
      hero: "243 220 198",
      heroForeground: "42 26 18"
    },
    dark: {
      primary: "232 132 96",
      primaryForeground: "32 18 12",
      sidebar: "36 20 14",
      sidebarForeground: "246 231 216",
      sidebarMuted: "190 156 134",
      sidebarBorder: "66 40 29",
      sidebarActive: "232 132 96",
      sidebarActiveForeground: "32 18 12",
      hero: "59 31 20",
      heroForeground: "246 231 216"
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
      mutedForeground: "92 88 80",
      sidebar: "22 24 29", // negro carbón
      sidebarForeground: "236 231 222",
      sidebarMuted: "170 166 158",
      sidebarBorder: "48 50 56",
      sidebarActive: "166 27 41",
      sidebarActiveForeground: "255 255 255",
      hero: "22 24 29",
      heroForeground: "245 242 236"
    },
    dark: {
      primary: "232 100 110",
      primaryForeground: "22 24 29",
      sidebar: "16 17 21",
      sidebarForeground: "236 231 222",
      sidebarMuted: "160 156 148",
      sidebarBorder: "44 46 52",
      sidebarActive: "232 100 110",
      sidebarActiveForeground: "22 24 29",
      hero: "40 20 24",
      heroForeground: "245 242 236"
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
      mutedForeground: "112 76 90",
      sidebar: "246 228 234", // rosa empolvado
      sidebarForeground: "61 31 43",
      sidebarMuted: "112 76 90",
      sidebarBorder: "236 206 216",
      sidebarActive: "163 49 101",
      sidebarActiveForeground: "255 255 255",
      hero: "243 214 225",
      heroForeground: "61 31 43"
    },
    dark: {
      primary: "240 140 184",
      primaryForeground: "48 18 32",
      sidebar: "44 24 33",
      sidebarForeground: "246 228 234",
      sidebarMuted: "196 160 174",
      sidebarBorder: "70 40 53",
      sidebarActive: "240 140 184",
      sidebarActiveForeground: "48 18 32",
      hero: "61 31 43",
      heroForeground: "246 228 234"
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
      mutedForeground: "78 100 92",
      sidebar: "228 236 230",
      sidebarForeground: "30 58 51",
      sidebarMuted: "78 100 92",
      sidebarBorder: "206 220 211",
      sidebarActive: "47 107 92",
      sidebarActiveForeground: "255 255 255",
      hero: "216 230 221",
      heroForeground: "30 58 51"
    },
    dark: {
      primary: "134 196 178",
      primaryForeground: "18 38 33",
      sidebar: "22 38 34",
      sidebarForeground: "228 236 230",
      sidebarMuted: "160 186 176",
      sidebarBorder: "40 60 54",
      sidebarActive: "134 196 178",
      sidebarActiveForeground: "18 38 33",
      hero: "30 58 51",
      heroForeground: "228 236 230"
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
      mutedForeground: "72 94 116",
      sidebar: "255 255 255",
      sidebarForeground: "11 37 64",
      sidebarMuted: "72 94 116",
      sidebarBorder: "213 228 240",
      sidebarActive: "227 240 251",
      sidebarActiveForeground: "12 80 146",
      hero: "15 98 176",
      heroForeground: "255 255 255"
    },
    dark: {
      primary: "110 176 238",
      primaryForeground: "8 28 48",
      sidebar: "14 30 48",
      sidebarForeground: "222 236 250",
      sidebarMuted: "150 176 202",
      sidebarBorder: "32 52 74",
      sidebarActive: "110 176 238",
      sidebarActiveForeground: "8 28 48",
      hero: "12 56 100",
      heroForeground: "236 244 252"
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
      mutedForeground: "68 98 90",
      sidebar: "11 59 51", // verde profundo
      sidebarForeground: "217 240 234",
      sidebarMuted: "150 196 184",
      sidebarBorder: "28 80 70",
      sidebarActive: "217 240 234",
      sidebarActiveForeground: "11 59 51",
      hero: "220 240 234",
      heroForeground: "11 43 37"
    },
    dark: {
      primary: "110 204 180",
      primaryForeground: "8 36 30",
      sidebar: "10 40 35",
      sidebarForeground: "217 240 234",
      sidebarMuted: "150 196 184",
      sidebarBorder: "28 66 58",
      sidebarActive: "110 204 180",
      sidebarActiveForeground: "8 36 30",
      hero: "11 59 51",
      heroForeground: "217 240 234"
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
      mutedForeground: "86 94 106",
      sidebar: "31 47 70", // azul marino
      sidebarForeground: "226 232 240",
      sidebarMuted: "160 174 192",
      sidebarBorder: "52 70 96",
      sidebarActive: "240 128 60",
      sidebarActiveForeground: "31 47 70",
      hero: "252 228 208",
      heroForeground: "31 47 70"
    },
    dark: {
      primary: "240 146 92",
      primaryForeground: "31 24 18",
      sidebar: "22 34 52",
      sidebarForeground: "226 232 240",
      sidebarMuted: "150 164 184",
      sidebarBorder: "44 60 84",
      sidebarActive: "240 146 92",
      sidebarActiveForeground: "31 24 18",
      hero: "31 47 70",
      heroForeground: "226 232 240"
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
      mutedForeground: "84 100 70",
      sidebar: "234 242 224",
      sidebarForeground: "31 45 20",
      sidebarMuted: "84 100 70",
      sidebarBorder: "214 228 198",
      sidebarActive: "46 110 42",
      sidebarActiveForeground: "255 255 255",
      hero: "253 236 200", // arena cálida
      heroForeground: "31 45 20"
    },
    dark: {
      primary: "140 200 120",
      primaryForeground: "20 34 14",
      sidebar: "24 36 18",
      sidebarForeground: "234 242 224",
      sidebarMuted: "170 190 150",
      sidebarBorder: "44 60 34",
      sidebarActive: "140 200 120",
      sidebarActiveForeground: "20 34 14",
      hero: "40 56 28",
      heroForeground: "240 246 232"
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
      mutedForeground: "84 90 98",
      sidebar: "30 34 39", // grafito
      sidebarForeground: "213 216 220",
      sidebarMuted: "154 161 169",
      sidebarBorder: "52 57 64",
      sidebarActive: "232 100 27",
      sidebarActiveForeground: "30 34 39",
      hero: "30 34 39",
      heroForeground: "239 239 236"
    },
    dark: {
      primary: "240 130 70",
      primaryForeground: "30 34 39",
      sidebar: "20 23 27",
      sidebarForeground: "213 216 220",
      sidebarMuted: "150 157 165",
      sidebarBorder: "44 48 54",
      sidebarActive: "240 130 70",
      sidebarActiveForeground: "30 34 39",
      hero: "38 42 48",
      heroForeground: "239 239 236"
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
      mutedForeground: "68 98 110",
      sidebar: "255 255 255",
      sidebarForeground: "11 39 51",
      sidebarMuted: "68 98 110",
      sidebarBorder: "211 230 238",
      sidebarActive: "221 241 247",
      sidebarActiveForeground: "10 95 120",
      hero: "10 95 120",
      heroForeground: "255 255 255"
    },
    dark: {
      primary: "112 196 222",
      primaryForeground: "8 32 42",
      sidebar: "12 34 44",
      sidebarForeground: "221 241 247",
      sidebarMuted: "150 186 200",
      sidebarBorder: "30 56 68",
      sidebarActive: "112 196 222",
      sidebarActiveForeground: "8 32 42",
      hero: "10 70 90",
      heroForeground: "236 248 252"
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
      mutedForeground: "88 94 84",
      sidebar: "36 70 58", // verde pizarra
      sidebarForeground: "232 240 228",
      sidebarMuted: "170 196 182",
      sidebarBorder: "56 92 78",
      sidebarActive: "245 190 90",
      sidebarActiveForeground: "30 42 36",
      hero: "36 70 58",
      heroForeground: "247 244 236"
    },
    dark: {
      primary: "245 180 90",
      primaryForeground: "36 26 10",
      sidebar: "24 48 40",
      sidebarForeground: "232 240 228",
      sidebarMuted: "160 186 172",
      sidebarBorder: "44 74 62",
      sidebarActive: "245 180 90",
      sidebarActiveForeground: "36 26 10",
      hero: "30 58 48",
      heroForeground: "247 244 236"
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
      mutedForeground: "84 88 92",
      sidebar: "17 19 21", // negro
      sidebarForeground: "212 215 219",
      sidebarMuted: "150 154 160",
      sidebarBorder: "40 43 46",
      sidebarActive: "163 230 53", // lima eléctrica
      sidebarActiveForeground: "17 19 21",
      hero: "17 19 21",
      heroForeground: "236 252 203"
    },
    dark: {
      primary: "163 230 53",
      primaryForeground: "17 19 21",
      sidebar: "10 11 12",
      sidebarForeground: "212 215 219",
      sidebarMuted: "150 154 160",
      sidebarBorder: "34 36 38",
      sidebarActive: "163 230 53",
      sidebarActiveForeground: "17 19 21",
      hero: "26 30 20",
      heroForeground: "236 252 203"
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
      mutedForeground: "92 80 118",
      sidebar: "31 21 53",
      sidebarForeground: "228 218 247",
      sidebarMuted: "170 156 204",
      sidebarBorder: "56 42 88",
      sidebarActive: "196 170 250",
      sidebarActiveForeground: "31 21 53",
      hero: "230 220 250",
      heroForeground: "31 21 53"
    },
    dark: {
      primary: "180 150 250",
      primaryForeground: "28 16 52",
      sidebar: "22 14 40",
      sidebarForeground: "228 218 247",
      sidebarMuted: "164 150 200",
      sidebarBorder: "46 34 76",
      sidebarActive: "180 150 250",
      sidebarActiveForeground: "28 16 52",
      hero: "40 28 70",
      heroForeground: "236 230 250"
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

const LIGHT_VARS: Record<keyof ThemePalette, string> = {
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
  sidebarActiveForeground: "--color-sidebar-active-foreground",
  hero: "--color-hero",
  heroForeground: "--color-hero-foreground"
};

function declarations(palette: Partial<ThemePalette>): string {
  return (Object.keys(palette) as (keyof ThemePalette)[])
    .map((key) => `${LIGHT_VARS[key]}: ${palette[key]};`)
    .join(" ");
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
  if (theme.light) rules.push(`${selector}:not(.dark) { ${declarations(theme.light)} }`);
  if (theme.dark) rules.push(`${selector}.dark { ${declarations(theme.dark)} }`);
  if (theme.displayFont) rules.push(`${selector} { --font-display: "${theme.displayFont.family}"; }`);
  return rules.join("\n");
}
