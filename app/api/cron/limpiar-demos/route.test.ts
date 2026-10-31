/**
 * Tests para GET /api/cron/limpiar-demos
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/lib/demo", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/demo")>();
  return { ...original, limpiarCuentasDemo: vi.fn().mockResolvedValue(3) };
});

import { GET } from "./route";
import { limpiarCuentasDemo } from "@/lib/demo";

function req(auth?: string) {
  return new NextRequest("http://localhost:3000/api/cron/limpiar-demos", {
    headers: auth ? { authorization: auth } : {},
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("GET /api/cron/limpiar-demos", () => {
  it("401 sin CRON_SECRET configurado, aunque se envíe un header", async () => {
    vi.stubEnv("CRON_SECRET", "");
    vi.stubEnv("DEMO_MODE", "true");
    const res = await GET(req("Bearer "));
    expect(res.status).toBe(401);
    expect(limpiarCuentasDemo).not.toHaveBeenCalled();
  });

  it("401 con un secreto incorrecto", async () => {
    vi.stubEnv("CRON_SECRET", "s3creto-largo");
    vi.stubEnv("DEMO_MODE", "true");
    const res = await GET(req("Bearer otro"));
    expect(res.status).toBe(401);
  });

  it("404 si el modo demo está inactivo", async () => {
    vi.stubEnv("CRON_SECRET", "s3creto-largo");
    vi.stubEnv("DEMO_MODE", "false");
    const res = await GET(req("Bearer s3creto-largo"));
    expect(res.status).toBe(404);
    expect(limpiarCuentasDemo).not.toHaveBeenCalled();
  });

  it("200 con la cantidad de cuentas eliminadas", async () => {
    vi.stubEnv("CRON_SECRET", "s3creto-largo");
    vi.stubEnv("DEMO_MODE", "true");
    const res = await GET(req("Bearer s3creto-largo"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ eliminadas: 3 });
  });
});
