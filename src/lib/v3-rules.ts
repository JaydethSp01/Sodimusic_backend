export const PLACEHOLDER_RELEASE_SLUG = "lo-que-viene-single";
export const PLACEHOLDER_RELEASE_TITLE = "Lo que viene (single)";

/**
 * El release placeholder del seed solo se borra si sigue intacto: mismo slug, mismo título
 * y sin enlaces a Spotify/YouTube (si el admin lo reutilizó para un lanzamiento real, se conserva).
 */
export function shouldDeletePlaceholderRelease(r: {
  slug: string;
  title: string;
  spotifyUrl: string | null;
  youtubeUrl: string | null;
}): boolean {
  const hasLink = (v: string | null): boolean => typeof v === "string" && v.trim().length > 0;
  return r.slug === PLACEHOLDER_RELEASE_SLUG && r.title === PLACEHOLDER_RELEASE_TITLE && !hasLink(r.spotifyUrl) && !hasLink(r.youtubeUrl);
}
