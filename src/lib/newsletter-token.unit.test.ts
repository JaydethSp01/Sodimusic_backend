import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { unsubscribeToken, unsubscribeUrl, verifyUnsubscribeToken } from "./newsletter-token.js";

const SECRET = "vitest-secret-for-newsletter-token-0123456789";

describe("unsubscribeToken", () => {
  it("es HMAC-SHA256(email, secret) en hex truncado a 32 y normaliza el email", () => {
    const expected = createHmac("sha256", SECRET).update("fan@example.com").digest("hex").slice(0, 32);
    expect(unsubscribeToken("fan@example.com", SECRET)).toBe(expected);
    expect(unsubscribeToken("  FAN@Example.com ", SECRET)).toBe(expected);
    expect(expected).toMatch(/^[0-9a-f]{32}$/);
  });

  it("cambia con el secreto y con el email", () => {
    expect(unsubscribeToken("fan@example.com", SECRET)).not.toBe(unsubscribeToken("fan@example.com", `${SECRET}x`));
    expect(unsubscribeToken("fan@example.com", SECRET)).not.toBe(unsubscribeToken("otro@example.com", SECRET));
  });

  it("lanza sin secreto", () => {
    expect(() => unsubscribeToken("fan@example.com", "")).toThrow();
  });
});

describe("verifyUnsubscribeToken", () => {
  it("acepta el token correcto (insensible a mayúsculas) y rechaza el resto", () => {
    const t = unsubscribeToken("fan@example.com", SECRET);
    expect(verifyUnsubscribeToken("fan@example.com", t, SECRET)).toBe(true);
    expect(verifyUnsubscribeToken("fan@example.com", t.toUpperCase(), SECRET)).toBe(true);
    expect(verifyUnsubscribeToken("fan@example.com", `${t}0`, SECRET)).toBe(false);
    expect(verifyUnsubscribeToken("fan@example.com", "", SECRET)).toBe(false);
    expect(verifyUnsubscribeToken("fan@example.com", undefined, SECRET)).toBe(false);
    expect(verifyUnsubscribeToken("otro@example.com", t, SECRET)).toBe(false);
    expect(verifyUnsubscribeToken("fan@example.com", t, "")).toBe(false);
  });
});

describe("unsubscribeUrl", () => {
  it("construye el enlace GET con email y token", () => {
    const url = unsubscribeUrl("https://api.example.com/", "Fan@Example.com", SECRET);
    const u = new URL(url);
    expect(u.origin + u.pathname).toBe("https://api.example.com/api/newsletter/unsubscribe");
    expect(u.searchParams.get("email")).toBe("fan@example.com");
    expect(u.searchParams.get("token")).toBe(unsubscribeToken("fan@example.com", SECRET));
  });
});
