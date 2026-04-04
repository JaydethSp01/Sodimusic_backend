import { z } from "zod";

/** URL http(s) o ruta local servida por la API (`/uploads/...`). */
export const optionalMediaUrl = z
  .string()
  .nullish()
  .transform((v) => (v === "" ? null : v))
  .refine(
    (v) =>
      v == null ||
      v.startsWith("http://") ||
      v.startsWith("https://") ||
      v.startsWith("/uploads/"),
    "Debe ser una URL o una ruta que empiece por /uploads/",
  );
