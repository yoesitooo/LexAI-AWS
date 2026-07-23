/**
 * Verificación de conexión a PostgreSQL (health check) — LexAI MVP
 *
 * Utilidad reutilizable por web y worker para verificar que la conexión
 * a la base de datos está activa y operativa.
 *
 * Uso:
 *   import { checkDbHealth } from "@/lib/db-health";
 *   const result = await checkDbHealth();
 *   if (result.status === "healthy") { ... }
 */

import { prisma } from "@/lib/db";

export interface DbHealthResult {
  status: "healthy" | "unhealthy";
  /** Latencia en milisegundos de la consulta de prueba */
  latencyMs: number;
  /** Marca de tiempo UTC del chequeo */
  checkedAt: string;
  /** Mensaje de error si el estado es unhealthy */
  error?: string;
}

/**
 * Ejecuta un `SELECT 1` contra la base de datos para verificar conectividad.
 *
 * @param timeoutMs - Tiempo máximo de espera en ms (default: 5000)
 * @returns Resultado del health check con latencia y estado
 */
export async function checkDbHealth(timeoutMs: number = 5000): Promise<DbHealthResult> {
  const start = Date.now();
  const checkedAt = new Date().toISOString();

  try {
    // Carrera entre la consulta y el timeout
    const result = await Promise.race([
      prisma.$queryRaw`SELECT 1 AS ok`,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Health check timeout")), timeoutMs),
      ),
    ]);

    // Verificar que la respuesta es la esperada
    const rows = result as Array<{ ok: number }>;
    if (!rows || rows.length === 0 || rows[0]?.ok !== 1) {
      return {
        status: "unhealthy",
        latencyMs: Date.now() - start,
        checkedAt,
        error: "Respuesta inesperada del health check",
      };
    }

    return {
      status: "healthy",
      latencyMs: Date.now() - start,
      checkedAt,
    };
  } catch (err) {
    return {
      status: "unhealthy",
      latencyMs: Date.now() - start,
      checkedAt,
      error: err instanceof Error ? err.message : "Error desconocido",
    };
  }
}

/**
 * Desconecta el cliente de Prisma de forma limpia.
 * Útil para shutdown graceful del worker o teardown de pruebas.
 */
export async function disconnectDb(): Promise<void> {
  await prisma.$disconnect();
}
