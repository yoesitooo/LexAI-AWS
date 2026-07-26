/**
 * Middleware de Next.js — Protección de rutas (R2.3, R2.6)
 *
 * Restringe el acceso al Kanban (/), registro de procesos (/api/procesos),
 * configuración (/configuracion, /api/configuracion), y notificaciones
 * (/api/notificaciones) a sesiones autenticadas.
 *
 * La expiración por inactividad (sliding expiration de 30 min) la maneja
 * NextAuth automáticamente vía session.maxAge en la config JWT (lib/auth.ts).
 * Este middleware verifica que exista un token JWT válido (no expirado).
 *
 * Rutas públicas: /login, /api/auth/*
 */

import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";

const { auth } = NextAuth(authConfig);

// Next.js 16 detecta la exportación por defecto como la función de middleware.
// (El patrón de destructuring `export const { auth: middleware }` no es
// reconocido por el analizador estático del build de producción.)
export default auth;

/**
 * Configuración de rutas que activan el middleware.
 * Excluimos assets estáticos y archivos internos de Next.js.
 */
export const config = {
  matcher: [
    /*
     * Matchea todas las rutas excepto:
     * - _next/static (archivos estáticos)
     * - _next/image (optimización de imágenes)
     * - favicon.ico, sitemap.xml, robots.txt
     * - archivos con extensión (assets estáticos como .svg, .png, .css, etc.)
     */
    "/((?!_next/static|_next/image|favicon\\.ico|sitemap\\.xml|robots\\.txt|.*\\..*).*)",
  ],
};
