/**
 * Feature: lexai-mvp, Property 4: Configuración por defecto al crear usuario
 * (in-app activo; email y WhatsApp inactivos)
 *
 * Validates: Requisitos R1.6
 *
 * Propiedad verificada con fast-check (≥100 iteraciones):
 *  Para CUALQUIER datos de registro válidos (nombre, email, contraseña aleatorios),
 *  al crear el usuario vía POST /api/auth/register, la ConfiguracionUsuario
 *  resultante siempre tiene:
 *    - canal_inapp = true
 *    - canal_email = false
 *    - canal_whatsapp = false
 *    - frecuencia_revision = "diaria_habiles"
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fc from "fast-check";
import { NextRequest } from "next/server";

// Mock de Prisma — antes de importar la ruta
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

import { POST } from "../../app/api/auth/register/route";
import { prisma } from "@/lib/db";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TransactionFn = (tx: any) => Promise<any>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function crearRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// Generators (arbitrarios)
// ---------------------------------------------------------------------------

/**
 * Genera un nombre válido: string entre 1 y 100 caracteres (sin solo espacios).
 */
function nombreValidoArb(): fc.Arbitrary<string> {
  return fc
    .string({ minLength: 1, maxLength: 100, unit: "grapheme-ascii" })
    .filter((s) => s.trim().length >= 1 && s.trim().length <= 100);
}

/**
 * Genera un email válido: local@domain.tld, longitud total ≤254.
 */
function emailValidoArb(): fc.Arbitrary<string> {
  const localChars = "abcdefghijklmnopqrstuvwxyz0123456789._-+".split("");
  const domainChars = "abcdefghijklmnopqrstuvwxyz0123456789".split("");
  const tldChars = "abcdefghijklmnopqrstuvwxyz".split("");

  const localPartArb = fc
    .array(fc.constantFrom(...localChars), { minLength: 1, maxLength: 60 })
    .map((arr) => arr.join(""))
    .filter((s) => !s.startsWith(".") && !s.endsWith("."));

  const domainLabelArb = fc
    .array(fc.constantFrom(...domainChars), { minLength: 1, maxLength: 20 })
    .map((arr) => arr.join(""));

  const tldArb = fc
    .array(fc.constantFrom(...tldChars), { minLength: 2, maxLength: 6 })
    .map((arr) => arr.join(""));

  return fc
    .tuple(localPartArb, domainLabelArb, tldArb)
    .map(([local, domain, tld]) => `${local}@${domain}.${tld}`)
    .filter((email) => email.length <= 254);
}

/**
 * Genera una contraseña válida: longitud entre 8 y 128 caracteres.
 */
function passwordValidoArb(): fc.Arbitrary<string> {
  return fc
    .string({ minLength: 8, maxLength: 128, unit: "grapheme-ascii" })
    .filter((s) => s.length >= 8 && s.length <= 128);
}

// ---------------------------------------------------------------------------
// Tests de propiedad
// ---------------------------------------------------------------------------

describe("PBT — Configuración por defecto al crear usuario (Property 4)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Property 4: Para cualquier datos de registro válidos, la ConfiguracionUsuario se crea con canal_inapp=true, canal_email=false, canal_whatsapp=false, frecuencia_revision='diaria_habiles'", async () => {
    await fc.assert(
      fc.asyncProperty(
        nombreValidoArb(),
        emailValidoArb(),
        passwordValidoArb(),
        async (nombre, email, password) => {
          vi.clearAllMocks();

          // Simular que el email no existe (no hay duplicado)
          vi.mocked(prisma.usuario.findUnique).mockResolvedValue(null);

          // Capturar la llamada a configuracionUsuario.create dentro de la transacción
          const mockCrearConfig = vi.fn().mockResolvedValue({});
          const mockCrearUsuario = vi.fn().mockResolvedValue({
            id: "uuid-generado",
            nombre: nombre.trim(),
            email: email.trim().toLowerCase(),
            creado_en: new Date(),
          });

          vi.mocked(prisma.$transaction).mockImplementation(
            async (fn: TransactionFn) => {
              const tx = {
                usuario: { create: mockCrearUsuario },
                configuracionUsuario: { create: mockCrearConfig },
              };
              return fn(tx as never);
            },
          );

          const req = crearRequest({ nombre, email, password });
          const res = await POST(req);

          // Verificar registro exitoso
          expect(res.status).toBe(201);

          // Verificar que configuracionUsuario.create fue llamada exactamente una vez
          expect(mockCrearConfig).toHaveBeenCalledTimes(1);

          // Extraer los datos pasados a configuracionUsuario.create
          const callData = mockCrearConfig.mock.calls[0][0].data;

          // Verificar defaults exactos (R1.6)
          expect(callData.canal_inapp).toBe(true);
          expect(callData.canal_email).toBe(false);
          expect(callData.canal_whatsapp).toBe(false);
          expect(callData.frecuencia_revision).toBe("diaria_habiles");

          // Verificar que usuario_id se asigna correctamente
          expect(callData.usuario_id).toBe("uuid-generado");
        },
      ),
      { numRuns: 100 },
    );
  });
});
