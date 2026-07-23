/**
 * Tests para el Servicio de Festivos nacionales de Colombia (Ley 51 de 1983)
 *
 * Valida la generación correcta de los 18 festivos nacionales por año,
 * incluyendo el traslado "Ley Emiliani" al lunes siguiente.
 *
 * Se comparan contra las fechas oficiales publicadas por el gobierno colombiano.
 */

import { describe, it, expect } from "vitest";
import { festivosDelAnio, esFestivo } from "./festivos";
import { fechaCODesdeComponentes } from "./formato";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convierte FechaCO a string "YYYY-MM-DD" para comparación legible */
function toISO(f: { anio: number; mes: number; dia: number }): string {
  return `${f.anio}-${String(f.mes).padStart(2, "0")}-${String(f.dia).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Festivos oficiales conocidos por año (fuente: gobierno de Colombia)
// ---------------------------------------------------------------------------

/**
 * Festivos oficiales de Colombia 2024
 * Pascua 2024: 31 de marzo
 */
const FESTIVOS_2024 = [
  "2024-01-01", // Año Nuevo
  "2024-01-08", // Reyes Magos (6 ene → lunes 8)
  "2024-03-25", // San José (19 mar → lunes 25)
  "2024-03-28", // Jueves Santo
  "2024-03-29", // Viernes Santo
  "2024-05-01", // Día del Trabajo
  "2024-05-13", // Ascensión (9 may jue → lunes 13)
  "2024-06-03", // Corpus Christi (30 may jue → lunes 3 jun)
  "2024-06-10", // Sagrado Corazón (7 jun vie → lunes 10)
  "2024-07-01", // San Pedro y San Pablo (29 jun → lunes 1 jul)
  "2024-07-20", // Grito de Independencia
  "2024-08-07", // Batalla de Boyacá
  "2024-08-19", // Asunción (15 ago → lunes 19)
  "2024-10-14", // Día de la Raza (12 oct → lunes 14)
  "2024-11-04", // Todos los Santos (1 nov → lunes 4)
  "2024-11-11", // Independencia de Cartagena (ya es lunes)
  "2024-12-08", // Inmaculada Concepción
  "2024-12-25", // Navidad
];

/**
 * Festivos oficiales de Colombia 2025
 * Pascua 2025: 20 de abril
 */
const FESTIVOS_2025 = [
  "2025-01-01", // Año Nuevo
  "2025-01-06", // Reyes Magos (ya es lunes)
  "2025-03-24", // San José (19 mar → lunes 24)
  "2025-04-17", // Jueves Santo
  "2025-04-18", // Viernes Santo
  "2025-05-01", // Día del Trabajo
  "2025-06-02", // Ascensión (29 may jue → lunes 2 jun)
  "2025-06-23", // Corpus Christi (19 jun jue → lunes 23)
  "2025-06-30", // Sagrado Corazón (27 jun vie → lunes 30)
  "2025-06-30", // San Pedro y San Pablo (29 jun → lunes 30) — coincide con Sagrado Corazón
  "2025-07-20", // Grito de Independencia
  "2025-08-07", // Batalla de Boyacá
  "2025-08-18", // Asunción (15 ago → lunes 18)
  "2025-10-13", // Día de la Raza (12 oct → lunes 13)
  "2025-11-03", // Todos los Santos (1 nov → lunes 3)
  "2025-11-17", // Independencia de Cartagena (11 nov → lunes 17)
  "2025-12-08", // Inmaculada Concepción
  "2025-12-25", // Navidad
];

/**
 * Festivos oficiales de Colombia 2026
 * Pascua 2026: 5 de abril
 */
const FESTIVOS_2026 = [
  "2026-01-01", // Año Nuevo
  "2026-01-12", // Reyes Magos (6 ene → lunes 12)
  "2026-03-23", // San José (19 mar → lunes 23)
  "2026-04-02", // Jueves Santo
  "2026-04-03", // Viernes Santo
  "2026-05-01", // Día del Trabajo
  "2026-05-18", // Ascensión (14 may jue → lunes 18)
  "2026-06-08", // Corpus Christi (4 jun jue → lunes 8)
  "2026-06-15", // Sagrado Corazón (12 jun vie → lunes 15)
  "2026-06-29", // San Pedro y San Pablo (ya es lunes)
  "2026-07-20", // Grito de Independencia
  "2026-08-07", // Batalla de Boyacá
  "2026-08-17", // Asunción (15 ago → lunes 17)
  "2026-10-12", // Día de la Raza (ya es lunes)
  "2026-11-02", // Todos los Santos (1 nov → lunes 2)
  "2026-11-16", // Independencia de Cartagena (11 nov → lunes 16)
  "2026-12-08", // Inmaculada Concepción
  "2026-12-25", // Navidad
];

/**
 * Festivos oficiales de Colombia 2027
 * Pascua 2027: 28 de marzo
 */
const FESTIVOS_2027 = [
  "2027-01-01", // Año Nuevo
  "2027-01-11", // Reyes Magos (6 ene → lunes 11)
  "2027-03-22", // San José (19 mar → lunes 22)
  "2027-03-25", // Jueves Santo
  "2027-03-26", // Viernes Santo
  "2027-05-01", // Día del Trabajo
  "2027-05-10", // Ascensión (6 may jue → lunes 10)
  "2027-05-31", // Corpus Christi (27 may jue → lunes 31)
  "2027-06-07", // Sagrado Corazón (4 jun vie → lunes 7)
  "2027-06-28", // San Pedro y San Pablo (29 jun → lunes 28)... wait
  "2027-07-05", // San Pedro y San Pablo (29 jun mar → lunes 5 jul)
  "2027-07-20", // Grito de Independencia
  "2027-08-07", // Batalla de Boyacá
  "2027-08-16", // Asunción (15 ago → lunes 16)
  "2027-10-18", // Día de la Raza (12 oct → lunes 18)
  "2027-11-01", // Todos los Santos (ya es lunes)
  "2027-11-15", // Independencia de Cartagena (11 nov → lunes 15)
  "2027-12-08", // Inmaculada Concepción
  "2027-12-25", // Navidad
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("festivosDelAnio", () => {
  it("genera exactamente 18 festivos por año", () => {
    expect(festivosDelAnio(2024)).toHaveLength(18);
    expect(festivosDelAnio(2025)).toHaveLength(18);
    expect(festivosDelAnio(2026)).toHaveLength(18);
  });

  it("genera los festivos correctos para 2024", () => {
    const festivos = festivosDelAnio(2024).map(toISO);
    for (const esperado of FESTIVOS_2024) {
      expect(festivos).toContain(esperado);
    }
  });

  it("genera los festivos correctos para 2025", () => {
    const festivos = festivosDelAnio(2025).map(toISO);
    // En 2025 San Pedro y Sagrado Corazón coinciden en 2025-06-30
    // festivosDelAnio retorna 18 entradas (pueden haber duplicados de fecha)
    const festivosUnicos = [...new Set(festivos)];
    const esperadosUnicos = [...new Set(FESTIVOS_2025)];
    for (const esperado of esperadosUnicos) {
      expect(festivosUnicos).toContain(esperado);
    }
  });

  it("genera los festivos correctos para 2026", () => {
    const festivos = festivosDelAnio(2026).map(toISO);
    for (const esperado of FESTIVOS_2026) {
      expect(festivos).toContain(esperado);
    }
  });

  it("los festivos están ordenados cronológicamente", () => {
    const festivos = festivosDelAnio(2025);
    for (let i = 1; i < festivos.length; i++) {
      const prev = toISO(festivos[i - 1]);
      const curr = toISO(festivos[i]);
      expect(prev <= curr).toBe(true);
    }
  });

  it("los festivos fijos nunca se trasladan aunque caigan en fin de semana", () => {
    // 2022: Ene 1 es sábado, May 1 es domingo, Jul 20 es miércoles
    const festivos2022 = festivosDelAnio(2022).map(toISO);
    expect(festivos2022).toContain("2022-01-01"); // Sábado, no se traslada
    expect(festivos2022).toContain("2022-05-01"); // Domingo, no se traslada
  });

  it("devuelve los mismos resultados en llamadas consecutivas (caché)", () => {
    const primera = festivosDelAnio(2024);
    const segunda = festivosDelAnio(2024);
    expect(primera).toBe(segunda); // misma referencia (caché)
  });
});

describe("esFestivo", () => {
  it("retorna true para festivos conocidos (FechaCO)", () => {
    // 1 de enero de 2025
    const anioNuevo = fechaCODesdeComponentes(2025, 1, 1);
    expect(esFestivo(anioNuevo)).toBe(true);

    // Jueves Santo 2025: 17 de abril
    const juevesSanto = fechaCODesdeComponentes(2025, 4, 17);
    expect(esFestivo(juevesSanto)).toBe(true);

    // Navidad 2025
    const navidad = fechaCODesdeComponentes(2025, 12, 25);
    expect(esFestivo(navidad)).toBe(true);
  });

  it("retorna false para días hábiles normales", () => {
    // 2 de enero de 2025 (jueves, no festivo)
    const dia = fechaCODesdeComponentes(2025, 1, 2);
    expect(esFestivo(dia)).toBe(false);

    // 15 de julio de 2025 (martes, no festivo)
    const dia2 = fechaCODesdeComponentes(2025, 7, 15);
    expect(esFestivo(dia2)).toBe(false);
  });

  it("retorna true para festivos trasladados (Ley Emiliani)", () => {
    // En 2025 Reyes Magos es 6 ene lunes → queda el 6
    expect(esFestivo(fechaCODesdeComponentes(2025, 1, 6))).toBe(true);

    // En 2024 Reyes Magos se traslada al 8 ene (lunes)
    expect(esFestivo(fechaCODesdeComponentes(2024, 1, 8))).toBe(true);
    // El 6 de ene 2024 NO es festivo (fue trasladado)
    expect(esFestivo(fechaCODesdeComponentes(2024, 1, 6))).toBe(false);
  });

  it("retorna true para festivos dependientes de Pascua", () => {
    // Viernes Santo 2024: 29 de marzo
    expect(esFestivo(fechaCODesdeComponentes(2024, 3, 29))).toBe(true);

    // Ascensión 2025: lunes 2 de junio
    expect(esFestivo(fechaCODesdeComponentes(2025, 6, 2))).toBe(true);
  });

  it("funciona con Date nativo", () => {
    // 1 de enero de 2025 a mediodía UTC (= 7am en Colombia)
    const date = new Date(Date.UTC(2025, 0, 1, 12, 0, 0));
    expect(esFestivo(date)).toBe(true);

    // 2 de enero de 2025 (no festivo)
    const noFestivo = new Date(Date.UTC(2025, 0, 2, 12, 0, 0));
    expect(esFestivo(noFestivo)).toBe(false);
  });

  it("maneja correctamente fechas cerca de medianoche (cambio de zona)", () => {
    // 31 dic 2024 a las 23:00 UTC = 1 ene 2025 a las 04:00 en Colombia??? No.
    // UTC-5: 23:00 UTC = 18:00 Colombia. Todavía es 31 dic en Colombia.
    // Pero 1 ene 2025 05:00 UTC = 1 ene 2025 00:00 Colombia → festivo
    const medianocheCO = new Date(Date.UTC(2025, 0, 1, 5, 0, 0));
    expect(esFestivo(medianocheCO)).toBe(true);
  });
});

describe("Pascua (validación indirecta)", () => {
  it("Jueves y Viernes Santo coinciden con las fechas conocidas", () => {
    // 2024: Pascua 31 marzo → Jueves 28, Viernes 29
    const f2024 = festivosDelAnio(2024).map(toISO);
    expect(f2024).toContain("2024-03-28");
    expect(f2024).toContain("2024-03-29");

    // 2025: Pascua 20 abril → Jueves 17, Viernes 18
    const f2025 = festivosDelAnio(2025).map(toISO);
    expect(f2025).toContain("2025-04-17");
    expect(f2025).toContain("2025-04-18");

    // 2026: Pascua 5 abril → Jueves 2, Viernes 3
    const f2026 = festivosDelAnio(2026).map(toISO);
    expect(f2026).toContain("2026-04-02");
    expect(f2026).toContain("2026-04-03");
  });
});
