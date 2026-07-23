/**
 * Tests para GET/PATCH /api/procesos/[id] — Detalle y movimiento de columna
 *
 * Requisitos: R12.2, R12.4, R12.5
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET, PATCH } from "./route";

// Mock de auth
vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

// Mock de Prisma
vi.mock("@/lib/db", () => ({
  prisma: {
    proceso: {
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    plazo: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
    $transaction: vi.fn(),
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
const mockFindFirst = vi.mocked(prisma.proceso.findFirst);
const mockUpdate = vi.mocked(prisma.proceso.update);
const mockMarcarPlazosVencidos = vi.mocked(marcarPlazosVencidos);

// ─── Helpers ────────────────────────────────────────────────────────────────

const USUARIO_ID = "user-uuid-123";
const PROCESO_ID = "proceso-uuid-456";

const SESSION_VALIDA = {
  user: { id: USUARIO_ID, name: "Abogado Test", email: "abogado@test.com" },
  expires: "2025-12-31",
};

const PROCESO_COMPLETO = {
  id: PROCESO_ID,
  usuario_id: USUARIO_ID,
  radicado: "11001400300320230001200",
  llave_proceso: "11001400300320230001200",
  despacho: "Juzgado 3 Civil Municipal de Bogotá",
  departamento: "Cundinamarca",
  ciudad: null,
  tipo_proceso: null,
  sujetos_procesales: "DEMANDANTE: Juan Pérez | DEMANDADO: María López",
  estado_cpnu: "2024-06-01",
  columna_kanban: "en_seguimiento",
  seguimiento_activo: true,
  creado_en: new Date("2024-01-01"),
  actualizado_en: new Date("2024-06-01"),
  actuaciones: [
    {
      id: "act-1",
      id_actuacion_cpnu: "100",
      consecutivo: 2,
      fecha_actuacion: new Date("2024-06-01"),
      actuacion: "Auto de trámite",
      anotacion: "Se ordena correr traslado",
      fecha_inicia: null,
      fecha_finaliza: null,
      fecha_registro: new Date("2024-06-01"),
      existe_docs: false,
      es_nueva: false,
      analisis_completado: true,
      creado_en: new Date("2024-06-01"),
    },
    {
      id: "act-2",
      id_actuacion_cpnu: "99",
      consecutivo: 1,
      fecha_actuacion: new Date("2024-01-15"),
      actuacion: "Auto admisorio de demanda",
      anotacion: null,
      fecha_inicia: null,
      fecha_finaliza: null,
      fecha_registro: new Date("2024-01-15"),
      existe_docs: true,
      es_nueva: false,
      analisis_completado: true,
      creado_en: new Date("2024-01-15"),
    },
  ],
  plazos: [
    {
      id: "plazo-1",
      dias: 10,
      es_habil: true,
      fecha_inicio: new Date("2024-06-01"),
      fecha_limite: new Date("2024-06-15"),
      estado: "pendiente",
      indeterminado: false,
      creado_en: new Date("2024-06-01"),
    },
  ],
};

function crearGetRequest(id: string): NextRequest {
  return new NextRequest(`http://localhost:3000/api/procesos/${id}`, {
    method: "GET",
  });
}

function crearPatchRequest(id: string, body: unknown): NextRequest {
  return new NextRequest(`http://localhost:3000/api/procesos/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function crearParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

// ─── Tests GET /api/procesos/[id] ───────────────────────────────────────────

describe("GET /api/procesos/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("devuelve 401 si no hay sesión", async () => {
    mockAuth.mockResolvedValue(null as never);

    const req = crearGetRequest(PROCESO_ID);
    const res = await GET(req, crearParams(PROCESO_ID));
    const data = await res.json();

    expect(res.status).toBe(401);
    expect(data.error).toContain("No autenticado");
  });

  it("devuelve 404 si el proceso no existe", async () => {
    mockAuth.mockResolvedValue(SESSION_VALIDA as never);
    mockFindFirst.mockResolvedValue(null as never);

    const req = crearGetRequest("non-existent-id");
    const res = await GET(req, crearParams("non-existent-id"));
    const data = await res.json();

    expect(res.status).toBe(404);
    expect(data.error).toContain("no encontrado");
  });

  it("devuelve 404 si el proceso pertenece a otro usuario", async () => {
    mockAuth.mockResolvedValue(SESSION_VALIDA as never);
    // findFirst with where usuario_id will not find it
    mockFindFirst.mockResolvedValue(null as never);

    const req = crearGetRequest(PROCESO_ID);
    const res = await GET(req, crearParams(PROCESO_ID));
    const data = await res.json();

    expect(res.status).toBe(404);
    expect(data.error).toContain("no encontrado");
    // Verifica que la consulta incluye el filtro de usuario
    expect(mockFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: PROCESO_ID, usuario_id: USUARIO_ID },
      }),
    );
  });

  it("devuelve proceso con actuaciones desc y plazos activos (R12.4)", async () => {
    mockAuth.mockResolvedValue(SESSION_VALIDA as never);
    mockFindFirst.mockResolvedValue(PROCESO_COMPLETO as never);

    const req = crearGetRequest(PROCESO_ID);
    const res = await GET(req, crearParams(PROCESO_ID));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.proceso.id).toBe(PROCESO_ID);
    expect(data.proceso.radicado).toBe("11001400300320230001200");
    expect(data.proceso.actuaciones).toHaveLength(2);
    // Actuaciones están ordenadas de más reciente a más antigua
    expect(data.proceso.actuaciones[0].actuacion).toBe("Auto de trámite");
    expect(data.proceso.actuaciones[1].actuacion).toBe("Auto admisorio de demanda");
    // Plazos activos (pendientes)
    expect(data.proceso.plazos).toHaveLength(1);
    expect(data.proceso.plazos[0].estado).toBe("pendiente");
  });

  it("llama a marcarPlazosVencidos antes de consultar (R12.5)", async () => {
    mockAuth.mockResolvedValue(SESSION_VALIDA as never);
    mockFindFirst.mockResolvedValue(PROCESO_COMPLETO as never);

    const req = crearGetRequest(PROCESO_ID);
    await GET(req, crearParams(PROCESO_ID));

    expect(mockMarcarPlazosVencidos).toHaveBeenCalledWith(USUARIO_ID);
  });

  it("devuelve 500 ante error inesperado", async () => {
    mockAuth.mockResolvedValue(SESSION_VALIDA as never);
    mockFindFirst.mockRejectedValue(new Error("DB connection lost"));

    const req = crearGetRequest(PROCESO_ID);
    const res = await GET(req, crearParams(PROCESO_ID));
    const data = await res.json();

    expect(res.status).toBe(500);
    expect(data.error).toContain("Error interno");
  });
});

// ─── Tests PATCH /api/procesos/[id] ─────────────────────────────────────────

describe("PATCH /api/procesos/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("devuelve 401 si no hay sesión", async () => {
    mockAuth.mockResolvedValue(null as never);

    const req = crearPatchRequest(PROCESO_ID, { columna_kanban: "archivado" });
    const res = await PATCH(req, crearParams(PROCESO_ID));
    const data = await res.json();

    expect(res.status).toBe(401);
    expect(data.error).toContain("No autenticado");
  });

  it("devuelve 400 si no se envía columna_kanban", async () => {
    mockAuth.mockResolvedValue(SESSION_VALIDA as never);

    const req = crearPatchRequest(PROCESO_ID, {});
    const res = await PATCH(req, crearParams(PROCESO_ID));
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toContain("columna_kanban");
  });

  it("devuelve 400 si la columna es inválida", async () => {
    mockAuth.mockResolvedValue(SESSION_VALIDA as never);

    const req = crearPatchRequest(PROCESO_ID, { columna_kanban: "invalida" });
    const res = await PATCH(req, crearParams(PROCESO_ID));
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toContain("Columna inválida");
    expect(data.columnas_validas).toContain("nuevo");
    expect(data.columnas_validas).toContain("archivado");
  });

  it("devuelve 404 si el proceso no existe o no es del usuario", async () => {
    mockAuth.mockResolvedValue(SESSION_VALIDA as never);
    mockFindFirst.mockResolvedValue(null as never);

    const req = crearPatchRequest(PROCESO_ID, { columna_kanban: "archivado" });
    const res = await PATCH(req, crearParams(PROCESO_ID));
    const data = await res.json();

    expect(res.status).toBe(404);
    expect(data.error).toContain("no encontrado");
  });

  it("actualiza la columna correctamente (R12.2)", async () => {
    mockAuth.mockResolvedValue(SESSION_VALIDA as never);
    mockFindFirst.mockResolvedValue({
      id: PROCESO_ID,
      columna_kanban: "nuevo",
    } as never);
    mockUpdate.mockResolvedValue({
      id: PROCESO_ID,
      radicado: "11001400300320230001200",
      columna_kanban: "en_seguimiento",
      actualizado_en: new Date(),
    } as never);

    const req = crearPatchRequest(PROCESO_ID, { columna_kanban: "en_seguimiento" });
    const res = await PATCH(req, crearParams(PROCESO_ID));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.mensaje).toContain("actualizada");
    expect(data.proceso.columna_kanban).toBe("en_seguimiento");
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: PROCESO_ID },
      data: { columna_kanban: "en_seguimiento" },
      select: expect.any(Object),
    });
  });

  it("permite mover a la columna vencido", async () => {
    mockAuth.mockResolvedValue(SESSION_VALIDA as never);
    mockFindFirst.mockResolvedValue({
      id: PROCESO_ID,
      columna_kanban: "requiere_accion",
    } as never);
    mockUpdate.mockResolvedValue({
      id: PROCESO_ID,
      radicado: "11001400300320230001200",
      columna_kanban: "vencido",
      actualizado_en: new Date(),
    } as never);

    const req = crearPatchRequest(PROCESO_ID, { columna_kanban: "vencido" });
    const res = await PATCH(req, crearParams(PROCESO_ID));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.proceso.columna_kanban).toBe("vencido");
  });

  it("permite mover a la columna archivado", async () => {
    mockAuth.mockResolvedValue(SESSION_VALIDA as never);
    mockFindFirst.mockResolvedValue({
      id: PROCESO_ID,
      columna_kanban: "vencido",
    } as never);
    mockUpdate.mockResolvedValue({
      id: PROCESO_ID,
      radicado: "11001400300320230001200",
      columna_kanban: "archivado",
      actualizado_en: new Date(),
    } as never);

    const req = crearPatchRequest(PROCESO_ID, { columna_kanban: "archivado" });
    const res = await PATCH(req, crearParams(PROCESO_ID));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.proceso.columna_kanban).toBe("archivado");
  });

  it("devuelve 400 si el body no es JSON válido", async () => {
    mockAuth.mockResolvedValue(SESSION_VALIDA as never);

    const req = new NextRequest(`http://localhost:3000/api/procesos/${PROCESO_ID}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: "not json{{{",
    });
    const res = await PATCH(req, crearParams(PROCESO_ID));

    expect(res.status).toBe(400);
  });

  it("devuelve 500 ante error inesperado", async () => {
    mockAuth.mockResolvedValue(SESSION_VALIDA as never);
    mockFindFirst.mockRejectedValue(new Error("Connection reset"));

    const req = crearPatchRequest(PROCESO_ID, { columna_kanban: "archivado" });
    const res = await PATCH(req, crearParams(PROCESO_ID));
    const data = await res.json();

    expect(res.status).toBe(500);
    expect(data.error).toContain("Error interno");
  });
});
