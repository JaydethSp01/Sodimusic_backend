/**
 * Facebook para el feed social: SOLO Graph API con token de página (`FACEBOOK_PAGE_TOKEN`).
 * Cualquier lectura anónima (www, m, mbasic, oEmbed sin token) responde 400/403 y además
 * incumple los términos de Meta, así que sin token no se toca la red.
 */
import { fetchJson } from "./http.js";
import type { SocialPostInput } from "./types.js";

export const FACEBOOK_TOKEN_MISSING = "Falta FACEBOOK_PAGE_TOKEN";
export const GRAPH_VERSION = "v19.0";
export const FB_MAX_POSTS = 15;
const FIELDS = "id,message,permalink_url,created_time,full_picture,attachments{title,url,unshimmed_url,media_type,media{image{src}}}";

export type GraphAttachment = {
  title?: string;
  url?: string;
  unshimmed_url?: string;
  media_type?: string;
  media?: { image?: { src?: string } };
};
export type GraphPost = {
  id?: string;
  message?: string;
  permalink_url?: string;
  created_time?: string;
  full_picture?: string;
  attachments?: { data?: GraphAttachment[] };
};
export type GraphPostsResponse = { data?: GraphPost[]; error?: { message?: string; code?: number; type?: string } };

export const fbExternalId = (postId: string): string => `fb:${postId}`;

/** Primera línea no vacía de `message`, ≤ 120 caracteres (con "…" si se recorta). */
export function titleFromMessage(message: string | undefined | null): string | null {
  if (!message) return null;
  const line = message
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  if (!line) return null;
  return line.length > 120 ? `${line.slice(0, 119).trimEnd()}…` : line;
}

/** Convierte un post de Graph en `SocialPostInput` (null si no tiene id o fecha válida). */
export function mapGraphPost(post: GraphPost, author: string | null = null): SocialPostInput | null {
  if (!post.id) return null;
  const createdAt = post.created_time ? new Date(post.created_time) : new Date(NaN);
  if (Number.isNaN(createdAt.getTime())) return null;
  const att = post.attachments?.data?.[0];
  const title = att?.title?.trim() || titleFromMessage(post.message) || "Publicación en Facebook";
  const imageUrl = post.full_picture?.trim() || att?.media?.image?.src?.trim() || null;
  const url = post.permalink_url?.trim() || `https://www.facebook.com/${post.id}`;
  return {
    kind: "FACEBOOK_POST",
    externalId: fbExternalId(post.id),
    title,
    text: post.message?.trim() ? post.message.trim().slice(0, 4000) : null,
    url,
    imageUrl,
    author,
    publishedAt: createdAt,
    raw: {
      source: "facebook-graph",
      id: post.id,
      created_time: post.created_time,
      attachment: att ? { media_type: att.media_type ?? null, url: att.unshimmed_url ?? att.url ?? null } : null,
    },
  };
}

/** Mapea la respuesta completa de `{page}/posts` (lanza si trae `error`). */
export function mapGraphPosts(json: GraphPostsResponse, author: string | null = null): SocialPostInput[] {
  if (json.error) {
    throw new Error(`Graph API: ${json.error.message ?? "error desconocido"}${json.error.code ? ` (code ${json.error.code})` : ""}`);
  }
  return (json.data ?? []).map((p) => mapGraphPost(p, author)).filter((p): p is SocialPostInput => p !== null);
}

export type FetchPagePostsOptions = { signal?: AbortSignal; timeoutMs?: number; author?: string | null };

/**
 * Últimas publicaciones (≤ 15) de una página administrada. Sin token lanza
 * `Error("Falta FACEBOOK_PAGE_TOKEN")` ANTES de tocar la red.
 */
export async function fetchPagePosts(
  pageIdOrUsername: string,
  token: string | null | undefined,
  opts: FetchPagePostsOptions = {},
): Promise<SocialPostInput[]> {
  const tk = token?.trim();
  if (!tk) throw new Error(FACEBOOK_TOKEN_MISSING);
  const page = pageIdOrUsername.trim().replace(/^@/, "");
  if (!/^[A-Za-z0-9._-]{1,100}$/.test(page)) throw new Error(`Página de Facebook inválida: ${pageIdOrUsername}`);
  const url =
    `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(page)}/posts` +
    `?fields=${encodeURIComponent(FIELDS)}&limit=${FB_MAX_POSTS}&access_token=${encodeURIComponent(tk)}`;
  let json: GraphPostsResponse;
  try {
    json = await fetchJson<GraphPostsResponse>(url, {
      timeoutMs: opts.timeoutMs ?? 8_000,
      maxBytes: 1_000_000,
      signal: opts.signal,
      browserHeaders: false,
    });
  } catch (err) {
    // Graph devuelve 400 con cuerpo JSON `{ error }`; el status ya es suficientemente descriptivo.
    throw err instanceof Error ? err : new Error(String(err));
  }
  return mapGraphPosts(json, opts.author ?? null);
}
