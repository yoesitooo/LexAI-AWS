"use client";

/**
 * NavPrincipal — Navegación de módulos activos del sidebar.
 *
 * Enlaces a las pantallas funcionales de la Fase 1:
 * - Mis procesos (tablero Kanban) → /tablero
 * - Configuración de notificaciones → /configuracion
 *
 * Resalta el enlace correspondiente a la ruta activa.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { t } from "@/lib/i18n";
import styles from "./NavPrincipal.module.css";

interface ItemNav {
  href: string;
  claveLabel: string;
}

const ITEMS: ItemNav[] = [
  { href: "/tablero", claveLabel: "nav.mis_procesos" },
  { href: "/notificaciones", claveLabel: "nav.notificaciones" },
  { href: "/configuracion", claveLabel: "nav.configuracion" },
];

export interface NavPrincipalProps {
  className?: string;
}

export function NavPrincipal({ className }: NavPrincipalProps) {
  const pathname = usePathname();

  return (
    <nav
      className={`${styles.nav}${className ? ` ${className}` : ""}`}
      aria-label="Navegación principal"
    >
      {ITEMS.map(({ href, claveLabel }) => {
        const activo = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            className={`${styles.item} ${activo ? styles.itemActivo : ""}`}
            aria-current={activo ? "page" : undefined}
          >
            <span className={styles.itemTexto}>{t(claveLabel)}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export default NavPrincipal;
