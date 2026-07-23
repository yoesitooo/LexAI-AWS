import styles from './BadgeEstado.module.css';

/**
 * Estados del proceso en el Kanban.
 * Cada estado se distingue por:
 * - Texto descriptivo
 * - Ícono con significado (aria-label)
 * - Borde/color de token (sin literales)
 */
export type EstadoProceso =
  | 'nuevo'
  | 'en_seguimiento'
  | 'requiere_accion'
  | 'vencido'
  | 'archivado';

export interface BadgeEstadoProps {
  /** Estado del proceso */
  estado: EstadoProceso;
  /** Clase CSS adicional */
  className?: string;
}

/** Configuración visual por estado */
const CONFIG_ESTADO: Record<
  EstadoProceso,
  { etiqueta: string; icono: string; ariaIcono: string }
> = {
  nuevo: {
    etiqueta: 'Nuevo',
    icono: '●',
    ariaIcono: 'Indicador de estado nuevo',
  },
  en_seguimiento: {
    etiqueta: 'En seguimiento',
    icono: '◉',
    ariaIcono: 'Indicador de estado en seguimiento',
  },
  requiere_accion: {
    etiqueta: 'Requiere acción',
    icono: '⚠',
    ariaIcono: 'Indicador de estado requiere acción',
  },
  vencido: {
    etiqueta: 'Vencido',
    icono: '✕',
    ariaIcono: 'Indicador de estado vencido',
  },
  archivado: {
    etiqueta: 'Archivado',
    icono: '▣',
    ariaIcono: 'Indicador de estado archivado',
  },
};

/**
 * Badge de estado accesible del sistema de diseño LexAI.
 *
 * - Distingue estados por texto + ícono + borde/color (R18.2, R18.6).
 * - Cada ícono incluye aria-label con significado.
 * - Consume solo tokens del sistema de diseño.
 * - Objetivo táctil mínimo 44×44 px.
 */
export function BadgeEstado({ estado, className }: BadgeEstadoProps) {
  const { etiqueta, icono, ariaIcono } = CONFIG_ESTADO[estado];

  const clases = [styles.badge, styles[estado], className ?? '']
    .filter(Boolean)
    .join(' ');

  return (
    <span className={clases}>
      <span className={styles.icono} role="img" aria-label={ariaIcono}>
        {icono}
      </span>
      <span className={styles.texto}>{etiqueta}</span>
    </span>
  );
}
