-- H6: cobranza. Va aparte de las columnas y los valores de enum porque un valor nuevo del enum no se puede usar en la misma transacción que lo agrega.

-- El umbral de días de la tarea por deuda vencida es razonable.
ALTER TABLE "configuracion_organizacion" ADD CONSTRAINT "configuracion_umbral_dias_deuda_chk" CHECK ("umbral_dias_deuda" BETWEEN 1 AND 365);

-- Una tarea pendiente por (cargo, tipo): el recordatorio sin canal no se acumula.
CREATE UNIQUE INDEX "tarea_asesor_cargo_pendiente_key" ON "tarea_asesor" ("cargo_id", "tipo") WHERE "estado" = 'pendiente' AND "eliminado_en" IS NULL AND "cargo_id" IS NOT NULL;
-- Y la de DEUDA es una por cargo en toda su vida, sin importar su estado: si una persona la resuelve a mano y la deuda sigue, el sistema no la vuelve a crear (sería un ciclo).
CREATE UNIQUE INDEX "tarea_asesor_deuda_vencida_key" ON "tarea_asesor" ("cargo_id") WHERE "tipo" = 'deuda_vencida' AND "eliminado_en" IS NULL AND "cargo_id" IS NOT NULL;
