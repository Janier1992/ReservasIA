// Revisión automática de la respuesta del agente antes de enviarla al
// cliente. Las instrucciones ya le dan al modelo los horarios, el calendario
// de los próximos días y los precios; esto es la red de seguridad del código
// para cuando igual se equivoca (p. ej. "mañana lunes" un jueves, o un
// horario "de noche" en un negocio diurno). Revisa tres cosas concretas:
//   - días: que no ofrezca atención un día en que el negocio está cerrado, y
//     que "hoy"/"mañana" y las fechas coincidan con su día de la semana;
//   - horas: que las horas que menciona caigan dentro del horario (o vengan
//     de una herramienta, como la disponibilidad);
//   - precios: que los montos salgan de los servicios del negocio o de una
//     herramienta.
// Es conservadora a propósito: ante la duda (frases con "no", "cerrado",
// "sin", horas sin a. m./p. m.) no marca nada, porque un falso positivo le
// cambia al cliente una respuesta que estaba bien. Sin dependencias del
// server: la usa también la vista previa del panel (Edge Function).
import { formatInTimeZone } from "date-fns-tz";
import { blocksOnDay, businessRanges, localDate } from "./scheduleText.js";
import type { AgentPromptData } from "./systemPrompt.js";

export interface ReplyIssue {
  kind: "day" | "date" | "hour" | "price";
  /** Qué está mal, en palabras para el modelo (va en la corrección). */
  detail: string;
}

/** Respuesta fija cuando, aun corregida, la respuesta trae datos que no cuadran. */
export const UNVERIFIED_REPLY_FALLBACK =
  "Prefiero no darte un dato equivocado: ese detalle te lo confirma directamente el negocio. ¿Te ayudo con algo más, como agendar una reserva?";

const WEEKDAYS = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];
const WEEKDAYS_DISPLAY = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const WD = WEEKDAYS.join("|");

/** Frase que afirma que se atiende (o se puede reservar) ese día. */
const OPEN_RE = /\b(abr[eiao]\w*|abiert\w*|atend\w*|atiend\w*|trabaj\w*|disponib\w*|horario\w*|cupos?|agend\w*|reserv\w*|funcion\w*)\b/;
/** Frase con negación o excepción: no se revisa (puede estar diciendo justamente que está cerrado). */
const NEG_RE = /\b(no|cerrad\w*|sin|fuera|excepto|menos|salvo|ni|descans\w*|festiv\w*|tampoco|nunca)\b/;

/** Minúsculas, sin tildes y con "a. m."/"p. m." compactados, para comparar sin depender de cómo lo escribió el modelo. */
function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\b([ap])\.?\s?m\.?(?![a-z])/g, "$1m")
    .replace(/\b12(:00)?\s?m\.(?![a-z])/g, "12$1 m");
}

/** Oraciones y, dentro de ellas, las partes separadas por "pero" o ";" (cada una se revisa sola). */
function clauses(text: string): string[] {
  return text
    .split(/[.!?](?=\s|$)|\n|;|\bpero\b|\bsin embargo\b/)
    .map((c) => c.trim())
    .filter(Boolean);
}

const toMinutes = (h: number, m: number) => h * 60 + m;
const clockMinutes = (time: string) => {
  const [h, m] = time.split(":").map(Number);
  return toMinutes(h, m ?? 0);
};
const formatMinutes = (minutes: number) => {
  const h = Math.floor(minutes / 60) % 24;
  const m = String(minutes % 60).padStart(2, "0");
  return h === 12 && m === "00" ? "12:00 m." : h < 12 ? `${h === 0 ? 12 : h}:${m} a. m.` : `${h === 12 ? 12 : h - 12}:${m} p. m.`;
};

/**
 * Horas mencionadas en un texto ya normalizado. Cada hora es una lista de
 * lecturas posibles en minutos: "9:00" sin a. m./p. m. puede ser 9 o 21.
 * `clock24` lee "HH:mm" como hora de 24 horas (así responden las herramientas).
 */
function extractTimes(text: string, clock24 = false): number[][] {
  const found: number[][] = [];
  let rest = text;
  const take = (re: RegExp, read: (m: RegExpMatchArray) => number[] | null) => {
    rest = rest.replace(re, (...args) => {
      const match = args.slice(0, -2) as unknown as RegExpMatchArray;
      const minutes = read(match);
      if (minutes) found.push(minutes);
      return " ";
    });
  };
  const valid = (h: number, m: number) => h <= 24 && m < 60;

  take(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/g, ([, hh, mm, ampm]) => {
    const h = Number(hh);
    const m = Number(mm ?? 0);
    if (!valid(h, m) || h > 12) return null;
    const h24 = ampm === "am" ? h % 12 : (h % 12) + 12;
    return [toMinutes(h24, m)];
  });
  take(/\b12(?::00)?\s*m\b/g, () => [toMinutes(12, 0)]);
  take(/\b(\d{1,2})(?::(\d{2}))?\s+(?:de|en|por)\s+la\s+(manana|tarde|noche|madrugada)\b/g, ([, hh, mm, part]) => {
    const h = Number(hh);
    const m = Number(mm ?? 0);
    if (!valid(h, m) || h > 12) return null;
    if (part === "manana" || part === "madrugada") return [toMinutes(h % 12, m)];
    if (part === "noche" && h === 12) return [toMinutes(0, m)];
    return [toMinutes(h === 12 ? 12 : h + 12, m)];
  });
  take(/\b(\d{1,2}):(\d{2})\b/g, ([, hh, mm]) => {
    const h = Number(hh);
    const m = Number(mm);
    if (!valid(h, m)) return null;
    if (clock24 || h === 0 || h > 12) return [toMinutes(h % 24, m)];
    return [toMinutes(h, m), toMinutes(h === 12 ? 0 : h + 12, m)];
  });
  return found;
}

/** Días de la semana nombrados (0 = domingo), con "de lunes a viernes" expandido. */
function mentionedWeekdays(clause: string): number[] {
  const days = new Set<number>();
  let rest = clause;
  rest = rest.replace(new RegExp(`\\b(?:de|del|desde(?: el)?)\\s+(${WD})s?\\s+(?:a|al|hasta(?: el)?)\\s+(${WD})s?\\b`, "g"), (_, from, to) => {
    const start = WEEK_ORDER.indexOf(WEEKDAYS.indexOf(from));
    const end = WEEK_ORDER.indexOf(WEEKDAYS.indexOf(to));
    for (let i = start; ; i = (i + 1) % 7) {
      days.add(WEEK_ORDER[i]);
      if (i === end) break;
    }
    return " ";
  });
  for (const match of rest.matchAll(new RegExp(`\\b(${WD})s?\\b`, "g"))) days.add(WEEKDAYS.indexOf(match[1]));
  return [...days];
}

/** "hoy", "mañana" (el día, no "de la mañana") y "pasado mañana", como cantidad de días desde hoy. */
function relativeDays(clause: string): number[] {
  const offsets = new Set<number>();
  if (/\bhoy\b/.test(clause)) offsets.add(0);
  for (const match of clause.matchAll(/\bmanana\b/g)) {
    const before = clause.slice(0, match.index);
    if (/\bpasado\s+$/.test(before)) offsets.add(2);
    else if (!/\b(la|las|esta|estas|una|cada|toda)\s+$/.test(before)) offsets.add(1);
  }
  return [...offsets];
}

/** Monto escrito como "25.000", "25,000", "25000" o "25 mil", en pesos. */
function parseAmount(digits: string, thousands: boolean): number {
  const value = Number(digits.replace(/[.,]/g, ""));
  return thousands ? value * 1000 : value;
}

const AMOUNT = String.raw`(\d{1,3}(?:[.,]\d{3})+|\d+)(\s?mil\b)?`;

/** Precios mencionados: con "$", "pesos"/"COP", "mil" o después de "cuesta"/"vale"/"precio". */
function extractPrices(text: string): number[] {
  const prices: number[] = [];
  const re = new RegExp(`(\\$\\s?|\\b(?:cuesta|cuestan|vale|valen|precio|valor|total|cobr\\w*)\\s(?:es\\s|de\\s|son\\s|seria\\s)?)?${AMOUNT}(\\s?(?:pesos|cop)\\b)?`, "g");
  for (const match of text.matchAll(re)) {
    const [, prefix, digits, mil, currency] = match;
    const grouped = /[.,]\d{3}/.test(digits);
    const isPrice = Boolean(prefix?.startsWith("$") || currency || mil || (prefix && (grouped || digits.length >= 4)));
    if (isPrice) prices.push(parseAmount(digits, Boolean(mil)));
  }
  return prices;
}

/** Todos los números que aparecen en un texto libre del negocio o en una herramienta (posibles montos válidos). */
function amountsIn(text: string): number[] {
  return [...normalize(text).matchAll(new RegExp(AMOUNT, "g"))].map(([, digits, mil]) => parseAmount(digits, Boolean(mil)));
}

function allowedPrices(data: AgentPromptData, toolOutputs: string[]): Set<number> {
  const allowed = new Set<number>();
  const prices = data.services.map((s) => s.price).filter((p): p is number => typeof p === "number" && p > 0);
  const pct = data.businessProfile.deposit_percentage;
  for (const [i, p] of prices.entries()) {
    // Varias veces el mismo servicio (p. ej. dos cortes) o dos servicios juntos.
    for (let k = 1; k <= 10; k++) allowed.add(Math.round(p * k));
    for (const other of prices.slice(i + 1)) allowed.add(Math.round(p + other));
    if (pct) allowed.add(Math.round((p * pct) / 100));
  }
  const freeText = [
    data.businessProfile.description,
    data.businessProfile.cancellation_policy,
    data.businessProfile.special_instructions,
    data.agentConfig.system_instructions,
    ...data.services.map((s) => s.description),
    ...(data.agentRules ?? []).filter((r) => r.enabled).map((r) => r.instruction),
    ...toolOutputs
  ];
  for (const text of freeText) if (text) for (const amount of amountsIn(text)) allowed.add(amount);
  return allowed;
}

/** Franjas abiertas (en minutos) de un día de la semana: las del negocio y las de cada recurso con horario propio. */
function openRanges(data: AgentPromptData, dow: number): [number, number][] {
  const ranges: [number, number][] = businessRanges(data.hours ?? [], dow).map((r) => [clockMinutes(r.open), clockMinutes(r.close)]);
  for (const h of data.resourceHours ?? []) {
    if (h.day_of_week === dow) ranges.push([clockMinutes(h.opening_time.slice(0, 5)), clockMinutes(h.closing_time.slice(0, 5))]);
  }
  // Un cierre a medianoche ("00:00") se lee como el final del día.
  return ranges.map(([open, close]) => [open, close <= open ? 24 * 60 : close]);
}

const weekdayOpen = (data: AgentPromptData, dow: number) => openRanges(data, dow).length > 0;

/** Si el negocio atiende el día que está `offset` días después de hoy (con los bloqueos de todo el negocio). */
function dayOpen(data: AgentPromptData, nowUtc: Date, offset: number): { open: boolean; dow: number; date: string } {
  const timezone = data.organization.timezone;
  const date = localDate(nowUtc, timezone, offset);
  const dow = new Date(`${date}T12:00:00Z`).getUTCDay();
  const blocked = blocksOnDay(data.blocks ?? [], date, timezone).some((b) => b.wholeDay);
  return { open: weekdayOpen(data, dow) && !blocked, dow, date };
}

const RELATIVE_NAME = ["hoy", "mañana", "pasado mañana"];

/**
 * Revisa una respuesta del agente contra los datos del negocio. Devuelve la
 * lista de datos que no cuadran (vacía si está todo bien).
 *
 * @param toolOutputs resultados de herramientas de esta conversación (JSON): lo
 *   que viene de ahí (horas disponibles, montos de anticipo) se da por válido.
 */
export function verifyAgentReply(reply: string, data: AgentPromptData, nowUtc: Date, toolOutputs: string[] = []): ReplyIssue[] {
  const issues: ReplyIssue[] = [];
  const add = (issue: ReplyIssue) => {
    if (!issues.some((i) => i.detail === issue.detail)) issues.push(issue);
  };
  const text = normalize(reply);
  const timezone = data.organization.timezone;

  // --- Días -------------------------------------------------------------
  // "mañana viernes", "hoy (jueves)", "mañana es lunes": el día tiene que coincidir.
  const relWithDay = new RegExp(`\\b(pasado manana|hoy|manana)\\s*(?:,|\\(|es|que es|seria)?\\s*(?:el\\s+)?(${WD})\\b`, "g");
  const dayWithRel = new RegExp(`\\b(${WD})\\s*(?:\\(\\s*|es\\s+|,\\s*o sea\\s+)(pasado manana|hoy|manana)\\b`, "g");
  const checkRelative = (rel: string, wd: string, before: string) => {
    if (rel === "manana" && /\b(la|las|esta|una|cada|toda)\s+$/.test(before)) return;
    const offset = rel === "hoy" ? 0 : rel === "manana" ? 1 : 2;
    const actual = dayOpen(data, nowUtc, offset).dow;
    if (WEEKDAYS.indexOf(wd) !== actual) {
      add({ kind: "date", detail: `Dijiste que ${RELATIVE_NAME[offset]} es ${WEEKDAYS_DISPLAY[WEEKDAYS.indexOf(wd)]}, pero ${RELATIVE_NAME[offset]} es ${WEEKDAYS_DISPLAY[actual]}.` });
    }
  };
  for (const m of text.matchAll(relWithDay)) checkRelative(m[1], m[2], text.slice(0, m.index));
  for (const m of text.matchAll(dayWithRel)) checkRelative(m[2], m[1], "");

  // "viernes 30 de octubre": el día de la semana tiene que corresponder a la fecha.
  const dated = new RegExp(`\\b(${WD})\\s*,?\\s*(\\d{1,2})\\s+de\\s+(${MONTHS.join("|")})\\b`, "g");
  const todayLocal = localDate(nowUtc, timezone, 0);
  const thisYear = Number(todayLocal.slice(0, 4));
  for (const [, wd, dd, month] of text.matchAll(dated)) {
    // El año más cercano a hoy (diciembre → enero cae en el año siguiente).
    const candidates = [thisYear - 1, thisYear, thisYear + 1].map((y) => new Date(Date.UTC(y, MONTHS.indexOf(month), Number(dd), 12)));
    const today = new Date(`${todayLocal}T12:00:00Z`).getTime();
    const date = candidates.reduce((best, d) => (Math.abs(d.getTime() - today) < Math.abs(best.getTime() - today) ? d : best));
    if (date.getUTCDate() !== Number(dd)) continue;
    const actual = date.getUTCDay();
    if (WEEKDAYS.indexOf(wd) !== actual) {
      add({ kind: "date", detail: `El ${dd} de ${month} es ${WEEKDAYS_DISPLAY[actual]}, no ${WEEKDAYS_DISPLAY[WEEKDAYS.indexOf(wd)]}.` });
    }
  }

  // --- Horas permitidas ------------------------------------------------------
  const toolTimes = new Set(toolOutputs.flatMap((t) => extractTimes(normalize(t), true).flat()));
  const nowMinutes = clockMinutes(formatInTimeZone(nowUtc, timezone, "HH:mm"));
  const prices = extractPrices(text);
  const allowed = prices.length > 0 ? allowedPrices(data, toolOutputs) : new Set<number>();

  for (const clause of clauses(text)) {
    const negated = NEG_RE.test(clause);
    const weekdays = mentionedWeekdays(clause);
    const relative = relativeDays(clause);

    if (!negated && OPEN_RE.test(clause)) {
      for (const dow of weekdays) {
        if (!weekdayOpen(data, dow)) {
          add({ kind: "day", detail: `Dijiste que se atiende el ${WEEKDAYS_DISPLAY[dow]}, pero el ${WEEKDAYS_DISPLAY[dow]} el negocio está cerrado.` });
        }
      }
      for (const offset of relative) {
        const day = dayOpen(data, nowUtc, offset);
        if (!day.open) {
          add({ kind: "day", detail: `Dijiste que se atiende ${RELATIVE_NAME[offset]} (${WEEKDAYS_DISPLAY[day.dow]} ${day.date}), pero ese día el negocio está cerrado.` });
        }
      }
    }

    if (negated) continue;
    // Si la frase nombra días, las horas se comparan con el horario de esos días; si no, con cualquier día.
    const days = new Set([...weekdays, ...relative.map((o) => dayOpen(data, nowUtc, o).dow)]);
    const ranges = (days.size > 0 ? [...days] : [0, 1, 2, 3, 4, 5, 6]).flatMap((dow) => openRanges(data, dow));
    for (const readings of extractTimes(clause)) {
      const ok = readings.some(
        (t) => toolTimes.has(t) || Math.abs(t - nowMinutes) <= 5 || ranges.some(([open, close]) => t >= open && t <= close)
      );
      if (!ok) {
        add({ kind: "hour", detail: `Mencionaste las ${formatMinutes(readings[0])}, que está fuera del horario de atención del negocio.` });
      }
    }
  }

  // --- Precios -----------------------------------------------------------
  for (const price of prices) {
    if (!allowed.has(price)) {
      add({ kind: "price", detail: `Mencionaste un monto de ${price.toLocaleString("es-CO")} que no corresponde a ningún precio del negocio.` });
    }
  }

  return issues;
}

/** Mensaje para que el modelo corrija su respuesta (el cliente no lo ve). */
export function correctionPrompt(issues: ReplyIssue[]): string {
  return `REVISIÓN AUTOMÁTICA (el cliente no ve este mensaje): tu respuesta anterior tiene datos que no coinciden con la información del negocio:
${issues.map((i) => `- ${i.detail}`).join("\n")}
Reescribí la respuesta para el cliente usando solo los horarios, días, fechas y precios que aparecen en tus instrucciones (HORARIOS, CALENDARIO DE LOS PRÓXIMOS 7 DÍAS, SERVICIOS) o en los resultados de las herramientas. Si un dato no está ahí, decí que te lo confirma el negocio. No menciones esta revisión.`;
}
