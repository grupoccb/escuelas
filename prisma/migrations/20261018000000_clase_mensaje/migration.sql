-- INV-6: cada plantilla DECLARA si es de servicio o de marketing (independiente de su categoría ante Meta).
-- Con una persona atendiendo la conversación (`en_atencion_humana`) salen los avisos de servicio sobre algo que la familia ya
-- acordó; la marketing no. La verificación vive en MessagingProvider.

CREATE TYPE "clase_mensaje" AS ENUM ('servicio', 'marketing');

ALTER TABLE "plantilla_mensaje" ADD COLUMN "clase_mensaje" "clase_mensaje";

-- Clasificación de las plantillas que ya existen. Criterio conservador: solo es de servicio lo que avisa de algo que la familia YA acordó
-- (recordatorio de clase muestra, bienvenida de inscripción, aviso al maestro) y no es de categoría marketing; TODO lo demás (reenganche,
-- recuperación de quien no llegó, lead frío, promoción por vencer, y cualquier código que no se reconozca) queda como marketing.
UPDATE "plantilla_mensaje"
SET "clase_mensaje" = CASE
  WHEN "categoria" <> 'marketing'
   AND ("codigo" IN ('recordatorio_clase_muestra', 'bienvenida_inscripcion') OR "codigo" LIKE 'aviso_maestro\_%')
  THEN 'servicio'::"clase_mensaje"
  ELSE 'marketing'::"clase_mensaje"
END;

-- Sin valor por omisión: quien da de alta una plantilla tiene que declararlo.
ALTER TABLE "plantilla_mensaje" ALTER COLUMN "clase_mensaje" SET NOT NULL;

-- Una plantilla que Meta clasifica como marketing no puede declararse de servicio.
ALTER TABLE "plantilla_mensaje"
  ADD CONSTRAINT "plantilla_mensaje_servicio_no_marketing_chk"
  CHECK ("clase_mensaje" = 'marketing' OR "categoria" <> 'marketing');
