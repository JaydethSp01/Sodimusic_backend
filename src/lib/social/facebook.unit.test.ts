import { afterEach, describe, expect, it, vi } from "vitest";
import { FACEBOOK_TOKEN_MISSING, fetchPagePosts, mapGraphPost, mapGraphPosts, titleFromMessage, type GraphPostsResponse } from "./facebook.js";

const fixture: GraphPostsResponse = {
  data: [
    {
      id: "100001_1",
      message: "¡Nuevo lanzamiento!\nYa disponible en todas las plataformas.",
      permalink_url: "https://www.facebook.com/sodimusic.oficial/posts/1",
      created_time: "2026-10-15T18:30:00+0000",
      full_picture: "https://scontent.example/full.jpg",
      attachments: { data: [{ title: "VICHE — El Pady", url: "https://l.facebook.com/x", unshimmed_url: "https://youtu.be/CLWusvMQpcE", media_type: "video", media: { image: { src: "https://scontent.example/att.jpg" } } }] },
    },
    {
      id: "100001_2",
      message: "Solo texto, sin adjunto ".repeat(10),
      permalink_url: "https://www.facebook.com/sodimusic.oficial/posts/2",
      created_time: "2026-10-14T10:00:00+0000",
      attachments: { data: [{ media_type: "photo", media: { image: { src: "https://scontent.example/photo.jpg" } } }] },
    },
    { id: "100001_3", created_time: "2026-10-13T10:00:00+0000" },
    { id: "100001_4", created_time: "fecha mala" },
    { message: "sin id", created_time: "2026-10-12T10:00:00+0000" },
  ],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("titleFromMessage", () => {
  it("primera línea no vacía, ≤ 120 caracteres", () => {
    expect(titleFromMessage("\n\n  Hola mundo \nsegunda")).toBe("Hola mundo");
    expect(titleFromMessage(null)).toBeNull();
    expect(titleFromMessage("   ")).toBeNull();
    const long = titleFromMessage("a".repeat(200));
    expect(long).toHaveLength(120);
    expect(long?.endsWith("…")).toBe(true);
  });
});

describe("mapGraphPosts", () => {
  it("mapea título (attachment > mensaje > genérico), imagen (full_picture > media), url y fecha", () => {
    const posts = mapGraphPosts(fixture, "Facebook Sodimusic");
    expect(posts.map((p) => p.externalId)).toEqual(["fb:100001_1", "fb:100001_2", "fb:100001_3"]);
    expect(posts[0]).toMatchObject({
      kind: "FACEBOOK_POST",
      title: "VICHE — El Pady",
      text: "¡Nuevo lanzamiento!\nYa disponible en todas las plataformas.",
      url: "https://www.facebook.com/sodimusic.oficial/posts/1",
      imageUrl: "https://scontent.example/full.jpg",
      author: "Facebook Sodimusic",
    });
    expect(posts[0]?.publishedAt.toISOString()).toBe("2026-10-15T18:30:00.000Z");
    expect(posts[1]?.title.length).toBeLessThanOrEqual(120);
    expect(posts[1]?.imageUrl).toBe("https://scontent.example/photo.jpg");
    expect(posts[2]).toMatchObject({ title: "Publicación en Facebook", url: "https://www.facebook.com/100001_3", imageUrl: null, text: null });
  });

  it("lanza con el mensaje de Graph si la respuesta trae error", () => {
    expect(() => mapGraphPosts({ error: { message: "Invalid OAuth access token", code: 190 } })).toThrow(/Graph API: Invalid OAuth access token \(code 190\)/);
    expect(mapGraphPost({ id: "x" })).toBeNull();
  });
});

describe("fetchPagePosts", () => {
  it("sin token lanza FACEBOOK_TOKEN_MISSING sin tocar la red", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchPagePosts("sodimusic.oficial", undefined)).rejects.toThrow(FACEBOOK_TOKEN_MISSING);
    await expect(fetchPagePosts("sodimusic.oficial", "  ")).rejects.toThrow(FACEBOOK_TOKEN_MISSING);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("con token llama a Graph v19.0/{page}/posts con los campos y limit=15", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      expect(url.startsWith("https://graph.facebook.com/v19.0/sodimusic.oficial/posts?fields=")).toBe(true);
      expect(decodeURIComponent(url)).toContain("attachments{title,url,unshimmed_url,media_type,media{image{src}}}");
      expect(url).toContain("&limit=15&access_token=tok");
      return new Response(JSON.stringify(fixture), { headers: { "Content-Type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);
    const posts = await fetchPagePosts("sodimusic.oficial", "tok", { author: "FB" });
    expect(posts).toHaveLength(3);
    expect(posts[0]?.author).toBe("FB");
  });

  it("propaga 400 de Graph como error (y no expone el token)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { message: "bad" } }), { status: 400 })));
    await expect(fetchPagePosts("sodimusic.oficial", "secreto")).rejects.toThrow(/HTTP 400/);
    await expect(fetchPagePosts("mal id/", "secreto")).rejects.toThrow(/Página de Facebook inválida/);
  });
});
