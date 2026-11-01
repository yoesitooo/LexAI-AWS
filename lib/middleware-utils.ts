/**
 * Utilidades del middleware de autenticación — lógica pura y testable.
 *
 * Extraída del middleware para poder probarla sin dependencias de Next.js/NextAuth.
 */

/**
 * Rutas que NO requieren autenticación (públicas).
 *
 * - "/"        → landing pública de bienvenida (solo coincide de forma exacta).
 * - "/login"   → pantalla de inicio de sesión y sus subrutas.
 * - "/api/auth"→ endpoints de NextAuth y sus subrutas.
 * - "/api/cron"→ tareas programadas; cada ruta valida su propio CRON_SECRET.
 * - "/opengraph-image" → imagen de vista previa al compartir el enlace (sin datos de usuario).
 */
export const PUBLIC_PATHS = ["/", "/login", "/api/auth", "/api/cron", "/opengraph-image"];

/**
 * Determina si una ruta es pública (no requiere autenticación).
 *
 * Una ruta es pública si coincide exactamente con uno de los prefijos
 * o si es una sub-ruta directa (comienza con el prefijo seguido de "/").
 */
export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some(
    (publicPath) =>
      pathname === publicPath || pathname.startsWith(publicPath + "/"),
  );
}

/**
 * Genera la URL de redirección a login con callbackUrl.
 */
export function buildLoginRedirectUrl(
  origin: string,
  callbackPath: string,
): string {
  const loginUrl = new URL("/login", origin);
  loginUrl.searchParams.set("callbackUrl", callbackPath);
  return loginUrl.toString();
}
