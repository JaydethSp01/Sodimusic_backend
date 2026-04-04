export const SITE_NAME = "Sodimusic Company";

export const SITE_URL = process.env.SITE_URL?.replace(/\/$/, "") ?? "http://localhost:3000";

export const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "Jeivymusicdinero@gmail.com";

export const WHATSAPP_URL = `https://wa.me/${process.env.NEXT_PUBLIC_WHATSAPP ?? "573215368590"}`;

export const SERVICE_TYPE_LABELS: Record<string, string> = {
  VOCAL_RECORDING: "Grabación vocal",
  BEAT_PRODUCTION: "Beat personalizado",
  COPRODUCTION: "Coproducción",
  MIX_MASTER: "Mezcla y masterización",
  CONSULTING: "Consultoría artística",
};

export const TIME_SLOT_LABELS: Record<string, string> = {
  morning: "Mañana (9am – 12pm)",
  afternoon: "Tarde (2pm – 6pm)",
  night: "Noche (7pm – 10pm)",
};
