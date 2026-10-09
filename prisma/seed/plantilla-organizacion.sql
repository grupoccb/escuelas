-- PLANTILLA para dar de alta una escuela nueva (K7, docs/ALTA-DE-CLIENTE.md). NO se corre sola ni la corre docker compose.
--
-- El alta de organizaciones NO está construida a propósito (invariante 1): la organización nace por seed, como esta. Copia el archivo, cambia SOLO los dos valores marcados
-- con CAMBIAR (nombre e identificador de inicio de sesión; la zona horaria de cada sucursal se pone al darlas de alta) y córrelo UNA vez
-- contra la base de la escuela con la cuenta que migra:
--
--     DATABASE_URL=<cuenta dueña> npx prisma db execute --file prisma/seed/mi-escuela.sql
--
-- Es idempotente (volver a correrlo no duplica nada). Crea la organización, las siete etapas del embudo con su papel para el sistema y la configuración con los valores
-- por omisión del contexto (3 mensajes automáticos al día y 1 de marketing cada 7 días). Todo lo demás —verticales, sucursales, programas, grupos, horarios, instructores,
-- precios, promociones, plantillas, automatizaciones, documentos legales, usuarios— se da de alta desde la administración (interfaz o API), sin tocar código ni seeds.
-- NO incluye usuarios: el primer administrador se crea con `scripts/crear-usuario.ts` (las contraseñas de la demo son públicas y no deben existir en una escuela real).

DO $$
DECLARE
  org uuid;
  nombre_escuela text := 'CAMBIAR: nombre de la escuela';
  identificador  text := 'CAMBIAR-identificador-corto';  -- minúsculas, números y guiones; es lo que se escribe al iniciar sesión
BEGIN
  SELECT id INTO org FROM organizacion WHERE slug = identificador AND eliminado_en IS NULL;
  IF org IS NULL THEN
    INSERT INTO organizacion (nombre, slug) VALUES (nombre_escuela, identificador) RETURNING id INTO org;
  END IF;

  -- Etapas del embudo. El código NUNCA busca una etapa por su nombre: busca por `tipo_sistema`; los nombres son de la escuela y se pueden cambiar.
  INSERT INTO etapa_pipeline (organizacion_id, nombre, orden, es_ganado, es_perdido, dias_alerta_sin_movimiento, tipo_sistema)
  SELECT org, v.nombre, v.orden, v.ganado, v.perdido, v.dias, v.tipo::tipo_sistema_etapa
  FROM (VALUES
    ('Nuevo',                  1, false, false, 2,    'nuevo'),
    ('Contactado',             2, false, false, 3,    'contactado'),
    ('Clase muestra agendada', 3, false, false, 3,    'muestra_agendada'),
    ('Clase muestra asistida', 4, false, false, 3,    'muestra_asistida'),
    ('Negociación',            5, false, false, 5,    'negociacion'),
    ('Inscrito',               6, true,  false, NULL, 'inscrito'),
    ('Perdido',                7, false, true,  NULL, 'perdido')
  ) AS v(nombre, orden, ganado, perdido, dias, tipo)
  WHERE NOT EXISTS (SELECT 1 FROM etapa_pipeline e WHERE e.organizacion_id = org AND e.tipo_sistema = v.tipo::tipo_sistema_etapa AND e.eliminado_en IS NULL);

  -- Configuración de la organización: los valores por omisión de la columna (editables desde administración).
  INSERT INTO configuracion_organizacion (organizacion_id)
  SELECT org WHERE NOT EXISTS (SELECT 1 FROM configuracion_organizacion c WHERE c.organizacion_id = org AND c.eliminado_en IS NULL);
END $$;
