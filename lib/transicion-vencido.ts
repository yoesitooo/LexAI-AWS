/**
 * Transición automática a Vencido — LexAI MVP
 *
 * Cuando un plazo tiene estado 'pendiente' y su fecha_limite < hoyCO(),
 * se marca el plazo como 'vencido' y el proceso asociado se mueve a
 * la columna 'vencido' del Kanban.
 *
 * Esta lógica se ejecuta al leer datos (GET) para mantener consistencia.
 *
 * Requisitos: R12.5
 */

import { prisma } from "./db";
import { hoyCO, fechaCOaISO } from "./formato";

/**
 * Marca como vencidos todos los plazos pendientes cuya fecha_limite
 * ya pasó (en UTC-5), y mueve sus procesos a la columna 'vencido'.
 *
 * Se filtra opcionalmente por usuario_id para acotar el barrido.
 *
 * @param usuarioId - Si se provee, solo procesa plazos de este usuario
 */
export async function marcarPlazosVencidos(usuarioId?: string): Promise<number> {
  const hoy = hoyCO();
  const hoyISO = fechaCOaISO(hoy);

  // Buscar plazos pendientes cuya fecha_limite < hoy (ya venció)
  const whereClause: Record<string, unknown> = {
    estado: "pendiente",
    fecha_limite: {
      lt: new Date(hoyISO),
    },
    indeterminado: false,
  };

  if (usuarioId) {
    whereClause.proceso = { usuario_id: usuarioId };
  }

  // Encontrar los plazos que deben marcarse como vencidos
  const plazosVencidos = await prisma.plazo.findMany({
    where: whereClause,
    select: {
      id: true,
      proceso_id: true,
    },
  });

  if (plazosVencidos.length === 0) {
    return 0;
  }

  // Extraer IDs únicos de procesos afectados
  const procesosAfectados = [...new Set(plazosVencidos.map((p) => p.proceso_id))];
  const plazoIds = plazosVencidos.map((p) => p.id);

  // Actualizar en transacción: marcar plazos como vencidos + mover procesos
  await prisma.$transaction([
    // Marcar plazos como vencidos
    prisma.plazo.updateMany({
      where: { id: { in: plazoIds } },
      data: { estado: "vencido" },
    }),
    // Mover procesos a columna vencido
    prisma.proceso.updateMany({
      where: { id: { in: procesosAfectados } },
      data: { columna_kanban: "vencido" },
    }),
  ]);

  return plazosVencidos.length;
}
