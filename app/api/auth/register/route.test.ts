/**
 * Tests para POST /api/auth/register
 *
 * Requisitos: R1.1, R1.2, R1.3, R1.4, R1.5, R1.6, R1.7
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";

// Mock de Prisma
vi.mock("@/lib/db", () => ({
  prisma: {
    usuario: {
      findUnique: vi.fn(),
    },
    configuracionUsuario: {
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

// Mock de bcryptjs
vi.mock("bcryptjs", () => ({
  default: {
    hash: vi.fn().mockResolvedValue("$2a$12$hashedpassword"),
    compare: vi.fn(),
  },
}));

import { prisma } from "@/lib/db";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TransactionFn = (tx: any) => Promise<any>;

function crearRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/register", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── Validación de nombre (R1.5) ──────────────────────────────────────────

  describe("Validación de nombre", () => {
    it("rechaza nombre vacío con 400", async () => {
      const req = crearRequest({
        nombre: "",
        email: "test@ejemplo.com",
        password: "password123",
      });

      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.detalles).toContainEqual(
        expect.objectContaining({ campo: "nombre" }),
      );
    });

    it("rechaza nombre de más de 100 caracteres con 400", async () => {
      const req = crearRequest({
        nombre: "a".repeat(101),
        email: "test@ejemplo.com",
        password: "password123",
      });

      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.detalles).toContainEqual(
        expect.objectContaining({ campo: "nombre" }),
      );
    });

    it("acepta nombre de exactamente 1 carácter", async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.$transaction).mockImplementation(async (fn: TransactionFn) => {
        const tx = {
          usuario: {
            create: vi.fn().mockResolvedValue({
              id: "uuid-1",
              nombre: "A",
              email: "test@ejemplo.com",
              creado_en: new Date(),
            }),
          },
          configuracionUsuario: {
            create: vi.fn().mockResolvedValue({}),
          },
        };
        return fn(tx as never);
      });

      const req = crearRequest({
        nombre: "A",
        email: "test@ejemplo.com",
        password: "password123",
      });

      const res = await POST(req);
      expect(res.status).toBe(201);
    });

    it("acepta nombre de exactamente 100 caracteres", async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.$transaction).mockImplementation(async (fn: TransactionFn) => {
        const tx = {
          usuario: {
            create: vi.fn().mockResolvedValue({
              id: "uuid-1",
              nombre: "a".repeat(100),
              email: "test@ejemplo.com",
              creado_en: new Date(),
            }),
          },
          configuracionUsuario: {
            create: vi.fn().mockResolvedValue({}),
          },
        };
        return fn(tx as never);
      });

      const req = crearRequest({
        nombre: "a".repeat(100),
        email: "test@ejemplo.com",
        password: "password123",
      });

      const res = await POST(req);
      expect(res.status).toBe(201);
    });
  });

  // ─── Validación de email (R1.4) ───────────────────────────────────────────

  describe("Validación de email", () => {
    it("rechaza email con formato inválido", async () => {
      const req = crearRequest({
        nombre: "Juan",
        email: "no-es-un-email",
        password: "password123",
      });

      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.detalles).toContainEqual(
        expect.objectContaining({ campo: "email" }),
      );
    });

    it("rechaza email de más de 254 caracteres", async () => {
      const req = crearRequest({
        nombre: "Juan",
        email: "a".repeat(246) + "@test.com", // 246 + 9 = 255 > 254
        password: "password123",
      });

      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.detalles).toContainEqual(
        expect.objectContaining({ campo: "email" }),
      );
    });

    it("rechaza email vacío", async () => {
      const req = crearRequest({
        nombre: "Juan",
        email: "",
        password: "password123",
      });

      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.detalles).toContainEqual(
        expect.objectContaining({ campo: "email" }),
      );
    });
  });

  // ─── Validación de contraseña (R1.3) ──────────────────────────────────────

  describe("Validación de contraseña", () => {
    it("rechaza contraseña de menos de 8 caracteres", async () => {
      const req = crearRequest({
        nombre: "Juan",
        email: "juan@ejemplo.com",
        password: "1234567",
      });

      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.detalles).toContainEqual(
        expect.objectContaining({ campo: "password" }),
      );
    });

    it("rechaza contraseña de más de 128 caracteres", async () => {
      const req = crearRequest({
        nombre: "Juan",
        email: "juan@ejemplo.com",
        password: "a".repeat(129),
      });

      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.detalles).toContainEqual(
        expect.objectContaining({ campo: "password" }),
      );
    });

    it("acepta contraseña de exactamente 8 caracteres", async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.$transaction).mockImplementation(async (fn: TransactionFn) => {
        const tx = {
          usuario: {
            create: vi.fn().mockResolvedValue({
              id: "uuid-1",
              nombre: "Juan",
              email: "juan@ejemplo.com",
              creado_en: new Date(),
            }),
          },
          configuracionUsuario: {
            create: vi.fn().mockResolvedValue({}),
          },
        };
        return fn(tx as never);
      });

      const req = crearRequest({
        nombre: "Juan",
        email: "juan@ejemplo.com",
        password: "12345678",
      });

      const res = await POST(req);
      expect(res.status).toBe(201);
    });

    it("acepta contraseña de exactamente 128 caracteres", async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.$transaction).mockImplementation(async (fn: TransactionFn) => {
        const tx = {
          usuario: {
            create: vi.fn().mockResolvedValue({
              id: "uuid-1",
              nombre: "Juan",
              email: "juan@ejemplo.com",
              creado_en: new Date(),
            }),
          },
          configuracionUsuario: {
            create: vi.fn().mockResolvedValue({}),
          },
        };
        return fn(tx as never);
      });

      const req = crearRequest({
        nombre: "Juan",
        email: "juan@ejemplo.com",
        password: "a".repeat(128),
      });

      const res = await POST(req);
      expect(res.status).toBe(201);
    });
  });

  // ─── Unicidad de email (R1.2) ─────────────────────────────────────────────

  describe("Unicidad de email", () => {
    it("rechaza email duplicado con 409", async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue({
        id: "existing-uuid",
        nombre: "Existente",
        email: "duplicado@ejemplo.com",
        password_hash: "$2a$12$hash",
        creado_en: new Date(),
        actualizado_en: new Date(),
      });

      const req = crearRequest({
        nombre: "Juan",
        email: "duplicado@ejemplo.com",
        password: "password123",
      });

      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(409);
      expect(data.error).toContain("ya está registrado");
    });
  });

  // ─── Registro exitoso (R1.1, R1.6, R1.7) ─────────────────────────────────

  describe("Registro exitoso", () => {
    it("crea usuario y configuración por defecto con 201", async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(null);

      const mockCrearUsuario = vi.fn().mockResolvedValue({
        id: "uuid-nuevo",
        nombre: "María López",
        email: "maria@ejemplo.com",
        creado_en: new Date("2024-01-01T12:00:00Z"),
      });
      const mockCrearConfig = vi.fn().mockResolvedValue({});

      vi.mocked(prisma.$transaction).mockImplementation(async (fn: TransactionFn) => {
        const tx = {
          usuario: { create: mockCrearUsuario },
          configuracionUsuario: { create: mockCrearConfig },
        };
        return fn(tx as never);
      });

      const req = crearRequest({
        nombre: "María López",
        email: "maria@ejemplo.com",
        password: "contraseña-segura-123",
      });

      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(201);
      expect(data.mensaje).toBe("Registro exitoso.");
      expect(data.usuario.nombre).toBe("María López");
      expect(data.usuario.email).toBe("maria@ejemplo.com");
      expect(data.usuario.id).toBeDefined();

      // Verificar que se creó la configuración por defecto (R1.6)
      expect(mockCrearConfig).toHaveBeenCalledWith({
        data: expect.objectContaining({
          canal_inapp: true,
          canal_email: false,
          canal_whatsapp: false,
          frecuencia_revision: "diaria_habiles",
        }),
      });
    });

    it("normaliza el email a minúsculas y sin espacios", async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(null);

      const mockCrearUsuario = vi.fn().mockResolvedValue({
        id: "uuid-nuevo",
        nombre: "Pedro",
        email: "pedro@ejemplo.com",
        creado_en: new Date(),
      });

      vi.mocked(prisma.$transaction).mockImplementation(async (fn: TransactionFn) => {
        const tx = {
          usuario: { create: mockCrearUsuario },
          configuracionUsuario: { create: vi.fn().mockResolvedValue({}) },
        };
        return fn(tx as never);
      });

      const req = crearRequest({
        nombre: "Pedro",
        email: "  Pedro@Ejemplo.COM  ",
        password: "password123",
      });

      const res = await POST(req);
      expect(res.status).toBe(201);

      // Verificar que el email se buscó en lowercase
      expect(prisma.usuario.findUnique).toHaveBeenCalledWith({
        where: { email: "pedro@ejemplo.com" },
      });
    });
  });

  // ─── Manejo de errores ────────────────────────────────────────────────────

  describe("Manejo de errores", () => {
    it("devuelve 400 si el body no es JSON válido", async () => {
      const req = new NextRequest("http://localhost:3000/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not-json",
      });

      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toBeDefined();
    });

    it("devuelve 500 si ocurre error inesperado en la transacción", async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.$transaction).mockRejectedValue(
        new Error("Connection failed"),
      );

      const req = crearRequest({
        nombre: "Juan",
        email: "juan@ejemplo.com",
        password: "password123",
      });

      const res = await POST(req);
      expect(res.status).toBe(500);
    });
  });
});

describe("POST /api/auth/register — modo demo", () => {
  it("responde 403 y no toca la base de datos cuando DEMO_MODE=true", async () => {
    vi.clearAllMocks();
    vi.stubEnv("DEMO_MODE", "true");
    try {
      const res = await POST(
        crearRequest({ nombre: "Ana", email: "ana@ejemplo.com", password: "password123" }),
      );
      expect(res.status).toBe(403);
      expect(prisma.usuario.findUnique).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
