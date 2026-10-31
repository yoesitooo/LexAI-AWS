# LexAI

![Next.js](https://img.shields.io/badge/Next.js_16-000?logo=nextdotjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Prisma-4169E1?logo=postgresql&logoColor=white)
![Tests](https://img.shields.io/badge/tests-792_passing-2ea44f?logo=vitest&logoColor=white)
![Docker](https://img.shields.io/badge/Docker_Compose-web·worker·db·caddy-2496ED?logo=docker&logoColor=white)

> **🇬🇧 In English — at a glance**
>
> LexAI is a legal-tech SaaS for independent lawyers in Colombia. A background **worker** checks the national court system (CPNU, Rama Judicial) every business day, **diffs new court actions**, analyses them with an **LLM** (provider-agnostic: Gemini / OpenAI / Anthropic), **computes legal deadlines in Colombian business days** (holidays included) and **notifies** the lawyer by email and in-app before deadlines expire. Everything is shown on an accessible Kanban board.
>
> | What it demonstrates | Where to look |
> |---|---|
> | Two-process architecture (Next.js web + `node-cron` worker) sharing one domain layer and DB | [`worker/`](./worker) · [`lib/`](./lib) · [docs/arquitectura.md](./docs/arquitectura.md) |
> | External-API integration with fault isolation and `Result<T,E>` error handling | [`lib/`](./lib) |
> | Swappable LLM provider behind one interface | [`lib/llm/providers/`](./lib/llm/providers) |
> | **792 automated tests in 72 files** — unit, integration, accessibility and **property-based tests** (fast-check) | [`test/`](./test) · `npm test` |
> | Containerised deployment: multi-stage Dockerfile, non-root image, Caddy with automatic HTTPS, deploy script for a single EC2 instance | [`Dockerfile`](./Dockerfile) · [`docker-compose.yml`](./docker-compose.yml) · [`deploy.sh`](./deploy.sh) |
>
> Quick start: `cp .env.example .env && npm install && npm test` — the test suite runs without a real database.

---

Plataforma SaaS de trazabilidad procesal para abogados independientes en Colombia. LexAI consulta automáticamente el estado de los procesos judiciales de un abogado en la **Consulta de Procesos Nacional Unificada (CPNU)** de la Rama Judicial, detecta actuaciones nuevas, usa IA para analizarlas y calcular plazos, y notifica al abogado (in-app, email, WhatsApp) antes de que se venzan los términos. Todo se presenta en un tablero Kanban accesible.

> Contexto completo del producto: [PRD-LexAI.md](./PRD-LexAI.md). Specs de desarrollo (requirements/design/tasks): [.kiro/specs/lexai-mvp/](./.kiro/specs/lexai-mvp/). Arquitectura detallada: [docs/arquitectura.md](./docs/arquitectura.md). Referencia de todos los módulos/clases del código: [docs/modulos.md](./docs/modulos.md).

## Arquitectura

LexAI son **dos procesos Node.js independientes que comparten la misma capa de dominio (`lib/`) y la misma base de datos PostgreSQL**:

- **`web`** — aplicación Next.js 16 (App Router): UI del abogado (tablero Kanban, detalle de proceso, notificaciones, configuración) + rutas API (`app/api/**`).
- **`worker`** — proceso independiente con `node-cron`: revisión diaria de procesos contra la CPNU (06:00 CO) y despacho de notificaciones programadas (07:00 CO), en días hábiles.

No hay cola de mensajes ni microservicios adicionales: la integración entre `web` y `worker` es la base de datos y los módulos compartidos de `lib/`.

```mermaid
flowchart LR
    Browser["Navegador"] -->|HTTPS| Caddy["Caddy (HTTPS + reverse proxy)"]
    Caddy --> Web["web · Next.js"]
    Web <--> DB[("PostgreSQL")]
    Worker["worker · node-cron"] <--> DB
    Web -->|consulta bajo demanda| CPNU["CPNU (Rama Judicial)"]
    Worker -->|revisión diaria 06:00| CPNU
    Worker -->|análisis de actuaciones| LLM["Proveedor LLM"]
    Worker -->|despacho 07:00| Resend["Resend (email)"]
```

Pipeline de negocio (por proceso judicial en seguimiento, cada día hábil): **CPNU → diffing de actuaciones → análisis con IA → cálculo de plazos → planificación de notificaciones → despacho multicanal**, con aislamiento de fallos en cada paso (un proceso o canal fallido nunca detiene a los demás) y transición automática de plazos vencidos "al leer" para que el tablero Kanban siempre refleje el estado real.

Principios clave del código: `Result<T,E>` en vez de excepciones para errores externos, proveedor de IA intercambiable sin cambios de código, todo el manejo de fechas anclado a `America/Bogotá`, y guardas explícitas que rechazan funcionalidad de Fase 2 (multi-tenant, roles, tutelas) fuera de alcance del MVP.

Ver el detalle completo (diagramas de capas y de secuencia, despliegue, decisiones de diseño) en [docs/arquitectura.md](./docs/arquitectura.md), y la documentación de cada módulo/clase del proyecto en [docs/modulos.md](./docs/modulos.md).

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
git clone https://github.com/yoesitooo/LexAI-AWS.git
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

El proyecto incluye un stack completo pensado para un servidor tipo EC2 t3.small, orquestado por `docker-compose.yml` con 4 servicios:

| Servicio | Imagen/build | Rol |
|---|---|---|
| `db` | `postgres:16` | Base de datos, con volumen persistente `pgdata` y healthcheck (`pg_isready`); `web` y `worker` esperan a que esté `healthy`. |
| `web` | `Dockerfile` (target `runner`) | Next.js compilado en modo `standalone`, corre `node server.js` en el puerto `3000`. |
| `worker` | misma imagen que `web` | Mismo build, pero sobreescribe el `command` a `npx tsx worker/index.ts` para correr la revisión diaria y el despacho de notificaciones. |
| `caddy` | `caddy:2-alpine` | Reverse proxy con HTTPS automático (Let's Encrypt) hacia `web:3000`, cabeceras de seguridad (`HSTS`, `X-Frame-Options`, etc.) y logs de acceso. |

`web` y `worker` comparten la misma imagen Docker (`Dockerfile`, multi-stage: `deps` → `builder` → `runner`), porque ambos procesos importan la misma capa `lib/`. El Prisma Client se genera en la etapa `builder` (su salida va a `lib/generated/`, que está en `.gitignore`), y la imagen final corre como usuario no-root (`nextjs`) con el directorio `uploads/` (expediente digital) ya creado y con los permisos correctos.

```bash
# Asegúrate de tener un .env configurado en la raíz del proyecto
docker compose up -d --build
```

Variables adicionales relevantes solo para despliegue (además de las de la sección de variables de entorno): `POSTGRES_USER`/`POSTGRES_PASSWORD`/`POSTGRES_DB` (usadas tanto por `db` como para componer `DATABASE_URL` de `web`/`worker`) y `DOMAIN` (dominio para el que Caddy emite el certificado TLS; por defecto `localhost`).

Para desplegar actualizaciones en un servidor ya configurado (pull + rebuild + migraciones), usa el script incluido:

```bash
chmod +x deploy.sh
./deploy.sh
```

`deploy.sh` hace `git pull` → `docker compose up -d --build` → `docker compose exec web npx prisma migrate deploy` (tolerante a que el servicio aún esté iniciando). Ver el diagrama de despliegue completo en [docs/arquitectura.md](./docs/arquitectura.md#despliegue).

## Estructura del proyecto

```
app/              # Next.js App Router (páginas, rutas API, layouts protegidos)
components/       # Componentes React reutilizables (Kanban, modales, badges, etc.)
lib/              # Capa de dominio: CPNU, IA, plazos, notificaciones, i18n, repositorio
worker/           # Proceso independiente (node-cron): revisión diaria y despacho de notificaciones
prisma/           # Esquema de base de datos y migraciones
test/             # Pruebas de integración, accesibilidad y property-based testing
scripts/          # Scripts auxiliares (p. ej. probe-cpnu.ts para probar el endpoint de la CPNU)
docs/             # Documentación adicional: arquitectura.md, modulos.md, extensibilidad a fase 2
.kiro/specs/      # Specs de desarrollo (requirements, design, tasks)
```

Documentación adicional:

- [docs/arquitectura.md](./docs/arquitectura.md) — procesos, capas, diagramas de flujo de datos y despliegue, principios de diseño.
- [docs/modulos.md](./docs/modulos.md) — referencia completa de cada módulo/clase del código (`lib/`, `worker/`, `app/`, `components/`, modelo de datos).
- [docs/extensibilidad-fase2.md](./docs/extensibilidad-fase2.md) — plan de extensión aditiva a Fase 2 (multi-tenant, roles, tutelas, redacción con IA).
