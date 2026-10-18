/**
 * Metadatos de una URL para la carga manual de "Novedades":
 * - YouTube → oEmbed (título, autor, miniatura) + `watch?v=` (`"publishDate"`), `kind: YOUTUBE_VIDEO`.
 * - facebook.com / fb.watch → sin red (responde 400/403 anónimo): solo el `title` que llegó.
 * - Resto → og:title / og:image / og:description (timeout 5 s, tope 1 MB).
 */
import { createHash } from "node:crypto";
import { fetchText, metaContent } from "./http.js";
import type { SocialPostKind } from "./types.js";
import { fetchOembed, fetchWatchInfo, videoThumbnail, videoUrl, youtubeVideoIdFromUrl, ytExternalId } from "./youtube.js";

export type ResolvedLink = {
  kind: SocialPostKind;
  externalId: string;
  url: string;
  title: string | null;
  text: string | null;
  imageUrl: string | null;
  author: string | null;
  publishedAt: Date | null;
  raw: unknown;
};

const TRACKING_PARAMS = /^(utm_|fbclid$|gclid$|igshid$|mc_cid$|mc_eid$|si$|feature$)/i;

/** URL canónica para el `externalId`: sin hash, sin parámetros de tracking, host en minúsculas. */
export function normalizeLinkUrl(raw: string): string {
  const u = new URL(raw.trim());
  u.hash = "";
  u.hostname = u.hostname.toLowerCase();
  for (const key of [...u.searchParams.keys()]) {
    if (TRACKING_PARAMS.test(key)) u.searchParams.delete(key);
  }
  let s = u.toString();
  if (u.search === "" && s.endsWith("?")) s = s.slice(0, -1);
  return s;
}

export function sha1(s: string): string {
  return createHash("sha1").update(s).digest("hex");
}

export const linkExternalId = (normalizedUrl: string): string => `link:${sha1(normalizedUrl)}`;

export function isFacebookUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^(www|m|mbasic|web|l)\./, "");
    return host === "facebook.com" || host === "fb.watch" || host === "fb.com" || host.endsWith(".facebook.com");
  } catch {
    return false;
  }
}

export type ResolveLinkOptions = { signal?: AbortSignal; timeoutMs?: number; maxBytes?: number };

/** Metadatos de `rawUrl`. Nunca lanza por errores de red: devuelve campos null. Lanza solo si la URL es inválida. */
export async function resolveLink(rawUrl: string, opts: ResolveLinkOptions = {}): Promise<ResolvedLink> {
  const videoId = youtubeVideoIdFromUrl(rawUrl);
  if (videoId) {
    const [oembed, watch] = await Promise.allSettled([
      fetchOembed(videoId, { signal: opts.signal, timeoutMs: opts.timeoutMs ?? 5_000 }),
      fetchWatchInfo(videoId, { signal: opts.signal, timeoutMs: opts.timeoutMs ?? 8_000 }),
    ]);
    const o = oembed.status === "fulfilled" ? oembed.value : null;
    const w = watch.status === "fulfilled" ? watch.value : null;
    return {
      kind: "YOUTUBE_VIDEO",
      externalId: ytExternalId(videoId),
      url: videoUrl(videoId),
      title: o?.title ?? w?.title ?? null,
      text: null,
      imageUrl: o?.thumbnailUrl ?? videoThumbnail(videoId),
      author: o?.authorName ?? w?.channelName ?? null,
      publishedAt: w?.publishedAt ?? null,
      raw: { source: "manual-youtube", oembed: o, channelId: w?.channelId ?? null },
    };
  }

  const url = normalizeLinkUrl(rawUrl);
  const externalId = linkExternalId(url);
  if (isFacebookUrl(url)) {
    return { kind: "LINK", externalId, url, title: null, text: null, imageUrl: null, author: null, publishedAt: null, raw: { source: "manual-facebook" } };
  }

  let html: string | null = null;
  try {
    html = await fetchText(url, { timeoutMs: opts.timeoutMs ?? 5_000, maxBytes: opts.maxBytes ?? 1_000_000, signal: opts.signal });
  } catch {
    html = null;
  }
  if (!html) {
    return { kind: "LINK", externalId, url, title: null, text: null, imageUrl: null, author: null, publishedAt: null, raw: { source: "manual-link", fetched: false } };
  }
  const title = metaContent(html, "og:title") ?? metaContent(html, "twitter:title") ?? titleTag(html);
  const imageUrl = absolutize(metaContent(html, "og:image") ?? metaContent(html, "twitter:image"), url);
  const text = metaContent(html, "og:description") ?? metaContent(html, "description");
  const author = metaContent(html, "og:site_name") ?? metaContent(html, "author");
  const published = metaContent(html, "article:published_time") ?? metaContent(html, "og:updated_time");
  const publishedAt = published ? toDate(published) : null;
  return { kind: "LINK", externalId, url, title, text: text ? text.slice(0, 2000) : null, imageUrl, author, publishedAt, raw: { source: "manual-link", fetched: true } };
}

function titleTag(html: string): string | null {
  const m = /<title[^>]*>([^<]{1,300})<\/title>/i.exec(html);
  const t = m?.[1]?.replace(/\s+/g, " ").trim();
  return t && t.length > 0 ? t : null;
}

function absolutize(value: string | null, base: string): string | null {
  if (!value) return null;
  try {
    const u = new URL(value, base);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

function toDate(s: string): Date | null {
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}
