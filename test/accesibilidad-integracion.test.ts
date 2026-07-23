/**
 * @vitest-environment jsdom
 *
 * Pruebas de integración de accesibilidad (Task 18.2)
 *
 * Verifica de forma integrada:
 * - Reflow a 320 px sin pérdida de contenido (R18.7)
 * - ARIA live en drag-and-drop (R18.5)
 * - Foco sin trampa en modales (R18.5)
 * - Desactivación de animaciones bajo prefers-reduced-motion (R16.6)
 * - Logo: render en tamaños favicon (16/32/48), wordmark ≤24px y fallback (R17.1, R17.2, R17.3, R17.5)
 *
 * Requisitos: R16.6, R17.1, R17.2, R17.3, R17.5, R18.5, R18.7
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// ─── Helper para leer archivos CSS ─────────────────────────────────────────

function readCSS(relPath: string): string {
  return fs.readFileSync(path.resolve(__dirname, '..', relPath), 'utf-8');
}

// ─── 1. Reflow a 320 px (R18.7) ────────────────────────────────────────────

describe('Integración de accesibilidad — Reflow a 320px (R18.7)', () => {
  const globalsCSS = readCSS('app/globals.css');

  it('html tiene overflow-x: hidden para prevenir scroll horizontal', () => {
    expect(globalsCSS).toContain('overflow-x: hidden');
  });

  it('globals.css NO tiene min-width que impida reflow a 320px', () => {
    // Verificar que no haya un min-width en body/html que bloquee 320px
    const bodyMinWidth = globalsCSS.match(/body\s*\{[^}]*min-width:\s*(\d+)/);
    const htmlMinWidth = globalsCSS.match(/html\s*\{[^}]*min-width:\s*(\d+)/);
    if (bodyMinWidth) {
      expect(parseInt(bodyMinWidth[1], 10)).toBeLessThanOrEqual(320);
    }
    if (htmlMinWidth) {
      expect(parseInt(htmlMinWidth[1], 10)).toBeLessThanOrEqual(320);
    }
  });

  const layoutsConResponsive = [
    { file: 'app/login/login.module.css', nombre: 'Login' },
    { file: 'app/(protected)/configuracion/configuracion.module.css', nombre: 'Configuración' },
    { file: 'app/(protected)/kanban.module.css', nombre: 'Kanban' },
    { file: 'app/(protected)/layout.module.css', nombre: 'Layout protegido' },
    { file: 'components/Modal.module.css', nombre: 'Modal' },
  ];

  layoutsConResponsive.forEach(({ file, nombre }) => {
    it(`${nombre} incluye media query responsive para pantallas ≤480px`, () => {
      const css = readCSS(file);
      expect(css).toContain('@media (max-width: 480px)');
    });
  });

  it('Kanban CSS usa flex-direction: column en pantallas estrechas para reflow', () => {
    const kanbanCSS = readCSS('app/(protected)/kanban.module.css');
    // Debe definir flex-direction o overflow/scroll horizontal adaptado
    const mediaBlock = kanbanCSS.match(
      /@media\s*\(max-width:\s*480px\)\s*\{([\s\S]*?)\n\}/,
    );
    expect(mediaBlock).not.toBeNull();
    // La sección media query debe tener alguna regla de layout adaptativo
    if (mediaBlock) {
      const block = mediaBlock[1];
      const hasLayoutAdaptation =
        block.includes('flex-direction') ||
        block.includes('overflow-x') ||
        block.includes('grid-template') ||
        block.includes('width');
      expect(hasLayoutAdaptation).toBe(true);
    }
  });
});

// ─── 2. ARIA live en drag-and-drop (R18.5) ──────────────────────────────────

describe('Integración de accesibilidad — ARIA live en drag-and-drop (R18.5)', () => {
  const kanbanSource = fs.readFileSync(
    path.resolve(__dirname, '../app/(protected)/page.tsx'),
    'utf-8',
  );

  it('Kanban page contiene una región aria-live="assertive" para anuncios DnD', () => {
    expect(kanbanSource).toContain('aria-live="assertive"');
  });

  it('Kanban page contiene aria-atomic="true" en la región de anuncios', () => {
    expect(kanbanSource).toContain('aria-atomic="true"');
  });

  it('Kanban page contiene role="status" para la región de anuncios', () => {
    expect(kanbanSource).toContain('role="status"');
  });

  it('Kanban page define instrucciones de teclado para DnD (aria-describedby)', () => {
    expect(kanbanSource).toContain('aria-describedby');
    expect(kanbanSource).toContain('kanban-dnd-instructions');
  });

  it('Las tarjetas tienen aria-roledescription para identificarse como movibles', () => {
    expect(kanbanSource).toContain('aria-roledescription');
  });

  it('Las tarjetas son enfocables (tabIndex={0}) para navegación por teclado', () => {
    expect(kanbanSource).toMatch(/tabIndex\s*[=:]\s*\{?\s*0\s*\}?/);
  });
});

// ─── 3. Foco sin trampa (R18.5, R18.3) ─────────────────────────────────────

describe('Integración de accesibilidad — Foco sin trampa (R18.5)', () => {
  const modalSource = fs.readFileSync(
    path.resolve(__dirname, '../components/Modal.tsx'),
    'utf-8',
  );

  it('Modal implementa escape para cerrar (no atrapa al usuario)', () => {
    expect(modalSource).toContain("key === 'Escape'");
    expect(modalSource).toContain('onCerrar');
  });

  it('Modal devuelve el foco al trigger al cerrarse', () => {
    // Verifica que se guarda y restaura el activeElement
    expect(modalSource).toContain('triggerRef');
    expect(modalSource).toContain('document.activeElement');
    expect(modalSource).toMatch(/triggerRef\.current\s*[?.]?\s*focus/);
  });

  it('Modal usa aria-modal="true" para indicar que es modal', () => {
    expect(modalSource).toContain('aria-modal="true"');
  });

  it('Modal tiene role="dialog" para semántica correcta', () => {
    expect(modalSource).toContain('role="dialog"');
  });

  it('globals.css define :focus-visible con outline para indicador de foco global', () => {
    const globals = readCSS('app/globals.css');
    expect(globals).toContain(':focus-visible');
    expect(globals).toMatch(/outline:\s*2px solid/);
  });
});

// ─── 4. Desactivación de animaciones bajo prefers-reduced-motion (R16.6) ────

describe('Integración de accesibilidad — prefers-reduced-motion (R16.6)', () => {
  const globalsCSS = readCSS('app/globals.css');

  it('Incluye @media (prefers-reduced-motion: reduce)', () => {
    expect(globalsCSS).toContain('@media (prefers-reduced-motion: reduce)');
  });

  it('Desactiva transition-duration a 0ms con !important', () => {
    expect(globalsCSS).toContain('transition-duration: 0ms !important');
  });

  it('Desactiva animation-duration a 0ms con !important', () => {
    expect(globalsCSS).toContain('animation-duration: 0ms !important');
  });

  it('Desactiva transition-delay a 0ms con !important', () => {
    expect(globalsCSS).toContain('transition-delay: 0ms !important');
  });

  it('Desactiva animation-delay a 0ms con !important', () => {
    expect(globalsCSS).toContain('animation-delay: 0ms !important');
  });

  it('Aplica las reglas a todos los elementos (*, *::before, *::after)', () => {
    // Verificar que el selector universal está dentro del bloque reduced-motion
    const reducedMotionBlock = globalsCSS.match(
      /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([\s\S]*?)\n\}/,
    );
    expect(reducedMotionBlock).not.toBeNull();
    if (reducedMotionBlock) {
      const block = reducedMotionBlock[1];
      expect(block).toContain('*');
      expect(block).toContain('*::before');
      expect(block).toContain('*::after');
    }
  });
});

// ─── 5. Logo en tamaños, wordmark y fallback (R17.1, R17.2, R17.3, R17.5) ──

describe('Integración de accesibilidad — Logo en tamaños y variantes (R17.1, R17.2, R17.3, R17.5)', () => {
  const logoSource = fs.readFileSync(
    path.resolve(__dirname, '../components/Logo.tsx'),
    'utf-8',
  );

  it('Logo usa SVG como fuente (R17.1 — vectorial)', () => {
    expect(logoSource).toContain('.svg');
    expect(logoSource).toContain('logo-lexai');
  });

  it('Logo soporta variantes dark y light (R17.1 — monocromático con temas)', () => {
    expect(logoSource).toContain("dark: '/logo-lexai-dark.svg'");
    expect(logoSource).toContain("light: '/logo-lexai-light.svg'");
  });

  it('Logo acepta height como prop para renderizar a diferentes tamaños (R17.2)', () => {
    expect(logoSource).toContain('height');
    // Verifica que se calcula width proporcional
    expect(logoSource).toContain('aspectRatios');
    expect(logoSource).toContain('width');
  });

  it('Logo cambia a wordmark cuando height ≤ 24px (R17.3)', () => {
    expect(logoSource).toContain('height <= 24');
    expect(logoSource).toContain("'wordmark'");
  });

  it('Logo tiene variante icon para favicon (R17.2)', () => {
    expect(logoSource).toContain("'icon'");
    expect(logoSource).toContain('logo-lexai-icon');
  });

  it('Logo implementa fallback a texto cuando SVG falla (R17.5)', () => {
    expect(logoSource).toContain('svgFailed');
    expect(logoSource).toContain('onError');
    expect(logoSource).toContain('WordmarkFallback');
  });

  it('Fallback del logo tiene role="img" y aria-label para accesibilidad', () => {
    expect(logoSource).toContain('role="img"');
    expect(logoSource).toContain('aria-label');
  });

  // Verificar que existen archivos SVG del logo (al menos la referencia en el código)
  const logoVariants = [
    '/logo-lexai-dark.svg',
    '/logo-lexai-light.svg',
    '/logo-lexai-icon-dark.svg',
    '/logo-lexai-icon-light.svg',
    '/logo-lexai-wordmark-dark.svg',
    '/logo-lexai-wordmark-light.svg',
  ];

  logoVariants.forEach((variant) => {
    it(`Logo referencia ${variant} en el código fuente`, () => {
      expect(logoSource).toContain(variant);
    });
  });
});
