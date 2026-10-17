import { describe, expect, it } from "vitest";
import { PLACEHOLDER_RELEASE_SLUG, PLACEHOLDER_RELEASE_TITLE, shouldDeletePlaceholderRelease } from "./v3-rules.js";

const intact = { slug: PLACEHOLDER_RELEASE_SLUG, title: PLACEHOLDER_RELEASE_TITLE, spotifyUrl: null, youtubeUrl: null };

describe("shouldDeletePlaceholderRelease", () => {
  it("borra solo el placeholder intacto", () => {
    expect(shouldDeletePlaceholderRelease(intact)).toBe(true);
    expect(shouldDeletePlaceholderRelease({ ...intact, spotifyUrl: "" })).toBe(true);
  });

  it("conserva si cambió el título o tiene enlaces", () => {
    expect(shouldDeletePlaceholderRelease({ ...intact, title: "Mi single real" })).toBe(false);
    expect(shouldDeletePlaceholderRelease({ ...intact, spotifyUrl: "https://open.spotify.com/track/x" })).toBe(false);
    expect(shouldDeletePlaceholderRelease({ ...intact, youtubeUrl: "https://youtu.be/x" })).toBe(false);
    expect(shouldDeletePlaceholderRelease({ ...intact, slug: "otro" })).toBe(false);
  });
});
