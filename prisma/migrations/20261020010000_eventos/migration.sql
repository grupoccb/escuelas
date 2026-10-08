-- CreateEnum
CREATE TYPE "estatus_evento_alumno" AS ENUM ('convocado', 'confirmado', 'pagado', 'asistio');

-- CreateEnum
CREATE TYPE "resultado_evento" AS ENUM ('aprobado', 'no_aprobado');

-- CreateTable
CREATE TABLE "evento" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizacion_id" UUID NOT NULL,
    "vertical_id" UUID NOT NULL,
    "sucursal_id" UUID NOT NULL,
    "tipo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "fecha" DATE NOT NULL,
    "cuota" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "cupo" INTEGER NOT NULL,
    "requiere_vestuario" BOOLEAN NOT NULL DEFAULT false,
    "otorga_progresion" BOOLEAN NOT NULL DEFAULT true,
    "creado_por_usuario_id" UUID,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eliminado_en" TIMESTAMPTZ(6),

    CONSTRAINT "evento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evento_alumno" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizacion_id" UUID NOT NULL,
    "evento_id" UUID NOT NULL,
    "alumno_id" UUID NOT NULL,
    "estatus" "estatus_evento_alumno" NOT NULL DEFAULT 'convocado',
    "resultado" "resultado_evento",
    "nivel_otorgado_id" UUID,
    "registrado_por_usuario_id" UUID,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eliminado_en" TIMESTAMPTZ(6),

    CONSTRAINT "evento_alumno_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "evento_organizacion_id_idx" ON "evento"("organizacion_id");

-- CreateIndex
CREATE INDEX "evento_vertical_id_fecha_idx" ON "evento"("vertical_id", "fecha");

-- CreateIndex
CREATE INDEX "evento_sucursal_id_idx" ON "evento"("sucursal_id");

-- CreateIndex
CREATE UNIQUE INDEX "evento_id_organizacion_id_key" ON "evento"("id", "organizacion_id");

-- CreateIndex
CREATE INDEX "evento_alumno_organizacion_id_idx" ON "evento_alumno"("organizacion_id");

-- CreateIndex
CREATE INDEX "evento_alumno_evento_id_idx" ON "evento_alumno"("evento_id");

-- CreateIndex
CREATE INDEX "evento_alumno_alumno_id_idx" ON "evento_alumno"("alumno_id");

-- CreateIndex
CREATE UNIQUE INDEX "evento_alumno_id_organizacion_id_key" ON "evento_alumno"("id", "organizacion_id");

-- AddForeignKey
ALTER TABLE "alumno_progresion" ADD CONSTRAINT "alumno_progresion_evento_id_organizacion_id_fkey" FOREIGN KEY ("evento_id", "organizacion_id") REFERENCES "evento"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "evento" ADD CONSTRAINT "evento_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evento" ADD CONSTRAINT "evento_vertical_id_organizacion_id_fkey" FOREIGN KEY ("vertical_id", "organizacion_id") REFERENCES "vertical"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "evento" ADD CONSTRAINT "evento_sucursal_id_organizacion_id_fkey" FOREIGN KEY ("sucursal_id", "organizacion_id") REFERENCES "sucursal"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "evento" ADD CONSTRAINT "evento_creado_por_usuario_id_organizacion_id_fkey" FOREIGN KEY ("creado_por_usuario_id", "organizacion_id") REFERENCES "usuario"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "evento_alumno" ADD CONSTRAINT "evento_alumno_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evento_alumno" ADD CONSTRAINT "evento_alumno_evento_id_organizacion_id_fkey" FOREIGN KEY ("evento_id", "organizacion_id") REFERENCES "evento"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "evento_alumno" ADD CONSTRAINT "evento_alumno_alumno_id_organizacion_id_fkey" FOREIGN KEY ("alumno_id", "organizacion_id") REFERENCES "alumno"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "evento_alumno" ADD CONSTRAINT "evento_alumno_nivel_otorgado_id_organizacion_id_fkey" FOREIGN KEY ("nivel_otorgado_id", "organizacion_id") REFERENCES "nivel_progresion"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "evento_alumno" ADD CONSTRAINT "evento_alumno_registrado_por_usuario_id_organizacion_id_fkey" FOREIGN KEY ("registrado_por_usuario_id", "organizacion_id") REFERENCES "usuario"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;


-- G4: reglas simples en la base.
ALTER TABLE "evento" ADD CONSTRAINT "evento_cupo_chk" CHECK ("cupo" >= 1);
ALTER TABLE "evento" ADD CONSTRAINT "evento_cuota_chk" CHECK ("cuota" >= 0);
ALTER TABLE "evento" ADD CONSTRAINT "evento_textos_chk" CHECK (length(btrim("tipo")) BETWEEN 1 AND 60 AND length(btrim("nombre")) BETWEEN 1 AND 160);
ALTER TABLE "evento" ADD CONSTRAINT "evento_fecha_chk" CHECK ("fecha" >= DATE '2000-01-01' AND "fecha" <= DATE '2999-12-31');
-- Un alumno aparece UNA vez por evento entre las filas vivas; y un evento le da un peldaño a un alumno UNA sola vez.
CREATE UNIQUE INDEX "evento_alumno_evento_alumno_key" ON "evento_alumno" ("evento_id", "alumno_id") WHERE "eliminado_en" IS NULL;
CREATE UNIQUE INDEX "alumno_progresion_evento_alumno_key" ON "alumno_progresion" ("evento_id", "alumno_id") WHERE "evento_id" IS NOT NULL AND "eliminado_en" IS NULL;
-- El resultado solo existe con la asistencia; el peldaño otorgado solo con un resultado aprobado.
ALTER TABLE "evento_alumno" ADD CONSTRAINT "evento_alumno_resultado_chk" CHECK ("resultado" IS NULL OR "estatus" = 'asistio');
ALTER TABLE "evento_alumno" ADD CONSTRAINT "evento_alumno_nivel_chk" CHECK ("nivel_otorgado_id" IS NULL OR "resultado" = 'aprobado');

-- G4: EL CUPO DEL EVENTO SE PROTEGE EN LA BASE, dentro de la misma transacción (regla de Eduardo: cupo y dinero no se comprueban «y luego se actúa»).
-- El código ya toma la fila del evento y cuenta antes de convocar; esto es la defensa que FALLA CERRADA si algún código se equivoca o alguien escribe por SQL
-- directo: no puede haber más participantes VIVOS que el `cupo` del evento. Igual que el cupo de un grupo (F4): el disparador toma la fila del evento con
-- FOR UPDATE —así las altas simultáneas del mismo evento se forman en fila— y cuenta DESPUÉS. En READ COMMITTED cada consulta ve lo que la transacción anterior
-- confirmó mientras se esperaba el candado, así que «contar y tomar el lugar» es una sola cosa. Solo actúa cuando una fila PASA A ser viva en ese evento (alta,
-- revivir una borrada, mover a otro evento): editar otra columna de una fila viva (su estatus, su resultado) no vuelve a contar.
CREATE FUNCTION "evento_alumno_cupo"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    tope integer;
    ocupados integer;
BEGIN
    IF NEW."eliminado_en" IS NOT NULL THEN
        RETURN NEW;
    END IF;
    IF TG_OP = 'UPDATE' AND OLD."eliminado_en" IS NULL AND OLD."evento_id" = NEW."evento_id" THEN
        RETURN NEW;
    END IF;
    SELECT "cupo" INTO tope FROM "evento" WHERE "id" = NEW."evento_id" AND "organizacion_id" = NEW."organizacion_id" FOR UPDATE;
    IF NOT FOUND THEN
        RETURN NEW; -- la llave foránea compuesta rechazará la fila
    END IF;
    SELECT count(*) INTO ocupados FROM "evento_alumno"
        WHERE "evento_id" = NEW."evento_id" AND "eliminado_en" IS NULL AND "id" <> NEW."id";
    IF ocupados >= tope THEN
        RAISE EXCEPTION 'evento_cupo: el evento ya no tiene lugares (cupo = %)', tope USING ERRCODE = '23514', CONSTRAINT = 'evento_cupo';
    END IF;
    RETURN NEW;
END
$$;

CREATE TRIGGER "evento_alumno_cupo_trg" BEFORE INSERT OR UPDATE OF "eliminado_en", "evento_id" ON "evento_alumno"
    FOR EACH ROW EXECUTE FUNCTION "evento_alumno_cupo"();

-- Y el cupo del evento no puede bajar por debajo de los que ya ocupan lugar. El UPDATE de la fila del evento ya la tiene bloqueada, así que las altas
-- que lleguen a la vez esperan y, al continuar, ven el cupo nuevo.
CREATE FUNCTION "evento_cupo_no_menor_a_ocupados"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    ocupados integer;
BEGIN
    SELECT count(*) INTO ocupados FROM "evento_alumno" WHERE "evento_id" = NEW."id" AND "eliminado_en" IS NULL;
    IF NEW."cupo" < ocupados THEN
        RAISE EXCEPTION 'evento_cupo_menor_a_ocupados: el cupo (%) no puede ser menor a los que ya ocupan lugar (%)', NEW."cupo", ocupados USING ERRCODE = '23514', CONSTRAINT = 'evento_cupo_menor_a_ocupados';
    END IF;
    RETURN NEW;
END
$$;

CREATE TRIGGER "evento_cupo_no_menor_a_ocupados_trg" BEFORE UPDATE OF "cupo" ON "evento"
    FOR EACH ROW WHEN (NEW."cupo" < OLD."cupo") EXECUTE FUNCTION "evento_cupo_no_menor_a_ocupados"();
