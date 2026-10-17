import { Hono } from "hono";
import { afterEach, describe, expect, it } from "vitest";
import { RATE_LIMIT_MESSAGE, clientIp, rateLimit } from "./rate-limit.js";

function appWith(mw: ReturnType<typeof rateLimit>): Hono {
  const app = new Hono();
  app.post("/x", mw, (c) => c.json({ ok: true }));
  return app;
}

const post = (app: Hono, ip?: string): Promise<Response> =>
  app.request("http://localhost/x", { method: "POST", headers: ip ? { "x-forwarded-for": ip } : {} });

describe("rateLimit", () => {
  const prev = process.env.RATE_LIMIT_DISABLED;
  afterEach(() => {
    if (prev === undefined) delete process.env.RATE_LIMIT_DISABLED;
    else process.env.RATE_LIMIT_DISABLED = prev;
  });

  it("permite 10 por IP y ventana; la 11ª devuelve 429 en español", async () => {
    let t = 1_000_000;
    const app = appWith(rateLimit({ max: 10, windowMs: 600_000, enabled: true, now: () => t }));
    for (let i = 0; i < 10; i++) {
      expect((await post(app, "1.1.1.1, 10.0.0.1")).status, `req ${i + 1}`).toBe(200);
    }
    const blocked = await post(app, "1.1.1.1");
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).toBe("600");
    expect(await blocked.json()).toEqual({ ok: false, error: RATE_LIMIT_MESSAGE });

    // Otra IP no se ve afectada
    expect((await post(app, "2.2.2.2")).status).toBe(200);

    // Pasada la ventana vuelve a permitir
    t += 600_001;
    expect((await post(app, "1.1.1.1")).status).toBe(200);
  });

  it("forma { success:false } cuando se pide", async () => {
    const app = appWith(rateLimit({ max: 1, enabled: true, shape: "success" }));
    await post(app, "3.3.3.3");
    const blocked = await post(app, "3.3.3.3");
    expect(blocked.status).toBe(429);
    expect(await blocked.json()).toEqual({ success: false, error: RATE_LIMIT_MESSAGE });
  });

  it("sin cabeceras de IP agrupa como `local`", async () => {
    expect(clientIp(new Headers())).toBe("local");
    expect(clientIp(new Headers({ "x-real-ip": "9.9.9.9" }))).toBe("9.9.9.9");
    expect(clientIp(new Headers({ "x-forwarded-for": " 8.8.8.8 ,1.1.1.1" }))).toBe("8.8.8.8");
    const app = appWith(rateLimit({ max: 1, enabled: true }));
    await post(app);
    expect((await post(app)).status).toBe(429);
  });

  it("RATE_LIMIT_DISABLED=1 lo desactiva por defecto", async () => {
    process.env.RATE_LIMIT_DISABLED = "1";
    const app = appWith(rateLimit({ max: 1 }));
    await post(app, "4.4.4.4");
    expect((await post(app, "4.4.4.4")).status).toBe(200);
  });
});
