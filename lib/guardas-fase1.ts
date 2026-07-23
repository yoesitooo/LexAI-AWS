/**
 * Guardas de Fase 1 — LexAI MVP
 *
 * Estas funciones rechazan operaciones que dependen de funcionalidad
 * planificada para Fase 2 (multi-tenant/despacho, roles, módulos standby).
 *
 * En Fase 1 el sistema opera con:
 * - Un solo tenant implícito (el abogado independiente)
 * - Sin roles ni permisos diferenciados
 * - Módulos de tutelas y redacción IA deshabilitados
 *
 * Al implementar cada módulo en Fase 2, se reemplaza la guarda
 * correspondiente con la lógica real de autorización/procesamiento.
 *
 * Requisitos: R13.5, R15.1, R15.2, R15.3, R15.4
 */

import { type Result, err } from "./repository";

// ─── Tipos ───────────────────────────────────────────────────────────────────

/**
 * Operaciones de Fase 2 que están bloqueadas en Fase 1.
 */
export type OperacionFase2 =
  | "DESPACHO"
  | "ROL"
  | "TUTELA"
  | "BORRADOR_IA"
  | "FRECUENCIA_REVISION";

/**
 * Error devuelto cuando se intenta una operación de Fase 2.
 */
export interface ErrorFase1 {
  /** Código de la operación rechazada */
  operacion: OperacionFase2;
  /** Mensaje amigable para el usuario */
  mensaje: string;
  /** Indicador de que es un rechazo controlado de Fase 1 */
  fase: 1;
}

/**
 * Descripción legible de cada operación bloqueada.
 */
const MENSAJES_FASE2: Record<OperacionFase2, string> = {
  DESPACHO:
    "La gestión de despachos (multi-tenant) no está disponible en Fase 1. " +
    "Cada abogado opera de forma independiente.",
  ROL:
    "La gestión de roles y permisos no está disponible en Fase 1. " +
    "Todos los usuarios autenticados tienen acceso completo a sus datos.",
  TUTELA:
    "El módulo de tutelas no está disponible en Fase 1. Próximamente.",
  BORRADOR_IA:
    "El módulo de redacción de demandas/tutelas con IA no está disponible en Fase 1. Próximamente.",
  FRECUENCIA_REVISION:
    "La configuración de frecuencia de revisión no está disponible en Fase 1. " +
    "La revisión se ejecuta diariamente en días hábiles.",
};

// ─── Guardas ─────────────────────────────────────────────────────────────────

/**
 * Verifica si una operación de Fase 2 está permitida.
 *
 * En Fase 1, **todas** las operaciones de Fase 2 están bloqueadas.
 * Devuelve un Result con error descriptivo si no está disponible.
 *
 * @param operacion - Identificador de la operación a verificar
 * @returns Result con `ok(true)` si la operación es válida, o `err(ErrorFase1)` si no
 *
 * @example
 * ```typescript
 * const resultado = verificarFase1("DESPACHO");
 * if (!resultado.ok) {
 *   return res.status(403).json({ error: resultado.error.mensaje });
 * }
 * ```
 */
export function verificarFase1(operacion: OperacionFase2): Result<true, ErrorFase1> {
  return err({
    operacion,
    mensaje: MENSAJES_FASE2[operacion],
    fase: 1,
  });
}

/**
 * Verifica que una operación NO dependa de la asignación a un despacho.
 *
 * En Fase 1 no existe la entidad despacho. Esta guarda rechaza cualquier
 * intento de filtrar, asignar o gestionar despachos.
 *
 * Requisitos: R15.1, R15.3
 */
export function verificarSinDespacho(): Result<true, ErrorFase1> {
  return verificarFase1("DESPACHO");
}

/**
 * Verifica que una operación NO dependa de roles o permisos.
 *
 * En Fase 1 no existen roles. Todo usuario autenticado accede a sus propios datos.
 * Esta guarda rechaza cualquier intento de verificar, asignar o gestionar roles.
 *
 * Requisitos: R15.2, R15.3
 */
export function verificarSinRol(): Result<true, ErrorFase1> {
  return verificarFase1("ROL");
}

/**
 * Verifica que una operación del módulo de tutelas esté disponible.
 *
 * En Fase 1 el módulo está en standby. No se ejecutan operaciones sobre datos.
 *
 * Requisitos: R13.5
 */
export function verificarModuloTutela(): Result<true, ErrorFase1> {
  return verificarFase1("TUTELA");
}

/**
 * Verifica que una operación del módulo de redacción IA esté disponible.
 *
 * En Fase 1 el módulo está en standby. No se ejecutan operaciones sobre datos.
 *
 * Requisitos: R13.5
 */
export function verificarModuloBorradorIA(): Result<true, ErrorFase1> {
  return verificarFase1("BORRADOR_IA");
}

/**
 * Verifica que la frecuencia de revisión sea modificable.
 *
 * En Fase 1, la frecuencia es fija ('diaria_habiles') y no editable.
 *
 * Requisitos: R15.4
 */
export function verificarFrecuenciaEditable(): Result<true, ErrorFase1> {
  return verificarFase1("FRECUENCIA_REVISION");
}

// ─── Utilidades ──────────────────────────────────────────────────────────────

/**
 * Comprueba si un ErrorFase1 indica que la operación no está disponible.
 * Útil para distinguir errores de Fase 1 de errores genéricos.
 */
export function esErrorFase1(error: unknown): error is ErrorFase1 {
  return (
    typeof error === "object" &&
    error !== null &&
    "fase" in error &&
    (error as ErrorFase1).fase === 1 &&
    "operacion" in error &&
    "mensaje" in error
  );
}

/**
 * Lista de todas las operaciones bloqueadas en Fase 1.
 * Útil para documentación y pruebas.
 */
export const OPERACIONES_FASE2: readonly OperacionFase2[] = [
  "DESPACHO",
  "ROL",
  "TUTELA",
  "BORRADOR_IA",
  "FRECUENCIA_REVISION",
] as const;
