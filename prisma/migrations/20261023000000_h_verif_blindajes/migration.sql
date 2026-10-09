-- H-verif (verificación independiente de las correcciones H-fix): tres huecos que los ataques por SQL directo con el rol de la aplicación (SELECT, INSERT, UPDATE) encontraron
-- después de EH-01/EH-02/EH-03. Todos dejaban el dinero o el inventario descuadrados (la cuadratura los ve, pero DESPUÉS del hecho); ahora fallan cerrado en la base.
--
-- 1. `UPDATE cargo SET venta_id = NULL, estatus = 'cancelado' WHERE venta_id IS NOT NULL` desligaba el cargo de su venta y lo cancelaba en la misma sentencia: el disparador de EH-02
--    solo vigila los cargos con `NEW.venta_id IS NOT NULL`, así que no se enteraba y la venta registrada se quedaba sin cobro. La venta de un cargo no cambia nunca.
-- 2. `INSERT INTO pago_aplicacion (…, eliminado_en) VALUES (…, now())` nacía «oculta»: movía el cargo y el pago, pero ninguna consulta (ni el estado de cuenta) la veía. Una aplicación
--    nace viva, como el cargo y el pago de EH-01.
-- 3. `INSERT INTO venta (es_promocional, promocion_aplicacion_id …)` de un beneficio que NO se ha liberado (nadie pagó la primera mensualidad) sacaba el uniforme del inventario sin cobro:
--    la entrega de H4 comprueba «liberado», pero la base no. Una venta promocional exige que su aplicación esté liberada por un pago (`liberado_en` y `liberado_por_pago_id`).

CREATE OR REPLACE FUNCTION "cargo_blindaje"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW."organizacion_id" <> OLD."organizacion_id" OR NEW."tutor_id" <> OLD."tutor_id" OR NEW."alumno_id" <> OLD."alumno_id"
       OR NEW."inscripcion_id" IS DISTINCT FROM OLD."inscripcion_id" OR NEW."sucursal_id" <> OLD."sucursal_id" OR NEW."concepto" <> OLD."concepto"
       OR NEW."periodo" IS DISTINCT FROM OLD."periodo" OR NEW."monto" <> OLD."monto" OR NEW."descuento" <> OLD."descuento"
       OR NEW."monto_final" <> OLD."monto_final" OR NEW."fecha_vencimiento" <> OLD."fecha_vencimiento" OR NEW."venta_id" IS DISTINCT FROM OLD."venta_id" THEN
        RAISE EXCEPTION 'cargo_inmutable: el dinero, el responsable, la venta y el vencimiento de un cargo no se editan (cancélalo y genera otro)' USING ERRCODE = '23514';
    END IF;
    IF OLD."estatus" = 'cancelado' AND (NEW."estatus" <> 'cancelado' OR NEW."monto_pagado" <> OLD."monto_pagado") THEN
        RAISE EXCEPTION 'cargo_cancelado: un cargo cancelado no vuelve a abrirse' USING ERRCODE = '23514';
    END IF;
    IF NEW."eliminado_en" IS DISTINCT FROM OLD."eliminado_en" THEN
        RAISE EXCEPTION 'cargo_inmutable: un cargo no se borra, ni siquiera de forma lógica (se cancela)' USING ERRCODE = '23514';
    END IF;
    IF (NEW."monto_pagado" <> OLD."monto_pagado" OR (NEW."estatus" = 'pagado') <> (OLD."estatus" = 'pagado')) AND pg_trigger_depth() < 2 THEN
        RAISE EXCEPTION 'cargo_contadores: lo pagado de un cargo solo lo mueven las aplicaciones de los pagos' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION "pago_aplicacion_alta"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW."estatus" <> 'aplicada' OR NEW."eliminado_en" IS NOT NULL THEN
        RAISE EXCEPTION 'pago_aplicacion_nace_aplicada: una aplicación nace aplicada y viva' USING ERRCODE = '23514';
    END IF;
    UPDATE "pago" SET "monto_aplicado" = "monto_aplicado" + NEW."monto_aplicado"
        WHERE "id" = NEW."pago_id" AND "organizacion_id" = NEW."organizacion_id" AND "estatus" = 'aplicado';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'pago_no_aplicable: el pago no existe o está cancelado' USING ERRCODE = '23514';
    END IF;
    UPDATE "cargo" SET "monto_pagado" = "monto_pagado" + NEW."monto_aplicado",
                       "estatus" = CASE WHEN "monto_pagado" + NEW."monto_aplicado" = "monto_final" THEN 'pagado'::"estatus_cargo" ELSE "estatus" END
        WHERE "id" = NEW."cargo_id" AND "organizacion_id" = NEW."organizacion_id" AND "estatus" IN ('pendiente', 'vencido')
          AND "tutor_id" = (SELECT "tutor_id" FROM "pago" WHERE "id" = NEW."pago_id" AND "organizacion_id" = NEW."organizacion_id");
    IF NOT FOUND THEN
        RAISE EXCEPTION 'cargo_no_aplicable: el cargo no existe, está saldado o cancelado, o es de otra familia' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END
$$;

CREATE FUNCTION "venta_promocional_liberada"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "promocion_aplicacion"
         WHERE "id" = NEW."promocion_aplicacion_id" AND "organizacion_id" = NEW."organizacion_id" AND "liberado_en" IS NOT NULL AND "liberado_por_pago_id" IS NOT NULL
    ) THEN
        RAISE EXCEPTION 'venta_promocional_sin_liberar: una venta promocional solo entrega un beneficio liberado por un pago' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END
$$;
-- AFTER (no BEFORE): los CHECK de la venta (`venta_promocional_check`: precio 0 y aplicación presente) hablan primero; este solo mira si el beneficio se liberó.
CREATE TRIGGER "venta_promocional_liberada_trg" AFTER INSERT ON "venta" FOR EACH ROW WHEN (NEW."es_promocional") EXECUTE FUNCTION "venta_promocional_liberada"();
