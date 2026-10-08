-- CreateEnum
CREATE TYPE "origen_mensaje" AS ENUM ('respuesta', 'automatizacion', 'confirmacion_baja');

-- AlterTable
ALTER TABLE "mensaje" ADD COLUMN     "origen" "origen_mensaje" NOT NULL DEFAULT 'respuesta';
