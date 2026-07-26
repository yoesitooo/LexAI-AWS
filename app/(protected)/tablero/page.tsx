"use client";

/**
 * Tablero Kanban — Pantalla principal tras login (/tablero).
 *
 * Muestra los procesos del usuario en cinco columnas:
 * Nuevo, En seguimiento, Requiere acción, Vencido, Archivado.
 *
 * - Botón "Nuevo proceso" que abre el modal de registro (R5).
 * - Cada proceso en una sola columna (R12.2).
 * - Tarjeta con radicado, demandante, demandado, última actuación,
 *   juzgado y departamento/ciudad (R12.3).
 * - Estado vacío con mensaje (R12.6).
 * - Estados distinguidos por texto e ícono además de color (R18.6).
 * - Drag-and-drop accesible con ARIA live y alternativa por teclado (R18.3, R18.5).
 *
 * Requisitos: R5, R12.1, R12.2, R12.3, R12.6, R18.3, R18.5, R18.6
 */

import { useEffect, useState, useRef, useCallback } from "react";
import {
  Tarjeta,
  BadgeEstado,
  Boton,
  Modal,
  ModalRegistro,
  ModalDetalle,
  useToast,
} from "@/components";
import type { EstadoProceso } from "@/components";
import { t } from "@/lib/i18n";
import { parseSujetosProcesales } from "@/lib/parse-sujetos";
import styles from "../kanban.module.css";

// ─── Tipos ──────────────────────────────────────────────────────────────────

interface ActuacionResumen {
  actuacion: string;
  fecha_actuacion: string;
}

interface ProcesoKanban {
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
  creado_en: string;
  actualizado_en: string;
  actuaciones: ActuacionResumen[];
}

type KanbanData = Record<string, ProcesoKanban[]>;

// ─── Columnas ordenadas del Kanban ──────────────────────────────────────────

const COLUMNAS: { key: string; estado: EstadoProceso }[] = [
  { key: "nuevo", estado: "nuevo" },
  { key: "en_seguimiento", estado: "en_seguimiento" },
  { key: "requiere_accion", estado: "requiere_accion" },
  { key: "vencido", estado: "vencido" },
  { key: "archivado", estado: "archivado" },
];

const COLUMNA_LABELS_MAP: Record<string, string> = {
  nuevo: t("kanban.columna.nuevo"),
  en_seguimiento: t("kanban.columna.en_seguimiento"),
  requiere_accion: t("kanban.columna.requiere_accion"),
  vencido: t("kanban.columna.vencido"),
  archivado: t("kanban.columna.archivado"),
};

/** Safe accessor that always returns a string (key as fallback) */
function COLUMNA_LABELS(key: string): string {
  return COLUMNA_LABELS_MAP[key] ?? key;
}

// ─── Componente de Tarjeta de Proceso ───────────────────────────────────────

function TarjetaProceso({
  proceso,
  isDragging,
  isKbdActive,
  onDragStart,
  onDragEnd,
  onKeyDown,
  onVerDetalle,
  onEliminar,
}: {
  proceso: ProcesoKanban;
  isDragging: boolean;
  isKbdActive: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: (e: React.DragEvent) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onVerDetalle: () => void;
  onEliminar: () => void;
}) {
  const sujetos = parseSujetosProcesales(proceso.sujetos_procesales);
  const ultimaActuacion =
    proceso.actuaciones.length > 0 ? proceso.actuaciones[0] : null;

  const ubicacion = [proceso.departamento, proceso.ciudad]
    .filter(Boolean)
    .join(" / ");

  const classNames = [
    styles.tarjetaProceso,
    isDragging ? styles.tarjetaDragging : "",
    isKbdActive ? styles.tarjetaKbd : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <Tarjeta
      compacta
      className={classNames}
      role="article"
      aria-label={`Proceso ${proceso.radicado}`}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onKeyDown={onKeyDown}
      tabIndex={0}
      aria-roledescription="tarjeta movible"
      aria-describedby="kanban-dnd-instructions"
    >
      {/* Radicado */}
      <div className={styles.tarjetaRadicado}>{proceso.radicado}</div>

      {/* Partes procesales */}
      <div className={styles.tarjetaPartes}>
        {sujetos.demandante && (
          <div className={styles.tarjetaParte}>
            <span className={styles.tarjetaParteLabel}>
              {t("kanban.tarjeta.demandante")}:
            </span>{" "}
            {sujetos.demandante}
          </div>
        )}
        {sujetos.demandado && (
          <div className={styles.tarjetaParte}>
            <span className={styles.tarjetaParteLabel}>
              {t("kanban.tarjeta.demandado")}:
            </span>{" "}
            {sujetos.demandado}
          </div>
        )}
      </div>

      {/* Última actuación */}
      {ultimaActuacion && (
        <div className={styles.tarjetaActuacion} title={ultimaActuacion.actuacion}>
          {ultimaActuacion.actuacion}
        </div>
      )}

      {/* Juzgado */}
      {proceso.despacho && (
        <div className={styles.tarjetaDespacho}>{proceso.despacho}</div>
      )}

      {/* Departamento / Ciudad */}
      {ubicacion && (
        <div className={styles.tarjetaUbicacion}>{ubicacion}</div>
      )}

      {/* Badge de estado */}
      <div className={styles.tarjetaBadge}>
        <BadgeEstado estado={proceso.columna_kanban as EstadoProceso} />
      </div>

      {/* Acciones: ver detalle / eliminar */}
      <div className={styles.tarjetaAcciones}>
        <button
          type="button"
          className={styles.botonVerProceso}
          onClick={(e) => {
            e.stopPropagation();
            onVerDetalle();
          }}
          onPointerDown={(e) => e.stopPropagation()}
          draggable={false}
        >
          {t("kanban.ver_proceso")}
        </button>
        <button
          type="button"
          className={styles.botonEliminar}
          aria-label={t("kanban.eliminar_proceso")}
          title={t("kanban.eliminar_proceso")}
          onClick={(e) => {
            e.stopPropagation();
            onEliminar();
          }}
          onPointerDown={(e) => e.stopPropagation()}
          draggable={false}
        >
          <IconoBasura />
        </button>
      </div>
    </Tarjeta>
  );
}

/** Ícono de papelera monocromático (hereda el color del botón). */
function IconoBasura() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  );
}

// ─── Componente de Columna ──────────────────────────────────────────────────

function ColumnaKanban({
  columnaKey,
  estado,
  procesos,
  isDropTarget,
  draggingProcesoId,
  kbdActiveProcesoId,
  onDragOver,
  onDragLeave,
  onDrop,
  onCardDragStart,
  onCardDragEnd,
  onCardKeyDown,
  onVerDetalle,
  onEliminar,
}: {
  columnaKey: string;
  estado: EstadoProceso;
  procesos: ProcesoKanban[];
  isDropTarget: boolean;
  draggingProcesoId: string | null;
  kbdActiveProcesoId: string | null;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onCardDragStart: (proceso: ProcesoKanban) => (e: React.DragEvent) => void;
  onCardDragEnd: (e: React.DragEvent) => void;
  onCardKeyDown: (proceso: ProcesoKanban) => (e: React.KeyboardEvent) => void;
  onVerDetalle: (proceso: ProcesoKanban) => void;
  onEliminar: (proceso: ProcesoKanban) => void;
}) {
  const listClasses = [
    styles.columnaLista,
    isDropTarget ? styles.columnaDropTarget : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <section
      className={styles.columna}
      aria-label={`Columna ${COLUMNA_LABELS(columnaKey)}`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      data-columna={columnaKey}
    >
      <header className={styles.columnaEncabezado}>
        <BadgeEstado estado={estado} />
        <span className={styles.columnaContador}>({procesos.length})</span>
      </header>
      <div className={listClasses} role="list">
        {procesos.map((proceso) => (
          <div key={proceso.id} role="listitem">
            <TarjetaProceso
              proceso={proceso}
              isDragging={draggingProcesoId === proceso.id}
              isKbdActive={kbdActiveProcesoId === proceso.id}
              onDragStart={onCardDragStart(proceso)}
              onDragEnd={onCardDragEnd}
              onKeyDown={onCardKeyDown(proceso)}
              onVerDetalle={() => onVerDetalle(proceso)}
              onEliminar={() => onEliminar(proceso)}
            />
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── Página Principal Kanban ────────────────────────────────────────────────

export default function KanbanPage() {
  const { mostrarToast } = useToast();
  const [kanban, setKanban] = useState<KanbanData | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal de registro de proceso
  const [modalAbierto, setModalAbierto] = useState(false);

  // Modal de detalle de proceso
  const [detalleId, setDetalleId] = useState<string | null>(null);
  const [detalleAbierto, setDetalleAbierto] = useState(false);

  const handleVerDetalle = useCallback((proceso: ProcesoKanban) => {
    setDetalleId(proceso.id);
    setDetalleAbierto(true);
  }, []);

  // Eliminación de proceso (con confirmación)
  const [procesoAEliminar, setProcesoAEliminar] = useState<ProcesoKanban | null>(null);
  const [eliminando, setEliminando] = useState(false);
  const [errorEliminar, setErrorEliminar] = useState<string | null>(null);

  const handleEliminarClick = useCallback((proceso: ProcesoKanban) => {
    setErrorEliminar(null);
    setProcesoAEliminar(proceso);
  }, []);

  const cancelarEliminar = useCallback(() => {
    if (eliminando) return;
    setProcesoAEliminar(null);
    setErrorEliminar(null);
  }, [eliminando]);

  // DnD state
  const [draggingProceso, setDraggingProceso] = useState<ProcesoKanban | null>(null);
  const [dropTargetColumna, setDropTargetColumna] = useState<string | null>(null);

  // Keyboard DnD state
  const [kbdActiveProceso, setKbdActiveProceso] = useState<ProcesoKanban | null>(null);
  const [kbdTargetColumna, setKbdTargetColumna] = useState<string | null>(null);

  // ARIA live announcements
  const [announcement, setAnnouncement] = useState("");
  const announcementRef = useRef<HTMLDivElement>(null);

  const announce = useCallback((message: string) => {
    // Clear first to ensure re-announcement of same text
    setAnnouncement("");
    requestAnimationFrame(() => {
      setAnnouncement(message);
    });
  }, []);

  const cargarProcesos = useCallback(async () => {
    try {
      const res = await fetch("/api/procesos");

      if (!res.ok) {
        if (res.status === 401) {
          window.location.href = "/login";
          return;
        }
        throw new Error(`Error ${res.status}`);
      }

      const data = await res.json();
      setKanban(data.kanban);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("error.generico"));
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargarProcesos();
  }, [cargarProcesos]);

  const confirmarEliminar = useCallback(async () => {
    if (!procesoAEliminar) return;
    setEliminando(true);
    setErrorEliminar(null);
    try {
      const res = await fetch(`/api/procesos/${procesoAEliminar.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        if (res.status === 401) {
          window.location.href = "/login";
          return;
        }
        setErrorEliminar(t("eliminar.error"));
        mostrarToast(t("eliminar.error"), "error");
        return;
      }
      setProcesoAEliminar(null);
      await cargarProcesos();
    } catch {
      setErrorEliminar(t("eliminar.error"));
      mostrarToast(t("eliminar.error"), "error");
    } finally {
      setEliminando(false);
    }
  }, [procesoAEliminar, cargarProcesos, mostrarToast]);

  // ─── PATCH helper ───────────────────────────────────────────────────────

  const moverProceso = useCallback(
    async (proceso: ProcesoKanban, nuevaColumna: string) => {
      if (!kanban) return false;

      const columnaOrigen = proceso.columna_kanban;
      if (columnaOrigen === nuevaColumna) return false;

      // Optimistic update
      const nuevoKanban = { ...kanban };
      nuevoKanban[columnaOrigen] = (nuevoKanban[columnaOrigen] ?? []).filter(
        (p) => p.id !== proceso.id,
      );
      const procesoActualizado = { ...proceso, columna_kanban: nuevaColumna };
      nuevoKanban[nuevaColumna] = [
        ...(nuevoKanban[nuevaColumna] || []),
        procesoActualizado,
      ];
      setKanban(nuevoKanban);

      try {
        const res = await fetch(`/api/procesos/${proceso.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ columna_kanban: nuevaColumna }),
        });

        if (!res.ok) {
          // Revert optimistic update
          setKanban(kanban);
          announce(t("kanban.dnd.error"));
          mostrarToast(t("kanban.dnd.error"), "error");
          return false;
        }

        announce(
          t("kanban.dnd.movido", {
            radicado: proceso.radicado,
            origen: COLUMNA_LABELS(columnaOrigen),
            destino: COLUMNA_LABELS(nuevaColumna),
          }),
        );
        return true;
      } catch {
        // Revert on network error
        setKanban(kanban);
        announce(t("kanban.dnd.error"));
        mostrarToast(t("kanban.dnd.error"), "error");
        return false;
      }
    },
    [kanban, announce, mostrarToast],
  );

  // ─── HTML5 Drag & Drop handlers ────────────────────────────────────────

  const handleDragStart = useCallback(
    (proceso: ProcesoKanban) => (e: React.DragEvent) => {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", proceso.id);
      setDraggingProceso(proceso);
      announce(
        t("kanban.dnd.recogido", {
          radicado: proceso.radicado,
          origen: COLUMNA_LABELS(proceso.columna_kanban),
        }),
      );
    },
    [announce],
  );

  const handleDragEnd = useCallback(
    (_e: React.DragEvent) => {
      if (draggingProceso && !dropTargetColumna) {
        announce(
          t("kanban.dnd.cancelado", {
            radicado: draggingProceso.radicado,
            origen: COLUMNA_LABELS(draggingProceso.columna_kanban),
          }),
        );
      }
      setDraggingProceso(null);
      setDropTargetColumna(null);
    },
    [draggingProceso, dropTargetColumna, announce],
  );

  const handleDragOver = useCallback(
    (columnaKey: string) => (e: React.DragEvent) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setDropTargetColumna(columnaKey);
    },
    [],
  );

  const handleDragLeave = useCallback(
    (columnaKey: string) => (e: React.DragEvent) => {
      // Only clear if leaving the column itself (not a child)
      const relatedTarget = e.relatedTarget as HTMLElement | null;
      const currentTarget = e.currentTarget as HTMLElement;
      if (!relatedTarget || !currentTarget.contains(relatedTarget)) {
        if (dropTargetColumna === columnaKey) {
          setDropTargetColumna(null);
        }
      }
    },
    [dropTargetColumna],
  );

  const handleDrop = useCallback(
    (columnaKey: string) => (e: React.DragEvent) => {
      e.preventDefault();
      setDropTargetColumna(null);

      if (draggingProceso) {
        moverProceso(draggingProceso, columnaKey);
      }
      setDraggingProceso(null);
    },
    [draggingProceso, moverProceso],
  );

  // ─── Keyboard DnD handlers ─────────────────────────────────────────────

  const handleCardKeyDown = useCallback(
    (proceso: ProcesoKanban) => (e: React.KeyboardEvent) => {
      // Not in keyboard drag mode — pick up on Space/Enter
      if (!kbdActiveProceso) {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          setKbdActiveProceso(proceso);
          setKbdTargetColumna(proceso.columna_kanban);
          announce(
            t("kanban.dnd.recogido", {
              radicado: proceso.radicado,
              origen: COLUMNA_LABELS(proceso.columna_kanban),
            }),
          );
        }
        return;
      }

      // Already in keyboard drag mode
      if (kbdActiveProceso.id !== proceso.id) return;

      const currentIndex = COLUMNAS.findIndex((c) => c.key === kbdTargetColumna);

      switch (e.key) {
        case "ArrowRight": {
          e.preventDefault();
          const nextIndex = Math.min(currentIndex + 1, COLUMNAS.length - 1);
          const nextCol = COLUMNAS[nextIndex]!.key;
          setKbdTargetColumna(nextCol);
          announce(
            t("kanban.dnd.movido", {
              radicado: proceso.radicado,
              origen: COLUMNA_LABELS(proceso.columna_kanban),
              destino: COLUMNA_LABELS(nextCol),
            }),
          );
          break;
        }
        case "ArrowLeft": {
          e.preventDefault();
          const prevIndex = Math.max(currentIndex - 1, 0);
          const prevCol = COLUMNAS[prevIndex]!.key;
          setKbdTargetColumna(prevCol);
          announce(
            t("kanban.dnd.movido", {
              radicado: proceso.radicado,
              origen: COLUMNA_LABELS(proceso.columna_kanban),
              destino: COLUMNA_LABELS(prevCol),
            }),
          );
          break;
        }
        case " ":
        case "Enter": {
          e.preventDefault();
          // Drop the card
          if (kbdTargetColumna && kbdTargetColumna !== proceso.columna_kanban) {
            moverProceso(proceso, kbdTargetColumna);
          } else {
            announce(
              t("kanban.dnd.cancelado", {
                radicado: proceso.radicado,
                origen: COLUMNA_LABELS(proceso.columna_kanban),
              }),
            );
          }
          setKbdActiveProceso(null);
          setKbdTargetColumna(null);
          break;
        }
        case "Escape": {
          e.preventDefault();
          announce(
            t("kanban.dnd.cancelado", {
              radicado: proceso.radicado,
              origen: COLUMNA_LABELS(proceso.columna_kanban),
            }),
          );
          setKbdActiveProceso(null);
          setKbdTargetColumna(null);
          break;
        }
      }
    },
    [kbdActiveProceso, kbdTargetColumna, announce, moverProceso],
  );

  // ─── Encabezado con acción de registro ─────────────────────────────────

  const encabezado = (
    <div className={styles.encabezadoPagina}>
      <h1 className={styles.titulo}>{t("kanban.titulo")}</h1>
      <Boton
        variante="acento"
        onClick={() => setModalAbierto(true)}
        icono={<span aria-hidden="true">+</span>}
      >
        {t("kanban.nuevo_proceso")}
      </Boton>
    </div>
  );

  const modales = (
    <>
      <ModalRegistro
        abierto={modalAbierto}
        onCerrar={() => setModalAbierto(false)}
        onRegistroExitoso={cargarProcesos}
      />
      <ModalDetalle
        abierto={detalleAbierto}
        onCerrar={() => setDetalleAbierto(false)}
        procesoId={detalleId}
      />
      <Modal
        abierto={procesoAEliminar !== null}
        onCerrar={cancelarEliminar}
        titulo={t("eliminar.titulo")}
        etiquetaCerrar={t("eliminar.cancelar")}
      >
        <div className={styles.eliminarContenido}>
          <p className={styles.eliminarTexto}>{t("eliminar.confirmacion")}</p>
          {procesoAEliminar && (
            <p className={styles.eliminarRadicado}>{procesoAEliminar.radicado}</p>
          )}
          {errorEliminar && (
            <p className={styles.eliminarError} role="alert">
              {errorEliminar}
            </p>
          )}
          <div className={styles.eliminarAcciones}>
            <Boton
              variante="secundario"
              onClick={cancelarEliminar}
              disabled={eliminando}
            >
              {t("eliminar.cancelar")}
            </Boton>
            <Boton
              variante="acento"
              onClick={confirmarEliminar}
              cargando={eliminando}
            >
              {t("eliminar.confirmar")}
            </Boton>
          </div>
        </div>
      </Modal>
    </>
  );

  // --- Estado: Cargando ---
  if (cargando) {
    return (
      <main className={styles.contenedor}>
        <div className={styles.cargando} role="status" aria-live="polite">
          {t("error.cargando")}
        </div>
      </main>
    );
  }

  // --- Estado: Error ---
  if (error) {
    return (
      <main className={styles.contenedor}>
        {encabezado}
        <div className={styles.error} role="alert">
          <p>{error}</p>
        </div>
        {modales}
      </main>
    );
  }

  // --- Estado: Sin datos ---
  if (!kanban) {
    return (
      <main className={styles.contenedor}>
        {encabezado}
        <div className={styles.error} role="alert">
          <p>{t("error.generico")}</p>
        </div>
        {modales}
      </main>
    );
  }

  // Calcular si hay algún proceso en total
  const totalProcesos = Object.values(kanban).reduce(
    (sum, col) => sum + col.length,
    0,
  );

  // --- Estado: Vacío (sin procesos registrados) ---
  if (totalProcesos === 0) {
    return (
      <main className={styles.contenedor}>
        {encabezado}
        <div className={styles.tablero} role="region" aria-label="Tablero Kanban">
          {COLUMNAS.map(({ key, estado }) => (
            <ColumnaKanban
              key={key}
              columnaKey={key}
              estado={estado}
              procesos={[]}
              isDropTarget={false}
              draggingProcesoId={null}
              kbdActiveProcesoId={null}
              onDragOver={handleDragOver(key)}
              onDragLeave={handleDragLeave(key)}
              onDrop={handleDrop(key)}
              onCardDragStart={handleDragStart}
              onCardDragEnd={handleDragEnd}
              onCardKeyDown={handleCardKeyDown}
              onVerDetalle={handleVerDetalle}
              onEliminar={handleEliminarClick}
            />
          ))}
        </div>
        <div className={styles.vacio}>
          <p className={styles.vacioMensaje}>{t("kanban.vacio")}</p>
          <div className={styles.vacioAccion}>
            <Boton
              variante="acento"
              onClick={() => setModalAbierto(true)}
              icono={<span aria-hidden="true">+</span>}
            >
              {t("kanban.nuevo_proceso")}
            </Boton>
          </div>
        </div>
        {modales}
      </main>
    );
  }

  // --- Estado: Con procesos ---
  return (
    <main className={styles.contenedor}>
      {encabezado}

      {/* ARIA live region for DnD announcements */}
      <div
        ref={announcementRef}
        aria-live="assertive"
        aria-atomic="true"
        role="status"
        className={styles.srOnly}
      >
        {announcement}
      </div>

      {/* Hidden instructions for screen readers */}
      <div id="kanban-dnd-instructions" className={styles.srOnly}>
        {t("kanban.dnd.instrucciones")}
      </div>

      <div className={styles.tablero} role="region" aria-label="Tablero Kanban">
        {COLUMNAS.map(({ key, estado }) => (
          <ColumnaKanban
            key={key}
            columnaKey={key}
            estado={estado}
            procesos={kanban[key] ?? []}
            isDropTarget={
              dropTargetColumna === key ||
              (kbdActiveProceso !== null && kbdTargetColumna === key)
            }
            draggingProcesoId={draggingProceso?.id ?? null}
            kbdActiveProcesoId={kbdActiveProceso?.id ?? null}
            onDragOver={handleDragOver(key)}
            onDragLeave={handleDragLeave(key)}
            onDrop={handleDrop(key)}
            onCardDragStart={handleDragStart}
            onCardDragEnd={handleDragEnd}
            onCardKeyDown={handleCardKeyDown}
            onVerDetalle={handleVerDetalle}
            onEliminar={handleEliminarClick}
          />
        ))}
      </div>
      {modales}
    </main>
  );
}
