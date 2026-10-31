/**
 * API /api/procesos/[id]/documentos
 *
 * GET  — Listar documentos del expediente digital de un proceso
 * POST — Subir un archivo al expediente digital (multipart/form-data)
 *
 * Ambos endpoints verifican autenticación y propiedad del proceso.
 */

import { NextRequest, NextResponse } from "next/server";
import { esModoDemo } from "@/lib/demo";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { randomUUID } from "crypto";
import { existsSync } from "fs";

// Route segment config – allow uploads up to 10 MB
export const runtime = "nodejs";
export const maxDuration = 60;

/** Tamaño máximo por archivo: 10 MB */
const MAX_FILE_SIZE = 10 * 1024 * 1024;

/** Tipos MIME permitidos */
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

// ─── GET: Listar documentos ──────────────────────────────────────────────────

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "No autenticado." },
        { status: 401 },
      );
    }

    // En el demo público no se guardan archivos en el servidor
    if (esModoDemo()) {
      return NextResponse.json(
        { error: "La carga de documentos está deshabilitada en el modo demo." },
        { status: 403 },
      );
    }

    const { id } = await params;
    const usuarioId = session.user.id;

    // Verificar que el proceso existe y pertenece al usuario
    const proceso = await prisma.proceso.findFirst({
      where: { id, usuario_id: usuarioId },
      select: { id: true },
    });

    if (!proceso) {
      return NextResponse.json(
        { error: "Proceso no encontrado." },
        { status: 404 },
      );
    }

    const documentos = await prisma.documentoProceso.findMany({
      where: { proceso_id: id },
      orderBy: { creado_en: "desc" },
      select: {
        id: true,
        nombre: true,
        tipo_mime: true,
        tamano_bytes: true,
        origen: true,
        creado_en: true,
      },
    });

    return NextResponse.json({ documentos });
  } catch (error) {
    console.error("[GET /api/procesos/:id/documentos] Error:", error);
    return NextResponse.json(
      { error: "Error interno del servidor." },
      { status: 500 },
    );
  }
}

// ─── POST: Subir documento ───────────────────────────────────────────────────

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "No autenticado." },
        { status: 401 },
      );
    }

    const { id } = await params;
    const usuarioId = session.user.id;

    // Verificar que el proceso existe y pertenece al usuario
    const proceso = await prisma.proceso.findFirst({
      where: { id, usuario_id: usuarioId },
      select: { id: true },
    });

    if (!proceso) {
      return NextResponse.json(
        { error: "Proceso no encontrado." },
        { status: 404 },
      );
    }

    // Parsear multipart form data
    const formData = await request.formData();
    const file = formData.get("archivo") as File | null;

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: "No se recibió un archivo válido." },
        { status: 400 },
      );
    }

    // Validar tipo MIME
    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: "Tipo de archivo no permitido. Use PDF, imágenes o Word." },
        { status: 400 },
      );
    }

    // Validar tamaño
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "El archivo excede el tamaño máximo de 10 MB." },
        { status: 400 },
      );
    }

    // Preparar directorio de destino
    const uploadsBase = join(process.cwd(), "uploads");
    const uploadsDir = join(uploadsBase, id);

    // Ensure uploads directory exists (handles fresh deployments)
    if (!existsSync(uploadsBase)) {
      await mkdir(uploadsBase, { recursive: true });
    }
    await mkdir(uploadsDir, { recursive: true });

    // Generar nombre único en disco
    const uuid = randomUUID();
    const nombreDisco = `${uuid}-${file.name}`;
    const rutaArchivo = join(uploadsDir, nombreDisco);

    // Escribir archivo a disco
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(rutaArchivo, buffer);

    // Crear registro en base de datos
    const documento = await prisma.documentoProceso.create({
      data: {
        proceso_id: id,
        usuario_id: usuarioId,
        origen: "manual",
        nombre: file.name,
        nombre_disco: nombreDisco,
        tipo_mime: file.type,
        tamano_bytes: file.size,
      },
      select: {
        id: true,
        nombre: true,
        tipo_mime: true,
        tamano_bytes: true,
        origen: true,
        creado_en: true,
      },
    });

    return NextResponse.json({ documento }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/procesos/:id/documentos] Error:", error);
    return NextResponse.json(
      { error: "Error interno del servidor." },
      { status: 500 },
    );
  }
}
