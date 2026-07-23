/**
 * Configuración tipada del entorno — LexAI MVP
 *
 * Todas las variables de entorno requeridas se validan al importar este módulo.
 * En caso de variable faltante en producción, se lanza un error descriptivo.
 */

export type LLMProvider = "gemini" | "openai" | "claude" | "anthropic";

export interface EnvConfig {
  /** URL de conexión a PostgreSQL */
  DATABASE_URL: string;

  /** Proveedor LLM intercambiable sin cambios de código (R7.8) */
  LLM_PROVIDER: LLMProvider;

  /** API key del proveedor LLM */
  LLM_API_KEY: string;

  /** Twilio Account SID para WhatsApp Sandbox */
  TWILIO_ACCOUNT_SID: string;

  /** Twilio Auth Token */
  TWILIO_AUTH_TOKEN: string;

  /** Número de WhatsApp de origen (Twilio Sandbox) */
  TWILIO_WHATSAPP_FROM: string;

  /** API key de Resend para envío de email */
  RESEND_API_KEY: string;

  /** Dirección de correo de origen */
  EMAIL_FROM: string;

  /** Secreto de NextAuth.js para firmar sesiones */
  NEXTAUTH_SECRET: string;

  /** URL base de NextAuth.js */
  NEXTAUTH_URL: string;

  /** Entorno de ejecución */
  NODE_ENV: "development" | "production" | "test";
}

const LLM_PROVIDERS: readonly string[] = ["gemini", "openai", "claude", "anthropic"];

function getEnvVar(name: string, required: boolean = true): string {
  const value = process.env[name];
  if (!value && required && process.env.NODE_ENV === "production") {
    throw new Error(`[LexAI Config] Variable de entorno requerida no definida: ${name}`);
  }
  return value ?? "";
}

function getLLMProvider(): LLMProvider {
  const raw = getEnvVar("LLM_PROVIDER", false) || "gemini";
  if (!LLM_PROVIDERS.includes(raw)) {
    throw new Error(
      `[LexAI Config] LLM_PROVIDER inválido: "${raw}". Valores permitidos: ${LLM_PROVIDERS.join(", ")}`,
    );
  }
  return raw as LLMProvider;
}

function getNodeEnv(): "development" | "production" | "test" {
  const raw = process.env.NODE_ENV || "development";
  if (!["development", "production", "test"].includes(raw)) {
    return "development";
  }
  return raw as "development" | "production" | "test";
}

/**
 * Configuración del entorno validada y tipada.
 * Importar como: `import { env } from "@/lib/config";`
 */
export const env: EnvConfig = {
  DATABASE_URL: getEnvVar("DATABASE_URL"),
  LLM_PROVIDER: getLLMProvider(),
  LLM_API_KEY: getEnvVar("LLM_API_KEY"),
  TWILIO_ACCOUNT_SID: getEnvVar("TWILIO_ACCOUNT_SID", false),
  TWILIO_AUTH_TOKEN: getEnvVar("TWILIO_AUTH_TOKEN", false),
  TWILIO_WHATSAPP_FROM: getEnvVar("TWILIO_WHATSAPP_FROM", false),
  RESEND_API_KEY: getEnvVar("RESEND_API_KEY", false),
  EMAIL_FROM: getEnvVar("EMAIL_FROM", false),
  NEXTAUTH_SECRET: getEnvVar("NEXTAUTH_SECRET"),
  NEXTAUTH_URL: getEnvVar("NEXTAUTH_URL", false) || "http://localhost:3000",
  NODE_ENV: getNodeEnv(),
};
