/**
 * Tests para transicion-vencido — Lógica de transición a Vencido
 *
 * Cuando un plazo tiene estado 'pendiente' y fecha_limite < hoyCO(),
 * se marca el plazo como 'vencido' y el proceso se mueve a columna 'vencido'.
 *
 * Requisitos: R12.5
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock de hoyCO y fechaCOaISO
vi.mock("@/lib/formato", () => ({
  hoyCO: vi.fn(),
  fechaCOaISO: vi.fn(),
}));

// Mock de Prisma
vi.mock("@/lib/db", () => ({
  prisma: {
    plazo: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
    proceso: {
      updateMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

import { marcarPlazosVencidos } from "./transicion-vencido";
import { hoyCO, fechaCOaISO } from "@/lib/formato";
import { prisma } from "@/lib/db";

const mockHoyCO = vi.mocked(hoyCO);
const mockFechaCOaISO = vi.mocked(fechaCOaISO);
const mockPlazoFindMany = vi.mocked(prisma.plazo.findMany);
const mockTransaction = vi.mocked(prisma.$transaction);

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("marcarPlazosVencidos", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Simular fecha actual: 2024-07-15 en Colombia
    mockHoyCO.mockReturnValue({
      date: new Date("2024-07-15T05:00:00Z"),
      anio: 2024,
      mes: 7,
      dia: 15,
      hora: 0,
      minuto: 0,
      segundo: 0,
      diaSemana: 1,
    });
    mockFechaCOaISO.mockReturnValue("2024-07-15");
  });

  it("no hace nada si no hay plazos vencidos", async () => {
    mockPlazoFindMany.mockResolvedValue([]);

    const resultado = await marcarPlazosVencidos("user-1");

    expect(resultado).toBe(0);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("marca plazos pendientes pasados como vencidos y mueve procesos (R12.5)", async () => {
    mockPlazoFindMany.mockResolvedValue([
      { id: "plazo-1", proceso_id: "proceso-1" },
      { id: "plazo-2", proceso_id: "proceso-1" },
      { id: "plazo-3", proceso_id: "proceso-2" },
    ] as never);
    mockTransaction.mockResolvedValue([
      { count: 3 },
      { count: 2 },
    ] as never);

    const resultado = await marcarPlazosVencidos("user-1");

    expect(resultado).toBe(3);
    expect(mockTransaction).toHaveBeenCalledTimes(1);

    // Verificar que se buscan plazos pendientes con fecha_limite < hoy
    expect(mockPlazoFindMany).toHaveBeenCalledWith({
      where: {
        estado: "pendiente",
        fecha_limite: { lt: new Date("2024-07-15") },
        indeterminado: false,
        proceso: { usuario_id: "user-1" },
      },
      select: { id: true, proceso_id: true },
    });
  });

  it("deduplica procesos afectados (un proceso con múltiples plazos vencidos)", async () => {
    // Dos plazos del mismo proceso
    mockPlazoFindMany.mockResolvedValue([
      { id: "plazo-1", proceso_id: "proceso-1" },
      { id: "plazo-2", proceso_id: "proceso-1" },
    ] as never);
    mockTransaction.mockResolvedValue([
      { count: 2 },
      { count: 1 },
    ] as never);

    const resultado = await marcarPlazosVencidos("user-1");

    expect(resultado).toBe(2);
    // La transacción debería mover solo 1 proceso único
    expect(mockTransaction).toHaveBeenCalledTimes(1);
  });

  it("funciona sin filtro de usuario si no se provee", async () => {
    mockPlazoFindMany.mockResolvedValue([
      { id: "plazo-1", proceso_id: "proceso-1" },
    ] as never);
    mockTransaction.mockResolvedValue([
      { count: 1 },
      { count: 1 },
    ] as never);

    await marcarPlazosVencidos();

    expect(mockPlazoFindMany).toHaveBeenCalledWith({
      where: {
        estado: "pendiente",
        fecha_limite: { lt: new Date("2024-07-15") },
        indeterminado: false,
      },
      select: { id: true, proceso_id: true },
    });
  });
});
