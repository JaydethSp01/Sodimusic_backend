import { z } from "zod";
import { policyAcceptedField, policyVersionField } from "./consent.js";

const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .email("Email inválido")
  .max(254);

export const newsletterSubscribeSchema = z.object({
  email: emailField,
  name: z
    .string()
    .trim()
    .max(120)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
  source: z.string().trim().min(1).max(40).default("footer"),
  policyAccepted: policyAcceptedField,
  policyVersion: policyVersionField,
});

/** Baja: exige el token HMAC del enlace del correo (ver lib/newsletter-token.ts). */
export const newsletterUnsubscribeSchema = z.object({
  email: emailField,
  token: z.string({ error: "Token requerido" }).trim().min(1, "Token requerido").max(64),
});

export type NewsletterSubscribeInput = z.infer<typeof newsletterSubscribeSchema>;
