/**
 * API /api/procesos/[id]
 *
 * GET   — Detalle de proceso con actuaciones (desc) + plazos activos (R12.4)
 * PATCH — Mover proceso de columna Kanban (R12.2)
 *
 * Ambos endpoints verifican que el proceso pertenezca al usuario autenticado.
 * Si no existe o no es del usuario, responde 404 (no 403, para no revelar existencia).
 *
 * Requisitos: R12.2, R12.4, R12.5
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { marcarPlazosVencidos } from "@/lib/transicion-vencido";

// Columnas válidas del Kanban
const COLUMNAS_VALIDAS = [
  "nuevo",
  "en_seguimiento",
  "requiere_accion",
  "vencido",
  "archivado",
] as const;

type ColumnaKanban = (typeof COLUMNAS_VALIDAS)[number];

// ─── GET: Detalle de proceso ────────────────────────────────────────────────

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

    // Marcar plazos vencidos antes de devolver datos (R12.5)
    await marcarPlazosVencidos(usuarioId);

    // Buscar proceso verificando propiedad
    const proceso = await prisma.proceso.findFirst({
      where: {
        id,
        usuario_id: usuarioId,
      },
      include: {
        actuaciones: {
          orderBy: { fecha_actuacion: "desc" },
          select: {
            id: true,
            id_actuacion_cpnu: true,
            consecutivo: true,
            fecha_actuacion: true,
            actuacion: true,
            anotacion: true,
            fecha_inicia: true,
            fecha_finaliza: true,
            fecha_registro: true,
            existe_docs: true,
            es_nueva: true,
            analisis_completado: true,
            creado_en: true,
          },
        },
        plazos: {
          where: {
            estado: "pendiente",
          },
          orderBy: { fecha_limite: "asc" },
          select: {
            id: true,
            dias: true,
            es_habil: true,
            fecha_inicio: true,
            fecha_limite: true,
            estado: true,
            indeterminado: true,
            creado_en: true,
          },
        },
      },
    });

    // 404 si no existe o no es del usuario (no revelar existencia)
    if (!proceso) {
      return NextResponse.json(
        { error: "Proceso no encontrado." },
        { status: 404 },
      );
    }

    return NextResponse.json({ proceso });
  } catch (error) {
    console.error("[GET /api/procesos/:id] Error:", error);
    return NextResponse.json(
      { error: "Error interno del servidor." },
      { status: 500 },
    );
  }
}

// ─── PATCH: Mover proceso de columna ────────────────────────────────────────

export async function PATCH(
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

    // Parsear body
    const body = await request.json().catch(() => null);

    if (!body || typeof body !== "object" || !("columna_kanban" in body)) {
      return NextResponse.json(
        { error: "El campo 'columna_kanban' es requerido." },
        { status: 400 },
      );
    }

    const nuevaColumna = body.columna_kanban as string;

    // Validar columna
    if (!COLUMNAS_VALIDAS.includes(nuevaColumna as ColumnaKanban)) {
      return NextResponse.json(
        {
          error: "Columna inválida.",
          columnas_validas: COLUMNAS_VALIDAS,
        },
        { status: 400 },
      );
    }

    // Verificar propiedad del proceso
    const procesoExistente = await prisma.proceso.findFirst({
      where: {
        id,
        usuario_id: usuarioId,
      },
      select: { id: true, columna_kanban: true },
    });

    if (!procesoExistente) {
      return NextResponse.json(
        { error: "Proceso no encontrado." },
        { status: 404 },
      );
    }

    // Actualizar columna
    const procesoActualizado = await prisma.proceso.update({
      where: { id },
      data: { columna_kanban: nuevaColumna as ColumnaKanban },
      select: {
        id: true,
        radicado: true,
        columna_kanban: true,
        actualizado_en: true,
      },
    });

    return NextResponse.json({
      mensaje: "Columna actualizada.",
      proceso: procesoActualizado,
    });
  } catch (error) {
    console.error("[PATCH /api/procesos/:id] Error:", error);
    return NextResponse.json(
      { error: "Error interno del servidor." },
      { status: 500 },
    );
  }
}
