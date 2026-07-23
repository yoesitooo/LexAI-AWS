/**
 * Feature: lexai-mvp, Property 33: Invariantes de tokens del sistema de diseño
 * (radio ≥16px, espaciados múltiplos de 8, transiciones 200–300ms, acento solo
 * en estados críticos, colores por token semántico)
 *
 * Validates: Requisitos R16.2, R16.3, R16.4, R16.5
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import * as fs from "node:fs";
import * as path from "node:path";

// ---------------------------------------------------------------------------
// Helpers: Parse globals.css tokens
// ---------------------------------------------------------------------------

const GLOBALS_CSS_PATH = path.resolve(__dirname, "../../app/globals.css");
const COMPONENTS_DIR = path.resolve(__dirname, "../../components");

function readGlobalsCss(): string {
  return fs.readFileSync(GLOBALS_CSS_PATH, "utf-8");
}

/**
 * Extrae todas las custom properties definidas en :root { ... }
 * Retorna un mapa token -> valor (string)
 */
function parseRootTokens(css: string): Map<string, string> {
  const tokens = new Map<string, string>();
  // Match :root block(s)
  const rootMatch = css.match(/:root\s*\{([^}]+(?:\{[^}]*\}[^}]*)*)\}/s);
  if (!rootMatch) return tokens;

  const rootBlock = rootMatch[1];
  // Match each --property: value;
  const propRegex = /--([\w-]+)\s*:\s*([^;]+);/g;
  let match: RegExpExecArray | null;
  while ((match = propRegex.exec(rootBlock)) !== null) {
    tokens.set(`--${match[1]}`, match[2].trim());
  }
  return tokens;
}

/**
 * Extrae valores numéricos en px de los tokens de espaciado
 */
function getSpacingTokens(
  tokens: Map<string, string>,
): { name: string; value: number }[] {
  const spacings: { name: string; value: number }[] = [];
  for (const [name, value] of tokens) {
    if (name.startsWith("--espacio-")) {
      const pxMatch = value.match(/^(\d+)px$/);
      if (pxMatch) {
        spacings.push({ name, value: parseInt(pxMatch[1], 10) });
      }
    }
  }
  return spacings;
}

/**
 * Extrae valores numéricos en ms de los tokens de transición
 */
function getTransitionTokens(
  tokens: Map<string, string>,
): { name: string; durationMs: number }[] {
  const transitions: { name: string; durationMs: number }[] = [];
  for (const [name, value] of tokens) {
    if (name.startsWith("--transicion-")) {
      const msMatch = value.match(/^(\d+)ms/);
      if (msMatch) {
        transitions.push({ name, durationMs: parseInt(msMatch[1], 10) });
      }
    }
  }
  return transitions;
}

/**
 * Extrae valores numéricos en px de los tokens de radio
 */
function getRadiusTokens(
  tokens: Map<string, string>,
): { name: string; value: number }[] {
  const radii: { name: string; value: number }[] = [];
  for (const [name, value] of tokens) {
    if (name.startsWith("--radio")) {
      const pxMatch = value.match(/^(\d+)px$/);
      if (pxMatch) {
        radii.push({ name, value: parseInt(pxMatch[1], 10) });
      }
    }
  }
  return radii;
}

/**
 * Lee todos los archivos .module.css del directorio de componentes
 */
function getComponentCssFiles(): { name: string; content: string }[] {
  const files = fs.readdirSync(COMPONENTS_DIR);
  return files
    .filter((f) => f.endsWith(".module.css"))
    .map((f) => ({
      name: f,
      content: fs.readFileSync(path.join(COMPONENTS_DIR, f), "utf-8"),
    }));
}

// ---------------------------------------------------------------------------
// Tests de propiedad (fast-check) — Invariantes del sistema de diseño
// ---------------------------------------------------------------------------

describe("Property 33: Invariantes de tokens del sistema de diseño", () => {
  const css = readGlobalsCss();
  const tokens = parseRootTokens(css);
  const spacings = getSpacingTokens(tokens);
  const transitions = getTransitionTokens(tokens);
  const radii = getRadiusTokens(tokens);
  const componentFiles = getComponentCssFiles();

  // -------------------------------------------------------------------------
  // Propiedad 1: Todos los tokens de espaciado son múltiplos de 8
  // -------------------------------------------------------------------------
  it("todos los tokens --espacio-* son múltiplos de 8px", () => {
    expect(spacings.length).toBeGreaterThan(0);

    fc.assert(
      fc.property(
        fc.constantFrom(...spacings),
        (spacing) => {
          expect(
            spacing.value % 8,
            `${spacing.name} = ${spacing.value}px no es múltiplo de 8`,
          ).toBe(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  // -------------------------------------------------------------------------
  // Propiedad 2: Las duraciones de transición están entre 200ms y 300ms
  // -------------------------------------------------------------------------
  it("todos los tokens --transicion-* tienen duración entre 200ms y 300ms", () => {
    expect(transitions.length).toBeGreaterThan(0);

    fc.assert(
      fc.property(
        fc.constantFrom(...transitions),
        (transition) => {
          expect(
            transition.durationMs,
            `${transition.name} = ${transition.durationMs}ms fuera del rango [200, 300]`,
          ).toBeGreaterThanOrEqual(200);
          expect(
            transition.durationMs,
            `${transition.name} = ${transition.durationMs}ms fuera del rango [200, 300]`,
          ).toBeLessThanOrEqual(300);
        },
      ),
      { numRuns: 100 },
    );
  });

  // -------------------------------------------------------------------------
  // Propiedad 3: El radio principal (--radio) es ≥16px
  // -------------------------------------------------------------------------
  it("el token --radio principal es ≥16px", () => {
    const mainRadius = radii.find((r) => r.name === "--radio");
    expect(mainRadius).toBeDefined();
    expect(mainRadius!.value).toBeGreaterThanOrEqual(16);

    // Verificar con fast-check sobre todos los radii definidos en px
    fc.assert(
      fc.property(
        fc.constantFrom(...radii),
        (radius) => {
          // --radio-sm (8px) y --radio-full (9999px) son variantes especiales
          // El requisito R16.2 establece radio ≥16px para el radio uniforme principal
          if (radius.name === "--radio") {
            expect(
              radius.value,
              `${radius.name} = ${radius.value}px debe ser ≥16`,
            ).toBeGreaterThanOrEqual(16);
          }
          // Todos los radii deben ser valores positivos
          expect(radius.value).toBeGreaterThan(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  // -------------------------------------------------------------------------
  // Propiedad 4: El color de acento (--acento-critico) se usa solo en
  // estados críticos en los componentes (Vencido, botón primario, error,
  // campo obligatorio, alerta)
  // -------------------------------------------------------------------------
  it("--acento-critico se aplica solo a selectores de estados críticos en componentes", () => {
    expect(componentFiles.length).toBeGreaterThan(0);

    // Selectores permitidos para usar --acento-critico (R16.4):
    // Contextos funcionales críticos que requieren atención del usuario:
    // - .vencido (estado crítico de proceso)
    // - .primario (botón primario = acción principal)
    // - .critico / .error / .campoError (estados de error/validación)
    // - .obligatorio (indicador de campo requerido = acción obligatoria)
    // - .alerta (alertas urgentes)
    const allowedContextPatterns = [
      /\.vencido/,
      /\.primario/,
      /\.critico/,
      /\.error/,
      /\.campoError/,
      /\.obligatorio/,
      /\.alerta/,
    ];

    fc.assert(
      fc.property(
        fc.constantFrom(...componentFiles),
        (file) => {
          const lines = file.content.split("\n");
          let currentSelector = "";

          for (const line of lines) {
            // Track current selector (handles compound selectors)
            const selectorMatch = line.match(/^(\.[a-zA-Z_][\w]*)/);
            if (selectorMatch) {
              currentSelector = selectorMatch[1];
            }

            // Check if this line uses --acento-critico or --rojo-critico*
            if (
              line.includes("var(--acento-critico)") ||
              line.includes("var(--rojo-critico")
            ) {
              const isAllowed = allowedContextPatterns.some((pattern) =>
                pattern.test(currentSelector),
              );
              expect(
                isAllowed,
                `${file.name}: el acento crítico se usa en el selector "${currentSelector}" que no corresponde a un estado crítico`,
              ).toBe(true);
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  // -------------------------------------------------------------------------
  // Propiedad 5: Los componentes usan tokens semánticos (no valores
  // literales de color como #hex, rgb(), hsl()) en propiedades de color.
  // Se permiten: var(--token, fallback) (el token es primario, el fallback
  // es mecanismo CSS de seguridad), y rgba/overlay en contextos estructurales.
  // -------------------------------------------------------------------------
  it("los archivos CSS de componentes no contienen literales de color independientes (usan tokens semánticos)", () => {
    expect(componentFiles.length).toBeGreaterThan(0);

    // Patrón para detectar literales de color DIRECTOS (sin var()) en propiedades de color
    // Excluye: var(--token, #fallback) que sí usa el token system
    // Excluye: rgba() en propiedades no-color como box-shadow
    const colorPropertyPattern =
      /^\s*(?:color|background-color|border-color)\s*:/;

    fc.assert(
      fc.property(
        fc.constantFrom(...componentFiles),
        (file) => {
          const lines = file.content.split("\n");
          for (const line of lines) {
            // Ignorar comentarios
            if (
              line.trim().startsWith("/*") ||
              line.trim().startsWith("*") ||
              line.trim().startsWith("//")
            ) {
              continue;
            }

            // Solo verificar líneas que son declaraciones de propiedades de color
            if (!colorPropertyPattern.test(line)) {
              continue;
            }

            // Permitir si usa var() (incluye fallbacks como var(--token, #hex))
            if (line.includes("var(")) {
              continue;
            }

            // Permitir "none", "transparent", "inherit", "currentColor"
            if (/:\s*(?:none|transparent|inherit|currentColor|unset)\s*;/.test(line)) {
              continue;
            }

            // Detectar literales de color directos sin var()
            const hasRawColor =
              /#[0-9a-fA-F]{3,8}/.test(line) ||
              /rgb[a]?\(/.test(line) ||
              /hsl[a]?\(/.test(line);

            expect(
              hasRawColor,
              `${file.name}: contiene un literal de color sin token en: "${line.trim()}"`,
            ).toBe(false);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
