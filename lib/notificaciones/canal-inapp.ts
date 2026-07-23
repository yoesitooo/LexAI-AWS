/**
 * Canal in-app — Servicio de Notificaciones LexAI MVP
 *
 * Implementación del canal de notificación in-app. Registra la notificación
 * en la tabla `notificacion_inapp` para que el usuario la vea en su bandeja.
 *
 * Requisitos: R10.2
 */

import { prisma } from "@/lib/db";
import type {
  CanalNotificacion,
  ConfiguracionUsuario,
  ContenidoNotificacion,
  DatosDestinatario,
  ErrorCanal,
  Result,
} from "./tipos";

/**
 * Canal de notificación in-app.
 *
 * Disponible cuando `canal_inapp` está activo en la configuración del usuario.
 * Al enviar, crea un registro en `notificacion_inapp` con leida = false.
 */
export class CanalInApp implements CanalNotificacion {
  readonly nombre = "inapp";

  disponiblePara(config: ConfiguracionUsuario): boolean {
    return config.canal_inapp === true;
  }

  async enviar(
    destinatario: DatosDestinatario,
    contenido: ContenidoNotificacion,
  ): Promise<Result<void, ErrorCanal>> {
    try {
      await prisma.notificacionInapp.create({
        data: {
          usuario_id: destinatario.usuario_id,
          notificacion_id: contenido.notificacion_id ?? null,
          titulo: contenido.titulo,
          mensaje: contenido.mensaje,
          leida: false,
        },
      });

      return { ok: true, valor: undefined };
    } catch (error) {
      const mensaje =
        error instanceof Error ? error.message : "Error desconocido";
      console.error(`[CanalInApp] Error al registrar notificación:`, error);
      return {
        ok: false,
        error: {
          canal: this.nombre,
          mensaje: "No se pudo registrar la notificación in-app.",
          detalle: mensaje,
        },
      };
    }
  }
}

/** Instancia singleton del canal in-app. */
export const canalInApp = new CanalInApp();
