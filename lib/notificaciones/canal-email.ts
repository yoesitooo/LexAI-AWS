/**
 * Canal email — Servicio de Notificaciones LexAI MVP
 *
 * Implementación del canal de notificación por email usando Resend API.
 * Envía cuando el canal está activo y el correo del destinatario es válido;
 * si el correo no es válido, omite el envío, registra el error y continúa.
 *
 * Requisitos: R10.3, R10.4
 */

import { Resend } from "resend";
import { env } from "@/lib/config";
import type {
  CanalNotificacion,
  ConfiguracionUsuario,
  ContenidoNotificacion,
  DatosDestinatario,
  ErrorCanal,
  Result,
} from "./tipos";

/**
 * Valida formato básico de email.
 * Verifica que tenga estructura local@dominio.tld con al menos un carácter
 * antes del @, un dominio y un punto en el dominio.
 */
export function esEmailValido(email: string | undefined | null): boolean {
  if (!email || typeof email !== "string") return false;
  const trimmed = email.trim();
  if (trimmed.length === 0 || trimmed.length > 254) return false;
  // Regex simple y suficiente para validación básica de email
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(trimmed);
}

/**
 * Canal de notificación por email (Resend).
 *
 * Disponible cuando `canal_email` está activo en la configuración del usuario.
 * Al enviar, utiliza Resend API para despachar el email con el título como
 * subject y el mensaje como body.
 */
export class CanalEmail implements CanalNotificacion {
  readonly nombre = "email";
  private resend: Resend;
  private emailFrom: string;

  constructor(resendInstance?: Resend, emailFrom?: string) {
    this.resend = resendInstance ?? new Resend(env.RESEND_API_KEY);
    this.emailFrom = emailFrom ?? env.EMAIL_FROM;
  }

  disponiblePara(config: ConfiguracionUsuario): boolean {
    return config.canal_email === true;
  }

  async enviar(
    destinatario: DatosDestinatario,
    contenido: ContenidoNotificacion,
  ): Promise<Result<void, ErrorCanal>> {
    // Validar que el destinatario tenga un email válido
    if (!esEmailValido(destinatario.email)) {
      const detalle = destinatario.email
        ? `Email inválido: "${destinatario.email}"`
        : "El destinatario no tiene email registrado.";

      console.error(
        `[CanalEmail] Omitiendo envío: ${detalle} (usuario_id: ${destinatario.usuario_id})`,
      );

      return {
        ok: false,
        error: {
          canal: this.nombre,
          mensaje: "Email del destinatario no válido; envío omitido.",
          detalle,
        },
      };
    }

    try {
      const { error } = await this.resend.emails.send({
        from: this.emailFrom,
        to: destinatario.email.trim(),
        subject: contenido.titulo,
        text: contenido.mensaje,
      });

      if (error) {
        console.error(`[CanalEmail] Error de Resend:`, error);
        return {
          ok: false,
          error: {
            canal: this.nombre,
            mensaje: "Error al enviar email vía Resend.",
            detalle: error.message ?? "Error desconocido de Resend",
          },
        };
      }

      return { ok: true, valor: undefined };
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : "Error desconocido";
      console.error(`[CanalEmail] Excepción al enviar email:`, err);
      return {
        ok: false,
        error: {
          canal: this.nombre,
          mensaje: "No se pudo enviar el email.",
          detalle: mensaje,
        },
      };
    }
  }
}

/** Instancia singleton del canal email. */
export const canalEmail = new CanalEmail();
