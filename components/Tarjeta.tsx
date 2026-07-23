import { type HTMLAttributes, type ReactNode } from 'react';
import styles from './Tarjeta.module.css';

export interface TarjetaProps extends HTMLAttributes<HTMLDivElement> {
  /** Contenido de la tarjeta */
  children: ReactNode;
  /** Padding compacto (espacio-2) vs. normal (espacio-3) */
  compacta?: boolean;
}

/**
 * Tarjeta (card) base accesible del sistema de diseño LexAI.
 *
 * - Neumorfismo con sombra elevada.
 * - Padding con tokens de espaciado (múltiplos de 8px).
 * - Border radius uniforme.
 */
export function Tarjeta({
  children,
  compacta = false,
  className,
  ...rest
}: TarjetaProps) {
  const clases = [
    styles.tarjeta,
    compacta ? styles.compacta : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={clases} {...rest}>
      {children}
    </div>
  );
}
