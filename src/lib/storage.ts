import { randomUUID } from "crypto";
import { readFile } from "fs/promises";
import { extname, join } from "path";
import { put } from "@vercel/blob";
import { prisma } from "./prisma.js";
import { UPLOAD_DIR } from "./uploads-dir.js";

/**
 * Almacenamiento durable de archivos subidos desde el admin.
 *
 * - Con `BLOB_READ_WRITE_TOKEN` (store Vercel Blob): se sube al blob público y se devuelve la URL absoluta.
 * - Sin token: se guarda en la tabla `MediaAsset` (Postgres) y se sirve desde `GET /uploads/:name`.
 *
 * El disco de una función serverless es efímero, así que nunca se escribe en él.
 */

export type PutMediaInput = { buffer: Buffer; mime: string; ext: string };

export function hasBlobStore(): boolean {
  return typeof process.env.BLOB_READ_WRITE_TOKEN === "string" && process.env.BLOB_READ_WRITE_TOKEN.length > 0;
}

export async function putMedia(input: PutMediaInput): Promise<{ url: string }> {
  const ext = input.ext.startsWith(".") ? input.ext : `.${input.ext}`;
  const id = `${randomUUID()}${ext}`;

  if (hasBlobStore()) {
    const blob = await put(`uploads/${id}`, input.buffer, {
      access: "public",
      contentType: input.mime,
      addRandomSuffix: false,
    });
    return { url: blob.url };
  }

  await prisma.mediaAsset.create({
    data: { id, mime: input.mime, size: input.buffer.byteLength, data: input.buffer },
  });
  return { url: `/uploads/${id}` };
}

const DISK_MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
};

/**
 * Recupera un archivo por nombre: primero en `MediaAsset`; si no está, intenta leerlo de
 * `UPLOAD_DIR` (solo útil en desarrollo local con archivos antiguos).
 */
export async function getMedia(name: string): Promise<{ data: Buffer; mime: string } | null> {
  const row = await prisma.mediaAsset.findUnique({ where: { id: name } });
  if (row) {
    return { data: Buffer.from(row.data), mime: row.mime };
  }
  try {
    const data = await readFile(join(UPLOAD_DIR, name));
    const mime = DISK_MIME[extname(name).toLowerCase()] ?? "application/octet-stream";
    return { data, mime };
  } catch {
    return null;
  }
}
