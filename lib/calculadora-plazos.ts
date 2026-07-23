/**
 * Calculadora de plazos procesales — LexAI MVP
 *
 * Calcula la fecha límite de un plazo en días hábiles o calendario,
 * respetando el calendario colombiano (festivos Ley 51 de 1983) y la
 * zona horaria America/Bogotá (UTC-5).
 *
 * Requisitos cubiertos: R8.1, R8.2, R8.4, R8.5, R8.6, R8.7
 */

import { type FechaCO, fechaCODesdeComponentes } from "./formato";
import { esFestivo } from "./festivos";
import { type Result, ok, err } from "./repository";

// ---------------------------------------------------------------------------
// Tipos de error del cálculo
// ---------------------------------------------------------------------------

/**
 * Errores posibles al calcular la fecha límite de un plazo.
 */
export type ErrorCalculo =
  | { tipo: "dias_invalidos"; mensaje: string }
  | { tipo: "festivos_no_disponibles"; mensaje: string };

// ---------------------------------------------------------------------------
// Función principal
// ---------------------------------------------------------------------------

/**
 * Calcula la fecha límite de un plazo procesal.
 *
 * - Días hábiles: cuenta N días hábiles a partir del día siguiente a `fechaInicio`,
 *   excluyendo sábados, domingos y festivos nacionales de Colombia.
 * - Días calendario: suma N días consecutivos a `fechaInicio`.
 *
 * @param fechaInicio - Fecha desde la que se inicia el conteo (no se incluye)
 * @param dias - Cantidad de días del plazo (entero en 1–365)
 * @param esHabil - `true` para días hábiles, `false` para días calendario
 * @returns La fecha límite calculada o un error que señala revisión manual / reintento
 */
export function calcularFechaLimite(
  fechaInicio: FechaCO,
  dias: number,
  esHabil: boolean,
): Result<FechaCO, ErrorCalculo> {
  // ─── Validar N: entero en [1, 365] ──────────────────────────────────────────
  if (!Number.isInteger(dias) || dias < 1 || dias > 365) {
    return err({
      tipo: "dias_invalidos",
      mensaje: `El plazo debe ser un número entero entre 1 y 365. Recibido: ${dias}. Se requiere revisión manual.`,
    });
  }

  // ─── Días calendario: N consecutivos ────────────────────────────────────────
  if (!esHabil) {
    const resultado = avanzarDiasCalendario(fechaInicio, dias);
    return ok(resultado);
  }

  // ─── Días hábiles: contar N días lun-vie no festivos ────────────────────────
  try {
    const resultado = avanzarDiasHabiles(fechaInicio, dias);
    return ok(resultado);
  } catch (error: unknown) {
    // Si el servicio de festivos falla, señalar reintento
    return err({
      tipo: "festivos_no_disponibles",
      mensaje: `No se pudo acceder al servicio de festivos. Se requiere reintento. Detalle: ${
        error instanceof Error ? error.message : "Error desconocido"
      }`,
    });
  }
}

// ---------------------------------------------------------------------------
// Funciones internas
// ---------------------------------------------------------------------------

/**
 * Avanza N días calendario desde la fecha de inicio (sin incluirla).
 * Simplemente suma N días consecutivos.
 */
function avanzarDiasCalendario(inicio: FechaCO, dias: number): FechaCO {
  return sumarDias(inicio, dias);
}

/**
 * Avanza N días hábiles desde la fecha de inicio (sin incluirla).
 * Los días hábiles son lunes a viernes que no son festivos nacionales.
 *
 * Puede lanzar una excepción si `esFestivo` falla (servicio no disponible).
 */
function avanzarDiasHabiles(inicio: FechaCO, dias: number): FechaCO {
  let conteo = 0;
  let actual = inicio;

  while (conteo < dias) {
    // Avanzar un día calendario
    actual = sumarDias(actual, 1);

    // Verificar si es día hábil: lun(1) a vie(5) y no festivo
    if (esDiaHabil(actual)) {
      conteo++;
    }
  }

  return actual;
}

/**
 * Determina si una FechaCO es día hábil (lunes a viernes, no festivo).
 * Puede lanzar excepción si el servicio de festivos no está disponible.
 */
function esDiaHabil(fecha: FechaCO): boolean {
  // Fin de semana: sábado (6) o domingo (0)
  if (fecha.diaSemana === 0 || fecha.diaSemana === 6) {
    return false;
  }
  // Festivo nacional
  if (esFestivo(fecha)) {
    return false;
  }
  return true;
}

/**
 * Suma un número de días a una FechaCO y retorna la nueva FechaCO
 * con los componentes recalculados en America/Bogotá.
 */
function sumarDias(fecha: FechaCO, dias: number): FechaCO {
  return fechaCODesdeComponentes(
    fecha.anio,
    fecha.mes,
    fecha.dia + dias,
    fecha.hora,
    fecha.minuto,
    fecha.segundo,
  );
}
