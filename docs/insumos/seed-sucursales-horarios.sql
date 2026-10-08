-- ============================================================
-- SEED — Sucursales, verticales, programas, grupos y horarios
-- Datos proporcionados por la escuela
--
-- Rangos de edad: 3-5, 6-13 y 14+ (sin traslape).
-- Un programa = un rango de edad.  Un grupo = una opción de horario.
--
-- Convención dia_semana:  0=Dom 1=Lun 2=Mar 3=Mié 4=Jue 5=Vie 6=Sáb
--
-- ⚠️  Los valores marcados [SUPUESTO] necesitan confirmación.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- VERTICALES
-- ------------------------------------------------------------
INSERT INTO vertical (nombre, slug, etiqueta_progresion, etiqueta_evento, usa_progresion, activo) VALUES
 ('Karate', 'karate', 'Cinturón', 'Examen',   true,  true),
 ('Ballet', 'ballet', 'Nivel',    'Recital',  true,  true),
 ('Baile',  'baile',  'Nivel',    'Showcase', false, true);

-- ------------------------------------------------------------
-- SUCURSALES
-- ------------------------------------------------------------
INSERT INTO sucursal (nombre, direccion, zona_horaria, activo) VALUES
 ('Águilas',    '[PENDIENTE]', 'America/Mexico_City', true),
 ('Centenario', '[PENDIENTE]', 'America/Mexico_City', true);

INSERT INTO sucursal_vertical (sucursal_id, vertical_id, activo)
SELECT s.id, v.id, true
FROM sucursal s CROSS JOIN vertical v;

-- ============================================================
-- PROGRAMAS  (14 — un programa por rango de edad y sucursal)
-- Rangos exclusivos: ninguna edad cae en dos programas de la
-- misma vertical y sucursal. El cotizador devuelve exactamente uno.
-- ============================================================

INSERT INTO programa (vertical_id, sucursal_id, nombre, edad_min, edad_max, nivel, descripcion_publica, activo)
SELECT v.id, s.id, p.nombre, p.edad_min, p.edad_max, p.nivel, p.desc_pub, true
FROM (VALUES
  -- ---------- ÁGUILAS ----------
  ('Águilas','Karate','Karate Infantil 3-5',    3,  5, 'Iniciación', 'Clases de 45 min: coordinación, disciplina y juego.'),
  ('Águilas','Karate','Karate 6-13',            6, 13, 'Básico',     'Técnica, katas, kumite y exámenes de cinturón.'),
  ('Águilas','Karate','Karate 14+ y Adultos',  14, 99, 'Intermedio', 'Karate para adolescentes y adultos: kumite y grados avanzados.'),
  ('Águilas','Ballet','Ballet Infantil 3-5',    3,  5, 'Pre-ballet', 'Introducción lúdica al ballet clásico.'),
  ('Águilas','Ballet','Ballet 6-13',            6, 13, 'Básico',     'Técnica de barra y centro, preparación a recital.'),
  ('Águilas','Ballet','Ballet 14+ y Adultos',  14, 99, 'Intermedio', 'Ballet clásico para adolescentes y adultos.'),
  ('Águilas','Baile', 'Salsa y Cumbia',        15, 99, 'Abierto',    'Baile social para adolescentes y adultos.'),
  ('Águilas','Baile', 'Twerk',                 15, 99, 'Abierto',    'Twerk: acondicionamiento y coreografía.'),
  -- ---------- CENTENARIO ----------
  ('Centenario','Karate','Karate Infantil 3-5', 3,  5, 'Iniciación', 'Clases de 45 min: coordinación, disciplina y juego.'),
  ('Centenario','Karate','Karate 6-13',         6, 13, 'Básico',     'Técnica, katas, kumite y exámenes de cinturón.'),
  ('Centenario','Karate','Karate 14+ y Adultos',14, 99, 'Intermedio', 'Karate para adolescentes y adultos: kumite y grados avanzados.'),
  ('Centenario','Ballet','Ballet Infantil 3-5', 3,  5, 'Pre-ballet', 'Introducción lúdica al ballet clásico.'),
  ('Centenario','Ballet','Ballet 6-13',         6, 13, 'Básico',     'Técnica de barra y centro, preparación a recital.'),
  ('Centenario','Baile', 'Salsa y Cumbia',     15, 99, 'Abierto',    'Baile social para adolescentes y adultos.')
) AS p(sucursal, vertical, nombre, edad_min, edad_max, nivel, desc_pub)
JOIN sucursal s ON s.nombre = p.sucursal
JOIN vertical v ON v.nombre = p.vertical;

-- ============================================================
-- GRUPOS  (18 — cada uno es una opción de horario)
-- "Lun-Mié O Mar-Jue" son DOS grupos, no uno de cuatro días.
-- ============================================================

INSERT INTO grupo (programa_id, nombre, salon, cupo_maximo, permite_lista_espera, activo)
SELECT pr.id, g.nombre, g.salon, g.cupo, true, true
FROM (VALUES
  -- ---------- ÁGUILAS · KARATE ----------
  ('Águilas','Karate Infantil 3-5', 'Lun-Mié 4:00 pm', 'Dojo', 12),
  ('Águilas','Karate Infantil 3-5', 'Mar-Jue 4:00 pm', 'Dojo', 12),
  ('Águilas','Karate 6-13',         'Lun-Mié 5:00 pm', 'Dojo', 18),
  ('Águilas','Karate 6-13',         'Mar-Jue 5:00 pm', 'Dojo', 18),
  ('Águilas','Karate 6-13',         'Sáb 10:00 am',    'Dojo', 18),
  ('Águilas','Karate 14+ y Adultos','Mar-Jue 6:15 pm', 'Dojo', 20),
  -- ---------- ÁGUILAS · BALLET ----------
  ('Águilas','Ballet Infantil 3-5', 'Lun-Mié 6:30 pm', 'Salón 2', 12),
  ('Águilas','Ballet 6-13',         'Sáb 12:00 pm',    'Salón 2', 15),
  ('Águilas','Ballet 14+ y Adultos','Sáb 1:30 pm',     'Salón 2', 15),
  -- ---------- ÁGUILAS · BAILE ----------
  ('Águilas','Salsa y Cumbia',      'Mar-Jue 8:00 pm', 'Salón 2', 24),
  ('Águilas','Twerk',               'Dom 10:00 am',    'Salón 2', 20),
  -- ---------- CENTENARIO · KARATE ----------
  ('Centenario','Karate Infantil 3-5','Mar-Jue 4:00 pm','Dojo', 12),
  ('Centenario','Karate 6-13',       'Mar-Jue 5:00 pm', 'Dojo', 18),
  ('Centenario','Karate 14+ y Adultos','Mar-Jue 6:15 pm','Dojo', 20),
  -- ---------- CENTENARIO · BALLET ----------
  ('Centenario','Ballet Infantil 3-5','Lun-Mié 4:00 pm','Salón 1', 12),
  ('Centenario','Ballet 6-13',       'Lun-Mié 5:00 pm', 'Salón 1', 15),
  ('Centenario','Ballet 6-13',       'Sáb 10:00 am',    'Salón 1', 15),
  -- ---------- CENTENARIO · BAILE ----------
  ('Centenario','Salsa y Cumbia',    'Lun-Mié 6:30 pm', 'Salón 1', 24)
) AS g(sucursal, programa, nombre, salon, cupo)
JOIN sucursal s  ON s.nombre  = g.sucursal
JOIN programa pr ON pr.nombre = g.programa AND pr.sucursal_id = s.id;

-- ============================================================
-- HORARIOS
-- Horas de fin [SUPUESTO] donde solo se dio la hora de inicio.
-- ============================================================

INSERT INTO grupo_horario (grupo_id, dia_semana, hora_inicio, hora_fin)
SELECT gr.id, h.dia, h.inicio::time, h.fin::time
FROM (VALUES
  -- ÁGUILAS · Karate 3-5 · duración declarada 45 min
  ('Águilas','Karate Infantil 3-5','Lun-Mié 4:00 pm', 1, '16:00','16:45'),
  ('Águilas','Karate Infantil 3-5','Lun-Mié 4:00 pm', 3, '16:00','16:45'),
  ('Águilas','Karate Infantil 3-5','Mar-Jue 4:00 pm', 2, '16:00','16:45'),
  ('Águilas','Karate Infantil 3-5','Mar-Jue 4:00 pm', 4, '16:00','16:45'),
  -- ÁGUILAS · Karate 6-13            [SUPUESTO] 60 min
  ('Águilas','Karate 6-13','Lun-Mié 5:00 pm', 1, '17:00','18:00'),
  ('Águilas','Karate 6-13','Lun-Mié 5:00 pm', 3, '17:00','18:00'),
  ('Águilas','Karate 6-13','Mar-Jue 5:00 pm', 2, '17:00','18:00'),
  ('Águilas','Karate 6-13','Mar-Jue 5:00 pm', 4, '17:00','18:00'),
  ('Águilas','Karate 6-13','Sáb 10:00 am',    6, '10:00','11:00'),
  -- ÁGUILAS · Karate 14+             [SUPUESTO] 60 min
  ('Águilas','Karate 14+ y Adultos','Mar-Jue 6:15 pm', 2, '18:15','19:15'),
  ('Águilas','Karate 14+ y Adultos','Mar-Jue 6:15 pm', 4, '18:15','19:15'),
  -- ÁGUILAS · Ballet 3-5             [SUPUESTO] 45 min
  ('Águilas','Ballet Infantil 3-5','Lun-Mié 6:30 pm', 1, '18:30','19:15'),
  ('Águilas','Ballet Infantil 3-5','Lun-Mié 6:30 pm', 3, '18:30','19:15'),
  -- ÁGUILAS · Ballet 6-13 · declarado 90 min
  ('Águilas','Ballet 6-13','Sáb 12:00 pm',            6, '12:00','13:30'),
  -- ÁGUILAS · Ballet 14+ · declarado 90 min
  ('Águilas','Ballet 14+ y Adultos','Sáb 1:30 pm',    6, '13:30','15:00'),
  -- ÁGUILAS · Salsa y Cumbia         [SUPUESTO] 60 min
  ('Águilas','Salsa y Cumbia','Mar-Jue 8:00 pm',      2, '20:00','21:00'),
  ('Águilas','Salsa y Cumbia','Mar-Jue 8:00 pm',      4, '20:00','21:00'),
  -- ÁGUILAS · Twerk · declarado 90 min
  ('Águilas','Twerk','Dom 10:00 am',                  0, '10:00','11:30'),

  -- CENTENARIO · Karate 3-5 · declarado 45 min
  ('Centenario','Karate Infantil 3-5','Mar-Jue 4:00 pm', 2, '16:00','16:45'),
  ('Centenario','Karate Infantil 3-5','Mar-Jue 4:00 pm', 4, '16:00','16:45'),
  -- CENTENARIO · Karate 6-13         [SUPUESTO] 60 min
  ('Centenario','Karate 6-13','Mar-Jue 5:00 pm',         2, '17:00','18:00'),
  ('Centenario','Karate 6-13','Mar-Jue 5:00 pm',         4, '17:00','18:00'),
  -- CENTENARIO · Karate 14+          [SUPUESTO] 60 min
  ('Centenario','Karate 14+ y Adultos','Mar-Jue 6:15 pm', 2, '18:15','19:15'),
  ('Centenario','Karate 14+ y Adultos','Mar-Jue 6:15 pm', 4, '18:15','19:15'),
  -- CENTENARIO · Ballet 3-5          [SUPUESTO] 45 min
  ('Centenario','Ballet Infantil 3-5','Lun-Mié 4:00 pm', 1, '16:00','16:45'),
  ('Centenario','Ballet Infantil 3-5','Lun-Mié 4:00 pm', 3, '16:00','16:45'),
  -- CENTENARIO · Ballet 6-13 entre semana  [SUPUESTO] 60 min
  ('Centenario','Ballet 6-13','Lun-Mié 5:00 pm',         1, '17:00','18:00'),
  ('Centenario','Ballet 6-13','Lun-Mié 5:00 pm',         3, '17:00','18:00'),
  -- CENTENARIO · Ballet 6-13 sábado · declarado 90 min
  ('Centenario','Ballet 6-13','Sáb 10:00 am',            6, '10:00','11:30'),
  -- CENTENARIO · Salsa y Cumbia      [SUPUESTO] 60 min
  ('Centenario','Salsa y Cumbia','Lun-Mié 6:30 pm',      1, '18:30','19:30'),
  ('Centenario','Salsa y Cumbia','Lun-Mié 6:30 pm',      3, '18:30','19:30')
) AS h(sucursal, programa, grupo, dia, inicio, fin)
JOIN sucursal s  ON s.nombre  = h.sucursal
JOIN programa pr ON pr.nombre = h.programa AND pr.sucursal_id = s.id
JOIN grupo gr    ON gr.nombre = h.grupo    AND gr.programa_id = pr.id;

-- ============================================================
-- PRECIOS — pendiente de datos reales
-- ============================================================
-- INSERT INTO precio (programa_id, costo_inscripcion, costo_mensualidad, moneda, vigencia_desde)
-- SELECT id, 0.00, 0.00, 'MXN', CURRENT_DATE FROM programa;

COMMIT;

-- ============================================================
-- VERIFICACIÓN
-- ============================================================
-- 1) No debe haber traslape de edades dentro de una misma
--    vertical y sucursal. Esta query debe devolver CERO filas.
--
-- SELECT a.nombre, b.nombre, s.nombre AS sucursal
-- FROM programa a
-- JOIN programa b ON b.vertical_id = a.vertical_id
--                AND b.sucursal_id = a.sucursal_id
--                AND b.id <> a.id
--                AND a.edad_min <= b.edad_max
--                AND b.edad_min <= a.edad_max
-- JOIN sucursal s ON s.id = a.sucursal_id
-- WHERE a.id < b.id;
--
-- 2) Resumen de capacidad
--
-- SELECT s.nombre AS sucursal, v.nombre AS vertical,
--        count(DISTINCT pr.id) AS programas,
--        count(DISTINCT gr.id) AS grupos,
--        sum(gr.cupo_maximo)   AS capacidad
-- FROM sucursal s
-- JOIN programa pr ON pr.sucursal_id = s.id
-- JOIN vertical v  ON v.id = pr.vertical_id
-- JOIN grupo gr    ON gr.programa_id = pr.id
-- GROUP BY s.nombre, v.nombre ORDER BY 1,2;
--
-- 3) Choques de salón
--
-- SELECT a.salon, h1.dia_semana, a.nombre, b.nombre
-- FROM grupo_horario h1
-- JOIN grupo a ON a.id = h1.grupo_id
-- JOIN grupo_horario h2 ON h2.dia_semana = h1.dia_semana AND h2.grupo_id <> h1.grupo_id
-- JOIN grupo b ON b.id = h2.grupo_id AND b.salon = a.salon
-- JOIN programa pa ON pa.id = a.programa_id
-- JOIN programa pb ON pb.id = b.programa_id AND pb.sucursal_id = pa.sucursal_id
-- WHERE h1.hora_inicio < h2.hora_fin AND h2.hora_inicio < h1.hora_fin
--   AND a.id < b.id;
