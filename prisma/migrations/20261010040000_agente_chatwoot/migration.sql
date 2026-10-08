-- AlterTable
ALTER TABLE "conversacion" ADD COLUMN     "asignada_a_agente_chatwoot_id" INTEGER,
ADD COLUMN     "asignada_a_usuario_id" UUID;

-- AlterTable
ALTER TABLE "usuario" ADD COLUMN     "chatwoot_agent_id" INTEGER;

-- AddForeignKey
ALTER TABLE "conversacion" ADD CONSTRAINT "conversacion_asignada_a_usuario_id_organizacion_id_fkey" FOREIGN KEY ("asignada_a_usuario_id", "organizacion_id") REFERENCES "usuario"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;


-- Un agente de Chatwoot corresponde a un solo usuario vivo de la organización.
CREATE UNIQUE INDEX "usuario_chatwoot_agent_vivo_key" ON "usuario" ("organizacion_id", "chatwoot_agent_id") WHERE "chatwoot_agent_id" IS NOT NULL AND "eliminado_en" IS NULL;
CREATE INDEX "conversacion_asignada_a_usuario_idx" ON "conversacion" ("organizacion_id", "asignada_a_usuario_id") WHERE "asignada_a_usuario_id" IS NOT NULL;
