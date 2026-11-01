"use client";

/**
 * Contexto del modo demo para componentes cliente.
 * El layout protegido (servidor) lee DEMO_MODE y lo pasa aquí, así no hace
 * falta exponer la variable al navegador.
 */

import { createContext, useContext, type ReactNode } from "react";

const ModoDemoContext = createContext(false);

export function ModoDemoProvider({ activo, children }: { activo: boolean; children: ReactNode }) {
  return <ModoDemoContext.Provider value={activo}>{children}</ModoDemoContext.Provider>;
}

/** `true` si la app corre como demo público. */
export function useModoDemo(): boolean {
  return useContext(ModoDemoContext);
}
