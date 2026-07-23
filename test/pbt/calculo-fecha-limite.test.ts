/**
 * Feature: lexai-mvp, Property 17: Cálculo de fecha límite
 * (N días hábiles exactos entre inicio exclusivo y límite inclusivo
 * sin fines de semana/festivos, o N calendario consecutivos, en UTC-5)
 *
 * **Validates: Requisitos R8.1, R8.2, R8.7**
 *
 * Propiedades verificadas:
 *  1. Días hábiles: exactamente N días hábiles entre inicio (exclusivo) y resultado (inclusivo),
 *     donde días hábiles son lun-vie y no festivos colombianos.
 *  2. Días calendario: el resultado es exactamente inicio + N días (aritmética simple).
 *  3. El resultado siempre tiene componentes FechaCO consistentes en America/Bogotá (UTC-5).
 *  4. N inválido (no entero 1-365) siempre retorna error.
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { calcularFechaLimite } from "../../lib/calculadora-plazos";
import { fechaCODesdeComponentes, type FechaCO } from "../../lib/formato";
import { esFestivo } from "../../lib/festivos";

// ---------------------------------------------------------------------------
// Generadores
// ---------------------------------------------------------------------------

/** Genera una FechaCO aleatoria entre 2024 y 2030 */
const fechaCOArb = fc
  .record({
    anio: fc.integer({ min: 2024, max: 2030 }),
    mes: fc.integer({ min: 1, max: 12 }),
    dia: fc.integer({ min: 1, max: 28 }), // 28 para evitar días inválidos
  })
  .map(({ anio, mes, dia }) => fechaCODesdeComponentes(anio, mes, dia));

/** Genera N para días hábiles (1-30 para mantener velocidad) */
const diasHabilesArb = fc.integer({ min: 1, max: 30 });

/** Genera N para días calendario (1-365) */
const diasCalendarioArb = fc.integer({ min: 1, max: 365 });

/** Genera N inválido: no entero o fuera de rango 1-365 */
const diasInvalidoArb = fc.oneof(
  fc.integer({ min: -1000, max: 0 }), // <= 0
  fc.integer({ min: 366, max: 9999 }), // > 365
  fc.double({ min: 1.01, max: 364.99, noNaN: true, noDefaultInfinity: true }), // no entero
  fc.constant(NaN),
  fc.constant(Infinity),
  fc.constant(-Infinity),
);

// ---------------------------------------------------------------------------
// Helpers de verificación independiente
// ---------------------------------------------------------------------------

/**
 * Cuenta los días hábiles entre inicio (exclusivo) y fin (inclusivo).
 * Un día hábil es lun-vie y no festivo colombiano.
 */
function contarDiasHabilesEntre(inicio: FechaCO, fin: FechaCO): number {
  let conteo = 0;
  let actual = inicio;

  // Avanzar día a día desde inicio+1 hasta fin
  while (true) {
    actual = fechaCODesdeComponentes(actual.anio, actual.mes, actual.dia + 1);

    // Verificar si ya pasamos de la fecha fin
    if (
      actual.anio > fin.anio ||
      (actual.anio === fin.anio && actual.mes > fin.mes) ||
      (actual.anio === fin.anio && actual.mes === fin.mes && actual.dia > fin.dia)
    ) {
      break;
    }

    // Es día hábil si es lun-vie (1-5) y no festivo
    if (actual.diaSemana >= 1 && actual.diaSemana <= 5 && !esFestivo(actual)) {
      conteo++;
    }

    // Igualdad con fin
    if (actual.anio === fin.anio && actual.mes === fin.mes && actual.dia === fin.dia) {
      break;
    }
  }

  return conteo;
}

/**
 * Verifica si una fecha es día hábil (lun-vie, no festivo).
 */
function esDiaHabil(fecha: FechaCO): boolean {
  return fecha.diaSemana >= 1 && fecha.diaSemana <= 5 && !esFestivo(fecha);
}

// ---------------------------------------------------------------------------
// Propiedades
// ---------------------------------------------------------------------------

describe("PBT — Cálculo de fecha límite (Property 17)", () => {
  it("Property 17.1: Días hábiles — exactamente N días hábiles entre inicio (exclusivo) y resultado (inclusivo)", () => {
    fc.assert(
      fc.property(fechaCOArb, diasHabilesArb, (fechaInicio, dias) => {
        const resultado = calcularFechaLimite(fechaInicio, dias, true);

        // Debe ser exitoso
        expect(resultado.ok).toBe(true);
        if (!resultado.ok) return;

        const fechaLimite = resultado.value;

        // Contar días hábiles entre inicio (exclusivo) y resultado (inclusivo) de forma independiente
        const diasContados = contarDiasHabilesEntre(fechaInicio, fechaLimite);
        expect(diasContados).toBe(dias);

        // El día resultado debe ser un día hábil
        expect(esDiaHabil(fechaLimite)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it("Property 17.2: Días calendario — el resultado es exactamente inicio + N días", () => {
    fc.assert(
      fc.property(fechaCOArb, diasCalendarioArb, (fechaInicio, dias) => {
        const resultado = calcularFechaLimite(fechaInicio, dias, false);

        // Debe ser exitoso
        expect(resultado.ok).toBe(true);
        if (!resultado.ok) return;

        const fechaLimite = resultado.value;

        // Calcular la fecha esperada de forma independiente: inicio + N días
        const fechaEsperada = fechaCODesdeComponentes(
          fechaInicio.anio,
          fechaInicio.mes,
          fechaInicio.dia + dias,
        );

        // Los componentes deben coincidir exactamente
        expect(fechaLimite.anio).toBe(fechaEsperada.anio);
        expect(fechaLimite.mes).toBe(fechaEsperada.mes);
        expect(fechaLimite.dia).toBe(fechaEsperada.dia);
      }),
      { numRuns: 100 },
    );
  });

  it("Property 17.3: El resultado siempre tiene componentes FechaCO consistentes en UTC-5", () => {
    fc.assert(
      fc.property(
        fechaCOArb,
        fc.integer({ min: 1, max: 30 }),
        fc.boolean(),
        (fechaInicio, dias, esHabil) => {
          const resultado = calcularFechaLimite(fechaInicio, dias, esHabil);

          // Debe ser exitoso
          expect(resultado.ok).toBe(true);
          if (!resultado.ok) return;

          const fechaLimite = resultado.value;

          // Verificar que los componentes FechaCO son válidos
          expect(fechaLimite.anio).toBeGreaterThanOrEqual(2024);
          expect(fechaLimite.anio).toBeLessThanOrEqual(2032); // margen para sumar días
          expect(fechaLimite.mes).toBeGreaterThanOrEqual(1);
          expect(fechaLimite.mes).toBeLessThanOrEqual(12);
          expect(fechaLimite.dia).toBeGreaterThanOrEqual(1);
          expect(fechaLimite.dia).toBeLessThanOrEqual(31);
          expect(fechaLimite.diaSemana).toBeGreaterThanOrEqual(0);
          expect(fechaLimite.diaSemana).toBeLessThanOrEqual(6);

          // Verificar consistencia UTC-5: la diferencia entre el Date UTC subyacente
          // y los componentes CO debe reflejar el offset de +5h
          const utcHours = fechaLimite.date.getUTCHours();
          const expectedUTCHours = (fechaLimite.hora + 5) % 24;
          expect(utcHours).toBe(expectedUTCHours);

          // Verificar que reconstruir la fecha desde componentes produce el mismo resultado
          const reconstruida = fechaCODesdeComponentes(
            fechaLimite.anio,
            fechaLimite.mes,
            fechaLimite.dia,
            fechaLimite.hora,
            fechaLimite.minuto,
            fechaLimite.segundo,
          );
          expect(reconstruida.anio).toBe(fechaLimite.anio);
          expect(reconstruida.mes).toBe(fechaLimite.mes);
          expect(reconstruida.dia).toBe(fechaLimite.dia);
          expect(reconstruida.hora).toBe(fechaLimite.hora);
          expect(reconstruida.minuto).toBe(fechaLimite.minuto);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("Property 17.4: N inválido (no entero 1-365) siempre retorna error", () => {
    fc.assert(
      fc.property(fechaCOArb, diasInvalidoArb, fc.boolean(), (fechaInicio, dias, esHabil) => {
        const resultado = calcularFechaLimite(fechaInicio, dias, esHabil);

        // Debe retornar error
        expect(resultado.ok).toBe(false);
        if (resultado.ok) return;

        // El error debe ser del tipo dias_invalidos
        expect(resultado.error.tipo).toBe("dias_invalidos");
        // El mensaje debe indicar revisión manual
        expect(resultado.error.mensaje).toContain("revisión manual");
      }),
      { numRuns: 100 },
    );
  });
});
