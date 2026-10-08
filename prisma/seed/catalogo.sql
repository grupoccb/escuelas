-- Catálogo de la primera vertical (PLAN-NOCHE N11, Fase 2 acotada): programas, grupos y horarios.
--
-- Datos tomados de docs/insumos/seed-sucursales-horarios.sql, solo la primera vertical y las dos
-- sucursales. Sin precios, promociones ni cotizador. Va después de demo.sql. Idempotente: las
-- llaves naturales (sucursal+programa, programa+grupo, grupo+día+hora) son índices únicos.
--
-- ⚠ Las horas de fin marcadas [SUPUESTO] en el insumo (donde solo se dio la hora de inicio)
-- siguen siendo supuestos y necesitan confirmación de la escuela. Los rangos de edad no se
-- traslapan (3-5, 6-13, 14+); el cupo es el declarado por la escuela.
--
-- Convención dia_semana: 0=Dom 1=Lun 2=Mar 3=Mié 4=Jue 5=Vie 6=Sáb. Horas en minutos desde la
-- medianoche (hora local de la sucursal).

-- ── PROGRAMAS ─────────────────────────────────────────────────────────────────────────────
INSERT INTO programa (organizacion_id, vertical_id, sucursal_id, nombre, edad_min, edad_max, nivel, descripcion_publica, activo)
SELECT '00000000-0000-4000-8000-000000000001', v.id, s.id, p.nombre, p.edad_min, p.edad_max, p.nivel, p.descripcion, true
FROM (VALUES
  ('Águilas',    'Karate Infantil 3-5',  3,  5, 'Iniciación', 'Clases de 45 min: coordinación, disciplina y juego.'),
  ('Águilas',    'Karate 6-13',          6, 13, 'Básico',     'Técnica, katas, kumite y exámenes de cinturón.'),
  ('Águilas',    'Karate 14+ y Adultos', 14, 99, 'Intermedio', 'Karate para adolescentes y adultos: kumite y grados avanzados.'),
  ('Centenario', 'Karate Infantil 3-5',  3,  5, 'Iniciación', 'Clases de 45 min: coordinación, disciplina y juego.'),
  ('Centenario', 'Karate 6-13',          6, 13, 'Básico',     'Técnica, katas, kumite y exámenes de cinturón.'),
  ('Centenario', 'Karate 14+ y Adultos', 14, 99, 'Intermedio', 'Karate para adolescentes y adultos: kumite y grados avanzados.')
) AS p(sucursal, nombre, edad_min, edad_max, nivel, descripcion)
JOIN sucursal s ON s.organizacion_id = '00000000-0000-4000-8000-000000000001' AND s.nombre = p.sucursal AND s.eliminado_en IS NULL
JOIN vertical v ON v.organizacion_id = '00000000-0000-4000-8000-000000000001' AND v.slug = 'karate' AND v.eliminado_en IS NULL
ON CONFLICT DO NOTHING;

-- ── GRUPOS: cada uno es una opción de horario ("Lun-Mié O Mar-Jue" son DOS grupos) ─────────
INSERT INTO grupo (organizacion_id, programa_id, nombre, salon, cupo_maximo, permite_lista_espera, activo)
SELECT '00000000-0000-4000-8000-000000000001', pr.id, g.nombre, g.salon, g.cupo, true, true
FROM (VALUES
  ('Águilas',    'Karate Infantil 3-5',  'Lun-Mié 4:00 pm', 'Dojo', 12),
  ('Águilas',    'Karate Infantil 3-5',  'Mar-Jue 4:00 pm', 'Dojo', 12),
  ('Águilas',    'Karate 6-13',          'Lun-Mié 5:00 pm', 'Dojo', 18),
  ('Águilas',    'Karate 6-13',          'Mar-Jue 5:00 pm', 'Dojo', 18),
  ('Águilas',    'Karate 6-13',          'Sáb 10:00 am',    'Dojo', 18),
  ('Águilas',    'Karate 14+ y Adultos', 'Mar-Jue 6:15 pm', 'Dojo', 20),
  ('Centenario', 'Karate Infantil 3-5',  'Mar-Jue 4:00 pm', 'Dojo', 12),
  ('Centenario', 'Karate 6-13',          'Mar-Jue 5:00 pm', 'Dojo', 18),
  ('Centenario', 'Karate 14+ y Adultos', 'Mar-Jue 6:15 pm', 'Dojo', 20)
) AS g(sucursal, programa, nombre, salon, cupo)
JOIN sucursal s  ON s.organizacion_id = '00000000-0000-4000-8000-000000000001' AND s.nombre = g.sucursal AND s.eliminado_en IS NULL
JOIN programa pr ON pr.organizacion_id = '00000000-0000-4000-8000-000000000001' AND pr.sucursal_id = s.id AND pr.nombre = g.programa AND pr.eliminado_en IS NULL
ON CONFLICT DO NOTHING;

-- ── HORARIOS (hora_inicio, hora_fin) en minutos desde la medianoche ───────────────────────
INSERT INTO grupo_horario (organizacion_id, grupo_id, dia_semana, hora_inicio_min, hora_fin_min)
SELECT '00000000-0000-4000-8000-000000000001', gr.id, h.dia,
       (extract(hour from h.inicio::time) * 60 + extract(minute from h.inicio::time))::int,
       (extract(hour from h.fin::time)    * 60 + extract(minute from h.fin::time))::int
FROM (VALUES
  -- Águilas · 3-5 · 45 min declarados
  ('Águilas','Karate Infantil 3-5','Lun-Mié 4:00 pm', 1, '16:00','16:45'),
  ('Águilas','Karate Infantil 3-5','Lun-Mié 4:00 pm', 3, '16:00','16:45'),
  ('Águilas','Karate Infantil 3-5','Mar-Jue 4:00 pm', 2, '16:00','16:45'),
  ('Águilas','Karate Infantil 3-5','Mar-Jue 4:00 pm', 4, '16:00','16:45'),
  -- Águilas · 6-13 · [SUPUESTO] 60 min
  ('Águilas','Karate 6-13','Lun-Mié 5:00 pm', 1, '17:00','18:00'),
  ('Águilas','Karate 6-13','Lun-Mié 5:00 pm', 3, '17:00','18:00'),
  ('Águilas','Karate 6-13','Mar-Jue 5:00 pm', 2, '17:00','18:00'),
  ('Águilas','Karate 6-13','Mar-Jue 5:00 pm', 4, '17:00','18:00'),
  ('Águilas','Karate 6-13','Sáb 10:00 am',    6, '10:00','11:00'),
  -- Águilas · 14+ · [SUPUESTO] 60 min
  ('Águilas','Karate 14+ y Adultos','Mar-Jue 6:15 pm', 2, '18:15','19:15'),
  ('Águilas','Karate 14+ y Adultos','Mar-Jue 6:15 pm', 4, '18:15','19:15'),
  -- Centenario · 3-5 · 45 min declarados
  ('Centenario','Karate Infantil 3-5','Mar-Jue 4:00 pm', 2, '16:00','16:45'),
  ('Centenario','Karate Infantil 3-5','Mar-Jue 4:00 pm', 4, '16:00','16:45'),
  -- Centenario · 6-13 · [SUPUESTO] 60 min
  ('Centenario','Karate 6-13','Mar-Jue 5:00 pm', 2, '17:00','18:00'),
  ('Centenario','Karate 6-13','Mar-Jue 5:00 pm', 4, '17:00','18:00'),
  -- Centenario · 14+ · [SUPUESTO] 60 min
  ('Centenario','Karate 14+ y Adultos','Mar-Jue 6:15 pm', 2, '18:15','19:15'),
  ('Centenario','Karate 14+ y Adultos','Mar-Jue 6:15 pm', 4, '18:15','19:15')
) AS h(sucursal, programa, grupo, dia, inicio, fin)
JOIN sucursal s  ON s.organizacion_id = '00000000-0000-4000-8000-000000000001' AND s.nombre = h.sucursal AND s.eliminado_en IS NULL
JOIN programa pr ON pr.organizacion_id = '00000000-0000-4000-8000-000000000001' AND pr.sucursal_id = s.id AND pr.nombre = h.programa AND pr.eliminado_en IS NULL
JOIN grupo gr    ON gr.organizacion_id = '00000000-0000-4000-8000-000000000001' AND gr.programa_id = pr.id AND gr.nombre = h.grupo AND gr.eliminado_en IS NULL
ON CONFLICT DO NOTHING;

-- Instructor de la demo (B2): imparte los grupos de Lun-Mié (2 de los 9). Los demás quedan sin
-- instructor, para ver que un maestro solo ve los suyos. [SUPUESTO] editable desde administración.
UPDATE grupo SET instructor_id = '00000000-0000-4000-8000-000000000521'
WHERE organizacion_id = '00000000-0000-4000-8000-000000000001'
  AND instructor_id IS NULL
  AND nombre LIKE 'Lun-Mié%'
  AND eliminado_en IS NULL
  AND EXISTS (SELECT 1 FROM instructor i WHERE i.id = '00000000-0000-4000-8000-000000000521' AND i.organizacion_id = '00000000-0000-4000-8000-000000000001');
