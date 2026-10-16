import { describe, expect, it } from "vitest";
import { slugify, uniqueSlug } from "./slugify.js";

describe("slugify", () => {
  it("pasa a minúsculas, quita acentos y usa guiones", () => {
    expect(slugify("Camiseta Sodimusic Negra")).toBe("camiseta-sodimusic-negra");
    expect(slugify("Gorra  Édición   Limitáda")).toBe("gorra-edicion-limitada");
    expect(slugify("Niño ñandú")).toBe("nino-nandu");
  });

  it("elimina símbolos y guiones en los extremos", () => {
    expect(slugify("  ¡Hoodie! (Champeta/Roots) --  ")).toBe("hoodie-champeta-roots");
    expect(slugify("---")).toBe("");
    expect(slugify("")).toBe("");
  });

  it("conserva números", () => {
    expect(slugify("Proyecto Montes 2026")).toBe("proyecto-montes-2026");
  });

  it("recorta a 80 caracteres sin dejar guion final", () => {
    const long = slugify("a".repeat(79) + " b");
    expect(long.length).toBeLessThanOrEqual(80);
    expect(long.endsWith("-")).toBe(false);
  });
});

describe("uniqueSlug", () => {
  it("devuelve el base si está libre", async () => {
    expect(await uniqueSlug("gorra", async () => false)).toBe("gorra");
  });

  it("añade -2, -3… mientras exista", async () => {
    const taken = new Set(["gorra", "gorra-2"]);
    expect(await uniqueSlug("gorra", async (s) => taken.has(s))).toBe("gorra-3");
  });

  it("usa 'item' si el base queda vacío", async () => {
    expect(await uniqueSlug("", async () => false)).toBe("item");
  });
});
