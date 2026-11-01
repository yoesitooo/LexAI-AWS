/**
 * Proveedor LLM del demo público — LexAI
 *
 * En modo demo no se llama a ningún proveedor real (sin costo ni claves).
 * En lugar de una respuesta fija, este proveedor lee el texto de la actuación
 * y extrae el término con reglas simples, para que el análisis que ve el
 * visitante sea coherente con lo que dice la actuación:
 *
 * - "por el término de cinco (5) días"   → 5 días hábiles
 * - "dentro de los 10 días calendario"   → 10 días calendario
 * - sin término expreso                  → sin plazo
 *
 * No pretende reemplazar al LLM: es una simulación determinista y transparente.
 */

import { ok } from "@/lib/repository";
import type { RespuestaLLMAnalisis } from "@/lib/analizador-ia";
import { crearProveedorMock } from "./mock";

const NUMEROS: Record<string, number> = {
  uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9,
  diez: 10, quince: 15, veinte: 20, treinta: 30,
};

/** Separa el texto de la actuación del encabezado del prompt de análisis. */
function textoDeActuacion(prompt: string): string {
  const i = prompt.indexOf("\n\n");
  return (i >= 0 ? prompt.slice(i + 2) : prompt).toLowerCase();
}

/**
 * Analiza el texto de una actuación con reglas simples y devuelve la misma
 * estructura JSON que se le pide al LLM real.
 */
export function analizarTextoDemo(prompt: string): RespuestaLLMAnalisis {
  const texto = textoDeActuacion(prompt);
  const esHabil = !/(calendario|corridos)/.test(texto);

  // "(5) días" o "5 días"
  const conCifra = texto.match(/\(?\b(\d{1,3})\)?\s*d[ií]as/);
  let dias: number | null = conCifra ? Number(conCifra[1]) : null;

  // "cinco días" (sin cifra)
  if (dias === null) {
    const conPalabra = texto.match(
      /\b(uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|quince|veinte|treinta)\s+d[ií]as/,
    );
    dias = conPalabra ? NUMEROS[conPalabra[1]!]! : null;
  }

  if (dias === null) {
    return { tienePlazo: false, dias: null, esHabil: true, indeterminado: false };
  }
  if (dias < 1 || dias > 365) {
    return { tienePlazo: true, dias: null, esHabil, indeterminado: true };
  }
  return { tienePlazo: true, dias, esHabil, indeterminado: false };
}

/** Adaptador LLM para DEMO_MODE: sin red, responde con `analizarTextoDemo`. */
export function crearProveedorDemo() {
  return crearProveedorMock({
    generador: (prompt) => ok(JSON.stringify(analizarTextoDemo(prompt))),
  });
}
