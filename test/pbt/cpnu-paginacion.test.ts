/**
 * Feature: lexai-mvp, Property 7: Paginación acotada y secuencial
 * (páginas desde 1, incrementales, min(K,100), agregando resultados)
 *
 * Validates: Requisitos R4.6
 *
 * Propiedades verificadas con fast-check (≥100 iteraciones):
 *  1. Las páginas solicitadas inician en 1 y se incrementan de 1 en 1.
 *  2. El máximo de páginas recuperadas es min(K, 100) donde K es el
 *     valor de `paginaMaxima` proporcionado por el usuario (default 100).
 *  3. Los resultados de todas las páginas se agregan en un único array.
 *
 *  Enfoque: Se mockea `fetch` para simular respuestas paginadas, registrando
 *  el parámetro `pagina` extraído de la URL de cada petición. Se generan
 *  valores aleatorios de `paginaMaxima` (1–200) y se verifica que el
 *  comportamiento respeta la cota min(K, 100) y la secuencialidad.
 *  Se usa vi.useFakeTimers() para evitar los delays del rate limiter.
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
 * Creates a mock fetch implementation that returns paginated responses.
 * Each page returns `registrosPorPagina` processes, with `cantFilas` set
 * to `totalRegistros` (used by the client to calculate totalPaginas).
 * Tracks page numbers requested in the URL.
 */
function crearFetchPaginado(
  totalRegistros: number,
  registrosPorPagina: number
) {
  const paginasSolicitadas: number[] = [];

  const impl = async (url: string | URL | Request) => {
    const urlStr = typeof url === "string" ? url : url.toString();
    const parsed = new URL(urlStr);
    const pagina = parseInt(parsed.searchParams.get("pagina") || "1", 10);
    paginasSolicitadas.push(pagina);

    // Generate processes for this page
    const procesos = Array.from({ length: registrosPorPagina }, (_, i) => ({
      idProceso: pagina * 100 + i,
      llaveProceso: `llave-${pagina}-${i}`,
      fechaProceso: null,
      fechaUltimaActuacion: "2024-01-15",
      despacho: `Juzgado ${pagina}`,
      departamento: "Cundinamarca",
      sujetosProcesales: "Demandante vs Demandado",
      esPrivado: false,
      cantFilas: totalRegistros,
    }));

    return {
      ok: true,
      json: async () => ({ procesos }),
    };
  };

  return { impl, paginasSolicitadas };
}

/**
 * Continuously advances fake timers until the given promise resolves.
 * This is necessary because the client's internal pagination loop awaits
 * the rate limiter (setTimeout) between pages, and those timers need to
 * fire for the promise to make progress.
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

  // Advance timers in small steps until the promise resolves
  while (!resuelto) {
    await vi.advanceTimersByTimeAsync(600);
  }

  if (error) throw error;
  return resultado!;
}

// ---------------------------------------------------------------------------
// Propiedad PBT
// ---------------------------------------------------------------------------

describe("PBT — Paginación acotada y secuencial del cliente CPNU (Property 7)", () => {
  it(
    "Property 7: Páginas inician en 1, incrementan de 1, máximo min(K,100), resultados agregados",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          // paginaMaxima: valor entre 1 y 200 (usuario puede pedir más de 100)
          fc.integer({ min: 1, max: 200 }),
          // totalPaginasDisponibles: cuántas páginas "existen" en la fuente (1–20)
          // Kept small to avoid excessive timer iterations per run
          fc.integer({ min: 1, max: 20 }),
          // registrosPorPagina: cuántos registros devuelve cada página (1–5 para simplicidad)
          fc.integer({ min: 1, max: 5 }),
          async (paginaMaxima, totalPaginasDisponibles, registrosPorPagina) => {
            // Reset
            fetchMock.mockReset();
            // Set time to 2025 so the radicado year (2023) is valid
            vi.setSystemTime(new Date("2025-06-01T12:00:00Z"));

            const totalRegistros = totalPaginasDisponibles * registrosPorPagina;
            const { impl, paginasSolicitadas } = crearFetchPaginado(
              totalRegistros,
              registrosPorPagina
            );
            fetchMock.mockImplementation(impl);

            // Create fresh client for each iteration (fresh rate limiter)
            const cliente = crearClienteCPNU();

            // Execute the paginated query and advance timers concurrently
            const resultado = await avanzarTimersHastaResolver(
              cliente.consultarPorRadicado(RADICADO_VALIDO, { paginaMaxima })
            );

            // The result should be ok (valid radicado, fetch succeeds)
            expect(resultado.ok).toBe(true);
            if (!resultado.ok) return;

            // --- Property 1: Pages start at 1 and increment by 1 ---
            expect(paginasSolicitadas.length).toBeGreaterThan(0);
            expect(paginasSolicitadas[0]).toBe(1);
            for (let i = 1; i < paginasSolicitadas.length; i++) {
              expect(paginasSolicitadas[i]).toBe(paginasSolicitadas[i - 1] + 1);
            }

            // --- Property 2: Maximum pages is min(K, 100) ---
            const maximoEsperado = Math.min(paginaMaxima, 100);
            // The actual pages fetched is also limited by available pages
            const paginasEsperadas = Math.min(
              maximoEsperado,
              totalPaginasDisponibles
            );
            expect(paginasSolicitadas.length).toBeLessThanOrEqual(
              maximoEsperado
            );
            expect(paginasSolicitadas.length).toBe(paginasEsperadas);

            // --- Property 3: Results from all pages are aggregated ---
            const totalProcesosEsperados =
              paginasEsperadas * registrosPorPagina;
            expect(resultado.value.procesos.length).toBe(
              totalProcesosEsperados
            );

            // Verify the processes come from each page in order
            for (let p = 0; p < paginasEsperadas; p++) {
              for (let r = 0; r < registrosPorPagina; r++) {
                const idx = p * registrosPorPagina + r;
                const proceso = resultado.value.procesos[idx];
                expect(proceso.idProceso).toBe((p + 1) * 100 + r);
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    },
    120_000
  );
});
