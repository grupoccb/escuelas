-- Catálogo completo de la organización de demo (C4): las TRES verticales del insumo
-- (docs/insumos/seed-sucursales-horarios.sql) con sus sucursales, programas, grupos, horarios, salones,
-- instructores, precios y promociones de ejemplo.
--
-- ORDEN: demo.sql → catalogo.sql (la primera vertical: 6 programas, 9 grupos, 17 horarios) → ESTE archivo, que
-- agrega las otras dos (5 + 3 programas, 6 + 3 grupos, 9 + 5 horarios) hasta completar 14 programas, 18 grupos y
-- 31 horarios, y deja puestos los textos de las verticales. Idempotente: ids fijos de 3 dígitos finales
-- (`00000000-0000-4000-8000-000000000NNN`; los tests los re-prefijan por organización) y las llaves naturales son
-- índices únicos, así que correrlo dos veces —o antes/después de segunda-vertical.sql, que comparte los ids de
-- Ballet— no duplica nada ni pisa lo que el administrador haya editado.
--
-- Ids que usa este archivo (los anteriores: 001 org · 101-102 verticales · 201-202 sucursales · 301-304
-- sucursal_vertical · 401-402 canal/bandeja · 5xx usuarios · 521 instructor demo · 531-532 salones de catalogo.sql):
--   103 vertical Baile · 305-306 sucursal_vertical de Baile · 403 canal y bandeja de Baile
--   111-118 programas nuevos · 131-139 grupos nuevos · 522-526 instructores · 533-534 salones
--   541-548 instructor_sucursal · 551-553 promociones · 561-564 beneficios
--
-- ⚠ TODO lo que la escuela aún no da va como EJEMPLO marcado [SUPUESTO] y es editable desde administración (J7):
-- precios, cupos de los grupos nuevos y capacidad de los salones, horas de fin donde el insumo solo da la de inicio,
-- direcciones, colores de marca, instructores y las tres promociones. Los datos que SÍ dio la escuela
-- (verticales, sucursales, programas, rangos de edad, nombres de grupo, salones y horas de inicio) vienen del insumo.
-- Convención dia_semana: 0=Dom 1=Lun 2=Mar 3=Mié 4=Jue 5=Vie 6=Sáb. Horas en minutos desde la medianoche local.

-- ── VERTICALES: tercera vertical y textos de las tres ───────────────────────────────────────────────────
INSERT INTO vertical (id, organizacion_id, nombre, slug, activo) VALUES
  ('00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000001', 'Ballet', 'ballet', true),
  ('00000000-0000-4000-8000-000000000103', '00000000-0000-4000-8000-000000000001', 'Baile',  'baile',  true)
ON CONFLICT DO NOTHING;

-- Etiquetas de progresión y de evento: lo dio la escuela en el insumo. El color de marca es [SUPUESTO].
-- Solo se llenan si siguen vacías: una edición del administrador no se pisa al volver a correr el seed.
UPDATE vertical SET etiqueta_progresion = 'Cinturón', etiqueta_evento = 'Examen',   usa_progresion = true,  color_marca = '#C0392B'
WHERE id = '00000000-0000-4000-8000-000000000101' AND etiqueta_progresion IS NULL AND etiqueta_evento IS NULL AND color_marca IS NULL;
UPDATE vertical SET etiqueta_progresion = 'Nivel',    etiqueta_evento = 'Recital',  usa_progresion = true,  color_marca = '#8E44AD'
WHERE id = '00000000-0000-4000-8000-000000000102' AND etiqueta_progresion IS NULL AND etiqueta_evento IS NULL AND color_marca IS NULL;
UPDATE vertical SET etiqueta_progresion = 'Nivel',    etiqueta_evento = 'Showcase', usa_progresion = false, color_marca = '#E67E22'
WHERE id = '00000000-0000-4000-8000-000000000103' AND etiqueta_progresion IS NULL AND etiqueta_evento IS NULL AND color_marca IS NULL;

-- Cotizador de WhatsApp (decisión 15 del plan): encendido en las tres verticales de la demo. Solo mientras nadie haya
-- editado la vertical (`actualizado_en = creado_en`: Prisma lo mueve en cada edición), para no pisar una decisión del
-- administrador al volver a correr el seed. Es un interruptor por vertical: apagarlo deja la captura de tres preguntas.
UPDATE vertical SET cotizador_whatsapp_activo = true
WHERE id IN ('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000103')
  AND NOT cotizador_whatsapp_activo AND actualizado_en = creado_en;

-- Las dos sucursales imparten las tres verticales (6 filas en total, como el insumo).
INSERT INTO sucursal_vertical (id, organizacion_id, sucursal_id, vertical_id, activo) VALUES
  ('00000000-0000-4000-8000-000000000303', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000102', true),
  ('00000000-0000-4000-8000-000000000304', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-000000000102', true),
  ('00000000-0000-4000-8000-000000000305', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000103', true),
  ('00000000-0000-4000-8000-000000000306', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-000000000103', true)
ON CONFLICT DO NOTHING;

-- Canal de WhatsApp y bandeja de cada vertical nueva (sin número: la demo usa bandejas tipo API). Los ids de
-- Chatwoot los llena scripts/preparar-chatwoot.ts, que reutiliza la bandeja si ya existe (por id o por nombre):
-- correr esto otra vez no crea bandejas duplicadas. Ballet comparte ids con segunda-vertical.sql.
INSERT INTO canal_whatsapp (id, organizacion_id, vertical_id, sucursal_id, nombre_publico) VALUES
  ('00000000-0000-4000-8000-000000000402', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000102', NULL, 'Ballet'),
  ('00000000-0000-4000-8000-000000000403', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000103', NULL, 'Baile')
ON CONFLICT DO NOTHING;
INSERT INTO bandeja_chatwoot (id, organizacion_id, canal_whatsapp_id, nombre) VALUES
  ('00000000-0000-4000-8000-000000000402', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000402', 'Ballet'),
  ('00000000-0000-4000-8000-000000000403', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000403', 'Baile')
ON CONFLICT DO NOTHING;

-- ── SALONES (los de Águilas y Centenario de Ballet y Baile; «Dojo» ya lo creó catalogo.sql) ─────────────
-- Los nombres vienen del insumo; la capacidad es [SUPUESTO].
INSERT INTO salon (id, organizacion_id, sucursal_id, nombre, capacidad, activo)
SELECT x.id::uuid, '00000000-0000-4000-8000-000000000001', s.id, x.nombre, x.capacidad, true
FROM (VALUES
  ('00000000-0000-4000-8000-000000000533', 'Águilas',    'Salón 2', 30),
  ('00000000-0000-4000-8000-000000000534', 'Centenario', 'Salón 1', 30)
) AS x(id, sucursal, nombre, capacidad)
JOIN sucursal s ON s.organizacion_id = '00000000-0000-4000-8000-000000000001' AND s.nombre = x.sucursal AND s.eliminado_en IS NULL
ON CONFLICT DO NOTHING;

-- ── PROGRAMAS NUEVOS (8: Ballet 5 y Baile 3) ───────────────────────────────────────────────────────────
-- `permite_traslape` = true en los dos programas de baile de Águilas (Salsa y Cumbia, Twerk, ambos 15-99):
-- son ALTERNATIVAS por estilo, no rangos de edad (REVISION-INSUMOS C9, decisión 9 del plan: el cotizador pregunta cuál).
INSERT INTO programa (id, organizacion_id, vertical_id, sucursal_id, nombre, edad_min, edad_max, nivel, descripcion_publica, permite_traslape, activo)
SELECT p.id::uuid, '00000000-0000-4000-8000-000000000001', v.id, s.id, p.nombre, p.edad_min, p.edad_max, p.nivel, p.descripcion, p.permite_traslape, true
FROM (VALUES
  ('00000000-0000-4000-8000-000000000111', 'Águilas',    'ballet', 'Ballet Infantil 3-5',    3,  5, 'Pre-ballet',  'Introducción lúdica al ballet clásico.', false),
  ('00000000-0000-4000-8000-000000000112', 'Águilas',    'ballet', 'Ballet 6-13',            6, 13, 'Básico',      'Técnica de barra y centro, preparación a recital.', false),
  ('00000000-0000-4000-8000-000000000113', 'Águilas',    'ballet', 'Ballet 14+ y Adultos',  14, 99, 'Intermedio',  'Ballet clásico para adolescentes y adultos.', false),
  ('00000000-0000-4000-8000-000000000114', 'Águilas',    'baile',  'Salsa y Cumbia',        15, 99, 'Abierto',     'Baile social para adolescentes y adultos.', true),
  ('00000000-0000-4000-8000-000000000115', 'Águilas',    'baile',  'Twerk',                 15, 99, 'Abierto',     'Twerk: acondicionamiento y coreografía.', true),
  ('00000000-0000-4000-8000-000000000116', 'Centenario', 'ballet', 'Ballet Infantil 3-5',    3,  5, 'Pre-ballet',  'Introducción lúdica al ballet clásico.', false),
  ('00000000-0000-4000-8000-000000000117', 'Centenario', 'ballet', 'Ballet 6-13',            6, 13, 'Básico',      'Técnica de barra y centro, preparación a recital.', false),
  ('00000000-0000-4000-8000-000000000118', 'Centenario', 'baile',  'Salsa y Cumbia',        15, 99, 'Abierto',     'Baile social para adolescentes y adultos.', false)
) AS p(id, sucursal, vertical, nombre, edad_min, edad_max, nivel, descripcion, permite_traslape)
JOIN sucursal s ON s.organizacion_id = '00000000-0000-4000-8000-000000000001' AND s.nombre = p.sucursal AND s.eliminado_en IS NULL
JOIN vertical v ON v.organizacion_id = '00000000-0000-4000-8000-000000000001' AND v.slug = p.vertical AND v.eliminado_en IS NULL
ON CONFLICT DO NOTHING;

-- ── GRUPOS NUEVOS (9: Ballet 6 y Baile 3). Cupos [SUPUESTO] salvo los que dio el insumo. ───────────────
INSERT INTO grupo (id, organizacion_id, programa_id, nombre, salon_id, cupo_maximo, permite_lista_espera, activo)
SELECT g.id::uuid, '00000000-0000-4000-8000-000000000001', pr.id, g.nombre, sa.id, g.cupo, true, true
FROM (VALUES
  ('00000000-0000-4000-8000-000000000131', 'Águilas',    'Ballet Infantil 3-5',  'Lun-Mié 6:30 pm', 'Salón 2', 12),
  ('00000000-0000-4000-8000-000000000132', 'Águilas',    'Ballet 6-13',          'Sáb 12:00 pm',    'Salón 2', 15),
  ('00000000-0000-4000-8000-000000000133', 'Águilas',    'Ballet 14+ y Adultos', 'Sáb 1:30 pm',     'Salón 2', 15),
  ('00000000-0000-4000-8000-000000000134', 'Águilas',    'Salsa y Cumbia',       'Mar-Jue 8:00 pm', 'Salón 2', 24),
  ('00000000-0000-4000-8000-000000000135', 'Águilas',    'Twerk',                'Dom 10:00 am',    'Salón 2', 20),
  ('00000000-0000-4000-8000-000000000136', 'Centenario', 'Ballet Infantil 3-5',  'Lun-Mié 4:00 pm', 'Salón 1', 12),
  ('00000000-0000-4000-8000-000000000137', 'Centenario', 'Ballet 6-13',          'Lun-Mié 5:00 pm', 'Salón 1', 15),
  ('00000000-0000-4000-8000-000000000138', 'Centenario', 'Ballet 6-13',          'Sáb 10:00 am',    'Salón 1', 15),
  ('00000000-0000-4000-8000-000000000139', 'Centenario', 'Salsa y Cumbia',       'Lun-Mié 6:30 pm', 'Salón 1', 24)
) AS g(id, sucursal, programa, nombre, salon, cupo)
JOIN sucursal s  ON s.organizacion_id = '00000000-0000-4000-8000-000000000001' AND s.nombre = g.sucursal AND s.eliminado_en IS NULL
JOIN programa pr ON pr.organizacion_id = '00000000-0000-4000-8000-000000000001' AND pr.sucursal_id = s.id AND pr.nombre = g.programa AND pr.eliminado_en IS NULL
JOIN salon sa    ON sa.organizacion_id = '00000000-0000-4000-8000-000000000001' AND sa.sucursal_id = s.id AND sa.nombre = g.salon AND sa.eliminado_en IS NULL
ON CONFLICT DO NOTHING;

-- ── HORARIOS NUEVOS (14). Horas de fin [SUPUESTO] donde el insumo solo da la de inicio (45 o 60 min). ───
INSERT INTO grupo_horario (organizacion_id, grupo_id, dia_semana, hora_inicio_min, hora_fin_min)
SELECT '00000000-0000-4000-8000-000000000001', gr.id, h.dia,
       (extract(hour from h.inicio::time) * 60 + extract(minute from h.inicio::time))::int,
       (extract(hour from h.fin::time)    * 60 + extract(minute from h.fin::time))::int
FROM (VALUES
  -- Águilas · Ballet 3-5 [SUPUESTO] 45 min
  ('Águilas','Ballet Infantil 3-5','Lun-Mié 6:30 pm', 1, '18:30','19:15'),
  ('Águilas','Ballet Infantil 3-5','Lun-Mié 6:30 pm', 3, '18:30','19:15'),
  -- Águilas · Ballet 6-13 y 14+ · 90 min declarados
  ('Águilas','Ballet 6-13','Sáb 12:00 pm',            6, '12:00','13:30'),
  ('Águilas','Ballet 14+ y Adultos','Sáb 1:30 pm',    6, '13:30','15:00'),
  -- Águilas · Salsa y Cumbia [SUPUESTO] 60 min · Twerk 90 min declarados
  ('Águilas','Salsa y Cumbia','Mar-Jue 8:00 pm',      2, '20:00','21:00'),
  ('Águilas','Salsa y Cumbia','Mar-Jue 8:00 pm',      4, '20:00','21:00'),
  ('Águilas','Twerk','Dom 10:00 am',                  0, '10:00','11:30'),
  -- Centenario · Ballet 3-5 [SUPUESTO] 45 min · Ballet 6-13 entre semana [SUPUESTO] 60 min · sábado 90 min declarados
  ('Centenario','Ballet Infantil 3-5','Lun-Mié 4:00 pm', 1, '16:00','16:45'),
  ('Centenario','Ballet Infantil 3-5','Lun-Mié 4:00 pm', 3, '16:00','16:45'),
  ('Centenario','Ballet 6-13','Lun-Mié 5:00 pm',         1, '17:00','18:00'),
  ('Centenario','Ballet 6-13','Lun-Mié 5:00 pm',         3, '17:00','18:00'),
  ('Centenario','Ballet 6-13','Sáb 10:00 am',            6, '10:00','11:30'),
  -- Centenario · Salsa y Cumbia [SUPUESTO] 60 min
  ('Centenario','Salsa y Cumbia','Lun-Mié 6:30 pm',      1, '18:30','19:30'),
  ('Centenario','Salsa y Cumbia','Lun-Mié 6:30 pm',      3, '18:30','19:30')
) AS h(sucursal, programa, grupo, dia, inicio, fin)
JOIN sucursal s  ON s.organizacion_id = '00000000-0000-4000-8000-000000000001' AND s.nombre = h.sucursal AND s.eliminado_en IS NULL
JOIN programa pr ON pr.organizacion_id = '00000000-0000-4000-8000-000000000001' AND pr.sucursal_id = s.id AND pr.nombre = h.programa AND pr.eliminado_en IS NULL
JOIN grupo gr    ON gr.organizacion_id = '00000000-0000-4000-8000-000000000001' AND gr.programa_id = pr.id AND gr.nombre = h.grupo AND gr.eliminado_en IS NULL
ON CONFLICT DO NOTHING;

-- ── INSTRUCTORES DE EJEMPLO [SUPUESTO] ─────────────────────────────────────────────────────────────────
-- Nombres, teléfonos (ficticios, E.164) y reparto son de ejemplo para la demo; el instructor 521 («Maestro demo»,
-- ligado al usuario maestro) ya da los Lun-Mié de la primera vertical. Nadie queda en dos grupos a la misma hora
-- (la base lo impide). Se asignan solo a grupos que aún no tienen instructor.
INSERT INTO instructor (id, organizacion_id, nombre, telefono, correo, activo) VALUES
  ('00000000-0000-4000-8000-000000000522', '00000000-0000-4000-8000-000000000001', 'Instructor de ejemplo 1', '+525500000001', 'instructor1@demo.test', true),
  ('00000000-0000-4000-8000-000000000523', '00000000-0000-4000-8000-000000000001', 'Instructor de ejemplo 2', '+525500000002', 'instructor2@demo.test', true),
  ('00000000-0000-4000-8000-000000000524', '00000000-0000-4000-8000-000000000001', 'Instructora de ejemplo 3', '+525500000003', 'instructor3@demo.test', true),
  ('00000000-0000-4000-8000-000000000525', '00000000-0000-4000-8000-000000000001', 'Instructora de ejemplo 4', '+525500000004', 'instructor4@demo.test', true),
  ('00000000-0000-4000-8000-000000000526', '00000000-0000-4000-8000-000000000001', 'Instructor de ejemplo 5', '+525500000005', 'instructor5@demo.test', true)
ON CONFLICT DO NOTHING;

-- Dónde da clases cada uno (el 526 da en las dos sucursales).
INSERT INTO instructor_sucursal (id, organizacion_id, instructor_id, sucursal_id) VALUES
  ('00000000-0000-4000-8000-000000000541', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000522', '00000000-0000-4000-8000-000000000201'),
  ('00000000-0000-4000-8000-000000000542', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000523', '00000000-0000-4000-8000-000000000202'),
  ('00000000-0000-4000-8000-000000000543', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000524', '00000000-0000-4000-8000-000000000201'),
  ('00000000-0000-4000-8000-000000000544', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000525', '00000000-0000-4000-8000-000000000202'),
  ('00000000-0000-4000-8000-000000000545', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000526', '00000000-0000-4000-8000-000000000201'),
  ('00000000-0000-4000-8000-000000000546', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000526', '00000000-0000-4000-8000-000000000202')
ON CONFLICT DO NOTHING;

-- 522: karate de Águilas (Mar-Jue y sábado) · 523: karate de Centenario · 524: ballet de Águilas · 525: ballet de
-- Centenario · 526: todo el baile (Águilas y Centenario, en días y horas distintos).
UPDATE grupo g SET instructor_id = x.instructor::uuid
FROM (VALUES
  ('00000000-0000-4000-8000-000000000522', 'Águilas',    'karate'),
  ('00000000-0000-4000-8000-000000000523', 'Centenario', 'karate'),
  ('00000000-0000-4000-8000-000000000524', 'Águilas',    'ballet'),
  ('00000000-0000-4000-8000-000000000525', 'Centenario', 'ballet'),
  ('00000000-0000-4000-8000-000000000526', 'Águilas',    'baile'),
  ('00000000-0000-4000-8000-000000000526', 'Centenario', 'baile')
) AS x(instructor, sucursal, vertical)
JOIN sucursal s ON s.organizacion_id = '00000000-0000-4000-8000-000000000001' AND s.nombre = x.sucursal AND s.eliminado_en IS NULL
JOIN vertical v ON v.organizacion_id = '00000000-0000-4000-8000-000000000001' AND v.slug = x.vertical AND v.eliminado_en IS NULL
JOIN programa pr ON pr.organizacion_id = '00000000-0000-4000-8000-000000000001' AND pr.sucursal_id = s.id AND pr.vertical_id = v.id AND pr.eliminado_en IS NULL
WHERE g.organizacion_id = '00000000-0000-4000-8000-000000000001' AND g.programa_id = pr.id AND g.instructor_id IS NULL AND g.eliminado_en IS NULL;

-- ── PRECIOS [SUPUESTO]: ejemplo para los 14 programas, vigentes desde el 1-ene-2026 y abiertos ───────────
-- (el insumo dejó los precios «pendiente de datos reales»). Editables desde administración: una vigencia nueva
-- cierra la anterior. El mismo precio en las dos sucursales.
INSERT INTO precio (organizacion_id, programa_id, costo_inscripcion, costo_mensualidad, moneda, vigencia_desde)
SELECT '00000000-0000-4000-8000-000000000001', pr.id, p.inscripcion, p.mensualidad, 'MXN', DATE '2026-01-01'
FROM (VALUES
  ('Karate Infantil 3-5',  600.00,  750.00),
  ('Karate 6-13',          600.00,  850.00),
  ('Karate 14+ y Adultos', 700.00,  950.00),
  ('Ballet Infantil 3-5',  600.00,  800.00),
  ('Ballet 6-13',          600.00,  900.00),
  ('Ballet 14+ y Adultos', 700.00, 1000.00),
  ('Salsa y Cumbia',       500.00,  700.00),
  ('Twerk',                500.00,  750.00)
) AS p(programa, inscripcion, mensualidad)
JOIN programa pr ON pr.organizacion_id = '00000000-0000-4000-8000-000000000001' AND pr.nombre = p.programa AND pr.eliminado_en IS NULL
-- V10 / EC-25: solo a los programas que NUNCA han tenido precio (ni vivo ni dado de baja). Si un administrador dio de baja el precio de ejemplo, volver a correr este
-- seed no lo resucita (el índice de la base solo mira los precios vivos, así que `ON CONFLICT` no lo impedía).
WHERE NOT EXISTS (SELECT 1 FROM precio x WHERE x.organizacion_id = pr.organizacion_id AND x.programa_id = pr.id)
ON CONFLICT DO NOTHING;

-- ── PROMOCIONES DE EJEMPLO [SUPUESTO] ───────────────────────────────────────────────────────────────
-- Tres, como en el modelo: inscripción gratis; uniforme gratis al pagar la primera mensualidad (queda PENDIENTE hasta
-- que se registre el pago: recepción ve la lista de uniformes por entregar); y descuento por hermanos. Vigentes todo
-- 2026 y 2027 y para todas las verticales, sucursales y programas (sin filas de alcance).
-- V2 (decisión 6): una promoción NO acumulable no se combina con ninguna otra, así que las tres de ejemplo son ACUMULABLES (se suman, que es lo que cuenta la historia de la demo:
-- inscripción gratis + uniforme + descuento por hermanos). La prioridad solo ordena. Una escuela que quiera una promoción exclusiva la marca «no acumulable» en Administración.
INSERT INTO promocion (id, organizacion_id, nombre, codigo, vigencia_desde, vigencia_hasta, condicion_tipo, condicion_valor, cupo_maximo, acumulable, prioridad, activo) VALUES
  ('00000000-0000-4000-8000-000000000551', '00000000-0000-4000-8000-000000000001', 'Inscripción gratis', 'INSCRIPCION-GRATIS', DATE '2026-01-01', DATE '2027-12-31', 'sin_condicion', NULL, NULL, true, 10, true),
  ('00000000-0000-4000-8000-000000000552', '00000000-0000-4000-8000-000000000001', 'Uniforme gratis al pagar la primera mensualidad', 'UNIFORME-GRATIS', DATE '2026-01-01', DATE '2027-12-31', 'al_pagar_primera_mensualidad', NULL, NULL, true, 5, true),
  ('00000000-0000-4000-8000-000000000553', '00000000-0000-4000-8000-000000000001', 'Descuento por hermanos', 'HERMANOS-10', DATE '2026-01-01', DATE '2027-12-31', 'min_hermanos', '{"hermanos": 2}', NULL, true, 3, true)
ON CONFLICT DO NOTHING;

INSERT INTO promocion_beneficio (id, organizacion_id, promocion_id, tipo, modo, valor, descripcion, momento_disparo) VALUES
  ('00000000-0000-4000-8000-000000000561', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000551', 'descuento_inscripcion', 'total', NULL, 'Inscripción gratis', 'inmediato'),
  ('00000000-0000-4000-8000-000000000562', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000552', 'producto_gratis', 'total', NULL, 'Uniforme', 'al_cumplir_condicion'),
  ('00000000-0000-4000-8000-000000000563', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000553', 'descuento_mensualidad', 'porcentaje', 10.00, '10 % en la mensualidad del segundo hijo en adelante', 'inmediato')
ON CONFLICT DO NOTHING;
