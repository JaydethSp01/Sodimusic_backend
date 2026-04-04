import { z } from "zod";

export const musicReferenceSchema = z
  .string()
  .min(1, "Ingresa una referencia musical")
  .url("Debe ser una URL válida")
  .refine(
    (url) => {
      const u = url.toLowerCase();
      return u.includes("spotify.com") || u.includes("youtu") || u.includes("soundcloud.com");
    },
    { message: "Usa un enlace de Spotify, YouTube o SoundCloud" },
  );

export const bookingFullSchema = z.object({
  serviceTypes: z
    .array(
      z.enum([
        "VOCAL_RECORDING",
        "BEAT_PRODUCTION",
        "COPRODUCTION",
        "MIX_MASTER",
        "AUDIOVISUAL_PRODUCTION",
        "CONSULTING",
      ]),
    )
    .min(1, "Selecciona al menos un servicio"),
  artisticName: z.string().min(1, "Nombre artístico obligatorio"),
  fullName: z.string().min(2, "Nombre completo obligatorio"),
  genres: z.array(z.string()).min(1),
  musicReference: musicReferenceSchema,
  vision: z.string().max(500).optional().nullable(),
  isFirstTime: z.boolean(),
  scheduledDate: z.coerce.date(),
  timeSlot: z.enum(["morning", "afternoon", "night"]),
  phone: z
    .string()
    .min(8)
    .regex(/^\+?[\d\s\-()]+$/, "Formato de teléfono inválido"),
  email: z.string().email("Email inválido"),
  instagram: z.string().optional(),
  acceptPolicy: z.boolean().refine((v) => v === true, { message: "Debes aceptar la política" }),
});

export type BookingFullInput = z.infer<typeof bookingFullSchema>;
