import { Resend } from "resend";
import { ADMIN_EMAIL, SERVICE_TYPE_LABELS, SITE_NAME, SITE_URL, WHATSAPP_URL } from "./constants.js";
import type { Result } from "../types/result.js";

const brandFooter = `
  <p style="margin:24px 0 0;font-size:12px;color:#5A5550;">
    ${SITE_NAME} · María La Baja, Bolívar · Est. 2016
  </p>
`;

function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    return null;
  }
  return new Resend(key);
}

async function sendOrLog(
  params: { to: string; subject: string; html: string },
): Promise<Result<{ id: string }, Error>> {
  const resend = getResend();
  if (!resend) {
    console.warn("[email] RESEND_API_KEY no configurada; correo no enviado:", params.subject);
    return { ok: true, data: { id: "skipped" } };
  }
  const { data, error } = await resend.emails.send({
    from: "Sodimusic <onboarding@resend.dev>",
    to: params.to,
    subject: params.subject,
    html: params.html,
  });
  if (error) {
    return { ok: false, error: new Error(error.message) };
  }
  if (!data?.id) {
    return { ok: false, error: new Error("Respuesta de Resend sin id") };
  }
  return { ok: true, data: { id: data.id } };
}

export async function sendSessionPendingToArtist(input: {
  artistEmail: string;
  artistName: string;
  serviceType: string;
  scheduledLabel: string;
  slotLabel: string;
}): Promise<Result<{ id: string }, Error>> {
  const service = SERVICE_TYPE_LABELS[input.serviceType] ?? input.serviceType;
  const html = `
    <div style="background:#080808;color:#F0EDE8;font-family:system-ui,sans-serif;padding:32px;max-width:560px;">
      <h1 style="color:#FF6B00;font-size:22px;">Tu sesión está siendo confirmada</h1>
      <p>Hola <strong>${escapeHtml(input.artistName)}</strong>,</p>
      <p>Recibimos tu solicitud para <strong>${escapeHtml(service)}</strong>.</p>
      <ul style="color:#A09890;">
        <li>Fecha: ${escapeHtml(input.scheduledLabel)}</li>
        <li>Horario: ${escapeHtml(input.slotLabel)}</li>
      </ul>
      <p>JeiVy revisará tu solicitud y te confirmará pronto. Ten lista tu referencia musical.</p>
      <a href="${WHATSAPP_URL}" style="display:inline-block;margin-top:16px;padding:12px 20px;background:#FF6B00;color:#fff;text-decoration:none;border-radius:4px;">¿Preguntas? WhatsApp</a>
      ${brandFooter}
    </div>
  `;
  return sendOrLog({
    to: input.artistEmail,
    subject: "Tu sesión en Sodimusic está siendo confirmada",
    html,
  });
}

export async function sendSessionAlertToAdmin(input: {
  artistName: string;
  fullName: string;
  artistEmail: string;
  artistPhone: string;
  artistInstagram?: string | null;
  serviceType: string;
  scheduledLabel: string;
  slotLabel: string;
  musicReference: string;
  vision?: string | null;
  genres: string;
}): Promise<Result<{ id: string }, Error>> {
  const service = SERVICE_TYPE_LABELS[input.serviceType] ?? input.serviceType;
  const visionBlock = input.vision
    ? `<p><strong>Visión:</strong> ${escapeHtml(input.vision)}</p>`
    : "";
  const html = `
    <div style="background:#080808;color:#F0EDE8;font-family:system-ui,sans-serif;padding:32px;max-width:640px;">
      <h1 style="color:#FF6B00;">Nueva sesión: ${escapeHtml(input.artistName)}</h1>
      <p><strong>Nombre completo:</strong> ${escapeHtml(input.fullName)}</p>
      <p><strong>Servicio:</strong> ${escapeHtml(service)}</p>
      <p><strong>Email:</strong> ${escapeHtml(input.artistEmail)}</p>
      <p><strong>Teléfono:</strong> ${escapeHtml(input.artistPhone)}</p>
      ${input.artistInstagram ? `<p><strong>Instagram:</strong> @${escapeHtml(input.artistInstagram)}</p>` : ""}
      <p><strong>Fecha:</strong> ${escapeHtml(input.scheduledLabel)} · <strong>Horario:</strong> ${escapeHtml(input.slotLabel)}</p>
      <p><strong>Géneros:</strong> ${escapeHtml(input.genres)}</p>
      <p><strong>Referencia:</strong> <a href="${escapeAttr(input.musicReference)}" style="color:#FF6B00;">${escapeHtml(input.musicReference)}</a></p>
      ${visionBlock}
      <p><a href="${SITE_URL}/admin/dashboard/sessions" style="color:#FF6B00;">Ver en el panel de admin</a></p>
      ${brandFooter}
    </div>
  `;
  return sendOrLog({
    to: ADMIN_EMAIL,
    subject: `Nueva sesión: ${input.artistName} quiere ${service}`,
    html,
  });
}

export async function sendSessionConfirmedToArtist(input: {
  artistEmail: string;
  artistName: string;
  serviceType: string;
  scheduledLabel: string;
  slotLabel: string;
}): Promise<Result<{ id: string }, Error>> {
  const service = SERVICE_TYPE_LABELS[input.serviceType] ?? input.serviceType;
  const html = `
    <div style="background:#080808;color:#F0EDE8;font-family:system-ui,sans-serif;padding:32px;max-width:560px;">
      <h1 style="color:#27AE60;">¡Sesión confirmada!</h1>
      <p>Hola <strong>${escapeHtml(input.artistName)}</strong>,</p>
      <p>Tu sesión de <strong>${escapeHtml(service)}</strong> quedó confirmada.</p>
      <ul style="color:#A09890;">
        <li>${escapeHtml(input.scheduledLabel)}</li>
        <li>${escapeHtml(input.slotLabel)}</li>
      </ul>
      <p>Puedes cancelar o reprogramar con al menos 24 horas de anticipación.</p>
      <a href="${WHATSAPP_URL}" style="display:inline-block;margin-top:16px;padding:12px 20px;background:#FF6B00;color:#fff;text-decoration:none;border-radius:4px;">Coordinar por WhatsApp</a>
      ${brandFooter}
    </div>
  `;
  return sendOrLog({
    to: input.artistEmail,
    subject: "¡Sesión confirmada! Te esperamos en Sodimusic",
    html,
  });
}

export async function sendBeatInterestEmails(input: {
  artistName: string;
  email: string;
  phone: string;
  instagram?: string;
  beatTitle: string;
  beatGenre: string;
  priceCOP: number;
  exclusiveIntent: boolean;
  message?: string;
}): Promise<Result<{ id: string }, Error>> {
  const tipo = input.exclusiveIntent ? "Compra exclusiva" : "Uso no exclusivo";
  const msg = input.message ? `<p><strong>Mensaje:</strong> ${escapeHtml(input.message)}</p>` : "";
  const toAdminHtml = `
    <div style="background:#080808;color:#F0EDE8;font-family:system-ui,sans-serif;padding:32px;max-width:640px;">
      <h1 style="color:#FF6B00;">Interés en beat: ${escapeHtml(input.beatTitle)}</h1>
      <p><strong>Artista:</strong> ${escapeHtml(input.artistName)}</p>
      <p><strong>Email:</strong> ${escapeHtml(input.email)}</p>
      <p><strong>WhatsApp:</strong> ${escapeHtml(input.phone)}</p>
      ${input.instagram ? `<p><strong>Instagram:</strong> ${escapeHtml(input.instagram)}</p>` : ""}
      <p><strong>Beat:</strong> ${escapeHtml(input.beatTitle)} · ${escapeHtml(input.beatGenre)} · $${input.priceCOP.toLocaleString("es-CO")} COP</p>
      <p><strong>Tipo:</strong> ${escapeHtml(tipo)}</p>
      ${msg}
      ${brandFooter}
    </div>
  `;
  const adminResult = await sendOrLog({
    to: ADMIN_EMAIL,
    subject: `Interés en beat: ${input.beatTitle} — ${input.artistName}`,
    html: toAdminHtml,
  });
  if (!adminResult.ok) {
    return adminResult;
  }
  const confirmHtml = `
    <div style="background:#080808;color:#F0EDE8;font-family:system-ui,sans-serif;padding:32px;max-width:560px;">
      <h1 style="color:#FF6B00;">Recibimos tu interés</h1>
      <p>Hola <strong>${escapeHtml(input.artistName)}</strong>,</p>
      <p>Te contactaremos pronto sobre el beat <strong>${escapeHtml(input.beatTitle)}</strong>.</p>
      ${brandFooter}
    </div>
  `;
  return sendOrLog({
    to: input.email,
    subject: `Interés registrado — ${input.beatTitle}`,
    html: confirmHtml,
  });
}

const CONTACT_SUBJECT_LABELS: Record<string, string> = {
  PRENSA: "Prensa y medios",
  DEMO: "Envío de demo",
  BOOKING_ARTISTA: "Booking de artista / show",
  COLABORACION: "Colaboración o alianza",
  OTRO: "Otro",
};

export async function sendContactMessageToAdmin(input: {
  subject: string;
  name: string;
  email: string;
  phone?: string | null;
  message: string;
}): Promise<Result<{ id: string }, Error>> {
  const subjectLabel = CONTACT_SUBJECT_LABELS[input.subject] ?? input.subject;
  const html = `
    <div style="background:#080808;color:#F0EDE8;font-family:system-ui,sans-serif;padding:32px;max-width:640px;">
      <h1 style="color:#FF6B00;">Contacto: ${escapeHtml(subjectLabel)}</h1>
      <p><strong>Nombre:</strong> ${escapeHtml(input.name)}</p>
      <p><strong>Email:</strong> ${escapeHtml(input.email)}</p>
      ${input.phone ? `<p><strong>Teléfono:</strong> ${escapeHtml(input.phone)}</p>` : ""}
      <p><strong>Mensaje:</strong></p>
      <p style="white-space:pre-wrap;color:#A09890;">${escapeHtml(input.message)}</p>
      <p><a href="${SITE_URL}/admin/dashboard/mensajes" style="color:#FF6B00;">Ver en el panel de admin</a></p>
      ${brandFooter}
    </div>
  `;
  return sendOrLog({
    to: ADMIN_EMAIL,
    subject: `Contacto (${subjectLabel}): ${input.name}`,
    html,
  });
}

/** Bienvenida al newsletter con enlace de baja (GET firmado con HMAC). */
export async function sendNewsletterWelcome(input: {
  email: string;
  name?: string | null;
  unsubscribeUrl: string;
}): Promise<Result<{ id: string }, Error>> {
  const greeting = input.name && input.name.trim().length > 0 ? `Hola <strong>${escapeHtml(input.name.trim())}</strong>,` : "Hola,";
  const html = `
    <div style="background:#080808;color:#F0EDE8;font-family:system-ui,sans-serif;padding:32px;max-width:560px;">
      <h1 style="color:#FF6B00;font-size:22px;">Bienvenido al newsletter de ${SITE_NAME}</h1>
      <p>${greeting}</p>
      <p>Te avisaremos de lanzamientos, beats nuevos y novedades del estudio. Sin spam.</p>
      <a href="${SITE_URL}/releases" style="display:inline-block;margin-top:16px;padding:12px 20px;background:#FF6B00;color:#fff;text-decoration:none;border-radius:4px;">Ver lanzamientos</a>
      <p style="margin:24px 0 0;font-size:12px;color:#A09890;">
        Si no te suscribiste o ya no quieres recibir correos, puedes
        <a href="${escapeAttr(input.unsubscribeUrl)}" style="color:#FF6B00;">darte de baja aquí</a>.
      </p>
      ${brandFooter}
    </div>
  `;
  return sendOrLog({
    to: input.email,
    subject: `Bienvenido al newsletter de ${SITE_NAME}`,
    html,
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/'/g, "&#39;");
}
