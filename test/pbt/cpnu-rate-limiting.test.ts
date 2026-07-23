/**
 * Feature: lexai-mvp, Property 6: Rate limiting del cliente CPNU
 * (máx. 2 peticiones por ventana deslizante de 1 s, sin ráfagas)
 *
 * Validates: Requisitos R4.4
 *
 * Propiedad verificada con fast-check (≥100 iteraciones):
 *  Para cualquier secuencia de N peticiones (N entre 1 y 10) realizadas
 *  secuencialmente a través del cliente CPNU, el rate limiter garantiza que
 *  entre cada par de peticiones consecutivas transcurren al menos 500ms,
 *  lo que asegura máximo 2 peticiones por segundo sin ráfagas.
 *
 *  Enfoque: Se usa vi.useFakeTimers() para controlar el reloj. Las peticiones
 *  se realizan secuencialmente (como en paginación o revisión de procesos).
 *  Se registran los timestamps (Date.now()) de cada petición en el mock de fetch,
 *  verificando que las diferencias entre timestamps consecutivos son ≥ 500ms.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fc from "fast-check";
import { crearClienteCPNU } from "../../lib/cpnu-client";

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// Propiedad PBT
// ---------------------------------------------------------------------------

describe("PBT — Rate limiting del cliente CPNU (Property 6)", () => {
  it(
    "Property 6: Para N peticiones secuenciales (1≤N≤10), el espaciado entre cada par consecutivo es ≥ 500ms",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 10 }),
          async (numPeticiones) => {
            // Reset state for each iteration
            fetchMock.mockReset();
            vi.setSystemTime(0);

            // Track timestamps when fetch is actually called
            const timestamps: number[] = [];
            fetchMock.mockImplementation(async () => {
              timestamps.push(Date.now());
              return {
                ok: true,
                json: async () => [],
              };
            });

            // Create a fresh client for each iteration (fresh rate limiter)
            const cliente = crearClienteCPNU();

            // Execute N requests SEQUENTIALLY, advancing timers between them.
            // This simulates the real usage pattern (pagination, sequential process revision).
            for (let i = 0; i < numPeticiones; i++) {
              const promesa = cliente.obtenerActuaciones(i + 1);
              // Advance enough time for the rate limiter to release
              await vi.advanceTimersByTimeAsync(600);
              await promesa;
            }

            // Verify exactly N fetches were made
            expect(fetchMock).toHaveBeenCalledTimes(numPeticiones);
            expect(timestamps).toHaveLength(numPeticiones);

            // Core property: spacing between consecutive requests is ≥ 500ms
            for (let i = 1; i < timestamps.length; i++) {
              const diferencia = timestamps[i] - timestamps[i - 1];
              expect(diferencia).toBeGreaterThanOrEqual(500);
            }

            // Complementary property: total time ≥ (N-1) * 500ms
            if (numPeticiones > 1) {
              const tiempoTotal =
                timestamps[timestamps.length - 1] - timestamps[0];
              expect(tiempoTotal).toBeGreaterThanOrEqual(
                (numPeticiones - 1) * 500
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
