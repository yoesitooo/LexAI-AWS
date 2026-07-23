/**
 * Tests — Guardas de Fase 1
 *
 * Verifica que todas las operaciones de Fase 2 sean rechazadas
 * con el mensaje correcto y sin alterar el estado.
 *
 * Requisitos: R13.5, R15.1, R15.2, R15.3, R15.4
 */

import { describe, it, expect } from "vitest";
import {
  verificarFase1,
  verificarSinDespacho,
  verificarSinRol,
  verificarModuloTutela,
  verificarModuloBorradorIA,
  verificarFrecuenciaEditable,
  esErrorFase1,
  OPERACIONES_FASE2,
  type OperacionFase2,
  type ErrorFase1,
} from "./guardas-fase1";

describe("guardas-fase1", () => {
  describe("verificarFase1", () => {
    it.each(OPERACIONES_FASE2)(
      "rechaza la operación '%s' con error descriptivo",
      (operacion: OperacionFase2) => {
        const resultado = verificarFase1(operacion);

        expect(resultado.ok).toBe(false);
        if (!resultado.ok) {
          expect(resultado.error.operacion).toBe(operacion);
          expect(resultado.error.fase).toBe(1);
          expect(resultado.error.mensaje).toContain("no está disponible en Fase 1");
        }
      },
    );

    it("devuelve mensajes distintos para cada operación", () => {
      const mensajes = OPERACIONES_FASE2.map((op) => {
        const resultado = verificarFase1(op);
        return !resultado.ok ? resultado.error.mensaje : "";
      });

      const unicos = new Set(mensajes);
      expect(unicos.size).toBe(OPERACIONES_FASE2.length);
    });
  });

  describe("verificarSinDespacho", () => {
    it("rechaza con operación DESPACHO", () => {
      const resultado = verificarSinDespacho();

      expect(resultado.ok).toBe(false);
      if (!resultado.ok) {
        expect(resultado.error.operacion).toBe("DESPACHO");
        expect(resultado.error.mensaje).toContain("despachos");
      }
    });

    it("conserva el estado (no modifica datos)", () => {
      // La guarda es una función pura sin efectos secundarios
      const resultado1 = verificarSinDespacho();
      const resultado2 = verificarSinDespacho();

      expect(resultado1).toEqual(resultado2);
    });
  });

  describe("verificarSinRol", () => {
    it("rechaza con operación ROL", () => {
      const resultado = verificarSinRol();

      expect(resultado.ok).toBe(false);
      if (!resultado.ok) {
        expect(resultado.error.operacion).toBe("ROL");
        expect(resultado.error.mensaje).toContain("roles");
      }
    });
  });

  describe("verificarModuloTutela", () => {
    it("rechaza con operación TUTELA", () => {
      const resultado = verificarModuloTutela();

      expect(resultado.ok).toBe(false);
      if (!resultado.ok) {
        expect(resultado.error.operacion).toBe("TUTELA");
        expect(resultado.error.mensaje).toContain("tutelas");
      }
    });
  });

  describe("verificarModuloBorradorIA", () => {
    it("rechaza con operación BORRADOR_IA", () => {
      const resultado = verificarModuloBorradorIA();

      expect(resultado.ok).toBe(false);
      if (!resultado.ok) {
        expect(resultado.error.operacion).toBe("BORRADOR_IA");
        expect(resultado.error.mensaje).toContain("redacción");
      }
    });
  });

  describe("verificarFrecuenciaEditable", () => {
    it("rechaza con operación FRECUENCIA_REVISION", () => {
      const resultado = verificarFrecuenciaEditable();

      expect(resultado.ok).toBe(false);
      if (!resultado.ok) {
        expect(resultado.error.operacion).toBe("FRECUENCIA_REVISION");
        expect(resultado.error.mensaje).toContain("frecuencia");
      }
    });
  });

  describe("esErrorFase1", () => {
    it("identifica correctamente un ErrorFase1", () => {
      const error: ErrorFase1 = {
        operacion: "DESPACHO",
        mensaje: "No disponible en Fase 1",
        fase: 1,
      };

      expect(esErrorFase1(error)).toBe(true);
    });

    it("rechaza objetos que no son ErrorFase1", () => {
      expect(esErrorFase1(null)).toBe(false);
      expect(esErrorFase1(undefined)).toBe(false);
      expect(esErrorFase1("error")).toBe(false);
      expect(esErrorFase1({})).toBe(false);
      expect(esErrorFase1({ operacion: "DESPACHO" })).toBe(false);
      expect(esErrorFase1({ fase: 2, operacion: "DESPACHO", mensaje: "x" })).toBe(false);
    });

    it("es útil en bloques catch con errores genéricos", () => {
      const resultado = verificarSinDespacho();
      if (!resultado.ok) {
        const error: unknown = resultado.error;
        expect(esErrorFase1(error)).toBe(true);
      }
    });
  });

  describe("OPERACIONES_FASE2", () => {
    it("contiene exactamente 5 operaciones bloqueadas", () => {
      expect(OPERACIONES_FASE2).toHaveLength(5);
    });

    it("incluye todas las operaciones esperadas", () => {
      expect(OPERACIONES_FASE2).toContain("DESPACHO");
      expect(OPERACIONES_FASE2).toContain("ROL");
      expect(OPERACIONES_FASE2).toContain("TUTELA");
      expect(OPERACIONES_FASE2).toContain("BORRADOR_IA");
      expect(OPERACIONES_FASE2).toContain("FRECUENCIA_REVISION");
    });
  });
});
