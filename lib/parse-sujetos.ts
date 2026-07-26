/**
 * Parser de sujetos procesales.
 *
 * El campo `sujetos_procesales` del proceso se almacena como string
 * con el formato: "DEMANDANTE: Nombre | DEMANDADO: Nombre"
 *
 * Esta utilidad extrae demandante y demandado de forma robusta.
 */

export interface SujetosProcesales {
  demandante: string;
  demandado: string;
}

/**
 * Determina si un proceso es privado a partir del campo `sujetos_procesales`.
 *
 * La fuente pública (CPNU) marca los procesos privados con un texto del tipo
 * "--- [ PROCESO PRIVADO ] ---" en lugar de las partes reales, y no expone
 * sujetos ni historial de actuaciones.
 *
 * @param raw - String crudo del campo sujetos_procesales
 * @returns true si el proceso está marcado como privado por la fuente
 */
export function esProcesoPrivado(raw: string | null | undefined): boolean {
  if (!raw) return false;
  return /privado/i.test(raw);
}

/**
 * Parsea el string de sujetos procesales y extrae demandante y demandado.
 *
 * Formatos soportados:
 * - "DEMANDANTE: Nombre | DEMANDADO: Nombre"
 * - "DEMANDANTE: Nombre"
 * - JSON: '{"demandante":"...", "demandado":"..."}'
 *
 * @param raw - String crudo del campo sujetos_procesales
 * @returns Objeto con demandante y demandado (strings vacíos si no se encuentran)
 */
export function parseSujetosProcesales(raw: string | null | undefined): SujetosProcesales {
  const resultado: SujetosProcesales = {
    demandante: "",
    demandado: "",
  };

  if (!raw || raw.trim() === "" || raw.trim() === "{}") {
    return resultado;
  }

  // Intentar parsear como JSON primero
  if (raw.trim().startsWith("{")) {
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed === "object" && parsed !== null) {
        resultado.demandante = parsed.demandante ?? parsed.DEMANDANTE ?? "";
        resultado.demandado = parsed.demandado ?? parsed.DEMANDADO ?? "";
        return resultado;
      }
    } catch {
      // No es JSON válido, intentar formato texto
    }
  }

  // Formato texto: "DEMANDANTE: Nombre | DEMANDADO: Nombre"
  const partes = raw.split("|").map((p) => p.trim());

  for (const parte of partes) {
    const matchDemandante = parte.match(/^DEMANDANTE\s*:\s*(.+)$/i);
    if (matchDemandante && matchDemandante[1]) {
      resultado.demandante = matchDemandante[1].trim();
      continue;
    }

    const matchDemandado = parte.match(/^DEMANDADO\s*:\s*(.+)$/i);
    if (matchDemandado && matchDemandado[1]) {
      resultado.demandado = matchDemandado[1].trim();
    }
  }

  return resultado;
}
