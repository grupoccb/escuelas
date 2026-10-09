-- CreateTable
CREATE TABLE "gasto_campana" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizacion_id" UUID NOT NULL,
    "campana_id" UUID NOT NULL,
    "fecha" DATE NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "nota" TEXT,
    "creado_por_usuario_id" UUID,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eliminado_en" TIMESTAMPTZ(6),

    CONSTRAINT "gasto_campana_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "gasto_campana_organizacion_id_idx" ON "gasto_campana"("organizacion_id");

-- CreateIndex
CREATE INDEX "gasto_campana_campana_id_fecha_idx" ON "gasto_campana"("campana_id", "fecha");

-- CreateIndex
CREATE UNIQUE INDEX "gasto_campana_id_organizacion_id_key" ON "gasto_campana"("id", "organizacion_id");

-- AddForeignKey
ALTER TABLE "gasto_campana" ADD CONSTRAINT "gasto_campana_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gasto_campana" ADD CONSTRAINT "gasto_campana_campana_id_organizacion_id_fkey" FOREIGN KEY ("campana_id", "organizacion_id") REFERENCES "campana"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "gasto_campana" ADD CONSTRAINT "gasto_campana_creado_por_usuario_id_organizacion_id_fkey" FOREIGN KEY ("creado_por_usuario_id", "organizacion_id") REFERENCES "usuario"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;


-- I2: el gasto de una campaña lo captura a mano el administrador. Es DINERO que alimenta el costo por alumno inscrito, así que la base lo cuida aunque el código se equivoque:
--   · el monto es positivo (un gasto en cero o negativo no existe; una corrección es dar de baja el gasto y capturar otro);
--   · un gasto no se edita (ni monto, ni fecha, ni campaña, ni nota) y no se borra: lo único que cambia es la baja lógica (`eliminado_en` pasa de NULL a una fecha y ya no se revierte);
--   · tampoco hay borrado físico ni TRUNCATE (invariante 3).
ALTER TABLE "gasto_campana" ADD CONSTRAINT "gasto_campana_monto_check" CHECK ("monto" > 0);

CREATE FUNCTION "gasto_campana_blindaje"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP IN ('DELETE', 'TRUNCATE') THEN
        RAISE EXCEPTION 'gasto_campana_inmutable: un gasto no se borra (se da de baja)' USING ERRCODE = '23514';
    END IF;
    IF NEW."organizacion_id" <> OLD."organizacion_id" OR NEW."campana_id" <> OLD."campana_id" OR NEW."fecha" <> OLD."fecha" OR NEW."monto" <> OLD."monto"
       OR NEW."nota" IS DISTINCT FROM OLD."nota" OR NEW."creado_por_usuario_id" IS DISTINCT FROM OLD."creado_por_usuario_id" OR NEW."creado_en" <> OLD."creado_en" THEN
        RAISE EXCEPTION 'gasto_campana_inmutable: un gasto no se edita (dalo de baja y captura otro)' USING ERRCODE = '23514';
    END IF;
    IF OLD."eliminado_en" IS NOT NULL AND NEW."eliminado_en" IS DISTINCT FROM OLD."eliminado_en" THEN
        RAISE EXCEPTION 'gasto_campana_inmutable: un gasto dado de baja no se reactiva' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END
$$;
CREATE TRIGGER "gasto_campana_blindaje_trg" BEFORE UPDATE OR DELETE ON "gasto_campana" FOR EACH ROW EXECUTE FUNCTION "gasto_campana_blindaje"();
CREATE TRIGGER "gasto_campana_truncate_trg" BEFORE TRUNCATE ON "gasto_campana" FOR EACH STATEMENT EXECUTE FUNCTION "gasto_campana_blindaje"();
