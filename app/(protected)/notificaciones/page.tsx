"use client";

/**
 * Bandeja de notificaciones in-app (/notificaciones).
 *
 * Muestra las notificaciones del usuario autenticado (GET /api/notificaciones),
 * con las no leídas destacadas primero. Estado vacío, carga y error incluidos.
 *
 * Requisitos: R10.2
 */

import { useEffect, useState, useCallback } from "react";
import { Tarjeta } from "@/components";
import { t } from "@/lib/i18n";
import { formatoFechaDate, formatoHoraDate } from "@/lib/formato";
import styles from "./notificaciones.module.css";

interface Notificacion {
  id: string;
  titulo: string;
  mensaje: string;
  leida: boolean;
  creado_en: string;
  notificacion_id: string | null;
}

export default function NotificacionesPage() {
  const [notificaciones, setNotificaciones] = useState<Notificacion[] | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      const res = await fetch("/api/notificaciones");

      if (!res.ok) {
        if (res.status === 401) {
          window.location.href = "/login";
          return;
        }
        throw new Error(`Error ${res.status}`);
      }

      const data = await res.json();
      setNotificaciones(data.notificaciones ?? []);
      setError(null);
    } catch {
      setError(t("notificacion.error_carga"));
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  return (
    <main className={styles.pagina}>
      <div className={styles.contenedor}>
        <h1 className={styles.titulo}>{t("notificacion.titulo")}</h1>
        <p className={styles.subtitulo}>{t("notificacion.subtitulo")}</p>

        {cargando && (
          <p className={styles.estado} role="status" aria-live="polite">
            {t("error.cargando")}
          </p>
        )}

        {!cargando && error && (
          <p className={styles.estadoError} role="alert">
            {error}
          </p>
        )}

        {!cargando && !error && notificaciones && notificaciones.length === 0 && (
          <p className={styles.estado}>{t("notificacion.vacia")}</p>
        )}

        {!cargando && !error && notificaciones && notificaciones.length > 0 && (
          <ul className={styles.lista}>
            {notificaciones.map((n) => {
              const fecha = new Date(n.creado_en);
              return (
                <li key={n.id} className={styles.item}>
                  <Tarjeta
                    className={`${styles.tarjeta} ${n.leida ? "" : styles.tarjetaNoLeida}`}
                  >
                    <div className={styles.encabezadoItem}>
                      <h2 className={styles.tituloItem}>{n.titulo}</h2>
                      {!n.leida && (
                        <span className={styles.badgeNueva}>
                          {t("notificacion.nueva")}
                        </span>
                      )}
                    </div>
                    <p className={styles.mensaje}>{n.mensaje}</p>
                    <time
                      className={styles.fecha}
                      dateTime={fecha.toISOString()}
                    >
                      {formatoFechaDate(fecha)} · {formatoHoraDate(fecha)}
                    </time>
                  </Tarjeta>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}
