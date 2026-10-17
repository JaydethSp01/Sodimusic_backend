import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Token de baja del newsletter: HMAC-SHA256(email normalizado, JWT_SECRET) en hex, truncado a 32 chars.
 * No se guarda en BD: se deriva del email, así que el enlace de los correos es estable.
 */
export function unsubscribeToken(email: string, secret: string | undefined = process.env.JWT_SECRET): string {
  if (!secret) {
    throw new Error("JWT_SECRET requerido para generar el token de baja");
  }
  return createHmac("sha256", secret).update(email.trim().toLowerCase()).digest("hex").slice(0, 32);
}

/** Comparación en tiempo constante; false si falta secreto o el formato no coincide. */
export function verifyUnsubscribeToken(
  email: string,
  token: string | undefined | null,
  secret: string | undefined = process.env.JWT_SECRET,
): boolean {
  if (!secret || typeof token !== "string") return false;
  const expected = unsubscribeToken(email, secret);
  const given = token.trim().toLowerCase();
  if (given.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(given, "utf8"), Buffer.from(expected, "utf8"));
}

/** URL absoluta de baja con un clic (enlace de los correos). */
export function unsubscribeUrl(apiBaseUrl: string, email: string, secret?: string): string {
  const base = apiBaseUrl.replace(/\/+$/, "");
  const params = new URLSearchParams({ email: email.trim().toLowerCase(), token: unsubscribeToken(email, secret) });
  return `${base}/api/newsletter/unsubscribe?${params.toString()}`;
}
