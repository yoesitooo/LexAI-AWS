"use client";

/**
 * NavStandby — Ítems de navegación para módulos en standby.
 *
 * Muestra los módulos futuros ("Kanban de tutelas" y "Redacción de
 * demandas/tutelas con IA") como ítems visibles pero deshabilitados,
 * con el badge "Próximamente".
 *
 * - No navegan a ninguna pantalla funcional (R13.3)
 * - No ejecutan operaciones sobre datos (R13.3)
 * - No contienen campos, botones ni llamadas a servicios (R13.4)
 * - Visualmente distinguibles como deshabilitados (opacity + cursor)
 *
 * Requisitos: R13.1, R13.2, R13.3, R13.4
 */

import { t } from "@/lib/i18n";
import styles from "./NavStandby.module.css";

export interface NavStandbyProps {
  /** Clase CSS adicional para el contenedor */
  className?: string;
}

/**
 * Módulos en standby con su clave i18n.
 */
const MODULOS_STANDBY = [
  { claveLabel: "standby.tutelas" },
  { claveLabel: "standby.redaccion_ia" },
] as const;

/**
 * Componente de navegación con los placeholders de módulos en standby.
 *
 * Al hacer clic o seleccionar un ítem, no se ejecuta ninguna acción:
 * los ítems usan `aria-disabled="true"` y no tienen onClick handlers
 * funcionales ni enlaces.
 */
export function NavStandby({ className }: NavStandbyProps) {
  return (
    <nav
      className={`${styles.nav}${className ? ` ${className}` : ""}`}
      aria-label="Módulos próximamente"
    >
      {MODULOS_STANDBY.map(({ claveLabel }) => (
        <div
          key={claveLabel}
          className={styles.item}
          role="menuitem"
          aria-disabled="true"
          tabIndex={0}
          onKeyDown={(e) => {
            // Prevent any action on Enter/Space
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
            }
          }}
        >
          <span className={styles.itemTexto}>{t(claveLabel)}</span>
          <span className={styles.badge} aria-label={t("standby.proximamente")}>
            {t("standby.proximamente")}
          </span>
        </div>
      ))}
    </nav>
  );
}

export default NavStandby;
