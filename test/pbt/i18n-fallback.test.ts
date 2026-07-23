/**
 * Feature: lexai-mvp, Property 30: Resolución de i18n con fallback
 * (es-CO si existe, español si falta, nunca el identificador técnico)
 *
 * Validates: Requisitos R14.2
 *
 * Propiedades verificadas:
 *  1. Para cualquier clave que existe en es-CO: t(key) retorna el valor de es-CO
 *  2. Para cualquier clave en es pero NO en es-CO: t(key) retorna el valor de es
 *  3. Para cualquier string arbitrario NO presente en ningún diccionario: t(key) NUNCA retorna la clave misma
 *  4. El texto de respaldo es siempre legible (no vacío, no es el identificador técnico)
 */

import { describe, it, expect, beforeEach } from "vitest";
import * as fc from "fast-check";
import {
  t,
  limpiarClavesFaltantes,
  configurarLogClaveFaltante,
  es,
  esCO,
} from "../../lib/i18n/index";

// ---------------------------------------------------------------------------
// Setup: suprimir warnings de claves faltantes durante los tests PBT
// ---------------------------------------------------------------------------

beforeEach(() => {
  limpiarClavesFaltantes();
  configurarLogClaveFaltante(() => {}); // silenciar logs durante PBT
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const clavesES = Object.keys(es) as string[];
const clavesEsCO = Object.keys(esCO) as string[];
const clavesEnEsPeroNoEnCO = clavesES.filter(
  (k) => !Object.prototype.hasOwnProperty.call(esCO, k),
);
const todasLasClaves = new Set([...clavesES, ...clavesEsCO]);

// ---------------------------------------------------------------------------
// Propiedades
// ---------------------------------------------------------------------------

describe("PBT — i18n fallback (Property 30)", () => {
  it("Property 30.1: Para cualquier clave en es-CO, t(key) retorna el valor de es-CO", () => {
    // Si es-CO está vacío en el MVP, esta propiedad se cumple vacuamente.
    // Usamos fc.constantFrom solo si hay claves disponibles.
    if (clavesEsCO.length === 0) {
      // Propiedad se cumple vacuamente: no hay claves en es-CO para contradecirla.
      expect(true).toBe(true);
      return;
    }

    fc.assert(
      fc.property(fc.constantFrom(...clavesEsCO), (clave) => {
        const resultado = t(clave);
        const esperado = esCO[clave as keyof typeof esCO] as string;
        expect(resultado).toBe(esperado);
      }),
      { numRuns: Math.min(100, clavesEsCO.length * 10) },
    );
  });

  it("Property 30.2: Para cualquier clave en es pero NO en es-CO, t(key) retorna el valor de es", () => {
    if (clavesEnEsPeroNoEnCO.length === 0) {
      expect(true).toBe(true);
      return;
    }

    fc.assert(
      fc.property(fc.constantFrom(...clavesEnEsPeroNoEnCO), (clave) => {
        const resultado = t(clave);
        const esperado = es[clave as keyof typeof es];
        // El resultado debe empezar con la cadena esperada (sin interpolación de params puede
        // contener placeholders {var} intactos, lo cual es correcto)
        expect(resultado).toBe(esperado);
      }),
      { numRuns: 100 },
    );
  });

  it("Property 30.3: Para cualquier string arbitrario NO en ningún diccionario, t(key) NUNCA retorna la clave misma", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 200 }).filter(
          (s) => !todasLasClaves.has(s),
        ),
        (claveInexistente) => {
          const resultado = t(claveInexistente);
          // NUNCA debe devolver el identificador técnico
          expect(resultado).not.toBe(claveInexistente);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("Property 30.4: El texto de respaldo es siempre legible (no vacío, no es el identificador técnico)", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 200 }).filter(
          (s) => !todasLasClaves.has(s),
        ),
        (claveInexistente) => {
          const resultado = t(claveInexistente);

          // No debe ser vacío
          expect(resultado.trim().length).toBeGreaterThan(0);

          // No debe ser el identificador técnico (la clave misma)
          expect(resultado).not.toBe(claveInexistente);

          // El resultado debe ser un texto legible en español, no un código técnico.
          // Verificamos que el texto de respaldo es consistente (siempre el mismo texto amigable)
          // y no depende del valor de la clave inexistente.
          const otroResultado = t("otra.clave.seguro.inexistente.xyz123");
          expect(resultado).toBe(otroResultado);
        },
      ),
      { numRuns: 100 },
    );
  });
});
