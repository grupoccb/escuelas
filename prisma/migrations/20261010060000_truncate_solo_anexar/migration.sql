-- EB-08: «solo de anexar» también contra TRUNCATE. Los disparadores de B3/B4 cubrían UPDATE y DELETE
-- por fila; TRUNCATE no es ninguno de los dos y vaciaba las tablas. Un disparador de sentencia
-- BEFORE TRUNCATE (que también salta cuando el TRUNCATE llega en cascada desde otra tabla) reutiliza
-- las mismas funciones, que rechazan sin mirar la fila.
--
-- Límite honesto: el dueño de la tabla puede quitar el disparador (ALTER TABLE … DISABLE TRIGGER).
-- La garantía completa exige que la cuenta con la que conecta la APLICACIÓN no sea dueña de las
-- tablas ni tenga TRUNCATE/ALTER/TRIGGER: ver docs/API.md, «Roles de base de datos».
CREATE TRIGGER "registro_cambio_solo_anexar_truncate_trg" BEFORE TRUNCATE ON "registro_cambio"
    FOR EACH STATEMENT EXECUTE FUNCTION "registro_cambio_solo_anexar"();
CREATE TRIGGER "acceso_dato_sensible_solo_anexar_truncate_trg" BEFORE TRUNCATE ON "acceso_dato_sensible"
    FOR EACH STATEMENT EXECUTE FUNCTION "acceso_dato_sensible_solo_anexar"();
