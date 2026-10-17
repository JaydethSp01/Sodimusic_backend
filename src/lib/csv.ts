/**
 * Celda CSV entrecomillada y segura frente a inyección de fórmulas (Excel/Sheets/LibreOffice):
 * si el texto empieza por `=`, `+`, `-`, `@`, tabulador o retorno de carro se antepone `'`.
 */
export function csvCell(v: unknown): string {
  const str = v instanceof Date ? v.toISOString() : v == null ? "" : String(v);
  const safe = /^[=+\-@\t\r]/.test(str) ? `'${str}` : str;
  return `"${safe.replace(/"/g, '""')}"`;
}
