import { describe, expect, it } from "vitest";
import { mergeSiteContent } from "./site-config.js";
import { SITE_CONTENT_DEFAULTS } from "../lib/site-config-defaults.js";

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

describe("mergeSiteContent (v3: legal, contactPage, youtube)", () => {
  it("tolera JSON antiguo sin legal/contactPage ni campos nuevos de youtube", () => {
    const legacy = JSON.parse(JSON.stringify(SITE_CONTENT_DEFAULTS)) as Record<string, unknown>;
    delete legacy["legal"];
    delete legacy["contactPage"];
    const yt = legacy["youtube"] as Record<string, unknown>;
    delete yt["homeLimit"];
    delete yt["allChannelsLabel"];
    delete yt["pageTitle"];
    delete yt["pageDescription"];
    (legacy["brand"] as Record<string, unknown>)["logoText"] = "LEGACY";

    const out = mergeSiteContent(SITE_CONTENT_DEFAULTS, legacy);
    expect(out.brand.logoText).toBe("LEGACY");
    expect(out.legal).toEqual(SITE_CONTENT_DEFAULTS.legal);
    expect(out.contactPage).toEqual(SITE_CONTENT_DEFAULTS.contactPage);
    expect(out.youtube.homeLimit).toBe(6);
    expect(out.youtube.allChannelsLabel).toBe("Ver todos los canales");
    expect(out.youtube.channels).toEqual(SITE_CONTENT_DEFAULTS.youtube.channels);
  });

  it("fusiona legal parcial y conserva subjects por defecto si vienen vacíos", () => {
    const out = mergeSiteContent(SITE_CONTENT_DEFAULTS, {
      legal: { legalName: "Jeison Pérez", nit: "123456789-0", depositPercent: 50 },
      contactPage: { pageTitle: "Hablemos", subjects: [] },
    });
    expect(out.legal.legalName).toBe("Jeison Pérez");
    expect(out.legal.nit).toBe("123456789-0");
    expect(out.legal.depositPercent).toBe(50);
    expect(out.legal.businessName).toBe("Sodimusic Company");
    expect(out.contactPage.pageTitle).toBe("Hablemos");
    expect(out.contactPage.subjects.length).toBe(5);
  });

  it("rechaza depositPercent fuera de 0–100 y conserva base", () => {
    const out = mergeSiteContent(SITE_CONTENT_DEFAULTS, { legal: { depositPercent: 150 } });
    expect(out.legal.depositPercent).toBe(30);
  });

  it("acepta priceFromCOP/priceNote en servicios y redes extra en miembros", () => {
    const out = mergeSiteContent(SITE_CONTENT_DEFAULTS, {
      booking: {
        services: [{ type: "MIX_MASTER", icon: "x", title: "Mezcla", desc: "d", priceFromCOP: 150000, priceNote: "por canción" }],
      },
      artists: {
        members: [{ name: "J Col", genre: "Trap", bio: "b", spotifyUrl: "https://open.spotify.com/x", tiktokUrl: "https://tiktok.com/@x", role: "MC" }],
      },
    });
    expect(out.booking.services[0]?.priceFromCOP).toBe(150000);
    expect(out.booking.services[0]?.priceNote).toBe("por canción");
    expect(out.artists.members[0]?.role).toBe("MC");
    expect(out.artists.members[0]?.spotifyUrl).toBe("https://open.spotify.com/x");
  });
});
