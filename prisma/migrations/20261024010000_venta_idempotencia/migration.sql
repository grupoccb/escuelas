-- K9 (UI-03): vender es idempotente con clave, como los pagos. Si la respuesta se pierde (corte de red) y la persona reintenta, el segundo envío NO crea otra venta, otro cargo ni otro
-- descuento de existencia. La clave la manda la pantalla (una por envío); es opcional.
ALTER TABLE "venta" ADD COLUMN "clave_idempotencia" VARCHAR(120);
CREATE UNIQUE INDEX "venta_clave_idempotencia_key" ON "venta" ("organizacion_id", "clave_idempotencia") WHERE "clave_idempotencia" IS NOT NULL AND "eliminado_en" IS NULL;
