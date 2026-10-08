-- Seed de la demo local (SPEC 0.5). Idempotente: ids fijos y ON CONFLICT DO NOTHING.
--
-- Datos tomados de docs/insumos/seed-sucursales-horarios.sql: una vertical y las dos
-- sucursales, con su zona horaria. La dirección queda vacía porque en el insumo está
-- "[PENDIENTE]". Programas, grupos y horarios son de Fase 2.
--
-- La organización solo se crea por seed (invariante 1).

INSERT INTO organizacion (id, nombre) VALUES
  ('00000000-0000-4000-8000-000000000001', 'Escuela demo')
ON CONFLICT DO NOTHING;

INSERT INTO vertical (id, organizacion_id, nombre, slug, activo) VALUES
  ('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000001', 'Karate', 'karate', true)
ON CONFLICT DO NOTHING;

INSERT INTO sucursal (id, organizacion_id, nombre, direccion, zona_horaria, activo) VALUES
  ('00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000001', 'Águilas',    NULL, 'America/Mexico_City', true),
  ('00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-000000000001', 'Centenario', NULL, 'America/Mexico_City', true)
ON CONFLICT DO NOTHING;

INSERT INTO sucursal_vertical (id, organizacion_id, sucursal_id, vertical_id, activo) VALUES
  ('00000000-0000-4000-8000-000000000301', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000101', true),
  ('00000000-0000-4000-8000-000000000302', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-000000000101', true)
ON CONFLICT DO NOTHING;

-- Etapas del embudo, tomadas de la sugerencia inicial de docs/insumos/modelo-datos-escuela-multivertical.md.
-- ON CONFLICT sin destino: la migración de Fase 1 ya crea la primera etapa en bases existentes.
INSERT INTO etapa_pipeline (id, organizacion_id, nombre, orden, es_ganado, es_perdido, dias_alerta_sin_movimiento) VALUES
  ('00000000-0000-4000-8000-000000000601', '00000000-0000-4000-8000-000000000001', 'Nuevo',                     1, false, false, 2),
  ('00000000-0000-4000-8000-000000000602', '00000000-0000-4000-8000-000000000001', 'Contactado',                2, false, false, 3),
  ('00000000-0000-4000-8000-000000000603', '00000000-0000-4000-8000-000000000001', 'Clase muestra agendada',    3, false, false, 3),
  ('00000000-0000-4000-8000-000000000604', '00000000-0000-4000-8000-000000000001', 'Clase muestra asistida',    4, false, false, 3),
  ('00000000-0000-4000-8000-000000000605', '00000000-0000-4000-8000-000000000001', 'Negociación',              5, false, false, 5),
  ('00000000-0000-4000-8000-000000000606', '00000000-0000-4000-8000-000000000001', 'Inscrito',                  6, true,  false, NULL),
  ('00000000-0000-4000-8000-000000000607', '00000000-0000-4000-8000-000000000001', 'Perdido',                   7, false, true,  NULL)
ON CONFLICT DO NOTHING;

-- El canal de WhatsApp de la vertical. Sin número: la demo usa una bandeja tipo API de Chatwoot.
-- Mismo id que la bandeja, como en la migración de Fase 1.
INSERT INTO canal_whatsapp (id, organizacion_id, vertical_id, sucursal_id, nombre_publico) VALUES
  ('00000000-0000-4000-8000-000000000401', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000101', NULL, 'Karate')
ON CONFLICT DO NOTHING;

-- La bandeja de Chatwoot del canal. Sus ids de Chatwoot los llena
-- scripts/preparar-chatwoot.ts al crear la bandeja.
INSERT INTO bandeja_chatwoot (id, organizacion_id, canal_whatsapp_id, nombre) VALUES
  ('00000000-0000-4000-8000-000000000401', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000401', 'Karate')
ON CONFLICT DO NOTHING;
