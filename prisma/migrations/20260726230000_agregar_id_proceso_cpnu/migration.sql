-- Persiste el idProceso de la CPNU (identificador numérico interno de la
-- instancia del proceso) para poder consultar su histórico de actuaciones
-- de forma estable. `llave_proceso` no sirve para esto: la CPNU la repite
-- igual para varias instancias de un mismo radicado (ver
-- test/fixtures/cpnu/consulta-radicado-multiples.json), mientras que
-- `idProceso` es único por instancia.

-- AlterTable
ALTER TABLE "proceso"
    ADD COLUMN "id_proceso_cpnu" TEXT;
