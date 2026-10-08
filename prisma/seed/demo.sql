-- Seed de la demo local (SPEC 0.5). Idempotente: ids fijos y ON CONFLICT DO NOTHING.
--
-- Datos tomados de docs/insumos/seed-sucursales-horarios.sql: una vertical y las dos
-- sucursales, con su zona horaria. La dirección queda vacía porque en el insumo está
-- "[PENDIENTE]". Programas, grupos y horarios son de Fase 2.
--
-- La organización solo se crea por seed (invariante 1).

-- `slug` es el identificador con el que se inicia sesión (POST /api/sesion).
INSERT INTO organizacion (id, nombre, slug) VALUES
  ('00000000-0000-4000-8000-000000000001', 'Escuela demo', 'escuela-demo')
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

-- Reenganche (Fase 1.6). La plantilla es FICTICIA y está "aprobada" solo para la demo local: en un
-- ambiente real se sincroniza desde Twilio y solo se envía lo que Meta aprobó. El código debe ser
-- el friendly_name de la plantilla en Twilio (así la encuentra Chatwoot).
INSERT INTO plantilla_mensaje (id, organizacion_id, codigo, content_sid, vertical_id, categoria, tipo_content, idioma, variables, cuerpo_referencia, estado_aprobacion, activo) VALUES
  ('00000000-0000-4000-8000-000000000701', '00000000-0000-4000-8000-000000000001', 'reenganche_captacion',
   'HX00000000000000000000000000000000', NULL, 'utility', 'text', 'es_MX',
   '[{"pos":1,"nombre":"nombre_vertical"}]',
   'Hola, quedó pendiente tu consulta sobre {{1}}. ¿Quieres que la retomemos? Responde a este mensaje y seguimos.',
   'aprobada', true)
ON CONFLICT DO NOTHING;

-- 25 h sin contestar a mitad de la captura (la ventana de servicio de 24 h ya se cerró): una vez.
INSERT INTO automatizacion (id, organizacion_id, nombre, vertical_id, sucursal_id, evento_disparador, offset_minutos, plantilla_id, max_intentos) VALUES
  ('00000000-0000-4000-8000-000000000801', '00000000-0000-4000-8000-000000000001', 'Reenganche de captación', NULL, NULL,
   'lead_sin_respuesta', 1500, '00000000-0000-4000-8000-000000000701', 1)
ON CONFLICT DO NOTHING;

-- Configuración de la organización (A6). Los valores por defecto del contexto, sección 11:
-- 3 mensajes automáticos por teléfono al día y 1 de marketing cada 7 días. Editables por
-- organización. ON CONFLICT sin destino: la migración ya crea la fila en las bases existentes.
INSERT INTO configuracion_organizacion (id, organizacion_id, max_automaticos_por_dia, max_marketing_por_ventana, ventana_marketing_dias) VALUES
  ('00000000-0000-4000-8000-000000000901', '00000000-0000-4000-8000-000000000001', 3, 1, 7)
ON CONFLICT DO NOTHING;

-- Usuarios de la demo (B1). SOLO DEMO: los cuatro tienen la contraseña `Demo-local-2026!` (la misma
-- del asesor de Chatwoot de la demo). Los hashes son scrypt (src/auth/contrasena.ts) generados con
-- `CONTRASENA=… node scripts/crear-usuario.ts --solo-hash`. En un ambiente real el primer
-- administrador se crea con `scripts/crear-usuario.ts` y NUNCA se corre este seed.
-- El correo del asesor coincide con el del agente de Chatwoot de la demo (para vincularlos, B5).
INSERT INTO usuario (id, organizacion_id, correo, nombre, rol, contrasena_hash, activo) VALUES
  ('00000000-0000-4000-8000-000000000501', '00000000-0000-4000-8000-000000000001', 'admin@demo.test',     'Administrador demo', 'administrador', 'scrypt$32768$8$3$OQkFfX_NJYpeRxcQeU9G0A$M1mgs8FZQBb7imOJUKM3EXr7b1oY2CMKQ6t5Z1zHYI4', true),
  ('00000000-0000-4000-8000-000000000502', '00000000-0000-4000-8000-000000000001', 'asesor@demo.test',    'Asesor demo',        'asesor',        'scrypt$32768$8$3$d1Bw6qFmJ58LV3GP_nopAg$pqsTWIV2qd5FhzLAqpYCp6MZLkg_XeG9-TB3SPFhHy4', true),
  ('00000000-0000-4000-8000-000000000503', '00000000-0000-4000-8000-000000000001', 'maestro@demo.test',   'Maestro demo',       'maestro',       'scrypt$32768$8$3$cKzvj_ErPzrnorsWBclwFA$izwu8B1jNj_IuqILemEOe_LU8JuQHb84-Yl38OpCBYU', true),
  ('00000000-0000-4000-8000-000000000504', '00000000-0000-4000-8000-000000000001', 'recepcion@demo.test', 'Recepción demo',    'recepcion',     'scrypt$32768$8$3$KX4RIqyh7oyybCFL2_dp1w$petqDz1zi__fOm_AxpJt7e-PPQTAmdXVvpXBZGrf_Yw', true)
ON CONFLICT DO NOTHING;

-- Sucursales de cada quien: el asesor ve solo la primera; recepción ve las dos; el administrador ve
-- todas sin necesitar filas. El maestro se limita por sus grupos (B2), no por sucursal.
INSERT INTO usuario_sucursal (id, organizacion_id, usuario_id, sucursal_id) VALUES
  ('00000000-0000-4000-8000-000000000511', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000502', '00000000-0000-4000-8000-000000000201'),
  ('00000000-0000-4000-8000-000000000512', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000504', '00000000-0000-4000-8000-000000000201'),
  ('00000000-0000-4000-8000-000000000513', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000504', '00000000-0000-4000-8000-000000000202')
ON CONFLICT DO NOTHING;

-- Instructor ligado al usuario maestro de la demo (B2). Los grupos que imparte se asignan en
-- catalogo.sql (los grupos nacen después).
INSERT INTO instructor (id, organizacion_id, usuario_id, nombre, activo) VALUES
  ('00000000-0000-4000-8000-000000000521', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000503', 'Maestro demo', true)
ON CONFLICT DO NOTHING;
