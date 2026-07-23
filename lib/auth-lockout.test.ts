/**
 * Tests para bloqueo temporal por intentos fallidos de login
 *
 * Requisito: R2.5
 * Verifica que tras 5 intentos fallidos en ventana de 15 minutos se bloquea
 * el email con mensaje de bloqueo, y que el bloqueo expira después de los 15 min.
 *
 * Se testea la lógica de authorize() del proveedor de credenciales en lib/auth.ts
 * aislando la lógica de bloqueo con mocks de Prisma y bcrypt.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock de Prisma
const mockIntentoLoginCount = vi.fn();
const mockIntentoLoginCreate = vi.fn();
const mockUsuarioFindUnique = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    intentoLogin: {
      count: mockIntentoLoginCount,
      create: mockIntentoLoginCreate,
    },
    usuario: {
      findUnique: mockUsuarioFindUnique,
    },
  },
}));

// Mock de bcryptjs
const mockBcryptCompare = vi.fn();
vi.mock("bcryptjs", () => ({
  default: {
    compare: (...args: unknown[]) => mockBcryptCompare(...args),
  },
}));

// Mock de next-auth — capturamos la función authorize del provider de credenciales
vi.mock("next-auth", () => {
  return {
    default: (config: { providers: Array<{ options: { authorize: unknown } }> }) => {
      // Almacenar la función authorize para testarla
      const credentialsProvider = config.providers[0];
      (globalThis as Record<string, unknown>).__testAuthorize =
        credentialsProvider.options.authorize;
      return {
        handlers: {},
        signIn: vi.fn(),
        signOut: vi.fn(),
        auth: vi.fn(),
      };
    },
  };
});

vi.mock("next-auth/providers/credentials", () => {
  return {
    default: (opts: Record<string, unknown>) => ({ options: opts }),
  };
});

// Importar auth.ts para que se ejecute el mock y capture authorize
let authorize: (credentials: Record<string, unknown>) => Promise<unknown>;

describe("Bloqueo temporal por intentos fallidos (R2.5)", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    // Re-importar para capturar authorize fresco
    vi.resetModules();

    // Re-establecer mocks después de resetModules
    vi.doMock("@/lib/db", () => ({
      prisma: {
        intentoLogin: {
          count: mockIntentoLoginCount,
          create: mockIntentoLoginCreate,
        },
        usuario: {
          findUnique: mockUsuarioFindUnique,
        },
      },
    }));

    vi.doMock("bcryptjs", () => ({
      default: {
        compare: (...args: unknown[]) => mockBcryptCompare(...args),
      },
    }));

    vi.doMock("next-auth", () => ({
      default: (config: { providers: Array<{ options: { authorize: unknown } }> }) => {
        const credentialsProvider = config.providers[0];
        (globalThis as Record<string, unknown>).__testAuthorize =
          credentialsProvider.options.authorize;
        return {
          handlers: {},
          signIn: vi.fn(),
          signOut: vi.fn(),
          auth: vi.fn(),
        };
      },
    }));

    vi.doMock("next-auth/providers/credentials", () => ({
      default: (opts: Record<string, unknown>) => ({ options: opts }),
    }));

    await import("@/lib/auth");
    authorize = (globalThis as Record<string, unknown>).__testAuthorize as typeof authorize;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ─── Bloqueo tras 5 intentos fallidos ─────────────────────────────────────

  describe("Activación del bloqueo", () => {
    it("bloquea el email tras exactamente 5 intentos fallidos en 15 minutos", async () => {
      // 5 intentos fallidos ya registrados
      mockIntentoLoginCount.mockResolvedValue(5);
      mockIntentoLoginCreate.mockResolvedValue({});

      await expect(
        authorize({ email: "bloqueado@test.com", password: "cualquier" }),
      ).rejects.toThrow("ACCOUNT_LOCKED");

      // Verifica que se registró el intento bloqueado
      expect(mockIntentoLoginCreate).toHaveBeenCalledWith({
        data: { email: "bloqueado@test.com", exitoso: false },
      });
    });

    it("bloquea con más de 5 intentos fallidos (ej: 7)", async () => {
      mockIntentoLoginCount.mockResolvedValue(7);
      mockIntentoLoginCreate.mockResolvedValue({});

      await expect(
        authorize({ email: "muchos@test.com", password: "pass" }),
      ).rejects.toThrow("ACCOUNT_LOCKED");
    });

    it("NO bloquea con exactamente 4 intentos fallidos", async () => {
      // 4 intentos fallidos — aún no llega al umbral
      mockIntentoLoginCount.mockResolvedValue(4);
      mockUsuarioFindUnique.mockResolvedValue({
        id: "uuid-1",
        nombre: "Usuario",
        email: "cuatro@test.com",
        password_hash: "$2a$12$hash",
      });
      mockBcryptCompare.mockResolvedValue(true);
      mockIntentoLoginCreate.mockResolvedValue({});

      const resultado = await authorize({
        email: "cuatro@test.com",
        password: "correcta",
      });

      expect(resultado).not.toBeNull();
      expect(resultado).toMatchObject({
        id: "uuid-1",
        email: "cuatro@test.com",
      });
    });

    it("NO bloquea con 0 intentos fallidos (primer login)", async () => {
      mockIntentoLoginCount.mockResolvedValue(0);
      mockUsuarioFindUnique.mockResolvedValue({
        id: "uuid-2",
        nombre: "Nuevo",
        email: "nuevo@test.com",
        password_hash: "$2a$12$hash",
      });
      mockBcryptCompare.mockResolvedValue(true);
      mockIntentoLoginCreate.mockResolvedValue({});

      const resultado = await authorize({
        email: "nuevo@test.com",
        password: "correcta",
      });

      expect(resultado).not.toBeNull();
      expect(resultado).toMatchObject({ id: "uuid-2" });
    });
  });

  // ─── Ventana temporal de 15 minutos ───────────────────────────────────────

  describe("Ventana temporal de 15 minutos", () => {
    it("consulta intentos fallidos solo en la ventana de 15 minutos", async () => {
      const ahora = new Date("2024-06-15T10:00:00.000Z");
      vi.setSystemTime(ahora);

      mockIntentoLoginCount.mockResolvedValue(0);
      mockUsuarioFindUnique.mockResolvedValue({
        id: "uuid-3",
        nombre: "Test",
        email: "ventana@test.com",
        password_hash: "$2a$12$hash",
      });
      mockBcryptCompare.mockResolvedValue(true);
      mockIntentoLoginCreate.mockResolvedValue({});

      await authorize({ email: "ventana@test.com", password: "pass" });

      // Verificar que la consulta de count usa gte con fecha de hace 15 min
      expect(mockIntentoLoginCount).toHaveBeenCalledWith({
        where: {
          email: "ventana@test.com",
          exitoso: false,
          creado_en: {
            gte: expect.any(Date),
          },
        },
      });

      // Verificar el rango temporal (15 minutos = 900000 ms)
      const callArgs = mockIntentoLoginCount.mock.calls[0][0];
      const quinceMinsAtras = callArgs.where.creado_en.gte as Date;
      const diferencia = ahora.getTime() - quinceMinsAtras.getTime();
      expect(diferencia).toBe(15 * 60 * 1000);
    });

    it("el bloqueo expira después de 15 minutos (intentos antiguos no cuentan)", async () => {
      // Simular que los 5 intentos fallidos son de hace más de 15 min
      // La query count devolverá 0 porque filtra por ventana
      mockIntentoLoginCount.mockResolvedValue(0);
      mockUsuarioFindUnique.mockResolvedValue({
        id: "uuid-4",
        nombre: "Desbloqueado",
        email: "expirado@test.com",
        password_hash: "$2a$12$hash",
      });
      mockBcryptCompare.mockResolvedValue(true);
      mockIntentoLoginCreate.mockResolvedValue({});

      const resultado = await authorize({
        email: "expirado@test.com",
        password: "correcta",
      });

      // No debería lanzar ACCOUNT_LOCKED
      expect(resultado).not.toBeNull();
      expect(resultado).toMatchObject({
        id: "uuid-4",
        email: "expirado@test.com",
      });
    });
  });

  // ─── Registro de intentos ─────────────────────────────────────────────────

  describe("Registro de intentos en intento_login", () => {
    it("registra intento fallido cuando el usuario no existe", async () => {
      mockIntentoLoginCount.mockResolvedValue(0);
      mockUsuarioFindUnique.mockResolvedValue(null);
      mockIntentoLoginCreate.mockResolvedValue({});

      const resultado = await authorize({
        email: "noexiste@test.com",
        password: "pass",
      });

      expect(resultado).toBeNull();
      expect(mockIntentoLoginCreate).toHaveBeenCalledWith({
        data: { email: "noexiste@test.com", exitoso: false },
      });
    });

    it("registra intento fallido cuando la contraseña es incorrecta", async () => {
      mockIntentoLoginCount.mockResolvedValue(0);
      mockUsuarioFindUnique.mockResolvedValue({
        id: "uuid-5",
        nombre: "Test",
        email: "incorrecto@test.com",
        password_hash: "$2a$12$hash",
      });
      mockBcryptCompare.mockResolvedValue(false);
      mockIntentoLoginCreate.mockResolvedValue({});

      const resultado = await authorize({
        email: "incorrecto@test.com",
        password: "mala",
      });

      expect(resultado).toBeNull();
      expect(mockIntentoLoginCreate).toHaveBeenCalledWith({
        data: { email: "incorrecto@test.com", exitoso: false },
      });
    });

    it("registra intento exitoso cuando el login es correcto", async () => {
      mockIntentoLoginCount.mockResolvedValue(0);
      mockUsuarioFindUnique.mockResolvedValue({
        id: "uuid-6",
        nombre: "Exitoso",
        email: "bien@test.com",
        password_hash: "$2a$12$hash",
      });
      mockBcryptCompare.mockResolvedValue(true);
      mockIntentoLoginCreate.mockResolvedValue({});

      await authorize({ email: "bien@test.com", password: "correcta" });

      expect(mockIntentoLoginCreate).toHaveBeenCalledWith({
        data: { email: "bien@test.com", exitoso: true },
      });
    });

    it("registra intento fallido cuando el email está bloqueado", async () => {
      mockIntentoLoginCount.mockResolvedValue(5);
      mockIntentoLoginCreate.mockResolvedValue({});

      await expect(
        authorize({ email: "locked@test.com", password: "pass" }),
      ).rejects.toThrow("ACCOUNT_LOCKED");

      // También se registra el intento bloqueado como fallido
      expect(mockIntentoLoginCreate).toHaveBeenCalledWith({
        data: { email: "locked@test.com", exitoso: false },
      });
    });
  });

  // ─── Login exitoso tras intentos previos (no bloqueo) ─────────────────────

  describe("Login exitoso con intentos previos", () => {
    it("permite login exitoso si hay 4 intentos fallidos previos (umbral no alcanzado)", async () => {
      mockIntentoLoginCount.mockResolvedValue(4);
      mockUsuarioFindUnique.mockResolvedValue({
        id: "uuid-7",
        nombre: "Casi",
        email: "casi@test.com",
        password_hash: "$2a$12$hash",
      });
      mockBcryptCompare.mockResolvedValue(true);
      mockIntentoLoginCreate.mockResolvedValue({});

      const resultado = await authorize({
        email: "casi@test.com",
        password: "correcta",
      });

      expect(resultado).toMatchObject({
        id: "uuid-7",
        name: "Casi",
        email: "casi@test.com",
      });
      // Se registra como exitoso
      expect(mockIntentoLoginCreate).toHaveBeenCalledWith({
        data: { email: "casi@test.com", exitoso: true },
      });
    });
  });

  // ─── Credenciales vacías/nulas ────────────────────────────────────────────

  describe("Credenciales vacías o nulas", () => {
    it("retorna null si email no está presente", async () => {
      const resultado = await authorize({ password: "pass" });
      expect(resultado).toBeNull();
    });

    it("retorna null si password no está presente", async () => {
      const resultado = await authorize({ email: "test@test.com" });
      expect(resultado).toBeNull();
    });

    it("retorna null si credentials están vacías", async () => {
      const resultado = await authorize({});
      expect(resultado).toBeNull();
    });
  });

  // ─── Normalización del email ──────────────────────────────────────────────

  describe("Normalización del email en bloqueo", () => {
    it("normaliza el email a minúsculas al verificar bloqueo", async () => {
      mockIntentoLoginCount.mockResolvedValue(5);
      mockIntentoLoginCreate.mockResolvedValue({});

      await expect(
        authorize({ email: "  UPPER@Test.COM  ", password: "pass" }),
      ).rejects.toThrow("ACCOUNT_LOCKED");

      // Verifica que se consultó con el email normalizado
      expect(mockIntentoLoginCount).toHaveBeenCalledWith({
        where: expect.objectContaining({
          email: "upper@test.com",
        }),
      });
    });
  });
});
