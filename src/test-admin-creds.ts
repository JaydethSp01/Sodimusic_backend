/**
 * Credenciales para tests de admin: env o valores del seed de Prisma (prisma/seed.ts).
 */
const SEED_EMAIL = "Jeivymusicdinero@gmail.com";
const SEED_PASSWORD = "sodimusic2016";

export function getAdminCredentials(): { email: string; password: string } | null {
  const email = (
    process.env.E2E_ADMIN_EMAIL?.trim() ||
    process.env.ADMIN_EMAIL?.trim() ||
    SEED_EMAIL
  ).trim();
  let password = (process.env.E2E_ADMIN_PASSWORD?.trim() || process.env.ADMIN_PASSWORD?.trim() || "").trim();
  if (!password && email.toLowerCase() === SEED_EMAIL.toLowerCase()) {
    password = SEED_PASSWORD;
  }
  if (!email || !password) {
    return null;
  }
  return { email, password };
}
