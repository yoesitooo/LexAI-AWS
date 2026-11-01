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
import { DemoBanner } from "@/components/DemoBanner";
import { ModoDemoProvider } from "@/components/ModoDemo";
import { esModoDemo } from "@/lib/demo";
import styles from "./layout.module.css";

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  return (
    <ModoDemoProvider activo={esModoDemo()}>
      <div className={styles.layout}>
        <Sidebar />
        <main className={styles.main}>
          {esModoDemo() && <DemoBanner />}
          {children}
        </main>
      </div>
    </ModoDemoProvider>
  );
}
