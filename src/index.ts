import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { createApp } from "./hono-app.js";
import { ensureShopSchema } from "./lib/ensure-schema.js";

const app = createApp();

// Tablas/columnas v3 y migración de canales del SiteConfig. No bloquea el arranque:
// las rutas vuelven a llamar a ensureShopSchema() (memoizado) antes de usar las tablas.
ensureShopSchema().catch((err: unknown) => {
  console.warn("[schema] no se pudo verificar el esquema en el arranque", err);
});
export default app;
export { Hono };

if (process.env.VERCEL !== "1") {
  const port = Number(process.env.PORT ?? "4000");
  serve({ fetch: app.fetch, port }, (info) => {
    console.log(`Sodimusic API en http://localhost:${info.port}`);
  });
}
