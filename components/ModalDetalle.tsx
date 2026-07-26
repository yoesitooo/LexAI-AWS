'use client';

import { useEffect, useState, useCallback } from 'react';
import { Modal } from './Modal';
import { Tarjeta } from './Tarjeta';
import { t } from '@/lib/i18n';
import { formatoFechaDate } from '@/lib/formato';
import { parseSujetosProcesales } from '@/lib/parse-sujetos';
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
  llave_proceso: string | null;
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

/**
 * Fila de información general (etiqueta + valor). Solo se renderiza si hay valor,
 * para no ensuciar el detalle con campos vacíos de la fuente pública.
 */
function FilaInfo({
  etiqueta,
  valor,
  mono = false,
}: {
  etiqueta: string;
  valor: string | null | undefined;
  mono?: boolean;
}) {
  if (!valor || valor.trim() === '') return null;
  return (
    <div className={styles.infoFila}>
      <dt className={styles.infoLabel}>{etiqueta}</dt>
      <dd className={`${styles.infoValor} ${mono ? styles.infoValorMono : ''}`}>
        {valor}
      </dd>
    </div>
  );
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
          {/* Sección: Información general del proceso */}
          <section className={styles.seccion} aria-label={t('detalle.info_general')}>
            <h3 className={styles.subtitulo}>{t('detalle.info_general')}</h3>
            <Tarjeta compacta>
              <dl className={styles.infoGrid}>
                <FilaInfo etiqueta={t('detalle.radicado')} valor={proceso.radicado} mono />
                <FilaInfo etiqueta={t('detalle.despacho')} valor={proceso.despacho} />
                <FilaInfo
                  etiqueta={t('detalle.ubicacion')}
                  valor={
                    [proceso.departamento, proceso.ciudad].filter(Boolean).join(' / ') || null
                  }
                />
                <FilaInfo etiqueta={t('detalle.tipo_proceso')} valor={proceso.tipo_proceso} />
                {(() => {
                  const sujetos = parseSujetosProcesales(proceso.sujetos_procesales);
                  return (
                    <>
                      <FilaInfo etiqueta={t('detalle.demandante')} valor={sujetos.demandante || null} />
                      <FilaInfo etiqueta={t('detalle.demandado')} valor={sujetos.demandado || null} />
                    </>
                  );
                })()}
                <FilaInfo etiqueta={t('detalle.estado_cpnu')} valor={proceso.estado_cpnu} />
                <FilaInfo etiqueta={t('detalle.llave')} valor={proceso.llave_proceso ?? null} mono />
                <FilaInfo
                  etiqueta={t('detalle.seguimiento')}
                  valor={
                    proceso.seguimiento_activo
                      ? t('detalle.seguimiento_activo')
                      : t('detalle.seguimiento_inactivo')
                  }
                />
              </dl>
            </Tarjeta>
          </section>

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
                        <div className={styles.actuacionEncabezado}>
                          <p className={styles.actuacionFecha}>
                            {act.fecha_actuacion
                              ? formatoFechaDate(new Date(act.fecha_actuacion))
                              : '—'}
                          </p>
                          {act.es_nueva && (
                            <span className={styles.badgeNueva}>
                              {t('detalle.actuacion_nueva')}
                            </span>
                          )}
                        </div>
                        <p className={styles.actuacionTexto}>{act.actuacion}</p>
                        {act.anotacion && (
                          <p className={styles.actuacionTexto}>
                            {act.anotacion}
                          </p>
                        )}
                        <div className={styles.actuacionMeta}>
                          {act.consecutivo != null && (
                            <span>{t('detalle.actuacion_consecutivo', { n: act.consecutivo })}</span>
                          )}
                          {act.fecha_registro && (
                            <span>
                              {t('detalle.actuacion_registrada', {
                                fecha: formatoFechaDate(new Date(act.fecha_registro)),
                              })}
                            </span>
                          )}
                          {act.fecha_inicia && act.fecha_finaliza && (
                            <span>
                              {t('detalle.actuacion_termino', {
                                inicio: formatoFechaDate(new Date(act.fecha_inicia)),
                                fin: formatoFechaDate(new Date(act.fecha_finaliza)),
                              })}
                            </span>
                          )}
                          {act.existe_docs && (
                            <span>{t('detalle.actuacion_documentos')}</span>
                          )}
                        </div>
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
