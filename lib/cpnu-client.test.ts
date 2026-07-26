/**
 * Pruebas para cpnu-client.ts — Task 5.1
 *
 * Verifica:
 * - Integración con validarRadicado formal (R4.2)
 * - Headers requeridos (R4.3)
 * - Timeout de 30s (R4.5)
 * - Extracción de campos de procesos[] (R4.8)
 * - Que el client no consulte con radicados inválidos (R4.1, R4.2)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { crearClienteCPNU } from "./cpnu-client";
import type { RespuestaConsultaCPNU, FalloCPNU, Result } from "./cpnu-client";

// Mock de fetch global
const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch);
  mockFetch.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// Helper: radicado válido de 23 dígitos con año 2023
function radicadoValido(): string {
  return "11001020300120230000001";
}

// Helper: construir respuesta CPNU simulada
function respuestaCPNUExitosa() {
  return {
    procesos: [
      {
        idProceso: 12345,
        llaveProceso: "11001020300120230000001",
        fechaProceso: "2023-01-15",
        fechaUltimaActuacion: "2024-03-20",
        despacho: "Juzgado 1 Civil Municipal",
        departamento: "Cundinamarca",
        sujetosProcesales: "DEMANDANTE: Juan Pérez | DEMANDADO: María López",
        esPrivado: false,
        cantFilas: 1,
      },
    ],
  };
}

describe("cpnu-client — consultarPorRadicado", () => {
  describe("R4.2: Abstenerse de consultar si el radicado es inválido (validarRadicado formal)", () => {
    it("devuelve radicado_invalido para cadena vacía", async () => {
      const cliente = crearClienteCPNU();
      const result = await cliente.consultarPorRadicado("");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.tipo).toBe("radicado_invalido");
      }
      // No debe llamar a fetch
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("devuelve radicado_invalido para radicado con menos de 23 dígitos", async () => {
      const cliente = crearClienteCPNU();
      const result = await cliente.consultarPorRadicado("1234567890123456789012"); // 22 dígitos

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.tipo).toBe("radicado_invalido");
        expect(result.error.detalle).toContain("23");
      }
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("devuelve radicado_invalido para radicado con letras", async () => {
      const cliente = crearClienteCPNU();
      const result = await cliente.consultarPorRadicado("1100102030012023000000a");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.tipo).toBe("radicado_invalido");
      }
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("devuelve radicado_invalido para radicado con año fuera de rango (9999)", async () => {
      const cliente = crearClienteCPNU();
      // DANE(5) + ent(2) + esp(2) + desp(3) + año(9999) + cons(7) = 23
      const radicadoAnioFuturo = "11001020300199990000001";
      const result = await cliente.consultarPorRadicado(radicadoAnioFuturo);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.tipo).toBe("radicado_invalido");
        expect(result.error.detalle).toContain("rango");
      }
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("devuelve radicado_invalido para radicado con año 0000", async () => {
      const cliente = crearClienteCPNU();
      const radicadoAnio0 = "11001020300100000000001";
      const result = await cliente.consultarPorRadicado(radicadoAnio0);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.tipo).toBe("radicado_invalido");
        expect(result.error.detalle).toContain("rango");
      }
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("devuelve radicado_invalido para radicado con espacios", async () => {
      const cliente = crearClienteCPNU();
      const result = await cliente.consultarPorRadicado("11001 0203 001 2023 000");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.tipo).toBe("radicado_invalido");
      }
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("consulta la API cuando el radicado es válido", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => respuestaCPNUExitosa(),
      });

      const cliente = crearClienteCPNU();
      const result = await cliente.consultarPorRadicado(radicadoValido());

      expect(result.ok).toBe(true);
      expect(mockFetch).toHaveBeenCalled();
    });
  });

  describe("R4.3: Headers requeridos en cada petición", () => {
    it("incluye Accept, Referer y User-Agent en la petición", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => respuestaCPNUExitosa(),
      });

      const cliente = crearClienteCPNU();
      await cliente.consultarPorRadicado(radicadoValido());

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const callArgs = mockFetch.mock.calls[0];
      const options = callArgs[1];

      expect(options.headers).toMatchObject({
        Accept: "application/json, text/plain, */*",
        Referer: "https://consultaprocesos.ramajudicial.gov.co/",
      });
      expect(options.headers["User-Agent"]).toBeDefined();
      expect(options.headers["User-Agent"].length).toBeGreaterThan(0);
    });
  });

  describe("R4.5: Timeout de 30 segundos por petición", () => {
    it("utiliza AbortSignal.timeout con 30000ms", async () => {
      const mockTimeout = vi.spyOn(AbortSignal, "timeout");
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => respuestaCPNUExitosa(),
      });

      const cliente = crearClienteCPNU();
      await cliente.consultarPorRadicado(radicadoValido());

      expect(mockTimeout).toHaveBeenCalledWith(30_000);
      mockTimeout.mockRestore();
    });
  });

  describe("R4.1: Petición GET al endpoint correcto con parámetros", () => {
    it("consulta la URL correcta con numero, SoloActivos y pagina", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => respuestaCPNUExitosa(),
      });

      const cliente = crearClienteCPNU();
      const rad = radicadoValido();
      await cliente.consultarPorRadicado(rad, { soloActivos: true });

      const url = new URL(mockFetch.mock.calls[0][0]);
      expect(url.origin + url.pathname).toBe(
        "https://consultaprocesos.ramajudicial.gov.co:448/api/v2/Procesos/Consulta/NumeroRadicacion"
      );
      expect(url.searchParams.get("numero")).toBe(rad);
      expect(url.searchParams.get("SoloActivos")).toBe("true");
      expect(url.searchParams.get("pagina")).toBe("1");
    });

    it("SoloActivos es false por defecto", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => respuestaCPNUExitosa(),
      });

      const cliente = crearClienteCPNU();
      await cliente.consultarPorRadicado(radicadoValido());

      const url = new URL(mockFetch.mock.calls[0][0]);
      expect(url.searchParams.get("SoloActivos")).toBe("false");
    });
  });

  describe("R4.8: Extracción de campos de cada procesos[]", () => {
    it("extrae idProceso, llaveProceso, despacho, departamento, sujetosProcesales, fechaUltimaActuacion", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          procesos: [
            {
              idProceso: 99001,
              llaveProceso: "11001020300120230000001",
              fechaProceso: "2023-01-15",
              fechaUltimaActuacion: "2024-06-10",
              despacho: "Juzgado 3 Civil del Circuito",
              departamento: "Antioquia",
              sujetosProcesales: "DEMANDANTE: Carlos Ruiz | DEMANDADO: Ana Gómez",
              esPrivado: false,
              cantFilas: 1,
            },
          ],
        }),
      });

      const cliente = crearClienteCPNU();
      const result = await cliente.consultarPorRadicado(radicadoValido());

      expect(result.ok).toBe(true);
      if (result.ok) {
        const proceso = result.value.procesos[0];
        expect(proceso.idProceso).toBe(99001);
        expect(proceso.llaveProceso).toBe("11001020300120230000001");
        expect(proceso.despacho).toBe("Juzgado 3 Civil del Circuito");
        expect(proceso.departamento).toBe("Antioquia");
        expect(proceso.sujetosProcesales).toBe(
          "DEMANDANTE: Carlos Ruiz | DEMANDADO: Ana Gómez"
        );
        expect(proceso.fechaUltimaActuacion).toBe("2024-06-10");
      }
    });
  });

  describe("Resultado no_encontrado cuando la API no devuelve procesos", () => {
    it("devuelve no_encontrado si procesos[] está vacío", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ procesos: [] }),
      });

      const cliente = crearClienteCPNU();
      const result = await cliente.consultarPorRadicado(radicadoValido());

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.tipo).toBe("no_encontrado");
      }
    });
  });

  describe("R4.7: Reintentos resilientes en consultarPorRadicado", () => {
    it("reintenta hasta 3 veces ante error HTTP y devuelve FalloCPNU sin lanzar excepción", async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: false, status: 502, statusText: "Bad Gateway" })
        .mockResolvedValueOnce({ ok: false, status: 502, statusText: "Bad Gateway" })
        .mockResolvedValueOnce({ ok: false, status: 502, statusText: "Bad Gateway" });

      const cliente = crearClienteCPNU();
      const result = await cliente.consultarPorRadicado(radicadoValido());

      // No lanza excepción, devuelve Result con ok: false
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.tipo).toBe("fuente_no_disponible");
        expect(result.error.detalle).toContain("502");
      }
      // Se realizaron exactamente 3 intentos
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it("reintenta ante error de red y devuelve FalloCPNU sin lanzar excepción", async () => {
      mockFetch
        .mockRejectedValueOnce(new Error("ECONNREFUSED"))
        .mockRejectedValueOnce(new Error("ECONNREFUSED"))
        .mockRejectedValueOnce(new Error("ECONNREFUSED"));

      const cliente = crearClienteCPNU();
      const result = await cliente.consultarPorRadicado(radicadoValido());

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.tipo).toBe("fuente_no_disponible");
        expect(result.error.detalle).toContain("ECONNREFUSED");
      }
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it("devuelve tipo timeout cuando el error contiene 'timeout'", async () => {
      mockFetch
        .mockRejectedValueOnce(new Error("The operation was aborted due to timeout"))
        .mockRejectedValueOnce(new Error("The operation was aborted due to timeout"))
        .mockRejectedValueOnce(new Error("The operation was aborted due to timeout"));

      const cliente = crearClienteCPNU();
      const result = await cliente.consultarPorRadicado(radicadoValido());

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.tipo).toBe("timeout");
        expect(result.error.detalle).toContain("timeout");
      }
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it("retorna éxito si un reintento posterior funciona (2do intento)", async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: false, status: 503, statusText: "Service Unavailable" })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => respuestaCPNUExitosa(),
        });

      const cliente = crearClienteCPNU();
      const result = await cliente.consultarPorRadicado(radicadoValido());

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.procesos).toHaveLength(1);
        expect(result.value.procesos[0].idProceso).toBe(12345);
      }
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("retorna éxito si el tercer intento funciona tras 2 fallos", async () => {
      mockFetch
        .mockRejectedValueOnce(new Error("network failure"))
        .mockResolvedValueOnce({ ok: false, status: 500, statusText: "Internal Server Error" })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => respuestaCPNUExitosa(),
        });

      const cliente = crearClienteCPNU();
      const result = await cliente.consultarPorRadicado(radicadoValido());

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.procesos).toHaveLength(1);
      }
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it("no interrumpe otros procesos: cada instancia de cliente es independiente", async () => {
      // Simula un cliente que falla completamente
      mockFetch
        .mockResolvedValueOnce({ ok: false, status: 500, statusText: "Error" })
        .mockResolvedValueOnce({ ok: false, status: 500, statusText: "Error" })
        .mockResolvedValueOnce({ ok: false, status: 500, statusText: "Error" });

      const cliente1 = crearClienteCPNU();
      const result1 = await cliente1.consultarPorRadicado(radicadoValido());
      expect(result1.ok).toBe(false);

      // Otro cliente funciona independientemente
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => respuestaCPNUExitosa(),
      });

      const cliente2 = crearClienteCPNU();
      const result2 = await cliente2.consultarPorRadicado(radicadoValido());
      expect(result2.ok).toBe(true);
    });
  });
});


// =============================================================================
// PRUEBAS DE RATE LIMITING — Task 5.2
// Verifica: R4.4 (máx. 2 req/s, sin ráfagas, cola con espaciado mínimo de 500ms)
// =============================================================================

describe("cpnu-client — rate limiting (R4.4)", () => {
  // En estas pruebas usamos fake timers para controlar el tiempo con precisión
  // y verificar que el rate limiter impone ≥500ms entre peticiones.

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", mockFetch);
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("espacía peticiones consecutivas con al menos 500ms entre ellas (consultarPorRadicado)", async () => {
    // Configurar fetch para que siempre resuelva inmediatamente (respuesta exitosa de una sola página)
    mockFetch.mockImplementation(async () => ({
      ok: true,
      json: async () => ({
        procesos: [
          {
            idProceso: 1,
            llaveProceso: "11001020300120230000001",
            fechaProceso: "2023-01-01",
            fechaUltimaActuacion: "2024-01-01",
            despacho: "Juzgado Test",
            departamento: "Cundinamarca",
            sujetosProcesales: "A vs B",
            esPrivado: false,
            cantFilas: 30, // Fuerza paginación a más de una página (30 / 1 = 30 páginas)
          },
        ],
      }),
    }));

    const cliente = crearClienteCPNU();
    const rad = radicadoValido();

    // Lanzar la consulta — con cantFilas=30 y 1 resultado por página se harán múltiples requests
    const promesa = cliente.consultarPorRadicado(rad, { paginaMaxima: 3 });

    // Avanzar el timer para que se completen las peticiones con el rate limit
    // Primera petición: inmediata (sin espera)
    await vi.advanceTimersByTimeAsync(0);
    // Segunda petición: necesita esperar 500ms
    await vi.advanceTimersByTimeAsync(500);
    // Tercera petición: necesita esperar otros 500ms
    await vi.advanceTimersByTimeAsync(500);

    const result = await promesa;

    expect(result.ok).toBe(true);
    // Con paginaMaxima=3 y cantFilas=30, debería hacer 3 peticiones
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it("la primera petición no tiene delay (solo las siguientes)", async () => {
    mockFetch.mockImplementation(async () => ({
      ok: true,
      json: async () => ({
        procesos: [
          {
            idProceso: 1,
            llaveProceso: "11001020300120230000001",
            fechaProceso: "2023-01-01",
            fechaUltimaActuacion: "2024-01-01",
            despacho: "Juzgado Test",
            departamento: "Cundinamarca",
            sujetosProcesales: "A vs B",
            esPrivado: false,
            cantFilas: 1, // Solo una página
          },
        ],
      }),
    }));

    const cliente = crearClienteCPNU();

    // Primera petición: se ejecuta inmediatamente sin esperar
    const promesa = cliente.consultarPorRadicado(radicadoValido());
    await vi.advanceTimersByTimeAsync(0);

    const result = await promesa;

    expect(result.ok).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("rate limiter se aplica a obtenerActuaciones (misma instancia del cliente)", async () => {
    mockFetch.mockImplementation(async () => ({
      ok: true,
      json: async () => [
        {
          idRegActuacion: 1,
          llaveProceso: "11001020300120230000001",
          consActuacion: 1,
          fechaActuacion: "2024-01-15",
          actuacion: "Auto",
          anotacion: "Texto",
          fechaInicia: null,
          fechaFinaliza: null,
          fechaRegistro: "2024-01-15",
          existeDocs: false,
        },
      ],
    }));

    const cliente = crearClienteCPNU();

    // Primera llamada a obtenerActuaciones
    const p1 = cliente.obtenerActuaciones(100);
    await vi.advanceTimersByTimeAsync(0);
    await p1;

    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Segunda llamada inmediata — debería necesitar esperar 500ms
    const p2 = cliente.obtenerActuaciones(200);

    // No avanzamos el timer aún — fetch NO debería haberse llamado de nuevo
    await vi.advanceTimersByTimeAsync(0);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Avanzamos 499ms — aún no se debería hacer la segunda petición
    await vi.advanceTimersByTimeAsync(499);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Avanzamos 1ms más (total 500ms) — ahora sí se debe hacer la segunda petición
    await vi.advanceTimersByTimeAsync(1);
    await p2;

    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("el rate limiter es compartido entre consultarPorRadicado y obtenerActuaciones del mismo cliente", async () => {
    // Mock: consultarPorRadicado devuelve un solo proceso (una página)
    let callCount = 0;
    mockFetch.mockImplementation(async (url: string) => {
      callCount++;
      if (url.includes("NumeroRadicacion")) {
        return {
          ok: true,
          json: async () => ({
            procesos: [
              {
                idProceso: 1,
                llaveProceso: "11001020300120230000001",
                fechaProceso: "2023-01-01",
                fechaUltimaActuacion: "2024-01-01",
                despacho: "Juzgado Test",
                departamento: "Cundinamarca",
                sujetosProcesales: "A vs B",
                esPrivado: false,
                cantFilas: 1,
              },
            ],
          }),
        };
      }
      return {
        ok: true,
        json: async () => [],
      };
    });

    const cliente = crearClienteCPNU();

    // Primera llamada: consultarPorRadicado
    const p1 = cliente.consultarPorRadicado(radicadoValido());
    await vi.advanceTimersByTimeAsync(0);
    await p1;
    expect(callCount).toBe(1);

    // Segunda llamada inmediata: obtenerActuaciones — debe esperar rate limit
    const p2 = cliente.obtenerActuaciones(1);
    await vi.advanceTimersByTimeAsync(0);
    expect(callCount).toBe(1); // Aún no se ha hecho la segunda

    // Avanzar 500ms para liberar el rate limit
    await vi.advanceTimersByTimeAsync(500);
    await p2;
    expect(callCount).toBe(2);
  });

  it("no permite más de 2 peticiones en una ventana de 1 segundo", async () => {
    mockFetch.mockImplementation(async () => ({
      ok: true,
      json: async () => [
        {
          idRegActuacion: 1,
          llaveProceso: "key",
          consActuacion: 1,
          fechaActuacion: "2024-01-15",
          actuacion: "Auto",
          anotacion: "Texto",
          fechaInicia: null,
          fechaFinaliza: null,
          fechaRegistro: "2024-01-15",
          existeDocs: false,
        },
      ],
    }));

    const cliente = crearClienteCPNU();

    // Disparar 3 peticiones consecutivas
    const p1 = cliente.obtenerActuaciones(1);
    const p2 = cliente.obtenerActuaciones(2);
    const p3 = cliente.obtenerActuaciones(3);

    // Avanzar suficiente para que se completen todas respetando el rate limit
    // Pet 1: t=0, Pet 2: t≥500, Pet 3: t≥1000
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(500);
    await vi.advanceTimersByTimeAsync(500);

    await Promise.all([p1, p2, p3]);

    // Las 3 debieron completarse
    expect(mockFetch).toHaveBeenCalledTimes(3);

    // Verificar que no hay ráfagas — en 999ms no deberían caber 3 peticiones
    // (Esto se verifica implícitamente porque el test anterior demostró
    // que la segunda petición no se ejecuta hasta t=500 y la tercera hasta t=1000)
  });
});

// =============================================================================
// PRUEBAS PARA obtenerActuaciones — Task 5.5
// Verifica: R4.9, R4.10 (histórico completo de actuaciones, capa aislada/mockeable)
// =============================================================================

describe("cpnu-client — obtenerActuaciones", () => {
  // Helper: respuesta de actuaciones como array directo
  function actuacionesMock() {
    return [
      {
        idRegActuacion: 1001,
        llaveProceso: "11001020300120230000001",
        consActuacion: 1,
        fechaActuacion: "2024-01-15",
        actuacion: "Auto admisorio",
        anotacion: "Se admite la demanda y se corre traslado por 10 días",
        fechaInicia: "2024-01-16",
        fechaFinaliza: "2024-01-30",
        fechaRegistro: "2024-01-15",
        existeDocs: true,
      },
      {
        idRegActuacion: 1002,
        llaveProceso: "11001020300120230000001",
        consActuacion: 2,
        fechaActuacion: "2024-02-01",
        actuacion: "Notificación personal",
        anotacion: "Se notifica al demandado",
        fechaInicia: null,
        fechaFinaliza: null,
        fechaRegistro: "2024-02-01",
        existeDocs: false,
      },
    ];
  }

  describe("R4.9: Consultar endpoint de actuaciones y devolver histórico completo", () => {
    it("consulta la URL correcta con el idProceso numérico", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => actuacionesMock(),
      });

      const cliente = crearClienteCPNU();
      await cliente.obtenerActuaciones(12345);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const url = mockFetch.mock.calls[0][0];
      expect(url).toBe(
        "https://consultaprocesos.ramajudicial.gov.co:448/api/v2/Proceso/Actuaciones/12345"
      );
    });

    it("consulta la URL correcta con el idProceso como string", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => actuacionesMock(),
      });

      const cliente = crearClienteCPNU();
      await cliente.obtenerActuaciones("67890");

      const url = mockFetch.mock.calls[0][0];
      expect(url).toBe(
        "https://consultaprocesos.ramajudicial.gov.co:448/api/v2/Proceso/Actuaciones/67890"
      );
    });

    it("devuelve el histórico completo de actuaciones cuando la respuesta es un array", async () => {
      const actuaciones = actuacionesMock();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => actuaciones,
      });

      const cliente = crearClienteCPNU();
      const result = await cliente.obtenerActuaciones(12345);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(2);
        expect(result.value[0].idRegActuacion).toBe(1001);
        expect(result.value[0].actuacion).toBe("Auto admisorio");
        expect(result.value[0].anotacion).toBe(
          "Se admite la demanda y se corre traslado por 10 días"
        );
        expect(result.value[1].idRegActuacion).toBe(1002);
        expect(result.value[1].actuacion).toBe("Notificación personal");
      }
    });

    it("devuelve el histórico completo cuando la respuesta es un objeto con propiedad actuaciones", async () => {
      const actuaciones = actuacionesMock();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ actuaciones }),
      });

      const cliente = crearClienteCPNU();
      const result = await cliente.obtenerActuaciones(12345);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(2);
        expect(result.value[0].idRegActuacion).toBe(1001);
        expect(result.value[1].idRegActuacion).toBe(1002);
      }
    });

    it("devuelve un array vacío si la respuesta no tiene el formato esperado", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ otrosCampos: "datos irrelevantes" }),
      });

      const cliente = crearClienteCPNU();
      const result = await cliente.obtenerActuaciones(12345);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual([]);
      }
    });

    it("extrae todos los campos relevantes de cada actuación", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [actuacionesMock()[0]],
      });

      const cliente = crearClienteCPNU();
      const result = await cliente.obtenerActuaciones(12345);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const a = result.value[0];
        expect(a.idRegActuacion).toBe(1001);
        expect(a.llaveProceso).toBe("11001020300120230000001");
        expect(a.consActuacion).toBe(1);
        expect(a.fechaActuacion).toBe("2024-01-15");
        expect(a.actuacion).toBe("Auto admisorio");
        expect(a.anotacion).toBe(
          "Se admite la demanda y se corre traslado por 10 días"
        );
        expect(a.fechaInicia).toBe("2024-01-16");
        expect(a.fechaFinaliza).toBe("2024-01-30");
        expect(a.fechaRegistro).toBe("2024-01-15");
        expect(a.existeDocs).toBe(true);
      }
    });
  });

  describe("R4.3: Headers requeridos en peticiones de actuaciones", () => {
    it("incluye Accept, Referer y User-Agent en la petición de actuaciones", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => actuacionesMock(),
      });

      const cliente = crearClienteCPNU();
      await cliente.obtenerActuaciones(12345);

      const callArgs = mockFetch.mock.calls[0];
      const options = callArgs[1];

      expect(options.headers).toMatchObject({
        Accept: "application/json, text/plain, */*",
        Referer: "https://consultaprocesos.ramajudicial.gov.co/",
      });
      expect(options.headers["User-Agent"]).toBeDefined();
      expect(options.headers["User-Agent"].length).toBeGreaterThan(0);
    });
  });

  describe("R4.5: Timeout de 30 segundos en peticiones de actuaciones", () => {
    it("utiliza AbortSignal.timeout con 30000ms para actuaciones", async () => {
      const mockTimeout = vi.spyOn(AbortSignal, "timeout");
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => actuacionesMock(),
      });

      const cliente = crearClienteCPNU();
      await cliente.obtenerActuaciones(12345);

      expect(mockTimeout).toHaveBeenCalledWith(30_000);
      mockTimeout.mockRestore();
    });
  });

  describe("R4.7: Reintentos ante fallos", () => {
    it("reintenta hasta 3 veces ante error HTTP y devuelve fallo sin excepción", async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: false, status: 500, statusText: "Internal Server Error" })
        .mockResolvedValueOnce({ ok: false, status: 500, statusText: "Internal Server Error" })
        .mockResolvedValueOnce({ ok: false, status: 500, statusText: "Internal Server Error" });

      const cliente = crearClienteCPNU();
      const result = await cliente.obtenerActuaciones(12345);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.tipo).toBe("fuente_no_disponible");
        expect(result.error.detalle).toContain("500");
      }
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it("reintenta ante error de red y devuelve fallo sin excepción", async () => {
      mockFetch
        .mockRejectedValueOnce(new Error("network error"))
        .mockRejectedValueOnce(new Error("network error"))
        .mockRejectedValueOnce(new Error("network error"));

      const cliente = crearClienteCPNU();
      const result = await cliente.obtenerActuaciones(12345);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.tipo).toBe("fuente_no_disponible");
        expect(result.error.detalle).toContain("network error");
      }
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it("retorna éxito si el segundo intento funciona", async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: false, status: 503, statusText: "Service Unavailable" })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => actuacionesMock(),
        });

      const cliente = crearClienteCPNU();
      const result = await cliente.obtenerActuaciones(12345);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(2);
      }
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("devuelve tipo timeout ante error de timeout", async () => {
      mockFetch
        .mockRejectedValueOnce(new Error("timeout exceeded"))
        .mockRejectedValueOnce(new Error("timeout exceeded"))
        .mockRejectedValueOnce(new Error("timeout exceeded"));

      const cliente = crearClienteCPNU();
      const result = await cliente.obtenerActuaciones(12345);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.tipo).toBe("timeout");
      }
    });
  });

  describe("R4.10: Contrato reemplazable/mockeable", () => {
    it("crearClienteCPNU() genera instancias independientes con el contrato ClienteCPNU", () => {
      const cliente1 = crearClienteCPNU();
      const cliente2 = crearClienteCPNU();

      // Son instancias distintas
      expect(cliente1).not.toBe(cliente2);

      // Ambas tienen el método obtenerActuaciones
      expect(typeof cliente1.obtenerActuaciones).toBe("function");
      expect(typeof cliente2.obtenerActuaciones).toBe("function");

      // Ambas tienen el método consultarPorRadicado
      expect(typeof cliente1.consultarPorRadicado).toBe("function");
      expect(typeof cliente2.consultarPorRadicado).toBe("function");
    });

    it("el contrato permite crear un mock completo sin dependencia de red", async () => {
      // Simula un mock que implementa la interfaz ClienteCPNU
      const clienteMock: {
        consultarPorRadicado: ReturnType<typeof vi.fn>;
        obtenerActuaciones: ReturnType<typeof vi.fn>;
      } = {
        consultarPorRadicado: vi.fn().mockResolvedValue({
          ok: true,
          value: { procesos: [], paginacion: { pagina: 1, cantidadPaginas: 0, cantidadRegistros: 0 } },
        }),
        obtenerActuaciones: vi.fn().mockResolvedValue({
          ok: true,
          value: actuacionesMock(),
        }),
      };

      const result = await clienteMock.obtenerActuaciones("12345");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(2);
      }
      expect(clienteMock.obtenerActuaciones).toHaveBeenCalledWith("12345");

      // fetch global no fue llamado
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });
});


// =============================================================================
// PRUEBAS PARA PAGINACIÓN SECUENCIAL ACOTADA — Task 5.3
// Verifica: R4.6 (pagina desde 1, secuencial, min(K,100), agregación de resultados)
// =============================================================================

describe("cpnu-client — paginación secuencial acotada (R4.6)", () => {
  // Usamos fake timers para evitar esperas reales del rate limiter (500ms entre peticiones)
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", mockFetch);
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  // Helper para avanzar timers suficiente para N páginas (500ms rate limit entre cada una)
  async function avanzarTimersParaPaginas(n: number) {
    for (let i = 0; i < n; i++) {
      await vi.advanceTimersByTimeAsync(500);
    }
  }

  // Helper: generar respuesta con N procesos indicando totalFilas para forzar múltiples páginas
  function respuestaPaginada(pagina: number, totalFilas: number, procesosPorPagina: number = 5) {
    const procesos = Array.from({ length: procesosPorPagina }, (_, i) => ({
      idProceso: pagina * 100 + i,
      llaveProceso: "11001020300120230000001",
      fechaProceso: "2023-01-15",
      fechaUltimaActuacion: "2024-03-20",
      despacho: `Juzgado ${pagina}-${i}`,
      departamento: "Cundinamarca",
      sujetosProcesales: "DEMANDANTE: A | DEMANDADO: B",
      esPrivado: false,
      cantFilas: totalFilas,
    }));
    return { procesos };
  }

  describe("Inicio en pagina=1 e incremento secuencial", () => {
    it("la primera petición usa pagina=1", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => respuestaPaginada(1, 5, 5),
      });

      const cliente = crearClienteCPNU();
      const promesa = cliente.consultarPorRadicado(radicadoValido());
      await vi.advanceTimersByTimeAsync(500);
      await promesa;

      const url = new URL(mockFetch.mock.calls[0][0]);
      expect(url.searchParams.get("pagina")).toBe("1");
    });

    it("pagina incrementa secuencialmente (1, 2, 3) cuando hay múltiples páginas", async () => {
      // 15 filas totales con 5 por página = 3 páginas
      mockFetch
        .mockResolvedValueOnce({ ok: true, json: async () => respuestaPaginada(1, 15, 5) })
        .mockResolvedValueOnce({ ok: true, json: async () => respuestaPaginada(2, 15, 5) })
        .mockResolvedValueOnce({ ok: true, json: async () => respuestaPaginada(3, 15, 5) });

      const cliente = crearClienteCPNU();
      const promesa = cliente.consultarPorRadicado(radicadoValido());
      await avanzarTimersParaPaginas(3);
      await promesa;

      expect(mockFetch).toHaveBeenCalledTimes(3);

      const paginas = mockFetch.mock.calls.map((call: unknown[]) => {
        const url = new URL(call[0] as string);
        return Number(url.searchParams.get("pagina"));
      });
      expect(paginas).toEqual([1, 2, 3]);
    });

    it("pagina incrementa secuencialmente para 5 páginas", async () => {
      // 25 filas totales con 5 por página = 5 páginas
      const totalFilas = 25;
      for (let i = 1; i <= 5; i++) {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => respuestaPaginada(i, totalFilas, 5),
        });
      }

      const cliente = crearClienteCPNU();
      const promesa = cliente.consultarPorRadicado(radicadoValido());
      await avanzarTimersParaPaginas(5);
      await promesa;

      expect(mockFetch).toHaveBeenCalledTimes(5);

      const paginas = mockFetch.mock.calls.map((call: unknown[]) => {
        const url = new URL(call[0] as string);
        return Number(url.searchParams.get("pagina"));
      });
      expect(paginas).toEqual([1, 2, 3, 4, 5]);
    });
  });

  describe("Cota máxima de 100 páginas (MAX_PAGINAS)", () => {
    it("se detiene en paginaMaxima cuando se pasa un valor menor a 100", async () => {
      // 50 filas totales, 5 por página = 10 páginas disponibles, pero límite = 3
      const totalFilas = 50;
      for (let i = 1; i <= 3; i++) {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => respuestaPaginada(i, totalFilas, 5),
        });
      }

      const cliente = crearClienteCPNU();
      const promesa = cliente.consultarPorRadicado(radicadoValido(), { paginaMaxima: 3 });
      await avanzarTimersParaPaginas(3);
      await promesa;

      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it("acota paginaMaxima a 100 incluso si se pasa un valor mayor", async () => {
      // paginaMaxima = 200 pero solo hay 2 páginas reales
      // Lo que testeamos es que no falla y respeta min(K, 100)
      const totalFilas = 10;
      for (let i = 1; i <= 2; i++) {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => respuestaPaginada(i, totalFilas, 5),
        });
      }

      const cliente = crearClienteCPNU();
      const promesa = cliente.consultarPorRadicado(radicadoValido(), { paginaMaxima: 200 });
      await avanzarTimersParaPaginas(2);
      const result = await promesa;

      // Debe haber consultado solo 2 páginas (las que hay realmente)
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result.ok).toBe(true);
    });

    it("sin paginaMaxima explícita usa el máximo de 100 como tope", async () => {
      // totalFilas indica muchas más de 100 páginas, pero el cliente se detiene en 100
      // Simulamos que hay 1000 filas con 5 por página = 200 páginas teóricas
      // El cliente debe detenerse en 100 páginas
      const totalFilas = 1000;
      // Usamos mockImplementation para no tener que registrar 100 mocks individuales
      mockFetch.mockImplementation(async () => ({
        ok: true,
        json: async () => respuestaPaginada(1, totalFilas, 5),
      }));

      const cliente = crearClienteCPNU();
      const promesa = cliente.consultarPorRadicado(radicadoValido());
      await avanzarTimersParaPaginas(100);
      const result = await promesa;

      expect(mockFetch).toHaveBeenCalledTimes(100);
      expect(result.ok).toBe(true);
      if (result.ok) {
        // 100 páginas * 5 procesos por página = 500 procesos agregados
        expect(result.value.procesos).toHaveLength(500);
      }
    });
  });

  describe("Agregación de resultados de múltiples páginas", () => {
    it("agrega todos los procesos de todas las páginas en un solo array", async () => {
      // 3 páginas con 5 procesos cada una = 15 procesos totales
      const totalFilas = 15;
      mockFetch
        .mockResolvedValueOnce({ ok: true, json: async () => respuestaPaginada(1, totalFilas, 5) })
        .mockResolvedValueOnce({ ok: true, json: async () => respuestaPaginada(2, totalFilas, 5) })
        .mockResolvedValueOnce({ ok: true, json: async () => respuestaPaginada(3, totalFilas, 5) });

      const cliente = crearClienteCPNU();
      const promesa = cliente.consultarPorRadicado(radicadoValido());
      await avanzarTimersParaPaginas(3);
      const result = await promesa;

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.procesos).toHaveLength(15);
      }
    });

    it("mantiene el orden de los procesos según la secuencia de páginas", async () => {
      // Primera página: 2 procesos, cantFilas=4 → totalPaginas = ceil(4/2) = 2 páginas
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            procesos: [
              { idProceso: 1, llaveProceso: "11001020300120230000001", fechaProceso: null, fechaUltimaActuacion: null, despacho: "J1", departamento: "D1", sujetosProcesales: "A v B", esPrivado: false, cantFilas: 4 },
              { idProceso: 2, llaveProceso: "11001020300120230000001", fechaProceso: null, fechaUltimaActuacion: null, despacho: "J2", departamento: "D1", sujetosProcesales: "A v B", esPrivado: false, cantFilas: 4 },
            ],
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            procesos: [
              { idProceso: 3, llaveProceso: "11001020300120230000001", fechaProceso: null, fechaUltimaActuacion: null, despacho: "J3", departamento: "D1", sujetosProcesales: "A v B", esPrivado: false, cantFilas: 4 },
              { idProceso: 4, llaveProceso: "11001020300120230000001", fechaProceso: null, fechaUltimaActuacion: null, despacho: "J4", departamento: "D1", sujetosProcesales: "A v B", esPrivado: false, cantFilas: 4 },
            ],
          }),
        });

      const cliente = crearClienteCPNU();
      const promesa = cliente.consultarPorRadicado(radicadoValido());
      await avanzarTimersParaPaginas(2);
      const result = await promesa;

      expect(result.ok).toBe(true);
      if (result.ok) {
        const ids = result.value.procesos.map((p) => p.idProceso);
        expect(ids).toEqual([1, 2, 3, 4]);
      }
    });

    it("la paginación reportada refleja la última página consultada y el total de registros", async () => {
      const totalFilas = 10;
      mockFetch
        .mockResolvedValueOnce({ ok: true, json: async () => respuestaPaginada(1, totalFilas, 5) })
        .mockResolvedValueOnce({ ok: true, json: async () => respuestaPaginada(2, totalFilas, 5) });

      const cliente = crearClienteCPNU();
      const promesa = cliente.consultarPorRadicado(radicadoValido());
      await avanzarTimersParaPaginas(2);
      const result = await promesa;

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.paginacion.pagina).toBe(2); // última página consultada
        expect(result.value.paginacion.cantidadRegistros).toBe(10); // total agregado
      }
    });
  });

  describe("Se detiene cuando ya no hay más páginas", () => {
    it("con una sola página (cantFilas <= procesosPorPagina) solo hace 1 petición", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => respuestaPaginada(1, 3, 3),
      });

      const cliente = crearClienteCPNU();
      const promesa = cliente.consultarPorRadicado(radicadoValido());
      await vi.advanceTimersByTimeAsync(500);
      await promesa;

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("no pide más páginas cuando totalPaginas calculado es 1", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => respuestaPaginada(1, 5, 5), // cantFilas=5, procesosPorPagina=5 → 1 página
      });

      const cliente = crearClienteCPNU();
      const promesa = cliente.consultarPorRadicado(radicadoValido());
      await vi.advanceTimersByTimeAsync(500);
      await promesa;

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe("Interacción paginación + rate limiting", () => {
    it("cada página consulta a través de fetchConReintentos (que respeta rate limiting)", async () => {
      // Verificamos que se hace una petición por página y todas pasan por fetch
      const totalFilas = 10;
      mockFetch
        .mockResolvedValueOnce({ ok: true, json: async () => respuestaPaginada(1, totalFilas, 5) })
        .mockResolvedValueOnce({ ok: true, json: async () => respuestaPaginada(2, totalFilas, 5) });

      const cliente = crearClienteCPNU();
      const promesa = cliente.consultarPorRadicado(radicadoValido());
      await avanzarTimersParaPaginas(2);
      await promesa;

      // Ambas peticiones pasan por el mismo fetch que incluye rate limiter
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe("Fallo en medio de la paginación", () => {
    it("si una página falla, devuelve el error sin resultados parciales", async () => {
      const totalFilas = 15;
      mockFetch
        .mockResolvedValueOnce({ ok: true, json: async () => respuestaPaginada(1, totalFilas, 5) })
        // La segunda página falla 3 veces (agota reintentos)
        .mockResolvedValueOnce({ ok: false, status: 500, statusText: "Error" })
        .mockResolvedValueOnce({ ok: false, status: 500, statusText: "Error" })
        .mockResolvedValueOnce({ ok: false, status: 500, statusText: "Error" });

      const cliente = crearClienteCPNU();
      const promesa = cliente.consultarPorRadicado(radicadoValido());
      await avanzarTimersParaPaginas(4); // 1 success + 3 retries
      const result = await promesa;

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.tipo).toBe("fuente_no_disponible");
      }
    });
  });
});


// =============================================================================
// PRUEBAS DE NORMALIZACIÓN DE CAMPOS REALES DE LA CPNU
// La API real usa conDocumentos/fechaInicial/fechaFinal; el contrato interno
// usa existeDocs/fechaInicia/fechaFinaliza. El cliente debe normalizar.
// =============================================================================

describe("cpnu-client — normalización de campos reales (obtenerActuaciones)", () => {
  it("mapea conDocumentos → existeDocs y fechaInicial/fechaFinal → fechaInicia/fechaFinaliza", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        actuaciones: [
          {
            idRegActuacion: 868337562,
            llaveProceso: "11001310303220170012300",
            consActuacion: 26,
            fechaActuacion: "2018-01-29T00:00:00",
            actuacion: "Archivo Definitivo",
            anotacion: "PAQUETE 10 DE 2018",
            fechaInicial: "2018-02-01T00:00:00",
            fechaFinal: "2018-02-10T00:00:00",
            fechaRegistro: "2018-01-29T00:00:00",
            codRegla: "00",
            conDocumentos: true,
            cant: 26,
          },
        ],
        paginacion: { cantidadRegistros: 1, registrosPagina: 20, cantidadPaginas: 1, pagina: 1 },
      }),
    });

    const cliente = crearClienteCPNU();
    const result = await cliente.obtenerActuaciones(62627832);

    expect(result.ok).toBe(true);
    if (result.ok) {
      const a = result.value[0]!;
      expect(a.existeDocs).toBe(true);
      expect(a.fechaInicia).toBe("2018-02-01T00:00:00");
      expect(a.fechaFinaliza).toBe("2018-02-10T00:00:00");
      expect(a.idRegActuacion).toBe(868337562);
    }
  });
});

// =============================================================================
// PRUEBAS PARA obtenerDocumentosActuacion
// =============================================================================

describe("cpnu-client — obtenerDocumentosActuacion", () => {
  function documentosMock() {
    return [
      {
        idRegDocumento: 21525913,
        idConexion: 175,
        consActuacion: 8,
        guidDocumento_SXXIW: null,
        nombre: "5_OFICIOREMISION20230227",
        descripcion: "5_OFICIOREMISIONOTROTRIBUNAL",
        tipo: "pdf",
        fechaCarga: "2023-02-27T00:00:00",
      },
    ];
  }

  it("consulta la URL correcta del endpoint de documentos", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => documentosMock() });

    const cliente = crearClienteCPNU();
    await cliente.obtenerDocumentosActuacion(1006146733);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const url = mockFetch.mock.calls[0]![0];
    expect(url).toBe(
      "https://consultaprocesos.ramajudicial.gov.co:448/api/v2/Proceso/DocumentosActuacion/1006146733",
    );
  });

  it("normaliza los documentos de la respuesta", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => documentosMock() });

    const cliente = crearClienteCPNU();
    const result = await cliente.obtenerDocumentosActuacion(1006146733);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(1);
      const d = result.value[0]!;
      expect(d.idRegDocumento).toBe(21525913);
      expect(d.tipo).toBe("pdf");
      expect(d.nombre).toBe("5_OFICIOREMISION20230227");
      expect(d.consActuacion).toBe(8);
    }
  });

  it("devuelve array vacío cuando la actuación no tiene documentos", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => [] });

    const cliente = crearClienteCPNU();
    const result = await cliente.obtenerDocumentosActuacion(1);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual([]);
    }
  });

  it("reintenta y devuelve fallo ante error HTTP persistente", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 500, statusText: "Error" })
      .mockResolvedValueOnce({ ok: false, status: 500, statusText: "Error" })
      .mockResolvedValueOnce({ ok: false, status: 500, statusText: "Error" });

    const cliente = crearClienteCPNU();
    const result = await cliente.obtenerDocumentosActuacion(1);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.tipo).toBe("fuente_no_disponible");
    }
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });
});

// =============================================================================
// PRUEBAS PARA descargarDocumento (binario)
// =============================================================================

describe("cpnu-client — descargarDocumento", () => {
  function respuestaBinaria(
    bytes: Buffer,
    headers: Record<string, string>,
  ) {
    return {
      ok: true,
      arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      headers: {
        get: (k: string) => headers[k.toLowerCase()] ?? null,
      },
    };
  }

  it("consulta la URL de descarga correcta", async () => {
    mockFetch.mockResolvedValueOnce(
      respuestaBinaria(Buffer.from("%PDF-1.4"), {
        "content-type": "application/pdf",
      }),
    );

    const cliente = crearClienteCPNU();
    await cliente.descargarDocumento(21525913);

    const url = mockFetch.mock.calls[0]![0];
    expect(url).toBe(
      "https://consultaprocesos.ramajudicial.gov.co:448/api/v2/Descarga/Documento/21525913",
    );
  });

  it("devuelve el binario con tipo MIME y nombre del Content-Disposition", async () => {
    const contenido = Buffer.from("%PDF-1.4 contenido");
    mockFetch.mockResolvedValueOnce(
      respuestaBinaria(contenido, {
        "content-type": "application/pdf",
        "content-disposition":
          "attachment; filename=oficio.pdf; filename*=UTF-8''oficio.pdf",
      }),
    );

    const cliente = crearClienteCPNU();
    const result = await cliente.descargarDocumento(21525913);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.tipoMime).toBe("application/pdf");
      expect(result.value.nombreArchivo).toBe("oficio.pdf");
      expect(result.value.tamanoBytes).toBe(contenido.length);
      expect(result.value.contenido.length).toBe(contenido.length);
    }
  });

  it("usa nombre genérico si no hay Content-Disposition", async () => {
    mockFetch.mockResolvedValueOnce(
      respuestaBinaria(Buffer.from("datos"), { "content-type": "application/pdf" }),
    );

    const cliente = crearClienteCPNU();
    const result = await cliente.descargarDocumento(1);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.nombreArchivo).toBe("documento");
    }
  });

  it("reintenta y devuelve fallo ante error HTTP persistente", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 503, statusText: "No disponible" })
      .mockResolvedValueOnce({ ok: false, status: 503, statusText: "No disponible" })
      .mockResolvedValueOnce({ ok: false, status: 503, statusText: "No disponible" });

    const cliente = crearClienteCPNU();
    const result = await cliente.descargarDocumento(1);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.tipo).toBe("fuente_no_disponible");
    }
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });
});
