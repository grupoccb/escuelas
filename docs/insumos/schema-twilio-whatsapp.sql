-- ============================================================
-- Escuela multi-vertical — Capa de mensajería WhatsApp (Twilio)
-- PostgreSQL 14+
-- Se asume que ya existen: vertical, sucursal, lead, prospecto,
-- tutor, alumno, inscripcion, promocion, cargo, usuario
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ------------------------------------------------------------
-- 1. Canales: mapea numero de WhatsApp -> vertical
-- ------------------------------------------------------------
CREATE TABLE canal_whatsapp (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    vertical_id             uuid NOT NULL REFERENCES vertical(id),
    sucursal_id             uuid REFERENCES sucursal(id),          -- NULL = todas
    numero_whatsapp         text NOT NULL UNIQUE,                  -- 'whatsapp:+5215512345678'
    messaging_service_sid   text NOT NULL,                         -- MG...
    sender_sid              text,                                  -- XE...
    waba_id                 text,
    flow_captacion_sid      text,                                  -- FW...
    nombre_publico          text NOT NULL,
    calidad_meta            text DEFAULT 'desconocida'
        CHECK (calidad_meta IN ('alta','media','baja','desconocida')),
    activo                  boolean NOT NULL DEFAULT true,
    creado_en               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_canal_vertical ON canal_whatsapp(vertical_id) WHERE activo;

-- ------------------------------------------------------------
-- 2. Plantillas (Content Templates de Twilio)
-- ------------------------------------------------------------
CREATE TABLE plantilla_mensaje (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo              text NOT NULL,                             -- recordatorio_clase_muestra_24h
    content_sid         text NOT NULL,                             -- HX...
    vertical_id         uuid REFERENCES vertical(id),              -- NULL = todas
    categoria           text NOT NULL
        CHECK (categoria IN ('marketing','utility','authentication','servicio')),
    tipo_content        text NOT NULL
        CHECK (tipo_content IN ('text','quick-reply','list-picker','call-to-action','media')),
    idioma              text NOT NULL DEFAULT 'es_MX',
    variables           jsonb NOT NULL DEFAULT '[]'::jsonb,        -- [{"pos":1,"nombre":"nombre_nino"}]
    cuerpo_referencia   text,                                      -- copia legible para el equipo
    estado_aprobacion   text NOT NULL DEFAULT 'pendiente'
        CHECK (estado_aprobacion IN ('pendiente','aprobada','rechazada','pausada','deshabilitada')),
    sincronizado_en     timestamptz,
    activo              boolean NOT NULL DEFAULT true,
    creado_en           timestamptz NOT NULL DEFAULT now(),
    UNIQUE (codigo, vertical_id, idioma)
);

-- Solo se puede enviar lo aprobado y activo
CREATE INDEX idx_plantilla_enviable ON plantilla_mensaje(codigo)
    WHERE estado_aprobacion = 'aprobada' AND activo;

-- ------------------------------------------------------------
-- 3. Consentimiento / opt-out
-- ------------------------------------------------------------
CREATE TABLE consentimiento (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    telefono        text NOT NULL,                                 -- E.164 normalizado
    canal           text NOT NULL DEFAULT 'whatsapp',
    estado          text NOT NULL CHECK (estado IN ('opt_in','opt_out')),
    alcance         text NOT NULL DEFAULT 'todo'
        CHECK (alcance IN ('todo','marketing')),                   -- opt-out parcial
    origen          text,                                          -- ctwa / formulario / manual / palabra_clave
    evidencia       jsonb,
    fecha           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_consentimiento_tel ON consentimiento(telefono, fecha DESC);

-- Estado vigente por telefono
CREATE VIEW v_consentimiento_actual AS
SELECT DISTINCT ON (telefono, alcance)
       telefono, alcance, estado, fecha
FROM consentimiento
ORDER BY telefono, alcance, fecha DESC;

-- ------------------------------------------------------------
-- 4. Conversaciones (estado de la ventana)
-- ------------------------------------------------------------
CREATE TABLE conversacion (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    canal_whatsapp_id           uuid NOT NULL REFERENCES canal_whatsapp(id),
    telefono                    text NOT NULL,                     -- E.164
    lead_id                     uuid REFERENCES lead(id),
    tutor_id                    uuid REFERENCES tutor(id),
    ventana_abierta_hasta       timestamptz,
    tipo_ventana                text CHECK (tipo_ventana IN ('servicio_24h','entrada_72h_ctwa')),
    estado                      text NOT NULL DEFAULT 'bot'
        CHECK (estado IN ('bot','en_atencion_humana','cerrada','opt_out')),
    asignado_a                  uuid REFERENCES usuario(id),
    studio_execution_sid        text,
    ultimo_mensaje_entrante_en  timestamptz,
    ultimo_mensaje_saliente_en  timestamptz,
    creado_en                   timestamptz NOT NULL DEFAULT now(),
    UNIQUE (canal_whatsapp_id, telefono)
);

CREATE INDEX idx_conv_ventana ON conversacion(ventana_abierta_hasta)
    WHERE estado = 'bot';
CREATE INDEX idx_conv_atencion ON conversacion(asignado_a)
    WHERE estado = 'en_atencion_humana';

-- ------------------------------------------------------------
-- 5. Mensajes
-- ------------------------------------------------------------
CREATE TABLE mensaje (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conversacion_id             uuid NOT NULL REFERENCES conversacion(id),
    direccion                   text NOT NULL CHECK (direccion IN ('entrante','saliente')),
    message_sid                 text UNIQUE,                       -- SM.../MM...
    plantilla_id                uuid REFERENCES plantilla_mensaje(id),
    content_sid                 text,
    cuerpo                      text,
    variables_usadas            jsonb,
    categoria_facturable        text,
    estatus                     text DEFAULT 'queued'
        CHECK (estatus IN ('queued','sent','delivered','read','failed','undelivered','received')),
    error_code                  int,
    error_message               text,
    automatizacion_ejecucion_id uuid,
    enviado_en                  timestamptz DEFAULT now(),
    entregado_en                timestamptz,
    leido_en                    timestamptz
);

CREATE INDEX idx_mensaje_conv ON mensaje(conversacion_id, enviado_en DESC);
CREATE INDEX idx_mensaje_fallidos ON mensaje(error_code, enviado_en DESC)
    WHERE estatus IN ('failed','undelivered');

-- ------------------------------------------------------------
-- 6. Motor de automatizaciones (configurable por el cliente)
-- ------------------------------------------------------------
CREATE TABLE automatizacion (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre                  text NOT NULL,
    vertical_id             uuid REFERENCES vertical(id),          -- NULL = todas
    sucursal_id             uuid REFERENCES sucursal(id),
    evento_disparador       text NOT NULL CHECK (evento_disparador IN (
                                'clase_muestra_agendada',
                                'clase_muestra_no_asistio',
                                'lead_sin_respuesta',
                                'promo_por_vencer',
                                'cargo_por_vencer',
                                'cargo_vencido',
                                'pago_registrado',
                                'inscripcion_creada',
                                'beneficio_listo',
                                'faltas_consecutivas',
                                'evento_convocatoria',
                                'alumno_baja')),
    offset_minutos          int NOT NULL DEFAULT 0,                -- negativo = antes del evento
    plantilla_id            uuid REFERENCES plantilla_mensaje(id),
    condiciones             jsonb NOT NULL DEFAULT '{}'::jsonb,
    max_intentos            int NOT NULL DEFAULT 1,
    ventana_horaria_inicio  time NOT NULL DEFAULT '09:00',
    ventana_horaria_fin     time NOT NULL DEFAULT '20:00',
    dias_permitidos         int[] NOT NULL DEFAULT '{1,2,3,4,5,6}',-- 0=domingo
    activo                  boolean NOT NULL DEFAULT true,
    creado_en               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_automatizacion_evento ON automatizacion(evento_disparador) WHERE activo;

-- ------------------------------------------------------------
-- 7. Ejecuciones (idempotencia — evita mensajes duplicados)
-- ------------------------------------------------------------
CREATE TABLE automatizacion_ejecucion (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    automatizacion_id   uuid NOT NULL REFERENCES automatizacion(id),
    entidad_tipo        text NOT NULL,                             -- lead / clase_muestra / cargo / inscripcion
    entidad_id          uuid NOT NULL,
    ocurrencia          int  NOT NULL DEFAULT 1,                   -- intento 1, 2, 3...
    programado_para     timestamptz NOT NULL,
    ejecutado_en        timestamptz,
    estatus             text NOT NULL DEFAULT 'programado'
        CHECK (estatus IN ('programado','enviado','omitido','fallido','cancelado')),
    motivo_omision      text,                                      -- fuera_ventana / opt_out / atencion_humana / tope_frecuencia
    mensaje_id          uuid REFERENCES mensaje(id),
    creado_en           timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_automatizacion_idempotente
        UNIQUE (automatizacion_id, entidad_tipo, entidad_id, ocurrencia)
);

CREATE INDEX idx_ejecucion_pendiente ON automatizacion_ejecucion(programado_para)
    WHERE estatus = 'programado';

ALTER TABLE mensaje
    ADD CONSTRAINT fk_mensaje_ejecucion
    FOREIGN KEY (automatizacion_ejecucion_id)
    REFERENCES automatizacion_ejecucion(id);

-- ------------------------------------------------------------
-- 8. Cotizaciones (estado intermedio del flujo de Studio)
-- ------------------------------------------------------------
CREATE TABLE cotizacion (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id             uuid NOT NULL REFERENCES lead(id),
    prospecto_id        uuid REFERENCES prospecto(id),
    vertical_id         uuid NOT NULL REFERENCES vertical(id),
    sucursal_id         uuid NOT NULL REFERENCES sucursal(id),
    edad_declarada      int,
    opciones            jsonb NOT NULL,                            -- grupos ofrecidos, con indice de opcion
    costo_inscripcion   numeric(10,2),
    costo_mensualidad   numeric(10,2),
    promocion_id        uuid REFERENCES promocion(id),
    expira_en           timestamptz NOT NULL DEFAULT now() + interval '72 hours',
    creado_en           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_cotizacion_lead ON cotizacion(lead_id, creado_en DESC);

-- ------------------------------------------------------------
-- 9. Atribucion de campanas Click-to-WhatsApp
-- ------------------------------------------------------------
ALTER TABLE lead ADD COLUMN IF NOT EXISTS ctwa_clid       text;
ALTER TABLE lead ADD COLUMN IF NOT EXISTS ad_id           text;
ALTER TABLE lead ADD COLUMN IF NOT EXISTS ad_headline     text;
ALTER TABLE lead ADD COLUMN IF NOT EXISTS conversacion_id uuid REFERENCES conversacion(id);

CREATE INDEX idx_lead_ctwa ON lead(ctwa_clid) WHERE ctwa_clid IS NOT NULL;

-- ------------------------------------------------------------
-- 10. Vista: elegibilidad de envio (la consulta previa a cada mensaje)
-- ------------------------------------------------------------
CREATE VIEW v_conversacion_enviable AS
SELECT
    c.id                AS conversacion_id,
    c.telefono,
    c.canal_whatsapp_id,
    c.estado,
    c.ventana_abierta_hasta,
    (c.ventana_abierta_hasta > now())               AS ventana_abierta,
    (c.estado = 'bot')                              AS bot_activo,
    COALESCE(co.estado, 'opt_in') <> 'opt_out'      AS con_consentimiento,
    (SELECT count(*) FROM mensaje m
      WHERE m.conversacion_id = c.id
        AND m.direccion = 'saliente'
        AND m.enviado_en > now() - interval '24 hours') AS salientes_24h
FROM conversacion c
LEFT JOIN v_consentimiento_actual co
       ON co.telefono = c.telefono AND co.alcance = 'todo';

-- ------------------------------------------------------------
-- 11. Seeds minimos de automatizaciones
-- ------------------------------------------------------------
INSERT INTO automatizacion (nombre, evento_disparador, offset_minutos, max_intentos) VALUES
 ('Recordatorio clase muestra 24h', 'clase_muestra_agendada',   -1440, 1),
 ('Recordatorio clase muestra 2h',  'clase_muestra_agendada',    -120, 1),
 ('Recuperacion no-show',           'clase_muestra_no_asistio',   120, 1),
 ('Nurture lead frio 48h',          'lead_sin_respuesta',        2880, 2),
 ('Promo por vencer',               'promo_por_vencer',         -4320, 1),
 ('Bienvenida inscripcion',         'inscripcion_creada',           5, 1),
 ('Recordatorio de pago 3 dias',    'cargo_por_vencer',         -4320, 1),
 ('Cobranza vencido',               'cargo_vencido',             1440, 3),
 ('Beneficio listo para recoger',   'beneficio_listo',              0, 1),
 ('Seguimiento por faltas',         'faltas_consecutivas',          0, 1);
