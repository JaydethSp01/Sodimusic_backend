import jwt from "jsonwebtoken";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "./hono-app.js";
import { prisma } from "./lib/prisma.js";
import { putMedia } from "./lib/storage.js";

const app = createApp();
const hasDb = Boolean(process.env.DATABASE_URL);

type ProductJson = {
  id: string;
  name: string;
  slug: string;
  status: string;
  category: string;
  images: string[];
  sizes: string[];
  priceCOP: number;
  stock: number | null;
};

const PREFIX = "vitest-prod-";

describe.skipIf(!hasDb)("Tienda: productos + uploads (DATABASE_URL)", () => {
  let token: string;
  const auth = (): Record<string, string> => ({ Authorization: `Bearer ${token}` });
  const json = (body: unknown, method = "POST"): RequestInit => ({
    method,
    headers: { ...auth(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  beforeAll(async () => {
    const secret = process.env.JWT_SECRET;
    expect(secret, "JWT_SECRET requerido").toBeTruthy();
    token = jwt.sign({ sub: "vitest-admin", email: "vitest@sodimusic.test" }, secret as string, { expiresIn: "10m" });
    await prisma.product.deleteMany({ where: { slug: { startsWith: PREFIX } } });
  });

  afterAll(async () => {
    await prisma.product.deleteMany({ where: { slug: { startsWith: PREFIX } } });
    await prisma.$disconnect();
  });

  it("rutas admin exigen token", async () => {
    const res = await app.request("http://localhost/api/admin/products");
    expect(res.status).toBe(401);
  });

  it("crea, lee, parchea y borra un producto", async () => {
    // Crear con slug explícito
    const created = await app.request(
      "http://localhost/api/admin/products",
      json({
        name: "Camiseta de prueba",
        slug: `${PREFIX}camiseta`,
        priceCOP: 65000,
        category: "Camisetas",
        sizes: ["S", " M ", ""],
        images: ["/uploads/fake.png"],
        stock: 5,
      }),
    );
    expect(created.status, await created.clone().text()).toBe(201);
    const p = (await created.json()) as ProductJson;
    expect(p.slug).toBe(`${PREFIX}camiseta`);
    expect(p.status).toBe("ACTIVE");
    expect(p.sizes).toEqual(["S", "M"]);
    expect(p.images).toEqual(["/uploads/fake.png"]);

    // Slug duplicado → 409
    const dup = await app.request(
      "http://localhost/api/admin/products",
      json({ name: "Otra", slug: `${PREFIX}camiseta`, priceCOP: 1 }),
    );
    expect(dup.status).toBe(409);

    // Listado admin lo incluye
    const list = await app.request("http://localhost/api/admin/products", { headers: auth() });
    expect(list.status).toBe(200);
    const lj = (await list.json()) as { items: ProductJson[] };
    expect(lj.items.some((x) => x.id === p.id)).toBe(true);

    // Público por slug
    const pub = await app.request(`http://localhost/api/products/by-slug/${p.slug}`);
    expect(pub.status).toBe(200);
    expect(((await pub.json()) as ProductJson).id).toBe(p.id);

    // PATCH
    const patched = await app.request(
      `http://localhost/api/admin/products/${p.id}`,
      json({ priceCOP: 70000, status: "SOLD_OUT", stock: null, slug: `${PREFIX}camiseta-v2` }, "PATCH"),
    );
    expect(patched.status, await patched.clone().text()).toBe(200);
    const pj = (await patched.json()) as ProductJson;
    expect(pj.priceCOP).toBe(70000);
    expect(pj.status).toBe("SOLD_OUT");
    expect(pj.stock).toBeNull();
    expect(pj.slug).toBe(`${PREFIX}camiseta-v2`);
    expect(pj.name).toBe("Camiseta de prueba");

    // PATCH con datos inválidos → 400
    const bad = await app.request(`http://localhost/api/admin/products/${p.id}`, json({ priceCOP: -1 }, "PATCH"));
    expect(bad.status).toBe(400);

    // PATCH a id inexistente → 404
    const missing = await app.request("http://localhost/api/admin/products/nope", json({ name: "x" }, "PATCH"));
    expect(missing.status).toBe(404);

    // DELETE
    const del = await app.request(`http://localhost/api/admin/products/${p.id}`, { method: "DELETE", headers: auth() });
    expect(del.status).toBe(200);
    const gone = await app.request(`http://localhost/api/products/by-slug/${pj.slug}`);
    expect(gone.status).toBe(404);
    const delAgain = await app.request(`http://localhost/api/admin/products/${p.id}`, { method: "DELETE", headers: auth() });
    expect(delAgain.status).toBe(404);
  });

  it("genera slug automáticamente (con sufijo si colisiona)", async () => {
    const a = await app.request(
      "http://localhost/api/admin/products",
      json({ name: `${PREFIX}Gorra Édición`, priceCOP: 1 }),
    );
    expect(a.status).toBe(201);
    const aj = (await a.json()) as ProductJson;
    expect(aj.slug).toBe(`${PREFIX}gorra-edicion`);

    const b = await app.request(
      "http://localhost/api/admin/products",
      json({ name: `${PREFIX}Gorra Édición`, priceCOP: 1 }),
    );
    expect(b.status).toBe(201);
    expect(((await b.json()) as ProductJson).slug).toBe(`${PREFIX}gorra-edicion-2`);
  });

  it("GET /api/products oculta DRAFT y filtra por categoría/featured", async () => {
    const cat = `${PREFIX}Cat`;
    const mk = (name: string, extra: Record<string, unknown>) =>
      app.request("http://localhost/api/admin/products", json({ name, priceCOP: 10, category: cat, ...extra }));
    const d = await mk(`${PREFIX}draft`, { slug: `${PREFIX}draft`, status: "DRAFT" });
    const act = await mk(`${PREFIX}active`, { slug: `${PREFIX}active`, status: "ACTIVE", featured: true, sortOrder: 2 });
    const so = await mk(`${PREFIX}soldout`, { slug: `${PREFIX}soldout`, status: "SOLD_OUT", sortOrder: 1 });
    expect([d.status, act.status, so.status]).toEqual([201, 201, 201]);

    const res = await app.request(`http://localhost/api/products?category=${encodeURIComponent(cat)}&pageSize=10`);
    expect(res.status).toBe(200);
    const j = (await res.json()) as { items: ProductJson[]; total: number; page: number; pageSize: number; categories: string[] };
    const slugs = j.items.map((x) => x.slug);
    expect(slugs).toEqual([`${PREFIX}soldout`, `${PREFIX}active`]);
    expect(slugs).not.toContain(`${PREFIX}draft`);
    expect(j.total).toBe(2);
    expect(j.page).toBe(1);
    expect(j.pageSize).toBe(10);
    expect(j.categories).toContain(cat);

    const feat = await app.request(`http://localhost/api/products?category=${encodeURIComponent(cat)}&featured=1`);
    const fj = (await feat.json()) as { items: ProductJson[] };
    expect(fj.items.map((x) => x.slug)).toEqual([`${PREFIX}active`]);

    const draftBySlug = await app.request(`http://localhost/api/products/by-slug/${PREFIX}draft`);
    expect(draftBySlug.status).toBe(404);

    // Admin sí ve el DRAFT
    const adminList = await app.request("http://localhost/api/admin/products", { headers: auth() });
    const al = (await adminList.json()) as { items: ProductJson[] };
    expect(al.items.some((x) => x.slug === `${PREFIX}draft`)).toBe(true);

    // pageSize se acota a 48
    const capped = await app.request("http://localhost/api/products?pageSize=500");
    expect(((await capped.json()) as { pageSize: number }).pageSize).toBe(48);
  });

  it("dashboard/stats incluye productsActive", async () => {
    const res = await app.request("http://localhost/api/admin/dashboard/stats", { headers: auth() });
    expect(res.status).toBe(200);
    const j = (await res.json()) as { productsActive: number };
    expect(typeof j.productsActive).toBe("number");
  });

  describe("uploads (fallback a MediaAsset sin BLOB_READ_WRITE_TOKEN)", () => {
    const prevToken = process.env.BLOB_READ_WRITE_TOKEN;
    const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const uploadedNames: string[] = [];

    beforeAll(() => {
      delete process.env.BLOB_READ_WRITE_TOKEN;
    });
    afterAll(async () => {
      if (prevToken !== undefined) process.env.BLOB_READ_WRITE_TOKEN = prevToken;
      await prisma.mediaAsset.deleteMany({ where: { id: { in: uploadedNames } } });
    });

    it("putMedia guarda en MediaAsset y devuelve /uploads/<id>", async () => {
      const { url } = await putMedia({ buffer: PNG_BYTES, mime: "image/png", ext: ".png" });
      expect(url).toMatch(/^\/uploads\/[0-9a-f-]{36}\.png$/);
      const name = url.slice("/uploads/".length);
      uploadedNames.push(name);
      const row = await prisma.mediaAsset.findUnique({ where: { id: name } });
      expect(row?.mime).toBe("image/png");
      expect(row?.size).toBe(PNG_BYTES.length);

      const res = await app.request(`http://localhost${url}`);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("image/png");
      expect(res.headers.get("cache-control")).toContain("immutable");
      expect(Buffer.from(await res.arrayBuffer()).equals(PNG_BYTES)).toBe(true);
    });

    it("POST /api/admin/upload acepta imagen y la sirve por /uploads", async () => {
      const form = new FormData();
      form.append("file", new File([PNG_BYTES], "pixel.png", { type: "image/png" }));
      const res = await app.request("http://localhost/api/admin/upload", { method: "POST", headers: auth(), body: form });
      expect(res.status, await res.clone().text()).toBe(200);
      const { url } = (await res.json()) as { url: string };
      expect(url.startsWith("/uploads/")).toBe(true);
      uploadedNames.push(url.slice("/uploads/".length));

      const get = await app.request(`http://localhost${url}`);
      expect(get.status).toBe(200);
      expect(Buffer.from(await get.arrayBuffer()).equals(PNG_BYTES)).toBe(true);
    });

    it("rechaza tipos no permitidos y archivos > 4,5 MB", async () => {
      const badType = new FormData();
      badType.append("file", new File([PNG_BYTES], "x.svg", { type: "image/svg+xml" }));
      const r1 = await app.request("http://localhost/api/admin/upload", { method: "POST", headers: auth(), body: badType });
      expect(r1.status).toBe(400);

      const big = new FormData();
      big.append("file", new File([new Uint8Array(Math.floor(4.5 * 1024 * 1024) + 1)], "big.png", { type: "image/png" }));
      const r2 = await app.request("http://localhost/api/admin/upload", { method: "POST", headers: auth(), body: big });
      expect(r2.status).toBe(413);
      const j2 = (await r2.json()) as { error: string };
      expect(j2.error).toContain("4,5 MB");
    });

    it("GET /uploads/:name 404 si no existe y 400 si el nombre es inválido", async () => {
      const nf = await app.request("http://localhost/uploads/00000000-0000-0000-0000-000000000000.png");
      expect(nf.status).toBe(404);
      const bad = await app.request("http://localhost/uploads/..%2Fetc%2Fpasswd");
      expect([400, 404]).toContain(bad.status);
    });
  });
});
