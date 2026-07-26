/**
 * Pruebas para descarga-documentos.ts
 *
 * Verifica la sincronización de documentos CPNU hacia el expediente digital:
 * - Descarga documentos faltantes y crea los registros correspondientes
 * - Es idempotente (no re-descarga documentos ya almacenados)
 * - Es resiliente (fallos por documento/actuación no detienen el resto)
 * - Respeta el tamaño máximo por documento
 * - Deriva nombres de archivo con extensión y sanitiza
 */

import { describe, it, expect, vi } from "vitest";
import {
  sincronizarDocumentosProceso,
  derivarNombreArchivo,
  sanitizarNombre,
  type AlmacenamientoDocumentos,
} from "./descarga-documentos";
import type {
  ClienteCPNU,
  DocumentoActuacionCPNU,
  DocumentoDescargadoCPNU,
  Result,
  FalloCPNU,
} from "./cpnu-client";

// ─── Helpers de fabricación ───────────────────────────────────────────────

function docMeta(overrides: Partial<DocumentoActuacionCPNU> = {}): DocumentoActuacionCPNU {
  return {
    idRegDocumento: 100,
    consActuacion: 1,
    nombre: "oficio_remision",
    descripcion: "Oficio de remisión",
    tipo: "pdf",
    fechaCarga: "2023-02-27T00:00:00",
    ...overrides,
  };
}

function descargaOk(bytes = 1024): DocumentoDescargadoCPNU {
  return {
    contenido: Buffer.alloc(bytes, 1),
    tipoMime: "application/pdf",
    nombreArchivo: "oficio_remision.pdf",
    tamanoBytes: bytes,
  };
}

/** Almacenamiento en memoria para pruebas (no toca disco). */
function almacenamientoMemoria() {
  const guardados: { procesoId: string; nombreDisco: string; bytes: number }[] = [];
  const almacenamiento: AlmacenamientoDocumentos = {
    guardar: vi.fn(async (procesoId, nombreDisco, contenido) => {
      guardados.push({ procesoId, nombreDisco, bytes: contenido.length });
    }),
  };
  return { almacenamiento, guardados };
}

/**
 * Construye un fake de Prisma con las operaciones usadas por el módulo.
 */
function fakeDb(opciones: {
  proceso?: { id: string; usuario_id: string } | null;
  actuaciones?: { id: string; id_actuacion_cpnu: string }[];
  existentes?: { id_documento_cpnu: string | null }[];
}) {
  const creados: Record<string, unknown>[] = [];
  const db = {
    proceso: {
      findUnique: vi.fn(async () =>
        opciones.proceso === undefined
          ? { id: "proc-1", usuario_id: "user-1" }
          : opciones.proceso,
      ),
    },
    actuacion: {
      findMany: vi.fn(async () => opciones.actuaciones ?? []),
    },
    documentoProceso: {
      findMany: vi.fn(async () => opciones.existentes ?? []),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        creados.push(data);
        return { id: `doc-${creados.length}`, ...data };
      }),
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { db: db as any, creados };
}

/** Fake de ClienteCPNU parametrizable. */
function fakeCpnu(opciones: {
  listados?: Record<string, DocumentoActuacionCPNU[]>;
  descargas?: Record<string, Result<DocumentoDescargadoCPNU, FalloCPNU>>;
  listadoFalla?: boolean;
}): ClienteCPNU {
  return {
    consultarPorRadicado: vi.fn(),
    obtenerActuaciones: vi.fn(),
    obtenerDocumentosActuacion: vi.fn(async (idActuacion: number | string) => {
      if (opciones.listadoFalla) {
        return {
          ok: false as const,
          error: { tipo: "fuente_no_disponible" as const, detalle: "boom" },
        };
      }
      const lista = opciones.listados?.[String(idActuacion)] ?? [];
      return { ok: true as const, value: lista };
    }),
    descargarDocumento: vi.fn(async (idDoc: number | string) => {
      const r = opciones.descargas?.[String(idDoc)];
      return r ?? { ok: true as const, value: descargaOk() };
    }),
  } as unknown as ClienteCPNU;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("descarga-documentos — sincronizarDocumentosProceso", () => {
  it("descarga documentos faltantes, los guarda y crea el registro con origen=cpnu", async () => {
    const { db, creados } = fakeDb({
      proceso: { id: "proc-1", usuario_id: "user-1" },
      actuaciones: [{ id: "act-uuid-1", id_actuacion_cpnu: "1000" }],
      existentes: [],
    });
    const { almacenamiento, guardados } = almacenamientoMemoria();
    const cpnu = fakeCpnu({
      listados: { "1000": [docMeta({ idRegDocumento: 555 })] },
      descargas: { "555": { ok: true, value: descargaOk(2048) } },
    });

    const resultado = await sincronizarDocumentosProceso("proc-1", {
      db,
      cpnu,
      almacenamiento,
    });

    expect(resultado.descargados).toBe(1);
    expect(resultado.yaExistian).toBe(0);
    expect(resultado.fallidos).toBe(0);

    // Se guardó el binario
    expect(guardados).toHaveLength(1);
    expect(guardados[0]?.bytes).toBe(2048);

    // Se creó el registro correcto
    expect(creados).toHaveLength(1);
    const data = creados[0]!;
    expect(data.origen).toBe("cpnu");
    expect(data.id_documento_cpnu).toBe("555");
    expect(data.actuacion_id).toBe("act-uuid-1");
    expect(data.usuario_id).toBe("user-1");
    expect(data.tipo_mime).toBe("application/pdf");
    expect(data.nombre).toBe("oficio_remision.pdf");
    expect(String(data.nombre_disco)).toContain("oficio_remision.pdf");
  });

  it("es idempotente: no re-descarga documentos ya almacenados", async () => {
    const { db, creados } = fakeDb({
      actuaciones: [{ id: "act-1", id_actuacion_cpnu: "1000" }],
      existentes: [{ id_documento_cpnu: "555" }],
    });
    const { almacenamiento, guardados } = almacenamientoMemoria();
    const cpnu = fakeCpnu({
      listados: { "1000": [docMeta({ idRegDocumento: 555 })] },
    });

    const resultado = await sincronizarDocumentosProceso("proc-1", {
      db,
      cpnu,
      almacenamiento,
    });

    expect(resultado.descargados).toBe(0);
    expect(resultado.yaExistian).toBe(1);
    expect(guardados).toHaveLength(0);
    expect(creados).toHaveLength(0);
    expect(cpnu.descargarDocumento).not.toHaveBeenCalled();
  });

  it("no descarga dos veces el mismo documento dentro de la misma corrida", async () => {
    const { db } = fakeDb({
      actuaciones: [
        { id: "act-1", id_actuacion_cpnu: "1000" },
        { id: "act-2", id_actuacion_cpnu: "2000" },
      ],
      existentes: [],
    });
    const { almacenamiento, guardados } = almacenamientoMemoria();
    // El mismo idRegDocumento aparece en dos actuaciones
    const cpnu = fakeCpnu({
      listados: {
        "1000": [docMeta({ idRegDocumento: 777 })],
        "2000": [docMeta({ idRegDocumento: 777 })],
      },
    });

    const resultado = await sincronizarDocumentosProceso("proc-1", {
      db,
      cpnu,
      almacenamiento,
    });

    expect(resultado.descargados).toBe(1);
    expect(resultado.yaExistian).toBe(1);
    expect(guardados).toHaveLength(1);
  });

  it("resiliencia: si falla el listado de una actuación, continúa con las demás", async () => {
    const { db } = fakeDb({
      actuaciones: [{ id: "act-1", id_actuacion_cpnu: "1000" }],
      existentes: [],
    });
    const { almacenamiento } = almacenamientoMemoria();
    const cpnu = fakeCpnu({ listadoFalla: true });

    const resultado = await sincronizarDocumentosProceso("proc-1", {
      db,
      cpnu,
      almacenamiento,
    });

    expect(resultado.descargados).toBe(0);
    expect(resultado.fallidos).toBe(1);
  });

  it("resiliencia: si falla la descarga de un documento, cuenta como fallido y sigue", async () => {
    const { db, creados } = fakeDb({
      actuaciones: [{ id: "act-1", id_actuacion_cpnu: "1000" }],
      existentes: [],
    });
    const { almacenamiento } = almacenamientoMemoria();
    const cpnu = fakeCpnu({
      listados: {
        "1000": [docMeta({ idRegDocumento: 1 }), docMeta({ idRegDocumento: 2 })],
      },
      descargas: {
        "1": { ok: false, error: { tipo: "timeout", detalle: "lento" } },
        "2": { ok: true, value: descargaOk() },
      },
    });

    const resultado = await sincronizarDocumentosProceso("proc-1", {
      db,
      cpnu,
      almacenamiento,
    });

    expect(resultado.fallidos).toBe(1);
    expect(resultado.descargados).toBe(1);
    expect(creados).toHaveLength(1);
    expect(creados[0]!.id_documento_cpnu).toBe("2");
  });

  it("omite documentos que exceden el tamaño máximo", async () => {
    const { db, creados } = fakeDb({
      actuaciones: [{ id: "act-1", id_actuacion_cpnu: "1000" }],
      existentes: [],
    });
    const { almacenamiento, guardados } = almacenamientoMemoria();
    const cpnu = fakeCpnu({
      listados: { "1000": [docMeta({ idRegDocumento: 9 })] },
      descargas: { "9": { ok: true, value: descargaOk(5000) } },
    });

    const resultado = await sincronizarDocumentosProceso("proc-1", {
      db,
      cpnu,
      almacenamiento,
      maxBytes: 1000,
    });

    expect(resultado.descargados).toBe(0);
    expect(resultado.fallidos).toBe(1);
    expect(guardados).toHaveLength(0);
    expect(creados).toHaveLength(0);
  });

  it("devuelve cero si el proceso no existe", async () => {
    const { db, creados } = fakeDb({ proceso: null });
    const { almacenamiento } = almacenamientoMemoria();
    const cpnu = fakeCpnu({});

    const resultado = await sincronizarDocumentosProceso("proc-x", {
      db,
      cpnu,
      almacenamiento,
    });

    expect(resultado).toEqual({
      procesoId: "proc-x",
      descargados: 0,
      yaExistian: 0,
      fallidos: 0,
    });
    expect(cpnu.obtenerDocumentosActuacion).not.toHaveBeenCalled();
  });

  it("no hace nada si no hay actuaciones con documentos", async () => {
    const { db } = fakeDb({ actuaciones: [], existentes: [] });
    const { almacenamiento } = almacenamientoMemoria();
    const cpnu = fakeCpnu({});

    const resultado = await sincronizarDocumentosProceso("proc-1", {
      db,
      cpnu,
      almacenamiento,
    });

    expect(resultado.descargados).toBe(0);
    expect(cpnu.obtenerDocumentosActuacion).not.toHaveBeenCalled();
  });
});

describe("descarga-documentos — helpers de nombre", () => {
  it("derivarNombreArchivo prefiere el nombre de descarga si trae extensión", () => {
    expect(derivarNombreArchivo("base", "pdf", "documento_real.pdf")).toBe(
      "documento_real.pdf",
    );
  });

  it("derivarNombreArchivo agrega extensión del tipo cuando el nombre no la tiene", () => {
    expect(derivarNombreArchivo("oficio", "pdf", "documento")).toBe("oficio.pdf");
  });

  it("derivarNombreArchivo respeta el nombre base si ya tiene extensión", () => {
    expect(derivarNombreArchivo("sentencia.docx", "pdf", "documento")).toBe(
      "sentencia.docx",
    );
  });

  it("sanitizarNombre elimina caracteres problemáticos", () => {
    expect(sanitizarNombre('a/b:c*?"<>|d')).toBe("a_b_c_d");
  });
});
