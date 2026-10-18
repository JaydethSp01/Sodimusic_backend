import { z } from "zod";
import { optionalMediaUrl } from "./media-url.js";
import { SOCIAL_POST_KINDS, SOCIAL_POST_STATUSES, SOCIAL_SOURCE_KINDS } from "../lib/social/types.js";

export { SOCIAL_POST_KINDS, SOCIAL_POST_STATUSES, SOCIAL_SOURCE_KINDS };

const httpUrl = z
  .string()
  .trim()
  .min(1, "La URL es obligatoria")
  .url("Debe ser una URL válida")
  .refine((u) => /^https?:\/\//i.test(u), "Debe ser una URL http(s)");

/** Texto opcional: "" o null → null. */
const nullishText = (max: number) =>
  z
    .string()
    .max(max)
    .nullish()
    .transform((v) => (v == null || v.trim() === "" ? null : v.trim()));

/** Igual que `nullishText` pero conserva `undefined` (campo no enviado en un PATCH). */
const patchText = (max: number) =>
  z
    .string()
    .max(max)
    .nullish()
    .transform((v) => (v === undefined ? undefined : v === null || v.trim() === "" ? null : v.trim()));

/** Fecha ISO opcional: "" o null → null; inválida → error. */
const optionalDate = z
  .string()
  .nullish()
  .transform((v, ctx) => {
    if (v == null || v.trim() === "") return null;
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) {
      ctx.addIssue({ code: "custom", message: "Fecha inválida" });
      return z.NEVER;
    }
    return d;
  });

export const socialSourceCreateSchema = z
  .object({
    kind: z.enum(SOCIAL_SOURCE_KINDS, { message: "Tipo de fuente inválido" }),
    label: nullishText(120),
    externalId: nullishText(200),
    url: httpUrl.nullish().or(z.literal("").transform(() => null)),
  })
  .superRefine((d, ctx) => {
    if (d.kind === "YOUTUBE_CHANNEL" && !d.url && !d.externalId) {
      ctx.addIssue({ code: "custom", path: ["url"], message: "Indica la URL del canal de YouTube" });
    }
    if (d.kind === "YOUTUBE_CHANNEL" && d.url && !/^https?:\/\/(www\.|m\.)?youtube\.com\//i.test(d.url)) {
      ctx.addIssue({ code: "custom", path: ["url"], message: "Debe ser una URL de YouTube" });
    }
    if (d.kind === "FACEBOOK_PAGE" && !d.externalId && !d.url) {
      ctx.addIssue({ code: "custom", path: ["externalId"], message: "Indica el id o username de la página de Facebook" });
    }
    if (d.kind === "YOUTUBE_SEARCH" && !d.externalId) {
      ctx.addIssue({ code: "custom", path: ["externalId"], message: "Indica el texto de búsqueda" });
    }
  });

export const socialSourceUpdateSchema = z.object({
  label: z.string().trim().min(1, "La etiqueta es obligatoria").max(120).optional(),
  enabled: z.boolean().optional(),
});

export const socialPostCreateSchema = z.object({
  url: httpUrl,
  title: nullishText(300),
  text: nullishText(4000),
  imageUrl: optionalMediaUrl,
  publishedAt: optionalDate,
  author: nullishText(120),
});

export const socialPostUpdateSchema = z.object({
  status: z.enum(SOCIAL_POST_STATUSES).optional(),
  pinned: z.boolean().optional(),
  title: z.string().trim().min(1, "El título es obligatorio").max(300).optional(),
  text: patchText(4000),
  imageUrl: optionalMediaUrl,
});

export const socialPostsQuerySchema = z.object({
  status: z.enum(["VISIBLE", "HIDDEN", "ALL"]).default("VISIBLE"),
});

export const socialFeedKindSchema = z.enum(SOCIAL_POST_KINDS);

export type SocialSourceCreateInput = z.infer<typeof socialSourceCreateSchema>;
export type SocialSourceUpdateInput = z.infer<typeof socialSourceUpdateSchema>;
export type SocialPostCreateInput = z.infer<typeof socialPostCreateSchema>;
export type SocialPostUpdateInput = z.infer<typeof socialPostUpdateSchema>;

/** Username/id de página a partir de `https://www.facebook.com/<page>` (o el texto tal cual). */
export function facebookPageFromUrl(urlOrId: string): string | null {
  const t = urlOrId.trim();
  if (!/^https?:\/\//i.test(t)) {
    const id = t.replace(/^@/, "");
    return /^[A-Za-z0-9._-]{1,100}$/.test(id) ? id : null;
  }
  try {
    const u = new URL(t);
    const host = u.hostname.toLowerCase().replace(/^(www|m|mbasic|web)\./, "");
    if (host !== "facebook.com" && host !== "fb.com") return null;
    const parts = u.pathname.split("/").filter(Boolean);
    const first = parts[0];
    if (first === "profile.php") {
      const id = u.searchParams.get("id");
      return id && /^\d+$/.test(id) ? id : null;
    }
    if (first === "people" && parts[2]) return /^\d+$/.test(parts[2]) ? parts[2] : null;
    return first && /^[A-Za-z0-9._-]{1,100}$/.test(first) ? first : null;
  } catch {
    return null;
  }
}
