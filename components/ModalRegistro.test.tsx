/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ModalRegistro } from './ModalRegistro';

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ModalRegistro', () => {
  it('no renderiza nada cuando abierto=false', () => {
    const { container } = render(
      <ModalRegistro abierto={false} onCerrar={vi.fn()} />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('renderiza formulario con campo de radicado y botón registrar', () => {
    render(<ModalRegistro abierto={true} onCerrar={vi.fn()} />);

    const input = screen.getByRole('textbox');
    expect(input).toBeDefined();

    const botonRegistrar = screen.getByRole('button', { name: 'Registrar' });
    expect(botonRegistrar).toBeDefined();
  });

  it('muestra error de validación si el radicado no tiene 23 dígitos', async () => {
    render(<ModalRegistro abierto={true} onCerrar={vi.fn()} />);

    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '123' } });

    const form = input.closest('form')!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeDefined();
    });

    // No debería haber llamado a la API
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('envía POST /api/procesos con radicado válido', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ mensaje: 'Proceso registrado exitosamente.' }),
    });

    render(<ModalRegistro abierto={true} onCerrar={vi.fn()} />);

    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '11001310300120230001200' } });

    const form = input.closest('form')!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/procesos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ radicado: '11001310300120230001200' }),
      });
    });
  });

  it('muestra mensaje de éxito tras registro correcto', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ mensaje: 'ok' }),
    });

    render(<ModalRegistro abierto={true} onCerrar={vi.fn()} />);

    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '11001310300120230001200' } });

    const form = input.closest('form')!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(screen.getByRole('status')).toBeDefined();
    });
  });

  it('muestra error de duplicado (409)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: async () => ({ error: 'Este proceso ya está en seguimiento.' }),
    });

    render(<ModalRegistro abierto={true} onCerrar={vi.fn()} />);

    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '11001310300120230001200' } });

    const form = input.closest('form')!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('ya se encuentra en seguimiento');
    });
  });

  it('muestra error de no encontrado (404)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({ error: 'No se encontró el proceso.' }),
    });

    render(<ModalRegistro abierto={true} onCerrar={vi.fn()} />);

    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '11001310300120230001200' } });

    const form = input.closest('form')!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('No se encontró');
    });
  });

  it('invoca onRegistroExitoso tras éxito', async () => {
    const onRegistroExitoso = vi.fn();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ mensaje: 'ok' }),
    });

    render(
      <ModalRegistro
        abierto={true}
        onCerrar={vi.fn()}
        onRegistroExitoso={onRegistroExitoso}
      />,
    );

    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '11001310300120230001200' } });

    const form = input.closest('form')!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(onRegistroExitoso).toHaveBeenCalledTimes(1);
    });
  });

  it('tiene role="dialog" con aria-modal', () => {
    render(<ModalRegistro abierto={true} onCerrar={vi.fn()} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
  });

  it('resetea el formulario al cerrar', () => {
    const onCerrar = vi.fn();
    render(
      <ModalRegistro abierto={true} onCerrar={onCerrar} />,
    );

    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '12345' } });

    // Click the form's "Cerrar" button (secundario variant, not the X)
    const botones = screen.getAllByRole('button', { name: /cerrar/i });
    const botonCerrarForm = botones.find((b) => b.textContent === 'Cerrar')!;
    fireEvent.click(botonCerrarForm);

    expect(onCerrar).toHaveBeenCalled();
  });
});
