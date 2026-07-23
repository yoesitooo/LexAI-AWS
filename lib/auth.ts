/**
 * Configuración de NextAuth.js v5 (Auth.js) — LexAI MVP
 *
 * Proveedor de credenciales (email + contraseña) con:
 * - Sesión JWT (sliding expiration de 30 minutos por inactividad)
 * - Bloqueo temporal tras 5 intentos fallidos en 15 minutos
 * - Mensajes genéricos sin revelar qué campo falló
 */

import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { isPublicPath } from "@/lib/middleware-utils";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Contraseña", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const email = (credentials.email as string).toLowerCase().trim();
        const password = credentials.password as string;

        // Verificar bloqueo temporal (5 intentos fallidos en 15 minutos)
        const quinceMinsAtras = new Date(Date.now() - 15 * 60 * 1000);
        const intentosFallidos = await prisma.intentoLogin.count({
          where: {
            email,
            exitoso: false,
            creado_en: { gte: quinceMinsAtras },
          },
        });

        if (intentosFallidos >= 5) {
          // Registrar intento bloqueado
          await prisma.intentoLogin.create({
            data: { email, exitoso: false },
          });
          throw new Error("ACCOUNT_LOCKED");
        }

        // Buscar usuario
        const usuario = await prisma.usuario.findUnique({
          where: { email },
        });

        if (!usuario) {
          await prisma.intentoLogin.create({
            data: { email, exitoso: false },
          });
          return null;
        }

        // Verificar contraseña
        const passwordValida = await bcrypt.compare(
          password,
          usuario.password_hash,
        );

        if (!passwordValida) {
          await prisma.intentoLogin.create({
            data: { email, exitoso: false },
          });
          return null;
        }

        // Login exitoso — registrar intento
        await prisma.intentoLogin.create({
          data: { email, exitoso: true },
        });

        return {
          id: usuario.id,
          name: usuario.nombre,
          email: usuario.email,
        };
      },
    }),
  ],
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
});
