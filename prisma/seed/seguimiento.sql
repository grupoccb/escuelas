-- Seguimiento del lead (D6 a D8 y E1 a E2) para la organización de demo. ORDEN: demo.sql → catalogo.sql → catalogo-completo.sql →
-- clase-muestra.sql → ESTE archivo. Idempotente: ids fijos de 3 dígitos finales (`00000000-0000-4000-8000-000000000NNN`; los tests los
-- re-prefijan por organización) y todo con ON CONFLICT DO NOTHING.
--
-- Ids que usa este archivo: 91x documentos legales · 92x motivos de pérdida · 707+ plantillas · 805+ automatizaciones.
-- ⚠ TODOS los textos son EJEMPLOS marcados [SUPUESTO]: la escuela debe poner los suyos (y, el aviso de privacidad, el que revise su abogado).
-- Se publican desde administración como una versión nueva; las versiones ya publicadas NO se editan (la base lo impide).

-- ── D6: reglamento, autorización de uso de imagen y aviso de privacidad, versión 1 [SUPUESTO] ────────────────
-- Generales (sin vertical): valen para todas. La huella (SHA-256 del texto) es lo que cada aceptación copia como evidencia de lo mostrado.
INSERT INTO documento_legal (id, organizacion_id, tipo, vertical_id, version, titulo, texto, texto_hash, vigente_desde)
SELECT v.id::uuid, '00000000-0000-4000-8000-000000000001'::uuid, v.tipo::tipo_documento_legal, NULL, 1, v.titulo, v.texto,
       encode(sha256(convert_to(v.texto, 'UTF8')), 'hex'), TIMESTAMPTZ '2026-01-01 00:00:00+00'
FROM (VALUES
  ('00000000-0000-4000-8000-000000000911', 'reglamento', 'Reglamento de la escuela',
   E'[SUPUESTO — texto de ejemplo]\n1. Llegar puntual y con la ropa indicada por la escuela.\n2. Avisar con anticipación cuando el alumno no pueda asistir.\n3. Respetar a maestros, compañeros e instalaciones.\n4. Las mensualidades se pagan dentro de los primeros días de cada mes, en la fecha de corte acordada.\n5. Un adulto responsable debe recoger al alumno al terminar la clase.\n6. La escuela puede modificar este reglamento; la versión vigente se muestra siempre antes de aceptarla.'),
  ('00000000-0000-4000-8000-000000000912', 'uso_imagen', 'Autorización de uso de imagen',
   E'[SUPUESTO — texto de ejemplo]\nAutorizo a la escuela a tomar fotografías y videos del alumno durante las clases y eventos, y a usarlos en sus redes sociales y materiales de difusión. Puedo retirar esta autorización en cualquier momento avisando a la escuela; el retiro aplica hacia adelante.'),
  ('00000000-0000-4000-8000-000000000913', 'aviso_privacidad', 'Aviso de privacidad',
   E'[SUPUESTO — texto de ejemplo; debe revisarlo el abogado de la escuela]\nLa escuela usa los datos que me pide (nombre, teléfono, datos del alumno) para contactarme por WhatsApp, informarme de horarios, costos y clases, y dar seguimiento a la inscripción. No los comparte con terceros sin mi autorización. Puedo pedir acceso, corrección o baja de mis datos y dejar de recibir mensajes escribiendo BAJA.')
) AS v(id, tipo, titulo, texto)
ON CONFLICT DO NOTHING;

-- ── D7: motivos de pérdida [SUPUESTO] ────────────────────────────────────────────────────────────────────
-- Catálogo por organización, editable desde administración (`/api/motivos-perdida`). Perder un lead EXIGE elegir uno.
INSERT INTO motivo_perdida (id, organizacion_id, codigo, nombre, orden) VALUES
  ('00000000-0000-4000-8000-000000000921', '00000000-0000-4000-8000-000000000001', 'precio',              'Precio',                 1),
  ('00000000-0000-4000-8000-000000000922', '00000000-0000-4000-8000-000000000001', 'horario',             'Horario',                2),
  ('00000000-0000-4000-8000-000000000923', '00000000-0000-4000-8000-000000000001', 'distancia',           'Distancia',              3),
  ('00000000-0000-4000-8000-000000000924', '00000000-0000-4000-8000-000000000001', 'no_contesto',         'No contestó',            4),
  ('00000000-0000-4000-8000-000000000925', '00000000-0000-4000-8000-000000000001', 'eligio_otra_escuela', 'Eligió otra escuela',    5),
  ('00000000-0000-4000-8000-000000000926', '00000000-0000-4000-8000-000000000001', 'otro',                'Otro',                   9)
ON CONFLICT DO NOTHING;

-- Los días sin movimiento para alertar un lead estancado (y, en D8, el lead frío) son `etapa_pipeline.dias_alerta_sin_movimiento`, que ya trae
-- demo.sql por etapa [SUPUESTO]: 2, 3, 3, 3 y 5 días; las etapas de cierre (inscrito, perdido) no llevan umbral y nunca alertan.

-- ── D8: lead frío y promoción por vencer [SUPUESTO] ─────────────────────────────────────────────────────
-- Dos plantillas de MARKETING (el provider les aplica el máximo de 1 cada 7 días por teléfono, el de 3 automáticos al día, la baja de
-- marketing y la baja total) y sus automatizaciones. Ficticias y «aprobadas» solo para la demo local: en un ambiente real se sincronizan de
-- Twilio y solo sale lo que Meta aprobó. Los nombres de promoción, alumno y vertical salen de las tablas.
--   · lead_frio: un lead sin movimiento los días de su etapa (`etapa_pipeline.dias_alerta_sin_movimiento`) → tarea para el asesor y la plantilla
--     de reenganche. `offset_minutos` = minutos EXTRA después del umbral (0); `max_intentos` = episodios de frío por lead (3);
--     `condiciones.max_atraso_dias` = no se persigue lo que se enfrió hace más de 14 días. Lunes a sábado, 09:00–20:00 de la sucursal.
--   · promocion_por_vencer: un lead con una cotización vigente cuya promoción termina → la plantilla `-offset_minutos` antes (-4320 = 3 días).
INSERT INTO plantilla_mensaje (id, organizacion_id, codigo, content_sid, vertical_id, categoria, tipo_content, idioma, variables, cuerpo_referencia, estado_aprobacion, activo) VALUES
  ('00000000-0000-4000-8000-000000000707', '00000000-0000-4000-8000-000000000001', 'reenganche_lead_frio',
   'HX00000000000000000000000000000007', NULL, 'marketing', 'text', 'es_MX',
   '[{"pos":1,"nombre":"nombre_prospecto"},{"pos":2,"nombre":"nombre_vertical"}]',
   'Hola, ¿sigue interesado {{1}} en las clases de {{2}}? Con gusto te ayudamos a resolver tus dudas y a encontrar el horario ideal. Responde a este mensaje.',
   'aprobada', true),
  ('00000000-0000-4000-8000-000000000708', '00000000-0000-4000-8000-000000000001', 'promocion_por_vencer',
   'HX00000000000000000000000000000008', NULL, 'marketing', 'text', 'es_MX',
   '[{"pos":1,"nombre":"nombre_prospecto"},{"pos":2,"nombre":"nombre_promocion"},{"pos":3,"nombre":"fecha_vencimiento"}]',
   'La promoción {{2}} que te cotizamos para {{1}} vence el {{3}}. Responde a este mensaje y te ayudamos a aprovecharla.',
   'aprobada', true)
ON CONFLICT DO NOTHING;

INSERT INTO automatizacion (id, organizacion_id, nombre, vertical_id, sucursal_id, evento_disparador, offset_minutos, plantilla_id, max_intentos, condiciones, dias_permitidos) VALUES
  ('00000000-0000-4000-8000-000000000805', '00000000-0000-4000-8000-000000000001', 'Lead frío: reenganche', NULL, NULL,
   'lead_frio', 0, '00000000-0000-4000-8000-000000000707', 3, '{"max_atraso_dias":14}', ARRAY[1,2,3,4,5,6]),
  ('00000000-0000-4000-8000-000000000806', '00000000-0000-4000-8000-000000000001', 'Promoción por vencer: aviso 3 días antes', NULL, NULL,
   'promocion_por_vencer', -4320, '00000000-0000-4000-8000-000000000708', 1, '{}', ARRAY[1,2,3,4,5,6])
ON CONFLICT DO NOTHING;
