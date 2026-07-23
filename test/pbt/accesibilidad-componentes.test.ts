/**
 * Feature: lexai-mvp, Property 35: Distinción accesible de elementos interactivos
 * y estados (borde/color/ícono además del relieve; estados por texto e ícono
 * además del color)
 *
 * Feature: lexai-mvp, Property 36: Etiquetado semántico y alternativas textuales
 * (label por input, alt en íconos con significado)
 *
 * Feature: lexai-mvp, Property 37: Tamaño mínimo de objetivos táctiles (≥44×44 px)
 *
 * Validates: Requisitos R18.2, R18.4, R18.6, R18.8
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import * as fs from "node:fs";
import * as path from "node:path";

// ---------------------------------------------------------------------------
// Helpers: File reading
// ---------------------------------------------------------------------------

const COMPONENTS_DIR = path.resolve(__dirname, "../../components");

function readComponentFile(filename: string): string {
  return fs.readFileSync(path.join(COMPONENTS_DIR, filename), "utf-8");
}

// ---------------------------------------------------------------------------
// Property 35: Distinción accesible de elementos interactivos y estados
// ---------------------------------------------------------------------------

describe("Property 35: Distinción accesible de elementos interactivos y estados (borde/color/ícono además del relieve; estados por texto e ícono además del color)", () => {
  // --- Interactive elements (Boton, Input) must use border/color beyond neumorphic relief ---

  const interactiveComponents = [
    {
      name: "Boton",
      cssFile: "Boton.module.css",
      tsxFile: "Boton.tsx",
    },
    {
      name: "Input",
      cssFile: "Input.module.css",
      tsxFile: "Input.tsx",
    },
  ];

  it("los elementos interactivos (Boton, Input) usan borde explícito además del relieve neumórfico", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...interactiveComponents),
        (component) => {
          const css = readComponentFile(component.cssFile);

          // Verify that the CSS defines an explicit border (not just box-shadow neumorphic)
          const hasBorderProperty = /border:\s*\d+px\s+solid|border-color:\s*var\(/.test(css);

          expect(
            hasBorderProperty,
            `${component.name} debe tener borde explícito (border o border-color) ` +
              `para distinguir interactividad más allá del relieve neumórfico`,
          ).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("los elementos interactivos (Boton, Input) usan color de token semántico (no literal) en el borde", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...interactiveComponents),
        (component) => {
          const css = readComponentFile(component.cssFile);

          // All border-color values should reference CSS custom properties (var(--xxx))
          const borderColorMatches = css.match(/border-color:\s*([^;]+);/g) ?? [];
          const borderMatches = css.match(/border:\s*([^;]+);/g) ?? [];
          const allBorderDeclarations = [...borderColorMatches, ...borderMatches];

          // At least one border declaration exists
          expect(
            allBorderDeclarations.length,
            `${component.name} debe tener al menos una declaración de borde`,
          ).toBeGreaterThan(0);

          // Check that border colors use tokens (var(--...)), 'transparent', or 'currentColor'
          // (currentColor inherits from the text color which is already set via token)
          for (const decl of allBorderDeclarations) {
            const usesTokenOrAllowed =
              /var\(--[\w-]+\)/.test(decl) ||
              /transparent/.test(decl) ||
              /currentColor/.test(decl);
            expect(
              usesTokenOrAllowed,
              `${component.name}: la declaración "${decl.trim()}" debe usar tokens semánticos ` +
                `(var(--xxx)), transparent, o currentColor, no colores literales`,
            ).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  // --- States (BadgeEstado) must use text + icon beyond just color ---

  const ESTADOS_PROCESO = [
    "nuevo",
    "en_seguimiento",
    "requiere_accion",
    "vencido",
    "archivado",
  ] as const;

  it("BadgeEstado distingue cada estado con texto descriptivo además del color", () => {
    const tsx = readComponentFile("BadgeEstado.tsx");

    fc.assert(
      fc.property(
        fc.constantFrom(...ESTADOS_PROCESO),
        (estado) => {
          // Each state should have a text label (etiqueta) defined in CONFIG_ESTADO
          const configRegex = new RegExp(
            `${estado}[^}]*etiqueta:\\s*['"]([^'"]+)['"]`,
            "s",
          );
          const match = tsx.match(configRegex);

          expect(
            match,
            `BadgeEstado debe definir una etiqueta de texto para el estado "${estado}" ` +
              `(R18.6: estados por texto además del color)`,
          ).not.toBeNull();

          // The label should not be empty
          if (match) {
            expect(
              match[1].trim().length,
              `La etiqueta del estado "${estado}" no debe estar vacía`,
            ).toBeGreaterThan(0);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("BadgeEstado incluye un ícono con significado (aria-label) para cada estado", () => {
    const tsx = readComponentFile("BadgeEstado.tsx");

    fc.assert(
      fc.property(
        fc.constantFrom(...ESTADOS_PROCESO),
        (estado) => {
          // Each state should have an icon defined with ariaIcono
          const iconRegex = new RegExp(
            `${estado}[^}]*icono:\\s*['"]([^'"]+)['"]`,
            "s",
          );
          const ariaRegex = new RegExp(
            `${estado}[^}]*ariaIcono:\\s*['"]([^'"]+)['"]`,
            "s",
          );

          const iconMatch = tsx.match(iconRegex);
          const ariaMatch = tsx.match(ariaRegex);

          expect(
            iconMatch,
            `BadgeEstado debe incluir un ícono para el estado "${estado}" ` +
              `(R18.6: estados por ícono además del color)`,
          ).not.toBeNull();

          expect(
            ariaMatch,
            `BadgeEstado debe incluir aria-label (ariaIcono) para el ícono del estado "${estado}" ` +
              `(R18.4: alternativas textuales en íconos con significado)`,
          ).not.toBeNull();

          // aria-label should not be empty
          if (ariaMatch) {
            expect(
              ariaMatch[1].trim().length,
              `El aria-label del ícono del estado "${estado}" no debe estar vacío`,
            ).toBeGreaterThan(0);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("BadgeEstado renderiza el ícono con role='img' y aria-label en el TSX", () => {
    const tsx = readComponentFile("BadgeEstado.tsx");

    fc.assert(
      fc.property(
        fc.constant(tsx),
        (source) => {
          // The rendered icon span should have role="img" and aria-label
          expect(
            source,
            `BadgeEstado debe renderizar el ícono con role="img" para semántica accesible`,
          ).toContain('role="img"');

          expect(
            source,
            `BadgeEstado debe renderizar el ícono con aria-label dinámico`,
          ).toMatch(/aria-label=\{ariaIcono\}/);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("BadgeEstado usa borde diferenciado por estado en el CSS (no solo color de fondo)", () => {
    const css = readComponentFile("BadgeEstado.module.css");

    fc.assert(
      fc.property(
        fc.constantFrom(...ESTADOS_PROCESO),
        (estado) => {
          // Each state should have a border-color defined (using a token)
          const stateBlockRegex = new RegExp(
            `\\.${estado}\\s*\\{([^}]+)\\}`,
            "s",
          );
          const stateBlock = css.match(stateBlockRegex);

          expect(
            stateBlock,
            `BadgeEstado debe tener un bloque CSS para el estado "${estado}"`,
          ).not.toBeNull();

          if (stateBlock) {
            const hasBorderColor = /border-color:\s*var\(--[\w-]+\)/.test(
              stateBlock[1],
            );
            expect(
              hasBorderColor,
              `El estado "${estado}" debe tener border-color con token semántico ` +
                `para distinción accesible más allá del color de fondo`,
            ).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 36: Etiquetado semántico y alternativas textuales
// ---------------------------------------------------------------------------

describe("Property 36: Etiquetado semántico y alternativas textuales (label por input, alt en íconos con significado)", () => {
  it("Input siempre renderiza un <label> con htmlFor vinculado al id del input", () => {
    const tsx = readComponentFile("Input.tsx");

    fc.assert(
      fc.property(
        fc.constant(tsx),
        (source) => {
          // Must have a <label> element with htmlFor attribute
          expect(
            source,
            `Input debe renderizar un elemento <label> con htmlFor`,
          ).toMatch(/htmlFor=\{id\}/);

          // The input must have a matching id attribute
          expect(
            source,
            `Input debe renderizar un <input> con id vinculado al label`,
          ).toMatch(/id=\{id\}/);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("Input genera un id automático si no se provee uno (siempre tiene id)", () => {
    const tsx = readComponentFile("Input.tsx");

    fc.assert(
      fc.property(
        fc.constant(tsx),
        (source) => {
          // Must use useId() or similar mechanism for auto-generated id
          expect(
            source,
            `Input debe generar un id automático con useId() cuando no se provee idCampo`,
          ).toMatch(/useId\(\)/);

          // Must have fallback logic: idCampo ?? autoId
          expect(
            source,
            `Input debe usar idCampo si se provee, o el autoId generado`,
          ).toMatch(/idCampo\s*\?\?\s*autoId/);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("Input exige una etiqueta obligatoria (prop 'etiqueta' requerida en la interfaz)", () => {
    const tsx = readComponentFile("Input.tsx");

    fc.assert(
      fc.property(
        fc.constant(tsx),
        (source) => {
          // The InputProps interface must declare etiqueta as required (no ? mark)
          const etiquetaPropRegex = /etiqueta\s*:\s*string/;
          expect(
            etiquetaPropRegex.test(source),
            `Input debe declarar 'etiqueta: string' como prop obligatoria en InputProps`,
          ).toBe(true);

          // The etiqueta prop should NOT be optional (no ?)
          const optionalEtiquetaRegex = /etiqueta\?\s*:/;
          expect(
            optionalEtiquetaRegex.test(source),
            `'etiqueta' no debe ser opcional en InputProps (R18.4: label por input)`,
          ).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("BadgeEstado incluye aria-label en cada ícono con significado semántico", () => {
    const tsx = readComponentFile("BadgeEstado.tsx");

    fc.assert(
      fc.property(
        fc.constant(tsx),
        (source) => {
          // The icon span must have aria-label for semantic icons
          expect(
            source,
            `BadgeEstado debe incluir aria-label en íconos con significado`,
          ).toMatch(/aria-label=\{ariaIcono\}/);

          // The icon must have role="img" since it conveys meaning
          expect(
            source,
            `BadgeEstado debe usar role="img" en íconos con significado semántico`,
          ).toContain('role="img"');
        },
      ),
      { numRuns: 100 },
    );
  });

  it("Boton marca íconos decorativos con aria-hidden y no requiere alt en ellos", () => {
    const tsx = readComponentFile("Boton.tsx");

    fc.assert(
      fc.property(
        fc.constant(tsx),
        (source) => {
          // The spinner (decorative) must be aria-hidden
          expect(
            source,
            `Boton debe marcar el spinner (decorativo) con aria-hidden="true"`,
          ).toContain('aria-hidden="true"');

          // The component documents that icons must include aria-hidden if decorative
          expect(
            source,
            `Boton debe documentar que el ícono debe incluir aria-hidden si es decorativo`,
          ).toMatch(/aria-hidden/);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("Input vincula mensajes de error con aria-describedby para lectores de pantalla", () => {
    const tsx = readComponentFile("Input.tsx");

    fc.assert(
      fc.property(
        fc.constant(tsx),
        (source) => {
          // Must have aria-describedby linking to error/help messages
          expect(
            source,
            `Input debe usar aria-describedby para vincular mensajes de error/ayuda`,
          ).toMatch(/aria-describedby/);

          // Must have aria-invalid for error state
          expect(
            source,
            `Input debe usar aria-invalid para indicar estado de error`,
          ).toMatch(/aria-invalid/);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 37: Tamaño mínimo de objetivos táctiles (≥44×44 px)
// ---------------------------------------------------------------------------

describe("Property 37: Tamaño mínimo de objetivos táctiles (≥44×44 px)", () => {
  const GLOBALS_CSS_PATH = path.resolve(__dirname, "../../app/globals.css");

  function readGlobalsCss(): string {
    return fs.readFileSync(GLOBALS_CSS_PATH, "utf-8");
  }

  const interactiveComponentsCss = [
    { name: "Boton", file: "Boton.module.css", selector: ".boton" },
    { name: "Input (campo)", file: "Input.module.css", selector: ".campo" },
    {
      name: "BadgeEstado",
      file: "BadgeEstado.module.css",
      selector: ".badge",
    },
  ];

  it("el token --tactil-minimo está definido con valor ≥44px en globals.css", () => {
    const css = readGlobalsCss();

    fc.assert(
      fc.property(
        fc.constant(css),
        (globalsCss) => {
          const tokenMatch = globalsCss.match(
            /--tactil-minimo:\s*(\d+)px/,
          );

          expect(
            tokenMatch,
            `globals.css debe definir --tactil-minimo con valor en px`,
          ).not.toBeNull();

          if (tokenMatch) {
            const value = parseInt(tokenMatch[1], 10);
            expect(
              value,
              `--tactil-minimo debe ser ≥44px (actual: ${value}px)`,
            ).toBeGreaterThanOrEqual(44);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("todos los componentes interactivos usan min-height: var(--tactil-minimo) en su CSS", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...interactiveComponentsCss),
        (component) => {
          const css = readComponentFile(component.file);

          // Must reference --tactil-minimo for min-height
          const hasMinHeight = /min-height:\s*var\(--tactil-minimo\)/.test(css);

          expect(
            hasMinHeight,
            `${component.name} (${component.file}) debe usar ` +
              `min-height: var(--tactil-minimo) para garantizar objetivos táctiles ≥44px`,
          ).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("Boton también define min-width: var(--tactil-minimo) para objetivos cuadrados mínimos", () => {
    const css = readComponentFile("Boton.module.css");

    fc.assert(
      fc.property(
        fc.constant(css),
        (botonCss) => {
          const hasMinWidth = /min-width:\s*var\(--tactil-minimo\)/.test(
            botonCss,
          );

          expect(
            hasMinWidth,
            `Boton debe usar min-width: var(--tactil-minimo) para garantizar ` +
              `objetivo táctil mínimo de 44×44px (ancho y alto)`,
          ).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("ningún componente interactivo sobreescribe min-height con un valor menor al token", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...interactiveComponentsCss),
        (component) => {
          const css = readComponentFile(component.file);

          // Check that no literal min-height with a value < 44px is used
          const literalMinHeights = css.match(
            /min-height:\s*(\d+)px/g,
          ) ?? [];

          for (const match of literalMinHeights) {
            const valueMatch = match.match(/(\d+)px/);
            if (valueMatch) {
              const px = parseInt(valueMatch[1], 10);
              expect(
                px,
                `${component.name}: min-height literal de ${px}px es menor ` +
                  `al mínimo táctil requerido (44px)`,
              ).toBeGreaterThanOrEqual(44);
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("componentes de navegación (NavStandby) también respetan el mínimo táctil", () => {
    const navCssPath = path.join(COMPONENTS_DIR, "NavStandby.module.css");
    const navCssExists = fs.existsSync(navCssPath);

    fc.assert(
      fc.property(
        fc.constant(navCssExists),
        (exists) => {
          if (!exists) return; // skip if component doesn't exist

          const css = fs.readFileSync(navCssPath, "utf-8");
          const hasMinHeight = /min-height:\s*var\(--tactil-minimo\)/.test(css);

          expect(
            hasMinHeight,
            `NavStandby debe usar min-height: var(--tactil-minimo) para ` +
              `garantizar objetivos táctiles accesibles`,
          ).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });
});
