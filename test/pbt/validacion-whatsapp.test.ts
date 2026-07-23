/**
 * Feature: lexai-mvp, Property 23: Validación del número de WhatsApp
 * (activación sii formato internacional válido 8–15 dígitos con prefijo;
 *  si no, permanece inactivo)
 *
 * Validates: Requisitos R11.4, R11.5
 *
 * Propiedades verificadas con fast-check (≥100 iteraciones):
 *  1. Número válido (+DDDDDDDD a +DDDDDDDDDDDDDDD) con canal_whatsapp=true → 200 (activa)
 *  2. Número inválido (no coincide /^\+\d{8,15}$/) con canal_whatsapp=true → 400 (permanece inactivo)
 *  3. Activación sin número (canal_whatsapp=true sin numero_whatsapp ni almacenado) → 400
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fc from "fast-check";
import { NextRequest } from "next/server";

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

import { PATCH } from "../../app/api/configuracion/route";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

const mockAuth = vi.mocked(auth);
const mockFindUnique = vi.mocked(prisma.configuracionUsuario.findUnique);
const mockUpdate = vi.mocked(prisma.configuracionUsuario.update);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CONFIG_BASE = {
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

function configurarSesionAutenticada() {
  mockAuth.mockResolvedValue({
    user: { id: "user-uuid", name: "Test", email: "test@test.com" },
    expires: "2025-01-01",
  } as never);
}

function configurarConfigBase(overrides: Record<string, unknown> = {}) {
  mockFindUnique.mockResolvedValue({ ...CONFIG_BASE, ...overrides } as never);
}

// ---------------------------------------------------------------------------
// Generators (arbitrarios)
// ---------------------------------------------------------------------------

/**
 * Genera un número de WhatsApp válido: + seguido de 8–15 dígitos numéricos.
 * Coincide con la regex /^\+\d{8,15}$/
 */
function numeroWhatsappValidoArb(): fc.Arbitrary<string> {
  return fc
    .integer({ min: 8, max: 15 })
    .chain((longitud) =>
      fc
        .array(fc.integer({ min: 0, max: 9 }), {
          minLength: longitud,
          maxLength: longitud,
        })
        .map((digitos) => "+" + digitos.join("")),
    );
}

/**
 * Genera un número de WhatsApp inválido que NO coincide con /^\+\d{8,15}$/
 * Categorías:
 *  - Sin prefijo + (solo dígitos)
 *  - Menos de 8 dígitos después de +
 *  - Más de 15 dígitos después de +
 *  - Contiene caracteres no numéricos después de +
 *  - Cadena vacía
 *  - Solo el prefijo +
 */
function numeroWhatsappInvalidoArb(): fc.Arbitrary<string> {
  const digitChars = "0123456789".split("");
  const nonDigitChars = "abcdefghijklmnopqrstuvwxyz!@#$%^&*() -".split("");

  return fc.oneof(
    // Sin prefijo + (8–15 dígitos pero sin el +)
    fc
      .integer({ min: 8, max: 15 })
      .chain((len) =>
        fc
          .array(fc.constantFrom(...digitChars), { minLength: len, maxLength: len })
          .map((arr) => arr.join("")),
      ),
    // Menos de 8 dígitos después de + (1–7 dígitos)
    fc
      .integer({ min: 1, max: 7 })
      .chain((len) =>
        fc
          .array(fc.constantFrom(...digitChars), { minLength: len, maxLength: len })
          .map((arr) => "+" + arr.join("")),
      ),
    // Más de 15 dígitos después de + (16–25 dígitos)
    fc
      .integer({ min: 16, max: 25 })
      .chain((len) =>
        fc
          .array(fc.constantFrom(...digitChars), { minLength: len, maxLength: len })
          .map((arr) => "+" + arr.join("")),
      ),
    // Contiene al menos un carácter no numérico después de +
    fc
      .tuple(
        fc.array(fc.constantFrom(...digitChars), { minLength: 3, maxLength: 7 }),
        fc.constantFrom(...nonDigitChars),
        fc.array(fc.constantFrom(...digitChars), { minLength: 3, maxLength: 7 }),
      )
      .map(([pre, c, post]) => "+" + pre.join("") + c + post.join("")),
    // Cadena vacía
    fc.constant(""),
    // Solo el prefijo +
    fc.constant("+"),
  );
}

// ---------------------------------------------------------------------------
// Tests de propiedad
// ---------------------------------------------------------------------------

describe("PBT — Validación del número de WhatsApp (Property 23)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    configurarSesionAutenticada();
    configurarConfigBase();
  });

  it("Property 23.1: Número válido (+8–15 dígitos) con canal_whatsapp=true → activa WhatsApp (200)", async () => {
    await fc.assert(
      fc.asyncProperty(numeroWhatsappValidoArb(), async (numero) => {
        vi.clearAllMocks();
        configurarSesionAutenticada();
        configurarConfigBase();
        mockUpdate.mockResolvedValue({
          ...CONFIG_BASE,
          canal_whatsapp: true,
          numero_whatsapp: numero,
        } as never);

        const req = crearPatchRequest({
          canal_whatsapp: true,
          numero_whatsapp: numero,
        });
        const res = await PATCH(req);
        const data = await res.json();

        expect(res.status).toBe(200);
        expect(data.canal_whatsapp).toBe(true);
        expect(data.numero_whatsapp).toBe(numero);
      }),
      { numRuns: 100 },
    );
  });

  it("Property 23.2: Número inválido con canal_whatsapp=true → rechaza activación (400)", async () => {
    await fc.assert(
      fc.asyncProperty(numeroWhatsappInvalidoArb(), async (numero) => {
        vi.clearAllMocks();
        configurarSesionAutenticada();
        configurarConfigBase();

        const req = crearPatchRequest({
          canal_whatsapp: true,
          numero_whatsapp: numero,
        });
        const res = await PATCH(req);
        const data = await res.json();

        expect(res.status).toBe(400);
        expect(data.campo).toBe("numero_whatsapp");
      }),
      { numRuns: 100 },
    );
  });

  it("Property 23.3: Activar WhatsApp sin número (ni en body ni almacenado) → rechaza (400)", async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generar variaciones: body sin numero_whatsapp, y config sin numero almacenado
        fc.constantFrom(
          {},
          { numero_whatsapp: undefined },
          { numero_whatsapp: null },
        ),
        async (bodyExtra) => {
          vi.clearAllMocks();
          configurarSesionAutenticada();
          // Config base tiene numero_whatsapp: null (sin número almacenado)
          configurarConfigBase({ numero_whatsapp: null });

          const req = crearPatchRequest({
            canal_whatsapp: true,
            ...bodyExtra,
          });
          const res = await PATCH(req);
          const data = await res.json();

          expect(res.status).toBe(400);
          expect(data.campo).toBe("numero_whatsapp");
        },
      ),
      { numRuns: 100 },
    );
  });
});
