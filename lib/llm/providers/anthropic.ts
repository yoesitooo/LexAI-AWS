/**
 * Proveedor LLM — Anthropic Claude (vía REST API)
 *
 * Implementación basada en fetch sin SDK.
 * Usa la API REST de Anthropic: https://api.anthropic.com/v1/
 * Soporta tanto "claude" como "anthropic" como valor de LLM_PROVIDER.
 */

import { ok, err } from "@/lib/repository";
import type { Result } from "@/lib/repository";
import type { AdaptadorLLM, OpcionesLLM, ErrorLLM } from "../types";
import { TIMEOUT_LLM_MS, TEMPERATURA_DEFAULT, MAX_TOKENS_DEFAULT } from "../types";

const ANTHROPIC_BASE_URL = "https://api.anthropic.com/v1";
const MODEL = "claude-sonnet-4-20250514";
const API_VERSION = "2023-06-01";

export function crearProveedorAnthropic(apiKey: string): AdaptadorLLM {
  return {
    proveedor: "anthropic",

    async completar(
      prompt: string,
      opciones?: OpcionesLLM
    ): Promise<Result<string, ErrorLLM>> {
      const timeoutMs = opciones?.timeoutMs ?? TIMEOUT_LLM_MS;
      const temperatura = opciones?.temperatura ?? TEMPERATURA_DEFAULT;
      const maxTokens = opciones?.maxTokens ?? MAX_TOKENS_DEFAULT;

      const messages: Array<{ role: string; content: string }> = [
        { role: "user", content: prompt },
      ];

      const body: Record<string, unknown> = {
        model: MODEL,
        messages,
        temperature: temperatura,
        max_tokens: maxTokens,
      };

      if (opciones?.sistema) {
        body.system = opciones.sistema;
      }

      try {
        const response = await fetch(`${ANTHROPIC_BASE_URL}/messages`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": API_VERSION,
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(timeoutMs),
        });

        if (!response.ok) {
          const detalle = await response.text().catch(() => "");
          if (response.status === 401) {
            return err({ tipo: "auth", mensaje: "API key de Anthropic inválida", detalle });
          }
          if (response.status === 429) {
            return err({ tipo: "rate_limit", mensaje: "Límite de solicitudes excedido en Anthropic", detalle });
          }
          return err({
            tipo: "servidor",
            mensaje: `Error del servidor Anthropic: HTTP ${response.status}`,
            detalle,
          });
        }

        const data = await response.json();
        const contenido = data?.content?.[0];

        if (!contenido || contenido.type !== "text" || typeof contenido.text !== "string") {
          return err({
            tipo: "respuesta_invalida",
            mensaje: "La respuesta de Anthropic no contiene texto válido",
            detalle: JSON.stringify(data).slice(0, 500),
          });
        }

        const texto = contenido.text.trim();
        if (texto === "") {
          return err({
            tipo: "respuesta_invalida",
            mensaje: "La respuesta de Anthropic está vacía",
          });
        }

        return ok(texto);
      } catch (error) {
        const mensaje = error instanceof Error ? error.message : String(error);

        if (mensaje.includes("timeout") || mensaje.includes("abort")) {
          return err({ tipo: "timeout", mensaje: "La solicitud a Anthropic excedió el timeout de 30 s" });
        }

        return err({ tipo: "red", mensaje: "Error de red al contactar Anthropic", detalle: mensaje });
      }
    },
  };
}
