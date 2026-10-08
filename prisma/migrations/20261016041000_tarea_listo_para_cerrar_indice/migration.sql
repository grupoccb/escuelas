-- F6: una tarea «listo para cerrar» pendiente por lead. Va en su propia migración: el valor de enum `listo_para_cerrar` se agregó en la anterior y
-- Postgres no deja usarlo en la misma transacción.
CREATE UNIQUE INDEX "tarea_listo_para_cerrar_pendiente_key"
    ON "tarea_asesor" ("lead_id")
    WHERE "tipo" = 'listo_para_cerrar' AND "estado" = 'pendiente' AND "eliminado_en" IS NULL;
