-- CreateTable
CREATE TABLE "comentario_proceso" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "proceso_id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "texto" TEXT NOT NULL,
    "creado_en" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comentario_proceso_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ix_comentario_proceso_fecha" ON "comentario_proceso"("proceso_id", "creado_en");

-- AddForeignKey
ALTER TABLE "comentario_proceso" ADD CONSTRAINT "comentario_proceso_proceso_id_fkey" FOREIGN KEY ("proceso_id") REFERENCES "proceso"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comentario_proceso" ADD CONSTRAINT "comentario_proceso_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
