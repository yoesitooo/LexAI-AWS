/**
 * Tests para CanalInApp — Canal de notificación in-app
 *
 * Requisitos: R10.2
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { CanalInApp } from "./canal-inapp";
import type {
  ConfiguracionUsuario,
  ContenidoNotificacion,
  DatosDestinatario,
} from "./tipos";

// Mock de Prisma
vi.mock("@/lib/db", () => ({
  prisma: {
    notificacionInapp: {
      create: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/db";

const mockCreate = vi.mocked(prisma.notificacionInapp.create);

describe("CanalInApp", () => {
  let canal: CanalInApp;

  beforeEach(() => {
    vi.clearAllMocks();
    canal = new CanalInApp();
  });

  // ─── nombre ─────────────────────────────────────────────────────────────────

  it("tiene nombre 'inapp'", () => {
    expect(canal.nombre).toBe("inapp");
  });

  // ─── disponiblePara ─────────────────────────────────────────────────────────

  describe("disponiblePara", () => {
    it("devuelve true si canal_inapp está activo", () => {
      const config: ConfiguracionUsuario = {
        canal_inapp: true,
        canal_email: false,
        canal_whatsapp: false,
        numero_whatsapp: null,
      };

      expect(canal.disponiblePara(config)).toBe(true);
    });

    it("devuelve false si canal_inapp está inactivo", () => {
      const config: ConfiguracionUsuario = {
        canal_inapp: false,
        canal_email: true,
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

    it("registra la notificación en la base de datos y retorna éxito (R10.2)", async () => {
      mockCreate.mockResolvedValue({
        id: "inapp-uuid",
        usuario_id: "user-uuid-123",
        notificacion_id: "notif-uuid-456",
        titulo: contenido.titulo,
        mensaje: contenido.mensaje,
        leida: false,
        creado_en: new Date(),
      });

      const resultado = await canal.enviar(destinatario, contenido);

      expect(resultado.ok).toBe(true);
      expect(mockCreate).toHaveBeenCalledWith({
        data: {
          usuario_id: "user-uuid-123",
          notificacion_id: "notif-uuid-456",
          titulo: "Plazo por vencer",
          mensaje:
            "El plazo del proceso 12345678901234567890123 vence mañana.",
          leida: false,
        },
      });
    });

    it("maneja notificacion_id nulo (notificación sin asociar a notificación programada)", async () => {
      const contenidoSinNotif: ContenidoNotificacion = {
        titulo: "Alerta inmediata",
        mensaje: "Su plazo ha vencido hoy.",
      };

      mockCreate.mockResolvedValue({
        id: "inapp-uuid-2",
        usuario_id: "user-uuid-123",
        notificacion_id: null,
        titulo: contenidoSinNotif.titulo,
        mensaje: contenidoSinNotif.mensaje,
        leida: false,
        creado_en: new Date(),
      });

      const resultado = await canal.enviar(destinatario, contenidoSinNotif);

      expect(resultado.ok).toBe(true);
      expect(mockCreate).toHaveBeenCalledWith({
        data: {
          usuario_id: "user-uuid-123",
          notificacion_id: null,
          titulo: "Alerta inmediata",
          mensaje: "Su plazo ha vencido hoy.",
          leida: false,
        },
      });
    });

    it("retorna error si la persistencia falla", async () => {
      mockCreate.mockRejectedValue(new Error("Connection refused"));

      const resultado = await canal.enviar(destinatario, contenido);

      expect(resultado.ok).toBe(false);
      if (!resultado.ok) {
        expect(resultado.error.canal).toBe("inapp");
        expect(resultado.error.mensaje).toContain("No se pudo registrar");
        expect(resultado.error.detalle).toContain("Connection refused");
      }
    });

    it("no lanza excepción ante error de base de datos", async () => {
      mockCreate.mockRejectedValue(new Error("DB timeout"));

      // No debe lanzar
      await expect(
        canal.enviar(destinatario, contenido),
      ).resolves.toBeDefined();
    });
  });
});
