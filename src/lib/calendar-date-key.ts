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

/** Últimos `n` días en calendario UTC (alineado con `timestamptz` en Postgres / Vercel). */
export function lastNDaysUtcDateKeys(n: number): string[] {
  const now = new Date();
  const keys: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i, 12, 0, 0));
    keys.push(d.toISOString().slice(0, 10));
  }
  return keys;
}

export function utcDateKeyBounds(dateKey: string): { gte: Date; lte: Date } {
  return {
    gte: new Date(`${dateKey}T00:00:00.000Z`),
    lte: new Date(`${dateKey}T23:59:59.999Z`),
  };
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
