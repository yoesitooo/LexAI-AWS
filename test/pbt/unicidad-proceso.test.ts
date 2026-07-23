/**
 * Feature: lexai-mvp, Property 11: Unicidad de proceso por usuario
 * (segundo registro del mismo radicado se rechaza y no aumenta el conteo)
 *
 * Validates: Requisitos R5.6
 *
 * Propiedades verificadas con fast-check (≥100 iteraciones):
 *  1. Para CUALQUIER radicado válido que ya existe para el usuario,
 *     POST /api/procesos devuelve 409 Conflict.
 *  2. Cuando se rechaza por duplicado, NO se crea un nuevo proceso
 *     (prisma.$transaction nunca es invocada).
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

// Mock de validador-radicado
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
import { validarRadicado } from "@/lib/validador-radicado";

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
 * Genera un radicado válido de 23 dígitos con año en rango [1900, año actual].
 */
function radicadoValidoArb(): fc.Arbitrary<string> {
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
    .map(([dane, entidad, esp, despacho, anio, consec]) =>
      dane + entidad + esp + despacho + String(anio).padStart(4, "0") + consec,
    );
}

// ─── Tests de propiedad ─────────────────────────────────────────────────────

describe("PBT — Unicidad de proceso por usuario (Property 11)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Property 11a: Para cualquier radicado ya existente para el usuario, POST devuelve 409", async () => {
    await fc.assert(
      fc.asyncProperty(radicadoValidoArb(), async (radicado) => {
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

        // Mock: proceso YA EXISTE para este usuario (duplicado)
        vi.mocked(prisma.proceso.findUnique).mockResolvedValue({
          id: "proceso-existente-uuid",
          usuario_id: "user-uuid-test",
          radicado,
          columna_kanban: "nuevo",
          seguimiento_activo: true,
          creado_en: new Date(),
        } as never);

        const req = crearRequest({ radicado });
        const res = await POST(req);

        // PROPIEDAD: la API rechaza con 409
        expect(res.status).toBe(409);

        const body = await res.json();
        expect(body.error).toBeDefined();
      }),
      { numRuns: 100 },
    );
  });

  it("Property 11b: Para cualquier radicado ya existente, NO se crea un nuevo proceso (la transacción no es invocada)", async () => {
    await fc.assert(
      fc.asyncProperty(radicadoValidoArb(), async (radicado) => {
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

        // Mock: proceso YA EXISTE
        vi.mocked(prisma.proceso.findUnique).mockResolvedValue({
          id: "proceso-existente-uuid",
          usuario_id: "user-uuid-test",
          radicado,
          columna_kanban: "en_seguimiento",
          seguimiento_activo: true,
          creado_en: new Date(),
        } as never);

        const req = crearRequest({ radicado });
        await POST(req);

        // PROPIEDAD: prisma.$transaction NUNCA se invoca (no se crea proceso)
        expect(prisma.$transaction).not.toHaveBeenCalled();
      }),
      { numRuns: 100 },
    );
  });
});
