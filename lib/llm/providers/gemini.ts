/**
 * Proveedor LLM — Google Gemini (vía REST API)
 *
 * Implementación basada en fetch sin SDK.
 * Usa la API REST de Gemini: https://generativelanguage.googleapis.com/v1beta/
 */

import { ok, err } from "@/lib/repository";
import type { Result } from "@/lib/repository";
import type { AdaptadorLLM, OpcionesLLM, ErrorLLM } from "../types";
import { TIMEOUT_LLM_MS, TEMPERATURA_DEFAULT, MAX_TOKENS_DEFAULT } from "../types";

const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const MODEL = "models/gemini-2.0-flash";

export function crearProveedorGemini(apiKey: string): AdaptadorLLM {
  return {
    proveedor: "gemini",

    async completar(
      prompt: string,
      opciones?: OpcionesLLM
    ): Promise<Result<string, ErrorLLM>> {
      const timeoutMs = opciones?.timeoutMs ?? TIMEOUT_LLM_MS;
      const temperatura = opciones?.temperatura ?? TEMPERATURA_DEFAULT;
      const maxTokens = opciones?.maxTokens ?? MAX_TOKENS_DEFAULT;

      const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];

      if (opciones?.sistema) {
        contents.push({
          role: "user",
          parts: [{ text: opciones.sistema }],
        });
        contents.push({
          role: "model",
          parts: [{ text: "Entendido." }],
        });
      }

      contents.push({
        role: "user",
        parts: [{ text: prompt }],
      });

      const body = {
        contents,
        generationConfig: {
          temperature: temperatura,
          maxOutputTokens: maxTokens,
        },
      };

      const url = `${GEMINI_BASE_URL}/${MODEL}:generateContent?key=${apiKey}`;

      try {
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(timeoutMs),
        });

        if (!response.ok) {
          const detalle = await response.text().catch(() => "");
          if (response.status === 401 || response.status === 403) {
            return err({ tipo: "auth", mensaje: "API key de Gemini inválida o sin permisos", detalle });
          }
          if (response.status === 429) {
            return err({ tipo: "rate_limit", mensaje: "Límite de solicitudes excedido en Gemini", detalle });
          }
          return err({
            tipo: "servidor",
            mensaje: `Error del servidor Gemini: HTTP ${response.status}`,
            detalle,
          });
        }

        const data = await response.json();
        const texto = data?.candidates?.[0]?.content?.parts?.[0]?.text;

        if (typeof texto !== "string" || texto.trim() === "") {
          return err({
            tipo: "respuesta_invalida",
            mensaje: "La respuesta de Gemini no contiene texto válido",
            detalle: JSON.stringify(data).slice(0, 500),
          });
        }

        return ok(texto.trim());
      } catch (error) {
        const mensaje = error instanceof Error ? error.message : String(error);

        if (mensaje.includes("timeout") || mensaje.includes("abort")) {
          return err({ tipo: "timeout", mensaje: "La solicitud a Gemini excedió el timeout de 30 s" });
        }

        return err({ tipo: "red", mensaje: "Error de red al contactar Gemini", detalle: mensaje });
      }
    },
  };
}
