-- A3: lead a medias. A los 30 min la conversación se vuelve visible para los asesores SIN pasar a
-- en_atencion_humana; estas dos marcas hacen el aviso idempotente y la apertura reintentable.
-- AlterTable
ALTER TABLE "conversacion" ADD COLUMN     "abierta_para_asesores_en" TIMESTAMPTZ(6),
ADD COLUMN     "visible_a_asesores_en" TIMESTAMPTZ(6);

