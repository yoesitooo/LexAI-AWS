/**
 * Diccionario es-CO — español de Colombia.
 *
 * Solo se incluyen las claves que difieren del diccionario genérico `es`.
 * Para el MVP de LexAI (orientado exclusivamente a Colombia), la mayoría
 * de las cadenas viven aquí. El diccionario genérico `es` sirve de fallback
 * para claves nuevas que aún no tengan variante colombiana.
 */

import type { DiccionarioES } from "./es";

/**
 * Diccionario parcial: solo las claves que se desean sobrescribir respecto al genérico.
 * Cualquier clave no incluida aquí se resuelve desde `es`.
 */
export const esCO: Partial<Record<keyof DiccionarioES, string>> = {
  // Ejemplo de variante colombiana (por ahora idéntica; se añaden diferencias a futuro)
  // "saludo": "¡Quiubo, {nombre}!",
};
