import { type ButtonHTMLAttributes, type ReactNode } from 'react';
import styles from './Boton.module.css';

export type VarianteBoton = 'primario' | 'secundario' | 'acento';

export interface BotonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Variante visual del botón */
  variante?: VarianteBoton;
  /** Muestra indicador de carga y deshabilita la interacción */
  cargando?: boolean;
  /** Ícono a mostrar antes del texto. Debe incluir aria-hidden si es decorativo. */
  icono?: ReactNode;
  /** Contenido del botón */
  children: ReactNode;
}

/**
 * Botón base accesible del sistema de diseño LexAI.
 *
 * - Neumorfismo con borde/color para distinguir interactividad.
 * - Objetivo táctil mínimo 44×44 px.
 * - Foco visible heredado de globals.css (:focus-visible).
 * - Soporte para variantes primaria/secundaria, carga y deshabilitado.
 */
export function Boton({
  variante = 'primario',
  cargando = false,
  icono,
  children,
  disabled,
  className,
  ...rest
}: BotonProps) {
  const clasesBoton = [
    styles.boton,
    styles[variante],
    cargando ? styles.cargando : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      className={clasesBoton}
      disabled={disabled ?? cargando}
      aria-busy={cargando}
      {...rest}
    >
      {cargando ? (
        <span className={styles.spinner} aria-hidden="true" />
      ) : icono ? (
        <span className={styles.icono}>{icono}</span>
      ) : null}
      {children}
    </button>
  );
}
