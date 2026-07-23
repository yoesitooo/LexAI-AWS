/**
 * Feature: lexai-mvp, Property 14: Normalización de la duración del plazo de la IA
 * (determinado sii entero 1–365; si no, indeterminado sin fecha límite)
 *
 * **Validates: Requisitos R7.3, R7.7**
 *
 * Propiedades verificadas:
 *  1. Si tienePlazo=true Y dias es entero en [1,365] → resultado es { tipo: "plazo", dias, esHabil }
 *  2. Si tienePlazo=true Y dias es null, no entero, <1, o >365 → resultado es { tipo: "indeterminado" }
 *  3. Si tienePlazo=false → resultado es { tipo: "sin_plazo" } sin importar el resto de campos
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { normalizarRespuesta, type RespuestaLLMAnalisis } from "../../lib/analizador-ia";

// ---------------------------------------------------------------------------
// Generadores
// ---------------------------------------------------------------------------

/** Genera días válidos: entero en [1, 365] */
const diasValidoArb = fc.integer({ min: 1, max: 365 });

/** Genera días inválidos: null, no entero, <1 o >365 */
const diasInvalidoArb: fc.Arbitrary<number | null> = fc.oneof(
  fc.constant(null),
  fc.integer({ min: -1000, max: 0 }), // < 1
  fc.integer({ min: 366, max: 9999 }), // > 365
  fc.double({ min: 0.01, max: 364.99, noNaN: true, noDefaultInfinity: true }), // no entero
);

/** Genera un RespuestaLLMAnalisis con tienePlazo=true y dias válido (entero 1-365) */
const respuestaPlazoValidoArb: fc.Arbitrary<RespuestaLLMAnalisis> = fc
  .record({
    dias: diasValidoArb,
    esHabil: fc.boolean(),
    indeterminado: fc.constant(false),
  })
  .map(({ dias, esHabil, indeterminado }) => ({
    tienePlazo: true,
    dias,
    esHabil,
    indeterminado,
  }));

/** Genera un RespuestaLLMAnalisis con tienePlazo=true y dias inválido */
const respuestaPlazoInvalidoArb: fc.Arbitrary<RespuestaLLMAnalisis> = fc
  .record({
    dias: diasInvalidoArb,
    esHabil: fc.boolean(),
    indeterminado: fc.constant(false),
  })
  .map(({ dias, esHabil, indeterminado }) => ({
    tienePlazo: true,
    dias,
    esHabil,
    indeterminado,
  }));

/** Genera un RespuestaLLMAnalisis con tienePlazo=true e indeterminado=true */
const respuestaIndeterminadoExplicitoArb: fc.Arbitrary<RespuestaLLMAnalisis> = fc
  .record({
    dias: fc.oneof(diasValidoArb, diasInvalidoArb),
    esHabil: fc.boolean(),
  })
  .map(({ dias, esHabil }) => ({
    tienePlazo: true,
    dias,
    esHabil,
    indeterminado: true,
  }));

/** Genera un RespuestaLLMAnalisis con tienePlazo=false (el resto es arbitrario) */
const respuestaSinPlazoArb: fc.Arbitrary<RespuestaLLMAnalisis> = fc
  .record({
    dias: fc.oneof(diasValidoArb, diasInvalidoArb),
    esHabil: fc.boolean(),
    indeterminado: fc.boolean(),
  })
  .map(({ dias, esHabil, indeterminado }) => ({
    tienePlazo: false,
    dias,
    esHabil,
    indeterminado,
  }));

// ---------------------------------------------------------------------------
// Propiedades
// ---------------------------------------------------------------------------

describe("PBT — Normalización de la duración del plazo (Property 14)", () => {
  it("Property 14.1: tienePlazo=true + dias entero [1,365] + indeterminado=false → tipo 'plazo' con dias y esHabil", () => {
    fc.assert(
      fc.property(respuestaPlazoValidoArb, (respuesta) => {
        const resultado = normalizarRespuesta(respuesta);

        expect(resultado.tipo).toBe("plazo");
        if (resultado.tipo !== "plazo") return;

        // dias debe coincidir exactamente con el input
        expect(resultado.dias).toBe(respuesta.dias);
        // esHabil debe preservarse del input
        expect(resultado.esHabil).toBe(respuesta.esHabil);
        // dias debe ser entero en [1,365]
        expect(Number.isInteger(resultado.dias)).toBe(true);
        expect(resultado.dias).toBeGreaterThanOrEqual(1);
        expect(resultado.dias).toBeLessThanOrEqual(365);
      }),
      { numRuns: 100 },
    );
  });

  it("Property 14.2: tienePlazo=true + dias null/no entero/<1/>365 + indeterminado=false → tipo 'indeterminado'", () => {
    fc.assert(
      fc.property(respuestaPlazoInvalidoArb, (respuesta) => {
        const resultado = normalizarRespuesta(respuesta);

        expect(resultado.tipo).toBe("indeterminado");
      }),
      { numRuns: 100 },
    );
  });

  it("Property 14.2b: tienePlazo=true + indeterminado=true (dias cualquiera) → tipo 'indeterminado'", () => {
    fc.assert(
      fc.property(respuestaIndeterminadoExplicitoArb, (respuesta) => {
        const resultado = normalizarRespuesta(respuesta);

        expect(resultado.tipo).toBe("indeterminado");
      }),
      { numRuns: 100 },
    );
  });

  it("Property 14.3: tienePlazo=false → tipo 'sin_plazo' sin importar otros campos", () => {
    fc.assert(
      fc.property(respuestaSinPlazoArb, (respuesta) => {
        const resultado = normalizarRespuesta(respuesta);

        expect(resultado.tipo).toBe("sin_plazo");
      }),
      { numRuns: 100 },
    );
  });
});
