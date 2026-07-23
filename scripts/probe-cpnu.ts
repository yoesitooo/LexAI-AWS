/**
 * Script de prueba aislado para validar los endpoints de la CPNU
 * (Consulta de Procesos Nacional Unificada - Rama Judicial de Colombia)
 *
 * Uso: npx tsx scripts/probe-cpnu.ts
 *
 * Este script:
 * 1. Consulta el endpoint confirmado de búsqueda por radicado
 * 2. A partir de un idProceso real obtenido, descubre y confirma el endpoint de actuaciones
 * 3. Captura la forma real de las respuestas para generar fixtures
 */

const BASE_URL = "https://consultaprocesos.ramajudicial.gov.co:448/api/v2";

// Headers requeridos para la API CPNU (simular navegador)
const HEADERS = {
  Accept: "application/json, text/plain, */*",
  Referer: "https://consultaprocesos.ramajudicial.gov.co/",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
};

/**
 * Radicados reales de 23 dígitos para prueba.
 * Estructura: CCCCC (DANE municipio) + DD (entidad) + JJ (especialidad) + NNN (despacho) + AAAA (año) + NNNNNNN (consecutivo)
 *
 * Estos son radicados públicos obtenidos del portal de consulta de procesos:
 */
const RADICADOS_PRUEBA = [
  "11001310303220170012300", // Bogotá - Civil - 2017
  "05001310500920200001200", // Medellín - Laboral - 2020
  "76001400300120230001500", // Cali - Civil Municipal - 2023
];

interface ResultadoProbe {
  radicado: string;
  exitoso: boolean;
  procesos?: unknown[];
  paginacion?: unknown;
  error?: string;
  actuaciones?: unknown[];
  endpointActuaciones?: string;
}

async function consultarPorRadicado(
  radicado: string,
  pagina = 1,
  soloActivos = false
): Promise<Response> {
  const url = new URL(`${BASE_URL}/Procesos/Consulta/NumeroRadicacion`);
  url.searchParams.set("numero", radicado);
  url.searchParams.set("SoloActivos", soloActivos.toString());
  url.searchParams.set("pagina", pagina.toString());

  console.log(`\n🔍 Consultando: ${url.toString()}`);

  return fetch(url.toString(), {
    method: "GET",
    headers: HEADERS,
    signal: AbortSignal.timeout(30_000), // Timeout 30s
  });
}

/**
 * Endpoint de detalle de actuaciones por idProceso.
 *
 * DESCUBRIMIENTO:
 * Basado en el análisis del frontend de consultaprocesos.ramajudicial.gov.co,
 * el endpoint de actuaciones sigue el patrón:
 *   GET {BASE_URL}/Proceso/Actuaciones/{idProceso}
 *
 * Parámetros conocidos:
 * - pagina: número de página (1-indexed)
 *
 * Este endpoint se confirma/descubre dinámicamente en este script.
 */
const ENDPOINTS_ACTUACIONES_CANDIDATOS = [
  // Patrón más probable basado en la estructura de la API v2
  (idProceso: string) => `${BASE_URL}/Proceso/Actuaciones/${idProceso}`,
  // Alternativa con query param
  (idProceso: string) =>
    `${BASE_URL}/Procesos/Actuaciones?idProceso=${idProceso}`,
  // Alternativa plural
  (idProceso: string) => `${BASE_URL}/Proceso/Actuaciones/${idProceso}?pagina=1`,
];

async function descubrirEndpointActuaciones(
  idProceso: string
): Promise<{ url: string; data: unknown } | null> {
  console.log(
    `\n🔎 Descubriendo endpoint de actuaciones para idProceso: ${idProceso}`
  );

  for (const buildUrl of ENDPOINTS_ACTUACIONES_CANDIDATOS) {
    const url = buildUrl(idProceso);
    console.log(`  → Probando: ${url}`);

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: HEADERS,
        signal: AbortSignal.timeout(30_000),
      });

      if (response.ok) {
        const data = await response.json();
        console.log(`  ✅ Endpoint confirmado: ${url}`);
        console.log(`  📄 Respuesta (preview):`, JSON.stringify(data).slice(0, 500));
        return { url, data };
      } else {
        console.log(`  ❌ HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.log(`  ❌ Error: ${msg}`);
    }

    // Rate limiting: esperar 500ms entre peticiones
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  return null;
}

async function ejecutarProbe(): Promise<void> {
  console.log("═══════════════════════════════════════════════════════════");
  console.log(" PROBE CPNU — Validación de endpoints");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`Fecha: ${new Date().toISOString()}`);
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Radicados de prueba: ${RADICADOS_PRUEBA.length}`);

  const resultados: ResultadoProbe[] = [];

  for (const radicado of RADICADOS_PRUEBA) {
    console.log(`\n${"─".repeat(60)}`);
    console.log(`📋 Radicado: ${radicado}`);

    const resultado: ResultadoProbe = { radicado, exitoso: false };

    try {
      const response = await consultarPorRadicado(radicado);

      if (!response.ok) {
        resultado.error = `HTTP ${response.status}: ${response.statusText}`;
        console.log(`  ❌ ${resultado.error}`);
        resultados.push(resultado);
        continue;
      }

      const data = await response.json();
      resultado.exitoso = true;

      // Analizar la forma de la respuesta
      console.log("\n  📊 Forma de la respuesta:");
      console.log(`  Claves raíz: ${Object.keys(data).join(", ")}`);

      if (data.procesos && Array.isArray(data.procesos)) {
        resultado.procesos = data.procesos;
        console.log(`  Procesos encontrados: ${data.procesos.length}`);

        if (data.procesos.length > 0) {
          const primer = data.procesos[0];
          console.log(`  Campos del primer proceso: ${Object.keys(primer).join(", ")}`);
          console.log(`  idProceso: ${primer.idProceso}`);
          console.log(`  llaveProceso: ${primer.llaveProceso}`);
          console.log(`  despacho: ${primer.despacho}`);
          console.log(`  departamento: ${primer.departamento}`);
          console.log(`  sujetosProcesales: ${primer.sujetosProcesales}`);
          console.log(`  fechaUltimaActuacion: ${primer.fechaUltimaActuacion}`);

          // Intentar descubrir endpoint de actuaciones con el primer idProceso
          if (primer.idProceso) {
            const actuacionesResult = await descubrirEndpointActuaciones(
              primer.idProceso
            );
            if (actuacionesResult) {
              resultado.endpointActuaciones = actuacionesResult.url;
              resultado.actuaciones = Array.isArray(actuacionesResult.data)
                ? actuacionesResult.data
                : (actuacionesResult.data as Record<string, unknown>)?.actuaciones
                  ? ((actuacionesResult.data as Record<string, unknown>).actuaciones as unknown[])
                  : [actuacionesResult.data];
            }
          }
        }
      }

      // Paginación
      if (data.paginacion || data.paginas || data.totalPages) {
        resultado.paginacion = data.paginacion || {
          paginas: data.paginas,
          totalPages: data.totalPages,
          registros: data.registros,
        };
        console.log(`  Paginación:`, JSON.stringify(resultado.paginacion));
      }
    } catch (error) {
      resultado.error =
        error instanceof Error ? error.message : String(error);
      console.log(`  ❌ Error: ${resultado.error}`);
    }

    resultados.push(resultado);

    // Rate limiting entre consultas
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  // Resumen
  console.log(`\n${"═".repeat(60)}`);
  console.log(" RESUMEN DE RESULTADOS");
  console.log(`${"═".repeat(60)}`);

  const exitosos = resultados.filter((r) => r.exitoso);
  console.log(`Exitosos: ${exitosos.length}/${resultados.length}`);

  if (exitosos.length > 0) {
    const conActuaciones = exitosos.filter((r) => r.endpointActuaciones);
    console.log(`Con endpoint de actuaciones confirmado: ${conActuaciones.length}`);
    if (conActuaciones.length > 0 && conActuaciones[0]) {
      console.log(
        `Endpoint de actuaciones: ${conActuaciones[0].endpointActuaciones}`
      );
    }
  }

  // Guardar resultados como fixture
  const fixtureOutput = JSON.stringify(resultados, null, 2);
  console.log(`\n📁 Resultados completos (para fixture):\n${fixtureOutput}`);
}

// Ejecutar
ejecutarProbe().catch((err) => {
  console.error("Error fatal en probe:", err);
  process.exit(1);
});
