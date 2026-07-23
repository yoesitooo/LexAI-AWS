/**
 * Tests para verificación de conexión a PostgreSQL (health check)
 *
 * Nota: Estas pruebas usan mocks de Prisma porque no requieren
 * una base de datos real para validar la lógica del health check.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock del módulo de Prisma
vi.mock("@/lib/db", () => ({
  prisma: {
    $queryRaw: vi.fn(),
    $disconnect: vi.fn(),
  },
}));

import { checkDbHealth, disconnectDb } from "./db-health";
import { prisma } from "./db";

const mockPrisma = prisma as unknown as {
  $queryRaw: ReturnType<typeof vi.fn>;
  $disconnect: ReturnType<typeof vi.fn>;
};

describe("checkDbHealth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retorna healthy cuando la consulta SELECT 1 es exitosa", async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ ok: 1 }]);

    const result = await checkDbHealth();

    expect(result.status).toBe("healthy");
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(result.checkedAt).toBeDefined();
    expect(result.error).toBeUndefined();
  });

  it("retorna unhealthy cuando la consulta falla", async () => {
    mockPrisma.$queryRaw.mockRejectedValue(new Error("Connection refused"));

    const result = await checkDbHealth();

    expect(result.status).toBe("unhealthy");
    expect(result.error).toBe("Connection refused");
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("retorna unhealthy cuando la respuesta es inesperada (array vacío)", async () => {
    mockPrisma.$queryRaw.mockResolvedValue([]);

    const result = await checkDbHealth();

    expect(result.status).toBe("unhealthy");
    expect(result.error).toBe("Respuesta inesperada del health check");
  });

  it("retorna unhealthy cuando se excede el timeout", async () => {
    // Simula una consulta que tarda más que el timeout
    mockPrisma.$queryRaw.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve([{ ok: 1 }]), 200)),
    );

    const result = await checkDbHealth(50); // timeout de 50ms

    expect(result.status).toBe("unhealthy");
    expect(result.error).toBe("Health check timeout");
  });

  it("retorna unhealthy cuando el error no es una instancia de Error", async () => {
    mockPrisma.$queryRaw.mockRejectedValue("string error");

    const result = await checkDbHealth();

    expect(result.status).toBe("unhealthy");
    expect(result.error).toBe("Error desconocido");
  });

  it("incluye checkedAt como ISO string UTC en todos los casos", async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ ok: 1 }]);

    const result = await checkDbHealth();

    // Verificar que es un ISO string válido
    expect(new Date(result.checkedAt).toISOString()).toBe(result.checkedAt);
  });
});

describe("disconnectDb", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("llama a prisma.$disconnect", async () => {
    mockPrisma.$disconnect.mockResolvedValue(undefined);

    await disconnectDb();

    expect(mockPrisma.$disconnect).toHaveBeenCalledOnce();
  });
});
