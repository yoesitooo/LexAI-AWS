/**
 * Analizador de Actuaciones con IA — LexAI MVP
 *
 * Envía el texto de una actuación procesal al proveedor LLM configurado
 * para determinar si implica un plazo a cargo del abogado.
 *
 * El prompt está redactado en terminología procesal colombiana (traslado,
 * ejecutoria, días hábiles, subsanación, apelación, auto, sentencia).
 *
 * Resultados posibles:
 * - Plazo determinado (1–365 días) → crea Plazo (estado pendiente)
 * - Sin plazo → marca actuación como analizada sin crear Plazo
 * - Indeterminado → marca actuación como analizada, indeterminado, revisión manual
 *
 * Requisitos: R7.2, R7.3, R7.4, R7.5, R7.6, R7.7, R7.8
 */

import type { Result } from "@/lib/repository";
import { ok, err } from "@/lib/repository";
import type { AdaptadorLLM, ErrorLLM } from "@/lib/llm";
import { obtenerAdaptadorLLM, TEMPERATURA_DEFAULT } from "@/lib/llm";

// =============================================================================
// TIPOS
// =============================================================================

/** Respuesta esperada del LLM en formato JSON */
export interface RespuestaLLMAnalisis {
  tienePlazo: boolean;
  dias: number | null;
  esHabil: boolean;
  indeterminado: boolean;
}

/** Resultado normalizado del análisis de la actuación */
export type ResultadoAnalisis =
  | { tipo: "sin_plazo" }
  | { tipo: "plazo"; dias: number; esHabil: boolean }
  | { tipo: "indeterminado" };

/** Error del analizador IA */
export interface ErrorAnalisis {
  tipo: "llm_fallo" | "respuesta_invalida" | "timeout";
  mensaje: string;
  detalle?: string;
}

// =============================================================================
// PROMPT COLOMBIANO
// =============================================================================

/**
 * Prompt del sistema para el análisis de actuaciones procesales colombianas.
 * Redactado en terminología procesal colombiana.
 */
export const PROMPT_SISTEMA_ANALISIS = `Eres un asistente jurídico especializado en derecho procesal colombiano. Tu tarea es analizar el texto de una actuación procesal y determinar si genera un plazo o término procesal a cargo del abogado.

Terminología relevante:
- Traslado: término para que la parte contraria se pronuncie
- Ejecutoria: período para interponer recursos contra una providencia
- Días hábiles: días de lunes a viernes que no son festivos nacionales de Colombia
- Días calendario: días consecutivos incluyendo fines de semana y festivos
- Subsanación: plazo para corregir defectos de una demanda o escrito
- Apelación: recurso contra una providencia judicial
- Auto: decisión judicial de trámite o interlocutoria
- Sentencia: decisión judicial que resuelve el fondo del asunto
- Término de ejecutoria: 3 días hábiles para interponer recursos
- Término de traslado: varía según el tipo de proceso y la actuación

Reglas de análisis:
1. Determina si la actuación implica un plazo o término A CARGO DEL ABOGADO (no plazos del juzgado).
2. Si hay plazo, extrae la duración como número entero de días (1 a 365).
3. Los plazos son en DÍAS HÁBILES por defecto, salvo que el texto indique explícitamente "días calendario" o "días corridos".
4. Si el plazo no puede determinarse como un entero entre 1 y 365, márcalo como indeterminado.

Responde ÚNICAMENTE con un objeto JSON (sin markdown, sin texto adicional) con esta estructura exacta:
{
  "tienePlazo": boolean,
  "dias": number | null,
  "esHabil": boolean,
  "indeterminado": boolean
}

Ejemplos:
- Auto que corre traslado por 5 días → {"tienePlazo": true, "dias": 5, "esHabil": true, "indeterminado": false}
- Sentencia sin recurso → {"tienePlazo": false, "dias": null, "esHabil": true, "indeterminado": false}
- Auto que ordena subsanar en 10 días calendario → {"tienePlazo": true, "dias": 10, "esHabil": false, "indeterminado": false}
- Actuación con plazo indeterminado → {"tienePlazo": true, "dias": null, "esHabil": true, "indeterminado": true}`;

// =============================================================================
// IMPLEMENTACIÓN
// =============================================================================

/**
 * Analiza el texto de una actuación procesal para determinar si genera
 * un plazo a cargo del abogado.
 *
 * @param texto - Texto de la actuación (campo `actuacion` + `anotacion` concatenados)
 * @param adaptador - Adaptador LLM (opcional, usa el configurado por env si no se provee)
 * @returns Result con el análisis normalizado o un error estructurado
 */
export async function analizarActuacion(
  texto: string,
  adaptador?: AdaptadorLLM,
): Promise<Result<ResultadoAnalisis, ErrorAnalisis>> {
  const llm = adaptador ?? obtenerAdaptadorLLM();

  const promptUsuario = `Analiza la siguiente actuación procesal colombiana y determina si genera un plazo a cargo del abogado:\n\n${texto}`;

  const resultado = await llm.completar(promptUsuario, {
    sistema: PROMPT_SISTEMA_ANALISIS,
    temperatura: TEMPERATURA_DEFAULT,
    maxTokens: 256,
  });

  if (!resultado.ok) {
    return err(mapearErrorLLM(resultado.error));
  }

  // Parsear la respuesta JSON del LLM
  const respuestaParsed = parsearRespuestaLLM(resultado.value);
  if (!respuestaParsed.ok) {
    return respuestaParsed;
  }

  // Normalizar la respuesta según las reglas de negocio
  return ok(normalizarRespuesta(respuestaParsed.value));
}

/**
 * Parsea la respuesta del LLM extrayendo el JSON válido.
 * Maneja casos donde el LLM incluye markdown code blocks u otro texto.
 */
export function parsearRespuestaLLM(
  respuesta: string,
): Result<RespuestaLLMAnalisis, ErrorAnalisis> {
  try {
    // Intentar parsear directamente
    let texto = respuesta.trim();

    // Limpiar markdown code blocks si el LLM los incluye
    if (texto.startsWith("```")) {
      const inicio = texto.indexOf("{");
      const fin = texto.lastIndexOf("}");
      if (inicio !== -1 && fin !== -1) {
        texto = texto.substring(inicio, fin + 1);
      }
    }

    const parsed = JSON.parse(texto);

    // Validar la estructura esperada
    if (typeof parsed.tienePlazo !== "boolean") {
      return err({
        tipo: "respuesta_invalida",
        mensaje: "La respuesta del LLM no contiene 'tienePlazo' como booleano",
        detalle: texto,
      });
    }

    if (typeof parsed.esHabil !== "boolean") {
      return err({
        tipo: "respuesta_invalida",
        mensaje: "La respuesta del LLM no contiene 'esHabil' como booleano",
        detalle: texto,
      });
    }

    if (typeof parsed.indeterminado !== "boolean") {
      return err({
        tipo: "respuesta_invalida",
        mensaje: "La respuesta del LLM no contiene 'indeterminado' como booleano",
        detalle: texto,
      });
    }

    if (parsed.dias !== null && typeof parsed.dias !== "number") {
      return err({
        tipo: "respuesta_invalida",
        mensaje: "La respuesta del LLM tiene 'dias' con tipo inválido (debe ser number o null)",
        detalle: texto,
      });
    }

    return ok({
      tienePlazo: parsed.tienePlazo,
      dias: parsed.dias,
      esHabil: parsed.esHabil,
      indeterminado: parsed.indeterminado,
    });
  } catch {
    return err({
      tipo: "respuesta_invalida",
      mensaje: "La respuesta del LLM no es un JSON válido",
      detalle: respuesta,
    });
  }
}

/**
 * Normaliza la respuesta del LLM según las reglas de negocio:
 * - Si tienePlazo === false → sin_plazo
 * - Si tienePlazo === true y dias es entero 1–365 → plazo determinado
 * - Si tienePlazo === true y dias fuera de 1–365 o null o indeterminado → indeterminado
 */
export function normalizarRespuesta(respuesta: RespuestaLLMAnalisis): ResultadoAnalisis {
  // Caso 1: Sin plazo (R7.6)
  if (!respuesta.tienePlazo) {
    return { tipo: "sin_plazo" };
  }

  // Caso 2: Indeterminado explícito (R7.7)
  if (respuesta.indeterminado) {
    return { tipo: "indeterminado" };
  }

  // Caso 3: Validar que dias sea entero entre 1 y 365 (R7.3, R7.7)
  if (
    respuesta.dias === null ||
    respuesta.dias === undefined ||
    !Number.isInteger(respuesta.dias) ||
    respuesta.dias < 1 ||
    respuesta.dias > 365
  ) {
    return { tipo: "indeterminado" };
  }

  // Caso 4: Plazo determinado (R7.5)
  // esHabil por defecto true (días hábiles), solo false si indicado explícitamente (R7.4)
  return {
    tipo: "plazo",
    dias: respuesta.dias,
    esHabil: respuesta.esHabil,
  };
}

/**
 * Mapea errores del adaptador LLM a errores del analizador.
 */
function mapearErrorLLM(error: ErrorLLM): ErrorAnalisis {
  if (error.tipo === "timeout") {
    return {
      tipo: "timeout",
      mensaje: "El análisis excedió el tiempo máximo de 30 segundos",
      detalle: error.mensaje,
    };
  }

  return {
    tipo: "llm_fallo",
    mensaje: `Error del proveedor LLM: ${error.mensaje}`,
    detalle: error.detalle,
  };
}

// =============================================================================
// REINTENTOS DEL ANÁLISIS IA (R7.9)
// =============================================================================

/** Resultado especial cuando el análisis queda pendiente tras agotar reintentos */
export interface ResultadoAnalisisPendiente {
  tipo: "analisis_pendiente";
  intentos: number;
  ultimoError: ErrorAnalisis;
}

/** Resultado de analizarActuacionConReintentos: exitoso o pendiente */
export type ResultadoConReintentos = ResultadoAnalisis | ResultadoAnalisisPendiente;

/** Opciones para la función de reintentos */
export interface OpcionesReintentos {
  maxIntentos?: number;
  /** Logger para registrar errores (default: console.error) */
  logger?: (mensaje: string, detalle?: unknown) => void;
}

/**
 * Wrapper con reintentos para `analizarActuacion`.
 *
 * Comportamiento (R7.9):
 * 1. Llama a `analizarActuacion`. Si tiene éxito → devuelve el resultado.
 * 2. Si falla (LLM error, timeout, respuesta inválida): reintenta hasta
 *    `maxIntentos` veces en total (default: 3).
 * 3. Tras agotar reintentos: registra el error y devuelve un resultado
 *    `analisis_pendiente` indicando que la actuación queda sin analizar.
 * 4. Nunca lanza excepciones — siempre devuelve Result.ok con el resultado
 *    (sea análisis exitoso o análisis pendiente).
 *
 * El caller debe marcar la actuación con `estado_analisis = 'pendiente'`
 * cuando recibe `tipo: "analisis_pendiente"`, sin bloquear otros procesos.
 *
 * @param texto - Texto de la actuación procesal
 * @param adaptador - Adaptador LLM (opcional)
 * @param opciones - Opciones de reintentos (maxIntentos, logger)
 * @returns Siempre Result.ok con ResultadoAnalisis o ResultadoAnalisisPendiente
 */
export async function analizarActuacionConReintentos(
  texto: string,
  adaptador?: AdaptadorLLM,
  opciones?: OpcionesReintentos,
): Promise<Result<ResultadoConReintentos, never>> {
  const maxIntentos = opciones?.maxIntentos ?? 3;
  const logger = opciones?.logger ?? console.error;

  let ultimoError: ErrorAnalisis | null = null;

  for (let intento = 1; intento <= maxIntentos; intento++) {
    const resultado = await analizarActuacion(texto, adaptador);

    if (resultado.ok) {
      return ok(resultado.value);
    }

    // Registrar fallo del intento
    ultimoError = resultado.error;
    logger(
      `[Analizador IA] Intento ${intento}/${maxIntentos} falló: ${resultado.error.tipo} — ${resultado.error.mensaje}`,
      resultado.error.detalle,
    );
  }

  // Todos los reintentos agotados — registrar error final y devolver pendiente
  logger(
    `[Analizador IA] Reintentos agotados (${maxIntentos}/${maxIntentos}). La actuación queda con análisis pendiente.`,
    { texto: texto.substring(0, 100), ultimoError },
  );

  return ok({
    tipo: "analisis_pendiente",
    intentos: maxIntentos,
    ultimoError: ultimoError!,
  } satisfies ResultadoAnalisisPendiente);
}
