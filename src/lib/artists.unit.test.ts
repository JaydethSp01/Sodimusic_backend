import { describe, expect, it } from "vitest";
import { artistSearchTerms, artistSeedsFromContent, artistSlug, mentionsArtist, nameMatchWhere, splitGenres } from "./artists.js";
import { SITE_CONTENT_DEFAULTS } from "./site-config-defaults.js";

describe("artistSlug", () => {
  it("usa slugify: minúsculas, sin acentos, guiones", () => {
    expect(artistSlug("JeiVy LaZy")).toBe("jeivy-lazy");
    expect(artistSlug("J Col")).toBe("j-col");
    expect(artistSlug("El Fammy")).toBe("el-fammy");
    expect(artistSlug("  Ñengo  Flów!  ")).toBe("nengo-flow");
    expect(artistSlug("###")).toBe("");
  });
});

describe("splitGenres", () => {
  it("divide por · y comas, recorta y quita repetidos", () => {
    expect(splitGenres("Reggaeton · Trap · Afrobeat")).toEqual(["Reggaeton", "Trap", "Afrobeat"]);
    expect(splitGenres("Trap, trap ,Dancehall")).toEqual(["Trap", "Dancehall"]);
    expect(splitGenres("")).toEqual([]);
    expect(splitGenres(null)).toEqual([]);
  });
});

describe("artistSearchTerms / mentionsArtist", () => {
  it("nombre + alias sin vacíos, repetidos ni comodines SQL", () => {
    expect(artistSearchTerms({ name: " J Col ", aliases: ["J Col El Crazy", "j col", "", "  ", "J%Col_"] })).toEqual([
      "J Col",
      "J Col El Crazy",
      "JCol",
    ]);
    expect(artistSearchTerms({ name: "El Vega", aliases: null })).toEqual(["El Vega"]);
  });

  it("asocia por nombre o alias sin distinguir mayúsculas", () => {
    const art = { name: "J Col", aliases: ["El Crazy"] };
    expect(mentionsArtist("VICHE - J COL x EL PADY (Video Oficial)", art)).toBe(true);
    expect(mentionsArtist("el crazy en el estudio", art)).toBe(true);
    expect(mentionsArtist("JeiVy LaZy - Sesión", art)).toBe(false);
    expect(mentionsArtist(null, art)).toBe(false);
  });

  it("nameMatchWhere genera un contains insensible por término", () => {
    expect(nameMatchWhere("artistName", ["J Col", "El Crazy"])).toEqual([
      { artistName: { contains: "J Col", mode: "insensitive" } },
      { artistName: { contains: "El Crazy", mode: "insensitive" } },
    ]);
    expect(nameMatchWhere("title", [])).toEqual([]);
  });
});

describe("artistSeedsFromContent", () => {
  it("siembra productor principal (destacado, orden 0) y miembros del crew desde las defaults", () => {
    const seeds = artistSeedsFromContent(SITE_CONTENT_DEFAULTS);
    expect(seeds.map((s) => s.slug)).toEqual(["jeivy-lazy", "j-col", "el-fammy", "el-vega"]);
    const producer = seeds[0]!;
    expect(producer).toMatchObject({
      name: "JeiVy LaZy",
      role: "Productor principal",
      featured: true,
      sortOrder: 0,
      status: "ACTIVE",
      genres: ["Reggaeton", "Trap", "Afrobeat"],
      bio: SITE_CONTENT_DEFAULTS.artists.producerBio,
      photoUrl: null,
    });
    const jcol = seeds[1]!;
    expect(jcol).toMatchObject({
      name: "J Col",
      role: "Crew",
      featured: false,
      sortOrder: 1,
      genres: ["Reggaeton", "Trap", "Afrobeat"],
      shortBio: SITE_CONTENT_DEFAULTS.artists.members[0]!.bio,
      instagramUrl: null,
      spotifyUrl: null,
    });
  });

  it("respeta role/links de los miembros, descarta duplicados y enlaces que no son http(s)", () => {
    const content = {
      artists: {
        ...SITE_CONTENT_DEFAULTS.artists,
        producerName: "J Col",
        producerImageUrl: "/uploads/jcol.jpg",
        members: [
          {
            name: "J Col",
            genre: "Trap",
            bio: "dup",
            role: "Artista",
            instagramUrl: "https://instagram.com/jcol",
          },
          {
            name: "El Pady",
            genre: "Champeta · Afrobeat",
            bio: "Aliado",
            role: "Aliado",
            instagramUrl: "instagram.com/elpady",
            youtubeUrl: "https://youtube.com/@elpady",
            spotifyUrl: "",
            tiktokUrl: "https://tiktok.com/@elpady",
          },
        ],
      },
    };
    const seeds = artistSeedsFromContent(content);
    expect(seeds.map((s) => s.slug)).toEqual(["j-col", "el-pady"]);
    expect(seeds[0]!.role).toBe("Productor principal");
    expect(seeds[0]!.photoUrl).toBe("/uploads/jcol.jpg");
    expect(seeds[1]).toMatchObject({
      role: "Aliado",
      genres: ["Champeta", "Afrobeat"],
      instagramUrl: null,
      youtubeUrl: "https://youtube.com/@elpady",
      spotifyUrl: null,
      tiktokUrl: "https://tiktok.com/@elpady",
      sortOrder: 2,
    });
  });
});
