import { z } from "zod";
import { optionalMediaUrl } from "./media-url.js";

export const CHANNEL_STATUSES = ["ACTIVE", "HIDDEN"] as const;
export type ChannelStatus = (typeof CHANNEL_STATUSES)[number];

/** Texto opcional: "" o null → null. */
const nullishText = z
  .string()
  .nullish()
  .transform((v) => (v == null || v.trim() === "" ? null : v.trim()));

/** Igual que `nullishText` pero conserva `undefined` (campo no enviado en un PATCH). */
const patchText = z
  .string()
  .nullish()
  .transform((v) => (v === undefined ? undefined : v === null || v.trim() === "" ? null : v.trim()));

const youtubeUrlField = z
  .string()
  .trim()
  .min(1, "La URL del canal es obligatoria")
  .url("Debe ser una URL válida")
  .refine((u) => /^https?:\/\/(www\.|m\.)?(youtube\.com|youtu\.be)\//i.test(u), "Debe ser una URL de YouTube");

const channelIdField = z
  .string()
  .trim()
  .regex(/^UC[A-Za-z0-9_-]{22}$/, "channelId inválido (formato UC…)");

const handleField = z
  .string()
  .trim()
  .transform((v) => v.replace(/^@/, ""))
  .pipe(z.string().min(1).max(64).regex(/^[A-Za-z0-9._-]+$/, "handle inválido"));

const featuredVideoField = z
  .string()
  .trim()
  .url("Debe ser una URL válida")
  .refine((u) => /youtube\.com|youtu\.be/i.test(u), "Debe ser una URL de YouTube");

export const channelCreateSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio").max(120),
  url: youtubeUrlField,
  channelId: channelIdField.nullish().or(z.literal("").transform(() => null)),
  handle: handleField.nullish().or(z.literal("").transform(() => null)),
  description: nullishText,
  avatarUrl: optionalMediaUrl,
  featuredVideoUrl: featuredVideoField.nullish().or(z.literal("").transform(() => null)),
  category: z.string().trim().min(1).max(40).default("Crew"),
  featured: z.boolean().default(false),
  status: z.enum(CHANNEL_STATUSES).default("ACTIVE"),
  sortOrder: z.number().int().default(0),
});

export const channelUpdateSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio").max(120).optional(),
  url: youtubeUrlField.optional(),
  channelId: channelIdField.nullish().or(z.literal("").transform(() => null)),
  handle: handleField.nullish().or(z.literal("").transform(() => null)),
  description: patchText,
  avatarUrl: optionalMediaUrl,
  featuredVideoUrl: featuredVideoField.nullish().or(z.literal("").transform(() => null)),
  category: z.string().trim().min(1).max(40).optional(),
  featured: z.boolean().optional(),
  status: z.enum(CHANNEL_STATUSES).optional(),
  sortOrder: z.number().int().optional(),
});

export const channelReorderSchema = z.object({
  ids: z.array(z.string().min(1)).min(1, "ids requerido").max(500),
});

export type ChannelCreateInput = z.infer<typeof channelCreateSchema>;
export type ChannelUpdateInput = z.infer<typeof channelUpdateSchema>;

/**
 * Extrae `channelId` (UC…) y/o `handle` (@x) de una URL pública de YouTube.
 * Soporta /channel/UC…, /@handle, /c/nombre y /user/nombre.
 */
export function parseYoutubeChannelUrl(url: string): { channelId: string | null; handle: string | null } {
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts.length === 0) {
      return { channelId: null, handle: null };
    }
    const first = parts[0] ?? "";
    if (first === "channel" && parts[1] && /^UC[A-Za-z0-9_-]{22}$/.test(parts[1])) {
      return { channelId: parts[1], handle: null };
    }
    if (first.startsWith("@") && first.length > 1) {
      return { channelId: null, handle: first.slice(1) };
    }
    if ((first === "c" || first === "user") && parts[1]) {
      return { channelId: null, handle: parts[1] };
    }
    return { channelId: null, handle: null };
  } catch {
    return { channelId: null, handle: null };
  }
}
