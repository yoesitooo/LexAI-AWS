/**
 * POST /api/auth/register — Registro de usuario
 *
 * Crea un Usuario y su ConfiguracionUsuario por defecto (in-app activo;
 * email y WhatsApp inactivos). Valida:
 * - nombre: 1–100 caracteres
 * - email: formato válido, máximo 254 caracteres, único
 * - contraseña: 8–128 caracteres
 *
 * Respuestas:
 * - 201: registro exitoso
 * - 400: error de validación
 * - 409: email duplicado
 * - 500: error interno
 *
 * Requisitos: R1.1, R1.2, R1.3, R1.4, R1.5, R1.6, R1.7
 */

import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { esModoDemo } from "@/lib/demo";

// ─── Validación ─────────────────────────────────────────────────────────────

interface ErrorValidacion {
  campo: string;
  mensaje: string;
}

/**
 * Regex básica para validar formato de email.
 * Acepta: local@domain.tld con al menos un punto en el dominio.
 */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validarDatosRegistro(body: unknown): {
  valido: boolean;
  errores: ErrorValidacion[];
  datos?: { nombre: string; email: string; password: string };
} {
  const errores: ErrorValidacion[] = [];

  if (!body || typeof body !== "object") {
    return {
      valido: false,
      errores: [{ campo: "body", mensaje: "El cuerpo de la solicitud es requerido." }],
    };
  }

  const { nombre, email, password } = body as Record<string, unknown>;

  // Validar nombre (R1.5): 1–100 caracteres
  if (typeof nombre !== "string" || nombre.trim().length === 0) {
    errores.push({
      campo: "nombre",
      mensaje: "El nombre es requerido y debe tener entre 1 y 100 caracteres.",
    });
  } else if (nombre.trim().length > 100) {
    errores.push({
      campo: "nombre",
      mensaje: "El nombre no puede superar los 100 caracteres.",
    });
  }

  // Validar email (R1.4): formato válido, máximo 254 caracteres
  if (typeof email !== "string" || email.trim().length === 0) {
    errores.push({
      campo: "email",
      mensaje: "El correo electrónico es requerido.",
    });
  } else if (email.trim().length > 254) {
    errores.push({
      campo: "email",
      mensaje: "El correo electrónico no puede superar los 254 caracteres.",
    });
  } else if (!EMAIL_REGEX.test(email.trim())) {
    errores.push({
      campo: "email",
      mensaje: "El formato del correo electrónico no es válido.",
    });
  }

  // Validar contraseña (R1.3): 8–128 caracteres
  if (typeof password !== "string" || password.length === 0) {
    errores.push({
      campo: "password",
      mensaje: "La contraseña es requerida y debe tener entre 8 y 128 caracteres.",
    });
  } else if (password.length < 8 || password.length > 128) {
    errores.push({
      campo: "password",
      mensaje: "La contraseña debe tener entre 8 y 128 caracteres.",
    });
  }

  if (errores.length > 0) {
    return { valido: false, errores };
  }

  return {
    valido: true,
    errores: [],
    datos: {
      nombre: (nombre as string).trim(),
      email: (email as string).trim().toLowerCase(),
      password: password as string,
    },
  };
}

// ─── Handler ────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  // En el demo público el acceso es solo con "Probar demo" (cuentas temporales)
  if (esModoDemo()) {
    return NextResponse.json(
      { error: "El registro está deshabilitado en el modo demo." },
      { status: 403 },
    );
  }

  try {
    const body = await request.json().catch(() => null);

    // Validar datos de entrada
    const resultado = validarDatosRegistro(body);
    if (!resultado.valido) {
      return NextResponse.json(
        { error: "Error de validación", detalles: resultado.errores },
        { status: 400 },
      );
    }

    const { nombre, email, password } = resultado.datos!;

    // Verificar unicidad de email (R1.2)
    const emailExistente = await prisma.usuario.findUnique({
      where: { email },
    });

    if (emailExistente) {
      return NextResponse.json(
        {
          error: "El correo electrónico ya está registrado.",
          detalles: [
            {
              campo: "email",
              mensaje: "Este correo electrónico ya está asociado a una cuenta existente.",
            },
          ],
        },
        { status: 409 },
      );
    }

    // Hash de contraseña (R1.1)
    const BCRYPT_SALT_ROUNDS = 12;
    const passwordHash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);

    // Crear Usuario + ConfiguracionUsuario en una transacción (R1.1, R1.6)
    const usuario = await prisma.$transaction(async (tx) => {
      const nuevoUsuario = await tx.usuario.create({
        data: {
          nombre,
          email,
          password_hash: passwordHash,
        },
      });

      // Crear configuración por defecto: in-app activo; email y WhatsApp inactivos (R1.6)
      await tx.configuracionUsuario.create({
        data: {
          usuario_id: nuevoUsuario.id,
          canal_inapp: true,
          canal_email: false,
          canal_whatsapp: false,
          frecuencia_revision: "diaria_habiles",
        },
      });

      return nuevoUsuario;
    });

    // Respuesta exitosa (R1.7): devolver datos públicos del usuario
    return NextResponse.json(
      {
        mensaje: "Registro exitoso.",
        usuario: {
          id: usuario.id,
          nombre: usuario.nombre,
          email: usuario.email,
          creado_en: usuario.creado_en,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("[Register] Error inesperado:", error);
    return NextResponse.json(
      { error: "Error interno del servidor. Intente nuevamente." },
      { status: 500 },
    );
  }
}
