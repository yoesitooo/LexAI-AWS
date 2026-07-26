/**
 * API /api/procesos/[id]/documentos/sincronizar
 *
 * POST — Descarga desde la CPNU (Rama Judicial) los documentos de las
 *        actuaciones del proceso que aún no estén en el expediente digital.
 *
 * Verifica autenticación y propiedad del proceso. Es idempotente: solo baja
 * los documentos faltantes (deduplicados por id_documento_cpnu).
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { sincronizarDocumentosProceso } from "@/lib/descarga-documentos";

// Puede tardar: descarga binarios con rate limiting hacia la Rama Judicial.
export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autenticado." }, { status: 401 });
    }

    const { id } = await params;
    const usuarioId = session.user.id;

    // Verificar que el proceso existe y pertenece al usuario
    const proceso = await prisma.proceso.findFirst({
      where: { id, usuario_id: usuarioId },
      select: { id: true },
    });

    if (!proceso) {
      return NextResponse.json({ error: "Proceso no encontrado." }, { status: 404 });
    }

    const resumen = await sincronizarDocumentosProceso(id, {
      logger: {
        info: (m, d) => console.log(`[Sync docs] ${m}`, d ?? ""),
        warn: (m, d) => console.warn(`[Sync docs] ${m}`, d ?? ""),
        error: (m, d) => console.error(`[Sync docs] ${m}`, d ?? ""),
      },
    });

    return NextResponse.json({ resumen });
  } catch (error) {
    console.error("[POST /api/procesos/:id/documentos/sincronizar] Error:", error);
    return NextResponse.json(
      { error: "Error interno del servidor." },
      { status: 500 },
    );
  }
}
