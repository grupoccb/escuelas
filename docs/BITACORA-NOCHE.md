# BITACORA-NOCHE.md

Sesión nocturna del 7 de octubre de 2026. Rama `noche-fase1`. Plan: `docs/PLAN-NOCHE.md`.

| Bloque | Estado | Commit | Nota |
|---|---|---|---|
| N0 | HECHO | 0c205e6 + bitácora | Preparación |
| N1 | HECHO | 24f667f | Correcciones a CLAUDE.md (invariantes 13 y 14) |
| N2 | HECHO | ecb2c01 | Prueba simulada de atribución y transporte |
| N3 | HECHO | 4fa5dcf | Esquema de Fase 1 |
| N4 | HECHO | cf578e5 | Entrada |
| N5 | HECHO | a22b33f | Bot |
| N6 | HECHO | 57b3a90 | Handoff |
| N7 | HECHO | d0c0882 | Estados de entrega |
| N8 | HECHO | b50a9f1 | Reenganche |
| N9 | HECHO | f2712b9 | Reporte mínimo |
| N10 | HECHO | (ver git log) | Prueba de fuego (segunda vertical) |
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

## N5. Bot (bloque 1.3)

**Qué se hizo**
- Ya existían (de 0.5) las tres preguntas, validaciones y 3 reintentos. Se agregó lo que faltaba:
- **Palabras de baja** (`BAJA`, `STOP`, `CANCELAR`, `NO MOLESTAR`): `esPalabraDeBaja()` compara la palabra completa (sin importar mayúsculas, acentos ni puntuación); "quiero cancelar mi clase" no cuenta. Se atiende antes que cualquier otra cosa y en cualquier estado.
- **Consentimiento por organización** (decisión 3): la baja escribe una fila `opt_out` / `todo` en `consentimiento` (`src/mensajeria/consentimiento.ts`) y `MessagingProvider` ahora consulta la baja **por teléfono en toda la organización** antes de enviar (regla opt-out del invariante 4). Probado: una baja en una vertical bloquea los mensajes del mismo teléfono en otra.
- **Confirmación única**: columna nueva `mensaje.origen` (`respuesta` / `automatizacion` / `confirmacion_baja`; migración `20261008110000_mensaje_origen`). La confirmación es el único saliente que pasa con la baja vigente. Sale una vez: un webhook repetido o una segunda baja no vuelven a contestar.
- **Tiempo de espera** (`src/captacion/espera.ts`): si el contacto deja de contestar 30 min a mitad de la captura, la conversación pasa al asesor con una nota de datos parciales. No se le escribe al contacto. Se corre cada minuto desde `server.ts` y es idempotente (control de versión).

**Verificación**
- `npm run validar` exit 0 (65 tests) · `npm run test:int` exit 0 (39 tests).
- Tests nuevos: palabras de baja (positivas y negativas), reglas con `dado_de_baja` y `confirmacion_baja`, baja a mitad de captura, las cuatro palabras, confirmación única (webhook repetido y bajas repetidas), silencio posterior, baja de organización entre verticales, baja con asesor atendiendo (invariante 6: sin respuesta, con tarea), tiempo de espera (antes/después del umbral, idempotencia, no toca conversaciones con persona).

**Decisiones que tomé**
- "Confirmación única" = **se registra la baja de inmediato y se manda una sola confirmación**. Alternativa descartada: pedir "responde SÍ para confirmar" (dos pasos): obliga a quien ya dijo STOP a escribir otra vez y es contrario a las reglas de baja de WhatsApp.
- Si el teléfono **ya estaba** dado de baja (otra vertical), no se manda confirmación: no se le escribe a quien ya está dado de baja.
- Con `en_atencion_humana` el sistema no contesta ni siquiera la confirmación (invariante 6, sin excepción); la baja queda registrada y se crea una `tarea_asesor` (`revision_manual`) para que una persona confirme.
- El tiempo de espera **no manda recordatorio al contacto**: eso es una automatización iniciada por el sistema (horario, plantilla fuera de ventana) y es de N8. Alternativa descartada: "¿sigues ahí?" a los 30 min (podría caer fuera de 09:00–20:00).
- El barrido acepta `organizacionId` opcional (útil para operar una sola organización y para aislar tests: la base de pruebas acumula conversaciones viejas).
- Palabra exacta para la baja: "CANCELAR" es ambigua (podría ser cancelar una clase); se respeta tal cual lo pidió el plan.

**Para Eduardo**
- Decidir qué pasa cuando alguien dado de baja **vuelve a escribir** por su cuenta: hoy el bot calla y nadie se entera (queda registrado el mensaje). Propuesta: crear tarea para el asesor. Reactivar (`opt_in`) hoy es manual en la tabla; no hay palabra de alta.
- Confirmar los 30 min de tiempo de espera (`TIEMPO_ESPERA_MS`).

## N6. Handoff (bloque 1.4)

**Qué se hizo**
- Ya existía (0.5) el pase: nota interna → `toggle_status open` en Chatwoot → `en_atencion_humana`. Se verificó el orden con test: la nota sale **antes** de abrir, y abrir ocurre una sola vez.
- **Resumen para el asesor** unificado en `src/captacion/resumen.ts` (se arma desde la base, no desde memoria): nombre, edad, sucursal, teléfono, contacto (el adulto) y origen (`Anuncio «…» · campaña «…»` o "directo, sin anuncio"). Lo usan el bot y el tiempo de espera.
- **Interacción `pase_a_asesor`** registrada en un solo lugar (`MessagingProvider`) para todo pase, con el motivo (`captura_completa`, `sin_entender`, `sin_respuesta`, `falla_envio`).
- **Fuera de ventana y sin plantilla apta** (invariante 5): un mensaje libre bloqueado por `fuera_de_ventana` no se manda y el provider crea una `tarea_asesor` `sin_plantilla_apta` (con el texto que no salió). Una sola pendiente por conversación (reintentos no la duplican; índice parcial de N3). Con atención humana el bloqueo es por el invariante 6 y **no** genera tarea.

**Verificación**
- `npm run validar` exit 0 (65 tests) · `npm run test:int` exit 0 (44 tests).
- Tests nuevos (`handoff.itest.ts`): orden nota→abrir, resumen con y sin anuncio/campaña, interacción con motivo, pase por no entender, fuera de ventana (sin envío, estatus `bloqueado`, tarea única tras dos reintentos), atención humana sin tarea.

**Decisiones que tomé**
- La tarea se crea desde `MessagingProvider`, no desde cada automatización: la regla es del invariante 4 y N8 la reutiliza. "Plantilla apta" hoy se resume en "el saliente no trae plantilla"; N8 añade la selección/validación de plantillas aprobadas y reutiliza este mismo camino cuando no hay una.
- No cambio la etapa del pipeline al hacer el pase (la etapa "Contactado" es del asesor). Alternativa descartada: mover el lead automáticamente a la segunda etapa.
- Se actualizó la expectativa exacta de la nota en el test del loop completo (ahora lleva contacto y origen): sigue fijando el texto completo.

**Para Eduardo**
- En Chatwoot el resumen es una nota privada. Si prefieres atributos personalizados del contacto además de la nota, es una adición en el transporte de Chatwoot.

## N7. Estados de entrega (bloque 1.5)

**Qué se hizo**
- **Fuente detrás de una interfaz** (`FuenteEstadosEntrega`, `src/mensajeria/estados.ts`) según P3: hoy `EstadosEntregaChatwoot` interpreta el `message_updated` que Chatwoot entrega al Agent Bot (estado en `conversation.messages[].status`; error en `content_attributes.external_error`). Un callback directo de Twilio sería otro adaptador.
- `registrarEstadoEntrega()` guarda por mensaje: `estatus` (`enviado`/`entregado`/`leido`/`fallido`), `entregado_en`, `leido_en`, `error`, `error_codigo` y `id_proveedor` (MessageSid; columna nueva, migración `20261008120000_mensaje_id_proveedor`), para que otra fuente pueda encontrar el mensaje por SID.
- El webhook `/webhooks/chatwoot` (misma firma, invariante 9) ahora también registra cambios de estado; si el registro falla responde 500 para que Chatwoot reintente.
- `MessagingProvider` ya no puede retroceder un mensaje: su marca `enviado` es condicional a seguir `enviando` (si un evento de entrega lo adelantó, no lo pisa).

**Verificación**
- `npm run validar` exit 0 (74 tests) · `npm run test:int` exit 0 (52 tests).
- Los tests de la fuente usan los dos payloads **reales** capturados en N2 (`leído` y `fallido 63016`), copiados a `src/mensajeria/chatwoot/payload-estado-*.json`.
- Cubierto: avance de estados, idempotencia, fuera de orden sin retroceso, `fallido` no pisa lo ya entregado, entrega real reemplaza un fallo (y limpia el error), `leído` sin `entregado` marca ambas horas, búsqueda por MessageSid, bandeja/mensaje desconocidos sin lanzar, aislamiento entre organizaciones.

**Decisiones que tomé**
- Un `leído` sin `entregado` previo fija también `entregado_en` con la misma hora (leer implica haber recibido). Alternativa descartada: dejarlo nulo (daría "leído" sin entrega, incoherente en reportes).
- La hora del cambio es el `updated_at` del mensaje en el evento de Chatwoot; si no viene, la de recepción. Es aproximada (Chatwoot no expone la hora del callback de Twilio).
- Un `fallido` posterior a `entregado`/`leído` se ignora (el contacto ya lo recibió). Un estado de entrega posterior a un `fallido` lo reemplaza.
- Un evento que llega antes de que `MessagingProvider` guarde el `id_externo` del mensaje se pierde (`mensaje_desconocido`, log informativo). En la práctica el callback de Twilio tarda órdenes de magnitud más que ese guardado; no se agregó cola de reintento.
- No creo tarea al asesor por un `fallido`: no estaba en el alcance. El fallo queda en el mensaje y en el log (`entrega_fallida`).

**Para Eduardo**
- Con Twilio real, confirmar que Chatwoot entrega los `message_updated` también para mensajes con plantilla y que el `external_error` trae el código (hoy visto solo con callbacks simulados).
- Decidir si un `fallido` (p. ej. 63016) debe generar tarea para el asesor.

## N8. Reenganche (bloque 1.6)

**Qué se hizo**
- **Todas las reglas del invariante 4 dentro de `MessagingProvider`** (`reglas.ts` puro + `provider.ts`), en este orden de precedencia: atención humana (6) → baja (por teléfono, toda la organización; con alcance `marketing` solo bloquea plantillas de marketing) / conversación cerrada → plantilla (debe ser aprobada, activa, viva y de la vertical) → ventana de servicio (5: fuera de ella solo plantilla enviable) → **horario 09:00–20:00 hora de la sucursal, solo para lo iniciado por el sistema** (14, decisión 5: responder no tiene restricción) → **frecuencia** (1 automático por teléfono cada 24 h, `LIMITE_FRECUENCIA_POR_DEFECTO`). Sin zona horaria, lo automático no sale.
- `MessagingProvider.despachar()` devuelve el resultado por mensaje (`enviado` / `bloqueado` + motivo / `fallido`); el transporte tiene `enviarPlantilla` (falso y Chatwoot).
- **Motor** `src/automatizaciones/motor.ts`: *programar* (una `automatizacion_ejecucion` por automatización/entidad/ocurrencia; la unicidad es de la base) y *ejecutar* (reclama la ejecución antes de actuar, manda solo por el provider y traduce su resultado: `enviado`, `omitido` con motivo, `descartado`, `fallido`, o reprogramada). No repite ninguna regla.
- **Horario** (decisiones 5 y 6): lo programado fuera de rango se recorre al siguiente horario válido (con zona horaria y cambio de horario de verano); si con eso llegaría después del evento (`limiteDe`) se **descarta** como `evento_pasado` y se registra. También respeta la ventana propia de cada automatización (CHECK: nunca más ancha que 09:00–20:00).
- Seed: plantilla ficticia `reenganche_captacion` y automatización a 25 h, una vez (`prisma/seed/demo.sql`).
- Contrato de plantillas verificado contra el Chatwoot local (bandeja Twilio falsa de N2): una plantilla conocida se resuelve (`template_params` con `name`/`language`/`processed_params`) y el único fallo es salir a Twilio (bloqueado); una desconocida da `Template not found`.

**Verificación**
- `npm run validar` exit 0 (89 tests) · `npm run test:int` exit 0 (70 tests).
- Chequeo de mutación: sin el reclamo del motor falla "dos motores a la vez"; sin la regla de horario fallan 3 pruebas (provider, reglas, precedencia). Archivos restaurados y comparados byte a byte.
- Cubierto: envío a las 26 h y una sola vez, nada antes del tiempo, 3 motores concurrentes → un envío, noche → 09:00 local, motor tardío reprograma, respuesta sin restricción de horario, descarte por evento pasado, atención humana tras programar → omitido, estados que ni se programan (humana/cerrada/baja), baja total y de marketing, tope de frecuencia, plantilla no aprobada/inactiva/de otra vertical (+ tarea), sin plantilla, variables vacías/desconocidas, `max_intentos`, el bot continúa si el contacto contesta.

**Decisiones que tomé**
- **Cambié el tiempo de espera de N5 de 30 min a 72 h.** Con 30 min el bot pasaba la conversación a un asesor antes de que el reenganche (25 h) pudiera dispararse, y `en_atencion_humana` bloquea toda automatización (invariante 6): el reenganche habría sido código muerto. Ahora: 25 h → plantilla; 72 h sin respuesta → asesor con nota de datos parciales. Alternativa descartada: dejar 30 min y que el reenganche solo aplique a leads que nunca pasaron al asesor (casi ninguno). **Costo:** un lead a medias queda hasta 72 h sin que un asesor lo vea. Es decisión de producto, ver abajo.
- El reenganche aplica solo a conversaciones del bot con captura incompleta (`nombre`/`edad`/`sucursal`). Una captura completa ya está con una persona.
- La frecuencia se cuenta por **teléfono en toda la organización**, no por conversación (misma lógica que la baja).
- Una ejecución reclamada que se queda a medias (el proceso muere) **no** se reintenta sola: preferible no mandar que mandar dos veces (invariante 8). Queda con `ejecutado_en` y estatus `programado`; es detectable. No añadí recuperación.
- El motor corre en el mismo intervalo de 1 min que el barrido de espera, uno tras otro.
- La plantilla del seed es ficticia y figura "aprobada" solo para la demo local; en un ambiente real el estado viene de Twilio/Meta.

**Para Eduardo**
- **Decidir el calendario del lead a medias:** 25 h reenganche / 72 h asesor (lo que dejé) frente a pasar a asesor antes. Los números son constantes: `offset_minutos` (en la tabla `automatizacion`) y `TIEMPO_ESPERA_MS`.
- La sincronización de plantillas con Twilio y su estado de aprobación real están **pendientes** (requieren credenciales). Hoy `estado_aprobacion` se edita en la tabla.
- El tope de frecuencia (1 por 24 h) es un valor conservador mío; no hay cifra en los insumos.
- Un `fallido` de entrega (p. ej. 63016) no crea tarea ni cancela nada (ver N7).

## N9. Reporte mínimo (bloque 1.7)

**Qué se hizo**
- **Consulta** `reporteLeads(db, filtros)` (`src/reportes/leads.ts`): leads por campaña × sucursal × etapa, con resumen por etapa (en el orden del embudo) y total. Solo por el scope de organización; no cuenta lo borrado. Filtros opcionales: `desde` (inclusive) / `hasta` (exclusive) por fecha de alta, y `verticalSlug`.
- **Comando** `npm run reporte:leads` (`scripts/reporte-leads.ts`), con `--organizacion <nombre|id>` (obligatorio si hay varias), `--desde`/`--hasta AAAA-MM-DD`, `--vertical <slug>` y `--json`. Lee `DATABASE_URL` de `.env`.
- Los leads sin campaña o sin sucursal aparecen como `(sin campaña)` / `(sin sucursal)`; una campaña, sucursal o etapa borrada después se nombra `(… eliminada)` en vez de perder el conteo.

**Verificación**
- `npm run validar` exit 0 (91 tests) · `npm run test:int` exit 0 (78 tests).
- Tests: conteo por grupo, lo borrado y otras organizaciones no cuentan, orden de filas, filtros de fecha (bordes), filtro de vertical, aislamiento, campaña borrada, y el comando ejecutado como proceso (texto, JSON, organización obligatoria, fecha inválida).
- Ejemplo (base de pruebas, organización sin leads): `npm run reporte:leads -- --organizacion "Escuela demo"` → `Sin leads para los filtros dados.` (con datos, ver la tabla en el test de `leads.itest.ts`).

**Decisiones que tomé**
- La sucursal del reporte es `lead.sucursal_interes_id` (la que eligió el contacto en el bot), no la del canal.
- "Etapa" es la etapa actual del lead (no un histórico de cambios; el historial de etapas no está en el alcance de Fase 1).
- No expuse el reporte por HTTP: el plan pide consulta y comando.

**Para Eduardo**
- Con datos reales hay que correr primero la demo (ver abajo, N10/N11) o apuntar `DATABASE_URL` a la base que quieras: la base de la demo (`inscripciones`) se migra al hacer `docker compose up --build`, no antes.

## N10. Prueba de fuego (segunda vertical solo con seed)

**Qué se hizo**
- `prisma/seed/segunda-vertical.sql`: la segunda vertical de `docs/insumos/seed-sucursales-horarios.sql` (vertical, las dos sucursales, canal y bandeja). Solo filas; idempotente.
- `src/captacion/prueba-de-fuego.itest.ts`: aplica los seeds reales a una organización nueva (ids reescritos con un prefijo aleatorio por corrida para no chocar con otras pruebas), descubre cuál es la vertical que trajo la segunda semilla comparando filas antes y después, y demuestra el loop completo para ella.
- El archivo de prueba **no nombra ninguna vertical** (`check:generico` lo prohíbe): verifica contra lo que dice la tabla.

**Qué demuestra el test (6 pruebas)**
- Vertical, sucursales, canal y bandeja existen solo por filas; correr el seed dos veces no duplica.
- Loop completo: saludo con el nombre de **su** vertical (desde la tabla), opciones con **sus** sucursales, lead con **su** `vertical_interes_id`, prospecto, nota al asesor, conversación abierta y `en_atencion_humana`.
- El mismo teléfono escribiendo a las dos verticales → dos leads y dos conversaciones independientes.
- Una baja dada en una vertical calla a la otra (reglas por organización).
- Reenganche: la misma plantilla de la organización, con el nombre de la vertical nueva como variable.
- El reporte separa las verticales por el slug de la tabla.

**Verificación**
- `npm run validar` exit 0 (91 tests) · `npm run test:int` exit 0 (84 tests) · `npm run check:generico` ✓ (75 archivos).
- **Cero cambios de código**: `git status --short src prisma/schema.prisma prisma/migrations` durante esta etapa → solo `?? src/captacion/prueba-de-fuego.itest.ts` (la prueba). Ni `src/` productivo, ni schema, ni migraciones.
- Control negativo: quitando del seed las filas de `sucursal_vertical`, fallan 3 pruebas; restaurado, vuelven a pasar.

**Decisiones que tomé**
- El seed no incluye programas, grupos ni horarios del insumo: son de Fase 2 (N11 solo trae los de la primera vertical, según el plan).
- Canal sin número de WhatsApp (como el de la primera vertical): la demo usa bandejas tipo API de Chatwoot. Un número real se agrega con una fila más.

**Para Eduardo**
- Para ver la segunda vertical en la demo: `docker compose up -d --build` y aplicar `prisma/seed/segunda-vertical.sql` (`npx prisma db execute --file …`) y luego `node scripts/preparar-chatwoot.ts` crea su bandeja en Chatwoot. No lo agregué a `demo-preparar` para no cambiar la demo de 0.5.
