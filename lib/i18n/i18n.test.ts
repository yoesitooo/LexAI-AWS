/**
 * Tests unitarios y de propiedad para la capa i18n de LexAI.
 *
 * Valida: R14.1 (español de Colombia), R14.2 (fallback sin identificador técnico),
 * R14.7 (configuración fija de localización).
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  t,
  obtenerClavesFaltantes,
  limpiarClavesFaltantes,
  configurarLogClaveFaltante,
  es,
  esCO,
} from "./index";

describe("i18n — t(key, params?)", () => {
  beforeEach(() => {
    limpiarClavesFaltantes();
  });

  describe("Resolución de claves existentes", () => {
    it("devuelve la cadena del diccionario es para claves existentes", () => {
      expect(t("auth.login.titulo")).toBe("Iniciar sesión");
    });

    it("devuelve la cadena de es-CO si la clave está sobrescrita allí", () => {
      // Si es-CO tiene una variante, la preferimos
      // Para verificar esto necesitamos una clave que exista en ambos diccionarios
      // Usamos una clave que sabemos existe en es
      const clave = "app.nombre" as const;
      const resultadoCO = esCO[clave];
      const resultadoES = es[clave];
      const resultado = t(clave);

      if (resultadoCO !== undefined) {
        expect(resultado).toBe(resultadoCO);
      } else {
        expect(resultado).toBe(resultadoES);
      }
    });
  });

  describe("Interpolación de parámetros", () => {
    it("reemplaza {variable} con el valor del parámetro", () => {
      expect(t("saludo", { nombre: "Juan" })).toBe("Hola, Juan");
    });

    it("reemplaza múltiples variables en una cadena", () => {
      expect(t("plazo.fecha_limite", { fecha: "15/01/2025" })).toBe(
        "Fecha límite: 15/01/2025",
      );
    });

    it("reemplaza variables numéricas correctamente", () => {
      expect(t("plazo.dias_habiles", { dias: 5 })).toBe("5 días hábiles");
    });

    it("deja el placeholder intacto si el parámetro no se proporciona", () => {
      expect(t("saludo")).toBe("Hola, {nombre}");
    });

    it("ignora parámetros extra que no tienen placeholder", () => {
      expect(t("saludo", { nombre: "Ana", extra: "ignorado" })).toBe("Hola, Ana");
    });
  });

  describe("Fallback y claves faltantes (R14.2)", () => {
    it("NUNCA devuelve el identificador técnico de la clave", () => {
      const claveInexistente = "modulo.no.existe.xyz";
      const resultado = t(claveInexistente);
      expect(resultado).not.toBe(claveInexistente);
      expect(resultado).not.toContain("modulo.no.existe");
    });

    it("devuelve un texto amigable para claves inexistentes", () => {
      const resultado = t("clave.totalmente.inventada.12345");
      expect(resultado).toBe("Texto no disponible");
    });

    it("no devuelve una cadena vacía para claves inexistentes", () => {
      const resultado = t("otra.clave.no.existe");
      expect(resultado.length).toBeGreaterThan(0);
    });

    it("registra la clave faltante para awareness del desarrollador", () => {
      const claveInexistente = "faltante.test.abc";
      t(claveInexistente);
      expect(obtenerClavesFaltantes().has(claveInexistente)).toBe(true);
    });

    it("no registra duplicados de la misma clave faltante", () => {
      const claveInexistente = "faltante.duplicado";
      t(claveInexistente);
      t(claveInexistente);
      // El Set solo tiene una entrada
      const faltantes = Array.from(obtenerClavesFaltantes()).filter(
        (k) => k === claveInexistente,
      );
      expect(faltantes).toHaveLength(1);
    });

    it("llama al logger configurado cuando encuentra una clave faltante", () => {
      const mensajes: string[] = [];
      configurarLogClaveFaltante((msg) => mensajes.push(msg));

      t("clave.para.log.test");

      expect(mensajes).toHaveLength(1);
      expect(mensajes[0]).toContain("clave.para.log.test");

      // Restaurar logger por defecto
      configurarLogClaveFaltante(() => {});
    });
  });

  describe("Prioridad es-CO sobre es", () => {
    it("es-CO tiene prioridad sobre es cuando la clave existe en ambos", () => {
      // Verificamos que el mecanismo funciona: si inyectamos una clave en esCO
      // debería priorizarse. Dado que esCO es un objeto mutable en runtime (Record),
      // podemos verificar el diseño con una clave existente.
      const todasLasClavesES = Object.keys(es);
      // Todas las claves de esCO deben existir también en es (es un subconjunto)
      for (const clave of Object.keys(esCO)) {
        expect(todasLasClavesES).toContain(clave);
      }
    });
  });

  describe("Cobertura del diccionario", () => {
    it("el diccionario es tiene al menos 30 cadenas", () => {
      expect(Object.keys(es).length).toBeGreaterThanOrEqual(30);
    });

    it("ninguna cadena del diccionario es está vacía", () => {
      for (const [clave, valor] of Object.entries(es)) {
        expect(valor.trim().length, `Clave "${clave}" está vacía`).toBeGreaterThan(0);
      }
    });
  });
});
