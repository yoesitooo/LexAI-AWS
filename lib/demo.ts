/**
 * Modo demo público — LexAI
 *
 * Cuando `DEMO_MODE=true`, la landing ofrece un botón "Probar demo" que crea
 * una cuenta temporal AISLADA para cada visitante, con un abogado ficticio y
 * procesos, actuaciones, plazos y notificaciones de ejemplo. Así nadie
 * necesita registrarse, y lo que un visitante cambie no afecta a los demás.
 *
 * - Todos los datos son inventados (nombres, partes y radicados ficticios):
 *   el demo nunca muestra información real de procesos judiciales.
 * - Las fechas se generan relativas a "hoy" (zona America/Bogota) y los plazos
 *   se calculan con la misma `calcularFechaLimite` que usa el worker, para que
 *   el tablero siempre muestre un plazo vencido, uno por vencer y uno al día.
 * - Las cuentas demo se eliminan tras `HORAS_VIDA_DEMO` (ver /api/cron/limpiar-demos).
 * - Se limita la cantidad de cuentas creadas por hora (`MAX_DEMOS_POR_HORA`).
 */

import { randomBytes, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { calcularFechaLimite } from "@/lib/calculadora-plazos";
import { esFestivo } from "@/lib/festivos";
import { type FechaCO, fechaCODesdeComponentes, hoyCO } from "@/lib/formato";
import { type Result, ok, err } from "@/lib/repository";

// =============================================================================
// CONFIGURACIÓN
// =============================================================================

/** Dominio reservado para las cuentas demo (no recibe correo). */
export const DOMINIO_EMAIL_DEMO = "demo.lexai.invalid";

/** Horas que vive una cuenta demo antes de ser eliminada. */
export const HORAS_VIDA_DEMO = 24;

/** Máximo de cuentas demo que se pueden crear por hora (anti-abuso). */
export const MAX_DEMOS_POR_HORA = 60;

/** `true` si la instancia corre en modo demo público. */
export function esModoDemo(): boolean {
  return process.env.DEMO_MODE === "true";
}

/** `true` si el email pertenece a una cuenta demo. */
export function esEmailDemo(email: string | null | undefined): boolean {
  return typeof email === "string" && email.toLowerCase().endsWith(`@${DOMINIO_EMAIL_DEMO}`);
}

// =============================================================================
// DATOS FICTICIOS (función pura, testeable)
// =============================================================================

export type ColumnaDemo = "nuevo" | "en_seguimiento" | "requiere_accion" | "vencido" | "archivado";

export interface PlazoDemo {
  dias: number;
  esHabil: boolean;
  fechaInicio: FechaCO;
  fechaLimite: FechaCO;
  estado: "pendiente" | "cumplido" | "vencido";
}

export interface ActuacionDemo {
  idCpnu: string;
  fecha: FechaCO;
  actuacion: string;
  anotacion: string;
  plazo?: PlazoDemo;
}

export interface ProcesoDemo {
  radicado: string;
  despacho: string;
  departamento: string;
  ciudad: string;
  tipoProceso: string;
  demandante: string;
  demandado: string;
  columna: ColumnaDemo;
  seguimientoActivo: boolean;
  actuaciones: ActuacionDemo[];
  comentario?: string;
}

export interface NotificacionDemo {
  titulo: string;
  mensaje: string;
  leida: boolean;
}

export interface DatosDemo {
  procesos: ProcesoDemo[];
  notificaciones: NotificacionDemo[];
}

function esDiaHabil(fecha: FechaCO): boolean {
  return fecha.diaSemana !== 0 && fecha.diaSemana !== 6 && !esFestivo(fecha);
}

/** Retrocede `n` días hábiles desde `desde` (n = 0 → el día hábil más cercano hacia atrás). */
export function retrocederDiasHabiles(desde: FechaCO, n: number): FechaCO {
  let actual = fechaCODesdeComponentes(desde.anio, desde.mes, desde.dia);
  const unDia = 24 * 60 * 60 * 1000;
  const mover = () => {
    const [a, m, d] = partes(new Date(actual.date.getTime() - unDia));
    actual = fechaCODesdeComponentes(a, m, d);
  };
  while (!esDiaHabil(actual)) mover();
  for (let i = 0; i < n; i++) {
    mover();
    while (!esDiaHabil(actual)) mover();
  }
  return actual;
}

const FORMATO_ISO_CO = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Bogota",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function partes(d: Date): [number, number, number] {
  const [a, m, dd] = FORMATO_ISO_CO.format(d).split("-").map(Number);
  return [a!, m!, dd!];
}

function plazo(fechaInicio: FechaCO, dias: number, estado: PlazoDemo["estado"]): PlazoDemo {
  const r = calcularFechaLimite(fechaInicio, dias, true);
  if (!r.ok) {
    throw new Error(`[demo] No se pudo calcular el plazo: ${r.error.mensaje}`);
  }
  return { dias, esHabil: true, fechaInicio, fechaLimite: r.value, estado };
}

/** Radicado ficticio de 23 dígitos (consecutivos 99xxx para no coincidir con casos reales comunes). */
function radicado(despacho: string, anio: number, consecutivo: number): string {
  return `11001${"40"}${"03"}${despacho}${anio}${String(99000 + consecutivo).padStart(5, "0")}00`;
}

/**
 * Construye los datos del demo relativos a `hoy`. Función pura: no toca la BD.
 */
export function construirDatosDemo(hoy: FechaCO = hoyCO()): DatosDemo {
  const hace = (n: number) => retrocederDiasHabiles(hoy, n);
  const anio = hoy.anio;

  // 1. Plazo VENCIDO: traslado de 5 días hábiles notificado hace 12 días hábiles.
  const fVencido = hace(12);
  // 2. Plazo POR VENCER: término de 3 días hábiles notificado hace 1 día hábil.
  const fPorVencer = hace(1);
  // 3. Plazo AL DÍA: término de 10 días hábiles notificado hace 2 días hábiles.
  const fAlDia = hace(2);

  const procesos: ProcesoDemo[] = [
    {
      radicado: radicado("012", anio, 101),
      despacho: "Juzgado 012 Civil Municipal de Bogotá",
      departamento: "BOGOTÁ",
      ciudad: "BOGOTÁ, D.C.",
      tipoProceso: "Ejecutivo singular",
      demandante: "Inversiones Ejemplo S.A.S.",
      demandado: "Carlos Demo Rodríguez",
      columna: "vencido",
      seguimientoActivo: true,
      comentario: "Pendiente confirmar con el cliente si se pagó antes del vencimiento.",
      actuaciones: [
        {
          idCpnu: "DEMO-101-1",
          fecha: hace(30),
          actuacion: "Auto admite demanda",
          anotacion: "Se libra mandamiento de pago. Notifíquese al demandado.",
        },
        {
          idCpnu: "DEMO-101-2",
          fecha: fVencido,
          actuacion: "Traslado excepciones",
          anotacion:
            "Se corre traslado de las excepciones de mérito por el término de cinco (5) días.",
          plazo: plazo(fVencido, 5, "vencido"),
        },
      ],
    },
    {
      radicado: radicado("045", anio, 102),
      despacho: "Juzgado 045 Civil del Circuito de Bogotá",
      departamento: "BOGOTÁ",
      ciudad: "BOGOTÁ, D.C.",
      tipoProceso: "Verbal",
      demandante: "Laura Ficticia Gómez",
      demandado: "Constructora Modelo Ltda.",
      columna: "requiere_accion",
      seguimientoActivo: true,
      actuaciones: [
        {
          idCpnu: "DEMO-102-1",
          fecha: hace(20),
          actuacion: "Auto fija fecha audiencia",
          anotacion: "Se fija fecha para audiencia inicial (art. 372 CGP).",
        },
        {
          idCpnu: "DEMO-102-2",
          fecha: fPorVencer,
          actuacion: "Auto requiere parte",
          anotacion:
            "Se requiere a la parte demandante para que aporte el dictamen pericial en el término de tres (3) días.",
          plazo: plazo(fPorVencer, 3, "pendiente"),
        },
      ],
    },
    {
      radicado: radicado("007", anio, 103),
      despacho: "Juzgado 007 Laboral del Circuito de Bogotá",
      departamento: "BOGOTÁ",
      ciudad: "BOGOTÁ, D.C.",
      tipoProceso: "Ordinario laboral",
      demandante: "Andrés Ejemplo Martínez",
      demandado: "Servicios Demo S.A.",
      columna: "en_seguimiento",
      seguimientoActivo: true,
      actuaciones: [
        {
          idCpnu: "DEMO-103-1",
          fecha: fAlDia,
          actuacion: "Auto admite demanda",
          anotacion:
            "Se admite la demanda y se ordena correr traslado por el término de diez (10) días.",
          plazo: plazo(fAlDia, 10, "pendiente"),
        },
      ],
    },
    {
      radicado: radicado("021", anio, 104),
      despacho: "Juzgado 021 Administrativo de Bogotá",
      departamento: "BOGOTÁ",
      ciudad: "BOGOTÁ, D.C.",
      tipoProceso: "Nulidad y restablecimiento del derecho",
      demandante: "Sofía Demo Herrera",
      demandado: "Entidad Pública Ficticia",
      columna: "en_seguimiento",
      seguimientoActivo: true,
      actuaciones: [
        {
          idCpnu: "DEMO-104-1",
          fecha: hace(8),
          actuacion: "Constancia secretarial",
          anotacion: "Ingresa el expediente al despacho para resolver.",
        },
      ],
    },
    {
      radicado: radicado("030", anio, 105),
      despacho: "Juzgado 030 de Familia de Bogotá",
      departamento: "BOGOTÁ",
      ciudad: "BOGOTÁ, D.C.",
      tipoProceso: "Fijación de cuota alimentaria",
      demandante: "Paula Ejemplo Ruiz",
      demandado: "Jorge Demo Castro",
      columna: "nuevo",
      seguimientoActivo: true,
      actuaciones: [
        {
          idCpnu: "DEMO-105-1",
          fecha: hace(3),
          actuacion: "Radicación de proceso",
          anotacion: "Actuación de radicación del proceso.",
        },
      ],
    },
    {
      radicado: radicado("018", anio - 1, 106),
      despacho: "Juzgado 018 Civil Municipal de Bogotá",
      departamento: "BOGOTÁ",
      ciudad: "BOGOTÁ, D.C.",
      tipoProceso: "Ejecutivo hipotecario",
      demandante: "Banco Ficticio de Colombia",
      demandado: "Elena Demo Vargas",
      columna: "archivado",
      seguimientoActivo: false,
      actuaciones: [
        {
          idCpnu: "DEMO-106-1",
          fecha: hace(60),
          actuacion: "Auto termina proceso por pago",
          anotacion: "Se declara terminado el proceso por pago total de la obligación. Archívese.",
        },
      ],
    },
  ];

  const notificaciones: NotificacionDemo[] = [
    {
      titulo: "Plazo vencido",
      mensaje: `Venció el término de traslado de excepciones en el proceso ${procesos[0]!.radicado}.`,
      leida: false,
    },
    {
      titulo: "Plazo por vencer",
      mensaje: `Quedan pocos días hábiles para aportar el dictamen pericial en el proceso ${procesos[1]!.radicado}.`,
      leida: false,
    },
    {
      titulo: "Nueva actuación",
      mensaje: `Se registró una nueva actuación ("Auto admite demanda") en el proceso ${procesos[2]!.radicado}.`,
      leida: true,
    },
  ];

  return { procesos, notificaciones };
}

// =============================================================================
// CREACIÓN Y LIMPIEZA DE CUENTAS DEMO (acceso a BD)
// =============================================================================

export interface CredencialesDemo {
  email: string;
  password: string;
}

export type ErrorDemo =
  | { tipo: "deshabilitado"; mensaje: string }
  | { tipo: "limite"; mensaje: string }
  | { tipo: "interno"; mensaje: string };

type DbDemo = Pick<PrismaClient, "usuario" | "$transaction">;

/**
 * Crea una cuenta demo aislada con sus datos ficticios y devuelve sus credenciales.
 */
export async function crearCuentaDemo(
  db: DbDemo,
  ahora: Date = new Date(),
): Promise<Result<CredencialesDemo, ErrorDemo>> {
  if (!esModoDemo()) {
    return err({ tipo: "deshabilitado", mensaje: "El modo demo no está activo." });
  }

  const haceUnaHora = new Date(ahora.getTime() - 60 * 60 * 1000);
  const recientes = await db.usuario.count({
    where: { email: { endsWith: `@${DOMINIO_EMAIL_DEMO}` }, creado_en: { gte: haceUnaHora } },
  });
  if (recientes >= MAX_DEMOS_POR_HORA) {
    return err({
      tipo: "limite",
      mensaje: "El demo está muy concurrido en este momento. Intente de nuevo en unos minutos.",
    });
  }

  const email = `demo-${randomUUID().slice(0, 12)}@${DOMINIO_EMAIL_DEMO}`;
  const password = randomBytes(18).toString("base64url");
  const passwordHash = await bcrypt.hash(password, 10);
  const datos = construirDatosDemo();

  try {
    await db.$transaction(
      async (tx) => {
        const usuario = await tx.usuario.create({
          data: {
            nombre: "Abogada Demo",
            email,
            password_hash: passwordHash,
            configuracion: { create: {} },
          },
        });

        for (const p of datos.procesos) {
          const proceso = await tx.proceso.create({
            data: {
              usuario_id: usuario.id,
              radicado: p.radicado,
              despacho: p.despacho,
              departamento: p.departamento,
              ciudad: p.ciudad,
              tipo_proceso: p.tipoProceso,
              sujetos_procesales: JSON.stringify({
                demandante: p.demandante,
                demandado: p.demandado,
              }),
              columna_kanban: p.columna,
              seguimiento_activo: p.seguimientoActivo,
              ultima_revision_en: ahora,
            },
          });

          for (const [i, a] of p.actuaciones.entries()) {
            const actuacion = await tx.actuacion.create({
              data: {
                proceso_id: proceso.id,
                id_actuacion_cpnu: a.idCpnu,
                consecutivo: i + 1,
                fecha_actuacion: a.fecha.date,
                actuacion: a.actuacion,
                anotacion: a.anotacion,
                fecha_registro: a.fecha.date,
                es_nueva: i === p.actuaciones.length - 1 && p.columna !== "archivado",
                analisis_completado: true,
              },
            });

            if (a.plazo) {
              const plazoCreado = await tx.plazo.create({
                data: {
                  actuacion_id: actuacion.id,
                  proceso_id: proceso.id,
                  dias: a.plazo.dias,
                  es_habil: a.plazo.esHabil,
                  fecha_inicio: a.plazo.fechaInicio.date,
                  fecha_limite: a.plazo.fechaLimite.date,
                  estado: a.plazo.estado,
                },
              });
              if (a.plazo.estado === "pendiente") {
                await tx.notificacion.create({
                  data: {
                    plazo_id: plazoCreado.id,
                    usuario_id: usuario.id,
                    fecha_programada: a.plazo.fechaLimite.date,
                    canal: "inapp",
                  },
                });
              }
            }
          }

          if (p.comentario) {
            await tx.comentarioProceso.create({
              data: { proceso_id: proceso.id, usuario_id: usuario.id, texto: p.comentario },
            });
          }
        }

        await tx.notificacionInapp.createMany({
          data: datos.notificaciones.map((n) => ({ usuario_id: usuario.id, ...n })),
        });
      },
      { timeout: 20_000 },
    );
  } catch (e) {
    console.error("[demo] Error creando cuenta demo:", e);
    return err({ tipo: "interno", mensaje: "No se pudo preparar el demo. Intente de nuevo." });
  }

  return ok({ email, password });
}

/**
 * Elimina las cuentas demo con más de `HORAS_VIDA_DEMO` horas (cascada a sus datos).
 * @returns cantidad de cuentas eliminadas
 */
export async function limpiarCuentasDemo(
  db: Pick<PrismaClient, "usuario">,
  ahora: Date = new Date(),
): Promise<number> {
  const limite = new Date(ahora.getTime() - HORAS_VIDA_DEMO * 60 * 60 * 1000);
  const { count } = await db.usuario.deleteMany({
    where: { email: { endsWith: `@${DOMINIO_EMAIL_DEMO}` }, creado_en: { lt: limite } },
  });
  return count;
}
