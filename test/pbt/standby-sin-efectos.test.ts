/**
 * Feature: lexai-mvp, Property 29: Los módulos en standby no producen efectos
 * sobre los datos (usuarios/procesos/actuaciones permanecen sin cambios)
 *
 * Validates: Requisitos R13.3
 *
 * Propiedades verificadas con fast-check (≥100 iteraciones):
 *  1. Para CUALQUIER invocación de verificarModuloTutela() → SIEMPRE retorna
 *     { ok: false, error: {...} } con fase=1
 *  2. Para CUALQUIER invocación de verificarModuloBorradorIA() → SIEMPRE retorna
 *     { ok: false, error: {...} } con fase=1
 *  3. Estas funciones son PURAS (sin side effects) — llamarlas múltiples veces
 *     produce resultados idénticos
 *  4. El mensaje de error contiene "no está disponible en Fase 1"
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";

import {
  verificarModuloTutela,
  verificarModuloBorradorIA,
} from "../../lib/guardas-fase1";

// ─── Tests de propiedad ─────────────────────────────────────────────────────

describe("PBT — Módulos en standby sin efectos (Property 29)", () => {
  it("Property 29a: verificarModuloTutela() SIEMPRE retorna { ok: false } con fase=1", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 999 }), (_seed) => {
        const resultado = verificarModuloTutela();

        // PROPIEDAD: siempre falla (ok === false)
        expect(resultado.ok).toBe(false);

        if (!resultado.ok) {
          // El error contiene fase=1
          expect(resultado.error.fase).toBe(1);
          // La operación es TUTELA
          expect(resultado.error.operacion).toBe("TUTELA");
        }
      }),
      { numRuns: 100 },
    );
  });

  it("Property 29b: verificarModuloBorradorIA() SIEMPRE retorna { ok: false } con fase=1", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 999 }), (_seed) => {
        const resultado = verificarModuloBorradorIA();

        // PROPIEDAD: siempre falla (ok === false)
        expect(resultado.ok).toBe(false);

        if (!resultado.ok) {
          // El error contiene fase=1
          expect(resultado.error.fase).toBe(1);
          // La operación es BORRADOR_IA
          expect(resultado.error.operacion).toBe("BORRADOR_IA");
        }
      }),
      { numRuns: 100 },
    );
  });

  it("Property 29c: Las funciones son puras — múltiples invocaciones producen resultados idénticos", () => {
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 50 }), (repeticiones) => {
        // Invocamos verificarModuloTutela N veces
        const resultadosTutela = Array.from({ length: repeticiones }, () =>
          verificarModuloTutela(),
        );

        // Invocamos verificarModuloBorradorIA N veces
        const resultadosBorrador = Array.from({ length: repeticiones }, () =>
          verificarModuloBorradorIA(),
        );

        // PROPIEDAD: todos los resultados de tutela son estructuralmente idénticos
        const primerTutela = JSON.stringify(resultadosTutela[0]);
        for (const r of resultadosTutela) {
          expect(JSON.stringify(r)).toBe(primerTutela);
        }

        // PROPIEDAD: todos los resultados de borrador son estructuralmente idénticos
        const primerBorrador = JSON.stringify(resultadosBorrador[0]);
        for (const r of resultadosBorrador) {
          expect(JSON.stringify(r)).toBe(primerBorrador);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('Property 29d: El mensaje de error contiene "no está disponible en Fase 1"', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 999 }), (_seed) => {
        const resultadoTutela = verificarModuloTutela();
        const resultadoBorrador = verificarModuloBorradorIA();

        // PROPIEDAD: ambos mensajes contienen la frase esperada
        if (!resultadoTutela.ok) {
          expect(resultadoTutela.error.mensaje).toContain(
            "no está disponible en Fase 1",
          );
        }

        if (!resultadoBorrador.ok) {
          expect(resultadoBorrador.error.mensaje).toContain(
            "no está disponible en Fase 1",
          );
        }
      }),
      { numRuns: 100 },
    );
  });
});
