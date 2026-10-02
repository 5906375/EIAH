import type { PrismaClient } from "@repo/db";

/**
 * ADR-011 §2.3: administrador da plataforma EIAH = lista fixa de e-mails no servidor
 * (`EIAH_PLATFORM_ADMIN_EMAILS`, separados por vírgula). Não é alterável pela interface e não
 * depende do papel no tenant. Sem lista configurada, ninguém é administrador (fail-closed).
 */
export const PLATFORM_ADMIN_EMAILS_ENV = "EIAH_PLATFORM_ADMIN_EMAILS";

export function readPlatformAdminEmails(raw: string | undefined = process.env[PLATFORM_ADMIN_EMAILS_ENV]) {
  return new Set(
    (raw ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter((email) => email.includes("@")),
  );
}

export function isPlatformAdminEmail(email: string | null | undefined, raw?: string) {
  if (!email) return false;
  return readPlatformAdminEmails(raw).has(email.trim().toLowerCase());
}

/** Resolve o usuário autenticado e diz se ele é administrador da plataforma EIAH. */
export async function readPlatformAdmin(params: { prisma: PrismaClient; userId: string | null | undefined }) {
  if (!params.userId) return null;
  const user = await params.prisma.user.findUnique({
    where: { id: params.userId },
    select: { id: true, email: true },
  });
  if (!user?.email || !isPlatformAdminEmail(user.email)) return null;
  return { userId: user.id, email: user.email.trim().toLowerCase() };
}
