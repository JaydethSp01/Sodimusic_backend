import { z } from "zod";

/** URL absoluta o ruta servida por la API (p. ej. /uploads/...) */
export const urlOrPath = z
  .string()
  .min(1)
  .refine(
    (s) =>
      s.startsWith("http://") ||
      s.startsWith("https://") ||
      (s.startsWith("/") && !s.startsWith("//")),
    "Debe ser una URL http(s) o una ruta que empiece por /",
  );

const navLink = z.object({
  href: z.string().min(1),
  label: z.string().min(1),
});

const milestone = z.object({
  year: z.string().min(1),
  title: z.string().min(1),
  desc: z.string().min(1),
});

const stat = z.object({
  value: z.number().int().min(0),
  suffix: z.string(),
  label: z.string().min(1),
});

const optionalUrlOrPath = z.string().optional();

const youtubeChannel = z.object({
  name: z.string().min(1),
  /** URL pública del canal (https://www.youtube.com/@handle o /channel/UC…) */
  url: urlOrPath,
  /** ID de canal (UC…). Permite incrustar los últimos videos sin API key. */
  channelId: z.string().optional(),
  description: z.string().optional(),
  avatarUrl: optionalUrlOrPath,
  /** Video destacado (URL de YouTube); si falta, se usa la lista de subidas del canal. */
  featuredVideoUrl: z.string().optional(),
});

export const siteContentSchema = z.object({
  brand: z.object({
    logoText: z.string().min(1),
    siteNameLine: z.string().optional(),
  }),
  hero: z.object({
    heroImageUrl: urlOrPath,
    eyebrow: z.string().min(1),
    title: z.string().min(1),
    tagline: z.string().min(1),
    primaryCta: z.string().min(1),
    secondaryCta: z.string().min(1),
    primaryHref: z.string().min(1),
    secondaryHref: z.string().min(1),
  }),
  home: z.object({
    aboutEyebrow: z.string().min(1),
    aboutTitle: z.string().min(1),
    aboutBody: z.string().min(1),
    /** Imagen del panel lateral «Quiénes somos» (URL o ruta /uploads/...) */
    aboutImageUrl: urlOrPath,
    aboutAsideCaption: z.string().min(1),
    genresEyebrow: z.string().min(1),
    genresTitle: z.string().min(1),
    storyEyebrow: z.string().min(1),
    storyTitle: z.string().min(1),
    portfolioEyebrow: z.string().min(1),
    portfolioTitle: z.string().min(1),
    portfolioCta: z.string().min(1),
    servicesEyebrow: z.string(),
    servicesTitle: z.string().min(1),
    servicesSubtitle: z.string().min(1),
    contactTitle: z.string().min(1),
    contactSubtitle: z.string().min(1),
    milestones: z.array(milestone).min(1),
    /** Cifras animadas bajo «Quiénes somos» */
    stats: z.array(stat).min(1),
  }),
  footer: z.object({
    tagline: z.string().min(1),
    copyright: z.string().min(1),
    subline: z.string().optional(),
  }),
  seo: z.object({
    homeTitle: z.string().min(1),
    homeDescription: z.string().min(1),
  }),
  social: z.object({
    youtube: urlOrPath,
    instagram: urlOrPath,
    facebook: urlOrPath,
    spotify: urlOrPath,
    tiktok: urlOrPath,
  }),
  contact: z.object({
    email: z.string().email(),
    whatsapp: z.string().min(8),
  }),
  nav: z.object({
    links: z.array(navLink).min(1),
    ctaLabel: z.string().min(1),
    ctaHref: z.string().min(1),
    mobileFooterLine: z.string().min(1),
  }),
  booking: z.object({
    heroTitle: z.string().min(1),
    heroDescription: z.string().min(1),
    stepLabels: z.array(z.string().min(1)).min(5).max(5),
    services: z
      .array(
        z.object({
          type: z.string().min(1),
          icon: z.string().min(1),
          title: z.string().min(1),
          desc: z.string().min(1),
        }),
      )
      .min(1),
    genreChips: z.array(z.string().min(1)).min(1),
  }),
  artists: z.object({
    pageHeroTitle: z.string().min(1),
    pageHeroDescription: z.string().min(1),
    producerLabel: z.string().min(1),
    producerName: z.string().min(1),
    producerGenres: z.array(z.string().min(1)).min(1),
    producerBio: z.string().min(1),
    primaryCtaLabel: z.string().min(1),
    crewSectionTitle: z.string().min(1),
    crewSectionDescription: z.string().min(1),
    youtubeCtaLabel: z.string().min(1),
    /** Foto del productor principal (URL o /uploads/...) */
    producerImageUrl: optionalUrlOrPath,
    members: z.array(
      z.object({
        name: z.string().min(1),
        genre: z.string().min(1),
        bio: z.string().min(1),
        imageUrl: optionalUrlOrPath,
        instagramUrl: z.string().optional(),
        youtubeUrl: z.string().optional(),
      }),
    ).min(1),
  }),
  beatsPage: z.object({
    metaTitle: z.string().min(1),
    metaDescription: z.string().min(1),
    heroEyebrow: z.string().optional(),
    heroTitle: z.string().min(1),
    /** Usa {{count}} para el número de beats disponibles */
    heroDescriptionTemplate: z.string().min(1),
    heroImageUrl: z.string().optional(),
  }),
  productionsPage: z.object({
    metaTitle: z.string().min(1),
    metaDescription: z.string().min(1),
    heroTitle: z.string().min(1),
    /** Usa {{total}} para el total del catálogo */
    heroDescriptionTemplate: z.string().min(1),
    /** Línea sobre la cuadrícula; usa {{total}} */
    catalogCountLineTemplate: z.string().min(1),
    heroImageUrl: z.string().optional(),
  }),
  releasesPage: z.object({
    metaTitle: z.string().min(1),
    metaDescription: z.string().min(1),
    heroEyebrow: z.string().optional(),
    heroTitle: z.string().min(1),
    heroDescription: z.string().min(1),
    emptyStateMessage: z.string().min(1),
    heroImageUrl: z.string().optional(),
  }),
  bookingSuccess: z.object({
    metaTitle: z.string().min(1),
    eyebrow: z.string().min(1),
    body: z.string().min(1),
    tagline: z.string().min(1),
    whatsappCtaLabel: z.string().min(1),
    homeLinkLabel: z.string().min(1),
  }),
  releaseDetail: z.object({
    upcomingBadge: z.string().min(1),
    moreSectionTitle: z.string().min(1),
    spotifyCtaLabel: z.string().min(1),
    youtubeCtaUpcoming: z.string().min(1),
    youtubeCtaReleased: z.string().min(1),
  }),
  /** Canales de YouTube anclados (home y /artists) */
  youtube: z.object({
    showOnHome: z.boolean(),
    sectionEyebrow: z.string(),
    sectionTitle: z.string().min(1),
    sectionSubtitle: z.string(),
    subscribeLabel: z.string().min(1),
    channels: z.array(youtubeChannel),
  }),
  /** Tienda / marketplace de merch (productos viven en la tabla Product) */
  shop: z.object({
    enabled: z.boolean(),
    navLabel: z.string().min(1),
    metaTitle: z.string().min(1),
    metaDescription: z.string().min(1),
    heroEyebrow: z.string().optional(),
    heroTitle: z.string().min(1),
    heroDescription: z.string().min(1),
    heroImageUrl: optionalUrlOrPath,
    emptyStateMessage: z.string().min(1),
    /** Botón de compra (abre WhatsApp con el pedido) */
    orderCtaLabel: z.string().min(1),
    addToCartLabel: z.string().min(1),
    /** Primera línea del mensaje de WhatsApp; luego se listan los productos */
    whatsappOrderIntro: z.string().min(1),
    shippingNote: z.string().optional(),
    showOnHome: z.boolean(),
    homeSectionEyebrow: z.string(),
    homeSectionTitle: z.string().min(1),
    homeSectionSubtitle: z.string(),
    homeCtaLabel: z.string().min(1),
  }),
  /** Código QR que lleva a la página (descargable desde el admin) */
  qr: z.object({
    /** URL destino; vacío = NEXT_PUBLIC_SITE_URL */
    targetUrl: z.string().optional(),
    label: z.string().min(1),
    showInFooter: z.boolean(),
    footerCaption: z.string().min(1),
  }),
});

export type SiteContent = z.infer<typeof siteContentSchema>;

export function mergeSiteContent(base: SiteContent, patch: unknown): SiteContent {
  if (!patch || typeof patch !== "object") {
    return base;
  }
  const p = patch as Partial<SiteContent>;
  const merged: SiteContent = {
    brand: { ...base.brand, ...p.brand },
    hero: { ...base.hero, ...p.hero },
    home: {
      ...base.home,
      ...p.home,
      milestones: p.home?.milestones?.length ? p.home.milestones : base.home.milestones,
      stats: p.home?.stats?.length ? p.home.stats : base.home.stats,
    },
    footer: { ...base.footer, ...p.footer },
    seo: { ...base.seo, ...p.seo },
    social: { ...base.social, ...p.social },
    contact: { ...base.contact, ...p.contact },
    nav: {
      ...base.nav,
      ...p.nav,
      links: p.nav?.links?.length ? p.nav.links : base.nav.links,
    },
    booking: {
      ...base.booking,
      ...p.booking,
      stepLabels: p.booking?.stepLabels?.length ? p.booking.stepLabels : base.booking.stepLabels,
      services: p.booking?.services?.length ? p.booking.services : base.booking.services,
      genreChips: p.booking?.genreChips?.length ? p.booking.genreChips : base.booking.genreChips,
    },
    artists: {
      ...base.artists,
      ...p.artists,
      producerGenres:
        p.artists?.producerGenres?.length ? p.artists.producerGenres : base.artists.producerGenres,
      members: p.artists?.members?.length ? p.artists.members : base.artists.members,
    },
    beatsPage: { ...base.beatsPage, ...p.beatsPage },
    productionsPage: { ...base.productionsPage, ...p.productionsPage },
    releasesPage: { ...base.releasesPage, ...p.releasesPage },
    bookingSuccess: { ...base.bookingSuccess, ...p.bookingSuccess },
    releaseDetail: { ...base.releaseDetail, ...p.releaseDetail },
    youtube: {
      ...base.youtube,
      ...p.youtube,
      channels: Array.isArray(p.youtube?.channels) ? p.youtube.channels : base.youtube.channels,
    },
    shop: { ...base.shop, ...p.shop },
    qr: { ...base.qr, ...p.qr },
  };
  const parsed = siteContentSchema.safeParse(merged);
  return parsed.success ? parsed.data : base;
}
