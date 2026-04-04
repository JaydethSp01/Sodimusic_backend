import type { SiteContent } from "../schemas/site-config";

export const SITE_CONTENT_DEFAULTS: SiteContent = {
  brand: {
    logoText: "SODIMUSIC",
    siteNameLine: "Sodimusic Company — María La Baja",
  },
  hero: {
    heroImageUrl:
      "https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?q=80&w=2400&auto=format&fit=crop",
    eyebrow: "EST. 2016 · MARÍA LA BAJA, BOLÍVAR",
    title: "SODIMUSIC",
    tagline: "Desde María La Baja para el mundo",
    primaryCta: "Agenda tu sesión",
    secondaryCta: "Ver producciones",
    primaryHref: "/booking",
    secondaryHref: "/productions",
  },
  home: {
    aboutEyebrow: "Quiénes somos",
    aboutTitle: "Raíz afro-caribeña, sonido global",
    aboutBody:
      "Sodimusic Company nació en María La Baja, Bolívar: territorio afrodescendiente, cuna del bullerengue y vecino de San Basilio de Palenque. Más de una década construyendo en silencio con el crew XMEN: trap, reggaeton, afrobeat y dancehall con identidad propia. No es reggaetón genérico: es el Caribe profundo hablando urbano.",
    aboutAsideCaption: "Montes de María · Costa Caribe · 2026",
    genresEyebrow: "Catálogo",
    genresTitle: "Géneros",
    storyEyebrow: "Historia",
    storyTitle: "Del barrio al catálogo oficial",
    portfolioEyebrow: "Portafolio",
    portfolioTitle: "Últimas producciones",
    portfolioCta: "Ver todas las producciones →",
    servicesEyebrow: "",
    servicesTitle: "Servicios",
    servicesSubtitle: "Elige cómo quieres trabajar con Sodimusic.",
    contactTitle: "¿Tienes un proyecto?",
    contactSubtitle: "Escríbenos o agenda directamente en la plataforma.",
    milestones: [
      {
        year: "2016",
        title: "Nace la visión",
        desc: "El primer artista con sonido e identidad marcada.",
      },
      {
        year: "2018",
        title: "Consolidación del crew",
        desc: "XMEN toma forma como núcleo del sello.",
      },
      {
        year: "2022",
        title: "Expansión regional",
        desc: "Producciones con artistas de Medellín y conexiones con México.",
      },
      {
        year: "2026",
        title: "Etapa digital",
        desc: "Sodimusic lanza su plataforma de booking y catálogo profesional.",
      },
    ],
  },
  footer: {
    tagline: "Trap con alma de Caribe africano. Desde María La Baja para el mundo.",
    copyright: "© 2016–2026 Sodimusic Company. Todos los derechos reservados.",
    subline: "Hecho en Medellín, con raíces en María La Baja",
  },
  seo: {
    homeTitle: "Sodimusic Company — Sello Urbano Afro-Caribeño | Colombia",
    homeDescription:
      "Sello discográfico independiente desde 2016 en María La Baja, Bolívar. Trap, afrobeat, reggaeton y dancehall con raíces afrocolombianas.",
  },
  social: {
    youtube: "https://www.youtube.com/channel/UCbCYvwiAsoIdumPbFBe1x6A",
    instagram: "https://www.instagram.com/",
    facebook: "https://www.facebook.com/sodimusic.oficial",
    spotify: "https://open.spotify.com/",
    tiktok: "https://www.tiktok.com/@sodimusic",
  },
  contact: {
    email: "Jeivymusicdinero@gmail.com",
    whatsapp: "573215368590",
  },
  nav: {
    links: [
      { href: "/productions", label: "Producciones" },
      { href: "/releases", label: "Lanzamientos" },
      { href: "/beats", label: "Beats" },
      { href: "/artists", label: "Artistas" },
    ],
    ctaLabel: "Agendar sesión",
    ctaHref: "/booking",
    mobileFooterLine: "Sodimusic · María La Baja, Bolívar",
  },
  booking: {
    heroTitle: "AGENDA TU SESIÓN",
    heroDescription: "Cinco pasos. Briefing claro. JeiVy recibe tu solicitud al instante.",
    stepLabels: ["Servicio", "Tu música", "Fecha", "Contacto", "Confirmar"],
    services: [
      {
        type: "VOCAL_RECORDING",
        icon: "🎤",
        title: "Grabación vocal",
        desc: "Graba tus voces con dirección artística",
      },
      {
        type: "BEAT_PRODUCTION",
        icon: "🎹",
        title: "Beat personalizado",
        desc: "JeiVy produce un beat a medida para tu proyecto",
      },
      {
        type: "COPRODUCTION",
        icon: "🤝",
        title: "Coproducción",
        desc: "Traes tu idea, la desarrollamos juntos",
      },
      { type: "MIX_MASTER", icon: "🎚️", title: "Mezcla y masterización", desc: "Tu canción al siguiente nivel" },
      { type: "CONSULTING", icon: "💬", title: "Consultoría artística (30 min)", desc: "Hablamos de tu proyecto y tu sonido" },
    ],
    genreChips: ["Trap", "Reggaeton", "Afrobeat", "Dancehall", "Otro"],
  },
  artists: {
    pageHeroTitle: "ARTISTAS",
    pageHeroDescription: "Crew XMEN. Raíz en María La Baja, presencia en Cartagena, Medellín y más allá.",
    producerLabel: "Productor principal",
    producerName: "JeiVy LaZy",
    producerGenres: ["Trap", "Afrobeat", "Reggaeton", "Dancehall"],
    producerBio:
      "Productor y artista principal del sello. La visión sonora de Sodimusic nace de la costa y se proyecta al trap y el reggaeton con identidad palenquera y caribeña. Más de una década construyendo con el crew XMEN: desde María La Baja para el mundo.",
    primaryCtaLabel: "Agendar sesión con JeiVy",
    crewSectionTitle: "CREW XMEN",
    crewSectionDescription:
      "Crew de confianza en sesiones, directos y desarrollo de talento desde el Montes de María al estudio.",
    youtubeCtaLabel: "Canal de YouTube Sodimusic",
    members: [
      {
        name: "J Col",
        genre: "Trap · Reggaeton",
        bio: "Artista del movimiento urbano local con enfoque melódico y narrativa de calle, manteniendo identidad caribeña.",
      },
      {
        name: "El Fammy",
        genre: "Reggaeton · Dancehall",
        bio: "Energía de tarima y enfoque en reggaeton y dancehall para perreo fino y directo.",
      },
      {
        name: "El Vega",
        genre: "Trap · Afrobeat",
        bio: "Sonido oscuro y moderno entre trap y afrobeat, con identidad marcada de María La Baja.",
      },
    ],
  },
  beatsPage: {
    metaTitle: "Beats disponibles",
    metaDescription:
      "Beats originales del sello Sodimusic. Escucha, filtra y solicita tu licencia. Precios en COP.",
    heroTitle: "BEATS DISPONIBLES",
    heroDescriptionTemplate:
      "{{count}} beats disponibles ahora. Precios en COP. El cierre es directo con el sello.",
  },
  productionsPage: {
    metaTitle: "Producciones",
    metaDescription:
      "Más de 50 producciones con artistas de Colombia, México y el Caribe. El portafolio completo de Sodimusic Company.",
    heroTitle: "PRODUCIDO POR SODIMUSIC",
    heroDescriptionTemplate:
      "Desde María La Baja hasta Ciudad de México, Sodimusic ha construido en silencio un catálogo de {{total}} producciones con artistas del Caribe y América Latina. Aquí está ese trabajo.",
    catalogCountLineTemplate: "{{total}} producciones en el catálogo",
  },
  releasesPage: {
    metaTitle: "Próximos lanzamientos",
    metaDescription:
      "Adelantos y fechas de lo que se viene en Sodimusic: nuevos singles, proyectos y snippets desde María La Baja.",
    heroEyebrow: "Lo que viene",
    heroTitle: "PRÓXIMOS LANZAMIENTOS",
    heroDescription:
      "Aquí promocionamos lo nuevo del sello: adelantos en video, fechas previstas y pistas de lo que estamos cocinando. Nada de archivo muerto — esto es lo que sigue.",
    emptyStateMessage:
      "Pronto habrá adelantos nuevos aquí. Mientras tanto, mira el canal de YouTube Sodimusic.",
  },
  bookingSuccess: {
    metaTitle: "Sesión enviada",
    eyebrow: "Confirmación",
    body: "Tu sesión está siendo confirmada. JeiVy revisará tu solicitud y te escribirá para confirmar los detalles.",
    tagline: "Tu música merece una sesión profesional. JeiVy estará listo para ti.",
    whatsappCtaLabel: "Escribir por WhatsApp",
    homeLinkLabel: "Volver al inicio",
  },
  releaseDetail: {
    upcomingBadge: "Próximo lanzamiento · adelanto / promo",
    moreSectionTitle: "Más próximos lanzamientos",
    spotifyCtaLabel: "Escuchar en Spotify",
    youtubeCtaUpcoming: "Ver adelanto en YouTube",
    youtubeCtaReleased: "Ver en YouTube",
  },
};
