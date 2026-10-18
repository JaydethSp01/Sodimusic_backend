export const SOCIAL_SOURCE_KINDS = ["YOUTUBE_CHANNEL", "FACEBOOK_PAGE", "YOUTUBE_SEARCH"] as const;
export type SocialSourceKind = (typeof SOCIAL_SOURCE_KINDS)[number];

export const SOCIAL_POST_KINDS = ["YOUTUBE_VIDEO", "FACEBOOK_POST", "LINK"] as const;
export type SocialPostKind = (typeof SOCIAL_POST_KINDS)[number];

export const SOCIAL_POST_STATUSES = ["VISIBLE", "HIDDEN"] as const;
export type SocialPostStatus = (typeof SOCIAL_POST_STATUSES)[number];

/** Publicación normalizada que devuelven los fetchers; `sync.ts` la vuelca en `SocialPost`. */
export type SocialPostInput = {
  kind: SocialPostKind;
  /** yt:<videoId> | fb:<postId> | link:<sha1(url)> */
  externalId: string;
  title: string;
  text?: string | null;
  url: string;
  imageUrl?: string | null;
  author?: string | null;
  publishedAt: Date;
  /**
   * `true` cuando la fecha viene de un texto relativo ("hace 3 días") y no de la fuente exacta.
   * En ese caso la sincronización no sobreescribe una `publishedAt` ya guardada.
   */
  publishedAtApprox?: boolean;
  raw?: unknown;
};

export type SocialSyncSourceResult = {
  id: string;
  label: string;
  kind: SocialSourceKind;
  added: number;
  updated: number;
  error?: string;
};

export type SocialSyncSummary = {
  ok: boolean;
  /** `true` si la sincronización se omitió por el bloqueo blando (última < 2 min y sin `force`). */
  skipped?: boolean;
  startedAt: string;
  finishedAt: string;
  sources: SocialSyncSourceResult[];
  added: number;
  updated: number;
};
