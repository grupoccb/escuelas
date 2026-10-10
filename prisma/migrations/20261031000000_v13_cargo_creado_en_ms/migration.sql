-- V13-fix (EV-43): el orden de antigüedad de los cargos (vencimiento, concepto, creación, id) lo calcula la base al listar y el servidor, en memoria, al repartir un pago. La base guarda
-- `creado_en` en MICROsegundos y JavaScript lo lee en MILIsegundos: dos cargos creados dentro del mismo milisegundo salían en un orden en la lista y en otro en el reparto. Ahora la base
-- también lo guarda en milisegundos (truncado), así que las dos cuentas coinciden y el empate lo decide `id`, igual en los dos lados.

-- Lo que ya existe se trunca (idempotente: solo toca lo que trae microsegundos). `creado_en` no está entre las columnas que el blindaje del cargo protege.
UPDATE "cargo" SET "creado_en" = date_trunc('milliseconds', "creado_en") WHERE "creado_en" <> date_trunc('milliseconds', "creado_en");

CREATE FUNCTION "cargo_creado_en_ms"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    NEW."creado_en" := date_trunc('milliseconds', NEW."creado_en");
    RETURN NEW;
END
$$;

CREATE TRIGGER "cargo_creado_en_ms_trg" BEFORE INSERT OR UPDATE OF "creado_en" ON "cargo" FOR EACH ROW EXECUTE FUNCTION "cargo_creado_en_ms"();
