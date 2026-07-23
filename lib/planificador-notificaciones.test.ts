/**
 * Tests unitarios — Planificador de Notificaciones
 *
 * Cubre la lógica pura de `calcularNotificaciones` y `obtenerDiasHabilesRestantes`
 * sin necesidad de base de datos ni Prisma.
 *
 * Requisitos validados: R9.1, R9.2, R9.3, R9.4, R9.5, R9.6
 */

import { describe, it, expect } from "vitest";
import {
  calcularNotificaciones,
  obtenerDiasHabilesRestantes,
  planificarNotificaciones,
  REGLA_NOTIFICACION_DEFAULT,
  type PlazoParaPlanificacion,
  type ReglaNotificacion,
} from "./planificador-notificaciones";
import { fechaCODesdeComponentes, type FechaCO } from "./formato";

// ---------------------------------------------------------------------------
// Helpers de test
// ---------------------------------------------------------------------------

function crearPlazo(fechaLimite: FechaCO): PlazoParaPlanificacion {
  return {
    id: "plazo-123",
    usuario_id: "usuario-456",
    fecha_limite: fechaLimite,
  };
}

// ---------------------------------------------------------------------------
// obtenerDiasHabilesRestantes
// ---------------------------------------------------------------------------

describe("obtenerDiasHabilesRestantes", () => {
  it("devuelve vacío si la fecha límite es hoy", () => {
    // Martes 2025-07-15
    const hoy = fechaCODesdeComponentes(2025, 7, 15);
    const fechaLimite = fechaCODesdeComponentes(2025, 7, 15);

    const resultado = obtenerDiasHabilesRestantes(hoy, fechaLimite);
    expect(resultado).toHaveLength(0);
  });

  it("devuelve vacío si la fecha límite ya pasó", () => {
    // Hoy: miércoles 2025-07-16, límite: martes 2025-07-15
    const hoy = fechaCODesdeComponentes(2025, 7, 16);
    const fechaLimite = fechaCODesdeComponentes(2025, 7, 15);

    const resultado = obtenerDiasHabilesRestantes(hoy, fechaLimite);
    expect(resultado).toHaveLength(0);
  });

  it("cuenta solo días lun-vie excluyendo fines de semana", () => {
    // Hoy: viernes 2025-07-11, límite: viernes 2025-07-18
    // Días entre: sáb 12, dom 13, lun 14, mar 15, mié 16, jue 17, vie 18
    // Hábiles: lun 14, mar 15, mié 16, jue 17, vie 18 → 5
    const hoy = fechaCODesdeComponentes(2025, 7, 11);
    const fechaLimite = fechaCODesdeComponentes(2025, 7, 18);

    const resultado = obtenerDiasHabilesRestantes(hoy, fechaLimite);
    expect(resultado).toHaveLength(5);
    expect(resultado[0].dia).toBe(14); // lunes
    expect(resultado[4].dia).toBe(18); // viernes
  });

  it("excluye festivos nacionales (1 de enero)", () => {
    // Hoy: martes 2024-12-31, límite: jueves 2025-01-02
    // Días: mié 1 ene (festivo), jue 2 ene
    // Hábiles: solo jue 2 ene
    const hoy = fechaCODesdeComponentes(2024, 12, 31);
    const fechaLimite = fechaCODesdeComponentes(2025, 1, 2);

    const resultado = obtenerDiasHabilesRestantes(hoy, fechaLimite);
    expect(resultado).toHaveLength(1);
    expect(resultado[0].dia).toBe(2);
    expect(resultado[0].mes).toBe(1);
  });

  it("devuelve un solo día hábil si la fecha límite es mañana (día hábil)", () => {
    // Hoy: lunes 2025-07-14, límite: martes 2025-07-15
    const hoy = fechaCODesdeComponentes(2025, 7, 14);
    const fechaLimite = fechaCODesdeComponentes(2025, 7, 15);

    const resultado = obtenerDiasHabilesRestantes(hoy, fechaLimite);
    expect(resultado).toHaveLength(1);
    expect(resultado[0].dia).toBe(15);
  });

  it("devuelve vacío si entre hoy y la fecha límite solo hay fines de semana", () => {
    // Hoy: viernes 2025-07-11, límite: domingo 2025-07-13
    // Días: sáb 12, dom 13 — ambos fin de semana
    const hoy = fechaCODesdeComponentes(2025, 7, 11);
    const fechaLimite = fechaCODesdeComponentes(2025, 7, 13);

    const resultado = obtenerDiasHabilesRestantes(hoy, fechaLimite);
    expect(resultado).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// calcularNotificaciones — Casos exitosos
// ---------------------------------------------------------------------------

describe("calcularNotificaciones", () => {
  const regla = REGLA_NOTIFICACION_DEFAULT;

  it("programa una notificación por cada día hábil restante", () => {
    // Hoy: lunes 2025-07-14, límite: miércoles 2025-07-16
    // Días hábiles restantes: mar 15, mié 16 → 2 notificaciones
    const hoy = fechaCODesdeComponentes(2025, 7, 14);
    const plazo = crearPlazo(fechaCODesdeComponentes(2025, 7, 16));

    const resultado = calcularNotificaciones(plazo, regla, hoy);
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;

    expect(resultado.value.caso).toBe("notificaciones");
    if (resultado.value.caso !== "notificaciones") return;

    expect(resultado.value.notificaciones).toHaveLength(2);
  });

  it("la notificación se fija al día calendario anterior al día hábil", () => {
    // Hoy: lunes 2025-07-14, límite: martes 2025-07-15
    // Día hábil: martes 15 → notificación el lunes 14 a las 07:00
    const hoy = fechaCODesdeComponentes(2025, 7, 14);
    const plazo = crearPlazo(fechaCODesdeComponentes(2025, 7, 15));

    const resultado = calcularNotificaciones(plazo, regla, hoy);
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;

    expect(resultado.value.caso).toBe("notificaciones");
    if (resultado.value.caso !== "notificaciones") return;

    const notif = resultado.value.notificaciones[0];
    // Verificar que la fecha programada es el 14 de julio a las 07:00 CO (12:00 UTC)
    const fechaProgramada = notif.fecha_programada;
    expect(fechaProgramada.getUTCHours()).toBe(12); // 07:00 CO = 12:00 UTC
    expect(fechaProgramada.getUTCMinutes()).toBe(0);
    expect(fechaProgramada.getUTCDate()).toBe(14);
    expect(fechaProgramada.getUTCMonth()).toBe(6); // julio = 6 (0-indexed)
  });

  it("programa notificación el día anterior (domingo) si el día hábil es lunes", () => {
    // Hoy: viernes 2025-07-11, límite: lunes 2025-07-14
    // Día hábil: lunes 14 → notificación el domingo 13 a las 07:00
    const hoy = fechaCODesdeComponentes(2025, 7, 11);
    const plazo = crearPlazo(fechaCODesdeComponentes(2025, 7, 14));

    const resultado = calcularNotificaciones(plazo, regla, hoy);
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;

    expect(resultado.value.caso).toBe("notificaciones");
    if (resultado.value.caso !== "notificaciones") return;

    const notif = resultado.value.notificaciones[0];
    // Domingo 13 de julio
    expect(notif.fecha_programada.getUTCDate()).toBe(13);
    expect(notif.fecha_programada.getUTCHours()).toBe(12); // 07:00 CO
  });

  it("usa la hora de envío configurada (no default)", () => {
    const reglaCustom: ReglaNotificacion = {
      horaEnvio: "09:30",
      anticipacion: "dia_calendario_anterior_a_cada_dia_habil",
    };

    // Hoy: lunes 2025-07-14, límite: martes 2025-07-15
    const hoy = fechaCODesdeComponentes(2025, 7, 14);
    const plazo = crearPlazo(fechaCODesdeComponentes(2025, 7, 15));

    const resultado = calcularNotificaciones(plazo, reglaCustom, hoy);
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;

    expect(resultado.value.caso).toBe("notificaciones");
    if (resultado.value.caso !== "notificaciones") return;

    const notif = resultado.value.notificaciones[0];
    // 09:30 CO = 14:30 UTC
    expect(notif.fecha_programada.getUTCHours()).toBe(14);
    expect(notif.fecha_programada.getUTCMinutes()).toBe(30);
  });

  it("cada notificación tiene plazo_id, usuario_id, estado=programada", () => {
    const hoy = fechaCODesdeComponentes(2025, 7, 14);
    const plazo = crearPlazo(fechaCODesdeComponentes(2025, 7, 16));

    const resultado = calcularNotificaciones(plazo, regla, hoy);
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    if (resultado.value.caso !== "notificaciones") return;

    for (const notif of resultado.value.notificaciones) {
      expect(notif.plazo_id).toBe("plazo-123");
      expect(notif.usuario_id).toBe("usuario-456");
      expect(notif.estado).toBe("programada");
      expect(notif.intentos).toBe(0);
      expect(notif.canal).toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// calcularNotificaciones — Alerta inmediata
// ---------------------------------------------------------------------------

describe("calcularNotificaciones — alerta inmediata", () => {
  const regla = REGLA_NOTIFICACION_DEFAULT;

  it("genera alerta inmediata si la fecha límite es hoy", () => {
    const hoy = fechaCODesdeComponentes(2025, 7, 15);
    const plazo = crearPlazo(fechaCODesdeComponentes(2025, 7, 15));

    const resultado = calcularNotificaciones(plazo, regla, hoy);
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;

    expect(resultado.value.caso).toBe("alerta_inmediata");
    if (resultado.value.caso !== "alerta_inmediata") return;

    expect(resultado.value.alerta.tipo).toBe("alerta_inmediata");
    expect(resultado.value.alerta.plazo_id).toBe("plazo-123");
    expect(resultado.value.alerta.usuario_id).toBe("usuario-456");
  });

  it("genera alerta inmediata si la fecha límite ya pasó", () => {
    const hoy = fechaCODesdeComponentes(2025, 7, 16);
    const plazo = crearPlazo(fechaCODesdeComponentes(2025, 7, 14));

    const resultado = calcularNotificaciones(plazo, regla, hoy);
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;

    expect(resultado.value.caso).toBe("alerta_inmediata");
  });

  it("genera alerta inmediata si no quedan días hábiles (solo fin de semana)", () => {
    // Hoy: viernes, límite: domingo (sin días hábiles intermedios)
    const hoy = fechaCODesdeComponentes(2025, 7, 11);
    const plazo = crearPlazo(fechaCODesdeComponentes(2025, 7, 13));

    const resultado = calcularNotificaciones(plazo, regla, hoy);
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;

    expect(resultado.value.caso).toBe("alerta_inmediata");
  });
});

// ---------------------------------------------------------------------------
// calcularNotificaciones — Errores
// ---------------------------------------------------------------------------

describe("calcularNotificaciones — errores", () => {
  it("retorna error si la hora de envío es inválida", () => {
    const reglaInvalida: ReglaNotificacion = {
      horaEnvio: "abc",
      anticipacion: "dia_calendario_anterior_a_cada_dia_habil",
    };
    const hoy = fechaCODesdeComponentes(2025, 7, 14);
    const plazo = crearPlazo(fechaCODesdeComponentes(2025, 7, 16));

    const resultado = calcularNotificaciones(plazo, reglaInvalida, hoy);
    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;

    expect(resultado.error.tipo).toBe("error_programacion");
  });
});

// ---------------------------------------------------------------------------
// planificarNotificaciones — Atomicidad (mock de Prisma)
// ---------------------------------------------------------------------------

describe("planificarNotificaciones — atomicidad", () => {

  it("persiste notificaciones atómicamente en transacción", async () => {
    const hoy = fechaCODesdeComponentes(2025, 7, 14);
    const plazo = crearPlazo(fechaCODesdeComponentes(2025, 7, 16));
    const regla = REGLA_NOTIFICACION_DEFAULT;

    const creados: any[] = [];
    const mockPrisma = {
      $transaction: async (fn: any) => {
        await fn({
          notificacion: {
            create: async (args: any) => {
              creados.push(args.data);
              return args.data;
            },
          },
        });
      },
      plazo: {
        update: async () => {},
      },
    };

    const resultado = await planificarNotificaciones(plazo, regla, hoy, mockPrisma);
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;

    expect(resultado.value.caso).toBe("notificaciones");
    if (resultado.value.caso !== "notificaciones") return;

    // Verificar que se crearon las notificaciones
    expect(creados.length).toBe(resultado.value.notificaciones.length);
  });

  it("marca error_programacion si la transacción falla", async () => {
    const hoy = fechaCODesdeComponentes(2025, 7, 14);
    const plazo = crearPlazo(fechaCODesdeComponentes(2025, 7, 16));
    const regla = REGLA_NOTIFICACION_DEFAULT;

    let errorMarcado = false;
    const mockPrisma = {
      $transaction: async () => {
        throw new Error("Fallo de conexión DB");
      },
      plazo: {
        update: async (args: any) => {
          if (args.data.error_programacion === true) {
            errorMarcado = true;
          }
        },
      },
    };

    const resultado = await planificarNotificaciones(plazo, regla, hoy, mockPrisma);
    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;

    expect(resultado.error.tipo).toBe("error_programacion");
    expect(errorMarcado).toBe(true);
  });

  it("no deja notificaciones parciales si la transacción falla", async () => {
    const hoy = fechaCODesdeComponentes(2025, 7, 14);
    const plazo = crearPlazo(fechaCODesdeComponentes(2025, 7, 18)); // Varios días
    const regla = REGLA_NOTIFICACION_DEFAULT;

    let notificacionesCreadas = 0;
    const mockPrisma = {
      $transaction: async (fn: any) => {
        try {
          await fn({
            notificacion: {
              create: async () => {
                notificacionesCreadas++;
                if (notificacionesCreadas === 2) {
                  throw new Error("Fallo en la segunda notificación");
                }
              },
            },
          });
        } catch (e) {
          // Simular rollback: reset counter
          notificacionesCreadas = 0;
          throw e;
        }
      },
      plazo: {
        update: async () => {},
      },
    };

    const resultado = await planificarNotificaciones(plazo, regla, hoy, mockPrisma);
    expect(resultado.ok).toBe(false);
    // Debido al rollback, no hay notificaciones parciales
    expect(notificacionesCreadas).toBe(0);
  });

  it("devuelve alerta inmediata sin persistir notificaciones", async () => {
    const hoy = fechaCODesdeComponentes(2025, 7, 15);
    const plazo = crearPlazo(fechaCODesdeComponentes(2025, 7, 15)); // Vence hoy
    const regla = REGLA_NOTIFICACION_DEFAULT;

    let transaccionLlamada = false;
    const mockPrisma = {
      $transaction: async () => {
        transaccionLlamada = true;
      },
      plazo: {
        update: async () => {},
      },
    };

    const resultado = await planificarNotificaciones(plazo, regla, hoy, mockPrisma);
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;

    expect(resultado.value.caso).toBe("alerta_inmediata");
    expect(transaccionLlamada).toBe(false); // No se intentó persistir
  });
});
