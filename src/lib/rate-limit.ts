import { createMiddleware } from "hono/factory";

export const RATE_LIMIT_MESSAGE = "Demasiadas solicitudes. Inténtalo de nuevo en unos minutos.";

export type RateLimitOptions = {
  /** Ventana en milisegundos (por defecto 10 min). */
  windowMs?: number;
  /** Máximo de peticiones por IP y ventana (por defecto 10). */
  max?: number;
  /** Forma del JSON de error: `{ ok:false }` (por defecto) o `{ success:false }`. */
  shape?: "ok" | "success";
  /** Permite desactivarlo explícitamente; por defecto depende de RATE_LIMIT_DISABLED=1. */
  enabled?: boolean;
  /** Reloj inyectable para tests. */
  now?: () => number;
};

type Bucket = { count: number; resetAt: number };

/** IP del cliente: primer valor de `x-forwarded-for`, luego `x-real-ip`; si no hay, `local`. */
export function clientIp(headers: { get(name: string): string | null | undefined }): string {
  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = headers.get("x-real-ip")?.trim();
  return real && real.length > 0 ? real : "local";
}

export function isRateLimitDisabled(): boolean {
  return process.env.RATE_LIMIT_DISABLED === "1";
}

/**
 * Rate limit en memoria por IP (suficiente para una instancia; en serverless cada instancia
 * lleva su propio contador). Devuelve 429 con mensaje en español al superar `max` en `windowMs`.
 */
export function rateLimit(opts: RateLimitOptions = {}) {
  const windowMs = opts.windowMs ?? 10 * 60 * 1000;
  const max = opts.max ?? 10;
  const shape = opts.shape ?? "ok";
  const enabled = opts.enabled ?? !isRateLimitDisabled();
  const now = opts.now ?? (() => Date.now());
  const buckets = new Map<string, Bucket>();

  const prune = (t: number): void => {
    if (buckets.size < 1000) return;
    for (const [k, b] of buckets) {
      if (b.resetAt <= t) buckets.delete(k);
    }
  };

  return createMiddleware(async (c, next) => {
    if (!enabled) {
      await next();
      return;
    }
    const t = now();
    prune(t);
    const ip = clientIp(c.req.raw.headers);
    let b = buckets.get(ip);
    if (!b || b.resetAt <= t) {
      b = { count: 0, resetAt: t + windowMs };
      buckets.set(ip, b);
    }
    b.count += 1;
    if (b.count > max) {
      const retryAfter = Math.max(1, Math.ceil((b.resetAt - t) / 1000));
      c.header("Retry-After", String(retryAfter));
      const body = shape === "success" ? { success: false, error: RATE_LIMIT_MESSAGE } : { ok: false, error: RATE_LIMIT_MESSAGE };
      return c.json(body, 429);
    }
    await next();
  });
}
