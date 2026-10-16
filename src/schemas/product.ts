import { z } from "zod";

export const PRODUCT_STATUSES = ["ACTIVE", "DRAFT", "SOLD_OUT"] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

/** Misma regla que `optionalMediaUrl`, pero para elementos (no nulos) de un array. */
const mediaUrlItem = z
  .string()
  .trim()
  .min(1)
  .refine(
    (v) => v.startsWith("http://") || v.startsWith("https://") || v.startsWith("/uploads/"),
    "Cada imagen debe ser una URL o una ruta que empiece por /uploads/",
  );

const imagesField = z.array(mediaUrlItem).max(8, "Máximo 8 imágenes");

const sizesField = z
  .array(z.string())
  .max(12, "Máximo 12 tallas")
  .transform((arr) => arr.map((s) => s.trim()).filter((s) => s.length > 0));

const slugField = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug inválido (usa minúsculas, números y guiones)");

/** Texto opcional: "" o null → null. */
const nullishText = z
  .string()
  .nullish()
  .transform((v) => (v == null || v.trim() === "" ? null : v));

/** Igual que `nullishText` pero conserva `undefined` (campo no enviado en un PATCH). */
const patchText = z
  .string()
  .nullish()
  .transform((v) => (v === undefined ? undefined : v === null || v.trim() === "" ? null : v));

export const productCreateSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio"),
  slug: slugField.optional(),
  description: nullishText,
  priceCOP: z.number().int().min(0),
  compareAtCOP: z.number().int().min(0).nullish(),
  category: z.string().trim().min(1).default("Merch"),
  images: imagesField.default([]),
  sizes: sizesField.default([]),
  stock: z.number().int().min(0).nullish(),
  status: z.enum(PRODUCT_STATUSES).default("ACTIVE"),
  featured: z.boolean().default(false),
  sortOrder: z.number().int().default(0),
});

export const productUpdateSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio").optional(),
  slug: slugField.optional(),
  description: patchText,
  priceCOP: z.number().int().min(0).optional(),
  compareAtCOP: z.number().int().min(0).nullish(),
  category: z.string().trim().min(1).optional(),
  images: imagesField.optional(),
  sizes: sizesField.optional(),
  stock: z.number().int().min(0).nullish(),
  status: z.enum(PRODUCT_STATUSES).optional(),
  featured: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export type ProductCreateInput = z.infer<typeof productCreateSchema>;
export type ProductUpdateInput = z.infer<typeof productUpdateSchema>;
