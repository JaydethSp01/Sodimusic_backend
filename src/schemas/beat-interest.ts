import { z } from "zod";
import { policyAcceptedField, policyVersionField } from "./consent.js";

export const BEAT_LICENSE_TYPES = ["MP3", "WAV", "STEMS", "EXCLUSIVE"] as const;
export type BeatLicenseType = (typeof BEAT_LICENSE_TYPES)[number];

export const beatInterestSchema = z.object({
  beatId: z.string().min(1),
  artistName: z.string().trim().min(1, "Nombre artístico obligatorio").max(120),
  email: z.string().trim().toLowerCase().email("Email inválido").max(254),
  /** Se normaliza quitando espacios, guiones y paréntesis (igual que el frontend) y se guarda así. */
  phone: z
    .string({ error: "Teléfono obligatorio" })
    .transform((v) => v.replace(/[\s\-()]/g, ""))
    .pipe(
      z
        .string()
        .min(10, "Usa formato +57… u otro internacional válido")
        .regex(/^\+?57\d{10}$|^\+?\d{10,15}$/, "Usa formato +57… u otro internacional válido"),
    ),
  exclusiveIntent: z.boolean(),
  licenseType: z.enum(BEAT_LICENSE_TYPES, { error: "Licencia inválida" }).optional(),
  instagram: z.string().max(64).optional(),
  message: z.string().max(500).optional(),
  policyAccepted: policyAcceptedField,
  policyVersion: policyVersionField,
  marketingOptIn: z.boolean().optional(),
});

export type BeatInterestInput = z.infer<typeof beatInterestSchema>;
