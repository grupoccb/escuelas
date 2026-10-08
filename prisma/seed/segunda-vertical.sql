-- Segunda vertical de la organización de la demo (PLAN-NOCHE N10, prueba de fuego del
-- invariante 2): dar de alta una vertical nueva SOLO con filas, sin tocar código.
--
-- Datos tomados de docs/insumos/seed-sucursales-horarios.sql: la vertical, y que se imparte en
-- las dos sucursales. Va después de demo.sql. Idempotente. Además de lo que hay aquí, el canal y
-- la bandeja se conectan a Chatwoot con `scripts/preparar-chatwoot.ts`, igual que la primera.

INSERT INTO vertical (id, organizacion_id, nombre, slug, activo) VALUES
  ('00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000001', 'Ballet', 'ballet', true)
ON CONFLICT DO NOTHING;

INSERT INTO sucursal_vertical (id, organizacion_id, sucursal_id, vertical_id, activo) VALUES
  ('00000000-0000-4000-8000-000000000303', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000102', true),
  ('00000000-0000-4000-8000-000000000304', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-000000000102', true)
ON CONFLICT DO NOTHING;

-- Canal de WhatsApp de la vertical (sin número: la demo usa bandejas tipo API) y su bandeja.
INSERT INTO canal_whatsapp (id, organizacion_id, vertical_id, sucursal_id, nombre_publico) VALUES
  ('00000000-0000-4000-8000-000000000402', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000102', NULL, 'Ballet')
ON CONFLICT DO NOTHING;

INSERT INTO bandeja_chatwoot (id, organizacion_id, canal_whatsapp_id, nombre) VALUES
  ('00000000-0000-4000-8000-000000000402', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000402', 'Ballet')
ON CONFLICT DO NOTHING;
