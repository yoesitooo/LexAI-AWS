/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BadgeEstado, type EstadoProceso } from './BadgeEstado';

describe('BadgeEstado', () => {
  const estados: EstadoProceso[] = [
    'nuevo',
    'en_seguimiento',
    'requiere_accion',
    'vencido',
    'archivado',
  ];

  const etiquetas: Record<EstadoProceso, string> = {
    nuevo: 'Nuevo',
    en_seguimiento: 'En seguimiento',
    requiere_accion: 'Requiere acción',
    vencido: 'Vencido',
    archivado: 'Archivado',
  };

  it.each(estados)(
    'renderiza texto descriptivo para estado "%s"',
    (estado) => {
      render(<BadgeEstado estado={estado} />);
      expect(screen.getByText(etiquetas[estado])).toBeDefined();
    }
  );

  it.each(estados)(
    'renderiza ícono con aria-label significativo para estado "%s" (R18.4)',
    (estado) => {
      render(<BadgeEstado estado={estado} />);
      const icono = screen.getByRole('img');
      expect(icono.getAttribute('aria-label')).toBeTruthy();
      expect(icono.getAttribute('aria-label')).toContain('estado');
    }
  );

  it.each(estados)(
    'aplica clase CSS del estado "%s" para distinguir visualmente',
    (estado) => {
      const { container } = render(<BadgeEstado estado={estado} />);
      const badge = container.firstElementChild;
      expect(badge?.className).toContain(estado);
    }
  );

  it('distingue estados con texto además de color (R18.2, R18.6)', () => {
    const { container: c1 } = render(<BadgeEstado estado="nuevo" />);
    const { container: c2 } = render(<BadgeEstado estado="vencido" />);

    const texto1 = c1.querySelector('[class*="texto"]')?.textContent;
    const texto2 = c2.querySelector('[class*="texto"]')?.textContent;

    expect(texto1).not.toBe(texto2);
  });

  it('aplica className adicional', () => {
    const { container } = render(
      <BadgeEstado estado="nuevo" className="extra" />
    );
    expect(container.firstElementChild?.className).toContain('extra');
  });
});
