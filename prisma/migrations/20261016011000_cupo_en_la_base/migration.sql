-- F4: el cupo se protege EN LA BASE, dentro de la misma transacción (regla de Eduardo: cupo y dinero no se comprueban «y luego se actúa»).
-- El código ya toma el candado del grupo y cuenta antes de inscribir (`bloquearCupoDeGrupo`); esto es la defensa que FALLA CERRADA si algún
-- código se equivoca o alguien escribe por SQL directo: no puede haber más inscripciones ACTIVAS que el `cupo_maximo` del grupo.
--
-- El disparador toma la fila del grupo con FOR UPDATE (el mismo candado: las inscripciones simultáneas del mismo grupo se forman en fila) y
-- cuenta DESPUÉS. En READ COMMITTED cada consulta de la función ve lo que la anterior transacción confirmó mientras se esperaba el candado, así
-- que «contar y tomar el lugar» es una sola cosa. Solo actúa cuando una fila PASA A ser activa en un grupo (alta, reactivar una congelada,
-- cambio de grupo): bajar el cupo de un grupo ya lleno no rompe a sus inscritos, y editar otra columna de una activa no vuelve a contar.
CREATE FUNCTION "inscripcion_cupo_maximo"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    tope integer;
    ocupadas integer;
BEGIN
    IF NEW."estatus" <> 'activa' OR NEW."eliminado_en" IS NOT NULL THEN
        RETURN NEW;
    END IF;
    IF TG_OP = 'UPDATE' AND OLD."estatus" = 'activa' AND OLD."eliminado_en" IS NULL AND OLD."grupo_id" = NEW."grupo_id" THEN
        RETURN NEW;
    END IF;
    SELECT "cupo_maximo" INTO tope FROM "grupo" WHERE "id" = NEW."grupo_id" AND "organizacion_id" = NEW."organizacion_id" FOR UPDATE;
    IF NOT FOUND THEN
        RETURN NEW; -- la llave foránea compuesta rechazará la fila
    END IF;
    SELECT count(*) INTO ocupadas FROM "inscripcion"
        WHERE "grupo_id" = NEW."grupo_id" AND "estatus" = 'activa' AND "eliminado_en" IS NULL AND "id" <> NEW."id";
    IF ocupadas >= tope THEN
        RAISE EXCEPTION 'inscripcion_cupo_maximo: el grupo ya no tiene lugares (cupo_maximo = %)', tope USING ERRCODE = '23514', CONSTRAINT = 'inscripcion_cupo_maximo';
    END IF;
    RETURN NEW;
END
$$;

CREATE TRIGGER "inscripcion_cupo_maximo_trg" BEFORE INSERT OR UPDATE OF "estatus", "grupo_id", "eliminado_en" ON "inscripcion"
    FOR EACH ROW EXECUTE FUNCTION "inscripcion_cupo_maximo"();
