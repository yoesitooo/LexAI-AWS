/**
 * Feature: lexai-mvp, Property 1: Validación integral del radicado
 * (acepta sii 23 dígitos y año en [1900, año actual CO]; si no, rechaza sin registrar proceso)
 *
 * Validates: Requisitos R3.1, R3.2, R3.4
 *
 * Propiedades verificadas con fast-check (≥100 iteraciones):
 *  1. Cualquier string de exactamente 23 dígitos con año en [1900, año actual CO] → aceptado (ok: true)
 *  2. Cualquier string que NO tenga exactamente 23 dígitos → rechazado (ok: false)
 *  3. Cualquier string con al menos un carácter no numérico → rechazado (ok: false)
 *  4. Cualquier string de 23 dígitos con año < 1900 o > año actual CO → rechazado (ok: false)
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

/**
 * Genera un string de longitud distinta de 23 (puede contener solo dígitos).
 */
function stringLongitudDistinta23Arb(): fc.Arbitrary<string> {
  return fc
    .integer({ min: 0, max: 50 })
    .filter((len) => len !== 23)
    .chain((len) => digitosArb(len));
}

/**
 * Genera un string de 23 caracteres que contiene al menos un carácter no numérico.
 */
function string23ConNoDigitosArb(): fc.Arbitrary<string> {
  // Caracteres no numéricos comunes: letras, espacios, guiones, puntos, etc.
  const charNoDigitArb = fc
    .integer({ min: 32, max: 126 })
    .filter((code) => code < 48 || code > 57) // excluir 0-9
    .map((code) => String.fromCharCode(code));

  return fc
    .tuple(
      fc.integer({ min: 0, max: 22 }), // posición del carácter no numérico
      charNoDigitArb, // carácter no numérico
      digitosArb(22), // 22 dígitos para rellenar
    )
    .map(([pos, charNoDigit, digitos]) => {
      // Insertar el carácter no numérico en la posición indicada
      return digitos.slice(0, pos) + charNoDigit + digitos.slice(pos);
    });
}

/**
 * Genera un radicado de 23 dígitos con año fuera de rango (< 1900 o > año actual CO).
 */
function radicado23AnioFueraDeRangoArb(): fc.Arbitrary<string> {
  const anioFueraDeRango = fc.oneof(
    // Años < 1900 (pero al menos 0000 para 4 dígitos)
    fc.integer({ min: 0, max: 1899 }),
    // Años > año actual CO (hasta 9999 para 4 dígitos)
    fc.integer({ min: ANIO_ACTUAL_CO + 1, max: 9999 }),
  );

  return fc
    .tuple(
      digitosArb(5), // DANE
      digitosArb(2), // entidad
      digitosArb(2), // especialidad
      digitosArb(3), // despacho
      anioFueraDeRango,
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

describe("PBT — Validación integral del radicado (Property 1)", () => {
  it("Property 1.1: Cualquier string de exactamente 23 dígitos con año en [1900, año actual CO] es aceptado (ok: true)", () => {
    fc.assert(
      fc.property(radicadoValidoArb(), (radicado) => {
        const resultado = validarRadicado(radicado);
        expect(resultado.ok).toBe(true);
        if (resultado.ok) {
          expect(resultado.value.raw).toBe(radicado);
          expect(resultado.value.anio).toBeGreaterThanOrEqual(1900);
          expect(resultado.value.anio).toBeLessThanOrEqual(ANIO_ACTUAL_CO);
        }
      }),
      { numRuns: 100 },
    );
  });

  it("Property 1.2: Cualquier string que NO tenga exactamente 23 dígitos es rechazado (ok: false)", () => {
    fc.assert(
      fc.property(stringLongitudDistinta23Arb(), (input) => {
        const resultado = validarRadicado(input);
        expect(resultado.ok).toBe(false);
        if (!resultado.ok) {
          expect(resultado.error.codigo).toBe("longitud_invalida");
        }
      }),
      { numRuns: 100 },
    );
  });

  it("Property 1.3: Cualquier string con al menos un carácter no numérico es rechazado (ok: false)", () => {
    fc.assert(
      fc.property(string23ConNoDigitosArb(), (input) => {
        const resultado = validarRadicado(input);
        expect(resultado.ok).toBe(false);
        if (!resultado.ok) {
          // Puede ser formato_invalido o longitud_invalida (si los chars no-digit afectan longitud)
          // Pero dado que generamos exactamente 23 chars, esperamos formato_invalido
          expect(resultado.error.codigo).toBe("formato_invalido");
        }
      }),
      { numRuns: 100 },
    );
  });

  it("Property 1.4: Cualquier 23-dígitos con año < 1900 o > año actual CO es rechazado (ok: false)", () => {
    fc.assert(
      fc.property(radicado23AnioFueraDeRangoArb(), (radicado) => {
        const resultado = validarRadicado(radicado);
        expect(resultado.ok).toBe(false);
        if (!resultado.ok) {
          expect(resultado.error.codigo).toBe("anio_fuera_de_rango");
        }
      }),
      { numRuns: 100 },
    );
  });
});
