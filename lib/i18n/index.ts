/**
 * Capa de internacionalización (i18n) — LexAI MVP
 *
 * Locale fijo: es-CO con fallback a español genérico (es).
 * Reglas:
 *  1. Si la clave existe en es-CO, usar ese valor.
 *  2. Si no, buscar en es genérico.
 *  3. Si no existe en ninguno de los dos, NUNCA devolver el identificador técnico.
 *     En su lugar, devolver un texto amigable y registrar la clave faltante.
 *  4. Soporte de interpolación: `{variable}` se reemplaza con el parámetro correspondiente.
 *
 * Requisitos cubiertos: R14.1, R14.2, R14.7
 */

import { es, esCO } from "./diccionarios";
import type { ClaveI18n } from "./diccionarios";

// ---------------------------------------------------------------------------
// Registro de claves faltantes (para awareness del desarrollador)
// ---------------------------------------------------------------------------

/** Conjunto de claves que se han intentado resolver sin éxito */
const _clavesFaltantes = new Set<string>();

/**
 * Devuelve las claves que se intentaron resolver pero no existen en ningún diccionario.
 * Útil para pruebas y para reportes de cobertura de traducciones.
 */
export function obtenerClavesFaltantes(): ReadonlySet<string> {
  return _clavesFaltantes;
}

/**
 * Limpia el registro de claves faltantes. Útil para tests.
 */
export function limpiarClavesFaltantes(): void {
  _clavesFaltantes.clear();
}

// ---------------------------------------------------------------------------
// Hook de logging configurable (para poder testearlo sin console.warn real)
// ---------------------------------------------------------------------------

type LogFn = (mensaje: string) => void;
let _logClaveFaltante: LogFn = (mensaje) => {
  // eslint-disable-next-line no-console
  console.warn(mensaje);
};

/**
 * Permite inyectar un logger alternativo (para tests o integración con observabilidad).
 */
export function configurarLogClaveFaltante(fn: LogFn): void {
  _logClaveFaltante = fn;
}

// ---------------------------------------------------------------------------
// Texto de respaldo cuando la clave no se encuentra
// ---------------------------------------------------------------------------

/**
 * Texto amigable que se muestra al usuario cuando no hay traducción disponible.
 * Cumple R14.2: "sin dejar la interfaz vacía ni mostrar identificadores técnicos".
 */
const TEXTO_FALTANTE = "Texto no disponible";

// ---------------------------------------------------------------------------
// Resolución de claves con interpolación
// ---------------------------------------------------------------------------

/**
 * Resuelve una cadena reemplazando placeholders `{key}` con los valores de `params`.
 */
function interpolar(plantilla: string, params?: Record<string, string | number>): string {
  if (!params) return plantilla;
  return plantilla.replace(/\{(\w+)\}/g, (_match, key: string) => {
    const valor = params[key];
    return valor !== undefined ? String(valor) : `{${key}}`;
  });
}

/**
 * Resuelve la cadena de texto para una clave de internacionalización.
 *
 * Orden de resolución:
 *  1. es-CO (variante colombiana)
 *  2. es (genérico)
 *  3. Texto amigable de respaldo (nunca el identificador técnico)
 *
 * @param key   - Clave del diccionario (ej. "auth.login.titulo")
 * @param params - Valores de interpolación (ej. { nombre: "Juan" })
 * @returns La cadena localizada con los parámetros interpolados.
 *
 * @example
 * t("saludo", { nombre: "Juan" }) // → "Hola, Juan"
 * t("auth.login.titulo")          // → "Iniciar sesión"
 * t("clave.inexistente")          // → "Texto no disponible" (y registra la clave faltante)
 */
export function t(key: string, params?: Record<string, string | number>): string {
  // 1. Buscar en es-CO (solo propiedades propias, no heredadas del prototipo)
  if (Object.prototype.hasOwnProperty.call(esCO, key)) {
    const valorCO = esCO[key as ClaveI18n];
    if (valorCO !== undefined) {
      return interpolar(valorCO, params);
    }
  }

  // 2. Buscar en es genérico (solo propiedades propias)
  if (Object.prototype.hasOwnProperty.call(es, key)) {
    const valorES = es[key as ClaveI18n];
    if (valorES !== undefined) {
      return interpolar(valorES, params);
    }
  }

  // 3. Clave no encontrada — registrar y devolver texto amigable
  if (!_clavesFaltantes.has(key)) {
    _clavesFaltantes.add(key);
    _logClaveFaltante(`[i18n] Clave de traducción faltante: "${key}"`);
  }

  return TEXTO_FALTANTE;
}

// ---------------------------------------------------------------------------
// Re-exports útiles
// ---------------------------------------------------------------------------

export type { ClaveI18n };
export { es, esCO } from "./diccionarios";
