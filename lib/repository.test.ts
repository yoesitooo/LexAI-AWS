/**
 * Tests para utilidades de repositorio base
 */

import { describe, it, expect } from "vitest";
import { ok, err, withRepository, nowUtc } from "./repository";
import type { RepositoryError } from "./repository";

describe("ok / err (patrón Result)", () => {
  it("ok crea un resultado exitoso con el valor dado", () => {
    const result = ok(42);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(42);
    }
  });

  it("err crea un resultado de error con el error dado", () => {
    const error: RepositoryError = {
      code: "NOT_FOUND",
      message: "No encontrado",
    };
    const result = err(error);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("NOT_FOUND");
      expect(result.error.message).toBe("No encontrado");
    }
  });

  it("ok con objetos complejos preserva la referencia", () => {
    const data = { id: "uuid-1", nombre: "test" };
    const result = ok(data);
    if (result.ok) {
      expect(result.value).toBe(data);
    }
  });
});

describe("withRepository", () => {
  it("retorna ok con el valor cuando la operación es exitosa", async () => {
    const result = await withRepository(
      () => Promise.resolve({ id: "uuid-1" }),
      "test.create",
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({ id: "uuid-1" });
    }
  });

  it("retorna err con RepositoryError cuando la operación lanza", async () => {
    const result = await withRepository(
      () => Promise.reject(new Error("Unique constraint violation")),
      "usuario.crear",
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("REPOSITORY_ERROR");
      expect(result.error.message).toContain("usuario.crear");
      expect(result.error.message).toContain("Unique constraint violation");
      expect(result.error.cause).toBeInstanceOf(Error);
    }
  });

  it("maneja errores no-Error (strings) correctamente", async () => {
    const result = await withRepository(
      () => Promise.reject("error string"),
      "proceso.buscar",
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain("proceso.buscar");
      expect(result.error.message).toContain("Error desconocido en repositorio");
    }
  });

  it("preserva la causa original del error", async () => {
    const originalError = new Error("connection reset");
    const result = await withRepository(
      () => Promise.reject(originalError),
      "db.health",
    );

    if (!result.ok) {
      expect(result.error.cause).toBe(originalError);
    }
  });
});

describe("nowUtc", () => {
  it("retorna un objeto Date", () => {
    const date = nowUtc();
    expect(date).toBeInstanceOf(Date);
  });

  it("retorna una fecha cercana al momento actual", () => {
    const before = Date.now();
    const date = nowUtc();
    const after = Date.now();

    expect(date.getTime()).toBeGreaterThanOrEqual(before);
    expect(date.getTime()).toBeLessThanOrEqual(after);
  });

  it("la fecha es convertible a ISO string UTC", () => {
    const date = nowUtc();
    const iso = date.toISOString();
    expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/);
  });
});
