'use client';

/**
 * Página de inicio de sesión — LexAI MVP
 *
 * - Autentica credenciales via NextAuth.js (signIn de credenciales).
 * - Redirige al Kanban (/) tras login exitoso en ≤3 s.
 * - Muestra mensaje genérico ante fallo sin revelar qué campo falló (R2.2).
 * - Maneja el caso ACCOUNT_LOCKED con mensaje de bloqueo (R2.5).
 * - Usa componentes del sistema de diseño (Input, Boton, Tarjeta, Logo).
 * - Strings via lib/i18n.
 *
 * Requisitos: R2.1, R2.2, R2.4
 */

import { useState, type FormEvent } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Input, Boton, Tarjeta } from '@/components';
import { Logo } from '@/components/Logo';
import { t } from '@/lib/i18n';
import styles from './login.module.css';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setCargando(true);

    try {
      const resultado = await signIn('credentials', {
        email: email.trim().toLowerCase(),
        password,
        redirect: false,
      });

      if (!resultado) {
        // Unexpected: no response from signIn
        setError(t('auth.login.error_generico'));
        return;
      }

      if (resultado.error) {
        // NextAuth returns the error thrown in authorize()
        if (resultado.error === 'ACCOUNT_LOCKED' || resultado.error.includes('ACCOUNT_LOCKED')) {
          setError(t('auth.login.bloqueo'));
        } else {
          // Generic message — never reveal which field failed (R2.2)
          setError(t('auth.login.error_generico'));
        }
        return;
      }

      // Login successful → redirect to Kanban
      router.push('/');
      router.refresh();
    } catch {
      setError(t('auth.login.error_generico'));
    } finally {
      setCargando(false);
    }
  }

  return (
    <main className={styles.pagina}>
      <div className={styles.contenedor}>
        <header className={styles.encabezado}>
          <Logo variant="full" theme="dark" height={48} />
          <h1 className={styles.titulo}>{t('auth.login.titulo')}</h1>
        </header>

        <Tarjeta>
          <form
            className={styles.formulario}
            onSubmit={handleSubmit}
            noValidate
            aria-label={t('auth.login.titulo')}
          >
            <Input
              etiqueta={t('auth.login.correo')}
              type="email"
              name="email"
              autoComplete="email"
              obligatorio
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={cargando}
            />

            <Input
              etiqueta={t('auth.login.contrasena')}
              type="password"
              name="password"
              autoComplete="current-password"
              obligatorio
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={cargando}
            />

            {error && (
              <p className={styles.error} role="alert" aria-live="assertive">
                {error}
              </p>
            )}

            <div className={styles.botonContenedor}>
              <Boton
                type="submit"
                variante="primario"
                cargando={cargando}
                disabled={!email || !password || cargando}
              >
                {t('auth.login.boton')}
              </Boton>
            </div>
          </form>
        </Tarjeta>
      </div>
    </main>
  );
}
