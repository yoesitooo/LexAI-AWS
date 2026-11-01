/**
 * Tests del modo demo público (lib/demo.ts)
 *
 * - Los datos ficticios son coherentes con "hoy": un plazo vencido, uno por
 *   vencer y uno al día, calculados en días hábiles colombianos.
 * - Todos los radicados son válidos para el validador de la app.
 * - Creación de cuentas: deshabilitada fuera de DEMO_MODE y limitada por hora.
 * - Limpieza: solo borra cuentas demo más antiguas que HORAS_VIDA_DEMO.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import fc from "fast-check";
import {
  construirDatosDemo,
  retrocederDiasHabiles,
  crearCuentaDemo,
  limpiarCuentasDemo,
  esEmailDemo,
  esModoDemo,
  DOMINIO_EMAIL_DEMO,
  HORAS_VIDA_DEMO,
  MAX_DEMOS_POR_HORA,
} from "./demo";
import { validarRadicado } from "./validador-radicado";
import { esFestivo } from "./festivos";
import { compararFechasCO, fechaCODesdeComponentes, type FechaCO } from "./formato";

const esHabil = (f: FechaCO) => f.diaSemana !== 0 && f.diaSemana !== 6 && !esFestivo(f);

/** Fechas "hoy" arbitrarias entre 2026 y 2030 (festivos disponibles). */
const arbHoy = fc
  .record({
    anio: fc.integer({ min: 2026, max: 2030 }),
    mes: fc.integer({ min: 1, max: 12 }),
    dia: fc.integer({ min: 1, max: 28 }),
  })
  .map(({ anio, mes, dia }) => fechaCODesdeComponentes(anio, mes, dia));

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("retrocederDiasHabiles", () => {
  it("siempre cae en un día hábil y nunca después de la fecha de partida", () => {
    fc.assert(
      fc.property(arbHoy, fc.integer({ min: 0, max: 40 }), (hoy, n) => {
        const r = retrocederDiasHabiles(hoy, n);
        expect(esHabil(r)).toBe(true);
        expect(compararFechasCO(r, hoy)).toBeLessThanOrEqual(0);
      }),
    );
  });

  it("salta fines de semana: el lunes 2 de marzo de 2026 menos 1 día hábil es el viernes 27 de febrero", () => {
    const r = retrocederDiasHabiles(fechaCODesdeComponentes(2026, 3, 2), 1);
    expect([r.anio, r.mes, r.dia]).toEqual([2026, 2, 27]);
  });
});

describe("construirDatosDemo", () => {
  it("genera 6 procesos con radicados válidos y únicos", () => {
    const { procesos } = construirDatosDemo(fechaCODesdeComponentes(2026, 10, 30));
    expect(procesos).toHaveLength(6);
    for (const p of procesos) {
      expect(validarRadicado(p.radicado).ok).toBe(true);
    }
    expect(new Set(procesos.map((p) => p.radicado)).size).toBe(6);
  });

  it("los estados de los plazos son coherentes con la fecha de hoy (para cualquier hoy)", () => {
    fc.assert(
      fc.property(arbHoy, (hoy) => {
        const { procesos } = construirDatosDemo(hoy);
        const plazos = procesos.flatMap((p) =>
          p.actuaciones
            .filter((a) => a.plazo)
            .map((a) => ({ columna: p.columna, plazo: a.plazo! })),
        );
        expect(plazos).toHaveLength(3);

        for (const { columna, plazo } of plazos) {
          const cmp = compararFechasCO(plazo.fechaLimite, hoy);
          if (plazo.estado === "vencido") {
            expect(cmp).toBeLessThan(0);
            expect(columna).toBe("vencido");
          } else {
            expect(cmp).toBeGreaterThanOrEqual(0);
          }
          expect(compararFechasCO(plazo.fechaInicio, plazo.fechaLimite)).toBeLessThan(0);
        }
        // Hay un plazo de cada tipo: vencido, por vencer (requiere acción) y al día
        expect(plazos.map((p) => p.columna).sort()).toEqual([
          "en_seguimiento",
          "requiere_accion",
          "vencido",
        ]);
      }),
      { numRuns: 50 },
    );
  });

  it("todas las actuaciones son anteriores o iguales a hoy", () => {
    const hoy = fechaCODesdeComponentes(2026, 12, 24);
    const { procesos } = construirDatosDemo(hoy);
    for (const a of procesos.flatMap((p) => p.actuaciones)) {
      expect(compararFechasCO(a.fecha, hoy)).toBeLessThanOrEqual(0);
    }
  });

  it("incluye notificaciones in-app que referencian radicados del demo", () => {
    const { procesos, notificaciones } = construirDatosDemo(fechaCODesdeComponentes(2026, 10, 30));
    expect(notificaciones.length).toBeGreaterThanOrEqual(2);
    expect(notificaciones.some((n) => !n.leida)).toBe(true);
    for (const n of notificaciones) {
      expect(procesos.some((p) => n.mensaje.includes(p.radicado))).toBe(true);
    }
  });
});

describe("esEmailDemo / esModoDemo", () => {
  it("reconoce solo emails del dominio demo", () => {
    expect(esEmailDemo(`demo-abc@${DOMINIO_EMAIL_DEMO}`)).toBe(true);
    expect(esEmailDemo(`DEMO-ABC@${DOMINIO_EMAIL_DEMO.toUpperCase()}`)).toBe(true);
    expect(esEmailDemo("abogada@ejemplo.com")).toBe(false);
    expect(esEmailDemo(null)).toBe(false);
  });

  it("esModoDemo depende de DEMO_MODE=true", () => {
    vi.stubEnv("DEMO_MODE", "false");
    expect(esModoDemo()).toBe(false);
    vi.stubEnv("DEMO_MODE", "true");
    expect(esModoDemo()).toBe(true);
  });
});

function crearDbMock(recientes = 0) {
  const tx = {
    usuario: { create: vi.fn().mockResolvedValue({ id: "u1" }) },
    proceso: { create: vi.fn().mockImplementation(async () => ({ id: `p${Math.random()}` })) },
    actuacion: { create: vi.fn().mockImplementation(async () => ({ id: `a${Math.random()}` })) },
    plazo: { create: vi.fn().mockImplementation(async () => ({ id: `z${Math.random()}` })) },
    notificacion: { create: vi.fn() },
    comentarioProceso: { create: vi.fn() },
    notificacionInapp: { createMany: vi.fn() },
  };
  const db = {
    usuario: {
      count: vi.fn().mockResolvedValue(recientes),
      deleteMany: vi.fn().mockResolvedValue({ count: 2 }),
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    $transaction: vi.fn(async (fn: (t: any) => Promise<unknown>) => fn(tx)),
  };
  return { db, tx };
}

describe("crearCuentaDemo", () => {
  it("no crea nada si el modo demo está inactivo", async () => {
    vi.stubEnv("DEMO_MODE", "false");
    const { db } = crearDbMock();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await crearCuentaDemo(db as any);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.tipo).toBe("deshabilitado");
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("respeta el límite de cuentas por hora", async () => {
    vi.stubEnv("DEMO_MODE", "true");
    const { db } = crearDbMock(MAX_DEMOS_POR_HORA);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await crearCuentaDemo(db as any);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.tipo).toBe("limite");
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("crea un usuario demo aislado con procesos, plazos y notificaciones", async () => {
    vi.stubEnv("DEMO_MODE", "true");
    const { db, tx } = crearDbMock(0);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await crearCuentaDemo(db as any);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(esEmailDemo(r.value.email)).toBe(true);
    expect(r.value.password.length).toBeGreaterThanOrEqual(20);
    expect(tx.usuario.create).toHaveBeenCalledTimes(1);
    expect(tx.usuario.create.mock.calls[0]![0].data.password_hash).not.toBe(r.value.password);
    expect(tx.proceso.create).toHaveBeenCalledTimes(6);
    expect(tx.plazo.create).toHaveBeenCalledTimes(3);
    expect(tx.notificacionInapp.createMany).toHaveBeenCalledTimes(1);
  });

  it("dos cuentas demo nunca comparten email", async () => {
    vi.stubEnv("DEMO_MODE", "true");
    const { db } = crearDbMock(0);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [a, b] = await Promise.all([crearCuentaDemo(db as any), crearCuentaDemo(db as any)]);
    expect(a.ok && b.ok && a.value.email !== b.value.email).toBe(true);
  });
});

describe("limpiarCuentasDemo", () => {
  it("borra solo cuentas del dominio demo creadas antes del límite de vida", async () => {
    const { db } = crearDbMock();
    const ahora = new Date("2026-10-31T12:00:00Z");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const n = await limpiarCuentasDemo(db as any, ahora);
    expect(n).toBe(2);
    const where = db.usuario.deleteMany.mock.calls[0]![0].where;
    expect(where.email).toEqual({ endsWith: `@${DOMINIO_EMAIL_DEMO}` });
    expect(where.creado_en.lt.getTime()).toBe(ahora.getTime() - HORAS_VIDA_DEMO * 3600 * 1000);
  });
});
