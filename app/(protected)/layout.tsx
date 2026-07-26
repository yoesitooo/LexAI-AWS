/**
 * Layout para rutas protegidas (requieren autenticación).
 *
 * Compone la barra lateral responsiva (Sidebar) y el contenido principal.
 * - Escritorio: barra lateral fija de 280px + contenido.
 * - Móvil: barra superior con menú hamburguesa que abre un drawer.
 *
 * La verificación de sesión y redirección a /login la maneja el middleware
 * (middleware.ts + lib/auth.config.ts) para todas las rutas de este grupo.
 */

import { Sidebar } from "@/components";
import styles from "./layout.module.css";

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={styles.layout}>
      <Sidebar />
      <main className={styles.main}>{children}</main>
    </div>
  );
}
