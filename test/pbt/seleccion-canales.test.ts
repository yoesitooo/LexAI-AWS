/**
 * Feature: lexai-mvp, Property 20: Selección de canales por configuración y datos
 * (envía por un canal sii activo y con datos requeridos; los sin datos se omiten
 * y los demás continúan)
 *
 * **Validates: Requisitos R10.4, R10.6**
 *
 * Propiedades verificadas:
 *  1. Un canal envía sii está activo en la configuración Y los datos requeridos existen
 *  2. Si un canal carece de datos requeridos (email inválido) → se omite, los demás continúan
 *  3. In-app está disponible siempre que canal_inapp=true (no necesita datos extra)
 *  4. Email está disponible sii canal_email=true Y el destinatario tiene email válido
 *
 * Generadores: combinaciones aleatorias de ConfiguracionUsuario y datos de destinatario
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fc from "fast-check";
import { CanalInApp } from "../../lib/notificaciones/canal-inapp";
import { CanalEmail, esEmailValido } from "../../lib/notificaciones/canal-email";
import type {
  ConfiguracionUsuario,
  ContenidoNotificacion,
  DatosDestinatario,
  CanalNotificacion,
} from "../../lib/notificaciones/tipos";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock de Prisma para CanalInApp (evitar acceso real a DB)
vi.mock("@/lib/db", () => ({
  prisma: {
    notificacionInapp: {
      create: vi.fn().mockResolvedValue({
        id: "mock-id",
        usuario_id: "u1",
        notificacion_id: null,
        titulo: "t",
        mensaje: "m",
        leida: false,
        creado_en: new Date(),
      }),
    },
  },
}));

// Mock de Resend para CanalEmail (evitar llamadas reales)
vi.mock("resend", () => {
  class MockResend {
    emails = { send: vi.fn().mockResolvedValue({ data: { id: "email-1" }, error: null }) };
  }
  return { Resend: MockResend };
});

// Mock de config para evitar validación de env
vi.mock("@/lib/config", () => ({
  env: {
    RESEND_API_KEY: "re_test_key",
    EMAIL_FROM: "noreply@lexai.co",
  },
}));

// ---------------------------------------------------------------------------
// Generadores
// ---------------------------------------------------------------------------

/** Genera una configuración de usuario aleatoria */
const configArb: fc.Arbitrary<ConfiguracionUsuario> = fc.record({
  canal_inapp: fc.boolean(),
  canal_email: fc.boolean(),
  canal_whatsapp: fc.boolean(),
  numero_whatsapp: fc.oneof(
    fc.constant(null),
    fc.stringMatching(/^\+\d{8,15}$/),
  ),
});

/** Genera emails válidos */
const emailValidoArb: fc.Arbitrary<string> = fc
  .tuple(
    fc.stringMatching(/^[a-z][a-z0-9]{1,10}$/),
    fc.stringMatching(/^[a-z][a-z0-9]{1,8}$/),
    fc.constantFrom("com", "co", "org", "net"),
  )
  .map(([local, dominio, tld]) => `${local}@${dominio}.${tld}`);

/** Genera emails inválidos */
const emailInvalidoArb: fc.Arbitrary<string> = fc.oneof(
  fc.constant(""),
  fc.constant("sin-arroba.com"),
  fc.constant("@dominio.com"),
  fc.constant("user@"),
  fc.constant("user@dominio"),
  fc.constant("   "),
  fc.stringMatching(/^[a-z]{1,5}$/), // solo texto sin @
);

/** Genera un email que puede ser válido o inválido */
const emailArb: fc.Arbitrary<string> = fc.oneof(emailValidoArb, emailInvalidoArb);

/** Genera datos de destinatario aleatorios */
const destinatarioArb = (email: string): fc.Arbitrary<DatosDestinatario> =>
  fc.record({
    usuario_id: fc.uuid(),
    email: fc.constant(email),
    nombre: fc.stringMatching(/^[A-Z][a-z]{2,15}( [A-Z][a-z]{2,15})?$/),
    numero_whatsapp: fc.oneof(
      fc.constant(null as string | null | undefined),
      fc.stringMatching(/^\+\d{8,15}$/) as fc.Arbitrary<string | null | undefined>,
    ),
  });

/** Contenido de notificación fijo para las pruebas */
const contenidoFijo: ContenidoNotificacion = {
  titulo: "Plazo por vencer",
  mensaje: "Test de propiedad de selección de canales.",
  notificacion_id: "notif-pbt-1",
};

// ---------------------------------------------------------------------------
// Propiedades
// ---------------------------------------------------------------------------

describe("PBT — Selección de canales por configuración y datos (Property 20)", () => {
  let canalInApp: CanalInApp;
  let canalEmail: CanalEmail;
  let mockEmailSend: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    canalInApp = new CanalInApp();
    mockEmailSend = vi.fn().mockResolvedValue({ data: { id: "email-mock" }, error: null });
    const fakeResend = { emails: { send: mockEmailSend } } as any;
    canalEmail = new CanalEmail(fakeResend, "noreply@lexai.co");
  });

  it("Property 20.1: CanalInApp está disponible sii canal_inapp=true (sin datos extra requeridos)", () => {
    fc.assert(
      fc.property(
        configArb,
        (config) => {
          const resultado = canalInApp.disponiblePara(config);

          // In-app está disponible exactamente cuando canal_inapp es true
          // No depende de email, whatsapp ni ningún otro dato
          expect(resultado).toBe(config.canal_inapp);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("Property 20.2: CanalEmail reporta disponible sii canal_email=true en config", () => {
    fc.assert(
      fc.property(
        configArb,
        (config) => {
          const resultado = canalEmail.disponiblePara(config);

          // disponiblePara solo verifica el flag del canal
          expect(resultado).toBe(config.canal_email);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("Property 20.3: CanalEmail envía exitosamente sii canal_email=true Y email del destinatario es válido", () => {
    fc.assert(
      fc.asyncProperty(
        configArb,
        emailArb,
        async (config, email) => {
          const destinatario: DatosDestinatario = {
            usuario_id: "u-test",
            email,
            nombre: "Test Usuario",
          };

          const disponible = canalEmail.disponiblePara(config);
          const emailValido = esEmailValido(email);

          if (!disponible) {
            // Si canal_email=false, el canal no se selecciona para envío
            // (el dispatch lo filtra antes de llamar enviar)
            expect(config.canal_email).toBe(false);
            return;
          }

          // Si está disponible (canal_email=true), intentamos enviar
          const resultado = await canalEmail.enviar(destinatario, contenidoFijo);

          if (emailValido) {
            // Con email válido → envío exitoso
            expect(resultado.ok).toBe(true);
          } else {
            // Sin email válido → envío omitido con error (R10.4)
            expect(resultado.ok).toBe(false);
            if (!resultado.ok) {
              expect(resultado.error.canal).toBe("email");
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("Property 20.4: Si un canal carece de datos requeridos, se omite y los demás continúan", () => {
    fc.assert(
      fc.asyncProperty(
        configArb.filter((c) => c.canal_inapp && c.canal_email),
        emailInvalidoArb,
        async (config, emailInvalido) => {
          // Config con ambos canales activos pero email inválido
          const destinatario: DatosDestinatario = {
            usuario_id: "u-aislamiento",
            email: emailInvalido,
            nombre: "Abogado Test",
          };

          // Simular el dispatch: filtrar canales disponibles y enviar
          const canales: CanalNotificacion[] = [canalInApp, canalEmail];
          const canalesDisponibles = canales.filter((c) => c.disponiblePara(config));

          // Con ambos canales activos, ambos pasan el filtro disponiblePara
          expect(canalesDisponibles.length).toBe(2);

          // Enviar por todos y recoger resultados (aislamiento)
          const resultados = await Promise.allSettled(
            canalesDisponibles.map((canal) =>
              canal.enviar(destinatario, contenidoFijo),
            ),
          );

          // InApp debe tener éxito (no necesita datos extra)
          const resInApp = resultados[0];
          expect(resInApp.status).toBe("fulfilled");
          if (resInApp.status === "fulfilled") {
            expect(resInApp.value.ok).toBe(true);
          }

          // Email debe fallar (email inválido) pero sin bloquear al in-app
          const resEmail = resultados[1];
          expect(resEmail.status).toBe("fulfilled"); // No lanza excepción
          if (resEmail.status === "fulfilled") {
            expect(resEmail.value.ok).toBe(false);
            if (!resEmail.value.ok) {
              expect(resEmail.value.error.canal).toBe("email");
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("Property 20.5: La selección de canales reproduce el filtrado del dispatch real (canales activos = subconjunto filtrado)", () => {
    fc.assert(
      fc.property(
        configArb,
        (config) => {
          const canales: CanalNotificacion[] = [canalInApp, canalEmail];

          // Simular la lógica del dispatch real:
          // canales.filter((canal) => canal.disponiblePara(configUsuario))
          const seleccionados = canales.filter((c) => c.disponiblePara(config));
          const nombresSeleccionados = seleccionados.map((c) => c.nombre);

          // Verificar que el filtrado es correcto
          if (config.canal_inapp) {
            expect(nombresSeleccionados).toContain("inapp");
          } else {
            expect(nombresSeleccionados).not.toContain("inapp");
          }

          if (config.canal_email) {
            expect(nombresSeleccionados).toContain("email");
          } else {
            expect(nombresSeleccionados).not.toContain("email");
          }

          // La cantidad de seleccionados es exactamente la suma de flags activos
          const esperados =
            (config.canal_inapp ? 1 : 0) + (config.canal_email ? 1 : 0);
          expect(seleccionados.length).toBe(esperados);
        },
      ),
      { numRuns: 100 },
    );
  });
});
