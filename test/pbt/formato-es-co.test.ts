/**
 * Feature: lexai-mvp, Property 31: Formato de fecha, hora y número es-CO
 * en America/Bogotá (UTC-5) sin horario de verano
 *
 * Validates: Requisitos R14.3, R14.4, R14.5, R14.6
 *
 * Propiedades verificadas:
 *  1. formatoFecha siempre produce DD/MM/AAAA con ceros a la izquierda
 *  2. formatoHora siempre produce HH:MM en formato 24h con ceros
 *  3. formatoNumero usa punto para miles y coma para decimal (formato español)
 *  4. formatoMoneda incluye símbolo COP y 2 decimales
 *  5. UTC-5 offset constante (sin DST): cualquier Date produce offset -5h consistente
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import {
  formatoFecha,
  formatoHora,
  formatoNumero,
  formatoMoneda,
  crearFechaCO,
  fechaCODesdeComponentes,
} from "../../lib/formato";

// ---------------------------------------------------------------------------
// Generadores
// ---------------------------------------------------------------------------

/** Genera timestamps en un rango razonable (2000-01-01 a 2099-12-31) */
const timestampArb = fc.integer({
  min: new Date("2000-01-01T00:00:00Z").getTime(),
  max: new Date("2099-12-31T23:59:59Z").getTime(),
});

/** Genera un Date aleatorio a partir de un timestamp */
const dateArb = timestampArb.map((ts) => new Date(ts));

/** Genera números con decimales variados para probar formato numérico */
const numberArb = fc.double({
  min: -999_999_999,
  max: 999_999_999,
  noNaN: true,
  noDefaultInfinity: true,
});

/** Genera números positivos con hasta 2 decimales para probar formato moneda */
const monedaArb = fc.double({
  min: 0,
  max: 999_999_999_999,
  noNaN: true,
  noDefaultInfinity: true,
});

// ---------------------------------------------------------------------------
// Propiedades
// ---------------------------------------------------------------------------

describe("PBT — Formato es-CO (Property 31)", () => {
  it("Property 31.1: formatoFecha siempre produce DD/MM/AAAA con ceros a la izquierda", () => {
    fc.assert(
      fc.property(dateArb, (date) => {
        const fechaCO = crearFechaCO(date);
        const resultado = formatoFecha(fechaCO);

        // Debe coincidir con regex DD/MM/AAAA
        expect(resultado).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);

        // Verificar que los valores son coherentes con los componentes de FechaCO
        const [dd, mm, aaaa] = resultado.split("/");
        expect(parseInt(dd, 10)).toBe(fechaCO.dia);
        expect(parseInt(mm, 10)).toBe(fechaCO.mes);
        expect(parseInt(aaaa, 10)).toBe(fechaCO.anio);

        // Verificar ceros a la izquierda cuando día o mes < 10
        if (fechaCO.dia < 10) {
          expect(dd).toMatch(/^0/);
        }
        if (fechaCO.mes < 10) {
          expect(mm).toMatch(/^0/);
        }
      }),
      { numRuns: 100 },
    );
  });

  it("Property 31.2: formatoHora siempre produce HH:MM en formato 24h con ceros", () => {
    fc.assert(
      fc.property(dateArb, (date) => {
        const fechaCO = crearFechaCO(date);
        const resultado = formatoHora(fechaCO);

        // Debe coincidir con regex HH:MM
        expect(resultado).toMatch(/^\d{2}:\d{2}$/);

        // Verificar que los valores son coherentes
        const [hh, mm] = resultado.split(":");
        expect(parseInt(hh, 10)).toBe(fechaCO.hora);
        expect(parseInt(mm, 10)).toBe(fechaCO.minuto);

        // Hora en rango 0-23, minuto en rango 0-59
        expect(parseInt(hh, 10)).toBeGreaterThanOrEqual(0);
        expect(parseInt(hh, 10)).toBeLessThanOrEqual(23);
        expect(parseInt(mm, 10)).toBeGreaterThanOrEqual(0);
        expect(parseInt(mm, 10)).toBeLessThanOrEqual(59);

        // Verificar ceros a la izquierda
        if (fechaCO.hora < 10) {
          expect(hh).toMatch(/^0/);
        }
        if (fechaCO.minuto < 10) {
          expect(mm).toMatch(/^0/);
        }
      }),
      { numRuns: 100 },
    );
  });

  it("Property 31.3: formatoNumero usa punto para miles y coma para decimal", () => {
    fc.assert(
      fc.property(numberArb, (num) => {
        const resultado = formatoNumero(num);

        // No debe contener coma como separador de miles ni punto como decimal
        // En es-CO: punto = miles, coma = decimal
        // Verificar que si hay separador decimal, es una coma
        // y si hay separador de miles, es un punto

        // Si el número tiene parte fraccionaria, debe haber una coma
        const partes = resultado.replace(/^-/, "").split(",");

        if (partes.length === 2) {
          // La parte entera puede tener puntos como separador de miles
          const parteEntera = partes[0];
          const parteDecimal = partes[1];

          // Parte decimal no debe contener puntos ni comas
          expect(parteDecimal).toMatch(/^\d+$/);

          // Parte entera: los puntos son separadores de miles
          // Cada grupo (excepto posiblemente el primero) debe ser de 3 dígitos
          const grupos = parteEntera.split(".");
          if (grupos.length > 1) {
            // Primer grupo puede tener 1-3 dígitos
            expect(grupos[0]).toMatch(/^\d{1,3}$/);
            // Grupos restantes deben tener exactamente 3 dígitos
            for (let i = 1; i < grupos.length; i++) {
              expect(grupos[i]).toMatch(/^\d{3}$/);
            }
          }
        } else if (partes.length === 1) {
          // Sin parte decimal: solo dígitos y puntos (separador de miles)
          const sinSigno = resultado.replace(/^-/, "");
          const grupos = sinSigno.split(".");
          if (grupos.length > 1) {
            expect(grupos[0]).toMatch(/^\d{1,3}$/);
            for (let i = 1; i < grupos.length; i++) {
              expect(grupos[i]).toMatch(/^\d{3}$/);
            }
          } else {
            // Número simple sin separadores
            expect(sinSigno).toMatch(/^\d+$/);
          }
        }
      }),
      { numRuns: 100 },
    );
  });

  it("Property 31.4: formatoMoneda incluye símbolo COP ($ o COP) y 2 decimales", () => {
    fc.assert(
      fc.property(monedaArb, (valor) => {
        const resultado = formatoMoneda(valor);

        // Debe incluir el símbolo de COP ($ o COP dependiendo del engine)
        const tieneSimboloCOP = resultado.includes("$") || resultado.includes("COP");
        expect(tieneSimboloCOP).toBe(true);

        // Debe tener exactamente 2 decimales después de la coma decimal
        // Buscar la coma decimal: en es-CO el separador decimal es la coma
        const matchDecimal = resultado.match(/,(\d+)/);
        expect(matchDecimal).not.toBeNull();
        if (matchDecimal) {
          expect(matchDecimal[1]).toHaveLength(2);
        }

        // La coma debe ser el separador decimal (usada una sola vez para la parte decimal)
        // Si hay puntos, son separadores de miles
        const soloNumeros = resultado.replace(/[^0-9.,]/g, "");
        const comas = soloNumeros.split(",");
        // Debe haber exactamente una coma (separador decimal)
        expect(comas).toHaveLength(2);
      }),
      { numRuns: 100 },
    );
  });

  it("Property 31.5: UTC-5 offset constante (sin DST): cualquier Date produce offset -5h consistente", () => {
    fc.assert(
      fc.property(
        // Generar componentes de fecha y verificar que la conversión ida/vuelta es consistente con UTC-5
        fc.record({
          anio: fc.integer({ min: 2000, max: 2099 }),
          mes: fc.integer({ min: 1, max: 12 }),
          dia: fc.integer({ min: 1, max: 28 }), // usar 28 para evitar días inválidos
          hora: fc.integer({ min: 0, max: 23 }),
          minuto: fc.integer({ min: 0, max: 59 }),
        }),
        ({ anio, mes, dia, hora, minuto }) => {
          const fechaCO = fechaCODesdeComponentes(anio, mes, dia, hora, minuto, 0);

          // La fecha subyacente UTC debe ser exactamente 5 horas mayor que la hora CO
          // fechaCODesdeComponentes crea un Date UTC sumando 5h al componente de hora CO
          // Por lo tanto: date.getUTCHours() (mod 24) debe ser hora + 5 (mod 24)
          const utcHours = fechaCO.date.getUTCHours();
          const expectedUTCHours = (hora + 5) % 24;
          expect(utcHours).toBe(expectedUTCHours);

          // Si hora + 5 >= 24, el día UTC es dia + 1 (excepto fin de mes)
          // Verificar que los componentes extraídos coinciden con los originales
          expect(fechaCO.anio).toBe(anio);
          expect(fechaCO.mes).toBe(mes);
          expect(fechaCO.dia).toBe(dia);
          expect(fechaCO.hora).toBe(hora);
          expect(fechaCO.minuto).toBe(minuto);

          // El offset es siempre -5h sin importar el mes (no hay DST en Colombia)
          // Esto se verifica porque la diferencia entre UTC y CO es siempre 5 horas
          const diffMs = fechaCO.date.getTime() -
            new Date(Date.UTC(anio, mes - 1, dia, hora, minuto, 0)).getTime();
          // diffMs debe ser exactamente +5 horas (porque UTC = CO + 5h)
          expect(diffMs).toBe(5 * 60 * 60 * 1000);
        },
      ),
      { numRuns: 100 },
    );
  });
});
