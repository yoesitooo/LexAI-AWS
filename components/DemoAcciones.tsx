"use client";

/**
 * Acciones del modo demo: guía rápida + botón "Simular revisión diaria".
 *
 * La simulación corre el pipeline real del worker sobre una actuación ficticia
 * (ver lib/demo-simulacion.ts) y muestra, paso a paso, qué hizo el sistema.
 * Al terminar avisa al tablero (evento `lexai:datos-actualizados`) para que
 * recargue los procesos, y refresca las páginas de servidor.
 */

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Boton } from "./Boton";
import { Modal } from "./Modal";
import { simularRevision, type RespuestaSimulacion } from "@/app/demo/actions";
import styles from "./DemoAcciones.module.css";

import { EVENTO_DATOS_ACTUALIZADOS } from "@/lib/eventos";
const CLAVE_GUIA_CERRADA = "lexai-demo-guia-cerrada";

export function DemoAcciones() {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [respuesta, setRespuesta] = useState<RespuestaSimulacion | null>(null);
  const [guiaAbierta, setGuiaAbierta] = useState(false);

  // La guía se abre sola la primera vez (preferencia guardada por visitante).
  useEffect(() => {
    try {
      if (window.localStorage.getItem(CLAVE_GUIA_CERRADA) !== "1") setGuiaAbierta(true);
    } catch {
      setGuiaAbierta(true);
    }
  }, []);

  const cerrarGuia = () => {
    setGuiaAbierta(false);
    try {
      window.localStorage.setItem(CLAVE_GUIA_CERRADA, "1");
    } catch {
      /* sin almacenamiento: no pasa nada */
    }
  };

  const simular = () =>
    iniciar(async () => {
      const r = await simularRevision();
      setRespuesta(r);
      if (r.ok) {
        window.dispatchEvent(new Event(EVENTO_DATOS_ACTUALIZADOS));
        router.refresh();
      }
    });

  const r = respuesta?.ok ? respuesta.resultado : null;

  return (
    <>
      <div className={styles.acciones}>
        <Boton variante="acento" onClick={simular} cargando={pendiente} disabled={pendiente}>
          {pendiente ? "Revisando…" : "▶ Simular revisión diaria"}
        </Boton>
        <button
          type="button"
          className={styles.enlace}
          onClick={() => (guiaAbierta ? cerrarGuia() : setGuiaAbierta(true))}
          aria-expanded={guiaAbierta}
          aria-controls="demo-guia"
        >
          {guiaAbierta ? "Ocultar guía" : "¿Qué probar?"}
        </button>
      </div>

      {guiaAbierta && (
        <section id="demo-guia" className={styles.guia} aria-label="Guía rápida del demo">
          <p className={styles.guiaTitulo}>Pruebe LexAI en un minuto</p>
          <ol className={styles.pasos}>
            <li>
              <b>Simule la revisión diaria.</b> Llega una actuación nueva de la Rama Judicial; LexAI
              la analiza, calcula el plazo en días hábiles (con festivos) y programa los avisos.
            </li>
            <li>
              <b>Abra un proceso</b> con «Ver proceso» y revise sus pestañas: actuaciones, plazos y
              notas.
            </li>
            <li>
              <b>Mueva una tarjeta</b> entre columnas (arrastrando o con el teclado).
            </li>
            <li>
              <b>Vea las notificaciones</b> en el menú lateral.
            </li>
          </ol>
          <button type="button" className={styles.enlace} onClick={cerrarGuia}>
            Entendido
          </button>
        </section>
      )}

      <Modal
        abierto={respuesta !== null}
        onCerrar={() => setRespuesta(null)}
        titulo={r ? "Revisión diaria completada" : "No se pudo simular"}
      >
        <div className={styles.contenido}>
          {respuesta && !respuesta.ok && <p>{respuesta.mensaje}</p>}
          {r && (
            <>
              <ol className={styles.pipeline}>
                <li>
                  <span className={styles.paso}>1 · Rama Judicial (CPNU)</span>
                  Nueva actuación en el proceso <code>{r.radicado}</code>
                  {r.despacho ? ` (${r.despacho})` : ""}: <b>{r.actuacion}</b>, del{" "}
                  {r.fechaActuacion}.<q className={styles.cita}>{r.anotacion}</q>
                </li>
                <li>
                  <span className={styles.paso}>2 · Análisis con IA</span>
                  {r.analisis.tipo === "plazo"
                    ? `Detectó un término de ${r.analisis.dias} días ${r.analisis.esHabil ? "hábiles" : "calendario"} a cargo del abogado.`
                    : r.analisis.tipo === "sin_plazo"
                      ? "La actuación no fija un término a cargo del abogado."
                      : "El término no se pudo determinar: queda para revisión manual."}
                </li>
                <li>
                  <span className={styles.paso}>3 · Cálculo del plazo</span>
                  {r.fechaLimite
                    ? `Vence el ${r.fechaLimite} (descontando fines de semana y festivos de Colombia).`
                    : "No hay plazo que calcular."}
                </li>
                <li>
                  <span className={styles.paso}>4 · Notificaciones</span>
                  {r.notificacionesProgramadas > 0
                    ? `${r.notificacionesProgramadas} aviso(s) programado(s) antes del vencimiento, más un aviso en la bandeja.`
                    : "Se dejó un aviso en la bandeja de notificaciones."}
                </li>
              </ol>
              <p className={styles.nota}>
                Es el mismo código que ejecuta el worker cada día hábil; en el demo, la Rama
                Judicial y la IA son simuladas. Le quedan {r.simulacionesRestantes} simulaciones.
              </p>
            </>
          )}
        </div>
      </Modal>
    </>
  );
}
