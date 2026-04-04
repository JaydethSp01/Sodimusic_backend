import { z } from "zod";

export const beatInterestSchema = z.object({
  beatId: z.string().min(1),
  artistName: z.string().min(1, "Nombre artístico obligatorio"),
  email: z.string().email("Email inválido"),
  phone: z
    .string()
    .min(10)
    .refine(
      (v) => /^\+?57\d{10}$|^\+?\d{10,15}$/.test(v.replace(/\s/g, "")),
      "Usa formato +57… u otro internacional válido",
    ),
  exclusiveIntent: z.boolean(),
  instagram: z.string().max(64).optional(),
  message: z.string().max(500).optional(),
});
