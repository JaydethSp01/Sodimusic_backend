/**
 * Feed social (Novedades): BD temporal creada con psql + migraciones aplicadas con `\i`,
 * fetchers externos mockeados con vi.mock (nunca se toca la red).
 */
import { readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Hono } from "hono";
import type { PrismaClient } from "@prisma/client";
import jwt from "jsonwebtoken";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createTempDb, psql, type TempDb } from "./test-utils/temp-db.js";
import type { SocialPostInput } from "./lib/social/types.js";

vi.mock("./lib/social/youtube.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./lib/social/youtube.js")>();
  return {
    ...actual,
    fetchChannelVideos: vi.fn(),
    searchVideos: vi.fn(),
    resolveChannelId: vi.fn(),
    fetchOembed: vi.fn(),
    fetchWatchInfo: vi.fn(),
  };
});
vi.mock("./lib/social/facebook.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./lib/social/facebook.js")>();
  return { ...actual, fetchPagePosts: vi.fn() };
});

import * as youtube from "./lib/social/youtube.js";
import * as facebook from "./lib/social/facebook.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const hasDb = Boolean(process.env.DATABASE_URL);
const LABEL = "UCbCYvwiAsoIdumPbFBe1x6A";
const PADY = "UC4aeSrfTsfYaX3CqRzTetnA";

type PostJson = {
  id: string;
  sourceId: string | null;
  kind: string;
  externalId: string;
  title: string;
  text: string | null;
  url: string;
  imageUrl: string | null;
  author: string | null;
  publishedAt: string;
  status: string;
  pinned: boolean;
};
type SourceJson = { id: string; kind: string; label: string; externalId: string; url: string | null; enabled: boolean; lastError: string | null; lastFetchedAt: string | null };
type Summary = { ok: boolean; skipped?: boolean; added: number; updated: number; sources: Array<{ id: string; kind: string; label: string; added: number; updated: number; error?: string }> };

const video = (id: string, title: string, publishedAt: string, extra: Partial<SocialPostInput> = {}): SocialPostInput => ({
  kind: "YOUTUBE_VIDEO",
  externalId: `yt:${id}`,
  title,
  text: null,
  url: `https://www.youtube.com/watch?v=${id}`,
  imageUrl: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
  author: "Sodimusic",
  publishedAt: new Date(publishedAt),
  publishedAtApprox: false,
  raw: { source: "test" },
  ...extra,
});

describe.skipIf(!hasDb)("feed social: sync, público y admin (BD temporal)", () => {
  let db: TempDb;
  let app: Hono;
  let prisma: PrismaClient;
  let token: string;
  const auth = (): Record<string, string> => ({ Authorization: `Bearer ${token}` });
  const json = (body: unknown, method = "POST", withAuth = true): RequestInit => ({
    method,
    headers: { ...(withAuth ? auth() : {}), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const get = (path: string, withAuth = true) => app.request(`http://localhost${path}`, { headers: withAuth ? auth() : {} });

  const originalEnv = { DATABASE_URL: process.env.DATABASE_URL, DIRECT_URL: process.env.DIRECT_URL };

  beforeAll(async () => {
    db = createTempDb("vitest_social");
    const migrations = readdirSync(join(ROOT, "prisma", "migrations"))
      .filter((m) => m !== "migration_lock.toml")
      .sort();
    for (const m of migrations) {
      psql(db.url, `\\i ${join(ROOT, "prisma", "migrations", m, "migration.sql")}`);
    }
    process.env.DATABASE_URL = db.url;
    process.env.DIRECT_URL = db.url;
    delete process.env.CRON_SECRET;
    delete process.env.FACEBOOK_PAGE_TOKEN;
    delete process.env.YOUTUBE_API_KEY;
    ({ prisma } = await import("./lib/prisma.js"));
    const { createApp } = await import("./hono-app.js");
    app = createApp();
    const secret = process.env.JWT_SECRET as string;
    token = jwt.sign({ sub: "vitest-admin", email: "vitest@sodimusic.test" }, secret, { expiresIn: "10m" });
  }, 120_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    // `drop()` usa DIRECT_URL/DATABASE_URL para conectarse: restaurar la BD principal antes de borrar la temporal.
    process.env.DATABASE_URL = originalEnv.DATABASE_URL;
    process.env.DIRECT_URL = originalEnv.DIRECT_URL;
    db?.drop();
  });

  afterEach(() => {
    vi.mocked(youtube.fetchChannelVideos).mockReset();
    vi.mocked(youtube.searchVideos).mockReset();
    vi.mocked(youtube.resolveChannelId).mockReset();
    vi.mocked(youtube.fetchOembed).mockReset();
    vi.mocked(youtube.fetchWatchInfo).mockReset();
    vi.mocked(facebook.fetchPagePosts).mockReset();
    vi.unstubAllGlobals();
  });

  it("siembra las fuentes por defecto una sola vez (flag AppMeta) y expone status/env", async () => {
    const r = await get("/api/admin/social/sources");
    expect(r.status).toBe(200);
    const { items } = (await r.json()) as { items: SourceJson[] };
    expect(items.map((s) => `${s.kind}:${s.externalId}`).sort()).toEqual(["FACEBOOK_PAGE:sodimusic.oficial", "YOUTUBE_SEARCH:Sodimusic"]);
    expect(items.find((s) => s.kind === "FACEBOOK_PAGE")).toMatchObject({ label: "Facebook Sodimusic", url: "https://www.facebook.com/sodimusic.oficial", enabled: true });
    expect(items.find((s) => s.kind === "YOUTUBE_SEARCH")?.label).toBe("Menciones en YouTube");
    const flag = await prisma.appMeta.findUnique({ where: { key: "socialSourcesSeededAt" } });
    expect(flag).not.toBeNull();

    // Borrar la de búsqueda y volver a listar: no "resucita" (flag).
    const search = items.find((s) => s.kind === "YOUTUBE_SEARCH") as SourceJson;
    expect((await app.request(`http://localhost/api/admin/social/sources/${search.id}`, { method: "DELETE", headers: auth() })).status).toBe(200);
    const again = (await (await get("/api/admin/social/sources")).json()) as { items: SourceJson[] };
    expect(again.items.some((s) => s.kind === "YOUTUBE_SEARCH")).toBe(false);
    // la volvemos a crear para el resto de pruebas
    const re = await app.request("http://localhost/api/admin/social/sources", json({ kind: "YOUTUBE_SEARCH", externalId: "Sodimusic", label: "Menciones en YouTube" }));
    expect(re.status, await re.clone().text()).toBe(201);

    const st = await get("/api/admin/social/status");
    expect(st.status).toBe(200);
    expect(await st.json()).toEqual({
      lastSyncAt: null,
      env: { youtubeApiKey: false, facebookPageToken: false, cronSecret: false },
      counts: { sources: 2, posts: 0, hidden: 0 },
    });
    expect((await get("/api/admin/social/status", false)).status).toBe(401);
  });

  it("sync: crea la fuente del canal ACTIVE con channelId, guarda videos, FB sin token no toca la red, errores por fuente", async () => {
    const ch = await app.request(
      "http://localhost/api/admin/channels",
      json({ name: "Sodimusic (vitest)", url: `https://www.youtube.com/channel/${LABEL}`, category: "Sello", featured: true }),
    );
    expect(ch.status, await ch.clone().text()).toBe(201);

    vi.mocked(youtube.fetchChannelVideos).mockResolvedValue([
      video("7os2siROleM", "Video A", "2026-10-10T10:00:00Z"),
      video("kbQup1zxpGw", "Video B", "2026-10-01T10:00:00Z"),
    ]);
    vi.mocked(youtube.searchVideos).mockRejectedValue(new Error("Falta YOUTUBE_API_KEY"));

    const r = await app.request("http://localhost/api/admin/social/sync", { method: "POST", headers: auth() });
    expect(r.status, await r.clone().text()).toBe(200);
    const s = (await r.json()) as Summary;
    expect(s.ok).toBe(true);
    expect(s.added).toBe(2);
    expect(s.updated).toBe(0);
    const byKind = Object.fromEntries(s.sources.map((x) => [x.kind, x]));
    expect(byKind["YOUTUBE_CHANNEL"]).toMatchObject({ label: "Sodimusic (vitest)", added: 2 });
    expect(byKind["FACEBOOK_PAGE"]?.error).toBe("Falta FACEBOOK_PAGE_TOKEN");
    expect(byKind["YOUTUBE_SEARCH"]?.error).toBe("Falta YOUTUBE_API_KEY");
    expect(facebook.fetchPagePosts).not.toHaveBeenCalled();
    expect(youtube.fetchChannelVideos).toHaveBeenCalledTimes(1);
    expect(vi.mocked(youtube.fetchChannelVideos).mock.calls[0]?.[0]).toBe(LABEL);

    const sources = (await (await get("/api/admin/social/sources")).json()) as { items: SourceJson[] };
    const fb = sources.items.find((x) => x.kind === "FACEBOOK_PAGE");
    expect(fb?.lastError).toBe("Falta FACEBOOK_PAGE_TOKEN");
    expect(fb?.lastFetchedAt).not.toBeNull();
    const yt = sources.items.find((x) => x.kind === "YOUTUBE_CHANNEL");
    expect(yt).toMatchObject({ externalId: LABEL, lastError: null, url: `https://www.youtube.com/channel/${LABEL}` });

    const st = (await (await get("/api/admin/social/status")).json()) as { lastSyncAt: string | null; counts: { posts: number } };
    expect(st.lastSyncAt).not.toBeNull();
    expect(st.counts.posts).toBe(2);
  });

  it("sync repetido: sin cambios no actualiza; cambios de título sí; fecha aproximada no pisa la exacta; status/pinned intactos", async () => {
    const post = await prisma.socialPost.findUniqueOrThrow({ where: { externalId: "yt:7os2siROleM" } });
    await prisma.socialPost.update({ where: { id: post.id }, data: { status: "HIDDEN", pinned: true } });

    vi.mocked(youtube.fetchChannelVideos).mockResolvedValue([
      video("7os2siROleM", "Video A", "2026-10-10T10:00:00Z"),
      video("kbQup1zxpGw", "Video B", "2026-10-01T10:00:00Z"),
    ]);
    vi.mocked(youtube.searchVideos).mockRejectedValue(new Error("Falta YOUTUBE_API_KEY"));
    let s = (await (await app.request("http://localhost/api/admin/social/sync", { method: "POST", headers: auth() })).json()) as Summary;
    expect([s.added, s.updated]).toEqual([0, 0]);

    vi.mocked(youtube.fetchChannelVideos).mockResolvedValue([
      video("7os2siROleM", "Video A (remaster)", "2026-01-01T00:00:00Z", { publishedAtApprox: true }),
      video("kbQup1zxpGw", "Video B", "2026-10-02T10:00:00Z"),
    ]);
    s = (await (await app.request("http://localhost/api/admin/social/sync", { method: "POST", headers: auth() })).json()) as Summary;
    expect([s.added, s.updated]).toEqual([0, 2]);
    const a = await prisma.socialPost.findUniqueOrThrow({ where: { externalId: "yt:7os2siROleM" } });
    expect(a.title).toBe("Video A (remaster)");
    expect(a.publishedAt.toISOString()).toBe("2026-10-10T10:00:00.000Z"); // aproximada no pisa exacta
    expect(a.status).toBe("HIDDEN");
    expect(a.pinned).toBe(true);
    const b = await prisma.socialPost.findUniqueOrThrow({ where: { externalId: "yt:kbQup1zxpGw" } });
    expect(b.publishedAt.toISOString()).toBe("2026-10-02T10:00:00.000Z");

    // bloqueo blando: sin force y con sync reciente no hace nada
    const { syncSocial } = await import("./lib/social/sync.js");
    const soft = await syncSocial({ budgetMs: 1000 });
    expect(soft.skipped).toBe(true);
    await prisma.socialPost.update({ where: { id: post.id }, data: { status: "VISIBLE", pinned: false } });
  });

  it("fuente deshabilitada no se consulta; un fetcher que lanza no tumba las demás", async () => {
    const pady = await prisma.socialSource.create({ data: { kind: "YOUTUBE_CHANNEL", externalId: PADY, label: "EL PADY", url: `https://www.youtube.com/channel/${PADY}` } });
    vi.mocked(youtube.fetchChannelVideos).mockImplementation(async (channelId: string) => {
      if (channelId === PADY) throw new Error("HTTP 429 en https://www.youtube.com/channel/x/videos");
      return [video("7os2siROleM", "Video A (remaster)", "2026-10-10T10:00:00Z"), video("e60j4DF8xe8", "Video C", "2026-09-01T10:00:00Z")];
    });
    vi.mocked(youtube.searchVideos).mockRejectedValue(new Error("Falta YOUTUBE_API_KEY"));
    const search = await prisma.socialSource.findFirstOrThrow({ where: { kind: "YOUTUBE_SEARCH" } });
    const patch = await app.request(`http://localhost/api/admin/social/sources/${search.id}`, json({ enabled: false, label: "Menciones (pausadas)" }, "PATCH"));
    expect(patch.status).toBe(200);
    expect(await patch.json()).toMatchObject({ enabled: false, label: "Menciones (pausadas)" });

    const s = (await (await app.request("http://localhost/api/admin/social/sync", { method: "POST", headers: auth() })).json()) as Summary;
    expect(s.ok).toBe(true);
    expect(s.added).toBe(1);
    expect(s.sources.find((x) => x.id === pady.id)?.error).toMatch(/HTTP 429/);
    expect(s.sources.some((x) => x.kind === "YOUTUBE_SEARCH")).toBe(false);
    expect(youtube.searchVideos).not.toHaveBeenCalled();
    expect((await prisma.socialSource.findUniqueOrThrow({ where: { id: pady.id } })).lastError).toMatch(/HTTP 429/);

    // borrar la fuente deja sus posts con sourceId = null
    const label = await prisma.socialSource.findUniqueOrThrow({ where: { kind_externalId: { kind: "YOUTUBE_CHANNEL", externalId: LABEL } } });
    expect((await prisma.socialPost.count({ where: { sourceId: label.id } })).valueOf()).toBe(3);
    const del = await app.request(`http://localhost/api/admin/social/sources/${pady.id}`, { method: "DELETE", headers: auth() });
    expect(del.status).toBe(200);
    expect((await app.request(`http://localhost/api/admin/social/sources/${pady.id}`, { method: "DELETE", headers: auth() })).status).toBe(404);
    const del2 = await app.request(`http://localhost/api/admin/social/sources/${label.id}`, { method: "DELETE", headers: auth() });
    expect(del2.status).toBe(200);
    expect(await prisma.socialPost.count({ where: { sourceId: null } })).toBe(3);
    expect(await prisma.socialPost.count()).toBe(3);
    await prisma.socialSource.update({ where: { id: search.id }, data: { enabled: true } });
  });

  it("GET /api/social/feed: orden pinned/publishedAt, solo VISIBLE, limit ≤ 48, kind, Cache-Control, updatedAt", async () => {
    const c = await prisma.socialPost.findUniqueOrThrow({ where: { externalId: "yt:e60j4DF8xe8" } });
    await prisma.socialPost.update({ where: { id: c.id }, data: { pinned: true } });
    const b = await prisma.socialPost.findUniqueOrThrow({ where: { externalId: "yt:kbQup1zxpGw" } });
    await prisma.socialPost.update({ where: { id: b.id }, data: { status: "HIDDEN" } });
    await prisma.socialPost.create({
      data: { kind: "LINK", externalId: "link:test1", title: "Nota", url: "https://example.com/nota", publishedAt: new Date("2026-10-12T00:00:00Z") },
    });

    const r = await app.request("http://localhost/api/social/feed?limit=5");
    expect(r.status).toBe(200);
    expect(r.headers.get("Cache-Control")).toBe("public, max-age=0, s-maxage=0, must-revalidate");
    const body = (await r.json()) as { items: PostJson[]; updatedAt: string | null };
    expect(body.updatedAt).not.toBeNull();
    expect(body.items.map((p) => p.externalId)).toEqual(["yt:e60j4DF8xe8", "link:test1", "yt:7os2siROleM"]);
    expect(body.items[0]).not.toHaveProperty("raw");
    // sync reciente → no refresca
    expect(youtube.fetchChannelVideos).not.toHaveBeenCalled();

    const only = (await (await app.request("http://localhost/api/social/feed?kind=LINK")).json()) as { items: PostJson[] };
    expect(only.items.map((p) => p.kind)).toEqual(["LINK"]);
    expect((await app.request("http://localhost/api/social/feed?kind=TIKTOK")).status).toBe(400);
    const lim = (await (await app.request("http://localhost/api/social/feed?limit=1")).json()) as { items: PostJson[] };
    expect(lim.items).toHaveLength(1);
    for (let i = 0; i < 50; i++) {
      await prisma.socialPost.create({ data: { kind: "LINK", externalId: `link:bulk${i}`, title: `Bulk ${i}`, url: `https://example.com/${i}`, publishedAt: new Date(2025, 0, 1 + i) } });
    }
    const max = (await (await app.request("http://localhost/api/social/feed?limit=999")).json()) as { items: PostJson[] };
    expect(max.items).toHaveLength(48);
    await prisma.socialPost.deleteMany({ where: { externalId: { startsWith: "link:bulk" } } });
  });

  it("refresco perezoso: con socialSyncAt > 30 min el GET sincroniza con presupuesto corto y nunca falla", async () => {
    await prisma.appMeta.update({ where: { key: "socialSyncAt" }, data: { value: new Date(Date.now() - 45 * 60_000).toISOString() } });
    vi.mocked(youtube.searchVideos).mockRejectedValue(new Error("Falta YOUTUBE_API_KEY"));
    vi.mocked(youtube.fetchChannelVideos).mockRejectedValue(new Error("boom"));
    const r = await app.request("http://localhost/api/social/feed?limit=3");
    expect(r.status).toBe(200);
    expect(youtube.searchVideos).toHaveBeenCalledTimes(1);
    const after = await prisma.appMeta.findUniqueOrThrow({ where: { key: "socialSyncAt" } });
    expect(Date.now() - new Date(after.value).getTime()).toBeLessThan(10_000);
    // segunda llamada inmediata: no vuelve a sincronizar
    await app.request("http://localhost/api/social/feed");
    expect(youtube.searchVideos).toHaveBeenCalledTimes(1);
  });

  it("GET /api/cron/social-sync: 503 sin CRON_SECRET, 401 con otro Bearer, 200 con el correcto", async () => {
    expect((await app.request("http://localhost/api/cron/social-sync")).status).toBe(503);
    process.env.CRON_SECRET = "cron-secret-test";
    try {
      expect((await app.request("http://localhost/api/cron/social-sync")).status).toBe(401);
      expect((await app.request("http://localhost/api/cron/social-sync", { headers: { Authorization: "Bearer nope" } })).status).toBe(401);
      vi.mocked(youtube.searchVideos).mockRejectedValue(new Error("Falta YOUTUBE_API_KEY"));
      // fetcher mal comportado (devuelve undefined): la sincronización no debe fallar
      vi.mocked(youtube.fetchChannelVideos).mockResolvedValue(undefined as unknown as SocialPostInput[]);
      const ok = await app.request("http://localhost/api/cron/social-sync", { headers: { Authorization: "Bearer cron-secret-test" } });
      expect(ok.status).toBe(200);
      const s = (await ok.json()) as Summary;
      expect(s.ok).toBe(true);
      expect(s.skipped).toBeUndefined();
      expect(s.sources.length).toBeGreaterThan(0);
    } finally {
      delete process.env.CRON_SECRET;
    }
  });

  it("POST /api/admin/social/sources: YOUTUBE_CHANNEL resuelve @handle, 400 si no resuelve, 409 duplicado; FACEBOOK_PAGE por URL", async () => {
    vi.mocked(youtube.resolveChannelId).mockImplementation(async (input: string) => {
      if (input.includes("@elpadY92")) return { channelId: PADY, name: "EL PADY", url: `https://www.youtube.com/channel/${PADY}` };
      return null;
    });
    const r = await app.request("http://localhost/api/admin/social/sources", json({ kind: "YOUTUBE_CHANNEL", url: "https://www.youtube.com/@elpadY92" }));
    expect(r.status, await r.clone().text()).toBe(201);
    const src = (await r.json()) as SourceJson;
    expect(src).toMatchObject({ kind: "YOUTUBE_CHANNEL", externalId: PADY, label: "EL PADY", url: "https://www.youtube.com/@elpadY92", enabled: true });

    const dup = await app.request("http://localhost/api/admin/social/sources", json({ kind: "YOUTUBE_CHANNEL", url: "https://www.youtube.com/@elpadY92", label: "Otro" }));
    expect(dup.status).toBe(409);
    const bad = await app.request("http://localhost/api/admin/social/sources", json({ kind: "YOUTUBE_CHANNEL", url: "https://www.youtube.com/@nadie" }));
    expect(bad.status).toBe(400);
    expect(((await bad.json()) as { error: string }).error).toMatch(/No se pudo resolver/);
    expect((await app.request("http://localhost/api/admin/social/sources", json({ kind: "YOUTUBE_CHANNEL" }))).status).toBe(400);
    expect((await app.request("http://localhost/api/admin/social/sources", json({ kind: "YOUTUBE_CHANNEL", url: "https://vimeo.com/x" }))).status).toBe(400);
    expect((await app.request("http://localhost/api/admin/social/sources", json({ kind: "TIKTOK", url: "https://x" }))).status).toBe(400);

    vi.mocked(youtube.resolveChannelId).mockRejectedValue(new Error("HTTP 429 en x"));
    const net = await app.request("http://localhost/api/admin/social/sources", json({ kind: "YOUTUBE_CHANNEL", url: "https://www.youtube.com/@otro" }));
    expect(net.status).toBe(400);
    expect(((await net.json()) as { error: string }).error).toMatch(/HTTP 429/);

    const fb = await app.request("http://localhost/api/admin/social/sources", json({ kind: "FACEBOOK_PAGE", url: "https://www.facebook.com/guillermo.perezbanquez?mibextid=1" }));
    expect(fb.status, await fb.clone().text()).toBe(201);
    expect(await fb.json()).toMatchObject({ kind: "FACEBOOK_PAGE", externalId: "guillermo.perezbanquez", label: "Facebook guillermo.perezbanquez", url: "https://www.facebook.com/guillermo.perezbanquez?mibextid=1" });
    expect((await app.request("http://localhost/api/admin/social/sources", json({ kind: "FACEBOOK_PAGE" }))).status).toBe(400);
    expect((await app.request("http://localhost/api/admin/social/sources", json({ kind: "YOUTUBE_SEARCH" }))).status).toBe(400);
    expect((await app.request(`http://localhost/api/admin/social/sources/${src.id}`, json({ enabled: "sí" }, "PATCH"))).status).toBe(400);
    expect((await app.request("http://localhost/api/admin/social/sources/nope", json({ enabled: false }, "PATCH"))).status).toBe(404);
    expect((await app.request("http://localhost/api/admin/social/sources", { method: "POST", body: "{", headers: { ...auth(), "Content-Type": "application/json" } })).status).toBe(400);
  });

  it("POST /api/admin/social/posts: YouTube por oEmbed+watch (idempotente 200), enlace genérico por og:*, Facebook sin título → 400", async () => {
    vi.mocked(youtube.fetchOembed).mockResolvedValue({ title: "VICHE El Pady X Sodimusic", authorName: "EL PADY", authorUrl: null, thumbnailUrl: "https://i.ytimg.com/vi/CLWusvMQpcE/hqdefault.jpg" });
    vi.mocked(youtube.fetchWatchInfo).mockResolvedValue({ publishedAt: new Date("2026-10-16T22:00:10Z"), channelId: PADY, channelName: "EL PADY", title: "VICHE" });
    const r = await app.request("http://localhost/api/admin/social/posts", json({ url: "https://youtu.be/CLWusvMQpcE?si=abc" }));
    expect(r.status, await r.clone().text()).toBe(201);
    const p = (await r.json()) as PostJson;
    expect(p).toMatchObject({
      kind: "YOUTUBE_VIDEO",
      externalId: "yt:CLWusvMQpcE",
      title: "VICHE El Pady X Sodimusic",
      author: "EL PADY",
      url: "https://www.youtube.com/watch?v=CLWusvMQpcE",
      imageUrl: "https://i.ytimg.com/vi/CLWusvMQpcE/hqdefault.jpg",
      publishedAt: "2026-10-16T22:00:10.000Z",
      sourceId: null,
      status: "VISIBLE",
      pinned: false,
    });
    expect(p).not.toHaveProperty("raw");
    const again = await app.request("http://localhost/api/admin/social/posts", json({ url: "https://www.youtube.com/watch?v=CLWusvMQpcE", title: "Otro título" }));
    expect(again.status).toBe(200);
    expect(((await again.json()) as PostJson).id).toBe(p.id);

    // enlace genérico: fetch global mockeado (og:*)
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response('<html><head><meta property="og:title" content="Nota de prensa"><meta property="og:image" content="https://news.example/c.jpg"></head></html>', { headers: { "Content-Type": "text/html" } })),
    );
    const l = await app.request("http://localhost/api/admin/social/posts", json({ url: "https://news.example/nota?utm_source=x", text: "Resumen manual", publishedAt: "2026-10-11T00:00:00Z" }));
    expect(l.status, await l.clone().text()).toBe(201);
    expect(await l.json()).toMatchObject({ kind: "LINK", title: "Nota de prensa", imageUrl: "https://news.example/c.jpg", text: "Resumen manual", url: "https://news.example/nota", publishedAt: "2026-10-11T00:00:00.000Z" });

    // Facebook: sin red; sin título → 400; con título → 201
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const fbNo = await app.request("http://localhost/api/admin/social/posts", json({ url: "https://www.facebook.com/guillermo.perezbanquez/posts/777" }));
    expect(fbNo.status).toBe(400);
    const fbOk = await app.request("http://localhost/api/admin/social/posts", json({ url: "https://www.facebook.com/guillermo.perezbanquez/posts/777", title: "Lanzamiento compartido", author: "Guillermo", imageUrl: "/uploads/x.jpg" }));
    expect(fbOk.status, await fbOk.clone().text()).toBe(201);
    expect(await fbOk.json()).toMatchObject({ kind: "LINK", title: "Lanzamiento compartido", author: "Guillermo", imageUrl: "/uploads/x.jpg" });
    expect(fetchMock).not.toHaveBeenCalled();

    expect((await app.request("http://localhost/api/admin/social/posts", json({ url: "ftp://x/y" }))).status).toBe(400);
    expect((await app.request("http://localhost/api/admin/social/posts", json({ url: "https://news.example/z", publishedAt: "ayer" }))).status).toBe(400);
  });

  it("admin posts: listado paginado con status/q, PATCH (status/pinned/título), DELETE; feed refleja cambios; stats", async () => {
    const all = (await (await get("/api/admin/social/posts?status=ALL&pageSize=2")).json()) as { items: PostJson[]; total: number; page: number; pageSize: number };
    expect(all.pageSize).toBe(2);
    expect(all.items).toHaveLength(2);
    expect(all.total).toBeGreaterThanOrEqual(6);
    const hidden = (await (await get("/api/admin/social/posts?status=HIDDEN")).json()) as { items: PostJson[]; total: number };
    expect(hidden.items.map((p) => p.externalId)).toEqual(["yt:kbQup1zxpGw"]);
    const q = (await (await get("/api/admin/social/posts?status=ALL&q=viche")).json()) as { items: PostJson[] };
    expect(q.items.map((p) => p.externalId)).toEqual(["yt:CLWusvMQpcE"]);
    expect((await get("/api/admin/social/posts?status=NOPE")).status).toBe(400);
    const big = (await (await get("/api/admin/social/posts?status=ALL&pageSize=500")).json()) as { pageSize: number };
    expect(big.pageSize).toBe(100);

    const target = q.items[0] as PostJson;
    const patch = await app.request(`http://localhost/api/admin/social/posts/${target.id}`, json({ pinned: true, title: "VICHE (pinned)", text: "" }, "PATCH"));
    expect(patch.status).toBe(200);
    expect(await patch.json()).toMatchObject({ pinned: true, title: "VICHE (pinned)", text: null });
    const feed = (await (await app.request("http://localhost/api/social/feed?limit=2")).json()) as { items: PostJson[] };
    expect(feed.items[0]?.id).toBe(target.id);

    const hide = await app.request(`http://localhost/api/admin/social/posts/${target.id}`, json({ status: "HIDDEN" }, "PATCH"));
    expect(hide.status).toBe(200);
    const feed2 = (await (await app.request("http://localhost/api/social/feed")).json()) as { items: PostJson[] };
    expect(feed2.items.some((p) => p.id === target.id)).toBe(false);
    expect((await app.request(`http://localhost/api/admin/social/posts/${target.id}`, json({ status: "GONE" }, "PATCH"))).status).toBe(400);
    expect((await app.request("http://localhost/api/admin/social/posts/nope", json({ pinned: false }, "PATCH"))).status).toBe(404);

    const stats = await get("/api/admin/dashboard/stats");
    expect(stats.status).toBe(200);
    const sj = (await stats.json()) as { socialPostsVisible: number; socialLastSyncAt: string | null };
    expect(sj.socialPostsVisible).toBe(await prisma.socialPost.count({ where: { status: "VISIBLE" } }));
    expect(sj.socialLastSyncAt).not.toBeNull();

    expect((await app.request(`http://localhost/api/admin/social/posts/${target.id}`, { method: "DELETE", headers: auth() })).status).toBe(200);
    expect((await app.request(`http://localhost/api/admin/social/posts/${target.id}`, { method: "DELETE", headers: auth() })).status).toBe(404);
    expect((await app.request("http://localhost/api/admin/social/posts", { method: "POST", body: "{}" })).status).toBe(401);
  });
});
