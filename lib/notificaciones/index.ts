/**
 * Módulo de notificaciones — LexAI MVP
 *
 * Re-exporta tipos, interfaces y canales para consumo por el worker
 * y la capa de API.
 */

export type {
  CanalNotificacion,
  ConfiguracionUsuario,
  ContenidoNotificacion,
  DatosDestinatario,
  ErrorCanal,
  Result,
} from "./tipos";

export { CanalInApp, canalInApp } from "./canal-inapp";
export { CanalEmail, canalEmail, esEmailValido } from "./canal-email";
