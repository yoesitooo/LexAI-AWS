/**
 * @vitest-environment jsdom
 */
/**
 * Tests para la vista Kanban — pantalla principal tras login.
 *
 * Requisitos: R12.1, R12.2, R12.3, R12.6, R18.6
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import KanbanPage from "./page";

// Mock de fetch global
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock del módulo i18n
vi.mock("@/lib/i18n", () => ({
  t: (key: string, params?: Record<string, string | number>) => {
    const dict: Record<string, string> = {
      "kanban.titulo": "Mis procesos",
      "kanban.columna.nuevo": "Nuevo",
      "kanban.columna.en_seguimiento": "En seguimiento",
      "kanban.columna.requiere_accion": "Requiere acción",
      "kanban.columna.vencido": "Vencido",
      "kanban.columna.archivado": "Archivado",
      "kanban.vacio": "No tiene procesos registrados. Registre uno para comenzar.",
      "kanban.tarjeta.radicado": "Radicado",
      "kanban.tarjeta.demandante": "Demandante",
      "kanban.tarjeta.demandado": "Demandado",
      "kanban.tarjeta.juzgado": "Juzgado",
      "kanban.tarjeta.departamento": "Departamento",
      "kanban.tarjeta.ultima_actuacion": "Última actuación",
      "kanban.dnd.recogido": "Proceso {radicado} recogido de {origen}.",
      "kanban.dnd.movido": "Proceso {radicado} movido de {origen} a {destino}.",
      "kanban.dnd.cancelado": "Movimiento cancelado. Proceso {radicado} devuelto a {origen}.",
      "kanban.dnd.error": "No se pudo mover el proceso. Intente de nuevo.",
      "kanban.dnd.instrucciones": "Presione Espacio o Enter para recoger. Use flechas izquierda/derecha para mover entre columnas. Presione Espacio o Enter para soltar. Escape para cancelar.",
      "error.cargando": "Cargando...",
      "error.generico": "Ocurrió un error inesperado. Intente de nuevo.",
    };
    let result = dict[key] ?? key;
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        result = result.replace(`{${k}}`, String(v));
      });
    }
    return result;
  },
}));

// ─── Datos de prueba ────────────────────────────────────────────────────────

const KANBAN_CON_PROCESOS = {
  kanban: {
    nuevo: [
      {
        id: "p1",
        radicado: "11001400300320230001200",
        despacho: "Juzgado 3 Civil Municipal",
        departamento: "Cundinamarca",
        ciudad: "Bogotá",
        tipo_proceso: null,
        sujetos_procesales: "DEMANDANTE: Juan Pérez | DEMANDADO: María López",
        estado_cpnu: "En trámite",
        columna_kanban: "nuevo",
        seguimiento_activo: true,
        creado_en: "2024-01-01T05:00:00.000Z",
        actualizado_en: "2024-06-01T05:00:00.000Z",
        actuaciones: [
          { actuacion: "Auto admisorio de la demanda", fecha_actuacion: "2024-06-01" },
        ],
      },
    ],
    en_seguimiento: [
      {
        id: "p2",
        radicado: "11001400300320220005600",
        despacho: "Juzgado 5 Civil del Circuito",
        departamento: "Antioquia",
        ciudad: "Medellín",
        tipo_proceso: "Civil",
        sujetos_procesales: "DEMANDANTE: Pedro Gómez | DEMANDADO: Ana Ruiz",
        estado_cpnu: "Activo",
        columna_kanban: "en_seguimiento",
        seguimiento_activo: true,
        creado_en: "2024-02-01T05:00:00.000Z",
        actualizado_en: "2024-05-01T05:00:00.000Z",
        actuaciones: [
          { actuacion: "Sentencia de primera instancia", fecha_actuacion: "2024-05-01" },
        ],
      },
    ],
    requiere_accion: [],
    vencido: [],
    archivado: [],
  },
};

const KANBAN_VACIO = {
  kanban: {
    nuevo: [],
    en_seguimiento: [],
    requiere_accion: [],
    vencido: [],
    archivado: [],
  },
};

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("KanbanPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("muestra estado de carga inicialmente", () => {
    mockFetch.mockReturnValue(new Promise(() => {})); // never resolves
    render(<KanbanPage />);
    expect(screen.getByText("Cargando...")).toBeDefined();
  });

  it("muestra las cinco columnas del Kanban con procesos (R12.2)", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => KANBAN_CON_PROCESOS,
    });

    render(<KanbanPage />);

    await waitFor(() => {
      expect(screen.getByText("Mis procesos")).toBeDefined();
    });

    // Verificar las cinco columnas existen como secciones ARIA
    expect(screen.getByLabelText("Columna Nuevo")).toBeDefined();
    expect(screen.getByLabelText("Columna En seguimiento")).toBeDefined();
    expect(screen.getByLabelText("Columna Requiere acción")).toBeDefined();
    expect(screen.getByLabelText("Columna Vencido")).toBeDefined();
    expect(screen.getByLabelText("Columna Archivado")).toBeDefined();
  });

  it("muestra datos de la tarjeta: radicado, partes, actuación, despacho, ubicación (R12.3)", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => KANBAN_CON_PROCESOS,
    });

    render(<KanbanPage />);

    await waitFor(() => {
      expect(screen.getByText("11001400300320230001200")).toBeDefined();
    });

    // Partes procesales
    expect(screen.getByText(/Juan Pérez/)).toBeDefined();
    expect(screen.getByText(/María López/)).toBeDefined();

    // Última actuación
    expect(screen.getByText("Auto admisorio de la demanda")).toBeDefined();

    // Juzgado
    expect(screen.getByText("Juzgado 3 Civil Municipal")).toBeDefined();

    // Ubicación
    expect(screen.getByText("Cundinamarca / Bogotá")).toBeDefined();
  });

  it("muestra mensaje de estado vacío cuando no hay procesos (R12.6)", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => KANBAN_VACIO,
    });

    render(<KanbanPage />);

    await waitFor(() => {
      expect(
        screen.getByText("No tiene procesos registrados. Registre uno para comenzar."),
      ).toBeDefined();
    });

    // Aún muestra las cinco columnas vacías
    expect(screen.getByLabelText("Columna Nuevo")).toBeDefined();
    expect(screen.getByLabelText("Columna Archivado")).toBeDefined();
  });

  it("muestra BadgeEstado con texto e ícono para cada proceso (R18.6)", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => KANBAN_CON_PROCESOS,
    });

    render(<KanbanPage />);

    await waitFor(() => {
      expect(screen.getByText("11001400300320230001200")).toBeDefined();
    });

    // Verify badges with state text are rendered (column headers + card badges)
    const nuevoBadges = screen.getAllByText("Nuevo");
    expect(nuevoBadges.length).toBeGreaterThanOrEqual(1);

    const enSeguimientoBadges = screen.getAllByText("En seguimiento");
    expect(enSeguimientoBadges.length).toBeGreaterThanOrEqual(1);

    // Verify icons with aria-labels are present
    expect(screen.getAllByLabelText("Indicador de estado nuevo").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByLabelText("Indicador de estado en seguimiento").length).toBeGreaterThanOrEqual(1);
  });

  it("muestra error cuando la API falla", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: "Error interno" }),
    });

    render(<KanbanPage />);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeDefined();
    });
  });

  it("cada proceso pertenece a exactamente una columna (R12.2)", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => KANBAN_CON_PROCESOS,
    });

    render(<KanbanPage />);

    await waitFor(() => {
      expect(screen.getByText("11001400300320230001200")).toBeDefined();
    });

    // Process p1 is in "nuevo" column only
    const columnaP1 = screen.getByLabelText("Columna Nuevo");
    expect(columnaP1.textContent).toContain("11001400300320230001200");

    // Process p2 is in "en_seguimiento" column only
    const columnaP2 = screen.getByLabelText("Columna En seguimiento");
    expect(columnaP2.textContent).toContain("11001400300320220005600");

    // p1 is NOT in en_seguimiento
    expect(columnaP2.textContent).not.toContain("11001400300320230001200");
    // p2 is NOT in nuevo
    expect(columnaP1.textContent).not.toContain("11001400300320220005600");
  });

  it("las tarjetas tienen draggable=true y aria-roledescription (R18.3)", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => KANBAN_CON_PROCESOS,
    });

    render(<KanbanPage />);

    await waitFor(() => {
      expect(screen.getByText("11001400300320230001200")).toBeDefined();
    });

    // Cards should be draggable and have roledescription
    const tarjetas = screen.getAllByRole("article");
    tarjetas.forEach((tarjeta) => {
      expect(tarjeta).toHaveAttribute("draggable", "true");
      expect(tarjeta).toHaveAttribute("aria-roledescription", "tarjeta movible");
    });
  });

  it("muestra instrucciones de teclado ocultas para lectores de pantalla (R18.5)", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => KANBAN_CON_PROCESOS,
    });

    render(<KanbanPage />);

    await waitFor(() => {
      expect(screen.getByText("11001400300320230001200")).toBeDefined();
    });

    // DnD instructions element should exist
    const instructions = document.getElementById("kanban-dnd-instructions");
    expect(instructions).not.toBeNull();
    expect(instructions?.textContent).toContain("Presione Espacio o Enter para recoger");
  });

  it("tiene aria-live=assertive region para anuncios DnD (R18.3)", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => KANBAN_CON_PROCESOS,
    });

    render(<KanbanPage />);

    await waitFor(() => {
      expect(screen.getByText("11001400300320230001200")).toBeDefined();
    });

    // ARIA live region should exist
    const liveRegion = document.querySelector('[aria-live="assertive"]');
    expect(liveRegion).not.toBeNull();
  });

  it("las tarjetas son enfocables con tabIndex (R18.5 — sin trampas de foco)", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => KANBAN_CON_PROCESOS,
    });

    render(<KanbanPage />);

    await waitFor(() => {
      expect(screen.getByText("11001400300320230001200")).toBeDefined();
    });

    const tarjetas = screen.getAllByRole("article");
    tarjetas.forEach((tarjeta) => {
      expect(tarjeta).toHaveAttribute("tabindex", "0");
    });
  });
});
