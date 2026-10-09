-- EH-03 (auditoría de la etapa H): la base libera un beneficio diferido solo si la PRIMERA mensualidad (la no cancelada de menor periodo que tiene importe) está pagada. Antes
-- bastaba CUALQUIER mensualidad pagada: con meses por adelantado o un reparto manual, pagar el segundo mes sin el primero dejaba pasar «uniforme gratis» si el código se equivocaba.
-- La condición es la misma que `primeraMensualidadDe` (src/finanzas/beneficios.ts).

CREATE OR REPLACE FUNCTION "promocion_aplicacion_transicion"() RETURNS trigger LANGUAGE plpgsql AS $$
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
        IF COALESCE((
            SELECT "estatus"::text FROM "cargo"
             WHERE "inscripcion_id" = NEW."inscripcion_id" AND "organizacion_id" = NEW."organizacion_id" AND "concepto" = 'mensualidad' AND "estatus" <> 'cancelado' AND "monto_final" > 0 AND "eliminado_en" IS NULL
             ORDER BY "periodo" ASC, "id" ASC LIMIT 1
        ), '') <> 'pagado' THEN
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
