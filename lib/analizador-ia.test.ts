/**
 * Tests del Analizador de Actuaciones con IA — LexAI MVP
 *
 * Valida:
 * - Prompt en terminología procesal colombiana (R7.2)
 * - Extracción de duración entero 1–365 días (R7.3)
 * - Clasificación días hábiles por defecto (R7.4)
 * - Creación de Plazo (pendiente) cuando plazo determinado (R7.5)
 * - Marca sin plazo cuando no aplica (R7.6)
 * - Marca indeterminado si fuera de 1–365 o null (R7.7)
 * - Proveedor intercambiable por env (R7.8)
 */

import { describe, it, expect, vi } from "vitest";
import {
  analizarActuacion,
  analizarActuacionConReintentos,
  parsearRespuestaLLM,
  normalizarRespuesta,
  PROMPT_SISTEMA_ANALISIS,
  type RespuestaLLMAnalisis,
  type ResultadoAnalisisPendiente,
} from "./analizador-ia";
import {
  crearProveedorMock,
  RESPUESTA_MOCK_DEFAULT,
  RESPUESTA_MOCK_SIN_PLAZO,
  RESPUESTA_MOCK_INDETERMINADO,
} from "@/lib/llm";
import { ok, err } from "@/lib/repository";
import type { AdaptadorLLM, ErrorLLM } from "@/lib/llm";

// =============================================================================
// PROMPT: TERMINOLOGÍA COLOMBIANA (R7.2)
// =============================================================================

describe("Prompt del Analizador IA — terminología colombiana", () => {
  it("el prompt del sistema contiene terminología procesal colombiana", () => {
    const prompt = PROMPT_SISTEMA_ANALISIS.toLowerCase();
    expect(prompt).toContain("traslado");
    expect(prompt).toContain("ejecutoria");
    expect(prompt).toContain("días hábiles");
    expect(prompt).toContain("subsanación");
    expect(prompt).toContain("apelación");
    expect(prompt).toContain("auto");
    expect(prompt).toContain("sentencia");
  });

  it("el prompt solicita salida JSON con la estructura correcta", () => {
    expect(PROMPT_SISTEMA_ANALISIS).toContain("tienePlazo");
    expect(PROMPT_SISTEMA_ANALISIS).toContain("dias");
    expect(PROMPT_SISTEMA_ANALISIS).toContain("esHabil");
    expect(PROMPT_SISTEMA_ANALISIS).toContain("indeterminado");
  });

  it("el prompt establece días hábiles como defecto", () => {
    expect(PROMPT_SISTEMA_ANALISIS).toContain("DÍAS HÁBILES por defecto");
  });

  it("el prompt indica que solo plazos a cargo del abogado", () => {
    expect(PROMPT_SISTEMA_ANALISIS).toContain("A CARGO DEL ABOGADO");
  });
});

// =============================================================================
// analizarActuacion: INTEGRACIÓN CON MOCK (R7.2, R7.5, R7.6, R7.7)
// =============================================================================

describe("analizarActuacion — integración con mock LLM", () => {
  it("devuelve plazo determinado cuando el LLM indica tienePlazo=true y dias 1–365 (R7.5)", async () => {
    const mock = crearProveedorMock({ respuesta: RESPUESTA_MOCK_DEFAULT });
    const resultado = await analizarActuacion(
      "Auto que corre traslado por 10 días",
      mock,
    );

    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.value).toEqual({
        tipo: "plazo",
        dias: 10,
        esHabil: true,
      });
    }
  });

  it("devuelve sin_plazo cuando el LLM indica tienePlazo=false (R7.6)", async () => {
    const mock = crearProveedorMock({ respuesta: RESPUESTA_MOCK_SIN_PLAZO });
    const resultado = await analizarActuacion(
      "Se archiva el expediente por desistimiento tácito",
      mock,
    );

    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.value).toEqual({ tipo: "sin_plazo" });
    }
  });

  it("devuelve indeterminado cuando el LLM indica indeterminado=true (R7.7)", async () => {
    const mock = crearProveedorMock({ respuesta: RESPUESTA_MOCK_INDETERMINADO });
    const resultado = await analizarActuacion(
      "Auto ordena término prudencial para aportar prueba",
      mock,
    );

    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.value).toEqual({ tipo: "indeterminado" });
    }
  });

  it("envía el texto de la actuación al LLM con el prompt correcto", async () => {
    const mock = crearProveedorMock();
    const texto = "Auto interlocutorio que admite recurso de apelación";
    await analizarActuacion(texto, mock);

    expect(mock.llamadas).toHaveLength(1);
    expect(mock.llamadas[0]!.prompt).toContain(texto);
    expect(mock.llamadas[0]!.opciones?.sistema).toBe(PROMPT_SISTEMA_ANALISIS);
  });

  it("devuelve error cuando el LLM falla (timeout)", async () => {
    const mock = crearProveedorMock({
      error: { tipo: "timeout", mensaje: "Timeout de 30s excedido" },
    });
    const resultado = await analizarActuacion("texto cualquiera", mock);

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.error.tipo).toBe("timeout");
    }
  });

  it("devuelve error cuando el LLM falla (red)", async () => {
    const mock = crearProveedorMock({
      error: { tipo: "red", mensaje: "Sin conexión" },
    });
    const resultado = await analizarActuacion("texto cualquiera", mock);

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.error.tipo).toBe("llm_fallo");
    }
  });

  it("devuelve error cuando el LLM devuelve JSON inválido", async () => {
    const mock = crearProveedorMock({ respuesta: "esto no es json" });
    const resultado = await analizarActuacion("texto cualquiera", mock);

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.error.tipo).toBe("respuesta_invalida");
    }
  });

  it("maneja respuesta con días calendario (esHabil=false) (R7.4)", async () => {
    const mock = crearProveedorMock({
      respuesta: JSON.stringify({
        tienePlazo: true,
        dias: 15,
        esHabil: false,
        indeterminado: false,
      }),
    });
    const resultado = await analizarActuacion(
      "Auto ordena subsanar en 15 días calendario",
      mock,
    );

    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.value).toEqual({
        tipo: "plazo",
        dias: 15,
        esHabil: false,
      });
    }
  });

  it("normaliza a indeterminado si dias > 365 (R7.7)", async () => {
    const mock = crearProveedorMock({
      respuesta: JSON.stringify({
        tienePlazo: true,
        dias: 500,
        esHabil: true,
        indeterminado: false,
      }),
    });
    const resultado = await analizarActuacion("plazo extendido", mock);

    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.value).toEqual({ tipo: "indeterminado" });
    }
  });

  it("normaliza a indeterminado si dias < 1 (R7.7)", async () => {
    const mock = crearProveedorMock({
      respuesta: JSON.stringify({
        tienePlazo: true,
        dias: 0,
        esHabil: true,
        indeterminado: false,
      }),
    });
    const resultado = await analizarActuacion("plazo cero días", mock);

    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.value).toEqual({ tipo: "indeterminado" });
    }
  });

  it("normaliza a indeterminado si dias es negativo (R7.7)", async () => {
    const mock = crearProveedorMock({
      respuesta: JSON.stringify({
        tienePlazo: true,
        dias: -5,
        esHabil: true,
        indeterminado: false,
      }),
    });
    const resultado = await analizarActuacion("plazo negativo", mock);

    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.value).toEqual({ tipo: "indeterminado" });
    }
  });

  it("normaliza a indeterminado si dias es null y tienePlazo=true (R7.7)", async () => {
    const mock = crearProveedorMock({
      respuesta: JSON.stringify({
        tienePlazo: true,
        dias: null,
        esHabil: true,
        indeterminado: false,
      }),
    });
    const resultado = await analizarActuacion(
      "plazo sin duración clara",
      mock,
    );

    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.value).toEqual({ tipo: "indeterminado" });
    }
  });
});

// =============================================================================
// parsearRespuestaLLM: PARSING ROBUSTO
// =============================================================================

describe("parsearRespuestaLLM — parsing robusto de JSON", () => {
  it("parsea JSON directo correctamente", () => {
    const json = '{"tienePlazo": true, "dias": 3, "esHabil": true, "indeterminado": false}';
    const resultado = parsearRespuestaLLM(json);

    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.value.tienePlazo).toBe(true);
      expect(resultado.value.dias).toBe(3);
      expect(resultado.value.esHabil).toBe(true);
      expect(resultado.value.indeterminado).toBe(false);
    }
  });

  it("maneja JSON envuelto en markdown code block", () => {
    const json = '```json\n{"tienePlazo": false, "dias": null, "esHabil": true, "indeterminado": false}\n```';
    const resultado = parsearRespuestaLLM(json);

    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.value.tienePlazo).toBe(false);
    }
  });

  it("rechaza texto que no es JSON", () => {
    const resultado = parsearRespuestaLLM("No puedo analizar esta actuación");
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.error.tipo).toBe("respuesta_invalida");
    }
  });

  it("rechaza JSON sin campo tienePlazo", () => {
    const resultado = parsearRespuestaLLM('{"dias": 5, "esHabil": true, "indeterminado": false}');
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.error.tipo).toBe("respuesta_invalida");
    }
  });

  it("rechaza JSON con tienePlazo no booleano", () => {
    const resultado = parsearRespuestaLLM('{"tienePlazo": "si", "dias": 5, "esHabil": true, "indeterminado": false}');
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.error.tipo).toBe("respuesta_invalida");
    }
  });

  it("rechaza JSON con esHabil no booleano", () => {
    const resultado = parsearRespuestaLLM('{"tienePlazo": true, "dias": 5, "esHabil": "true", "indeterminado": false}');
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.error.tipo).toBe("respuesta_invalida");
    }
  });

  it("rechaza JSON con dias string (tipo inválido)", () => {
    const resultado = parsearRespuestaLLM('{"tienePlazo": true, "dias": "cinco", "esHabil": true, "indeterminado": false}');
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.error.tipo).toBe("respuesta_invalida");
    }
  });

  it("acepta JSON con espacios extra alrededor", () => {
    const json = '   {"tienePlazo": true, "dias": 10, "esHabil": true, "indeterminado": false}   ';
    const resultado = parsearRespuestaLLM(json);
    expect(resultado.ok).toBe(true);
  });
});

// =============================================================================
// normalizarRespuesta: LÓGICA DE NEGOCIO (R7.3, R7.4, R7.5, R7.6, R7.7)
// =============================================================================

describe("normalizarRespuesta — lógica de negocio", () => {
  it("sin_plazo cuando tienePlazo es false (R7.6)", () => {
    const resultado = normalizarRespuesta({
      tienePlazo: false,
      dias: null,
      esHabil: true,
      indeterminado: false,
    });
    expect(resultado).toEqual({ tipo: "sin_plazo" });
  });

  it("sin_plazo aunque dias tenga valor si tienePlazo es false (R7.6)", () => {
    const resultado = normalizarRespuesta({
      tienePlazo: false,
      dias: 10,
      esHabil: true,
      indeterminado: false,
    });
    expect(resultado).toEqual({ tipo: "sin_plazo" });
  });

  it("plazo determinado con dias entre 1–365 y esHabil=true (R7.5)", () => {
    const resultado = normalizarRespuesta({
      tienePlazo: true,
      dias: 5,
      esHabil: true,
      indeterminado: false,
    });
    expect(resultado).toEqual({ tipo: "plazo", dias: 5, esHabil: true });
  });

  it("plazo con dias=1 (borde inferior) (R7.3)", () => {
    const resultado = normalizarRespuesta({
      tienePlazo: true,
      dias: 1,
      esHabil: true,
      indeterminado: false,
    });
    expect(resultado).toEqual({ tipo: "plazo", dias: 1, esHabil: true });
  });

  it("plazo con dias=365 (borde superior) (R7.3)", () => {
    const resultado = normalizarRespuesta({
      tienePlazo: true,
      dias: 365,
      esHabil: true,
      indeterminado: false,
    });
    expect(resultado).toEqual({ tipo: "plazo", dias: 365, esHabil: true });
  });

  it("plazo con esHabil=false (días calendario) (R7.4)", () => {
    const resultado = normalizarRespuesta({
      tienePlazo: true,
      dias: 30,
      esHabil: false,
      indeterminado: false,
    });
    expect(resultado).toEqual({ tipo: "plazo", dias: 30, esHabil: false });
  });

  it("indeterminado cuando indeterminado=true explícito (R7.7)", () => {
    const resultado = normalizarRespuesta({
      tienePlazo: true,
      dias: null,
      esHabil: true,
      indeterminado: true,
    });
    expect(resultado).toEqual({ tipo: "indeterminado" });
  });

  it("indeterminado cuando indeterminado=true con dias presente (R7.7)", () => {
    const resultado = normalizarRespuesta({
      tienePlazo: true,
      dias: 10,
      esHabil: true,
      indeterminado: true,
    });
    expect(resultado).toEqual({ tipo: "indeterminado" });
  });

  it("indeterminado cuando dias=null y indeterminado=false (R7.7)", () => {
    const resultado = normalizarRespuesta({
      tienePlazo: true,
      dias: null,
      esHabil: true,
      indeterminado: false,
    });
    expect(resultado).toEqual({ tipo: "indeterminado" });
  });

  it("indeterminado cuando dias=0 (fuera de rango) (R7.7)", () => {
    const resultado = normalizarRespuesta({
      tienePlazo: true,
      dias: 0,
      esHabil: true,
      indeterminado: false,
    });
    expect(resultado).toEqual({ tipo: "indeterminado" });
  });

  it("indeterminado cuando dias=366 (fuera de rango) (R7.7)", () => {
    const resultado = normalizarRespuesta({
      tienePlazo: true,
      dias: 366,
      esHabil: true,
      indeterminado: false,
    });
    expect(resultado).toEqual({ tipo: "indeterminado" });
  });

  it("indeterminado cuando dias es decimal (no entero) (R7.7)", () => {
    const resultado = normalizarRespuesta({
      tienePlazo: true,
      dias: 5.5,
      esHabil: true,
      indeterminado: false,
    });
    expect(resultado).toEqual({ tipo: "indeterminado" });
  });

  it("indeterminado cuando dias es negativo (R7.7)", () => {
    const resultado = normalizarRespuesta({
      tienePlazo: true,
      dias: -1,
      esHabil: true,
      indeterminado: false,
    });
    expect(resultado).toEqual({ tipo: "indeterminado" });
  });
});


// =============================================================================
// analizarActuacionConReintentos: REINTENTOS DEL ANÁLISIS IA (R7.9)
// =============================================================================

describe("analizarActuacionConReintentos — reintentos del análisis IA (R7.9)", () => {
  it("devuelve el resultado al primer intento si el LLM responde correctamente", async () => {
    const mock = crearProveedorMock({ respuesta: RESPUESTA_MOCK_DEFAULT });
    const resultado = await analizarActuacionConReintentos(
      "Auto que corre traslado por 10 días",
      mock,
      { logger: () => {} },
    );

    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.value).toEqual({
        tipo: "plazo",
        dias: 10,
        esHabil: true,
      });
    }
    expect(mock.llamadas).toHaveLength(1);
  });

  it("reintenta hasta 3 veces cuando el LLM falla y devuelve analisis_pendiente", async () => {
    const mock = crearProveedorMock({
      error: { tipo: "timeout", mensaje: "Timeout de 30s excedido" },
    });
    const logger = vi.fn();
    const resultado = await analizarActuacionConReintentos(
      "texto de actuación",
      mock,
      { logger },
    );

    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      const pendiente = resultado.value as ResultadoAnalisisPendiente;
      expect(pendiente.tipo).toBe("analisis_pendiente");
      expect(pendiente.intentos).toBe(3);
      expect(pendiente.ultimoError.tipo).toBe("timeout");
    }
    // Se llamó 3 veces al LLM
    expect(mock.llamadas).toHaveLength(3);
  });

  it("respeta maxIntentos configurado", async () => {
    const mock = crearProveedorMock({
      error: { tipo: "servidor", mensaje: "Internal server error" },
    });
    const logger = vi.fn();
    const resultado = await analizarActuacionConReintentos(
      "texto de actuación",
      mock,
      { maxIntentos: 5, logger },
    );

    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      const pendiente = resultado.value as ResultadoAnalisisPendiente;
      expect(pendiente.tipo).toBe("analisis_pendiente");
      expect(pendiente.intentos).toBe(5);
    }
    expect(mock.llamadas).toHaveLength(5);
  });

  it("tiene éxito en el segundo intento si el primero falla", async () => {
    let llamadaNum = 0;
    const adaptadorConFallo: AdaptadorLLM = {
      proveedor: "mock-intermitente",
      async completar(prompt, opciones) {
        llamadaNum++;
        if (llamadaNum === 1) {
          return err<ErrorLLM>({ tipo: "red", mensaje: "Sin conexión" });
        }
        return ok(RESPUESTA_MOCK_DEFAULT);
      },
    };
    const logger = vi.fn();
    const resultado = await analizarActuacionConReintentos(
      "Auto interlocutorio",
      adaptadorConFallo,
      { logger },
    );

    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.value).toEqual({
        tipo: "plazo",
        dias: 10,
        esHabil: true,
      });
    }
    expect(llamadaNum).toBe(2);
    // Se registra el fallo del primer intento
    expect(logger).toHaveBeenCalledTimes(1);
  });

  it("tiene éxito en el tercer intento tras dos fallos", async () => {
    let llamadaNum = 0;
    const adaptadorConFallos: AdaptadorLLM = {
      proveedor: "mock-intermitente",
      async completar() {
        llamadaNum++;
        if (llamadaNum <= 2) {
          return err<ErrorLLM>({ tipo: "rate_limit", mensaje: "Rate limited" });
        }
        return ok(RESPUESTA_MOCK_SIN_PLAZO);
      },
    };
    const logger = vi.fn();
    const resultado = await analizarActuacionConReintentos(
      "Sentencia ordinaria",
      adaptadorConFallos,
      { logger },
    );

    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.value).toEqual({ tipo: "sin_plazo" });
    }
    expect(llamadaNum).toBe(3);
    expect(logger).toHaveBeenCalledTimes(2);
  });

  it("nunca lanza excepciones — siempre devuelve Result.ok", async () => {
    const mock = crearProveedorMock({
      error: { tipo: "red", mensaje: "Conexión rechazada" },
    });
    const resultado = await analizarActuacionConReintentos(
      "texto",
      mock,
      { logger: () => {} },
    );

    // Result siempre es ok (nunca error) — la función no propaga fallos
    expect(resultado.ok).toBe(true);
  });

  it("registra errores en cada intento fallido mediante el logger", async () => {
    const mock = crearProveedorMock({
      error: { tipo: "servidor", mensaje: "500 Internal Server Error" },
    });
    const logger = vi.fn();
    await analizarActuacionConReintentos("texto", mock, { logger });

    // 3 intentos fallidos + 1 mensaje final de "reintentos agotados"
    expect(logger).toHaveBeenCalledTimes(4);
    expect(logger.mock.calls[0]![0]).toContain("Intento 1/3 falló");
    expect(logger.mock.calls[1]![0]).toContain("Intento 2/3 falló");
    expect(logger.mock.calls[2]![0]).toContain("Intento 3/3 falló");
    expect(logger.mock.calls[3]![0]).toContain("Reintentos agotados");
  });

  it("maneja error de respuesta_invalida como fallo reintentable", async () => {
    const mock = crearProveedorMock({ respuesta: "esto no es json" });
    const logger = vi.fn();
    const resultado = await analizarActuacionConReintentos(
      "actuación con respuesta inválida",
      mock,
      { logger },
    );

    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      const pendiente = resultado.value as ResultadoAnalisisPendiente;
      expect(pendiente.tipo).toBe("analisis_pendiente");
      expect(pendiente.ultimoError.tipo).toBe("respuesta_invalida");
    }
    expect(mock.llamadas).toHaveLength(3);
  });

  it("usa console.error como logger por defecto cuando no se pasa logger", async () => {
    const mock = crearProveedorMock({ respuesta: RESPUESTA_MOCK_DEFAULT });
    // No pasar opciones — usa defaults
    const resultado = await analizarActuacionConReintentos("texto", mock);

    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.value).toEqual({
        tipo: "plazo",
        dias: 10,
        esHabil: true,
      });
    }
  });

  it("con maxIntentos=1 solo intenta una vez", async () => {
    const mock = crearProveedorMock({
      error: { tipo: "timeout", mensaje: "Timeout" },
    });
    const logger = vi.fn();
    const resultado = await analizarActuacionConReintentos(
      "texto",
      mock,
      { maxIntentos: 1, logger },
    );

    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      const pendiente = resultado.value as ResultadoAnalisisPendiente;
      expect(pendiente.tipo).toBe("analisis_pendiente");
      expect(pendiente.intentos).toBe(1);
    }
    expect(mock.llamadas).toHaveLength(1);
  });

  it("no bloquea otros procesos — la función retorna rápidamente cuando falla", async () => {
    const mock = crearProveedorMock({
      error: { tipo: "red", mensaje: "Sin red" },
    });
    const inicio = Date.now();
    await analizarActuacionConReintentos("texto", mock, { logger: () => {} });
    const duracion = Date.now() - inicio;

    // Con mock sin latencia, debe completarse en menos de 100ms
    expect(duracion).toBeLessThan(100);
  });
});
