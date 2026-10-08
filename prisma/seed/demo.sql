-- Seed de la demo local (SPEC 0.5). Idempotente: ids fijos y ON CONFLICT DO NOTHING.
--
-- Datos tomados de docs/insumos/seed-sucursales-horarios.sql: una vertical y las dos
-- sucursales, con su zona horaria. La dirección queda vacía porque en el insumo está
-- "[PENDIENTE]". Programas, grupos y horarios son de Fase 2.
--
-- La organización solo se crea por seed (invariante 1).

INSERT INTO organizacion (id, nombre) VALUES
  ('00000000-0000-4000-8000-000000000001', 'Escuela demo')
ON CONFLICT (id) DO NOTHING;

INSERT INTO vertical (id, organizacion_id, nombre, slug, activo) VALUES
  ('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000001', 'Karate', 'karate', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO sucursal (id, organizacion_id, nombre, direccion, zona_horaria, activo) VALUES
  ('00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000001', 'Águilas',    NULL, 'America/Mexico_City', true),
  ('00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-000000000001', 'Centenario', NULL, 'America/Mexico_City', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO sucursal_vertical (id, organizacion_id, sucursal_id, vertical_id, activo) VALUES
  ('00000000-0000-4000-8000-000000000301', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000101', true),
  ('00000000-0000-4000-8000-000000000302', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-000000000101', true)
ON CONFLICT (id) DO NOTHING;

-- La bandeja de Chatwoot de la vertical. Sus ids de Chatwoot los llena
-- scripts/preparar-chatwoot.ts al crear la bandeja.
INSERT INTO bandeja_chatwoot (id, organizacion_id, vertical_id, nombre) VALUES
  ('00000000-0000-4000-8000-000000000401', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000101', 'Karate')
ON CONFLICT (id) DO NOTHING;
