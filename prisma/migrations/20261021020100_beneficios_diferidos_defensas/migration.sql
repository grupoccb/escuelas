-- H4: beneficios diferidos. Va en una migración aparte de las columnas porque el valor nuevo del enum (`liberado`) no se puede usar en la misma transacción que lo agrega.

-- Un beneficio liberado dice cuándo y con qué pago; uno pendiente no trae nada de eso.
ALTER TABLE "promocion_aplicacion" ADD CONSTRAINT "promocion_aplicacion_liberacion_check" CHECK (
    ("estatus" <> 'liberado' OR ("liberado_en" IS NOT NULL AND "liberado_por_pago_id" IS NOT NULL))
    AND ("estatus" <> 'pendiente' OR ("liberado_en" IS NULL AND "liberado_por_pago_id" IS NULL))
);

-- Las transiciones válidas, EN LA BASE: pendiente → liberado → entregado, liberado → pendiente (se canceló el pago) y la entrega administrativa pendiente → entregado. Liberar exige un pago aplicado, una inscripción
-- que no esté dada de baja (bloqueo de F5) y que la primera mensualidad de verdad esté pagada: aunque el código se equivoque o alguien escriba por SQL, falla cerrado.
CREATE FUNCTION "promocion_aplicacion_transicion"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW."estatus" = OLD."estatus" THEN
        RETURN NEW;
    END IF;
    IF OLD."estatus" = 'pendiente' AND NEW."estatus" = 'liberado' THEN
        IF NOT EXISTS (SELECT 1 FROM "pago" WHERE "id" = NEW."liberado_por_pago_id" AND "organizacion_id" = NEW."organizacion_id" AND "estatus" = 'aplicado') THEN
            RAISE EXCEPTION 'beneficio_sin_pago: un beneficio solo se libera con un pago aplicado' USING ERRCODE = '23514';
        END IF;
        IF EXISTS (SELECT 1 FROM "inscripcion" WHERE "id" = NEW."inscripcion_id" AND "organizacion_id" = NEW."organizacion_id" AND "estatus" = 'baja') THEN
            RAISE EXCEPTION 'beneficio_inscripcion_baja: una inscripción dada de baja no libera nada' USING ERRCODE = '23514';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM "cargo" WHERE "inscripcion_id" = NEW."inscripcion_id" AND "organizacion_id" = NEW."organizacion_id" AND "concepto" = 'mensualidad' AND "estatus" = 'pagado' AND "monto_final" > 0) THEN
            RAISE EXCEPTION 'beneficio_condicion_no_cumplida: la primera mensualidad no está pagada' USING ERRCODE = '23514';
        END IF;
        RETURN NEW;
    END IF;
    -- liberado → entregado (lo normal) o → pendiente (se canceló el pago). pendiente → entregado se conserva como la entrega ADMINISTRATIVA de antes de H4
    -- (la API de H4 nunca la usa: solo entrega lo liberado); entregado ya no cambia de estatus.
    IF (OLD."estatus" = 'liberado' AND NEW."estatus" IN ('entregado', 'pendiente')) OR (OLD."estatus" = 'pendiente' AND NEW."estatus" = 'entregado') THEN
        RETURN NEW;
    END IF;
    RAISE EXCEPTION 'beneficio_transicion_invalida: de % a % no se puede', OLD."estatus", NEW."estatus" USING ERRCODE = '23514';
END
$$;
CREATE TRIGGER "promocion_aplicacion_transicion_trg" BEFORE UPDATE ON "promocion_aplicacion" FOR EACH ROW EXECUTE FUNCTION "promocion_aplicacion_transicion"();
