/**
 * API /api/procesos/[id]/documentos/[docId]
 *
 * GET    — Descargar un documento específico (stream del archivo)
 * DELETE — Eliminar un documento (archivo en disco + registro en BD)
 *
 * Ambos endpoints verifican autenticación y propiedad del proceso.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { readFile, unlink } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";

// ─── GET: Descargar documento ────────────────────────────────────────────────

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> },
) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "No autenticado." },
        { status: 401 },
      );
    }

    const { id, docId } = await params;
    const usuarioId = session.user.id;

    // Verificar propiedad del proceso
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

    // Buscar documento
    const documento = await prisma.documentoProceso.findFirst({
      where: { id: docId, proceso_id: id },
    });

    if (!documento) {
      return NextResponse.json(
        { error: "Documento no encontrado." },
        { status: 404 },
      );
    }

    // Leer archivo del disco
    const rutaArchivo = join(process.cwd(), "uploads", id, documento.nombre_disco);

    if (!existsSync(rutaArchivo)) {
      return NextResponse.json(
        { error: "El archivo no se encuentra en el servidor." },
        { status: 404 },
      );
    }

    const fileBuffer = await readFile(rutaArchivo);

    // Devolver archivo con headers de descarga
    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        "Content-Type": documento.tipo_mime,
        "Content-Disposition": `attachment; filename="${encodeURIComponent(documento.nombre)}"`,
        "Content-Length": String(documento.tamano_bytes),
      },
    });
  } catch (error) {
    console.error("[GET /api/procesos/:id/documentos/:docId] Error:", error);
    return NextResponse.json(
      { error: "Error interno del servidor." },
      { status: 500 },
    );
  }
}

// ─── DELETE: Eliminar documento ──────────────────────────────────────────────

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> },
) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "No autenticado." },
        { status: 401 },
      );
    }

    const { id, docId } = await params;
    const usuarioId = session.user.id;

    // Verificar propiedad del proceso
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

    // Buscar documento
    const documento = await prisma.documentoProceso.findFirst({
      where: { id: docId, proceso_id: id },
    });

    if (!documento) {
      return NextResponse.json(
        { error: "Documento no encontrado." },
        { status: 404 },
      );
    }

    // Eliminar archivo del disco (no falla si ya no existe)
    const rutaArchivo = join(process.cwd(), "uploads", id, documento.nombre_disco);
    try {
      await unlink(rutaArchivo);
    } catch {
      // El archivo puede ya no existir en disco; continuamos eliminando el registro
    }

    // Eliminar registro de la BD
    await prisma.documentoProceso.delete({
      where: { id: docId },
    });

    return NextResponse.json({ mensaje: "Documento eliminado." });
  } catch (error) {
    console.error("[DELETE /api/procesos/:id/documentos/:docId] Error:", error);
    return NextResponse.json(
      { error: "Error interno del servidor." },
      { status: 500 },
    );
  }
}
