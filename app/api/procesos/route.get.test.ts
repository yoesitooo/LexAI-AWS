/**
 * Tests para GET /api/procesos — Listado Kanban de procesos
 *
 * Requisitos: R12.1, R12.2
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "./route";

// Mock de auth
vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

// Mock de Prisma
vi.mock("@/lib/db", () => ({
  prisma: {
    proceso: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    actuacion: {
      createMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

// Mock del cliente CPNU (needed because route.ts imports it)
vi.mock("@/lib/cpnu-client", () => ({
  clienteCPNU: {
    consultarPorRadicado: vi.fn(),
    obtenerActuaciones: vi.fn(),
  },
}));

// Mock de transicion-vencido
vi.mock("@/lib/transicion-vencido", () => ({
  marcarPlazosVencidos: vi.fn().mockResolvedValue(0),
}));

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { marcarPlazosVencidos } from "@/lib/transicion-vencido";

const mockAuth = vi.mocked(auth);
const mockFindMany = vi.mocked(prisma.proceso.findMany);
const mockMarcarPlazosVencidos = vi.mocked(marcarPlazosVencidos);

// ─── Helpers ────────────────────────────────────────────────────────────────

const USUARIO_ID = "user-uuid-123";

const SESSION_VALIDA = {
  user: { id: USUARIO_ID, name: "Abogado Test", email: "abogado@test.com" },
  expires: "2025-12-31",
};

const PROCESOS_MOCK = [
  {
    id: "p1",
    radicado: "11001400300320230001200",
    despacho: "Juzgado 3 Civil",
    departamento: "Cundinamarca",
    ciudad: null,
    tipo_proceso: null,
    sujetos_procesales: "DEMANDANTE: Juan | DEMANDADO: María",
    estado_cpnu: "En trámite",
    columna_kanban: "nuevo",
    seguimiento_activo: true,
    creado_en: new Date("2024-01-01"),
    actualizado_en: new Date("2024-06-01"),
    actuaciones: [
      { actuacion: "Auto admisorio", fecha_actuacion: new Date("2024-06-01") },
    ],
  },
  {
    id: "p2",
    radicado: "11001400300320220005600",
    despacho: "Juzgado 5 Civil",
    departamento: "Antioquia",
    ciudad: "Medellín",
    tipo_proceso: "Civil",
    sujetos_procesales: "DEMANDANTE: Pedro | DEMANDADO: Ana",
    estado_cpnu: "En trámite",
    columna_kanban: "en_seguimiento",
    seguimiento_activo: true,
    creado_en: new Date("2024-02-01"),
    actualizado_en: new Date("2024-05-01"),
    actuaciones: [
      { actuacion: "Sentencia", fecha_actuacion: new Date("2024-05-01") },
    ],
  },
  {
    id: "p3",
    radicado: "11001400300320210003400",
    despacho: "Juzgado 1 Laboral",
    departamento: "Valle del Cauca",
    ciudad: "Cali",
    tipo_proceso: "Laboral",
    sujetos_procesales: "DEMANDANTE: Luis | DEMANDADO: Empresa S.A.",
    estado_cpnu: "Terminado",
    columna_kanban: "vencido",
    seguimiento_activo: true,
    creado_en: new Date("2024-03-01"),
    actualizado_en: new Date("2024-04-01"),
    actuaciones: [],
  },
];

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("GET /api/procesos", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("devuelve 401 si no hay sesión", async () => {
    mockAuth.mockResolvedValue(null as never);

    const res = await GET();
    const data = await res.json();

    expect(res.status).toBe(401);
    expect(data.error).toContain("No autenticado");
  });

  it("devuelve procesos agrupados por columna_kanban (R12.1, R12.2)", async () => {
    mockAuth.mockResolvedValue(SESSION_VALIDA as never);
    mockFindMany.mockResolvedValue(PROCESOS_MOCK as never);

    const res = await GET();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.kanban).toBeDefined();
    // Verificar las cinco columnas existen
    expect(Object.keys(data.kanban)).toEqual(
      expect.arrayContaining(["nuevo", "en_seguimiento", "requiere_accion", "vencido", "archivado"]),
    );
    // Verificar que los procesos están en la columna correcta
    expect(data.kanban.nuevo).toHaveLength(1);
    expect(data.kanban.nuevo[0].id).toBe("p1");
    expect(data.kanban.en_seguimiento).toHaveLength(1);
    expect(data.kanban.en_seguimiento[0].id).toBe("p2");
    expect(data.kanban.vencido).toHaveLength(1);
    expect(data.kanban.vencido[0].id).toBe("p3");
    expect(data.kanban.requiere_accion).toHaveLength(0);
    expect(data.kanban.archivado).toHaveLength(0);
  });

  it("filtra por usuario_id de la sesión (R12.1)", async () => {
    mockAuth.mockResolvedValue(SESSION_VALIDA as never);
    mockFindMany.mockResolvedValue([]);

    await GET();

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { usuario_id: USUARIO_ID },
      }),
    );
  });

  it("devuelve todas las columnas vacías si no hay procesos (R12.6)", async () => {
    mockAuth.mockResolvedValue(SESSION_VALIDA as never);
    mockFindMany.mockResolvedValue([]);

    const res = await GET();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.kanban.nuevo).toHaveLength(0);
    expect(data.kanban.en_seguimiento).toHaveLength(0);
    expect(data.kanban.requiere_accion).toHaveLength(0);
    expect(data.kanban.vencido).toHaveLength(0);
    expect(data.kanban.archivado).toHaveLength(0);
  });

  it("llama a marcarPlazosVencidos antes de consultar (R12.5)", async () => {
    mockAuth.mockResolvedValue(SESSION_VALIDA as never);
    mockFindMany.mockResolvedValue([]);

    await GET();

    expect(mockMarcarPlazosVencidos).toHaveBeenCalledWith(USUARIO_ID);
    // Se llama antes de findMany
    expect(mockMarcarPlazosVencidos.mock.invocationCallOrder[0]).toBeLessThan(
      mockFindMany.mock.invocationCallOrder[0],
    );
  });

  it("incluye la última actuación de cada proceso", async () => {
    mockAuth.mockResolvedValue(SESSION_VALIDA as never);
    mockFindMany.mockResolvedValue(PROCESOS_MOCK as never);

    const res = await GET();
    const data = await res.json();

    // El primer proceso tiene actuaciones
    const procesoNuevo = data.kanban.nuevo[0];
    expect(procesoNuevo.actuaciones).toHaveLength(1);
    expect(procesoNuevo.actuaciones[0].actuacion).toBe("Auto admisorio");
  });

  it("devuelve 500 ante error inesperado", async () => {
    mockAuth.mockResolvedValue(SESSION_VALIDA as never);
    mockFindMany.mockRejectedValue(new Error("DB crash"));

    const res = await GET();
    const data = await res.json();

    expect(res.status).toBe(500);
    expect(data.error).toContain("Error interno");
  });
});
