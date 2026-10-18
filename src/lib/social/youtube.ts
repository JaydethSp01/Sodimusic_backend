/**
 * YouTube para el feed social. Dos vías:
 * - Con `YOUTUBE_API_KEY` (Data API v3): `playlistItems` de la lista de subidas y `search` para menciones.
 * - Sin clave: HTML público de `/channel/<UC…>/videos` (`ytInitialData`), `oembed` y la página `watch?v=`
 *   para la fecha exacta (`"publishDate"`). Los feeds RSS responden 404 desde Vercel/esta red.
 * Sin dependencias de scraping: regex + JSON.parse.
 */
import { parseYoutubeChannelUrl } from "../../schemas/channel.js";
import { fetchJson, fetchText, metaContent } from "./http.js";
import type { SocialPostInput } from "./types.js";

export const YT_CHANNEL_ID_RE = /^UC[A-Za-z0-9_-]{22}$/;
const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

/** Tope de la página HTML de un canal / watch (≈ 0,9–1,3 MB reales; los campos útiles van al final). */
const YT_HTML_MAX_BYTES = 2_500_000;
const YT_TIMEOUT_MS = 8_000;
/** Máximo de videos por fuente y ejecución. */
export const YT_MAX_VIDEOS = 15;
/** Máximo de páginas `watch?v=` consultadas por ejecución para obtener la fecha exacta de videos nuevos. */
export const YT_MAX_DATE_LOOKUPS = 8;

export type YtVideoListing = {
  videoId: string;
  title: string;
  /** "hace 3 días", "2 weeks ago", "Streamed 1 month ago"… o null */
  publishedText: string | null;
  thumbnailUrl: string | null;
};

export type YtChannelPage = {
  channelId: string | null;
  name: string | null;
  videos: YtVideoListing[];
};

export const videoUrl = (videoId: string): string => `https://www.youtube.com/watch?v=${videoId}`;
export const videoThumbnail = (videoId: string): string => `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
export const ytExternalId = (videoId: string): string => `yt:${videoId}`;

/** videoId de una URL de YouTube (`watch?v=`, `youtu.be/`, `/shorts/`, `/embed/`, `/live/`). */
export function youtubeVideoIdFromUrl(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\.|^m\.|^music\./, "");
  if (host !== "youtube.com" && host !== "youtu.be" && host !== "youtube-nocookie.com") return null;
  let id: string | null = null;
  if (host === "youtu.be") {
    id = u.pathname.split("/").filter(Boolean)[0] ?? null;
  } else {
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts[0] === "watch") {
      id = u.searchParams.get("v");
    } else if (parts[0] === "shorts" || parts[0] === "embed" || parts[0] === "live" || parts[0] === "v") {
      id = parts[1] ?? null;
    }
  }
  return id && VIDEO_ID_RE.test(id) ? id : null;
}

// ---------------------------------------------------------------------------
// Fechas relativas ("hace 3 días", "2 weeks ago", "Streamed 1 month ago")
// ---------------------------------------------------------------------------

const UNIT_MS: Array<[RegExp, number]> = [
  [/^(s|seg|segundos?|sec|secs|seconds?)$/i, 1_000],
  [/^(min|mins|minutos?|minutes?)$/i, 60_000],
  [/^(h|hora|horas|hour|hours)$/i, 3_600_000],
  [/^(d|día|días|dia|dias|day|days)$/i, 86_400_000],
  [/^(sem|semana|semanas|week|weeks|wk|wks)$/i, 7 * 86_400_000],
  [/^(mes|meses|month|months|mo)$/i, 30 * 86_400_000],
  [/^(a|año|años|ano|anos|year|years|yr|yrs)$/i, 365 * 86_400_000],
];

/**
 * Convierte un texto relativo de YouTube (es/en, con prefijos "Streamed"/"Premiered"/"Transmitido"/"Estreno")
 * a una fecha aproximada respecto a `now`. Devuelve null si no lo entiende.
 */
export function parseRelativeTime(text: string | null | undefined, now: Date = new Date()): Date | null {
  if (!text) return null;
  const t = text
    .normalize("NFC")
    .toLowerCase()
    .replace(/ /g, " ")
    .trim();
  const m = /(\d+)\s*([a-záéíóúñ]+)/i.exec(t);
  if (!m) return null;
  const n = Number(m[1]);
  const unit = m[2] ?? "";
  if (!Number.isFinite(n) || n < 0) return null;
  for (const [re, ms] of UNIT_MS) {
    if (re.test(unit)) return new Date(now.getTime() - n * ms);
  }
  return null;
}

// ---------------------------------------------------------------------------
// HTML público del canal → ytInitialData → listado de videos
// ---------------------------------------------------------------------------

/** Extrae y parsea el objeto `ytInitialData` del HTML (null si no está o no es JSON válido). */
export function extractYtInitialData(html: string): unknown {
  const start = html.search(/ytInitialData\s*=\s*\{/);
  if (start < 0) return null;
  const braceStart = html.indexOf("{", start);
  const end = html.indexOf("};</script>", braceStart);
  const candidates = end >= 0 ? [html.slice(braceStart, end + 1)] : [];
  // Fallback: hasta el último "}" (por si el cierre del script cambia de forma).
  const lastBrace = html.lastIndexOf("}");
  if (lastBrace > braceStart) candidates.push(html.slice(braceStart, lastBrace + 1));
  for (const c of candidates) {
    try {
      return JSON.parse(c);
    } catch {
      // probar el siguiente candidato
    }
  }
  return null;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

function runsText(v: unknown): string | null {
  if (!isObj(v)) return null;
  if (typeof v["simpleText"] === "string") return v["simpleText"];
  if (typeof v["content"] === "string") return v["content"];
  const runs = v["runs"];
  if (Array.isArray(runs)) {
    const s = runs
      .map((r) => (isObj(r) && typeof r["text"] === "string" ? r["text"] : ""))
      .join("")
      .trim();
    return s.length > 0 ? s : null;
  }
  return null;
}

function largestThumb(sources: unknown): string | null {
  if (!Array.isArray(sources)) return null;
  let best: { url: string; w: number } | null = null;
  for (const s of sources) {
    if (!isObj(s) || typeof s["url"] !== "string") continue;
    const w = typeof s["width"] === "number" ? s["width"] : 0;
    if (!best || w >= best.w) best = { url: s["url"], w };
  }
  return best?.url ?? null;
}

const RELATIVE_HINT = /\b(hace|ago|streamed|premiered|transmitid|estren)\b|\d+\s*(d|h|min|sem|mes|a)\b/i;

function fromVideoRenderer(r: Obj): YtVideoListing | null {
  const videoId = r["videoId"];
  if (typeof videoId !== "string" || !VIDEO_ID_RE.test(videoId)) return null;
  const title = runsText(r["title"]) ?? "";
  const publishedText = runsText(r["publishedTimeText"]);
  const thumb = isObj(r["thumbnail"]) ? largestThumb((r["thumbnail"] as Obj)["thumbnails"]) : null;
  return { videoId, title, publishedText, thumbnailUrl: thumb };
}

function fromLockupViewModel(l: Obj): YtVideoListing | null {
  const videoId = l["contentId"];
  if (typeof videoId !== "string" || !VIDEO_ID_RE.test(videoId)) return null;
  const contentType = l["contentType"];
  if (typeof contentType === "string" && contentType !== "LOCKUP_CONTENT_TYPE_VIDEO") return null;
  const meta = isObj(l["metadata"]) ? (l["metadata"] as Obj)["lockupMetadataViewModel"] : null;
  const title = (isObj(meta) ? runsText(meta["title"]) : null) ?? "";
  let publishedText: string | null = null;
  const cm = isObj(meta) && isObj(meta["metadata"]) ? (meta["metadata"] as Obj)["contentMetadataViewModel"] : null;
  const rows = isObj(cm) ? cm["metadataRows"] : null;
  if (Array.isArray(rows)) {
    outer: for (const row of rows) {
      const parts = isObj(row) ? row["metadataParts"] : null;
      if (!Array.isArray(parts)) continue;
      for (const part of parts) {
        if (!isObj(part)) continue;
        // `text.content` puede venir recortado ("hace 1 a"); `accessibilityLabel` trae el texto completo.
        const label = typeof part["accessibilityLabel"] === "string" ? part["accessibilityLabel"] : null;
        const content = runsText(part["text"]);
        const candidate = label ?? content;
        if (candidate && RELATIVE_HINT.test(candidate) && !/vistas|views|visualiza/i.test(candidate)) {
          publishedText = candidate;
          break outer;
        }
      }
    }
  }
  const img = isObj(l["contentImage"]) ? (l["contentImage"] as Obj)["thumbnailViewModel"] : null;
  const thumb = isObj(img) && isObj(img["image"]) ? largestThumb((img["image"] as Obj)["sources"]) : null;
  return { videoId, title, publishedText, thumbnailUrl: thumb };
}

/** Recorre `ytInitialData` y devuelve los videos (`videoRenderer` clásico y `lockupViewModel` nuevo), sin duplicados. */
export function listVideosFromYtInitialData(data: unknown, max = YT_MAX_VIDEOS): YtVideoListing[] {
  const out: YtVideoListing[] = [];
  const seen = new Set<string>();
  const push = (v: YtVideoListing | null): void => {
    if (!v || seen.has(v.videoId) || out.length >= max) return;
    seen.add(v.videoId);
    out.push(v);
  };
  const walk = (node: unknown, depth: number): void => {
    if (out.length >= max || depth > 60 || !node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const x of node) walk(x, depth + 1);
      return;
    }
    const o = node as Obj;
    if (isObj(o["videoRenderer"])) push(fromVideoRenderer(o["videoRenderer"] as Obj));
    if (isObj(o["gridVideoRenderer"])) push(fromVideoRenderer(o["gridVideoRenderer"] as Obj));
    if (isObj(o["lockupViewModel"])) push(fromLockupViewModel(o["lockupViewModel"] as Obj));
    for (const k of Object.keys(o)) {
      if (k === "videoRenderer" || k === "gridVideoRenderer" || k === "lockupViewModel") continue;
      walk(o[k], depth + 1);
    }
  };
  walk(data, 0);
  return out;
}

/** channelId (UC…) presente en un HTML de YouTube (`"externalId"`, `"channelId"`, `itemprop=identifier` o canonical). */
export function channelIdFromHtml(html: string): string | null {
  const patterns = [
    /"externalId":"(UC[A-Za-z0-9_-]{22})"/,
    /<meta\s+itemprop=["'](?:identifier|channelId)["']\s+content=["'](UC[A-Za-z0-9_-]{22})["']/i,
    /<link\s+rel=["']canonical["']\s+href=["']https?:\/\/www\.youtube\.com\/channel\/(UC[A-Za-z0-9_-]{22})["']/i,
    /"channelId":"(UC[A-Za-z0-9_-]{22})"/,
  ];
  for (const re of patterns) {
    const m = re.exec(html);
    if (m?.[1]) return m[1];
  }
  return null;
}

/** Nombre del canal (`og:title`) del HTML de un canal. */
export function channelNameFromHtml(html: string): string | null {
  return metaContent(html, "og:title");
}

/** Parsea la página `/channel/<id>/videos`: id, nombre y listado. */
export function parseChannelVideosHtml(html: string, max = YT_MAX_VIDEOS): YtChannelPage {
  const data = extractYtInitialData(html);
  return {
    channelId: channelIdFromHtml(html),
    name: channelNameFromHtml(html),
    videos: data ? listVideosFromYtInitialData(data, max) : [],
  };
}

export type WatchPageInfo = {
  publishedAt: Date | null;
  channelId: string | null;
  channelName: string | null;
  title: string | null;
};

/** Datos útiles de la página `watch?v=`: `"publishDate"`, `"channelId"`, autor y título. */
export function parseWatchHtml(html: string): WatchPageInfo {
  const date = /"publishDate":"([^"]+)"/.exec(html)?.[1] ?? /<meta\s+itemprop=["']datePublished["']\s+content=["']([^"']+)["']/i.exec(html)?.[1] ?? null;
  let publishedAt: Date | null = null;
  if (date) {
    const d = new Date(date);
    publishedAt = Number.isNaN(d.getTime()) ? null : d;
  }
  const channelId = /"channelId":"(UC[A-Za-z0-9_-]{22})"/.exec(html)?.[1] ?? null;
  const channelName = /"ownerChannelName":"((?:[^"\\]|\\.)*)"/.exec(html)?.[1] ?? /"author":"((?:[^"\\]|\\.)*)"/.exec(html)?.[1] ?? null;
  const title = metaContent(html, "og:title");
  return {
    publishedAt,
    channelId,
    channelName: channelName ? safeJsonString(channelName) : null,
    title,
  };
}

function safeJsonString(escaped: string): string {
  try {
    return JSON.parse(`"${escaped}"`) as string;
  } catch {
    return escaped;
  }
}

export type YtFetchOptions = {
  signal?: AbortSignal;
  timeoutMs?: number;
};

/** Descarga `watch?v=<id>` y devuelve fecha exacta/canal. Lanza si falla la red. */
export async function fetchWatchInfo(videoId: string, opts: YtFetchOptions = {}): Promise<WatchPageInfo> {
  const html = await fetchText(videoUrl(videoId), {
    timeoutMs: opts.timeoutMs ?? YT_TIMEOUT_MS,
    maxBytes: YT_HTML_MAX_BYTES,
    signal: opts.signal,
  });
  return parseWatchHtml(html);
}

export type OembedInfo = { title: string | null; authorName: string | null; authorUrl: string | null; thumbnailUrl: string | null };

/** `https://www.youtube.com/oembed?url=…&format=json` (sin clave). Lanza si falla. */
export async function fetchOembed(videoUrlOrId: string, opts: YtFetchOptions = {}): Promise<OembedInfo> {
  const target = VIDEO_ID_RE.test(videoUrlOrId) ? videoUrl(videoUrlOrId) : videoUrlOrId;
  const json = await fetchJson<Record<string, unknown>>(
    `https://www.youtube.com/oembed?url=${encodeURIComponent(target)}&format=json`,
    { timeoutMs: opts.timeoutMs ?? 5_000, maxBytes: 200_000, signal: opts.signal },
  );
  const str = (k: string): string | null => (typeof json[k] === "string" && (json[k] as string).trim() ? (json[k] as string) : null);
  return { title: str("title"), authorName: str("author_name"), authorUrl: str("author_url"), thumbnailUrl: str("thumbnail_url") };
}

export type ResolvedChannel = { channelId: string; name: string | null; url: string };

/**
 * Resuelve `UC…` a partir de un id, `@handle`, o URL (`/channel/UC…`, `/@handle`, `/c/x`, `/user/x`).
 * Para handles descarga la página del canal y lee `"externalId":"UC…"`. Devuelve null si no se puede.
 */
export async function resolveChannelId(urlOrHandle: string, opts: YtFetchOptions = {}): Promise<ResolvedChannel | null> {
  const input = urlOrHandle.trim();
  if (!input) return null;
  if (YT_CHANNEL_ID_RE.test(input)) {
    return { channelId: input, name: null, url: `https://www.youtube.com/channel/${input}` };
  }
  let pageUrl: string;
  if (/^https?:\/\//i.test(input)) {
    const parsed = parseYoutubeChannelUrl(input);
    if (parsed.channelId) {
      return { channelId: parsed.channelId, name: null, url: `https://www.youtube.com/channel/${parsed.channelId}` };
    }
    const u = new URL(input);
    const host = u.hostname.replace(/^(www|m)\./, "");
    if (host !== "youtube.com") return null;
    pageUrl = `https://www.youtube.com${u.pathname}`;
  } else {
    const handle = input.replace(/^@/, "");
    if (!/^[A-Za-z0-9._-]{1,64}$/.test(handle)) return null;
    pageUrl = `https://www.youtube.com/@${handle}`;
  }
  const html = await fetchText(pageUrl, { timeoutMs: opts.timeoutMs ?? YT_TIMEOUT_MS, maxBytes: YT_HTML_MAX_BYTES, signal: opts.signal });
  const channelId = channelIdFromHtml(html);
  if (!channelId) return null;
  return { channelId, name: channelNameFromHtml(html), url: `https://www.youtube.com/channel/${channelId}` };
}

// ---------------------------------------------------------------------------
// Data API v3 (con clave)
// ---------------------------------------------------------------------------

const API = "https://www.googleapis.com/youtube/v3";

type ApiSnippet = {
  publishedAt?: string;
  title?: string;
  description?: string;
  channelTitle?: string;
  videoOwnerChannelTitle?: string;
  thumbnails?: Record<string, { url?: string } | undefined>;
  resourceId?: { videoId?: string };
};
type ApiItem = { id?: string | { videoId?: string }; snippet?: ApiSnippet };

function thumbFromSnippet(s: ApiSnippet, videoId: string): string {
  const t = s.thumbnails ?? {};
  return t["high"]?.url ?? t["medium"]?.url ?? t["default"]?.url ?? videoThumbnail(videoId);
}

function postFromApiItem(item: ApiItem): SocialPostInput | null {
  const s = item.snippet;
  if (!s) return null;
  const candidates = [s.resourceId?.videoId, typeof item.id === "object" && item.id ? item.id.videoId : undefined];
  const videoId = candidates.find((v): v is string => typeof v === "string" && VIDEO_ID_RE.test(v));
  if (!videoId) return null;
  const publishedAt = s.publishedAt ? new Date(s.publishedAt) : new Date(NaN);
  if (Number.isNaN(publishedAt.getTime())) return null;
  return {
    kind: "YOUTUBE_VIDEO",
    externalId: ytExternalId(videoId),
    title: (s.title ?? "").trim() || "Video de YouTube",
    text: s.description?.trim() ? s.description.trim().slice(0, 2000) : null,
    url: videoUrl(videoId),
    imageUrl: thumbFromSnippet(s, videoId),
    author: s.videoOwnerChannelTitle ?? s.channelTitle ?? null,
    publishedAt,
    raw: { source: "youtube-api", snippet: { publishedAt: s.publishedAt, channelTitle: s.channelTitle } },
  };
}

export type FetchChannelVideosOptions = YtFetchOptions & {
  apiKey?: string | null;
  /** Dado un listado de videoIds, devuelve los que ya existen en BD (no se consulta su fecha exacta). */
  knownVideoIds?: (ids: string[]) => Promise<Set<string>>;
  /** Máximo de páginas `watch?v=` por ejecución (por defecto 8). */
  maxDateLookups?: number;
  now?: () => Date;
};

/**
 * Últimos videos (≤ 15) de un canal. Con `apiKey`: `playlistItems` de la lista de subidas (`UU…`).
 * Sin clave: HTML público; para los videos nuevos obtiene la fecha exacta de `watch?v=` (≤ `maxDateLookups`),
 * y si falla usa la fecha relativa aproximada (`publishedAtApprox: true`).
 */
export async function fetchChannelVideos(channelId: string, opts: FetchChannelVideosOptions = {}): Promise<SocialPostInput[]> {
  if (!YT_CHANNEL_ID_RE.test(channelId)) throw new Error(`channelId inválido: ${channelId}`);
  const timeoutMs = opts.timeoutMs ?? YT_TIMEOUT_MS;
  if (opts.apiKey) {
    const playlistId = `UU${channelId.slice(2)}`;
    const url = `${API}/playlistItems?part=snippet&playlistId=${playlistId}&maxResults=${YT_MAX_VIDEOS}&key=${encodeURIComponent(opts.apiKey)}`;
    const json = await fetchJson<{ items?: ApiItem[] }>(url, { timeoutMs, maxBytes: 1_000_000, signal: opts.signal, browserHeaders: false });
    return (json.items ?? []).map(postFromApiItem).filter((p): p is SocialPostInput => p !== null);
  }

  const html = await fetchText(`https://www.youtube.com/channel/${channelId}/videos`, {
    timeoutMs,
    maxBytes: YT_HTML_MAX_BYTES,
    signal: opts.signal,
  });
  const page = parseChannelVideosHtml(html);
  const now = opts.now?.() ?? new Date();
  const known = opts.knownVideoIds ? await opts.knownVideoIds(page.videos.map((v) => v.videoId)) : new Set<string>();
  const maxLookups = opts.maxDateLookups ?? YT_MAX_DATE_LOOKUPS;
  let lookups = 0;
  const out: SocialPostInput[] = [];
  for (const v of page.videos) {
    let publishedAt: Date | null = null;
    let approx = true;
    if (!known.has(v.videoId) && lookups < maxLookups && !opts.signal?.aborted) {
      lookups += 1;
      try {
        const info = await fetchWatchInfo(v.videoId, { timeoutMs, signal: opts.signal });
        if (info.publishedAt) {
          publishedAt = info.publishedAt;
          approx = false;
        }
      } catch {
        // fecha relativa aproximada
      }
    }
    if (!publishedAt) publishedAt = parseRelativeTime(v.publishedText, now) ?? now;
    out.push({
      kind: "YOUTUBE_VIDEO",
      externalId: ytExternalId(v.videoId),
      title: v.title.trim() || "Video de YouTube",
      text: null,
      url: videoUrl(v.videoId),
      // Miniatura estable (las URLs `sqp=`/`rs=` del listado están firmadas y cambian).
      imageUrl: videoThumbnail(v.videoId),
      author: page.name,
      publishedAt,
      publishedAtApprox: approx,
      raw: { source: "youtube-html", publishedText: v.publishedText, listedThumbnail: v.thumbnailUrl },
    });
  }
  return out;
}

export type SearchVideosOptions = YtFetchOptions & { apiKey?: string | null; publishedAfter?: Date; now?: () => Date };

/**
 * Menciones recientes (`search?q=&order=date`, últimos 180 días). Solo con clave: sin ella lanza
 * `Error("Falta YOUTUBE_API_KEY")` sin tocar la red.
 */
export async function searchVideos(query: string, opts: SearchVideosOptions = {}): Promise<SocialPostInput[]> {
  if (!opts.apiKey) throw new Error("Falta YOUTUBE_API_KEY");
  const now = opts.now?.() ?? new Date();
  const after = opts.publishedAfter ?? new Date(now.getTime() - 180 * 86_400_000);
  const url =
    `${API}/search?part=snippet&q=${encodeURIComponent(query)}&type=video&order=date&maxResults=${YT_MAX_VIDEOS}` +
    `&publishedAfter=${encodeURIComponent(after.toISOString().replace(/\.\d{3}Z$/, "Z"))}&key=${encodeURIComponent(opts.apiKey)}`;
  const json = await fetchJson<{ items?: ApiItem[] }>(url, { timeoutMs: opts.timeoutMs ?? YT_TIMEOUT_MS, maxBytes: 1_000_000, signal: opts.signal, browserHeaders: false });
  return (json.items ?? []).map(postFromApiItem).filter((p): p is SocialPostInput => p !== null);
}
