/**
 * Feature: lexai-mvp, Property 32: Contraste de color conforme a umbral
 * (≥4.5:1 texto normal, ≥3:1 texto grande/UI/foco/logo)
 *
 * Feature: lexai-mvp, Property 34: Jerarquía tipográfica
 * (≥3 niveles con tamaños distintos ordenados)
 *
 * Validates: Requisitos R16.7, R16.8, R17.4, R18.1, R18.3
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import * as fs from "node:fs";
import * as path from "node:path";

// ---------------------------------------------------------------------------
// Helpers: WCAG Contrast Ratio Calculation (W3C relative luminance formula)
// ---------------------------------------------------------------------------

/**
 * Parsea un color hexadecimal (#RRGGBB o #RGB) a componentes [R, G, B] en 0–255.
 */
function parseHex(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16);
    const g = parseInt(clean[1] + clean[1], 16);
    const b = parseInt(clean[2] + clean[2], 16);
    return [r, g, b];
  }
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return [r, g, b];
}

/**
 * Calcula la luminancia relativa según WCAG 2.1
 * https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
 */
function relativeLuminance(hex: string): number {
  const [r, g, b] = parseHex(hex);

  const linearize = (c: number): number => {
    const sRGB = c / 255;
    return sRGB <= 0.03928
      ? sRGB / 12.92
      : Math.pow((sRGB + 0.055) / 1.055, 2.4);
  };

  const rLin = linearize(r);
  const gLin = linearize(g);
  const bLin = linearize(b);

  return 0.2126 * rLin + 0.7152 * gLin + 0.0722 * bLin;
}

/**
 * Calcula la relación de contraste entre dos colores según WCAG 2.1
 * https://www.w3.org/TR/WCAG21/#dfn-contrast-ratio
 */
function contrastRatio(color1: string, color2: string): number {
  const l1 = relativeLuminance(color1);
  const l2 = relativeLuminance(color2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

// ---------------------------------------------------------------------------
// Helpers: Parse tokens from globals.css
// ---------------------------------------------------------------------------

const GLOBALS_CSS_PATH = path.resolve(__dirname, "../../app/globals.css");

function readGlobalsCss(): string {
  return fs.readFileSync(GLOBALS_CSS_PATH, "utf-8");
}

/**
 * Extrae todas las custom properties definidas en :root { ... }
 */
function parseRootTokens(css: string): Map<string, string> {
  const tokens = new Map<string, string>();
  const rootMatch = css.match(/:root\s*\{([^}]+(?:\{[^}]*\}[^}]*)*)\}/s);
  if (!rootMatch) return tokens;

  const rootBlock = rootMatch[1];
  const propRegex = /--([\w-]+)\s*:\s*([^;]+);/g;
  let match: RegExpExecArray | null;
  while ((match = propRegex.exec(rootBlock)) !== null) {
    tokens.set(`--${match[1]}`, match[2].trim());
  }
  return tokens;
}

/**
 * Resuelve un valor de token que puede ser una referencia var(--otro-token)
 * recursivamente hasta obtener un valor literal.
 */
function resolveTokenValue(
  value: string,
  tokens: Map<string, string>,
  depth = 0,
): string {
  if (depth > 10) return value; // evitar recursión infinita

  const varMatch = value.match(/^var\((--[\w-]+)\)$/);
  if (varMatch) {
    const referenced = tokens.get(varMatch[1]);
    if (referenced) {
      return resolveTokenValue(referenced, tokens, depth + 1);
    }
  }
  return value;
}

// ---------------------------------------------------------------------------
// Design tokens: Color palette and typography from the system
// ---------------------------------------------------------------------------

/**
 * Colores de texto/primer plano (foreground) del sistema de diseño.
 * Cada uno indica si es texto normal o grande/UI/foco/logo.
 */
interface ColorPair {
  foreground: string;
  background: string;
  label: string;
  /** Umbral mínimo de contraste requerido */
  minRatio: number;
}

/**
 * Construye los pares de color del sistema desde los tokens definidos.
 * Aplica umbrales WCAG:
 * - 4.5:1 para texto normal (≤18pt regular, ≤14pt negrita)
 * - 3:1 para texto grande (≥18pt o ≥14pt negrita), componentes UI, foco, logo
 */
function buildColorPairs(tokens: Map<string, string>): ColorPair[] {
  const resolve = (tokenName: string): string => {
    const val = tokens.get(tokenName);
    if (!val) return "";
    return resolveTokenValue(val, tokens);
  };

  const fondo = resolve("--fondo"); // #f0f0f0
  const superficie = resolve("--superficie"); // #f0f0f0
  const textoPrimario = resolve("--texto-primario"); // #171717
  const textoSecundario = resolve("--texto-secundario"); // #525252
  const foco = resolve("--foco"); // #404040
  const acentoCritico = resolve("--acento-critico"); // #b91c1c

  const pairs: ColorPair[] = [
    // Texto normal sobre fondo (4.5:1)
    {
      foreground: textoPrimario,
      background: fondo,
      label: "texto-primario sobre fondo",
      minRatio: 4.5,
    },
    {
      foreground: textoSecundario,
      background: fondo,
      label: "texto-secundario sobre fondo",
      minRatio: 4.5,
    },
    // Texto normal sobre superficie (4.5:1)
    {
      foreground: textoPrimario,
      background: superficie,
      label: "texto-primario sobre superficie",
      minRatio: 4.5,
    },
    {
      foreground: textoSecundario,
      background: superficie,
      label: "texto-secundario sobre superficie",
      minRatio: 4.5,
    },
    // Acento crítico (texto grande/títulos/badges) sobre fondo (3:1)
    {
      foreground: acentoCritico,
      background: fondo,
      label: "acento-critico sobre fondo (texto grande/UI)",
      minRatio: 3,
    },
    {
      foreground: acentoCritico,
      background: superficie,
      label: "acento-critico sobre superficie (texto grande/UI)",
      minRatio: 3,
    },
    // Foco sobre fondo adyacente (3:1, R18.3)
    {
      foreground: foco,
      background: fondo,
      label: "foco sobre fondo (indicador UI)",
      minRatio: 3,
    },
    {
      foreground: foco,
      background: superficie,
      label: "foco sobre superficie (indicador UI)",
      minRatio: 3,
    },
    // Logo variante oscura sobre fondo claro (3:1, R17.4)
    {
      foreground: textoPrimario,
      background: fondo,
      label: "logo (texto-primario) sobre fondo claro (R17.4)",
      minRatio: 3,
    },
  ];

  return pairs;
}

// ---------------------------------------------------------------------------
// Typography levels from the system
// ---------------------------------------------------------------------------

interface TypographyLevel {
  name: string;
  sizeRem: number;
}

/**
 * Extrae los niveles tipográficos definidos en los tokens.
 */
function getTypographyLevels(tokens: Map<string, string>): TypographyLevel[] {
  const levels: TypographyLevel[] = [];

  const fontTokens = [
    { name: "título", tokenName: "--fuente-titulo-tam" },
    { name: "subtítulo", tokenName: "--fuente-subtitulo-tam" },
    { name: "cuerpo", tokenName: "--fuente-cuerpo-tam" },
    { name: "leyenda", tokenName: "--fuente-leyenda-tam" },
  ];

  for (const { name, tokenName } of fontTokens) {
    const value = tokens.get(tokenName);
    if (value) {
      const remMatch = value.match(/^([\d.]+)rem$/);
      if (remMatch) {
        levels.push({ name, sizeRem: parseFloat(remMatch[1]) });
      }
    }
  }

  return levels;
}

// ---------------------------------------------------------------------------
// Tests de propiedad (fast-check)
// ---------------------------------------------------------------------------

describe("Property 32: Contraste de color conforme a umbral (≥4.5:1 texto normal, ≥3:1 texto grande/UI/foco/logo)", () => {
  const css = readGlobalsCss();
  const tokens = parseRootTokens(css);
  const colorPairs = buildColorPairs(tokens);

  it("todos los pares foreground/background cumplen el umbral WCAG de contraste aplicable", () => {
    expect(colorPairs.length).toBeGreaterThan(0);

    fc.assert(
      fc.property(
        fc.constantFrom(...colorPairs),
        (pair) => {
          const ratio = contrastRatio(pair.foreground, pair.background);
          expect(
            ratio,
            `${pair.label}: contraste ${ratio.toFixed(2)}:1 < umbral ${pair.minRatio}:1 ` +
              `(fg=${pair.foreground}, bg=${pair.background})`,
          ).toBeGreaterThanOrEqual(pair.minRatio);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("el contraste se calcula correctamente con la fórmula WCAG de luminancia relativa", () => {
    // Propiedad: para cualquier par de colores del sistema, la función de contraste
    // cumple la propiedad de simetría: contrast(A, B) === contrast(B, A)
    // y siempre produce un valor ≥ 1
    fc.assert(
      fc.property(
        fc.constantFrom(...colorPairs),
        (pair) => {
          const ratioAB = contrastRatio(pair.foreground, pair.background);
          const ratioBA = contrastRatio(pair.background, pair.foreground);

          // Simetría del cálculo de contraste
          expect(Math.abs(ratioAB - ratioBA)).toBeLessThan(0.001);
          // Contraste mínimo es siempre ≥1
          expect(ratioAB).toBeGreaterThanOrEqual(1);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("para cualquier combinación arbitraria de colores de la paleta del sistema, el contraste fg/bg cumple umbrales", () => {
    // Colores definidos en la paleta del sistema
    const paletteColors = [
      { hex: "#171717", role: "texto-primario", isText: true, isLargeText: false },
      { hex: "#525252", role: "texto-secundario", isText: true, isLargeText: false },
      { hex: "#f0f0f0", role: "fondo/superficie", isText: false, isLargeText: false },
      { hex: "#404040", role: "foco", isText: false, isLargeText: false },
      { hex: "#b91c1c", role: "acento-critico", isText: false, isLargeText: true },
    ];

    // Colores que se usan como foreground (texto o indicadores UI)
    const foregrounds = paletteColors.filter(
      (c) => c.role === "texto-primario" || c.role === "texto-secundario" ||
             c.role === "foco" || c.role === "acento-critico",
    );
    // Colores que se usan como background
    const backgrounds = paletteColors.filter(
      (c) => c.role === "fondo/superficie",
    );

    // Generar todos los pares válidos fg/bg del sistema
    const systemPairs: { fg: typeof foregrounds[0]; bg: typeof backgrounds[0] }[] = [];
    for (const fg of foregrounds) {
      for (const bg of backgrounds) {
        systemPairs.push({ fg, bg });
      }
    }

    fc.assert(
      fc.property(
        fc.constantFrom(...systemPairs),
        ({ fg, bg }) => {
          const ratio = contrastRatio(fg.hex, bg.hex);
          // Texto normal necesita ≥4.5:1; texto grande/UI/foco necesita ≥3:1
          const threshold = fg.isText ? 4.5 : 3;
          expect(
            ratio,
            `${fg.role} (${fg.hex}) sobre ${bg.role} (${bg.hex}): ` +
              `contraste ${ratio.toFixed(2)}:1 < umbral ${threshold}:1`,
          ).toBeGreaterThanOrEqual(threshold);
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe("Property 34: Jerarquía tipográfica (≥3 niveles con tamaños distintos ordenados)", () => {
  const css = readGlobalsCss();
  const tokens = parseRootTokens(css);
  const typographyLevels = getTypographyLevels(tokens);

  it("existen al menos 3 niveles tipográficos definidos", () => {
    fc.assert(
      fc.property(
        fc.constant(typographyLevels),
        (levels) => {
          expect(
            levels.length,
            `Se encontraron solo ${levels.length} niveles tipográficos (mínimo requerido: 3)`,
          ).toBeGreaterThanOrEqual(3);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("todos los tamaños tipográficos son distintos entre sí", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(
          ...typographyLevels.flatMap((level, i) =>
            typographyLevels.slice(i + 1).map((other) => ({ a: level, b: other })),
          ),
        ),
        ({ a, b }) => {
          expect(
            a.sizeRem,
            `Los niveles "${a.name}" (${a.sizeRem}rem) y "${b.name}" (${b.sizeRem}rem) tienen el mismo tamaño`,
          ).not.toBe(b.sizeRem);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("los tamaños tipográficos están ordenados de mayor a menor (título > subtítulo > cuerpo)", () => {
    // Los primeros 3 niveles (título, subtítulo, cuerpo) deben estar en orden descendente
    fc.assert(
      fc.property(
        fc.constantFrom(
          ...typographyLevels
            .slice(0, -1)
            .map((level, i) => ({ current: level, next: typographyLevels[i + 1] })),
        ),
        ({ current, next }) => {
          expect(
            current.sizeRem,
            `"${current.name}" (${current.sizeRem}rem) debería ser mayor que "${next.name}" (${next.sizeRem}rem)`,
          ).toBeGreaterThan(next.sizeRem);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("cada nivel tipográfico tiene un tamaño positivo mayor a 0", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...typographyLevels),
        (level) => {
          expect(
            level.sizeRem,
            `El nivel "${level.name}" tiene tamaño ${level.sizeRem}rem (debe ser > 0)`,
          ).toBeGreaterThan(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("los niveles título, subtítulo y cuerpo están presentes con los nombres esperados", () => {
    const expectedLevels = ["título", "subtítulo", "cuerpo"];

    fc.assert(
      fc.property(
        fc.constantFrom(...expectedLevels),
        (expectedName) => {
          const found = typographyLevels.find((l) => l.name === expectedName);
          expect(
            found,
            `No se encontró el nivel tipográfico "${expectedName}"`,
          ).toBeDefined();
        },
      ),
      { numRuns: 100 },
    );
  });
});
