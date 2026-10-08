-- Clase muestra (D1 a D4) para la organización de demo. ORDEN: demo.sql → catalogo.sql → catalogo-completo.sql → ESTE
-- archivo. Idempotente: ids fijos de 3 dígitos finales (`00000000-0000-4000-8000-000000000NNN`; los tests los re-prefijan por
-- organización) y cada UPDATE solo toca lo que todavía no se ha tocado.
--
-- Ids que usa este archivo: 7xx plantillas · 8xx automatizaciones (los anteriores: 701 plantilla y 801 automatización del reenganche).
-- ⚠ Todo lo que la escuela aún no da (textos de las plantillas, anticipación, tiempos de recordatorio, intentos de recuperación)
-- va como EJEMPLO marcado [SUPUESTO] y se edita desde administración (J8). Las plantillas son FICTICIAS y están «aprobadas» solo
-- para la demo local: en un ambiente real se sincronizan desde Twilio y solo sale lo que Meta aprobó.

-- ── D1: el papel de cada etapa del embudo para el sistema ───────────────────────────────────────────────
-- El código NUNCA busca una etapa por su nombre: busca por `tipo_sistema`. Las etapas de la demo (demo.sql) se marcan por id.
UPDATE etapa_pipeline SET tipo_sistema = 'nuevo'             WHERE id = '00000000-0000-4000-8000-000000000601' AND tipo_sistema IS NULL;
UPDATE etapa_pipeline SET tipo_sistema = 'contactado'        WHERE id = '00000000-0000-4000-8000-000000000602' AND tipo_sistema IS NULL;
UPDATE etapa_pipeline SET tipo_sistema = 'muestra_agendada'  WHERE id = '00000000-0000-4000-8000-000000000603' AND tipo_sistema IS NULL;
UPDATE etapa_pipeline SET tipo_sistema = 'muestra_asistida'  WHERE id = '00000000-0000-4000-8000-000000000604' AND tipo_sistema IS NULL;
UPDATE etapa_pipeline SET tipo_sistema = 'negociacion'       WHERE id = '00000000-0000-4000-8000-000000000605' AND tipo_sistema IS NULL;
UPDATE etapa_pipeline SET tipo_sistema = 'inscrito'          WHERE id = '00000000-0000-4000-8000-000000000606' AND tipo_sistema IS NULL;
UPDATE etapa_pipeline SET tipo_sistema = 'perdido'           WHERE id = '00000000-0000-4000-8000-000000000607' AND tipo_sistema IS NULL;

-- ── D1: el bot agenda la clase muestra (encendido en las tres verticales de la demo) ─────────────────────
-- Solo mientras nadie haya editado la vertical (`actualizado_en = creado_en`), para no pisar una decisión del administrador al volver a
-- correr el seed. Es un interruptor por vertical y solo tiene efecto con el cotizador de WhatsApp encendido. [SUPUESTO]
UPDATE vertical SET clase_muestra_whatsapp_activo = true
WHERE id IN ('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000103')
  AND NOT clase_muestra_whatsapp_activo AND actualizado_en = creado_en;
