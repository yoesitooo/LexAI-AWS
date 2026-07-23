/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Logo } from './Logo';

describe('Logo component', () => {
  it('renders an img element with default props (full dark, height 48)', () => {
    render(<Logo />);
    const img = screen.getByRole('img', { name: 'LexAI' });
    expect(img).toBeDefined();
    expect(img.getAttribute('src')).toBe('/logo-lexai-dark.svg');
    expect(img.getAttribute('height')).toBe('48');
  });

  it('switches to wordmark variant when height ≤ 24px (R17.3)', () => {
    render(<Logo height={20} variant="full" />);
    const img = screen.getByRole('img', { name: 'LexAI' });
    expect(img.getAttribute('src')).toBe('/logo-lexai-wordmark-dark.svg');
  });

  it('renders light theme variant for dark backgrounds (R17.4)', () => {
    render(<Logo theme="light" />);
    const img = screen.getByRole('img', { name: 'LexAI' });
    expect(img.getAttribute('src')).toBe('/logo-lexai-light.svg');
  });

  it('renders icon variant', () => {
    render(<Logo variant="icon" />);
    const img = screen.getByRole('img', { name: 'LexAI' });
    expect(img.getAttribute('src')).toBe('/logo-lexai-icon-dark.svg');
  });

  it('falls back to text wordmark when SVG fails to load (R17.5)', () => {
    render(<Logo />);
    const img = screen.getByRole('img', { name: 'LexAI' });
    // Simulate image load error
    fireEvent.error(img);
    // After error, should render a span text fallback
    const fallback = screen.getByRole('img', { name: 'LexAI' });
    expect(fallback.tagName.toLowerCase()).toBe('span');
    expect(fallback.textContent).toBe('LexAI');
  });

  it('applies custom className', () => {
    render(<Logo className="custom-class" />);
    const img = screen.getByRole('img', { name: 'LexAI' });
    expect(img.className).toContain('custom-class');
  });

  it('supports custom aria-label', () => {
    render(<Logo aria-label="Logo de LexAI" />);
    const img = screen.getByRole('img', { name: 'Logo de LexAI' });
    expect(img).toBeDefined();
  });

  it('computes correct width based on aspect ratio', () => {
    render(<Logo variant="icon" height={64} />);
    const img = screen.getByRole('img', { name: 'LexAI' });
    // icon is 48x48 → ratio 1:1 → width should be 64
    expect(img.getAttribute('width')).toBe('64');
  });
});
