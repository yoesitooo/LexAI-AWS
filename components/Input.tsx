import { type InputHTMLAttributes, useId } from 'react';
import styles from './Input.module.css';

export interface InputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  /** Texto de la etiqueta asociada al input (obligatorio para accesibilidad) */
  etiqueta: string;
  /** Mensaje de error. Si está presente, se muestra en estado de error. */
  error?: string;
  /** Texto de ayuda debajo del campo */
  ayuda?: string;
  /** Marca el campo como obligatorio visualmente con asterisco */
  obligatorio?: boolean;
  /** ID opcional; si no se provee, se genera uno automáticamente */
  idCampo?: string;
}

/**
 * Input base accesible del sistema de diseño LexAI.
 *
 * - Label siempre asociado al input (htmlFor + id).
 * - Neumorfismo inset para el campo, borde para distinguir interactividad.
 * - Objetivo táctil mínimo 44×44 px.
 * - Estado de error con mensaje aria-describedby.
 * - Indicador de campo obligatorio.
 */
export function Input({
  etiqueta,
  error,
  ayuda,
  obligatorio = false,
  idCampo,
  className,
  ...rest
}: InputProps) {
  const autoId = useId();
  const id = idCampo ?? autoId;
  const errorId = `${id}-error`;
  const ayudaId = `${id}-ayuda`;

  const tieneError = Boolean(error);
  const descripcionIds = [
    tieneError ? errorId : null,
    ayuda ? ayudaId : null,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={`${styles.contenedor} ${className ?? ''}`}>
      <label htmlFor={id} className={styles.etiqueta}>
        {etiqueta}
        {obligatorio && (
          <span className={styles.obligatorio} aria-hidden="true">
            {' '}
            *
          </span>
        )}
      </label>

      <input
        id={id}
        className={`${styles.campo} ${tieneError ? styles.campoError : ''}`}
        aria-invalid={tieneError}
        aria-describedby={descripcionIds || undefined}
        aria-required={obligatorio}
        required={obligatorio}
        {...rest}
      />

      {tieneError && (
        <p id={errorId} className={styles.error} role="alert">
          {error}
        </p>
      )}

      {ayuda && !tieneError && (
        <p id={ayudaId} className={styles.ayuda}>
          {ayuda}
        </p>
      )}
    </div>
  );
}
