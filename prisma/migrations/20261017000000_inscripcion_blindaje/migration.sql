-- EF-04 (auditoría de la etapa F): el dinero de la inscripción y su coherencia, también protegidos EN LA BASE (regla de Eduardo: una defensa que falle
-- cerrada aunque el código se equivoque o alguien escriba por SQL directo). Ya existían los CHECK de importes no negativos y el disparador del cupo;
-- faltaban dos garantías que el código solo prometía:
--
-- 1. «PRECIO CONGELADO». Lo que se cobró al inscribir (precio de lista, descuentos, meses gratis y por adelantado) no se modifica después: una corrección
--    es una baja y una inscripción nueva, no un UPDATE. Tampoco la fecha de inscripción, el alumno, el programa ni la organización. Sí cambian el estatus,
--    el grupo, las fechas de baja y congelamiento, el motivo, el día de corte y la baja lógica (lo que F5 hace). Lo mismo para el monto congelado de cada
--    promoción aplicada (`descuento`, `meses_gratis`): H4 solo cambia su estatus y su fecha de entrega.
-- 2. «EL GRUPO ES DEL PROGRAMA». `inscripcion.programa_id` tiene que ser el programa del grupo (el cambio de grupo y el precio asumen que son el mismo);
--    se comprueba al insertar y al cambiar de grupo o de programa.
CREATE FUNCTION "inscripcion_precio_congelado"() RETURNS trigger LANGUAGE plpgsql AS $$
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
        OR NEW."organizacion_id" IS DISTINCT FROM OLD."organizacion_id" THEN
        RAISE EXCEPTION 'inscripcion_precio_congelado: el precio, los descuentos, las fechas y el alumno de una inscripción no se modifican (una corrección es una baja y una inscripción nueva)' USING ERRCODE = '23514', CONSTRAINT = 'inscripcion_precio_congelado';
    END IF;
    RETURN NEW;
END
$$;

CREATE TRIGGER "inscripcion_precio_congelado_trg" BEFORE UPDATE ON "inscripcion"
    FOR EACH ROW EXECUTE FUNCTION "inscripcion_precio_congelado"();

CREATE FUNCTION "promocion_aplicacion_monto_congelado"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW."descuento" IS DISTINCT FROM OLD."descuento"
        OR NEW."meses_gratis" IS DISTINCT FROM OLD."meses_gratis"
        OR NEW."inscripcion_id" IS DISTINCT FROM OLD."inscripcion_id"
        OR NEW."promocion_id" IS DISTINCT FROM OLD."promocion_id"
        OR NEW."beneficio_id" IS DISTINCT FROM OLD."beneficio_id" THEN
        RAISE EXCEPTION 'promocion_aplicacion_monto_congelado: lo que valió una promoción al inscribir no se modifica (solo su estatus y su entrega)' USING ERRCODE = '23514', CONSTRAINT = 'promocion_aplicacion_monto_congelado';
    END IF;
    RETURN NEW;
END
$$;

CREATE TRIGGER "promocion_aplicacion_monto_congelado_trg" BEFORE UPDATE ON "promocion_aplicacion"
    FOR EACH ROW EXECUTE FUNCTION "promocion_aplicacion_monto_congelado"();

CREATE FUNCTION "inscripcion_programa_del_grupo"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    programa uuid;
BEGIN
    SELECT "programa_id" INTO programa FROM "grupo" WHERE "id" = NEW."grupo_id" AND "organizacion_id" = NEW."organizacion_id";
    IF FOUND AND programa <> NEW."programa_id" THEN
        RAISE EXCEPTION 'inscripcion_programa_del_grupo: el grupo no es del programa de la inscripción' USING ERRCODE = '23514', CONSTRAINT = 'inscripcion_programa_del_grupo';
    END IF;
    RETURN NEW;
END
$$;

CREATE TRIGGER "inscripcion_programa_del_grupo_trg" BEFORE INSERT OR UPDATE OF "grupo_id", "programa_id" ON "inscripcion"
    FOR EACH ROW EXECUTE FUNCTION "inscripcion_programa_del_grupo"();
