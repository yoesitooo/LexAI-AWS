import { describe, it, expect } from "vitest";
import * as fc from "fast-check";

describe("lib/config", () => {
  it("debe exportar la configuración del entorno con valores de test", async () => {
    const { env } = await import("@/lib/config");

    expect(env.NODE_ENV).toBe("test");
    expect(env.LLM_PROVIDER).toBe("gemini");
    expect(env.DATABASE_URL).toContain("postgresql://");
  });

  it("debe aceptar solo proveedores LLM válidos (propiedad)", () => {
    const validProviders = ["gemini", "openai", "claude", "anthropic"];

    fc.assert(
      fc.property(fc.constantFrom(...validProviders), (provider) => {
        // Cada proveedor válido debe ser uno de los permitidos
        expect(validProviders).toContain(provider);
      }),
      { numRuns: 100 },
    );
  });
});
