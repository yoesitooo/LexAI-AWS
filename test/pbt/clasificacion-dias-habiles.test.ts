/**
 * Feature: lexai-mvp, Property 15: Clasificación días hábiles por defecto
 * (calendario solo si el texto lo indica explícitamente)
 *
 * **Validates: Requisitos R7.4**
 *
 * Propiedades verificadas:
 *  1. Cuando el LLM devuelve esHabil=true (por defecto, días hábiles),
 *     normalizarRespuesta preserva esHabil=true en el resultado de tipo "plazo".
 *  2. Cuando el LLM devuelve esHabil=false (explícitamente calendario),
 *     normalizarRespuesta preserva esHabil=false en el resultado de tipo "plazo".
 *  3. El prompt del sistema (PROMPT_SISTEMA_ANALISIS) contiene la instrucción
 *     de que los plazos son en días hábiles por defecto.
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import {
  normalizarRespuesta,
  PROMPT_SISTEMA_ANALISIS,
  type RespuestaLLMAnalisis,
} from "../../lib/analizador-ia";

// ---------------------------------------------------------------------------
// Generadores
// ---------------------------------------------------------------------------

/** Genera días válidos: entero en [1, 365] */
const diasValidoArb = fc.integer({ min: 1, max: 365 });

/**
 * Genera un RespuestaLLMAnalisis con plazo determinado y esHabil=true
 * (caso por defecto: días hábiles)
 */
const respuestaHabilArb: fc.Arbitrary<RespuestaLLMAnalisis> = diasValidoArb.map((dias) => ({
  tienePlazo: true,
  dias,
  esHabil: true,
  indeterminado: false,
}));

/**
 * Genera un RespuestaLLMAnalisis con plazo determinado y esHabil=false
 * (caso explícito: días calendario)
 */
const respuestaCalendarioArb: fc.Arbitrary<RespuestaLLMAnalisis> = diasValidoArb.map((dias) => ({
  tienePlazo: true,
  dias,
  esHabil: false,
  indeterminado: false,
}));

/**
 * Genera un RespuestaLLMAnalisis con plazo determinado y esHabil aleatorio (true o false)
 * para verificar que la clasificación siempre se preserva tal cual viene del LLM.
 */
const respuestaPlazoConEsHabilArb: fc.Arbitrary<RespuestaLLMAnalisis> = fc
  .record({
    dias: diasValidoArb,
    esHabil: fc.boolean(),
  })
  .map(({ dias, esHabil }) => ({
    tienePlazo: true,
    dias,
    esHabil,
    indeterminado: false,
  }));

// ---------------------------------------------------------------------------
// Propiedades
// ---------------------------------------------------------------------------

describe("PBT — Clasificación días hábiles por defecto (Property 15)", () => {
  it("Property 15.1: esHabil=true del LLM se preserva en el resultado normalizado como tipo 'plazo' con esHabil=true", () => {
    fc.assert(
      fc.property(respuestaHabilArb, (respuesta) => {
        const resultado = normalizarRespuesta(respuesta);

        expect(resultado.tipo).toBe("plazo");
        if (resultado.tipo !== "plazo") return;

        // El valor esHabil=true (días hábiles, default) se preserva sin modificaciones
        expect(resultado.esHabil).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it("Property 15.2: esHabil=false del LLM se preserva en el resultado normalizado como tipo 'plazo' con esHabil=false", () => {
    fc.assert(
      fc.property(respuestaCalendarioArb, (respuesta) => {
        const resultado = normalizarRespuesta(respuesta);

        expect(resultado.tipo).toBe("plazo");
        if (resultado.tipo !== "plazo") return;

        // El valor esHabil=false (explícitamente calendario) se preserva sin modificaciones
        expect(resultado.esHabil).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it("Property 15.3: normalizarRespuesta preserva el valor exacto de esHabil del LLM (contrato estructural)", () => {
    fc.assert(
      fc.property(respuestaPlazoConEsHabilArb, (respuesta) => {
        const resultado = normalizarRespuesta(respuesta);

        expect(resultado.tipo).toBe("plazo");
        if (resultado.tipo !== "plazo") return;

        // El resultado siempre refleja fielmente el esHabil que envió el LLM
        expect(resultado.esHabil).toBe(respuesta.esHabil);
      }),
      { numRuns: 100 },
    );
  });

  it("Property 15.4: PROMPT_SISTEMA_ANALISIS indica que los plazos son en días hábiles por defecto", () => {
    // Verificar que el prompt contiene la instrucción clave sobre la clasificación por defecto
    // Esto asegura que la instrucción al LLM especifica que días hábiles es el default
    expect(PROMPT_SISTEMA_ANALISIS).toContain("DÍAS HÁBILES por defecto");

    // Verificar que menciona la excepción explícita para días calendario
    expect(PROMPT_SISTEMA_ANALISIS).toContain("días calendario");

    // Verificar que el campo esHabil aparece en la estructura de respuesta esperada
    expect(PROMPT_SISTEMA_ANALISIS).toContain('"esHabil"');
  });
});
