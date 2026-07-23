'use client';

import { useEffect, useState, useCallback } from 'react';
import { Modal } from './Modal';
import { Tarjeta } from './Tarjeta';
import { t } from '@/lib/i18n';
import { formatoFechaDate } from '@/lib/formato';
import styles from './ModalDetalle.module.css';

// ─── Tipos de respuesta de la API ───────────────────────────────────────────

interface Actuacion {
  id: string;
  id_actuacion_cpnu: string;
  consecutivo: number | null;
  fecha_actuacion: string | null;
  actuacion: string;
  anotacion: string | null;
  fecha_inicia: string | null;
  fecha_finaliza: string | null;
  fecha_registro: string | null;
  existe_docs: boolean;
  es_nueva: boolean;
  analisis_completado: boolean;
  creado_en: string;
}

interface Plazo {
  id: string;
  dias: number;
  es_habil: boolean;
  fecha_inicio: string;
  fecha_limite: string | null;
  estado: string;
  indeterminado: boolean;
  creado_en: string;
}

interface ProcesoDetalle {
  id: string;
  radicado: string;
  despacho: string | null;
  departamento: string | null;
  ciudad: string | null;
  tipo_proceso: string | null;
  sujetos_procesales: string;
  estado_cpnu: string | null;
  columna_kanban: string;
  seguimiento_activo: boolean;
  actuaciones: Actuacion[];
  plazos: Plazo[];
}

export interface ModalDetalleProps {
  /** Si el modal está visible */
  abierto: boolean;
  /** Callback para cerrar el modal */
  onCerrar: () => void;
  /** ID del proceso a mostrar */
  procesoId: string | null;
}

/**
 * Modal de detalle de proceso (R12.4).
 *
 * - Fetches GET /api/procesos/[id] al abrirse
 * - Muestra historial de actuaciones ordenado de más reciente a más antiguo
 * - Muestra plazos activos (estado pendiente)
 * - Accesible: usa Modal base con focus trap, Escape, aria-modal
 */
export function ModalDetalle({ abierto, onCerrar, procesoId }: ModalDetalleProps) {
  const [proceso, setProceso] = useState<ProcesoDetalle | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDetalle = useCallback(async (id: string) => {
    setCargando(true);
    setError(null);
    setProceso(null);

    try {
      const res = await fetch(`/api/procesos/${id}`);
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? t('error.generico'));
        return;
      }
      const data = await res.json();
      setProceso(data.proceso);
    } catch {
      setError(t('error.generico'));
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    if (abierto && procesoId) {
      fetchDetalle(procesoId);
    }
    if (!abierto) {
      setProceso(null);
      setError(null);
    }
  }, [abierto, procesoId, fetchDetalle]);

  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      titulo={t('detalle.titulo')}
      etiquetaCerrar={t('auth.logout.boton').replace('Cerrar sesión', 'Cerrar')}
    >
      {cargando && (
        <p className={styles.cargando} aria-live="polite">
          {t('error.cargando')}
        </p>
      )}

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      {proceso && (
        <>
          {/* Sección: Historial de actuaciones */}
          <section className={styles.seccion} aria-label={t('detalle.actuaciones')}>
            <h3 className={styles.subtitulo}>{t('detalle.actuaciones')}</h3>
            {proceso.actuaciones.length === 0 ? (
              <p className={styles.vacio}>{t('detalle.sin_actuaciones')}</p>
            ) : (
              <ul className={styles.listaActuaciones}>
                {proceso.actuaciones.map((act) => (
                  <li key={act.id}>
                    <Tarjeta compacta>
                      <div className={styles.actuacionItem}>
                        <p className={styles.actuacionFecha}>
                          {act.fecha_actuacion
                            ? formatoFechaDate(new Date(act.fecha_actuacion))
                            : '—'}
                        </p>
                        <p className={styles.actuacionTexto}>{act.actuacion}</p>
                        {act.anotacion && (
                          <p className={styles.actuacionTexto}>
                            {act.anotacion}
                          </p>
                        )}
                      </div>
                    </Tarjeta>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Sección: Plazos activos */}
          <section className={styles.seccion} aria-label={t('detalle.plazos_activos')}>
            <h3 className={styles.subtitulo}>{t('detalle.plazos_activos')}</h3>
            {proceso.plazos.length === 0 ? (
              <p className={styles.vacio}>{t('detalle.sin_plazos')}</p>
            ) : (
              <ul className={styles.listaPlazos}>
                {proceso.plazos.map((plazo) => (
                  <li key={plazo.id}>
                    <Tarjeta compacta>
                      <div className={styles.plazoItem}>
                        <span className={styles.plazoDias}>
                          {plazo.indeterminado
                            ? t('plazo.indeterminado')
                            : plazo.es_habil
                              ? t('plazo.dias_habiles', { dias: plazo.dias })
                              : t('plazo.dias_calendario', { dias: plazo.dias })}
                        </span>
                        {plazo.fecha_limite && (
                          <span className={styles.plazoFecha}>
                            {t('plazo.fecha_limite', {
                              fecha: formatoFechaDate(new Date(plazo.fecha_limite)),
                            })}
                          </span>
                        )}
                      </div>
                    </Tarjeta>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </Modal>
  );
}
