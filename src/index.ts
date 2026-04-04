import { serve } from "@hono/node-server";
import { createApp } from "./hono-app";

const port = Number(process.env.PORT ?? "4000");
const app = createApp();

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Sodimusic API en http://localhost:${info.port}`);
});
