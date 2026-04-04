/**
 * Clave de día de calendario (yyyy-MM-dd) en una zona IANA fija.
 * Evita que en Vercel (UTC) las sesiones “cambien de día” respecto a Colombia
 * u otra zona del estudio.
 */
export const DEFAULT_CALENDAR_TIMEZONE = process.env.CALENDAR_TZ ?? "America/Bogota";

export function instantToCalendarDateKey(date: Date, timeZone: string = DEFAULT_CALENDAR_TIMEZONE): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const y = parts.find((p) => p.type === "year")?.value ?? "";
  const m = parts.find((p) => p.type === "month")?.value ?? "";
  const d = parts.find((p) => p.type === "day")?.value ?? "";
  return `${y}-${m}-${d}`;
}

/** Itera claves yyyy-MM-dd desde `from` hasta `to` (inclusive), orden lexicográfico = cronológico. */
export function eachDateKeyInClosedRange(fromKey: string, toKey: string): string[] {
  const keys: string[] = [];
  const start = Date.parse(`${fromKey}T12:00:00.000Z`);
  const end = Date.parse(`${toKey}T12:00:00.000Z`);
  const step = 24 * 60 * 60 * 1000;
  for (let t = start; t <= end; t += step) {
    keys.push(new Date(t).toISOString().slice(0, 10));
  }
  return keys;
}
