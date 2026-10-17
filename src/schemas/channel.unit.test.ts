import { describe, expect, it } from "vitest";
import { channelCreateSchema, channelReorderSchema, channelUpdateSchema, parseYoutubeChannelUrl } from "./channel.js";

describe("channelCreateSchema", () => {
  it("aplica valores por defecto", () => {
    const r = channelCreateSchema.safeParse({ name: "Sodimusic", url: "https://www.youtube.com/@sodimusic" });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data).toMatchObject({
      name: "Sodimusic",
      category: "Crew",
      featured: false,
      status: "ACTIVE",
      sortOrder: 0,
      description: null,
    });
    // optionalMediaUrl conserva undefined cuando el campo no se envía (la ruta lo guarda como null)
    expect(r.data.avatarUrl).toBeUndefined();
  });

  it("normaliza handle (quita @) y acepta channelId UC…", () => {
    const r = channelCreateSchema.safeParse({
      name: "X",
      url: "https://youtube.com/channel/UCbCYvwiAsoIdumPbFBe1x6A",
      channelId: "UCbCYvwiAsoIdumPbFBe1x6A",
      handle: "@sodimusic",
      description: "  Canal oficial  ",
    });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.handle).toBe("sodimusic");
    expect(r.data.channelId).toBe("UCbCYvwiAsoIdumPbFBe1x6A");
    expect(r.data.description).toBe("Canal oficial");
  });

  it("rechaza URL que no sea de YouTube, channelId inválido y status desconocido", () => {
    expect(channelCreateSchema.safeParse({ name: "X", url: "https://vimeo.com/x" }).success).toBe(false);
    expect(channelCreateSchema.safeParse({ name: "X", url: "https://youtube.com/@x", channelId: "abc" }).success).toBe(false);
    expect(channelCreateSchema.safeParse({ name: "X", url: "https://youtube.com/@x", status: "DRAFT" }).success).toBe(false);
    expect(channelCreateSchema.safeParse({ name: "", url: "https://youtube.com/@x" }).success).toBe(false);
  });

  it("acepta cadenas vacías como null en channelId/handle/featuredVideoUrl", () => {
    const r = channelCreateSchema.safeParse({
      name: "X",
      url: "https://youtube.com/@x",
      channelId: "",
      handle: "",
      featuredVideoUrl: "",
    });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.channelId).toBeNull();
    expect(r.data.handle).toBeNull();
    expect(r.data.featuredVideoUrl).toBeNull();
  });
});

describe("channelUpdateSchema", () => {
  it("conserva undefined en campos no enviados", () => {
    const r = channelUpdateSchema.safeParse({ featured: true });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.featured).toBe(true);
    expect(r.data.name).toBeUndefined();
    expect(r.data.description).toBeUndefined();
  });
});

describe("channelReorderSchema", () => {
  it("exige ids no vacío", () => {
    expect(channelReorderSchema.safeParse({ ids: [] }).success).toBe(false);
    expect(channelReorderSchema.safeParse({ ids: ["a", "b"] }).success).toBe(true);
  });
});

describe("parseYoutubeChannelUrl", () => {
  it("detecta channelId, handle, /c y /user", () => {
    expect(parseYoutubeChannelUrl("https://www.youtube.com/channel/UCbCYvwiAsoIdumPbFBe1x6A")).toEqual({
      channelId: "UCbCYvwiAsoIdumPbFBe1x6A",
      handle: null,
    });
    expect(parseYoutubeChannelUrl("https://youtube.com/@sodimusic?si=1")).toEqual({ channelId: null, handle: "sodimusic" });
    expect(parseYoutubeChannelUrl("https://www.youtube.com/c/Sodimusic/videos")).toEqual({ channelId: null, handle: "Sodimusic" });
    expect(parseYoutubeChannelUrl("https://www.youtube.com/user/sodi")).toEqual({ channelId: null, handle: "sodi" });
  });
  it("devuelve nulls si no reconoce la URL", () => {
    expect(parseYoutubeChannelUrl("no es url")).toEqual({ channelId: null, handle: null });
    expect(parseYoutubeChannelUrl("https://www.youtube.com/")).toEqual({ channelId: null, handle: null });
  });
});
