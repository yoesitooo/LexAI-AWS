/**
 * Configuración de NextAuth.js compatible con Edge Runtime — LexAI MVP
 *
 * No importa Prisma ni ningún módulo de Node.js: la usa el middleware
 * (Edge Runtime) para validar el JWT sin tocar la base de datos.
 * La configuración completa (con el proveedor de credenciales y Prisma)
 * vive en lib/auth.ts y extiende este objeto.
 */

import type { NextAuthConfig } from "next-auth";
import { isPublicPath } from "@/lib/middleware-utils";

export const authConfig = {
  providers: [],
  session: {
    strategy: "jwt",
    // Expiración por inactividad: 30 minutos (R2.6)
    maxAge: 30 * 60,
  },
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async authorized({ request, auth: session }) {
      const { pathname } = request.nextUrl;

      // Rutas públicas: no requieren autenticación
      if (isPublicPath(pathname)) {
        return true;
      }

      // Rutas protegidas: requieren sesión válida
      if (!session) {
        const loginUrl = new URL("/login", request.nextUrl.origin);
        loginUrl.searchParams.set("callbackUrl", request.nextUrl.pathname);
        return Response.redirect(loginUrl);
      }

      return true;
    },
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.id) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
