import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PUBLIC_CACHE_CONTROL, createApp } from "./hono-app.js";
import { prisma } from "./lib/prisma.js";
import { RATE_LIMIT_MESSAGE } from "./lib/rate-limit.js";

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("cabeceras públicas y rate limit (DATABASE_URL)", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("los listados que edita el admin y site-config no se retienen en CDN; /uploads sigue immutable", async () => {
    const app = createApp();
    expect(PUBLIC_CACHE_CONTROL).toBe("public, max-age=0, s-maxage=0, must-revalidate");
    for (const path of ["/api/site-config", "/api/beats", "/api/products", "/api/releases", "/api/productions", "/api/channels", "/api/productions/count"]) {
      const res = await app.request(`http://localhost${path}`);
      expect(res.status, path).toBe(200);
      expect(res.headers.get("cache-control"), path).toBe("public, max-age=0, s-maxage=0, must-revalidate");
    }
    // Un asset inexistente no lleva immutable (404); el 200 con immutable se cubre en products.integration.test
    const missing = await app.request("http://localhost/uploads/no-existe.png");
    expect(missing.status).toBe(404);
  });

  it("paginación: valores inválidos o desorbitados caen a página 1 / tamaño por defecto", async () => {
    const app = createApp();
    for (const path of ["/api/beats", "/api/products", "/api/productions", "/api/channels"]) {
      const res = await app.request(`http://localhost${path}?page=999999999999&pageSize=abc`);
      expect(res.status, path).toBe(200);
      const j = (await res.json()) as { page: number; pageSize: number };
      expect(j.page, path).toBe(1);
      expect(j.pageSize, path).toBeGreaterThanOrEqual(12);
      const neg = (await (await app.request(`http://localhost${path}?page=-3&pageSize=1.5`)).json()) as { page: number };
      expect(neg.page, path).toBe(1);
    }
  });

  describe("rate limit activo", () => {
    const prev = process.env.RATE_LIMIT_DISABLED;
    beforeAll(() => {
      delete process.env.RATE_LIMIT_DISABLED;
    });
    afterAll(() => {
      if (prev !== undefined) process.env.RATE_LIMIT_DISABLED = prev;
    });

    it("subscribe, contact, beat-interest y booking devuelven 429 a la 11ª petición por IP", async () => {
      const app = createApp();
      const cases: Array<{ path: string; key: "ok" | "success" }> = [
        { path: "/api/newsletter/subscribe", key: "ok" },
        { path: "/api/contact/messages", key: "ok" },
        { path: "/api/contact/beat-interest", key: "success" },
        { path: "/api/booking/sessions", key: "ok" },
      ];
      for (const [i, { path, key }] of cases.entries()) {
        const ip = `203.0.113.${i + 1}`;
        const hit = (): Promise<Response> =>
          app.request(`http://localhost${path}`, {
            method: "POST",
            headers: { "content-type": "application/json", "x-forwarded-for": ip },
            body: "{}", // sin policyAccepted → 400, pero cuenta para el límite
          });
        for (let n = 0; n < 10; n++) {
          expect((await hit()).status, `${path} #${n + 1}`).toBe(400);
        }
        const blocked = await hit();
        expect(blocked.status, path).toBe(429);
        const body = (await blocked.json()) as Record<string, unknown>;
        expect(body[key]).toBe(false);
        expect(body["error"]).toBe(RATE_LIMIT_MESSAGE);
      }
      // Otra IP no está bloqueada
      const other = await app.request("http://localhost/api/newsletter/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.9" },
        body: "{}",
      });
      expect(other.status).toBe(400);
    });
  });
});
