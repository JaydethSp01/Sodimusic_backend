import { mkdirSync } from "fs";
import { join } from "path";

export const UPLOAD_DIR = join(process.cwd(), "uploads");

export function ensureUploadDir(): void {
  mkdirSync(UPLOAD_DIR, { recursive: true });
}
