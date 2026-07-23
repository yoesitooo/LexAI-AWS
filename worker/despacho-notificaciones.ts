/**
 * Despacho de notificaciones — LexAI MVP
 *
 * Cron a las 07:00 America/Bogotá que:
 * 1. Barre notificaciones programadas del día (estado = 'programada', fecha_programada <= ahora)
 * 2. Para cada notificación: obtiene la configuración del usuario dueño
 * 3. Envía por cada canal activo del usuario, con aislamiento por canal
 * 4. Reintenta hasta 3 veces separadas ≥60 s por canal
 * 5. El fallo de un canal no bloquea a los demás
 * 6. Registra estado/intentos por canal
 * 7. Marca la notificación como 'enviada' si al menos un canal tiene éxito,
 *    'fallida' si todos fallan
 *
 * Requisitos cubiertos: R10.1, R10.7, R10.8
 */

import cron from "node-cron";
import { prisma } from "../lib/db";
import {
  canalInApp,
  canalEmail,
  type CanalNotificacion,
  type ConfiguracionUsuario,
  type ContenidoNotificacion,
  type DatosDestinatario,
} from "../lib/notificaciones";

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

/** Máximo de intentos de envío por canal */
export const MAX_INTENTOS = 3;

/** Tiempo de espera mínimo entre reintentos por canal (ms) */
export const ESPERA_ENTRE_REINTENTOS_MS = 60_000;

/** Timeout máximo por intento de notificación (ms) — 5 minutos */
export const TIMEOUT_INTENTO_MS = 5 * 60 * 1000;

// ---------------------------------------------------------------------------
// Canales disponibles
// ---------------------------------------------------------------------------

/** Canales de notificación registrados en el sistema */
export function obtenerCanales(): CanalNotificacion[] {
  return [canalInApp, canalEmail];
}

// ---------------------------------------------------------------------------
// Funciones auxiliares
// ---------------------------------------------------------------------------

/**
 * Espera un tiempo determinado (para el delay entre reintentos).
 */
export function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Envía una notificación por un canal específico con reintentos.
 * Reintenta hasta MAX_INTENTOS veces con espera ≥60s entre intentos.
 * Respeta el timeout de 5 minutos por intento.
 *
 * @returns objeto con éxito, número de intentos, y error si falló
 */
export async function enviarConReintentos(
  canal: CanalNotificacion,
  destinatario: DatosDestinatario,
  contenido: ContenidoNotificacion,
  esperarFn: (ms: number) => Promise<void> = esperar,
): Promise<{ exito: boolean; intentos: number; error?: string }> {
  let ultimoError: string | undefined;

  for (let intento = 1; intento <= MAX_INTENTOS; intento++) {
    try {
      // Crear promesa con timeout
      const envioPromise = canal.enviar(destinatario, contenido);
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error("Timeout: intento excedió 5 minutos")),
          TIMEOUT_INTENTO_MS,
        ),
      );

      const resultado = await Promise.race([envioPromise, timeoutPromise]);

      if (resultado.ok) {
        return { exito: true, intentos: intento };
      }

      ultimoError = resultado.error.detalle ?? resultado.error.mensaje;
    } catch (err) {
      ultimoError =
        err instanceof Error ? err.message : "Error desconocido";
    }

    // Si no es el último intento, esperar antes de reintentar
    if (intento < MAX_INTENTOS) {
      await esperarFn(ESPERA_ENTRE_REINTENTOS_MS);
    }
  }

  return { exito: false, intentos: MAX_INTENTOS, error: ultimoError };
}

/**
 * Mapea la configuración de Prisma al tipo ConfiguracionUsuario de notificaciones.
 */
export function mapearConfiguracion(config: {
  canal_inapp: boolean;
  canal_email: boolean;
  canal_whatsapp: boolean;
  numero_whatsapp: string | null;
}): ConfiguracionUsuario {
  return {
    canal_inapp: config.canal_inapp,
    canal_email: config.canal_email,
    canal_whatsapp: config.canal_whatsapp,
    numero_whatsapp: config.numero_whatsapp,
  };
}

// ---------------------------------------------------------------------------
// Lógica principal de despacho
// ---------------------------------------------------------------------------

/**
 * Ejecuta el despacho de notificaciones programadas.
 * Busca todas las notificaciones con estado 'programada' cuya fecha_programada <= ahora,
 * y las envía por cada canal activo del usuario.
 */
export async function ejecutarDespacho(
  ahora?: Date,
  canalesFn: () => CanalNotificacion[] = obtenerCanales,
  esperarFn: (ms: number) => Promise<void> = esperar,
): Promise<void> {
  const fechaActual = ahora ?? new Date();

  console.log(
    `[Despacho] Iniciando despacho de notificaciones — ${fechaActual.toISOString()}`,
  );

  // 1. Buscar notificaciones programadas cuya fecha ya llegó
  const notificaciones = await prisma.notificacion.findMany({
    where: {
      estado: "programada",
      fecha_programada: { lte: fechaActual },
    },
    include: {
      plazo: {
        include: {
          actuacion: true,
          proceso: true,
        },
      },
      usuario: {
        include: {
          configuracion: true,
        },
      },
    },
  });

  console.log(
    `[Despacho] Encontradas ${notificaciones.length} notificaciones para despachar.`,
  );

  if (notificaciones.length === 0) {
    return;
  }

  const canales = canalesFn();

  // 2. Procesar cada notificación
  for (const notif of notificaciones) {
    const usuario = notif.usuario;
    const config = usuario.configuracion;

    if (!config) {
      console.warn(
        `[Despacho] Usuario ${usuario.id} sin configuración. Marcando notificación como fallida.`,
      );
      await prisma.notificacion.update({
        where: { id: notif.id },
        data: {
          estado: "fallida",
          error_detalle: "Usuario sin configuración de canales",
          ultimo_intento_en: new Date(),
        },
      });
      continue;
    }

    const configUsuario = mapearConfiguracion(config);

    // Construir contenido de la notificación
    const contenido: ContenidoNotificacion = {
      titulo: `Plazo procesal — ${notif.plazo.proceso.radicado}`,
      mensaje: construirMensaje(notif),
      notificacion_id: notif.id,
    };

    const destinatario: DatosDestinatario = {
      usuario_id: usuario.id,
      email: usuario.email,
      nombre: usuario.nombre,
      numero_whatsapp: config.numero_whatsapp,
    };

    // 3. Enviar por cada canal activo (aislamiento: fallo de uno no bloquea otro)
    let alMenosUnExito = false;
    const erroresPorCanal: string[] = [];

    const resultadosCanal = await Promise.allSettled(
      canales
        .filter((canal) => canal.disponiblePara(configUsuario))
        .map(async (canal) => {
          const resultado = await enviarConReintentos(
            canal,
            destinatario,
            contenido,
            esperarFn,
          );

          if (resultado.exito) {
            alMenosUnExito = true;
            console.log(
              `[Despacho] ✓ Canal "${canal.nombre}" exitoso para notif ${notif.id} (intentos: ${resultado.intentos})`,
            );
          } else {
            erroresPorCanal.push(
              `${canal.nombre}: ${resultado.error ?? "error desconocido"} (${resultado.intentos} intentos)`,
            );
            console.error(
              `[Despacho] ✗ Canal "${canal.nombre}" falló para notif ${notif.id} tras ${resultado.intentos} intentos: ${resultado.error}`,
            );
          }

          return resultado;
        }),
    );

    // Calcular total de intentos (suma de todos los canales)
    let totalIntentos = 0;
    for (const r of resultadosCanal) {
      if (r.status === "fulfilled") {
        totalIntentos += r.value.intentos;
      }
    }

    // 4. Actualizar estado de la notificación
    const nuevoEstado = alMenosUnExito ? "enviada" : "fallida";
    const errorDetalle =
      erroresPorCanal.length > 0 ? erroresPorCanal.join("; ") : null;

    await prisma.notificacion.update({
      where: { id: notif.id },
      data: {
        estado: nuevoEstado as "enviada" | "fallida",
        intentos: totalIntentos,
        ultimo_intento_en: new Date(),
        error_detalle: errorDetalle,
      },
    });

    console.log(
      `[Despacho] Notificación ${notif.id} → estado: ${nuevoEstado}`,
    );
  }

  console.log("[Despacho] Despacho completado.");
}

/**
 * Construye el mensaje de la notificación a partir de los datos del plazo.
 */
function construirMensaje(notif: {
  plazo: {
    dias: number | null;
    es_habil: boolean;
    fecha_limite: Date | null;
    proceso: { radicado: string; despacho: string | null };
    actuacion: { actuacion: string };
  };
}): string {
  const { plazo } = notif;
  const tipodia = plazo.es_habil ? "hábiles" : "calendario";
  const fechaLimite = plazo.fecha_limite
    ? new Intl.DateTimeFormat("es-CO", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        timeZone: "America/Bogota",
      }).format(plazo.fecha_limite)
    : "sin determinar";

  return (
    `Proceso: ${plazo.proceso.radicado}\n` +
    `Despacho: ${plazo.proceso.despacho ?? "No especificado"}\n` +
    `Actuación: ${plazo.actuacion.actuacion}\n` +
    `Plazo: ${plazo.dias ?? "?"} días ${tipodia}\n` +
    `Fecha límite: ${fechaLimite}`
  );
}

// ---------------------------------------------------------------------------
// Cron — 07:00 America/Bogotá
// ---------------------------------------------------------------------------

/**
 * Callback del cron de despacho a las 07:00 CO.
 */
async function onCronDespacho(): Promise<void> {
  console.log("[Despacho] Cron 07:00 CO disparado.");
  try {
    await ejecutarDespacho();
  } catch (error) {
    console.error("[Despacho] Error en ejecución del despacho:", error);
  }
}

/**
 * Inicia el cron de despacho de notificaciones.
 * Se ejecuta a las 07:00 America/Bogotá todos los días.
 */
export function iniciarCronDespacho(): void {
  console.log(
    "[Despacho] Programando cron de despacho: 07:00 America/Bogotá",
  );

  cron.schedule(
    "0 7 * * *",
    () => {
      void onCronDespacho();
    },
    {
      timezone: "America/Bogota",
    },
  );

  console.log("[Despacho] Cron de despacho activo.");
}
