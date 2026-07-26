/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { ModalDetalle } from './ModalDetalle';

// Mock de fetch global
const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
});

const procesoMock = {
  id: '123',
  radicado: '11001310300120230001',
  despacho: 'Juzgado 1 Civil',
  departamento: 'Bogotá',
  ciudad: 'Bogotá',
  tipo_proceso: 'Civil',
  sujetos_procesales: '{"demandante":"Juan","demandado":"Pedro"}',
  estado_cpnu: null,
  columna_kanban: 'nuevo',
  seguimiento_activo: true,
  actuaciones: [
    {
      id: 'act-1',
      id_actuacion_cpnu: 'cpnu-1',
      consecutivo: 2,
      fecha_actuacion: '2025-06-10T00:00:00.000Z',
      actuacion: 'Notificación personal',
      anotacion: null,
      fecha_inicia: null,
      fecha_finaliza: null,
      fecha_registro: '2025-06-10T05:00:00.000Z',
      existe_docs: false,
      es_nueva: false,
      analisis_completado: true,
      creado_en: '2025-06-10T05:00:00.000Z',
    },
    {
      id: 'act-2',
      id_actuacion_cpnu: 'cpnu-2',
      consecutivo: 1,
      fecha_actuacion: '2025-06-05T00:00:00.000Z',
      actuacion: 'Auto que admite demanda',
      anotacion: 'Traslado 10 días',
      fecha_inicia: null,
      fecha_finaliza: null,
      fecha_registro: '2025-06-05T05:00:00.000Z',
      existe_docs: false,
      es_nueva: false,
      analisis_completado: true,
      creado_en: '2025-06-05T05:00:00.000Z',
    },
  ],
  plazos: [
    {
      id: 'plazo-1',
      dias: 10,
      es_habil: true,
      fecha_inicio: '2025-06-05',
      fecha_limite: '2025-06-19',
      estado: 'pendiente',
      indeterminado: false,
      creado_en: '2025-06-05T05:00:00.000Z',
    },
  ],
};

describe('ModalDetalle', () => {
  it('no renderiza nada cuando abierto=false', () => {
    const { container } = render(
      <ModalDetalle abierto={false} onCerrar={vi.fn()} procesoId="123" />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('muestra indicador de carga al abrir', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ proceso: procesoMock }),
    });

    render(<ModalDetalle abierto={true} onCerrar={vi.fn()} procesoId="123" />);

    // Mientras carga, muestra "Cargando..."
    expect(screen.getByText('Cargando...')).toBeDefined();
  });

  it('muestra actuaciones en tab Actuaciones y plazos en tab Plazos', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ proceso: procesoMock }),
    });

    render(<ModalDetalle abierto={true} onCerrar={vi.fn()} procesoId="123" />);

    // Wait for process data to load
    await waitFor(() => {
      expect(screen.getByRole('tablist')).toBeDefined();
    });

    // Click on "Actuaciones" tab
    fireEvent.click(screen.getByRole('tab', { name: 'Actuaciones' }));

    // Verifica que ambas actuaciones están presentes
    expect(screen.getByText('Notificación personal')).toBeDefined();
    expect(screen.getByText('Auto que admite demanda')).toBeDefined();
    expect(screen.getByText('Traslado 10 días')).toBeDefined();

    // Click on "Plazos" tab
    fireEvent.click(screen.getByRole('tab', { name: 'Plazos' }));

    // Verifica que el plazo activo se muestra
    expect(screen.getByText('10 días hábiles')).toBeDefined();
  });

  it('muestra error cuando la API falla', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'Proceso no encontrado.' }),
    });

    render(<ModalDetalle abierto={true} onCerrar={vi.fn()} procesoId="999" />);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeDefined();
      expect(screen.getByText('Proceso no encontrado.')).toBeDefined();
    });
  });

  it('muestra mensajes vacíos cuando no hay actuaciones ni plazos', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        proceso: { ...procesoMock, actuaciones: [], plazos: [] },
      }),
    });

    render(<ModalDetalle abierto={true} onCerrar={vi.fn()} procesoId="123" />);

    // Wait for data to load and tabs to render
    await waitFor(() => {
      expect(screen.getByRole('tablist')).toBeDefined();
    });

    // Navigate to Actuaciones tab
    fireEvent.click(screen.getByRole('tab', { name: 'Actuaciones' }));
    expect(screen.getByText('No se encontraron actuaciones.')).toBeDefined();

    // Navigate to Plazos tab
    fireEvent.click(screen.getByRole('tab', { name: 'Plazos' }));
    expect(screen.getByText('No hay plazos activos.')).toBeDefined();
  });

  it('llama a la API con el procesoId correcto', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ proceso: procesoMock }),
    });

    render(<ModalDetalle abierto={true} onCerrar={vi.fn()} procesoId="abc-123" />);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/procesos/abc-123');
    });
  });

  it('tiene role="dialog" con aria-modal', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ proceso: procesoMock }),
    });

    render(<ModalDetalle abierto={true} onCerrar={vi.fn()} procesoId="123" />);

    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
  });

  it('muestra la tab General activa por defecto', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ proceso: procesoMock }),
    });

    render(<ModalDetalle abierto={true} onCerrar={vi.fn()} procesoId="123" />);

    await waitFor(() => {
      const generalTab = screen.getByRole('tab', { name: 'General' });
      expect(generalTab.getAttribute('aria-selected')).toBe('true');
    });

    // General info should be visible
    expect(screen.getByText('Juzgado 1 Civil')).toBeDefined();
  });

  it('navega entre tabs con teclado (flechas)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ proceso: procesoMock }),
    });

    render(<ModalDetalle abierto={true} onCerrar={vi.fn()} procesoId="123" />);

    await waitFor(() => {
      expect(screen.getByRole('tablist')).toBeDefined();
    });

    const generalTab = screen.getByRole('tab', { name: 'General' });
    fireEvent.keyDown(generalTab, { key: 'ArrowRight' });

    const actuacionesTab = screen.getByRole('tab', { name: 'Actuaciones' });
    expect(actuacionesTab.getAttribute('aria-selected')).toBe('true');
  });
});
