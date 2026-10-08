-- CreateEnum
CREATE TYPE "estado_evento_entrega" AS ENUM ('enviado', 'entregado', 'leido', 'fallido');

-- AlterEnum
ALTER TYPE "tipo_tarea_asesor" ADD VALUE 'entrega_fallida';

-- AlterTable
ALTER TABLE "tarea_asesor" ADD COLUMN     "codigo_error" INTEGER,
ADD COLUMN     "mensaje_id" UUID;

-- CreateTable
CREATE TABLE "evento_entrega_pendiente" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizacion_id" UUID NOT NULL,
    "proveedor" TEXT NOT NULL,
    "id_externo" TEXT NOT NULL,
    "id_proveedor" TEXT,
    "estado" "estado_evento_entrega" NOT NULL,
    "ocurrio_en" TIMESTAMPTZ(6),
    "error_codigo" INTEGER,
    "error_texto" TEXT,
    "conciliado_en" TIMESTAMPTZ(6),
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eliminado_en" TIMESTAMPTZ(6),

    CONSTRAINT "evento_entrega_pendiente_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "evento_entrega_pendiente_organizacion_id_proveedor_id_exter_idx" ON "evento_entrega_pendiente"("organizacion_id", "proveedor", "id_externo");

-- CreateIndex
CREATE UNIQUE INDEX "evento_entrega_pendiente_id_organizacion_id_key" ON "evento_entrega_pendiente"("id", "organizacion_id");

-- AddForeignKey
ALTER TABLE "tarea_asesor" ADD CONSTRAINT "tarea_asesor_mensaje_id_organizacion_id_fkey" FOREIGN KEY ("mensaje_id", "organizacion_id") REFERENCES "mensaje"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "evento_entrega_pendiente" ADD CONSTRAINT "evento_entrega_pendiente_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- A5: la tarea de entrega fallida es UNA POR MENSAJE, no una por conversación. El índice único de
-- "una pendiente por conversación y tipo" pasa a valer solo para las tareas que no se refieren a
-- un mensaje; las de mensaje tienen el suyo, sin importar su estado (un fallo posterior del
-- mismo mensaje no crea otra aunque la primera ya se haya resuelto).
DROP INDEX "tarea_asesor_pendiente_key";
CREATE UNIQUE INDEX "tarea_asesor_pendiente_key"
    ON "tarea_asesor" ("conversacion_id", "tipo")
    WHERE "estado" = 'pendiente' AND "eliminado_en" IS NULL AND "conversacion_id" IS NOT NULL AND "mensaje_id" IS NULL;
CREATE UNIQUE INDEX "tarea_asesor_mensaje_tipo_key"
    ON "tarea_asesor" ("mensaje_id", "tipo")
    WHERE "mensaje_id" IS NOT NULL AND "eliminado_en" IS NULL;

-- F1-03: un evento de entrega es único por (proveedor, id_externo, estado) entre los vivos.
CREATE UNIQUE INDEX "evento_entrega_pendiente_unico_key"
    ON "evento_entrega_pendiente" ("organizacion_id", "proveedor", "id_externo", "estado")
    WHERE "eliminado_en" IS NULL;
