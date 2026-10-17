import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { addDays, setHours, startOfTomorrow } from "date-fns";
import { SITE_CONTENT_DEFAULTS } from "../src/lib/site-config-defaults.js";

const prisma = new PrismaClient();

const SODIMUSIC_CHANNEL_ID = "UCbCYvwiAsoIdumPbFBe1x6A";

/** Precios por licencia a partir del precio "desde": MP3 = base, WAV = +30 %, STEMS = x2, EXCLUSIVE = x4. */
function licensePricesFrom(priceCOP: number): {
  priceMp3COP: number;
  priceWavCOP: number;
  priceStemsCOP: number;
  priceExclusiveCOP: number;
} {
  return {
    priceMp3COP: priceCOP,
    priceWavCOP: Math.round(priceCOP * 1.3),
    priceStemsCOP: priceCOP * 2,
    priceExclusiveCOP: priceCOP * 4,
  };
}

async function main(): Promise<void> {
  const passwordHash = await bcrypt.hash("sodimusic2016", 12);

  await prisma.adminUser.upsert({
    where: { email: "Jeivymusicdinero@gmail.com" },
    update: { password: passwordHash },
    create: {
      email: "Jeivymusicdinero@gmail.com",
      password: passwordHash,
    },
  });

  await prisma.bookingSession.deleteMany();
  await prisma.beat.deleteMany();
  await prisma.release.deleteMany();
  await prisma.production.deleteMany();
  await prisma.product.deleteMany();

  await prisma.product.createMany({
    data: [
      {
        name: "Camiseta Sodimusic negra",
        slug: "camiseta-sodimusic-negra",
        images: ["https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?q=80&w=1200&auto=format&fit=crop"],
        description: "Camiseta negra 100% algodón con el logo de Sodimusic al frente.",
        priceCOP: 65_000,
        category: "Camisetas",
        sizes: ["S", "M", "L", "XL"],
        status: "ACTIVE",
        featured: true,
        sortOrder: 1,
      },
      {
        name: "Gorra Sodimusic",
        slug: "gorra-sodimusic",
        images: ["https://images.unsplash.com/photo-1588850561407-ed78c282e89b?q=80&w=1200&auto=format&fit=crop"],
        description: "Gorra snapback bordada con el logo de Sodimusic.",
        priceCOP: 45_000,
        category: "Gorras",
        sizes: ["Única"],
        status: "ACTIVE",
        sortOrder: 2,
      },
      {
        name: "Hoodie Champeta Roots",
        slug: "hoodie-champeta-roots",
        images: ["https://images.unsplash.com/photo-1556821840-3a63f95609a7?q=80&w=1200&auto=format&fit=crop"],
        description: "Hoodie oversize edición Champeta Roots, interior afelpado.",
        priceCOP: 120_000,
        compareAtCOP: 140_000,
        category: "Hoodies",
        sizes: ["S", "M", "L", "XL"],
        status: "ACTIVE",
        sortOrder: 3,
      },
    ],
  });

  const siteJson = SITE_CONTENT_DEFAULTS as unknown as object;
  await prisma.siteConfig.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      publishedJson: siteJson,
      draftJson: siteJson,
      draftUpdatedAt: new Date(),
    },
    update: {},
  });

  // Canal oficial en la tabla YoutubeChannel (destacado). Idempotente por channelId.
  const existingChannel = await prisma.youtubeChannel.findFirst({ where: { channelId: SODIMUSIC_CHANNEL_ID } });
  if (!existingChannel) {
    await prisma.youtubeChannel.create({
      data: {
        name: "Sodimusic",
        url: `https://www.youtube.com/channel/${SODIMUSIC_CHANNEL_ID}`,
        channelId: SODIMUSIC_CHANNEL_ID,
        description: "Canal oficial del sello: videos oficiales, lyric videos y lanzamientos.",
        category: "Sello",
        featured: true,
        status: "ACTIVE",
        sortOrder: 0,
      },
    });
  } else if (!existingChannel.featured) {
    await prisma.youtubeChannel.update({ where: { id: existingChannel.id }, data: { featured: true } });
  }

  const productions = [
    {
      title: "Paisita (Sodimusic) x J Col El Crazy",
      coverUrl: "https://i.ytimg.com/vi/e60j4DF8xe8/hqdefault.jpg",
      artistName: "J Col, El Crazy",
      artistCity: "Medellín",
      artistCountry: "Colombia",
      year: 2024,
      genre: "Trap",
      youtubeUrl: "https://www.youtube.com/watch?v=e60j4DF8xe8",
      featured: true,
    },
    {
      title: "GANAS SODIMUSIC LA (VIDEO OFICIAL)",
      coverUrl: "https://i.ytimg.com/vi/kbQup1zxpGw/hqdefault.jpg",
      artistName: "Sodimusic",
      artistCity: "Medellín",
      artistCountry: "Colombia",
      year: 2024,
      genre: "Reggaeton",
      youtubeUrl: "https://www.youtube.com/watch?v=kbQup1zxpGw",
      featured: true,
    },
    {
      title: "Fuego lento",
      coverUrl: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?q=80&w=1200&auto=format&fit=crop",
      artistName: "El Rasta",
      artistCity: "Medellín",
      artistCountry: "Colombia",
      year: 2023,
      genre: "Afrobeat",
      featured: true,
    },
    {
      title: "Vibra caribe",
      coverUrl: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?q=80&w=1200&auto=format&fit=crop",
      artistName: "Grupo Xpress",
      artistCity: "Barranquilla",
      artistCountry: "Colombia",
      year: 2022,
      genre: "Dancehall",
      featured: false,
    },
    {
      title: "Pa' que bailes",
      coverUrl: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?q=80&w=1200&auto=format&fit=crop",
      artistName: "DJ Primo",
      artistCity: "Ciudad de México",
      artistCountry: "México",
      year: 2022,
      genre: "Afrobeat",
      featured: false,
    },
    {
      title: "En la cima",
      coverUrl: "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?q=80&w=1200&auto=format&fit=crop",
      artistName: "Young KB",
      artistCity: "María La Baja",
      artistCountry: "Colombia",
      year: 2021,
      genre: "Trap",
      featured: false,
    },
  ];

  for (const p of productions) {
    await prisma.production.create({ data: p });
  }

  const beats = [
    {
      title: "María La Baja Type Beat",
      coverUrl: "https://images.unsplash.com/photo-1487180144351-b8472da7d491?q=80&w=1200&auto=format&fit=crop",
      genre: "Afrobeat",
      bpm: 98,
      mood: "Nostálgico",
      priceCOP: 200_000,
      status: "AVAILABLE",
    },
    {
      title: "Montes de María Riddim",
      coverUrl: "https://images.unsplash.com/photo-1516280440614-37939bbacd81?q=80&w=1200&auto=format&fit=crop",
      genre: "Dancehall",
      bpm: 90,
      mood: "Festivo",
      priceCOP: 180_000,
      status: "AVAILABLE",
    },
    {
      title: "Caribe Trap 01",
      coverUrl: "https://images.unsplash.com/photo-1571330735066-03aaa9429d89?q=80&w=1200&auto=format&fit=crop",
      genre: "Trap",
      bpm: 140,
      mood: "Oscuro",
      priceCOP: 250_000,
      status: "EXCLUSIVE",
    },
    {
      title: "Palenque Groove",
      coverUrl: "https://images.unsplash.com/photo-1619983081563-430f63602796?q=80&w=1200&auto=format&fit=crop",
      genre: "Afrobeat",
      bpm: 105,
      mood: "Energético",
      priceCOP: 220_000,
      status: "SOLD",
    },
  ];

  for (const b of beats) {
    await prisma.beat.create({ data: { ...b, ...licensePricesFrom(b.priceCOP) } });
  }

  await prisma.release.createMany({
    data: [
      {
        title: "Ganas",
        slug: "ganas",
        coverUrl: "https://i.ytimg.com/vi/kbQup1zxpGw/hqdefault.jpg",
        artistName: "JeiVy LaZy",
        genre: "Reggaeton",
        releaseYear: 2024,
        featured: true,
        upcoming: false,
        description: "Lanzamiento oficial bajo el sello Sodimusic.",
      },
      {
        title: "En la oscuridad",
        slug: "en-la-oscuridad",
        coverUrl: "https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?q=80&w=1200&auto=format&fit=crop",
        artistName: "JeiVy LaZy ft. El Rasta",
        genre: "Trap",
        releaseYear: 2023,
        featured: false,
        upcoming: false,
        description: "Trap con raíz caribe desde María La Baja.",
      },
      {
        title: "Proyecto Montes 2026",
        slug: "proyecto-montes-2026",
        coverUrl: "https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?q=80&w=1200&auto=format&fit=crop",
        artistName: "JeiVy LaZy · XMEN",
        genre: "Trap",
        releaseYear: 2026,
        featured: true,
        upcoming: true,
        description:
          "Adelanto del próximo ciclo del sello: trap y Caribe con identidad María La Baja. Snippets y fecha por confirmar — suscríbete al canal para no perderte el drop.",
        youtubeUrl: `https://www.youtube.com/channel/${SODIMUSIC_CHANNEL_ID}`,
        // Smart links de ejemplo (solo en releases que ya tienen youtubeUrl)
        spotifyUrl: "https://open.spotify.com/search/sodimusic",
        appleUrl: "https://music.apple.com/co/search?term=sodimusic",
        deezerUrl: "https://www.deezer.com/search/sodimusic",
        releaseDate: new Date("2026-12-15T00:00:00.000Z"),
      },
    ],
  });

  const scheduledDate = setHours(addDays(startOfTomorrow(), 3), 10);

  await prisma.bookingSession.create({
    data: {
      serviceType: "VOCAL_RECORDING",
      artistName: "Young Cali",
      artistEmail: "youngcali@example.com",
      artistPhone: "+57 300 555 0101",
      musicReference: "https://open.spotify.com/track/4iV5W9uYEdYUVa79Axb7Rh",
      genres: "Trap,Reggaeton",
      isFirstTime: true,
      scheduledDate,
      timeSlot: "morning",
      status: "PENDING",
      vision: "Quiero un sonido más oscuro y caribeño.",
    },
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e: unknown) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
