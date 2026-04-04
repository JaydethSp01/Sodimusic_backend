import type { SiteContent } from "../schemas/site-config.js";

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
    tagline: "María La Baja, cerca de Cartagena: la champeta abrió el camino",
    primaryCta: "Agenda tu sesión",
    secondaryCta: "Ver producciones",
    primaryHref: "/booking",
    secondaryHref: "/productions",
  },
  home: {
    aboutEyebrow: "Quiénes somos",
    aboutTitle: "Raíz en champeta, sonido sin fronteras",
    aboutBody:
      "Sodimusic Company nace en María La Baja, Bolívar, a pocos kilómetros de Cartagena: tierra donde la champeta marcó el barrio, los ritmos africanos resuenan en cada esquina y estamos cerca de la cuna del género. Ahí empezó todo. Con el tiempo, el crew XMEN llevó esa identidad al trap, el reggaeton, el afrobeat y el dancehall — sin perder el sabor del Caribe profundo. No es urbano genérico: es memoria costeña en formato global.",
    aboutImageUrl: "/maria_la_bajafoto.jpg",
    aboutAsideCaption: "Montes de María · Costa Caribe · 2026",
    genresEyebrow: "Catálogo",
    genresTitle: "Géneros",
    storyEyebrow: "Historia",
    storyTitle: "De la champeta al catálogo oficial",
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
        desc: "En María La Baja, entre picós, champeta y ritmos africanos: los primeros pasos del sonido Sodimusic.",
      },
      {
        year: "2018",
        title: "Consolidación del crew",
        desc: "XMEN toma forma como núcleo del sello, con la champeta como referencia y el urbano como proyección.",
      },
      {
        year: "2022",
        title: "Expansión regional",
        desc: "Producciones con artistas en Medellín y otras ciudades, siempre con el Caribe en la mezcla.",
      },
      {
        year: "2026",
        title: "Etapa digital",
        desc: "Sodimusic lanza su plataforma de booking y catálogo profesional.",
      },
    ],
  },
  footer: {
    tagline: "Champeta en el ADN, Caribe en cada beat. Desde María La Baja para el mundo.",
    copyright: "© 2016–2026 Sodimusic Company. Todos los derechos reservados.",
    subline: "Hecho en Medellín, con raíces en María La Baja",
  },
  seo: {
    homeTitle: "Sodimusic Company — Sello Urbano Afro-Caribeño | Colombia",
    homeDescription:
      "Sello desde 2016 en María La Baja, Bolívar, cerca de Cartagena: raíz en champeta y ritmos africanos; hoy trap, reggaeton, afrobeat y dancehall con identidad costeña.",
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
    genreChips: ["Champeta", "Trap", "Reggaeton", "Afrobeat", "Dancehall", "Otro"],
  },
  artists: {
    pageHeroTitle: "ARTISTAS",
    pageHeroDescription:
      "Crew XMEN. María La Baja, Bolívar — cerca de Cartagena y de la cuna de la champeta — con presencia en Medellín y más allá.",
    producerLabel: "Productor principal",
    producerName: "JeiVy LaZy",
    producerGenres: ["Reggaeton", "Trap", "Afrobeat"],
    producerBio:
      "Productor y artista principal del sello. Todo arranca en María La Baja, junto a Cartagena, donde la champeta y los ritmos africanos marcaron el barrio: de ahí sale la visión que hoy cruza reggaeton, trap y afrobeat con identidad palenquera y caribeña. Más de una década con el crew XMEN.",
    primaryCtaLabel: "Agendar sesión con JeiVy",
    crewSectionTitle: "CREW XMEN",
    crewSectionDescription:
      "Crew de confianza en sesiones, directos y desarrollo de talento: del picó y la champeta al estudio y la tarima.",
    youtubeCtaLabel: "Canal de YouTube Sodimusic",
    members: [
      {
        name: "J Col",
        genre: "Reggaeton · Trap · Afrobeat",
        bio: "Movimiento urbano local con melódica y narrativa de calle, con la champeta y el Caribe en la referencia.",
      },
      {
        name: "El Fammy",
        genre: "Reggaeton · Trap · Afrobeat",
        bio: "Energía de tarima: reggaeton, trap y afrobeat con el sabor que se cría cerca de Cartagena y la costa.",
      },
      {
        name: "El Vega",
        genre: "Reggaeton · Trap · Afrobeat",
        bio: "Sonido oscuro entre trap y afrobeat, con la raíz de María La Baja y el eco de la champeta en la mezcla.",
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
      "Más de 50 producciones con artistas de Colombia y el Caribe. El portafolio completo de Sodimusic Company.",
    heroTitle: "PRODUCIDO POR SODIMUSIC",
    heroDescriptionTemplate:
      "Desde María La Baja —donde la champeta y los ritmos africanos marcaron el inicio— {{total}} producciones con artistas de Colombia, el Caribe y más allá. Aquí está ese trabajo.",
    catalogCountLineTemplate: "{{total}} producciones en el catálogo",
  },
  releasesPage: {
    metaTitle: "Próximos lanzamientos",
    metaDescription:
      "Adelantos y fechas en Sodimusic: nuevos singles y proyectos con raíz en María La Baja, Bolívar, cerca de Cartagena y la tradición champetera.",
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
