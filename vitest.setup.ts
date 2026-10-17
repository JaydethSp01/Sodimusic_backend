import { config } from "dotenv";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const root = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(root, ".env") });

/** JWT para firmar tokens en tests si no hay .env */
if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = "vitest-jwt-secret-minimum-32-characters!!";
}

/** Los tests de integración lanzan muchas peticiones desde la misma "IP"; el rate limit se prueba en su unit test. */
if (!process.env.RATE_LIMIT_DISABLED) {
  process.env.RATE_LIMIT_DISABLED = "1";
}
