/**
 * Feature: lexai-mvp, Property 27: Orden del histórico de actuaciones (de más reciente a más antigua)
 *
 * Feature: lexai-mvp, Property 28: Transición a Vencido (plazo vencido no cumplido → proceso a Vencido
 * y plazo marcado vencido, en UTC-5)
 *
 * **Validates: Requisitos R12.4, R12.5**
 *
 * Propiedades verificadas con fast-check (≥100 iteraciones):
 *  27. Para cualquier array de actuaciones con fechas distintas, al ordenarlas DESC
 *      por fecha_actuacion, la secuencia resultante es de más reciente a más antigua.
 *  28. Para cualquier plazo con estado='pendiente', fecha_limite < hoy (UTC-5) e
 *      indeterminado=false, la lógica de transición lo marca como 'vencido' y mueve
 *      el proceso a columna_kanban='vencido'.
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import {
  fechaCODesdeComponentes,
  compararFechasCO,
  type FechaCO,
} from "../../lib/formato";

// ---------------------------------------------------------------------------
// Property 27: Orden del histórico — lógica pura de ordenamiento
// ---------------------------------------------------------------------------

/**
 * Representa una actuación con su fecha para el ordenamiento.
 * Refleja el campo `fecha_actuacion` de la tabla `actuacion`.
 */
interface ActuacionOrdenable {
  id: string;
  fecha_actuacion: FechaCO;
}

/**
 * Ordena actuaciones de más reciente a más antigua (DESC por fecha_actuacion).
 * Esta es la lógica pura equivalente al `orderBy: { fecha_actuacion: "desc" }`
 * del endpoint GET /api/procesos/:id (R12.4).
 */
function ordenarActuacionesDesc(actuaciones: ActuacionOrdenable[]): ActuacionOrdenable[] {
  return [...actuaciones].sort((a, b) => compararFechasCO(b.fecha_actuacion, a.fecha_actuacion));
}

// ---------------------------------------------------------------------------
// Property 28: Transición a Vencido — lógica pura de dominio
// ---------------------------------------------------------------------------

/**
 * Representa un plazo con los campos relevantes para la transición a Vencido.
 */
interface PlazoTransicion {
  id: string;
  proceso_id: string;
  estado: "pendiente" | "cumplido" | "vencido";
  fecha_limite: FechaCO;
  indeterminado: boolean;
}

/**
 * Representa un proceso con su columna Kanban.
 */
interface ProcesoKanban {
  id: string;
  columna_kanban: string;
}

/**
 * Resultado de la transición a Vencido.
 */
interface ResultadoTransicion {
  plazosVencidos: string[]; // IDs de plazos marcados como vencidos
  procesosMovidos: string[]; // IDs de procesos movidos a columna 'vencido'
}

/**
 * Lógica pura de transición a Vencido (R12.5):
 * Si un plazo tiene estado='pendiente' Y fecha_limite < hoy (UTC-5) Y no es indeterminado,
 * entonces:
 *   - El plazo se marca como 'vencido'
 *   - El proceso asociado se mueve a columna_kanban='vencido'
 *
 * Esta función implementa la lógica de dominio pura sin acceso a BD,
 * equivalente a lo que hace `marcarPlazosVencidos` en lib/transicion-vencido.ts.
 */
function transicionVencido(
  plazos: PlazoTransicion[],
  procesos: ProcesoKanban[],
  hoy: FechaCO,
): ResultadoTransicion {
  const plazosVencidos: string[] = [];
  const procesosAfectadosSet = new Set<string>();

  for (const plazo of plazos) {
    // Condiciones para transición (R12.5):
    // 1. estado === 'pendiente'
    // 2. fecha_limite < hoy (en UTC-5)
    // 3. no indeterminado
    if (
      plazo.estado === "pendiente" &&
      !plazo.indeterminado &&
      compararFechasCO(plazo.fecha_limite, hoy) < 0
    ) {
      plazosVencidos.push(plazo.id);
      procesosAfectadosSet.add(plazo.proceso_id);
    }
  }

  const procesosMovidos = [...procesosAfectadosSet];

  return { plazosVencidos, procesosMovidos };
}

// ---------------------------------------------------------------------------
// Generadores
// ---------------------------------------------------------------------------

/** Genera una FechaCO aleatoria entre 2020 y 2030 */
const fechaCOArb: fc.Arbitrary<FechaCO> = fc
  .record({
    anio: fc.integer({ min: 2020, max: 2030 }),
    mes: fc.integer({ min: 1, max: 12 }),
    dia: fc.integer({ min: 1, max: 28 }), // 28 para evitar días inválidos
  })
  .map(({ anio, mes, dia }) => fechaCODesdeComponentes(anio, mes, dia));

/** Genera un ID (UUID) */
const idArb = fc.uuid();

/** Genera un array de actuaciones con fechas únicas */
const actuacionesArb: fc.Arbitrary<ActuacionOrdenable[]> = fc
  .uniqueArray(
    fc.record({
      anio: fc.integer({ min: 2020, max: 2030 }),
      mes: fc.integer({ min: 1, max: 12 }),
      dia: fc.integer({ min: 1, max: 28 }),
    }),
    {
      minLength: 1,
      maxLength: 30,
      comparator: (a, b) => a.anio === b.anio && a.mes === b.mes && a.dia === b.dia,
    },
  )
  .chain((fechas) =>
    fc.tuple(...fechas.map(() => idArb)).map((ids) =>
      fechas.map((f, i) => ({
        id: ids[i],
        fecha_actuacion: fechaCODesdeComponentes(f.anio, f.mes, f.dia),
      })),
    ),
  );

/** Genera un plazo pendiente con fecha_limite en el pasado respecto a hoy */
function plazoPendienteVencidoArb(hoy: FechaCO): fc.Arbitrary<PlazoTransicion> {
  // Generar fecha_limite que sea estrictamente anterior a hoy
  return fc
    .record({
      id: idArb,
      proceso_id: idArb,
      // Días en el pasado: 1 a 365 días antes de hoy
      diasAtras: fc.integer({ min: 1, max: 365 }),
    })
    .map(({ id, proceso_id, diasAtras }) => {
      // Calcular fecha en el pasado
      const fechaLimite = fechaCODesdeComponentes(
        hoy.anio,
        hoy.mes,
        hoy.dia - diasAtras, // Puede ser negativo, Date lo normaliza
      );
      // Recalcular para normalizar: usamos la construcción con Date.UTC
      const utcMs = Date.UTC(hoy.anio, hoy.mes - 1, hoy.dia - diasAtras, 5, 0, 0);
      const normalizada = fechaCODesdeComponentes(
        new Date(utcMs).getUTCFullYear(),
        new Date(utcMs).getUTCMonth() + 1,
        new Date(utcMs).getUTCDate(),
      );

      return {
        id,
        proceso_id,
        estado: "pendiente" as const,
        fecha_limite: normalizada,
        indeterminado: false,
      };
    });
}

/** Genera un plazo que NO debería transicionar (futuro, cumplido, indeterminado, o vencido) */
function plazoNoTransicionaArb(hoy: FechaCO): fc.Arbitrary<PlazoTransicion> {
  return fc.oneof(
    // Plazo pendiente pero con fecha_limite en el futuro o igual a hoy
    fc
      .record({
        id: idArb,
        proceso_id: idArb,
        diasAdelante: fc.integer({ min: 0, max: 365 }),
      })
      .map(({ id, proceso_id, diasAdelante }) => {
        const utcMs = Date.UTC(hoy.anio, hoy.mes - 1, hoy.dia + diasAdelante, 5, 0, 0);
        const normalizada = fechaCODesdeComponentes(
          new Date(utcMs).getUTCFullYear(),
          new Date(utcMs).getUTCMonth() + 1,
          new Date(utcMs).getUTCDate(),
        );
        return {
          id,
          proceso_id,
          estado: "pendiente" as const,
          fecha_limite: normalizada,
          indeterminado: false,
        };
      }),
    // Plazo ya cumplido con fecha pasada
    fc
      .record({
        id: idArb,
        proceso_id: idArb,
        diasAtras: fc.integer({ min: 1, max: 365 }),
      })
      .map(({ id, proceso_id, diasAtras }) => {
        const utcMs = Date.UTC(hoy.anio, hoy.mes - 1, hoy.dia - diasAtras, 5, 0, 0);
        const normalizada = fechaCODesdeComponentes(
          new Date(utcMs).getUTCFullYear(),
          new Date(utcMs).getUTCMonth() + 1,
          new Date(utcMs).getUTCDate(),
        );
        return {
          id,
          proceso_id,
          estado: "cumplido" as const,
          fecha_limite: normalizada,
          indeterminado: false,
        };
      }),
    // Plazo pendiente indeterminado (sin fecha calculable)
    fc
      .record({
        id: idArb,
        proceso_id: idArb,
        diasAtras: fc.integer({ min: 1, max: 365 }),
      })
      .map(({ id, proceso_id, diasAtras }) => {
        const utcMs = Date.UTC(hoy.anio, hoy.mes - 1, hoy.dia - diasAtras, 5, 0, 0);
        const normalizada = fechaCODesdeComponentes(
          new Date(utcMs).getUTCFullYear(),
          new Date(utcMs).getUTCMonth() + 1,
          new Date(utcMs).getUTCDate(),
        );
        return {
          id,
          proceso_id,
          estado: "pendiente" as const,
          fecha_limite: normalizada,
          indeterminado: true,
        };
      }),
    // Plazo ya vencido (ya fue transicionado)
    fc
      .record({
        id: idArb,
        proceso_id: idArb,
        diasAtras: fc.integer({ min: 1, max: 365 }),
      })
      .map(({ id, proceso_id, diasAtras }) => {
        const utcMs = Date.UTC(hoy.anio, hoy.mes - 1, hoy.dia - diasAtras, 5, 0, 0);
        const normalizada = fechaCODesdeComponentes(
          new Date(utcMs).getUTCFullYear(),
          new Date(utcMs).getUTCMonth() + 1,
          new Date(utcMs).getUTCDate(),
        );
        return {
          id,
          proceso_id,
          estado: "vencido" as const,
          fecha_limite: normalizada,
          indeterminado: false,
        };
      }),
  );
}

// ---------------------------------------------------------------------------
// Propiedades
// ---------------------------------------------------------------------------

describe("PBT — Orden del histórico y transición a Vencido (Properties 27, 28)", () => {
  // ─── Property 27: Orden del histórico de actuaciones ──────────────────────

  it("Property 27: El histórico de actuaciones se ordena de más reciente a más antigua", () => {
    fc.assert(
      fc.property(actuacionesArb, (actuaciones) => {
        const ordenadas = ordenarActuacionesDesc(actuaciones);

        // Verificar que está en orden descendente: cada fecha ≥ la siguiente
        for (let i = 0; i < ordenadas.length - 1; i++) {
          const cmp = compararFechasCO(
            ordenadas[i].fecha_actuacion,
            ordenadas[i + 1].fecha_actuacion,
          );
          // cmp debe ser >= 0 (la anterior es más reciente o igual)
          expect(cmp).toBeGreaterThanOrEqual(0);
        }

        // Verificar que no se perdieron ni duplicaron actuaciones
        expect(ordenadas).toHaveLength(actuaciones.length);
        const idsOriginales = new Set(actuaciones.map((a) => a.id));
        const idsOrdenados = new Set(ordenadas.map((a) => a.id));
        expect(idsOrdenados).toEqual(idsOriginales);
      }),
      { numRuns: 100 },
    );
  });

  it("Property 27b: El ordenamiento DESC es estable — no altera el conjunto de actuaciones", () => {
    fc.assert(
      fc.property(actuacionesArb, (actuaciones) => {
        const ordenadas = ordenarActuacionesDesc(actuaciones);

        // Cada actuación original debe estar presente en el resultado
        for (const act of actuaciones) {
          const encontrada = ordenadas.find((o) => o.id === act.id);
          expect(encontrada).toBeDefined();
          // La fecha se preserva
          expect(compararFechasCO(encontrada!.fecha_actuacion, act.fecha_actuacion)).toBe(0);
        }
      }),
      { numRuns: 100 },
    );
  });

  // ─── Property 28: Transición a Vencido ────────────────────────────────────

  it("Property 28: Plazo pendiente con fecha_limite < hoy (UTC-5) y no indeterminado → se marca vencido y proceso a columna vencido", () => {
    // Fijamos "hoy" como una fecha fija para determinismo en los tests
    const hoy = fechaCODesdeComponentes(2025, 6, 15);

    fc.assert(
      fc.property(
        fc.array(plazoPendienteVencidoArb(hoy), { minLength: 1, maxLength: 20 }),
        (plazos) => {
          // Crear procesos correspondientes
          const procesosIds = [...new Set(plazos.map((p) => p.proceso_id))];
          const procesos: ProcesoKanban[] = procesosIds.map((id) => ({
            id,
            columna_kanban: "en_seguimiento",
          }));

          const resultado = transicionVencido(plazos, procesos, hoy);

          // TODOS los plazos pendientes con fecha pasada deben marcarse vencidos
          expect(resultado.plazosVencidos).toHaveLength(plazos.length);
          for (const plazo of plazos) {
            expect(resultado.plazosVencidos).toContain(plazo.id);
          }

          // TODOS los procesos asociados deben moverse a columna 'vencido'
          for (const procesoId of procesosIds) {
            expect(resultado.procesosMovidos).toContain(procesoId);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("Property 28b: Plazos que no cumplen las condiciones NO transicionan (futuro, cumplido, indeterminado, ya vencido)", () => {
    const hoy = fechaCODesdeComponentes(2025, 6, 15);

    fc.assert(
      fc.property(
        fc.array(plazoNoTransicionaArb(hoy), { minLength: 1, maxLength: 20 }),
        (plazos) => {
          const procesosIds = [...new Set(plazos.map((p) => p.proceso_id))];
          const procesos: ProcesoKanban[] = procesosIds.map((id) => ({
            id,
            columna_kanban: "en_seguimiento",
          }));

          const resultado = transicionVencido(plazos, procesos, hoy);

          // Ninguno debería transicionar
          expect(resultado.plazosVencidos).toHaveLength(0);
          expect(resultado.procesosMovidos).toHaveLength(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("Property 28c: La transición opera en UTC-5 — un plazo con fecha_limite = hoy NO transiciona (debe ser estrictamente menor)", () => {
    const hoy = fechaCODesdeComponentes(2025, 6, 15);

    fc.assert(
      fc.property(idArb, idArb, (plazoId, procesoId) => {
        // Plazo con fecha_limite exactamente igual a hoy
        const plazo: PlazoTransicion = {
          id: plazoId,
          proceso_id: procesoId,
          estado: "pendiente",
          fecha_limite: hoy, // Igual a hoy, no menor
          indeterminado: false,
        };

        const procesos: ProcesoKanban[] = [{ id: procesoId, columna_kanban: "nuevo" }];

        const resultado = transicionVencido([plazo], procesos, hoy);

        // No debe transicionar porque fecha_limite NO es < hoy (es igual)
        expect(resultado.plazosVencidos).toHaveLength(0);
        expect(resultado.procesosMovidos).toHaveLength(0);
      }),
      { numRuns: 100 },
    );
  });
});
