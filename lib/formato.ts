/**
 * Utilidades centralizadas de formato es-CO y zona horaria — LexAI MVP
 *
 * Locale fijo: es-CO
 * Zona horaria fija: America/Bogota (UTC-5, sin horario de verano)
 *
 * Funciones de formato:
 *  - formatoFecha: DD/MM/AAAA con ceros a la izquierda
 *  - formatoHora: HH:MM 24 horas con ceros
 *  - formatoNumero: punto de miles, coma decimal
 *  - formatoMoneda: COP con 2 decimales
 *  - hoyCO: fecha actual en Colombia
 *
 * Requisitos cubiertos: R14.3, R14.4, R14.5, R14.6
 */

// ---------------------------------------------------------------------------
// Constantes de localización
// ---------------------------------------------------------------------------

/** Locale fijo para Colombia */
export const LOCALE_CO = "es-CO";

/** Zona horaria fija para Colombia (UTC-5, sin horario de verano) */
export const ZONA_HORARIA_CO = "America/Bogota";

// ---------------------------------------------------------------------------
// Tipo FechaCO — representa una fecha en la zona horaria de Colombia
// ---------------------------------------------------------------------------

/**
 * Representa una fecha en el contexto colombiano (America/Bogota, UTC-5).
 * Envuelve un Date nativo pero garantiza que toda operación se interpreta
 * en la zona horaria de Colombia.
 */
export interface FechaCO {
  /** El objeto Date subyacente (instante UTC) */
  readonly date: Date;
  /** Año en America/Bogota */
  readonly anio: number;
  /** Mes 1-12 en America/Bogota */
  readonly mes: number;
  /** Día del mes 1-31 en America/Bogota */
  readonly dia: number;
  /** Hora 0-23 en America/Bogota */
  readonly hora: number;
  /** Minuto 0-59 en America/Bogota */
  readonly minuto: number;
  /** Segundo 0-59 en America/Bogota */
  readonly segundo: number;
  /** Día de la semana 0=domingo, 1=lunes, ..., 6=sábado */
  readonly diaSemana: number;
}

/**
 * Crea una FechaCO a partir de un Date, extrayendo los componentes
 * según la zona horaria America/Bogota.
 */
export function crearFechaCO(date: Date): FechaCO {
  const partes = obtenerPartesEnCO(date);
  return {
    date,
    anio: partes.anio,
    mes: partes.mes,
    dia: partes.dia,
    hora: partes.hora,
    minuto: partes.minuto,
    segundo: partes.segundo,
    diaSemana: partes.diaSemana,
  };
}

/**
 * Crea una FechaCO a partir de componentes de fecha (año, mes, día)
 * en la zona horaria de Colombia. Hora por defecto: 00:00:00.
 */
export function fechaCODesdeComponentes(
  anio: number,
  mes: number,
  dia: number,
  hora = 0,
  minuto = 0,
  segundo = 0,
): FechaCO {
  // Construimos un Date que represente ese instante en Colombia (UTC-5)
  // Colombia es UTC-5 fijo → restamos el offset para obtener UTC
  const utcDate = new Date(Date.UTC(anio, mes - 1, dia, hora + 5, minuto, segundo));
  return crearFechaCO(utcDate);
}

// ---------------------------------------------------------------------------
// Helper: obtener partes de fecha en zona horaria de Colombia
// ---------------------------------------------------------------------------

interface PartesFechaCO {
  anio: number;
  mes: number;
  dia: number;
  hora: number;
  minuto: number;
  segundo: number;
  diaSemana: number;
}

// Los formatters de Intl.DateTimeFormat son costosos de construir (resuelven
// datos de locale/zona horaria). ZONA_HORARIA_CO y LOCALE_CO son fijos, así
// que se crean una sola vez a nivel de módulo en vez de en cada llamada:
// crear uno por invocación de obtenerPartesEnCO (llamada en el hot path de
// crearFechaCO/fechaCODesdeComponentes) degradaba notablemente el rendimiento
// en bucles y en las pruebas basadas en propiedades (cientos de invocaciones).
const partesFormatter = new Intl.DateTimeFormat(LOCALE_CO, {
  timeZone: ZONA_HORARIA_CO,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

const weekdayFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: ZONA_HORARIA_CO,
  weekday: "short",
});

const WEEKDAY_MAP: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

function obtenerPartesEnCO(date: Date): PartesFechaCO {
  const partes = partesFormatter.formatToParts(date);
  const get = (tipo: Intl.DateTimeFormatPartTypes): string =>
    partes.find((p) => p.type === tipo)?.value ?? "0";

  const anio = parseInt(get("year"), 10);
  const mes = parseInt(get("month"), 10);
  const dia = parseInt(get("day"), 10);
  let hora = parseInt(get("hour"), 10);
  // Intl puede devolver 24 para medianoche en algunos engines → normalizar
  if (hora === 24) hora = 0;
  const minuto = parseInt(get("minute"), 10);
  const segundo = parseInt(get("second"), 10);

  // Para el día de la semana, no hay weekday numérico en Intl, así que lo
  // calculamos desde el nombre corto devuelto por un formatter dedicado.
  const weekdayStr = weekdayFormatter.format(date);
  const diaSemana = WEEKDAY_MAP[weekdayStr] ?? 0;

  return { anio, mes, dia, hora, minuto, segundo, diaSemana };
}

// ---------------------------------------------------------------------------
// hoyCO — fecha/hora actual en Colombia
// ---------------------------------------------------------------------------

/**
 * Devuelve la fecha y hora actual en la zona horaria de Colombia (America/Bogota).
 */
export function hoyCO(): FechaCO {
  return crearFechaCO(new Date());
}

// ---------------------------------------------------------------------------
// Formato de fecha: DD/MM/AAAA
// ---------------------------------------------------------------------------

/**
 * Formatea una fecha como DD/MM/AAAA con ceros a la izquierda.
 *
 * @example
 * formatoFecha(crearFechaCO(new Date("2025-01-05T10:00:00Z"))) // → "05/01/2025"
 */
export function formatoFecha(fecha: FechaCO): string {
  const dd = String(fecha.dia).padStart(2, "0");
  const mm = String(fecha.mes).padStart(2, "0");
  const aaaa = String(fecha.anio).padStart(4, "0");
  return `${dd}/${mm}/${aaaa}`;
}

/**
 * Formatea un Date directamente como DD/MM/AAAA en hora Colombia.
 *
 * Úsese para INSTANTES (timestamps: creado_en, fecha de envío, etc.).
 * Para columnas de solo fecha (`@db.Date`) use `formatoFechaSoloDia`.
 */
export function formatoFechaDate(date: Date): string {
  return formatoFecha(crearFechaCO(date));
}

/**
 * Convierte una columna de solo fecha (`@db.Date`, llega como medianoche UTC)
 * en la FechaCO de ese mismo día de calendario en Colombia.
 *
 * No use `crearFechaCO(columnaDate)`: interpretaría 2026-10-29T00:00Z como
 * 28/10 a las 19:00 en Colombia y correría los cálculos un día hacia atrás.
 */
export function fechaCODesdeColumnaDate(fecha: Date | string): FechaCO {
  const date = typeof fecha === "string" ? new Date(fecha) : fecha;
  return fechaCODesdeComponentes(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

/**
 * Formatea una fecha de calendario sin hora (columnas `@db.Date`: fecha_limite,
 * fecha_actuacion, etc.) como DD/MM/AAAA.
 *
 * PostgreSQL devuelve esas columnas como medianoche UTC (`2026-11-04T00:00:00Z`).
 * Convertirlas a hora Colombia (UTC-5) las corre al día anterior (03/11 a las 19:00),
 * así que aquí se leen los componentes en UTC, que son la fecha guardada.
 */
export function formatoFechaSoloDia(fecha: Date | string): string {
  const date = typeof fecha === "string" ? new Date(fecha) : fecha;
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const aaaa = String(date.getUTCFullYear()).padStart(4, "0");
  return `${dd}/${mm}/${aaaa}`;
}

// ---------------------------------------------------------------------------
// Formato de hora: HH:MM (24h)
// ---------------------------------------------------------------------------

/**
 * Formatea la hora como HH:MM en formato 24 horas con ceros.
 *
 * @example
 * formatoHora(crearFechaCO(new Date("2025-01-05T19:05:00Z"))) // → "14:05" (UTC-5)
 */
export function formatoHora(fecha: FechaCO): string {
  const hh = String(fecha.hora).padStart(2, "0");
  const mm = String(fecha.minuto).padStart(2, "0");
  return `${hh}:${mm}`;
}

/**
 * Formatea un Date directamente como HH:MM en hora Colombia.
 */
export function formatoHoraDate(date: Date): string {
  return formatoHora(crearFechaCO(date));
}

// ---------------------------------------------------------------------------
// Formato de número: punto de miles, coma decimal
// ---------------------------------------------------------------------------

/**
 * Formatter reutilizable para números con separador de miles (punto) y
 * separador decimal (coma) conforme a es-CO.
 */
const numberFormatter = new Intl.NumberFormat(LOCALE_CO, {
  useGrouping: true,
  minimumFractionDigits: 0,
  maximumFractionDigits: 20, // no truncar decimales arbitrariamente
});

/**
 * Formatea un número con punto de miles y coma decimal (es-CO).
 *
 * @example
 * formatoNumero(1234567.89) // → "1.234.567,89"
 * formatoNumero(42)         // → "42"
 */
export function formatoNumero(valor: number): string {
  return numberFormatter.format(valor);
}

// ---------------------------------------------------------------------------
// Formato de moneda: COP con 2 decimales
// ---------------------------------------------------------------------------

/**
 * Formatter reutilizable para moneda colombiana (COP) con 2 decimales.
 * Usa el estilo "currency" con display "symbol" para obtener el símbolo $.
 */
const currencyFormatter = new Intl.NumberFormat(LOCALE_CO, {
  style: "currency",
  currency: "COP",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Formatea un valor monetario en pesos colombianos (COP) con 2 decimales.
 * Usa punto de miles y coma decimal conforme a es-CO.
 *
 * @example
 * formatoMoneda(1234567.89) // → "$ 1.234.567,89" (formato puede variar por engine)
 */
export function formatoMoneda(valor: number): string {
  return currencyFormatter.format(valor);
}

// ---------------------------------------------------------------------------
// Utilidades adicionales
// ---------------------------------------------------------------------------

/**
 * Devuelve el año actual en Colombia.
 */
export function anioActualCO(): number {
  return hoyCO().anio;
}

/**
 * Convierte una cadena ISO o Date a FechaCO.
 */
export function parsearFechaCO(input: string | Date): FechaCO {
  const date = typeof input === "string" ? new Date(input) : input;
  return crearFechaCO(date);
}

/**
 * Formatea una FechaCO como string ISO (YYYY-MM-DD) — útil para almacenamiento
 * y comparaciones de solo fecha.
 */
export function fechaCOaISO(fecha: FechaCO): string {
  const mm = String(fecha.mes).padStart(2, "0");
  const dd = String(fecha.dia).padStart(2, "0");
  return `${fecha.anio}-${mm}-${dd}`;
}

/**
 * Compara dos FechaCO por solo fecha (sin hora). Retorna:
 *  - negativo si a < b
 *  - 0 si a === b
 *  - positivo si a > b
 */
export function compararFechasCO(a: FechaCO, b: FechaCO): number {
  const isoA = fechaCOaISO(a);
  const isoB = fechaCOaISO(b);
  return isoA < isoB ? -1 : isoA > isoB ? 1 : 0;
}
