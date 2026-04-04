import { describe, expect, it } from "vitest";
import { createApp } from "./hono-app";

describe("Hono — health", () => {
  it("GET /health responde ok sin tocar BD", async () => {
    const app = createApp();
    const res = await app.request("http://localhost/health");
    expect(res.status).toBe(200);
    const j = (await res.json()) as { ok?: boolean };
    expect(j.ok).toBe(true);
  });
});
