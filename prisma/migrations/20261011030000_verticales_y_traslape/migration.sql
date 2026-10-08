-- AlterTable
ALTER TABLE "vertical" ADD COLUMN     "color_marca" TEXT,
ADD COLUMN     "etiqueta_evento" TEXT,
ADD COLUMN     "etiqueta_progresion" TEXT,
ADD COLUMN     "logo_url" TEXT,
ADD COLUMN     "usa_progresion" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "programa" ADD COLUMN     "permite_traslape" BOOLEAN NOT NULL DEFAULT false;


ALTER TABLE "vertical" ADD CONSTRAINT "vertical_color_marca_check" CHECK ("color_marca" IS NULL OR "color_marca" ~ '^#[0-9A-Fa-f]{6}$');
ALTER TABLE "vertical" ADD CONSTRAINT "vertical_progresion_check" CHECK ("usa_progresion" = false OR "etiqueta_progresion" IS NOT NULL);
