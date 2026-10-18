/**
 * Artistas: BD temporal creada con psql + migraciones aplicadas con `\i`.
 * Cubre la siembra única desde el SiteConfig, la API pública (lista, detalle con contenido asociado
 * por nombre/alias/canal, 404 en HIDDEN), el CRUD admin con reorder y los stats del dashboard.
 */
import { readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Hono } from "hono";
import type { PrismaClient } from "@prisma/client";
import jwt from "jsonwebtoken";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTempDb, psql, type TempDb } from "./test-utils/temp-db.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const hasDb = Boolean(process.env.DATABASE_URL);
const PADY_CHANNEL = "UC4aeSrfTsfYaX3CqRzTetnA";

type ArtistJson = {
  id: string;
  slug: string;
  name: string;
  role: string;
  shortBio: string | null;
  bio: string | null;
  photoUrl: string | null;
  genres: string[];
  aliases: string[];
  youtubeChannelId: string | null;
  spotifyUrl: string | null;
  featured: boolean;
  status: string;
  sortOrder: number;
};
type Detail = {
  artist: ArtistJson;
  productions: Array<{ title: string; artistName: string }>;
  releases: Array<{ title: string; artistName: string }>;
  posts: Array<{ title: string; author: string | null; raw?: unknown }>;
};

describe.skipIf(!hasDb)("artistas: siembra, público, admin y stats (BD temporal)", () => {
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
  const get = (path: string, withAuth = false) => app.request(`http://localhost${path}`, { headers: withAuth ? auth() : {} });

  const originalEnv = { DATABASE_URL: process.env.DATABASE_URL, DIRECT_URL: process.env.DIRECT_URL };

  beforeAll(async () => {
    db = createTempDb("vitest_artists");
    const migrations = readdirSync(join(ROOT, "prisma", "migrations"))
      .filter((m) => m !== "migration_lock.toml")
      .sort();
    for (const m of migrations) {
      psql(db.url, `\\i ${join(ROOT, "prisma", "migrations", m, "migration.sql")}`);
    }
    process.env.DATABASE_URL = db.url;
    process.env.DIRECT_URL = db.url;
    ({ prisma } = await import("./lib/prisma.js"));
    const { createApp } = await import("./hono-app.js");
    app = createApp();
    const secret = process.env.JWT_SECRET as string;
    token = jwt.sign({ sub: "vitest-admin", email: "vitest@sodimusic.test" }, secret, { expiresIn: "10m" });

    // Contenido asociado: producciones, lanzamientos, fuente de canal y posts del feed.
    await prisma.production.createMany({
      data: [
        { title: "Viche", artistName: "J Col x El Pady", artistCity: "María La Baja", year: 2026, genre: "Champeta" },
        { title: "Calle", artistName: "J COL", artistCity: "Medellín", year: 2024, genre: "Trap" },
        { title: "Crazy", artistName: "El Crazy", artistCity: "Cartagena", year: 2023, genre: "Reggaeton" },
        { title: "Otro", artistName: "El Fammy", artistCity: "Cartagena", year: 2025, genre: "Trap" },
      ],
    });
    await prisma.release.createMany({
      data: [
        { title: "Viche (single)", slug: "viche", artistName: "J Col, El Pady", genre: "Champeta", releaseYear: 2026 },
        { title: "Fammy EP", slug: "fammy-ep", artistName: "El Fammy", genre: "Trap", releaseYear: 2025 },
      ],
    });
    const pady = await prisma.socialSource.create({
      data: { kind: "YOUTUBE_CHANNEL", label: "EL PADY", externalId: PADY_CHANNEL, url: `https://www.youtube.com/channel/${PADY_CHANNEL}` },
    });
    await prisma.socialPost.createMany({
      data: [
        { sourceId: pady.id, kind: "YOUTUBE_VIDEO", externalId: "yt:viche", title: "VICHE - J COL x EL PADY", url: "https://youtu.be/viche", author: "EL PADY", publishedAt: new Date("2026-10-10T00:00:00Z") },
        { sourceId: pady.id, kind: "YOUTUBE_VIDEO", externalId: "yt:pady2", title: "Sesión en el estudio", url: "https://youtu.be/pady2", author: "EL PADY", publishedAt: new Date("2026-09-01T00:00:00Z") },
        { kind: "YOUTUBE_VIDEO", externalId: "yt:crazy", title: "El Crazy - Freestyle", url: "https://youtu.be/crazy", author: "Sodimusic", publishedAt: new Date("2026-08-01T00:00:00Z") },
        { kind: "YOUTUBE_VIDEO", externalId: "yt:hidden", title: "J Col oculto", url: "https://youtu.be/hidden", author: "Sodimusic", publishedAt: new Date("2026-07-01T00:00:00Z"), status: "HIDDEN" },
        { kind: "FACEBOOK_POST", externalId: "fb:fammy", title: "El Fammy en vivo", url: "https://facebook.com/x", author: "Sodimusic", publishedAt: new Date("2026-06-01T00:00:00Z") },
      ],
    });
  }, 120_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    process.env.DATABASE_URL = originalEnv.DATABASE_URL;
    process.env.DIRECT_URL = originalEnv.DIRECT_URL;
    db?.drop();
  });

  it("siembra una sola vez desde el SiteConfig (defaults) y expone solo ACTIVE ordenados", async () => {
    const r = await get("/api/artists");
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toBe("public, max-age=0, s-maxage=0, must-revalidate");
    const { items } = (await r.json()) as { items: ArtistJson[] };
    expect(items.map((a) => a.slug)).toEqual(["jeivy-lazy", "j-col", "el-fammy", "el-vega"]);
    expect(items[0]).toMatchObject({ role: "Productor principal", featured: true, sortOrder: 0, genres: ["Reggaeton", "Trap", "Afrobeat"] });
    expect(items[1]).toMatchObject({ name: "J Col", role: "Crew", shortBio: expect.stringContaining("Movimiento urbano") });

    const flag = await prisma.appMeta.findUnique({ where: { key: "artistsSeededAt" } });
    expect(flag?.value).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    // Borrar uno en el admin y volver a sembrar: no resucita (flag).
    const { seedArtistsFromSiteConfig } = await import("./lib/ensure-schema.js");
    await prisma.artist.delete({ where: { slug: "el-vega" } });
    expect(await seedArtistsFromSiteConfig(prisma)).toBe(0);
    expect(await prisma.artist.count()).toBe(3);
    // Sin flag y con slugs ya existentes: solo añade los que faltan.
    await prisma.appMeta.delete({ where: { key: "artistsSeededAt" } });
    expect(await seedArtistsFromSiteConfig(prisma)).toBe(1);
    expect(await prisma.artist.count()).toBe(4);

    // featured=1 y role=
    const feat = (await (await get("/api/artists?featured=1")).json()) as { items: ArtistJson[] };
    expect(feat.items.map((a) => a.slug)).toEqual(["jeivy-lazy"]);
    const crew = (await (await get("/api/artists?role=crew")).json()) as { items: ArtistJson[] };
    expect(crew.items.map((a) => a.slug)).toEqual(["j-col", "el-fammy", "el-vega"]);
  });

  it("detalle: asocia producciones/lanzamientos/posts por nombre, alias y canal; 404 si no existe o HIDDEN", async () => {
    const r = await get("/api/artists/j-col");
    expect(r.status).toBe(200);
    const d = (await r.json()) as Detail;
    expect(d.artist.slug).toBe("j-col");
    expect(d.productions.map((p) => p.title)).toEqual(["Viche", "Calle"]);
    expect(d.releases.map((p) => p.title)).toEqual(["Viche (single)"]);
    expect(d.posts.map((p) => p.title)).toEqual(["VICHE - J COL x EL PADY"]);
    expect(d.posts[0]).not.toHaveProperty("raw");

    // Alias "El Crazy" → suma producción y post; youtubeChannelId → suma los videos del canal de El Pady.
    const upd = await app.request(
      `http://localhost/api/admin/artists/${d.artist.id}`,
      json({ aliases: ["El Crazy"], youtubeChannelId: PADY_CHANNEL }, "PATCH"),
    );
    expect(upd.status, await upd.clone().text()).toBe(200);
    const d2 = (await (await get("/api/artists/j-col")).json()) as Detail;
    expect(d2.productions.map((p) => p.title)).toEqual(["Viche", "Calle", "Crazy"]);
    expect(d2.posts.map((p) => p.title)).toEqual(["VICHE - J COL x EL PADY", "Sesión en el estudio", "El Crazy - Freestyle"]);

    // El Fammy: producción, release y post de Facebook por título.
    const f = (await (await get("/api/artists/el-fammy")).json()) as Detail;
    expect(f.productions.map((p) => p.title)).toEqual(["Otro"]);
    expect(f.releases.map((p) => p.title)).toEqual(["Fammy EP"]);
    expect(f.posts.map((p) => p.title)).toEqual(["El Fammy en vivo"]);

    // Slug en mayúsculas → mismo artista; inexistente → 404; HIDDEN → 404.
    expect((await get("/api/artists/J-COL")).status).toBe(200);
    expect((await get("/api/artists/no-existe")).status).toBe(404);
    const hide = await app.request(`http://localhost/api/admin/artists/${d.artist.id}`, json({ status: "HIDDEN" }, "PATCH"));
    expect(hide.status).toBe(200);
    expect((await get("/api/artists/j-col")).status).toBe(404);
    const list = (await (await get("/api/artists")).json()) as { items: ArtistJson[] };
    expect(list.items.some((a) => a.slug === "j-col")).toBe(false);
    await app.request(`http://localhost/api/admin/artists/${d.artist.id}`, json({ status: "ACTIVE" }, "PATCH"));
  });

  it("admin: CRUD, slug único, validación, reorder y 401 sin token", async () => {
    expect((await app.request("http://localhost/api/admin/artists")).status).toBe(401);

    // Crear sin slug → se genera; nombre repetido → sufijo -2.
    const a = await app.request(
      "http://localhost/api/admin/artists",
      json({ name: "El Pady", role: "Aliado", genres: ["Champeta"], spotifyUrl: "https://open.spotify.com/artist/abc", city: "Cartagena" }),
    );
    expect(a.status, await a.clone().text()).toBe(201);
    const aj = (await a.json()) as ArtistJson;
    expect(aj.slug).toBe("el-pady");
    expect(aj.spotifyUrl).toBe("https://open.spotify.com/artist/abc");
    const a2 = await app.request("http://localhost/api/admin/artists", json({ name: "El Pady" }));
    expect(a2.status).toBe(201);
    expect(((await a2.json()) as ArtistJson).slug).toBe("el-pady-2");
    // Slug explícito ya usado → 409; slug inválido / nombre corto / url inválida → 400.
    expect((await app.request("http://localhost/api/admin/artists", json({ name: "Otro", slug: "el-pady" }))).status).toBe(409);
    expect((await app.request("http://localhost/api/admin/artists", json({ name: "Otro", slug: "El Pady" }))).status).toBe(400);
    expect((await app.request("http://localhost/api/admin/artists", json({ name: "X" }))).status).toBe(400);
    expect((await app.request("http://localhost/api/admin/artists", json({ name: "Otro", instagramUrl: "nope" }))).status).toBe(400);

    // PATCH: cambiar slug a uno ocupado → 409; a uno libre → 200; id inexistente → 404.
    const idA2 = ((await (await app.request("http://localhost/api/admin/artists?q=el-pady-2", { headers: auth() })).json()) as { items: ArtistJson[] }).items[0]!.id;
    expect((await app.request(`http://localhost/api/admin/artists/${idA2}`, json({ slug: "el-pady" }, "PATCH"))).status).toBe(409);
    const ren = await app.request(`http://localhost/api/admin/artists/${idA2}`, json({ slug: "pady-dos", name: "Pady Dos" }, "PATCH"));
    expect(ren.status).toBe(200);
    expect(((await ren.json()) as ArtistJson).slug).toBe("pady-dos");
    expect((await app.request("http://localhost/api/admin/artists/nope", json({ name: "Zz" }, "PATCH"))).status).toBe(404);

    // Lista admin: ve HIDDEN, filtra por status y q.
    await app.request(`http://localhost/api/admin/artists/${idA2}`, json({ status: "HIDDEN" }, "PATCH"));
    const all = (await (await app.request("http://localhost/api/admin/artists", { headers: auth() })).json()) as { items: ArtistJson[]; total: number };
    expect(all.total).toBe(6);
    const hidden = (await (await app.request("http://localhost/api/admin/artists?status=HIDDEN", { headers: auth() })).json()) as { items: ArtistJson[] };
    expect(hidden.items.map((x) => x.slug)).toEqual(["pady-dos"]);
    const q = (await (await app.request("http://localhost/api/admin/artists?q=fammy", { headers: auth() })).json()) as { items: ArtistJson[] };
    expect(q.items.map((x) => x.slug)).toEqual(["el-fammy"]);

    // Reorder: el orden de ids pasa a sortOrder 0..n.
    const re = await app.request("http://localhost/api/admin/artists/reorder", json({ ids: [aj.id, idA2] }));
    expect(re.status).toBe(200);
    expect(await re.json()).toEqual({ ok: true, count: 2 });
    expect((await prisma.artist.findUniqueOrThrow({ where: { id: aj.id } })).sortOrder).toBe(0);
    expect((await prisma.artist.findUniqueOrThrow({ where: { id: idA2 } })).sortOrder).toBe(1);
    expect((await app.request("http://localhost/api/admin/artists/reorder", json({ ids: [] }))).status).toBe(400);

    // DELETE: 200 y luego 404.
    expect((await app.request(`http://localhost/api/admin/artists/${idA2}`, { method: "DELETE", headers: auth() })).status).toBe(200);
    expect((await app.request(`http://localhost/api/admin/artists/${idA2}`, { method: "DELETE", headers: auth() })).status).toBe(404);
  });

  it("dashboard/stats incluye artistsActive y leadsNew (COTIZACION en estado NEW)", async () => {
    const policy = { policyAcceptedAt: new Date(), policyVersion: "2026-10-17" };
    await prisma.contactMessage.createMany({
      data: [
        { subject: "COTIZACION", name: "Lead 1", email: "l1@vitest.test", message: "Quiero grabar", ...policy },
        { subject: "COTIZACION", name: "Lead 2", email: "l2@vitest.test", message: "Quiero mezclar", status: "READ", ...policy },
        { subject: "PRENSA", name: "Prensa", email: "p@vitest.test", message: "Entrevista", ...policy },
      ],
    });
    const r = await get("/api/admin/dashboard/stats", true);
    expect(r.status).toBe(200);
    const s = (await r.json()) as { artistsActive: number; leadsNew: number; messagesNew: number };
    expect(s.artistsActive).toBe(await prisma.artist.count({ where: { status: "ACTIVE" } }));
    expect(s.artistsActive).toBeGreaterThanOrEqual(4);
    expect(s.leadsNew).toBe(1);
    expect(s.messagesNew).toBe(2);
  });
});
