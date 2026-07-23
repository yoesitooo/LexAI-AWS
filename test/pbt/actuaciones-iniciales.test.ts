/**
 * Feature: lexai-mvp, Property 10: Actuaciones históricas iniciales marcadas
 * como no nuevas (es_nueva=false; proceso con seguimiento activo y columna "Nuevo")
 *
 * Validates: Requisitos R5.3, R5.4
 *
 * Propiedades verificadas con fast-check (≥100 iteraciones):
 *  1. Para CUALQUIER registro válido con actuaciones históricas aleatorias,
 *     TODAS las actuaciones almacenadas tienen es_nueva = false.
 *  2. El proceso creado siempre tiene columna_kanban = "nuevo" y
 *     seguimiento_activo = true.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fc from "fast-check";
import { NextRequest } from "next/server";

// ─── Mocks ──────────────────────────────────────────────────────────────────

// Mock de auth
vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

// Mock de Prisma
vi.mock("@/lib/db", () => ({
  prisma: {
    proceso: {
      findUnique: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

// Mock del cliente CPNU
vi.mock("@/lib/cpnu-client", () => ({
  clienteCPNU: {
    consultarPorRadicado: vi.fn(),
    obtenerActuaciones: vi.fn(),
  },
}));

// Mock de validador-radicado — se usa internamente en la ruta
vi.mock("@/lib/validador-radicado", () => ({
  validarRadicado: vi.fn(),
}));

// Mock de transicion-vencido (importado en route.ts pero solo usado en GET)
vi.mock("@/lib/transicion-vencido", () => ({
  marcarPlazosVencidos: vi.fn(),
}));

import { POST } from "../../app/api/procesos/route";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { clienteCPNU } from "@/lib/cpnu-client";
import { validarRadicado } from "@/lib/validador-radicado";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TransactionFn = (tx: any) => Promise<any>;

// ─── Helpers ────────────────────────────────────────────────────────────────

function crearRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/procesos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ─── Generators (arbitrarios) ───────────────────────────────────────────────

/**
 * Genera un string de exactamente N dígitos aleatorios.
 */
function digitosArb(n: number): fc.Arbitrary<string> {
  return fc
    .array(fc.integer({ min: 0, max: 9 }), { minLength: n, maxLength: n })
    .map((arr) => arr.join(""));
}

/**
 * Genera un radicado válido de 23 dígitos con año en rango válido.
 */
function radicadoValidoArb(): fc.Arbitrary<string> {
  return fc
    .tuple(
      digitosArb(5), // DANE
      digitosArb(2), // entidad
      digitosArb(2), // especialidad
      digitosArb(3), // despacho
      fc.integer({ min: 1900, max: 2025 }), // año
      digitosArb(7), // consecutivo
    )
    .map(([dane, entidad, esp, despacho, anio, consec]) =>
      dane + entidad + esp + despacho + String(anio).padStart(4, "0") + consec
    );
}

/**
 * Genera una fecha ISO válida aleatoria para actuaciones (YYYY-MM-DD).
 */
function fechaIsoArb(): fc.Arbitrary<string> {
  return fc
    .tuple(
      fc.integer({ min: 2000, max: 2025 }),
      fc.integer({ min: 1, max: 12 }),
      fc.integer({ min: 1, max: 28 }), // usar max 28 para evitar días inválidos
    )
    .map(([y, m, d]) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
}

/**
 * Genera un texto aleatorio para actuaciones (no vacío).
 */
function textoActuacionArb(): fc.Arbitrary<string> {
  return fc
    .string({ minLength: 3, maxLength: 200, unit: "grapheme-ascii" })
    .filter((s) => s.trim().length >= 3);
}

/**
 * Genera una actuación CPNU aleatoria.
 */
function actuacionCPNUArb(): fc.Arbitrary<{
  idRegActuacion: number;
  llaveProceso: string;
  consActuacion: number;
  fechaActuacion: string;
  actuacion: string;
  anotacion: string;
  fechaInicia: string | null;
  fechaFinaliza: string | null;
  fechaRegistro: string;
  existeDocs: boolean;
}> {
  return fc.record({
    idRegActuacion: fc.integer({ min: 1, max: 999999 }),
    llaveProceso: fc.constant("llave-proceso-test"),
    consActuacion: fc.integer({ min: 1, max: 100 }),
    fechaActuacion: fechaIsoArb(),
    actuacion: textoActuacionArb(),
    anotacion: textoActuacionArb(),
    fechaInicia: fc.option(fechaIsoArb(), { nil: null }),
    fechaFinaliza: fc.option(fechaIsoArb(), { nil: null }),
    fechaRegistro: fechaIsoArb(),
    existeDocs: fc.boolean(),
  });
}

/**
 * Genera un array de actuaciones (1 a 20 elementos).
 */
function actuacionesArb() {
  return fc.array(actuacionCPNUArb(), { minLength: 1, maxLength: 20 });
}

// ─── Tests de propiedad ─────────────────────────────────────────────────────

describe("PBT — Actuaciones iniciales y estado del proceso (Property 10)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Property 10a: Para cualquier registro válido, TODAS las actuaciones importadas tienen es_nueva=false", async () => {
    await fc.assert(
      fc.asyncProperty(
        radicadoValidoArb(),
        actuacionesArb(),
        async (radicado, actuaciones) => {
          vi.clearAllMocks();

          // Mock auth: sesión válida
          vi.mocked(auth).mockResolvedValue({
            user: { id: "user-uuid-test", name: "Test", email: "test@test.com" },
            expires: "2025-12-31",
          } as never);

          // Mock validarRadicado: siempre válido
          vi.mocked(validarRadicado).mockReturnValue({
            ok: true,
            value: {
              raw: radicado,
              dane: radicado.slice(0, 5),
              entidad: radicado.slice(5, 7),
              especialidad: radicado.slice(7, 9),
              despacho: radicado.slice(9, 12),
              anio: parseInt(radicado.slice(12, 16), 10),
              consecutivo: radicado.slice(16, 23),
            },
          } as never);

          // Mock: proceso no existe (no duplicado)
          vi.mocked(prisma.proceso.findUnique).mockResolvedValue(null as never);

          // Mock: CPNU devuelve un proceso
          vi.mocked(clienteCPNU.consultarPorRadicado).mockResolvedValue({
            ok: true,
            value: {
              procesos: [
                {
                  idProceso: 12345,
                  llaveProceso: radicado,
                  fechaProceso: "2023-01-01",
                  fechaUltimaActuacion: "2024-06-01",
                  despacho: "Juzgado Test",
                  departamento: "Cundinamarca",
                  sujetosProcesales: "DEMANDANTE: A | DEMANDADO: B",
                  esPrivado: false,
                  cantFilas: 1,
                },
              ],
              paginacion: { pagina: 1, cantidadPaginas: 1, cantidadRegistros: 1 },
            },
          } as never);

          // Mock: CPNU devuelve las actuaciones generadas por fast-check
          vi.mocked(clienteCPNU.obtenerActuaciones).mockResolvedValue({
            ok: true,
            value: actuaciones,
          } as never);

          // Capturar las llamadas dentro de la transacción
          let actuacionesAlmacenadas: Array<{ es_nueva: boolean }> = [];

          vi.mocked(prisma.$transaction).mockImplementation(
            async (fn: TransactionFn) => {
              const mockCreateMany = vi.fn().mockImplementation(({ data }) => {
                actuacionesAlmacenadas = data;
                return Promise.resolve({ count: data.length });
              });

              const tx = {
                proceso: {
                  create: vi.fn().mockResolvedValue({
                    id: "nuevo-proceso-uuid",
                    usuario_id: "user-uuid-test",
                    radicado,
                    llave_proceso: radicado,
                    despacho: "Juzgado Test",
                    departamento: "Cundinamarca",
                    sujetos_procesales: "{}",
                    estado_cpnu: null,
                    columna_kanban: "nuevo",
                    seguimiento_activo: true,
                    creado_en: new Date(),
                  }),
                },
                actuacion: {
                  createMany: mockCreateMany,
                },
              };
              return fn(tx);
            },
          );

          const req = crearRequest({ radicado });
          const res = await POST(req);

          // Debe ser éxito
          expect(res.status).toBe(201);

          // PROPIEDAD: TODAS las actuaciones almacenadas tienen es_nueva = false
          expect(actuacionesAlmacenadas.length).toBe(actuaciones.length);
          for (const act of actuacionesAlmacenadas) {
            expect(act.es_nueva).toBe(false);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("Property 10b: Para cualquier registro válido, el proceso se crea con columna_kanban='nuevo' y seguimiento_activo=true", async () => {
    await fc.assert(
      fc.asyncProperty(
        radicadoValidoArb(),
        actuacionesArb(),
        async (radicado, actuaciones) => {
          vi.clearAllMocks();

          // Mock auth: sesión válida
          vi.mocked(auth).mockResolvedValue({
            user: { id: "user-uuid-test", name: "Test", email: "test@test.com" },
            expires: "2025-12-31",
          } as never);

          // Mock validarRadicado: siempre válido
          vi.mocked(validarRadicado).mockReturnValue({
            ok: true,
            value: {
              raw: radicado,
              dane: radicado.slice(0, 5),
              entidad: radicado.slice(5, 7),
              especialidad: radicado.slice(7, 9),
              despacho: radicado.slice(9, 12),
              anio: parseInt(radicado.slice(12, 16), 10),
              consecutivo: radicado.slice(16, 23),
            },
          } as never);

          // Mock: proceso no existe
          vi.mocked(prisma.proceso.findUnique).mockResolvedValue(null as never);

          // Mock: CPNU devuelve proceso
          vi.mocked(clienteCPNU.consultarPorRadicado).mockResolvedValue({
            ok: true,
            value: {
              procesos: [
                {
                  idProceso: 99999,
                  llaveProceso: radicado,
                  fechaProceso: "2023-06-15",
                  fechaUltimaActuacion: "2024-01-10",
                  despacho: "Juzgado Aleatorio",
                  departamento: "Antioquia",
                  sujetosProcesales: "DEMANDANTE: X | DEMANDADO: Y",
                  esPrivado: false,
                  cantFilas: 1,
                },
              ],
              paginacion: { pagina: 1, cantidadPaginas: 1, cantidadRegistros: 1 },
            },
          } as never);

          // Mock: CPNU devuelve actuaciones
          vi.mocked(clienteCPNU.obtenerActuaciones).mockResolvedValue({
            ok: true,
            value: actuaciones,
          } as never);

          // Capturar los datos con los que se crea el proceso
          let procesoData: { columna_kanban?: string; seguimiento_activo?: boolean } = {};

          vi.mocked(prisma.$transaction).mockImplementation(
            async (fn: TransactionFn) => {
              const mockCreate = vi.fn().mockImplementation(({ data }) => {
                procesoData = data;
                return Promise.resolve({
                  id: "nuevo-proceso-uuid",
                  usuario_id: data.usuario_id,
                  radicado: data.radicado,
                  llave_proceso: data.llave_proceso,
                  despacho: data.despacho,
                  departamento: data.departamento,
                  sujetos_procesales: data.sujetos_procesales,
                  estado_cpnu: data.estado_cpnu,
                  columna_kanban: data.columna_kanban,
                  seguimiento_activo: data.seguimiento_activo,
                  creado_en: new Date(),
                });
              });

              const tx = {
                proceso: {
                  create: mockCreate,
                },
                actuacion: {
                  createMany: vi.fn().mockResolvedValue({ count: actuaciones.length }),
                },
              };
              return fn(tx);
            },
          );

          const req = crearRequest({ radicado });
          const res = await POST(req);

          // Debe ser éxito
          expect(res.status).toBe(201);

          // PROPIEDAD: El proceso SIEMPRE se crea con columna_kanban = "nuevo"
          expect(procesoData.columna_kanban).toBe("nuevo");

          // PROPIEDAD: El proceso SIEMPRE se crea con seguimiento_activo = true
          expect(procesoData.seguimiento_activo).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });
});
