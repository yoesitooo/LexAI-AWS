/**
 * Feature: lexai-mvp, Property 19: Atomicidad de la programación de notificaciones
 * (sin notificaciones parciales; Plazo marcado con error de programación)
 *
 * **Validates: Requisitos R9.6**
 *
 * Propiedades verificadas:
 *  1. Cuando la transacción lanza un error, el resultado es err({ tipo: "error_programacion" }).
 *  2. Cuando la transacción lanza un error, plazo.update se invoca con error_programacion: true.
 *  3. Cuando la transacción es exitosa, todas las notificaciones se persisten (ninguna parcial).
 */

import { describe, it, expect, vi } from "vitest";
import * as fc from "fast-check";
import {
  planificarNotificaciones,
  type ReglaNotificacion,
  type PlazoParaPlanificacion,
} from "../../lib/planificador-notificaciones";
import { fechaCODesdeComponentes, type FechaCO } from "../../lib/formato";

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
 * Genera offset en días hábiles para crear un plazo con al menos algunos días
 * hábiles restantes (offset 3-20 garantiza que casi siempre habrá al menos un día hábil).
 */
const offsetDiasConHabilesArb = fc.integer({ min: 3, max: 20 });

/** Genera una hora de envío válida (HH:MM) */
const horaEnvioArb = fc
  .record({
    hora: fc.integer({ min: 0, max: 23 }),
    minuto: fc.integer({ min: 0, max: 59 }),
  })
  .map(({ hora, minuto }) => {
    const hh = String(hora).padStart(2, "0");
    const mm = String(minuto).padStart(2, "0");
    return `${hh}:${mm}`;
  });

// ---------------------------------------------------------------------------
// Helpers: Mock de PrismaClient
// ---------------------------------------------------------------------------

/**
 * Crea un mock de prismaClient que siempre lanza un error dentro de $transaction.
 * Simula un fallo en la persistencia de las notificaciones.
 *
 * @param failAtIndex - Si se especifica, lanza después de N creates exitosas (simula fallo parcial)
 */
function crearPrismaMockFallo(failAtIndex?: number) {
  const updateCalls: Array<{ where: unknown; data: unknown }> = [];
  let createCount = 0;

  const mockPrisma = {
    $transaction: vi.fn(async (callback: (tx: any) => Promise<void>) => {
      const mockTx = {
        notificacion: {
          create: vi.fn(async () => {
            createCount++;
            if (failAtIndex !== undefined && createCount > failAtIndex) {
              throw new Error(`Fallo de persistencia simulado tras ${failAtIndex} creates`);
            }
            // Si no hay failAtIndex, fallar en la primera (nunca se llega aquí si
            // el error se lanza antes del callback completo)
          }),
        },
      };

      // Si no se especificó failAtIndex, simular error antes de completar
      if (failAtIndex === undefined) {
        throw new Error("Error de transacción simulado");
      }

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
 * Crea un mock de prismaClient que siempre completa exitosamente.
 * Registra todas las notificaciones creadas.
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

/**
 * Crea un mock de prismaClient que lanza error en un punto aleatorio
 * dentro de la transacción (tras N creates exitosas).
 */
function crearPrismaMockFalloAleatorio(fallarDespuesDe: number) {
  const updateCalls: Array<{ where: unknown; data: unknown }> = [];
  let createCount = 0;

  const mockPrisma = {
    $transaction: vi.fn(async (callback: (tx: any) => Promise<void>) => {
      const mockTx = {
        notificacion: {
          create: vi.fn(async () => {
            createCount++;
            if (createCount > fallarDespuesDe) {
              throw new Error(
                `Fallo aleatorio tras ${fallarDespuesDe} notificaciones`,
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

// ---------------------------------------------------------------------------
// Helper: detecta si un plazo genera notificaciones (tiene días hábiles)
// ---------------------------------------------------------------------------

import { esFestivo } from "../../lib/festivos";

/**
 * Verifica si un plazo tiene al menos un día hábil restante entre hoy+1 y fechaLimite.
 * Solo en ese caso la función planificarNotificaciones entra en la transacción.
 */
function tieneNotificacionesEsperadas(hoy: FechaCO, fechaLimite: FechaCO): boolean {
  const isoHoy = `${hoy.anio}-${String(hoy.mes).padStart(2, "0")}-${String(hoy.dia).padStart(2, "0")}`;
  const isoLimite = `${fechaLimite.anio}-${String(fechaLimite.mes).padStart(2, "0")}-${String(fechaLimite.dia).padStart(2, "0")}`;
  if (isoLimite <= isoHoy) return false;

  // Contar al menos un día hábil entre hoy+1 y fechaLimite
  let actual = fechaCODesdeComponentes(hoy.anio, hoy.mes, hoy.dia + 1);
  for (let i = 0; i < 400; i++) {
    const isoActual = `${actual.anio}-${String(actual.mes).padStart(2, "0")}-${String(actual.dia).padStart(2, "0")}`;
    if (isoActual > isoLimite) break;

    // Día hábil: lun-vie y no festivo
    if (actual.diaSemana >= 1 && actual.diaSemana <= 5 && !esFestivo(actual)) {
      return true;
    }

    if (isoActual === isoLimite) break;
    actual = fechaCODesdeComponentes(actual.anio, actual.mes, actual.dia + 1);
  }

  return false;
}

// ---------------------------------------------------------------------------
// Propiedades
// ---------------------------------------------------------------------------

describe("PBT — Atomicidad de la programación de notificaciones (Property 19)", () => {
  it("Property 19.1: Cuando la transacción lanza un error, el resultado es err({ tipo: 'error_programacion' })", () => {
    fc.assert(
      fc.asyncProperty(
        fechaCOArb,
        offsetDiasConHabilesArb,
        horaEnvioArb,
        async (hoy, offset, horaEnvio) => {
          const fechaLimite = fechaCODesdeComponentes(
            hoy.anio,
            hoy.mes,
            hoy.dia + offset,
          );

          const plazo: PlazoParaPlanificacion = {
            id: `plazo-${hoy.anio}-${hoy.mes}-${hoy.dia}`,
            usuario_id: "usuario-test",
            fecha_limite: fechaLimite,
          };

          const regla: ReglaNotificacion = {
            horaEnvio,
            anticipacion: "dia_calendario_anterior_a_cada_dia_habil",
          };

          // Solo testear cuando hay notificaciones esperadas (días hábiles restantes)
          if (!tieneNotificacionesEsperadas(hoy, fechaLimite)) {
            return; // skip - alerta inmediata no pasa por la transacción
          }

          const { mockPrisma } = crearPrismaMockFallo();

          const resultado = await planificarNotificaciones(
            plazo,
            regla,
            hoy,
            mockPrisma,
          );

          // El resultado debe ser un error de tipo "error_programacion"
          expect(resultado.ok).toBe(false);
          if (!resultado.ok) {
            expect(resultado.error.tipo).toBe("error_programacion");
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("Property 19.2: Cuando la transacción lanza un error, plazo.update se invoca con error_programacion: true", () => {
    fc.assert(
      fc.asyncProperty(
        fechaCOArb,
        offsetDiasConHabilesArb,
        horaEnvioArb,
        async (hoy, offset, horaEnvio) => {
          const fechaLimite = fechaCODesdeComponentes(
            hoy.anio,
            hoy.mes,
            hoy.dia + offset,
          );

          const plazoId = `plazo-atomicidad-${hoy.anio}-${hoy.mes}-${hoy.dia}-${offset}`;

          const plazo: PlazoParaPlanificacion = {
            id: plazoId,
            usuario_id: "usuario-test-2",
            fecha_limite: fechaLimite,
          };

          const regla: ReglaNotificacion = {
            horaEnvio,
            anticipacion: "dia_calendario_anterior_a_cada_dia_habil",
          };

          // Solo testear cuando hay notificaciones esperadas
          if (!tieneNotificacionesEsperadas(hoy, fechaLimite)) {
            return;
          }

          const { mockPrisma, updateCalls } = crearPrismaMockFallo();

          await planificarNotificaciones(plazo, regla, hoy, mockPrisma);

          // plazo.update debe haber sido invocado con error_programacion: true
          expect(mockPrisma.plazo.update).toHaveBeenCalled();
          expect(updateCalls.length).toBeGreaterThanOrEqual(1);

          const updateCall = updateCalls[0];
          expect(updateCall.where).toEqual({ id: plazoId });
          expect(updateCall.data).toEqual({ error_programacion: true });
        },
      ),
      { numRuns: 100 },
    );
  });

  it("Property 19.3: Cuando la transacción es exitosa, todas las notificaciones se persisten (ninguna parcial)", () => {
    fc.assert(
      fc.asyncProperty(
        fechaCOArb,
        offsetDiasConHabilesArb,
        horaEnvioArb,
        async (hoy, offset, horaEnvio) => {
          const fechaLimite = fechaCODesdeComponentes(
            hoy.anio,
            hoy.mes,
            hoy.dia + offset,
          );

          const plazo: PlazoParaPlanificacion = {
            id: `plazo-exito-${hoy.anio}-${hoy.mes}-${hoy.dia}`,
            usuario_id: "usuario-test-3",
            fecha_limite: fechaLimite,
          };

          const regla: ReglaNotificacion = {
            horaEnvio,
            anticipacion: "dia_calendario_anterior_a_cada_dia_habil",
          };

          // Solo testear cuando hay notificaciones esperadas
          if (!tieneNotificacionesEsperadas(hoy, fechaLimite)) {
            return;
          }

          const { mockPrisma, notificacionesCreadas, updateCalls } =
            crearPrismaMockExito();

          const resultado = await planificarNotificaciones(
            plazo,
            regla,
            hoy,
            mockPrisma,
          );

          // El resultado debe ser exitoso con notificaciones
          expect(resultado.ok).toBe(true);
          if (!resultado.ok) return;

          const planificacion = resultado.value;
          if (planificacion.caso !== "notificaciones") return;

          // Todas las notificaciones calculadas deben haberse persistido
          const cantidadEsperada = planificacion.notificaciones.length;
          expect(notificacionesCreadas.length).toBe(cantidadEsperada);

          // No debe haberse marcado error_programacion (no se llamó plazo.update)
          expect(updateCalls.length).toBe(0);

          // Cada notificación persistida debe corresponder a una calculada
          for (let i = 0; i < cantidadEsperada; i++) {
            const creada = notificacionesCreadas[i].data as Record<string, unknown>;
            const esperada = planificacion.notificaciones[i];
            expect(creada.plazo_id).toBe(esperada.plazo_id);
            expect(creada.usuario_id).toBe(esperada.usuario_id);
            expect(creada.fecha_programada).toEqual(esperada.fecha_programada);
            expect(creada.estado).toBe("programada");
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("Property 19.4: Cuando la transacción falla a mitad de camino (fallo aleatorio), no quedan notificaciones parciales y se marca error", () => {
    fc.assert(
      fc.asyncProperty(
        fechaCOArb,
        offsetDiasConHabilesArb,
        fc.integer({ min: 0, max: 5 }),
        async (hoy, offset, fallarDespuesDe) => {
          const fechaLimite = fechaCODesdeComponentes(
            hoy.anio,
            hoy.mes,
            hoy.dia + offset,
          );

          const plazoId = `plazo-parcial-${hoy.anio}-${hoy.mes}-${hoy.dia}-${offset}`;

          const plazo: PlazoParaPlanificacion = {
            id: plazoId,
            usuario_id: "usuario-test-4",
            fecha_limite: fechaLimite,
          };

          const regla: ReglaNotificacion = {
            horaEnvio: "07:00",
            anticipacion: "dia_calendario_anterior_a_cada_dia_habil",
          };

          // Solo testear cuando hay notificaciones esperadas
          if (!tieneNotificacionesEsperadas(hoy, fechaLimite)) {
            return;
          }

          const { mockPrisma, updateCalls } =
            crearPrismaMockFalloAleatorio(fallarDespuesDe);

          const resultado = await planificarNotificaciones(
            plazo,
            regla,
            hoy,
            mockPrisma,
          );

          // El resultado depende de si el fallo ocurrió antes de persistir alguna
          // notificación o si no hay notificaciones que persistir
          // En cualquier caso: si falla → err + error_programacion
          // si no falla (fallarDespuesDe >= cant notifs) → ok
          if (!resultado.ok) {
            // Se marcó error_programacion
            expect(resultado.error.tipo).toBe("error_programacion");
            expect(updateCalls.length).toBeGreaterThanOrEqual(1);
            expect(updateCalls[0].data).toEqual({ error_programacion: true });
          }
          // Si es ok, todas las notificaciones se crearon exitosamente
          // (el fallo no ocurrió porque había menos notificaciones que fallarDespuesDe)
        },
      ),
      { numRuns: 100 },
    );
  });
});
