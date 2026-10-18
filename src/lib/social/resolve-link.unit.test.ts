import { afterEach, describe, expect, it, vi } from "vitest";
import { isFacebookUrl, linkExternalId, normalizeLinkUrl, resolveLink } from "./resolve-link.js";

const html = (body: string, status = 200): Response => new Response(body, { status, headers: { "Content-Type": "text/html" } });
const json = (body: unknown): Response => new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("normalizeLinkUrl / linkExternalId", () => {
  it("quita hash y parámetros de tracking, conserva el resto", () => {
    expect(normalizeLinkUrl("https://Example.com/a?utm_source=x&id=2&fbclid=y#top ")).toBe("https://example.com/a?id=2");
    expect(normalizeLinkUrl("https://example.com/a?utm_source=x")).toBe("https://example.com/a");
    expect(linkExternalId("https://example.com/a")).toMatch(/^link:[0-9a-f]{40}$/);
    expect(linkExternalId("https://example.com/a")).toBe(linkExternalId("https://example.com/a"));
    expect(() => normalizeLinkUrl("no url")).toThrow();
  });

  it("isFacebookUrl", () => {
    expect(isFacebookUrl("https://www.facebook.com/sodimusic.oficial/posts/1")).toBe(true);
    expect(isFacebookUrl("https://fb.watch/abc/")).toBe(true);
    expect(isFacebookUrl("https://m.facebook.com/story.php?id=1")).toBe(true);
    expect(isFacebookUrl("https://www.youtube.com/watch?v=x")).toBe(false);
  });
});

describe("resolveLink", () => {
  it("YouTube: oEmbed + publishDate de watch, externalId yt:<id>, URL canónica", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.startsWith("https://www.youtube.com/oembed?")) {
        expect(url).toContain(encodeURIComponent("https://www.youtube.com/watch?v=CLWusvMQpcE"));
        return json({ title: "VICHE El Pady X Sodimusic", author_name: "EL PADY", author_url: "https://www.youtube.com/@elpadY92", thumbnail_url: "https://i.ytimg.com/vi/CLWusvMQpcE/hqdefault.jpg" });
      }
      if (url === "https://www.youtube.com/watch?v=CLWusvMQpcE") return html('<script>{"publishDate":"2026-10-16T15:00:10-07:00","channelId":"UC4aeSrfTsfYaX3CqRzTetnA"}</script>');
      return html("nope", 404);
    });
    vi.stubGlobal("fetch", fetchMock);
    const r = await resolveLink("https://youtu.be/CLWusvMQpcE?si=share");
    expect(r).toMatchObject({
      kind: "YOUTUBE_VIDEO",
      externalId: "yt:CLWusvMQpcE",
      url: "https://www.youtube.com/watch?v=CLWusvMQpcE",
      title: "VICHE El Pady X Sodimusic",
      author: "EL PADY",
      imageUrl: "https://i.ytimg.com/vi/CLWusvMQpcE/hqdefault.jpg",
    });
    expect(r.publishedAt?.toISOString()).toBe("2026-10-16T22:00:10.000Z");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("YouTube con red caída: devuelve miniatura por defecto y campos null (no lanza)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("ENETUNREACH"); }));
    const r = await resolveLink("https://www.youtube.com/watch?v=CLWusvMQpcE");
    expect(r).toMatchObject({ kind: "YOUTUBE_VIDEO", externalId: "yt:CLWusvMQpcE", title: null, author: null, publishedAt: null, imageUrl: "https://i.ytimg.com/vi/CLWusvMQpcE/hqdefault.jpg" });
  });

  it("Facebook: sin red, kind LINK y externalId link:sha1", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const r = await resolveLink("https://www.facebook.com/guillermo.perezbanquez/posts/123?fbclid=zzz");
    expect(r).toMatchObject({ kind: "LINK", url: "https://www.facebook.com/guillermo.perezbanquez/posts/123", title: null, imageUrl: null, publishedAt: null });
    expect(r.externalId).toMatch(/^link:[0-9a-f]{40}$/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("URL genérica: og:title/og:image/og:description, imagen relativa absolutizada, fecha article:published_time", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
        const h = init?.headers as Record<string, string> | undefined;
        expect(h?.["User-Agent"]).toMatch(/Mozilla/);
        return html(
          `<html><head><title>Fallback</title><meta content="Nota de prensa &amp; más" property="og:title"><meta property="og:image" content="/img/cover.jpg"><meta property="og:description" content="Descripción"><meta property="article:published_time" content="2026-10-10T08:00:00Z"><meta property="og:site_name" content="Diario"></head></html>`,
        );
      }),
    );
    const r = await resolveLink("https://news.example.com/nota?utm_campaign=x");
    expect(r).toMatchObject({
      kind: "LINK",
      url: "https://news.example.com/nota",
      title: "Nota de prensa & más",
      imageUrl: "https://news.example.com/img/cover.jpg",
      text: "Descripción",
      author: "Diario",
    });
    expect(r.publishedAt?.toISOString()).toBe("2026-10-10T08:00:00.000Z");
  });

  it("URL genérica sin og: usa <title>; si la red falla, todo null", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => html("<html><head><title>  Solo   título </title></head></html>")));
    expect((await resolveLink("https://example.com/x")).title).toBe("Solo título");
    vi.stubGlobal("fetch", vi.fn(async () => html("error", 503)));
    const r = await resolveLink("https://example.com/y");
    expect(r).toMatchObject({ kind: "LINK", title: null, imageUrl: null, text: null, publishedAt: null });
    await expect(resolveLink("no es url")).rejects.toThrow();
  });
});
