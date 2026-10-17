/** Límite superior de `page` para evitar `skip` desorbitados en Postgres. */
export const MAX_PAGE = 100_000;

/** Entero seguro ≥ 1 a partir de un parámetro de query; en caso contrario `fallback`. */
function positiveSafeInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw === null) return fallback;
  const t = raw.trim();
  if (!/^\d+$/.test(t)) return fallback;
  const n = Number(t);
  if (!Number.isSafeInteger(n) || n < 1) return fallback;
  return n;
}

/**
 * Página (1..MAX_PAGE) y tamaño de página (1..max) a partir de la query string.
 * Valores no enteros, negativos, no seguros o fuera de rango → página 1 / tamaño por defecto.
 */
export function pagination(
  q: { page?: string; pageSize?: string },
  defaults: { pageSize: number; max: number },
): { page: number; pageSize: number; skip: number } {
  const rawPage = positiveSafeInt(q.page, 1);
  const page = rawPage > MAX_PAGE ? 1 : rawPage;
  const pageSize = Math.min(defaults.max, positiveSafeInt(q.pageSize, defaults.pageSize));
  return { page, pageSize, skip: (page - 1) * pageSize };
}

/**
 * Texto de búsqueda normalizado para `contains`: sin comodines SQL (`%`, `_`),
 * recortado a 80 caracteres, o undefined si queda vacío.
 */
export function searchTerm(raw: string | undefined): string | undefined {
  if (typeof raw !== "string") return undefined;
  const t = raw.replace(/[%_]/g, "").trim().slice(0, 80).trim();
  return t.length > 0 ? t : undefined;
}
