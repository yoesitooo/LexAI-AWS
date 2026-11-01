/**
 * Tests unitarios para lib/formato.ts
 * Utilidades centralizadas de formato es-CO y zona horaria America/Bogota
 *
 * Requisitos: R14.3, R14.4, R14.5, R14.6
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  LOCALE_CO,
  ZONA_HORARIA_CO,
  crearFechaCO,
  fechaCODesdeComponentes,
  hoyCO,
  formatoFecha,
  formatoFechaDate,
  formatoFechaSoloDia,
  fechaCODesdeColumnaDate,
  formatoHora,
  formatoHoraDate,
  formatoNumero,
  formatoMoneda,
  anioActualCO,
  parsearFechaCO,
  fechaCOaISO,
  compararFechasCO,
  type FechaCO,
} from "./formato";

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

describe("Constantes de localización", () => {
  it("LOCALE_CO es es-CO", () => {
    expect(LOCALE_CO).toBe("es-CO");
  });

  it("ZONA_HORARIA_CO es America/Bogota", () => {
    expect(ZONA_HORARIA_CO).toBe("America/Bogota");
  });
});

// ---------------------------------------------------------------------------
// crearFechaCO y fechaCODesdeComponentes
// ---------------------------------------------------------------------------

describe("crearFechaCO", () => {
  it("extrae componentes correctamente en UTC-5", () => {
    // 2025-01-05T15:30:00Z → en Colombia es 10:30 del 5 de enero
    const date = new Date("2025-01-05T15:30:00Z");
    const fechaCO = crearFechaCO(date);

    expect(fechaCO.anio).toBe(2025);
    expect(fechaCO.mes).toBe(1);
    expect(fechaCO.dia).toBe(5);
    expect(fechaCO.hora).toBe(10);
    expect(fechaCO.minuto).toBe(30);
    expect(fechaCO.segundo).toBe(0);
    expect(fechaCO.diaSemana).toBe(0); // domingo
  });

  it("maneja el cambio de día por UTC-5", () => {
    // 2025-03-15T03:00:00Z → en Colombia es 2025-03-14 22:00
    const date = new Date("2025-03-15T03:00:00Z");
    const fechaCO = crearFechaCO(date);

    expect(fechaCO.anio).toBe(2025);
    expect(fechaCO.mes).toBe(3);
    expect(fechaCO.dia).toBe(14);
    expect(fechaCO.hora).toBe(22);
  });

  it("mantiene la referencia al Date original", () => {
    const date = new Date("2025-06-01T12:00:00Z");
    const fechaCO = crearFechaCO(date);

    expect(fechaCO.date).toBe(date);
  });
});

describe("fechaCODesdeComponentes", () => {
  it("crea una FechaCO con los componentes dados", () => {
    const fechaCO = fechaCODesdeComponentes(2025, 7, 20, 14, 30, 0);

    expect(fechaCO.anio).toBe(2025);
    expect(fechaCO.mes).toBe(7);
    expect(fechaCO.dia).toBe(20);
    expect(fechaCO.hora).toBe(14);
    expect(fechaCO.minuto).toBe(30);
    expect(fechaCO.segundo).toBe(0);
  });

  it("usa hora 00:00:00 por defecto", () => {
    const fechaCO = fechaCODesdeComponentes(2025, 1, 1);

    expect(fechaCO.hora).toBe(0);
    expect(fechaCO.minuto).toBe(0);
    expect(fechaCO.segundo).toBe(0);
  });

  it("el Date subyacente tiene el offset UTC correcto (+5h)", () => {
    // 2025-01-01 00:00:00 en Colombia = 2025-01-01 05:00:00 UTC
    const fechaCO = fechaCODesdeComponentes(2025, 1, 1, 0, 0, 0);
    expect(fechaCO.date.getUTCHours()).toBe(5);
    expect(fechaCO.date.getUTCDate()).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// hoyCO
// ---------------------------------------------------------------------------

describe("hoyCO", () => {
  it("devuelve una FechaCO con la fecha actual", () => {
    const ahora = hoyCO();

    // Debe tener componentes razonables
    expect(ahora.anio).toBeGreaterThanOrEqual(2024);
    expect(ahora.mes).toBeGreaterThanOrEqual(1);
    expect(ahora.mes).toBeLessThanOrEqual(12);
    expect(ahora.dia).toBeGreaterThanOrEqual(1);
    expect(ahora.dia).toBeLessThanOrEqual(31);
    expect(ahora.hora).toBeGreaterThanOrEqual(0);
    expect(ahora.hora).toBeLessThanOrEqual(23);
  });

  it("tiene un Date subyacente cercano a Date.now()", () => {
    const antes = Date.now();
    const ahora = hoyCO();
    const despues = Date.now();

    expect(ahora.date.getTime()).toBeGreaterThanOrEqual(antes);
    expect(ahora.date.getTime()).toBeLessThanOrEqual(despues);
  });
});

// ---------------------------------------------------------------------------
// formatoFecha — DD/MM/AAAA (R14.3)
// ---------------------------------------------------------------------------

describe("formatoFecha (DD/MM/AAAA)", () => {
  it("formatea con ceros a la izquierda en día y mes", () => {
    const fecha = fechaCODesdeComponentes(2025, 1, 5);
    expect(formatoFecha(fecha)).toBe("05/01/2025");
  });

  it("formatea fecha sin ceros necesarios", () => {
    const fecha = fechaCODesdeComponentes(2025, 12, 25);
    expect(formatoFecha(fecha)).toBe("25/12/2025");
  });

  it("formatea el primer día del año", () => {
    const fecha = fechaCODesdeComponentes(2025, 1, 1);
    expect(formatoFecha(fecha)).toBe("01/01/2025");
  });

  it("formatea el último día del año", () => {
    const fecha = fechaCODesdeComponentes(2024, 12, 31);
    expect(formatoFecha(fecha)).toBe("31/12/2024");
  });

  it("formatoFechaDate formatea directamente un Date", () => {
    // 2025-01-05T10:00:00Z → en Colombia sigue siendo 5 de enero (05:00)
    const date = new Date("2025-01-05T10:00:00Z");
    expect(formatoFechaDate(date)).toBe("05/01/2025");
  });
});

// ---------------------------------------------------------------------------
// formatoHora — HH:MM 24h (R14.4)
// ---------------------------------------------------------------------------

describe("formatoHora (HH:MM 24h)", () => {
  it("formatea hora con ceros a la izquierda", () => {
    const fecha = fechaCODesdeComponentes(2025, 1, 1, 7, 5);
    expect(formatoHora(fecha)).toBe("07:05");
  });

  it("formatea medianoche", () => {
    const fecha = fechaCODesdeComponentes(2025, 1, 1, 0, 0);
    expect(formatoHora(fecha)).toBe("00:00");
  });

  it("formatea 23:59", () => {
    const fecha = fechaCODesdeComponentes(2025, 1, 1, 23, 59);
    expect(formatoHora(fecha)).toBe("23:59");
  });

  it("formatea mediodía", () => {
    const fecha = fechaCODesdeComponentes(2025, 1, 1, 12, 0);
    expect(formatoHora(fecha)).toBe("12:00");
  });

  it("formatoHoraDate convierte UTC a hora Colombia", () => {
    // 19:05 UTC → 14:05 en Colombia
    const date = new Date("2025-01-05T19:05:00Z");
    expect(formatoHoraDate(date)).toBe("14:05");
  });
});

// ---------------------------------------------------------------------------
// formatoNumero — punto de miles, coma decimal (R14.6)
// ---------------------------------------------------------------------------

describe("formatoNumero (punto miles, coma decimal)", () => {
  it("formatea número entero grande con puntos de miles", () => {
    const resultado = formatoNumero(1234567);
    expect(resultado).toBe("1.234.567");
  });

  it("formatea número con decimales usando coma", () => {
    const resultado = formatoNumero(1234567.89);
    expect(resultado).toBe("1.234.567,89");
  });

  it("formatea número pequeño sin separador de miles", () => {
    expect(formatoNumero(42)).toBe("42");
  });

  it("formatea cero", () => {
    expect(formatoNumero(0)).toBe("0");
  });

  it("formatea número negativo", () => {
    const resultado = formatoNumero(-1500.5);
    expect(resultado).toBe("-1.500,5");
  });

  it("formatea mil exacto", () => {
    expect(formatoNumero(1000)).toBe("1.000");
  });
});

// ---------------------------------------------------------------------------
// formatoMoneda — COP 2 decimales (R14.6)
// ---------------------------------------------------------------------------

describe("formatoMoneda (COP, 2 decimales)", () => {
  it("formatea valor monetario con símbolo de pesos y 2 decimales", () => {
    const resultado = formatoMoneda(1234567.89);
    // El formato exacto depende del engine, pero debe contener:
    // - punto de miles
    // - coma decimal
    // - 2 decimales
    // - símbolo $ o texto COP
    expect(resultado).toContain("1.234.567,89");
    // Debe tener algún indicador de moneda
    expect(resultado.includes("$") || resultado.includes("COP")).toBe(true);
  });

  it("redondea a 2 decimales", () => {
    const resultado = formatoMoneda(100.999);
    // 100.999 redondeado a 2 dec = 101.00
    expect(resultado).toContain("101,00");
  });

  it("formatea cero con 2 decimales", () => {
    const resultado = formatoMoneda(0);
    expect(resultado).toContain("0,00");
  });

  it("formatea valores grandes correctamente", () => {
    const resultado = formatoMoneda(50000000);
    expect(resultado).toContain("50.000.000,00");
  });
});

// ---------------------------------------------------------------------------
// Zona horaria UTC-5 sin horario de verano (R14.5)
// ---------------------------------------------------------------------------

describe("Zona horaria America/Bogota (UTC-5 fijo)", () => {
  it("no cambia el offset en verano (junio)", () => {
    // En junio algunos países tienen DST, pero Colombia no
    const junio = new Date("2025-06-15T12:00:00Z"); // 12 UTC = 07:00 CO
    const fechaCO = crearFechaCO(junio);
    expect(fechaCO.hora).toBe(7);
  });

  it("no cambia el offset en invierno (diciembre)", () => {
    const diciembre = new Date("2025-12-15T12:00:00Z"); // 12 UTC = 07:00 CO
    const fechaCO = crearFechaCO(diciembre);
    expect(fechaCO.hora).toBe(7);
  });

  it("offset consistente: 5 horas menos que UTC todo el año", () => {
    // Verificamos que en diferentes meses el offset sea siempre -5
    const meses = [1, 3, 6, 9, 11];
    for (const mes of meses) {
      const date = new Date(`2025-${String(mes).padStart(2, "0")}-15T20:00:00Z`);
      const fechaCO = crearFechaCO(date);
      // 20:00 UTC = 15:00 CO siempre
      expect(fechaCO.hora).toBe(15);
    }
  });
});

// ---------------------------------------------------------------------------
// Utilidades adicionales
// ---------------------------------------------------------------------------

describe("anioActualCO", () => {
  it("devuelve un año razonable", () => {
    const anio = anioActualCO();
    expect(anio).toBeGreaterThanOrEqual(2024);
    expect(anio).toBeLessThanOrEqual(2100);
  });
});

describe("parsearFechaCO", () => {
  it("parsea un string ISO", () => {
    const fecha = parsearFechaCO("2025-03-20T15:00:00Z");
    expect(fecha.anio).toBe(2025);
    expect(fecha.mes).toBe(3);
    expect(fecha.dia).toBe(20);
    expect(fecha.hora).toBe(10); // 15 UTC - 5 = 10 CO
  });

  it("parsea un Date", () => {
    const date = new Date("2025-07-04T00:00:00Z");
    const fecha = parsearFechaCO(date);
    // 00:00 UTC = 03 jul 19:00 CO (día anterior)
    expect(fecha.dia).toBe(3);
    expect(fecha.hora).toBe(19);
  });
});

describe("fechaCOaISO", () => {
  it("devuelve YYYY-MM-DD", () => {
    const fecha = fechaCODesdeComponentes(2025, 3, 5);
    expect(fechaCOaISO(fecha)).toBe("2025-03-05");
  });

  it("usa ceros en mes y día", () => {
    const fecha = fechaCODesdeComponentes(2025, 1, 9);
    expect(fechaCOaISO(fecha)).toBe("2025-01-09");
  });
});

describe("compararFechasCO", () => {
  it("devuelve negativo si a < b", () => {
    const a = fechaCODesdeComponentes(2025, 1, 1);
    const b = fechaCODesdeComponentes(2025, 1, 2);
    expect(compararFechasCO(a, b)).toBeLessThan(0);
  });

  it("devuelve 0 si misma fecha", () => {
    const a = fechaCODesdeComponentes(2025, 6, 15, 10, 0);
    const b = fechaCODesdeComponentes(2025, 6, 15, 22, 0);
    expect(compararFechasCO(a, b)).toBe(0);
  });

  it("devuelve positivo si a > b", () => {
    const a = fechaCODesdeComponentes(2025, 12, 31);
    const b = fechaCODesdeComponentes(2025, 12, 30);
    expect(compararFechasCO(a, b)).toBeGreaterThan(0);
  });
});

describe("formatoFechaSoloDia — columnas de solo fecha (@db.Date)", () => {
  it("regresión: 2026-11-04 guardado en Postgres se muestra 04/11/2026, no 03/11", () => {
    // Así llega una columna DATE desde PostgreSQL: medianoche UTC
    const desdeDB = new Date("2026-11-04T00:00:00.000Z");
    expect(formatoFechaSoloDia(desdeDB)).toBe("04/11/2026");
    expect(formatoFechaSoloDia("2026-11-04T00:00:00.000Z")).toBe("04/11/2026");
    // formatoFechaDate (para instantes) la correría al día anterior en UTC-5
    expect(formatoFechaDate(desdeDB)).toBe("03/11/2026");
  });

  it("devuelve siempre la misma fecha de calendario que se guardó", () => {
    fc.assert(
      fc.property(
        fc.date({
          min: new Date("1950-01-01T00:00:00Z"),
          max: new Date("2100-12-31T00:00:00Z"),
          noInvalidDate: true,
        }),
        (d) => {
          const iso = d.toISOString().slice(0, 10); // AAAA-MM-DD
          const [a, m, dd] = iso.split("-");
          expect(formatoFechaSoloDia(new Date(`${iso}T00:00:00.000Z`))).toBe(`${dd}/${m}/${a}`);
        },
      ),
    );
  });
});

describe("fechaCODesdeColumnaDate", () => {
  it("regresión: una actuación del 29/10 guardada en Postgres sigue siendo del 29/10", () => {
    const f = fechaCODesdeColumnaDate(new Date("2026-10-29T00:00:00.000Z"));
    expect([f.anio, f.mes, f.dia]).toEqual([2026, 10, 29]);
    // crearFechaCO la correría al 28/10 (19:00 en Colombia)
    expect(crearFechaCO(new Date("2026-10-29T00:00:00.000Z")).dia).toBe(28);
  });

  it("conserva el día de calendario para cualquier fecha", () => {
    fc.assert(
      fc.property(
        fc.date({
          min: new Date("1950-01-01T00:00:00Z"),
          max: new Date("2100-12-31T00:00:00Z"),
          noInvalidDate: true,
        }),
        (d) => {
          const iso = d.toISOString().slice(0, 10);
          const f = fechaCODesdeColumnaDate(new Date(`${iso}T00:00:00.000Z`));
          expect(fechaCOaISO(f)).toBe(iso);
        },
      ),
    );
  });
});
