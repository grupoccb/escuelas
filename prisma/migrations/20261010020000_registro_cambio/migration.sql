-- CreateTable
CREATE TABLE "registro_cambio" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizacion_id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "entidad_tipo" TEXT NOT NULL,
    "entidad_id" UUID NOT NULL,
    "accion" TEXT NOT NULL,
    "antes" JSONB,
    "despues" JSONB,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eliminado_en" TIMESTAMPTZ(6),

    CONSTRAINT "registro_cambio_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "registro_cambio_organizacion_id_idx" ON "registro_cambio"("organizacion_id");

-- CreateIndex
CREATE INDEX "registro_cambio_organizacion_id_entidad_tipo_entidad_id_idx" ON "registro_cambio"("organizacion_id", "entidad_tipo", "entidad_id");

-- CreateIndex
CREATE INDEX "registro_cambio_organizacion_id_creado_en_idx" ON "registro_cambio"("organizacion_id", "creado_en");

-- CreateIndex
CREATE UNIQUE INDEX "registro_cambio_id_organizacion_id_key" ON "registro_cambio"("id", "organizacion_id");

-- AddForeignKey
ALTER TABLE "registro_cambio" ADD CONSTRAINT "registro_cambio_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registro_cambio" ADD CONSTRAINT "registro_cambio_usuario_id_organizacion_id_fkey" FOREIGN KEY ("usuario_id", "organizacion_id") REFERENCES "usuario"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;


-- Solo de anexar: ni UPDATE ni DELETE (un registro de auditoría que se puede reescribir no sirve).
CREATE FUNCTION "registro_cambio_solo_anexar"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'registro_cambio es de solo anexar (no se actualiza ni se borra)';
END;
$$;
CREATE TRIGGER "registro_cambio_solo_anexar_trg" BEFORE UPDATE OR DELETE ON "registro_cambio"
    FOR EACH ROW EXECUTE FUNCTION "registro_cambio_solo_anexar"();
