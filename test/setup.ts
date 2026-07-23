/**
 * Setup global de pruebas — Vitest
 *
 * Este archivo se ejecuta antes de cada suite de pruebas.
 * Configura el entorno de prueba con variables por defecto.
 */

// Variables de entorno para pruebas
// @ts-expect-error NODE_ENV es read-only en tipos de Node pero necesitamos setearlo para tests
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/lexai_test";
process.env.LLM_PROVIDER = "gemini";
process.env.LLM_API_KEY = "test-key";
process.env.NEXTAUTH_SECRET = "test-secret-at-least-32-characters-long";
process.env.NEXTAUTH_URL = "http://localhost:3000";
