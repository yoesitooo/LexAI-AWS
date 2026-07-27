/**
 * Planificador de Notificaciones — LexAI MVP
 *
 * Determina y persiste las fechas calendario de notificación de un Plazo.
 *
 * Regla parametrizada (config):
 *  - Notificar el día calendario inmediatamente anterior a cada día hábil
 *    restante del plazo, a la hora configurada (por defecto 07:00) en
 *    America/Bogotá.
 *  - Si no queda ningún día hábil restante (vence hoy o ya venció), no
 *    programa notificaciones futuras y genera alerta inmediata.
 *  - Si la programación falla, conserva el Plazo sin notificaciones parciales
 *    y marca `error_programacion = true`.
 *
 * Requisitos cubiertos: R9.1, R9.2, R9.3, R9.4, R9.5, R9.6
 */

import {
  type FechaCO,
  fechaCODesdeComponentes,
  compararFechasCO,
} from "./formato";
import { esFestivo } from "./festivos";
import { type Result, ok, err } from "./repository";

// ---------------------------------------------------------------------------
// Configuración de la regla de notificación
// ---------------------------------------------------------------------------

/**
 * Hora de envío por defecto en America/Bogotá (HH:MM).
 * Puede modificarse sin cambios de código — se lee como constante configurable.
 */
export const HORA_ENVIO_DEFAULT = "07:00";

/**
 * Regla de notificación parametrizada.
 */
export interface ReglaNotificacion {
  /** Hora de envío en formato HH:MM (24h, America/Bogotá) */
  horaEnvio: string;
  /** Tipo de anticipación: día calendario anterior a cada día hábil restante */
  anticipacion: "dia_calendario_anterior_a_cada_dia_habil";
}

/** Regla por defecto */
export const REGLA_NOTIFICACION_DEFAULT: ReglaNotificacion = {
  horaEnvio: HORA_ENVIO_DEFAULT,
  anticipacion: "dia_calendario_anterior_a_cada_dia_habil",
};

// ---------------------------------------------------------------------------
// Tipos de entrada/salida
// ---------------------------------------------------------------------------

/**
 * Datos mínimos del Plazo requeridos para planificar notificaciones.
 */
export interface PlazoParaPlanificacion {
  id: string;
  usuario_id: string;
  fecha_limite: FechaCO;
}

/**
 * Notificación programada (resultado de la planificación).
 */
export interface NotificacionProgramada {
  plazo_id: string;
  usuario_id: string;
  /** Fecha y hora programada para el envío (como Date UTC, interpretada a 07:00 CO) */
  fecha_programada: Date;
  estado: "programada";
  canal: null;
  intentos: 0;
}

/**
 * Resultado especial: alerta inmediata cuando no quedan días hábiles.
 */
export interface AlertaInmediata {
  tipo: "alerta_inmediata";
  plazo_id: string;
  usuario_id: string;
  mensaje: string;
}

/**
 * Error de planificación.
 */
export type ErrorPlanificacion =
  | { tipo: "error_programacion"; mensaje: string }
  | { tipo: "fecha_limite_nula"; mensaje: string };

/**
 * Resultado de la planificación: notificaciones programadas o alerta inmediata.
 */
export type ResultadoPlanificacion =
  | { caso: "notificaciones"; notificaciones: NotificacionProgramada[] }
  | { caso: "alerta_inmediata"; alerta: AlertaInmediata };

// ---------------------------------------------------------------------------
// Lógica pura de planificación (testeable sin Prisma)
// ---------------------------------------------------------------------------

/**
 * Calcula las notificaciones a programar para un plazo dado.
 *
 * Lógica:
 * 1. Obtener días hábiles restantes entre hoy+1 y fecha_limite (inclusive)
 * 2. Para cada día hábil restante: la notificación se fija en el día calendario
 *    anterior, a la hora configurada en America/Bogotá
 * 3. Si no hay días hábiles restantes → devolver alerta inmediata
 *
 * @param plazo - Datos del plazo (id, usuario_id, fecha_limite)
 * @param regla - Regla de notificación (horaEnvio, anticipación)
 * @param hoy - Fecha actual en Colombia (para testabilidad)
 * @returns Resultado con las notificaciones programadas o alerta inmediata
 */
export function calcularNotificaciones(
  plazo: PlazoParaPlanificacion,
  regla: ReglaNotificacion,
  hoy: FechaCO,
): Result<ResultadoPlanificacion, ErrorPlanificacion> {
  const { horaEnvio } = regla;
  const [horaStr, minutoStr] = horaEnvio.split(":");
  const hora = parseInt(horaStr ?? "", 10);
  const minuto = parseInt(minutoStr ?? "", 10);

  if (isNaN(hora) || isNaN(minuto)) {
    return err({
      tipo: "error_programacion",
      mensaje: `Hora de envío inválida: ${horaEnvio}`,
    });
  }

  // Obtener los días hábiles restantes entre hoy (exclusive) y fecha_limite (inclusive)
  const diasHabilesRestantes = obtenerDiasHabilesRestantes(hoy, plazo.fecha_limite);

  // Si no quedan días hábiles → alerta inmediata
  if (diasHabilesRestantes.length === 0) {
    return ok({
      caso: "alerta_inmediata",
      alerta: {
        tipo: "alerta_inmediata",
        plazo_id: plazo.id,
        usuario_id: plazo.usuario_id,
        mensaje: `El plazo ${plazo.id} vence hoy o ya venció. Se requiere acción inmediata.`,
      },
    });
  }

  // Para cada día hábil restante: programar notificación el día calendario anterior
  const notificaciones: NotificacionProgramada[] = [];

  for (const diaHabil of diasHabilesRestantes) {
    // Día calendario anterior al día hábil
    const diaAnterior = fechaCODesdeComponentes(
      diaHabil.anio,
      diaHabil.mes,
      diaHabil.dia - 1,
      hora,
      minuto,
      0,
    );

    notificaciones.push({
      plazo_id: plazo.id,
      usuario_id: plazo.usuario_id,
      fecha_programada: diaAnterior.date,
      estado: "programada",
      canal: null,
      intentos: 0,
    });
  }

  return ok({
    caso: "notificaciones",
    notificaciones,
  });
}

// ---------------------------------------------------------------------------
// Función principal con persistencia (usa Prisma)
// ---------------------------------------------------------------------------

/**
 * Planifica y persiste notificaciones para un plazo, con atomicidad.
 *
 * - Si la programación es exitosa, persiste todas las notificaciones en una
 *   transacción Prisma.
 * - Si algo falla durante la persistencia, no deja notificaciones parciales
 *   y marca `error_programacion = true` en el Plazo.
 *
 * @param plazo - Datos del plazo
 * @param regla - Regla de notificación (default: REGLA_NOTIFICACION_DEFAULT)
 * @param hoy - Fecha actual en Colombia
 * @param prismaClient - Instancia de Prisma (inyectable para testing)
 * @returns Resultado con las notificaciones programadas o alerta inmediata
 */
export async function planificarNotificaciones(
  plazo: PlazoParaPlanificacion,
  regla: ReglaNotificacion = REGLA_NOTIFICACION_DEFAULT,
  hoy: FechaCO,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prismaClient: any,
): Promise<Result<ResultadoPlanificacion, ErrorPlanificacion>> {
  // Calcular notificaciones (lógica pura)
  const resultado = calcularNotificaciones(plazo, regla, hoy);

  if (!resultado.ok) {
    // Error en el cálculo → marcar error_programacion
    await marcarErrorProgramacion(prismaClient, plazo.id);
    return resultado;
  }

  const planificacion = resultado.value;

  // Si es alerta inmediata, no hay notificaciones que persistir
  if (planificacion.caso === "alerta_inmediata") {
    return ok(planificacion);
  }

  // Persistir notificaciones en transacción atómica
  try {
    await prismaClient.$transaction(async (tx) => {
      // Crear todas las notificaciones dentro de la transacción
      for (const notif of planificacion.notificaciones) {
        await tx.notificacion.create({
          data: {
            plazo_id: notif.plazo_id,
            usuario_id: notif.usuario_id,
            fecha_programada: notif.fecha_programada,
            estado: notif.estado,
            canal: notif.canal,
            intentos: notif.intentos,
          },
        });
      }
    });

    return ok(planificacion);
  } catch (error: unknown) {
    // Fallo en la persistencia → no hay notificaciones parciales (tx rollback)
    // Marcar error_programacion en el Plazo
    await marcarErrorProgramacion(prismaClient, plazo.id);

    const mensaje =
      error instanceof Error ? error.message : "Error desconocido al persistir notificaciones";

    return err({
      tipo: "error_programacion",
      mensaje,
    });
  }
}

// ---------------------------------------------------------------------------
// Helpers internos
// ---------------------------------------------------------------------------

/**
 * Obtiene los días hábiles (lun-vie, no festivo) restantes entre
 * hoy (exclusive) y fechaLimite (inclusive).
 *
 * Un día hábil es lunes a viernes que no es festivo nacional de Colombia.
 */
export function obtenerDiasHabilesRestantes(
  hoy: FechaCO,
  fechaLimite: FechaCO,
): FechaCO[] {
  const resultado: FechaCO[] = [];

  // Si la fecha límite es hoy o antes → no quedan días hábiles
  if (compararFechasCO(fechaLimite, hoy) <= 0) {
    return resultado;
  }

  // Iterar desde hoy+1 hasta fechaLimite inclusive
  let actual = fechaCODesdeComponentes(hoy.anio, hoy.mes, hoy.dia + 1);

  // Máximo 366 iteraciones como protección
  let iteraciones = 0;
  const MAX_ITERACIONES = 366;

  while (
    compararFechasCO(actual, fechaLimite) <= 0 &&
    iteraciones < MAX_ITERACIONES
  ) {
    // Verificar si es día hábil
    if (esDiaHabilCO(actual)) {
      resultado.push(actual);
    }

    // Avanzar un día
    actual = fechaCODesdeComponentes(actual.anio, actual.mes, actual.dia + 1);
    iteraciones++;
  }

  return resultado;
}

/**
 * Determina si una FechaCO es día hábil (lunes a viernes, no festivo).
 */
function esDiaHabilCO(fecha: FechaCO): boolean {
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
 * Marca error_programacion = true en el Plazo.
 * Se ejecuta fuera de la transacción fallida para asegurar que se persista.
 */
async function marcarErrorProgramacion(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prismaClient: any,
  plazoId: string,
): Promise<void> {
  try {
    await prismaClient.plazo.update({
      where: { id: plazoId },
      data: { error_programacion: true },
    });
  } catch {
    // Si falla marcar el error, no podemos hacer más — el error original
    // ya fue reportado al llamante
  }
}
