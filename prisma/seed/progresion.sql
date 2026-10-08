-- G3: peldaños de la progresión de cada vertical de la demo [SUPUESTO]. Son FILAS: la escuela los edita desde administración (GET|POST|PATCH|DELETE /api/niveles) y
-- cómo se llama el avance en cada vertical lo dice `vertical.etiqueta_progresion` (catalogo-completo.sql). Nada de esto vive en el código (invariante 2).
-- Las `clases_minimas` son las asistencias `presente` que hacen falta DESDE el peldaño anterior para ser elegible a ese peldaño (G4); el primero no exige ninguna.
-- Los ids son fijos e idempotentes (ON CONFLICT DO NOTHING). Ninguna cifra ni color de aquí lo dio la escuela.

-- Karate (101): siete peldaños, por color. [SUPUESTO]
INSERT INTO nivel_progresion (id, organizacion_id, vertical_id, nombre, orden, color_hex, horas_minimas, clases_minimas, requisitos_texto) VALUES
  ('00000000-0000-4000-8000-000000000141', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000101', 'Blanco',   1, '#FFFFFF', 0,   0,   'Peldaño inicial: lo recibe quien entra.'),
  ('00000000-0000-4000-8000-000000000142', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000101', 'Amarillo', 2, '#F1C40F', 20,  20,  'Postura básica y primeras formas. [SUPUESTO]'),
  ('00000000-0000-4000-8000-000000000143', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000101', 'Naranja',  3, '#E67E22', 30,  30,  'Formas del peldaño anterior y combinaciones. [SUPUESTO]'),
  ('00000000-0000-4000-8000-000000000144', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000101', 'Verde',    4, '#27AE60', 40,  40,  'Forma propia del peldaño y defensa básica. [SUPUESTO]'),
  ('00000000-0000-4000-8000-000000000145', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000101', 'Azul',     5, '#2980B9', 50,  50,  'Formas avanzadas y trabajo en pareja. [SUPUESTO]'),
  ('00000000-0000-4000-8000-000000000146', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000101', 'Café',     6, '#8D6E63', 60,  60,  'Preparación para el último peldaño. [SUPUESTO]'),
  ('00000000-0000-4000-8000-000000000147', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000101', 'Negro',    7, '#212121', 100, 100, 'Examen completo ante el maestro. [SUPUESTO]')
ON CONFLICT DO NOTHING;

-- Ballet (102): los seis peldaños recomendados en docs/CONTEXTO-PROYECTO.md §7 (Pre-ballet → Avanzado). Las clases mínimas son [SUPUESTO].
INSERT INTO nivel_progresion (id, organizacion_id, vertical_id, nombre, orden, color_hex, horas_minimas, clases_minimas, requisitos_texto) VALUES
  ('00000000-0000-4000-8000-000000000151', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000102', 'Pre-ballet',    1, '#F8BBD0', 0,  0,  'Peldaño inicial: lo recibe quien entra.'),
  ('00000000-0000-4000-8000-000000000152', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000102', 'Básico I',      2, '#F48FB1', 24, 24, 'Posiciones y barra básica. [SUPUESTO]'),
  ('00000000-0000-4000-8000-000000000153', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000102', 'Básico II',     3, '#EC407A', 36, 36, 'Barra completa y centro básico. [SUPUESTO]'),
  ('00000000-0000-4000-8000-000000000154', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000102', 'Intermedio I',  4, '#AB47BC', 48, 48, 'Saltos y giros sencillos. [SUPUESTO]'),
  ('00000000-0000-4000-8000-000000000155', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000102', 'Intermedio II', 5, '#7B1FA2', 60, 60, 'Combinaciones de centro. [SUPUESTO]'),
  ('00000000-0000-4000-8000-000000000156', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000102', 'Avanzado',     6, '#4A148C', 72, 72, 'Repertorio y variaciones. [SUPUESTO]')
ON CONFLICT DO NOTHING;

-- Baile (103): tres peldaños. Ojo: en catalogo-completo.sql la vertical está con `usa_progresion = false` [SUPUESTO]; estos peldaños quedan listos para cuando la escuela
-- la encienda (mientras no, la API rechaza otorgarlos con `vertical_sin_progresion`).
INSERT INTO nivel_progresion (id, organizacion_id, vertical_id, nombre, orden, color_hex, horas_minimas, clases_minimas, requisitos_texto) VALUES
  ('00000000-0000-4000-8000-000000000161', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000103', 'Principiante', 1, '#FFCC80', 0,  0,  'Peldaño inicial: lo recibe quien entra.'),
  ('00000000-0000-4000-8000-000000000162', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000103', 'Intermedio',   2, '#FB8C00', 16, 16, 'Pasos básicos con pareja. [SUPUESTO]'),
  ('00000000-0000-4000-8000-000000000163', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000103', 'Avanzado',     3, '#E65100', 32, 32, 'Coreografía completa. [SUPUESTO]')
ON CONFLICT DO NOTHING;
