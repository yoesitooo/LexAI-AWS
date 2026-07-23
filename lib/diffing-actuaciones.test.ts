/**
 * Tests unitarios — Diffing de actuaciones
 *
 * Prueba la lógica pura de `diffActuaciones` sin dependencia de base de datos.
 * El diffing compara actuaciones frescas de la CPNU contra el histórico
 * almacenado por identidad `id_actuacion_cpnu` (R6.3, R6.4, R6.5).
 */

import { describe, it, expect, vi } from "vitest";

// Mock de Prisma (no se necesita para las pruebas de lógica pura de diffing)
vi.mock("@/lib/db", () => ({
  prisma: {
    actuacion: {
      createMany: vi.fn(),
    },
  },
}));

import { diffActuaciones } from "./diffing-actuaciones";
import type { ActuacionCPNU } from "./cpnu-client";
import type { ActuacionAlmacenada } from "./diffing-actuaciones";

// =============================================================================
// HELPERS
// =============================================================================

function crearActuacionCPNU(overrides: Partial<ActuacionCPNU> = {}): ActuacionCPNU {
  return {
    idRegActuacion: 1000,
    llaveProceso: "llave-test",
    consActuacion: 1,
    fechaActuacion: "2024-01-15",
    actuacion: "Auto",
    anotacion: "Anotación de prueba",
    fechaInicia: null,
    fechaFinaliza: null,
    fechaRegistro: "2024-01-15",
    existeDocs: false,
    ...overrides,
  };
}

// =============================================================================
// TESTS
// =============================================================================

describe("diffActuaciones", () => {
  const procesoId = "proceso-uuid-test";

  it("devuelve todas las actuaciones cuando el histórico está vacío", () => {
    const frescas: ActuacionCPNU[] = [
      crearActuacionCPNU({ idRegActuacion: 100 }),
      crearActuacionCPNU({ idRegActuacion: 200 }),
      crearActuacionCPNU({ idRegActuacion: 300 }),
    ];
    const almacenadas: ActuacionAlmacenada[] = [];

    const nuevas = diffActuaciones(procesoId, frescas, almacenadas);

    expect(nuevas).toHaveLength(3);
    expect(nuevas.map((a) => a.idRegActuacion)).toEqual([100, 200, 300]);
  });

  it("devuelve un array vacío cuando todas las actuaciones ya están almacenadas", () => {
    const frescas: ActuacionCPNU[] = [
      crearActuacionCPNU({ idRegActuacion: 100 }),
      crearActuacionCPNU({ idRegActuacion: 200 }),
    ];
    const almacenadas: ActuacionAlmacenada[] = [
      { id_actuacion_cpnu: "100" },
      { id_actuacion_cpnu: "200" },
    ];

    const nuevas = diffActuaciones(procesoId, frescas, almacenadas);

    expect(nuevas).toHaveLength(0);
  });

  it("detecta solo las actuaciones nuevas (no existentes en el histórico)", () => {
    const frescas: ActuacionCPNU[] = [
      crearActuacionCPNU({ idRegActuacion: 100 }),
      crearActuacionCPNU({ idRegActuacion: 200 }),
      crearActuacionCPNU({ idRegActuacion: 300 }),
      crearActuacionCPNU({ idRegActuacion: 400 }),
    ];
    const almacenadas: ActuacionAlmacenada[] = [
      { id_actuacion_cpnu: "100" },
      { id_actuacion_cpnu: "300" },
    ];

    const nuevas = diffActuaciones(procesoId, frescas, almacenadas);

    expect(nuevas).toHaveLength(2);
    expect(nuevas.map((a) => a.idRegActuacion)).toEqual([200, 400]);
  });

  it("devuelve un array vacío cuando no hay actuaciones frescas", () => {
    const frescas: ActuacionCPNU[] = [];
    const almacenadas: ActuacionAlmacenada[] = [
      { id_actuacion_cpnu: "100" },
      { id_actuacion_cpnu: "200" },
    ];

    const nuevas = diffActuaciones(procesoId, frescas, almacenadas);

    expect(nuevas).toHaveLength(0);
  });

  it("maneja correctamente la comparación de identidad como string", () => {
    // idRegActuacion es number en CPNU, id_actuacion_cpnu es string en DB
    const frescas: ActuacionCPNU[] = [
      crearActuacionCPNU({ idRegActuacion: 12345 }),
      crearActuacionCPNU({ idRegActuacion: 67890 }),
    ];
    const almacenadas: ActuacionAlmacenada[] = [
      { id_actuacion_cpnu: "12345" },
    ];

    const nuevas = diffActuaciones(procesoId, frescas, almacenadas);

    expect(nuevas).toHaveLength(1);
    expect(nuevas[0].idRegActuacion).toBe(67890);
  });

  it("no filtra por contenido ni palabras clave — toda actuación no registrada es nueva (R6.4)", () => {
    // Actuaciones con contenido variado: todas deberían detectarse como nuevas
    const frescas: ActuacionCPNU[] = [
      crearActuacionCPNU({
        idRegActuacion: 1,
        actuacion: "Auto",
        anotacion: "Texto irrelevante sin términos legales",
      }),
      crearActuacionCPNU({
        idRegActuacion: 2,
        actuacion: "Notificación",
        anotacion: "",
      }),
      crearActuacionCPNU({
        idRegActuacion: 3,
        actuacion: "Sentencia",
        anotacion: "Se concede plazo de 5 días",
      }),
    ];
    const almacenadas: ActuacionAlmacenada[] = [];

    const nuevas = diffActuaciones(procesoId, frescas, almacenadas);

    // Todas son nuevas sin importar su contenido
    expect(nuevas).toHaveLength(3);
  });

  it("preserva el orden de las actuaciones frescas en el resultado", () => {
    const frescas: ActuacionCPNU[] = [
      crearActuacionCPNU({ idRegActuacion: 500 }),
      crearActuacionCPNU({ idRegActuacion: 100 }),
      crearActuacionCPNU({ idRegActuacion: 300 }),
    ];
    const almacenadas: ActuacionAlmacenada[] = [
      { id_actuacion_cpnu: "100" },
    ];

    const nuevas = diffActuaciones(procesoId, frescas, almacenadas);

    expect(nuevas.map((a) => a.idRegActuacion)).toEqual([500, 300]);
  });

  it("funciona con un gran número de actuaciones", () => {
    const frescas: ActuacionCPNU[] = Array.from({ length: 200 }, (_, i) =>
      crearActuacionCPNU({ idRegActuacion: i + 1 })
    );
    const almacenadas: ActuacionAlmacenada[] = Array.from(
      { length: 150 },
      (_, i) => ({ id_actuacion_cpnu: String(i + 1) })
    );

    const nuevas = diffActuaciones(procesoId, frescas, almacenadas);

    // IDs 151..200 son nuevas
    expect(nuevas).toHaveLength(50);
    expect(nuevas[0].idRegActuacion).toBe(151);
    expect(nuevas[49].idRegActuacion).toBe(200);
  });

  it("maneja actuaciones con idRegActuacion duplicado en las frescas", () => {
    // Si la CPNU devuelve duplicados, ambas instancias pasan el diff
    // (la DB protege con el índice único)
    const frescas: ActuacionCPNU[] = [
      crearActuacionCPNU({ idRegActuacion: 100, actuacion: "Auto" }),
      crearActuacionCPNU({ idRegActuacion: 100, actuacion: "Auto duplicado" }),
      crearActuacionCPNU({ idRegActuacion: 200 }),
    ];
    const almacenadas: ActuacionAlmacenada[] = [];

    const nuevas = diffActuaciones(procesoId, frescas, almacenadas);

    // Ambas con id 100 pasan (el filtro de unicidad es responsabilidad de la DB)
    expect(nuevas).toHaveLength(3);
  });
});
