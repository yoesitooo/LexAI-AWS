/**
 * Adaptador LLM intercambiable por variable de entorno — LexAI MVP
 *
 * Selecciona el proveedor de LLM según `LLM_PROVIDER` y `LLM_API_KEY`
 * sin cambios de código (R7.1, R7.8).
 *
 * Proveedores soportados:
 * - "gemini" → Google Gemini (REST API)
 * - "openai" → OpenAI (REST API)
 * - "claude" | "anthropic" → Anthropic Claude (REST API)
 *
 * Cada proveedor implementa la interfaz AdaptadorLLM con timeout de 30 s.
 *
 * Uso:
 *   import { obtenerAdaptadorLLM } from "@/lib/llm";
 *   const adaptador = obtenerAdaptadorLLM();
 *   const resultado = await adaptador.completar("analiza esta actuación");
 */

import type { LLMProvider } from "@/lib/config";
import { err } from "@/lib/repository";
import type { Result } from "@/lib/repository";
import type { AdaptadorLLM, ErrorLLM } from "./types";
import { crearProveedorGemini } from "./providers/gemini";
import { crearProveedorOpenAI } from "./providers/openai";
import { crearProveedorAnthropic } from "./providers/anthropic";
import { crearProveedorMock } from "./providers/mock";

// Re-exportar tipos públicos
export type { AdaptadorLLM, OpcionesLLM, ErrorLLM, TipoErrorLLM } from "./types";
export { TIMEOUT_LLM_MS, TEMPERATURA_DEFAULT, MAX_TOKENS_DEFAULT } from "./types";
export { crearProveedorMock } from "./providers/mock";
export type { OpcionesMock } from "./providers/mock";
export {
  RESPUESTA_MOCK_DEFAULT,
  RESPUESTA_MOCK_SIN_PLAZO,
  RESPUESTA_MOCK_INDETERMINADO,
} from "./providers/mock";

// =============================================================================
// FACTORY — SELECCIÓN POR VARIABLE DE ENTORNO
// =============================================================================

/**
 * Crea un adaptador LLM para el proveedor especificado.
 * Permite inyectar proveedor y apiKey para testing sin depender de env.
 */
export function crearAdaptadorLLM(proveedor: LLMProvider, apiKey: string): AdaptadorLLM {
  switch (proveedor) {
    case "gemini":
      return crearProveedorGemini(apiKey);
    case "openai":
      return crearProveedorOpenAI(apiKey);
    case "claude":
    case "anthropic":
      return crearProveedorAnthropic(apiKey);
    default: {
      // Proveedor no soportado — devuelve un adaptador que siempre falla
      const _exhaustive: never = proveedor;
      return {
        proveedor: String(_exhaustive),
        async completar(): Promise<Result<string, ErrorLLM>> {
          return err({
            tipo: "proveedor_no_soportado",
            mensaje: `Proveedor LLM "${proveedor}" no soportado. Valores válidos: gemini, openai, claude, anthropic`,
          });
        },
      };
    }
  }
}

/**
 * Obtiene el adaptador LLM configurado por las variables de entorno
 * `LLM_PROVIDER` y `LLM_API_KEY`.
 *
 * Instancia singleton — se crea una vez y se reutiliza.
 */
let _instancia: AdaptadorLLM | null = null;

export function obtenerAdaptadorLLM(): AdaptadorLLM {
  if (_instancia) {
    return _instancia;
  }

  // Importamos env dinámicamente para permitir que los tests configuren
  // las variables de entorno antes de la primera llamada
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { env } = require("@/lib/config") as typeof import("@/lib/config");

  if (process.env.DEMO_MODE === "true") {
    // Modo demo público: respuestas simuladas, sin costo ni llamadas externas
    _instancia = crearProveedorMock();
    return _instancia;
  }

  if (!env.LLM_API_KEY) {
    // En desarrollo/test sin API key, devolver un adaptador que avisa
    return {
      proveedor: env.LLM_PROVIDER,
      async completar(): Promise<Result<string, ErrorLLM>> {
        return err({
          tipo: "configuracion",
          mensaje: "LLM_API_KEY no está configurada. Configure la variable de entorno para usar el adaptador LLM.",
        });
      },
    };
  }

  _instancia = crearAdaptadorLLM(env.LLM_PROVIDER, env.LLM_API_KEY);
  return _instancia;
}

/**
 * Resetea la instancia singleton (útil en tests).
 * @internal
 */
export function _resetearInstanciaLLM(): void {
  _instancia = null;
}
