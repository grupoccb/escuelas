-- D8: una tarea «lead frío» pendiente por lead (un lead sin conversación no entra al índice «una pendiente por conversación y tipo»).
-- Va en su propia migración: el valor de enum `lead_frio` se agregó en la anterior y Postgres no deja usarlo en la misma transacción.
CREATE UNIQUE INDEX "tarea_lead_frio_pendiente_key"
    ON "tarea_asesor" ("lead_id")
    WHERE "tipo" = 'lead_frio' AND "estado" = 'pendiente' AND "eliminado_en" IS NULL;
