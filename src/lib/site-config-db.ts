import { prisma } from "./prisma.js";
import { SITE_CONTENT_DEFAULTS } from "./site-config-defaults.js";
import { mergeSiteContent, type SiteContent } from "../schemas/site-config.js";

export async function ensureSiteConfigRow(): Promise<void> {
  const exists = await prisma.siteConfig.findUnique({ where: { id: "default" } });
  if (exists) {
    return;
  }
  const j = SITE_CONTENT_DEFAULTS as unknown as object;
  await prisma.siteConfig.create({
    data: {
      id: "default",
      publishedJson: j,
      draftJson: j,
      draftUpdatedAt: new Date(),
    },
  });
}

export function publishedContent(row: { publishedJson: unknown } | null): SiteContent {
  return mergeSiteContent(SITE_CONTENT_DEFAULTS, row?.publishedJson ?? {});
}

export function draftContent(row: { draftJson: unknown } | null): SiteContent {
  return mergeSiteContent(SITE_CONTENT_DEFAULTS, row?.draftJson ?? {});
}
