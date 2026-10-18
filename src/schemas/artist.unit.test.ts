import { describe, expect, it } from "vitest";
import { artistCreateSchema, artistUpdateSchema } from "./artist.js";

describe("artistCreateSchema", () => {
  it("aplica defaults y normaliza textos/listas", () => {
    const r = artistCreateSchema.safeParse({
      name: "  J Col ",
      shortBio: "  ",
      genres: ["Trap", " trap", "", "Afrobeat"],
      aliases: ["J Col El Crazy", "j col el crazy"],
      spotifyUrl: "",
      youtubeChannelId: "",
    });
    expect(r.success, JSON.stringify(r.error)).toBe(true);
    if (!r.success) return;
    expect(r.data.slug).toBeUndefined();
    expect(r.data).toMatchObject({
      name: "J Col",
      role: "Artista",
      shortBio: null,
      genres: ["Trap", "Afrobeat"],
      aliases: ["J Col El Crazy"],
      spotifyUrl: null,
      youtubeChannelId: null,
      featured: false,
      status: "ACTIVE",
      sortOrder: 0,
    });
  });

  it("valida nombre 2–80, slug kebab, urls y youtubeChannelId", () => {
    expect(artistCreateSchema.safeParse({ name: "X" }).success).toBe(false);
    expect(artistCreateSchema.safeParse({ name: "a".repeat(81) }).success).toBe(false);
    expect(artistCreateSchema.safeParse({ name: "J Col", slug: "J Col" }).success).toBe(false);
    expect(artistCreateSchema.safeParse({ name: "J Col", slug: "j--col" }).success).toBe(false);
    expect(artistCreateSchema.safeParse({ name: "J Col", slug: "J-COL" }).success).toBe(true);
    expect(artistCreateSchema.safeParse({ name: "J Col", instagramUrl: "instagram.com/jcol" }).success).toBe(false);
    expect(artistCreateSchema.safeParse({ name: "J Col", instagramUrl: "https://instagram.com/jcol" }).success).toBe(true);
    expect(artistCreateSchema.safeParse({ name: "J Col", photoUrl: "/foto.jpg" }).success).toBe(false);
    expect(artistCreateSchema.safeParse({ name: "J Col", photoUrl: "/uploads/foto.jpg" }).success).toBe(true);
    expect(artistCreateSchema.safeParse({ name: "J Col", youtubeChannelId: "nope" }).success).toBe(false);
    expect(artistCreateSchema.safeParse({ name: "J Col", youtubeChannelId: "UC4aeSrfTsfYaX3CqRzTetnA" }).success).toBe(true);
    expect(artistCreateSchema.safeParse({ name: "J Col", status: "DRAFT" }).success).toBe(false);
  });
});

describe("artistUpdateSchema", () => {
  it("conserva undefined en campos no enviados y convierte '' a null", () => {
    const r = artistUpdateSchema.safeParse({ bio: "", spotifyUrl: null, city: " Medellín " });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.name).toBeUndefined();
    expect(r.data.genres).toBeUndefined();
    expect(r.data.bio).toBeNull();
    expect(r.data.spotifyUrl).toBeNull();
    expect(r.data.city).toBe("Medellín");
    expect("photoUrl" in r.data && r.data.photoUrl !== undefined).toBe(false);
  });
});
