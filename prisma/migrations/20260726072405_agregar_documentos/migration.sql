-- CreateTable
CREATE TABLE "documento_proceso" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "proceso_id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "nombre" VARCHAR(255) NOT NULL,
    "nombre_disco" VARCHAR(255) NOT NULL,
    "tipo_mime" VARCHAR(100) NOT NULL,
    "tamano_bytes" INTEGER NOT NULL,
    "creado_en" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documento_proceso_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ix_documento_proceso_fecha" ON "documento_proceso"("proceso_id", "creado_en");

-- AddForeignKey
ALTER TABLE "documento_proceso" ADD CONSTRAINT "documento_proceso_proceso_id_fkey" FOREIGN KEY ("proceso_id") REFERENCES "proceso"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documento_proceso" ADD CONSTRAINT "documento_proceso_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
