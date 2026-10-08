# Integración Twilio WhatsApp + Studio — Escuela multi-vertical

Adaptación del funnel (Karate / Ballet / Baile) a WhatsApp Business API vía Twilio, orquestado con Studio.

---

## 0. Lo primero: la decisión que cambia el costo del proyecto

Meta pasó a **cobro por mensaje entregado** (no por conversación de 24h). Las categorías son Marketing, Utility, Authentication y Service, y la categoría la define la plantilla, no el contenido de cada mensaje.

Dos hechos que deben dirigir todo el diseño:

1. A partir del 1 de octubre de 2026 los mensajes de servicio (respuestas dentro de la ventana de 24h) dejan de ser gratuitos y se cobran a la misma tarifa que utility. Presupuéstalo desde ahora.
2. La ventana de entrada de 72 horas que se abre cuando el cliente inicia el chat desde un anuncio Click-to-WhatsApp NO cambia: esas conversaciones siguen empezando gratis.

**Consecuencia de arquitectura:** los anuncios del cliente en Facebook/Instagram deben ser **Click-to-WhatsApp**, no "llenar formulario". No es una preferencia de marketing, es la diferencia entre un funnel casi gratuito y uno que sangra por mensaje. Toda la captación entra por CTWA → 72h gratis → ahí cabe completo el cotizador y el agendado de clase muestra.

Regla operativa: **todo lo que se pueda resolver dentro de la ventana, se resuelve dentro de la ventana.** Las plantillas se reservan para reengancharse fuera de ella.

---

## 1. Arquitectura Twilio

```
Meta Ads (CTWA) ─┐
QR en sucursal ──┼─→ WhatsApp Sender ─→ Messaging Service ─→ Studio Flow
Link en web ─────┘        (1 por vertical)         │
                                                   ├─→ HTTP Request → Backend API
                                                   ├─→ Run Function (Twilio Functions)
                                                   └─→ Handoff a asesor

Backend ──(REST: crear Execution)──→ Studio Flow  [flujos salientes]
Twilio ──(statusCallback)──→ Backend /webhooks/twilio/status
```

### Senders y Messaging Services

**Un número de WhatsApp por vertical.** El papá de karate no debe recibir mensajes con branding de ballet. Cada uno con su Messaging Service.

| Vertical | Messaging Service | Perfil WABA |
|---|---|---|
| Karate | `MG_karate` | Nombre, logo y descripción de la marca de karate |
| Ballet | `MG_ballet` | Idem ballet |
| Baile | `MG_baile` | Idem baile |

Los **flujos de Studio son los mismos** para las tres. La vertical se resuelve del parámetro `To` (número que recibió el mensaje) contra la tabla `canal_whatsapp`. Nunca dupliques flows por vertical: duplicas el mantenimiento.

> Si el cliente arranca con presupuesto corto, se puede empezar con un solo número y preguntar la vertical en el primer paso del flujo. Es un paso extra de fricción y un mensaje más de costo, pero funciona. Migrar después a números separados es fácil porque los flows no cambian.

### Configuración por sender
- **Incoming Message webhook** → apuntar al Studio Flow de captación.
- **Status Callback URL** → `https://api.tuapp.com/webhooks/twilio/status` (backend, no Studio).
- **Fallback URL** → endpoint que registra el error y avisa por Slack/correo.
- Firmar y **validar `X-Twilio-Signature`** en todos los webhooks del backend.

### Content Templates
Todas las plantillas se crean con el **Content Template Builder** (Content API) y se guardan por `content_sid` en tu tabla `plantilla_mensaje`. Nunca hardcodees el SID en Studio: Studio lee el SID que le pasa el backend o lo resuelve por código de plantilla.

Tipos que vas a usar:
- `twilio/text` — avisos simples.
- `twilio/quick-reply` — confirmar/reagendar/cancelar (máx. 3 botones).
- `twilio/list-picker` — selección de horarios y sucursales (hasta 10 opciones).
- `twilio/call-to-action` — link a pago o a ubicación.

---

## 2. Catálogo de plantillas

Nombres en `snake_case`. La categoría determina el costo y si Meta la aprueba: **si una plantilla huele a promoción, es Marketing**, no intentes disfrazarla de Utility porque Meta la recategoriza.

| Código | Categoría | Tipo | Variables | Uso |
|---|---|---|---|---|
| `bienvenida_ctwa` | — (dentro de ventana) | text | `{{1}}` nombre_vertical | Primer contacto desde anuncio |
| `recordatorio_clase_muestra_24h` | Utility | quick-reply | `{{1}}` nombre_niño, `{{2}}` fecha, `{{3}}` hora, `{{4}}` sucursal | Recordatorio día previo |
| `recordatorio_clase_muestra_2h` | Utility | text | `{{1}}` hora, `{{2}}` dirección | Recordatorio mismo día |
| `no_show_recuperacion` | Utility | quick-reply | `{{1}}` nombre_niño | No asistió a la muestra |
| `lead_frio_48h` | Marketing | quick-reply | `{{1}}` nombre_contacto, `{{2}}` vertical | Sin respuesta 48h |
| `promo_por_vencer` | Marketing | call-to-action | `{{1}}` nombre_promo, `{{2}}` días_restantes | Promo con vigencia |
| `bienvenida_inscripcion` | Utility | text | `{{1}}` nombre_niño, `{{2}}` grupo, `{{3}}` día/hora | Post-alta |
| `beneficio_pendiente_listo` | Utility | text | `{{1}}` nombre_niño, `{{2}}` beneficio | "Ya está tu uniforme" |
| `recordatorio_pago_3d` | Utility | call-to-action | `{{1}}` nombre_niño, `{{2}}` monto, `{{3}}` fecha, `{{4}}` link_pago | 3 días antes del corte |
| `pago_vencido` | Utility | call-to-action | `{{1}}` nombre_niño, `{{2}}` monto, `{{3}}` días_vencido | Cobranza |
| `pago_confirmado` | Utility | text | `{{1}}` monto, `{{2}}` concepto | Recibo |
| `convocatoria_evento` | Utility | quick-reply | `{{1}}` tipo_evento, `{{2}}` fecha, `{{3}}` cuota | Examen / recital |
| `ausencias_seguimiento` | Utility | quick-reply | `{{1}}` nombre_niño, `{{2}}` num_faltas | Retención: 3 faltas seguidas |
| `reactivacion_baja` | Marketing | call-to-action | `{{1}}` nombre_niño, `{{2}}` promo | Alumno dado de baja |

Cada plantilla necesita versión por vertical solo si el copy cambia de fondo. En la práctica: **una plantilla parametrizada con `{{vertical}}` alcanza para casi todas**, salvo las de marketing, donde el tono sí debe cambiar (karate ≠ ballet).

---

## 3. Flujos de Studio

### F1 — `captacion_ctwa` (Incoming Message trigger)

El flujo más importante. Todo pasa dentro de la ventana gratuita de 72h.

```
[Trigger: Incoming Message]
   ↓
[HTTP Request] POST /api/whatsapp/inbound
   Body: From, To, Body, ProfileName, + datos de referral del anuncio
   ← Respuesta: { vertical, es_lead_nuevo, lead_id, tutor_existente, nombre }
   ↓
[Split: es_lead_nuevo?]
   ├── NO → subflow F10 (handoff / menú de alumno existente)
   └── SÍ ↓
[Send Message] Saludo con branding de la vertical
   ↓
[Send & Wait For Reply] "¿Cómo se llama tu hijo o hija?"
   ↓
[Send & Wait For Reply] "¿Qué edad tiene?"
   ↓
[HTTP Request] GET /api/sucursales?vertical={vertical}
   ↓
[Send Message: list-picker] Sucursales disponibles
[Send & Wait For Reply]
   ↓
[HTTP Request] GET /api/cotizador?edad=&sucursal_id=&vertical_id=
   ← { programa, horarios[], costo_inscripcion, mensualidad, promociones[] }
   ↓
[Split: hay horarios disponibles?]
   ├── NO → [Send Message] "Te aviso en cuanto abra grupo" → crear en lista de espera
   └── SÍ ↓
[Send Message] Horarios + precios + promo vigente  ← EL MOMENTO DE VERDAD
   ↓
[Send Message: list-picker] "Elige el horario para tu clase muestra gratis"
[Send & Wait For Reply]
   ↓
[HTTP Request] POST /api/clase-muestra   (agenda + mueve lead a etapa)
   ↓
[Send Message] Confirmación + dirección + link de mapa
   ↓
[HTTP Request] POST /api/leads/{id}/etapa  → "Clase muestra agendada"
```

**Detalle crítico:** el `Send & Wait For Reply` tiene timeout. Configúralo en ~30 minutos y en el `noReply` guarda el lead con la información parcial que ya tengas. Un lead a medio capturar sigue siendo un lead — el asesor lo retoma.

**Datos de referral:** cuando el chat inicia desde un anuncio Click-to-WhatsApp, el webhook trae identificadores del anuncio (id de la creatividad, `ctwa_clid`, headline). Mapea eso a `campana_id` en el momento de crear el lead — es la única forma de calcular costo por alumno inscrito. Verifica los nombres exactos de los parámetros en la documentación vigente de Twilio para WhatsApp referrals, porque han cambiado entre versiones.

### F2 — `recordatorio_clase_muestra` (REST API trigger)

Disparado por el scheduler del backend, 24h y 2h antes.

```
POST /v2/Flows/{FlowSid}/Executions
  To=whatsapp:+52...   From=whatsapp:+52{numero_vertical}
  Parameters={"content_sid":"HX...","nombre":"Sofía","fecha":"martes 12",
              "hora":"17:00","sucursal":"Norte","clase_muestra_id":"..."}
```

```
[Trigger: REST API]
   ↓
[Send Message] plantilla quick-reply: [Confirmar] [Reagendar] [Cancelar]
   ↓
[Send & Wait For Reply]
   ├── Confirmar → POST /api/clase-muestra/{id}/confirmar → "¡Te esperamos!"
   ├── Reagendar → list-picker con horarios → POST reagendar
   └── Cancelar  → POST /api/leads/{id}/perdido + captura motivo
```

### F3 — `no_show_recuperacion`

Se dispara 2 horas después de la clase muestra si el estatus quedó en `no_asistio`. Es el flujo con mayor ROI de todo el sistema: la fuga más grande del negocio está aquí.

```
[Send Message] plantilla: "Te extrañamos, ¿reagendamos?" [Sí] [Otro día] [Ya no]
   ↓ Sí/Otro día → list-picker de horarios → reagenda
   ↓ Ya no → captura motivo → etapa Perdido
```

### F4 — `nurture_lead_frio`
48h y 7 días sin respuesta. Tope de **2 intentos** y después el lead se marca `frio` y sale de automatización. Insistir más quema el número: los bloqueos de usuarios degradan tu calidad de sender en Meta.

### F5 — `promo_por_vencer`
Se dispara cuando una promoción vigente está a 3 días de terminar y hay leads en etapas intermedias. Categoría Marketing — úsala con criterio.

### F6 — `bienvenida_inscripcion`
Al cerrar el lead: confirma grupo, día, hora, qué llevar, y entrega el link del portal de padres.

### F7 — `cobranza`
3 días antes del corte, día del corte, y a los 3/7/15 días de vencido. Con `call-to-action` al link de pago. Escalamiento configurable, no hardcodeado.

### F8 — `handoff_asesor` (subflow)
Palabras clave (`asesor`, `humano`, `hablar`, `llamar`) o tres respuestas no entendidas → pausa la automatización, notifica al asesor asignado y **marca la conversación como `en_atencion_humana`**. Mientras esté en ese estado, ninguna automatización dispara. Sin esto, el sistema le manda recordatorios automáticos a alguien que está negociando con un humano. Es la falla más vergonzosa posible.

---

## 4. Endpoints que Studio consume

| Método | Ruta | Devuelve |
|---|---|---|
| POST | `/api/whatsapp/inbound` | Identifica vertical, crea o recupera lead, devuelve contexto |
| GET | `/api/sucursales?vertical_id=` | Sucursales activas para esa vertical |
| GET | `/api/cotizador?edad=&sucursal_id=&vertical_id=` | Programas, horarios con cupo, precios, promos |
| POST | `/api/clase-muestra` | Agenda y devuelve confirmación |
| PATCH | `/api/clase-muestra/{id}` | Confirmar / reagendar / cancelar |
| POST | `/api/leads/{id}/etapa` | Mueve etapa del pipeline |
| POST | `/api/leads/{id}/perdido` | Con motivo |
| POST | `/api/conversaciones/{id}/handoff` | Pausa automatización, notifica asesor |
| POST | `/webhooks/twilio/status` | Recibe `sent/delivered/read/failed` |
| POST | `/webhooks/twilio/inbound-log` | Copia de todo lo entrante para auditoría |

**Regla:** todos deben responder en menos de 5 segundos y devolver JSON plano. Studio no es lugar para lógica de negocio — Studio conversa, el backend decide. Si te encuentras metiendo `Split` anidados con reglas de precios, esa lógica va al backend.

---

## 5. Tablas nuevas en el modelo de datos

### canal_whatsapp
Mapea número → vertical. Es lo que permite un solo set de flows.

| campo | nota |
|---|---|
| id, vertical_id, sucursal_id (nullable) | |
| numero_whatsapp | formato `whatsapp:+521...` |
| messaging_service_sid | `MG...` |
| waba_id, sender_sid | |
| flow_captacion_sid | `FW...` |
| activo | |

### plantilla_mensaje
| campo | nota |
|---|---|
| id, codigo | `recordatorio_clase_muestra_24h` |
| content_sid | `HX...` |
| vertical_id (nullable) | null = aplica a todas |
| categoria | marketing / utility / authentication |
| tipo_content | text / quick-reply / list-picker / call-to-action |
| variables | jsonb con nombres y orden |
| idioma | `es_MX` |
| estado_aprobacion | pendiente / aprobada / rechazada / pausada |
| activo | |

> El `estado_aprobacion` no es adorno: Meta puede pausar una plantilla por baja calidad. Si tu código asume que siempre está aprobada, el día que la pausen los recordatorios fallan en silencio. Sincroniza este campo con la API de Twilio y ten fallback a SMS.

### conversacion
Una por (contacto × canal). Es donde vive el estado de la ventana.

| campo | nota |
|---|---|
| id, lead_id (nullable), tutor_id (nullable) | |
| canal_whatsapp_id, telefono | |
| ventana_abierta_hasta | timestamp — **el campo más consultado del sistema** |
| tipo_ventana | `servicio_24h` / `entrada_72h_ctwa` |
| estado | bot / en_atencion_humana / cerrada / opt_out |
| asignado_a | usuario_id |
| studio_execution_sid | para poder cancelar la ejecución |
| ultimo_mensaje_entrante_en, ultimo_mensaje_saliente_en | |

### mensaje
| campo | nota |
|---|---|
| id, conversacion_id, direccion | entrante / saliente |
| message_sid | `SM...` / `MM...` |
| content_sid, plantilla_id | null si es free-form |
| cuerpo, variables_usadas | jsonb |
| categoria_facturable | para conciliar el costo |
| estatus | queued/sent/delivered/read/failed/undelivered |
| error_code, error_message | |
| enviado_en, entregado_en, leido_en | |
| automatizacion_ejecucion_id | trazabilidad |

### automatizacion
El motor de reglas configurable. El cliente debe poder cambiar "recordatorio 24h antes" a "48h antes" sin llamarte.

| campo | nota |
|---|---|
| id, nombre, activo | |
| vertical_id, sucursal_id | null = todas |
| evento_disparador | `clase_muestra_agendada`, `clase_muestra_no_asistio`, `lead_sin_respuesta`, `promo_por_vencer`, `cargo_por_vencer`, `cargo_vencido`, `inscripcion_creada`, `beneficio_listo`, `faltas_consecutivas`, `alumno_baja` |
| offset_minutos | negativo = antes del evento |
| plantilla_id, flow_sid | |
| condiciones | jsonb (`{"etapa_in":["contactado"],"vertical":"karate"}`) |
| max_intentos | |
| ventana_horaria_inicio/fin | ej. 09:00–20:00 |
| dias_permitidos | ej. lun–sáb |

### automatizacion_ejecucion
Idempotencia. Sin esto, un reintento del scheduler manda el recordatorio dos veces.

`id, automatizacion_id, entidad_tipo, entidad_id, ocurrencia, programado_para, ejecutado_en, estatus, mensaje_id`

**Índice único en `(automatizacion_id, entidad_tipo, entidad_id, ocurrencia)`.**

### consentimiento
`id, telefono, canal, estado (opt_in/opt_out), origen (ctwa/formulario/manual), fecha, evidencia_jsonb`

---

## 6. Reglas de oro de la operación

**Ventana.** Antes de cada envío saliente, el backend consulta `ventana_abierta_hasta`:
- Dentro → mensaje libre.
- Fuera → plantilla aprobada obligatoria. Si no hay plantilla apta para ese caso, **no se manda nada** y se crea tarea para el asesor.

**Horario.** Nada se envía fuera de 09:00–20:00 hora local de la sucursal. Un recordatorio de cobranza a las 6 a.m. cuesta más en reputación que lo que recupera. Los mensajes programados fuera de rango se recorren al siguiente slot válido.

**Opt-out.** `BAJA`, `STOP`, `CANCELAR`, `NO MOLESTAR` → registra opt-out, confirma una vez, y **bloquea todo envío de marketing**. Los utility transaccionales (recibo de pago) se pueden mantener si el consentimiento lo cubre; consúltalo con el cliente y déjalo configurable.

**Tope de frecuencia.** Máximo 1 mensaje de marketing por contacto cada 7 días, y máximo 3 mensajes automáticos al día en total. Configurable, pero con default conservador.

**Fallback a SMS.** Si el WhatsApp falla con `undelivered` o error 63016 (fuera de ventana sin plantilla), el mismo Messaging Service puede intentar SMS. Útil sobre todo en cobranza.

**Prioridad de canal.** Si la conversación está `en_atencion_humana`, ninguna automatización dispara. Punto.

---

## 7. Métricas del canal

- Entregabilidad y tasa de lectura por plantilla → detecta plantillas quemadas.
- **Tasa de respuesta al recordatorio de clase muestra** → predictor directo de asistencia.
- % de no-show recuperado por F3 → el número que justifica el proyecto completo.
- Costo de mensajería por lead y por alumno inscrito, cruzado con `campana`.
- % de conversaciones que terminan en handoff humano → si sube, el flujo tiene un hueco.
- Calidad del sender según Meta (verde/amarillo/rojo) → alerta temprana si el nurture está siendo agresivo.

---

## 8. Orden de implementación

1. **Sender + Messaging Service de karate** y validación de webhooks firmados.
2. **Tablas** `canal_whatsapp`, `conversacion`, `mensaje` + logging de todo lo entrante y saliente. Sin observabilidad no se depura nada.
3. **F1 `captacion_ctwa`** con el cotizador conectado. Esto solo ya justifica el sistema.
4. **F2 + F3** (recordatorio y recuperación de no-show). Aquí está el dinero.
5. Tabla `automatizacion` + scheduler con idempotencia.
6. `plantilla_mensaje` sincronizada con Content API + estados de aprobación.
7. F4–F9 y opt-out.
8. Clonar configuración para ballet y baile: **debe ser trabajo de captura, no de desarrollo.** Si tienes que tocar código, algo se hardcodeó.

---

## 9. Puntos donde este proyecto se puede caer

- **Aprobación de plantillas de Meta.** Tarda, y las de Marketing se rechazan seguido. Somételas en la semana 1, no la noche antes del lanzamiento.
- **Verificación del WABA por vertical.** Tres marcas = tres perfiles = tres verificaciones de Meta Business. Empieza el trámite ya.
- **Números mexicanos y el prefijo `1`.** WhatsApp usa `+521` para móviles de México en algunos contextos y `+52` en otros. Normaliza a E.164 en un solo lugar del código y prueba con números reales de las tres compañías antes de lanzar.
- **El cambio del 1 de octubre de 2026.** Si el proyecto entra en producción cerca de esa fecha, el costo de las respuestas de servicio deja de ser cero. Modela el presupuesto con y sin ese cambio.
