import { describe, expect, it } from "vitest";
import { productCreateSchema, productUpdateSchema } from "./product.js";

describe("productCreateSchema", () => {
  it("aplica valores por defecto", () => {
    const r = productCreateSchema.safeParse({ name: "Gorra", priceCOP: 45000 });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data).toMatchObject({
      name: "Gorra",
      priceCOP: 45000,
      category: "Merch",
      images: [],
      sizes: [],
      status: "ACTIVE",
      featured: false,
      sortOrder: 0,
      description: null,
    });
    expect(r.data.slug).toBeUndefined();
  });

  it("rechaza nombre vacío, precio negativo o decimal y status desconocido", () => {
    expect(productCreateSchema.safeParse({ name: "", priceCOP: 1 }).success).toBe(false);
    expect(productCreateSchema.safeParse({ name: "X", priceCOP: -1 }).success).toBe(false);
    expect(productCreateSchema.safeParse({ name: "X", priceCOP: 10.5 }).success).toBe(false);
    expect(productCreateSchema.safeParse({ name: "X", priceCOP: 1, status: "HIDDEN" }).success).toBe(false);
  });

  it("valida imágenes: http(s) o /uploads/, máximo 8", () => {
    const ok = productCreateSchema.safeParse({
      name: "X",
      priceCOP: 1,
      images: ["https://cdn.example.com/a.jpg", "/uploads/abc.png"],
    });
    expect(ok.success).toBe(true);
    const badScheme = productCreateSchema.safeParse({ name: "X", priceCOP: 1, images: ["ftp://x/a.jpg"] });
    expect(badScheme.success).toBe(false);
    const relative = productCreateSchema.safeParse({ name: "X", priceCOP: 1, images: ["a.jpg"] });
    expect(relative.success).toBe(false);
    const tooMany = productCreateSchema.safeParse({
      name: "X",
      priceCOP: 1,
      images: Array.from({ length: 9 }, (_, i) => `/uploads/${i}.jpg`),
    });
    expect(tooMany.success).toBe(false);
  });

  it("recorta tallas y descarta vacías; máximo 12", () => {
    const r = productCreateSchema.safeParse({ name: "X", priceCOP: 1, sizes: [" S ", "", "M", "   "] });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.sizes).toEqual(["S", "M"]);
    const tooMany = productCreateSchema.safeParse({ name: "X", priceCOP: 1, sizes: Array(13).fill("S") });
    expect(tooMany.success).toBe(false);
  });

  it("valida formato de slug", () => {
    expect(productCreateSchema.safeParse({ name: "X", priceCOP: 1, slug: "gorra-xmen" }).success).toBe(true);
    expect(productCreateSchema.safeParse({ name: "X", priceCOP: 1, slug: "Gorra XMEN" }).success).toBe(false);
    expect(productCreateSchema.safeParse({ name: "X", priceCOP: 1, slug: "-gorra" }).success).toBe(false);
  });

  it("stock y compareAtCOP aceptan null y rechazan negativos", () => {
    expect(productCreateSchema.safeParse({ name: "X", priceCOP: 1, stock: null, compareAtCOP: null }).success).toBe(true);
    expect(productCreateSchema.safeParse({ name: "X", priceCOP: 1, stock: -1 }).success).toBe(false);
    expect(productCreateSchema.safeParse({ name: "X", priceCOP: 1, compareAtCOP: -5 }).success).toBe(false);
  });

  it("convierte descripción vacía en null", () => {
    const r = productCreateSchema.safeParse({ name: "X", priceCOP: 1, description: "   " });
    expect(r.success && r.data.description).toBe(null);
  });
});

describe("productUpdateSchema", () => {
  it("acepta objeto vacío y campos parciales sin inventar defaults", () => {
    const r = productUpdateSchema.safeParse({});
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.category).toBeUndefined();
      expect(r.data.status).toBeUndefined();
      expect(r.data.images).toBeUndefined();
    }
    const partial = productUpdateSchema.safeParse({ status: "SOLD_OUT", stock: 0 });
    expect(partial.success).toBe(true);
    if (partial.success) expect(partial.data).toEqual({ status: "SOLD_OUT", stock: 0 });
  });

  it("sigue validando tipos en parciales", () => {
    expect(productUpdateSchema.safeParse({ priceCOP: "100" }).success).toBe(false);
    expect(productUpdateSchema.safeParse({ images: ["x.jpg"] }).success).toBe(false);
  });
});
