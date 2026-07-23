/**
 * Feature: lexai-mvp, Property 16: Política de reintentos del análisis IA
 * (hasta 3 reintentos; agotados conserva actuación con análisis pendiente sin excepción ni bloqueo)
 *
 * **Validates: Requisitos R7.9**
 *
 * Propiedades verificadas:
 *  1. Para cualquier número de fallos consecutivos (hasta maxIntentos), la función NUNCA lanza
 *  2. Cuando se agotan todos los reintentos, devuelve { tipo: "analisis_pendiente", intentos: maxIntentos }
 *  3. Si algún intento tiene éxito, devuelve el resultado exitoso del análisis
 *  4. La función llama al adaptador LLM exactamente min(intentos_hasta_éxito, maxIntentos) veces
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { analizarActuacionConReintentos } from "../../lib/analizador-ia";
import { crearProveedorMock } from "../../lib/llm";
import { ok, err } from "../../lib/repository";
import type { ErrorLLM } from "../../lib/llm";
import type { Result } from "../../lib/repository";

// ---------------------------------------------------------------------------
// Generadores
// ---------------------------------------------------------------------------

/** Genera texto de actuación procesal arbitrario (no vacío) */
const textoActuacionArb = fc.string({ minLength: 1, maxLength: 500 });

/** Genera un maxIntentos entre 1 y 10 */
const maxIntentosArb = fc.integer({ min: 1, max: 10 });

/** Genera un error LLM aleatorio */
const errorLLMArb: fc.Arbitrary<ErrorLLM> = fc.oneof(
  fc.constant<ErrorLLM>({ tipo: "timeout", mensaje: "Timeout simulado" }),
  fc.constant<ErrorLLM>({ tipo: "servidor", mensaje: "Error 500 simulado" }),
  fc.constant<ErrorLLM>({ tipo: "red", mensaje: "Error de red simulado" }),
  fc.constant<ErrorLLM>({ tipo: "rate_limit", mensaje: "Rate limit simulado" }),
);

/** Respuestas válidas del LLM que generan análisis exitosos */
const respuestaExitosaLLMArb: fc.Arbitrary<string> = fc.oneof(
  fc.constant(JSON.stringify({ tienePlazo: true, dias: 10, esHabil: true, indeterminado: false })),
  fc.constant(JSON.stringify({ tienePlazo: false, dias: null, esHabil: true, indeterminado: false })),
  fc.constant(JSON.stringify({ tienePlazo: true, dias: null, esHabil: true, indeterminado: true })),
  fc.integer({ min: 1, max: 365 }).map((dias) =>
    JSON.stringify({ tienePlazo: true, dias, esHabil: true, indeterminado: false }),
  ),
);

/**
 * Genera un escenario donde el LLM falla N veces consecutivas, luego opcionalmente tiene éxito.
 * failCount: número de fallos antes de éxito (puede ser >= maxIntentos → nunca tiene éxito)
 */
const escenarioReintentosArb = fc.record({
  texto: textoActuacionArb,
  maxIntentos: maxIntentosArb,
  failCount: fc.integer({ min: 0, max: 15 }),
  errorTipo: errorLLMArb,
  respuestaExitosa: respuestaExitosaLLMArb,
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Crea un mock que falla las primeras N llamadas y luego responde con éxito.
 * Devuelve el mock con su historial de llamadas.
 */
function crearMockConFallos(
  fallosAntesDexito: number,
  errorLlm: ErrorLLM,
  respuestaExitosa: string,
) {
  let llamadaNum = 0;

  const mock = crearProveedorMock({
    generador: (): Result<string, ErrorLLM> => {
      llamadaNum++;
      if (llamadaNum <= fallosAntesDexito) {
        return err(errorLlm);
      }
      return ok(respuestaExitosa);
    },
  });

  return { mock, getLlamadas: () => mock.llamadas.length };
}

// Suppress logger output in tests
const silentLogger = () => {};

// ---------------------------------------------------------------------------
// Propiedades
// ---------------------------------------------------------------------------

describe("PBT — Política de reintentos del análisis IA (Property 16)", () => {
  it("Property 16.1: La función NUNCA lanza una excepción, sin importar cuántos fallos haya", async () => {
    await fc.assert(
      fc.asyncProperty(escenarioReintentosArb, async ({ texto, maxIntentos, errorTipo }) => {
        // Configurar mock que siempre falla
        const mock = crearProveedorMock({ error: errorTipo });

        // La función NUNCA debe lanzar
        const resultado = await analizarActuacionConReintentos(texto, mock, {
          maxIntentos,
          logger: silentLogger,
        });

        // Siempre devuelve ok: true (nunca throws, nunca ok: false)
        expect(resultado.ok).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it("Property 16.2: Cuando se agotan todos los reintentos, devuelve { tipo: 'analisis_pendiente', intentos: maxIntentos }", async () => {
    await fc.assert(
      fc.asyncProperty(
        textoActuacionArb,
        maxIntentosArb,
        errorLLMArb,
        async (texto, maxIntentos, errorTipo) => {
          // Mock que siempre falla
          const mock = crearProveedorMock({ error: errorTipo });

          const resultado = await analizarActuacionConReintentos(texto, mock, {
            maxIntentos,
            logger: silentLogger,
          });

          expect(resultado.ok).toBe(true);
          if (!resultado.ok) return;

          // Debe ser analisis_pendiente
          expect(resultado.value.tipo).toBe("analisis_pendiente");
          if (resultado.value.tipo !== "analisis_pendiente") return;

          // Intentos debe ser exactamente maxIntentos
          expect(resultado.value.intentos).toBe(maxIntentos);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("Property 16.3: Si algún intento tiene éxito, devuelve el resultado exitoso del análisis", async () => {
    await fc.assert(
      fc.asyncProperty(
        textoActuacionArb,
        maxIntentosArb,
        errorLLMArb,
        respuestaExitosaLLMArb,
        async (texto, maxIntentos, errorTipo, respuestaExitosa) => {
          // Falla en menos intentos que el máximo → debe tener éxito
          const fallosAntesDeExito = fc.sample(
            fc.integer({ min: 0, max: maxIntentos - 1 }),
            1,
          )[0];

          const { mock } = crearMockConFallos(fallosAntesDeExito, errorTipo, respuestaExitosa);

          const resultado = await analizarActuacionConReintentos(texto, mock, {
            maxIntentos,
            logger: silentLogger,
          });

          expect(resultado.ok).toBe(true);
          if (!resultado.ok) return;

          // NO debe ser analisis_pendiente (debe ser un resultado exitoso de análisis)
          expect(resultado.value.tipo).not.toBe("analisis_pendiente");
          expect(["sin_plazo", "plazo", "indeterminado"]).toContain(resultado.value.tipo);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("Property 16.4: La función llama al adaptador LLM exactamente min(intentos_hasta_éxito, maxIntentos) veces", async () => {
    await fc.assert(
      fc.asyncProperty(escenarioReintentosArb, async ({ texto, maxIntentos, failCount, errorTipo, respuestaExitosa }) => {
        const { mock, getLlamadas } = crearMockConFallos(failCount, errorTipo, respuestaExitosa);

        await analizarActuacionConReintentos(texto, mock, {
          maxIntentos,
          logger: silentLogger,
        });

        const llamadasEsperadas = Math.min(failCount + 1, maxIntentos);
        expect(getLlamadas()).toBe(llamadasEsperadas);
      }),
      { numRuns: 100 },
    );
  });
});
