-- K9 (EK-I04): el alta de un gasto de campaña es idempotente. Un gasto no se edita y su único remedio es darlo de baja, así que un doble clic o un reintento de red que lo
-- duplicara inflaría el costo por alumno inscrito sin arreglo cómodo. La clave la manda la pantalla (una por envío); es opcional (las altas por API sin clave siguen igual).
ALTER TABLE "gasto_campana" ADD COLUMN "clave_idempotencia" VARCHAR(120);
CREATE UNIQUE INDEX "gasto_campana_clave_idempotencia_key" ON "gasto_campana" ("organizacion_id", "campana_id", "clave_idempotencia") WHERE "clave_idempotencia" IS NOT NULL AND "eliminado_en" IS NULL;
