# =============================================================================
# Dockerfile — LexAI (Next.js web + worker)
# Multi-stage build optimizado para producción.
# Imagen compartida entre servicios `web` y `worker` con distintos CMD.
# =============================================================================

# ---------------------------------------------------------------------------
# Stage 1: Instalar dependencias
# ---------------------------------------------------------------------------
FROM node:24-alpine AS deps

WORKDIR /app

# Instalar dependencias necesarias para native builds (bcrypt, prisma)
RUN apk add --no-cache libc6-compat openssl

COPY package.json package-lock.json* yarn.lock* pnpm-lock.yaml* ./
COPY prisma ./prisma/

RUN \
  if [ -f yarn.lock ]; then yarn install --frozen-lockfile; \
  elif [ -f pnpm-lock.yaml ]; then corepack enable pnpm && pnpm install --frozen-lockfile; \
  elif [ -f package-lock.json ]; then npm ci; \
  else npm install; \
  fi

# ---------------------------------------------------------------------------
# Stage 2: Build de la aplicación
# ---------------------------------------------------------------------------
FROM node:24-alpine AS builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# El Prisma Client se genera AQUÍ, no en la etapa `deps`: su salida va a
# `lib/generated/` (ver el `output` del generador), que está en .gitignore y
# por tanto no llega con `COPY . .`. Generarlo en `deps` no sirve porque de
# esa etapa solo se arrastra `node_modules`.
RUN npx prisma generate

# Variables de build (no son secretos, solo para el build de Next.js)
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

RUN npm run build

# ---------------------------------------------------------------------------
# Stage 3: Imagen de producción (Next.js standalone)
# ---------------------------------------------------------------------------
FROM node:24-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copiar archivos estáticos de Next.js
COPY --from=builder /app/public ./public

# Copiar standalone output de Next.js
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Copiar worker y lib para el servicio worker
COPY --from=builder --chown=nextjs:nodejs /app/worker ./worker
COPY --from=builder --chown=nextjs:nodejs /app/lib ./lib

# Copiar node_modules completo para el worker (tsx necesita deps)
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules

# Copiar prisma schema (necesario para Prisma Client en runtime)
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json
COPY --from=builder --chown=nextjs:nodejs /app/tsconfig.json ./tsconfig.json

# prisma.config.ts provee datasource.url (el bloque `datasource` del schema no
# la declara). Sin este archivo, `prisma migrate deploy` dentro del contenedor
# no sabe a qué base conectarse.
COPY --from=builder --chown=nextjs:nodejs /app/prisma.config.ts ./prisma.config.ts

# El expediente digital escribe en uploads/{procesoId}/. `WORKDIR` crea /app
# como root, así que el usuario `nextjs` no podría crear ese directorio en
# caliente: hay que dejarlo creado y con el dueño correcto.
RUN mkdir -p /app/uploads && chown -R nextjs:nodejs /app/uploads

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Default: servicio web (Next.js standalone server)
CMD ["node", "server.js"]
