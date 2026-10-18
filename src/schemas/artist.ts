import { z } from "zod";
import { optionalMediaUrl } from "./media-url.js";

export const ARTIST_STATUSES = ["ACTIVE", "HIDDEN"] as const;
export type ArtistStatus = (typeof ARTIST_STATUSES)[number];

/** Roles sugeridos (el campo es texto libre). */
export const ARTIST_ROLES = ["Productor principal", "Artista", "Crew", "Aliado"] as const;

/** Slug kebab-case: minúsculas, números y guiones simples. */
export const ARTIST_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const nameField = z.string().trim().min(2, "El nombre debe tener al menos 2 caracteres").max(80, "Nombre demasiado largo");

const slugField = z
  .string()
  .trim()
  .toLowerCase()
  .min(2, "Slug demasiado corto")
  .max(80, "Slug demasiado largo")
  .regex(ARTIST_SLUG_RE, "Slug inválido (usa minúsculas, números y guiones)");

const roleField = z.string().trim().min(1, "El rol es obligatorio").max(40);

/** Texto opcional: "" o null → null. */
const nullishText = (max: number) =>
  z
    .string()
    .max(max, `Máximo ${max} caracteres`)
    .nullish()
    .transform((v) => (v == null || v.trim() === "" ? null : v.trim()));

/** Igual que `nullishText` pero conserva `undefined` (campo no enviado en un PATCH). */
const patchText = (max: number) =>
  z
    .string()
    .max(max, `Máximo ${max} caracteres`)
    .nullish()
    .transform((v) => (v === undefined ? undefined : v === null || v.trim() === "" ? null : v.trim()));

/** URL http(s) opcional: "" o null → null; conserva undefined en PATCH. */
const optionalHttpUrl = z
  .string()
  .trim()
  .nullish()
  .transform((v) => (v === undefined ? undefined : v === null || v === "" ? null : v))
  .refine((v) => v == null || /^https?:\/\/[^\s]+$/i.test(v), "Debe ser una URL http(s) válida")
  .refine(
    (v) => {
      if (v == null) return true;
      try {
        new URL(v);
        return true;
      } catch {
        return false;
      }
    },
    "Debe ser una URL válida",
  );

const youtubeChannelIdField = z
  .string()
  .trim()
  .nullish()
  .transform((v) => (v === undefined ? undefined : v === null || v === "" ? null : v))
  .refine((v) => v == null || /^UC[A-Za-z0-9_-]{22}$/.test(v), "youtubeChannelId inválido (formato UC…)");

/** Lista de textos cortos sin vacíos ni repetidos. */
const textList = (max: number, itemMax: number) =>
  z
    .array(z.string().trim().max(itemMax))
    .max(max)
    .transform((arr) => {
      const out: string[] = [];
      const seen = new Set<string>();
      for (const s of arr) {
        const key = s.toLowerCase();
        if (s.length === 0 || seen.has(key)) continue;
        seen.add(key);
        out.push(s);
      }
      return out;
    });

const linkFields = {
  spotifyUrl: optionalHttpUrl,
  instagramUrl: optionalHttpUrl,
  youtubeUrl: optionalHttpUrl,
  tiktokUrl: optionalHttpUrl,
  facebookUrl: optionalHttpUrl,
  appleUrl: optionalHttpUrl,
};

export const artistCreateSchema = z.object({
  name: nameField,
  /** Si falta, se genera a partir del nombre. */
  slug: slugField.optional().or(z.literal("").transform(() => undefined)),
  role: roleField.default("Artista"),
  shortBio: nullishText(400),
  bio: nullishText(8000),
  photoUrl: optionalMediaUrl,
  coverUrl: optionalMediaUrl,
  city: nullishText(80),
  genres: textList(20, 40).default([]),
  ...linkFields,
  youtubeChannelId: youtubeChannelIdField,
  aliases: textList(20, 80).default([]),
  featured: z.boolean().default(false),
  status: z.enum(ARTIST_STATUSES).default("ACTIVE"),
  sortOrder: z.number().int().default(0),
});

export const artistUpdateSchema = z.object({
  name: nameField.optional(),
  slug: slugField.optional(),
  role: roleField.optional(),
  shortBio: patchText(400),
  bio: patchText(8000),
  photoUrl: optionalMediaUrl,
  coverUrl: optionalMediaUrl,
  city: patchText(80),
  genres: textList(20, 40).optional(),
  ...linkFields,
  youtubeChannelId: youtubeChannelIdField,
  aliases: textList(20, 80).optional(),
  featured: z.boolean().optional(),
  status: z.enum(ARTIST_STATUSES).optional(),
  sortOrder: z.number().int().optional(),
});

export const artistReorderSchema = z.object({
  ids: z.array(z.string().min(1)).min(1, "ids requerido").max(500),
});

export type ArtistCreateInput = z.infer<typeof artistCreateSchema>;
export type ArtistUpdateInput = z.infer<typeof artistUpdateSchema>;
