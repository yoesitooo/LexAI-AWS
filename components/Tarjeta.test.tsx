/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Tarjeta } from './Tarjeta';

describe('Tarjeta', () => {
  it('renderiza contenido hijo', () => {
    render(<Tarjeta>Contenido de la tarjeta</Tarjeta>);
    expect(screen.getByText('Contenido de la tarjeta')).toBeDefined();
  });

  it('aplica clase tarjeta base', () => {
    const { container } = render(<Tarjeta>Texto</Tarjeta>);
    expect(container.firstElementChild?.className).toContain('tarjeta');
  });

  it('aplica clase compacta cuando se indica', () => {
    const { container } = render(<Tarjeta compacta>Texto</Tarjeta>);
    expect(container.firstElementChild?.className).toContain('compacta');
  });

  it('no aplica clase compacta por defecto', () => {
    const { container } = render(<Tarjeta>Texto</Tarjeta>);
    expect(container.firstElementChild?.className).not.toContain('compacta');
  });

  it('pasa atributos HTML nativos (role, aria)', () => {
    render(
      <Tarjeta role="article" aria-label="Proceso 123">
        Info
      </Tarjeta>
    );
    const card = screen.getByRole('article', { name: 'Proceso 123' });
    expect(card).toBeDefined();
  });

  it('acepta className adicional', () => {
    const { container } = render(
      <Tarjeta className="custom">Texto</Tarjeta>
    );
    expect(container.firstElementChild?.className).toContain('custom');
  });
});
