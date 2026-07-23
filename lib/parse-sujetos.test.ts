/**
 * Tests para parseSujetosProcesales
 *
 * Verifica la extracción de demandante y demandado desde el campo
 * sujetos_procesales en sus distintos formatos.
 */

import { describe, it, expect } from "vitest";
import { parseSujetosProcesales } from "./parse-sujetos";

describe("parseSujetosProcesales", () => {
  it("parsea formato texto con DEMANDANTE y DEMANDADO separados por |", () => {
    const resultado = parseSujetosProcesales(
      "DEMANDANTE: Juan Pérez | DEMANDADO: María López",
    );
    expect(resultado.demandante).toBe("Juan Pérez");
    expect(resultado.demandado).toBe("María López");
  });

  it("parsea formato texto solo con DEMANDANTE", () => {
    const resultado = parseSujetosProcesales("DEMANDANTE: Carlos García");
    expect(resultado.demandante).toBe("Carlos García");
    expect(resultado.demandado).toBe("");
  });

  it("parsea formato texto solo con DEMANDADO", () => {
    const resultado = parseSujetosProcesales("DEMANDADO: Empresa S.A.");
    expect(resultado.demandante).toBe("");
    expect(resultado.demandado).toBe("Empresa S.A.");
  });

  it("parsea formato JSON con claves en minúsculas", () => {
    const json = JSON.stringify({ demandante: "Ana", demandado: "Pedro" });
    const resultado = parseSujetosProcesales(json);
    expect(resultado.demandante).toBe("Ana");
    expect(resultado.demandado).toBe("Pedro");
  });

  it("parsea formato JSON con claves en mayúsculas", () => {
    const json = JSON.stringify({ DEMANDANTE: "Ana", DEMANDADO: "Pedro" });
    const resultado = parseSujetosProcesales(json);
    expect(resultado.demandante).toBe("Ana");
    expect(resultado.demandado).toBe("Pedro");
  });

  it("devuelve vacíos cuando el input es null", () => {
    const resultado = parseSujetosProcesales(null);
    expect(resultado.demandante).toBe("");
    expect(resultado.demandado).toBe("");
  });

  it("devuelve vacíos cuando el input es undefined", () => {
    const resultado = parseSujetosProcesales(undefined);
    expect(resultado.demandante).toBe("");
    expect(resultado.demandado).toBe("");
  });

  it("devuelve vacíos cuando el input es string vacío", () => {
    const resultado = parseSujetosProcesales("");
    expect(resultado.demandante).toBe("");
    expect(resultado.demandado).toBe("");
  });

  it("devuelve vacíos cuando el input es '{}'", () => {
    const resultado = parseSujetosProcesales("{}");
    expect(resultado.demandante).toBe("");
    expect(resultado.demandado).toBe("");
  });

  it("es case-insensitive en las etiquetas de texto", () => {
    const resultado = parseSujetosProcesales(
      "demandante: Juan | demandado: María",
    );
    expect(resultado.demandante).toBe("Juan");
    expect(resultado.demandado).toBe("María");
  });

  it("maneja espacios extra alrededor del separador", () => {
    const resultado = parseSujetosProcesales(
      "DEMANDANTE:  Juan Pérez  |  DEMANDADO:  María López  ",
    );
    expect(resultado.demandante).toBe("Juan Pérez");
    expect(resultado.demandado).toBe("María López");
  });
});
