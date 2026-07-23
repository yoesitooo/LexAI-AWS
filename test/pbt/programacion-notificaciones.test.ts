/**
 * Feature: lexai-mvp, Property 18: Programación de notificaciones
 * (una por cada día hábil restante, fijada al día calendario anterior
 * a la hora configurada en UTC-5, sin omitir cuando cae en fin de semana/festivo)
 *
 * **Validates: Requisitos R9.1, R9.3, R9.4**
 *
 * Propiedades verificadas:
 *  1. Número de notificaciones = número de días hábiles restantes entre hoy+1 y fecha_limite.
 *  2. Cada notificación se programa el día calendario ANTERIOR a su día hábil correspondiente.
 *  3. La hora programada es horaEnvio (configurable) en UTC-5 (America/Bogotá).
 *  4. Se programan notificaciones incluso si el día anterior cae en fin de semana o festivo
 *     (es un día calendario, no necesita ser hábil).
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import {
  calcularNotificaciones,
  obtenerDiasHabilesRestantes,
  type ReglaNotificacion,
  type PlazoParaPlanificacion,
} from "../../lib/planificador-notificaciones";
import { fechaCODesdeComponentes, crearFechaCO, type FechaCO } from "../../lib/formato";
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

/** Genera fecha_limite como hoy + 1..30 días (garantiza al menos un día restante) */
const offsetDiasArb = fc.integer({ min: 1, max: 30 });

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
// Helpers de verificación independiente
// ---------------------------------------------------------------------------

/**
 * Verifica si una FechaCO es día hábil (lun-vie, no festivo colombiano).
 */
function esDiaHabil(fecha: FechaCO): boolean {
  return fecha.diaSemana >= 1 && fecha.diaSemana <= 5 && !esFestivo(fecha);
}

/**
 * Cuenta los días hábiles entre hoy (exclusivo) y fechaLimite (inclusivo).
 * Implementación independiente para verificación.
 */
function contarDiasHabilesRestantesIndependiente(hoy: FechaCO, fechaLimite: FechaCO): number {
  let conteo = 0;
  let actual = hoy;
  let iteraciones = 0;

  while (iteraciones < 400) {
    actual = fechaCODesdeComponentes(actual.anio, actual.mes, actual.dia + 1);
    iteraciones++;

    // Si ya pasamos la fecha límite, salimos
    if (
      actual.anio > fechaLimite.anio ||
      (actual.anio === fechaLimite.anio && actual.mes > fechaLimite.mes) ||
      (actual.anio === fechaLimite.anio &&
        actual.mes === fechaLimite.mes &&
        actual.dia > fechaLimite.dia)
    ) {
      break;
    }

    if (esDiaHabil(actual)) {
      conteo++;
    }

    // Si llegamos a la fecha límite, salimos
    if (
      actual.anio === fechaLimite.anio &&
      actual.mes === fechaLimite.mes &&
      actual.dia === fechaLimite.dia
    ) {
      break;
    }
  }

  return conteo;
}

/**
 * Obtiene los días hábiles restantes entre hoy (exclusivo) y fechaLimite (inclusivo).
 * Implementación independiente para verificación.
 */
function obtenerDiasHabilesIndependiente(hoy: FechaCO, fechaLimite: FechaCO): FechaCO[] {
  const resultado: FechaCO[] = [];
  let actual = hoy;
  let iteraciones = 0;

  while (iteraciones < 400) {
    actual = fechaCODesdeComponentes(actual.anio, actual.mes, actual.dia + 1);
    iteraciones++;

    if (
      actual.anio > fechaLimite.anio ||
      (actual.anio === fechaLimite.anio && actual.mes > fechaLimite.mes) ||
      (actual.anio === fechaLimite.anio &&
        actual.mes === fechaLimite.mes &&
        actual.dia > fechaLimite.dia)
    ) {
      break;
    }

    if (esDiaHabil(actual)) {
      resultado.push(actual);
    }

    if (
      actual.anio === fechaLimite.anio &&
      actual.mes === fechaLimite.mes &&
      actual.dia === fechaLimite.dia
    ) {
      break;
    }
  }

  return resultado;
}

// ---------------------------------------------------------------------------
// Propiedades
// ---------------------------------------------------------------------------

describe("PBT — Programación de notificaciones (Property 18)", () => {
  it("Property 18.1: Número de notificaciones = número de días hábiles restantes entre hoy+1 y fecha_limite", () => {
    fc.assert(
      fc.property(fechaCOArb, offsetDiasArb, horaEnvioArb, (hoy, offset, horaEnvio) => {
        const fechaLimite = fechaCODesdeComponentes(hoy.anio, hoy.mes, hoy.dia + offset);

        const plazo: PlazoParaPlanificacion = {
          id: "test-plazo-1",
          usuario_id: "test-usuario-1",
          fecha_limite: fechaLimite,
        };

        const regla: ReglaNotificacion = {
          horaEnvio,
          anticipacion: "dia_calendario_anterior_a_cada_dia_habil",
        };

        const resultado = calcularNotificaciones(plazo, regla, hoy);

        expect(resultado.ok).toBe(true);
        if (!resultado.ok) return;

        const planificacion = resultado.value;

        // Contar días hábiles independientemente
        const diasHabilesEsperados = contarDiasHabilesRestantesIndependiente(hoy, fechaLimite);

        if (diasHabilesEsperados === 0) {
          // Si no hay días hábiles restantes → alerta inmediata
          expect(planificacion.caso).toBe("alerta_inmediata");
        } else {
          // Si hay días hábiles → notificaciones con la cantidad correcta
          expect(planificacion.caso).toBe("notificaciones");
          if (planificacion.caso === "notificaciones") {
            expect(planificacion.notificaciones.length).toBe(diasHabilesEsperados);
          }
        }
      }),
      { numRuns: 100 },
    );
  });

  it("Property 18.2: Cada notificación se programa el día calendario ANTERIOR a su día hábil correspondiente", () => {
    fc.assert(
      fc.property(fechaCOArb, offsetDiasArb, horaEnvioArb, (hoy, offset, horaEnvio) => {
        const fechaLimite = fechaCODesdeComponentes(hoy.anio, hoy.mes, hoy.dia + offset);

        const plazo: PlazoParaPlanificacion = {
          id: "test-plazo-2",
          usuario_id: "test-usuario-2",
          fecha_limite: fechaLimite,
        };

        const regla: ReglaNotificacion = {
          horaEnvio,
          anticipacion: "dia_calendario_anterior_a_cada_dia_habil",
        };

        const resultado = calcularNotificaciones(plazo, regla, hoy);

        expect(resultado.ok).toBe(true);
        if (!resultado.ok) return;

        const planificacion = resultado.value;
        if (planificacion.caso !== "notificaciones") return;

        // Obtener los días hábiles restantes independientemente
        const diasHabiles = obtenerDiasHabilesIndependiente(hoy, fechaLimite);

        // Cada notificación[i] debe corresponder al día calendario anterior a diasHabiles[i]
        expect(planificacion.notificaciones.length).toBe(diasHabiles.length);

        for (let i = 0; i < diasHabiles.length; i++) {
          const diaHabil = diasHabiles[i];
          const notif = planificacion.notificaciones[i];

          // Calcular el día anterior al día hábil
          const diaAnteriorEsperado = fechaCODesdeComponentes(
            diaHabil.anio,
            diaHabil.mes,
            diaHabil.dia - 1,
          );

          // Interpretar la fecha programada como FechaCO
          const fechaNotifCO = crearFechaCO(notif.fecha_programada);

          // Verificar que el día de la notificación es el anterior al día hábil
          expect(fechaNotifCO.anio).toBe(diaAnteriorEsperado.anio);
          expect(fechaNotifCO.mes).toBe(diaAnteriorEsperado.mes);
          expect(fechaNotifCO.dia).toBe(diaAnteriorEsperado.dia);
        }
      }),
      { numRuns: 100 },
    );
  });

  it("Property 18.3: La hora programada es horaEnvio (configurable) en UTC-5 (America/Bogotá)", () => {
    fc.assert(
      fc.property(fechaCOArb, offsetDiasArb, horaEnvioArb, (hoy, offset, horaEnvio) => {
        const fechaLimite = fechaCODesdeComponentes(hoy.anio, hoy.mes, hoy.dia + offset);

        const plazo: PlazoParaPlanificacion = {
          id: "test-plazo-3",
          usuario_id: "test-usuario-3",
          fecha_limite: fechaLimite,
        };

        const regla: ReglaNotificacion = {
          horaEnvio,
          anticipacion: "dia_calendario_anterior_a_cada_dia_habil",
        };

        const resultado = calcularNotificaciones(plazo, regla, hoy);

        expect(resultado.ok).toBe(true);
        if (!resultado.ok) return;

        const planificacion = resultado.value;
        if (planificacion.caso !== "notificaciones") return;

        // Parsear horaEnvio esperada
        const [horaEsperada, minutoEsperado] = horaEnvio.split(":").map(Number);

        // Cada notificación debe tener la hora configurada en Colombia (UTC-5)
        for (const notif of planificacion.notificaciones) {
          const fechaNotifCO = crearFechaCO(notif.fecha_programada);
          expect(fechaNotifCO.hora).toBe(horaEsperada);
          expect(fechaNotifCO.minuto).toBe(minutoEsperado);
        }
      }),
      { numRuns: 100 },
    );
  });

  it("Property 18.4: Se programan notificaciones incluso si el día anterior cae en fin de semana o festivo", () => {
    fc.assert(
      fc.property(fechaCOArb, offsetDiasArb, (hoy, offset) => {
        const fechaLimite = fechaCODesdeComponentes(hoy.anio, hoy.mes, hoy.dia + offset);

        const plazo: PlazoParaPlanificacion = {
          id: "test-plazo-4",
          usuario_id: "test-usuario-4",
          fecha_limite: fechaLimite,
        };

        const regla: ReglaNotificacion = {
          horaEnvio: "07:00",
          anticipacion: "dia_calendario_anterior_a_cada_dia_habil",
        };

        const resultado = calcularNotificaciones(plazo, regla, hoy);

        expect(resultado.ok).toBe(true);
        if (!resultado.ok) return;

        const planificacion = resultado.value;
        if (planificacion.caso !== "notificaciones") return;

        // Obtener días hábiles restantes independientemente
        const diasHabiles = obtenerDiasHabilesIndependiente(hoy, fechaLimite);

        // Para cada día hábil que tenga un lunes como día (su anterior es domingo),
        // la notificación DEBE programarse igualmente (no se omite por ser fin de semana)
        for (let i = 0; i < diasHabiles.length; i++) {
          const diaHabil = diasHabiles[i];
          const diaAnterior = fechaCODesdeComponentes(
            diaHabil.anio,
            diaHabil.mes,
            diaHabil.dia - 1,
          );

          // Debe existir una notificación para este día hábil, sin importar
          // si diaAnterior es fin de semana (domingo antes de lunes) o festivo
          const notif = planificacion.notificaciones[i];
          expect(notif).toBeDefined();

          // El día anterior puede ser cualquier día de la semana o festivo
          // La propiedad es que NO se omite la notificación
          const fechaNotifCO = crearFechaCO(notif.fecha_programada);
          expect(fechaNotifCO.anio).toBe(diaAnterior.anio);
          expect(fechaNotifCO.mes).toBe(diaAnterior.mes);
          expect(fechaNotifCO.dia).toBe(diaAnterior.dia);
        }
      }),
      { numRuns: 100 },
    );
  });
});
