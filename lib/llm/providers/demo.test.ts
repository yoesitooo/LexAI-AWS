import { describe, expect, it } from "vitest";
import { analizarTextoDemo, crearProveedorDemo } from "./demo";
import { PLANTILLAS_SIMULACION } from "@/lib/demo-simulacion";

const prompt = (texto: string) => `Analiza la siguiente actuación procesal colombiana:\n\n${texto}`;

describe("analizarTextoDemo", () => {
  it("extrae el término escrito en letras y cifra: cinco (5) días hábiles", () => {
    expect(analizarTextoDemo(prompt("Se concede el término de cinco (5) días para subsanar."))).toEqual({
      tienePlazo: true,
      dias: 5,
      esHabil: true,
      indeterminado: false,
    });
  });

  it("detecta días calendario", () => {
    const r = analizarTextoDemo(prompt("dentro de los 30 días calendario siguientes"));
    expect(r).toMatchObject({ tienePlazo: true, dias: 30, esHabil: false });
  });

  it("acepta el número solo en letras", () => {
    expect(analizarTextoDemo(prompt("en el término de tres días"))).toMatchObject({ dias: 3 });
  });

  it("sin término expreso → sin plazo", () => {
    expect(analizarTextoDemo(prompt("Ingresa el expediente al despacho."))).toMatchObject({
      tienePlazo: false,
      dias: null,
    });
  });

  it("ignora el encabezado del prompt (solo lee la actuación)", () => {
    const r = analizarTextoDemo("Encabezado con 99 días\n\nAuto que fija fecha de audiencia.");
    expect(r.tienePlazo).toBe(false);
  });

  it("término fuera de rango → indeterminado", () => {
    expect(analizarTextoDemo(prompt("por el término de 400 días"))).toMatchObject({
      indeterminado: true,
      dias: null,
    });
  });

  it("es coherente con todas las plantillas de la simulación", () => {
    const dias = PLANTILLAS_SIMULACION.map(
      (p) => analizarTextoDemo(prompt(`${p.actuacion} — ${p.anotacion}`)).dias,
    );
    expect(dias).toEqual([5, 3, 10, 30, null]);
  });
});

describe("crearProveedorDemo", () => {
  it("responde JSON válido sin llamadas de red", async () => {
    const r = await crearProveedorDemo().completar(prompt("traslado por diez (10) días"));
    expect(r.ok).toBe(true);
    if (r.ok) expect(JSON.parse(r.value)).toMatchObject({ dias: 10, esHabil: true });
  });
});
