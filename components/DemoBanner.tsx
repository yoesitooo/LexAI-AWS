/**
 * Aviso fijo del modo demo: deja claro que los datos son ficticios y temporales.
 * Se renderiza solo cuando DEMO_MODE=true (lo decide el layout protegido).
 */

import { t } from "@/lib/i18n";
import { HORAS_VIDA_DEMO } from "@/lib/demo";
import styles from "./DemoBanner.module.css";

export function DemoBanner() {
  return (
    <div className={styles.banner} role="status">
      {t("demo.banner", { horas: HORAS_VIDA_DEMO })}
    </div>
  );
}
