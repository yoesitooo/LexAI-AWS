/**
 * Tests para GET /api/notificaciones — Bandeja in-app del usuario
 *
 * Requisitos: R10.2
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "./route";

// Mock de auth
vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

// Mock de Prisma
vi.mock("@/lib/db", () => ({
  prisma: {
    notificacionInapp: {
      findMany: vi.fn(),
    },
  },
}));

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

const mockAuth = vi.mocked(auth);
const mockFindMany = vi.mocked(prisma.notificacionInapp.findMany);

describe("GET /api/notificaciones", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("devuelve 401 si no hay sesión autenticada", async () => {
    mockAuth.mockResolvedValue(null as never);

    const res = await GET();
    const data = await res.json();

    expect(res.status).toBe(401);
    expect(data.error).toContain("No autenticado");
  });

  it("devuelve la bandeja de notificaciones del usuario autenticado (R10.2)", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "user-uuid", name: "Test", email: "test@test.com" },
      expires: "2025-01-01",
    } as never);

    const notificacionesMock = [
      {
        id: "notif-1",
        titulo: "Plazo por vencer",
        mensaje: "El plazo vence mañana.",
        leida: false,
        creado_en: new Date("2025-01-15T12:00:00Z"),
        notificacion_id: "prog-1",
      },
      {
        id: "notif-2",
        titulo: "Nuevo movimiento",
        mensaje: "Se detectó una nueva actuación.",
        leida: false,
        creado_en: new Date("2025-01-14T12:00:00Z"),
        notificacion_id: null,
      },
      {
        id: "notif-3",
        titulo: "Plazo cumplido",
        mensaje: "Su plazo fue registrado.",
        leida: true,
        creado_en: new Date("2025-01-10T12:00:00Z"),
        notificacion_id: "prog-2",
      },
    ];

    mockFindMany.mockResolvedValue(notificacionesMock as never);

    const res = await GET();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.notificaciones).toHaveLength(3);
    expect(data.notificaciones[0].id).toBe("notif-1");
    expect(data.notificaciones[0].leida).toBe(false);
    expect(data.notificaciones[2].leida).toBe(true);
  });

  it("filtra solo por el usuario de la sesión", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "user-abc", name: "Test", email: "test@test.com" },
      expires: "2025-01-01",
    } as never);

    mockFindMany.mockResolvedValue([] as never);

    await GET();

    expect(mockFindMany).toHaveBeenCalledWith({
      where: { usuario_id: "user-abc" },
      orderBy: [
        { leida: "asc" },
        { creado_en: "desc" },
      ],
      select: {
        id: true,
        titulo: true,
        mensaje: true,
        leida: true,
        creado_en: true,
        notificacion_id: true,
      },
    });
  });

  it("devuelve lista vacía si el usuario no tiene notificaciones", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "user-uuid", name: "Test", email: "test@test.com" },
      expires: "2025-01-01",
    } as never);

    mockFindMany.mockResolvedValue([] as never);

    const res = await GET();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.notificaciones).toHaveLength(0);
  });

  it("ordena por no leídas primero, luego por fecha más reciente", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "user-uuid", name: "Test", email: "test@test.com" },
      expires: "2025-01-01",
    } as never);

    mockFindMany.mockResolvedValue([] as never);

    await GET();

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [
          { leida: "asc" },
          { creado_en: "desc" },
        ],
      }),
    );
  });

  it("devuelve 500 ante error interno", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "user-uuid", name: "Test", email: "test@test.com" },
      expires: "2025-01-01",
    } as never);

    mockFindMany.mockRejectedValue(new Error("DB connection error"));

    const res = await GET();
    const data = await res.json();

    expect(res.status).toBe(500);
    expect(data.error).toContain("Error interno");
  });
});
