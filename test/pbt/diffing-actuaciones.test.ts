/**
 * Feature: lexai-mvp, Property 13: Diffing de actuaciones detecta toda actuación nueva
 * (nuevo = A menos H por id_actuacion_cpnu, sin filtrar por palabras clave, marcadas es_nueva=true)
 *
 * **Validates: Requisitos R6.4, R6.5**
 *
 * Propiedades verificadas:
 *  1. Para cualesquiera dos conjuntos A (frescas de CPNU) y H (históricas almacenadas),
 *     el resultado del diff = A \ H (diferencia de conjuntos por id_actuacion_cpnu).
 *  2. No hay filtrado por contenido/palabras clave — cualquier ID nuevo se detecta
 *     sin importar el texto de la actuación.
 *  3. El resultado preserva el orden de las actuaciones frescas.
 *  4. Si A ⊂ H (todas las frescas ya están almacenadas), el resultado es vacío.
 *  5. Si H = ∅ (sin historial), el resultado = A (todas las frescas son nuevas).
 */

import { describe, it, expect, vi } from "vitest";
import * as fc from "fast-check";

// Mock de Prisma (no se usa en la lógica pura de diffing)
vi.mock("@/lib/db", () => ({
  prisma: {
    actuacion: {
      createMany: vi.fn(),
    },
  },
}));

import { diffActuaciones } from "../../lib/diffing-actuaciones";
import type { ActuacionCPNU } from "../../lib/cpnu-client";
import type { ActuacionAlmacenada } from "../../lib/diffing-actuaciones";

// ---------------------------------------------------------------------------
// Generadores
// ---------------------------------------------------------------------------

/** Genera un ID de actuación CPNU positivo (number) */
const idActuacionArb = fc.integer({ min: 1, max: 1_000_000 });

/** Genera texto arbitrario para actuaciones (incluyendo vacíos y caracteres especiales) */
const textoArb = fc.string({ minLength: 0, maxLength: 200 });

/** Genera una ActuacionCPNU con un idRegActuacion dado y texto arbitrario */
function actuacionCPNUArb(id: number): fc.Arbitrary<ActuacionCPNU> {
  return fc
    .record({
      actuacion: textoArb,
      anotacion: textoArb,
    })
    .map(({ actuacion, anotacion }) => ({
      idRegActuacion: id,
      llaveProceso: "llave-pbt",
      consActuacion: 1,
      fechaActuacion: "2024-06-15",
      actuacion,
      anotacion,
      fechaInicia: null,
      fechaFinaliza: null,
      fechaRegistro: "2024-06-15",
      existeDocs: false,
    }));
}

/** Genera un array de ActuacionCPNU con IDs únicos */
const actuacionesFrescasArb = fc
  .uniqueArray(idActuacionArb, { minLength: 0, maxLength: 50 })
  .chain((ids) =>
    fc.tuple(...ids.map((id) => actuacionCPNUArb(id))).map((actuaciones) => actuaciones)
  );

/** Genera un array de ActuacionAlmacenada a partir de un subconjunto de IDs */
function almacenadasDesdeIds(ids: number[]): ActuacionAlmacenada[] {
  return ids.map((id) => ({ id_actuacion_cpnu: String(id) }));
}

/** Genera un procesoId arbitrario */
const procesoIdArb = fc.uuid();

// ---------------------------------------------------------------------------
// Propiedades
// ---------------------------------------------------------------------------

describe("PBT — Diffing de actuaciones (Property 13)", () => {
  it("Property 13.1: El resultado es A \\ H (diferencia de conjuntos por id_actuacion_cpnu)", () => {
    fc.assert(
      fc.property(
        procesoIdArb,
        fc.uniqueArray(idActuacionArb, { minLength: 0, maxLength: 50 }),
        fc.uniqueArray(idActuacionArb, { minLength: 0, maxLength: 50 }),
        (procesoId, idsFrescas, idsAlmacenadas) => {
          // Construir actuaciones frescas
          const frescas: ActuacionCPNU[] = idsFrescas.map((id) => ({
            idRegActuacion: id,
            llaveProceso: "llave-pbt",
            consActuacion: 1,
            fechaActuacion: "2024-06-15",
            actuacion: "Auto",
            anotacion: "Texto cualquiera",
            fechaInicia: null,
            fechaFinaliza: null,
            fechaRegistro: "2024-06-15",
            existeDocs: false,
          }));

          const almacenadas = almacenadasDesdeIds(idsAlmacenadas);

          const resultado = diffActuaciones(procesoId, frescas, almacenadas);

          // Calcular diferencia esperada: IDs en frescas que NO están en almacenadas
          const setAlmacenados = new Set(idsAlmacenadas.map(String));
          const idsEsperados = idsFrescas.filter((id) => !setAlmacenados.has(String(id)));

          // Los IDs del resultado deben coincidir exactamente con la diferencia de conjuntos
          const idsResultado = resultado.map((a) => a.idRegActuacion);
          expect(idsResultado).toEqual(idsEsperados);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("Property 13.2: No filtra por contenido — cualquier ID nuevo se detecta sin importar el texto", () => {
    fc.assert(
      fc.property(
        procesoIdArb,
        fc.uniqueArray(idActuacionArb, { minLength: 1, maxLength: 30 }),
        textoArb,
        textoArb,
        (procesoId, ids, textoActuacion, textoAnotacion) => {
          // Todas las actuaciones tienen el mismo texto arbitrario (puede ser vacío,
          // basura, sin palabras clave, etc.) — todas deben ser detectadas como nuevas
          const frescas: ActuacionCPNU[] = ids.map((id) => ({
            idRegActuacion: id,
            llaveProceso: "llave-pbt",
            consActuacion: 1,
            fechaActuacion: "2024-06-15",
            actuacion: textoActuacion,
            anotacion: textoAnotacion,
            fechaInicia: null,
            fechaFinaliza: null,
            fechaRegistro: "2024-06-15",
            existeDocs: false,
          }));

          // Historial vacío — todas son nuevas
          const almacenadas: ActuacionAlmacenada[] = [];

          const resultado = diffActuaciones(procesoId, frescas, almacenadas);

          // Todas las actuaciones deben detectarse independientemente del contenido
          expect(resultado).toHaveLength(ids.length);
          expect(resultado.map((a) => a.idRegActuacion)).toEqual(ids);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("Property 13.3: El resultado preserva el orden de las actuaciones frescas", () => {
    fc.assert(
      fc.property(
        procesoIdArb,
        fc.uniqueArray(idActuacionArb, { minLength: 0, maxLength: 50 }),
        fc.uniqueArray(idActuacionArb, { minLength: 0, maxLength: 30 }),
        (procesoId, idsFrescas, idsAlmacenadas) => {
          const frescas: ActuacionCPNU[] = idsFrescas.map((id) => ({
            idRegActuacion: id,
            llaveProceso: "llave-pbt",
            consActuacion: 1,
            fechaActuacion: "2024-06-15",
            actuacion: "Auto",
            anotacion: "",
            fechaInicia: null,
            fechaFinaliza: null,
            fechaRegistro: "2024-06-15",
            existeDocs: false,
          }));

          const almacenadas = almacenadasDesdeIds(idsAlmacenadas);

          const resultado = diffActuaciones(procesoId, frescas, almacenadas);

          // Verificar que el resultado mantiene el orden relativo de las frescas.
          // Los IDs del resultado deben aparecer en el mismo orden que en idsFrescas.
          const setAlmacenados = new Set(idsAlmacenadas.map(String));
          const ordenEsperado = idsFrescas.filter((id) => !setAlmacenados.has(String(id)));
          const idsResultado = resultado.map((a) => a.idRegActuacion);
          expect(idsResultado).toEqual(ordenEsperado);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("Property 13.4: Si A ⊂ H (todas las frescas ya están almacenadas), el resultado es vacío", () => {
    fc.assert(
      fc.property(
        procesoIdArb,
        fc.uniqueArray(idActuacionArb, { minLength: 0, maxLength: 40 }),
        fc.uniqueArray(idActuacionArb, { minLength: 0, maxLength: 20 }),
        (procesoId, idsBase, idsExtra) => {
          // Las frescas son un subconjunto de idsBase
          // Las almacenadas contienen idsBase + idsExtra (superset)
          const frescas: ActuacionCPNU[] = idsBase.map((id) => ({
            idRegActuacion: id,
            llaveProceso: "llave-pbt",
            consActuacion: 1,
            fechaActuacion: "2024-06-15",
            actuacion: "Auto",
            anotacion: "",
            fechaInicia: null,
            fechaFinaliza: null,
            fechaRegistro: "2024-06-15",
            existeDocs: false,
          }));

          // Almacenadas contienen TODOS los IDs de frescas + extra IDs
          const todosIds = [...new Set([...idsBase, ...idsExtra])];
          const almacenadas = almacenadasDesdeIds(todosIds);

          const resultado = diffActuaciones(procesoId, frescas, almacenadas);

          // El resultado debe ser vacío porque A ⊂ H
          expect(resultado).toHaveLength(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("Property 13.5: Si H = ∅ (sin historial), el resultado = A (todas las frescas son nuevas)", () => {
    fc.assert(
      fc.property(
        procesoIdArb,
        fc.uniqueArray(idActuacionArb, { minLength: 0, maxLength: 50 }),
        (procesoId, ids) => {
          const frescas: ActuacionCPNU[] = ids.map((id) => ({
            idRegActuacion: id,
            llaveProceso: "llave-pbt",
            consActuacion: 1,
            fechaActuacion: "2024-06-15",
            actuacion: "Sentencia",
            anotacion: "Contenido arbitrario",
            fechaInicia: null,
            fechaFinaliza: null,
            fechaRegistro: "2024-06-15",
            existeDocs: false,
          }));

          const almacenadas: ActuacionAlmacenada[] = [];

          const resultado = diffActuaciones(procesoId, frescas, almacenadas);

          // Sin historial, todas las frescas son nuevas
          expect(resultado).toHaveLength(frescas.length);
          expect(resultado.map((a) => a.idRegActuacion)).toEqual(ids);
        }
      ),
      { numRuns: 100 }
    );
  });
});
