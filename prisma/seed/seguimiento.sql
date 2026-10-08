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
