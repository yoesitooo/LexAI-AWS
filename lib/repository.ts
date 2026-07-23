/**
 * Utilidades de repositorio base — LexAI MVP
 *
 * Tipos y helpers compartidos por todos los repositorios del dominio.
 * Diseñados para ser reutilizables tanto en web como en worker.
 *
 * Convenciones de la base de datos:
 * - Todos los IDs son UUID generados por PostgreSQL (gen_random_uuid())
 * - Todas las marcas de tiempo son timestamptz almacenadas en UTC
 * - La presentación en America/Bogotá (UTC-5) se hace en la capa de UI
 */

/**
 * Resultado genérico para operaciones de repositorio (patrón Result).
 * Evita lanzar excepciones en la capa de dominio.
 */
export type Result<T, E> =
  | { ok: true; value: T }
  | { ok: false; error: E };

/** Crea un resultado exitoso */
export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

/** Crea un resultado de error */
export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

/**
 * Error base para operaciones de repositorio.
 */
export interface RepositoryError {
  /** Código de error técnico */
  code: string;
  /** Mensaje legible (no se expone al usuario) */
  message: string;
  /** Causa original para debug */
  cause?: unknown;
}

/**
 * Envuelve una operación de repositorio con manejo de errores genérico.
 * Captura excepciones de Prisma y las convierte en Result.
 */
export async function withRepository<T>(
  operation: () => Promise<T>,
  context: string,
): Promise<Result<T, RepositoryError>> {
  try {
    const value = await operation();
    return ok(value);
  } catch (cause) {
    const message =
      cause instanceof Error ? cause.message : "Error desconocido en repositorio";
    return err({
      code: "REPOSITORY_ERROR",
      message: `[${context}] ${message}`,
      cause,
    });
  }
}

/**
 * Genera una marca de tiempo UTC (ahora).
 * Utilidad para consistencia en las operaciones de escritura.
 */
export function nowUtc(): Date {
  return new Date();
}
