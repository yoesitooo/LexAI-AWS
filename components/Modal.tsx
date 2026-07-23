'use client';

import { type ReactNode, useEffect, useRef, useCallback } from 'react';
import styles from './Modal.module.css';

export interface ModalProps {
  /** Si el modal está visible */
  abierto: boolean;
  /** Callback para cerrar el modal */
  onCerrar: () => void;
  /** Título mostrado en la cabecera (también usado como aria-labelledby) */
  titulo: string;
  /** Texto del botón de cerrar (para aria-label) */
  etiquetaCerrar?: string;
  /** Contenido del modal */
  children: ReactNode;
}

/**
 * Modal base accesible del sistema de diseño LexAI.
 *
 * - role="dialog" + aria-modal="true" + aria-labelledby
 * - Focus trap: al abrir, el foco se mueve al dialog; Tab/Shift+Tab ciclan dentro
 * - Escape cierra el modal
 * - Click en overlay cierra el modal
 * - Al cerrar, devuelve el foco al elemento que lo abrió
 *
 * Requisitos cubiertos: R18.9 (accesibilidad modal)
 */
export function Modal({
  abierto,
  onCerrar,
  titulo,
  etiquetaCerrar = 'Cerrar',
  children,
}: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  // Guardar el elemento que tenía foco antes de abrir el modal
  useEffect(() => {
    if (abierto) {
      triggerRef.current = document.activeElement as HTMLElement;
      // Mover foco al dialog
      requestAnimationFrame(() => {
        dialogRef.current?.focus();
      });
    } else if (triggerRef.current) {
      triggerRef.current.focus();
      triggerRef.current = null;
    }
  }, [abierto]);

  // Cerrar con Escape
  useEffect(() => {
    if (!abierto) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCerrar();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [abierto, onCerrar]);

  // Focus trap
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key !== 'Tab') return;

      const dialog = dialogRef.current;
      if (!dialog) return;

      const focusables = dialog.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );

      if (focusables.length === 0) return;

      const first = focusables[0];
      const last = focusables[focusables.length - 1];

      if (!first || !last) return;

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    },
    [],
  );

  // Click en overlay
  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        onCerrar();
      }
    },
    [onCerrar],
  );

  // Bloquear scroll del body cuando el modal está abierto
  useEffect(() => {
    if (abierto) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [abierto]);

  if (!abierto) return null;

  const tituloId = 'modal-titulo';

  return (
    <div className={styles.overlay} onClick={handleOverlayClick}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        className={styles.dialog}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
      >
        <div className={styles.cabecera}>
          <h2 id={tituloId} className={styles.titulo}>
            {titulo}
          </h2>
          <button
            type="button"
            className={styles.botonCerrar}
            onClick={onCerrar}
            aria-label={etiquetaCerrar}
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
