-- Documentos de origen CPNU: rastreo de origen, actuación y deduplicación.

-- AlterTable
ALTER TABLE "documento_proceso"
    ADD COLUMN "actuacion_id" UUID,
    ADD COLUMN "origen" VARCHAR(16) NOT NULL DEFAULT 'manual',
    ADD COLUMN "id_documento_cpnu" VARCHAR(64);

-- CreateIndex (deduplicación de documentos CPNU por proceso; múltiples NULL permitidos en Postgres)
CREATE UNIQUE INDEX "ux_documento_proceso_cpnu" ON "documento_proceso"("proceso_id", "id_documento_cpnu");

-- AddForeignKey
ALTER TABLE "documento_proceso" ADD CONSTRAINT "documento_proceso_actuacion_id_fkey" FOREIGN KEY ("actuacion_id") REFERENCES "actuacion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
