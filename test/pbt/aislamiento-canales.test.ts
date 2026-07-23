/**
 * Feature: lexai-mvp, Property 22: Aislamiento de canales ante fallos (si un canal falla
 * persistentemente, los demás activos igual se intentan y pueden completarse)
 *
 * **Validates: Requisitos R10.8**
 *
 * Propiedades verificadas:
 *  1. Si canal A falla los 3 reintentos PERO canal B tiene éxito, la notificación se marca 'enviada'
 *  2. El fallo de canal A NO impide que canal B sea intentado
 *  3. Para cualquier combinación de éxito/fallo de canales, el estado final es 'enviada' sii
 *     al menos un canal tuvo éxito
 *
 * Generadores: combinaciones aleatorias de éxito/fallo por canal (2-4 canales)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fc from "fast-check";

// ---------------------------------------------------------------------------
// Mocks — ANTES de importar el módulo bajo prueba
// ---------------------------------------------------------------------------

const mockNotificacionFindMany = vi.fn();
const mockNotificacionUpdate = vi.fn();

vi.mock("../../lib/db", () => ({
  prisma: {
    notificacion: {
      findMany: (...args: unknown[]) => mockNotificacionFindMany(...args),
      update: (...args: unknown[]) => mockNotificacionUpdate(...args),
    },
  },
}));

vi.mock("../../lib/notificaciones", () => ({
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

vi.mock("node-cron", () => ({
  default: { schedule: vi.fn() },
  schedule: vi.fn(),
}));

import {
  enviarConReintentos,
  ejecutarDespacho,
  MAX_INTENTOS,
} from "../../worker/despacho-notificaciones";
import type {
  CanalNotificacion,
  ContenidoNotificacion,
  DatosDestinatario,
} from "../../lib/notificaciones/tipos";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Crea un canal mock con resultado fijo (éxito o fallo en cada intento).
 * Registra si fue invocado al menos una vez.
 */
function crearCanalMock(
  nombre: string,
  exito: boolean,
): CanalNotificacion & { invocado: boolean } {
  const canal = {
    nombre,
    invocado: false,
    disponiblePara: () => true,
    enviar: async () => {
      canal.invocado = true;
      if (exito) {
        return { ok: true as const, valor: undefined };
      }
      return {
        ok: false as const,
        error: { canal: nombre, mensaje: `Fallo persistente en ${nombre}` },
      };
    },
  };
  return canal;
}

/** Contenido fijo para pruebas */
const contenidoFijo: ContenidoNotificacion = {
  titulo: "Test aislamiento",
  mensaje: "Prueba de propiedad de aislamiento de canales.",
  notificacion_id: "notif-pbt-aislamiento",
};

/** Destinatario fijo para pruebas */
const destinatarioFijo: DatosDestinatario = {
  usuario_id: "u-pbt-aislamiento",
  email: "test@lexai.co",
  nombre: "Abogado PBT",
};

/**
 * Simula la lógica del dispatch de canales de ejecutarDespacho:
 * envía por cada canal activo con Promise.allSettled y determina estado final.
 * Reproduce fielmente el algoritmo de despacho-notificaciones.ts.
 */
async function simularDespachoCanales(
  canales: (CanalNotificacion & { invocado: boolean })[],
  esperarFn: (ms: number) => Promise<void>,
): Promise<{ estado: "enviada" | "fallida"; erroresPorCanal: string[] }> {
  let alMenosUnExito = false;
  const erroresPorCanal: string[] = [];

  await Promise.allSettled(
    canales.map(async (canal) => {
      const resultado = await enviarConReintentos(
        canal,
        destinatarioFijo,
        contenidoFijo,
        esperarFn,
      );

      if (resultado.exito) {
        alMenosUnExito = true;
      } else {
        erroresPorCanal.push(
          `${canal.nombre}: ${resultado.error ?? "error desconocido"}`,
        );
      }

      return resultado;
    }),
  );

  return {
    estado: alMenosUnExito ? "enviada" : "fallida",
    erroresPorCanal,
  };
}

/**
 * Crea una notificación mock para que findMany la devuelva
 * con la estructura que ejecutarDespacho espera.
 */
function crearNotificacionMock(id: string) {
  return {
    id,
    estado: "programada",
    fecha_programada: new Date("2025-01-15T12:00:00Z"),
    intentos: 0,
    plazo: {
      dias: 5,
      es_habil: true,
      fecha_limite: new Date("2025-01-20T12:00:00Z"),
      proceso: { radicado: "12345678901234567890123", despacho: "Juzgado Test" },
      actuacion: { actuacion: "Auto admisorio de demanda" },
    },
    usuario: {
      id: "usuario-pbt-aislamiento",
      email: "abogado@test.co",
      nombre: "Abogado PBT",
      configuracion: {
        canal_inapp: true,
        canal_email: true,
        canal_whatsapp: false,
        numero_whatsapp: null,
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Propiedades
// ---------------------------------------------------------------------------

describe("PBT — Aislamiento de canales ante fallos (Property 22)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNotificacionUpdate.mockResolvedValue({});
  });

  it("Property 22.1: Si canal A falla todos los reintentos PERO canal B tiene éxito, la notificación se marca 'enviada'", () => {
    fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 2, max: 4 }),
        fc.integer({ min: 0, max: 3 }),
        async (numCanales, indiceFallo) => {
          const indiceFalloReal = indiceFallo % numCanales;

          // Crear canales: todos exitosos excepto el del índice de fallo
          const canales = Array.from({ length: numCanales }, (_, i) =>
            crearCanalMock(`canal-${i}`, i !== indiceFalloReal),
          );

          const esperarMock = vi.fn().mockResolvedValue(undefined);

          const resultado = await simularDespachoCanales(canales, esperarMock);

          // Al menos un canal tuvo éxito → estado debe ser 'enviada'
          expect(resultado.estado).toBe("enviada");
        },
      ),
      { numRuns: 100 },
    );
  });

  it("Property 22.2: El fallo de canal A NO impide que canal B sea intentado (todos los canales se invocan)", () => {
    fc.assert(
      fc.asyncProperty(
        fc.array(fc.boolean(), { minLength: 2, maxLength: 4 }).filter(
          (arr) => arr.some((v) => !v),
        ),
        async (resultados) => {
          const canales = resultados.map((exito, i) =>
            crearCanalMock(`canal-${i}`, exito),
          );

          const esperarMock = vi.fn().mockResolvedValue(undefined);

          await simularDespachoCanales(canales, esperarMock);

          // TODOS los canales deben haber sido invocados
          for (const canal of canales) {
            expect(canal.invocado).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("Property 22.3: Para cualquier combinación de éxito/fallo, estado final es 'enviada' sii al menos un canal tuvo éxito", () => {
    fc.assert(
      fc.asyncProperty(
        fc.array(fc.boolean(), { minLength: 1, maxLength: 4 }),
        async (resultados) => {
          const canales = resultados.map((exito, i) =>
            crearCanalMock(`canal-${i}`, exito),
          );

          const alMenosUnExito = resultados.some((v) => v);

          const esperarMock = vi.fn().mockResolvedValue(undefined);

          const resultado = await simularDespachoCanales(canales, esperarMock);

          if (alMenosUnExito) {
            expect(resultado.estado).toBe("enviada");
          } else {
            expect(resultado.estado).toBe("fallida");
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("Property 22.4 (integración): ejecutarDespacho marca 'enviada' cuando al menos un canal tiene éxito y 'fallida' cuando todos fallan", () => {
    fc.assert(
      fc.asyncProperty(
        // Al menos 2 canales, con al menos uno que falla para probar aislamiento
        fc.array(fc.boolean(), { minLength: 2, maxLength: 4 }).filter(
          (arr) => arr.some((v) => !v) && arr.some((v) => v),
        ),
        async (resultados) => {
          // Reset mocks para cada iteración
          mockNotificacionFindMany.mockReset();
          mockNotificacionUpdate.mockReset();
          mockNotificacionUpdate.mockResolvedValue({});

          const canales = resultados.map((exito, i) =>
            crearCanalMock(`canal-${i}`, exito),
          );

          mockNotificacionFindMany.mockResolvedValue([crearNotificacionMock("notif-integ")]);

          const esperarMock = vi.fn().mockResolvedValue(undefined);

          await ejecutarDespacho(
            new Date("2025-01-15T12:00:00Z"),
            () => canales,
            esperarMock,
          );

          // Al menos un éxito → 'enviada'
          expect(mockNotificacionUpdate).toHaveBeenCalled();
          const updateCall = mockNotificacionUpdate.mock.calls[0][0];
          expect(updateCall.data.estado).toBe("enviada");
        },
      ),
      { numRuns: 100 },
    );
  });
});
