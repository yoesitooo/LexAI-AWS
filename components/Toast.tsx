'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import styles from './Toast.module.css';

export type TipoToast = 'error' | 'exito' | 'info';

interface ToastItem {
  id: string;
  mensaje: string;
  tipo: TipoToast;
}

interface ToastContextValue {
  /** Muestra una notificación transitoria en la esquina de la pantalla. */
  mostrarToast: (mensaje: string, tipo?: TipoToast) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const DURACION_MS = 6000;

let contadorId = 0;

/**
 * Proveedor global de notificaciones "toast" (avisos efímeros de error/estado).
 *
 * Distinto del módulo de Notificaciones persistente (/notificaciones, bandeja
 * en BD, componente NotificacionInapp): los toasts no se guardan, no tienen
 * estado leído/no leído y desaparecen solos a los pocos segundos. Se montan
 * una sola vez en app/layout.tsx para estar disponibles en toda la plataforma.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const cerrarToast = useCallback((id: string) => {
    setToasts((actuales) => actuales.filter((toast) => toast.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const mostrarToast = useCallback(
    (mensaje: string, tipo: TipoToast = 'error') => {
      const id = `toast-${++contadorId}`;
      setToasts((actuales) => [...actuales, { id, mensaje, tipo }]);
      const timer = setTimeout(() => cerrarToast(id), DURACION_MS);
      timers.current.set(id, timer);
    },
    [cerrarToast],
  );

  const value = useMemo(() => ({ mostrarToast }), [mostrarToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className={styles.viewport} aria-label="Notificaciones del sistema">
        {toasts.map((toast) => (
          <div key={toast.id} className={`${styles.toast} ${styles[toast.tipo]}`}>
            <p
              className={styles.mensaje}
              role={toast.tipo === 'error' ? 'alert' : 'status'}
            >
              {toast.mensaje}
            </p>
            <button
              type="button"
              className={styles.cerrar}
              onClick={() => cerrarToast(toast.id)}
              aria-label="Cerrar notificación"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/**
 * Hook para disparar notificaciones toast desde cualquier componente cliente.
 * Requiere estar dentro de `<ToastProvider>` (montado en app/layout.tsx).
 */
export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast debe usarse dentro de <ToastProvider>');
  }
  return context;
}
