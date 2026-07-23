/**
 * Página raíz (/) — redirige según estado de sesión.
 *
 * En Next.js App Router, app/page.tsx tiene precedencia sobre
 * app/(protected)/page.tsx para la ruta "/". Dado que el Kanban
 * es la pantalla principal tras login, esta página simplemente
 * re-exporta el componente Kanban del route group protegido.
 *
 * La protección de ruta se maneja en el layout protegido y
 * en el propio componente Kanban (redirige a /login si 401).
 */

export { default } from "./(protected)/page";
