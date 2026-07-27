/**
 * Tests para POST /api/procesos — Registro de proceso judicial
 *
 * Requisitos: R5.1, R5.2, R5.3, R5.4, R5.5, R5.6, R5.7
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";

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
    actuacion: {
      createMany: vi.fn(),
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

// Mock de la sincronización de documentos (se invoca tras crear el proceso)
vi.mock("@/lib/descarga-documentos", () => ({
  sincronizarDocumentosProceso: vi.fn(),
}));

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { clienteCPNU } from "@/lib/cpnu-client";
import { sincronizarDocumentosProceso } from "@/lib/descarga-documentos";

const mockAuth = vi.mocked(auth);
const mockFindUnique = vi.mocked(prisma.proceso.findUnique);
const mockTransaction = vi.mocked(prisma.$transaction);
const mockConsultarPorRadicado = vi.mocked(clienteCPNU.consultarPorRadicado);
const mockObtenerActuaciones = vi.mocked(clienteCPNU.obtenerActuaciones);
const mockSincronizarDocumentos = vi.mocked(sincronizarDocumentosProceso);

// ─── Helpers ────────────────────────────────────────────────────────────────

const RADICADO_VALIDO = "11001400300320230001200";
const USUARIO_ID = "user-uuid-123";

const SESSION_VALIDA = {
  user: { id: USUARIO_ID, name: "Abogado Test", email: "abogado@test.com" },
  expires: "2025-12-31",
};

const PROCESO_CPNU = {
  idProceso: 12345,
  llaveProceso: "11001400300320230001200",
  fechaProceso: "2023-01-15",
  fechaUltimaActuacion: "2024-06-01",
  despacho: "Juzgado 3 Civil Municipal de Bogotá",
  departamento: "Cundinamarca",
  sujetosProcesales: "DEMANDANTE: Juan Pérez | DEMANDADO: María López",
  esPrivado: false,
  cantFilas: 1,
};

const ACTUACIONES_CPNU = [
  {
    idRegActuacion: 100,
    llaveProceso: "11001400300320230001200",
    consActuacion: 1,
    fechaActuacion: "2023-02-01",
    actuacion: "Auto admisorio de demanda",
    anotacion: "Se admite la demanda presentada",
    fechaInicia: null,
    fechaFinaliza: null,
    fechaRegistro: "2023-02-01",
    existeDocs: true,
  },
  {
    idRegActuacion: 101,
    llaveProceso: "11001400300320230001200",
    consActuacion: 2,
    fechaActuacion: "2023-03-15",
    actuacion: "Notificación personal",
    anotacion: "Se notifica al demandado",
    fechaInicia: "2023-03-16",
    fechaFinaliza: "2023-03-30",
    fechaRegistro: "2023-03-15",
    existeDocs: false,
  },
];

function crearPostRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/procesos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("POST /api/procesos", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSincronizarDocumentos.mockResolvedValue({
      procesoId: "new-process-uuid",
      descargados: 0,
      yaExistian: 0,
      fallidos: 0,
    });
  });

  // ─── Autenticación ──────────────────────────────────────────────────────────

  it("devuelve 401 si no hay sesión", async () => {
    mockAuth.mockResolvedValue(null as never);

    const req = crearPostRequest({ radicado: RADICADO_VALIDO });
    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(401);
    expect(data.error).toContain("No autenticado");
  });

  // ─── Validación del radicado (R5.1) ─────────────────────────────────────────

  it("devuelve 400 si no se envía radicado", async () => {
    mockAuth.mockResolvedValue(SESSION_VALIDA as never);

    const req = crearPostRequest({});
    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toContain("radicado");
  });

  it("devuelve 400 si el radicado tiene longitud incorrecta (R5.1)", async () => {
    mockAuth.mockResolvedValue(SESSION_VALIDA as never);

    const req = crearPostRequest({ radicado: "1234567890" });
    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toContain("inválido");
    expect(data.codigo).toBe("longitud_invalida");
  });

  it("devuelve 400 si el radicado contiene caracteres no numéricos (R5.1)", async () => {
    mockAuth.mockResolvedValue(SESSION_VALIDA as never);

    const req = crearPostRequest({ radicado: "1100140030032023000120A" });
    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.codigo).toBe("formato_invalido");
  });

  it("devuelve 400 si el año del radicado está fuera de rango (R5.1)", async () => {
    mockAuth.mockResolvedValue(SESSION_VALIDA as never);

    // Año 1800 < 1900
    const req = crearPostRequest({ radicado: "11001400300318000001200" });
    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.codigo).toBe("anio_fuera_de_rango");
  });

  // ─── Duplicado (R5.6) ──────────────────────────────────────────────────────

  it("devuelve 409 si el proceso ya está en seguimiento (R5.6)", async () => {
    mockAuth.mockResolvedValue(SESSION_VALIDA as never);
    mockFindUnique.mockResolvedValue({
      id: "existing-process-id",
      radicado: RADICADO_VALIDO,
      usuario_id: USUARIO_ID,
    } as never);

    const req = crearPostRequest({ radicado: RADICADO_VALIDO });
    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(409);
    expect(data.error).toContain("ya está en seguimiento");
    expect(mockFindUnique).toHaveBeenCalledWith({
      where: {
        usuario_id_radicado: {
          usuario_id: USUARIO_ID,
          radicado: RADICADO_VALIDO,
        },
      },
    });
  });

  // ─── CPNU: sin resultados (R5.5) ───────────────────────────────────────────

  it("devuelve 404 si la CPNU no encuentra el proceso (R5.5)", async () => {
    mockAuth.mockResolvedValue(SESSION_VALIDA as never);
    mockFindUnique.mockResolvedValue(null as never);
    mockConsultarPorRadicado.mockResolvedValue({
      ok: false,
      error: { tipo: "no_encontrado", detalle: "No se encontraron procesos" },
    });

    const req = crearPostRequest({ radicado: RADICADO_VALIDO });
    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(404);
    expect(data.error).toContain("No se encontró");
  });

  // ─── CPNU: fuente no disponible (R5.7) ─────────────────────────────────────

  it("devuelve 503 si la CPNU no está disponible (R5.7)", async () => {
    mockAuth.mockResolvedValue(SESSION_VALIDA as never);
    mockFindUnique.mockResolvedValue(null as never);
    mockConsultarPorRadicado.mockResolvedValue({
      ok: false,
      error: { tipo: "fuente_no_disponible", detalle: "HTTP 500" },
    });

    const req = crearPostRequest({ radicado: RADICADO_VALIDO });
    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(503);
    expect(data.error).toContain("no está disponible");
  });

  it("devuelve 503 si la CPNU tiene timeout (R5.7)", async () => {
    mockAuth.mockResolvedValue(SESSION_VALIDA as never);
    mockFindUnique.mockResolvedValue(null as never);
    mockConsultarPorRadicado.mockResolvedValue({
      ok: false,
      error: { tipo: "timeout", detalle: "Timeout after 30s" },
    });

    const req = crearPostRequest({ radicado: RADICADO_VALIDO });
    const res = await POST(req);

    expect(res.status).toBe(503);
  });

  // ─── Registro exitoso (R5.2, R5.3, R5.4) ──────────────────────────────────

  it("crea proceso y actuaciones históricas con es_nueva=false (R5.2, R5.3, R5.4)", async () => {
    mockAuth.mockResolvedValue(SESSION_VALIDA as never);
    mockFindUnique.mockResolvedValue(null as never);
    mockConsultarPorRadicado.mockResolvedValue({
      ok: true,
      value: {
        procesos: [PROCESO_CPNU],
        paginacion: { pagina: 1, cantidadPaginas: 1, cantidadRegistros: 1 },
      },
    });
    mockObtenerActuaciones.mockResolvedValue({
      ok: true,
      value: ACTUACIONES_CPNU,
    });

    const procesoCreado = {
      id: "new-process-uuid",
      usuario_id: USUARIO_ID,
      radicado: RADICADO_VALIDO,
      llave_proceso: PROCESO_CPNU.llaveProceso,
      despacho: PROCESO_CPNU.despacho,
      departamento: PROCESO_CPNU.departamento,
      sujetos_procesales: PROCESO_CPNU.sujetosProcesales,
      columna_kanban: "nuevo",
      seguimiento_activo: true,
      creado_en: new Date(),
    };

    // Mock de la transacción: ejecuta el callback con un tx mockeado
    mockTransaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        proceso: {
          create: vi.fn().mockResolvedValue(procesoCreado),
        },
        actuacion: {
          createMany: vi.fn().mockResolvedValue({ count: ACTUACIONES_CPNU.length }),
        },
      };
      return callback(tx);
    });

    const req = crearPostRequest({ radicado: RADICADO_VALIDO });
    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(201);
    expect(data.mensaje).toContain("registrado exitosamente");
    expect(data.proceso.radicado).toBe(RADICADO_VALIDO);
    expect(data.proceso.despacho).toBe(PROCESO_CPNU.despacho);
    expect(data.proceso.columna_kanban).toBe("nuevo");
    expect(data.proceso.seguimiento_activo).toBe(true);
    expect(data.proceso.actuaciones_importadas).toBe(2);

    // Verificar que se consultó la CPNU con el radicado correcto
    expect(mockConsultarPorRadicado).toHaveBeenCalledWith(RADICADO_VALIDO);
    expect(mockObtenerActuaciones).toHaveBeenCalledWith(PROCESO_CPNU.idProceso);

    // Se descargan también los documentos de las actuaciones históricas
    expect(mockSincronizarDocumentos).toHaveBeenCalledWith(
      procesoCreado.id,
      expect.anything(),
    );
  });

  it("incluye documentos_descargados en la respuesta y no falla el registro si la sincronización de documentos falla", async () => {
    mockAuth.mockResolvedValue(SESSION_VALIDA as never);
    mockFindUnique.mockResolvedValue(null as never);
    mockConsultarPorRadicado.mockResolvedValue({
      ok: true,
      value: {
        procesos: [PROCESO_CPNU],
        paginacion: { pagina: 1, cantidadPaginas: 1, cantidadRegistros: 1 },
      },
    });
    mockObtenerActuaciones.mockResolvedValue({
      ok: true,
      value: ACTUACIONES_CPNU,
    });

    const procesoCreado = {
      id: "new-process-uuid",
      usuario_id: USUARIO_ID,
      radicado: RADICADO_VALIDO,
      llave_proceso: PROCESO_CPNU.llaveProceso,
      despacho: PROCESO_CPNU.despacho,
      departamento: PROCESO_CPNU.departamento,
      sujetos_procesales: PROCESO_CPNU.sujetosProcesales,
      columna_kanban: "nuevo",
      seguimiento_activo: true,
      creado_en: new Date(),
    };

    mockTransaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        proceso: { create: vi.fn().mockResolvedValue(procesoCreado) },
        actuacion: { createMany: vi.fn().mockResolvedValue({ count: ACTUACIONES_CPNU.length }) },
      };
      return callback(tx);
    });

    // Caso éxito: se descargaron 2 documentos
    mockSincronizarDocumentos.mockResolvedValueOnce({
      procesoId: procesoCreado.id,
      descargados: 2,
      yaExistian: 0,
      fallidos: 0,
    });

    const req1 = crearPostRequest({ radicado: RADICADO_VALIDO });
    const res1 = await POST(req1);
    const data1 = await res1.json();

    expect(res1.status).toBe(201);
    expect(data1.proceso.documentos_descargados).toBe(2);

    // Caso fallo: la sincronización lanza, el registro igual responde 201
    mockSincronizarDocumentos.mockRejectedValueOnce(new Error("CPNU no disponible"));

    const req2 = crearPostRequest({ radicado: RADICADO_VALIDO });
    const res2 = await POST(req2);
    const data2 = await res2.json();

    expect(res2.status).toBe(201);
    expect(data2.proceso.documentos_descargados).toBe(0);
  });

  it("crea proceso sin actuaciones si obtenerActuaciones falla (resiliencia)", async () => {
    mockAuth.mockResolvedValue(SESSION_VALIDA as never);
    mockFindUnique.mockResolvedValue(null as never);
    mockConsultarPorRadicado.mockResolvedValue({
      ok: true,
      value: {
        procesos: [PROCESO_CPNU],
        paginacion: { pagina: 1, cantidadPaginas: 1, cantidadRegistros: 1 },
      },
    });
    mockObtenerActuaciones.mockResolvedValue({
      ok: false,
      error: { tipo: "fuente_no_disponible", detalle: "Timeout" },
    });

    const procesoCreado = {
      id: "new-process-uuid",
      usuario_id: USUARIO_ID,
      radicado: RADICADO_VALIDO,
      llave_proceso: PROCESO_CPNU.llaveProceso,
      despacho: PROCESO_CPNU.despacho,
      departamento: PROCESO_CPNU.departamento,
      sujetos_procesales: PROCESO_CPNU.sujetosProcesales,
      columna_kanban: "nuevo",
      seguimiento_activo: true,
      creado_en: new Date(),
    };

    mockTransaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        proceso: {
          create: vi.fn().mockResolvedValue(procesoCreado),
        },
        actuacion: {
          createMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
      };
      return callback(tx);
    });

    const req = crearPostRequest({ radicado: RADICADO_VALIDO });
    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(201);
    expect(data.proceso.actuaciones_importadas).toBe(0);
  });

  it("usa transacción para atomicidad (R5.4)", async () => {
    mockAuth.mockResolvedValue(SESSION_VALIDA as never);
    mockFindUnique.mockResolvedValue(null as never);
    mockConsultarPorRadicado.mockResolvedValue({
      ok: true,
      value: {
        procesos: [PROCESO_CPNU],
        paginacion: { pagina: 1, cantidadPaginas: 1, cantidadRegistros: 1 },
      },
    });
    mockObtenerActuaciones.mockResolvedValue({
      ok: true,
      value: ACTUACIONES_CPNU,
    });

    const procesoCreado = {
      id: "new-process-uuid",
      usuario_id: USUARIO_ID,
      radicado: RADICADO_VALIDO,
      llave_proceso: PROCESO_CPNU.llaveProceso,
      despacho: PROCESO_CPNU.despacho,
      departamento: PROCESO_CPNU.departamento,
      sujetos_procesales: PROCESO_CPNU.sujetosProcesales,
      columna_kanban: "nuevo",
      seguimiento_activo: true,
      creado_en: new Date(),
    };

    mockTransaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        proceso: {
          create: vi.fn().mockResolvedValue(procesoCreado),
        },
        actuacion: {
          createMany: vi.fn().mockResolvedValue({ count: ACTUACIONES_CPNU.length }),
        },
      };
      return callback(tx);
    });

    const req = crearPostRequest({ radicado: RADICADO_VALIDO });
    await POST(req);

    // Verificar que se usó $transaction
    expect(mockTransaction).toHaveBeenCalledTimes(1);
  });

  // ─── Error interno (R5.7) ──────────────────────────────────────────────────

  it("devuelve 500 si ocurre un error inesperado", async () => {
    mockAuth.mockResolvedValue(SESSION_VALIDA as never);
    mockFindUnique.mockRejectedValue(new Error("DB crashed"));

    const req = crearPostRequest({ radicado: RADICADO_VALIDO });
    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(500);
    expect(data.error).toContain("Error interno");
  });

  it("devuelve 400 si el body no es JSON válido", async () => {
    mockAuth.mockResolvedValue(SESSION_VALIDA as never);

    const req = new NextRequest("http://localhost:3000/api/procesos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "invalid json{{{",
    });
    const res = await POST(req);

    expect(res.status).toBe(400);
  });

  // ─── Edge case: procesos[] vacío tras consulta exitosa ─────────────────────

  it("devuelve 404 si CPNU retorna ok pero procesos vacío", async () => {
    mockAuth.mockResolvedValue(SESSION_VALIDA as never);
    mockFindUnique.mockResolvedValue(null as never);
    mockConsultarPorRadicado.mockResolvedValue({
      ok: true,
      value: {
        procesos: [],
        paginacion: { pagina: 1, cantidadPaginas: 0, cantidadRegistros: 0 },
      },
    });

    const req = crearPostRequest({ radicado: RADICADO_VALIDO });
    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(404);
    expect(data.error).toContain("No se encontró");
  });
});
