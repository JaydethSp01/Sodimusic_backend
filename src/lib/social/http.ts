/**
 * `fetch` acotado para las fuentes externas del feed social: timeout, tope de bytes y
 * cabeceras de navegador. Nunca se usa sin `try/catch` desde los fetchers.
 */

export const BROWSER_USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export type FetchTextOptions = {
  /** Timeout total (ms). Por defecto 8 s. */
  timeoutMs?: number;
  /** Tope de bytes leídos; el resto se descarta. Por defecto 2 MB. */
  maxBytes?: number;
  headers?: Record<string, string>;
  /** Señal externa (p. ej. el presupuesto global de la sincronización). */
  signal?: AbortSignal;
  /** Si es `false`, no añade el User-Agent de navegador ni `Accept-Language`. */
  browserHeaders?: boolean;
};

export class HttpStatusError extends Error {
  constructor(
    public readonly status: number,
    url: string,
  ) {
    super(`HTTP ${status} en ${url}`);
    this.name = "HttpStatusError";
  }
}

function combineSignals(timeoutMs: number, external?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  if (!external) return timeout;
  const anyFn = (AbortSignal as unknown as { any?: (signals: AbortSignal[]) => AbortSignal }).any;
  if (typeof anyFn === "function") return anyFn([timeout, external]);
  return timeout;
}

/** Lee el cuerpo de `res` como texto, cortando en `maxBytes` (el resto se cancela). */
export async function readBodyCapped(res: Response, maxBytes: number): Promise<string> {
  const body = res.body;
  if (!body) {
    const text = await res.text();
    return text.length > maxBytes ? text.slice(0, maxBytes) : text;
  }
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      chunks.push(value);
      received += value.byteLength;
      if (received >= maxBytes) {
        await reader.cancel().catch(() => undefined);
        break;
      }
    }
  } finally {
    reader.releaseLock?.();
  }
  const buf = new Uint8Array(Math.min(received, maxBytes));
  let offset = 0;
  for (const chunk of chunks) {
    const remaining = buf.byteLength - offset;
    if (remaining <= 0) break;
    const slice = chunk.byteLength > remaining ? chunk.subarray(0, remaining) : chunk;
    buf.set(slice, offset);
    offset += slice.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(buf);
}

/** GET `url` y devuelve el cuerpo como texto. Lanza `HttpStatusError` si el estado no es 2xx. */
export async function fetchText(url: string, opts: FetchTextOptions = {}): Promise<string> {
  const timeoutMs = opts.timeoutMs ?? 8_000;
  const maxBytes = opts.maxBytes ?? 2_000_000;
  const headers: Record<string, string> = {
    ...(opts.browserHeaders === false
      ? {}
      : { "User-Agent": BROWSER_USER_AGENT, "Accept-Language": "es-CO,es;q=0.9,en;q=0.8" }),
    ...(opts.headers ?? {}),
  };
  const res = await fetch(url, {
    headers,
    redirect: "follow",
    signal: combineSignals(timeoutMs, opts.signal),
  });
  if (!res.ok) {
    await res.body?.cancel().catch(() => undefined);
    throw new HttpStatusError(res.status, url);
  }
  return readBodyCapped(res, maxBytes);
}

/** GET `url` y parsea JSON (mismos límites que `fetchText`). */
export async function fetchJson<T = unknown>(url: string, opts: FetchTextOptions = {}): Promise<T> {
  const text = await fetchText(url, { ...opts, headers: { Accept: "application/json", ...(opts.headers ?? {}) } });
  return JSON.parse(text) as T;
}

/** Mensaje corto y sin credenciales para `lastError`. */
export function errorMessage(err: unknown): string {
  if (err instanceof Error) {
    const name = err.name === "TimeoutError" || err.name === "AbortError" ? "Timeout" : "";
    const msg = (err.message || err.name || "Error").replace(/[?&](key|access_token)=[^&\s]+/gi, "$1=***");
    return (name ? `${name}: ${msg}` : msg).slice(0, 300);
  }
  return String(err).slice(0, 300);
}

/** Decodifica entidades HTML básicas de atributos `content="…"`. */
export function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)));
}

/** Valor de `<meta property="og:x" content="…">` o `<meta name="x" …>` (en cualquier orden de atributos). */
export function metaContent(html: string, key: string): string | null {
  const k = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name|itemprop)=["']${k}["'][^>]*content=["']([^"']*)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name|itemprop)=["']${k}["']`, "i"),
  ];
  for (const re of patterns) {
    const m = re.exec(html);
    if (m?.[1] !== undefined) {
      const v = decodeHtmlEntities(m[1]).trim();
      if (v.length > 0) return v;
    }
  }
  return null;
}
