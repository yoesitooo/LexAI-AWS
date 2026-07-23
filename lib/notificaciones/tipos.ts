/**
 * Tipos e interfaces del Servicio de Notificaciones — LexAI MVP
 *
 * Define la interfaz genérica de canal de notificación y los tipos auxiliares.
 * Cada canal (in-app, email, WhatsApp) implementa `CanalNotificacion`.
 *
 * Requisitos: R10.2, R10.3, R10.5
 */

// ─── Tipos auxiliares ────────────────────────────────────────────────────────

/** Datos de configuración del usuario (relevante para determinar canales). */
export interface ConfiguracionUsuario {
  canal_inapp: boolean;
  canal_email: boolean;
  canal_whatsapp: boolean;
  numero_whatsapp: string | null;
}

/** Datos del destinatario de una notificación. */
export interface DatosDestinatario {
  usuario_id: string;
  email: string;
  nombre: string;
  numero_whatsapp?: string | null;
}

/** Contenido de una notificación a enviar. */
export interface ContenidoNotificacion {
  titulo: string;
  mensaje: string;
  /** ID de la notificación programada (tabla `notificacion`) si existe. */
  notificacion_id?: string | null;
}

/** Error al enviar por un canal. */
export interface ErrorCanal {
  canal: string;
  mensaje: string;
  detalle?: string;
}

/** Resultado genérico de una operación (éxito o fallo). */
export type Result<T, E> =
  | { ok: true; valor: T }
  | { ok: false; error: E };

// ─── Interfaz de canal ───────────────────────────────────────────────────────

/**
 * Interfaz común para canales de notificación.
 *
 * Cada implementación de canal:
 * - Determina si está disponible para un usuario dado su configuración.
 * - Envía la notificación al destinatario con el contenido proporcionado.
 * - Retorna un Result indicando éxito o fallo con detalle del error.
 */
export interface CanalNotificacion {
  /** Identificador del canal: 'inapp' | 'email' | 'whatsapp' */
  readonly nombre: string;

  /**
   * Determina si el canal está disponible para un usuario según su configuración.
   * Valida que el canal esté activo Y que los datos requeridos estén presentes.
   */
  disponiblePara(config: ConfiguracionUsuario): boolean;

  /**
   * Envía una notificación por este canal.
   * Retorna Result<void, ErrorCanal> para manejar errores sin excepciones.
   */
  enviar(
    destinatario: DatosDestinatario,
    contenido: ContenidoNotificacion,
  ): Promise<Result<void, ErrorCanal>>;
}
