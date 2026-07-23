'use client';

/**
 * Botón de cierre de sesión — LexAI MVP
 *
 * Invoca `signOut()` de NextAuth para invalidar la sesión (R2.4).
 * Redirige a /login tras cerrar sesión.
 */

import { signOut } from 'next-auth/react';
import { Boton } from './Boton';
import { t } from '@/lib/i18n';

export interface BotonLogoutProps {
  /** Clase CSS adicional */
  className?: string;
}

export function BotonLogout({ className }: BotonLogoutProps) {
  async function handleLogout() {
    await signOut({ redirectTo: '/login' });
  }

  return (
    <Boton
      variante="secundario"
      onClick={handleLogout}
      className={className}
      aria-label={t('auth.logout.boton')}
    >
      {t('auth.logout.boton')}
    </Boton>
  );
}
