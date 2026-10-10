-- V10 / EG-19 (auditoría de la etapa G): el DE DÓNDE VINO una inscripción también queda congelado en la base. EF-04 congeló el precio, los descuentos, las fechas, el
-- alumno y el programa, pero la promoción que se aplicó (`promocion_id`), el lead del que nació (`lead_id`) y la cotización que se aceptó (`cotizacion_id`) todavía se
-- podían reescribir con un UPDATE: la cuadratura de las promociones, el costo por campaña y la cotización «aceptada» se apoyan en ellos. Ningún código los cambia
-- después de inscribir (solo cambian el estatus, el grupo, las fechas de baja y congelamiento, el motivo y el día de corte). Se agregan a la misma función; el resto
-- no cambia. Volver a escribir el MISMO valor no es un cambio.
CREATE OR REPLACE FUNCTION "inscripcion_precio_congelado"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW."precio_inscripcion_aplicado" IS DISTINCT FROM OLD."precio_inscripcion_aplicado"
        OR NEW."precio_mensualidad_aplicado" IS DISTINCT FROM OLD."precio_mensualidad_aplicado"
        OR NEW."descuento_inscripcion_aplicado" IS DISTINCT FROM OLD."descuento_inscripcion_aplicado"
        OR NEW."descuento_mensualidad_aplicado" IS DISTINCT FROM OLD."descuento_mensualidad_aplicado"
        OR NEW."meses_gratis_aplicados" IS DISTINCT FROM OLD."meses_gratis_aplicados"
        OR NEW."meses_pagados_por_adelantado" IS DISTINCT FROM OLD."meses_pagados_por_adelantado"
        OR NEW."fecha_inscripcion" IS DISTINCT FROM OLD."fecha_inscripcion"
        OR NEW."alumno_id" IS DISTINCT FROM OLD."alumno_id"
        OR NEW."programa_id" IS DISTINCT FROM OLD."programa_id"
        OR NEW."promocion_id" IS DISTINCT FROM OLD."promocion_id"
        OR NEW."lead_id" IS DISTINCT FROM OLD."lead_id"
        OR NEW."cotizacion_id" IS DISTINCT FROM OLD."cotizacion_id"
        OR NEW."organizacion_id" IS DISTINCT FROM OLD."organizacion_id" THEN
        RAISE EXCEPTION 'inscripcion_precio_congelado: el precio, los descuentos, las fechas, el alumno y de dónde vino una inscripción (lead, cotización, promoción) no se modifican (una corrección es una baja y una inscripción nueva)' USING ERRCODE = '23514', CONSTRAINT = 'inscripcion_precio_congelado';
    END IF;
    RETURN NEW;
END
$$;
