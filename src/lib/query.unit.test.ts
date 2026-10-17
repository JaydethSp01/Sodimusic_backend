import { describe, expect, it } from "vitest";
import { MAX_PAGE, pagination, searchTerm } from "./query.js";

const defaults = { pageSize: 24, max: 48 };

describe("pagination", () => {
  it("usa valores por defecto sin query", () => {
    expect(pagination({}, defaults)).toEqual({ page: 1, pageSize: 24, skip: 0 });
  });

  it("acepta enteros válidos y acota pageSize al máximo", () => {
    expect(pagination({ page: "3", pageSize: "10" }, defaults)).toEqual({ page: 3, pageSize: 10, skip: 20 });
    expect(pagination({ pageSize: "500" }, defaults).pageSize).toBe(48);
    expect(pagination({ page: String(MAX_PAGE) }, defaults).page).toBe(MAX_PAGE);
  });

  it("valores inválidos → página 1 / tamaño por defecto", () => {
    for (const bad of ["0", "-1", "1.5", "abc", "1e3", "NaN", "Infinity", "", " ", "9007199254740993", "1e308"]) {
      const r = pagination({ page: bad, pageSize: bad }, defaults);
      expect(r.page, `page=${bad}`).toBe(1);
      expect(r.pageSize, `pageSize=${bad}`).toBe(24);
      expect(r.skip).toBe(0);
    }
  });

  it("page > 100000 → 1", () => {
    expect(pagination({ page: String(MAX_PAGE + 1) }, defaults).page).toBe(1);
    expect(pagination({ page: "99999999999" }, defaults).page).toBe(1);
  });
});

describe("searchTerm", () => {
  it("elimina comodines SQL y recorta a 80 caracteres", () => {
    expect(searchTerm("%ana_%")).toBe("ana");
    expect(searchTerm("a".repeat(200))).toHaveLength(80);
    expect(searchTerm("  hola  ")).toBe("hola");
  });

  it("devuelve undefined si queda vacío", () => {
    expect(searchTerm(undefined)).toBeUndefined();
    expect(searchTerm("")).toBeUndefined();
    expect(searchTerm("%%__")).toBeUndefined();
    expect(searchTerm("   ")).toBeUndefined();
  });
});
