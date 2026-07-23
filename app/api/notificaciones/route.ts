/**
 * GET /api/notificaciones — Bandeja in-app del usuario
 *
 * Devuelve las notificaciones in-app del usuario autenticado,
 * ordenadas por no leídas primero y luego por más recientes primero.
 *
 * Protección: requiere sesión autenticada.
 *
 * Requisitos: R10.2
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "No autenticado." },
        { status: 401 },
      );
    }

    const notificaciones = await prisma.notificacionInapp.findMany({
      where: { usuario_id: session.user.id },
      orderBy: [
        { leida: "asc" },       // No leídas primero (false < true)
        { creado_en: "desc" },  // Más recientes primero
      ],
      select: {
        id: true,
        titulo: true,
        mensaje: true,
        leida: true,
        creado_en: true,
        notificacion_id: true,
      },
    });

    return NextResponse.json({ notificaciones });
  } catch (error) {
    console.error("[GET /api/notificaciones] Error:", error);
    return NextResponse.json(
      { error: "Error interno del servidor." },
      { status: 500 },
    );
  }
}
