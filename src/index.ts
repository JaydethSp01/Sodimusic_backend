import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { createApp } from "./hono-app.js";

const app = createApp();
export default app;
export { Hono };

if (process.env.VERCEL !== "1") {
  const port = Number(process.env.PORT ?? "4000");
  serve({ fetch: app.fetch, port }, (info) => {
    console.log(`Sodimusic API en http://localhost:${info.port}`);
  });
}
