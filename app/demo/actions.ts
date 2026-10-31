"use server";

/**
 * Server action "Probar demo" — crea una cuenta demo aislada con datos
 * ficticios e inicia sesión con ella. Solo disponible con DEMO_MODE=true.
 */

import { redirect } from "next/navigation";
import { signIn } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { crearCuentaDemo, esModoDemo } from "@/lib/demo";

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
