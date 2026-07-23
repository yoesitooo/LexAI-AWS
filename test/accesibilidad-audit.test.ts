/**
 * Auditoría de accesibilidad transversal (R18)
 *
 * Verifica las propiedades de accesibilidad que pueden comprobarse
 * programáticamente a nivel de tokens y estructura CSS.
 *
 * - Contraste ≥4.5:1 texto normal, ≥3:1 texto grande/UI (R18.1)
 * - prefers-reduced-motion desactiva transiciones (R18.3)
 * - Tamaño mínimo táctil ≥44×44 px (R18.8)
 * - Tokens semánticos: no literales de color en componentes (R16.5)
 * - Radio ≥16px (R16.2)
 *
 * Requisitos: R18.1, R18.2, R18.3, R18.7, R18.8
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// ─── Helper: calcular contraste relativo (WCAG 2.1) ─────────────────────────

function sRGBtoLinear(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function luminance(hex: string): number {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return 0.2126 * sRGBtoLinear(r) + 0.7152 * sRGBtoLinear(g) + 0.0722 * sRGBtoLinear(b);
}

function contrastRatio(hex1: string, hex2: string): number {
  const l1 = luminance(hex1);
  const l2 = luminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

// ─── Valores de tokens extraídos de globals.css ─────────────────────────────

const COLORES = {
  fondo: '#f0f0f0', // --gris-100
  superficie: '#f0f0f0', // --gris-100
  textoPrimario: '#171717', // --gris-900
  textoSecundario: '#525252', // --gris-600
  foco: '#404040', // --gris-700
  acentoCritico: '#b91c1c',
  gris50: '#fafafa',
};

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('Auditoría de accesibilidad — Contraste (R18.1)', () => {
  it('Texto primario vs fondo: contraste ≥ 4.5:1', () => {
    const ratio = contrastRatio(COLORES.textoPrimario, COLORES.fondo);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  it('Texto secundario vs fondo: contraste ≥ 4.5:1', () => {
    const ratio = contrastRatio(COLORES.textoSecundario, COLORES.fondo);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  it('Acento crítico vs superficie: contraste ≥ 4.5:1', () => {
    const ratio = contrastRatio(COLORES.acentoCritico, COLORES.superficie);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  it('Texto claro en botón primario vs acento crítico: contraste ≥ 4.5:1', () => {
    const ratio = contrastRatio(COLORES.gris50, COLORES.acentoCritico);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  it('Foco vs fondo adyacente: contraste ≥ 3:1 (UI)', () => {
    const ratio = contrastRatio(COLORES.foco, COLORES.fondo);
    expect(ratio).toBeGreaterThanOrEqual(3);
  });
});

describe('Auditoría de accesibilidad — Tokens y estructura CSS', () => {
  const globalsPath = path.resolve(__dirname, '../app/globals.css');
  const globalsCSS = fs.readFileSync(globalsPath, 'utf-8');

  it('Define --tactil-minimo como 44px (R18.8)', () => {
    expect(globalsCSS).toContain('--tactil-minimo: 44px');
  });

  it('Define --radio como 16px (R16.2)', () => {
    expect(globalsCSS).toContain('--radio: 16px');
  });

  it('Incluye media query prefers-reduced-motion que desactiva transiciones (R18.3)', () => {
    expect(globalsCSS).toContain('@media (prefers-reduced-motion: reduce)');
    expect(globalsCSS).toContain('transition-duration: 0ms !important');
    expect(globalsCSS).toContain('animation-duration: 0ms !important');
  });

  it('Define :focus-visible global con outline (R18.3)', () => {
    expect(globalsCSS).toContain(':focus-visible');
    expect(globalsCSS).toMatch(/outline:\s*2px solid/);
  });

  it('overflow-x: hidden en html para prevenir scroll horizontal (R18.7)', () => {
    expect(globalsCSS).toContain('overflow-x: hidden');
  });
});

describe('Auditoría de accesibilidad — Componentes sin literales de color (R16.5)', () => {
  const componentCSSFiles = [
    'components/Boton.module.css',
    'components/Input.module.css',
    'components/Tarjeta.module.css',
    'components/BadgeEstado.module.css',
  ];

  componentCSSFiles.forEach((relPath) => {
    it(`${relPath} no contiene colores literales hex (usa solo tokens)`, () => {
      const filePath = path.resolve(__dirname, '..', relPath);
      const content = fs.readFileSync(filePath, 'utf-8');
      // Permitimos hex solo dentro de comentarios o como fallback en var()
      const lines = content.split('\n').filter((line) => !line.trim().startsWith('/*') && !line.trim().startsWith('*'));
      const hexLiterals = lines.filter((line) => {
        // Skip lines that are var() fallbacks
        if (/var\(--[^)]+,\s*#/.test(line)) return false;
        // Match direct hex usage (color: #..., background: #..., border-color: #...)
        return /(?:color|background|border-color|border):\s*#[0-9a-fA-F]{3,8}/i.test(line);
      });
      expect(hexLiterals).toHaveLength(0);
    });
  });
});

describe('Auditoría de accesibilidad — Responsive 320px (R18.7)', () => {
  it('Login CSS incluye media query para pantallas estrechas', () => {
    const loginCSS = fs.readFileSync(
      path.resolve(__dirname, '../app/login/login.module.css'),
      'utf-8',
    );
    expect(loginCSS).toContain('@media (max-width: 480px)');
  });

  it('Configuración CSS incluye media query para pantallas estrechas', () => {
    const configCSS = fs.readFileSync(
      path.resolve(__dirname, '../app/(protected)/configuracion/configuracion.module.css'),
      'utf-8',
    );
    expect(configCSS).toContain('@media (max-width: 480px)');
  });

  it('Kanban CSS incluye media query para pantallas estrechas', () => {
    const kanbanCSS = fs.readFileSync(
      path.resolve(__dirname, '../app/(protected)/kanban.module.css'),
      'utf-8',
    );
    expect(kanbanCSS).toContain('@media (max-width: 480px)');
  });

  it('Modal CSS incluye media query para pantallas estrechas', () => {
    const modalCSS = fs.readFileSync(
      path.resolve(__dirname, '../components/Modal.module.css'),
      'utf-8',
    );
    expect(modalCSS).toContain('@media (max-width: 480px)');
  });

  it('Layout CSS incluye media query para pantallas estrechas', () => {
    const layoutCSS = fs.readFileSync(
      path.resolve(__dirname, '../app/(protected)/layout.module.css'),
      'utf-8',
    );
    expect(layoutCSS).toContain('@media (max-width: 480px)');
  });
});
