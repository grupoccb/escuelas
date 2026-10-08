-- F2: al convertir un lead, la ficha de salud del prospecto se traslada a la del alumno. El registro de accesos distingue ese traslado
-- (acción `trasladar`, sin mostrar nada) de una lectura, una escritura y la validación interna del contacto de emergencia.
ALTER TABLE "acceso_dato_sensible" DROP CONSTRAINT "acceso_dato_sensible_valores_check";
ALTER TABLE "acceso_dato_sensible" ADD CONSTRAINT "acceso_dato_sensible_valores_check"
    CHECK ("accion" IN ('leer', 'escribir', 'validar', 'trasladar') AND "resultado" IN ('permitido', 'denegado'));
