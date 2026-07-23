/**
 * Tests del Adaptador LLM intercambiable — LexAI MVP
 *
 * Valida:
 * - La factory selecciona el proveedor correcto por variable de entorno (R7.8)
 * - Timeout de 30 s por solicitud (R7.1)
 * - El mock funciona correctamente para uso en PBT
 * - Cada proveedor maneja errores de forma estructurada sin excepciones
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  crearAdaptadorLLM,
  crearProveedorMock,
  RESPUESTA_MOCK_DEFAULT,
  RESPUESTA_MOCK_SIN_PLAZO,
  RESPUESTA_MOCK_INDETERMINADO,
  _resetearInstanciaLLM,
} from "./index";
import { crearProveedorGemini } from "./providers/gemini";
import { crearProveedorOpenAI } from "./providers/openai";
import { crearProveedorAnthropic } from "./providers/anthropic";
import { TIMEOUT_LLM_MS } from "./types";

// =============================================================================
// FACTORY: SELECCIÓN POR PROVEEDOR
// =============================================================================

describe("crearAdaptadorLLM — factory de proveedores", () => {
  it("crea un proveedor Gemini cuando LLM_PROVIDER es 'gemini'", () => {
    const adaptador = crearAdaptadorLLM("gemini", "test-key");
    expect(adaptador.proveedor).toBe("gemini");
  });

  it("crea un proveedor OpenAI cuando LLM_PROVIDER es 'openai'", () => {
    const adaptador = crearAdaptadorLLM("openai", "test-key");
    expect(adaptador.proveedor).toBe("openai");
  });

  it("crea un proveedor Anthropic cuando LLM_PROVIDER es 'claude'", () => {
    const adaptador = crearAdaptadorLLM("claude", "test-key");
    expect(adaptador.proveedor).toBe("anthropic");
  });

  it("crea un proveedor Anthropic cuando LLM_PROVIDER es 'anthropic'", () => {
    const adaptador = crearAdaptadorLLM("anthropic", "test-key");
    expect(adaptador.proveedor).toBe("anthropic");
  });
});

// =============================================================================
// MOCK: FUNCIONALIDAD PARA TESTING Y PBT
// =============================================================================

describe("crearProveedorMock — proveedor mock para testing", () => {
  it("devuelve la respuesta por defecto si no se configura", async () => {
    const mock = crearProveedorMock();
    const resultado = await mock.completar("prompt de prueba");

    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.value).toBe(RESPUESTA_MOCK_DEFAULT);
    }
  });

  it("devuelve una respuesta personalizada", async () => {
    const respuesta = '{"custom": true}';
    const mock = crearProveedorMock({ respuesta });
    const resultado = await mock.completar("prompt");

    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.value).toBe(respuesta);
    }
  });

  it("simula un error configurado", async () => {
    const mock = crearProveedorMock({
      error: { tipo: "timeout", mensaje: "Timeout simulado" },
    });
    const resultado = await mock.completar("prompt");

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.error.tipo).toBe("timeout");
      expect(resultado.error.mensaje).toBe("Timeout simulado");
    }
  });

  it("registra todas las llamadas para aserciones", async () => {
    const mock = crearProveedorMock();
    await mock.completar("prompt 1");
    await mock.completar("prompt 2", { temperatura: 0.5 });

    expect(mock.llamadas).toHaveLength(2);
    expect(mock.llamadas[0]!.prompt).toBe("prompt 1");
    expect(mock.llamadas[1]!.prompt).toBe("prompt 2");
    expect(mock.llamadas[1]!.opciones?.temperatura).toBe(0.5);
  });

  it("resetea el historial de llamadas", async () => {
    const mock = crearProveedorMock();
    await mock.completar("prompt 1");
    expect(mock.llamadas).toHaveLength(1);

    mock.resetear();
    expect(mock.llamadas).toHaveLength(0);
  });

  it("simula timeout cuando la latencia excede el timeout", async () => {
    const mock = crearProveedorMock({ latenciaMs: 5000 });
    const resultado = await mock.completar("prompt", { timeoutMs: 100 });

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.error.tipo).toBe("timeout");
    }
  });

  it("usa un generador custom para respuestas dinámicas", async () => {
    const mock = crearProveedorMock({
      generador: (prompt) => {
        if (prompt.includes("plazo")) {
          return { ok: true, value: RESPUESTA_MOCK_DEFAULT };
        }
        return { ok: true, value: RESPUESTA_MOCK_SIN_PLAZO };
      },
    });

    const conPlazo = await mock.completar("tiene plazo de 5 días");
    const sinPlazo = await mock.completar("auto interlocutorio");

    expect(conPlazo.ok).toBe(true);
    if (conPlazo.ok) expect(conPlazo.value).toBe(RESPUESTA_MOCK_DEFAULT);

    expect(sinPlazo.ok).toBe(true);
    if (sinPlazo.ok) expect(sinPlazo.value).toBe(RESPUESTA_MOCK_SIN_PLAZO);
  });

  it("expone respuestas enlatadas para PBT", () => {
    const defecto = JSON.parse(RESPUESTA_MOCK_DEFAULT);
    expect(defecto.tienePlazo).toBe(true);
    expect(defecto.dias).toBe(10);
    expect(defecto.esHabil).toBe(true);
    expect(defecto.indeterminado).toBe(false);

    const sinPlazo = JSON.parse(RESPUESTA_MOCK_SIN_PLAZO);
    expect(sinPlazo.tienePlazo).toBe(false);

    const indeterminado = JSON.parse(RESPUESTA_MOCK_INDETERMINADO);
    expect(indeterminado.indeterminado).toBe(true);
  });
});

// =============================================================================
// TIMEOUT: 30 SEGUNDOS POR SOLICITUD (R7.1)
// =============================================================================

describe("Timeout de 30 s por solicitud", () => {
  it("el timeout por defecto es 30_000 ms", () => {
    expect(TIMEOUT_LLM_MS).toBe(30_000);
  });

  it("el mock respeta el timeout configurado", async () => {
    const mock = crearProveedorMock({ latenciaMs: 200 });
    const resultado = await mock.completar("prompt", { timeoutMs: 50 });

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.error.tipo).toBe("timeout");
    }
  });
});

// =============================================================================
// PROVEEDORES REALES: MANEJO DE ERRORES SIN EXCEPCIONES
// =============================================================================

describe("Proveedores reales — manejo de errores de red", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("Gemini devuelve error de timeout sin lanzar excepción", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("The operation was aborted due to timeout"))
    );

    const adaptador = crearProveedorGemini("fake-key");
    const resultado = await adaptador.completar("test");

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.error.tipo).toBe("timeout");
    }

    vi.unstubAllGlobals();
  });

  it("OpenAI devuelve error de auth (401) sin lanzar excepción", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: () => Promise.resolve("Unauthorized"),
      })
    );

    const adaptador = crearProveedorOpenAI("bad-key");
    const resultado = await adaptador.completar("test");

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.error.tipo).toBe("auth");
    }

    vi.unstubAllGlobals();
  });

  it("Anthropic devuelve error de rate limit (429) sin lanzar excepción", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        text: () => Promise.resolve("Too Many Requests"),
      })
    );

    const adaptador = crearProveedorAnthropic("key");
    const resultado = await adaptador.completar("test");

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.error.tipo).toBe("rate_limit");
    }

    vi.unstubAllGlobals();
  });

  it("Gemini extrae correctamente el texto de una respuesta exitosa", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            candidates: [
              {
                content: {
                  parts: [{ text: '{"tienePlazo": true, "dias": 3, "esHabil": true, "indeterminado": false}' }],
                },
              },
            ],
          }),
      })
    );

    const adaptador = crearProveedorGemini("key");
    const resultado = await adaptador.completar("analiza");

    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      const parsed = JSON.parse(resultado.value);
      expect(parsed.tienePlazo).toBe(true);
      expect(parsed.dias).toBe(3);
    }

    vi.unstubAllGlobals();
  });

  it("OpenAI extrae correctamente el texto de una respuesta exitosa", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [
              { message: { content: '{"tienePlazo": false, "dias": null, "esHabil": true, "indeterminado": false}' } },
            ],
          }),
      })
    );

    const adaptador = crearProveedorOpenAI("key");
    const resultado = await adaptador.completar("analiza");

    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      const parsed = JSON.parse(resultado.value);
      expect(parsed.tienePlazo).toBe(false);
    }

    vi.unstubAllGlobals();
  });

  it("Anthropic extrae correctamente el texto de una respuesta exitosa", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            content: [{ type: "text", text: '{"tienePlazo": true, "dias": 15, "esHabil": false, "indeterminado": false}' }],
          }),
      })
    );

    const adaptador = crearProveedorAnthropic("key");
    const resultado = await adaptador.completar("analiza");

    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      const parsed = JSON.parse(resultado.value);
      expect(parsed.dias).toBe(15);
      expect(parsed.esHabil).toBe(false);
    }

    vi.unstubAllGlobals();
  });

  it("Gemini devuelve respuesta_invalida cuando no hay candidates", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ candidates: [] }),
      })
    );

    const adaptador = crearProveedorGemini("key");
    const resultado = await adaptador.completar("test");

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.error.tipo).toBe("respuesta_invalida");
    }

    vi.unstubAllGlobals();
  });

  it("OpenAI devuelve error de red sin lanzar excepción", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("fetch failed: ECONNREFUSED"))
    );

    const adaptador = crearProveedorOpenAI("key");
    const resultado = await adaptador.completar("test");

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.error.tipo).toBe("red");
    }

    vi.unstubAllGlobals();
  });
});

// =============================================================================
// INTERFAZ: CONTRATO DE LA ADAPTADOR LLM
// =============================================================================

describe("Interfaz AdaptadorLLM — contrato genérico", () => {
  it("todos los proveedores exponen las mismas propiedades", () => {
    const gemini = crearAdaptadorLLM("gemini", "k");
    const openai = crearAdaptadorLLM("openai", "k");
    const claude = crearAdaptadorLLM("claude", "k");
    const mock = crearProveedorMock();

    for (const adaptador of [gemini, openai, claude, mock]) {
      expect(typeof adaptador.proveedor).toBe("string");
      expect(typeof adaptador.completar).toBe("function");
    }
  });

  it("completar siempre devuelve un Result<string, ErrorLLM> sin excepciones", async () => {
    const mock = crearProveedorMock();
    const resultado = await mock.completar("prompt");

    // Verificar forma del Result
    expect("ok" in resultado).toBe(true);
    if (resultado.ok) {
      expect(typeof resultado.value).toBe("string");
    } else {
      expect("tipo" in resultado.error).toBe(true);
      expect("mensaje" in resultado.error).toBe(true);
    }
  });
});
