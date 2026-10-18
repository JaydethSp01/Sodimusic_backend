import { afterEach, describe, expect, it, vi } from "vitest";
import {
  channelIdFromHtml,
  extractYtInitialData,
  fetchChannelVideos,
  listVideosFromYtInitialData,
  parseChannelVideosHtml,
  parseRelativeTime,
  parseWatchHtml,
  resolveChannelId,
  searchVideos,
  youtubeVideoIdFromUrl,
} from "./youtube.js";

/** Fixture reducido de `/channel/<id>/videos` (layout nuevo `lockupViewModel` + clásico `videoRenderer`). */
const lockup = (id: string, title: string, when: string, whenShort = when, contentType = "LOCKUP_CONTENT_TYPE_VIDEO") => ({
  richItemRenderer: {
    content: {
      lockupViewModel: {
        contentImage: {
          thumbnailViewModel: {
            image: {
              sources: [
                { url: `https://i.ytimg.com/vi/${id}/hq720.jpg?sqp=a&rs=b`, width: 360, height: 202 },
                { url: `https://i.ytimg.com/vi/${id}/hq720.jpg?sqp=c&rs=d`, width: 720, height: 404 },
              ],
            },
          },
        },
        metadata: {
          lockupMetadataViewModel: {
            title: { content: title },
            metadata: {
              contentMetadataViewModel: {
                metadataRows: [
                  {
                    metadataParts: [
                      { text: { content: "385" }, accessibilityLabel: "385 vistas" },
                      { text: { content: whenShort }, accessibilityLabel: when },
                    ],
                  },
                ],
              },
            },
          },
        },
        contentId: id,
        contentType,
      },
    },
  },
});

const classic = (id: string, title: string, when: string) => ({
  richItemRenderer: {
    content: {
      videoRenderer: {
        videoId: id,
        thumbnail: { thumbnails: [{ url: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`, width: 480, height: 360 }] },
        title: { runs: [{ text: title }] },
        publishedTimeText: { simpleText: when },
      },
    },
  },
});

const ytInitialData = {
  responseContext: { serviceTrackingParams: [] },
  contents: {
    twoColumnBrowseResultsRenderer: {
      tabs: [
        { tabRenderer: { title: "Inicio" } },
        {
          tabRenderer: {
            title: "Videos",
            content: {
              richGridRenderer: {
                contents: [
                  lockup("CLWusvMQpcE", "VICHE El Pady X Sodimusic ft Raytim (Video oficial)", "hace 1 día"),
                  lockup("GHylX56Yp0U", "Tema viejo", "hace 1 año", "hace 1 a"),
                  lockup("PLAYLISTxxx", "Una lista", "hace 2 días", "hace 2 días", "LOCKUP_CONTENT_TYPE_PLAYLIST"),
                  classic("E8niHOYqzOM", "Clásico", "Streamed 2 weeks ago"),
                  classic("E8niHOYqzOM", "Clásico duplicado", "2 weeks ago"),
                ],
              },
            },
          },
        },
      ],
    },
  },
  metadata: { channelMetadataRenderer: { title: "EL PADY", externalId: "UC4aeSrfTsfYaX3CqRzTetnA" } },
};

const CHANNEL_HTML = `<!DOCTYPE html><html><head><meta property="og:title" content="EL PADY &amp; Co"><link rel="canonical" href="https://www.youtube.com/channel/UC4aeSrfTsfYaX3CqRzTetnA"></head><body><script>var ytcfg = {"a":1};</script><script nonce="x">var ytInitialData = ${JSON.stringify(ytInitialData)};</script><script>var ytInitialPlayerResponse = {"b":2};</script></body></html>`;

const WATCH_HTML = `<html><head><meta property="og:title" content="VICHE El Pady X Sodimusic"><meta itemprop="datePublished" content="2026-10-16T15:00:10-07:00"></head><body><script>var ytInitialPlayerResponse = {"videoDetails":{"videoId":"CLWusvMQpcE","author":"EL PADY","channelId":"UC4aeSrfTsfYaX3CqRzTetnA"},"microformat":{"playerMicroformatRenderer":{"ownerChannelName":"EL PADY","publishDate":"2026-10-16T15:00:10-07:00","uploadDate":"2026-10-16T15:00:10-07:00"}}};</script></body></html>`;

const HANDLE_HTML = `<html><head><meta property="og:title" content="EL PADY"></head><body><script>var ytInitialData = {"metadata":{"channelMetadataRenderer":{"externalId":"UC4aeSrfTsfYaX3CqRzTetnA"}}};</script></body></html>`;

function htmlResponse(body: string, status = 200): Response {
  return new Response(body, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("parseRelativeTime", () => {
  const now = new Date("2026-10-17T12:00:00Z");
  const day = 86_400_000;
  it.each<[string, number]>([
    ["hace 3 días", 3 * day],
    ["hace 1 día", day],
    ["hace 2 semanas", 14 * day],
    ["hace 1 mes", 30 * day],
    ["hace 3 meses", 90 * day],
    ["hace 1 año", 365 * day],
    ["hace 2 años", 730 * day],
    ["hace 5 horas", 5 * 3_600_000],
    ["hace 10 minutos", 600_000],
    ["Transmitido hace 1 mes", 30 * day],
    ["Estreno hace 2 días", 2 * day],
    ["3 days ago", 3 * day],
    ["2 weeks ago", 14 * day],
    ["1 month ago", 30 * day],
    ["Streamed 1 month ago", 30 * day],
    ["Premiered 4 hours ago", 4 * 3_600_000],
    ["1 year ago", 365 * day],
    ["hace 1 a", 365 * day],
  ])("%s", (text, delta) => {
    expect(parseRelativeTime(text, now)?.getTime()).toBe(now.getTime() - delta);
  });

  it("devuelve null si no lo entiende", () => {
    expect(parseRelativeTime("", now)).toBeNull();
    expect(parseRelativeTime(null, now)).toBeNull();
    expect(parseRelativeTime("385 vistas", now)).toBeNull();
    expect(parseRelativeTime("pronto", now)).toBeNull();
  });
});

describe("youtubeVideoIdFromUrl", () => {
  it.each([
    ["https://www.youtube.com/watch?v=CLWusvMQpcE", "CLWusvMQpcE"],
    ["https://youtu.be/CLWusvMQpcE?si=abc", "CLWusvMQpcE"],
    ["https://m.youtube.com/watch?feature=share&v=CLWusvMQpcE", "CLWusvMQpcE"],
    ["https://www.youtube.com/shorts/CLWusvMQpcE", "CLWusvMQpcE"],
    ["https://www.youtube.com/embed/CLWusvMQpcE", "CLWusvMQpcE"],
    ["https://www.youtube.com/@elpadY92", null],
    ["https://www.youtube.com/channel/UC4aeSrfTsfYaX3CqRzTetnA", null],
    ["https://www.facebook.com/watch?v=123", null],
    ["no es url", null],
  ])("%s → %s", (url, id) => {
    expect(youtubeVideoIdFromUrl(url)).toBe(id);
  });
});

describe("parser de ytInitialData", () => {
  it("extrae el JSON aunque haya otros scripts", () => {
    const data = extractYtInitialData(CHANNEL_HTML) as { metadata?: { channelMetadataRenderer?: { title?: string } } };
    expect(data?.metadata?.channelMetadataRenderer?.title).toBe("EL PADY");
    expect(extractYtInitialData("<html>sin datos</html>")).toBeNull();
  });

  it("lista videos de lockupViewModel y videoRenderer, sin listas ni duplicados, con texto relativo completo", () => {
    const videos = listVideosFromYtInitialData(ytInitialData);
    expect(videos.map((v) => v.videoId)).toEqual(["CLWusvMQpcE", "GHylX56Yp0U", "E8niHOYqzOM"]);
    expect(videos[0]).toMatchObject({
      title: "VICHE El Pady X Sodimusic ft Raytim (Video oficial)",
      publishedText: "hace 1 día",
      thumbnailUrl: "https://i.ytimg.com/vi/CLWusvMQpcE/hq720.jpg?sqp=c&rs=d",
    });
    // `text.content` viene recortado ("hace 1 a"); se usa accessibilityLabel
    expect(videos[1]?.publishedText).toBe("hace 1 año");
    expect(videos[2]).toMatchObject({ title: "Clásico", publishedText: "Streamed 2 weeks ago" });
    expect(listVideosFromYtInitialData(ytInitialData, 2)).toHaveLength(2);
  });

  it("parseChannelVideosHtml: id, nombre (og:title decodificado) y videos", () => {
    const page = parseChannelVideosHtml(CHANNEL_HTML);
    expect(page.channelId).toBe("UC4aeSrfTsfYaX3CqRzTetnA");
    expect(page.name).toBe("EL PADY & Co");
    expect(page.videos).toHaveLength(3);
  });

  it("channelIdFromHtml acepta externalId, itemprop y canonical", () => {
    expect(channelIdFromHtml(HANDLE_HTML)).toBe("UC4aeSrfTsfYaX3CqRzTetnA");
    expect(channelIdFromHtml('<meta itemprop="identifier" content="UCbCYvwiAsoIdumPbFBe1x6A">')).toBe("UCbCYvwiAsoIdumPbFBe1x6A");
    expect(channelIdFromHtml('<link rel="canonical" href="https://www.youtube.com/channel/UCbCYvwiAsoIdumPbFBe1x6A">')).toBe(
      "UCbCYvwiAsoIdumPbFBe1x6A",
    );
    expect(channelIdFromHtml("<html></html>")).toBeNull();
  });

  it("parseWatchHtml: publishDate exacta, channelId, autor y título", () => {
    const info = parseWatchHtml(WATCH_HTML);
    expect(info.publishedAt?.toISOString()).toBe("2026-10-16T22:00:10.000Z");
    expect(info.channelId).toBe("UC4aeSrfTsfYaX3CqRzTetnA");
    expect(info.channelName).toBe("EL PADY");
    expect(info.title).toBe("VICHE El Pady X Sodimusic");
    expect(parseWatchHtml("<html></html>")).toEqual({ publishedAt: null, channelId: null, channelName: null, title: null });
  });
});

describe("fetchChannelVideos (sin clave: HTML)", () => {
  it("fecha exacta de watch para los nuevos, relativa para los conocidos; miniatura estable; UA de navegador", async () => {
    const calls: string[] = [];
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      calls.push(url);
      const h = init?.headers as Record<string, string> | undefined;
      expect(h?.["User-Agent"]).toMatch(/Mozilla/);
      if (url.includes("/channel/UC4aeSrfTsfYaX3CqRzTetnA/videos")) return htmlResponse(CHANNEL_HTML);
      if (url.includes("watch?v=CLWusvMQpcE")) return htmlResponse(WATCH_HTML);
      if (url.includes("watch?v=E8niHOYqzOM")) return htmlResponse("<html>sin fecha</html>");
      return htmlResponse("not found", 404);
    });
    vi.stubGlobal("fetch", fetchMock);
    const now = new Date("2026-10-17T12:00:00Z");
    const posts = await fetchChannelVideos("UC4aeSrfTsfYaX3CqRzTetnA", {
      now: () => now,
      knownVideoIds: async (ids) => new Set(ids.filter((id) => id === "GHylX56Yp0U")),
    });
    expect(posts.map((p) => p.externalId)).toEqual(["yt:CLWusvMQpcE", "yt:GHylX56Yp0U", "yt:E8niHOYqzOM"]);
    // nuevo con watch OK → fecha exacta
    expect(posts[0]).toMatchObject({
      kind: "YOUTUBE_VIDEO",
      url: "https://www.youtube.com/watch?v=CLWusvMQpcE",
      imageUrl: "https://i.ytimg.com/vi/CLWusvMQpcE/hqdefault.jpg",
      author: "EL PADY & Co",
      publishedAtApprox: false,
    });
    expect(posts[0]?.publishedAt.toISOString()).toBe("2026-10-16T22:00:10.000Z");
    // conocido → no se consulta watch, fecha relativa aproximada
    expect(posts[1]?.publishedAtApprox).toBe(true);
    expect(posts[1]?.publishedAt.getTime()).toBe(now.getTime() - 365 * 86_400_000);
    // nuevo pero watch sin fecha → relativa
    expect(posts[2]?.publishedAtApprox).toBe(true);
    expect(posts[2]?.publishedAt.getTime()).toBe(now.getTime() - 14 * 86_400_000);
    expect(calls.filter((u) => u.includes("watch?v="))).toHaveLength(2);
  });

  it("respeta maxDateLookups y no falla si una página watch da error de red", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.includes("/videos")) return htmlResponse(CHANNEL_HTML);
        throw new Error("ECONNRESET");
      }),
    );
    const posts = await fetchChannelVideos("UC4aeSrfTsfYaX3CqRzTetnA", { maxDateLookups: 1 });
    expect(posts).toHaveLength(3);
    expect(posts.every((p) => p.publishedAtApprox)).toBe(true);
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2);
  });

  it("propaga el error HTTP del listado y rechaza channelId inválido", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => htmlResponse("nope", 500)));
    await expect(fetchChannelVideos("UC4aeSrfTsfYaX3CqRzTetnA")).rejects.toThrow(/HTTP 500/);
    await expect(fetchChannelVideos("no-es-un-canal")).rejects.toThrow(/channelId inválido/);
  });
});

describe("fetchChannelVideos / searchVideos (con clave: Data API v3)", () => {
  const apiItem = (videoId: string, publishedAt: string, title: string) => ({
    snippet: {
      publishedAt,
      title,
      description: "desc",
      channelTitle: "Canal",
      videoOwnerChannelTitle: "Sodimusic",
      thumbnails: { default: { url: "d.jpg" }, high: { url: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` } },
      resourceId: { videoId },
    },
  });

  it("playlistItems de la lista UU… con fecha exacta y miniatura high", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      expect(url).toContain("playlistItems?part=snippet&playlistId=UUbCYvwiAsoIdumPbFBe1x6A&maxResults=15&key=k1");
      return new Response(JSON.stringify({ items: [apiItem("7os2siROleM", "2026-10-01T10:00:00Z", "Nuevo"), { snippet: { title: "sin id" } }] }), {
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const posts = await fetchChannelVideos("UCbCYvwiAsoIdumPbFBe1x6A", { apiKey: "k1" });
    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({
      externalId: "yt:7os2siROleM",
      title: "Nuevo",
      author: "Sodimusic",
      imageUrl: "https://i.ytimg.com/vi/7os2siROleM/hqdefault.jpg",
      text: "desc",
    });
    expect(posts[0]?.publishedAt.toISOString()).toBe("2026-10-01T10:00:00.000Z");
    expect(posts[0]?.publishedAtApprox).toBeFalsy();
  });

  it("searchVideos: sin clave lanza sin tocar la red; con clave usa search?order=date&publishedAfter", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      expect(url).toContain("/search?part=snippet&q=Sodimusic&type=video&order=date&maxResults=15&publishedAfter=2026-04-20T12%3A00%3A00Z&key=k1");
      const { resourceId: _omit, ...snippet } = apiItem("x", "2026-10-16T22:00:10Z", "VICHE").snippet;
      return new Response(JSON.stringify({ items: [{ id: { videoId: "CLWusvMQpcE" }, snippet }] }), {
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    await expect(searchVideos("Sodimusic", {})).rejects.toThrow("Falta YOUTUBE_API_KEY");
    expect(fetchMock).not.toHaveBeenCalled();
    const posts = await searchVideos("Sodimusic", { apiKey: "k1", now: () => new Date("2026-10-17T12:00:00Z") });
    expect(posts.map((p) => p.externalId)).toEqual(["yt:CLWusvMQpcE"]);
  });
});

describe("resolveChannelId", () => {
  it("UC… y /channel/UC… sin red", async () => {
    vi.stubGlobal("fetch", vi.fn());
    expect(await resolveChannelId("UC4aeSrfTsfYaX3CqRzTetnA")).toEqual({
      channelId: "UC4aeSrfTsfYaX3CqRzTetnA",
      name: null,
      url: "https://www.youtube.com/channel/UC4aeSrfTsfYaX3CqRzTetnA",
    });
    expect((await resolveChannelId("https://www.youtube.com/channel/UCbCYvwiAsoIdumPbFBe1x6A/videos"))?.channelId).toBe("UCbCYvwiAsoIdumPbFBe1x6A");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("@handle y /c/nombre descargan la página y leen externalId + og:title", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url === "https://www.youtube.com/@elpadY92" || url === "https://www.youtube.com/c/ElPady") return htmlResponse(HANDLE_HTML);
      return htmlResponse("nope", 404);
    });
    vi.stubGlobal("fetch", fetchMock);
    expect(await resolveChannelId("https://www.youtube.com/@elpadY92")).toEqual({
      channelId: "UC4aeSrfTsfYaX3CqRzTetnA",
      name: "EL PADY",
      url: "https://www.youtube.com/channel/UC4aeSrfTsfYaX3CqRzTetnA",
    });
    expect((await resolveChannelId("@elpadY92"))?.channelId).toBe("UC4aeSrfTsfYaX3CqRzTetnA");
    expect((await resolveChannelId("https://youtube.com/c/ElPady"))?.channelId).toBe("UC4aeSrfTsfYaX3CqRzTetnA");
    await expect(resolveChannelId("https://www.youtube.com/@noexiste")).rejects.toThrow(/HTTP 404/);
    expect(await resolveChannelId("https://vimeo.com/x")).toBeNull();
    expect(await resolveChannelId("")).toBeNull();
  });

  it("devuelve null si la página no trae el id", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => htmlResponse("<html>vacío</html>")));
    expect(await resolveChannelId("@sinid")).toBeNull();
  });
});
