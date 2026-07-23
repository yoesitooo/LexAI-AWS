/**
 * Layout para rutas protegidas (requieren autenticación).
 *
 * Incluye barra lateral de navegación con:
 * - Título de la app
 * - Placeholders de módulos en standby (R13.1, R13.2, R13.3, R13.4)
 *
 * En una implementación completa, este layout verificaría la sesión
 * y redirigiría a /login si no hay sesión activa (R2.3).
 */

import { NavStandby } from "@/components";
import { t } from "@/lib/i18n";
import styles from "./layout.module.css";

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={styles.layout}>
      <aside className={styles.sidebar} aria-label="Navegación principal">
        <span className={styles.sidebarTitulo}>{t("app.nombre")}</span>
        <NavStandby />
      </aside>
      <main className={styles.main}>{children}</main>
    </div>
  );
}
