import { beforeEach, describe, expect, it, vi } from "vitest";

const ejecutarRevisionDiaria = vi.fn();
vi.mock("@/worker/revision-diaria", () => ({
  ejecutarRevisionDiaria: (...args: unknown[]) => ejecutarRevisionDiaria(...args),
}));

import {
  LLAVE_SIMULACION,
  MAX_SIMULACIONES_POR_CUENTA,
  PLANTILLAS_SIMULACION,
  crearCPNUSimulada,
  simularRevisionDemo,
} from "./demo-simulacion";
import { fechaCODesdeComponentes } from "./formato";
import type { ActuacionCPNU } from "./cpnu-client";

// Viernes 30/10/2026; el lunes 2/11 es festivo en Colombia.
const HOY = fechaCODesdeComponentes(2026, 10, 30);

function crearDb(opts: { hechas?: number; procesos?: number; plazo?: object | null } = {}) {
  const procesos = Array.from({ length: opts.procesos ?? 3 }, (_, i) => ({
    id: `p${i}`,
    radicado: `1100140030${i}`,
    despacho: `Juzgado ${i}`,
  }));
  const plazo =
    opts.plazo === null
      ? []
      : [
          opts.plazo ?? {
            dias: 5,
            es_habil: true,
            indeterminado: false,
            fecha_limite: new Date("2026-11-09T00:00:00Z"),
            _count: { notificaciones: 3 },
          },
        ];
  return {
    actuacion: {
      count: vi.fn().mockResolvedValue(opts.hechas ?? 0),
      findFirst: vi.fn().mockResolvedValue({ plazos: plazo }),
    },
    proceso: { findMany: vi.fn().mockResolvedValue(procesos) },
    notificacionInapp: { create: vi.fn().mockResolvedValue({}) },
  };
}

beforeEach(() => {
  ejecutarRevisionDiaria.mockReset().mockResolvedValue({});
});

describe("simularRevisionDemo", () => {
  it("corre el pipeline del worker solo sobre el proceso elegido y resume el resultado", async () => {
    const db = crearDb();
    const r = await simularRevisionDemo(db as never, "u1", HOY);

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(ejecutarRevisionDiaria).toHaveBeenCalledOnce();
    const opciones = ejecutarRevisionDiaria.mock.calls[0]![0];
    expect(opciones.procesoIds).toEqual(["p0"]);
    expect(opciones.ahora).toBe(HOY);

    expect(r.value).toMatchObject({
      radicado: "1100140030" + "0",
      actuacion: PLANTILLAS_SIMULACION[0]!.actuacion,
      fechaActuacion: "30/10/2026",
      analisis: { tipo: "plazo", dias: 5, esHabil: true },
      fechaLimite: "09/11/2026",
      notificacionesProgramadas: 3,
      simulacionesRestantes: MAX_SIMULACIONES_POR_CUENTA - 1,
    });
    expect(db.notificacionInapp.create).toHaveBeenCalledOnce();
  });

  it("solo cuenta y busca procesos del usuario demo", async () => {
    const db = crearDb();
    await simularRevisionDemo(db as never, "u1", HOY);
    expect(db.actuacion.count).toHaveBeenCalledWith({
      where: { llave_proceso: LLAVE_SIMULACION, proceso: { usuario_id: "u1" } },
    });
    expect(db.proceso.findMany.mock.calls[0]![0].where).toMatchObject({ usuario_id: "u1" });
  });

  it("rota proceso y plantilla en cada simulación", async () => {
    const db = crearDb({ hechas: 4, procesos: 3 });
    const r = await simularRevisionDemo(db as never, "u1", HOY);
    expect(ejecutarRevisionDiaria.mock.calls[0]![0].procesoIds).toEqual(["p1"]);
    expect(r.ok && r.value.actuacion).toBe(PLANTILLAS_SIMULACION[4]!.actuacion);
  });

  it("sin plazo creado → análisis sin_plazo y sin fecha límite", async () => {
    const r = await simularRevisionDemo(crearDb({ plazo: null }) as never, "u1", HOY);
    expect(r.ok && r.value).toMatchObject({
      analisis: { tipo: "sin_plazo" },
      fechaLimite: null,
      notificacionesProgramadas: 0,
    });
  });

  it("respeta el límite de simulaciones por cuenta", async () => {
    const r = await simularRevisionDemo(
      crearDb({ hechas: MAX_SIMULACIONES_POR_CUENTA }) as never,
      "u1",
      HOY,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.tipo).toBe("limite");
    expect(ejecutarRevisionDiaria).not.toHaveBeenCalled();
  });

  it("sin procesos activos → error sin_procesos", async () => {
    const r = await simularRevisionDemo(crearDb({ procesos: 0 }) as never, "u1", HOY);
    expect(!r.ok && r.error.tipo).toBe("sin_procesos");
  });

  it("si el pipeline falla devuelve error interno (no lanza)", async () => {
    ejecutarRevisionDiaria.mockRejectedValue(new Error("boom"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await simularRevisionDemo(crearDb() as never, "u1", HOY);
    expect(!r.ok && r.error.tipo).toBe("interno");
  });
});

describe("crearCPNUSimulada", () => {
  const nueva = { idRegActuacion: 1, llaveProceso: LLAVE_SIMULACION } as ActuacionCPNU;

  it("resuelve el proceso y devuelve solo la actuación nueva", async () => {
    const cpnu = crearCPNUSimulada(nueva);
    const consulta = await cpnu.consultarPorRadicado("x");
    expect(consulta.ok && consulta.value.procesos[0]!.idProceso).toBe(1);
    const acts = await cpnu.obtenerActuaciones(1);
    expect(acts.ok && acts.value).toEqual([nueva]);
  });

  it("no expone documentos (no hay descargas en el demo)", async () => {
    const r = await crearCPNUSimulada(nueva).obtenerDocumentosActuacion(1);
    expect(r.ok).toBe(false);
  });
});
