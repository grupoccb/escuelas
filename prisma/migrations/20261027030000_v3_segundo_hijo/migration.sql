-- V3, segundo hijo: el asesor agrega más niños a un lead. Tres datos nuevos del prospecto (apellidos, fecha de nacimiento y la clave de idempotencia del alta) y dos índices
-- únicos parciales como red de seguridad de la regla «el mismo niño no se duplica en un lead» (el código ya la aplica bajo el candado del lead).
ALTER TABLE "prospecto" ADD COLUMN "apellidos" VARCHAR(120);
ALTER TABLE "prospecto" ADD COLUMN "fecha_nacimiento" DATE;
ALTER TABLE "prospecto" ADD COLUMN "clave_idempotencia" VARCHAR(120);

-- Reintentar el mismo alta (misma clave) en el mismo lead no crea otro niño.
CREATE UNIQUE INDEX "prospecto_clave_idempotencia_key" ON "prospecto" ("organizacion_id", "lead_id", "clave_idempotencia") WHERE "clave_idempotencia" IS NOT NULL AND "eliminado_en" IS NULL;

-- Mismo nombre (sin importar mayúsculas ni espacios de los lados) y misma fecha de nacimiento en el mismo lead: es el mismo niño.
CREATE UNIQUE INDEX "prospecto_nombre_nacimiento_vivo_key" ON "prospecto" ("organizacion_id", "lead_id", lower(btrim("nombre")), "fecha_nacimiento") WHERE "nombre" IS NOT NULL AND "fecha_nacimiento" IS NOT NULL AND "eliminado_en" IS NULL;
