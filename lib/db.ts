/**
 * Singleton de Prisma Client — LexAI MVP
 *
 * Provee una instancia compartida de PrismaClient reutilizable tanto por el
 * servicio web (Next.js) como por el worker (node-cron).
 *
 * En desarrollo, reutiliza la instancia para evitar agotar las conexiones
 * durante hot reload de Next.js. En producción, crea una sola instancia.
 *
 * Uso:
 *   import { prisma } from "@/lib/db";
 */

import { PrismaClient } from "@/lib/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * Instancia singleton de Prisma Client.
 *
 * Configuración:
 * - Driver adapter: @prisma/adapter-pg (requerido en Prisma 7)
 * - Conexión configurada por DATABASE_URL (validada en lib/config.ts)
 */
function createPrismaClient(): PrismaClient {
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL ?? "",
  });
  return new PrismaClient({ adapter });
}

export const prisma: PrismaClient =
  globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
