/**
 * Tests para CanalEmail — Canal de notificación por email (Resend)
 *
 * Requisitos: R10.3, R10.4
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { CanalEmail, esEmailValido } from "./canal-email";
import type {
  ConfiguracionUsuario,
  ContenidoNotificacion,
  DatosDestinatario,
} from "./tipos";

// Mock de Resend — debe ser un constructor real
vi.mock("resend", () => {
  class MockResend {
    emails = { send: vi.fn() };
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

describe("esEmailValido", () => {
  it("acepta emails válidos", () => {
    expect(esEmailValido("abogado@correo.com")).toBe(true);
    expect(esEmailValido("juan.perez@bufete.co")).toBe(true);
    expect(esEmailValido("user+tag@domain.org")).toBe(true);
  });

  it("rechaza emails inválidos", () => {
    expect(esEmailValido("")).toBe(false);
    expect(esEmailValido("   ")).toBe(false);
    expect(esEmailValido("sin-arroba.com")).toBe(false);
    expect(esEmailValido("@dominio.com")).toBe(false);
    expect(esEmailValido("user@")).toBe(false);
    expect(esEmailValido("user@dominio")).toBe(false);
    expect(esEmailValido("user @dominio.com")).toBe(false);
  });

  it("rechaza null y undefined", () => {
    expect(esEmailValido(null)).toBe(false);
    expect(esEmailValido(undefined)).toBe(false);
  });

  it("rechaza emails que exceden 254 caracteres", () => {
    const longEmail = "a".repeat(243) + "@dominio.com"; // 243 + 12 = 255 > 254
    expect(esEmailValido(longEmail)).toBe(false);
  });
});

describe("CanalEmail", () => {
  let canal: CanalEmail;
  let mockSend: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSend = vi.fn();
    const fakeResend = { emails: { send: mockSend } } as any;
    canal = new CanalEmail(fakeResend, "noreply@lexai.co");
  });

  // ─── nombre ─────────────────────────────────────────────────────────────────

  it("tiene nombre 'email'", () => {
    expect(canal.nombre).toBe("email");
  });

  // ─── disponiblePara ─────────────────────────────────────────────────────────

  describe("disponiblePara", () => {
    it("devuelve true si canal_email está activo", () => {
      const config: ConfiguracionUsuario = {
        canal_inapp: true,
        canal_email: true,
        canal_whatsapp: false,
        numero_whatsapp: null,
      };

      expect(canal.disponiblePara(config)).toBe(true);
    });

    it("devuelve false si canal_email está inactivo", () => {
      const config: ConfiguracionUsuario = {
        canal_inapp: true,
        canal_email: false,
        canal_whatsapp: true,
        numero_whatsapp: "+573001234567",
      };

      expect(canal.disponiblePara(config)).toBe(false);
    });
  });

  // ─── enviar ─────────────────────────────────────────────────────────────────

  describe("enviar", () => {
    const destinatario: DatosDestinatario = {
      usuario_id: "user-uuid-123",
      email: "abogado@correo.com",
      nombre: "Juan Pérez",
    };

    const contenido: ContenidoNotificacion = {
      titulo: "Plazo por vencer",
      mensaje: "El plazo del proceso 12345678901234567890123 vence mañana.",
      notificacion_id: "notif-uuid-456",
    };

    it("envía email vía Resend con titulo como subject y mensaje como body (R10.3)", async () => {
      mockSend.mockResolvedValue({ data: { id: "email-id-1" }, error: null });

      const resultado = await canal.enviar(destinatario, contenido);

      expect(resultado.ok).toBe(true);
      expect(mockSend).toHaveBeenCalledWith({
        from: "noreply@lexai.co",
        to: "abogado@correo.com",
        subject: "Plazo por vencer",
        text: "El plazo del proceso 12345678901234567890123 vence mañana.",
      });
    });

    it("retorna error si el email del destinatario es inválido (R10.4)", async () => {
      const destinatarioSinEmail: DatosDestinatario = {
        usuario_id: "user-uuid-789",
        email: "no-es-email",
        nombre: "María García",
      };

      const resultado = await canal.enviar(destinatarioSinEmail, contenido);

      expect(resultado.ok).toBe(false);
      if (!resultado.ok) {
        expect(resultado.error.canal).toBe("email");
        expect(resultado.error.mensaje).toContain("no válido");
        expect(resultado.error.detalle).toContain("inválido");
      }
      // No debe intentar enviar
      expect(mockSend).not.toHaveBeenCalled();
    });

    it("retorna error si el email del destinatario está vacío (R10.4)", async () => {
      const destinatarioVacio: DatosDestinatario = {
        usuario_id: "user-uuid-789",
        email: "",
        nombre: "María García",
      };

      const resultado = await canal.enviar(destinatarioVacio, contenido);

      expect(resultado.ok).toBe(false);
      if (!resultado.ok) {
        expect(resultado.error.canal).toBe("email");
        expect(resultado.error.detalle).toContain("no tiene email");
      }
      expect(mockSend).not.toHaveBeenCalled();
    });

    it("retorna error si Resend responde con error", async () => {
      mockSend.mockResolvedValue({
        data: null,
        error: { message: "Invalid API key", name: "validation_error" },
      });

      const resultado = await canal.enviar(destinatario, contenido);

      expect(resultado.ok).toBe(false);
      if (!resultado.ok) {
        expect(resultado.error.canal).toBe("email");
        expect(resultado.error.mensaje).toContain("Error al enviar email");
        expect(resultado.error.detalle).toContain("Invalid API key");
      }
    });

    it("retorna error si Resend lanza excepción (red, timeout, etc.)", async () => {
      mockSend.mockRejectedValue(new Error("Network timeout"));

      const resultado = await canal.enviar(destinatario, contenido);

      expect(resultado.ok).toBe(false);
      if (!resultado.ok) {
        expect(resultado.error.canal).toBe("email");
        expect(resultado.error.mensaje).toContain("No se pudo enviar");
        expect(resultado.error.detalle).toContain("Network timeout");
      }
    });

    it("no lanza excepción ante fallo de Resend", async () => {
      mockSend.mockRejectedValue(new Error("Connection refused"));

      await expect(
        canal.enviar(destinatario, contenido),
      ).resolves.toBeDefined();
    });

    it("trimea espacios del email antes de enviar", async () => {
      const destinatarioConEspacios: DatosDestinatario = {
        usuario_id: "user-uuid-123",
        email: "  abogado@correo.com  ",
        nombre: "Juan Pérez",
      };

      mockSend.mockResolvedValue({ data: { id: "email-id-2" }, error: null });

      const resultado = await canal.enviar(destinatarioConEspacios, contenido);

      expect(resultado.ok).toBe(true);
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "abogado@correo.com",
        }),
      );
    });
  });
});
