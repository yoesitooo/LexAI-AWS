/**
 * Validador de Radicado — Función pura de validación del número de radicado colombiano
 *
 * Un radicado es el identificador único de un proceso judicial colombiano.
 * Estructura de 23 dígitos (de izquierda a derecha):
 *   - 5 dígitos: Código DANE del municipio
 *   - 2 dígitos: Entidad/jurisdicción
 *   - 2 dígitos: Especialidad
 *   - 3 dígitos: Despacho (número del juzgado)
 *   - 4 dígitos: Año del proceso
 *   - 7 dígitos: Consecutivo del caso
 *
 * Requisitos: R3.1, R3.2, R3.3, R3.4, R3.5
 */

import type { Result } from "./cpnu-client";

// =============================================================================
// TIPOS
// =============================================================================

/** Radicado descompuesto y validado */
export interface RadicadoValido {
  /** Cadena original de 23 dígitos */
  raw: string;
  /** Código DANE del municipio (5 dígitos) */
  dane: string;
  /** Código de entidad (2 dígitos) */
  entidad: string;
  /** Código de especialidad (2 dígitos) */
  especialidad: string;
  /** Número de despacho (3 dígitos) */
  despacho: string;
  /** Año del proceso (4 dígitos, valor numérico) */
  anio: number;
  /** Consecutivo del caso (7 dígitos) */
  consecutivo: string;
}

/** Error de validación del radicado */
export interface ErrorRadicado {
  /** Código de error para manejo programático */
  codigo: "formato_invalido" | "longitud_invalida" | "anio_fuera_de_rango";
  /** Mensaje descriptivo en español para el usuario */
  mensaje: string;
}

// =============================================================================
// CONSTANTES
// =============================================================================

/** Longitud exacta requerida del radicado */
const LONGITUD_RADICADO = 23;

/** Año mínimo permitido */
const ANIO_MINIMO = 1900;

/** Patrón que acepta solo dígitos 0-9 */
const PATRON_SOLO_DIGITOS = /^\d+$/;

// =============================================================================
// IMPLEMENTACIÓN
// =============================================================================

/**
 * Obtiene el año actual en la zona horaria America/Bogotá (UTC-5).
 * Colombia no tiene horario de verano, así que UTC-5 es fijo.
 */
function obtenerAnioActualColombia(): number {
  const ahora = new Date();
  // Usar Intl.DateTimeFormat para obtener el año en la zona horaria de Colombia
  const formato = new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/Bogota",
    year: "numeric",
  });
  const partes = formato.formatToParts(ahora);
  const parteAnio = partes.find((p) => p.type === "year");
  return parseInt(parteAnio!.value, 10);
}

/**
 * Valida la estructura y contenido de un número de radicado colombiano.
 *
 * @param input - Cadena a validar como radicado
 * @returns Result con RadicadoValido si es válido, o ErrorRadicado si no
 *
 * Requisitos cubiertos:
 * - R3.1: Acepta solo 23 caracteres, todos dígitos 0-9
 * - R3.2: Rechaza vacíos, espacios, no-dígitos, longitud distinta de 23
 * - R3.3: Descompone estructura 5+2+2+3+4+7
 * - R3.4: Rechaza año < 1900 o > año actual en America/Bogotá
 * - R3.5: Completa validación rápidamente (función pura sin I/O)
 */
export function validarRadicado(input: string): Result<RadicadoValido, ErrorRadicado> {
  // R3.2: Rechazar si la longitud no es exactamente 23
  if (input.length !== LONGITUD_RADICADO) {
    return {
      ok: false,
      error: {
        codigo: "longitud_invalida",
        mensaje: `El radicado debe tener exactamente 23 dígitos. Se recibieron ${input.length} caracteres.`,
      },
    };
  }

  // R3.1, R3.2: Rechazar si contiene caracteres no numéricos (espacios, guiones, letras, etc.)
  if (!PATRON_SOLO_DIGITOS.test(input)) {
    return {
      ok: false,
      error: {
        codigo: "formato_invalido",
        mensaje:
          "El radicado debe contener únicamente dígitos numéricos (0-9), sin espacios, guiones ni otros separadores.",
      },
    };
  }

  // R3.3: Descomponer la estructura 5+2+2+3+4+7
  const dane = input.slice(0, 5);
  const entidad = input.slice(5, 7);
  const especialidad = input.slice(7, 9);
  const despacho = input.slice(9, 12);
  const anioStr = input.slice(12, 16);
  const consecutivo = input.slice(16, 23);

  const anio = parseInt(anioStr, 10);

  // R3.4: Validar que el año esté en rango [1900, año actual en Colombia]
  const anioActual = obtenerAnioActualColombia();

  if (anio < ANIO_MINIMO || anio > anioActual) {
    return {
      ok: false,
      error: {
        codigo: "anio_fuera_de_rango",
        mensaje: `El año del radicado (${anio}) está fuera del rango permitido (1900–${anioActual}).`,
      },
    };
  }

  // Validación exitosa: devolver el radicado descompuesto
  return {
    ok: true,
    value: {
      raw: input,
      dane,
      entidad,
      especialidad,
      despacho,
      anio,
      consecutivo,
    },
  };
}
