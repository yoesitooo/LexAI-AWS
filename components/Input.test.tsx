/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Input } from './Input';

describe('Input', () => {
  it('renderiza con label asociado al input (htmlFor + id)', () => {
    render(<Input etiqueta="Correo electrónico" />);
    const input = screen.getByLabelText('Correo electrónico');
    expect(input).toBeDefined();
    expect(input.tagName.toLowerCase()).toBe('input');
  });

  it('marca visualmente como obligatorio con asterisco', () => {
    render(<Input etiqueta="Nombre" obligatorio />);
    const input = screen.getByLabelText(/Nombre/);
    expect(input.getAttribute('aria-required')).toBe('true');
    expect(input).toHaveProperty('required', true);
  });

  it('muestra mensaje de error con role alert y aria-describedby', () => {
    render(<Input etiqueta="Email" error="Formato inválido" />);
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toBe('Formato inválido');

    const input = screen.getByLabelText('Email');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toContain('error');
  });

  it('no muestra error cuando no hay', () => {
    render(<Input etiqueta="Campo" />);
    const input = screen.getByLabelText('Campo');
    expect(input.getAttribute('aria-invalid')).toBe('false');
  });

  it('muestra texto de ayuda cuando no hay error', () => {
    render(<Input etiqueta="Contraseña" ayuda="Mínimo 8 caracteres" />);
    const ayuda = screen.getByText('Mínimo 8 caracteres');
    expect(ayuda).toBeDefined();

    const input = screen.getByLabelText('Contraseña');
    expect(input.getAttribute('aria-describedby')).toContain('ayuda');
  });

  it('oculta texto de ayuda cuando hay error', () => {
    render(
      <Input
        etiqueta="Contraseña"
        ayuda="Mínimo 8 caracteres"
        error="Muy corta"
      />
    );
    expect(screen.queryByText('Mínimo 8 caracteres')).toBeNull();
    expect(screen.getByText('Muy corta')).toBeDefined();
  });

  it('usa id personalizado si se provee', () => {
    render(<Input etiqueta="Test" idCampo="mi-campo" />);
    const input = screen.getByLabelText('Test');
    expect(input.getAttribute('id')).toBe('mi-campo');
  });

  it('aplica clase del contenedor con className', () => {
    const { container } = render(
      <Input etiqueta="Test" className="extra" />
    );
    expect(container.firstElementChild?.className).toContain('extra');
  });
});
