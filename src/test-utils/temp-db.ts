import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";

/** URL admin (misma instancia/credenciales que DATABASE_URL, sin parámetros que psql no entiende). */
export function adminDbUrl(): string {
  const base = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!base) throw new Error("DATABASE_URL requerido");
  const u = new URL(base);
  u.search = "";
  return u.toString();
}

/** URL de conexión a la BD temporal `name` (mismo host/credenciales, `schema=public`). */
export function tempDbUrl(name: string): string {
  const u = new URL(adminDbUrl());
  u.pathname = `/${name}`;
  u.search = "?schema=public";
  return u.toString();
}

/** Ejecuta `sql` con psql (acepta URLs de Prisma: se elimina `?schema=` y demás parámetros). */
export function psql(url: string, sql: string): string {
  const u = new URL(url);
  u.search = "";
  return execFileSync("psql", [u.toString(), "-v", "ON_ERROR_STOP=1", "-qAtc", sql], {
    encoding: "utf8",
    env: { ...process.env, PGOPTIONS: "-c client_min_messages=warning" },
  });
}

export type TempDb = { name: string; url: string; drop(): void };

/** Crea una BD temporal vía psql (`CREATE DATABASE`) y devuelve cómo borrarla (`DROP … WITH (FORCE)`). */
export function createTempDb(prefix = "vitest_tmp"): TempDb {
  const name = `${prefix}_${Date.now()}_${randomBytes(3).toString("hex")}`.toLowerCase();
  psql(adminDbUrl(), `CREATE DATABASE "${name}"`);
  return {
    name,
    url: tempDbUrl(name),
    drop: () => {
      psql(adminDbUrl(), `DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    },
  };
}
