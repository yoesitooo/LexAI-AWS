/**
 * Route Handler de NextAuth.js v5 — LexAI MVP
 *
 * Gestiona login, logout y sesión mediante Auth.js con credenciales.
 */

import { handlers } from "@/lib/auth";

export const { GET, POST } = handlers;
