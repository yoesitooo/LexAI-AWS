/**
 * Probe de descubrimiento de endpoints de DOCUMENTOS de la CPNU
 * (Rama Judicial de Colombia)
 *
 * Uso: npx tsx scripts/probe-documentos.ts [radicado1 radicado2 ...]
 *
 * Objetivo:
 * 1. Para cada radicado: obtener idProceso y actuaciones
 * 2. Encontrar actuaciones con conDocumentos=true (o probar con cualquiera)
 * 3. Descubrir el endpoint de LISTA de documentos por idRegActuacion
 * 4. Descubrir el endpoint de DESCARGA del binario por idRegDocumento
 *
 * No escribe archivos: solo imprime la forma de las respuestas para diseñar
 * los tipos y el cliente.
 */

export {}; // Marca el archivo como módulo (evita colisión de globals con otros scripts)

const BASE_URL = "https://consultaprocesos.ramajudicial.gov.co:448/api/v2";

const HEADERS = {
  Accept: "application/json, text/plain, */*",
  Referer: "https://consultaprocesos.ramajudicial.gov.co/",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
};

// Radicados por defecto (puedes pasar otros por CLI). Se buscan actuaciones con documentos.
const RADICADOS_DEFAULT = [
  "11001310303220170012300",
  "05001310500920200001200",
  "76001400300120230001500",
  // Procesos recientes (mayor probabilidad de expediente electrónico)
  "11001333603820220015400",
  "11001400308720230050100",
  "05001600020620190012300",
  "11001020300020230200100",
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function getJson(url: string): Promise<{ status: number; data: unknown }> {
  const res = await fetch(url, {
    method: "GET",
    headers: HEADERS,
    signal: AbortSignal.timeout(30_000),
  });
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { status: res.status, data };
}

async function idProcesoDeRadicado(radicado: string): Promise<number | null> {
  const url = new URL(`${BASE_URL}/Procesos/Consulta/NumeroRadicacion`);
  url.searchParams.set("numero", radicado);
  url.searchParams.set("SoloActivos", "false");
  url.searchParams.set("pagina", "1");
  const { status, data } = await getJson(url.toString());
  if (status !== 200 || !data || typeof data !== "object") return null;
  const procesos = (data as Record<string, unknown>).procesos as
    | Array<Record<string, unknown>>
    | undefined;
  if (!procesos || procesos.length === 0) return null;
  return (procesos[0]?.idProceso as number) ?? null;
}

interface ActuacionLive {
  idRegActuacion: number;
  actuacion: string;
  conDocumentos: boolean;
}

async function actuacionesDeProceso(idProceso: number): Promise<ActuacionLive[]> {
  const { status, data } = await getJson(
    `${BASE_URL}/Proceso/Actuaciones/${idProceso}?pagina=1`,
  );
  if (status !== 200 || !data || typeof data !== "object") return [];
  const arr =
    ((data as Record<string, unknown>).actuaciones as
      | Array<Record<string, unknown>>
      | undefined) ?? [];
  return arr.map((a) => ({
    idRegActuacion: a.idRegActuacion as number,
    actuacion: (a.actuacion as string) ?? "",
    conDocumentos: Boolean(a.conDocumentos),
  }));
}

// Candidatos para el endpoint de LISTA de documentos de una actuación
const LISTA_DOCS_CANDIDATOS = (idRegActuacion: number): string[] => [
  `${BASE_URL}/Proceso/DocumentosActuacion/${idRegActuacion}`,
  `${BASE_URL}/Proceso/Documentos/${idRegActuacion}`,
  `${BASE_URL}/Actuacion/Documentos/${idRegActuacion}`,
  `${BASE_URL}/Proceso/DocumentoActuacion/${idRegActuacion}`,
];

// Candidatos para el endpoint de DESCARGA del binario
const DESCARGA_CANDIDATOS = (idRegDocumento: number | string): string[] => [
  `${BASE_URL}/Descarga/Documento/${idRegDocumento}`,
  `${BASE_URL}/Descarga/Documentos/${idRegDocumento}`,
  `${BASE_URL}/Proceso/DescargaDocumento/${idRegDocumento}`,
];

async function probarListaDocumentos(
  idRegActuacion: number,
): Promise<{ url: string; data: unknown } | null> {
  for (const url of LISTA_DOCS_CANDIDATOS(idRegActuacion)) {
    console.log(`    → LISTA docs: ${url}`);
    try {
      const { status, data } = await getJson(url);
      if (status === 200 && data !== null) {
        console.log(`      ✅ 200. Preview: ${JSON.stringify(data).slice(0, 600)}`);
        // ¿Trae elementos?
        const arr = Array.isArray(data)
          ? data
          : (data as Record<string, unknown>)?.documentos ?? null;
        if (Array.isArray(arr) && arr.length > 0) {
          console.log(`      📦 ${arr.length} documento(s). Campos: ${Object.keys(arr[0]).join(", ")}`);
          return { url, data };
        }
        // Endpoint válido pero sin docs; lo devolvemos igual para registrar la URL
        return { url, data };
      }
      console.log(`      ❌ HTTP ${status}`);
    } catch (e) {
      console.log(`      ❌ ${e instanceof Error ? e.message : String(e)}`);
    }
    await sleep(400);
  }
  return null;
}

async function probarDescarga(idRegDocumento: number | string): Promise<void> {
  for (const url of DESCARGA_CANDIDATOS(idRegDocumento)) {
    console.log(`    → DESCARGA: ${url}`);
    try {
      const res = await fetch(url, {
        method: "GET",
        headers: HEADERS,
        signal: AbortSignal.timeout(30_000),
      });
      const ct = res.headers.get("content-type");
      const cd = res.headers.get("content-disposition");
      const cl = res.headers.get("content-length");
      console.log(
        `      status=${res.status} content-type=${ct} content-length=${cl} content-disposition=${cd}`,
      );
      if (res.ok && ct && !ct.includes("application/json")) {
        const buf = Buffer.from(await res.arrayBuffer());
        console.log(`      ✅ Binario recibido: ${buf.length} bytes. Primeros bytes: ${buf.slice(0, 8).toString("hex")}`);
        return;
      }
      if (res.ok) {
        const txt = await res.text();
        console.log(`      (respuesta JSON/text) ${txt.slice(0, 300)}`);
      }
    } catch (e) {
      console.log(`      ❌ ${e instanceof Error ? e.message : String(e)}`);
    }
    await sleep(400);
  }
}

async function main() {
  const radicados = process.argv.slice(2);
  const lista = radicados.length > 0 ? radicados : RADICADOS_DEFAULT;

  console.log("═".repeat(60));
  console.log(" PROBE DOCUMENTOS CPNU");
  console.log("═".repeat(60));

  for (const radicado of lista) {
    console.log(`\n${"─".repeat(60)}`);
    console.log(`📋 Radicado: ${radicado}`);
    const idProceso = await idProcesoDeRadicado(radicado);
    if (!idProceso) {
      console.log("  (sin proceso / no encontrado)");
      await sleep(500);
      continue;
    }
    console.log(`  idProceso: ${idProceso}`);
    const actuaciones = await actuacionesDeProceso(idProceso);
    console.log(`  actuaciones: ${actuaciones.length}`);
    const conDocs = actuaciones.filter((a) => a.conDocumentos);
    console.log(`  con conDocumentos=true: ${conDocs.length}`);

    // Preferimos actuaciones con documentos; si no hay, probamos la primera para validar URL
    const objetivos = conDocs.length > 0 ? conDocs.slice(0, 2) : actuaciones.slice(0, 1);

    for (const act of objetivos) {
      console.log(`\n  🔎 Actuación ${act.idRegActuacion} (${act.actuacion}) conDocumentos=${act.conDocumentos}`);
      const lista = await probarListaDocumentos(act.idRegActuacion);
      if (lista) {
        const arr = Array.isArray(lista.data)
          ? lista.data
          : ((lista.data as Record<string, unknown>)?.documentos as unknown[]) ?? [];
        const primer = Array.isArray(arr) ? (arr[0] as Record<string, unknown>) : undefined;
        if (primer) {
          console.log(`      primer documento: ${JSON.stringify(primer).slice(0, 400)}`);
          const idDoc =
            (primer.idRegDocumento as number) ??
            (primer.idRegActuacion as number) ??
            (primer.id as number) ??
            (primer.idDocumento as number);
          if (idDoc !== undefined) {
            await probarDescarga(idDoc);
          }
        }
      }
      await sleep(500);
    }
    await sleep(500);
  }
}

main().catch((e) => {
  console.error("Error fatal:", e);
  process.exit(1);
});
