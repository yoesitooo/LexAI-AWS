"use server";

/**
 * Server action "Probar demo" — crea una cuenta demo aislada con datos
 * ficticios e inicia sesión con ella. Solo disponible con DEMO_MODE=true.
 */

import { redirect } from "next/navigation";
import { auth, signIn } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { crearCuentaDemo, esEmailDemo, esModoDemo } from "@/lib/demo";
import { type ResultadoSimulacion, simularRevisionDemo } from "@/lib/demo-simulacion";

export async function iniciarDemo(): Promise<void> {
  if (!esModoDemo()) {
    redirect("/login");
  }

  const resultado = await crearCuentaDemo(prisma);
  if (!resultado.ok) {
    redirect(`/?demo=${resultado.error.tipo}`);
  }

  // signIn lanza la redirección a /tablero cuando el login es exitoso
  await signIn("credentials", {
    email: resultado.value.email,
    password: resultado.value.password,
    redirectTo: "/tablero",
  });
}

export type RespuestaSimulacion =
  | { ok: true; resultado: ResultadoSimulacion }
  | { ok: false; mensaje: string };

/**
 * Server action "Simular revisión diaria" — solo para cuentas demo.
 * Ejecuta el pipeline del worker sobre una actuación ficticia (ver lib/demo-simulacion.ts).
 */
export async function simularRevision(): Promise<RespuestaSimulacion> {
  const session = await auth();
  if (!esModoDemo() || !session?.user?.id || !esEmailDemo(session.user.email)) {
    return { ok: false, mensaje: "La simulación solo está disponible en las cuentas demo." };
  }

  const r = await simularRevisionDemo(prisma, session.user.id);
  return r.ok ? { ok: true, resultado: r.value } : { ok: false, mensaje: r.error.mensaje };
}
