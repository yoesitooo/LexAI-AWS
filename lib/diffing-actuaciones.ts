/**
 * Diffing de actuaciones — LexAI MVP
 *
 * Compara actuaciones frescas obtenidas de la CPNU contra el histórico
 * almacenado de un proceso, identificando las nuevas por `id_actuacion_cpnu`.
 *
 * Lógica: nuevas = actuaciones_cpnu - actuaciones_historicas (por identidad)
 *
 * NO se filtra por palabras clave: toda actuación no registrada previamente
 * se considera nueva (R6.4).
 *
 * Las actuaciones nuevas se almacenan con `es_nueva = true` (R6.5).
 */

import type { ActuacionCPNU } from "./cpnu-client";
import { prisma } from "./db";

// =============================================================================
// TIPOS
// =============================================================================

/** Subconjunto mínimo de una actuación almacenada necesario para el diffing */
export interface ActuacionAlmacenada {
  id_actuacion_cpnu: string;
}

// =============================================================================
// FUNCIÓN PURA DE DIFFING
// =============================================================================

/**
 * Determina qué actuaciones de la CPNU son nuevas comparando contra el
 * histórico almacenado por identidad `id_actuacion_cpnu`.
 *
 * @param procesoId - ID del proceso (para contexto, no se usa en la lógica pura)
 * @param actuacionesFrescas - Actuaciones recién obtenidas de la CPNU
 * @param actuacionesAlmacenadas - Actuaciones ya existentes en la DB (solo id necesario)
 * @returns Array de actuaciones nuevas (no existentes en el histórico)
 */
export function diffActuaciones(
  _procesoId: string,
  actuacionesFrescas: ActuacionCPNU[],
  actuacionesAlmacenadas: ActuacionAlmacenada[]
): ActuacionCPNU[] {
  // Crear un Set con los IDs ya almacenados para búsqueda O(1)
  const idsAlmacenados = new Set(
    actuacionesAlmacenadas.map((a) => a.id_actuacion_cpnu)
  );

  // Filtrar: nueva = no existe en el histórico (por id_actuacion_cpnu)
  // La identidad de cada actuación CPNU es `idRegActuacion` (convertido a string)
  return actuacionesFrescas.filter(
    (fresca) => !idsAlmacenados.has(String(fresca.idRegActuacion))
  );
}

// =============================================================================
// FUNCIÓN DE PERSISTENCIA
// =============================================================================

/**
 * Almacena las actuaciones nuevas en la base de datos marcadas con `es_nueva = true`.
 *
 * Usa `createMany` con `skipDuplicates` para manejar posibles condiciones de
 * carrera sin fallar (el índice único `ux_actuacion_proceso_cpnu` garantiza
 * la integridad).
 *
 * @param procesoId - ID del proceso al que pertenecen las actuaciones
 * @param actuacionesNuevas - Actuaciones nuevas detectadas por el diffing
 * @returns Número de actuaciones efectivamente insertadas
 */
export async function almacenarActuacionesNuevas(
  procesoId: string,
  actuacionesNuevas: ActuacionCPNU[]
): Promise<number> {
  if (actuacionesNuevas.length === 0) {
    return 0;
  }

  const resultado = await prisma.actuacion.createMany({
    data: actuacionesNuevas.map((a) => ({
      proceso_id: procesoId,
      id_actuacion_cpnu: String(a.idRegActuacion),
      llave_proceso: a.llaveProceso || null,
      consecutivo: a.consActuacion ?? null,
      fecha_actuacion: parsearFecha(a.fechaActuacion),
      actuacion: a.actuacion,
      anotacion: a.anotacion || null,
      fecha_inicia: a.fechaInicia ? parsearFecha(a.fechaInicia) : null,
      fecha_finaliza: a.fechaFinaliza ? parsearFecha(a.fechaFinaliza) : null,
      fecha_registro: parsearFecha(a.fechaRegistro),
      existe_docs: a.existeDocs ?? false,
      es_nueva: true,
      analisis_completado: false,
    })),
    skipDuplicates: true,
  });

  return resultado.count;
}

// =============================================================================
// UTILIDADES INTERNAS
// =============================================================================

/**
 * Parsea una fecha string a Date. Maneja formatos ISO y DD/MM/YYYY.
 * Si el parseo falla, devuelve la fecha actual como fallback seguro.
 */
function parsearFecha(fechaStr: string): Date {
  if (!fechaStr) {
    return new Date();
  }

  // Intentar formato DD/MM/YYYY
  const partes = fechaStr.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (partes) {
    const [, dia, mes, anio] = partes;
    return new Date(`${anio}-${mes}-${dia}`);
  }

  // Intentar ISO directamente
  const fecha = new Date(fechaStr);
  if (!isNaN(fecha.getTime())) {
    return fecha;
  }

  // Fallback
  return new Date();
}
