/**
 * Tests unitarios para el despacho de notificaciones — LexAI MVP
 *
 * Cubre:
 * - enviarConReintentos: reintentos aislados por canal
 * - ejecutarDespacho: lógica de despacho con mocks de Prisma y canales
 * - Aislamiento entre canales (fallo de uno no bloquea otros)
 * - Marcado de estado enviada/fallida
 *
 * Requisitos cubiertos: R10.1, R10.7, R10.8
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  enviarConReintentos,
  ejecutarDespacho,
  mapearConfiguracion,
  MAX_INTENTOS,
} from "./despacho-notificaciones";
import type {
  CanalNotificacion,
  ConfiguracionUsuario,
  ContenidoNotificacion,
  DatosDestinatario,
  ErrorCanal,
  Result,
} from "../lib/notificaciones/tipos";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("../lib/db", () => ({
  prisma: {
    notificacion: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("../lib/notificaciones", () => ({
  canalInApp: {
    nombre: "inapp",
    disponiblePara: () => true,
    enviar: vi.fn(async () => ({ ok: true, valor: undefined })),
  },
  canalEmail: {
    nombre: "email",
    disponiblePara: () => true,
    enviar: vi.fn(async () => ({ ok: true, valor: undefined })),
  },
}));

import { prisma } from "../lib/db";

const mockFindMany = vi.mocked(prisma.notificacion.findMany);
const mockUpdate = vi.mocked(prisma.notificacion.update);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Crea un canal mock para tests */
function crearCanalMock(
  nombre: string,
  disponible: boolean,
  resultados: Array<Result<void, ErrorCanal>>,
): CanalNotificacion {
  let llamada = 0;
  return {
    nombre,
    disponiblePara: (_config: ConfiguracionUsuario) => disponible,
    enviar: vi.fn(async () => {
      const resultado = resultados[llamada] ?? resultados[resultados.length - 1];
      llamada++;
      return resultado;
    }),
  };
}

/** No-op esperar para tests (sin delay real) */
const esperarInstantaneo = async (_ms: number): Promise<void> => {};

/** Datos de destinatario de prueba */
const destinatarioPrueba: DatosDestinatario = {
  usuario_id: "user-1",
  email: "abogado@ejemplo.com",
  nombre: "Juan Abogado",
  numero_whatsapp: "+573001234567",
};

/** Contenido de prueba */
const contenidoPrueba: ContenidoNotificacion = {
  titulo: "Plazo procesal — 11001310300120230001",
  mensaje: "Tiene un plazo por vencer",
  notificacion_id: "notif-1",
};

/** Crea una notificación mock como la devolvería Prisma */
function crearNotificacionMock(overrides?: Partial<{
  id: string;
  estado: string;
  canal_inapp: boolean;
  canal_email: boolean;
}>) {
  return {
    id: overrides?.id ?? "notif-1",
    plazo_id: "plazo-1",
    usuario_id: "user-1",
    fecha_programada: new Date("2025-01-15T12:00:00Z"),
    estado: overrides?.estado ?? "programada",
    intentos: 0,
    canal: null,
    ultimo_intento_en: null,
    error_detalle: null,
    creado_en: new Date(),
    actualizado_en: new Date(),
    plazo: {
      id: "plazo-1",
      actuacion_id: "act-1",
      proceso_id: "proc-1",
      dias: 5,
      es_habil: true,
      fecha_inicio: new Date("2025-01-10"),
      fecha_limite: new Date("2025-01-17"),
      estado: "pendiente",
      indeterminado: false,
      error_programacion: false,
      creado_en: new Date(),
      actualizado_en: new Date(),
      actuacion: {
        id: "act-1",
        proceso_id: "proc-1",
        id_actuacion_cpnu: "cpnu-1",
        llave_proceso: null,
        consecutivo: 1,
        fecha_actuacion: new Date("2025-01-10"),
        actuacion: "Auto que corre traslado",
        anotacion: null,
        fecha_inicia: null,
        fecha_finaliza: null,
        fecha_registro: new Date("2025-01-10"),
        existe_docs: false,
        es_nueva: false,
        analisis_completado: true,
        creado_en: new Date(),
      },
      proceso: {
        id: "proc-1",
        usuario_id: "user-1",
        radicado: "11001310300120230001234",
        llave_proceso: null,
        despacho: "Juzgado 1 Civil",
        departamento: "Bogotá",
        ciudad: "Bogotá",
        tipo_proceso: "Civil",
        sujetos_procesales: "{}",
        estado_cpnu: null,
        columna_kanban: "en_seguimiento",
        seguimiento_activo: true,
        ultima_revision_en: null,
        creado_en: new Date(),
        actualizado_en: new Date(),
      },
    },
    usuario: {
      id: "user-1",
      nombre: "Juan Abogado",
      email: "abogado@ejemplo.com",
      password_hash: "hash",
      creado_en: new Date(),
      actualizado_en: new Date(),
      configuracion: {
        id: "config-1",
        usuario_id: "user-1",
        canal_inapp: overrides?.canal_inapp ?? true,
        canal_email: overrides?.canal_email ?? true,
        canal_whatsapp: false,
        numero_whatsapp: null,
        frecuencia_revision: "diaria_habiles",
        creado_en: new Date(),
        actualizado_en: new Date(),
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Tests: enviarConReintentos
// ---------------------------------------------------------------------------

describe("enviarConReintentos", () => {
  it("retorna éxito en el primer intento si el canal responde ok", async () => {
    const canal = crearCanalMock("inapp", true, [{ ok: true, valor: undefined }]);

    const resultado = await enviarConReintentos(
      canal,
      destinatarioPrueba,
      contenidoPrueba,
      esperarInstantaneo,
    );

    expect(resultado.exito).toBe(true);
    expect(resultado.intentos).toBe(1);
    expect(resultado.error).toBeUndefined();
  });

  it("reintenta hasta 3 veces y retorna fallo si todos fallan", async () => {
    const error: ErrorCanal = {
      canal: "email",
      mensaje: "Error de envío",
      detalle: "SMTP timeout",
    };
    const canal = crearCanalMock("email", true, [
      { ok: false, error },
      { ok: false, error },
      { ok: false, error },
    ]);

    const resultado = await enviarConReintentos(
      canal,
      destinatarioPrueba,
      contenidoPrueba,
      esperarInstantaneo,
    );

    expect(resultado.exito).toBe(false);
    expect(resultado.intentos).toBe(MAX_INTENTOS);
    expect(resultado.error).toBe("SMTP timeout");
    expect(canal.enviar).toHaveBeenCalledTimes(3);
  });

  it("tiene éxito en el segundo intento tras un fallo inicial", async () => {
    const error: ErrorCanal = {
      canal: "email",
      mensaje: "Error temporal",
      detalle: "connection reset",
    };
    const canal = crearCanalMock("email", true, [
      { ok: false, error },
      { ok: true, valor: undefined },
    ]);

    const resultado = await enviarConReintentos(
      canal,
      destinatarioPrueba,
      contenidoPrueba,
      esperarInstantaneo,
    );

    expect(resultado.exito).toBe(true);
    expect(resultado.intentos).toBe(2);
    expect(canal.enviar).toHaveBeenCalledTimes(2);
  });

  it("llama a la función de espera entre reintentos", async () => {
    const error: ErrorCanal = {
      canal: "email",
      mensaje: "Error",
    };
    const canal = crearCanalMock("email", true, [
      { ok: false, error },
      { ok: false, error },
      { ok: true, valor: undefined },
    ]);

    const esperarMock = vi.fn(async () => {});

    await enviarConReintentos(canal, destinatarioPrueba, contenidoPrueba, esperarMock);

    // Debe esperar entre intento 1→2 y 2→3
    expect(esperarMock).toHaveBeenCalledTimes(2);
    expect(esperarMock).toHaveBeenCalledWith(60_000);
  });

  it("maneja excepciones lanzadas por el canal", async () => {
    const canal: CanalNotificacion = {
      nombre: "email",
      disponiblePara: () => true,
      enviar: vi.fn(async () => {
        throw new Error("Network failure");
      }),
    };

    const resultado = await enviarConReintentos(
      canal,
      destinatarioPrueba,
      contenidoPrueba,
      esperarInstantaneo,
    );

    expect(resultado.exito).toBe(false);
    expect(resultado.intentos).toBe(MAX_INTENTOS);
    expect(resultado.error).toBe("Network failure");
  });
});

// ---------------------------------------------------------------------------
// Tests: mapearConfiguracion
// ---------------------------------------------------------------------------

describe("mapearConfiguracion", () => {
  it("mapea correctamente la configuración de Prisma", () => {
    const config = {
      canal_inapp: true,
      canal_email: false,
      canal_whatsapp: true,
      numero_whatsapp: "+573001234567",
    };

    const resultado = mapearConfiguracion(config);

    expect(resultado).toEqual({
      canal_inapp: true,
      canal_email: false,
      canal_whatsapp: true,
      numero_whatsapp: "+573001234567",
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: ejecutarDespacho
// ---------------------------------------------------------------------------

describe("ejecutarDespacho", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdate.mockResolvedValue({} as any);
  });

  it("no hace nada si no hay notificaciones programadas", async () => {
    mockFindMany.mockResolvedValue([]);

    await ejecutarDespacho(
      new Date("2025-01-15T12:00:00Z"),
      () => [],
      esperarInstantaneo,
    );

    expect(mockFindMany).toHaveBeenCalledTimes(1);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("marca notificación como 'enviada' cuando al menos un canal tiene éxito", async () => {
    const notif = crearNotificacionMock();
    mockFindMany.mockResolvedValue([notif] as any);

    const canalExitoso = crearCanalMock("inapp", true, [
      { ok: true, valor: undefined },
    ]);
    const canalFallido = crearCanalMock("email", true, [
      {
        ok: false,
        error: { canal: "email", mensaje: "Error", detalle: "fallo" },
      },
      {
        ok: false,
        error: { canal: "email", mensaje: "Error", detalle: "fallo" },
      },
      {
        ok: false,
        error: { canal: "email", mensaje: "Error", detalle: "fallo" },
      },
    ]);

    await ejecutarDespacho(
      new Date("2025-01-15T12:00:00Z"),
      () => [canalExitoso, canalFallido],
      esperarInstantaneo,
    );

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "notif-1" },
        data: expect.objectContaining({
          estado: "enviada",
        }),
      }),
    );
  });

  it("marca notificación como 'fallida' cuando todos los canales fallan", async () => {
    const notif = crearNotificacionMock();
    mockFindMany.mockResolvedValue([notif] as any);

    const canalFallido1 = crearCanalMock("inapp", true, [
      {
        ok: false,
        error: { canal: "inapp", mensaje: "Error DB", detalle: "DB down" },
      },
      {
        ok: false,
        error: { canal: "inapp", mensaje: "Error DB", detalle: "DB down" },
      },
      {
        ok: false,
        error: { canal: "inapp", mensaje: "Error DB", detalle: "DB down" },
      },
    ]);
    const canalFallido2 = crearCanalMock("email", true, [
      {
        ok: false,
        error: { canal: "email", mensaje: "SMTP error", detalle: "timeout" },
      },
      {
        ok: false,
        error: { canal: "email", mensaje: "SMTP error", detalle: "timeout" },
      },
      {
        ok: false,
        error: { canal: "email", mensaje: "SMTP error", detalle: "timeout" },
      },
    ]);

    await ejecutarDespacho(
      new Date("2025-01-15T12:00:00Z"),
      () => [canalFallido1, canalFallido2],
      esperarInstantaneo,
    );

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "notif-1" },
        data: expect.objectContaining({
          estado: "fallida",
          error_detalle: expect.stringContaining("inapp"),
        }),
      }),
    );
  });

  it("solo envía por canales disponibles (respeta configuración del usuario)", async () => {
    const notif = crearNotificacionMock({ canal_email: false });
    mockFindMany.mockResolvedValue([notif] as any);

    const canalInapp = crearCanalMock("inapp", true, [
      { ok: true, valor: undefined },
    ]);
    // Este canal reporta no disponible para la config del usuario
    const canalEmailNoDisponible: CanalNotificacion = {
      nombre: "email",
      disponiblePara: (config) => config.canal_email === true,
      enviar: vi.fn(async () => ({ ok: true as const, valor: undefined })),
    };

    await ejecutarDespacho(
      new Date("2025-01-15T12:00:00Z"),
      () => [canalInapp, canalEmailNoDisponible],
      esperarInstantaneo,
    );

    // El canal email no debería haber sido llamado
    expect(canalEmailNoDisponible.enviar).not.toHaveBeenCalled();
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ estado: "enviada" }),
      }),
    );
  });

  it("fallo de un canal no bloquea a los demás (aislamiento)", async () => {
    const notif = crearNotificacionMock();
    mockFindMany.mockResolvedValue([notif] as any);

    // Canal inapp falla con excepción
    const canalInappFalla: CanalNotificacion = {
      nombre: "inapp",
      disponiblePara: () => true,
      enviar: vi.fn(async () => {
        throw new Error("DB crash");
      }),
    };

    // Canal email tiene éxito
    const canalEmailExitoso = crearCanalMock("email", true, [
      { ok: true, valor: undefined },
    ]);

    await ejecutarDespacho(
      new Date("2025-01-15T12:00:00Z"),
      () => [canalInappFalla, canalEmailExitoso],
      esperarInstantaneo,
    );

    // Debe marcarse como enviada porque email tuvo éxito
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ estado: "enviada" }),
      }),
    );
  });

  it("registra intentos totales correctamente", async () => {
    const notif = crearNotificacionMock();
    mockFindMany.mockResolvedValue([notif] as any);

    // Canal inapp falla 2 veces, éxito en la 3ra
    const error: ErrorCanal = { canal: "inapp", mensaje: "Error" };
    const canalInapp = crearCanalMock("inapp", true, [
      { ok: false, error },
      { ok: false, error },
      { ok: true, valor: undefined },
    ]);

    // Canal email éxito inmediato
    const canalEmail = crearCanalMock("email", true, [
      { ok: true, valor: undefined },
    ]);

    await ejecutarDespacho(
      new Date("2025-01-15T12:00:00Z"),
      () => [canalInapp, canalEmail],
      esperarInstantaneo,
    );

    // Intentos: inapp=3, email=1, total=4
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          estado: "enviada",
          intentos: 4,
        }),
      }),
    );
  });

  it("marca como fallida si el usuario no tiene configuración", async () => {
    const notif = crearNotificacionMock();
    (notif.usuario as any).configuracion = null;
    mockFindMany.mockResolvedValue([notif] as any);

    await ejecutarDespacho(
      new Date("2025-01-15T12:00:00Z"),
      () => [],
      esperarInstantaneo,
    );

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          estado: "fallida",
          error_detalle: "Usuario sin configuración de canales",
        }),
      }),
    );
  });

  it("consulta notificaciones con estado 'programada' y fecha <= ahora", async () => {
    mockFindMany.mockResolvedValue([]);
    const ahora = new Date("2025-01-15T12:00:00Z");

    await ejecutarDespacho(ahora, () => [], esperarInstantaneo);

    expect(mockFindMany).toHaveBeenCalledWith({
      where: {
        estado: "programada",
        fecha_programada: { lte: ahora },
      },
      include: {
        plazo: {
          include: {
            actuacion: true,
            proceso: true,
          },
        },
        usuario: {
          include: {
            configuracion: true,
          },
        },
      },
    });
  });
});
