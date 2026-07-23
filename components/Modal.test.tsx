/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Modal } from './Modal';

describe('Modal', () => {
  it('no renderiza nada cuando abierto=false', () => {
    const { container } = render(
      <Modal abierto={false} onCerrar={vi.fn()} titulo="Test">
        Contenido
      </Modal>,
    );
    expect(container.innerHTML).toBe('');
  });

  it('renderiza el dialog con role, aria-modal y aria-labelledby cuando está abierto', () => {
    render(
      <Modal abierto={true} onCerrar={vi.fn()} titulo="Mi título">
        Contenido
      </Modal>,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeDefined();
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-labelledby')).toBe('modal-titulo');
  });

  it('muestra el título proporcionado', () => {
    render(
      <Modal abierto={true} onCerrar={vi.fn()} titulo="Detalle del proceso">
        Contenido
      </Modal>,
    );
    expect(screen.getByText('Detalle del proceso')).toBeDefined();
  });

  it('muestra el contenido children', () => {
    render(
      <Modal abierto={true} onCerrar={vi.fn()} titulo="Test">
        <p>Contenido interno</p>
      </Modal>,
    );
    expect(screen.getByText('Contenido interno')).toBeDefined();
  });

  it('llama onCerrar al presionar Escape', () => {
    const onCerrar = vi.fn();
    render(
      <Modal abierto={true} onCerrar={onCerrar} titulo="Test">
        Contenido
      </Modal>,
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCerrar).toHaveBeenCalledTimes(1);
  });

  it('llama onCerrar al hacer click en el overlay', () => {
    const onCerrar = vi.fn();
    const { container } = render(
      <Modal abierto={true} onCerrar={onCerrar} titulo="Test">
        Contenido
      </Modal>,
    );
    // El overlay es el primer div dentro del container
    const overlay = container.firstElementChild as HTMLElement;
    fireEvent.click(overlay);
    expect(onCerrar).toHaveBeenCalledTimes(1);
  });

  it('NO llama onCerrar al hacer click dentro del dialog', () => {
    const onCerrar = vi.fn();
    render(
      <Modal abierto={true} onCerrar={onCerrar} titulo="Test">
        <p>Contenido</p>
      </Modal>,
    );
    fireEvent.click(screen.getByText('Contenido'));
    expect(onCerrar).not.toHaveBeenCalled();
  });

  it('tiene botón de cerrar con aria-label', () => {
    render(
      <Modal abierto={true} onCerrar={vi.fn()} titulo="Test" etiquetaCerrar="Cerrar modal">
        Contenido
      </Modal>,
    );
    const botonCerrar = screen.getByLabelText('Cerrar modal');
    expect(botonCerrar).toBeDefined();
  });

  it('llama onCerrar al hacer click en el botón de cerrar', () => {
    const onCerrar = vi.fn();
    render(
      <Modal abierto={true} onCerrar={onCerrar} titulo="Test" etiquetaCerrar="Cerrar">
        Contenido
      </Modal>,
    );
    fireEvent.click(screen.getByLabelText('Cerrar'));
    expect(onCerrar).toHaveBeenCalledTimes(1);
  });
});
