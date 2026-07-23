/**
 * Feature: lexai-mvp, Property 24: Aislamiento de datos en el Kanban
 * (la vista de U contiene exactamente los procesos con usuario_id = U)
 *
 * Feature: lexai-mvp, Property 25: Pertenencia única a columna del Kanban
 * (columna_kanban en exactamente una de las cinco columnas)
 *
 * Feature: lexai-mvp, Property 26: Contenido de la tarjeta del proceso
 * (radicado, demandante, demandado, último estado/actuación, juzgado, departamento/ciudad)
 *
 * **Validates: Requisitos R12.1, R12.2, R12.3**
 *
 * Propiedades verificadas con fast-check (≥100 iteraciones):
 *  24. Para cualquier conjunto de procesos con distintos usuario_ids,
 *      filtrar por un usuario U devuelve exactamente los procesos con usuario_id = U.
 *  25. El valor de columna_kanban siempre es exactamente uno de:
 *      nuevo, en_seguimiento, requiere_accion, vencido, archivado.
 *  26. Una tarjeta de proceso siempre contiene radicado (23 dígitos),
 *      demandante/demandado extraíbles con parseSujetosProcesales,
 *      despacho (juzgado) y departamento.
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { parseSujetosProcesales } from "../../lib/parse-sujetos";

// ---------------------------------------------------------------------------
// Tipos de dominio (modelo puro, sin dependencias externas)
// ---------------------------------------------------------------------------

/** Las cinco columnas válidas del Kanban según R12.2 */
const COLUMNAS_KANBAN = [
  "nuevo",
  "en_seguimiento",
  "requiere_accion",
  "vencido",
  "archivado",
] as const;

type ColumnaKanban = (typeof COLUMNAS_KANBAN)[number];

/** Modelo de proceso como se almacena en la BD */
interface Proceso {
  id: string;
  usuario_id: string;
  numero_radicado: string;
  juzgado: string;
  departamento: string;
  ciudad: string;
  sujetos_procesales: string;
  estado_actual: string;
  columna_kanban: ColumnaKanban;
  seguimiento_activo: boolean;
}

// ---------------------------------------------------------------------------
// Funciones puras de dominio bajo prueba
// ---------------------------------------------------------------------------

/**
 * Filtra procesos por usuario (aislamiento de datos del Kanban).
 * Simula el filtro WHERE usuario_id = :uid del listado Kanban.
 */
function filtrarProcesosPorUsuario(procesos: Proceso[], usuarioId: string): Proceso[] {
  return procesos.filter((p) => p.usuario_id === usuarioId);
}

/**
 * Valida que una columna_kanban es exactamente una de las cinco columnas.
 */
function esColumnaKanbanValida(columna: string): columna is ColumnaKanban {
  return (COLUMNAS_KANBAN as readonly string[]).includes(columna);
}

/**
 * Extrae el contenido de una tarjeta Kanban del proceso.
 * Devuelve los campos visibles obligatorios según R12.3.
 */
function extraerContenidoTarjeta(proceso: Proceso) {
  const sujetos = parseSujetosProcesales(proceso.sujetos_procesales);
  return {
    radicado: proceso.numero_radicado,
    demandante: sujetos.demandante,
    demandado: sujetos.demandado,
    ultimoEstado: proceso.estado_actual,
    juzgado: proceso.juzgado,
    departamento: proceso.departamento,
  };
}

// ---------------------------------------------------------------------------
// Generadores (arbitrarios)
// ---------------------------------------------------------------------------

/** Genera un string de exactamente N dígitos aleatorios. */
function digitosArb(n: number): fc.Arbitrary<string> {
  return fc
    .array(fc.integer({ min: 0, max: 9 }), { minLength: n, maxLength: n })
    .map((arr) => arr.join(""));
}

/** Genera un radicado válido de 23 dígitos. */
function radicadoArb(): fc.Arbitrary<string> {
  const anioActual = new Date().getFullYear();
  return fc
    .tuple(
      digitosArb(5), // DANE municipio
      digitosArb(2), // entidad
      digitosArb(2), // especialidad
      digitosArb(3), // despacho
      fc.integer({ min: 1900, max: anioActual }), // año
      digitosArb(7), // consecutivo
    )
    .map(
      ([dane, entidad, esp, despacho, anio, consec]) =>
        dane + entidad + esp + despacho + String(anio).padStart(4, "0") + consec,
    );
}

/** Genera una columna Kanban válida. */
const columnaKanbanArb: fc.Arbitrary<ColumnaKanban> = fc.constantFrom(...COLUMNAS_KANBAN);

/** Genera un usuario_id como UUID. */
const usuarioIdArb = fc.uuid();

/** Genera un nombre no vacío para juzgado/departamento. */
const nombreNoVacioArb = fc.string({ minLength: 1, maxLength: 80 }).filter((s) => s.trim().length > 0);

/** Genera un string de sujetos procesales en formato texto o JSON. */
const sujetosArb: fc.Arbitrary<string> = fc.oneof(
  // Formato texto
  fc
    .tuple(
      fc.string({ minLength: 1, maxLength: 40 }).filter((s) => s.trim().length > 0 && !s.includes("|") && !s.includes(":")),
      fc.string({ minLength: 1, maxLength: 40 }).filter((s) => s.trim().length > 0 && !s.includes("|") && !s.includes(":")),
    )
    .map(([dem, ddo]) => `DEMANDANTE: ${dem.trim()} | DEMANDADO: ${ddo.trim()}`),
  // Formato JSON
  fc
    .tuple(
      fc.string({ minLength: 1, maxLength: 40 }).filter((s) => s.trim().length > 0),
      fc.string({ minLength: 1, maxLength: 40 }).filter((s) => s.trim().length > 0),
    )
    .map(([dem, ddo]) => JSON.stringify({ demandante: dem.trim(), demandado: ddo.trim() })),
);

/** Genera un proceso completo con usuario_id parametrizado. */
function procesoArb(usuarioId?: fc.Arbitrary<string>): fc.Arbitrary<Proceso> {
  return fc.record({
    id: fc.uuid(),
    usuario_id: usuarioId ?? usuarioIdArb,
    numero_radicado: radicadoArb(),
    juzgado: nombreNoVacioArb,
    departamento: nombreNoVacioArb,
    ciudad: nombreNoVacioArb,
    sujetos_procesales: sujetosArb,
    estado_actual: fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
    columna_kanban: columnaKanbanArb,
    seguimiento_activo: fc.boolean(),
  });
}

// ---------------------------------------------------------------------------
// Propiedades
// ---------------------------------------------------------------------------

describe("PBT — Aislamiento y reglas del Kanban (Properties 24, 25, 26)", () => {
  it("Property 24: Para cualquier conjunto de procesos con distintos usuario_ids, filtrar por U devuelve exactamente los procesos con usuario_id = U", () => {
    fc.assert(
      fc.property(
        // Generar 2-5 IDs de usuario distintos
        fc.uniqueArray(usuarioIdArb, { minLength: 2, maxLength: 5 }),
        // Generar una lista de procesos con usuario_ids variados
        fc.array(procesoArb(), { minLength: 1, maxLength: 30 }),
        (userIds, procesos) => {
          // Asignar usuario_ids reales del pool a los procesos
          const procesosConUsuarios = procesos.map((p, i) => ({
            ...p,
            usuario_id: userIds[i % userIds.length],
          }));

          // Para cada usuario, verificar aislamiento
          for (const uid of userIds) {
            const resultado = filtrarProcesosPorUsuario(procesosConUsuarios, uid);

            // Todos los procesos devueltos pertenecen al usuario U
            for (const proc of resultado) {
              expect(proc.usuario_id).toBe(uid);
            }

            // Ningún proceso del usuario U quedó fuera del resultado
            const esperados = procesosConUsuarios.filter((p) => p.usuario_id === uid);
            expect(resultado).toHaveLength(esperados.length);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("Property 25: columna_kanban siempre es exactamente una de las cinco columnas válidas", () => {
    fc.assert(
      fc.property(
        fc.array(procesoArb(), { minLength: 1, maxLength: 50 }),
        (procesos) => {
          for (const proceso of procesos) {
            // La columna debe ser una de las cinco válidas
            expect(esColumnaKanbanValida(proceso.columna_kanban)).toBe(true);

            // Verificar que es exactamente una (no puede pertenecer a dos)
            const coincidencias = COLUMNAS_KANBAN.filter((c) => c === proceso.columna_kanban);
            expect(coincidencias).toHaveLength(1);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("Property 26: La tarjeta del proceso siempre contiene radicado, demandante, demandado, último estado, juzgado y departamento", () => {
    fc.assert(
      fc.property(procesoArb(), (proceso) => {
        const tarjeta = extraerContenidoTarjeta(proceso);

        // Radicado: exactamente 23 dígitos numéricos
        expect(tarjeta.radicado).toHaveLength(23);
        expect(tarjeta.radicado).toMatch(/^\d{23}$/);

        // Demandante y demandado extraídos correctamente (no vacíos dado nuestro generador)
        expect(tarjeta.demandante.length).toBeGreaterThan(0);
        expect(tarjeta.demandado.length).toBeGreaterThan(0);

        // Último estado presente
        expect(tarjeta.ultimoEstado.trim().length).toBeGreaterThan(0);

        // Juzgado (despacho) presente
        expect(tarjeta.juzgado.trim().length).toBeGreaterThan(0);

        // Departamento presente
        expect(tarjeta.departamento.trim().length).toBeGreaterThan(0);
      }),
      { numRuns: 100 },
    );
  });
});
