/**
 * Sincronización del feed social: recorre las fuentes habilitadas, obtiene sus últimas publicaciones
 * y hace upsert en `SocialPost` por `externalId`. Un fallo en una fuente nunca tumba las demás.
 */
import type { PrismaClient, SocialSource } from "@prisma/client";
import { prisma } from "../prisma.js";
import { FACEBOOK_TOKEN_MISSING, fetchPagePosts } from "./facebook.js";
import { errorMessage } from "./http.js";
import type { SocialPostInput, SocialSourceKind, SocialSyncSourceResult, SocialSyncSummary } from "./types.js";
import { fetchChannelVideos, searchVideos, ytExternalId } from "./youtube.js";

export const SOCIAL_SYNC_AT_KEY = "socialSyncAt";
export const SOCIAL_SOURCES_SEEDED_KEY = "socialSourcesSeededAt";
/** Bloqueo blando: sin `force`, no se vuelve a sincronizar si la última fue hace menos de 2 min. */
export const SOCIAL_SOFT_LOCK_MS = 2 * 60_000;
/** Umbral del refresco perezoso del GET público. */
export const SOCIAL_STALE_MS = 30 * 60_000;
/** Timeout por fuente dentro del presupuesto global. */
export const SOCIAL_SOURCE_TIMEOUT_MS = 8_000;

export const DEFAULT_FACEBOOK_PAGE = { externalId: "sodimusic.oficial", label: "Facebook Sodimusic", url: "https://www.facebook.com/sodimusic.oficial" };
export const DEFAULT_YOUTUBE_SEARCH = { externalId: "Sodimusic", label: "Menciones en YouTube" };

type Client = PrismaClient;
type Env = Record<string, string | undefined>;

/** Última sincronización (ISO) guardada en AppMeta, o null. */
export async function getSocialSyncAt(client: Client = prisma): Promise<Date | null> {
  const row = await client.appMeta.findUnique({ where: { key: SOCIAL_SYNC_AT_KEY } });
  if (!row) return null;
  const d = new Date(row.value);
  return Number.isNaN(d.getTime()) ? null : d;
}

async function setMeta(client: Client, key: string, value: string): Promise<void> {
  await client.appMeta.upsert({ where: { key }, create: { key, value }, update: { value } });
}

/**
 * Crea las fuentes `YOUTUBE_CHANNEL` que faltan para cada `YoutubeChannel` ACTIVE con `channelId`.
 * Se ejecuta en cada sincronización (canales nuevos del admin entran solos). Devuelve cuántas creó.
 */
export async function ensureChannelSources(client: Client = prisma): Promise<number> {
  const channels = await client.youtubeChannel.findMany({
    where: { status: "ACTIVE", channelId: { not: null } },
    select: { name: true, url: true, channelId: true },
    orderBy: { sortOrder: "asc" },
  });
  if (channels.length === 0) return 0;
  const existing = await client.socialSource.findMany({ where: { kind: "YOUTUBE_CHANNEL" }, select: { externalId: true } });
  const have = new Set(existing.map((s) => s.externalId));
  const data = [];
  for (const ch of channels) {
    const id = ch.channelId?.trim();
    if (!id || have.has(id)) continue;
    have.add(id);
    data.push({ kind: "YOUTUBE_CHANNEL", label: ch.name, externalId: id, url: ch.url || `https://www.youtube.com/channel/${id}` });
  }
  if (data.length === 0) return 0;
  const r = await client.socialSource.createMany({ data, skipDuplicates: true });
  return r.count;
}

/**
 * Siembra las fuentes por defecto UNA sola vez (flag `AppMeta.socialSourcesSeededAt`):
 * canales ACTIVE con channelId, la página de Facebook del sello y la búsqueda "Sodimusic".
 */
export async function ensureSocialSources(client: Client = prisma): Promise<number> {
  const flag = await client.appMeta.findUnique({ where: { key: SOCIAL_SOURCES_SEEDED_KEY } });
  if (flag) return 0;
  let created = await ensureChannelSources(client);
  const r = await client.socialSource.createMany({
    data: [
      { kind: "FACEBOOK_PAGE", ...DEFAULT_FACEBOOK_PAGE },
      { kind: "YOUTUBE_SEARCH", externalId: DEFAULT_YOUTUBE_SEARCH.externalId, label: DEFAULT_YOUTUBE_SEARCH.label, url: null },
    ],
    skipDuplicates: true,
  });
  created += r.count;
  await setMeta(client, SOCIAL_SOURCES_SEEDED_KEY, new Date().toISOString());
  return created;
}

export type SyncSocialOptions = {
  force?: boolean;
  /** Presupuesto global en ms (6 s en el GET público, 25 s en cron/admin). */
  budgetMs?: number;
  client?: Client;
  env?: Env;
  now?: () => Date;
};

type FetchResult = { posts: SocialPostInput[]; error?: string };

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`Timeout (${Math.round(ms / 1000)} s) en ${label}`)), Math.max(1, ms));
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

async function fetchForSource(source: SocialSource, env: Env, signal: AbortSignal, client: Client): Promise<SocialPostInput[]> {
  const kind = source.kind as SocialSourceKind;
  switch (kind) {
    case "YOUTUBE_CHANNEL":
      return fetchChannelVideos(source.externalId, {
        apiKey: env["YOUTUBE_API_KEY"]?.trim() || null,
        signal,
        knownVideoIds: async (ids) => {
          if (ids.length === 0) return new Set();
          const rows = await client.socialPost.findMany({
            where: { externalId: { in: ids.map(ytExternalId) } },
            select: { externalId: true },
          });
          return new Set(rows.map((r) => r.externalId.slice(3)));
        },
      });
    case "FACEBOOK_PAGE": {
      const token = env["FACEBOOK_PAGE_TOKEN"]?.trim();
      if (!token) throw new Error(FACEBOOK_TOKEN_MISSING);
      return fetchPagePosts(source.externalId, token, { signal, author: source.label });
    }
    case "YOUTUBE_SEARCH":
      return searchVideos(source.externalId, { apiKey: env["YOUTUBE_API_KEY"]?.trim() || null, signal });
    default:
      throw new Error(`Tipo de fuente desconocido: ${source.kind}`);
  }
}

const sameInstant = (a: Date, b: Date): boolean => Math.abs(a.getTime() - b.getTime()) < 1000;

/**
 * Upsert de una publicación por `externalId`. En update solo toca `title/text/imageUrl/raw/publishedAt`
 * si cambiaron (nunca `status`/`pinned`); una fecha aproximada no sobreescribe una exacta ya guardada.
 */
export async function upsertSocialPost(client: Client, sourceId: string | null, p: SocialPostInput): Promise<"added" | "updated" | "unchanged"> {
  const existing = await client.socialPost.findUnique({ where: { externalId: p.externalId } });
  const raw = p.raw === undefined ? undefined : (p.raw as object);
  if (!existing) {
    await client.socialPost.create({
      data: {
        sourceId,
        kind: p.kind,
        externalId: p.externalId,
        title: p.title,
        text: p.text ?? null,
        url: p.url,
        imageUrl: p.imageUrl ?? null,
        author: p.author ?? null,
        publishedAt: p.publishedAt,
        raw,
      },
    });
    return "added";
  }
  const data: Record<string, unknown> = {};
  if (p.title && p.title !== existing.title) data["title"] = p.title;
  if (p.text !== undefined && (p.text ?? null) !== existing.text && (p.text ?? null) !== null) data["text"] = p.text;
  if (p.imageUrl && p.imageUrl !== existing.imageUrl) data["imageUrl"] = p.imageUrl;
  if (!p.publishedAtApprox && !sameInstant(p.publishedAt, existing.publishedAt)) data["publishedAt"] = p.publishedAt;
  if (Object.keys(data).length === 0) return "unchanged";
  if (raw !== undefined) data["raw"] = raw;
  await client.socialPost.update({ where: { id: existing.id }, data });
  return "updated";
}

let inFlight: Promise<SocialSyncSummary> | null = null;

/**
 * Sincroniza todas las fuentes habilitadas dentro de `budgetMs`. Llamadas concurrentes comparten la
 * misma ejecución. Sin `force`, respeta el bloqueo blando de 2 min. Nunca lanza por errores de fuentes.
 */
export function syncSocial(opts: SyncSocialOptions = {}): Promise<SocialSyncSummary> {
  if (inFlight) return inFlight;
  inFlight = runSync(opts).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function runSync(opts: SyncSocialOptions): Promise<SocialSyncSummary> {
  const client = opts.client ?? prisma;
  const env = opts.env ?? process.env;
  const now = opts.now ?? (() => new Date());
  const budgetMs = opts.budgetMs ?? 6_000;
  const startedAt = now();
  const summary: SocialSyncSummary = { ok: true, startedAt: startedAt.toISOString(), finishedAt: startedAt.toISOString(), sources: [], added: 0, updated: 0 };

  if (!opts.force) {
    const last = await getSocialSyncAt(client);
    if (last && startedAt.getTime() - last.getTime() < SOCIAL_SOFT_LOCK_MS) {
      return { ...summary, skipped: true };
    }
  }

  try {
    await ensureSocialSources(client);
    await ensureChannelSources(client);
  } catch (err) {
    console.warn("[social] no se pudieron preparar las fuentes", err);
  }

  const sources = await client.socialSource.findMany({ where: { enabled: true }, orderBy: { createdAt: "asc" } });
  const perSourceMs = Math.max(500, Math.min(SOCIAL_SOURCE_TIMEOUT_MS, budgetMs));
  const controller = new AbortController();
  const budgetTimer = setTimeout(() => controller.abort(), budgetMs);

  const settled = await Promise.allSettled(
    sources.map((s) =>
      withTimeout(
        fetchForSource(s, env, controller.signal, client).then((posts): FetchResult => ({ posts: Array.isArray(posts) ? posts : [] })),
        perSourceMs,
        s.label,
      ),
    ),
  );
  clearTimeout(budgetTimer);

  for (let i = 0; i < sources.length; i++) {
    const source = sources[i] as SocialSource;
    const r = settled[i] as PromiseSettledResult<FetchResult>;
    const result: SocialSyncSourceResult = { id: source.id, label: source.label, kind: source.kind as SocialSourceKind, added: 0, updated: 0 };
    if (r.status === "fulfilled") {
      for (const p of r.value.posts) {
        try {
          if (!p || typeof p !== "object" || !p.externalId || !p.url || !(p.publishedAt instanceof Date)) {
            throw new Error("Publicación inválida devuelta por el fetcher");
          }
          const outcome = await upsertSocialPost(client, source.id, p);
          if (outcome === "added") result.added += 1;
          else if (outcome === "updated") result.updated += 1;
        } catch (err) {
          result.error = errorMessage(err);
        }
      }
    } else {
      result.error = errorMessage(r.reason);
    }
    try {
      await client.socialSource.update({
        where: { id: source.id },
        data: { lastFetchedAt: now(), lastError: result.error ?? null },
      });
    } catch (err) {
      console.warn(`[social] no se pudo actualizar la fuente ${source.id}`, err);
    }
    summary.sources.push(result);
    summary.added += result.added;
    summary.updated += result.updated;
  }

  const finishedAt = now();
  summary.finishedAt = finishedAt.toISOString();
  try {
    await setMeta(client, SOCIAL_SYNC_AT_KEY, finishedAt.toISOString());
  } catch (err) {
    console.warn("[social] no se pudo guardar socialSyncAt", err);
    summary.ok = false;
  }
  return summary;
}

/** Refresco perezoso del GET público: sincroniza con presupuesto corto si la última fue hace > 30 min. Nunca lanza. */
export async function refreshSocialIfStale(opts: { budgetMs?: number; client?: Client; now?: () => Date } = {}): Promise<void> {
  const client = opts.client ?? prisma;
  const now = opts.now?.() ?? new Date();
  try {
    const last = await getSocialSyncAt(client);
    if (last && now.getTime() - last.getTime() < SOCIAL_STALE_MS) return;
    await syncSocial({ budgetMs: opts.budgetMs ?? 6_000, client, now: opts.now });
  } catch (err) {
    console.warn("[social] refresco perezoso falló", err);
  }
}
