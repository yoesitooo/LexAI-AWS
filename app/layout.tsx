import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LexAI — Trazabilidad Procesal",
  description: "Plataforma de trazabilidad procesal para abogados independientes en Colombia",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-CO">
      <body>{children}</body>
    </html>
  );
}
