/**
 * Convierte un texto en slug URL-safe: minúsculas, sin acentos, palabras separadas por guiones.
 * Devuelve cadena vacía si no queda ningún carácter válido.
 */
export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ñ/gi, (m) => (m === "Ñ" ? "N" : "n"))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
}

/**
 * Dado un slug base y una función que indica si ya existe, devuelve el primer slug libre:
 * `base`, `base-2`, `base-3`, …
 */
export async function uniqueSlug(base: string, exists: (slug: string) => Promise<boolean>): Promise<string> {
  const root = base.length > 0 ? base : "item";
  if (!(await exists(root))) return root;
  for (let n = 2; n < 1000; n++) {
    const candidate = `${root}-${n}`;
    if (!(await exists(candidate))) return candidate;
  }
  throw new Error(`No se pudo generar un slug único para "${root}"`);
}
