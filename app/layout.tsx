import type { Metadata } from "next";
import { ToastProvider } from "@/components";
import "./globals.css";

const DESCRIPCION =
  "Vigila sus procesos en la Rama Judicial, analiza cada actuación nueva con IA, calcula los plazos en días hábiles colombianos y le avisa antes de que venzan.";

/** URL pública (Vercel la expone en producción); se usa para las vistas previas al compartir. */
const URL_SITIO = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(URL_SITIO),
  title: "LexAI — Trazabilidad Procesal",
  description: DESCRIPCION,
  openGraph: {
    type: "website",
    locale: "es_CO",
    siteName: "LexAI",
    title: "LexAI — Trazabilidad procesal para abogados en Colombia",
    description: DESCRIPCION,
  },
  twitter: {
    card: "summary_large_image",
    title: "LexAI — Trazabilidad procesal para abogados en Colombia",
    description: DESCRIPCION,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-CO">
      <body>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
