/**
 * Proveedor LLM — Mock para testing
 *
 * Devuelve respuestas enlatadas configurables para pruebas unitarias
 * y pruebas basadas en propiedades (PBT). No hace llamadas de red.
 *
 * Uso:
 *   const mock = crearProveedorMock({ respuesta: '{"tienePlazo": true, "dias": 5, "esHabil": true, "indeterminado": false}' });
 *   const resultado = await mock.completar("analiza esta actuación");
 *   // resultado.ok === true, resultado.value === la respuesta configurada
 */

import { ok, err } from "@/lib/repository";
import type { Result } from "@/lib/repository";
import type { AdaptadorLLM, OpcionesLLM, ErrorLLM } from "../types";
import { TIMEOUT_LLM_MS } from "../types";

// =============================================================================
// CONFIGURACIÓN DEL MOCK
// =============================================================================

/** Opciones de configuración del proveedor mock */
export interface OpcionesMock {
  /** Respuesta fija que devuelve completar() */
  respuesta?: string;
  /** Si se debe simular un error */
  error?: ErrorLLM;
  /** Latencia simulada en milisegundos (default: 0) */
  latenciaMs?: number;
  /** Función custom que determina la respuesta según el prompt */
  generador?: (prompt: string, opciones?: OpcionesLLM) => Result<string, ErrorLLM>;
}

/** Respuesta por defecto del mock — formato de análisis de actuación */
export const RESPUESTA_MOCK_DEFAULT = JSON.stringify({
  tienePlazo: true,
  dias: 10,
  esHabil: true,
  indeterminado: false,
});

/** Respuesta mock sin plazo */
export const RESPUESTA_MOCK_SIN_PLAZO = JSON.stringify({
  tienePlazo: false,
  dias: null,
  esHabil: true,
  indeterminado: false,
});

/** Respuesta mock indeterminada */
export const RESPUESTA_MOCK_INDETERMINADO = JSON.stringify({
  tienePlazo: true,
  dias: null,
  esHabil: true,
  indeterminado: true,
});

// =============================================================================
// IMPLEMENTACIÓN
// =============================================================================

export function crearProveedorMock(config?: OpcionesMock): AdaptadorLLM & {
  /** Historial de llamadas para aserciones en tests */
  readonly llamadas: Array<{ prompt: string; opciones?: OpcionesLLM }>;
  /** Resetea el historial de llamadas */
  resetear(): void;
} {
  const llamadas: Array<{ prompt: string; opciones?: OpcionesLLM }> = [];

  return {
    proveedor: "mock",
    llamadas,

    resetear() {
      llamadas.length = 0;
    },

    async completar(
      prompt: string,
      opciones?: OpcionesLLM
    ): Promise<Result<string, ErrorLLM>> {
      llamadas.push({ prompt, opciones });

      const timeoutMs = opciones?.timeoutMs ?? TIMEOUT_LLM_MS;
      const latencia = config?.latenciaMs ?? 0;

      // Simular latencia
      if (latencia > 0) {
        if (latencia > timeoutMs) {
          return err({
            tipo: "timeout",
            mensaje: `La solicitud al mock excedió el timeout de ${timeoutMs} ms`,
          });
        }
        await new Promise((resolve) => setTimeout(resolve, latencia));
      }

      // Si hay un generador custom, usarlo
      if (config?.generador) {
        return config.generador(prompt, opciones);
      }

      // Si hay un error configurado, devolverlo
      if (config?.error) {
        return err(config.error);
      }

      // Devolver la respuesta configurada o la default
      const respuesta = config?.respuesta ?? RESPUESTA_MOCK_DEFAULT;
      return ok(respuesta);
    },
  };
}
