import { z } from "zod";

export const POLICY_NOT_ACCEPTED_MESSAGE =
  "Debes autorizar el tratamiento de tus datos personales según la Política de privacidad.";

/** `policyAccepted` debe ser exactamente `true`. */
export const policyAcceptedField = z.boolean({ error: POLICY_NOT_ACCEPTED_MESSAGE }).refine((v) => v === true, {
  message: POLICY_NOT_ACCEPTED_MESSAGE,
});

/** Versión de la política aceptada (p. ej. "2026-10-17"). Si falta, el servidor usa la publicada. */
export const policyVersionField = z.string().trim().min(1).max(40).optional();

/** true solo si el body trae `policyAccepted === true` (chequeo previo a la validación completa). */
export function hasAcceptedPolicy(raw: unknown): boolean {
  return (
    typeof raw === "object" &&
    raw !== null &&
    (raw as { policyAccepted?: unknown }).policyAccepted === true
  );
}
