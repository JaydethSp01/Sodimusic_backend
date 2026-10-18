import type { Prisma } from "@prisma/client";
import type { SiteContent } from "../schemas/site-config.js";
import { slugify } from "./slugify.js";

/** Datos mínimos de un artista para asociar contenido por nombre. */
export type ArtistNameLike = { name: string; aliases?: readonly string[] | null };

/** Divide "Reggaeton · Trap · Afrobeat" (o separado por comas) en géneros limpios, sin duplicados. */
export function splitGenres(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const part of raw.split(/[·,|/]/)) {
    const g = part.trim();
    const key = g.toLowerCase();
    if (g.length === 0 || seen.has(key)) continue;
    seen.add(key);
    out.push(g);
  }
  return out;
}

/**
 * Términos por los que se asocia contenido a un artista: su nombre y sus alias,
 * recortados, sin vacíos ni repetidos (insensible a mayúsculas), sin comodines SQL.
 */
export function artistSearchTerms(artist: ArtistNameLike): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of [artist.name, ...(artist.aliases ?? [])]) {
    const t = (raw ?? "").replace(/[%_]/g, "").trim();
    const key = t.toLowerCase();
    if (t.length === 0 || seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

/** `true` si `text` contiene (insensible a mayúsculas) el nombre o alguno de los alias del artista. */
export function mentionsArtist(text: string | null | undefined, artist: ArtistNameLike): boolean {
  if (!text) return false;
  const hay = text.toLowerCase();
  return artistSearchTerms(artist).some((t) => hay.includes(t.toLowerCase()));
}

/** Condición Prisma `OR` para `field contains <nombre|alias>` (insensible a mayúsculas). */
export function nameMatchWhere<T extends string>(
  field: T,
  terms: readonly string[],
): Array<Record<T, Prisma.StringFilter<never>>> {
  return terms.map((t) => ({ [field]: { contains: t, mode: "insensitive" } }) as Record<T, Prisma.StringFilter<never>>);
}

/** Slug canónico de un artista a partir de su nombre ("" si el nombre no deja ningún carácter válido). */
export function artistSlug(name: string): string {
  return slugify(name);
}

export type ArtistSeed = Prisma.ArtistCreateInput;

function orNull(v: string | undefined): string | null {
  const t = v?.trim();
  return t && t.length > 0 ? t : null;
}

/** Solo URLs http(s): el SiteConfig antiguo admite texto libre en los enlaces. */
function httpOrNull(v: string | undefined): string | null {
  const t = orNull(v);
  return t && /^https?:\/\//i.test(t) ? t : null;
}

/**
 * Artistas a sembrar a partir de la sección `artists` del SiteConfig publicado:
 * productor principal (destacado, sortOrder 0) + miembros del crew (sortOrder 1..n).
 * Los nombres repetidos (mismo slug) se descartan; los nombres sin slug válido también.
 */
export function artistSeedsFromContent(content: Pick<SiteContent, "artists">): ArtistSeed[] {
  const a = content.artists;
  const seeds: ArtistSeed[] = [];
  const slugs = new Set<string>();
  const push = (seed: ArtistSeed): void => {
    if (!seed.slug || slugs.has(seed.slug)) return;
    slugs.add(seed.slug);
    seeds.push(seed);
  };

  const producerName = a.producerName.trim();
  if (producerName.length > 0) {
    push({
      slug: artistSlug(producerName),
      name: producerName,
      role: "Productor principal",
      shortBio: null,
      bio: orNull(a.producerBio),
      photoUrl: orNull(a.producerImageUrl),
      genres: a.producerGenres.map((g) => g.trim()).filter((g) => g.length > 0),
      featured: true,
      status: "ACTIVE",
      sortOrder: 0,
    });
  }

  a.members.forEach((m, i) => {
    const name = m.name.trim();
    if (name.length === 0) return;
    push({
      slug: artistSlug(name),
      name,
      role: orNull(m.role) ?? "Crew",
      shortBio: orNull(m.bio),
      bio: null,
      photoUrl: orNull(m.imageUrl),
      genres: splitGenres(m.genre),
      instagramUrl: httpOrNull(m.instagramUrl),
      youtubeUrl: httpOrNull(m.youtubeUrl),
      spotifyUrl: httpOrNull(m.spotifyUrl),
      tiktokUrl: httpOrNull(m.tiktokUrl),
      featured: false,
      status: "ACTIVE",
      sortOrder: i + 1,
    });
  });

  return seeds;
}
