-- V10b: marcar a un lead como inscrito A MANO. Con el módulo de inscripción apagado nadie puede inscribir (la conversión no responde), así que el asesor o el
-- administrador mueve al lead a la etapa de inscrito con una nota. El historial (de solo anexar) distingue ese movimiento del que hace la inscripción real
-- con esta marca. Una marca solo puede ser de una persona y trae su nota (de al menos 10 caracteres sin contar espacios de los lados).
ALTER TABLE "lead_etapa_historial" ADD COLUMN "a_mano" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "lead_etapa_historial" ADD CONSTRAINT "lead_etapa_historial_a_mano_check" CHECK (
    NOT "a_mano" OR ("origen" = 'usuario' AND "usuario_id" IS NOT NULL AND "nota" IS NOT NULL AND length(btrim("nota")) >= 10)
);
