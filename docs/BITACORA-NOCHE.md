# BITACORA-NOCHE.md

Sesión nocturna del 7 de octubre de 2026. Rama `noche-fase1`. Plan: `docs/PLAN-NOCHE.md`.

| Bloque | Estado | Commit | Nota |
|---|---|---|---|
| N0 | HECHO | 0c205e6 + bitácora | Preparación |
| N1 | HECHO | 24f667f | Correcciones a CLAUDE.md (invariantes 13 y 14) |
| N2 | HECHO | ecb2c01 | Prueba simulada de atribución y transporte |
| N3 | HECHO | 4fa5dcf | Esquema de Fase 1 |
| N4 | HECHO | (ver git log) | Entrada |
| N5 | PENDIENTE | | Bot |
| N6 | PENDIENTE | | Handoff |
| N7 | PENDIENTE | | Estados de entrega |
| N8 | PENDIENTE | | Reenganche |
| N9 | PENDIENTE | | Reporte mínimo |
| N10 | PENDIENTE | | Prueba de fuego (segunda vertical) |
| N11 | PENDIENTE | | Catálogo de Fase 2 |

## N0. Preparación

**Qué se hizo**
- Commit `0c205e6` con el trabajo de 0.5 sin commit, tal como estaba.
- Rama `noche-fase1` creada.
- Esta bitácora.

**Verificación (línea base antes de tocar nada)**
- `npm run validar` → exit 0 (54 tests).
- `npm run test:int` → exit 0 (18 tests).

**Decisiones que tomé**
- Creé la rama antes de hacer el commit de 0.5, así que ese commit vive en `noche-fase1` y no en `main`. Alternativa descartada: commitear en `main` y luego ramificar; el plan dice "trabaja solo ahí" y no autoriza tocar `main`. Si prefieres 0.5 en `main`, es un cherry-pick de `0c205e6`.

**Para Eduardo**
- Nada.

## N1. Correcciones a CLAUDE.md

**Qué se hizo**
- Invariantes 13 y 14 de `CLAUDE.md` reemplazados con el texto literal del plan. Ningún otro cambio en el archivo.

**Verificación**
- `git diff HEAD~1 -- CLAUDE.md` muestra solo esas dos líneas.
- `npm run validar` y `npm run test:int` en verde (ver cierre).

**Decisiones que tomé**
- Ninguna.

**Para Eduardo**
- `SPEC.md` y `docs/CONTEXTO-PROYECTO.md` aún pueden hablar del lead con nombre/edad/sucursal planos; manda `CLAUDE.md`. No los toqué.

## N2. Prueba simulada de atribución y transporte (0.3a)

**Qué se hizo**
- Bandeja `Channel::TwilioSms` (WhatsApp) con credenciales falsas en el Chatwoot local, creada con `chatwoot/n2-bandeja-twilio.rb` por `rails runner` (el endpoint de la API autentica contra Twilio real y no sirve sin credenciales reales).
- Webhooks Twilio simulados contra `/twilio/callback` y `/twilio/delivery_status`; payloads reales del Agent Bot capturados con `scripts/receptor-captura.ts` en `docs/evidencia-n2/`.
- `docs/DECISION-ATRIBUCION.md` con P1, P2, P3, hallazgos y vía propuesta.

**Resultados clave**
- P1: los `Referral*` llegan al Agent Bot en `content_attributes.referral` → vía A viable. Requiere `ReferralSourceId`; sin él Chatwoot descarta el referral.
- P2: lo enviado por la API de Chatwoot aparece en la transcripción; un SID ajeno no crea nada. Confirmación con Twilio real: PENDIENTE.
- P3: el bot recibe `message_updated` por cada cambio (`sent`/`delivered`/`read`/`failed`), error en `content_attributes.external_error`.
- H1: Chatwoot 4.18 NO valida `X-Twilio-Signature` (choca con invariante 9 si se expone directo).
- H2: un reintento de Twilio con el mismo `MessageSid` duplicó el mensaje en Chatwoot (y cayó en otra conversación). La llave de idempotencia debe ser el `source_id` del payload.

**Verificación**
- `npm run validar` exit 0 (54 tests) · `npm run test:int` exit 0 (18 tests).
- `docker exec inscripciones-chatwoot-sidekiq-1 getent hosts api.twilio.com` → `127.0.0.1` (guarda activa).

**Decisiones que tomé**
- Bloqueé en `docker-compose.yml` (`extra_hosts`) los dominios de Twilio para `chatwoot` y `chatwoot-sidekiq`. Alternativa descartada: dejar que Chatwoot intentara Twilio con credenciales falsas (sería tráfico contra Twilio real, prohibido por el plan). Efecto: el servicio sigue funcionando para la demo; solo no puede salir a Twilio.
- Los callbacks de estado se simularon poniendo a mano el `source_id` de los mensajes salientes (lo que Twilio habría devuelto). Alternativa descartada: ninguna viable sin Twilio real.
- Usé la base de Chatwoot de la demo (cuenta "Demo local") para la prueba; quedaron una bandeja `N2 Twilio falso`, un Agent Bot `Captura N2` apuntando a una IP local que ya no escucha, y varios contactos de prueba. No afectan la demo de 0.5 (otra bandeja, otro bot). Alternativa descartada: proyecto compose aparte (reconstruir Chatwoot desde cero; sin necesidad).

**Para Eduardo**
- Elegir la vía (propongo A + firma en el borde + idempotencia por `source_id`).
- G0.3b y los pendientes de P2 requieren Twilio real.
- Si quieres limpiar la bandeja de prueba: borrarla desde Chatwoot (Ajustes → Bandejas) o `down -v` en otro momento.

## N3. Esquema de Fase 1 (bloque 1.1)

**Qué se hizo**
- `prisma/schema.prisma` completo: las 16 tablas del plan (nuevas: `canal_whatsapp`, `campana`, `etapa_pipeline`, `prospecto`, `interaccion`, `consentimiento`, `plantilla_mensaje`, `automatizacion`, `automatizacion_ejecucion`, `tarea_asesor`; ajustadas: `lead`, `conversacion`, `mensaje`, `bandeja_chatwoot`). Todas con `organizacion_id` y `eliminado_en`.
- Decisión 4: **toda** referencia entre tablas es una llave foránea compuesta `(x_id, organizacion_id) → tabla(id, organizacion_id)`; cada tabla declara `@@unique([id, organizacion_id])`.
- Decisión 3: `consentimiento` lleva `organizacion_id` (la baja aplica a la organización, no a la vertical).
- Decisión 2: `lead` es el adulto; `prospecto` (nombre, edad, origen bot/asesor). Un prospecto de bot por lead (índice parcial).
- Invariante 5: `conversacion.ventana_servicio_hasta` y `conversacion.ventana_gratis_hasta`, campos separados.
- Invariante 14 en la base: CHECK `automatizacion_horario_check` (09:00–20:00).
- Migración `20261008100000_fase1_esquema`: generada con `prisma migrate diff`, reordenada a mano para migrar los datos de la demo (etapa inicial por organización, un canal por bandeja, prospecto desde `lead.nombre_prospecto/edad_declarada`), con índices únicos parciales y CHECK al final.
- Código adaptado: `sistema.ts` (vertical vía canal), `entrante.ts` (etapa inicial y prospecto), `semilla.ts`, seed `prisma/seed/demo.sql` (etapas del insumo, canal enlazado a la bandeja).
- `src/datos/integridad.itest.ts`: 9 tests. El principal recorre 23 referencias cruzadas entre organizaciones y exige que la base rechace cada una (P2003), con un control positivo.

**Verificación**
- `npm run validar` exit 0 · `npm run test:int` exit 0 (26 tests; antes 18).
- Migración sobre base con datos viejos de la demo: leads quedan en "Nuevo", prospecto migrado, canal por bandeja. Sobre base vacía + seed: ok. `prisma migrate diff` contra el schema: vacío (sin deriva).

**Decisiones que tomé**
- `canal_whatsapp` es la fuente de verdad de vertical/sucursal/número; `bandeja_chatwoot` apunta al canal y **pierde** su `vertical_id` (alternativa descartada: duplicar la vertical en ambas y arriesgar inconsistencia).
- `numero_whatsapp` nulo permitido (la bandeja API de la demo no tiene número). Único global entre filas vivas, porque el mensaje entrante llega por número antes de conocer la organización.
- `automatizacion.evento_disparador` solo tiene `lead_sin_respuesta` (el insumo lista 12 eventos de fases 2 y 3; alternativa descartada: crearlos "por adelantado", prohibido por CLAUDE.md). Horario como minutos desde medianoche (`hora_inicio_min` / `hora_fin_min`) en vez de `time`, para no pelear con tipos de fecha.
- `mensaje.automatizacion_ejecucion_id` del insumo no se creó: la relación va en un solo sentido (`automatizacion_ejecucion.mensaje_id`) para evitar FK circular.
- No creé la vista `v_consentimiento_actual` del insumo (Prisma no maneja vistas); el estado vigente es la fila más reciente por (organización, teléfono, alcance).
- `ctwa_clid`, `anuncio_id`, `anuncio_titulo` y el JSON completo `atribucion` viven en `lead`, con `campana.anuncio_id` para enlazar el anuncio con una campaña.
- Instrucción de Eduardo a media sesión: archivos temporales en `.tmp/` dentro del repo (en `.gitignore`). Añadí `.tmp/` a los ignores de ESLint y a `CARPETAS_EXCLUIDAS` de `check:generico` (es una carpeta fuera de git, no código del repo; no se debilita ninguna regla sobre lo versionado).

**Para Eduardo**
- Revisar que `lead` conserve `sucursal_interes_id` (a nivel adulto) y `prospecto` no tenga sucursal propia; si prefieres sucursal por niño, es un cambio chico.
- Los nombres de las etapas del seed son los del insumo (sugerencia inicial); cámbialos en la tabla, no en código.

## N4. Entrada (bloque 1.2)

**Qué se hizo**
- **Idempotencia por identificador del proveedor** (invariante 8): `EventoEntrante.llave` = `{twilio, MessageSid}` en canales de Twilio y `{chatwoot, id}` en bandejas API. Resuelve H2 de N2 (un reintento de Twilio trae otro id de Chatwoot). El índice único `(organizacion, proveedor, id_externo)` ya existía.
- **Vertical por número receptor**: `normalizarNumeroWhatsapp()` (en `src/lib/telefono.ts`, único lugar que toca formatos) y `resolverBandejaPorNumero()` (en `sistema.ts`). Se usa cuando la bandeja no se reconoce y el evento trae `numeroReceptor`. Chatwoot no manda ese número, así que para Chatwoot la vertical sale de bandeja → canal; la ruta por número queda lista para otras fuentes (vía C).
- **Atribución detrás de una interfaz** (`FuenteAtribucion`, `src/mensajeria/atribucion.ts`) con `AtribucionSimulada` y `SinAtribucion`, más el adaptador de la vía A (`AtribucionDesdeChatwoot`, lee `content_attributes.referral`). El lead guarda `ctwa_clid`, `anuncio_id`, `anuncio_titulo`, `atribucion` (JSON completo) y `campana_id` (por `campana.anuncio_id`). La conversación recibe `ventana_gratis_hasta` = +72 h; `ventana_servicio_hasta` sigue en +24 h y son independientes.
- `server.ts` usa el adaptador de la vía A. Cambiar de vía = cambiar esa línea.

**Verificación**
- `npm run validar` exit 0 (58 tests) · `npm run test:int` exit 0 (31 tests).
- Tests nuevos: llave de idempotencia (Twilio vs API), adaptador A con y sin `source_id`, número receptor, lead con atribución + campaña + dos ventanas distintas, primer contacto conservado, reintento con otro id de Chatwoot no duplica, resolución por número.

**Decisiones que tomé**
- La atribución es del **primer contacto**: un lead existente conserva la suya; la conversación nueva sí abre su ventana gratis. Alternativa descartada: sobrescribir con la última (perdería el costo por lead real).
- Cuando el canal tiene `sucursal_id` fija, el lead nace con `sucursal_interes_id` (bandeja de una sola sucursal).
- Al cambiar `EventoEntrante` ajusté dos tests existentes que comparaban el evento completo: ahora incluyen `llave`, `numeroReceptor` y `crudo`; la comparación fixture-vs-real ignora `crudo` porque son dos documentos distintos por definición.
- No registro `consentimiento opt_in` por entrada CTWA: no hay regla de negocio que lo exija todavía (la ausencia de consentimiento = permitido, como en el insumo). Se decide en N5/N8.

**Para Eduardo**
- Confirmar la vía de atribución (el adaptador es solo la A).
- El número receptor no llega en el payload de Chatwoot; si la vía elegida es la C, ese campo se llena desde `To` de Twilio.
