/**
 * Tipos compartidos del Adaptador LLM — LexAI MVP
 *
 * Define la interfaz genérica que todos los proveedores de LLM deben cumplir.
 * El adaptador se selecciona por la variable de entorno LLM_PROVIDER sin
 * cambios de código (R7.1, R7.8).
 */

import type { Result } from "@/lib/repository";

// =============================================================================
// OPCIONES DE SOLICITUD
// =============================================================================

/** Opciones configurables por solicitud al LLM */
export interface OpcionesLLM {
  /** Temperatura de generación (0–2). Default: 0.2 para análisis determinista */
  temperatura?: number;
  /** Máximo de tokens en la respuesta */
  maxTokens?: number;
  /** Timeout en milisegundos. Default: 30_000 (30 s) */
  timeoutMs?: number;
  /** Mensaje de sistema/contexto para el LLM */
  sistema?: string;
}

// =============================================================================
// ERRORES
// =============================================================================

/** Tipos de fallo del adaptador LLM */
export type TipoErrorLLM =
  | "timeout"
  | "auth"
  | "rate_limit"
  | "servidor"
  | "red"
  | "respuesta_invalida"
  | "proveedor_no_soportado"
  | "configuracion";

/** Error estructurado del adaptador LLM */
export interface ErrorLLM {
  tipo: TipoErrorLLM;
  mensaje: string;
  /** Información adicional para debug (no exponer al usuario) */
  detalle?: string;
}

// =============================================================================
// INTERFAZ DEL ADAPTADOR
// =============================================================================

/** Interfaz genérica del adaptador LLM intercambiable por variable de entorno */
export interface AdaptadorLLM {
  /** Nombre del proveedor (informativo) */
  readonly proveedor: string;

  /**
   * Envía un prompt al LLM y devuelve la respuesta como texto.
   * Timeout de 30 s por solicitud (configurable en opciones).
   * Nunca lanza excepciones — siempre devuelve Result.
   */
  completar(prompt: string, opciones?: OpcionesLLM): Promise<Result<string, ErrorLLM>>;
}

// =============================================================================
// CONSTANTES
// =============================================================================

/** Timeout por defecto en milisegundos (30 s, R7.1) */
export const TIMEOUT_LLM_MS = 30_000;

/** Temperatura por defecto para análisis procesal */
export const TEMPERATURA_DEFAULT = 0.2;

/** Máximo de tokens por defecto */
export const MAX_TOKENS_DEFAULT = 1024;
