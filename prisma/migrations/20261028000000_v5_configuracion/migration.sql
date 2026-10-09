-- V5, configuración sin SQL. Lo que la escuela cambiaría en la operación normal y hoy era una constante del código pasa a la configuración de la organización
-- (se edita en Administración → Configuración, sin reiniciar). Cada ajuste nace con el MISMO valor que tenía la constante: nada cambia mientras nadie lo toque.
ALTER TABLE "configuracion_organizacion"
  ADD COLUMN "horario_envio_inicio_min" INTEGER NOT NULL DEFAULT 540,
  ADD COLUMN "horario_envio_fin_min"    INTEGER NOT NULL DEFAULT 1200,
  ADD COLUMN "lead_a_medias_minutos"    INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN "bot_max_intentos"         INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN "ocupacion_a_reventar_pct" INTEGER NOT NULL DEFAULT 90,
  ADD COLUMN "ocupacion_vacio_pct"      INTEGER NOT NULL DEFAULT 25;

-- INVARIANTE 14: la escuela puede ESTRECHAR el horario de envío (por ejemplo, 10:00 a 18:00), nunca ampliarlo más allá de 09:00 a 20:00 (540 a 1200 minutos desde la medianoche).
ALTER TABLE "configuracion_organizacion" ADD CONSTRAINT "configuracion_horario_envio_chk" CHECK (
  "horario_envio_inicio_min" >= 540 AND "horario_envio_fin_min" <= 1200 AND "horario_envio_inicio_min" < "horario_envio_fin_min"
);
-- Minutos de silencio del contacto antes de avisar a los asesores que dejó la conversación a medias (de 5 minutos a 24 horas).
ALTER TABLE "configuracion_organizacion" ADD CONSTRAINT "configuracion_lead_a_medias_chk" CHECK ("lead_a_medias_minutos" BETWEEN 5 AND 1440);
-- Respuestas que el bot no entiende antes de pasar la conversación a una persona (de 1 a 10).
ALTER TABLE "configuracion_organizacion" ADD CONSTRAINT "configuracion_bot_intentos_chk" CHECK ("bot_max_intentos" BETWEEN 1 AND 10);
-- Ocupación (en %) con la que un grupo se marca «a reventar» o «vacío» en el tablero ejecutivo: vacío siempre queda por debajo de a reventar.
ALTER TABLE "configuracion_organizacion" ADD CONSTRAINT "configuracion_ocupacion_chk" CHECK (
  "ocupacion_a_reventar_pct" BETWEEN 1 AND 100 AND "ocupacion_vacio_pct" BETWEEN 0 AND 99 AND "ocupacion_vacio_pct" < "ocupacion_a_reventar_pct"
);

-- Textos del bot que la escuela personalizó. Solo guarda lo que CAMBIÓ: sin fila, el bot usa el texto de siempre (el que trae el código, genérico, con huecos como {nombre}).
-- Restablecer = baja lógica de la fila (invariante 3). El servidor valida el texto contra el catálogo de huecos de cada mensaje; la base solo repite lo esencial.
CREATE TABLE "texto_bot" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizacion_id" UUID NOT NULL,
    "clave" VARCHAR(60) NOT NULL,
    "texto" VARCHAR(600) NOT NULL,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eliminado_en" TIMESTAMPTZ(6),

    CONSTRAINT "texto_bot_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "texto_bot_clave_chk" CHECK ("clave" ~ '^[a-z][a-z0-9_]*$'),
    CONSTRAINT "texto_bot_texto_chk" CHECK (length(btrim("texto")) >= 1)
);

CREATE INDEX "texto_bot_organizacion_id_idx" ON "texto_bot"("organizacion_id");
CREATE UNIQUE INDEX "texto_bot_id_organizacion_id_key" ON "texto_bot"("id", "organizacion_id");
-- A lo más un texto vivo por mensaje y organización.
CREATE UNIQUE INDEX "texto_bot_clave_viva_key" ON "texto_bot"("organizacion_id", "clave") WHERE "eliminado_en" IS NULL;

ALTER TABLE "texto_bot" ADD CONSTRAINT "texto_bot_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
