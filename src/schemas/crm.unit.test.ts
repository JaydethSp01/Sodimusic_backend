import { describe, expect, it } from "vitest";
import { newsletterSubscribeSchema, newsletterUnsubscribeSchema } from "./newsletter.js";
import { contactMessageSchema, contactStatusSchema } from "./contact.js";
import { beatInterestSchema } from "./beat-interest.js";
import { bookingFullSchema } from "./booking.js";
import { POLICY_NOT_ACCEPTED_MESSAGE, hasAcceptedPolicy } from "./consent.js";

describe("hasAcceptedPolicy", () => {
  it("solo acepta policyAccepted === true", () => {
    expect(hasAcceptedPolicy({ policyAccepted: true })).toBe(true);
    expect(hasAcceptedPolicy({ policyAccepted: "true" })).toBe(false);
    expect(hasAcceptedPolicy({ policyAccepted: false })).toBe(false);
    expect(hasAcceptedPolicy({})).toBe(false);
    expect(hasAcceptedPolicy(null)).toBe(false);
  });
});

describe("newsletterSubscribeSchema", () => {
  it("normaliza email, aplica source por defecto y exige policyAccepted", () => {
    const r = newsletterSubscribeSchema.safeParse({ email: "  Fan@Example.COM ", policyAccepted: true, policyVersion: "2026-10-17" });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.email).toBe("fan@example.com");
    expect(r.data.source).toBe("footer");
    expect(r.data.name).toBeUndefined();

    const bad = newsletterSubscribeSchema.safeParse({ email: "fan@example.com", policyAccepted: false });
    expect(bad.success).toBe(false);
    if (bad.success) return;
    expect(bad.error.issues.some((i) => i.message === POLICY_NOT_ACCEPTED_MESSAGE)).toBe(true);
  });

  it("rechaza email inválido y acepta policyVersion opcional", () => {
    expect(newsletterSubscribeSchema.safeParse({ email: "no", policyAccepted: true }).success).toBe(false);
    expect(newsletterSubscribeSchema.safeParse({ email: "a@b.co", policyAccepted: true }).success).toBe(true);
    const unsub = newsletterUnsubscribeSchema.safeParse({ email: "A@B.co", token: " abc123 " });
    expect(unsub.success).toBe(true);
    expect(unsub.data?.email).toBe("a@b.co");
    expect(unsub.data?.token).toBe("abc123");
    expect(newsletterUnsubscribeSchema.safeParse({ email: "a@b.co" }).success).toBe(false);
    expect(newsletterUnsubscribeSchema.safeParse({ email: "a@b.co", token: "" }).success).toBe(false);
  });
});

describe("contactMessageSchema", () => {
  const base = {
    subject: "PRENSA",
    name: "Ana",
    email: "ana@example.com",
    message: "Quiero una entrevista para un medio local.",
    policyAccepted: true,
    policyVersion: "2026-10-17",
  };

  it("acepta un mensaje válido y limpia el teléfono", () => {
    const r = contactMessageSchema.safeParse({ ...base, phone: "+57 321 536 8590" });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.phone).toBe("+573215368590");
    const noPhone = contactMessageSchema.safeParse({ ...base, phone: "" });
    expect(noPhone.success).toBe(true);
    expect(noPhone.data?.phone).toBeUndefined();
  });

  it("acepta cualquier asunto editable en el admin (1..40 caracteres, recortado)", () => {
    const r = contactMessageSchema.safeParse({ ...base, subject: "  Sincronización para serie  " });
    expect(r.success).toBe(true);
    expect(r.data?.subject).toBe("Sincronización para serie");
    expect(contactMessageSchema.safeParse({ ...base, subject: "SPAM" }).success).toBe(true);
    expect(contactMessageSchema.safeParse({ ...base, subject: "" }).success).toBe(false);
    expect(contactMessageSchema.safeParse({ ...base, subject: "   " }).success).toBe(false);
    expect(contactMessageSchema.safeParse({ ...base, subject: "a".repeat(41) }).success).toBe(false);
    expect(contactMessageSchema.safeParse({ ...base, subject: 7 }).success).toBe(false);
  });

  it("rechaza mensaje corto y sin aceptar política", () => {
    expect(contactMessageSchema.safeParse({ ...base, message: "hola" }).success).toBe(false);
    expect(contactMessageSchema.safeParse({ ...base, policyAccepted: false }).success).toBe(false);
  });

  it("contactStatusSchema solo admite NEW | READ | ARCHIVED", () => {
    expect(contactStatusSchema.safeParse({ status: "READ" }).success).toBe(true);
    expect(contactStatusSchema.safeParse({ status: "DONE" }).success).toBe(false);
  });
});

describe("beatInterestSchema", () => {
  const base = {
    beatId: "abc",
    artistName: "Young Cali",
    email: "YC@example.com",
    phone: "+57 321 536 8590",
    exclusiveIntent: false,
    policyAccepted: true,
    policyVersion: "2026-10-17",
  };

  it("acepta licenseType y marketingOptIn opcionales", () => {
    const r = beatInterestSchema.safeParse({ ...base, licenseType: "WAV", marketingOptIn: true });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.licenseType).toBe("WAV");
    expect(r.data.marketingOptIn).toBe(true);
    expect(r.data.email).toBe("yc@example.com");
  });

  it("normaliza el teléfono quitando espacios, guiones y paréntesis", () => {
    const r = beatInterestSchema.safeParse({ ...base, phone: "+57 (321) 536-8590" });
    expect(r.success).toBe(true);
    expect(r.data?.phone).toBe("+573215368590");
    expect(beatInterestSchema.safeParse({ ...base, phone: "(300) 000-0000" }).data?.phone).toBe("3000000000");
    expect(beatInterestSchema.safeParse({ ...base, phone: "+1 (415) 555-01" }).success).toBe(false);
    expect(beatInterestSchema.safeParse({ ...base, phone: "321-ABC-5368" }).success).toBe(false);
    expect(beatInterestSchema.safeParse({ ...base, phone: "" }).success).toBe(false);
  });

  it("rechaza licencia desconocida y falta de consentimiento", () => {
    expect(beatInterestSchema.safeParse({ ...base, licenseType: "FLAC" }).success).toBe(false);
    expect(beatInterestSchema.safeParse({ ...base, policyAccepted: undefined }).success).toBe(false);
  });
});

describe("bookingFullSchema (consentimiento v3)", () => {
  const base = {
    serviceTypes: ["VOCAL_RECORDING"],
    artisticName: "Young Cali",
    fullName: "Carlos Pérez",
    genres: ["Trap"],
    musicReference: "https://open.spotify.com/track/4iV5W9uYEdYUVa79Axb7Rh",
    isFirstTime: true,
    scheduledDate: "2026-11-10",
    timeSlot: "morning",
    phone: "+57 321 536 8590",
    email: "yc@example.com",
    policyAccepted: true,
    policyVersion: "2026-10-17",
  };

  it("acepta isAdult=false (menor) y marketingOptIn", () => {
    const r = bookingFullSchema.safeParse({ ...base, isAdult: false, marketingOptIn: true });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.isAdult).toBe(false);
    expect(r.data.marketingOptIn).toBe(true);
  });

  it("rechaza sin policyAccepted aunque venga acceptPolicy (legado)", () => {
    const r = bookingFullSchema.safeParse({ ...base, policyAccepted: undefined, acceptPolicy: true });
    expect(r.success).toBe(false);
  });
});
