/**
 * Worker de revisión diaria — LexAI MVP
 *
 * Proceso independiente (node-cron) que comparte la capa de dominio (lib/)
 * con el servicio web. Se ejecuta a las 06:00 America/Bogotá en días hábiles.
 *
 * Responsabilidades:
 * - Revisión diaria de procesos activos contra la CPNU
 * - Detección de actuaciones nuevas (diffing)
 * - Análisis con IA → cálculo de plazos → programación de notificaciones
 * - Envío de notificaciones a las 07:00 CO
 *
 * Requisitos cubiertos: R6.1, R6.2, R6.9
 */

import cron from "node-cron";
import { hoyCO, type FechaCO } from "../lib/formato";
import { esFestivo } from "../lib/festivos";
import { iniciarCronDespacho } from "./despacho-notificaciones";

// ---------------------------------------------------------------------------
// Guarda de día hábil
// ---------------------------------------------------------------------------

/**
 * Determina si la revisión diaria debe ejecutarse para una fecha dada.
 *
 * Condiciones para ejecutar:
 *  1. La fecha debe ser lunes a viernes (diaSemana 1–5)
 *  2. La fecha NO debe ser un festivo nacional de Colombia
 *
 * @param fecha - FechaCO a evaluar
 * @returns true si debe ejecutarse la revisión, false si debe omitirse
 */
export function debeEjecutar(fecha: FechaCO): boolean {
  // Verificar que sea día de semana (lunes=1 a viernes=5)
  if (fecha.diaSemana < 1 || fecha.diaSemana > 5) {
    return false;
  }

  // Verificar que NO sea festivo nacional
  if (esFestivo(fecha)) {
    return false;
  }

  return true;
}

// ---------------------------------------------------------------------------
// Lógica de revisión diaria (implementada en worker/revision-diaria.ts)
// ---------------------------------------------------------------------------

import { ejecutarRevisionDiaria as ejecutarRevision } from "./revision-diaria";

/**
 * Ejecuta la revisión diaria de todos los procesos activos.
 * Delega al módulo `revision-diaria.ts` que orquesta:
 * CPNU → Diffing → Analizador IA → Calculadora Plazos → Planificador Notificaciones
 */
async function ejecutarRevisionDiaria(): Promise<void> {
  const resultado = await ejecutarRevision();
  console.log(
    `[Worker] Revisión completada: ${resultado.procesosRevisados}/${resultado.totalProcesos} exitosos, ` +
      `${resultado.totalActuacionesNuevas} actuaciones nuevas, ${resultado.totalPlazosCreados} plazos creados.`,
  );
  if (resultado.procesosFallidos > 0) {
    console.warn(
      `[Worker] ${resultado.procesosFallidos} proceso(s) fallaron durante la revisión.`,
    );
  }
}

// ---------------------------------------------------------------------------
// Programador cron — 06:00 America/Bogotá
// ---------------------------------------------------------------------------

/**
 * Callback principal del cron. Evalúa la guarda de día hábil antes de ejecutar.
 */
async function onCronTick(): Promise<void> {
  const ahora = hoyCO();
  const fechaStr = `${String(ahora.dia).padStart(2, "0")}/${String(ahora.mes).padStart(2, "0")}/${ahora.anio}`;

  console.log(`[Worker] Cron disparado — ${fechaStr} (día semana: ${ahora.diaSemana})`);

  if (!debeEjecutar(ahora)) {
    const razon =
      ahora.diaSemana === 0 || ahora.diaSemana === 6
        ? "fin de semana"
        : "día festivo";
    console.log(`[Worker] Omitiendo ejecución: ${razon}.`);
    return;
  }

  console.log("[Worker] Día hábil confirmado. Iniciando revisión...");

  try {
    await ejecutarRevisionDiaria();
    console.log("[Worker] Revisión diaria completada exitosamente.");
  } catch (error) {
    console.error("[Worker] Error durante la revisión diaria:", error);
  }
}

// ---------------------------------------------------------------------------
// Inicio del worker
// ---------------------------------------------------------------------------

/**
 * Inicia el programador cron del worker.
 * Cron expression: "0 6 * * *" = cada día a las 06:00
 * Timezone: America/Bogota
 */
export function iniciarWorker(): void {
  console.log("[Worker] Iniciando worker de revisión diaria LexAI...");
  console.log("[Worker] Programado: 06:00 America/Bogotá, días hábiles únicamente.");

  cron.schedule("0 6 * * *", () => {
    void onCronTick();
  }, {
    timezone: "America/Bogota",
  });

  // Iniciar cron de despacho de notificaciones (07:00 CO)
  iniciarCronDespacho();

  console.log("[Worker] Worker activo. Esperando próxima ejecución...");
}

// Ejecutar automáticamente si se invoca como proceso principal
// (no se ejecuta al importar para testing)
const esProcesoDirecto = require.main === module ||
  process.argv[1]?.includes("worker/index");

if (esProcesoDirecto) {
  iniciarWorker();
}
