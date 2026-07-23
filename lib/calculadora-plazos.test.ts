/**
 * Tests unitarios para la calculadora de plazos — LexAI MVP
 *
 * Cubre: días hábiles, días calendario, festivos, fines de semana,
 * cruce de año, N=1, N=365, validaciones de N.
 *
 * Requisitos cubiertos: R8.1, R8.2, R8.4, R8.5, R8.6, R8.7
 */

import { describe, it, expect, vi } from "vitest";
import { calcularFechaLimite } from "./calculadora-plazos";
import { fechaCODesdeComponentes, type FechaCO } from "./formato";

// Helper para crear fechas de forma concisa
function fecha(anio: number, mes: number, dia: number): FechaCO {
  return fechaCODesdeComponentes(anio, mes, dia);
}

describe("calcularFechaLimite", () => {
  // ─────────────────────────────────────────────────────────────────────────────
  // Validación de N (R8.4)
  // ─────────────────────────────────────────────────────────────────────────────

  describe("validación de días (N no entero o fuera de 1–365)", () => {
    it("rechaza N = 0", () => {
      const resultado = calcularFechaLimite(fecha(2025, 1, 6), 0, true);
      expect(resultado.ok).toBe(false);
      if (!resultado.ok) {
        expect(resultado.error.tipo).toBe("dias_invalidos");
      }
    });

    it("rechaza N negativo", () => {
      const resultado = calcularFechaLimite(fecha(2025, 1, 6), -5, true);
      expect(resultado.ok).toBe(false);
      if (!resultado.ok) {
        expect(resultado.error.tipo).toBe("dias_invalidos");
      }
    });

    it("rechaza N > 365", () => {
      const resultado = calcularFechaLimite(fecha(2025, 1, 6), 366, true);
      expect(resultado.ok).toBe(false);
      if (!resultado.ok) {
        expect(resultado.error.tipo).toBe("dias_invalidos");
      }
    });

    it("rechaza N decimal (2.5)", () => {
      const resultado = calcularFechaLimite(fecha(2025, 1, 6), 2.5, false);
      expect(resultado.ok).toBe(false);
      if (!resultado.ok) {
        expect(resultado.error.tipo).toBe("dias_invalidos");
      }
    });

    it("rechaza NaN", () => {
      const resultado = calcularFechaLimite(fecha(2025, 1, 6), NaN, true);
      expect(resultado.ok).toBe(false);
      if (!resultado.ok) {
        expect(resultado.error.tipo).toBe("dias_invalidos");
      }
    });

    it("rechaza Infinity", () => {
      const resultado = calcularFechaLimite(fecha(2025, 1, 6), Infinity, true);
      expect(resultado.ok).toBe(false);
      if (!resultado.ok) {
        expect(resultado.error.tipo).toBe("dias_invalidos");
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Días calendario (R8.2)
  // ─────────────────────────────────────────────────────────────────────────────

  describe("días calendario", () => {
    it("N=1: suma un día consecutivo", () => {
      // Lunes 6 de enero 2025 + 1 día calendario = martes 7 de enero
      const resultado = calcularFechaLimite(fecha(2025, 1, 6), 1, false);
      expect(resultado.ok).toBe(true);
      if (resultado.ok) {
        expect(resultado.value.anio).toBe(2025);
        expect(resultado.value.mes).toBe(1);
        expect(resultado.value.dia).toBe(7);
      }
    });

    it("N=7: incluye fin de semana y festivos", () => {
      // Lunes 6 ene 2025 + 7 días cal = lunes 13 ene 2025
      const resultado = calcularFechaLimite(fecha(2025, 1, 6), 7, false);
      expect(resultado.ok).toBe(true);
      if (resultado.ok) {
        expect(resultado.value.anio).toBe(2025);
        expect(resultado.value.mes).toBe(1);
        expect(resultado.value.dia).toBe(13);
      }
    });

    it("cruza fin de mes", () => {
      // 28 de enero 2025 + 5 días = 2 de febrero 2025
      const resultado = calcularFechaLimite(fecha(2025, 1, 28), 5, false);
      expect(resultado.ok).toBe(true);
      if (resultado.ok) {
        expect(resultado.value.anio).toBe(2025);
        expect(resultado.value.mes).toBe(2);
        expect(resultado.value.dia).toBe(2);
      }
    });

    it("cruza fin de año", () => {
      // 30 de diciembre 2025 + 3 días = 2 de enero 2026
      const resultado = calcularFechaLimite(fecha(2025, 12, 30), 3, false);
      expect(resultado.ok).toBe(true);
      if (resultado.ok) {
        expect(resultado.value.anio).toBe(2026);
        expect(resultado.value.mes).toBe(1);
        expect(resultado.value.dia).toBe(2);
      }
    });

    it("N=365: un año completo", () => {
      // 1 de enero 2025 + 365 días = 1 de enero 2026 (2025 no es bisiesto)
      const resultado = calcularFechaLimite(fecha(2025, 1, 1), 365, false);
      expect(resultado.ok).toBe(true);
      if (resultado.ok) {
        expect(resultado.value.anio).toBe(2026);
        expect(resultado.value.mes).toBe(1);
        expect(resultado.value.dia).toBe(1);
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Días hábiles (R8.1)
  // ─────────────────────────────────────────────────────────────────────────────

  describe("días hábiles", () => {
    it("N=1: avanza al día hábil siguiente (lunes a martes)", () => {
      // Lunes 6 de enero 2025 (festivo Reyes trasladado)
      // El 6 de enero 2025 es festivo (Reyes Magos trasladado al lunes)
      // Entonces desde viernes 3 enero: día siguiente sábado 4 (no), dom 5 (no),
      // lun 6 (festivo), mar 7 → N=1 desde 3 ene → 7 ene
      const resultado = calcularFechaLimite(fecha(2025, 1, 3), 1, true);
      expect(resultado.ok).toBe(true);
      if (resultado.ok) {
        expect(resultado.value.anio).toBe(2025);
        expect(resultado.value.mes).toBe(1);
        expect(resultado.value.dia).toBe(7);
      }
    });

    it("N=1: desde un martes normal, avanza a miércoles", () => {
      // Martes 7 enero 2025 → miércoles 8 enero 2025
      const resultado = calcularFechaLimite(fecha(2025, 1, 7), 1, true);
      expect(resultado.ok).toBe(true);
      if (resultado.ok) {
        expect(resultado.value.anio).toBe(2025);
        expect(resultado.value.mes).toBe(1);
        expect(resultado.value.dia).toBe(8);
      }
    });

    it("salta fines de semana", () => {
      // Viernes 10 de enero 2025 + 1 día hábil = lunes 13 de enero
      const resultado = calcularFechaLimite(fecha(2025, 1, 10), 1, true);
      expect(resultado.ok).toBe(true);
      if (resultado.ok) {
        expect(resultado.value.anio).toBe(2025);
        expect(resultado.value.mes).toBe(1);
        expect(resultado.value.dia).toBe(13);
      }
    });

    it("salta festivos (1 de enero)", () => {
      // 31 de diciembre 2024 (martes) + 1 día hábil
      // 1 ene 2025 (miércoles, festivo Año Nuevo) → 2 ene (jueves)
      const resultado = calcularFechaLimite(fecha(2024, 12, 31), 1, true);
      expect(resultado.ok).toBe(true);
      if (resultado.ok) {
        expect(resultado.value.anio).toBe(2025);
        expect(resultado.value.mes).toBe(1);
        expect(resultado.value.dia).toBe(2);
      }
    });

    it("N=5 días hábiles desde un lunes = siguiente lunes (sin festivos)", () => {
      // Lunes 13 enero 2025 + 5 hábiles = lunes 20 enero 2025
      // (14=mar, 15=mier, 16=jue, 17=vie, 20=lun) — sin festivos entre esas fechas
      const resultado = calcularFechaLimite(fecha(2025, 1, 13), 5, true);
      expect(resultado.ok).toBe(true);
      if (resultado.ok) {
        expect(resultado.value.anio).toBe(2025);
        expect(resultado.value.mes).toBe(1);
        expect(resultado.value.dia).toBe(20);
      }
    });

    it("N=5 días hábiles con festivo en medio", () => {
      // Desde viernes 28 de marzo 2025 + 5 días hábiles
      // 31 mar (lun, San José trasladado a 24 mar; verificar…)
      // Usemos Semana Santa 2025: Jueves Santo 17 abr, Viernes Santo 18 abr
      // Desde lunes 14 abril 2025 + 5 días hábiles:
      // 15 (mar), 16 (mier), 17 (jue Santo - festivo), 18 (vie Santo - festivo),
      // 21 (lun), 22 (mar), 23 (mier) → 5 hábiles: 15, 16, 21, 22, 23
      const resultado = calcularFechaLimite(fecha(2025, 4, 14), 5, true);
      expect(resultado.ok).toBe(true);
      if (resultado.ok) {
        expect(resultado.value.anio).toBe(2025);
        expect(resultado.value.mes).toBe(4);
        expect(resultado.value.dia).toBe(23);
      }
    });

    it("cruce de año con días hábiles", () => {
      // 30 diciembre 2025 (martes) + 3 días hábiles
      // 31 dic (mié, hábil), 1 ene 2026 (jue, festivo), 2 ene (vie, hábil), 5 ene (lun, hábil)
      // → 3 hábiles: 31 dic, 2 ene, 5 ene
      const resultado = calcularFechaLimite(fecha(2025, 12, 30), 3, true);
      expect(resultado.ok).toBe(true);
      if (resultado.ok) {
        expect(resultado.value.anio).toBe(2026);
        expect(resultado.value.mes).toBe(1);
        expect(resultado.value.dia).toBe(5);
      }
    });

    it("inicio en fin de semana: salta al lunes para contar", () => {
      // Sábado 11 enero 2025 + 1 día hábil
      // Día siguiente: domingo 12 (no), lunes 13 (sí) → 13 ene
      const resultado = calcularFechaLimite(fecha(2025, 1, 11), 1, true);
      expect(resultado.ok).toBe(true);
      if (resultado.ok) {
        expect(resultado.value.anio).toBe(2025);
        expect(resultado.value.mes).toBe(1);
        expect(resultado.value.dia).toBe(13);
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Servicio de festivos no disponible (R8.5)
  // ─────────────────────────────────────────────────────────────────────────────

  describe("servicio de festivos no disponible", () => {
    it("retorna error de reintento si esFestivo lanza excepción", async () => {
      // Importamos el módulo de festivos para poder mockearlo
      const festivos = await import("./festivos");
      const spy = vi.spyOn(festivos, "esFestivo").mockImplementation(() => {
        throw new Error("Servicio no disponible");
      });

      try {
        const resultado = calcularFechaLimite(fecha(2025, 1, 7), 3, true);
        expect(resultado.ok).toBe(false);
        if (!resultado.ok) {
          expect(resultado.error.tipo).toBe("festivos_no_disponibles");
          expect(resultado.error.mensaje).toContain("reintento");
        }
      } finally {
        spy.mockRestore();
      }
    });

    it("días calendario no necesita servicio de festivos", async () => {
      // Días calendario no llama a esFestivo, así que no falla
      const festivos = await import("./festivos");
      const spy = vi.spyOn(festivos, "esFestivo").mockImplementation(() => {
        throw new Error("Servicio no disponible");
      });

      try {
        const resultado = calcularFechaLimite(fecha(2025, 1, 7), 3, false);
        expect(resultado.ok).toBe(true);
        if (resultado.ok) {
          expect(resultado.value.dia).toBe(10);
        }
      } finally {
        spy.mockRestore();
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Zona horaria (R8.7) — todos los cálculos en America/Bogotá
  // ─────────────────────────────────────────────────────────────────────────────

  describe("zona horaria America/Bogotá", () => {
    it("la fecha resultante tiene componentes correctos en zona CO", () => {
      const resultado = calcularFechaLimite(fecha(2025, 6, 2), 1, true);
      expect(resultado.ok).toBe(true);
      if (resultado.ok) {
        // 2 junio 2025 es lunes; +1 hábil = martes 3 junio
        expect(resultado.value.anio).toBe(2025);
        expect(resultado.value.mes).toBe(6);
        expect(resultado.value.dia).toBe(3);
        // Día de semana: martes = 2
        expect(resultado.value.diaSemana).toBe(2);
      }
    });
  });
});
