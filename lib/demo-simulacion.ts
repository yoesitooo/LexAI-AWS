/**
 * Simulación de la revisión diaria — demo público de LexAI
 *
 * En producción, el worker consulta la CPNU cada día hábil. En el demo eso no
 * se ve, así que el botón "Simular revisión diaria" ejecuta el MISMO pipeline
 * del worker (`ejecutarRevisionDiaria`) sobre un proceso de la cuenta demo:
 *
 *   CPNU (simulada) → diff de actuaciones → análisis IA (simulado) →
 *   cálculo del plazo en días hábiles → notificaciones programadas
 *
 * Lo único simulado es la fuente (la CPNU devuelve una actuación ficticia) y
 * el LLM (ver lib/llm/providers/demo.ts). El diff, el cálculo de plazos con
 * festivos y la planificación de notificaciones son el código real.
 */

import type { PrismaClient } from "@/lib/generated/prisma/client";
import type { ActuacionCPNU, ClienteCPNU } from "@/lib/cpnu-client";
import { ejecutarRevisionDiaria } from "@/worker/revision-diaria";
import { retrocederDiasHabiles } from "@/lib/demo";
import { type FechaCO, formatoFechaSoloDia, hoyCO } from "@/lib/formato";
import { type Result, ok, err } from "@/lib/repository";

/** Marca que identifica las actuaciones creadas por la simulación. */
export const LLAVE_SIMULACION = "SIMULACION-DEMO";

/** Máximo de simulaciones por cuenta demo (anti-abuso). */
export const MAX_SIMULACIONES_POR_CUENTA = 12;

export interface PlantillaActuacion {
  actuacion: string;
  anotacion: string;
}

/** Actuaciones ficticias que "llegan" de la CPNU, en orden de aparición. */
export const PLANTILLAS_SIMULACION: readonly PlantillaActuacion[] = [
  {
    actuacion: "Auto inadmite demanda",
    anotacion:
      "Se inadmite la demanda. Se concede a la parte demandante el término de cinco (5) días para subsanarla, so pena de rechazo.",
  },
  {
    actuacion: "Traslado recurso de reposición",
    anotacion:
      "Se corre traslado del recurso de reposición interpuesto por la parte demandada por el término de tres (3) días.",
  },
  {
    actuacion: "Auto pone en conocimiento",
    anotacion:
      "Se pone en conocimiento de las partes el informe del perito por el término de diez (10) días.",
  },
  {
    actuacion: "Auto requiere pago de expensas",
    anotacion:
      "Se requiere a la parte actora para que dentro de los 30 días calendario siguientes acredite el pago de las expensas.",
  },
  {
    actuacion: "Constancia secretarial",
    anotacion: "Se deja constancia de que el expediente ingresó al despacho. No se fija término.",
  },
];

export interface ResultadoSimulacion {
  radicado: string;
  despacho: string | null;
  actuacion: string;
  anotacion: string;
  fechaActuacion: string;
  /** Lo que concluyó el análisis IA (simulado). */
  analisis:
    | { tipo: "plazo"; dias: number; esHabil: boolean }
    | { tipo: "sin_plazo" }
    | { tipo: "indeterminado" };
  /** Fecha límite calculada (DD/MM/AAAA), si hubo plazo. */
  fechaLimite: string | null;
  notificacionesProgramadas: number;
  simulacionesRestantes: number;
}

export type ErrorSimulacion =
  | { tipo: "limite"; mensaje: string }
  | { tipo: "sin_procesos"; mensaje: string }
  | { tipo: "interno"; mensaje: string };

type DbSimulacion = Pick<
  PrismaClient,
  "proceso" | "actuacion" | "notificacionInapp"
>;

function isoFecha(f: FechaCO): string {
  return `${f.anio}-${String(f.mes).padStart(2, "0")}-${String(f.dia).padStart(2, "0")}`;
}

/** CPNU falsa: "encuentra" el proceso y devuelve una sola actuación nueva. */
export function crearCPNUSimulada(nueva: ActuacionCPNU): ClienteCPNU {
  const noDisponible = async () =>
    err({ tipo: "no_disponible", detalle: "No disponible en la simulación del demo." });
  return {
    async consultarPorRadicado() {
      return ok({
        procesos: [
          {
            idProceso: 1,
            llaveProceso: nueva.llaveProceso,
            fechaProceso: null,
            fechaUltimaActuacion: nueva.fechaActuacion,
            despacho: "",
            departamento: "",
            sujetosProcesales: "",
            esPrivado: false,
            cantFilas: 1,
          },
        ],
        paginacion: { cantidadRegistros: 1, registrosPagina: 1, cantidadPaginas: 1, pagina: 1 },
      });
    },
    async obtenerActuaciones() {
      return ok([nueva]);
    },
    obtenerDocumentosActuacion: noDisponible,
    descargarDocumento: noDisponible,
  } as unknown as ClienteCPNU;
}

const loggerSilencioso = { info() {}, warn() {}, error() {} };

/**
 * Simula la llegada de una actuación nueva en uno de los procesos activos del
 * usuario demo y la procesa con el pipeline real del worker.
 */
export async function simularRevisionDemo(
  db: DbSimulacion,
  usuarioId: string,
  hoy: FechaCO = hoyCO(),
): Promise<Result<ResultadoSimulacion, ErrorSimulacion>> {
  const hechas = await db.actuacion.count({
    where: { llave_proceso: LLAVE_SIMULACION, proceso: { usuario_id: usuarioId } },
  });
  if (hechas >= MAX_SIMULACIONES_POR_CUENTA) {
    return err({
      tipo: "limite",
      mensaje: "Ya hizo todas las simulaciones de esta cuenta demo. Puede abrir una nueva desde el inicio.",
    });
  }

  const procesos = await db.proceso.findMany({
    where: { usuario_id: usuarioId, seguimiento_activo: true, columna_kanban: { not: "archivado" } },
    orderBy: { radicado: "asc" },
    select: { id: true, radicado: true, despacho: true },
  });
  if (procesos.length === 0) {
    return err({
      tipo: "sin_procesos",
      mensaje: "No hay procesos con seguimiento activo para simular.",
    });
  }

  // Rotación determinista: cada clic usa otro proceso y otra actuación.
  const proceso = procesos[hechas % procesos.length]!;
  const plantilla = PLANTILLAS_SIMULACION[hechas % PLANTILLAS_SIMULACION.length]!;
  const fecha = retrocederDiasHabiles(hoy, 0); // último día hábil
  const fechaIso = isoFecha(fecha);
  const idReg = Date.now();

  const nueva: ActuacionCPNU = {
    idRegActuacion: idReg,
    llaveProceso: LLAVE_SIMULACION,
    consActuacion: 100 + hechas,
    fechaActuacion: fechaIso,
    actuacion: plantilla.actuacion,
    anotacion: plantilla.anotacion,
    fechaInicia: null,
    fechaFinaliza: null,
    fechaRegistro: fechaIso,
    existeDocs: false,
  };

  try {
    await ejecutarRevisionDiaria({
      procesoIds: [proceso.id],
      cpnuClient: crearCPNUSimulada(nueva),
      sincronizarDocumentosFn: async (procesoId) => ({
        procesoId,
        descargados: 0,
        yaExistian: 0,
        fallidos: 0,
      }),
      logger: loggerSilencioso,
      ahora: hoy,
    });

    const creada = await db.actuacion.findFirst({
      where: { proceso_id: proceso.id, id_actuacion_cpnu: String(idReg) },
      select: {
        plazos: {
          select: {
            dias: true,
            es_habil: true,
            indeterminado: true,
            fecha_limite: true,
            _count: { select: { notificaciones: true } },
          },
        },
      },
    });
    if (!creada) {
      return err({ tipo: "interno", mensaje: "No se pudo completar la simulación." });
    }

    const plazo = creada.plazos[0];
    const analisis: ResultadoSimulacion["analisis"] = !plazo
      ? { tipo: "sin_plazo" }
      : plazo.indeterminado || plazo.dias === null
        ? { tipo: "indeterminado" }
        : { tipo: "plazo", dias: plazo.dias, esHabil: plazo.es_habil };
    const fechaLimite = plazo?.fecha_limite ? formatoFechaSoloDia(plazo.fecha_limite) : null;

    await db.notificacionInapp.create({
      data: {
        usuario_id: usuarioId,
        titulo: "Nueva actuación detectada",
        mensaje:
          `"${plantilla.actuacion}" en el proceso ${proceso.radicado}. ` +
          (analisis.tipo === "plazo"
            ? `Término de ${analisis.dias} días ${analisis.esHabil ? "hábiles" : "calendario"}; vence el ${fechaLimite}.`
            : "La actuación no fija un término a su cargo."),
      },
    });

    return ok({
      radicado: proceso.radicado,
      despacho: proceso.despacho,
      actuacion: plantilla.actuacion,
      anotacion: plantilla.anotacion,
      fechaActuacion: formatoFechaSoloDia(fecha.date),
      analisis,
      fechaLimite,
      notificacionesProgramadas: plazo?._count.notificaciones ?? 0,
      simulacionesRestantes: MAX_SIMULACIONES_POR_CUENTA - hechas - 1,
    });
  } catch (e) {
    console.error("[demo] Error en la simulación:", e);
    return err({ tipo: "interno", mensaje: "No se pudo completar la simulación. Intente de nuevo." });
  }
}
