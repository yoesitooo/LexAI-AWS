/**
 * Feature: lexai-mvp, Property 21: Reintentos con espaciado por canal (hasta 3 intentos separados ≥60 s)
 *
 * **Validates: Requisitos R10.7**
 *
 * Propiedades verificadas:
 *  1. Para cualquier número de fallos (1 a 5), se reintenta hasta 3 veces máximo
 *  2. Entre cada reintento, esperarFn se invoca con 60000ms
 *  3. Total intentos = min(fallos_antes_de_exito + 1, 3)
 *  4. Si tiene éxito en cualquier intento, retorna {exito: true}
 *
 * Generadores: número de fallos antes de éxito (1–5), canales mock
 */

import { describe, it, expect, vi } from "vitest";
import * as fc from "fast-check";

// Mock de Prisma para evitar la resolución de @/lib/generated/prisma
vi.mock("../../lib/db", () => ({
  prisma: {
    notificacion: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
  },
}));

// Mock de notificaciones para evitar instanciación de Resend sin API key
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

// Mock de node-cron para evitar inicialización de cron al importar el módulo
vi.mock("node-cron", () => ({
  default: { schedule: vi.fn() },
  schedule: vi.fn(),
}));

import { enviarConReintentos, MAX_INTENTOS, ESPERA_ENTRE_REINTENTOS_MS } from "../../worker/despacho-notificaciones";
import type {
  CanalNotificacion,
  ConfiguracionUsuario,
  ContenidoNotificacion,
  DatosDestinatario,
} from "../../lib/notificaciones/tipos";

// ---------------------------------------------------------------------------
// Helpers — Mock de canal y esperarFn
// ---------------------------------------------------------------------------

/**
 * Crea un canal mock que falla las primeras `fallosAnteExito` veces
 * y tiene éxito en el siguiente intento.
 */
function crearCanalConFallos(fallosAnteExito: number): CanalNotificacion {
  let llamadas = 0;

  return {
    nombre: "mock",
    disponiblePara: () => true,
    enviar: async () => {
      llamadas++;
      if (llamadas <= fallosAnteExito) {
        return { ok: false, error: { canal: "mock", mensaje: `Fallo #${llamadas}` } };
      }
      return { ok: true, valor: undefined };
    },
  };
}

/**
 * Crea un canal mock que siempre falla.
 */
function crearCanalSiempreFalla(): CanalNotificacion {
  return {
    nombre: "mock-fallo",
    disponiblePara: () => true,
    enviar: async () => {
      return { ok: false, error: { canal: "mock-fallo", mensaje: "Fallo permanente" } };
    },
  };
}

/** Contenido fijo para pruebas */
const contenidoFijo: ContenidoNotificacion = {
  titulo: "Test reintento",
  mensaje: "Prueba de propiedad de reintentos.",
  notificacion_id: "notif-pbt-retry",
};

/** Destinatario fijo para pruebas */
const destinatarioFijo: DatosDestinatario = {
  usuario_id: "u-pbt-retry",
  email: "test@lexai.co",
  nombre: "Abogado PBT",
};

// ---------------------------------------------------------------------------
// Propiedades
// ---------------------------------------------------------------------------

describe("PBT — Reintentos con espaciado por canal (Property 21)", () => {
  it("Property 21.1: Para cualquier número de fallos (1 a 5), nunca supera MAX_INTENTOS (3) intentos totales", () => {
    fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 5 }),
        async (fallosConsecutivos) => {
          const canal = crearCanalConFallos(fallosConsecutivos);
          const esperarMock = vi.fn().mockResolvedValue(undefined);

          const resultado = await enviarConReintentos(
            canal,
            destinatarioFijo,
            contenidoFijo,
            esperarMock,
          );

          // Nunca supera MAX_INTENTOS
          expect(resultado.intentos).toBeLessThanOrEqual(MAX_INTENTOS);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("Property 21.2: Entre cada reintento, esperarFn se invoca con exactamente 60000ms", () => {
    fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 5 }),
        async (fallosConsecutivos) => {
          const canal = crearCanalConFallos(fallosConsecutivos);
          const esperarMock = vi.fn().mockResolvedValue(undefined);

          await enviarConReintentos(
            canal,
            destinatarioFijo,
            contenidoFijo,
            esperarMock,
          );

          // Cada llamada a esperarFn debe recibir ESPERA_ENTRE_REINTENTOS_MS (60000)
          for (const call of esperarMock.mock.calls) {
            expect(call[0]).toBe(ESPERA_ENTRE_REINTENTOS_MS);
          }

          // El número de esperas = número de reintentos realizados (intentos - 1, pero máximo 2)
          const intentosRealizados = Math.min(fallosConsecutivos + 1, MAX_INTENTOS);
          // esperarFn se llama entre intentos: si hay éxito en intento k, se esperó k-1 veces
          // Si falla todos (>=3 fallos): se esperó MAX_INTENTOS - 1 = 2 veces
          if (fallosConsecutivos >= MAX_INTENTOS) {
            // Todos los intentos fallan o el éxito está más allá del máximo
            expect(esperarMock).toHaveBeenCalledTimes(MAX_INTENTOS - 1);
          } else {
            // Éxito en intento fallosConsecutivos+1, esperó fallosConsecutivos veces
            expect(esperarMock).toHaveBeenCalledTimes(fallosConsecutivos);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("Property 21.3: Total intentos = min(fallos_antes_de_exito + 1, MAX_INTENTOS)", () => {
    fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 5 }),
        async (fallosAnteExito) => {
          const canal = crearCanalConFallos(fallosAnteExito);
          const esperarMock = vi.fn().mockResolvedValue(undefined);

          const resultado = await enviarConReintentos(
            canal,
            destinatarioFijo,
            contenidoFijo,
            esperarMock,
          );

          const intentosEsperados = Math.min(fallosAnteExito + 1, MAX_INTENTOS);
          expect(resultado.intentos).toBe(intentosEsperados);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("Property 21.4: Si tiene éxito en cualquier intento ≤ MAX_INTENTOS, retorna {exito: true}", () => {
    fc.assert(
      fc.asyncProperty(
        // Generar fallos entre 0 y MAX_INTENTOS-1 para garantizar que el éxito ocurre dentro del límite
        fc.integer({ min: 0, max: MAX_INTENTOS - 1 }),
        async (fallosAnteExito) => {
          const canal = crearCanalConFallos(fallosAnteExito);
          const esperarMock = vi.fn().mockResolvedValue(undefined);

          const resultado = await enviarConReintentos(
            canal,
            destinatarioFijo,
            contenidoFijo,
            esperarMock,
          );

          // Si el éxito ocurre dentro del límite de intentos, retorna exito: true
          expect(resultado.exito).toBe(true);
          expect(resultado.intentos).toBe(fallosAnteExito + 1);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("Property 21.5: Si todos los intentos fallan, retorna {exito: false} con error registrado", () => {
    fc.assert(
      fc.asyncProperty(
        // Generar fallos que exceden el máximo de intentos
        fc.integer({ min: MAX_INTENTOS, max: 10 }),
        async (fallosConsecutivos) => {
          const canal = crearCanalConFallos(fallosConsecutivos);
          const esperarMock = vi.fn().mockResolvedValue(undefined);

          const resultado = await enviarConReintentos(
            canal,
            destinatarioFijo,
            contenidoFijo,
            esperarMock,
          );

          // Si los fallos exceden el máximo, retorna exito: false
          expect(resultado.exito).toBe(false);
          expect(resultado.intentos).toBe(MAX_INTENTOS);
          expect(resultado.error).toBeDefined();
          expect(typeof resultado.error).toBe("string");
        },
      ),
      { numRuns: 100 },
    );
  });

  it("Property 21.6: Canal que siempre falla usa exactamente MAX_INTENTOS intentos y MAX_INTENTOS-1 esperas", () => {
    fc.assert(
      fc.asyncProperty(
        // Simplemente iterar para corroborar determinismo
        fc.integer({ min: 1, max: 100 }),
        async () => {
          const canal = crearCanalSiempreFalla();
          const esperarMock = vi.fn().mockResolvedValue(undefined);

          const resultado = await enviarConReintentos(
            canal,
            destinatarioFijo,
            contenidoFijo,
            esperarMock,
          );

          expect(resultado.exito).toBe(false);
          expect(resultado.intentos).toBe(MAX_INTENTOS);
          expect(esperarMock).toHaveBeenCalledTimes(MAX_INTENTOS - 1);

          // Verificar que cada espera fue de 60000ms
          esperarMock.mock.calls.forEach((call) => {
            expect(call[0]).toBe(ESPERA_ENTRE_REINTENTOS_MS);
          });
        },
      ),
      { numRuns: 100 },
    );
  });
});
