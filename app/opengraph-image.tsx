/**
 * Imagen de vista previa (Open Graph) — la que aparece al compartir el enlace
 * en WhatsApp, LinkedIn, Slack, etc. Se genera en el build con next/og.
 */

import { ImageResponse } from "next/og";

export const alt = "LexAI — Trazabilidad procesal para abogados en Colombia";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const PASOS = ["Rama Judicial", "Análisis con IA", "Plazo en días hábiles", "Aviso al abogado"];

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          background: "#1f2328",
          color: "#f6f7f8",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 96, fontWeight: 700, letterSpacing: -2 }}>LexAI</div>
          <div style={{ fontSize: 40, marginTop: 12, color: "#c9ced4", maxWidth: 960 }}>
            Trazabilidad procesal para abogados independientes en Colombia
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {PASOS.map((paso, i) => (
            <div key={paso} style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div
                style={{
                  display: "flex",
                  padding: "14px 18px",
                  borderRadius: 14,
                  border: "2px solid #4a525b",
                  background: "#2b3138",
                  fontSize: 24,
                }}
              >
                {paso}
              </div>
              {i < PASOS.length - 1 && <div style={{ fontSize: 26, color: "#8a939c" }}>→</div>}
            </div>
          ))}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 26, color: "#8a939c" }}>
          <div>Demo público · sin registro · datos ficticios</div>
          <div>Next.js · TypeScript · PostgreSQL</div>
        </div>
      </div>
    ),
    size,
  );
}
