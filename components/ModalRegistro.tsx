'use client';

import { useState, useCallback, type FormEvent } from 'react';
import { Modal } from './Modal';
import { Input } from './Input';
import { Boton } from './Boton';
import { t } from '@/lib/i18n';
import styles from './ModalRegistro.module.css';

export interface ModalRegistroProps {
  /** Si el modal está visible */
  abierto: boolean;
  /** Callback para cerrar el modal */
  onCerrar: () => void;
  /** Callback invocado tras registrar exitosamente (para refrescar datos) */
  onRegistroExitoso?: () => void;
}

/**
 * Modal de registro de proceso (consume POST /api/procesos).
 *
 * - Campo único: radicado de 23 dígitos
 * - Validación inline: exactamente 23 dígitos numéricos
 * - Accesible: usa Modal base con focus trap, Escape, aria-modal
 *
 * Requisitos cubiertos: R5, R18.9
 */
export function ModalRegistro({ abierto, onCerrar, onRegistroExitoso }: ModalRegistroProps) {
  const [radicado, setRadicado] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  const resetear = useCallback(() => {
    setRadicado('');
    setError(null);
    setErrorGeneral(null);
    setExito(null);
    setCargando(false);
  }, []);

  const handleCerrar = useCallback(() => {
    resetear();
    onCerrar();
  }, [onCerrar, resetear]);

  const validarRadicado = (valor: string): string | null => {
    if (!valor.trim()) {
      return t('proceso.registrar.error_formato');
    }
    if (!/^\d{23}$/.test(valor.trim())) {
      return t('proceso.registrar.error_formato');
    }
    return null;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setErrorGeneral(null);
    setExito(null);

    // Validación inline
    const errorValidacion = validarRadicado(radicado);
    if (errorValidacion) {
      setError(errorValidacion);
      return;
    }

    setCargando(true);

    try {
      const res = await fetch('/api/procesos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ radicado: radicado.trim() }),
      });

      const data = await res.json().catch(() => null);

      if (res.ok) {
        setExito(t('proceso.registrar.exito'));
        setRadicado('');
        onRegistroExitoso?.();
      } else {
        // Manejar errores específicos de la API
        if (res.status === 409) {
          setErrorGeneral(t('proceso.registrar.error_duplicado'));
        } else if (res.status === 404) {
          setErrorGeneral(t('proceso.registrar.error_no_encontrado'));
        } else if (res.status === 503) {
          setErrorGeneral(t('proceso.registrar.error_fuente'));
        } else {
          setErrorGeneral(data?.error ?? t('error.generico'));
        }
      }
    } catch {
      setErrorGeneral(t('error.generico'));
    } finally {
      setCargando(false);
    }
  };

  return (
    <Modal
      abierto={abierto}
      onCerrar={handleCerrar}
      titulo={t('proceso.registrar.titulo')}
    >
      <form
        className={styles.formulario}
        onSubmit={handleSubmit}
        noValidate
      >
        <Input
          etiqueta={t('proceso.registrar.titulo')}
          placeholder={t('proceso.registrar.radicado_placeholder')}
          value={radicado}
          onChange={(e) => {
            setRadicado(e.target.value);
            if (error) setError(null);
            if (exito) setExito(null);
          }}
          error={error ?? undefined}
          obligatorio
          maxLength={23}
          inputMode="numeric"
          pattern="\d{23}"
          autoComplete="off"
        />

        {errorGeneral && (
          <p className={styles.errorGeneral} role="alert">
            {errorGeneral}
          </p>
        )}

        {exito && (
          <p className={styles.exito} role="status">
            {exito}
          </p>
        )}

        <div className={styles.acciones}>
          <Boton
            type="button"
            variante="secundario"
            onClick={handleCerrar}
            disabled={cargando}
          >
            Cerrar
          </Boton>
          <Boton
            type="submit"
            variante="primario"
            cargando={cargando}
          >
            {t('proceso.registrar.boton')}
          </Boton>
        </div>
      </form>
    </Modal>
  );
}
