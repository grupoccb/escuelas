-- CreateEnum
CREATE TYPE "politica_sucursal_sin_programa" AS ENUM ('ofrecer_otra', 'avisar_asesor');

-- AlterEnum
ALTER TYPE "paso_captacion" ADD VALUE 'otra_sucursal';

-- AlterTable
ALTER TABLE "configuracion_organizacion" ADD COLUMN     "sucursal_sin_programa" "politica_sucursal_sin_programa" NOT NULL DEFAULT 'ofrecer_otra';

