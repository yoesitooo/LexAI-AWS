/**
 * API /api/procesos
 *
 * GET  — Lista procesos del usuario agrupados por columna_kanban (R12.1, R12.2)
 * POST — Registro de un proceso judicial (R5.1–R5.7)
 *
 * Ambos endpoints requieren sesión autenticada.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { validarRadicado } from "@/lib/validador-radicado";
import { clienteCPNU } from "@/lib/cpnu-client";
import type { ActuacionCPNU } from "@/lib/cpnu-client";
import { marcarPlazosVencidos } from "@/lib/transicion-vencido";

// ─── GET: Listar procesos agrupados por columna_kanban ──────────────────────

export async function GET() {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "No autenticado." },
        { status: 401 },
      );
    }

    const usuarioId = session.user.id;

    // Marcar plazos vencidos antes de devolver datos (transición R12.5)
    await marcarPlazosVencidos(usuarioId);

    // Obtener todos los procesos del usuario
    const procesos = await prisma.proceso.findMany({
      where: { usuario_id: usuarioId },
      select: {
        id: true,
        radicado: true,
        despacho: true,
        departamento: true,
        ciudad: true,
        tipo_proceso: true,
        sujetos_procesales: true,
        estado_cpnu: true,
        columna_kanban: true,
        seguimiento_activo: true,
        creado_en: true,
        actualizado_en: true,
        actuaciones: {
          orderBy: { fecha_actuacion: "desc" },
          take: 1,
          select: {
            actuacion: true,
            fecha_actuacion: true,
          },
        },
      },
      orderBy: { actualizado_en: "desc" },
    });

    // Agrupar por columna_kanban
    const kanban: Record<string, typeof procesos> = {
      nuevo: [],
      en_seguimiento: [],
      requiere_accion: [],
      vencido: [],
      archivado: [],
    };

    for (const proceso of procesos) {
      const columna = proceso.columna_kanban;
      if (columna in kanban && kanban[columna]) {
        kanban[columna].push(proceso);
      }
    }

    return NextResponse.json({ kanban });
  } catch (error) {
    console.error("[GET /api/procesos] Error:", error);
    return NextResponse.json(
      { error: "Error interno del servidor." },
      { status: 500 },
    );
  }
}

// ─── POST: Registrar proceso ────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    // 1. Verificar sesión
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "No autenticado." },
        { status: 401 },
      );
    }

    const usuarioId = session.user.id;

    // 2. Parsear body
    const body = await request.json().catch(() => null);

    if (!body || typeof body !== "object" || !("radicado" in body)) {
      return NextResponse.json(
        { error: "El campo 'radicado' es requerido." },
        { status: 400 },
      );
    }

    const radicadoInput = String((body as { radicado: unknown }).radicado).trim();

    // 3. Validar radicado (R5.1)
    const validacion = validarRadicado(radicadoInput);

    if (!validacion.ok) {
      return NextResponse.json(
        {
          error: "Radicado inválido.",
          detalle: validacion.error.mensaje,
          codigo: validacion.error.codigo,
        },
        { status: 400 },
      );
    }

    const radicado = validacion.value.raw;

    // 4. Verificar duplicado por usuario (R5.6)
    const procesoExistente = await prisma.proceso.findUnique({
      where: {
        usuario_id_radicado: {
          usuario_id: usuarioId,
          radicado,
        },
      },
    });

    if (procesoExistente) {
      return NextResponse.json(
        { error: "Este proceso ya está en seguimiento." },
        { status: 409 },
      );
    }

    // 5. Consultar CPNU (R5.2, R5.5, R5.7)
    const resultadoConsulta = await clienteCPNU.consultarPorRadicado(radicado);

    if (!resultadoConsulta.ok) {
      const fallo = resultadoConsulta.error;

      if (fallo.tipo === "no_encontrado") {
        return NextResponse.json(
          { error: "No se encontró el proceso en la fuente de datos.", detalle: fallo.detalle },
          { status: 404 },
        );
      }

      if (fallo.tipo === "fuente_no_disponible" || fallo.tipo === "timeout") {
        return NextResponse.json(
          { error: "La fuente de datos no está disponible. Intente más tarde.", detalle: fallo.detalle },
          { status: 503 },
        );
      }

      // radicado_invalido shouldn't happen here since we validate above, but handle gracefully
      return NextResponse.json(
        { error: "Error al consultar la fuente de datos.", detalle: fallo.detalle },
        { status: 500 },
      );
    }

    const procesoCPNU = resultadoConsulta.value.procesos[0];

    if (!procesoCPNU) {
      return NextResponse.json(
        { error: "No se encontró el proceso en la fuente de datos." },
        { status: 404 },
      );
    }

    // 6. Obtener actuaciones históricas (R5.3)
    let actuacionesCPNU: ActuacionCPNU[] = [];

    const resultadoActuaciones = await clienteCPNU.obtenerActuaciones(procesoCPNU.idProceso);

    if (resultadoActuaciones.ok) {
      actuacionesCPNU = resultadoActuaciones.value;
    }
    // Si falla la obtención de actuaciones, continuamos sin ellas (el proceso se registra igual)

    // 7. Crear Proceso + Actuaciones en transacción (R5.4)
    const procesoCreado = await prisma.$transaction(async (tx) => {
      // Crear el proceso con datos de CPNU
      const nuevoProceso = await tx.proceso.create({
        data: {
          usuario_id: usuarioId,
          radicado,
          llave_proceso: procesoCPNU.llaveProceso ?? null,
          despacho: procesoCPNU.despacho ?? null,
          departamento: procesoCPNU.departamento ?? null,
          sujetos_procesales: procesoCPNU.sujetosProcesales ?? "{}",
          estado_cpnu: procesoCPNU.fechaUltimaActuacion ?? null,
          columna_kanban: "nuevo",
          seguimiento_activo: true,
        },
      });

      // Almacenar actuaciones históricas con es_nueva=false (R5.3)
      if (actuacionesCPNU.length > 0) {
        await tx.actuacion.createMany({
          data: actuacionesCPNU.map((act: ActuacionCPNU) => ({
            proceso_id: nuevoProceso.id,
            id_actuacion_cpnu: String(act.idRegActuacion),
            llave_proceso: act.llaveProceso ?? null,
            consecutivo: act.consActuacion ?? null,
            fecha_actuacion: new Date(act.fechaActuacion),
            actuacion: act.actuacion ?? "Sin descripción",
            anotacion: act.anotacion ?? null,
            fecha_inicia: act.fechaInicia ? new Date(act.fechaInicia) : null,
            fecha_finaliza: act.fechaFinaliza ? new Date(act.fechaFinaliza) : null,
            fecha_registro: new Date(act.fechaRegistro),
            existe_docs: act.existeDocs ?? false,
            es_nueva: false,
            analisis_completado: false,
          })),
          skipDuplicates: true,
        });
      }

      return nuevoProceso;
    });

    // 8. Respuesta exitosa (R5.4)
    return NextResponse.json(
      {
        mensaje: "Proceso registrado exitosamente.",
        proceso: {
          id: procesoCreado.id,
          radicado: procesoCreado.radicado,
          despacho: procesoCreado.despacho,
          departamento: procesoCreado.departamento,
          sujetos_procesales: procesoCreado.sujetos_procesales,
          columna_kanban: procesoCreado.columna_kanban,
          seguimiento_activo: procesoCreado.seguimiento_activo,
          creado_en: procesoCreado.creado_en,
          actuaciones_importadas: actuacionesCPNU.length,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("[POST /api/procesos] Error:", error);
    return NextResponse.json(
      { error: "Error interno del servidor. Intente nuevamente." },
      { status: 500 },
    );
  }
}
