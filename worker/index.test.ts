/**
 * Tests unitarios y de propiedad para el worker de revisión diaria — LexAI MVP
 *
 * Cubre la función `debeEjecutar(fecha: FechaCO): boolean` que implementa
 * la guarda de día hábil del worker.
 *
 * Requisitos cubiertos: R6.1, R6.2, R6.9
 */

import { describe, it, expect, vi } from "vitest";
import fc from "fast-check";

// Mock despacho-notificaciones to avoid pulling in Prisma/Resend dependencies
vi.mock("./despacho-notificaciones", () => ({
  iniciarCronDespacho: vi.fn(),
}));

// Mock revision-diaria to avoid pulling in Prisma dependencies
vi.mock("./revision-diaria", () => ({
  ejecutarRevisionDiaria: vi.fn(async () => ({
    totalProcesos: 0,
    procesosRevisados: 0,
    procesosFallidos: 0,
    totalActuacionesNuevas: 0,
    totalPlazosCreados: 0,
  })),
}));

import { debeEjecutar } from "./index";
import { fechaCODesdeComponentes, type FechaCO } from "../lib/formato";
import { esFestivo } from "../lib/festivos";

// ---------------------------------------------------------------------------
// Helpers para tests
// ---------------------------------------------------------------------------

/**
 * Crea una FechaCO para un año/mes/día dado.
 */
function crearFecha(anio: number, mes: number, dia: number): FechaCO {
  return fechaCODesdeComponentes(anio, mes, dia);
}

// ---------------------------------------------------------------------------
// Tests unitarios
// ---------------------------------------------------------------------------

describe("debeEjecutar — tests unitarios", () => {
  it("retorna true para un lunes no festivo (ej: 2025-07-14)", () => {
    // 14 de julio 2025 es lunes y no es festivo
    const fecha = crearFecha(2025, 7, 14);
    expect(fecha.diaSemana).toBe(1); // lunes
    expect(esFestivo(fecha)).toBe(false);
    expect(debeEjecutar(fecha)).toBe(true);
  });

  it("retorna true para un miércoles no festivo (ej: 2025-07-16)", () => {
    const fecha = crearFecha(2025, 7, 16);
    expect(fecha.diaSemana).toBe(3); // miércoles
    expect(debeEjecutar(fecha)).toBe(true);
  });

  it("retorna true para un viernes no festivo (ej: 2025-07-18)", () => {
    const fecha = crearFecha(2025, 7, 18);
    expect(fecha.diaSemana).toBe(5); // viernes
    expect(debeEjecutar(fecha)).toBe(true);
  });

  it("retorna false para un sábado (ej: 2025-07-19)", () => {
    const fecha = crearFecha(2025, 7, 19);
    expect(fecha.diaSemana).toBe(6); // sábado
    expect(debeEjecutar(fecha)).toBe(false);
  });

  it("retorna false para un domingo (ej: 2025-07-20)", () => {
    // 20 de julio 2025 es domingo (además es festivo pero primero es fin de semana)
    const fecha = crearFecha(2025, 7, 20);
    expect(fecha.diaSemana).toBe(0); // domingo
    expect(debeEjecutar(fecha)).toBe(false);
  });

  it("retorna false para el 1 de enero (festivo fijo, si cae en día de semana)", () => {
    // 1 de enero 2025 es miércoles y festivo
    const fecha = crearFecha(2025, 1, 1);
    expect(fecha.diaSemana).toBe(3); // miércoles
    expect(esFestivo(fecha)).toBe(true);
    expect(debeEjecutar(fecha)).toBe(false);
  });

  it("retorna false para el 1 de mayo (Día del Trabajo, festivo fijo)", () => {
    // 1 de mayo 2025 es jueves y festivo
    const fecha = crearFecha(2025, 5, 1);
    expect(fecha.diaSemana).toBe(4); // jueves
    expect(esFestivo(fecha)).toBe(true);
    expect(debeEjecutar(fecha)).toBe(false);
  });

  it("retorna false para un festivo Ley Emiliani trasladado al lunes (ej: 6 enero 2025 → lunes 6)", () => {
    // 6 de enero 2025 es lunes (ya es lunes, no se traslada)
    const fecha = crearFecha(2025, 1, 6);
    expect(fecha.diaSemana).toBe(1); // lunes
    expect(esFestivo(fecha)).toBe(true);
    expect(debeEjecutar(fecha)).toBe(false);
  });

  it("retorna true para un martes después de un festivo (ej: 7 enero 2025)", () => {
    const fecha = crearFecha(2025, 1, 7);
    expect(fecha.diaSemana).toBe(2); // martes
    expect(esFestivo(fecha)).toBe(false);
    expect(debeEjecutar(fecha)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Tests de propiedad (fast-check)
// ---------------------------------------------------------------------------

describe("debeEjecutar — tests de propiedad", () => {
  /**
   * Feature: lexai-mvp, Property 12: Decisión de ejecución de la revisión diaria
   * (ejecuta sii lunes–viernes y no festivo; omite fines de semana y festivos)
   *
   * **Validates: Requirements R6.1, R6.2**
   */
  it("ejecuta sii lunes–viernes y no festivo", () => {
    // Generador de fechas válidas en rango razonable (2024-2030)
    const fechaArb = fc
      .record({
        anio: fc.integer({ min: 2024, max: 2030 }),
        mes: fc.integer({ min: 1, max: 12 }),
        dia: fc.integer({ min: 1, max: 28 }), // 28 para evitar días inválidos
      })
      .map(({ anio, mes, dia }) => fechaCODesdeComponentes(anio, mes, dia));

    fc.assert(
      fc.property(fechaArb, (fecha) => {
        const resultado = debeEjecutar(fecha);
        const esDiaSemana = fecha.diaSemana >= 1 && fecha.diaSemana <= 5;
        const esHoliday = esFestivo(fecha);

        // La propiedad: ejecuta si y solo si es día de semana Y no es festivo
        const esperado = esDiaSemana && !esHoliday;
        expect(resultado).toBe(esperado);
      }),
      { numRuns: 200 },
    );
  });

  it("siempre omite fines de semana sin importar si es festivo", () => {
    // Generador que produce solo sábados y domingos
    const finDeSemanaArb = fc
      .record({
        anio: fc.integer({ min: 2024, max: 2030 }),
        mes: fc.integer({ min: 1, max: 12 }),
        dia: fc.integer({ min: 1, max: 28 }),
      })
      .map(({ anio, mes, dia }) => fechaCODesdeComponentes(anio, mes, dia))
      .filter((fecha) => fecha.diaSemana === 0 || fecha.diaSemana === 6);

    fc.assert(
      fc.property(finDeSemanaArb, (fecha) => {
        expect(debeEjecutar(fecha)).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it("siempre omite festivos que caen en día de semana", () => {
    // Generador que produce solo días de semana que son festivos
    const festivoEnSemanaArb = fc
      .record({
        anio: fc.integer({ min: 2024, max: 2030 }),
        mes: fc.integer({ min: 1, max: 12 }),
        dia: fc.integer({ min: 1, max: 28 }),
      })
      .map(({ anio, mes, dia }) => fechaCODesdeComponentes(anio, mes, dia))
      .filter(
        (fecha) =>
          fecha.diaSemana >= 1 && fecha.diaSemana <= 5 && esFestivo(fecha),
      );

    fc.assert(
      fc.property(festivoEnSemanaArb, (fecha) => {
        expect(debeEjecutar(fecha)).toBe(false);
      }),
      { numRuns: 100 },
    );
  });
});
