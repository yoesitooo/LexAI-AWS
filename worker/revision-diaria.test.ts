/**
 * Tests para worker/revision-diaria.ts
 *
 * Verifica la orquestación de la revisión diaria con servicios mockeados:
 * - CPNU falla → conserva histórico, registra error, continúa
 * - IA falla → actuación queda con analisis_completado=false, no bloquea
 * - Flujo completo: CPNU → Diff → IA → Calculadora → Planificador
 * - Actualización de ultima_revision_en
 * - Resiliencia: un proceso fallido no detiene los demás
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock de Prisma (evita importar el generado)
vi.mock("../lib/db", () => ({
  prisma: {},
}));

// Mock de diffing-actuaciones (usa prisma internamente)
const mockDiffActuaciones = vi.fn();
const mockAlmacenarActuacionesNuevas = vi.fn();
vi.mock("../lib/diffing-actuaciones", () => ({
  diffActuaciones: (...args: unknown[]) => mockDiffActuaciones(...args),
  almacenarActuacionesNuevas: (...args: unknown[]) => mockAlmacenarActuacionesNuevas(...args),
}));

// Mock de cpnu-client (evita imports reales de validador)
vi.mock("../lib/cpnu-client", () => ({
  clienteCPNU: {
    consultarPorRadicado: vi.fn(),
    obtenerActuaciones: vi.fn(),
  },
}));

// Mock de analizador-ia (evita imports del adaptador LLM)
vi.mock("../lib/analizador-ia", () => ({
  analizarActuacionConReintentos: vi.fn(),
}));

// Mock de calculadora-plazos (evita imports de festivos)
vi.mock("../lib/calculadora-plazos", () => ({
  calcularFechaLimite: vi.fn(),
}));

// Mock de planificador-notificaciones
vi.mock("../lib/planificador-notificaciones", () => ({
  planificarNotificaciones: vi.fn(),
  REGLA_NOTIFICACION_DEFAULT: {
    horaEnvio: "07:00",
    anticipacion: "dia_calendario_anterior_a_cada_dia_habil",
  },
}));

import { ejecutarRevisionDiaria } from "./revision-diaria";
import type { OpcionesRevision, Logger } from "./revision-diaria";
import type { ActuacionCPNU, FalloCPNU } from "../lib/cpnu-client";
import type { Result } from "../lib/repository";
import { ok, err } from "../lib/repository";
import { fechaCODesdeComponentes } from "../lib/formato";
import type { FechaCO } from "../lib/formato";
import type { ResultadoConReintentos } from "../lib/analizador-ia";
import type { ErrorCalculo } from "../lib/calculadora-plazos";
import type {
  ResultadoPlanificacion,
  ErrorPlanificacion,
  PlazoParaPlanificacion,
  ReglaNotificacion,
} from "../lib/planificador-notificaciones";

// =============================================================================
// HELPERS DE MOCK
// =============================================================================

function crearLoggerMock(): Logger {
  return {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  };
}

function crearActuacionCPNU(id: number, texto = "Auto de prueba"): ActuacionCPNU {
  return {
    idRegActuacion: id,
    llaveProceso: "llave-123",
    consActuacion: id,
    fechaActuacion: "2025-01-15",
    actuacion: texto,
    anotacion: "Anotación de prueba",
    fechaInicia: null,
    fechaFinaliza: null,
    fechaRegistro: "2025-01-15",
    existeDocs: false,
  };
}

// Fecha fija para los tests (miércoles 15 de enero 2025)
const AHORA: FechaCO = fechaCODesdeComponentes(2025, 1, 15, 8, 0, 0);

// =============================================================================
// TESTS
// =============================================================================

describe("ejecutarRevisionDiaria", () => {
  let logger: Logger;

  beforeEach(() => {
    logger = crearLoggerMock();
    vi.clearAllMocks();
    // Default: diff returns no new actuaciones
    mockDiffActuaciones.mockReturnValue([]);
    mockAlmacenarActuacionesNuevas.mockResolvedValue(0);
  });

  it("no hace nada cuando no hay procesos activos", async () => {
    const prismaMock = {
      proceso: {
        findMany: vi.fn().mockResolvedValue([]),
        update: vi.fn(),
      },
      actuacion: { findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
      plazo: { create: vi.fn() },
    } as unknown as OpcionesRevision["prismaClient"];

    const resultado = await ejecutarRevisionDiaria({
      logger,
      prismaClient: prismaMock,
      ahora: AHORA,
    });

    expect(resultado.totalProcesos).toBe(0);
    expect(resultado.procesosRevisados).toBe(0);
    expect(resultado.procesosFallidos).toBe(0);
    expect(resultado.totalActuacionesNuevas).toBe(0);
    expect(resultado.totalPlazosCreados).toBe(0);
  });

  it("cuando CPNU falla → conserva histórico, registra error, continúa con los demás", async () => {
    const procesos = [
      { id: "p1", radicado: "12345678901234567890123", llave_proceso: "llave-1", usuario_id: "u1" },
      { id: "p2", radicado: "12345678901234567890124", llave_proceso: "llave-2", usuario_id: "u1" },
    ];

    const prismaMock = {
      proceso: {
        findMany: vi.fn().mockResolvedValue(procesos),
        update: vi.fn().mockResolvedValue({}),
      },
      actuacion: {
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn(),
        update: vi.fn(),
      },
      plazo: { create: vi.fn() },
    } as unknown as OpcionesRevision["prismaClient"];

    const cpnuMock = {
      consultarPorRadicado: vi.fn(),
      obtenerActuaciones: vi.fn()
        // Primer proceso: CPNU falla
        .mockResolvedValueOnce({
          ok: false,
          error: { tipo: "fuente_no_disponible" as const, detalle: "timeout" },
        })
        // Segundo proceso: CPNU éxito pero sin actuaciones nuevas
        .mockResolvedValueOnce({ ok: true, value: [] }),
    } as unknown as OpcionesRevision["cpnuClient"];

    const resultado = await ejecutarRevisionDiaria({
      logger,
      prismaClient: prismaMock,
      cpnuClient: cpnuMock,
      ahora: AHORA,
    });

    // El primer proceso falló pero el segundo se procesó correctamente
    expect(resultado.totalProcesos).toBe(2);
    expect(resultado.procesosFallidos).toBe(1);
    expect(resultado.procesosRevisados).toBe(1);

    // Error registrado
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining("CPNU falló"),
    );

    // ultima_revision_en se actualizó para ambos procesos
    expect(prismaMock!.proceso.update).toHaveBeenCalledTimes(2);
  });

  it("cuando análisis IA falla → actuación queda sin analizar, no bloquea siguientes", async () => {
    const procesos = [
      { id: "p1", radicado: "12345678901234567890123", llave_proceso: "llave-1", usuario_id: "u1" },
    ];

    const actuacionNueva = crearActuacionCPNU(999);
    const actuacionDB = {
      id: "act-db-1",
      proceso_id: "p1",
      id_actuacion_cpnu: "999",
      fecha_actuacion: new Date("2025-01-15"),
      analisis_completado: false,
    };

    // Configure diff to return the new actuacion
    mockDiffActuaciones.mockReturnValue([actuacionNueva]);
    mockAlmacenarActuacionesNuevas.mockResolvedValue(1);

    const prismaMock = {
      proceso: {
        findMany: vi.fn().mockResolvedValue(procesos),
        update: vi.fn().mockResolvedValue({}),
      },
      actuacion: {
        findMany: vi.fn().mockResolvedValue([]), // sin actuaciones previas
        findFirst: vi.fn().mockResolvedValue(actuacionDB),
        update: vi.fn().mockResolvedValue({}),
        createMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      plazo: { create: vi.fn() },
    } as unknown as OpcionesRevision["prismaClient"];

    const cpnuMock = {
      consultarPorRadicado: vi.fn(),
      obtenerActuaciones: vi.fn().mockResolvedValue({ ok: true, value: [actuacionNueva] }),
    } as unknown as OpcionesRevision["cpnuClient"];

    // IA falla tras reintentos
    const analizarMock = vi.fn().mockResolvedValue(
      ok({
        tipo: "analisis_pendiente" as const,
        intentos: 3,
        ultimoError: { tipo: "llm_fallo" as const, mensaje: "API down" },
      }),
    );

    const resultado = await ejecutarRevisionDiaria({
      logger,
      prismaClient: prismaMock,
      cpnuClient: cpnuMock,
      analizarFn: analizarMock as unknown as typeof import("../lib/analizador-ia").analizarActuacionConReintentos,
      ahora: AHORA,
    });

    // El proceso se marca como exitoso (el fallo de IA no es un fallo del proceso)
    expect(resultado.procesosRevisados).toBe(1);
    expect(resultado.procesosFallidos).toBe(0);
    // No se crearon plazos
    expect(resultado.totalPlazosCreados).toBe(0);
    // Se registró warning del análisis pendiente
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining("Análisis IA pendiente"),
    );
  });

  it("flujo completo: CPNU → Diff → IA (plazo) → Calculadora → Planificador", async () => {
    const procesos = [
      { id: "p1", radicado: "12345678901234567890123", llave_proceso: "llave-1", usuario_id: "u1" },
    ];

    const actuacionNueva = crearActuacionCPNU(100, "Auto de traslado por 5 días");
    const actuacionDB = {
      id: "act-db-1",
      proceso_id: "p1",
      id_actuacion_cpnu: "100",
      fecha_actuacion: new Date("2025-01-15"),
      analisis_completado: false,
    };

    const plazoCreado = {
      id: "plazo-1",
      actuacion_id: "act-db-1",
      proceso_id: "p1",
      dias: 5,
      es_habil: true,
      fecha_inicio: new Date("2025-01-15"),
      fecha_limite: new Date("2025-01-22"),
      estado: "pendiente",
      indeterminado: false,
    };

    // Configure diff to return the new actuacion
    mockDiffActuaciones.mockReturnValue([actuacionNueva]);
    mockAlmacenarActuacionesNuevas.mockResolvedValue(1);

    const prismaMock = {
      proceso: {
        findMany: vi.fn().mockResolvedValue(procesos),
        update: vi.fn().mockResolvedValue({}),
      },
      actuacion: {
        findMany: vi.fn().mockResolvedValue([]), // sin actuaciones previas
        findFirst: vi.fn().mockResolvedValue(actuacionDB),
        update: vi.fn().mockResolvedValue({}),
        createMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      plazo: {
        create: vi.fn().mockResolvedValue(plazoCreado),
      },
    } as unknown as OpcionesRevision["prismaClient"];

    const cpnuMock = {
      consultarPorRadicado: vi.fn(),
      obtenerActuaciones: vi.fn().mockResolvedValue({ ok: true, value: [actuacionNueva] }),
    } as unknown as OpcionesRevision["cpnuClient"];

    // IA detecta plazo de 5 días hábiles
    const analizarMock = vi.fn().mockResolvedValue(
      ok({ tipo: "plazo" as const, dias: 5, esHabil: true }),
    );

    // Calculadora devuelve fecha límite
    const fechaLimite = fechaCODesdeComponentes(2025, 1, 22);
    const calcularMock = vi.fn().mockReturnValue(ok(fechaLimite));

    // Planificador éxito
    const planificarMock = vi.fn().mockResolvedValue(
      ok({ caso: "notificaciones" as const, notificaciones: [] }),
    );

    const resultado = await ejecutarRevisionDiaria({
      logger,
      prismaClient: prismaMock,
      cpnuClient: cpnuMock,
      analizarFn: analizarMock as any,
      calcularFechaLimiteFn: calcularMock as any,
      planificarFn: planificarMock as any,
      ahora: AHORA,
    });

    // Verificar flujo completo
    expect(resultado.procesosRevisados).toBe(1);
    expect(resultado.totalPlazosCreados).toBe(1);

    // Verificar que se llamó al analizador con el texto correcto
    expect(analizarMock).toHaveBeenCalledWith(
      "Auto de traslado por 5 días — Anotación de prueba",
    );

    // Verificar que se llamó a la calculadora with the FechaCO from actuacionDB.fecha_actuacion
    // Note: new Date("2025-01-15") is midnight UTC = Jan 14 19:00 CO time
    expect(calcularMock).toHaveBeenCalledWith(
      expect.objectContaining({ mes: 1, anio: 2025 }),
      5,
      true,
    );

    // Verificar que se llamó al planificador
    expect(planificarMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "plazo-1", usuario_id: "u1" }),
      expect.anything(), // regla
      expect.anything(), // ahora
      prismaMock, // prismaClient
    );

    // Verificar que la actuación se marcó como analizada
    expect(prismaMock!.actuacion.update).toHaveBeenCalledWith({
      where: { id: "act-db-1" },
      data: { analisis_completado: true, es_nueva: false },
    });

    // Verificar que ultima_revision_en se actualizó
    expect(prismaMock!.proceso.update).toHaveBeenCalledWith({
      where: { id: "p1" },
      data: { ultima_revision_en: expect.any(Date) },
    });
  });

  it("actualiza ultima_revision_en incluso cuando no hay actuaciones nuevas", async () => {
    const procesos = [
      { id: "p1", radicado: "12345678901234567890123", llave_proceso: "llave-1", usuario_id: "u1" },
    ];

    const prismaMock = {
      proceso: {
        findMany: vi.fn().mockResolvedValue(procesos),
        update: vi.fn().mockResolvedValue({}),
      },
      actuacion: {
        findMany: vi.fn().mockResolvedValue([
          { id_actuacion_cpnu: "100" }, // ya almacenada
        ]),
        findFirst: vi.fn(),
        update: vi.fn(),
      },
      plazo: { create: vi.fn() },
    } as unknown as OpcionesRevision["prismaClient"];

    // CPNU devuelve la misma actuación que ya tenemos (no es nueva)
    const cpnuMock = {
      consultarPorRadicado: vi.fn(),
      obtenerActuaciones: vi.fn().mockResolvedValue({
        ok: true,
        value: [crearActuacionCPNU(100)],
      }),
    } as unknown as OpcionesRevision["cpnuClient"];

    const resultado = await ejecutarRevisionDiaria({
      logger,
      prismaClient: prismaMock,
      cpnuClient: cpnuMock,
      ahora: AHORA,
    });

    expect(resultado.procesosRevisados).toBe(1);
    expect(resultado.totalActuacionesNuevas).toBe(0);
    // ultima_revision_en se actualizó
    expect(prismaMock!.proceso.update).toHaveBeenCalledWith({
      where: { id: "p1" },
      data: { ultima_revision_en: expect.any(Date) },
    });
  });

  it("resiliencia: error inesperado en un proceso no detiene los demás", async () => {
    const procesos = [
      { id: "p1", radicado: "12345678901234567890123", llave_proceso: "llave-1", usuario_id: "u1" },
      { id: "p2", radicado: "12345678901234567890124", llave_proceso: "llave-2", usuario_id: "u1" },
    ];

    const prismaMock = {
      proceso: {
        findMany: vi.fn().mockResolvedValue(procesos),
        update: vi.fn().mockResolvedValue({}),
      },
      actuacion: {
        findMany: vi.fn()
          // Primer proceso: lanza excepción
          .mockRejectedValueOnce(new Error("DB connection lost"))
          // Segundo proceso: funciona normal
          .mockResolvedValueOnce([]),
        findFirst: vi.fn(),
        update: vi.fn(),
      },
      plazo: { create: vi.fn() },
    } as unknown as OpcionesRevision["prismaClient"];

    const cpnuMock = {
      consultarPorRadicado: vi.fn(),
      obtenerActuaciones: vi.fn().mockResolvedValue({ ok: true, value: [] }),
    } as unknown as OpcionesRevision["cpnuClient"];

    // Diff returns empty (no new actuaciones for second process)
    mockDiffActuaciones.mockReturnValue([]);

    const resultado = await ejecutarRevisionDiaria({
      logger,
      prismaClient: prismaMock,
      cpnuClient: cpnuMock,
      ahora: AHORA,
    });

    // Primer proceso falló, segundo éxito
    expect(resultado.procesosFallidos).toBe(1);
    expect(resultado.procesosRevisados).toBe(1);
    expect(resultado.resultados[0].error).toContain("DB connection lost");
    expect(resultado.resultados[1].exito).toBe(true);
  });

  it("análisis IA sin_plazo → marca actuación analizada sin crear plazo", async () => {
    const procesos = [
      { id: "p1", radicado: "12345678901234567890123", llave_proceso: "llave-1", usuario_id: "u1" },
    ];

    const actuacionNueva = crearActuacionCPNU(200, "Sentencia — sin recurso");
    const actuacionDB = {
      id: "act-db-2",
      proceso_id: "p1",
      id_actuacion_cpnu: "200",
      fecha_actuacion: new Date("2025-01-15"),
      analisis_completado: false,
    };

    // Configure diff to return the new actuacion
    mockDiffActuaciones.mockReturnValue([actuacionNueva]);
    mockAlmacenarActuacionesNuevas.mockResolvedValue(1);

    const prismaMock = {
      proceso: {
        findMany: vi.fn().mockResolvedValue(procesos),
        update: vi.fn().mockResolvedValue({}),
      },
      actuacion: {
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn().mockResolvedValue(actuacionDB),
        update: vi.fn().mockResolvedValue({}),
        createMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      plazo: { create: vi.fn() },
    } as unknown as OpcionesRevision["prismaClient"];

    const cpnuMock = {
      consultarPorRadicado: vi.fn(),
      obtenerActuaciones: vi.fn().mockResolvedValue({ ok: true, value: [actuacionNueva] }),
    } as unknown as OpcionesRevision["cpnuClient"];

    // IA indica sin plazo
    const analizarMock = vi.fn().mockResolvedValue(ok({ tipo: "sin_plazo" as const }));

    const resultado = await ejecutarRevisionDiaria({
      logger,
      prismaClient: prismaMock,
      cpnuClient: cpnuMock,
      analizarFn: analizarMock as any,
      ahora: AHORA,
    });

    expect(resultado.totalPlazosCreados).toBe(0);
    // Se marcó como analizada
    expect(prismaMock!.actuacion.update).toHaveBeenCalledWith({
      where: { id: "act-db-2" },
      data: { analisis_completado: true, es_nueva: false },
    });
    // No se creó plazo
    expect(prismaMock!.plazo.create).not.toHaveBeenCalled();
  });

  it("análisis IA indeterminado → crea plazo sin fecha límite y sin notificaciones", async () => {
    const procesos = [
      { id: "p1", radicado: "12345678901234567890123", llave_proceso: "llave-1", usuario_id: "u1" },
    ];

    const actuacionNueva = crearActuacionCPNU(300, "Auto con plazo indefinido");
    const actuacionDB = {
      id: "act-db-3",
      proceso_id: "p1",
      id_actuacion_cpnu: "300",
      fecha_actuacion: new Date("2025-01-15"),
      analisis_completado: false,
    };

    // Configure diff to return the new actuacion
    mockDiffActuaciones.mockReturnValue([actuacionNueva]);
    mockAlmacenarActuacionesNuevas.mockResolvedValue(1);

    const prismaMock = {
      proceso: {
        findMany: vi.fn().mockResolvedValue(procesos),
        update: vi.fn().mockResolvedValue({}),
      },
      actuacion: {
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn().mockResolvedValue(actuacionDB),
        update: vi.fn().mockResolvedValue({}),
        createMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      plazo: { create: vi.fn().mockResolvedValue({ id: "plazo-ind" }) },
    } as unknown as OpcionesRevision["prismaClient"];

    const cpnuMock = {
      consultarPorRadicado: vi.fn(),
      obtenerActuaciones: vi.fn().mockResolvedValue({ ok: true, value: [actuacionNueva] }),
    } as unknown as OpcionesRevision["cpnuClient"];

    // IA indica plazo indeterminado
    const analizarMock = vi.fn().mockResolvedValue(ok({ tipo: "indeterminado" as const }));

    const resultado = await ejecutarRevisionDiaria({
      logger,
      prismaClient: prismaMock,
      cpnuClient: cpnuMock,
      analizarFn: analizarMock as any,
      ahora: AHORA,
    });

    expect(resultado.totalPlazosCreados).toBe(1);
    // Plazo creado con indeterminado=true y sin fecha_limite
    expect(prismaMock!.plazo.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        indeterminado: true,
        fecha_limite: null,
        dias: null,
      }),
    });
  });
});
