/**
 * Proveedor LLM — OpenAI (vía REST API)
 *
 * Implementación basada en fetch sin SDK.
 * Usa la API REST de OpenAI: https://api.openai.com/v1/
 */

import { ok, err } from "@/lib/repository";
import type { Result } from "@/lib/repository";
import type { AdaptadorLLM, OpcionesLLM, ErrorLLM } from "../types";
import { TIMEOUT_LLM_MS, TEMPERATURA_DEFAULT, MAX_TOKENS_DEFAULT } from "../types";

const OPENAI_BASE_URL = "https://api.openai.com/v1";
const MODEL = "gpt-4o-mini";

export function crearProveedorOpenAI(apiKey: string): AdaptadorLLM {
  return {
    proveedor: "openai",

    async completar(
      prompt: string,
      opciones?: OpcionesLLM
    ): Promise<Result<string, ErrorLLM>> {
      const timeoutMs = opciones?.timeoutMs ?? TIMEOUT_LLM_MS;
      const temperatura = opciones?.temperatura ?? TEMPERATURA_DEFAULT;
      const maxTokens = opciones?.maxTokens ?? MAX_TOKENS_DEFAULT;

      const messages: Array<{ role: string; content: string }> = [];

      if (opciones?.sistema) {
        messages.push({ role: "system", content: opciones.sistema });
      }

      messages.push({ role: "user", content: prompt });

      const body = {
        model: MODEL,
        messages,
        temperature: temperatura,
        max_tokens: maxTokens,
      };

      try {
        const response = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(timeoutMs),
        });

        if (!response.ok) {
          const detalle = await response.text().catch(() => "");
          if (response.status === 401) {
            return err({ tipo: "auth", mensaje: "API key de OpenAI inválida", detalle });
          }
          if (response.status === 429) {
            return err({ tipo: "rate_limit", mensaje: "Límite de solicitudes excedido en OpenAI", detalle });
          }
          return err({
            tipo: "servidor",
            mensaje: `Error del servidor OpenAI: HTTP ${response.status}`,
            detalle,
          });
        }

        const data = await response.json();
        const texto = data?.choices?.[0]?.message?.content;

        if (typeof texto !== "string" || texto.trim() === "") {
          return err({
            tipo: "respuesta_invalida",
            mensaje: "La respuesta de OpenAI no contiene texto válido",
            detalle: JSON.stringify(data).slice(0, 500),
          });
        }

        return ok(texto.trim());
      } catch (error) {
        const mensaje = error instanceof Error ? error.message : String(error);

        if (mensaje.includes("timeout") || mensaje.includes("abort")) {
          return err({ tipo: "timeout", mensaje: "La solicitud a OpenAI excedió el timeout de 30 s" });
        }

        return err({ tipo: "red", mensaje: "Error de red al contactar OpenAI", detalle: mensaje });
      }
    },
  };
}
