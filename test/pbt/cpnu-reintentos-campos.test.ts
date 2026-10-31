/**
 * Feature: lexai-mvp, Property 8: Política de reintentos del cliente CPNU
 * (hasta 3 reintentos; agotados devuelve fallo sin excepción ni interrumpir otros)
 *
 * Feature: lexai-mvp, Property 9: Extracción de campos de la respuesta CPNU
 * (idProceso, llaveProceso, despacho, departamento, sujetosProcesales, fechaUltimaActuacion)
 *
 * Validates: Requisitos R4.7, R4.8, R6.7
 *
 * Propiedades verificadas con fast-check (≥100 iteraciones):
 *
 *  Property 8: Para cualquier secuencia de N fallos consecutivos (N de 1 a 5),
 *  el cliente CPNU:
 *    - Realiza exactamente min(N, 3) llamadas a fetch (reintenta hasta 3 veces)
 *    - Nunca lanza una excepción (siempre devuelve Result)
 *    - Devuelve FalloCPNU después de 3 fallos consecutivos
 *
 *  Property 9: Para cualquier respuesta válida con valores de campos arbitrarios,
 *  el ProcesoCPNU extraído contiene exactamente los campos esperados
 *  (idProceso, llaveProceso, despacho, departamento, sujetosProcesales, fechaUltimaActuacion)
 *
 *  Enfoque: Se usa vi.useFakeTimers() para el rate limiter. Se mockea fetch con
 *  diversos escenarios de fallo (errores HTTP, errores de red, timeouts).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fc from "fast-check";
import { crearClienteCPNU } from "../../lib/cpnu-client";

// ---------------------------------------------------------------------------
// Radicado válido para las pruebas (23 dígitos, año válido)
// ---------------------------------------------------------------------------
const RADICADO_VALIDO = "11001020300120230000001";

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers();
  // Set time to 2025 so the radicado year (2023) is valid
  vi.setSystemTime(new Date("2025-06-01T12:00:00Z"));
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Advances fake timers until the given promise resolves.
 * Necessary because the rate limiter uses setTimeout internally.
 */
async function avanzarTimersHastaResolver<T>(promesa: Promise<T>): Promise<T> {
  let resuelto = false;
  let resultado: T;
  let error: unknown;

  promesa
    .then((r) => {
      resultado = r;
      resuelto = true;
    })
    .catch((e) => {
      error = e;
      resuelto = true;
    });

  while (!resuelto) {
    await vi.advanceTimersByTimeAsync(600);
  }

  if (error) throw error;
  return resultado!;
}

/** Types of failures to simulate */
type TipoFallo = "http_error" | "network_error" | "timeout";

/** Arbitrary for failure types */
const tipoFalloArb: fc.Arbitrary<TipoFallo> = fc.constantFrom(
  "http_error",
  "network_error",
  "timeout"
);

/** Creates a fetch mock response for a given failure type */
function crearFallo(tipo: TipoFallo): () => Promise<never> | Promise<Response> {
  switch (tipo) {
    case "http_error":
      return async () =>
        ({
          ok: false,
          status: 500,
          statusText: "Internal Server Error",
          json: async () => ({}),
        }) as unknown as Response;
    case "network_error":
      return async () => {
        throw new Error("fetch failed: network error");
      };
    case "timeout":
      return async () => {
        throw new Error("The operation was aborted due to timeout");
      };
  }
}

// ---------------------------------------------------------------------------
// Property 8: Política de reintentos
// ---------------------------------------------------------------------------

describe("PBT — Política de reintentos del cliente CPNU (Property 8)", () => {
  it(
    "Property 8: Para N fallos consecutivos (1≤N≤5), realiza min(N,3) fetch calls, nunca lanza excepción, devuelve FalloCPNU tras 3 fallos",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          // N: number of consecutive failures before a potential success
          fc.integer({ min: 1, max: 5 }),
          // Type of failure to simulate
          tipoFalloArb,
          async (numFallos, tipoFallo) => {
            fetchMock.mockReset();

            let llamadasRealizadas = 0;

            fetchMock.mockImplementation(async () => {
              llamadasRealizadas++;
              if (llamadasRealizadas <= numFallos) {
                // Simulate the failure
                const falloFn = crearFallo(tipoFallo);
                return falloFn();
              }
              // Success after numFallos attempts (only reached if numFallos < 3)
              return {
                ok: true,
                json: async () => ({
                  procesos: [
                    {
                      idProceso: 12345,
                      llaveProceso: "llave-test",
                      fechaProceso: null,
                      fechaUltimaActuacion: "2024-01-15",
                      despacho: "Juzgado Test",
                      departamento: "Cundinamarca",
                      sujetosProcesales: "A vs B",
                      esPrivado: false,
                      cantFilas: 1,
                    },
                  ],
                }),
              };
            });

            const cliente = crearClienteCPNU();

            // Execute and ensure NO exception is thrown (always returns Result)
            let resultado: Awaited<ReturnType<typeof cliente.consultarPorRadicado>>;
            let lanzoExcepcion = false;
            try {
              resultado = await avanzarTimersHastaResolver(
                cliente.consultarPorRadicado(RADICADO_VALIDO)
              );
            } catch {
              lanzoExcepcion = true;
              resultado = undefined as never;
            }

            // Core property: NEVER throws an exception
            expect(lanzoExcepcion).toBe(false);

            // Core property: makes exactly min(N, 3) fetch calls
            const llamadasEsperadas = Math.min(numFallos, 3);
            if (numFallos >= 3) {
              // All retries exhausted — should have made exactly 3 calls
              expect(llamadasRealizadas).toBe(3);
              // Result is a failure
              expect(resultado.ok).toBe(false);
              if (!resultado.ok) {
                expect(resultado.error.tipo).not.toBe("radicado_invalido");
                expect(resultado.error.detalle).toBeTruthy();
              }
            } else {
              // Fewer failures than max retries — success on attempt numFallos+1
              // But the client still makes numFallos + 1 calls (failures + 1 success)
              // Wait — the client retries UP TO 3 times total. If numFallos < 3,
              // it retries numFallos times and succeeds on the (numFallos+1)th call.
              // Actually: fetchConReintentos starts with intentosRestantes=3.
              // On fail, if intentosRestantes > 1, it recurses with intentosRestantes-1.
              // So for N=1 failure: call 1 fails (intentos=3 > 1, retry) → call 2 succeeds = 2 calls
              // For N=2 failures: call 1 fails (3>1, retry) → call 2 fails (2>1, retry) → call 3 succeeds = 3 calls
              // For N=3 failures: call 1 fails (3>1) → call 2 fails (2>1) → call 3 fails (1 not > 1) → returns failure = 3 calls
              // For N=4,5 failures: same as N=3, only 3 calls made, returns failure
              expect(llamadasRealizadas).toBe(llamadasEsperadas + 1);
              expect(resultado.ok).toBe(true);
            }
          }
        ),
        { numRuns: 100 }
      );
    },
    60_000
  );

  it(
    "Property 8b: After exhausting 3 retries, the error does not propagate as exception (resilience for other processes — R6.7)",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          tipoFalloArb,
          // Simulate processing multiple "processes" sequentially
          fc.integer({ min: 2, max: 5 }),
          async (tipoFallo, numProcesos) => {
            fetchMock.mockReset();

            // Always fail — simulates a consistently unavailable source
            fetchMock.mockImplementation(crearFallo(tipoFallo));

            const cliente = crearClienteCPNU();
            const resultados: Array<{ ok: boolean }> = [];

            // Process multiple radicados sequentially (like the worker does)
            for (let i = 0; i < numProcesos; i++) {
              let excepcion = false;
              try {
                const res = await avanzarTimersHastaResolver(
                  cliente.consultarPorRadicado(RADICADO_VALIDO)
                );
                resultados.push(res);
              } catch {
                excepcion = true;
              }
              // No exception should ever be thrown
              expect(excepcion).toBe(false);
            }

            // All results should be failures, but the loop continued for all processes
            expect(resultados).toHaveLength(numProcesos);
            for (const res of resultados) {
              expect(res.ok).toBe(false);
            }
          }
        ),
        { numRuns: 100 }
      );
    },
    60_000
  );
});

// ---------------------------------------------------------------------------
// Property 9: Extracción de campos de la respuesta CPNU
// ---------------------------------------------------------------------------

describe("PBT — Extracción de campos de la respuesta CPNU (Property 9)", () => {
  it(
    "Property 9: Para cualquier respuesta válida con campos arbitrarios, el ProcesoCPNU extraído contiene exactamente los campos esperados",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate arbitrary field values for a CPNU process
          // cantFilas = 1 to ensure single-page response (avoids pagination triggering extra pages)
          fc.record({
            idProceso: fc.integer({ min: 1, max: 999999999 }),
            llaveProceso: fc.string({ minLength: 1, maxLength: 50 }),
            fechaProceso: fc.option(
              fc
                .date({ min: new Date("1900-01-01"), max: new Date("2100-12-31"), noInvalidDate: true })
                .map((d) => d.toISOString()),
              { nil: null }
            ),
            fechaUltimaActuacion: fc.option(
              fc
                .date({ min: new Date("1900-01-01"), max: new Date("2100-12-31"), noInvalidDate: true })
                .map((d) => d.toISOString()),
              { nil: null }
            ),
            despacho: fc.string({ minLength: 1, maxLength: 200 }),
            departamento: fc.string({ minLength: 1, maxLength: 100 }),
            sujetosProcesales: fc.string({ minLength: 1, maxLength: 500 }),
            esPrivado: fc.boolean(),
            cantFilas: fc.constant(1),
          }),
          async (procesoGenerado) => {
            fetchMock.mockReset();

            // Mock fetch to return a response with the generated process
            fetchMock.mockImplementation(async () => ({
              ok: true,
              json: async () => ({
                procesos: [procesoGenerado],
              }),
            }));

            const cliente = crearClienteCPNU();

            const resultado = await avanzarTimersHastaResolver(
              cliente.consultarPorRadicado(RADICADO_VALIDO)
            );

            // Should succeed
            expect(resultado.ok).toBe(true);
            if (!resultado.ok) return;

            const procesos = resultado.value.procesos;
            expect(procesos).toHaveLength(1);

            const proceso = procesos[0];

            // Core property: extracted fields match the response exactly
            // R4.8: idProceso, llaveProceso, despacho, departamento,
            // sujetosProcesales, fechaUltimaActuacion
            expect(proceso.idProceso).toBe(procesoGenerado.idProceso);
            expect(proceso.llaveProceso).toBe(procesoGenerado.llaveProceso);
            expect(proceso.despacho).toBe(procesoGenerado.despacho);
            expect(proceso.departamento).toBe(procesoGenerado.departamento);
            expect(proceso.sujetosProcesales).toBe(
              procesoGenerado.sujetosProcesales
            );
            expect(proceso.fechaUltimaActuacion).toBe(
              procesoGenerado.fechaUltimaActuacion
            );

            // Verify the required fields exist as properties
            const camposRequeridos = [
              "idProceso",
              "llaveProceso",
              "despacho",
              "departamento",
              "sujetosProcesales",
              "fechaUltimaActuacion",
            ] as const;

            for (const campo of camposRequeridos) {
              expect(proceso).toHaveProperty(campo);
            }
          }
        ),
        { numRuns: 100 }
      );
    },
    60_000
  );

  it(
    "Property 9b: Multiple processes in a response all have their fields correctly extracted",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate 1-5 processes with arbitrary field values
          fc.array(
            fc.record({
              idProceso: fc.integer({ min: 1, max: 999999999 }),
              llaveProceso: fc.string({ minLength: 1, maxLength: 50 }),
              fechaProceso: fc.option(
                fc
                  .date({ min: new Date("1900-01-01"), max: new Date("2100-12-31"), noInvalidDate: true })
                  .map((d) => d.toISOString()),
                { nil: null }
              ),
              fechaUltimaActuacion: fc.option(
                fc
                  .date({ min: new Date("1900-01-01"), max: new Date("2100-12-31"), noInvalidDate: true })
                  .map((d) => d.toISOString()),
                { nil: null }
              ),
              despacho: fc.string({ minLength: 1, maxLength: 200 }),
              departamento: fc.string({ minLength: 1, maxLength: 100 }),
              sujetosProcesales: fc.string({ minLength: 1, maxLength: 500 }),
              esPrivado: fc.boolean(),
              cantFilas: fc.nat({ max: 0 }), // cantFilas = 0 so only 1 page
            }),
            { minLength: 1, maxLength: 5 }
          ),
          async (procesosGenerados) => {
            fetchMock.mockReset();

            // Set cantFilas to the number of processes to force single page
            const procesosConCantFilas = procesosGenerados.map((p) => ({
              ...p,
              cantFilas: procesosGenerados.length,
            }));

            fetchMock.mockImplementation(async () => ({
              ok: true,
              json: async () => ({
                procesos: procesosConCantFilas,
              }),
            }));

            const cliente = crearClienteCPNU();

            const resultado = await avanzarTimersHastaResolver(
              cliente.consultarPorRadicado(RADICADO_VALIDO)
            );

            expect(resultado.ok).toBe(true);
            if (!resultado.ok) return;

            const procesos = resultado.value.procesos;
            expect(procesos).toHaveLength(procesosGenerados.length);

            // For each process, verify all required fields match
            for (let i = 0; i < procesos.length; i++) {
              const proceso = procesos[i];
              const original = procesosConCantFilas[i];

              expect(proceso.idProceso).toBe(original.idProceso);
              expect(proceso.llaveProceso).toBe(original.llaveProceso);
              expect(proceso.despacho).toBe(original.despacho);
              expect(proceso.departamento).toBe(original.departamento);
              expect(proceso.sujetosProcesales).toBe(
                original.sujetosProcesales
              );
              expect(proceso.fechaUltimaActuacion).toBe(
                original.fechaUltimaActuacion
              );
            }
          }
        ),
        { numRuns: 100 }
      );
    },
    60_000
  );
});
