"use client";

/**
 * Sidebar — Navegación lateral responsiva de las rutas protegidas.
 *
 * - Escritorio (≥768px): barra lateral fija de 280px, siempre visible.
 * - Móvil (<768px): barra superior con logo y botón de menú (hamburguesa)
 *   que abre un panel lateral deslizable (drawer) con overlay.
 *
 * El drawer se cierra al: pulsar el overlay, pulsar Escape, navegar a otra
 * ruta, o pulsar el botón de cerrar.
 *
 * Contiene: logo, navegación principal (NavPrincipal), módulos en standby
 * (NavStandby) y botón de cierre de sesión (BotonLogout).
 */

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { NavPrincipal } from "./NavPrincipal";
import { NavStandby } from "./NavStandby";
import { BotonLogout } from "./BotonLogout";
import { Logo } from "./Logo";
import styles from "./Sidebar.module.css";

export function Sidebar() {
  const [abierto, setAbierto] = useState(false);
  const pathname = usePathname();

  // Cerrar el drawer al cambiar de ruta.
  useEffect(() => {
    setAbierto(false);
  }, [pathname]);

  // Cerrar con Escape y bloquear scroll del body mientras está abierto.
  useEffect(() => {
    if (!abierto) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAbierto(false);
    };
    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [abierto]);

  return (
    <>
      {/* Barra superior (solo móvil) */}
      <header className={styles.topbar}>
        <button
          type="button"
          className={styles.hamburguesa}
          aria-label="Abrir menú de navegación"
          aria-expanded={abierto}
          aria-controls="sidebar-nav"
          onClick={() => setAbierto(true)}
        >
          <span className={styles.hamburguesaIcono} aria-hidden="true">
            ☰
          </span>
        </button>
        <Logo variant="full" theme="dark" height={28} />
      </header>

      {/* Overlay (solo móvil, al abrir el drawer) */}
      <div
        className={`${styles.overlay} ${abierto ? styles.overlayVisible : ""}`}
        onClick={() => setAbierto(false)}
        aria-hidden="true"
      />

      {/* Barra lateral / drawer */}
      <aside
        id="sidebar-nav"
        className={`${styles.sidebar} ${abierto ? styles.sidebarAbierto : ""}`}
        aria-label="Navegación principal"
        aria-hidden={undefined}
      >
        <div className={styles.marca}>
          <Logo variant="full" theme="dark" height={36} />
          <button
            type="button"
            className={styles.cerrar}
            aria-label="Cerrar menú de navegación"
            onClick={() => setAbierto(false)}
          >
            <span aria-hidden="true">✕</span>
          </button>
        </div>

        <NavPrincipal />

        <NavStandby />

        <div className={styles.pie}>
          <BotonLogout className={styles.logout} />
        </div>
      </aside>
    </>
  );
}

export default Sidebar;
