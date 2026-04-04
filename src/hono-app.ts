import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { cors } from "hono/cors";
import type { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import {
  addDays,
  eachDayOfInterval,
  endOfDay,
  endOfMonth,
  format,
  isSameDay,
  parseISO,
  startOfDay,
  startOfMonth,
} from "date-fns";
import { randomUUID } from "crypto";
import { extname, join } from "path";
import { readFile, writeFile } from "fs/promises";
import { es } from "date-fns/locale";
import { prisma } from "./lib/prisma.js";
import { TIME_SLOT_LABELS } from "./lib/constants.js";
import {
  sendBeatInterestEmails,
  sendSessionAlertToAdmin,
  sendSessionConfirmedToArtist,
  sendSessionPendingToArtist,
} from "./lib/email.js";
import { bookingFullSchema } from "./schemas/booking.js";
import { beatInterestSchema } from "./schemas/beat-interest.js";
import { siteContentSchema } from "./schemas/site-config.js";
import { optionalMediaUrl } from "./schemas/media-url.js";
import { draftContent, ensureSiteConfigRow, publishedContent } from "./lib/site-config-db.js";
import { ensureUploadDir, UPLOAD_DIR } from "./lib/uploads-dir.js";
import { isSlotScope, monthDateKeyRange, parseDateKey, type BlockScope } from "./lib/blocked-dates.js";

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.warn("JWT_SECRET no definido; /auth/login fallará hasta configurarlo.");
}

type AdminVars = { adminId: string; adminEmail: string };

/** Orígenes explícitos (env + localhost). Sin barra final. */
function corsAllowedOrigins(): string[] {
  const raw = [process.env["FRONTEND_URL"], process.env["SITE_URL"]]
    .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
    .join(",");
  const base = raw.length > 0 ? raw : "http://localhost:3000";
  return base
    .split(",")
    .map((o) => o.trim().replace(/\/+$/, ""))
    .filter(Boolean);
}

/** Si `FRONTEND_URL` no llega al runtime (Vercel/Hono), el `Origin` del navegador sigue siendo fiable para estos hosts. */
function isTrustedSodimusicFrontendOrigin(origin: string): boolean {
  try {
    const { protocol, hostname } = new URL(origin);
    if (protocol !== "https:" || !hostname.endsWith(".vercel.app")) return false;
    return hostname === "sodimusic-frontend.vercel.app" || hostname.startsWith("sodimusic-frontend-");
  } catch {
    return false;
  }
}

const requireAdmin = createMiddleware<{ Variables: AdminVars }>(async (c, next) => {
  if (!JWT_SECRET) {
    return c.json({ error: "Servidor sin JWT_SECRET" }, 500);
  }
  const h = c.req.header("Authorization");
  if (!h?.startsWith("Bearer ")) {
    return c.json({ error: "No autorizado" }, 401);
  }
  try {
    const payload = jwt.verify(h.slice(7), JWT_SECRET) as { sub?: string; email?: string };
    const sub = payload.sub;
    const email = payload.email;
    if (typeof sub !== "string" || typeof email !== "string") {
      return c.json({ error: "No autorizado" }, 401);
    }
    c.set("adminId", sub);
    c.set("adminEmail", email);
    await next();
  } catch {
    return c.json({ error: "No autorizado" }, 401);
  }
});

export function createApp(): Hono {
  const app = new Hono();
  app.use(
    "/*",
    cors({
      origin: (origin) => {
        if (!origin) return null;
        const normalized = origin.replace(/\/+$/, "");
        if (corsAllowedOrigins().includes(normalized)) return origin;
        if (isTrustedSodimusicFrontendOrigin(origin)) return origin;
        return null;
      },
      allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization"],
      credentials: true,
    }),
  );

  app.get("/health", (c) => c.json({ ok: true }));

  app.post("/api/auth/login", async (c) => {
    if (!JWT_SECRET) {
      return c.json({ error: "JWT_SECRET no configurado" }, 500);
    }
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "JSON inválido" }, 400);
    }
    const parsed = z.object({ email: z.string().email(), password: z.string().min(1) }).safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "Credenciales inválidas" }, 400);
    }
    const user = await prisma.adminUser.findUnique({
      where: { email: parsed.data.email.toLowerCase().trim() },
    });
    if (!user) {
      return c.json({ error: "Credenciales incorrectas" }, 401);
    }
    const valid = await bcrypt.compare(parsed.data.password, user.password);
    if (!valid) {
      return c.json({ error: "Credenciales incorrectas" }, 401);
    }
    const token = jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, { expiresIn: "7d" });
    return c.json({ token, user: { id: user.id, email: user.email } });
  });

  app.get("/api/booking/availability", async (c) => {
    const dateParam = c.req.query("date");
    if (!dateParam) {
      return c.json({ error: "Parámetro date requerido" }, 400);
    }
    let parsed: Date;
    try {
      parsed = parseISO(dateParam);
      if (Number.isNaN(parsed.getTime())) {
        return c.json({ error: "Fecha inválida" }, 400);
      }
    } catch {
      return c.json({ error: "Fecha inválida" }, 400);
    }
    const dayStart = startOfDay(parsed);
    const dayEnd = endOfDay(parsed);
    const dateKey = parseDateKey(dateParam);
    if (!dateKey) {
      return c.json({ error: "Fecha inválida (usa yyyy-MM-dd)" }, 400);
    }
    const blocks = await prisma.blockedDate.findMany({ where: { dateKey } });
    if (blocks.some((b) => b.scope === "DAY")) {
      return c.json({ date: dateParam, occupied: ["morning", "afternoon", "night"], blocked: true });
    }
    const sessions = await prisma.bookingSession.findMany({
      where: {
        scheduledDate: { gte: dayStart, lte: dayEnd },
        status: { in: ["PENDING", "CONFIRMED"] },
      },
      select: { timeSlot: true },
    });
    const fromSessions = [...new Set(sessions.map((s) => s.timeSlot))] as string[];
    const fromBlocks = blocks.filter((b) => isSlotScope(b.scope)).map((b) => b.scope);
    const occupied = [...new Set([...fromSessions, ...fromBlocks])] as ("morning" | "afternoon" | "night")[];
    return c.json({ date: dateParam, occupied, blocked: false });
  });

  app.post("/api/booking/sessions", async (c) => {
    let raw: unknown;
    try {
      raw = await c.req.json();
    } catch {
      return c.json({ ok: false, error: "JSON inválido" }, 400);
    }
    const parsed = bookingFullSchema.safeParse(raw);
    if (!parsed.success) {
      return c.json({ ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" }, 400);
    }
    const data = parsed.data;
    const dayStart = startOfDay(data.scheduledDate);
    const dayEnd = endOfDay(data.scheduledDate);
    const dateKey = format(dayStart, "yyyy-MM-dd");
    const blocks = await prisma.blockedDate.findMany({ where: { dateKey } });
    if (blocks.some((b) => b.scope === "DAY")) {
      return c.json({ ok: false, error: "Esa fecha no está disponible." }, 400);
    }
    if (blocks.some((b) => b.scope === data.timeSlot)) {
      return c.json({ ok: false, error: "Esa franja no está disponible." }, 400);
    }

    const conflict = await prisma.bookingSession.findFirst({
      where: {
        scheduledDate: { gte: dayStart, lte: dayEnd },
        timeSlot: data.timeSlot,
        status: { in: ["PENDING", "CONFIRMED"] },
      },
    });
    if (conflict) {
      return c.json({ ok: false, error: "Ese horario acaba de ser reservado. Elige otro." }, 400);
    }

    const instagramClean = data.instagram?.replace(/^@/, "").trim();
    const instagram = instagramClean && instagramClean.length > 0 ? instagramClean : null;

    const session = await prisma.bookingSession.create({
      data: {
        serviceType: data.serviceTypes.join(","),
        artistName: data.artisticName,
        artistEmail: data.email.trim().toLowerCase(),
        artistPhone: data.phone.replace(/\s/g, ""),
        artistInstagram: instagram,
        musicReference: data.musicReference,
        vision: data.vision ?? null,
        genres: data.genres.join(","),
        isFirstTime: data.isFirstTime,
        scheduledDate: dayStart,
        timeSlot: data.timeSlot,
        status: "PENDING",
        internalNotes: `Nombre completo: ${data.fullName}`,
      },
    });

    const scheduledLabel = format(dayStart, "EEEE d 'de' MMMM yyyy", { locale: es });
    const slotLabel = TIME_SLOT_LABELS[data.timeSlot] ?? data.timeSlot;

    await sendSessionPendingToArtist({
      artistEmail: session.artistEmail,
      artistName: session.artistName,
      serviceType: data.serviceTypes.join(", "),
      scheduledLabel,
      slotLabel,
    });

    await sendSessionAlertToAdmin({
      artistName: session.artistName,
      fullName: data.fullName,
      artistEmail: session.artistEmail,
      artistPhone: session.artistPhone,
      artistInstagram: session.artistInstagram,
      serviceType: data.serviceTypes.join(", "),
      scheduledLabel,
      slotLabel,
      musicReference: session.musicReference,
      vision: session.vision,
      genres: session.genres,
    });

    return c.json({ ok: true, id: session.id });
  });

  app.post("/api/contact/beat-interest", async (c) => {
    let raw: unknown;
    try {
      raw = await c.req.json();
    } catch {
      return c.json({ success: false, error: "JSON inválido" }, 400);
    }
    const parsed = beatInterestSchema.safeParse(raw);
    if (!parsed.success) {
      return c.json({ success: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" }, 400);
    }
    const data = parsed.data;
    const beat = await prisma.beat.findUnique({ where: { id: data.beatId } });
    if (!beat) {
      return c.json({ success: false, error: "Beat no encontrado" }, 400);
    }
    const phone = data.phone.replace(/\s/g, "");
    const ig = data.instagram?.replace(/^@/, "").trim();
    const r = await sendBeatInterestEmails({
      artistName: data.artistName,
      email: data.email.trim().toLowerCase(),
      phone,
      instagram: ig && ig.length > 0 ? ig : undefined,
      beatTitle: beat.title,
      beatGenre: beat.genre,
      priceCOP: beat.priceCOP,
      exclusiveIntent: data.exclusiveIntent,
      message: data.message,
    });
    if (!r.ok) {
      return c.json({ success: false, error: r.error.message }, 500);
    }
    return c.json({ success: true });
  });

  app.get("/api/productions", async (c) => {
    const genre = c.req.query("genre");
    const year = c.req.query("year");
    const country = c.req.query("country");
    const featuredOnly = c.req.query("featured") === "1";
    const page = Math.max(1, Number(c.req.query("page") ?? "1"));
    const pageSize = Math.min(48, Math.max(1, Number(c.req.query("pageSize") ?? "12")));

    const where: Prisma.ProductionWhereInput = {};
    if (featuredOnly) {
      where.featured = true;
    }
    if (genre && genre !== "Todos") {
      where.genre = genre;
    }
    if (year && year !== "Todos") {
      where.year = Number(year);
    }
    if (country && country !== "Todos") {
      if (country === "Colombia") {
        where.artistCountry = "Colombia";
      } else if (country === "México") {
        where.artistCountry = "México";
      } else if (country === "Otro") {
        where.artistCountry = { notIn: ["Colombia", "México"] };
      }
    }

    const [items, total] = await Promise.all([
      prisma.production.findMany({
        where,
        orderBy: [{ year: "desc" }, { createdAt: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.production.count({ where }),
    ]);

    return c.json({ items, total, page, pageSize });
  });

  app.get("/api/productions/count", async (c) => {
    const total = await prisma.production.count();
    return c.json({ total });
  });

  app.get("/api/beats", async (c) => {
    const genre = c.req.query("genre");
    const mood = c.req.query("mood");
    const bpmMin = c.req.query("bpmMin");
    const bpmMax = c.req.query("bpmMax");
    const onlyAvailable = c.req.query("onlyAvailable") === "1";
    const page = Math.max(1, Number(c.req.query("page") ?? "1"));
    const pageSize = Math.min(48, Math.max(1, Number(c.req.query("pageSize") ?? "12")));

    const where: Prisma.BeatWhereInput = {};
    if (genre && genre !== "Todos") {
      where.genre = genre;
    }
    if (mood && mood !== "Todos") {
      where.mood = mood;
    }
    if (onlyAvailable) {
      where.status = "AVAILABLE";
    }
    if (bpmMin || bpmMax) {
      where.bpm = {};
      if (bpmMin) {
        where.bpm.gte = Number(bpmMin);
      }
      if (bpmMax) {
        where.bpm.lte = Number(bpmMax);
      }
    }

    const [items, total, availableCount] = await Promise.all([
      prisma.beat.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.beat.count({ where }),
      prisma.beat.count({ where: { status: "AVAILABLE" } }),
    ]);

    return c.json({ items, total, page, pageSize, availableCount });
  });

  app.get("/api/releases", async (c) => {
    const genre = c.req.query("genre");
    const year = c.req.query("year");
    const featuredOnly = c.req.query("featured") === "1";
    const where: Prisma.ReleaseWhereInput = {
      upcoming: true,
    };
    if (genre && genre !== "Todos") {
      where.genre = genre;
    }
    if (year && year !== "Todos") {
      where.releaseYear = Number(year);
    }
    if (featuredOnly) {
      where.featured = true;
    }
    const items = await prisma.release.findMany({
      where,
      orderBy: [{ releaseYear: "desc" }, { createdAt: "desc" }],
    });
    return c.json({ items });
  });

  app.get("/api/releases/by-slug/:slug", async (c) => {
    const slug = c.req.param("slug");
    const release = await prisma.release.findUnique({ where: { slug } });
    if (!release) {
      return c.json({ error: "No encontrado" }, 404);
    }
    return c.json(release);
  });

  app.get("/api/blocked-dates", async (c) => {
    const from = c.req.query("from");
    const to = c.req.query("to");
    if (!from || !to) {
      return c.json({ error: "from y to requeridos (yyyy-MM-dd)" }, 400);
    }
    const fromKey = parseDateKey(from) ?? format(startOfDay(parseISO(from)), "yyyy-MM-dd");
    const toKey = parseDateKey(to) ?? format(endOfDay(parseISO(to)), "yyyy-MM-dd");
    if (!fromKey || !toKey) {
      return c.json({ error: "Rango de fechas inválido" }, 400);
    }
    const rows = await prisma.blockedDate.findMany({
      where: { dateKey: { gte: fromKey, lte: toKey } },
      orderBy: [{ dateKey: "asc" }, { scope: "asc" }],
    });
    return c.json({ items: rows });
  });

  app.get("/api/site-config", async (c) => {
    await ensureSiteConfigRow();
    const row = await prisma.siteConfig.findUnique({ where: { id: "default" } });
    const content = publishedContent(row);
    return c.json({ content, publishedAt: row?.publishedAt ?? null });
  });

  app.get("/uploads/:name", async (c) => {
    const name = c.req.param("name");
    if (!/^[a-zA-Z0-9._-]+$/.test(name)) {
      return c.json({ error: "Nombre inválido" }, 400);
    }
    const filePath = join(UPLOAD_DIR, name);
    try {
      const buf = await readFile(filePath);
      const ext = extname(name).toLowerCase();
      const mime: Record<string, string> = {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".webp": "image/webp",
        ".mp3": "audio/mpeg",
        ".wav": "audio/wav",
        ".ogg": "audio/ogg",
      };
      const ct = mime[ext] ?? "application/octet-stream";
      return new Response(buf, {
        status: 200,
        headers: {
          "Content-Type": ct,
          "Cache-Control": "public, max-age=31536000, immutable",
        },
      });
    } catch {
      return c.json({ error: "No encontrado" }, 404);
    }
  });

  const admin = new Hono<{ Variables: AdminVars }>();
  admin.use("*", requireAdmin);

  admin.get("/productions", async (c) => {
    const items = await prisma.production.findMany({
      orderBy: [{ year: "desc" }, { createdAt: "desc" }],
    });
    return c.json({ items });
  });

  admin.get("/beats", async (c) => {
    const items = await prisma.beat.findMany({ orderBy: { createdAt: "desc" } });
    return c.json({ items });
  });

  admin.get("/releases", async (c) => {
    const items = await prisma.release.findMany({ orderBy: [{ releaseYear: "desc" }, { createdAt: "desc" }] });
    return c.json({ items });
  });

  admin.get("/dashboard/stats", async (c) => {
    const now = new Date();
    const weekEnd = addDays(now, 7);
    const [pendingSessions, sessionsWeek, beatsAvailable, productionsTotal] = await Promise.all([
      prisma.bookingSession.count({ where: { status: "PENDING" } }),
      prisma.bookingSession.count({
        where: { scheduledDate: { gte: startOfDay(now), lte: weekEnd } } }),
      prisma.beat.count({ where: { status: "AVAILABLE" } }),
      prisma.production.count(),
    ]);
    return c.json({ pendingSessions, sessionsWeek, beatsAvailable, productionsTotal });
  });

  admin.get("/sessions", async (c) => {
    const status = c.req.query("status");
    const serviceType = c.req.query("serviceType");
    const from = c.req.query("from");
    const to = c.req.query("to");
    const where: Prisma.BookingSessionWhereInput = {};
    if (status && status !== "Todos") {
      where.status = status;
    }
    if (serviceType && serviceType !== "Todos") {
      where.serviceType = { contains: serviceType };
    }
    if (from || to) {
      where.scheduledDate = {};
      if (from) {
        where.scheduledDate.gte = startOfDay(parseISO(from));
      }
      if (to) {
        where.scheduledDate.lte = endOfDay(parseISO(to));
      }
    }
    const sessions = await prisma.bookingSession.findMany({
      where,
      orderBy: { scheduledDate: "desc" },
    });
    return c.json({ items: sessions });
  });

  admin.post("/sessions", async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "JSON inválido" }, 400);
    }
    const parsed = z
      .object({
        serviceType: z.string().min(1),
        artistName: z.string().min(1),
        artistEmail: z.string().email(),
        artistPhone: z.string().min(6),
        artistInstagram: z.string().optional().nullable(),
        musicReference: z.string().url(),
        vision: z.string().optional().nullable(),
        genres: z.string().min(1),
        scheduledDate: z.string(),
        timeSlot: z.enum(["morning", "afternoon", "night"]),
        internalNotes: z.string().optional().nullable(),
        isFirstTime: z.boolean().optional(),
      })
      .safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "Datos inválidos", issues: parsed.error.flatten() }, 400);
    }
    const d = parsed.data;
    const dayStart = startOfDay(parseISO(d.scheduledDate));
    const dayEnd = endOfDay(parseISO(d.scheduledDate));
    const dateKey = format(dayStart, "yyyy-MM-dd");
    const blocks = await prisma.blockedDate.findMany({ where: { dateKey } });
    if (blocks.some((b) => b.scope === "DAY")) {
      return c.json({ error: "Ese día está bloqueado en el calendario." }, 400);
    }
    if (blocks.some((b) => b.scope === d.timeSlot)) {
      return c.json({ error: "Esa franja está bloqueada en el calendario." }, 400);
    }

    const conflict = await prisma.bookingSession.findFirst({
      where: {
        scheduledDate: { gte: dayStart, lte: dayEnd },
        timeSlot: d.timeSlot,
        status: { in: ["PENDING", "CONFIRMED"] },
      },
    });
    if (conflict) {
      return c.json({ error: "Ya hay una sesión pendiente o confirmada en esa franja." }, 400);
    }

    const ig = d.artistInstagram?.replace(/^@/, "").trim();
    const session = await prisma.bookingSession.create({
      data: {
        serviceType: d.serviceType,
        artistName: d.artistName,
        artistEmail: d.artistEmail.trim().toLowerCase(),
        artistPhone: d.artistPhone.replace(/\s/g, ""),
        artistInstagram: ig && ig.length > 0 ? ig : null,
        musicReference: d.musicReference,
        vision: d.vision ?? null,
        genres: d.genres,
        isFirstTime: d.isFirstTime ?? true,
        scheduledDate: dayStart,
        timeSlot: d.timeSlot,
        status: "PENDING",
        internalNotes: d.internalNotes ?? null,
      },
    });
    return c.json(session);
  });

  admin.patch("/sessions/:id", async (c) => {
    const id = c.req.param("id");
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "JSON inválido" }, 400);
    }
    const parsed = z
      .object({
        status: z.enum(["PENDING", "CONFIRMED", "COMPLETED", "CANCELLED"]).optional(),
        internalNotes: z.string().optional().nullable(),
      })
      .safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "Datos inválidos" }, 400);
    }

    const existing = await prisma.bookingSession.findUnique({ where: { id } });
    if (!existing) {
      return c.json({ error: "No encontrado" }, 404);
    }

    const updates: Parameters<typeof prisma.bookingSession.update>[0]["data"] = {};
    if (parsed.data.internalNotes !== undefined) {
      updates.internalNotes = parsed.data.internalNotes;
    }
    if (parsed.data.status) {
      updates.status = parsed.data.status;
      if (parsed.data.status === "CONFIRMED") {
        updates.confirmedAt = new Date();
        const dayStart = startOfDay(existing.scheduledDate);
        const scheduledLabel = format(dayStart, "EEEE d 'de' MMMM yyyy", { locale: es });
        const slotLabel = TIME_SLOT_LABELS[existing.timeSlot] ?? existing.timeSlot;
        await sendSessionConfirmedToArtist({
          artistEmail: existing.artistEmail,
          artistName: existing.artistName,
          serviceType: existing.serviceType,
          scheduledLabel,
          slotLabel,
        });
      }
    }

    const updated = await prisma.bookingSession.update({ where: { id }, data: updates });
    return c.json(updated);
  });

  admin.delete("/sessions/:id", async (c) => {
    const id = c.req.param("id");
    try {
      await prisma.bookingSession.delete({ where: { id } });
    } catch {
      return c.json({ error: "No encontrado" }, 404);
    }
    return c.json({ ok: true });
  });

  admin.post("/productions", async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "JSON inválido" }, 400);
    }
    const schema = z.object({
      title: z.string().min(1),
      artistName: z.string().min(1),
      artistCity: z.string().min(1),
      artistCountry: z.string().min(1),
      year: z.number().int(),
      genre: z.string().min(1),
      coverUrl: optionalMediaUrl,
      spotifyUrl: optionalMediaUrl,
      youtubeUrl: optionalMediaUrl,
      featured: z.boolean().optional(),
    });
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: parsed.error.issues[0]?.message }, 400);
    }
    const d = parsed.data;
    const row = await prisma.production.create({
      data: {
        title: d.title,
        artistName: d.artistName,
        artistCity: d.artistCity,
        artistCountry: d.artistCountry,
        year: d.year,
        genre: d.genre,
        coverUrl: d.coverUrl || null,
        spotifyUrl: d.spotifyUrl || null,
        youtubeUrl: d.youtubeUrl || null,
        featured: d.featured ?? false,
      },
    });
    return c.json(row);
  });

  admin.patch("/productions/:id", async (c) => {
    const id = c.req.param("id");
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "JSON inválido" }, 400);
    }
    const schema = z
      .object({
        title: z.string().optional(),
        artistName: z.string().optional(),
        artistCity: z.string().optional(),
        artistCountry: z.string().optional(),
        year: z.number().int().optional(),
        genre: z.string().optional(),
        coverUrl: optionalMediaUrl,
        spotifyUrl: optionalMediaUrl,
        youtubeUrl: optionalMediaUrl,
        featured: z.boolean().optional(),
      })
      .safeParse(body);
    if (!schema.success) {
      return c.json({ error: "Datos inválidos" }, 400);
    }
    const updated = await prisma.production.update({ where: { id }, data: schema.data });
    return c.json(updated);
  });

  admin.delete("/productions/:id", async (c) => {
    const id = c.req.param("id");
    await prisma.production.delete({ where: { id } });
    return c.json({ ok: true });
  });

  admin.post("/beats", async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "JSON inválido" }, 400);
    }
    const schema = z.object({
      title: z.string().min(1),
      genre: z.string().min(1),
      bpm: z.number().int().optional().nullable(),
      mood: z.string().optional().nullable(),
      priceCOP: z.number().int(),
      status: z.enum(["AVAILABLE", "SOLD", "EXCLUSIVE"]),
      audioUrl: optionalMediaUrl,
      coverUrl: optionalMediaUrl,
      exclusive: z.boolean().optional(),
    });
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: parsed.error.issues[0]?.message }, 400);
    }
    const row = await prisma.beat.create({ data: { ...parsed.data, exclusive: parsed.data.exclusive ?? false } });
    return c.json(row);
  });

  admin.patch("/beats/:id", async (c) => {
    const id = c.req.param("id");
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "JSON inválido" }, 400);
    }
    const schema = z
      .object({
        title: z.string().optional(),
        genre: z.string().optional(),
        bpm: z.number().int().optional().nullable(),
        mood: z.string().optional().nullable(),
        priceCOP: z.number().int().optional(),
        status: z.enum(["AVAILABLE", "SOLD", "EXCLUSIVE"]).optional(),
        audioUrl: optionalMediaUrl,
        coverUrl: optionalMediaUrl,
        exclusive: z.boolean().optional(),
      })
      .safeParse(body);
    if (!schema.success) {
      return c.json({ error: "Datos inválidos" }, 400);
    }
    const updated = await prisma.beat.update({ where: { id }, data: schema.data });
    return c.json(updated);
  });

  admin.delete("/beats/:id", async (c) => {
    const id = c.req.param("id");
    await prisma.beat.delete({ where: { id } });
    return c.json({ ok: true });
  });

  admin.post("/releases", async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "JSON inválido" }, 400);
    }
    const schema = z.object({
      title: z.string().min(1),
      slug: z.string().min(1),
      artistName: z.string().min(1),
      genre: z.string().min(1),
      releaseYear: z.number().int(),
      coverUrl: optionalMediaUrl,
      spotifyUrl: optionalMediaUrl,
      youtubeUrl: optionalMediaUrl,
      description: z.string().optional().nullable(),
      featured: z.boolean().optional(),
      upcoming: z.boolean().optional(),
    });
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: parsed.error.issues[0]?.message }, 400);
    }
    const row = await prisma.release.create({
      data: {
        ...parsed.data,
        featured: parsed.data.featured ?? false,
        upcoming: parsed.data.upcoming ?? true,
      },
    });
    return c.json(row);
  });

  admin.patch("/releases/:id", async (c) => {
    const id = c.req.param("id");
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "JSON inválido" }, 400);
    }
    const schema = z
      .object({
        title: z.string().optional(),
        slug: z.string().optional(),
        artistName: z.string().optional(),
        genre: z.string().optional(),
        releaseYear: z.number().int().optional(),
        coverUrl: optionalMediaUrl,
        spotifyUrl: optionalMediaUrl,
        youtubeUrl: optionalMediaUrl,
        description: z.string().optional().nullable(),
        featured: z.boolean().optional(),
        upcoming: z.boolean().optional(),
      })
      .safeParse(body);
    if (!schema.success) {
      return c.json({ error: "Datos inválidos" }, 400);
    }
    const updated = await prisma.release.update({ where: { id }, data: schema.data });
    return c.json(updated);
  });

  admin.delete("/releases/:id", async (c) => {
    const id = c.req.param("id");
    await prisma.release.delete({ where: { id } });
    return c.json({ ok: true });
  });

  admin.post("/blocked-dates", async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "JSON inválido" }, 400);
    }
    const parsed = z
      .object({
        date: z.string(),
        reason: z.string().optional(),
        scope: z.enum(["DAY", "morning", "afternoon", "night"]).optional(),
      })
      .safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "Fecha requerida" }, 400);
    }
    const dateKey = parseDateKey(parsed.data.date);
    if (!dateKey) {
      return c.json({ error: "Fecha inválida (yyyy-MM-dd)" }, 400);
    }
    const scope: BlockScope = parsed.data.scope ?? "DAY";
    const reason = parsed.data.reason?.trim() || null;

    if (scope === "DAY") {
      await prisma.blockedDate.deleteMany({ where: { dateKey } });
      const row = await prisma.blockedDate.create({
        data: { dateKey, scope: "DAY", reason },
      });
      return c.json(row);
    }

    const dayRow = await prisma.blockedDate.findFirst({
      where: { dateKey, scope: "DAY" },
    });
    if (dayRow) {
      return c.json(
        {
          error:
            "Este día está bloqueado por completo. Desbloquéalo primero si quieres gestionar franjas sueltas.",
        },
        400,
      );
    }

    const dayStart = startOfDay(parseISO(dateKey));
    const dayEnd = endOfDay(parseISO(dateKey));
    const conflict = await prisma.bookingSession.findFirst({
      where: {
        scheduledDate: { gte: dayStart, lte: dayEnd },
        timeSlot: scope,
        status: { in: ["PENDING", "CONFIRMED"] },
      },
    });
    if (conflict) {
      return c.json(
        { error: "Hay una sesión pendiente o confirmada en esa franja. Gestiónala antes de bloquear." },
        400,
      );
    }

    const row = await prisma.blockedDate.upsert({
      where: { dateKey_scope: { dateKey, scope } },
      create: { dateKey, scope, reason },
      update: { reason },
    });
    return c.json(row);
  });

  admin.delete("/blocked-dates/:id", async (c) => {
    const id = c.req.param("id");
    await prisma.blockedDate.delete({ where: { id } });
    return c.json({ ok: true });
  });

  admin.get("/calendar", async (c) => {
    const month = c.req.query("month");
    if (!month) {
      return c.json({ error: "month requerido (YYYY-MM)" }, 400);
    }
    const bounds = monthDateKeyRange(month);
    if (!bounds) {
      return c.json({ error: "month inválido" }, 400);
    }
    const base = parseISO(`${month}-01`);
    const from = startOfMonth(base);
    const to = endOfMonth(base);
    const [sessions, blocked] = await Promise.all([
      prisma.bookingSession.findMany({
        where: { scheduledDate: { gte: from, lte: to } },
      }),
      prisma.blockedDate.findMany({
        where: { dateKey: { gte: bounds.from, lte: bounds.to } },
        orderBy: [{ dateKey: "asc" }, { scope: "asc" }],
      }),
    ]);
    type SlotState = "FREE" | "PENDING" | "CONFIRMED" | "BLOCKED";
    const days = eachDayOfInterval({ start: from, end: to }).map((d) => {
      const dateStr = format(d, "yyyy-MM-dd");
      const blocksForDay = blocked.filter((b) => b.dateKey === dateStr);
      const fullDay = blocksForDay.some((b) => b.scope === "DAY");
      if (fullDay) {
        return {
          date: dateStr,
          blocked: true,
          slots: {
            morning: "BLOCKED" as const,
            afternoon: "BLOCKED" as const,
            night: "BLOCKED" as const,
          },
        };
      }
      const daySessions = sessions.filter((s) => isSameDay(s.scheduledDate, d));
      const slots: Record<"morning" | "afternoon" | "night", SlotState> = {
        morning: "FREE",
        afternoon: "FREE",
        night: "FREE",
      };
      for (const s of daySessions) {
        if (s.status === "PENDING" || s.status === "CONFIRMED") {
          const key = s.timeSlot as keyof typeof slots;
          if (key in slots) {
            slots[key] = s.status as SlotState;
          }
        }
      }
      for (const b of blocksForDay) {
        if (isSlotScope(b.scope) && slots[b.scope] === "FREE") {
          slots[b.scope] = "BLOCKED";
        }
      }
      return {
        date: dateStr,
        blocked: false,
        slots,
      };
    });
    return c.json({ sessions, blocked, days });
  });

  admin.get("/site-config", async (c) => {
    await ensureSiteConfigRow();
    const row = await prisma.siteConfig.findUnique({ where: { id: "default" } });
    if (!row) {
      return c.json({ error: "Sin configuración" }, 500);
    }
    return c.json({
      draft: draftContent(row),
      published: publishedContent(row),
      publishedAt: row.publishedAt,
      draftUpdatedAt: row.draftUpdatedAt,
    });
  });

  admin.put("/site-config/draft", async (c) => {
    await ensureSiteConfigRow();
    let raw: unknown;
    try {
      raw = await c.req.json();
    } catch {
      return c.json({ error: "JSON inválido" }, 400);
    }
    const parsed = siteContentSchema.safeParse(raw);
    if (!parsed.success) {
      return c.json({ error: "Datos inválidos", issues: parsed.error.flatten() }, 400);
    }
    const row = await prisma.siteConfig.update({
      where: { id: "default" },
      data: { draftJson: parsed.data as object, draftUpdatedAt: new Date() },
    });
    return c.json({ ok: true, draft: draftContent(row), draftUpdatedAt: row.draftUpdatedAt });
  });

  admin.post("/site-config/publish", async (c) => {
    await ensureSiteConfigRow();
    const row = await prisma.siteConfig.findUnique({ where: { id: "default" } });
    if (!row) {
      return c.json({ error: "Sin configuración" }, 500);
    }
    const toPublish = draftContent(row);
    const updated = await prisma.siteConfig.update({
      where: { id: "default" },
      data: {
        publishedJson: toPublish as object,
        publishedAt: new Date(),
      },
    });
    return c.json({
      ok: true,
      published: publishedContent(updated),
      publishedAt: updated.publishedAt,
    });
  });

  admin.post("/upload", async (c) => {
    ensureUploadDir();
    let body: Record<string, unknown>;
    try {
      body = (await c.req.parseBody()) as Record<string, unknown>;
    } catch {
      return c.json({ error: "Formulario inválido" }, 400);
    }
    const file = body["file"];
    if (!(file instanceof File)) {
      return c.json({ error: "Campo 'file' requerido" }, 400);
    }
    const maxBytes = 15 * 1024 * 1024;
    if (file.size > maxBytes) {
      return c.json({ error: "Archivo demasiado grande (máx. 15 MB)" }, 400);
    }
    const allowed: Record<string, string> = {
      "image/jpeg": ".jpg",
      "image/png": ".png",
      "image/webp": ".webp",
      "audio/mpeg": ".mp3",
      "audio/wav": ".wav",
      "audio/wave": ".wav",
    };
    const ext = allowed[file.type];
    if (!ext) {
      return c.json({ error: `Tipo no permitido: ${file.type}` }, 400);
    }
    const id = `${randomUUID()}${ext}`;
    const buf = Buffer.from(await file.arrayBuffer());
    await writeFile(join(UPLOAD_DIR, id), buf);
    return c.json({ url: `/uploads/${id}` });
  });

  admin.get("/sessions/export.csv", async () => {
    const sessions = await prisma.bookingSession.findMany({ orderBy: { scheduledDate: "desc" } });
    const header = [
      "id",
      "artistName",
      "serviceType",
      "scheduledDate",
      "timeSlot",
      "status",
      "artistEmail",
      "artistPhone",
    ];
    const lines = sessions.map((s) =>
      [
        s.id,
        s.artistName,
        s.serviceType,
        s.scheduledDate.toISOString(),
        s.timeSlot,
        s.status,
        s.artistEmail,
        s.artistPhone,
      ]
        .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
        .join(","),
    );
    const csv = [header.join(","), ...lines].join("\n");
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="sesiones.csv"',
      },
    });
  });

  app.route("/api/admin", admin);

  return app;
}
