'use client';

/**
 * Límite de error de última instancia — se activa solo si el layout raíz
 * (app/layout.tsx) falla. Reemplaza <html>/<body> por completo, por lo que
 * evita depender de providers, CSS modules o i18n: deben poder fallar sin
 * romper esta pantalla de rescate.
 */

import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error(error);
  }, [error]);

  return (
    <html lang="es-CO">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          backgroundColor: '#f0f0f0',
          color: '#171717',
        }}
      >
        <div style={{ textAlign: 'center', padding: 24, maxWidth: 420 }}>
          <h1 style={{ fontSize: '1.5rem', marginBottom: 12 }}>Algo salió mal</h1>
          <p style={{ marginBottom: 20, color: '#525252' }}>
            Ocurrió un error inesperado al cargar la aplicación. Intente de nuevo.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              minHeight: 44,
              padding: '8px 24px',
              borderRadius: 16,
              border: '2px solid #171717',
              backgroundColor: '#f0f0f0',
              color: '#171717',
              fontSize: '1rem',
              cursor: 'pointer',
            }}
          >
            Reintentar
          </button>
        </div>
      </body>
    </html>
  );
}
