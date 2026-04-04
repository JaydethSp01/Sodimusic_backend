import { config } from "dotenv";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const root = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(root, ".env") });

/** JWT para firmar tokens en tests si no hay .env */
if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = "vitest-jwt-secret-minimum-32-characters!!";
}
