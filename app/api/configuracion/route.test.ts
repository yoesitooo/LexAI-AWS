/**
 * Tests para GET/PATCH /api/configuracion
 *
 * Requisitos: R11.1, R11.2, R11.3, R11.4, R11.5, R11.6, R11.7
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET, PATCH } from "./route";

// Mock de auth
vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

// Mock de Prisma
vi.mock("@/lib/db", () => ({
  prisma: {
    configuracionUsuario: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

const mockAuth = vi.mocked(auth);
const mockFindUnique = vi.mocked(prisma.configuracionUsuario.findUnique);
const mockUpdate = vi.mocked(prisma.configuracionUsuario.update);

const CONFIG_DEFAULT = {
  id: "config-uuid",
  usuario_id: "user-uuid",
  canal_inapp: true,
  canal_email: false,
  canal_whatsapp: false,
  numero_whatsapp: null,
  frecuencia_revision: "diaria_habiles",
  creado_en: new Date(),
  actualizado_en: new Date(),
};

function crearPatchRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/configuracion", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("GET /api/configuracion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("devuelve 401 si no hay sesión", async () => {
    mockAuth.mockResolvedValue(null as never);

    const res = await GET();
    const data = await res.json();

    expect(res.status).toBe(401);
    expect(data.error).toContain("No autenticado");
  });

  it("devuelve el estado de canales del usuario autenticado (R11.1)", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "user-uuid", name: "Test", email: "test@test.com" },
      expires: "2025-01-01",
    } as never);
    mockFindUnique.mockResolvedValue(CONFIG_DEFAULT as never);

    const res = await GET();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.canal_inapp).toBe(true);
    expect(data.canal_email).toBe(false);
    expect(data.canal_whatsapp).toBe(false);
    expect(data.numero_whatsapp).toBeNull();
    expect(data.frecuencia_revision).toBe("diaria_habiles");
    expect(data.frecuencia_editable).toBe(false);
  });

  it("devuelve 404 si no se encuentra configuración", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "user-uuid", name: "Test", email: "test@test.com" },
      expires: "2025-01-01",
    } as never);
    mockFindUnique.mockResolvedValue(null as never);

    const res = await GET();
    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/configuracion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({
      user: { id: "user-uuid", name: "Test", email: "test@test.com" },
      expires: "2025-01-01",
    } as never);
    mockFindUnique.mockResolvedValue(CONFIG_DEFAULT as never);
  });

  it("devuelve 401 si no hay sesión", async () => {
    mockAuth.mockResolvedValue(null as never);

    const req = crearPatchRequest({ canal_email: true });
    const res = await PATCH(req);

    expect(res.status).toBe(401);
  });

  // ─── Activar/desactivar canales (R11.2) ─────────────────────────────────────

  it("activa el canal email y devuelve confirmación (R11.2)", async () => {
    mockUpdate.mockResolvedValue({
      ...CONFIG_DEFAULT,
      canal_email: true,
    } as never);

    const req = crearPatchRequest({ canal_email: true });
    const res = await PATCH(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.canal_email).toBe(true);
    expect(data.mensaje).toContain("actualizada");
  });

  it("desactiva canal in-app", async () => {
    mockUpdate.mockResolvedValue({
      ...CONFIG_DEFAULT,
      canal_inapp: false,
    } as never);

    const req = crearPatchRequest({ canal_inapp: false });
    const res = await PATCH(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.canal_inapp).toBe(false);
  });

  // ─── WhatsApp: número válido requerido (R11.4, R11.5) ───────────────────────

  it("activa WhatsApp con número válido (R11.4)", async () => {
    mockUpdate.mockResolvedValue({
      ...CONFIG_DEFAULT,
      canal_whatsapp: true,
      numero_whatsapp: "+573001234567",
    } as never);

    const req = crearPatchRequest({
      canal_whatsapp: true,
      numero_whatsapp: "+573001234567",
    });
    const res = await PATCH(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.canal_whatsapp).toBe(true);
    expect(data.numero_whatsapp).toBe("+573001234567");
  });

  it("rechaza activar WhatsApp sin número (R11.5)", async () => {
    const req = crearPatchRequest({ canal_whatsapp: true });
    const res = await PATCH(req);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.campo).toBe("numero_whatsapp");
  });

  it("rechaza activar WhatsApp con número inválido (R11.5)", async () => {
    const req = crearPatchRequest({
      canal_whatsapp: true,
      numero_whatsapp: "12345",
    });
    const res = await PATCH(req);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.campo).toBe("numero_whatsapp");
  });

  it("rechaza activar WhatsApp con número sin prefijo + (R11.5)", async () => {
    const req = crearPatchRequest({
      canal_whatsapp: true,
      numero_whatsapp: "573001234567",
    });
    const res = await PATCH(req);

    expect(res.status).toBe(400);
  });

  it("acepta número con exactamente 8 dígitos después de + (límite inferior)", async () => {
    mockUpdate.mockResolvedValue({
      ...CONFIG_DEFAULT,
      canal_whatsapp: true,
      numero_whatsapp: "+12345678",
    } as never);

    const req = crearPatchRequest({
      canal_whatsapp: true,
      numero_whatsapp: "+12345678",
    });
    const res = await PATCH(req);

    expect(res.status).toBe(200);
  });

  it("acepta número con exactamente 15 dígitos después de + (límite superior)", async () => {
    mockUpdate.mockResolvedValue({
      ...CONFIG_DEFAULT,
      canal_whatsapp: true,
      numero_whatsapp: "+123456789012345",
    } as never);

    const req = crearPatchRequest({
      canal_whatsapp: true,
      numero_whatsapp: "+123456789012345",
    });
    const res = await PATCH(req);

    expect(res.status).toBe(200);
  });

  it("rechaza número con más de 15 dígitos después de +", async () => {
    const req = crearPatchRequest({
      canal_whatsapp: true,
      numero_whatsapp: "+1234567890123456",
    });
    const res = await PATCH(req);

    expect(res.status).toBe(400);
  });

  it("desactiva WhatsApp sin requerir número", async () => {
    mockFindUnique.mockResolvedValue({
      ...CONFIG_DEFAULT,
      canal_whatsapp: true,
      numero_whatsapp: "+573001234567",
    } as never);
    mockUpdate.mockResolvedValue({
      ...CONFIG_DEFAULT,
      canal_whatsapp: false,
      numero_whatsapp: "+573001234567",
    } as never);

    const req = crearPatchRequest({ canal_whatsapp: false });
    const res = await PATCH(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.canal_whatsapp).toBe(false);
  });

  // ─── Frecuencia de revisión no editable (R11.6) ─────────────────────────────

  it("rechaza edición de frecuencia_revision (R11.6)", async () => {
    const req = crearPatchRequest({ frecuencia_revision: "semanal" });
    const res = await PATCH(req);
    const data = await res.json();

    expect(res.status).toBe(403);
    expect(data.error).toContain("no está disponible");
  });

  // ─── Sin cambios ───────────────────────────────────────────────────────────

  it("devuelve datos actuales si no se envían cambios", async () => {
    const req = crearPatchRequest({});
    const res = await PATCH(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.mensaje).toContain("Sin cambios");
  });

  // ─── Error de persistencia (R11.3) ──────────────────────────────────────────

  it("devuelve 500 si la persistencia falla (R11.3)", async () => {
    mockUpdate.mockRejectedValue(new Error("DB connection error"));

    const req = crearPatchRequest({ canal_email: true });
    const res = await PATCH(req);
    const data = await res.json();

    expect(res.status).toBe(500);
    expect(data.error).toContain("No se pudo guardar");
  });
});
