/**
 * Feature: lexai-mvp, Property 2: Descomposición estructural del radicado
 * (round-trip de segmentos: concatenación reproduce el original y longitudes suman 23)
 *
 * Validates: Requisitos R3.3
 *
 * Propiedades verificadas con fast-check (≥100 iteraciones):
 *  1. Para cualquier radicado válido, la concatenación de dane + entidad + especialidad +
 *     despacho + anio (4 dígitos) + consecutivo reproduce el string raw original.
 *  2. Para cualquier radicado válido, la suma de las longitudes de los segmentos es 23
 *     (5 + 2 + 2 + 3 + 4 + 7 = 23).
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { validarRadicado } from "../../lib/validador-radicado";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Obtiene el año actual en America/Bogotá (mismo método que el validador)
 */
function obtenerAnioActualColombia(): number {
  const ahora = new Date();
  const formato = new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/Bogota",
    year: "numeric",
  });
  const partes = formato.formatToParts(ahora);
  const parteAnio = partes.find((p) => p.type === "year");
  return parseInt(parteAnio!.value, 10);
}

const ANIO_ACTUAL_CO = obtenerAnioActualColombia();

/**
 * Genera un string de exactamente N dígitos aleatorios.
 */
function digitosArb(n: number): fc.Arbitrary<string> {
  return fc
    .array(fc.integer({ min: 0, max: 9 }), { minLength: n, maxLength: n })
    .map((arr) => arr.join(""));
}

/**
 * Genera un radicado válido: 23 dígitos con año en [1900, añoActualCO].
 * Estructura: 5 (DANE) + 2 (entidad) + 2 (especialidad) + 3 (despacho) + 4 (año) + 7 (consecutivo)
 */
function radicadoValidoArb(): fc.Arbitrary<string> {
  return fc
    .tuple(
      digitosArb(5), // DANE
      digitosArb(2), // entidad
      digitosArb(2), // especialidad
      digitosArb(3), // despacho
      fc.integer({ min: 1900, max: ANIO_ACTUAL_CO }), // año válido
      digitosArb(7), // consecutivo
    )
    .map(
      ([dane, entidad, especialidad, despacho, anio, consecutivo]) =>
        `${dane}${entidad}${especialidad}${despacho}${anio.toString().padStart(4, "0")}${consecutivo}`,
    );
}

// ---------------------------------------------------------------------------
// Propiedades
// ---------------------------------------------------------------------------

describe("PBT — Descomposición estructural del radicado (Property 2)", () => {
  it("Property 2.1: La concatenación de los segmentos reproduce el raw original", () => {
    fc.assert(
      fc.property(radicadoValidoArb(), (radicado) => {
        const resultado = validarRadicado(radicado);

        // Pre-condición: el radicado generado debe ser válido
        expect(resultado.ok).toBe(true);
        if (!resultado.ok) return;

        const { raw, dane, entidad, especialidad, despacho, anio, consecutivo } =
          resultado.value;

        // Round-trip: concatenar segmentos debe reproducir el original
        const reconstruido =
          dane +
          entidad +
          especialidad +
          despacho +
          anio.toString().padStart(4, "0") +
          consecutivo;

        expect(reconstruido).toBe(raw);
        expect(reconstruido).toBe(radicado);
      }),
      { numRuns: 100 },
    );
  });

  it("Property 2.2: La suma de longitudes de los segmentos es exactamente 23 (5+2+2+3+4+7)", () => {
    fc.assert(
      fc.property(radicadoValidoArb(), (radicado) => {
        const resultado = validarRadicado(radicado);

        // Pre-condición: el radicado generado debe ser válido
        expect(resultado.ok).toBe(true);
        if (!resultado.ok) return;

        const { dane, entidad, especialidad, despacho, anio, consecutivo } =
          resultado.value;

        // Longitudes individuales de cada segmento
        expect(dane.length).toBe(5);
        expect(entidad.length).toBe(2);
        expect(especialidad.length).toBe(2);
        expect(despacho.length).toBe(3);
        expect(anio.toString().padStart(4, "0").length).toBe(4);
        expect(consecutivo.length).toBe(7);

        // Suma total = 23
        const sumaLongitudes =
          dane.length +
          entidad.length +
          especialidad.length +
          despacho.length +
          anio.toString().padStart(4, "0").length +
          consecutivo.length;

        expect(sumaLongitudes).toBe(23);
      }),
      { numRuns: 100 },
    );
  });
});
