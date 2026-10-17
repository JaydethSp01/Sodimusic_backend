import { z } from "zod";
import { policyAcceptedField, policyVersionField } from "./consent.js";

/** Asuntos por defecto (solo referencia/etiquetas de correo); el admin puede definir otros. */
export const CONTACT_SUBJECTS = ["PRENSA", "DEMO", "BOOKING_ARTISTA", "COLABORACION", "OTRO"] as const;
export type ContactSubject = (typeof CONTACT_SUBJECTS)[number];

export const CONTACT_STATUSES = ["NEW", "READ", "ARCHIVED"] as const;
export type ContactStatus = (typeof CONTACT_STATUSES)[number];

const phoneField = z
  .string()
  .trim()
  .max(32)
  .regex(/^\+?[\d\s\-()]*$/, "Formato de teléfono inválido")
  .optional()
  .transform((v) => {
    const clean = v?.replace(/\s/g, "");
    return clean && clean.length > 0 ? clean : undefined;
  });

export const contactMessageSchema = z.object({
  /** Asunto libre: los asuntos se editan en el admin (contactPage.subjects), no son un enum fijo. */
  subject: z.string({ error: "Elige un asunto" }).trim().min(1, "Elige un asunto").max(40, "Asunto demasiado largo"),
  name: z.string().trim().min(2, "Nombre obligatorio").max(120),
  email: z.string().trim().toLowerCase().email("Email inválido").max(254),
  phone: phoneField,
  message: z.string().trim().min(10, "Cuéntanos un poco más (mínimo 10 caracteres)").max(3000),
  policyAccepted: policyAcceptedField,
  policyVersion: policyVersionField,
});

export const contactStatusSchema = z.object({
  status: z.enum(CONTACT_STATUSES, { error: "Estado inválido" }),
});

export type ContactMessageInput = z.infer<typeof contactMessageSchema>;
