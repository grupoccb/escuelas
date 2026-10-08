-- AlterTable
ALTER TABLE "mensaje" ADD COLUMN     "id_proveedor" TEXT;

-- Escrito a mano (Prisma no expresa índices parciales): búsqueda por el id del proveedor.
CREATE INDEX "mensaje_id_proveedor_idx"
    ON "mensaje" ("organizacion_id", "id_proveedor") WHERE "id_proveedor" IS NOT NULL;
