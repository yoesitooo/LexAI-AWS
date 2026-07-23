/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Boton } from './Boton';

describe('Boton', () => {
  it('renderiza con texto y es un botón accesible', () => {
    render(<Boton>Guardar</Boton>);
    const btn = screen.getByRole('button', { name: 'Guardar' });
    expect(btn).toBeDefined();
  });

  it('tiene clase que referencia token de objetivo táctil ≥44×44 px', () => {
    render(<Boton>OK</Boton>);
    const btn = screen.getByRole('button');
    // La clase .boton en CSS Module aplica min-height: var(--tactil-minimo)
    expect(btn.className).toContain('boton');
  });

  it('variante primaria aplica clase primario', () => {
    render(<Boton variante="primario">Acción</Boton>);
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('primario');
  });

  it('variante secundaria aplica clase secundario', () => {
    render(<Boton variante="secundario">Cancelar</Boton>);
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('secundario');
  });

  it('estado deshabilitado se aplica correctamente', () => {
    render(<Boton disabled>No disponible</Boton>);
    const btn = screen.getByRole('button');
    expect(btn).toHaveProperty('disabled', true);
  });

  it('estado cargando deshabilita y muestra aria-busy', () => {
    render(<Boton cargando>Cargando...</Boton>);
    const btn = screen.getByRole('button');
    expect(btn).toHaveProperty('disabled', true);
    expect(btn.getAttribute('aria-busy')).toBe('true');
  });

  it('muestra ícono cuando se provee', () => {
    render(
      <Boton icono={<span data-testid="icono-test">★</span>}>
        Con ícono
      </Boton>
    );
    expect(screen.getByTestId('icono-test')).toBeDefined();
  });

  it('ejecuta onClick cuando no está deshabilitado ni cargando', () => {
    const onClick = vi.fn();
    render(<Boton onClick={onClick}>Click</Boton>);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('no ejecuta onClick cuando está deshabilitado', () => {
    const onClick = vi.fn();
    render(
      <Boton disabled onClick={onClick}>
        Click
      </Boton>
    );
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).not.toHaveBeenCalled();
  });
});
