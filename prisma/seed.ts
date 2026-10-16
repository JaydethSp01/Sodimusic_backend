import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { addDays, setHours, startOfTomorrow } from "date-fns";
import { SITE_CONTENT_DEFAULTS } from "../src/lib/site-config-defaults.js";

const prisma = new PrismaClient();

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
        description: "Camiseta negra 100% algodón con el logo de Sodimusic al frente.",
        priceCOP: 65_000,
        category: "Camisetas",
        sizes: ["S", "M", "L", "XL"],
        status: "ACTIVE",
        featured: true,
        sortOrder: 1,
      },
      {
        name: "Gorra XMEN",
        slug: "gorra-xmen",
        description: "Gorra snapback bordada XMEN · Sodimusic.",
        priceCOP: 45_000,
        category: "Gorras",
        sizes: ["Única"],
        status: "ACTIVE",
        sortOrder: 2,
      },
      {
        name: "Hoodie Champeta Roots",
        slug: "hoodie-champeta-roots",
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

  const productions = [
    {
      title: "Paisita (Sodimusic) x J Col El Crazy",
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
      artistName: "El Rasta",
      artistCity: "Medellín",
      artistCountry: "Colombia",
      year: 2023,
      genre: "Afrobeat",
      featured: true,
    },
    {
      title: "Vibra caribe",
      artistName: "Grupo Xpress",
      artistCity: "Barranquilla",
      artistCountry: "Colombia",
      year: 2022,
      genre: "Dancehall",
      featured: false,
    },
    {
      title: "Pa' que bailes",
      artistName: "DJ Primo",
      artistCity: "Ciudad de México",
      artistCountry: "México",
      year: 2022,
      genre: "Afrobeat",
      featured: false,
    },
    {
      title: "En la cima",
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
      genre: "Afrobeat",
      bpm: 98,
      mood: "Nostálgico",
      priceCOP: 200_000,
      status: "AVAILABLE",
    },
    {
      title: "Montes de María Riddim",
      genre: "Dancehall",
      bpm: 90,
      mood: "Festivo",
      priceCOP: 180_000,
      status: "AVAILABLE",
    },
    {
      title: "Caribe Trap 01",
      genre: "Trap",
      bpm: 140,
      mood: "Oscuro",
      priceCOP: 250_000,
      status: "EXCLUSIVE",
    },
    {
      title: "Palenque Groove",
      genre: "Afrobeat",
      bpm: 105,
      mood: "Energético",
      priceCOP: 220_000,
      status: "SOLD",
    },
  ];

  for (const b of beats) {
    await prisma.beat.create({ data: b });
  }

  await prisma.release.createMany({
    data: [
      {
        title: "Ganas",
        slug: "ganas",
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
        artistName: "JeiVy LaZy · XMEN",
        genre: "Trap",
        releaseYear: 2026,
        featured: true,
        upcoming: true,
        description:
          "Adelanto del próximo ciclo del sello: trap y Caribe con identidad María La Baja. Snippets y fecha por confirmar — suscríbete al canal para no perderte el drop.",
        youtubeUrl: "https://www.youtube.com/channel/UCbCYvwiAsoIdumPbFBe1x6A",
      },
      {
        title: "Lo que viene (single)",
        slug: "lo-que-viene-single",
        artistName: "Sodimusic",
        genre: "Afrobeat",
        releaseYear: 2026,
        featured: false,
        upcoming: true,
        description: "Espacio reservado para el próximo single promocional: aquí colocarás previews, arte y enlaces a adelantos cuando estén listos.",
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
