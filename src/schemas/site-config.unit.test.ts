import { describe, expect, it } from "vitest";
import { mergeSiteContent } from "./site-config";
import { SITE_CONTENT_DEFAULTS } from "../lib/site-config-defaults";

describe("mergeSiteContent", () => {
  it("devuelve base si patch vacío", () => {
    expect(mergeSiteContent(SITE_CONTENT_DEFAULTS, null)).toEqual(SITE_CONTENT_DEFAULTS);
    expect(mergeSiteContent(SITE_CONTENT_DEFAULTS, undefined)).toEqual(SITE_CONTENT_DEFAULTS);
  });

  it("fusiona brand y beatsPage", () => {
    const out = mergeSiteContent(SITE_CONTENT_DEFAULTS, {
      brand: { logoText: "TEST" },
      beatsPage: { metaTitle: "T", metaDescription: "D", heroTitle: "H", heroDescriptionTemplate: "{{count}} ok" },
    });
    expect(out.brand.logoText).toBe("TEST");
    expect(out.beatsPage.metaTitle).toBe("T");
    expect(out.beatsPage.heroDescriptionTemplate).toBe("{{count}} ok");
    expect(out.footer.copyright).toBe(SITE_CONTENT_DEFAULTS.footer.copyright);
  });

  it("rechaza merge inválido y conserva base", () => {
    const out = mergeSiteContent(SITE_CONTENT_DEFAULTS, {
      contact: { email: "no-es-email", whatsapp: "1" },
    });
    expect(out.contact.email).toBe(SITE_CONTENT_DEFAULTS.contact.email);
  });
});
