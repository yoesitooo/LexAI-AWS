/**
 * Descarga y almacenamiento de documentos de actuaciones desde la CPNU.
 *
 * Este módulo baja los documentos adjuntos a las actuaciones de un proceso
 * (Rama Judicial) y los guarda en el expediente digital de LexAI, reutilizando
 * la tabla `documento_proceso` con `origen = "cpnu"`.
 *
 * Es idempotente: usa `id_documento_cpnu` para no volver a descargar un
 * documento ya almacenado en el proceso.
 *
 * El acceso al almacenamiento está detrás de la interfaz `AlmacenamientoDocumentos`
 * para poder migrar de disco local a S3 (u otro) sin tocar la lógica de negocio.
 */

import { randomUUID } from "crypto";
import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { prisma } from "./db";
import { clienteCPNU, extensionATipoMime } from "./cpnu-client";
import type { ClienteCPNU } from "./cpnu-client";

// =============================================================================
// ABSTRACCIÓN DE ALMACENAMIENTO
// =============================================================================

/**
 * Contrato de almacenamiento binario de documentos.
 * La implementación por defecto escribe en `uploads/{procesoId}/`.
 * Para migrar a S3 basta con proveer otra implementación.
 */
export interface AlmacenamientoDocumentos {
  /**
   * Persiste el contenido del documento y devuelve el nombre en disco/clave usada.
   */
  guardar(
    procesoId: string,
    nombreDisco: string,
    contenido: Buffer,
  ): Promise<void>;
}

/** Directorio base de subidas (mismo que usa la API de subida manual). */
export function directorioUploads(): string {
  return join(process.cwd(), "uploads");
}

/** Implementación de almacenamiento en disco local. */
export const almacenamientoDisco: AlmacenamientoDocumentos = {
  async guardar(procesoId, nombreDisco, contenido) {
    const base = directorioUploads();
    const dir = join(base, procesoId);
    if (!existsSync(base)) {
      await mkdir(base, { recursive: true });
    }
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, nombreDisco), contenido);
  },
};

// =============================================================================
// TIPOS
// =============================================================================

export interface Logger {
  info: (mensaje: string, detalle?: unknown) => void;
  warn: (mensaje: string, detalle?: unknown) => void;
  error: (mensaje: string, detalle?: unknown) => void;
}

const loggerNoop: Logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
};

export interface OpcionesSincronizacion {
  db?: typeof prisma;
  cpnu?: ClienteCPNU;
  almacenamiento?: AlmacenamientoDocumentos;
  logger?: Logger;
  /** Tamaño máximo por documento en bytes (evita descargas gigantes). Default 50 MB. */
  maxBytes?: number;
}

export interface ResultadoSincronizacion {
  procesoId: string;
  descargados: number;
  yaExistian: number;
  fallidos: number;
}

/** Tamaño máximo por documento CPNU (50 MB). */
const MAX_BYTES_DEFAULT = 50 * 1024 * 1024;

// =============================================================================
// UTILIDADES
// =============================================================================

/**
 * Deriva un nombre de archivo con extensión a partir de los metadatos del
 * documento y del nombre sugerido por la descarga.
 */
export function derivarNombreArchivo(
  nombreDoc: string,
  tipoExtension: string | null,
  nombreDescarga: string,
): string {
  const tieneExtension = (n: string) => /\.[a-z0-9]{1,8}$/i.test(n);

  // Preferir el nombre de la descarga si trae extensión y no es el genérico.
  if (nombreDescarga && nombreDescarga !== "documento" && tieneExtension(nombreDescarga)) {
    return sanitizarNombre(nombreDescarga);
  }
  const base = nombreDoc && nombreDoc.trim().length > 0 ? nombreDoc : "documento";
  if (tieneExtension(base)) return sanitizarNombre(base);
  if (tipoExtension) return sanitizarNombre(`${base}.${tipoExtension.replace(/^\./, "")}`);
  return sanitizarNombre(base);
}

/** Elimina caracteres problemáticos de un nombre de archivo. */
export function sanitizarNombre(nombre: string): string {
  return nombre
    .replace(/[\\/:*?"<>|\r\n]+/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}

// =============================================================================
// SINCRONIZACIÓN
// =============================================================================

/**
 * Descarga y almacena todos los documentos faltantes de un proceso.
 *
 * Recorre las actuaciones con `existe_docs = true`, lista sus documentos en la
 * CPNU y descarga los que aún no estén en el expediente. Resiliente: los fallos
 * por documento/actuación se registran y no detienen el resto.
 *
 * @returns Resumen con conteos de descargados, ya existentes y fallidos.
 */
export async function sincronizarDocumentosProceso(
  procesoId: string,
  opciones: OpcionesSincronizacion = {},
): Promise<ResultadoSincronizacion> {
  const db = opciones.db ?? prisma;
  const cpnu = opciones.cpnu ?? clienteCPNU;
  const almacenamiento = opciones.almacenamiento ?? almacenamientoDisco;
  const logger = opciones.logger ?? loggerNoop;
  const maxBytes = opciones.maxBytes ?? MAX_BYTES_DEFAULT;

  const resultado: ResultadoSincronizacion = {
    procesoId,
    descargados: 0,
    yaExistian: 0,
    fallidos: 0,
  };

  // Proceso (para usuario_id, requerido en el registro del documento)
  const proceso = await db.proceso.findUnique({
    where: { id: procesoId },
    select: { id: true, usuario_id: true },
  });

  if (!proceso) {
    logger.warn(`Proceso ${procesoId} no encontrado; se omite sincronización de documentos.`);
    return resultado;
  }

  // Actuaciones con documentos
  const actuaciones = await db.actuacion.findMany({
    where: { proceso_id: procesoId, existe_docs: true },
    select: { id: true, id_actuacion_cpnu: true },
  });

  if (actuaciones.length === 0) {
    return resultado;
  }

  // IDs de documentos CPNU ya almacenados en este proceso (deduplicación)
  const existentes = await db.documentoProceso.findMany({
    where: { proceso_id: procesoId, origen: "cpnu", id_documento_cpnu: { not: null } },
    select: { id_documento_cpnu: true },
  });
  const yaDescargados = new Set(
    existentes.map((d) => d.id_documento_cpnu).filter((v): v is string => v !== null),
  );

  for (const actuacion of actuaciones) {
    try {
      const listado = await cpnu.obtenerDocumentosActuacion(actuacion.id_actuacion_cpnu);

      if (!listado.ok) {
        logger.warn(
          `No se pudo listar documentos de la actuación ${actuacion.id_actuacion_cpnu}: ${listado.error.tipo}`,
        );
        resultado.fallidos++;
        continue;
      }

      for (const doc of listado.value) {
        const idDocCpnu = String(doc.idRegDocumento);

        if (yaDescargados.has(idDocCpnu)) {
          resultado.yaExistian++;
          continue;
        }

        try {
          const descarga = await cpnu.descargarDocumento(doc.idRegDocumento);

          if (!descarga.ok) {
            logger.warn(
              `Fallo al descargar documento ${idDocCpnu}: ${descarga.error.tipo}`,
            );
            resultado.fallidos++;
            continue;
          }

          if (descarga.value.tamanoBytes > maxBytes) {
            logger.warn(
              `Documento ${idDocCpnu} excede el máximo (${descarga.value.tamanoBytes} bytes); se omite.`,
            );
            resultado.fallidos++;
            continue;
          }

          const nombre = derivarNombreArchivo(
            doc.nombre,
            doc.tipo,
            descarga.value.nombreArchivo,
          );

          const tipoMime =
            descarga.value.tipoMime && descarga.value.tipoMime !== "application/octet-stream"
              ? descarga.value.tipoMime
              : extensionATipoMime(doc.tipo);

          const nombreDisco = `${randomUUID()}-${nombre}`;

          await almacenamiento.guardar(procesoId, nombreDisco, descarga.value.contenido);

          await db.documentoProceso.create({
            data: {
              proceso_id: procesoId,
              usuario_id: proceso.usuario_id,
              actuacion_id: actuacion.id,
              origen: "cpnu",
              id_documento_cpnu: idDocCpnu,
              nombre,
              nombre_disco: nombreDisco,
              tipo_mime: tipoMime,
              tamano_bytes: descarga.value.tamanoBytes,
            },
          });

          yaDescargados.add(idDocCpnu);
          resultado.descargados++;
        } catch (error) {
          // Puede ser una colisión con el índice único (descarga concurrente) u otro fallo.
          const mensaje = error instanceof Error ? error.message : String(error);
          logger.warn(`Error almacenando documento ${idDocCpnu}: ${mensaje}`);
          resultado.fallidos++;
        }
      }
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : String(error);
      logger.error(
        `Error procesando documentos de la actuación ${actuacion.id_actuacion_cpnu}: ${mensaje}`,
      );
      resultado.fallidos++;
    }
  }

  if (resultado.descargados > 0 || resultado.fallidos > 0) {
    logger.info(
      `Documentos proceso ${procesoId}: ${resultado.descargados} descargados, ` +
        `${resultado.yaExistian} ya existían, ${resultado.fallidos} fallidos.`,
    );
  }

  return resultado;
}
