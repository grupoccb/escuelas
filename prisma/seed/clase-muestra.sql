-- Clase muestra (D1 a D4) para la organización de demo. ORDEN: demo.sql → catalogo.sql → catalogo-completo.sql → ESTE
-- archivo. Idempotente: ids fijos de 3 dígitos finales (`00000000-0000-4000-8000-000000000NNN`; los tests los re-prefijan por
-- organización) y cada UPDATE solo toca lo que todavía no se ha tocado.
--
-- Ids que usa este archivo: 7xx plantillas · 8xx automatizaciones (los anteriores: 701 plantilla y 801 automatización del reenganche).
-- ⚠ Todo lo que la escuela aún no da (textos de las plantillas, anticipación, tiempos de recordatorio, intentos de recuperación)
-- va como EJEMPLO marcado [SUPUESTO] y se edita desde administración (J8). Las plantillas son FICTICIAS y están «aprobadas» solo
-- para la demo local: en un ambiente real se sincronizan desde Twilio y solo sale lo que Meta aprobó.

-- ── D1: el papel de cada etapa del embudo para el sistema ───────────────────────────────────────────────
-- El código NUNCA busca una etapa por su nombre: busca por `tipo_sistema`. Las etapas de la demo (demo.sql) se marcan por id.
-- «Nuevo»: en una base creada antes de demo.sql la primera etapa la crea la migración de Fase 1 con otro id (y demo.sql no inserta la 601 por chocar
-- con ella), así que se marca por su lugar (la primera abierta de la organización) y no por su id.
UPDATE etapa_pipeline SET tipo_sistema = 'nuevo'
WHERE organizacion_id = '00000000-0000-4000-8000-000000000001' AND orden = 1 AND NOT es_ganado AND NOT es_perdido AND eliminado_en IS NULL AND tipo_sistema IS NULL
  AND NOT EXISTS (SELECT 1 FROM etapa_pipeline x WHERE x.organizacion_id = '00000000-0000-4000-8000-000000000001' AND x.tipo_sistema = 'nuevo' AND x.eliminado_en IS NULL);
UPDATE etapa_pipeline SET tipo_sistema = 'contactado'        WHERE id = '00000000-0000-4000-8000-000000000602' AND tipo_sistema IS NULL;
UPDATE etapa_pipeline SET tipo_sistema = 'muestra_agendada'  WHERE id = '00000000-0000-4000-8000-000000000603' AND tipo_sistema IS NULL;
UPDATE etapa_pipeline SET tipo_sistema = 'muestra_asistida'  WHERE id = '00000000-0000-4000-8000-000000000604' AND tipo_sistema IS NULL;
UPDATE etapa_pipeline SET tipo_sistema = 'negociacion'       WHERE id = '00000000-0000-4000-8000-000000000605' AND tipo_sistema IS NULL;
UPDATE etapa_pipeline SET tipo_sistema = 'inscrito'          WHERE id = '00000000-0000-4000-8000-000000000606' AND tipo_sistema IS NULL;
UPDATE etapa_pipeline SET tipo_sistema = 'perdido'           WHERE id = '00000000-0000-4000-8000-000000000607' AND tipo_sistema IS NULL;

-- ── D1: el bot agenda la clase muestra (encendido en las tres verticales de la demo) ─────────────────────
-- Solo mientras nadie haya editado la vertical (`actualizado_en = creado_en`), para no pisar una decisión del administrador al volver a
-- correr el seed. Es un interruptor por vertical y solo tiene efecto con el cotizador de WhatsApp encendido. [SUPUESTO]
UPDATE vertical SET clase_muestra_whatsapp_activo = true
WHERE id IN ('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000103')
  AND NOT clase_muestra_whatsapp_activo AND actualizado_en = creado_en;

-- ── D2: plantillas del aviso al maestro [SUPUESTO] ───────────────────────────────────────────────────────
-- El código de cada una lo busca MessagingProvider (aviso_maestro_<tipo>); la categoría es utility (aviso a alguien que tiene una
-- relación con la escuela). Nunca llevan datos de salud: solo alumno, grupo, sucursal, fecha y hora. Ficticias y «aprobadas» solo para la demo.
INSERT INTO plantilla_mensaje (id, organizacion_id, codigo, content_sid, vertical_id, categoria, tipo_content, idioma, variables, cuerpo_referencia, estado_aprobacion, activo) VALUES
  ('00000000-0000-4000-8000-000000000702', '00000000-0000-4000-8000-000000000001', 'aviso_maestro_agendada',
   'HX00000000000000000000000000000002', NULL, 'utility', 'text', 'es_MX',
   '[{"pos":1,"nombre":"nombre_alumno"},{"pos":2,"nombre":"nombre_grupo"},{"pos":3,"nombre":"fecha_clase"},{"pos":4,"nombre":"hora_clase"},{"pos":5,"nombre":"nombre_sucursal"}]',
   'Nueva clase muestra: {{1}} en {{2}}, el {{3}} a las {{4}} (sucursal {{5}}).',
   'aprobada', true),
  ('00000000-0000-4000-8000-000000000703', '00000000-0000-4000-8000-000000000001', 'aviso_maestro_reprogramada',
   'HX00000000000000000000000000000003', NULL, 'utility', 'text', 'es_MX',
   '[{"pos":1,"nombre":"nombre_alumno"},{"pos":2,"nombre":"nombre_grupo"},{"pos":3,"nombre":"fecha_clase"},{"pos":4,"nombre":"hora_clase"},{"pos":5,"nombre":"nombre_sucursal"},{"pos":6,"nombre":"fecha_anterior"}]',
   'Se cambió la clase muestra de {{1}} en {{2}}: era {{6}}, ahora es el {{3}} a las {{4}} (sucursal {{5}}).',
   'aprobada', true),
  ('00000000-0000-4000-8000-000000000704', '00000000-0000-4000-8000-000000000001', 'aviso_maestro_cancelada',
   'HX00000000000000000000000000000004', NULL, 'utility', 'text', 'es_MX',
   '[{"pos":1,"nombre":"nombre_alumno"},{"pos":2,"nombre":"nombre_grupo"},{"pos":3,"nombre":"fecha_clase"},{"pos":4,"nombre":"hora_clase"},{"pos":5,"nombre":"nombre_sucursal"}]',
   'Se canceló la clase muestra de {{1}} en {{2}} del {{3}} a las {{4}} (sucursal {{5}}).',
   'aprobada', true)
ON CONFLICT DO NOTHING;

-- ── D3: recordatorios de la clase muestra al lead, 24 h y 2 h antes [SUPUESTO] ────────────────────────
-- Una sola plantilla (utility) y dos automatizaciones del evento `clase_muestra_proxima`; `offset_minutos` es NEGATIVO (-1440 = 24 h antes,
-- -120 = 2 h antes) y se edita desde administración. TODOS los días permitidos (incluido el domingo): una clase en domingo se recuerda en
-- domingo. Lo que caiga antes de las 09:00 se recorre a las 09:00 (invariante 14); si con eso llegara a la hora de la clase o después, se descarta.
INSERT INTO plantilla_mensaje (id, organizacion_id, codigo, content_sid, vertical_id, categoria, tipo_content, idioma, variables, cuerpo_referencia, estado_aprobacion, activo) VALUES
  ('00000000-0000-4000-8000-000000000705', '00000000-0000-4000-8000-000000000001', 'recordatorio_clase_muestra',
   'HX00000000000000000000000000000005', NULL, 'utility', 'text', 'es_MX',
   '[{"pos":1,"nombre":"nombre_prospecto"},{"pos":2,"nombre":"nombre_grupo"},{"pos":3,"nombre":"fecha_clase"},{"pos":4,"nombre":"hora_clase"},{"pos":5,"nombre":"nombre_sucursal"}]',
   'Te recordamos la clase muestra de {{1}}: {{3}} a las {{4}}, grupo {{2}}, sucursal {{5}}. ¡Los esperamos!',
   'aprobada', true)
ON CONFLICT DO NOTHING;

INSERT INTO automatizacion (id, organizacion_id, nombre, vertical_id, sucursal_id, evento_disparador, offset_minutos, plantilla_id, max_intentos, dias_permitidos) VALUES
  ('00000000-0000-4000-8000-000000000802', '00000000-0000-4000-8000-000000000001', 'Recordatorio de clase muestra: 24 h antes', NULL, NULL,
   'clase_muestra_proxima', -1440, '00000000-0000-4000-8000-000000000705', 1, ARRAY[0,1,2,3,4,5,6]),
  ('00000000-0000-4000-8000-000000000803', '00000000-0000-4000-8000-000000000001', 'Recordatorio de clase muestra: 2 h antes', NULL, NULL,
   'clase_muestra_proxima', -120, '00000000-0000-4000-8000-000000000705', 1, ARRAY[0,1,2,3,4,5,6])
ON CONFLICT DO NOTHING;

-- ── D4: recuperación de quien no llegó a su clase muestra [SUPUESTO] ─────────────────────────────────────
-- Evento `clase_muestra_no_asistio`: nace al MARCAR que no asistió. `offset_minutos` es positivo (120 = 2 h después de marcarlo) y los intentos
-- siguientes salen cada `espaciado_minutos` (2 días), hasta `max_intentos` (2). Dentro del horario de envío de la sucursal, también el domingo.
-- Respeta baja, frecuencia y atención humana (MessagingProvider); si la familia contesta, la conversación llega a un asesor, que reagenda.
INSERT INTO plantilla_mensaje (id, organizacion_id, codigo, content_sid, vertical_id, categoria, tipo_content, idioma, variables, cuerpo_referencia, estado_aprobacion, activo) VALUES
  ('00000000-0000-4000-8000-000000000706', '00000000-0000-4000-8000-000000000001', 'recuperacion_no_asistio',
   'HX00000000000000000000000000000006', NULL, 'utility', 'text', 'es_MX',
   '[{"pos":1,"nombre":"nombre_prospecto"},{"pos":2,"nombre":"nombre_grupo"},{"pos":3,"nombre":"fecha_clase"}]',
   'Hola, vimos que {{1}} no pudo asistir a su clase muestra de {{2}} del {{3}}. ¿Te gustaría reagendarla? Responde a este mensaje y te ayudamos.',
   'aprobada', true)
ON CONFLICT DO NOTHING;

INSERT INTO automatizacion (id, organizacion_id, nombre, vertical_id, sucursal_id, evento_disparador, offset_minutos, espaciado_minutos, plantilla_id, max_intentos, dias_permitidos) VALUES
  ('00000000-0000-4000-8000-000000000804', '00000000-0000-4000-8000-000000000001', 'Recuperación de quien no llegó a la clase muestra', NULL, NULL,
   'clase_muestra_no_asistio', 120, 2880, '00000000-0000-4000-8000-000000000706', 2, ARRAY[0,1,2,3,4,5,6])
ON CONFLICT DO NOTHING;
