-- V1: módulos por organización. Seis interruptores en la configuración de la organización (la captación es el módulo base y no se apaga, por eso no tiene columna).
-- Las organizaciones que ya existen quedan con TODO encendido (el default de la columna): nada de lo que hoy funciona se apaga solo. La plantilla de una organización
-- nueva (prisma/seed/plantilla-organizacion.sql) es la que nace con solo la captación.
ALTER TABLE "configuracion_organizacion"
  ADD COLUMN "modulo_cotizador"     BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "modulo_clase_muestra" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "modulo_inscripcion"   BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "modulo_operacion"     BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "modulo_finanzas"      BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "modulo_tableros"      BOOLEAN NOT NULL DEFAULT true;

-- Dependencias entre módulos (también las valida la API con un mensaje claro; esto es la última defensa):
--   inscripción necesita el cotizador (el asistente de inscripción elige grupo con la oferta de programas, horarios, lugares y precios);
--   operación y finanzas necesitan inscripción; tableros necesita inscripción, finanzas y clase muestra.
ALTER TABLE "configuracion_organizacion" ADD CONSTRAINT "configuracion_modulos_dependencias_chk" CHECK (
  (NOT "modulo_inscripcion" OR "modulo_cotizador")
  AND (NOT "modulo_operacion" OR "modulo_inscripcion")
  AND (NOT "modulo_finanzas" OR "modulo_inscripcion")
  AND (NOT "modulo_tableros" OR ("modulo_inscripcion" AND "modulo_finanzas" AND "modulo_clase_muestra"))
);
