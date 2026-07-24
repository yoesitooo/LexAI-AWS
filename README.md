# LexAI

Plataforma SaaS de trazabilidad procesal para abogados independientes en Colombia. LexAI consulta automáticamente el estado de los procesos judiciales de un abogado en la **Consulta de Procesos Nacional Unificada (CPNU)** de la Rama Judicial, detecta actuaciones nuevas, usa IA para analizarlas y calcular plazos, y notifica al abogado (in-app, email, WhatsApp) antes de que se venzan los términos. Todo se presenta en un tablero Kanban accesible.

> Contexto completo del producto: [PRD-LexAI.md](./PRD-LexAI.md). Specs de desarrollo (requirements/design/tasks): [.kiro/specs/lexai-mvp/](./.kiro/specs/lexai-mvp/).

## Stack técnico

- **Frontend/Backend:** Next.js 16 (App Router) + TypeScript estricto
- **Base de datos:** PostgreSQL + Prisma ORM
- **Autenticación:** NextAuth.js
- **Worker:** proceso independiente con `node-cron` (revisión diaria 06:00 CO + despacho de notificaciones 07:00 CO)
- **IA:** proveedor LLM intercambiable sin cambios de código (Gemini, OpenAI, Anthropic/Claude — ver `lib/llm/providers/`)
- **Notificaciones:** in-app, email (Resend) y WhatsApp (Twilio)
- **Pruebas:** Vitest + fast-check (property-based testing)
- **Despliegue:** Docker + Docker Compose + Caddy (HTTPS automático)

## Requisitos previos

- [Node.js](https://nodejs.org/) 20 o superior
- [Docker](https://www.docker.com/) y Docker Compose (para levantar PostgreSQL localmente, o para desplegar el stack completo)
- Un cliente de PostgreSQL si prefieres usar una instancia propia en vez de Docker

## Instalación local (paso a paso)

### 1. Clonar el repositorio

```bash
git clone <url-del-repositorio>
cd LexAI-AWS
```

### 2. Instalar dependencias

```bash
npm install
```

### 3. Configurar variables de entorno

Copia el archivo de ejemplo y completa los valores:

```bash
cp .env.example .env
```

Variables relevantes en `.env`:

| Variable | Descripción |
|---|---|
| `DATABASE_URL` | Cadena de conexión a PostgreSQL (`postgresql://user:password@localhost:5432/lexai`) |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | Credenciales usadas por el contenedor de PostgreSQL en Docker Compose |
| `LLM_PROVIDER` | Proveedor de IA a usar: `gemini`, `openai`, `claude` o `anthropic` |
| `LLM_API_KEY` | API key del proveedor de IA elegido |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_WHATSAPP_FROM` | Credenciales de Twilio para notificaciones por WhatsApp (Sandbox) |
| `RESEND_API_KEY` / `EMAIL_FROM` | Credenciales de Resend para notificaciones por email |
| `NEXTAUTH_SECRET` | Secreto para firmar sesiones (mínimo 32 caracteres) |
| `NEXTAUTH_URL` | URL base de la app (`http://localhost:3000` en desarrollo) |

En desarrollo local, solo `DATABASE_URL` y `NEXTAUTH_SECRET` son estrictamente necesarias para levantar la app; las integraciones externas (LLM, Twilio, Resend) son opcionales hasta que necesites probar esas funcionalidades.

### 4. Levantar PostgreSQL

Opción rápida con Docker (recomendada):

```bash
docker run --name lexai-db -e POSTGRES_USER=lexai -e POSTGRES_PASSWORD=lexai_secret -e POSTGRES_DB=lexai -p 5432:5432 -d postgres:16
```

O si prefieres usar el `docker-compose.yml` del proyecto solo para la base de datos:

```bash
docker compose up -d db
```

Asegúrate de que `DATABASE_URL` en tu `.env` apunte a esa instancia.

### 5. Generar el cliente de Prisma y aplicar el esquema

```bash
npm run db:generate
npm run db:push
```

`db:push` sincroniza el esquema de `prisma/schema.prisma` directamente con la base de datos (útil para desarrollo). Si prefieres un flujo de migraciones versionadas, usa en su lugar:

```bash
npm run db:migrate
```

### 6. Levantar la app en modo desarrollo

```bash
npm run dev
```

La app queda disponible en [http://localhost:3000](http://localhost:3000).

### 7. (Opcional) Levantar el worker de revisión diaria

El worker corre por separado del servidor web y ejecuta la revisión diaria de procesos (06:00 CO) y el despacho de notificaciones (07:00 CO) en días hábiles:

```bash
npm run worker
```

## Scripts disponibles

| Comando | Descripción |
|---|---|
| `npm run dev` | Levanta el servidor de desarrollo de Next.js |
| `npm run build` | Compila la app para producción |
| `npm run start` | Levanta la app compilada (producción) |
| `npm run worker` | Ejecuta el worker de revisión diaria / despacho de notificaciones |
| `npm run lint` | Corre ESLint |
| `npm run format` | Formatea el código con Prettier |
| `npm run format:check` | Verifica formato sin modificar archivos |
| `npm test` | Corre la suite de pruebas (Vitest) una vez |
| `npm run test:watch` | Corre las pruebas en modo watch |
| `npm run test:coverage` | Corre las pruebas con reporte de cobertura |
| `npm run typecheck` | Verifica tipos de TypeScript sin emitir salida |
| `npm run db:generate` | Genera el cliente de Prisma |
| `npm run db:migrate` | Crea y aplica una migración de Prisma (desarrollo) |
| `npm run db:push` | Sincroniza el esquema con la base de datos sin migraciones |
| `npm run db:studio` | Abre Prisma Studio para explorar los datos |

## Pruebas

El proyecto usa Vitest con variables de entorno mockeadas (ver `test/setup.ts`), por lo que **no necesitas una base de datos real** para correr la suite de pruebas unitarias y de propiedades (property-based testing con fast-check):

```bash
npm test
```

## Despliegue con Docker

El proyecto incluye un stack completo (`web` + `worker` + `db` + `caddy` con HTTPS automático) pensado para un servidor tipo EC2 t3.small:

```bash
# Asegúrate de tener un .env configurado en la raíz del proyecto
docker compose up -d --build
```

Para desplegar actualizaciones en un servidor ya configurado (pull + rebuild + migraciones), usa el script incluido:

```bash
chmod +x deploy.sh
./deploy.sh
```

## Estructura del proyecto

```
app/              # Next.js App Router (páginas, rutas API, layouts protegidos)
components/       # Componentes React reutilizables (Kanban, modales, badges, etc.)
lib/              # Capa de dominio: CPNU, IA, plazos, notificaciones, i18n, repositorio
worker/           # Proceso independiente (node-cron): revisión diaria y despacho de notificaciones
prisma/           # Esquema de base de datos y migraciones
test/             # Pruebas de integración, accesibilidad y property-based testing
scripts/          # Scripts auxiliares (p. ej. probe-cpnu.ts para probar el endpoint de la CPNU)
docs/             # Documentación adicional (extensibilidad a fase 2)
.kiro/specs/      # Specs de desarrollo (requirements, design, tasks)
```

## Licencia

Proyecto privado (`UNLICENSED`).
