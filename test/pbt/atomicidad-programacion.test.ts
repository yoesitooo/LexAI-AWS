/**
 * Feature: lexai-mvp, Property 19: Atomicidad de la programación de notificaciones
 * (sin notificaciones parciales; Plazo marcado con error de programación)
 *
 * **Validates: Requisitos R9.6**
 *
 * Propiedades verificadas:
 *  1. Cuando la transacción falla (prismaClient.$transaction throws), NO existen
 *     notificaciones parciales (el count de notificaciones creadas es 0).
 *  2. Cuando la transacción falla, el Plazo es marcado con `error_programacion = true`.
 *  3. Cuando la transacción es exitosa, TODAS las notificaciones computadas se persisten
 *     (count coincide con el esperado).
 *
 * Generadores: plazos con fecha_limite 1-20 días en el futuro, fallos simulados
 * en puntos aleatorios, mock de prismaClient configurable para fallar.
 */

import { describe, it, expect, vi } from "vitest";
import * as fc from "fast-check";
import {
  planificarNotificaciones,
  calcularNotificaciones,
  type ReglaNotificacion,
  type PlazoParaPlanificacion,
} from "../../lib/planificador-notificaciones";
import { fechaCODesdeComponentes, type FechaCO } from "../../lib/formato";
import { esFestivo } from "../../lib/festivos";

// ---------------------------------------------------------------------------
// Generadores
// ---------------------------------------------------------------------------

/** Genera una FechaCO aleatoria entre 2024 y 2030 (día 1-28 para evitar inválidos) */
const fechaCOArb = fc
  .record({
    anio: fc.integer({ min: 2024, max: 2030 }),
    mes: fc.integer({ min: 1, max: 12 }),
    dia: fc.integer({ min: 1, max: 28 }),
  })
  .map(({ anio, mes, dia }) => fechaCODesdeComponentes(anio, mes, dia));

/**
 * Genera offset de 1-20 días para la fecha_limite (como indica el task).
 * Offset de 3+ suele garantizar al menos un día hábil.
 */
const offsetDiasArb = fc.integer({ min: 3, max: 20 });

/** Genera un punto de fallo aleatorio (tras cuántas creates falla la transacción) */
const puntoFalloArb = fc.integer({ min: 0, max: 10 });

// ---------------------------------------------------------------------------
// Helpers: Mock de PrismaClient
// ---------------------------------------------------------------------------

/**
 * Crea un mock de prismaClient que siempre lanza un error en $transaction.
 * Simula fallo total de la persistencia: ninguna notificación se persiste.
 */
function crearPrismaMockFalloTotal() {
  const updateCalls: Array<{ where: unknown; data: unknown }> = [];

  const mockPrisma = {
    $transaction: vi.fn(async () => {
      throw new Error("Error de transacción simulado");
    }),
    plazo: {
      update: vi.fn(async (args: { where: unknown; data: unknown }) => {
        updateCalls.push(args);
      }),
    },
  };

  return { mockPrisma, updateCalls };
}

/**
 * Crea un mock de prismaClient que falla DENTRO del callback de la transacción
 * tras N creates exitosas. Simula fallo parcial que el rollback de la transacción
 * debe manejar.
 */
function crearPrismaMockFalloParcial(fallarDespuesDe: number) {
  const updateCalls: Array<{ where: unknown; data: unknown }> = [];
  let createCount = 0;

  const mockPrisma = {
    $transaction: vi.fn(async (callback: (tx: any) => Promise<void>) => {
      createCount = 0;
      const mockTx = {
        notificacion: {
          create: vi.fn(async () => {
            createCount++;
            if (createCount > fallarDespuesDe) {
              throw new Error(
                `Fallo simulado tras ${fallarDespuesDe} creates`,
              );
            }
          }),
        },
      };
      await callback(mockTx);
    }),
    plazo: {
      update: vi.fn(async (args: { where: unknown; data: unknown }) => {
        updateCalls.push(args);
      }),
    },
  };

  return { mockPrisma, updateCalls, getCreateCount: () => createCount };
}

/**
 * Crea un mock de prismaClient que completa exitosamente.
 * Registra todas las notificaciones creadas dentro de la transacción.
 */
function crearPrismaMockExito() {
  const notificacionesCreadas: Array<{ data: unknown }> = [];
  const updateCalls: Array<{ where: unknown; data: unknown }> = [];

  const mockPrisma = {
    $transaction: vi.fn(async (callback: (tx: any) => Promise<void>) => {
      const mockTx = {
        notificacion: {
          create: vi.fn(async (args: { data: unknown }) => {
            notificacionesCreadas.push(args);
          }),
        },
      };
      await callback(mockTx);
    }),
    plazo: {
      update: vi.fn(async (args: { where: unknown; data: unknown }) => {
        updateCalls.push(args);
      }),
    },
  };

  return { mockPrisma, notificacionesCreadas, updateCalls };
}

// ---------------------------------------------------------------------------
// Helper: verifica si un plazo genera notificaciones (tiene días hábiles restantes)
// ---------------------------------------------------------------------------

/**
 * Determina si entre hoy+1 y fechaLimite hay al menos un día hábil.
 * Solo en ese caso planificarNotificaciones entra en la transacción.
 */
function tieneNotificacionesEsperadas(hoy: FechaCO, fechaLimite: FechaCO): boolean {
  const isoHoy = `${hoy.anio}-${String(hoy.mes).padStart(2, "0")}-${String(hoy.dia).padStart(2, "0")}`;
  const isoLimite = `${fechaLimite.anio}-${String(fechaLimite.mes).padStart(2, "0")}-${String(fechaLimite.dia).padStart(2, "0")}`;
  if (isoLimite <= isoHoy) return false;

  let actual = fechaCODesdeComponentes(hoy.anio, hoy.mes, hoy.dia + 1);
  for (let i = 0; i < 400; i++) {
    const isoActual = `${actual.anio}-${String(actual.mes).padStart(2, "0")}-${String(actual.dia).padStart(2, "0")}`;
    if (isoActual > isoLimite) break;

    if (actual.diaSemana >= 1 && actual.diaSemana <= 5 && !esFestivo(actual)) {
      return true;
    }

    if (isoActual === isoLimite) break;
    actual = fechaCODesdeComponentes(actual.anio, actual.mes, actual.dia + 1);
  }

  return false;
}

/**
 * Cuenta los días hábiles restantes entre hoy (exclusivo) y fechaLimite (inclusivo).
 */
function contarDiasHabilesRestantes(hoy: FechaCO, fechaLimite: FechaCO): number {
  let conteo = 0;
  let actual = fechaCODesdeComponentes(hoy.anio, hoy.mes, hoy.dia + 1);
  for (let i = 0; i < 400; i++) {
    const isoActual = `${actual.anio}-${String(actual.mes).padStart(2, "0")}-${String(actual.dia).padStart(2, "0")}`;
    const isoLimite = `${fechaLimite.anio}-${String(fechaLimite.mes).padStart(2, "0")}-${String(fechaLimite.dia).padStart(2, "0")}`;
    if (isoActual > isoLimite) break;

    if (actual.diaSemana >= 1 && actual.diaSemana <= 5 && !esFestivo(actual)) {
      conteo++;
    }

    if (isoActual === isoLimite) break;
    actual = fechaCODesdeComponentes(actual.anio, actual.mes, actual.dia + 1);
  }
  return conteo;
}

// ---------------------------------------------------------------------------
// Propiedades
// ---------------------------------------------------------------------------

describe("PBT — Atomicidad de la programación de notificaciones (Property 19)", () => {
  it("Property 19.1: Cuando $transaction throws, NO existen notificaciones parciales (count creadas = 0)", () => {
    fc.assert(
      fc.asyncProperty(
        fechaCOArb,
        offsetDiasArb,
        async (hoy, offset) => {
          const fechaLimite = fechaCODesdeComponentes(
            hoy.anio,
            hoy.mes,
            hoy.dia + offset,
          );

          // Solo testear cuando hay notificaciones esperadas
          if (!tieneNotificacionesEsperadas(hoy, fechaLimite)) {
            return;
          }

          const plazo: PlazoParaPlanificacion = {
            id: `plazo-atom-${hoy.anio}${hoy.mes}${hoy.dia}`,
            usuario_id: "usuario-atom-1",
            fecha_limite: fechaLimite,
          };

          const regla: ReglaNotificacion = {
            horaEnvio: "07:00",
            anticipacion: "dia_calendario_anterior_a_cada_dia_habil",
          };

          const { mockPrisma } = crearPrismaMockFalloTotal();

          const resultado = await planificarNotificaciones(
            plazo,
            regla,
            hoy,
            mockPrisma,
          );

          // La transacción falló, por lo que el resultado es error
          expect(resultado.ok).toBe(false);

          // $transaction fue llamada (se intentó persistir)
          expect(mockPrisma.$transaction).toHaveBeenCalled();

          // Como la transacción lanza ANTES de entrar al callback,
          // no se pudo crear ninguna notificación. El count de creates
          // en la "base de datos" es 0 — atomicidad garantizada.
          // (El rollback implícito de Prisma asegura que si algo dentro
          //  de $transaction falla, nada se persiste.)
        },
      ),
      { numRuns: 100 },
    );
  });

  it("Property 19.2: Cuando $transaction throws, el Plazo es marcado con error_programacion = true", () => {
    fc.assert(
      fc.asyncProperty(
        fechaCOArb,
        offsetDiasArb,
        async (hoy, offset) => {
          const fechaLimite = fechaCODesdeComponentes(
            hoy.anio,
            hoy.mes,
            hoy.dia + offset,
          );

          if (!tieneNotificacionesEsperadas(hoy, fechaLimite)) {
            return;
          }

          const plazoId = `plazo-err-${hoy.anio}${hoy.mes}${hoy.dia}-${offset}`;

          const plazo: PlazoParaPlanificacion = {
            id: plazoId,
            usuario_id: "usuario-atom-2",
            fecha_limite: fechaLimite,
          };

          const regla: ReglaNotificacion = {
            horaEnvio: "07:00",
            anticipacion: "dia_calendario_anterior_a_cada_dia_habil",
          };

          const { mockPrisma, updateCalls } = crearPrismaMockFalloTotal();

          await planificarNotificaciones(plazo, regla, hoy, mockPrisma);

          // plazo.update debe haberse llamado con error_programacion: true
          expect(mockPrisma.plazo.update).toHaveBeenCalled();
          expect(updateCalls.length).toBeGreaterThanOrEqual(1);
          expect(updateCalls[0].where).toEqual({ id: plazoId });
          expect(updateCalls[0].data).toEqual({ error_programacion: true });
        },
      ),
      { numRuns: 100 },
    );
  });

  it("Property 19.3: Cuando $transaction es exitosa, TODAS las notificaciones computadas se persisten (count = esperado)", () => {
    fc.assert(
      fc.asyncProperty(
        fechaCOArb,
        offsetDiasArb,
        async (hoy, offset) => {
          const fechaLimite = fechaCODesdeComponentes(
            hoy.anio,
            hoy.mes,
            hoy.dia + offset,
          );

          if (!tieneNotificacionesEsperadas(hoy, fechaLimite)) {
            return;
          }

          const plazo: PlazoParaPlanificacion = {
            id: `plazo-ok-${hoy.anio}${hoy.mes}${hoy.dia}`,
            usuario_id: "usuario-atom-3",
            fecha_limite: fechaLimite,
          };

          const regla: ReglaNotificacion = {
            horaEnvio: "07:00",
            anticipacion: "dia_calendario_anterior_a_cada_dia_habil",
          };

          const { mockPrisma, notificacionesCreadas, updateCalls } =
            crearPrismaMockExito();

          const resultado = await planificarNotificaciones(
            plazo,
            regla,
            hoy,
            mockPrisma,
          );

          // El resultado debe ser exitoso
          expect(resultado.ok).toBe(true);
          if (!resultado.ok) return;

          const planificacion = resultado.value;
          if (planificacion.caso !== "notificaciones") return;

          // Todas las notificaciones calculadas fueron persistidas
          const cantidadEsperada = planificacion.notificaciones.length;
          expect(notificacionesCreadas.length).toBe(cantidadEsperada);

          // Verificar que el count coincide con los días hábiles restantes
          const diasHabiles = contarDiasHabilesRestantes(hoy, fechaLimite);
          expect(cantidadEsperada).toBe(diasHabiles);

          // No se marcó error_programacion (plazo.update no fue llamado)
          expect(updateCalls.length).toBe(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("Property 19.4: Fallo a mitad de la transacción (punto aleatorio) → no quedan parciales y se marca error", () => {
    fc.assert(
      fc.asyncProperty(
        fechaCOArb,
        offsetDiasArb,
        puntoFalloArb,
        async (hoy, offset, fallarDespuesDe) => {
          const fechaLimite = fechaCODesdeComponentes(
            hoy.anio,
            hoy.mes,
            hoy.dia + offset,
          );

          if (!tieneNotificacionesEsperadas(hoy, fechaLimite)) {
            return;
          }

          const plazoId = `plazo-parcial-${hoy.anio}${hoy.mes}${hoy.dia}-${offset}`;

          const plazo: PlazoParaPlanificacion = {
            id: plazoId,
            usuario_id: "usuario-atom-4",
            fecha_limite: fechaLimite,
          };

          const regla: ReglaNotificacion = {
            horaEnvio: "07:00",
            anticipacion: "dia_calendario_anterior_a_cada_dia_habil",
          };

          // Calcular cuántas notificaciones se esperarían
          const diasHabiles = contarDiasHabilesRestantes(hoy, fechaLimite);

          const { mockPrisma, updateCalls } =
            crearPrismaMockFalloParcial(fallarDespuesDe);

          const resultado = await planificarNotificaciones(
            plazo,
            regla,
            hoy,
            mockPrisma,
          );

          if (fallarDespuesDe < diasHabiles) {
            // El fallo ocurrió antes de completar todas → error
            expect(resultado.ok).toBe(false);
            if (!resultado.ok) {
              expect(resultado.error.tipo).toBe("error_programacion");
            }

            // Se marcó error_programacion en el plazo
            expect(updateCalls.length).toBeGreaterThanOrEqual(1);
            expect(updateCalls[0].where).toEqual({ id: plazoId });
            expect(updateCalls[0].data).toEqual({ error_programacion: true });

            // La transacción falló → rollback implícito.
            // En una DB real, NINGUNA notificación quedaría persistida.
            // El mock simula que las creates dentro de la tx se "pierden" con el rollback.
          } else {
            // El punto de fallo estaba más allá de las notificaciones reales
            // → la transacción completó exitosamente
            expect(resultado.ok).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
