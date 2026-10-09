-- EH-01 (auditoría de la etapa H): los CONTADORES del dinero solo los mueven los disparadores de las aplicaciones de pago, y lo que mueve dinero no se «borra» (se cancela).
-- Con el rol de la aplicación de `docs/API.md` (SELECT, INSERT, UPDATE; sin dueño ni TRIGGER), un `UPDATE cargo SET monto_pagado = monto_final, estatus = 'pagado'`, un
-- `INSERT` de un cargo ya «pagado» o de un pago con `monto_aplicado = monto` sin aplicaciones, o un `UPDATE … SET eliminado_en` pasaban todos los CHECK: el cargo quedaba pagado sin
-- ningún pago (o desaparecía, y el barrido generaba otra mensualidad). Lo que sigue falla cerrado aunque el código se equivoque. `pg_trigger_depth() > 1` significa «esta
-- sentencia la emite OTRO disparador» (los de `pago_aplicacion`): un UPDATE directo vale 1; el que hace `pago_aplicacion_alta` o `pago_aplicacion_reversa` sobre cargo o pago, 2.

CREATE OR REPLACE FUNCTION "cargo_blindaje"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW."organizacion_id" <> OLD."organizacion_id" OR NEW."tutor_id" <> OLD."tutor_id" OR NEW."alumno_id" <> OLD."alumno_id"
       OR NEW."inscripcion_id" IS DISTINCT FROM OLD."inscripcion_id" OR NEW."sucursal_id" <> OLD."sucursal_id" OR NEW."concepto" <> OLD."concepto"
       OR NEW."periodo" IS DISTINCT FROM OLD."periodo" OR NEW."monto" <> OLD."monto" OR NEW."descuento" <> OLD."descuento"
       OR NEW."monto_final" <> OLD."monto_final" OR NEW."fecha_vencimiento" <> OLD."fecha_vencimiento" THEN
        RAISE EXCEPTION 'cargo_inmutable: el dinero, el responsable y el vencimiento de un cargo no se editan (cancélalo y genera otro)' USING ERRCODE = '23514';
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

-- Un cargo NACE sin pagos; solo uno sin importe nace «pagado» (no hay nada que cobrar).
CREATE FUNCTION "cargo_alta_blindaje"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW."monto_pagado" <> 0 OR (NEW."estatus" = 'pagado' AND NEW."monto_final" <> 0) OR NEW."eliminado_en" IS NOT NULL THEN
        RAISE EXCEPTION 'cargo_contadores: un cargo nace sin pagos y vivo (los pagos se aplican después)' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END
$$;
CREATE TRIGGER "cargo_alta_blindaje_trg" BEFORE INSERT ON "cargo" FOR EACH ROW EXECUTE FUNCTION "cargo_alta_blindaje"();

CREATE OR REPLACE FUNCTION "pago_blindaje"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP IN ('DELETE', 'TRUNCATE') THEN
        RAISE EXCEPTION 'pago_inmutable: un pago no se borra (se cancela)' USING ERRCODE = '23514';
    END IF;
    IF NEW."organizacion_id" <> OLD."organizacion_id" OR NEW."tutor_id" <> OLD."tutor_id" OR NEW."monto" <> OLD."monto" OR NEW."metodo" <> OLD."metodo"
       OR NEW."referencia" IS DISTINCT FROM OLD."referencia" OR NEW."fecha" <> OLD."fecha" OR NEW."clave_idempotencia" IS DISTINCT FROM OLD."clave_idempotencia" THEN
        RAISE EXCEPTION 'pago_inmutable: el monto, la familia, el método y la fecha de un pago no se editan (cancélalo y registra otro)' USING ERRCODE = '23514';
    END IF;
    IF OLD."estatus" = 'cancelado' AND NEW."estatus" <> 'cancelado' THEN
        RAISE EXCEPTION 'pago_cancelado: un pago cancelado no vuelve a aplicarse' USING ERRCODE = '23514';
    END IF;
    IF NEW."eliminado_en" IS DISTINCT FROM OLD."eliminado_en" THEN
        RAISE EXCEPTION 'pago_inmutable: un pago no se borra, ni siquiera de forma lógica (se cancela)' USING ERRCODE = '23514';
    END IF;
    IF NEW."monto_aplicado" <> OLD."monto_aplicado" AND pg_trigger_depth() < 2 THEN
        RAISE EXCEPTION 'pago_contadores: lo aplicado de un pago solo lo mueven sus aplicaciones' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END
$$;

-- Un pago NACE sin nada aplicado (las aplicaciones lo suben) y vivo.
CREATE FUNCTION "pago_alta_blindaje"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW."monto_aplicado" <> 0 OR NEW."estatus" <> 'aplicado' OR NEW."eliminado_en" IS NOT NULL THEN
        RAISE EXCEPTION 'pago_contadores: un pago nace aplicado y sin aplicaciones (las aplicaciones suben lo aplicado)' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END
$$;
CREATE TRIGGER "pago_alta_blindaje_trg" BEFORE INSERT ON "pago" FOR EACH ROW EXECUTE FUNCTION "pago_alta_blindaje"();

CREATE OR REPLACE FUNCTION "pago_aplicacion_cambio"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP IN ('DELETE', 'TRUNCATE') THEN
        RAISE EXCEPTION 'pago_aplicacion es de solo anexar (no se borra)' USING ERRCODE = '23514';
    END IF;
    IF OLD."estatus" <> 'aplicada' OR NEW."estatus" <> 'revertida' OR NEW."pago_id" <> OLD."pago_id" OR NEW."cargo_id" <> OLD."cargo_id"
       OR NEW."monto_aplicado" <> OLD."monto_aplicado" OR NEW."organizacion_id" <> OLD."organizacion_id" OR NEW."eliminado_en" IS DISTINCT FROM OLD."eliminado_en" THEN
        RAISE EXCEPTION 'pago_aplicacion es de solo anexar: lo único que cambia es aplicada → revertida' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END
$$;

-- Una venta tampoco se «borra» de forma lógica: se anula (devuelve las piezas); si no, el stock quedaría descontado sin venta.
CREATE OR REPLACE FUNCTION "venta_mueve_stock"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW."estatus" <> 'registrada' OR NEW."eliminado_en" IS NOT NULL THEN
            RAISE EXCEPTION 'venta_nace_registrada: una venta nace registrada' USING ERRCODE = '23514';
        END IF;
        UPDATE "producto" SET "stock" = "stock" - NEW."cantidad" WHERE "id" = NEW."producto_id" AND "organizacion_id" = NEW."organizacion_id";
        RETURN NEW;
    END IF;
    -- UPDATE: lo único que cambia es registrada → anulada (y devuelve las piezas).
    IF NEW."organizacion_id" <> OLD."organizacion_id" OR NEW."tutor_id" <> OLD."tutor_id" OR NEW."alumno_id" <> OLD."alumno_id" OR NEW."producto_id" <> OLD."producto_id"
       OR NEW."sucursal_id" <> OLD."sucursal_id" OR NEW."cantidad" <> OLD."cantidad" OR NEW."precio_unitario" <> OLD."precio_unitario"
       OR NEW."es_promocional" <> OLD."es_promocional" OR NEW."promocion_aplicacion_id" IS DISTINCT FROM OLD."promocion_aplicacion_id" OR NEW."fecha" <> OLD."fecha"
       OR NEW."eliminado_en" IS DISTINCT FROM OLD."eliminado_en" THEN
        RAISE EXCEPTION 'venta_inmutable: una venta no se edita ni se borra (se anula)' USING ERRCODE = '23514';
    END IF;
    IF OLD."estatus" = 'anulada' AND NEW."estatus" <> 'anulada' THEN
        RAISE EXCEPTION 'venta_anulada: una venta anulada no vuelve a registrarse' USING ERRCODE = '23514';
    END IF;
    IF OLD."estatus" = 'registrada' AND NEW."estatus" = 'anulada' THEN
        UPDATE "producto" SET "stock" = "stock" + OLD."cantidad" WHERE "id" = OLD."producto_id" AND "organizacion_id" = OLD."organizacion_id";
    END IF;
    RETURN NEW;
END
$$;
