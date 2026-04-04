import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "./hono-app.js";
import { prisma } from "./lib/prisma.js";
import { getAdminCredentials } from "./test-admin-creds.js";

const app = createApp();

const hasDb = Boolean(process.env.DATABASE_URL);
const adminCreds = getAdminCredentials();
const hasAdminCreds = Boolean(hasDb && adminCreds);

describe.skipIf(!hasDb)("Integración API + Prisma (DATABASE_URL)", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("GET /api/site-config devuelve content", async () => {
    const res = await app.request("http://localhost/api/site-config");
    expect(res.status).toBe(200);
    const j = (await res.json()) as { content?: unknown };
    expect(j.content).toBeDefined();
    expect(typeof (j.content as { brand?: unknown }).brand).toBe("object");
  });

  it("GET /api/productions lista paginada", async () => {
    const res = await app.request("http://localhost/api/productions?pageSize=2");
    expect(res.status).toBe(200);
    const j = (await res.json()) as { items: unknown[]; total: number };
    expect(Array.isArray(j.items)).toBe(true);
    expect(typeof j.total).toBe("number");
  });

  it("GET /api/beats", async () => {
    const res = await app.request("http://localhost/api/beats?pageSize=5");
    expect(res.status).toBe(200);
    const j = (await res.json()) as { items: unknown[] };
    expect(Array.isArray(j.items)).toBe(true);
  });

  it("GET /api/releases", async () => {
    const res = await app.request("http://localhost/api/releases?pageSize=5");
    expect(res.status).toBe(200);
    const j = (await res.json()) as { items: unknown[] };
    expect(Array.isArray(j.items)).toBe(true);
  });

  describe.skipIf(!hasAdminCreds)("Rutas admin (ADMIN_EMAIL o seed Jeivymusicdinero@gmail.com)", () => {
    let token: string;

    beforeAll(async () => {
      const res = await app.request("http://localhost/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(adminCreds),
      });
      const body = await res.text();
      expect(res.status, body).toBe(200);
      const j = JSON.parse(body) as { token: string };
      expect(j.token.length).toBeGreaterThan(10);
      token = j.token;
    });

    it("GET /api/admin/beats", async () => {
      const res = await app.request("http://localhost/api/admin/beats", {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(res.status).toBe(200);
      const j = (await res.json()) as { items: unknown[] };
      expect(Array.isArray(j.items)).toBe(true);
    });

    it("GET /api/admin/productions", async () => {
      const res = await app.request("http://localhost/api/admin/productions", {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(res.status).toBe(200);
      const j = (await res.json()) as { items: unknown[] };
      expect(Array.isArray(j.items)).toBe(true);
    });

    it("GET /api/admin/releases", async () => {
      const res = await app.request("http://localhost/api/admin/releases", {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(res.status).toBe(200);
      const j = (await res.json()) as { items: unknown[] };
      expect(Array.isArray(j.items)).toBe(true);
    });

    it("GET /api/admin/site-config", async () => {
      const res = await app.request("http://localhost/api/admin/site-config", {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(res.status).toBe(200);
      const j = (await res.json()) as { draft?: unknown };
      expect(j.draft).toBeDefined();
    });

    it("GET /api/admin/dashboard/stats", async () => {
      const res = await app.request("http://localhost/api/admin/dashboard/stats", {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(res.status).toBe(200);
      const j = (await res.json()) as {
        pendingSessions: number;
        sessionsWeek: number;
        beatsAvailable: number;
        productionsTotal: number;
      };
      expect(typeof j.pendingSessions).toBe("number");
      expect(typeof j.productionsTotal).toBe("number");
    });

    it("GET /api/admin/sessions", async () => {
      const res = await app.request("http://localhost/api/admin/sessions", {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(res.status).toBe(200);
      const j = (await res.json()) as { items: unknown[] };
      expect(Array.isArray(j.items)).toBe(true);
    });

    it("GET /api/admin/calendar?month=", async () => {
      const month = new Date().toISOString().slice(0, 7);
      const res = await app.request(`http://localhost/api/admin/calendar?month=${month}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(res.status).toBe(200);
      const j = (await res.json()) as { days?: unknown[] };
      expect(Array.isArray(j.days)).toBe(true);
    });
  });
});
