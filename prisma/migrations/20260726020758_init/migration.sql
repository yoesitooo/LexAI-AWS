-- CreateEnum
CREATE TYPE "ColumnaKanban" AS ENUM ('nuevo', 'en_seguimiento', 'requiere_accion', 'vencido', 'archivado');

-- CreateEnum
CREATE TYPE "EstadoPlazo" AS ENUM ('pendiente', 'cumplido', 'vencido');

-- CreateEnum
CREATE TYPE "EstadoNotificacion" AS ENUM ('programada', 'enviada', 'fallida');

-- CreateTable
CREATE TABLE "usuario" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nombre" VARCHAR(100) NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "password_hash" TEXT NOT NULL,
    "creado_en" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "configuracion_usuario" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "usuario_id" UUID NOT NULL,
    "canal_inapp" BOOLEAN NOT NULL DEFAULT true,
    "canal_email" BOOLEAN NOT NULL DEFAULT false,
    "canal_whatsapp" BOOLEAN NOT NULL DEFAULT false,
    "numero_whatsapp" VARCHAR(16),
    "frecuencia_revision" TEXT NOT NULL DEFAULT 'diaria_habiles',
    "creado_en" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "configuracion_usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proceso" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "usuario_id" UUID NOT NULL,
    "radicado" CHAR(23) NOT NULL,
    "llave_proceso" TEXT,
    "despacho" TEXT,
    "departamento" TEXT,
    "ciudad" TEXT,
    "tipo_proceso" TEXT,
    "sujetos_procesales" TEXT NOT NULL DEFAULT '{}',
    "estado_cpnu" TEXT,
    "columna_kanban" "ColumnaKanban" NOT NULL DEFAULT 'nuevo',
    "seguimiento_activo" BOOLEAN NOT NULL DEFAULT true,
    "ultima_revision_en" TIMESTAMPTZ,
    "creado_en" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "proceso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "actuacion" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "proceso_id" UUID NOT NULL,
    "id_actuacion_cpnu" TEXT NOT NULL,
    "llave_proceso" TEXT,
    "consecutivo" INTEGER,
    "fecha_actuacion" DATE NOT NULL,
    "actuacion" TEXT NOT NULL,
    "anotacion" TEXT,
    "fecha_inicia" DATE,
    "fecha_finaliza" DATE,
    "fecha_registro" DATE NOT NULL,
    "existe_docs" BOOLEAN NOT NULL DEFAULT false,
    "es_nueva" BOOLEAN NOT NULL DEFAULT false,
    "analisis_completado" BOOLEAN NOT NULL DEFAULT false,
    "creado_en" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "actuacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plazo" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "actuacion_id" UUID NOT NULL,
    "proceso_id" UUID NOT NULL,
    "dias" INTEGER,
    "es_habil" BOOLEAN NOT NULL DEFAULT true,
    "fecha_inicio" DATE NOT NULL,
    "fecha_limite" DATE,
    "estado" "EstadoPlazo" NOT NULL DEFAULT 'pendiente',
    "indeterminado" BOOLEAN NOT NULL DEFAULT false,
    "error_programacion" BOOLEAN NOT NULL DEFAULT false,
    "creado_en" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plazo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notificacion" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "plazo_id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "fecha_programada" TIMESTAMPTZ NOT NULL,
    "estado" "EstadoNotificacion" NOT NULL DEFAULT 'programada',
    "intentos" INTEGER NOT NULL DEFAULT 0,
    "canal" TEXT,
    "ultimo_intento_en" TIMESTAMPTZ,
    "error_detalle" TEXT,
    "creado_en" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notificacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notificacion_inapp" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "usuario_id" UUID NOT NULL,
    "notificacion_id" UUID,
    "titulo" TEXT NOT NULL,
    "mensaje" TEXT NOT NULL,
    "leida" BOOLEAN NOT NULL DEFAULT false,
    "creado_en" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notificacion_inapp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "intento_login" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" VARCHAR(254) NOT NULL,
    "exitoso" BOOLEAN NOT NULL,
    "ip" TEXT,
    "creado_en" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "intento_login_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ux_usuario_email" ON "usuario"("email");

-- CreateIndex
CREATE UNIQUE INDEX "configuracion_usuario_usuario_id_key" ON "configuracion_usuario"("usuario_id");

-- CreateIndex
CREATE INDEX "ix_proceso_usuario" ON "proceso"("usuario_id");

-- CreateIndex
CREATE INDEX "ix_proceso_activo" ON "proceso"("usuario_id", "seguimiento_activo");

-- CreateIndex
CREATE UNIQUE INDEX "ux_proceso_usuario_radicado" ON "proceso"("usuario_id", "radicado");

-- CreateIndex
CREATE UNIQUE INDEX "ux_actuacion_proceso_cpnu" ON "actuacion"("proceso_id", "id_actuacion_cpnu");

-- CreateIndex
CREATE INDEX "ix_plazo_estado_fecha" ON "plazo"("estado", "fecha_limite");

-- CreateIndex
CREATE INDEX "ix_notificacion_programada" ON "notificacion"("estado", "fecha_programada");

-- CreateIndex
CREATE INDEX "ix_intento_email_tiempo" ON "intento_login"("email", "creado_en");

-- AddForeignKey
ALTER TABLE "configuracion_usuario" ADD CONSTRAINT "configuracion_usuario_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proceso" ADD CONSTRAINT "proceso_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "actuacion" ADD CONSTRAINT "actuacion_proceso_id_fkey" FOREIGN KEY ("proceso_id") REFERENCES "proceso"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plazo" ADD CONSTRAINT "plazo_actuacion_id_fkey" FOREIGN KEY ("actuacion_id") REFERENCES "actuacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plazo" ADD CONSTRAINT "plazo_proceso_id_fkey" FOREIGN KEY ("proceso_id") REFERENCES "proceso"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notificacion" ADD CONSTRAINT "notificacion_plazo_id_fkey" FOREIGN KEY ("plazo_id") REFERENCES "plazo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notificacion" ADD CONSTRAINT "notificacion_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notificacion_inapp" ADD CONSTRAINT "notificacion_inapp_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notificacion_inapp" ADD CONSTRAINT "notificacion_inapp_notificacion_id_fkey" FOREIGN KEY ("notificacion_id") REFERENCES "notificacion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
