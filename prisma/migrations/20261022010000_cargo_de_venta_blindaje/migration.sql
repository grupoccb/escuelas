-- EH-02 (auditoría de la etapa H): el cargo de una venta tampoco se cancela suelto. `venta_cuadra_con_su_cargo_trg` (H5) es un disparador diferido sobre `venta`: se dispara con
-- cambios de la venta, no del cargo, así que `UPDATE cargo SET estatus = 'cancelado' WHERE venta_id IS NOT NULL` dejaba una venta registrada sin su cargo (el inventario ya salió
-- y nadie lo cobra). Ahora el cambio de un cargo de venta también vuelve a comprobar su venta al confirmar la transacción. Anular la venta (que cancela el cargo) sigue valiendo
-- porque la venta queda anulada en la misma transacción.

CREATE FUNCTION "cargo_de_venta_cuadra"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    v RECORD;
    vivos integer;
    montos numeric;
    esperado numeric;
BEGIN
    SELECT "id", "organizacion_id", "estatus", "es_promocional", "cantidad", "precio_unitario" INTO v FROM "venta" WHERE "id" = NEW."venta_id";
    IF NOT FOUND THEN
        RETURN NULL;
    END IF;
    SELECT count(*), COALESCE(max("monto_final"), 0) INTO vivos, montos FROM "cargo" WHERE "venta_id" = v."id" AND "organizacion_id" = v."organizacion_id" AND "estatus" <> 'cancelado';
    esperado := v."cantidad" * v."precio_unitario";
    IF v."estatus" = 'registrada' AND NOT v."es_promocional" THEN
        IF vivos <> 1 OR montos <> esperado THEN
            RAISE EXCEPTION 'venta_cuadra_con_su_cargo: una venta registrada debe tener un cargo vivo de cantidad × precio (%); anula la venta en lugar de cancelar su cargo', esperado USING ERRCODE = '23514';
        END IF;
    ELSIF vivos <> 0 THEN
        RAISE EXCEPTION 'venta_cuadra_con_su_cargo: una venta anulada o promocional no tiene cargo vivo' USING ERRCODE = '23514';
    END IF;
    RETURN NULL;
END
$$;
CREATE CONSTRAINT TRIGGER "cargo_de_venta_cuadra_trg" AFTER INSERT OR UPDATE ON "cargo" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (NEW."venta_id" IS NOT NULL) EXECUTE FUNCTION "cargo_de_venta_cuadra"();
