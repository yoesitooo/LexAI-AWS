'use client';

/**
 * Límite de error de Next.js para el árbol de rutas de la aplicación.
 *
 * Evita que un error de render deje la pantalla en blanco/rota: muestra un
 * estado de reintento y dispara un toast (ver components/Toast.tsx), sin
 * confundirse con el módulo de Notificaciones persistente.
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Boton, Tarjeta, useToast } from '@/components';
import { t } from '@/lib/i18n';
import styles from './error.module.css';

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();
  const { mostrarToast } = useToast();

  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error(error);
    mostrarToast(t('error.pagina.descripcion'), 'error');
  }, [error, mostrarToast]);

  return (
    <main className={styles.contenedor}>
      <Tarjeta className={styles.tarjeta}>
        <h1 className={styles.titulo}>{t('error.pagina.titulo')}</h1>
        <p className={styles.descripcion}>{t('error.pagina.descripcion')}</p>
        <div className={styles.acciones}>
          <Boton variante="primario" onClick={reset}>
            {t('error.pagina.reintentar')}
          </Boton>
          <Boton variante="secundario" onClick={() => router.push('/tablero')}>
            {t('error.pagina.volver_tablero')}
          </Boton>
        </div>
      </Tarjeta>
    </main>
  );
}
