"use client";

/**
 * Sidebar — Navegación lateral responsiva de las rutas protegidas.
 *
 * - Escritorio (>=768px): barra lateral fija de 280px. Se puede contraer a una
 *   barra angosta que muestra solo iconos (con tooltips). El estado se recuerda
 *   en localStorage.
 * - Móvil (<768px): barra superior con logo y botón de menú (hamburguesa) que
 *   abre un panel lateral deslizable (drawer) con overlay.
 *
 * Orden de navegación:
 *   1. Mis procesos
 *   2. Kanban de tutelas (próximamente)
 *   3. Redacción de demandas/tutelas con IA (próximamente)
 *   ... (empujado al fondo)
 *   4. Notificaciones
 *   5. Configuración
 *   6. Cerrar sesión
 */

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { Logo } from "./Logo";
import { t } from "@/lib/i18n";
import styles from "./Sidebar.module.css";

const STORAGE_KEY = "lexai_sidebar_colapsado";

// ─── Iconos (monocromáticos, heredan currentColor) ──────────────────────────

function Svg({ children }: { children: ReactNode }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

const IconoProcesos = (
  <Svg>
    <rect x="3" y="4" width="5" height="16" rx="1" />
    <rect x="10" y="4" width="5" height="10" rx="1" />
    <rect x="17" y="4" width="4" height="13" rx="1" />
  </Svg>
);

const IconoTutelas = (
  <Svg>
    <path d="M12 3l7 3v5c0 4.5-3 7.6-7 9-4-1.4-7-4.5-7-9V6l7-3z" />
  </Svg>
);

const IconoRedaccion = (
  <Svg>
    <path d="M4 20h4L18 10l-4-4L4 16v4z" />
    <path d="M13.5 6.5l4 4" />
  </Svg>
);

const IconoNotificaciones = (
  <Svg>
    <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9z" />
    <path d="M13.7 21a2 2 0 0 1-3.4 0" />
  </Svg>
);

const IconoConfiguracion = (
  <Svg>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </Svg>
);

const IconoLogout = (
  <Svg>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <path d="M16 17l5-5-5-5" />
    <path d="M21 12H9" />
  </Svg>
);

// ─── Ítem de navegación (enlace activo) ─────────────────────────────────────

function ItemLink({
  href,
  label,
  icono,
  activo,
  colapsado,
}: {
  href: string;
  label: string;
  icono: ReactNode;
  activo: boolean;
  colapsado: boolean;
}) {
  return (
    <Link
      href={href}
      className={`${styles.item} ${activo ? styles.itemActivo : ""}`}
      aria-current={activo ? "page" : undefined}
      title={colapsado ? label : undefined}
      aria-label={colapsado ? label : undefined}
    >
      <span className={styles.itemIcono}>{icono}</span>
      <span className={styles.itemTexto}>{label}</span>
    </Link>
  );
}

// ─── Ítem de módulo en standby (deshabilitado, "Próximamente") ──────────────

function ItemStandby({
  label,
  icono,
  colapsado,
}: {
  label: string;
  icono: ReactNode;
  colapsado: boolean;
}) {
  const proximamente = t("standby.proximamente");
  return (
    <div
      className={`${styles.item} ${styles.itemStandby}`}
      role="menuitem"
      aria-disabled="true"
      tabIndex={0}
      title={colapsado ? `${label} — ${proximamente}` : undefined}
      aria-label={colapsado ? `${label} (${proximamente})` : undefined}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") e.preventDefault();
      }}
    >
      <span className={styles.itemIcono}>{icono}</span>
      <span className={styles.itemContenido}>
        <span className={styles.itemTexto}>{label}</span>
        <span className={styles.badge}>{proximamente}</span>
      </span>
    </div>
  );
}

// ─── Sidebar ─────────────────────────────────────────────────────────────────

export function Sidebar() {
  const [abierto, setAbierto] = useState(false);
  const [colapsado, setColapsado] = useState(false);
  const pathname = usePathname();

  // Recuperar preferencia de colapso (solo escritorio).
  useEffect(() => {
    try {
      setColapsado(localStorage.getItem(STORAGE_KEY) === "1");
    } catch {
      /* localStorage no disponible */
    }
  }, []);

  const toggleColapsado = () => {
    setColapsado((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        /* noop */
      }
      return next;
    });
  };

  // Cerrar el drawer al cambiar de ruta.
  useEffect(() => {
    setAbierto(false);
  }, [pathname]);

  // Cerrar con Escape y bloquear scroll del body mientras el drawer está abierto.
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

  const esActivo = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  const handleLogout = () => {
    void signOut({ redirectTo: "/login" });
  };

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
        className={`${styles.sidebar} ${abierto ? styles.sidebarAbierto : ""} ${
          colapsado ? styles.sidebarColapsado : ""
        }`}
        aria-label="Navegación principal"
      >
        <div className={styles.marca}>
          <Logo
            variant={colapsado ? "icon" : "full"}
            theme="dark"
            height={colapsado ? 28 : 36}
          />

          {/* Toggle de colapso (solo escritorio) */}
          <button
            type="button"
            className={styles.toggle}
            aria-label={
              colapsado ? "Expandir menú lateral" : "Contraer menú lateral"
            }
            aria-pressed={colapsado}
            onClick={toggleColapsado}
          >
            <Svg>
              {colapsado ? (
                <polyline points="9 18 15 12 9 6" />
              ) : (
                <polyline points="15 18 9 12 15 6" />
              )}
            </Svg>
          </button>

          {/* Cerrar (solo drawer móvil) */}
          <button
            type="button"
            className={styles.cerrar}
            aria-label="Cerrar menú de navegación"
            onClick={() => setAbierto(false)}
          >
            <span aria-hidden="true">✕</span>
          </button>
        </div>

        {/* Grupo superior */}
        <nav className={styles.nav} aria-label="Módulos">
          <ItemLink
            href="/tablero"
            label={t("nav.mis_procesos")}
            icono={IconoProcesos}
            activo={esActivo("/tablero")}
            colapsado={colapsado}
          />
          <ItemStandby
            label={t("standby.tutelas")}
            icono={IconoTutelas}
            colapsado={colapsado}
          />
          <ItemStandby
            label={t("standby.redaccion_ia")}
            icono={IconoRedaccion}
            colapsado={colapsado}
          />
        </nav>

        {/* Grupo inferior (empujado al fondo) */}
        <div className={styles.grupoInferior}>
          <nav className={styles.nav} aria-label="Cuenta">
            <ItemLink
              href="/notificaciones"
              label={t("nav.notificaciones")}
              icono={IconoNotificaciones}
              activo={esActivo("/notificaciones")}
              colapsado={colapsado}
            />
            <ItemLink
              href="/configuracion"
              label={t("nav.configuracion")}
              icono={IconoConfiguracion}
              activo={esActivo("/configuracion")}
              colapsado={colapsado}
            />
          </nav>

          <button
            type="button"
            className={`${styles.item} ${styles.logout}`}
            onClick={handleLogout}
            title={colapsado ? t("auth.logout.boton") : undefined}
            aria-label={colapsado ? t("auth.logout.boton") : undefined}
          >
            <span className={styles.itemIcono}>{IconoLogout}</span>
            <span className={styles.itemTexto}>{t("auth.logout.boton")}</span>
          </button>
        </div>
      </aside>
    </>
  );
}

export default Sidebar;
