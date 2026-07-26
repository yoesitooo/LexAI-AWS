/**
 * Landing pública (/) — LexAI
 *
 * Pantalla de bienvenida para visitantes no autenticados. Presenta la
 * propuesta de valor y un único llamado a la acción: iniciar sesión.
 * (El registro no se ofrece desde la landing en esta fase.)
 *
 * Si el visitante ya tiene una sesión activa, se redirige directamente
 * al tablero (/tablero).
 */

import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Logo } from "@/components/Logo";
import { t } from "@/lib/i18n";
import styles from "./landing.module.css";

export default async function LandingPage() {
  const session = await auth();

  if (session) {
    redirect("/tablero");
  }

  const beneficios = [
    t("landing.beneficio_1"),
    t("landing.beneficio_2"),
    t("landing.beneficio_3"),
  ];

  return (
    <main className={styles.pagina}>
      <div className={styles.contenido}>
        <header className={styles.encabezado}>
          <Logo variant="full" theme="dark" height={56} />
          <p className={styles.subtitulo}>{t("app.subtitulo")}</p>
        </header>

        <h1 className={styles.titular}>{t("landing.titular")}</h1>
        <p className={styles.descripcion}>{t("landing.descripcion")}</p>

        <ul className={styles.beneficios}>
          {beneficios.map((beneficio) => (
            <li key={beneficio} className={styles.beneficio}>
              <span className={styles.beneficioIcono} aria-hidden="true">
                ✓
              </span>
              {beneficio}
            </li>
          ))}
        </ul>

        <div className={styles.acciones}>
          <Link href="/login" className={styles.ctaLogin}>
            {t("landing.cta_login")}
          </Link>
        </div>
      </div>
    </main>
  );
}
