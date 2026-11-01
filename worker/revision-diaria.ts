/**
 * Revisión diaria de procesos activos — LexAI MVP
 *
 * Orquesta la revisión de cada proceso activo con resiliencia:
 * 1. Consulta CPNU (timeout 30s, 3 reintentos built-in en el cliente)
 * 2. Diff de actuaciones → almacena nuevas con es_nueva=true
 * 3. Para cada actuación nueva: Analizador_IA → Calculadora_Plazos → Planificador_Notificaciones
 * 4. Actualiza ultima_revision_en del proceso
 *
 * Resiliencia:
 * - Fallo de CPNU → conserva histórico, registra error, continúa con siguientes procesos
 * - Fallo de análisis IA → conserva la actuación con analisis_completado=false, no bloquea
 * - Un fallo en un proceso no detiene la revisión de los demás
 *
 * Requisitos cubiertos: R6.3, R6.6, R6.7, R6.8
 */

import { prisma } from "../lib/db";
import { clienteCPNU } from "../lib/cpnu-client";
import type { ActuacionCPNU } from "../lib/cpnu-client";
import { diffActuaciones, almacenarActuacionesNuevas } from "../lib/diffing-actuaciones";
import { sincronizarDocumentosProceso } from "../lib/descarga-documentos";
import { analizarActuacionConReintentos } from "../lib/analizador-ia";
import { calcularFechaLimite } from "../lib/calculadora-plazos";
import {
  planificarNotificaciones,
  REGLA_NOTIFICACION_DEFAULT,
} from "../lib/planificador-notificaciones";
import type { PlazoParaPlanificacion } from "../lib/planificador-notificaciones";
import { hoyCO, fechaCODesdeColumnaDate } from "../lib/formato";
import type { FechaCO } from "../lib/formato";

// =============================================================================
// TIPOS
// =============================================================================

/** Logger inyectable para testing */
export interface Logger {
  info: (mensaje: string, detalle?: unknown) => void;
  error: (mensaje: string, detalle?: unknown) => void;
  warn: (mensaje: string, detalle?: unknown) => void;
}

/** Opciones de ejecución para la revisión diaria (inyección para testing) */
export interface OpcionesRevision {
  logger?: Logger;
  /** Instancia de Prisma (inyectable para testing/mocking) */
  prismaClient?: typeof prisma;
  /** Cliente CPNU (inyectable para testing/mocking) */
  cpnuClient?: typeof clienteCPNU;
  /** Función de análisis IA con reintentos (inyectable para testing/mocking) */
  analizarFn?: typeof analizarActuacionConReintentos;
  /** Función de cálculo de fecha límite (inyectable para testing/mocking) */
  calcularFechaLimiteFn?: typeof calcularFechaLimite;
  /** Función de planificación de notificaciones (inyectable para testing/mocking) */
  planificarFn?: typeof planificarNotificaciones;
  /** Función de sincronización de documentos CPNU (inyectable para testing/mocking) */
  sincronizarDocumentosFn?: typeof sincronizarDocumentosProceso;
  /** Fecha actual en Colombia (inyectable para testing) */
  ahora?: FechaCO;
}

/** Resultado de la revisión de un proceso individual */
export interface ResultadoRevisionProceso {
  procesoId: string;
  radicado: string;
  exito: boolean;
  actuacionesNuevas: number;
  plazosCreados: number;
  error?: string;
}

/** Resultado global de la revisión diaria */
export interface ResultadoRevisionDiaria {
  totalProcesos: number;
  procesosRevisados: number;
  procesosFallidos: number;
  totalActuacionesNuevas: number;
  totalPlazosCreados: number;
  resultados: ResultadoRevisionProceso[];
}

// =============================================================================
// LOGGER POR DEFECTO
// =============================================================================

const loggerDefault: Logger = {
  info: (msg, detalle) => console.log(`[Revisión] ${msg}`, detalle ?? ""),
  error: (msg, detalle) => console.error(`[Revisión] ${msg}`, detalle ?? ""),
  warn: (msg, detalle) => console.warn(`[Revisión] ${msg}`, detalle ?? ""),
};

// =============================================================================
// IMPLEMENTACIÓN PRINCIPAL
// =============================================================================

/**
 * Ejecuta la revisión diaria de todos los procesos activos.
 *
 * Para cada proceso activo:
 * 1. Obtener IDs de actuaciones almacenadas
 * 2. Resolver id_proceso_cpnu (auto-reparación por radicado si falta)
 * 3. Consultar CPNU (obtenerActuaciones) — timeout 30s, 3 reintentos built-in
 * 4. Si CPNU falla → log error, conservar histórico, continuar
 * 5. Diff actuaciones → almacenar nuevas con es_nueva=true
 * 6. Para cada nueva actuación: IA → si plazo, calcular fecha → planificar notificaciones
 *    Si IA falla → actuación queda con analisis_completado=false, no bloquea
 * 7. Sincronizar documentos (best-effort)
 * 8. Actualizar proceso.ultima_revision_en = now()
 *
 * @param opciones - Dependencias inyectables (para testing)
 * @returns Resumen de la revisión
 */
export async function ejecutarRevisionDiaria(
  opciones: OpcionesRevision = {},
): Promise<ResultadoRevisionDiaria> {
  const logger = opciones.logger ?? loggerDefault;
  const db = opciones.prismaClient ?? prisma;
  const cpnu = opciones.cpnuClient ?? clienteCPNU;
  const analizar = opciones.analizarFn ?? analizarActuacionConReintentos;
  const calcularFecha = opciones.calcularFechaLimiteFn ?? calcularFechaLimite;
  const planificar = opciones.planificarFn ?? planificarNotificaciones;
  const sincronizarDocumentos = opciones.sincronizarDocumentosFn ?? sincronizarDocumentosProceso;
  const ahora = opciones.ahora ?? hoyCO();

  // Obtener todos los procesos con seguimiento activo
  const procesosActivos = await db.proceso.findMany({
    where: { seguimiento_activo: true },
    select: {
      id: true,
      radicado: true,
      llave_proceso: true,
      id_proceso_cpnu: true,
      usuario_id: true,
    },
  });

  logger.info(`Iniciando revisión de ${procesosActivos.length} procesos activos.`);

  const resultados: ResultadoRevisionProceso[] = [];

  // Procesar cada proceso de forma secuencial (resiliencia: un fallo no detiene los demás)
  for (const proceso of procesosActivos) {
    const resultado = await revisarProceso(proceso, {
      logger,
      db,
      cpnu,
      analizar,
      calcularFecha,
      planificar,
      sincronizarDocumentos,
      ahora,
    });
    resultados.push(resultado);
  }

  // Resumen
  const resumen: ResultadoRevisionDiaria = {
    totalProcesos: procesosActivos.length,
    procesosRevisados: resultados.filter((r) => r.exito).length,
    procesosFallidos: resultados.filter((r) => !r.exito).length,
    totalActuacionesNuevas: resultados.reduce((sum, r) => sum + r.actuacionesNuevas, 0),
    totalPlazosCreados: resultados.reduce((sum, r) => sum + r.plazosCreados, 0),
    resultados,
  };

  logger.info(
    `Revisión completada: ${resumen.procesosRevisados}/${resumen.totalProcesos} exitosos, ` +
      `${resumen.totalActuacionesNuevas} actuaciones nuevas, ${resumen.totalPlazosCreados} plazos creados.`,
  );

  return resumen;
}

// =============================================================================
// REVISIÓN DE UN PROCESO INDIVIDUAL
// =============================================================================

interface DependenciasRevision {
  logger: Logger;
  db: typeof prisma;
  cpnu: typeof clienteCPNU;
  analizar: typeof analizarActuacionConReintentos;
  calcularFecha: typeof calcularFechaLimite;
  planificar: typeof planificarNotificaciones;
  sincronizarDocumentos: typeof sincronizarDocumentosProceso;
  ahora: FechaCO;
}

interface ProcesoParaRevision {
  id: string;
  radicado: string;
  llave_proceso: string | null;
  id_proceso_cpnu: string | null;
  usuario_id: string;
}

/**
 * Revisa un proceso individual con resiliencia completa.
 * Errores internos son capturados y no se propagan.
 */
async function revisarProceso(
  proceso: ProcesoParaRevision,
  deps: DependenciasRevision,
): Promise<ResultadoRevisionProceso> {
  const { logger, db, cpnu } = deps;

  try {
    logger.info(`Revisando proceso ${proceso.radicado} (${proceso.id})`);

    // 1. Obtener IDs de actuaciones almacenadas para este proceso
    const actuacionesAlmacenadas = await db.actuacion.findMany({
      where: { proceso_id: proceso.id },
      select: { id_actuacion_cpnu: true },
    });

    // 2. Resolver el idProceso de la CPNU que identifica a esta instancia.
    // `llave_proceso` NO sirve para esto: la CPNU la repite igual para varias
    // instancias de un mismo radicado (ver fixture consulta-radicado-multiples.json),
    // mientras que `idProceso` es único por instancia. Los procesos creados antes
    // de que este campo existiera lo resuelven aquí y quedan reparados para
    // las próximas revisiones.
    let idProcesoCPNU = proceso.id_proceso_cpnu;

    if (!idProcesoCPNU) {
      const resultadoResolucion = await cpnu.consultarPorRadicado(proceso.radicado);
      const procesoResuelto = resultadoResolucion.ok
        ? resultadoResolucion.value.procesos[0]
        : undefined;

      if (procesoResuelto) {
        idProcesoCPNU = String(procesoResuelto.idProceso);
        await db.proceso.update({
          where: { id: proceso.id },
          data: { id_proceso_cpnu: idProcesoCPNU },
        });
      }
    }

    if (!idProcesoCPNU) {
      logger.error(
        `No se pudo resolver id_proceso_cpnu para proceso ${proceso.radicado}; se omite esta revisión.`,
      );
      await actualizarUltimaRevision(db, proceso.id);
      return {
        procesoId: proceso.id,
        radicado: proceso.radicado,
        exito: false,
        actuacionesNuevas: 0,
        plazosCreados: 0,
        error: "No se pudo resolver id_proceso_cpnu (radicado no encontrado en la CPNU).",
      };
    }

    // 3. Consultar CPNU — obtener actuaciones frescas
    // El cliente ya tiene timeout 30s y 3 reintentos built-in
    const resultadoCPNU = await cpnu.obtenerActuaciones(idProcesoCPNU);

    // 4. Si CPNU falla → conservar histórico, registrar error, continuar
    if (!resultadoCPNU.ok) {
      logger.error(
        `CPNU falló para proceso ${proceso.radicado}: ${resultadoCPNU.error.tipo} — ${resultadoCPNU.error.detalle}`,
      );
      // Aun así actualizamos ultima_revision_en para marcar que se intentó
      await actualizarUltimaRevision(db, proceso.id);
      return {
        procesoId: proceso.id,
        radicado: proceso.radicado,
        exito: false,
        actuacionesNuevas: 0,
        plazosCreados: 0,
        error: `CPNU: ${resultadoCPNU.error.tipo} — ${resultadoCPNU.error.detalle}`,
      };
    }

    const actuacionesFrescas = resultadoCPNU.value;

    // 5. Diff actuaciones → determinar cuáles son nuevas
    const actuacionesNuevas = diffActuaciones(
      proceso.id,
      actuacionesFrescas,
      actuacionesAlmacenadas,
    );

    // Almacenar nuevas con es_nueva=true
    let insertadas = 0;
    if (actuacionesNuevas.length > 0) {
      insertadas = await almacenarActuacionesNuevas(proceso.id, actuacionesNuevas);
      logger.info(
        `Proceso ${proceso.radicado}: ${insertadas} actuaciones nuevas detectadas y almacenadas.`,
      );
    }

    // 6. Para cada actuación nueva: IA → Calculadora → Planificador
    let plazosCreados = 0;
    for (const actuacionNueva of actuacionesNuevas) {
      const plazosDeEsta = await procesarActuacionNueva(actuacionNueva, proceso, deps);
      plazosCreados += plazosDeEsta;
    }

    // 7. Sincronizar documentos de las actuaciones con adjuntos (best-effort).
    // Idempotente: solo descarga los que aún no estén en el expediente.
    try {
      await deps.sincronizarDocumentos(proceso.id, {
        db,
        cpnu,
        logger,
      });
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : String(error);
      logger.warn(`Error sincronizando documentos del proceso ${proceso.radicado}: ${mensaje}`);
      // No bloquea la revisión del proceso.
    }

    // 8. Actualizar ultima_revision_en = now()
    await actualizarUltimaRevision(db, proceso.id);

    return {
      procesoId: proceso.id,
      radicado: proceso.radicado,
      exito: true,
      actuacionesNuevas: insertadas,
      plazosCreados,
    };
  } catch (error) {
    // Capturar cualquier error inesperado — resiliencia total
    const mensaje = error instanceof Error ? error.message : String(error);
    logger.error(`Error inesperado en proceso ${proceso.radicado}: ${mensaje}`, error);

    // Intentar actualizar ultima_revision_en incluso en error
    try {
      await actualizarUltimaRevision(deps.db, proceso.id);
    } catch {
      // Si esto también falla, no hay más que hacer
    }

    return {
      procesoId: proceso.id,
      radicado: proceso.radicado,
      exito: false,
      actuacionesNuevas: 0,
      plazosCreados: 0,
      error: mensaje,
    };
  }
}

// =============================================================================
// PROCESAMIENTO DE UNA ACTUACIÓN NUEVA (IA → Plazos → Notificaciones)
// =============================================================================

/**
 * Procesa una actuación nueva: análisis IA → cálculo de plazo → notificaciones.
 *
 * Si el análisis IA falla, la actuación queda con analisis_completado=false.
 * Nunca lanza excepciones — los errores se registran y se continúa.
 *
 * @returns Número de plazos creados (0 o 1)
 */
async function procesarActuacionNueva(
  actuacion: ActuacionCPNU,
  proceso: ProcesoParaRevision,
  deps: DependenciasRevision,
): Promise<number> {
  const { logger, db, analizar, calcularFecha, planificar, ahora } = deps;

  try {
    // Construir el texto para análisis (actuación + anotación)
    const textoParaAnalisis = [actuacion.actuacion, actuacion.anotacion]
      .filter(Boolean)
      .join(" — ");

    // 5a. Invocar Analizador_IA con reintentos
    const resultadoIA = await analizar(textoParaAnalisis);

    if (!resultadoIA.ok) {
      // Esto no debería ocurrir (analizarActuacionConReintentos siempre devuelve ok)
      // pero lo manejamos por seguridad
      logger.error(`Error inesperado del analizador IA para actuación ${actuacion.idRegActuacion}`);
      return 0;
    }

    const analisis = resultadoIA.value;

    // Buscar la actuación recién almacenada en la DB
    const actuacionDB = await db.actuacion.findFirst({
      where: {
        proceso_id: proceso.id,
        id_actuacion_cpnu: String(actuacion.idRegActuacion),
      },
    });

    if (!actuacionDB) {
      logger.warn(`Actuación ${actuacion.idRegActuacion} no encontrada en DB tras almacenamiento.`);
      return 0;
    }

    // 6. Si IA falla (análisis pendiente) → conservar actuación, no bloquear
    if (analisis.tipo === "analisis_pendiente") {
      logger.warn(
        `Análisis IA pendiente para actuación ${actuacion.idRegActuacion} ` +
          `tras ${analisis.intentos} intentos. Continúa sin bloquear.`,
      );
      // La actuación ya está con analisis_completado=false por defecto
      return 0;
    }

    // Marcar actuación como analizada
    if (analisis.tipo === "sin_plazo") {
      await db.actuacion.update({
        where: { id: actuacionDB.id },
        data: { analisis_completado: true, es_nueva: false },
      });
      return 0;
    }

    if (analisis.tipo === "indeterminado") {
      // Crear plazo indeterminado para revisión manual
      await db.plazo.create({
        data: {
          actuacion_id: actuacionDB.id,
          proceso_id: proceso.id,
          dias: null,
          es_habil: true,
          fecha_inicio: actuacionDB.fecha_actuacion,
          fecha_limite: null,
          estado: "pendiente",
          indeterminado: true,
        },
      });
      await db.actuacion.update({
        where: { id: actuacionDB.id },
        data: { analisis_completado: true, es_nueva: false },
      });
      return 1;
    }

    // analisis.tipo === "plazo" → calcular fecha límite
    // fecha_actuacion es @db.Date (medianoche UTC): se toma como día de calendario
    const fechaInicio = fechaCODesdeColumnaDate(actuacionDB.fecha_actuacion);
    const resultadoCalculo = calcularFecha(fechaInicio, analisis.dias, analisis.esHabil);

    if (!resultadoCalculo.ok) {
      // Error en cálculo (festivos no disponibles, etc.) → plazo sin fecha, revisión manual
      logger.warn(
        `Error calculando fecha límite para actuación ${actuacion.idRegActuacion}: ${resultadoCalculo.error.mensaje}`,
      );
      await db.plazo.create({
        data: {
          actuacion_id: actuacionDB.id,
          proceso_id: proceso.id,
          dias: analisis.dias,
          es_habil: analisis.esHabil,
          fecha_inicio: actuacionDB.fecha_actuacion,
          fecha_limite: null,
          estado: "pendiente",
          indeterminado: false,
        },
      });
      await db.actuacion.update({
        where: { id: actuacionDB.id },
        data: { analisis_completado: true, es_nueva: false },
      });
      return 1;
    }

    const fechaLimite = resultadoCalculo.value;

    // Crear el plazo con fecha límite calculada
    const plazoCreado = await db.plazo.create({
      data: {
        actuacion_id: actuacionDB.id,
        proceso_id: proceso.id,
        dias: analisis.dias,
        es_habil: analisis.esHabil,
        fecha_inicio: actuacionDB.fecha_actuacion,
        fecha_limite: fechaLimite.date,
        estado: "pendiente",
        indeterminado: false,
      },
    });

    // Marcar actuación como analizada
    await db.actuacion.update({
      where: { id: actuacionDB.id },
      data: { analisis_completado: true, es_nueva: false },
    });

    // 5c. Planificar notificaciones para el plazo
    const plazoParaPlanificacion: PlazoParaPlanificacion = {
      id: plazoCreado.id,
      usuario_id: proceso.usuario_id,
      fecha_limite: fechaLimite,
    };

    const resultadoPlanificacion = await planificar(
      plazoParaPlanificacion,
      REGLA_NOTIFICACION_DEFAULT,
      ahora,
      db,
    );

    if (!resultadoPlanificacion.ok) {
      logger.warn(
        `Error planificando notificaciones para plazo ${plazoCreado.id}: ${resultadoPlanificacion.error.mensaje}`,
      );
      // El plazo se creó correctamente, solo fallan las notificaciones
      // error_programacion se marca dentro de planificarNotificaciones
    }

    return 1;
  } catch (error) {
    // Error inesperado al procesar esta actuación — no bloquear las demás
    const mensaje = error instanceof Error ? error.message : String(error);
    logger.error(
      `Error procesando actuación ${actuacion.idRegActuacion} del proceso ${proceso.radicado}: ${mensaje}`,
    );
    return 0;
  }
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Actualiza la fecha de última revisión del proceso a now().
 */
async function actualizarUltimaRevision(db: typeof prisma, procesoId: string): Promise<void> {
  await db.proceso.update({
    where: { id: procesoId },
    data: { ultima_revision_en: new Date() },
  });
}
