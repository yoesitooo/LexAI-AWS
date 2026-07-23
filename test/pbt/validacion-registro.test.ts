/**
 * Feature: lexai-mvp, Property 3: Validación de datos de registro
 * (acepta sii nombre 1–100, email válido ≤254, contraseña 8–128;
 *  si no, rechaza con el mensaje correspondiente)
 *
 * Validates: Requisitos R1.3, R1.4, R1.5
 *
 * Propiedades verificadas con fast-check (≥100 iteraciones):
 *  1. Nombre aceptado sii longitud (trimmed) entre 1 y 100 caracteres
 *  2. Email aceptado sii formato válido Y longitud ≤254
 *  3. Contraseña aceptada sii longitud entre 8 y 128 caracteres
 *  4. Todos válidos → acepta (201, registraría si no hay duplicado)
 *  5. Cualquiera inválido → rechaza con 400 y mensaje correspondiente
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

/**
 * Configura los mocks de Prisma para un registro exitoso (sin duplicado).
 */
function configurarMocksExitoso() {
  vi.mocked(prisma.usuario.findUnique).mockResolvedValue(null);
  vi.mocked(prisma.$transaction).mockImplementation(async (fn: TransactionFn) => {
    const tx = {
      usuario: {
        create: vi.fn().mockResolvedValue({
          id: "uuid-test",
          nombre: "Test",
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
 * Genera un nombre inválido: vacío, solo espacios, o >100 caracteres (trimmed).
 */
function nombreInvalidoArb(): fc.Arbitrary<string> {
  return fc.oneof(
    // Vacío
    fc.constant(""),
    // Solo espacios (1–10 espacios)
    fc.integer({ min: 1, max: 10 }).map((n) => " ".repeat(n)),
    // Más de 100 caracteres (trimmed)
    fc
      .integer({ min: 101, max: 200 })
      .map((len) => "x".repeat(len)),
  );
}

/**
 * Genera un email válido: local@domain.tld, longitud total ≤254.
 * Genera strings que cumplen la regex /^[^\s@]+@[^\s@]+\.[^\s@]+$/ del validador.
 */
function emailValidoArb(): fc.Arbitrary<string> {
  const localChars = 'abcdefghijklmnopqrstuvwxyz0123456789._-+'.split('');
  const domainChars = 'abcdefghijklmnopqrstuvwxyz0123456789'.split('');
  const tldChars = 'abcdefghijklmnopqrstuvwxyz'.split('');

  const localPartArb = fc
    .array(fc.constantFrom(...localChars), { minLength: 1, maxLength: 60 })
    .map((arr) => arr.join(''))
    .filter((s) => !s.startsWith('.') && !s.endsWith('.'));

  const domainLabelArb = fc
    .array(fc.constantFrom(...domainChars), { minLength: 1, maxLength: 20 })
    .map((arr) => arr.join(''));

  const tldArb = fc
    .array(fc.constantFrom(...tldChars), { minLength: 2, maxLength: 6 })
    .map((arr) => arr.join(''));

  return fc
    .tuple(localPartArb, domainLabelArb, tldArb)
    .map(([local, domain, tld]) => `${local}@${domain}.${tld}`)
    .filter((email) => email.length <= 254);
}

/**
 * Genera un email inválido por formato o longitud >254.
 */
function emailInvalidoArb(): fc.Arbitrary<string> {
  const alphaChars = 'abcdefghijklmnopqrstuvwxyz0123456789'.split('');

  return fc.oneof(
    // Sin @ (no pasa regex)
    fc
      .array(fc.constantFrom(...alphaChars), { minLength: 1, maxLength: 50 })
      .map((arr) => arr.join('')),
    // Sin punto en dominio (user@domain — no matching la regex /^[^\s@]+@[^\s@]+\.[^\s@]+$/)
    fc
      .tuple(
        fc.array(fc.constantFrom(...alphaChars), { minLength: 1, maxLength: 10 }).map((a) => a.join('')),
        fc.array(fc.constantFrom(...alphaChars), { minLength: 1, maxLength: 10 }).map((a) => a.join('')),
      )
      .map(([local, domain]) => `${local}@${domain}`),
    // Longitud >254 con formato válido (255 chars)
    fc.constant("a".repeat(246) + "@test.com"), // 246 + 1 + 4 + 1 + 3 = 255 > 254
  );
}

/**
 * Genera una contraseña válida: longitud entre 8 y 128 caracteres.
 */
function passwordValidoArb(): fc.Arbitrary<string> {
  return fc.string({ minLength: 8, maxLength: 128, unit: "grapheme-ascii" })
    .filter((s) => s.length >= 8 && s.length <= 128);
}

/**
 * Genera una contraseña inválida: <8 o >128 caracteres.
 */
function passwordInvalidoArb(): fc.Arbitrary<string> {
  return fc.oneof(
    // Muy corta (0–7 caracteres)
    fc.integer({ min: 0, max: 7 }).map((len) => "a".repeat(len)),
    // Muy larga (129–200 caracteres)
    fc.integer({ min: 129, max: 200 }).map((len) => "a".repeat(len)),
  );
}

// ---------------------------------------------------------------------------
// Tests de propiedad
// ---------------------------------------------------------------------------

describe("PBT — Validación de datos de registro (Property 3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Property 3.1: Nombre aceptado sii longitud trimmed entre 1 y 100 — nombres válidos son aceptados", async () => {
    await fc.assert(
      fc.asyncProperty(nombreValidoArb(), async (nombre) => {
        configurarMocksExitoso();
        const req = crearRequest({
          nombre,
          email: "valido@test.com",
          password: "password123",
        });
        const res = await POST(req);
        expect(res.status).toBe(201);
      }),
      { numRuns: 100 },
    );
  });

  it("Property 3.2: Nombre inválido (vacío, solo espacios, o >100 trimmed) es rechazado con 400 y error en campo 'nombre'", async () => {
    await fc.assert(
      fc.asyncProperty(nombreInvalidoArb(), async (nombre) => {
        const req = crearRequest({
          nombre,
          email: "valido@test.com",
          password: "password123",
        });
        const res = await POST(req);
        const data = await res.json();
        expect(res.status).toBe(400);
        expect(data.detalles).toEqual(
          expect.arrayContaining([expect.objectContaining({ campo: "nombre" })]),
        );
      }),
      { numRuns: 100 },
    );
  });

  it("Property 3.3: Email válido (formato correcto y ≤254 caracteres) es aceptado", async () => {
    await fc.assert(
      fc.asyncProperty(emailValidoArb(), async (email) => {
        configurarMocksExitoso();
        const req = crearRequest({
          nombre: "Test User",
          email,
          password: "password123",
        });
        const res = await POST(req);
        expect(res.status).toBe(201);
      }),
      { numRuns: 100 },
    );
  });

  it("Property 3.4: Email inválido (formato incorrecto o >254 caracteres) es rechazado con 400 y error en campo 'email'", async () => {
    await fc.assert(
      fc.asyncProperty(emailInvalidoArb(), async (email) => {
        const req = crearRequest({
          nombre: "Test User",
          email,
          password: "password123",
        });
        const res = await POST(req);
        const data = await res.json();
        expect(res.status).toBe(400);
        expect(data.detalles).toEqual(
          expect.arrayContaining([expect.objectContaining({ campo: "email" })]),
        );
      }),
      { numRuns: 100 },
    );
  });

  it("Property 3.5: Contraseña válida (8–128 caracteres) es aceptada", async () => {
    await fc.assert(
      fc.asyncProperty(passwordValidoArb(), async (password) => {
        configurarMocksExitoso();
        const req = crearRequest({
          nombre: "Test User",
          email: "valido@test.com",
          password,
        });
        const res = await POST(req);
        expect(res.status).toBe(201);
      }),
      { numRuns: 100 },
    );
  });

  it("Property 3.6: Contraseña inválida (<8 o >128 caracteres) es rechazada con 400 y error en campo 'password'", async () => {
    await fc.assert(
      fc.asyncProperty(passwordInvalidoArb(), async (password) => {
        const req = crearRequest({
          nombre: "Test User",
          email: "valido@test.com",
          password,
        });
        const res = await POST(req);
        const data = await res.json();
        expect(res.status).toBe(400);
        expect(data.detalles).toEqual(
          expect.arrayContaining([expect.objectContaining({ campo: "password" })]),
        );
      }),
      { numRuns: 100 },
    );
  });

  it("Property 3.7: Todos los campos válidos simultáneamente → acepta con 201", async () => {
    await fc.assert(
      fc.asyncProperty(
        nombreValidoArb(),
        emailValidoArb(),
        passwordValidoArb(),
        async (nombre, email, password) => {
          configurarMocksExitoso();
          const req = crearRequest({ nombre, email, password });
          const res = await POST(req);
          expect(res.status).toBe(201);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("Property 3.8: Cualquier campo inválido → rechaza con 400 (al menos un error)", async () => {
    // Generamos al menos un campo inválido manteniendo el resto válido
    const casoInvalidoArb = fc.oneof(
      // Nombre inválido, email y password válidos
      fc.tuple(nombreInvalidoArb(), emailValidoArb(), passwordValidoArb())
        .map(([n, e, p]) => ({ nombre: n, email: e, password: p, campoInvalido: "nombre" })),
      // Email inválido, nombre y password válidos
      fc.tuple(nombreValidoArb(), emailInvalidoArb(), passwordValidoArb())
        .map(([n, e, p]) => ({ nombre: n, email: e, password: p, campoInvalido: "email" })),
      // Password inválido, nombre y email válidos
      fc.tuple(nombreValidoArb(), emailValidoArb(), passwordInvalidoArb())
        .map(([n, e, p]) => ({ nombre: n, email: e, password: p, campoInvalido: "password" })),
    );

    await fc.assert(
      fc.asyncProperty(casoInvalidoArb, async ({ nombre, email, password, campoInvalido }) => {
        const req = crearRequest({ nombre, email, password });
        const res = await POST(req);
        const data = await res.json();
        expect(res.status).toBe(400);
        expect(data.detalles).toEqual(
          expect.arrayContaining([expect.objectContaining({ campo: campoInvalido })]),
        );
      }),
      { numRuns: 100 },
    );
  });
});
