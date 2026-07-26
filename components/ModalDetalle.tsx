'use client';

import { useEffect, useState, useCallback, useRef, type KeyboardEvent } from 'react';
import { Modal } from './Modal';
import { Tarjeta } from './Tarjeta';
import { useToast } from './Toast';
import { t } from '@/lib/i18n';
import { formatoFechaDate, formatoHoraDate } from '@/lib/formato';
import { formatoTamano } from '@/lib/formato-archivo';
import { parseSujetosProcesales, esProcesoPrivado } from '@/lib/parse-sujetos';
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

interface Comentario {
  id: string;
  texto: string;
  creado_en: string;
  usuario: {
    id: string;
    nombre: string;
  };
}

interface Documento {
  id: string;
  nombre: string;
  tipo_mime: string;
  tamano_bytes: number;
  origen?: string;
  creado_en: string;
}

// ─── Tabs config ─────────────────────────────────────────────────────────────

type TabId = 'general' | 'actuaciones' | 'plazos' | 'expediente' | 'comentarios';

const TABS: { id: TabId; labelKey: string }[] = [
  { id: 'general', labelKey: 'detalle.tab.general' },
  { id: 'actuaciones', labelKey: 'detalle.tab.actuaciones' },
  { id: 'plazos', labelKey: 'detalle.tab.plazos' },
  { id: 'expediente', labelKey: 'detalle.tab.expediente' },
  { id: 'comentarios', labelKey: 'detalle.tab.comentarios' },
];

// ─── Subcomponentes ──────────────────────────────────────────────────────────

/**
 * Fila de información general (etiqueta + valor). Solo se renderiza si hay valor.
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

// ─── Props ───────────────────────────────────────────────────────────────────

export interface ModalDetalleProps {
  /** Si el modal está visible */
  abierto: boolean;
  /** Callback para cerrar el modal */
  onCerrar: () => void;
  /** ID del proceso a mostrar */
  procesoId: string | null;
}

/**
 * Modal de detalle de proceso con 5 tabs:
 * General, Actuaciones, Plazos, Expediente digital, Comentarios.
 *
 * Accesible: usa Modal base con focus trap, Escape, aria-modal.
 * Tabs con soporte de teclado (flechas, Enter/Space).
 */
export function ModalDetalle({ abierto, onCerrar, procesoId }: ModalDetalleProps) {
  const { mostrarToast } = useToast();
  const [proceso, setProceso] = useState<ProcesoDetalle | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tabActiva, setTabActiva] = useState<TabId>('general');

  // Comentarios state
  const [comentarios, setComentarios] = useState<Comentario[]>([]);
  const [comentariosCargando, setComentariosCargando] = useState(false);
  const [comentariosError, setComentariosError] = useState<string | null>(null);
  const [nuevoComentario, setNuevoComentario] = useState('');
  const [enviandoComentario, setEnviandoComentario] = useState(false);
  const [enviarError, setEnviarError] = useState<string | null>(null);

  // Expediente digital state
  const [documentos, setDocumentos] = useState<Documento[]>([]);
  const [documentosCargando, setDocumentosCargando] = useState(false);
  const [documentosError, setDocumentosError] = useState<string | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [subirError, setSubirError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // ─── Fetch process detail ──────────────────────────────────────────────

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

  // ─── Fetch comments ────────────────────────────────────────────────────

  const fetchComentarios = useCallback(async (id: string) => {
    setComentariosCargando(true);
    setComentariosError(null);

    try {
      const res = await fetch(`/api/procesos/${id}/comentarios`);
      if (!res.ok) {
        setComentariosError(t('detalle.comentarios.error_cargar'));
        return;
      }
      const data = await res.json();
      setComentarios(data.comentarios ?? []);
    } catch {
      setComentariosError(t('detalle.comentarios.error_cargar'));
    } finally {
      setComentariosCargando(false);
    }
  }, []);

  // ─── Post comment ──────────────────────────────────────────────────────

  const enviarComentario = useCallback(async () => {
    if (!procesoId || nuevoComentario.trim() === '') return;

    setEnviandoComentario(true);
    setEnviarError(null);

    try {
      const res = await fetch(`/api/procesos/${procesoId}/comentarios`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texto: nuevoComentario.trim() }),
      });

      if (!res.ok) {
        setEnviarError(t('detalle.comentarios.error_enviar'));
        return;
      }

      const data = await res.json();
      setComentarios((prev) => [data.comentario, ...prev]);
      setNuevoComentario('');
    } catch {
      setEnviarError(t('detalle.comentarios.error_enviar'));
    } finally {
      setEnviandoComentario(false);
    }
  }, [procesoId, nuevoComentario]);

  // ─── Fetch documents ───────────────────────────────────────────────────

  const fetchDocumentos = useCallback(async (id: string) => {
    setDocumentosCargando(true);
    setDocumentosError(null);

    try {
      const res = await fetch(`/api/procesos/${id}/documentos`);
      if (!res.ok) {
        setDocumentosError(t('detalle.expediente.error_cargar'));
        return;
      }
      const data = await res.json();
      setDocumentos(data.documentos ?? []);
    } catch {
      setDocumentosError(t('detalle.expediente.error_cargar'));
    } finally {
      setDocumentosCargando(false);
    }
  }, []);

  // ─── Upload file ───────────────────────────────────────────────────────

  const ALLOWED_TYPES = new Set([
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ]);

  const MAX_FILE_SIZE = 10 * 1024 * 1024;

  const subirArchivo = useCallback(async (file: File) => {
    if (!procesoId) return;

    if (!ALLOWED_TYPES.has(file.type)) {
      setSubirError(t('detalle.expediente.error_tipo'));
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      setSubirError(t('detalle.expediente.error_tamano'));
      return;
    }

    setSubiendo(true);
    setSubirError(null);

    try {
      const formData = new FormData();
      formData.append('archivo', file);

      const res = await fetch(`/api/procesos/${procesoId}/documentos`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setSubirError(data?.error ?? t('detalle.expediente.error_subir'));
        return;
      }

      const data = await res.json();
      setDocumentos((prev) => [data.documento, ...prev]);
    } catch {
      setSubirError(t('detalle.expediente.error_subir'));
    } finally {
      setSubiendo(false);
    }
  }, [procesoId]);

  // ─── Delete document ───────────────────────────────────────────────────

  const eliminarDocumento = useCallback(async (docId: string) => {
    if (!procesoId) return;

    const confirmado = window.confirm(t('detalle.expediente.confirmar_eliminar'));
    if (!confirmado) return;

    try {
      const res = await fetch(`/api/procesos/${procesoId}/documentos/${docId}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        setDocumentos((prev) => prev.filter((d) => d.id !== docId));
      } else {
        mostrarToast(t('detalle.expediente.error_eliminar'), 'error');
      }
    } catch {
      mostrarToast(t('detalle.expediente.error_eliminar'), 'error');
    }
  }, [procesoId, mostrarToast]);

  // ─── Sync documents from CPNU (Rama Judicial) ──────────────────────────

  const sincronizarDocumentos = useCallback(async () => {
    if (!procesoId) return;

    setSincronizando(true);
    setDocumentosError(null);

    try {
      const res = await fetch(`/api/procesos/${procesoId}/documentos/sincronizar`, {
        method: 'POST',
      });

      if (!res.ok) {
        mostrarToast(t('detalle.expediente.sincronizar_error'), 'error');
        return;
      }

      const data = await res.json();
      const descargados: number = data?.resumen?.descargados ?? 0;

      if (descargados > 0) {
        mostrarToast(t('detalle.expediente.sincronizar_exito', { n: descargados }), 'exito');
        // Recargar la lista para mostrar los nuevos documentos
        await fetchDocumentos(procesoId);
      } else {
        mostrarToast(t('detalle.expediente.sincronizar_sin_nuevos'), 'info');
      }
    } catch {
      mostrarToast(t('detalle.expediente.sincronizar_error'), 'error');
    } finally {
      setSincronizando(false);
    }
  }, [procesoId, mostrarToast, fetchDocumentos]);

  // ─── Effects ───────────────────────────────────────────────────────────

  useEffect(() => {
    if (abierto && procesoId) {
      fetchDetalle(procesoId);
      setTabActiva('general');
      setComentarios([]);
      setComentariosError(null);
      setNuevoComentario('');
      setDocumentos([]);
      setDocumentosError(null);
      setSubirError(null);
    }
    if (!abierto) {
      setProceso(null);
      setError(null);
      setComentarios([]);
      setComentariosError(null);
      setDocumentos([]);
      setDocumentosError(null);
      setSubirError(null);
    }
  }, [abierto, procesoId, fetchDetalle]);

  // Fetch comments when tab becomes active
  useEffect(() => {
    if (tabActiva === 'comentarios' && procesoId) {
      fetchComentarios(procesoId);
    }
  }, [tabActiva, procesoId, fetchComentarios]);

  // Fetch documents when expediente tab becomes active
  useEffect(() => {
    if (tabActiva === 'expediente' && procesoId) {
      fetchDocumentos(procesoId);
    }
  }, [tabActiva, procesoId, fetchDocumentos]);

  // ─── Tab keyboard navigation ───────────────────────────────────────────

  const handleTabKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let newIndex: number | null = null;

    if (e.key === 'ArrowRight') {
      newIndex = (index + 1) % TABS.length;
    } else if (e.key === 'ArrowLeft') {
      newIndex = (index - 1 + TABS.length) % TABS.length;
    } else if (e.key === 'Home') {
      newIndex = 0;
    } else if (e.key === 'End') {
      newIndex = TABS.length - 1;
    }

    if (newIndex !== null) {
      const targetTab = TABS[newIndex];
      if (targetTab) {
        e.preventDefault();
        setTabActiva(targetTab.id);
        tabRefs.current[newIndex]?.focus();
      }
    }
  };

  // ─── Render tab content ────────────────────────────────────────────────

  function renderTabGeneral() {
    if (!proceso) return null;
    return (
      <section aria-label={t('detalle.info_general')}>
        {esProcesoPrivado(proceso.sujetos_procesales) && (
          <div className={styles.avisoPrivado} role="note">
            <span className={styles.avisoPrivadoEtiqueta}>
              {t('detalle.privado_etiqueta')}
            </span>
            <span>{t('detalle.privado_aviso')}</span>
          </div>
        )}

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
    );
  }

  function renderTabActuaciones() {
    if (!proceso) return null;
    return (
      <section aria-label={t('detalle.actuaciones')}>
        {proceso.actuaciones.length === 0 ? (
          <p className={styles.vacio}>
            {esProcesoPrivado(proceso.sujetos_procesales)
              ? t('detalle.sin_actuaciones_privado')
              : t('detalle.sin_actuaciones')}
          </p>
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
                          : '--'}
                      </p>
                      {act.es_nueva && (
                        <span className={styles.badgeNueva}>
                          {t('detalle.actuacion_nueva')}
                        </span>
                      )}
                    </div>
                    <p className={styles.actuacionTexto}>{act.actuacion}</p>
                    {act.anotacion && (
                      <p className={styles.actuacionTexto}>{act.anotacion}</p>
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
    );
  }

  function renderTabPlazos() {
    if (!proceso) return null;
    return (
      <section aria-label={t('detalle.plazos_activos')}>
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
    );
  }

  function renderTabExpediente() {
    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragOver(false);
      const files = e.dataTransfer.files;
      const file = files[0];
      if (file) {
        subirArchivo(file);
      }
    };

    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragOver(true);
    };

    const handleDragLeave = () => {
      setDragOver(false);
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      const file = files?.[0];
      if (file) {
        subirArchivo(file);
      }
      // Reset input so the same file can be re-selected
      e.target.value = '';
    };

    return (
      <section aria-label={t('detalle.tab.expediente')}>
        {/* Traer documentos de la Rama Judicial (CPNU) */}
        <div className={styles.sincronizarBarra}>
          <button
            type="button"
            className={styles.sincronizarBoton}
            onClick={sincronizarDocumentos}
            disabled={sincronizando}
          >
            {sincronizando
              ? t('detalle.expediente.sincronizando')
              : t('detalle.expediente.sincronizar')}
          </button>
        </div>

        {/* Drop zone */}
        <div
          className={`${styles.dropZone} ${dragOver ? styles.dropZoneDragOver : ''}`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => fileInputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              fileInputRef.current?.click();
            }
          }}
          aria-label={t('detalle.expediente.drop_texto')}
        >
          <p className={styles.dropZoneTexto}>{t('detalle.expediente.drop_texto')}</p>
          <p className={styles.dropZoneSubtexto}>{t('detalle.expediente.drop_subtexto')}</p>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          multiple={false}
          accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"
          style={{ display: 'none' }}
          onChange={handleFileSelect}
          aria-hidden="true"
        />

        {/* Upload status */}
        {subiendo && (
          <p className={styles.cargando} aria-live="polite">
            {t('detalle.expediente.subiendo')}
          </p>
        )}

        {subirError && (
          <p className={styles.error} role="alert">{subirError}</p>
        )}

        {/* Loading documents */}
        {documentosCargando && (
          <p className={styles.cargando} aria-live="polite">{t('error.cargando')}</p>
        )}

        {documentosError && (
          <p className={styles.error} role="alert">{documentosError}</p>
        )}

        {/* Document list */}
        {!documentosCargando && !documentosError && documentos.length === 0 && (
          <p className={styles.vacio}>{t('detalle.expediente.vacio')}</p>
        )}

        {documentos.length > 0 && (
          <ul className={styles.listaDocumentos}>
            {documentos.map((doc) => (
              <li key={doc.id} className={styles.documentoItem}>
                <div className={styles.documentoInfo}>
                  <p className={styles.documentoNombre}>{doc.nombre}</p>
                  <span className={styles.documentoMeta}>
                    {formatoTamano(doc.tamano_bytes)} — {formatoFechaDate(new Date(doc.creado_en))}
                    {' — '}
                    <span
                      className={
                        doc.origen === 'cpnu'
                          ? styles.documentoOrigenCpnu
                          : styles.documentoOrigenManual
                      }
                    >
                      {doc.origen === 'cpnu'
                        ? t('detalle.expediente.origen_cpnu')
                        : t('detalle.expediente.origen_manual')}
                    </span>
                  </span>
                </div>
                <div className={styles.documentoAcciones}>
                  <a
                    href={`/api/procesos/${procesoId}/documentos/${doc.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.documentoBoton}
                  >
                    {t('detalle.expediente.descargar')}
                  </a>
                  <button
                    type="button"
                    className={`${styles.documentoBoton} ${styles.documentoBotonEliminar}`}
                    onClick={() => eliminarDocumento(doc.id)}
                  >
                    {t('detalle.expediente.eliminar')}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    );
  }

  function renderTabComentarios() {
    return (
      <section aria-label={t('detalle.tab.comentarios')}>
        {/* Form to add a comment */}
        <div className={styles.comentarioForm}>
          <textarea
            className={styles.comentarioTextarea}
            placeholder={t('detalle.comentarios.placeholder')}
            value={nuevoComentario}
            onChange={(e) => setNuevoComentario(e.target.value)}
            disabled={enviandoComentario}
            rows={3}
            aria-label={t('detalle.comentarios.placeholder')}
          />
          <button
            type="button"
            className={styles.comentarioBoton}
            onClick={enviarComentario}
            disabled={enviandoComentario || nuevoComentario.trim() === ''}
          >
            {t('detalle.comentarios.agregar')}
          </button>
        </div>

        {enviarError && (
          <p className={styles.error} role="alert">{enviarError}</p>
        )}

        {comentariosCargando && (
          <p className={styles.cargando} aria-live="polite">{t('error.cargando')}</p>
        )}

        {comentariosError && (
          <p className={styles.error} role="alert">{comentariosError}</p>
        )}

        {!comentariosCargando && !comentariosError && comentarios.length === 0 && (
          <p className={styles.vacio}>{t('detalle.comentarios.vacio')}</p>
        )}

        {comentarios.length > 0 && (
          <ul className={styles.listaComentarios}>
            {comentarios.map((c) => (
              <li key={c.id} className={styles.comentarioItem}>
                <p className={styles.comentarioTexto}>{c.texto}</p>
                <span className={styles.comentarioMeta}>
                  {t('detalle.comentarios.por')} {c.usuario.nombre} — {formatoFechaDate(new Date(c.creado_en))} {formatoHoraDate(new Date(c.creado_en))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    );
  }

  const TAB_RENDERERS: Record<TabId, () => React.ReactNode> = {
    general: renderTabGeneral,
    actuaciones: renderTabActuaciones,
    plazos: renderTabPlazos,
    expediente: renderTabExpediente,
    comentarios: renderTabComentarios,
  };

  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      titulo={t('detalle.titulo')}
      etiquetaCerrar={t('auth.logout.boton').replace('Cerrar sesión', 'Cerrar')}
      ancho="amplio"
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
          {/* Tab bar */}
          <div className={styles.tabBar} role="tablist" aria-label={t('detalle.titulo')}>
            {TABS.map((tab, index) => (
              <button
                key={tab.id}
                ref={(el) => { tabRefs.current[index] = el; }}
                role="tab"
                id={`tab-${tab.id}`}
                aria-selected={tabActiva === tab.id}
                aria-controls={`tabpanel-${tab.id}`}
                tabIndex={tabActiva === tab.id ? 0 : -1}
                className={`${styles.tab} ${tabActiva === tab.id ? styles.tabActiva : ''}`}
                onClick={() => setTabActiva(tab.id)}
                onKeyDown={(e) => handleTabKeyDown(e, index)}
              >
                {t(tab.labelKey as Parameters<typeof t>[0])}
              </button>
            ))}
          </div>

          {/* Tab panel */}
          <div
            className={styles.tabPanel}
            role="tabpanel"
            id={`tabpanel-${tabActiva}`}
            aria-labelledby={`tab-${tabActiva}`}
          >
            {TAB_RENDERERS[tabActiva]()}
          </div>
        </>
      )}
    </Modal>
  );
}
