export const BLOCK_SLOT_SCOPES = ["morning", "afternoon", "night"] as const;
export type BlockSlotScope = (typeof BLOCK_SLOT_SCOPES)[number];
export type BlockScope = "DAY" | BlockSlotScope;

export function parseDateKey(input: string): string | null {
  const s = input.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

export function monthDateKeyRange(month: string): { from: string; to: string } | null {
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return null;
  }
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
}

export function isSlotScope(s: string): s is BlockSlotScope {
  return (BLOCK_SLOT_SCOPES as readonly string[]).includes(s);
}

export function isDayScope(s: string): s is "DAY" {
  return s === "DAY";
}
