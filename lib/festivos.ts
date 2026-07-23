/**
 * Servicio de festivos nacionales de Colombia — Ley 51 de 1983
 *
 * Genera los 18 festivos nacionales de Colombia por año, aplicando
 * el traslado "Ley Emiliani" al lunes siguiente cuando corresponde.
 *
 * Categorías de festivos:
 *  1. Fijos (nunca se trasladan): Ene 1, May 1, Jul 20, Ago 7, Dic 8, Dic 25
 *  2. Trasladados al lunes siguiente (Ley Emiliani):
 *     Ene 6 (Reyes), Mar 19 (San José), Jun 29 (San Pedro y San Pablo),
 *     Ago 15 (Asunción), Oct 12 (Día de la Raza), Nov 1 (Todos los Santos),
 *     Nov 11 (Independencia de Cartagena)
 *  3. Dependientes de Pascua:
 *     - Jueves Santo (-3) y Viernes Santo (-2): NO se trasladan
 *     - Ascensión del Señor (+43): se traslada al lunes siguiente
 *     - Corpus Christi (+64): se traslada al lunes siguiente
 *     - Sagrado Corazón (+71): se traslada al lunes siguiente
 *
 * Requisitos cubiertos: R8.3
 */

import { FechaCO, crearFechaCO, fechaCODesdeComponentes } from "./formato";

// ---------------------------------------------------------------------------
// Cálculo de la fecha de Pascua (algoritmo anónimo gregoriano)
// ---------------------------------------------------------------------------

/**
 * Calcula la fecha de Domingo de Pascua para un año dado
 * usando el algoritmo anónimo gregoriano (Computus).
 *
 * Retorna { mes, dia } donde mes es 1-indexed (3=marzo, 4=abril).
 */
function calcularPascua(anio: number): { mes: number; dia: number } {
  const a = anio % 19;
  const b = Math.floor(anio / 100);
  const c = anio % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return { mes, dia };
}

// ---------------------------------------------------------------------------
// Utilidades internas
// ---------------------------------------------------------------------------

/**
 * Crea un Date UTC a partir de año, mes (1-indexed) y día.
 * Usado internamente para aritmética de fechas simple.
 */
function dateUTC(anio: number, mes: number, dia: number): Date {
  return new Date(Date.UTC(anio, mes - 1, dia));
}

/**
 * Agrega días a una fecha UTC.
 */
function agregarDias(fecha: Date, dias: number): Date {
  const resultado = new Date(fecha.getTime());
  resultado.setUTCDate(resultado.getUTCDate() + dias);
  return resultado;
}

/**
 * Obtiene el día de la semana de una fecha UTC (0=domingo, 1=lunes, ..., 6=sábado).
 */
function diaSemanaUTC(fecha: Date): number {
  return fecha.getUTCDay();
}

/**
 * Traslada una fecha al lunes siguiente si no cae en lunes.
 * Si la fecha ya es lunes, la devuelve sin cambios.
 */
function trasladarAlLunes(fecha: Date): Date {
  const dow = diaSemanaUTC(fecha);
  if (dow === 1) return fecha; // ya es lunes
  // Calcular días hasta el próximo lunes
  const diasHastaLunes = dow === 0 ? 1 : 8 - dow;
  return agregarDias(fecha, diasHastaLunes);
}

/**
 * Extrae año, mes, día de una fecha UTC.
 */
function componentes(fecha: Date): { anio: number; mes: number; dia: number } {
  return {
    anio: fecha.getUTCFullYear(),
    mes: fecha.getUTCMonth() + 1,
    dia: fecha.getUTCDate(),
  };
}

// ---------------------------------------------------------------------------
// Generación de festivos por año
// ---------------------------------------------------------------------------

/** Caché interna de festivos generados por año */
const cacheFestivos = new Map<number, FechaCO[]>();

/** Caché interna de sets ISO para búsqueda rápida */
const cacheFestivosSet = new Map<number, Set<string>>();

/**
 * Genera la lista completa de festivos nacionales de Colombia para un año dado.
 * Aplica la Ley 51 de 1983 (Ley Emiliani) para el traslado de festivos.
 *
 * @param anio - Año para el cual generar los festivos
 * @returns Array de FechaCO con los 18 festivos nacionales ordenados cronológicamente
 */
export function festivosDelAnio(anio: number): FechaCO[] {
  // Revisar caché
  const cached = cacheFestivos.get(anio);
  if (cached) return cached;

  const festivos: Date[] = [];

  // ─── 1. Festivos fijos (nunca se trasladan) ───────────────────────────────
  festivos.push(dateUTC(anio, 1, 1)); // Año Nuevo
  festivos.push(dateUTC(anio, 5, 1)); // Día del Trabajo
  festivos.push(dateUTC(anio, 7, 20)); // Grito de Independencia
  festivos.push(dateUTC(anio, 8, 7)); // Batalla de Boyacá
  festivos.push(dateUTC(anio, 12, 8)); // Inmaculada Concepción
  festivos.push(dateUTC(anio, 12, 25)); // Navidad

  // ─── 2. Festivos trasladados al lunes (Ley Emiliani) ──────────────────────
  festivos.push(trasladarAlLunes(dateUTC(anio, 1, 6))); // Día de los Reyes Magos
  festivos.push(trasladarAlLunes(dateUTC(anio, 3, 19))); // Día de San José
  festivos.push(trasladarAlLunes(dateUTC(anio, 6, 29))); // San Pedro y San Pablo
  festivos.push(trasladarAlLunes(dateUTC(anio, 8, 15))); // Asunción de la Virgen
  festivos.push(trasladarAlLunes(dateUTC(anio, 10, 12))); // Día de la Raza
  festivos.push(trasladarAlLunes(dateUTC(anio, 11, 1))); // Todos los Santos
  festivos.push(trasladarAlLunes(dateUTC(anio, 11, 11))); // Independencia de Cartagena

  // ─── 3. Festivos dependientes de Pascua ────────────────────────────────────
  const pascua = calcularPascua(anio);
  const domingoPascua = dateUTC(anio, pascua.mes, pascua.dia);

  // Jueves Santo y Viernes Santo: NO se trasladan
  festivos.push(agregarDias(domingoPascua, -3)); // Jueves Santo
  festivos.push(agregarDias(domingoPascua, -2)); // Viernes Santo

  // Ascensión, Corpus y Sagrado Corazón: SE trasladan al lunes siguiente
  festivos.push(trasladarAlLunes(agregarDias(domingoPascua, 39))); // Ascensión del Señor (+39 días desde Pascua, luego lunes)
  festivos.push(trasladarAlLunes(agregarDias(domingoPascua, 60))); // Corpus Christi (+60 días desde Pascua, luego lunes)
  festivos.push(trasladarAlLunes(agregarDias(domingoPascua, 68))); // Sagrado Corazón (+68 días desde Pascua, luego lunes)

  // ─── Ordenar cronológicamente y convertir a FechaCO ────────────────────────
  festivos.sort((a, b) => a.getTime() - b.getTime());

  const resultado: FechaCO[] = festivos.map((f) => {
    const c = componentes(f);
    return fechaCODesdeComponentes(c.anio, c.mes, c.dia);
  });

  // Almacenar en caché
  cacheFestivos.set(anio, resultado);

  // Generar el set ISO para búsqueda rápida
  const isoSet = new Set<string>();
  for (const f of resultado) {
    isoSet.add(fechaCOaISOLocal(f));
  }
  cacheFestivosSet.set(anio, isoSet);

  return resultado;
}

// ---------------------------------------------------------------------------
// Consulta de festivos
// ---------------------------------------------------------------------------

/**
 * Formatea una FechaCO como "YYYY-MM-DD" para comparaciones internas.
 */
function fechaCOaISOLocal(fecha: FechaCO): string {
  const mm = String(fecha.mes).padStart(2, "0");
  const dd = String(fecha.dia).padStart(2, "0");
  return `${fecha.anio}-${mm}-${dd}`;
}

/**
 * Determina si una fecha dada es un festivo nacional de Colombia.
 *
 * @param fecha - FechaCO o Date a consultar
 * @returns true si la fecha es festivo nacional
 */
export function esFestivo(fecha: FechaCO | Date): boolean {
  // Normalizar a FechaCO si es Date
  let fc: FechaCO;
  if ("anio" in fecha) {
    fc = fecha;
  } else {
    fc = crearFechaCO(fecha);
  }

  const anio = fc.anio;

  // Asegurar que los festivos del año están generados
  if (!cacheFestivosSet.has(anio)) {
    festivosDelAnio(anio);
  }

  const isoSet = cacheFestivosSet.get(anio)!;
  return isoSet.has(fechaCOaISOLocal(fc));
}
