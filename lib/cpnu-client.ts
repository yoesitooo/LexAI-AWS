/**
 * Cliente CPNU — Capa aislada de comunicación con la API de la Rama Judicial de Colombia
 * (Consulta de Procesos Nacional Unificada)
 *
 * Este módulo encapsula TODO el acceso HTTP a la API_CPNU. Ningún otro módulo
 * del sistema debe comunicarse directamente con la API. Esto permite:
 * - Ajustar endpoints sin modificar la lógica de negocio
 * - Mockear las respuestas en pruebas
 * - Centralizar rate limiting, reintentos y headers
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ENDPOINTS DOCUMENTADOS:
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * 1. CONSULTA POR RADICADO (CONFIRMADO)
 *    URL: GET https://consultaprocesos.ramajudicial.gov.co:448/api/v2/Procesos/Consulta/NumeroRadicacion
 *    Params: numero (string 23 dígitos), SoloActivos (boolean), pagina (int >= 1)
 *    Headers:
 *      - Accept: application/json, text/plain, *\/*
 *      - Referer: https://consultaprocesos.ramajudicial.gov.co/
 *      - User-Agent: navegador estándar
 *    Respuesta: { procesos: ProcesoCPNU[], paginacion: PaginacionCPNU }
 *
 * 2. DETALLE DE ACTUACIONES POR idProceso (PENDIENTE CONFIRMACIÓN LIVE)
 *    URL esperada: GET https://consultaprocesos.ramajudicial.gov.co:448/api/v2/Proceso/Actuaciones/{idProceso}
 *    Params: pagina (int >= 1)
 *    Headers: mismos que consulta por radicado
 *    Respuesta esperada: { actuaciones: ActuacionCPNU[] } o ActuacionCPNU[]
 *
 *    NOTA: Este endpoint se basa en el análisis del frontend público de
 *    consultaprocesos.ramajudicial.gov.co. La URL sigue el patrón RESTful
 *    de la API v2. Se encapsula aquí para poder ajustarse sin modificar
 *    la lógica de negocio cuando se confirme con una llamada real.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * FORMA DE LA RESPUESTA (procesos[]):
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Cada elemento de procesos[] contiene (campos relevantes para LexAI):
 *   - idProceso: number — ID interno CPNU del proceso
 *   - llaveProceso: string — Llave única del proceso en CPNU
 *   - fechaProceso: string|null — Fecha del proceso
 *   - fechaUltimaActuacion: string|null — Última actuación registrada
 *   - despacho: string — Nombre del juzgado/despacho
 *   - departamento: string — Departamento colombiano
 *   - sujetosProcesales: string — Texto con las partes (demandante/demandado)
 *   - esPrivado: boolean
 *   - cantFilas: number — Total de filas (para paginación)
 *
 * Objeto de paginación (extraído de la respuesta o calculado):
 *   - pagina: number — Página actual
 *   - cantidadPaginas: number — Total de páginas
 *   - cantidadRegistros: number — Total de registros
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * FORMA DE LA RESPUESTA (actuaciones):
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Cada actuación contiene (campos esperados):
 *   - idRegActuacion: number — ID único de la actuación en CPNU
 *   - llaveProceso: string
 *   - consActuacion: number — Consecutivo
 *   - fechaActuacion: string — Fecha de la actuación (ISO o DD/MM/YYYY)
 *   - actuacion: string — Tipo/nombre de la actuación
 *   - anotacion: string — Texto/detalle de la actuación
 *   - fechaInicia: string|null — Inicio de término
 *   - fechaFinaliza: string|null — Fin de término
 *   - fechaRegistro: string — Fecha de registro en el sistema
 *   - conlesión: boolean (campo CPNU, no relevante para LexAI)
 *   - existeDocs: boolean — Si hay documentos adjuntos
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { validarRadicado } from "./validador-radicado";

// =============================================================================
// TIPOS Y CONTRATOS
// =============================================================================

/** Resultado exitoso o fallido sin excepciones */
export type Result<T, E> =
  | { ok: true; value: T }
  | { ok: false; error: E };

/** Proceso obtenido de la CPNU */
export interface ProcesoCPNU {
  /** ID interno del proceso en la CPNU (número) */
  idProceso: number;
  /** Llave única del proceso */
  llaveProceso: string;
  /** Fecha del proceso */
  fechaProceso: string | null;
  /** Fecha de la última actuación */
  fechaUltimaActuacion: string | null;
  /** Nombre del juzgado/despacho */
  despacho: string;
  /** Departamento colombiano */
  departamento: string;
  /** Texto con partes procesales (demandante vs demandado) */
  sujetosProcesales: string;
  /** Si el proceso es privado */
  esPrivado: boolean;
  /** Total de filas para paginación */
  cantFilas: number;
}

/** Actuación de un proceso (historial) */
export interface ActuacionCPNU {
  /** ID único de la actuación en la CPNU */
  idRegActuacion: number;
  /** Llave del proceso al que pertenece */
  llaveProceso: string;
  /** Consecutivo de la actuación */
  consActuacion: number;
  /** Fecha de la actuación */
  fechaActuacion: string;
  /** Tipo/nombre de la actuación (ej: "Auto", "Sentencia") */
  actuacion: string;
  /** Texto descriptivo / anotación de la actuación */
  anotacion: string;
  /** Fecha de inicio de término (si aplica) */
  fechaInicia: string | null;
  /** Fecha de finalización de término (si aplica) */
  fechaFinaliza: string | null;
  /** Fecha de registro en el sistema */
  fechaRegistro: string;
  /** Si existen documentos adjuntos */
  existeDocs: boolean;
}

/**
 * Documento adjunto a una actuación (metadato) obtenido de la CPNU.
 *
 * Confirmado en vivo contra
 * `GET /Proceso/DocumentosActuacion/{idRegActuacion}` (ver scripts/probe-documentos.ts).
 * Forma real de cada elemento:
 *   { idRegDocumento, idConexion, consActuacion, guidDocumento_SXXIW,
 *     nombre, descripcion, tipo, fechaCarga }
 */
export interface DocumentoActuacionCPNU {
  /** ID único del documento en la CPNU (usado para la descarga) */
  idRegDocumento: number;
  /** Consecutivo de la actuación a la que pertenece */
  consActuacion: number | null;
  /** Nombre base del archivo (sin extensión en algunos casos) */
  nombre: string;
  /** Descripción del documento */
  descripcion: string | null;
  /** Extensión/tipo del documento (ej. "pdf", "docx") */
  tipo: string | null;
  /** Fecha de carga del documento */
  fechaCarga: string | null;
}

/**
 * Binario descargado de un documento de la CPNU
 * (`GET /Descarga/Documento/{idRegDocumento}`).
 */
export interface DocumentoDescargadoCPNU {
  /** Contenido binario del archivo */
  contenido: Buffer;
  /** Tipo MIME reportado por la fuente (Content-Type) */
  tipoMime: string;
  /** Nombre de archivo sugerido (Content-Disposition o derivado) */
  nombreArchivo: string;
  /** Tamaño en bytes */
  tamanoBytes: number;
}

/** Fallo en comunicación con la CPNU */
export interface FalloCPNU {
  tipo: "radicado_invalido" | "no_encontrado" | "fuente_no_disponible" | "timeout" | "error";
  detalle: string;
}

/** Información de paginación de la respuesta CPNU */
export interface PaginacionCPNU {
  pagina: number;
  cantidadPaginas: number;
  cantidadRegistros: number;
}

/** Respuesta completa de consulta por radicado */
export interface RespuestaConsultaCPNU {
  procesos: ProcesoCPNU[];
  paginacion: PaginacionCPNU;
}

/** Contrato del cliente CPNU */
export interface ClienteCPNU {
  /**
   * Consulta procesos por número de radicado (23 dígitos validados).
   * Maneja paginación, rate limiting y reintentos internamente.
   */
  consultarPorRadicado(
    radicado: string,
    opciones?: { soloActivos?: boolean; paginaMaxima?: number }
  ): Promise<Result<RespuestaConsultaCPNU, FalloCPNU>>;

  /**
   * Obtiene el histórico completo de actuaciones de un proceso por su idProceso.
   * Endpoint confirmado en vivo: `GET /Proceso/Actuaciones/{idProceso}`.
   */
  obtenerActuaciones(
    idProceso: number | string
  ): Promise<Result<ActuacionCPNU[], FalloCPNU>>;

  /**
   * Lista los documentos adjuntos a una actuación por su idRegActuacion.
   * Endpoint confirmado en vivo: `GET /Proceso/DocumentosActuacion/{idRegActuacion}`.
   * Devuelve un array vacío si la actuación no tiene documentos.
   */
  obtenerDocumentosActuacion(
    idRegActuacion: number | string
  ): Promise<Result<DocumentoActuacionCPNU[], FalloCPNU>>;

  /**
   * Descarga el binario de un documento por su idRegDocumento.
   * Endpoint confirmado en vivo: `GET /Descarga/Documento/{idRegDocumento}`.
   */
  descargarDocumento(
    idRegDocumento: number | string
  ): Promise<Result<DocumentoDescargadoCPNU, FalloCPNU>>;
}

// =============================================================================
// CONSTANTES Y CONFIGURACIÓN
// =============================================================================

const BASE_URL = "https://consultaprocesos.ramajudicial.gov.co:448/api/v2";

const DEFAULT_HEADERS: Record<string, string> = {
  Accept: "application/json, text/plain, */*",
  Referer: "https://consultaprocesos.ramajudicial.gov.co/",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
};

/** Timeout por petición en milisegundos */
const TIMEOUT_MS = 30_000;

/** Máximo de reintentos por petición */
const MAX_REINTENTOS = 3;

/** Espaciado mínimo entre peticiones para rate limiting (500ms = máx 2 req/s) */
const MIN_INTERVALO_MS = 500;

/** Máximo de páginas por consulta */
const MAX_PAGINAS = 100;

// =============================================================================
// IMPLEMENTACIÓN DEL RATE LIMITER
// =============================================================================

class RateLimiter {
  private ultimaPeticion = 0;
  private intervaloMs: number;

  constructor(intervaloMs: number = MIN_INTERVALO_MS) {
    this.intervaloMs = intervaloMs;
  }

  async esperar(): Promise<void> {
    const ahora = Date.now();
    const diferencia = ahora - this.ultimaPeticion;
    if (diferencia < this.intervaloMs) {
      await new Promise((resolve) =>
        setTimeout(resolve, this.intervaloMs - diferencia)
      );
    }
    this.ultimaPeticion = Date.now();
  }
}

// =============================================================================
// NORMALIZACIÓN DE RESPUESTAS
// =============================================================================

/**
 * Normaliza una actuación cruda de la CPNU al contrato ActuacionCPNU.
 *
 * La API real usa `conDocumentos`, `fechaInicial` y `fechaFinal`, mientras que
 * el contrato interno usa `existeDocs`, `fechaInicia` y `fechaFinaliza`. Este
 * normalizador lee AMBOS nombres para ser resiliente a la fuente y a los mocks
 * de prueba (que usan el contrato interno).
 */
function normalizarActuacion(raw: Record<string, unknown>): ActuacionCPNU {
  const leerFecha = (...claves: string[]): string | null => {
    for (const clave of claves) {
      const valor = raw[clave];
      if (typeof valor === "string" && valor.length > 0) return valor;
    }
    return null;
  };

  return {
    idRegActuacion: Number(raw.idRegActuacion),
    llaveProceso: (raw.llaveProceso as string) ?? "",
    consActuacion: Number(raw.consActuacion),
    fechaActuacion: (raw.fechaActuacion as string) ?? "",
    actuacion: (raw.actuacion as string) ?? "",
    anotacion: (raw.anotacion as string) ?? "",
    fechaInicia: leerFecha("fechaInicia", "fechaInicial"),
    fechaFinaliza: leerFecha("fechaFinaliza", "fechaFinal"),
    fechaRegistro: (raw.fechaRegistro as string) ?? "",
    existeDocs: Boolean(raw.existeDocs ?? raw.conDocumentos ?? false),
  };
}

/**
 * Normaliza un documento crudo de la CPNU al contrato DocumentoActuacionCPNU.
 */
function normalizarDocumento(raw: Record<string, unknown>): DocumentoActuacionCPNU {
  return {
    idRegDocumento: Number(raw.idRegDocumento ?? raw.id ?? raw.idDocumento),
    consActuacion:
      raw.consActuacion !== undefined && raw.consActuacion !== null
        ? Number(raw.consActuacion)
        : null,
    nombre: (raw.nombre as string) ?? "documento",
    descripcion: (raw.descripcion as string) ?? null,
    tipo: (raw.tipo as string) ?? null,
    fechaCarga: (raw.fechaCarga as string) ?? null,
  };
}

/** Mapea una extensión de archivo a su tipo MIME. */
export function extensionATipoMime(extension: string | null | undefined): string {
  const ext = (extension ?? "").toLowerCase().replace(/^\./, "");
  const mapa: Record<string, string> = {
    pdf: "application/pdf",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    gif: "image/gif",
    tif: "image/tiff",
    tiff: "image/tiff",
    txt: "text/plain",
    zip: "application/zip",
  };
  return mapa[ext] ?? "application/octet-stream";
}

/** Extrae el nombre de archivo de una cabecera Content-Disposition. */
function nombreDesdeContentDisposition(header: string | null): string | null {
  if (!header) return null;
  // filename*=UTF-8''valor (prioritario, permite unicode)
  const utf8 = /filename\*=(?:UTF-8'')?([^;]+)/i.exec(header);
  if (utf8?.[1]) {
    try {
      return decodeURIComponent(utf8[1].trim().replace(/^"|"$/g, ""));
    } catch {
      return utf8[1].trim().replace(/^"|"$/g, "");
    }
  }
  const simple = /filename=("?)([^";]+)\1/i.exec(header);
  if (simple?.[2]) return simple[2].trim();
  return null;
}

// =============================================================================
// IMPLEMENTACIÓN DEL CLIENTE
// =============================================================================

export function crearClienteCPNU(): ClienteCPNU {
  const rateLimiter = new RateLimiter(MIN_INTERVALO_MS);

  /**
   * Ejecuta una petición HTTP con rate limiting, timeout y reintentos.
   */
  async function fetchConReintentos(
    url: string,
    intentosRestantes = MAX_REINTENTOS
  ): Promise<Result<unknown, FalloCPNU>> {
    await rateLimiter.esperar();

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: DEFAULT_HEADERS,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      if (!response.ok) {
        if (intentosRestantes > 1) {
          return fetchConReintentos(url, intentosRestantes - 1);
        }
        return {
          ok: false,
          error: {
            tipo: "fuente_no_disponible",
            detalle: `HTTP ${response.status}: ${response.statusText}`,
          },
        };
      }

      const data = await response.json();
      return { ok: true, value: data };
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : String(error);

      if (intentosRestantes > 1) {
        return fetchConReintentos(url, intentosRestantes - 1);
      }

      const tipo: FalloCPNU["tipo"] = mensaje.includes("timeout")
        ? "timeout"
        : "fuente_no_disponible";

      return {
        ok: false,
        error: { tipo, detalle: mensaje },
      };
    }
  }

  /**
   * Ejecuta una descarga binaria con rate limiting, timeout y reintentos.
   * A diferencia de fetchConReintentos, no parsea JSON: devuelve el binario
   * junto con las cabeceras relevantes (tipo MIME y nombre de archivo).
   */
  async function fetchBinarioConReintentos(
    url: string,
    intentosRestantes = MAX_REINTENTOS
  ): Promise<Result<DocumentoDescargadoCPNU, FalloCPNU>> {
    await rateLimiter.esperar();

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: DEFAULT_HEADERS,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      if (!response.ok) {
        if (intentosRestantes > 1) {
          return fetchBinarioConReintentos(url, intentosRestantes - 1);
        }
        return {
          ok: false,
          error: {
            tipo: "fuente_no_disponible",
            detalle: `HTTP ${response.status}: ${response.statusText}`,
          },
        };
      }

      const arrayBuffer = await response.arrayBuffer();
      const contenido = Buffer.from(arrayBuffer);
      const tipoMime =
        response.headers.get("content-type")?.split(";")[0]?.trim() ||
        "application/octet-stream";
      const nombreArchivo =
        nombreDesdeContentDisposition(response.headers.get("content-disposition")) ??
        "documento";

      return {
        ok: true,
        value: {
          contenido,
          tipoMime,
          nombreArchivo,
          tamanoBytes: contenido.length,
        },
      };
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : String(error);

      if (intentosRestantes > 1) {
        return fetchBinarioConReintentos(url, intentosRestantes - 1);
      }

      const tipo: FalloCPNU["tipo"] = mensaje.includes("timeout")
        ? "timeout"
        : "fuente_no_disponible";

      return {
        ok: false,
        error: { tipo, detalle: mensaje },
      };
    }
  }

  return {
    async consultarPorRadicado(
      radicado: string,
      opciones?: { soloActivos?: boolean; paginaMaxima?: number }
    ): Promise<Result<RespuestaConsultaCPNU, FalloCPNU>> {
      // R4.2: No consultar si el radicado no fue aceptado por el Validador_Radicado
      const validacion = validarRadicado(radicado);
      if (!validacion.ok) {
        return {
          ok: false,
          error: {
            tipo: "radicado_invalido",
            detalle: validacion.error.mensaje,
          },
        };
      }

      const soloActivos = opciones?.soloActivos ?? false;
      const paginaMaxima = Math.min(opciones?.paginaMaxima ?? MAX_PAGINAS, MAX_PAGINAS);
      const todosLosProcesos: ProcesoCPNU[] = [];
      let paginaActual = 1;
      let totalPaginas = 1;

      // R4.6: Paginación secuencial acotada
      while (paginaActual <= paginaMaxima && paginaActual <= totalPaginas) {
        const url = new URL(`${BASE_URL}/Procesos/Consulta/NumeroRadicacion`);
        url.searchParams.set("numero", radicado);
        url.searchParams.set("SoloActivos", soloActivos.toString());
        url.searchParams.set("pagina", paginaActual.toString());

        const resultado = await fetchConReintentos(url.toString());

        if (!resultado.ok) {
          return resultado;
        }

        const data = resultado.value as Record<string, unknown>;

        // Extraer procesos
        const procesos = (data.procesos as ProcesoCPNU[]) || [];
        todosLosProcesos.push(...procesos);

        // Determinar paginación
        if (paginaActual === 1) {
          // Preferir el objeto `paginacion` real de la API (confirmado en vivo:
          // { cantidadRegistros, registrosPagina, cantidadPaginas, pagina }).
          // `cantFilas` por elemento de `procesos[]` no es confiable: la API
          // en producción lo devuelve siempre en -1, así que solo se usa como
          // respaldo cuando no viene el objeto de paginación.
          const paginacionCPNU = data.paginacion as
            | { cantidadPaginas?: unknown }
            | undefined;
          const cantidadPaginasReal = Number(paginacionCPNU?.cantidadPaginas);

          if (Number.isFinite(cantidadPaginasReal) && cantidadPaginasReal > 0) {
            totalPaginas = cantidadPaginasReal;
          } else {
            const primerProceso = procesos[0];
            if (procesos.length > 0 && primerProceso && primerProceso.cantFilas > 0) {
              const registrosPorPagina = procesos.length || 10;
              totalPaginas = Math.ceil(primerProceso.cantFilas / registrosPorPagina);
            }
          }
        }

        paginaActual++;
      }

      if (todosLosProcesos.length === 0) {
        return {
          ok: false,
          error: {
            tipo: "no_encontrado",
            detalle: "No se encontraron procesos para el radicado consultado",
          },
        };
      }

      return {
        ok: true,
        value: {
          procesos: todosLosProcesos,
          paginacion: {
            pagina: paginaActual - 1,
            cantidadPaginas: totalPaginas,
            cantidadRegistros: todosLosProcesos.length,
          },
        },
      };
    },

    async obtenerActuaciones(
      idProceso: number | string
    ): Promise<Result<ActuacionCPNU[], FalloCPNU>> {
      /**
       * ENDPOINT PENDIENTE DE CONFIRMACIÓN LIVE
       *
       * URL esperada: GET {BASE_URL}/Proceso/Actuaciones/{idProceso}
       *
       * Basado en el análisis del frontend de consultaprocesos.ramajudicial.gov.co:
       * - La app Angular del portal hace llamadas a este patrón
       * - Acepta paginación con query param `pagina`
       * - Retorna un array de actuaciones o un objeto { actuaciones: [...] }
       *
       * Si el endpoint no responde, se retorna un fallo mockeable para que
       * la lógica de negocio no se bloquee.
       */
      const url = `${BASE_URL}/Proceso/Actuaciones/${idProceso}`;

      const resultado = await fetchConReintentos(url);

      if (!resultado.ok) {
        return resultado;
      }

      const data = resultado.value;

      // La respuesta puede ser un array directo o un objeto con propiedad actuaciones
      let crudas: Record<string, unknown>[];
      if (Array.isArray(data)) {
        crudas = data as Record<string, unknown>[];
      } else if (
        typeof data === "object" &&
        data !== null &&
        "actuaciones" in data &&
        Array.isArray((data as Record<string, unknown>).actuaciones)
      ) {
        crudas = (data as Record<string, unknown>).actuaciones as Record<string, unknown>[];
      } else {
        crudas = [];
      }

      // Normaliza cada actuación al contrato interno (mapea conDocumentos → existeDocs, etc.)
      const actuaciones = crudas.map(normalizarActuacion);

      return { ok: true, value: actuaciones };
    },

    async obtenerDocumentosActuacion(
      idRegActuacion: number | string
    ): Promise<Result<DocumentoActuacionCPNU[], FalloCPNU>> {
      // Endpoint confirmado en vivo: GET {BASE_URL}/Proceso/DocumentosActuacion/{idRegActuacion}
      const url = `${BASE_URL}/Proceso/DocumentosActuacion/${idRegActuacion}`;

      const resultado = await fetchConReintentos(url);

      if (!resultado.ok) {
        return resultado;
      }

      const data = resultado.value;

      // La respuesta es un array directo (vacío si no hay documentos)
      let crudos: Record<string, unknown>[];
      if (Array.isArray(data)) {
        crudos = data as Record<string, unknown>[];
      } else if (
        typeof data === "object" &&
        data !== null &&
        "documentos" in data &&
        Array.isArray((data as Record<string, unknown>).documentos)
      ) {
        crudos = (data as Record<string, unknown>).documentos as Record<string, unknown>[];
      } else {
        crudos = [];
      }

      return { ok: true, value: crudos.map(normalizarDocumento) };
    },

    async descargarDocumento(
      idRegDocumento: number | string
    ): Promise<Result<DocumentoDescargadoCPNU, FalloCPNU>> {
      // Endpoint confirmado en vivo: GET {BASE_URL}/Descarga/Documento/{idRegDocumento}
      const url = `${BASE_URL}/Descarga/Documento/${idRegDocumento}`;

      const resultado = await fetchBinarioConReintentos(url);

      if (!resultado.ok) {
        return resultado;
      }

      // Si la fuente no envió Content-Disposition, el nombre queda como "documento";
      // el llamador puede completarlo con el metadato de la actuación.
      return resultado;
    },
  };
}

// =============================================================================
// EXPORTACIONES POR DEFECTO
// =============================================================================

/** Instancia singleton del cliente CPNU */
export const clienteCPNU = crearClienteCPNU();
