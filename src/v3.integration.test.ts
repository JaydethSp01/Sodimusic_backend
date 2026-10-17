import jwt from "jsonwebtoken";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "./hono-app.js";
import { prisma } from "./lib/prisma.js";
import { POLICY_NOT_ACCEPTED_MESSAGE } from "./schemas/consent.js";
import { unsubscribeToken } from "./lib/newsletter-token.js";

const app = createApp();
const hasDb = Boolean(process.env.DATABASE_URL);

const PREFIX = "vitest-v3-";
const EMAIL_DOMAIN = "vitest-v3.sodimusic.test";

type ChannelJson = {
  id: string;
  name: string;
  url: string;
  channelId: string | null;
  handle: string | null;
  category: string;
  featured: boolean;
  status: string;
  sortOrder: number;
};
type Paged<T> = { items: T[]; total: number; page: number; pageSize: number };

describe.skipIf(!hasDb)("v3: canales, newsletter, contacto, intereses (DATABASE_URL)", () => {
  let token: string;
  const auth = (): Record<string, string> => ({ Authorization: `Bearer ${token}` });
  const json = (body: unknown, method = "POST", withAuth = true): RequestInit => ({
    method,
    headers: { ...(withAuth ? auth() : {}), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const cleanup = async (): Promise<void> => {
    await prisma.youtubeChannel.deleteMany({ where: { name: { startsWith: PREFIX } } });
    await prisma.subscriber.deleteMany({ where: { email: { endsWith: `@${EMAIL_DOMAIN}` } } });
    await prisma.contactMessage.deleteMany({ where: { email: { endsWith: `@${EMAIL_DOMAIN}` } } });
    await prisma.beatInterest.deleteMany({ where: { email: { endsWith: `@${EMAIL_DOMAIN}` } } });
    await prisma.beat.deleteMany({ where: { title: { startsWith: PREFIX } } });
  };

  beforeAll(async () => {
    const secret = process.env.JWT_SECRET;
    expect(secret, "JWT_SECRET requerido").toBeTruthy();
    token = jwt.sign({ sub: "vitest-admin", email: "vitest@sodimusic.test" }, secret as string, { expiresIn: "10m" });
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  describe("canales", () => {
    it("admin CRUD + reorder; público solo ACTIVE, paginado y con Cache-Control", async () => {
      // Crear 3 (uno HIDDEN). La URL autodetecta channelId/handle.
      const a = await app.request(
        "http://localhost/api/admin/channels",
        json({ name: `${PREFIX}A`, url: "https://www.youtube.com/channel/UCbCYvwiAsoIdumPbFBe1x6A", category: "Sello", sortOrder: 5 }),
      );
      expect(a.status, await a.clone().text()).toBe(201);
      const aj = (await a.json()) as ChannelJson;
      expect(aj.channelId).toBe("UCbCYvwiAsoIdumPbFBe1x6A");
      expect(aj.status).toBe("ACTIVE");

      const b = await app.request(
        "http://localhost/api/admin/channels",
        json({ name: `${PREFIX}B`, url: "https://youtube.com/@vitestb", category: "Crew", featured: true, sortOrder: 9 }),
      );
      expect(b.status).toBe(201);
      const bj = (await b.json()) as ChannelJson;
      expect(bj.handle).toBe("vitestb");

      const h = await app.request(
        "http://localhost/api/admin/channels",
        json({ name: `${PREFIX}Hidden`, url: "https://youtube.com/@vitesth", status: "HIDDEN", sortOrder: 1 }),
      );
      expect(h.status).toBe(201);
      const hj = (await h.json()) as ChannelJson;

      // 400 por datos inválidos
      const bad = await app.request("http://localhost/api/admin/channels", json({ name: "x", url: "https://vimeo.com/x" }));
      expect(bad.status).toBe(400);

      // Sin token → 401
      expect((await app.request("http://localhost/api/admin/channels")).status).toBe(401);

      // Público: filtra por q (prefijo), oculta HIDDEN, featured primero, categorías
      const pub = await app.request(`http://localhost/api/channels?q=${PREFIX}&pageSize=10`);
      expect(pub.status).toBe(200);
      expect(pub.headers.get("cache-control")).toBe("public, max-age=0, s-maxage=0, must-revalidate");
      const pj = (await pub.json()) as Paged<ChannelJson> & { categories: string[] };
      expect(pj.items.map((x) => x.name)).toEqual([`${PREFIX}B`, `${PREFIX}A`]);
      expect(pj.total).toBe(2);
      expect(pj.page).toBe(1);
      expect(pj.pageSize).toBe(10);
      expect(pj.categories).toEqual(expect.arrayContaining(["Sello", "Crew"]));

      // Paginación: pageSize=1 → página 2 trae el segundo; pageSize se acota a 48
      const p2 = await app.request(`http://localhost/api/channels?q=${PREFIX}&pageSize=1&page=2`);
      const p2j = (await p2.json()) as Paged<ChannelJson>;
      expect(p2j.items.map((x) => x.name)).toEqual([`${PREFIX}A`]);
      expect(p2j.total).toBe(2);
      const capped = await app.request(`http://localhost/api/channels?pageSize=500`);
      expect(((await capped.json()) as Paged<ChannelJson>).pageSize).toBe(48);

      // featured=1 y category=
      const feat = await app.request(`http://localhost/api/channels?q=${PREFIX}&featured=1`);
      expect(((await feat.json()) as Paged<ChannelJson>).items.map((x) => x.name)).toEqual([`${PREFIX}B`]);
      const cat = await app.request(`http://localhost/api/channels?q=${PREFIX}&category=Sello`);
      expect(((await cat.json()) as Paged<ChannelJson>).items.map((x) => x.name)).toEqual([`${PREFIX}A`]);

      // Detalle público: ACTIVE 200, HIDDEN 404, inexistente 404
      expect((await app.request(`http://localhost/api/channels/${aj.id}`)).status).toBe(200);
      expect((await app.request(`http://localhost/api/channels/${hj.id}`)).status).toBe(404);
      expect((await app.request(`http://localhost/api/channels/nope`)).status).toBe(404);

      // Admin list ve HIDDEN y filtra por status
      const al = await app.request(`http://localhost/api/admin/channels?q=${PREFIX}&status=HIDDEN`, { headers: auth() });
      const alj = (await al.json()) as Paged<ChannelJson>;
      expect(alj.items.map((x) => x.name)).toEqual([`${PREFIX}Hidden`]);
      expect(alj.total).toBe(1);

      // Reorder: ids en el orden deseado → sortOrder 0..n
      const ro = await app.request("http://localhost/api/admin/channels/reorder", json({ ids: [hj.id, bj.id, aj.id] }));
      expect(ro.status, await ro.clone().text()).toBe(200);
      const after = await app.request(`http://localhost/api/admin/channels?q=${PREFIX}`, { headers: auth() });
      const afj = (await after.json()) as Paged<ChannelJson>;
      expect(afj.items.map((x) => [x.name, x.sortOrder])).toEqual([
        [`${PREFIX}Hidden`, 0],
        [`${PREFIX}B`, 1],
        [`${PREFIX}A`, 2],
      ]);

      // PATCH: cambiar status y URL (re-detecta handle); 404 si no existe
      const patched = await app.request(
        `http://localhost/api/admin/channels/${hj.id}`,
        json({ status: "ACTIVE", url: "https://www.youtube.com/@vitesth2", featured: true }, "PATCH"),
      );
      expect(patched.status, await patched.clone().text()).toBe(200);
      const pt = (await patched.json()) as ChannelJson;
      expect(pt.status).toBe("ACTIVE");
      expect(pt.handle).toBe("vitesth2");
      expect(pt.featured).toBe(true);
      expect((await app.request(`http://localhost/api/admin/channels/nope`, json({ featured: true }, "PATCH"))).status).toBe(404);

      // Ahora el público lo ve, ordenado: featured (Hidden sort 0, B sort 1) luego A
      const pub2 = await app.request(`http://localhost/api/channels?q=${PREFIX}`);
      expect(((await pub2.json()) as Paged<ChannelJson>).items.map((x) => x.name)).toEqual([
        `${PREFIX}Hidden`,
        `${PREFIX}B`,
        `${PREFIX}A`,
      ]);

      // DELETE
      const del = await app.request(`http://localhost/api/admin/channels/${aj.id}`, { method: "DELETE", headers: auth() });
      expect(del.status).toBe(200);
      expect((await app.request(`http://localhost/api/admin/channels/${aj.id}`, { method: "DELETE", headers: auth() })).status).toBe(404);
      expect((await app.request(`http://localhost/api/channels/${aj.id}`)).status).toBe(404);
    });
  });

  describe("newsletter", () => {
    const email = `fan@${EMAIL_DOMAIN}`;

    it("crea (201), re-suscribe (201), da de baja solo con token y exige política", async () => {
      const noPolicy = await app.request(
        "http://localhost/api/newsletter/subscribe",
        json({ email, policyAccepted: false, policyVersion: "2026-10-17" }, "POST", false),
      );
      expect(noPolicy.status).toBe(400);
      expect(((await noPolicy.json()) as { error: string }).error).toBe(POLICY_NOT_ACCEPTED_MESSAGE);

      const created = await app.request(
        "http://localhost/api/newsletter/subscribe",
        json({ email: email.toUpperCase(), name: "Fan", source: "footer", policyAccepted: true, policyVersion: "2026-10-17" }, "POST", false),
      );
      expect(created.status, await created.clone().text()).toBe(201);
      expect(((await created.json()) as { ok: boolean }).ok).toBe(true);
      const row = await prisma.subscriber.findUnique({ where: { email } });
      expect(row?.name).toBe("Fan");
      expect(row?.policyVersion).toBe("2026-10-17");
      expect(row?.unsubscribedAt).toBeNull();

      // Baja sin token → 400; con token incorrecto → 200 neutro pero NO da de baja
      expect((await app.request("http://localhost/api/newsletter/unsubscribe", json({ email }, "POST", false))).status).toBe(400);
      const wrong = await app.request("http://localhost/api/newsletter/unsubscribe", json({ email, token: "0".repeat(32) }, "POST", false));
      expect(wrong.status).toBe(200);
      expect((await prisma.subscriber.findUnique({ where: { email } }))?.unsubscribedAt).toBeNull();

      // Baja con token HMAC correcto
      const token = unsubscribeToken(email);
      const unsub = await app.request("http://localhost/api/newsletter/unsubscribe", json({ email, token }, "POST", false));
      expect(unsub.status).toBe(200);
      expect((await prisma.subscriber.findUnique({ where: { email } }))?.unsubscribedAt).toBeInstanceOf(Date);

      // Baja de un email desconocido: 200 igualmente (no revela existencia)
      const nadie = `nadie@${EMAIL_DOMAIN}`;
      expect((await app.request("http://localhost/api/newsletter/unsubscribe", json({ email: nadie, token: unsubscribeToken(nadie) }, "POST", false))).status).toBe(200);

      // Re-suscribir → 201 (igual que nuevo) y unsubscribedAt vuelve a null; sin policyVersion usa la publicada
      const again = await app.request(
        "http://localhost/api/newsletter/subscribe",
        json({ email, policyAccepted: true }, "POST", false),
      );
      expect(again.status).toBe(201);
      const row2 = await prisma.subscriber.findUnique({ where: { email } });
      expect(row2?.unsubscribedAt).toBeNull();
      expect(row2?.name).toBe("Fan");
      expect(row2?.policyVersion.length).toBeGreaterThan(0);

      // Suscribir de nuevo estando activo: también 201 (no distingue nuevo/existente)
      const dup = await app.request("http://localhost/api/newsletter/subscribe", json({ email, policyAccepted: true }, "POST", false));
      expect(dup.status).toBe(201);

      // GET de baja (enlace del correo): aplica la baja y redirige al frontend con ?baja=ok
      const frontend = (process.env.FRONTEND_URL ?? "http://localhost:3000").replace(/\/+$/, "");
      const link = await app.request(`http://localhost/api/newsletter/unsubscribe?email=${encodeURIComponent(email)}&token=${token}`);
      expect(link.status).toBe(302);
      expect(link.headers.get("location")).toBe(`${frontend}/legal/privacidad?baja=ok`);
      expect((await prisma.subscriber.findUnique({ where: { email } }))?.unsubscribedAt).toBeInstanceOf(Date);
      const badLink = await app.request(`http://localhost/api/newsletter/unsubscribe?email=${encodeURIComponent(email)}&token=nope`);
      expect(badLink.status).toBe(302);
      expect(badLink.headers.get("location")).toBe(`${frontend}/legal/privacidad?baja=error`);

      // Volver a activar para el resto de comprobaciones del listado
      await app.request("http://localhost/api/newsletter/subscribe", json({ email, policyAccepted: true }, "POST", false));

      // Admin: listado con búsqueda y export CSV
      const list = await app.request(`http://localhost/api/admin/subscribers?q=${EMAIL_DOMAIN}`, { headers: auth() });
      expect(list.status).toBe(200);
      const lj = (await list.json()) as Paged<{ email: string }>;
      expect(lj.items.map((s) => s.email)).toEqual([email]);
      expect(lj.total).toBe(1);

      const csv = await app.request("http://localhost/api/admin/subscribers/export", { headers: auth() });
      expect(csv.status).toBe(200);
      expect(csv.headers.get("content-type")).toContain("text/csv");
      const text = await csv.text();
      expect(text.split("\n")[0]).toBe("email,name,source,policyVersion,policyAcceptedAt,unsubscribedAt,createdAt");
      expect(text).toContain(`"${email}"`);
    });
  });

  describe("contacto", () => {
    it("persiste el mensaje (201), exige política, y el admin lo lista y cambia de estado", async () => {
      const body = {
        subject: "DEMO",
        name: "Ana Demo",
        email: `ana@${EMAIL_DOMAIN}`,
        phone: "+57 300 000 0000",
        message: "Les envío mi demo para que lo escuchen, gracias.",
        policyAccepted: true,
        policyVersion: "2026-10-17",
      };
      const noPolicy = await app.request("http://localhost/api/contact/messages", json({ ...body, policyAccepted: false }, "POST", false));
      expect(noPolicy.status).toBe(400);

      const res = await app.request("http://localhost/api/contact/messages", json(body, "POST", false));
      expect(res.status, await res.clone().text()).toBe(201);
      const { id } = (await res.json()) as { ok: boolean; id: string };
      const row = await prisma.contactMessage.findUnique({ where: { id } });
      expect(row?.status).toBe("NEW");
      expect(row?.phone).toBe("+573000000000");
      expect(row?.policyVersion).toBe("2026-10-17");

      // El asunto es libre (editable en el admin): otro texto se acepta; vacío o >40 chars → 400
      const custom = await app.request("http://localhost/api/contact/messages", json({ ...body, email: `ana2@${EMAIL_DOMAIN}`, subject: "Sincronización" }, "POST", false));
      expect(custom.status, await custom.clone().text()).toBe(201);
      expect((await app.request("http://localhost/api/contact/messages", json({ ...body, subject: "" }, "POST", false))).status).toBe(400);
      expect((await app.request("http://localhost/api/contact/messages", json({ ...body, subject: "x".repeat(41) }, "POST", false))).status).toBe(400);

      const list = await app.request("http://localhost/api/admin/messages?status=NEW", { headers: auth() });
      expect(list.status).toBe(200);
      const lj = (await list.json()) as Paged<{ id: string }>;
      expect(lj.items.some((m) => m.id === id)).toBe(true);

      const patched = await app.request(`http://localhost/api/admin/messages/${id}`, json({ status: "READ" }, "PATCH"));
      expect(patched.status).toBe(200);
      expect(((await patched.json()) as { status: string }).status).toBe("READ");
      expect((await app.request(`http://localhost/api/admin/messages/${id}`, json({ status: "NOPE" }, "PATCH"))).status).toBe(400);
      expect((await app.request(`http://localhost/api/admin/messages/nope`, json({ status: "READ" }, "PATCH"))).status).toBe(404);
    });
  });

  describe("interés en beats", () => {
    it("persiste BeatInterest con licencia y aparece en el admin y en stats", async () => {
      const beat = await prisma.beat.create({
        data: { title: `${PREFIX}Beat`, genre: "Trap", priceCOP: 100_000, priceWavCOP: 130_000, status: "AVAILABLE" },
      });
      const body = {
        beatId: beat.id,
        artistName: "Young Test",
        email: `young@${EMAIL_DOMAIN}`,
        phone: "+57 (321) 536-8590",
        exclusiveIntent: false,
        licenseType: "WAV",
        marketingOptIn: true,
        policyAccepted: true,
        policyVersion: "2026-10-17",
      };
      const noPolicy = await app.request("http://localhost/api/contact/beat-interest", json({ ...body, policyAccepted: false }, "POST", false));
      expect(noPolicy.status).toBe(400);

      const res = await app.request("http://localhost/api/contact/beat-interest", json(body, "POST", false));
      expect(res.status, await res.clone().text()).toBe(201);
      const { id } = (await res.json()) as { success: boolean; id: string };
      const row = await prisma.beatInterest.findUnique({ where: { id } });
      expect(row?.phone).toBe("+573215368590"); // normalizado: sin espacios, guiones ni paréntesis
      expect(row).toMatchObject({
        beatId: beat.id,
        beatTitle: `${PREFIX}Beat`,
        licenseType: "WAV",
        marketingOptIn: true,
        exclusiveIntent: false,
        policyVersion: "2026-10-17",
      });

      const list = await app.request(`http://localhost/api/admin/beat-interests?q=${PREFIX}`, { headers: auth() });
      expect(list.status).toBe(200);
      const lj = (await list.json()) as Paged<{ id: string }>;
      expect(lj.items.some((x) => x.id === id)).toBe(true);

      const stats = await app.request("http://localhost/api/admin/dashboard/stats", { headers: auth() });
      const sj = (await stats.json()) as { channelsActive: number; messagesNew: number; subscribersActive: number; beatInterests30d: number };
      expect(typeof sj.channelsActive).toBe("number");
      expect(typeof sj.messagesNew).toBe("number");
      expect(typeof sj.subscribersActive).toBe("number");
      expect(sj.beatInterests30d).toBeGreaterThanOrEqual(1);
    });
  });

  it("GET /api/beats expone precios por licencia y GET /api/releases los smart links", async () => {
    const beats = await app.request("http://localhost/api/beats?pageSize=1");
    expect(beats.headers.get("cache-control")).toBe("public, max-age=0, s-maxage=0, must-revalidate");
    const bj = (await beats.json()) as { items: Record<string, unknown>[] };
    if (bj.items[0]) {
      expect(bj.items[0]).toHaveProperty("priceMp3COP");
      expect(bj.items[0]).toHaveProperty("priceExclusiveCOP");
    }
    const rel = await app.request("http://localhost/api/releases");
    const rj = (await rel.json()) as { items: Record<string, unknown>[] };
    if (rj.items[0]) {
      expect(rj.items[0]).toHaveProperty("appleUrl");
      expect(rj.items[0]).toHaveProperty("releaseDate");
    }
  });

  it("booking exige policyAccepted y guarda isAdult/marketingOptIn", async () => {
    const base = {
      serviceTypes: ["CONSULTING"],
      artisticName: `${PREFIX}Artista`,
      fullName: "Prueba Integración",
      genres: ["Trap"],
      musicReference: "https://open.spotify.com/track/4iV5W9uYEdYUVa79Axb7Rh",
      isFirstTime: true,
      scheduledDate: "2099-01-05",
      timeSlot: "night",
      phone: "+57 321 536 8590",
      email: `booking@${EMAIL_DOMAIN}`,
      policyVersion: "2026-10-17",
      isAdult: false,
      marketingOptIn: true,
    };
    const noPolicy = await app.request("http://localhost/api/booking/sessions", json({ ...base, acceptPolicy: true }, "POST", false));
    expect(noPolicy.status).toBe(400);
    expect(((await noPolicy.json()) as { error: string }).error).toBe(POLICY_NOT_ACCEPTED_MESSAGE);

    const res = await app.request("http://localhost/api/booking/sessions", json({ ...base, policyAccepted: true }, "POST", false));
    const text = await res.clone().text();
    expect(res.status, text).toBe(200);
    const { id } = JSON.parse(text) as { ok: boolean; id: string };
    const row = await prisma.bookingSession.findUnique({ where: { id } });
    expect(row?.isAdult).toBe(false);
    expect(row?.marketingOptIn).toBe(true);
    expect(row?.policyVersion).toBe("2026-10-17");
    expect(row?.policyAcceptedAt).toBeInstanceOf(Date);
    await prisma.bookingSession.deleteMany({ where: { artistEmail: `booking@${EMAIL_DOMAIN}` } });
  });
});
