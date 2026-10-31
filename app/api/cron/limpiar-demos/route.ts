/**
 * GET /api/cron/limpiar-demos — elimina las cuentas demo vencidas.
 *
 * Pensada para Vercel Cron (ver vercel.json), que envía
 * `Authorization: Bearer <CRON_SECRET>`. Responde:
 * - 401 si el secreto no coincide o no está configurado
 * - 404 si la instancia no está en modo demo
 * - 200 { eliminadas } en caso de éxito
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { esModoDemo, limpiarCuentasDemo } from "@/lib/demo";

export async function GET(request: NextRequest) {
  const secreto = process.env.CRON_SECRET;
  const autorizacion = request.headers.get("authorization");

  if (!secreto || autorizacion !== `Bearer ${secreto}`) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  if (!esModoDemo()) {
    return NextResponse.json({ error: "Modo demo inactivo." }, { status: 404 });
  }

  const eliminadas = await limpiarCuentasDemo(prisma);
  return NextResponse.json({ eliminadas });
}
