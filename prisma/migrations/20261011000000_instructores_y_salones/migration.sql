-- AlterTable (la columna de texto `salon` se elimina DESPUÉS de migrar sus datos, más abajo)
ALTER TABLE "grupo" ADD COLUMN     "salon_id" UUID;

-- AlterTable
ALTER TABLE "instructor" ADD COLUMN     "correo" TEXT,
ADD COLUMN     "telefono" TEXT;

-- CreateTable
CREATE TABLE "instructor_sucursal" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizacion_id" UUID NOT NULL,
    "instructor_id" UUID NOT NULL,
    "sucursal_id" UUID NOT NULL,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eliminado_en" TIMESTAMPTZ(6),

    CONSTRAINT "instructor_sucursal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "salon" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizacion_id" UUID NOT NULL,
    "sucursal_id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "capacidad" INTEGER,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eliminado_en" TIMESTAMPTZ(6),

    CONSTRAINT "salon_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "instructor_sucursal_organizacion_id_idx" ON "instructor_sucursal"("organizacion_id");

-- CreateIndex
CREATE INDEX "instructor_sucursal_instructor_id_idx" ON "instructor_sucursal"("instructor_id");

-- CreateIndex
CREATE INDEX "instructor_sucursal_sucursal_id_idx" ON "instructor_sucursal"("sucursal_id");

-- CreateIndex
CREATE UNIQUE INDEX "instructor_sucursal_id_organizacion_id_key" ON "instructor_sucursal"("id", "organizacion_id");

-- CreateIndex
CREATE INDEX "salon_organizacion_id_idx" ON "salon"("organizacion_id");

-- CreateIndex
CREATE INDEX "salon_sucursal_id_idx" ON "salon"("sucursal_id");

-- CreateIndex
CREATE UNIQUE INDEX "salon_id_organizacion_id_key" ON "salon"("id", "organizacion_id");

-- AddForeignKey
ALTER TABLE "grupo" ADD CONSTRAINT "grupo_salon_id_organizacion_id_fkey" FOREIGN KEY ("salon_id", "organizacion_id") REFERENCES "salon"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "instructor_sucursal" ADD CONSTRAINT "instructor_sucursal_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "instructor_sucursal" ADD CONSTRAINT "instructor_sucursal_instructor_id_organizacion_id_fkey" FOREIGN KEY ("instructor_id", "organizacion_id") REFERENCES "instructor"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "instructor_sucursal" ADD CONSTRAINT "instructor_sucursal_sucursal_id_organizacion_id_fkey" FOREIGN KEY ("sucursal_id", "organizacion_id") REFERENCES "sucursal"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "salon" ADD CONSTRAINT "salon_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salon" ADD CONSTRAINT "salon_sucursal_id_organizacion_id_fkey" FOREIGN KEY ("sucursal_id", "organizacion_id") REFERENCES "sucursal"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- ── Índices parciales y CHECK (no caben en Prisma) ─────────────────────────────────────────────
CREATE UNIQUE INDEX "salon_nombre_vivo_key" ON "salon" ("organizacion_id", "sucursal_id", "nombre") WHERE "eliminado_en" IS NULL;
ALTER TABLE "salon" ADD CONSTRAINT "salon_capacidad_check" CHECK ("capacidad" IS NULL OR "capacidad" > 0);
CREATE UNIQUE INDEX "instructor_sucursal_vivo_key" ON "instructor_sucursal" ("organizacion_id", "instructor_id", "sucursal_id") WHERE "eliminado_en" IS NULL;

-- ── Migración de los datos: `grupo.salon` (texto) → filas de `salon` por sucursal, sin perder nada ──────
-- Un salón por (sucursal del programa, nombre) con el texto exacto (sin espacios en los extremos). Se
-- incluyen también los grupos dados de baja, para no perder el dato. Un texto vacío se vuelve «sin salón».
INSERT INTO "salon" ("organizacion_id", "sucursal_id", "nombre")
SELECT DISTINCT g."organizacion_id", p."sucursal_id", btrim(g."salon")
FROM "grupo" g
JOIN "programa" p ON p."id" = g."programa_id" AND p."organizacion_id" = g."organizacion_id"
WHERE g."salon" IS NOT NULL AND btrim(g."salon") <> '';

UPDATE "grupo" g SET "salon_id" = s."id"
FROM "programa" p, "salon" s
WHERE g."salon" IS NOT NULL AND btrim(g."salon") <> ''
  AND p."id" = g."programa_id" AND p."organizacion_id" = g."organizacion_id"
  AND s."organizacion_id" = g."organizacion_id" AND s."sucursal_id" = p."sucursal_id"
  AND s."nombre" = btrim(g."salon") AND s."eliminado_en" IS NULL;

-- Nada se pierde: todo grupo que tenía texto de salón tiene ahora su salon_id.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM "grupo" WHERE "salon" IS NOT NULL AND btrim("salon") <> '' AND "salon_id" IS NULL) THEN
        RAISE EXCEPTION 'migración de salones: quedaron grupos con texto de salón sin salon_id';
    END IF;
END $$;

ALTER TABLE "grupo" DROP COLUMN "salon";

-- ── El salón de un grupo es de la misma sucursal que su programa ─────────────────────────────────────
CREATE FUNCTION "grupo_salon_misma_sucursal"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW."salon_id" IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM "salon" s JOIN "programa" p ON p."id" = NEW."programa_id" AND p."organizacion_id" = NEW."organizacion_id"
        WHERE s."id" = NEW."salon_id" AND s."organizacion_id" = NEW."organizacion_id" AND s."sucursal_id" = p."sucursal_id"
    ) THEN
        RAISE EXCEPTION 'grupo_salon_otra_sucursal: el salón del grupo debe ser de la sucursal de su programa' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER "grupo_salon_misma_sucursal_trg" BEFORE INSERT OR UPDATE OF "salon_id", "programa_id" ON "grupo"
    FOR EACH ROW EXECUTE FUNCTION "grupo_salon_misma_sucursal"();

-- Un programa no cambia de sucursal mientras sus grupos tengan salón (el salón es de la sucursal vieja).
CREATE FUNCTION "programa_sucursal_con_salones"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW."sucursal_id" <> OLD."sucursal_id" AND EXISTS (
        SELECT 1 FROM "grupo" g WHERE g."programa_id" = NEW."id" AND g."organizacion_id" = NEW."organizacion_id" AND g."salon_id" IS NOT NULL AND g."eliminado_en" IS NULL
    ) THEN
        RAISE EXCEPTION 'programa_sucursal_con_salones: quita el salón de sus grupos antes de cambiar el programa de sucursal' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER "programa_sucursal_con_salones_trg" BEFORE UPDATE OF "sucursal_id" ON "programa"
    FOR EACH ROW EXECUTE FUNCTION "programa_sucursal_con_salones"();

-- ── Choques de salón e instructor, EN LA BASE ─────────────────────────────────────────────────────────
-- Dos grupos activos no pueden usar el mismo salón, ni tener al mismo instructor, en franjas que se
-- traslapan (mismo día, inicio < fin del otro y fin > inicio del otro; terminar justo cuando empieza
-- la otra NO es choque). Una restricción de exclusión (btree_gist) no sirve aquí: el salón y el
-- instructor viven en `grupo` y las franjas en `grupo_horario`, y una exclusión mira UNA sola tabla.
-- En su lugar, un disparador por fila que, tras tomar un candado consultivo por (organización,
-- recurso), revisa los demás grupos. El candado serializa a dos transacciones que compiten por el mismo
-- salón o instructor: la segunda espera a que la primera termine, ve su fila ya confirmada y se rechaza.
-- Se usa READ COMMITTED (cada consulta de la función ve lo confirmado hasta ese momento). El código de
-- error es 23P01 (exclusion_violation) y el mensaje empieza con «choque_de_ocupacion».
-- Se crean DESPUÉS de migrar los datos: una base con choques heredados migra igual y el reporte
-- (verificación 3) los muestra.
CREATE FUNCTION "grupo_verificar_choques"(p_grupo uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
    g RECORD;
    otro RECORD;
BEGIN
    SELECT "id", "organizacion_id", "salon_id", "instructor_id" INTO g
    FROM "grupo" WHERE "id" = p_grupo AND "activo" AND "eliminado_en" IS NULL;
    IF NOT FOUND THEN
        RETURN;
    END IF;

    IF g."salon_id" IS NOT NULL THEN
        PERFORM pg_advisory_xact_lock(hashtextextended(g."organizacion_id"::text || '|ocupacion:salon:' || g."salon_id"::text, 0));
        SELECT o."nombre" AS nombre, ho."dia_semana" AS dia INTO otro
        FROM "grupo" o
        JOIN "grupo_horario" ho ON ho."grupo_id" = o."id" AND ho."organizacion_id" = o."organizacion_id" AND ho."eliminado_en" IS NULL
        JOIN "grupo_horario" hg ON hg."grupo_id" = g."id" AND hg."organizacion_id" = g."organizacion_id" AND hg."eliminado_en" IS NULL
             AND hg."dia_semana" = ho."dia_semana" AND hg."hora_inicio_min" < ho."hora_fin_min" AND ho."hora_inicio_min" < hg."hora_fin_min"
        WHERE o."organizacion_id" = g."organizacion_id" AND o."salon_id" = g."salon_id" AND o."id" <> g."id" AND o."activo" AND o."eliminado_en" IS NULL
        LIMIT 1;
        IF FOUND THEN
            RAISE EXCEPTION 'choque_de_ocupacion: el salón ya está ocupado por el grupo «%» el día %', otro.nombre, otro.dia USING ERRCODE = '23P01';
        END IF;
    END IF;

    IF g."instructor_id" IS NOT NULL THEN
        PERFORM pg_advisory_xact_lock(hashtextextended(g."organizacion_id"::text || '|ocupacion:instructor:' || g."instructor_id"::text, 0));
        SELECT o."nombre" AS nombre, ho."dia_semana" AS dia INTO otro
        FROM "grupo" o
        JOIN "grupo_horario" ho ON ho."grupo_id" = o."id" AND ho."organizacion_id" = o."organizacion_id" AND ho."eliminado_en" IS NULL
        JOIN "grupo_horario" hg ON hg."grupo_id" = g."id" AND hg."organizacion_id" = g."organizacion_id" AND hg."eliminado_en" IS NULL
             AND hg."dia_semana" = ho."dia_semana" AND hg."hora_inicio_min" < ho."hora_fin_min" AND ho."hora_inicio_min" < hg."hora_fin_min"
        WHERE o."organizacion_id" = g."organizacion_id" AND o."instructor_id" = g."instructor_id" AND o."id" <> g."id" AND o."activo" AND o."eliminado_en" IS NULL
        LIMIT 1;
        IF FOUND THEN
            RAISE EXCEPTION 'choque_de_ocupacion: el instructor ya da el grupo «%» el día %', otro.nombre, otro.dia USING ERRCODE = '23P01';
        END IF;
    END IF;
END;
$$;

CREATE FUNCTION "grupo_horario_choques"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    PERFORM "grupo_verificar_choques"(NEW."grupo_id");
    RETURN NULL;
END;
$$;
CREATE TRIGGER "grupo_horario_choques_trg" AFTER INSERT OR UPDATE OF "dia_semana", "hora_inicio_min", "hora_fin_min", "eliminado_en" ON "grupo_horario"
    FOR EACH ROW EXECUTE FUNCTION "grupo_horario_choques"();

CREATE FUNCTION "grupo_choques"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    PERFORM "grupo_verificar_choques"(NEW."id");
    RETURN NULL;
END;
$$;
CREATE TRIGGER "grupo_choques_trg" AFTER INSERT OR UPDATE OF "salon_id", "instructor_id", "activo", "eliminado_en" ON "grupo"
    FOR EACH ROW EXECUTE FUNCTION "grupo_choques"();
