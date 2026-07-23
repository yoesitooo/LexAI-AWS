/**
 * Feature: lexai-mvp, Property 5: El cliente no consulta radicados inválidos
 * (se abstiene de toda petición y devuelve fallo de radicado inválido)
 *
 * Validates: Requisitos R4.2
 *
 * Propiedades verificadas con fast-check (≥100 iteraciones):
 *  1. Para cualquier string que `validarRadicado()` rechaza, `consultarPorRadicado`
 *     retorna `{ ok: false, error: { tipo: "radicado_invalido" } }` sin llamar a fetch.
 *  2. Generadores: longitud incorrecta, caracteres no numéricos, año fuera de rango.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fc from "fast-check";
import { crearClienteCPNU } from "../../lib/cpnu-client";
import { validarRadicado } from "../../lib/validador-radicado";

// ---------------------------------------------------------------------------
// Helpers — Generadores de radicados inválidos
// ---------------------------------------------------------------------------

/** Año actual en America/Bogotá */
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

/** Genera un string de exactamente N dígitos aleatorios */
function digitosArb(n: number): fc.Arbitrary<string> {
  return fc
    .array(fc.integer({ min: 0, max: 9 }), { minLength: n, maxLength: n })
    .map((arr) => arr.join(""));
}

/**
 * Genera un string de longitud distinta de 23 (solo dígitos).
 * Radicados con longitud incorrecta.
 */
function radicadoLongitudIncorrectaArb(): fc.Arbitrary<string> {
  return fc
    .integer({ min: 0, max: 50 })
    .filter((len) => len !== 23)
    .chain((len) => digitosArb(len));
}

/**
 * Genera un string de 23 caracteres que contiene al menos un carácter no numérico.
 */
function radicadoConNoDigitosArb(): fc.Arbitrary<string> {
  const charNoDigitArb = fc
    .integer({ min: 32, max: 126 })
    .filter((code) => code < 48 || code > 57)
    .map((code) => String.fromCharCode(code));

  return fc
    .tuple(
      fc.integer({ min: 0, max: 22 }),
      charNoDigitArb,
      digitosArb(22),
    )
    .map(([pos, charNoDigit, digitos]) => {
      return digitos.slice(0, pos) + charNoDigit + digitos.slice(pos);
    });
}

/**
 * Genera un radicado de 23 dígitos con año fuera de rango (< 1900 o > año actual CO).
 */
function radicadoAnioFueraDeRangoArb(): fc.Arbitrary<string> {
  const anioFueraDeRango = fc.oneof(
    fc.integer({ min: 0, max: 1899 }),
    fc.integer({ min: ANIO_ACTUAL_CO + 1, max: 9999 }),
  );

  return fc
    .tuple(
      digitosArb(5),
      digitosArb(2),
      digitosArb(2),
      digitosArb(3),
      anioFueraDeRango,
      digitosArb(7),
    )
    .map(
      ([dane, entidad, especialidad, despacho, anio, consecutivo]) =>
        `${dane}${entidad}${especialidad}${despacho}${anio.toString().padStart(4, "0")}${consecutivo}`,
    );
}

/**
 * Genera cualquier radicado inválido (combinando los tres tipos de invalidez).
 */
function radicadoInvalidoArb(): fc.Arbitrary<string> {
  return fc.oneof(
    radicadoLongitudIncorrectaArb(),
    radicadoConNoDigitosArb(),
    radicadoAnioFueraDeRangoArb(),
  );
}

// ---------------------------------------------------------------------------
// Setup — Mock global de fetch
// ---------------------------------------------------------------------------

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// Propiedades
// ---------------------------------------------------------------------------

describe("PBT — El cliente no consulta radicados inválidos (Property 5)", () => {
  it("Property 5.1: Para cualquier radicado inválido, el cliente retorna radicado_invalido sin llamar a fetch", async () => {
    const cliente = crearClienteCPNU();

    await fc.assert(
      fc.asyncProperty(radicadoInvalidoArb(), async (radicado) => {
        // Precondición: el validador rechaza el input
        const validacion = validarRadicado(radicado);
        expect(validacion.ok).toBe(false);

        // Resetear el mock entre cada iteración
        fetchMock.mockClear();

        // Ejecutar la consulta
        const resultado = await cliente.consultarPorRadicado(radicado);

        // El resultado debe ser un fallo de tipo radicado_invalido
        expect(resultado.ok).toBe(false);
        if (!resultado.ok) {
          expect(resultado.error.tipo).toBe("radicado_invalido");
        }

        // fetch NO debe haber sido invocado
        expect(fetchMock).not.toHaveBeenCalled();
      }),
      { numRuns: 100 },
    );
  });

  it("Property 5.2: Radicados con longitud incorrecta no generan peticiones HTTP", async () => {
    const cliente = crearClienteCPNU();

    await fc.assert(
      fc.asyncProperty(radicadoLongitudIncorrectaArb(), async (radicado) => {
        fetchMock.mockClear();

        const resultado = await cliente.consultarPorRadicado(radicado);

        expect(resultado.ok).toBe(false);
        if (!resultado.ok) {
          expect(resultado.error.tipo).toBe("radicado_invalido");
        }
        expect(fetchMock).not.toHaveBeenCalled();
      }),
      { numRuns: 100 },
    );
  });

  it("Property 5.3: Radicados con caracteres no numéricos no generan peticiones HTTP", async () => {
    const cliente = crearClienteCPNU();

    await fc.assert(
      fc.asyncProperty(radicadoConNoDigitosArb(), async (radicado) => {
        fetchMock.mockClear();

        const resultado = await cliente.consultarPorRadicado(radicado);

        expect(resultado.ok).toBe(false);
        if (!resultado.ok) {
          expect(resultado.error.tipo).toBe("radicado_invalido");
        }
        expect(fetchMock).not.toHaveBeenCalled();
      }),
      { numRuns: 100 },
    );
  });

  it("Property 5.4: Radicados con año fuera de rango no generan peticiones HTTP", async () => {
    const cliente = crearClienteCPNU();

    await fc.assert(
      fc.asyncProperty(radicadoAnioFueraDeRangoArb(), async (radicado) => {
        fetchMock.mockClear();

        const resultado = await cliente.consultarPorRadicado(radicado);

        expect(resultado.ok).toBe(false);
        if (!resultado.ok) {
          expect(resultado.error.tipo).toBe("radicado_invalido");
        }
        expect(fetchMock).not.toHaveBeenCalled();
      }),
      { numRuns: 100 },
    );
  });
});
