"use client";

/**
 * Botón "Simular revisión diaria" — solo en el demo público.
 *
 * Ejecuta el pipeline real del worker sobre una actuación ficticia
 * (ver lib/demo-simulacion.ts) y muestra en un modal qué hizo cada paso.
 */

import { useState, useTransition } from "react";
import { Boton } from "./Boton";
import { Modal } from "./Modal";
import { simularRevision, type RespuestaSimulacion } from "@/app/demo/actions";
import styles from "./BotonSimularRevision.module.css";

export interface BotonSimularRevisionProps {
  /** Se llama tras una simulación exitosa (p. ej. para recargar el tablero). */
  onSimulado?: () => void;
}

export function BotonSimularRevision({ onSimulado }: BotonSimularRevisionProps) {
  const [pendiente, iniciar] = useTransition();
  const [respuesta, setRespuesta] = useState<RespuestaSimulacion | null>(null);

  const simular = () =>
    iniciar(async () => {
      const r = await simularRevision();
      setRespuesta(r);
      if (r.ok) onSimulado?.();
    });

  const r = respuesta?.ok ? respuesta.resultado : null;

  return (
    <>
      <Boton variante="secundario" onClick={simular} cargando={pendiente} disabled={pendiente}>
        Simular revisión diaria
      </Boton>

      <Modal
        abierto={respuesta !== null}
        onCerrar={() => setRespuesta(null)}
        titulo={r ? "Revisión diaria completada" : "No se pudo simular"}
      >
        {respuesta && !respuesta.ok && <p>{respuesta.mensaje}</p>}
        {r && (
          <>
            <ol className={styles.pasos}>
              <li>
                <span className={styles.etiqueta}>1 · Rama Judicial (CPNU)</span>
                Nueva actuación en el proceso <code>{r.radicado}</code>
                {r.despacho ? ` (${r.despacho})` : ""}: <b>{r.actuacion}</b>, del {r.fechaActuacion}.
                <q className={styles.cita}>{r.anotacion}</q>
              </li>
              <li>
                <span className={styles.etiqueta}>2 · Análisis con IA</span>
                {r.analisis.tipo === "plazo"
                  ? `Detectó un término de ${r.analisis.dias} días ${r.analisis.esHabil ? "hábiles" : "calendario"} a cargo del abogado.`
                  : r.analisis.tipo === "sin_plazo"
                    ? "La actuación no fija un término a cargo del abogado."
                    : "El término no se pudo determinar: queda para revisión manual."}
              </li>
              <li>
                <span className={styles.etiqueta}>3 · Cálculo del plazo</span>
                {r.fechaLimite
                  ? `Vence el ${r.fechaLimite} (descontando fines de semana y festivos de Colombia).`
                  : "No hay plazo que calcular."}
              </li>
              <li>
                <span className={styles.etiqueta}>4 · Notificaciones</span>
                {r.notificacionesProgramadas > 0
                  ? `${r.notificacionesProgramadas} aviso(s) programado(s) antes del vencimiento, más un aviso en la bandeja.`
                  : "Se dejó un aviso en la bandeja de notificaciones."}
              </li>
            </ol>
            <p className={styles.nota}>
              Es el mismo proceso que el sistema ejecuta cada día hábil; en el demo, la Rama Judicial
              y la IA son simuladas. Le quedan {r.simulacionesRestantes} simulaciones.
            </p>
          </>
        )}
      </Modal>
    </>
  );
}
