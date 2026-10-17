/**
 * Datos v3 para una BD YA existente (producción). Idempotente: se puede ejecutar varias veces.
 *
 *   npx tsx scripts/v3-data.ts
 *
 * Aplica lo mismo que cambia el seed, sin pisar lo que el admin haya editado:
 *   1. Garantiza tablas/columnas v3 (ensureShopSchema) y migra `youtube.channels` del SiteConfig.
 *   2. Crea el canal Sodimusic (featured) si no existe ninguno con ese channelId.
 *   3. Borra el release placeholder "Lo que viene (single)" solo si sigue intacto
 *      (slug `lo-que-viene-single`, mismo título y sin spotifyUrl/youtubeUrl).
 *   4. Renombra el producto `gorra-xmen` → "Gorra Sodimusic" (`gorra-sodimusic`).
 *   5. Rellena precios por licencia de los beats SOLO donde estén en null.
 * No borra nada más.
 */
import { config } from "dotenv";
import { prisma } from "../src/lib/prisma.js";
import { ensureShopSchema } from "../src/lib/ensure-schema.js";
import { PLACEHOLDER_RELEASE_SLUG, shouldDeletePlaceholderRelease } from "../src/lib/v3-rules.js";

config();

const SODIMUSIC_CHANNEL_ID = "UCbCYvwiAsoIdumPbFBe1x6A";
const OLD_CAP_SLUG = "gorra-xmen";
const NEW_CAP_SLUG = "gorra-sodimusic";

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
  const log = (msg: string): void => console.log(`[v3-data] ${msg}`);

  // 1. Esquema + migración de canales del JSON
  await ensureShopSchema();
  log("esquema v3 verificado");

  // 2. Canal Sodimusic
  const channel = await prisma.youtubeChannel.findFirst({ where: { channelId: SODIMUSIC_CHANNEL_ID } });
  if (!channel) {
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
    log("canal Sodimusic creado (featured)");
  } else {
    log(`canal Sodimusic ya existe (${channel.id}); sin cambios`);
  }

  // 3. Release placeholder (solo si sigue intacto; si el admin lo reutilizó, se conserva)
  const placeholder = await prisma.release.findUnique({ where: { slug: PLACEHOLDER_RELEASE_SLUG } });
  if (!placeholder) {
    log("release placeholder no existe; sin cambios");
  } else if (shouldDeletePlaceholderRelease(placeholder)) {
    await prisma.release.delete({ where: { id: placeholder.id } });
    log(`release placeholder "${PLACEHOLDER_RELEASE_SLUG}" eliminado`);
  } else {
    log(`release "${PLACEHOLDER_RELEASE_SLUG}" fue editado (título o enlaces); se conserva`);
  }

  // 4. Gorra XMEN → Gorra Sodimusic
  const oldCap = await prisma.product.findUnique({ where: { slug: OLD_CAP_SLUG } });
  if (oldCap) {
    const clash = await prisma.product.findUnique({ where: { slug: NEW_CAP_SLUG } });
    if (clash) {
      log(`ya existe "${NEW_CAP_SLUG}"; se renombra solo el nombre de "${OLD_CAP_SLUG}" sin cambiar su slug`);
      await prisma.product.update({
        where: { id: oldCap.id },
        data: { name: "Gorra Sodimusic", description: oldCap.description?.replace(/XMEN/g, "Sodimusic") ?? null },
      });
    } else {
      await prisma.product.update({
        where: { id: oldCap.id },
        data: {
          name: "Gorra Sodimusic",
          slug: NEW_CAP_SLUG,
          description: oldCap.description?.replace(/XMEN/g, "Sodimusic") ?? null,
        },
      });
      log(`producto "${OLD_CAP_SLUG}" renombrado a "Gorra Sodimusic" (${NEW_CAP_SLUG})`);
    }
  } else {
    log(`producto "${OLD_CAP_SLUG}" no existe; sin cambios`);
  }

  // 5. Precios por licencia solo donde estén en null
  const beats = await prisma.beat.findMany({
    where: {
      OR: [
        { priceMp3COP: null },
        { priceWavCOP: null },
        { priceStemsCOP: null },
        { priceExclusiveCOP: null },
      ],
    },
  });
  let filled = 0;
  for (const b of beats) {
    const p = licensePricesFrom(b.priceCOP);
    await prisma.beat.update({
      where: { id: b.id },
      data: {
        priceMp3COP: b.priceMp3COP ?? p.priceMp3COP,
        priceWavCOP: b.priceWavCOP ?? p.priceWavCOP,
        priceStemsCOP: b.priceStemsCOP ?? p.priceStemsCOP,
        priceExclusiveCOP: b.priceExclusiveCOP ?? p.priceExclusiveCOP,
      },
    });
    filled += 1;
  }
  log(filled > 0 ? `precios por licencia completados en ${filled} beat(s)` : "todos los beats ya tienen precios por licencia");

  log("listo");
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
