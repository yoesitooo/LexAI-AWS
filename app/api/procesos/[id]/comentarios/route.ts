/**
 * API /api/procesos/[id]/comentarios
 *
 * GET  — Listar comentarios de un proceso (más recientes primero)
 * POST — Crear un nuevo comentario en un proceso
 *
 * Ambos endpoints verifican autenticación y propiedad del proceso.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

// ─── GET: Listar comentarios ─────────────────────────────────────────────────

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

    // Obtener comentarios ordenados de más reciente a más antiguo
    const comentarios = await prisma.comentarioProceso.findMany({
      where: { proceso_id: id },
      orderBy: { creado_en: "desc" },
      select: {
        id: true,
        texto: true,
        creado_en: true,
        usuario: {
          select: {
            id: true,
            nombre: true,
          },
        },
      },
    });

    return NextResponse.json({ comentarios });
  } catch (error) {
    console.error("[GET /api/procesos/:id/comentarios] Error:", error);
    return NextResponse.json(
      { error: "Error interno del servidor." },
      { status: 500 },
    );
  }
}

// ─── POST: Crear comentario ──────────────────────────────────────────────────

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

    // Parsear body
    const body = await request.json().catch(() => null);

    if (!body || typeof body !== "object" || typeof body.texto !== "string") {
      return NextResponse.json(
        { error: "El campo 'texto' es requerido." },
        { status: 400 },
      );
    }

    const texto = body.texto.trim();

    if (texto.length === 0) {
      return NextResponse.json(
        { error: "El comentario no puede estar vacío." },
        { status: 400 },
      );
    }

    if (texto.length > 5000) {
      return NextResponse.json(
        { error: "El comentario no puede exceder 5000 caracteres." },
        { status: 400 },
      );
    }

    // Crear comentario
    const comentario = await prisma.comentarioProceso.create({
      data: {
        proceso_id: id,
        usuario_id: usuarioId,
        texto,
      },
      select: {
        id: true,
        texto: true,
        creado_en: true,
        usuario: {
          select: {
            id: true,
            nombre: true,
          },
        },
      },
    });

    return NextResponse.json({ comentario }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/procesos/:id/comentarios] Error:", error);
    return NextResponse.json(
      { error: "Error interno del servidor." },
      { status: 500 },
    );
  }
}
