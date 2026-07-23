/**
 * Utilidades del middleware de autenticación — lógica pura y testable.
 *
 * Extraída del middleware para poder probarla sin dependencias de Next.js/NextAuth.
 */

/**
 * Rutas que NO requieren autenticación (públicas).
 */
export const PUBLIC_PATHS = ["/login", "/api/auth"];

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
