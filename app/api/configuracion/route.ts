/**
 * GET/PATCH /api/configuracion — Módulo de configuración de canales
 *
 * GET: Devuelve el estado actual de los canales de notificación del usuario.
 * PATCH: Actualiza canales (in-app, email, WhatsApp) con validación de WhatsApp.
 *
 * Protección: requiere sesión autenticada.
 *
 * Requisitos: R11.1, R11.2, R11.3, R11.4, R11.5, R11.6, R11.7
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { verificarFrecuenciaEditable } from "@/lib/guardas-fase1";

// ─── Validación de número WhatsApp ──────────────────────────────────────────

/**
 * Valida formato internacional de WhatsApp: prefijo + seguido de 8–15 dígitos.
 * Ejemplo válido: +573001234567
 */
const WHATSAPP_REGEX = /^\+\d{8,15}$/;

function esNumeroWhatsAppValido(numero: string): boolean {
  return WHATSAPP_REGEX.test(numero);
}

// ─── GET: Estado actual de canales ──────────────────────────────────────────

export async function GET() {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "No autenticado." },
        { status: 401 },
      );
    }

    const config = await prisma.configuracionUsuario.findUnique({
      where: { usuario_id: session.user.id },
    });

    if (!config) {
      return NextResponse.json(
        { error: "Configuración no encontrada." },
        { status: 404 },
      );
    }

    // Verificar si frecuencia es editable (Fase 1: no lo es)
    const frecuenciaEditable = verificarFrecuenciaEditable();

    return NextResponse.json({
      canal_inapp: config.canal_inapp,
      canal_email: config.canal_email,
      canal_whatsapp: config.canal_whatsapp,
      numero_whatsapp: config.numero_whatsapp ?? null,
      frecuencia_revision: config.frecuencia_revision,
      frecuencia_editable: frecuenciaEditable.ok,
    });
  } catch (error) {
    console.error("[GET /api/configuracion] Error:", error);
    return NextResponse.json(
      { error: "Error interno del servidor." },
      { status: 500 },
    );
  }
}

// ─── PATCH: Actualizar canales ──────────────────────────────────────────────

interface PatchBody {
  canal_inapp?: boolean;
  canal_email?: boolean;
  canal_whatsapp?: boolean;
  numero_whatsapp?: string;
  frecuencia_revision?: string;
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "No autenticado." },
        { status: 401 },
      );
    }

    const body: PatchBody = await request.json().catch(() => ({}));

    // Rechazar edición de frecuencia_revision (R11.6)
    if (body.frecuencia_revision !== undefined) {
      const resultado = verificarFrecuenciaEditable();
      if (!resultado.ok) {
        return NextResponse.json(
          { error: resultado.error.mensaje },
          { status: 403 },
        );
      }
    }

    // Obtener configuración actual para validaciones
    const configActual = await prisma.configuracionUsuario.findUnique({
      where: { usuario_id: session.user.id },
    });

    if (!configActual) {
      return NextResponse.json(
        { error: "Configuración no encontrada." },
        { status: 404 },
      );
    }

    // Preparar datos de actualización
    const datosActualizacion: Record<string, unknown> = {};

    // Actualizar canal in-app (R11.2)
    if (typeof body.canal_inapp === "boolean") {
      datosActualizacion.canal_inapp = body.canal_inapp;
    }

    // Actualizar canal email (R11.2)
    if (typeof body.canal_email === "boolean") {
      datosActualizacion.canal_email = body.canal_email;
    }

    // Actualizar canal WhatsApp con validación de número (R11.4, R11.5)
    if (typeof body.canal_whatsapp === "boolean") {
      if (body.canal_whatsapp === true) {
        // Para activar WhatsApp se necesita un número válido
        const numero = body.numero_whatsapp ?? configActual.numero_whatsapp;

        if (!numero || !esNumeroWhatsAppValido(numero)) {
          return NextResponse.json(
            {
              error: "Para activar WhatsApp se requiere un número válido en formato internacional (ej: +573001234567, entre 8 y 15 dígitos con prefijo de país).",
              campo: "numero_whatsapp",
            },
            { status: 400 },
          );
        }

        datosActualizacion.canal_whatsapp = true;
        datosActualizacion.numero_whatsapp = numero;
      } else {
        datosActualizacion.canal_whatsapp = false;
      }
    } else if (body.numero_whatsapp !== undefined) {
      // Si solo se actualiza el número sin cambiar el estado del canal
      if (body.numero_whatsapp && esNumeroWhatsAppValido(body.numero_whatsapp)) {
        datosActualizacion.numero_whatsapp = body.numero_whatsapp;
      } else if (body.numero_whatsapp) {
        return NextResponse.json(
          {
            error: "El número de WhatsApp debe tener formato internacional válido (ej: +573001234567, entre 8 y 15 dígitos con prefijo de país).",
            campo: "numero_whatsapp",
          },
          { status: 400 },
        );
      }
    }

    // Si no hay nada que actualizar
    if (Object.keys(datosActualizacion).length === 0) {
      return NextResponse.json({
        canal_inapp: configActual.canal_inapp,
        canal_email: configActual.canal_email,
        canal_whatsapp: configActual.canal_whatsapp,
        numero_whatsapp: configActual.numero_whatsapp ?? null,
        frecuencia_revision: configActual.frecuencia_revision,
        mensaje: "Sin cambios.",
      });
    }

    // Persistir cambios (R11.2)
    const configActualizada = await prisma.configuracionUsuario.update({
      where: { usuario_id: session.user.id },
      data: datosActualizacion,
    });

    return NextResponse.json({
      canal_inapp: configActualizada.canal_inapp,
      canal_email: configActualizada.canal_email,
      canal_whatsapp: configActualizada.canal_whatsapp,
      numero_whatsapp: configActualizada.numero_whatsapp ?? null,
      frecuencia_revision: configActualizada.frecuencia_revision,
      mensaje: "Configuración actualizada correctamente.",
    });
  } catch (error) {
    console.error("[PATCH /api/configuracion] Error:", error);
    return NextResponse.json(
      { error: "No se pudo guardar la configuración. Intente nuevamente." },
      { status: 500 },
    );
  }
}
