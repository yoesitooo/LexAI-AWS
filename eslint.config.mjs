// Configuración ESLint 9 (flat config) para LexAI.
// Equivalente a la antigua .eslintrc.json: Next (core-web-vitals) + TypeScript + Prettier.
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier";

const configs = [
  ...(Array.isArray(nextCoreWebVitals) ? nextCoreWebVitals : [nextCoreWebVitals]),
  ...(Array.isArray(nextTypescript) ? nextTypescript : [nextTypescript]),
  prettier,
  {
    // No reportar directivas eslint-disable "sin uso": varios archivos traen
    // disables para reglas que la config flat de Next no habilita (p. ej. no-console).
    linterOptions: {
      reportUnusedDisableDirectives: "off",
    },
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/explicit-function-return-type": "off",
      // Regla nueva de react-hooks (React Compiler) introducida por Next 16.
      // El código actual usa patrones legítimos de "reset on route/prop change"
      // que esta regla marca de forma agresiva; no usamos React Compiler.
      "react-hooks/set-state-in-effect": "off",
    },
  },
  {
    // Archivos de prueba y scripts de exploración: reglas relajadas.
    // Los mocks suelen requerir `any` y variables/imports auxiliares.
    files: ["**/*.test.ts", "**/*.test.tsx", "test/**/*.ts", "test/**/*.tsx", "scripts/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  {
    // Artefactos y salidas que no deben lintarse.
    ignores: [
      ".next/**",
      "node_modules/**",
      "lib/generated/**",
      "prisma/generated/**",
      "coverage/**",
      "next-env.d.ts",
    ],
  },
];

export default configs;
