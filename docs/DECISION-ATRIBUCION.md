# DECISION-ATRIBUCION.md — Prueba simulada de atribución y transporte (SPEC 0.3a)

Estado: **propuesta**. La decisión de la vía es de Eduardo. Fecha de la prueba: 7–8 de octubre de 2026.
Entorno: Chatwoot 4.18.0 autohospedado (docker compose local), canal `Channel::TwilioSms` con medio WhatsApp y credenciales falsas.

## Resumen

| Pregunta | Respuesta | Evidencia |
|---|---|---|
| **P1** ¿Llega el dato del anuncio al backend? | **Sí, por la vía A**, con tres salvedades (abajo). | `docs/evidencia-n2/bot-message_created-con-referral.json` |
| **P2** ¿Qué mensajes ve el asesor? | Todo lo que pasa por la API de Chatwoot aparece. Lo que se manda directo con el SDK de Twilio no tiene por dónde entrar. La confirmación con Twilio real queda **pendiente**. | Secciones P2 |
| **P3** ¿Cómo llegan los estados de entrega? | Chatwoot recibe el callback de Twilio y le manda al Agent Bot un `message_updated` por cada cambio, con el error en `content_attributes.external_error`. | `bot-message_updated-read.json`, `bot-message_updated-failed-63016.json` |

**Vía propuesta: A**, con dos mitigaciones obligatorias por los hallazgos H1 y H2 (firma e idempotencia).

## Cómo se hizo (reproducible)

1. `docker-compose.yml`: `chatwoot` y `chatwoot-sidekiq` resuelven `api.twilio.com`, `messaging.twilio.com`, `content.twilio.com` y `media.twilio.com` a loopback. Chatwoot local **no puede** alcanzar Twilio real aunque quisiera (verificado con `getent hosts api.twilio.com` → `127.0.0.1`).
2. `chatwoot/n2-bandeja-twilio.rb` (por `rails runner`) crea el canal Twilio falso (`AC000…`, número `whatsapp:+15005550006`), su bandeja y un Agent Bot de captura. Se crea directo en el modelo porque el endpoint de la API (`Channels::TwilioChannelsController`) autentica contra Twilio real (`client.messages.list`) y falla sin credenciales reales.
3. `scripts/receptor-captura.ts` recibe lo que el Agent Bot de captura entrega, con encabezados.
4. Los webhooks de Twilio se simulan con `curl -X POST http://localhost:3001/twilio/callback` (formulario, sin firma) y `/twilio/delivery_status`.

Nota de entorno: dentro de Docker Desktop `host.docker.internal` resuelve también a IPv6 (inalcanzable); el receptor se alcanza por la IPv4 del host (`192.168.65.254`).

## P1. ¿Llega el dato del anuncio?

Webhook entrante con `ReferralSourceId`, `ReferralSourceType`, `ReferralSourceUrl`, `ReferralHeadline`, `ReferralBody`, `ReferralMedia*`, `ReferralNumMedia` y `ReferralCtwaClid`.

- Chatwoot lo guarda en `messages.content_attributes.referral`, con estas llaves: `source_id`, `source_type`, `source_url`, `headline`, `body`, `media_content_type`, `media_url`, `num_media`, `ctwa_clid` (código: `Twilio::ReferralParamsHelper`).
- El Agent Bot lo recibe en el `message_created`, en `content_attributes.referral` (nivel superior) y repetido en `conversation.messages[].content_attributes.referral`.
- El mismo payload trae `sender.phone_number`, `conversation.contact_inbox.source_id` (`whatsapp:+521…`), `conversation.channel = "Channel::TwilioSms"` e `inbox.id`.
- Firmado con `X-Chatwoot-Signature` igual que la bandeja de la demo: el verificador actual (`src/mensajeria/chatwoot/webhook.ts`) sirve tal cual.

### Salvedades de P1

- **S1. `ReferralSourceId` es obligatorio.** Si llega `ReferralCtwaClid` sin `ReferralSourceId`, Chatwoot descarta todo el referral (`content_attributes` vacío). Probado.
- **S2. Solo el primer mensaje trae el referral.** Es el mensaje que llega con los parámetros; el backend debe persistir la atribución al crear el lead y no volver a buscarla después.
- **S3. Pendiente con Twilio real (G0.3b):** que Twilio efectivamente mande esos parámetros con nombres y mayúsculas exactos para un anuncio Click-to-WhatsApp real. Esta prueba demuestra el transporte desde el webhook en adelante, no el origen.

## P2. ¿Qué mensajes ve el asesor?

Probado en la bandeja Twilio falsa:

- Un mensaje saliente creado por la API de Chatwoot (`message_type: outgoing`) **aparece en la transcripción** (`type=1`). Al no poder llegar a Twilio quedó `status=failed` con `external_error = "Failed to open TCP connection to api.twilio.com…"` y el Agent Bot recibió el `message_updated` correspondiente.
- Un callback de estado con un `MessageSid` que Chatwoot no conoce (equivalente a un mensaje mandado directo con el SDK) **no crea nada** en la transcripción: `Twilio::DeliveryStatusService` solo hace `find_by(source_id)` y, si no existe, termina. Los webhooks de Twilio que Chatwoot procesa como mensaje son únicamente los **entrantes** (`Webhooks::TwilioEventsJob` ignora los que no traen `Body` ni media y trata todo lo demás como entrante del contacto).

Conclusión de diseño: para que el asesor vea la transcripción completa, **todo saliente tiene que pasar por Chatwoot** (su API envía por Twilio y lo registra). Un envío directo por SDK de Twilio **no** se vería. Esto es consistente con el invariante 4 si `MessagingProvider` usa Chatwoot como transporte de salida; el "SDK de Twilio" quedaría solo como adaptador secundario para lo que Chatwoot no pueda hacer.

**Pendiente con credenciales reales (no se simuló):**
- Que un mensaje enviado por Chatwoot con Twilio real llegue al contacto y quede con el `MessageSid` real.
- Envío de plantillas (Twilio Content Templates): `Channels::Twilio::TemplatesSyncJob` las sincroniza desde la API de Twilio, imposible sin credenciales. Confirmar formato de `template_params` y que el estado de aprobación se refleje.
- Si un mensaje mandado directo con el SDK aparece o no, con Twilio real. La lectura del código dice que no.

## P3. Estados de entrega

Chatwoot expone `POST /twilio/delivery_status` (Twilio lo llama por el `status_callback` que Chatwoot pone en cada envío). Estados aceptados: `sent`, `delivered`, `read`, `failed`, `undelivered` (este último se guarda como `failed`). Solo avanza hacia adelante, salvo `failed`, que entra y sale siempre (`Messages::StatusUpdateService`).

Probado con la secuencia `sent → delivered → read` y con `failed` (63016) y `undelivered` (63024):

- Por **cada** cambio el Agent Bot recibe `message_updated` con el `status` nuevo en `conversation.messages[]` (`sent`, `delivered`, `read`, `failed`) y el `source_id` (el `MessageSid` de Twilio).
- El error viaja en `content_attributes.external_error` (`"63016 - Fuera de la ventana de 24 h"` si Twilio manda `ErrorMessage`; `"Error code: 63024"` si solo manda `ErrorCode`). El código de error por sí solo **no** llega como campo aparte: hay que extraerlo del texto.
- El bot también recibe `message_created` de los salientes (propios y de asesores); el parser actual ya los ignora.

Fuente para N7: **evento de Chatwoot (`message_updated`)**, detrás de una interfaz `FuenteEstadosEntrega`, para poder cambiar a callback directo de Twilio sin tocar el resto.

## Hallazgos que afectan invariantes

**H1. Chatwoot no valida `X-Twilio-Signature` (invariante 9).** `grep` de `RequestValidator` / `X-Twilio-Signature` en `app`, `lib`, `config` y `enterprise` de la imagen 4.18.0: sin resultados. Todos los POST de las pruebas, sin firma, devolvieron 204 y se procesaron. Con la vía A pura, cualquiera que conozca la URL pública de Chatwoot puede inyectar mensajes entrantes, referrals y estados de entrega falsos.

**H2. Un reintento de Twilio duplica el mensaje en Chatwoot (invariante 8), y puede caer en otra conversación.** El mismo `MessageSid` enviado dos veces seguidas produjo dos mensajes (el índice de `messages.source_id` no es único). En la prueba, el segundo quedó además en la conversación de otro contacto: el mismo número en variante `+52…` sin el `1`, que Chatwoot trata como contacto distinto pero cuyos candidatos de teléfono cruza. Causa exacta no determinada; lo observado es que Chatwoot por sí solo no es idempotente ni confiable con las dos formas de teléfono mexicano.

**H3. `+521…` y `+52…` son contactos distintos en Chatwoot** (cada uno con su `contact_inbox`). La unificación depende de `normalizarTelefono()` en el backend (invariante 7); no se puede delegar en Chatwoot.

## Vías

| Vía | Veredicto |
|---|---|
| **A. Chatwoot reenvía los `Referral*` al Agent Bot** | **Viable.** Cumple P1 y P3. Necesita las mitigaciones M1 y M2. |
| B. Twilio Event Streams | No hace falta: A trae todo lo necesario. Sin prueba (requiere cuenta real). |
| C. El backend recibe el webhook de Twilio y lo reenvía a Chatwoot | Mejor control (firma, idempotencia, atribución) a costa de un salto más y de ser dueño del contrato entre Twilio y Chatwoot. Es la salida si M1 o M2 resultan impracticables. |

### Propuesta: A + M1 + M2

- **M1. Firma en el borde.** Un proxy delante de Chatwoot valida `X-Twilio-Signature` en `/twilio/callback` y `/twilio/delivery_status` y rechaza lo que no cuadre. Chatwoot no se expone directo a internet para esas rutas. Cumple el invariante 9 sin tocar Chatwoot.
- **M2. Idempotencia por identificador del proveedor.** La llave de idempotencia del mensaje entrante es el `source_id` del payload (el `MessageSid` de Twilio) y, solo si no hay, el id de Chatwoot (bandejas tipo API). Así el duplicado de H2 se descarta en el backend. El código actual (`src/captacion/entrante.ts`) usa el id de Chatwoot: cambia en N4.

La atribución entra al backend por una interfaz (`FuenteAtribucion`) con implementación simulada (N4). Elegir otra vía después cambia un adaptador y nada más.

## Diagrama (flujo propuesto)

```
Meta/WhatsApp ──► Twilio ──POST /twilio/callback (firmado)──► [proxy: valida firma] ──► Chatwoot
                                                                                           │ guarda content_attributes.referral
                                                                                           ▼
                                                                          Agent Bot: message_created (firmado, con referral)
                                                                                           ▼
                                                                        Backend: /webhooks/chatwoot
                                                                          · idempotencia por source_id (M2)
                                                                          · normalizarTelefono()
                                                                          · lead + conversación + atribución

Backend ─► MessagingProvider ─► API de Chatwoot ─► Twilio ─► contacto      (todo saliente pasa por Chatwoot)
Twilio ──POST /twilio/delivery_status──► [proxy] ─► Chatwoot ─► Agent Bot: message_updated ─► Backend (estados)
```

## Para Eduardo

1. Elegir vía (propongo A con M1 y M2).
2. Decidir si M1 (proxy validador) se construye en Fase 1 o queda como requisito de lanzamiento. Hoy nada de esto está expuesto a internet.
3. G0.3b sigue abierto: necesita Twilio real y un anuncio Click-to-WhatsApp. Los pendientes de P2 también.

## A7. El borde de Twilio (firma, reintentos y reenvío) — noche 2

Estado: **construido y probado con un token falso; sin Twilio real.** Resuelve F1-10 (invariante 9 para Twilio) **solo para los mensajes ENTRANTES** (ver «Lo que la auditoría obligó a decir», EA-02) y las mitigaciones M1 y M2 de arriba. La elección entre la vía A y la vía C **sigue abierta**: el borde sirve a las dos porque hace lo mismo que haría la C (recibir la llamada de Twilio) pero entrega a Chatwoot el cuerpo sin tocarlo, que es lo que necesita la A.

### Cómo queda cableado

```
Twilio ──POST /webhooks/twilio/entrantes (X-Twilio-Signature)──► backend
Twilio ──POST /webhooks/twilio/estados   (X-Twilio-Signature)──► backend
                                                                   │ 1. valida la firma sobre el cuerpo crudo (403 si no cuadra)
                                                                   │ 2. resuelve la organización por el número de la escuela
                                                                   │ 3. reclama el evento en `evento_twilio` (único por MessageSid, tipo y estado)
                                                                   │ 4. reenvía el cuerpo BYTE A BYTE a Chatwoot
                                                                   ▼
                              Chatwoot  /twilio/callback  y  /twilio/delivery_status
                                                                   │ guarda content_attributes.referral, etc.
                                                                   ▼
                              Agent Bot ──► /webhooks/chatwoot (firmado) ──► backend (igual que antes)
```

- **Rutas** (`src/http/app.ts`): `POST /webhooks/twilio/entrantes` y `POST /webhooks/twilio/estados`, cuerpo `application/x-www-form-urlencoded`, tope de 100 KB (413 vacío si lo pasa).
- **Firma** (`src/mensajeria/twilio/firma.ts`, sin el SDK de Twilio): HMAC-SHA1 en base64 de la URL pública completa + los parámetros ordenados por nombre concatenados `nombre+valor`, con el auth token como clave; comparación en tiempo constante; se acepta la URL con o sin `:443`/`:80`, como hace Twilio. La URL es `PUBLIC_BASE_URL` + ruta + query de la petición. **Sin `TWILIO_AUTH_TOKEN` o sin `PUBLIC_BASE_URL` se rechaza todo.** Rechazo = **403** sin cuerpo (el webhook de Chatwoot responde 401; Twilio documenta 403).
- **Reintentos y durabilidad** (invariante 8, EA-03): tabla `evento_twilio`, índice único parcial `(proveedor, tipo, id_mensaje, estado_mensaje)`; `id_mensaje` es el `MessageSid` y `estado_mensaje` el `MessageStatus` (vacío en entrantes). El evento se **guarda antes de reenviarlo, con su cuerpo y sus cabeceras** (se borran al reenviarlo con éxito: son datos de contacto). Un reintento de Twilio después de un reenvío exitoso se descarta (200). Si el reenvío falla, el evento queda `fallido` y se responde **502**. Un reclamo en curso responde 503; uno de más de 60 s se da por muerto. **Un barrido propio** (`reenviarPendientes`, una vez por minuto desde `src/ciclo.ts`) reenvía los `fallido` y los `procesando` vencidos con el mismo candado (comparación del contador `intentos`, no de fechas), con al menos 60 s entre intentos y hasta 10 (`MAX_INTENTOS_REENVIO`); después el evento queda `abandonado`, con su cuerpo guardado, una línea de log de nivel error y un contador (`alertas.eventosAbandonados`).
  **Garantía exacta:** «al menos una vez» *mientras la base conserve el evento*: no depende de que Twilio reintente un 5xx (por defecto no lo hace). **No** garantiza (a) el orden entre mensajes, (b) que no haya un duplicado cuando Chatwoot aceptó el mensaje pero la respuesta se perdió (Chatwoot no es idempotente, H2), (c) los eventos cuyo receptor no se resuelve (EA-05: se reenvían una vez, sin registro) ni (d) los `abandonado`, que esperan a una persona.
- **Reenvío** (`ReenviadorTwilio`, interfaz con fake y HTTP, probado contra un servidor HTTP local): solo un **2xx** es éxito. Una **redirección (3xx) es un fallo y no se sigue** (EA-04): `fetch` convertiría el POST en un GET sin cuerpo y, si el destino contestara 200, el mensaje se daría por reenviado habiéndose perdido (típico: `CHATWOOT_URL` en `http` detrás de un balanceador que redirige a `https`). El cuerpo viaja idéntico, con todos los `Referral*` (`ReferralSourceId`, `ReferralCtwaClid`, …). Cabeceras reenviadas: `Content-Type`, `X-Twilio-Signature` e `I-Twilio-Idempotency-Token`, más `X-Reenviado-Por`. **`From` no se normaliza**: la opción `TWILIO_NORMALIZAR_FROM_AL_REENVIAR=true` (apagada) lo lleva a la forma canónica con `normalizarNumeroWhatsapp()` solo en los entrantes; cambia el cuerpo, así que la firma original deja de valer río abajo.
- **Organización**: el número de la escuela, con `resolverBandejaPorNumero()` (`src/datos/sistema.ts`, ya existente: excepción documentada al scope, se usa para descubrir la organización). En un **entrante** es `To`; en un **estado de entrega** de lo que mandó la escuela `From` es la escuela y `To` el contacto, así que se prueba `From` y luego `To`. Si no se resuelve (número sin el prefijo `whatsapp:`, no dado de alta, canal desactivado) **el mensaje se reenvía igual a Chatwoot, sin registro** (sin organización no hay scope ni dónde guardar el evento), y queda una **alerta visible**: línea de log de nivel error `webhook_twilio_organizacion_desconocida` (con el número enmascarado) y un contador en el proceso (`alertas.organizacionDesconocida`). Si el reenvío falla, 502 para que Twilio pueda reintentar. Con la opción `reenviarSinOrganizacion` apagada (solo si no hay destino de reenvío) queda en 200 y la alerta. Sin `MessageSid` (ni `SmsMessageSid`/`SmsSid`): 400.
- **Respuesta a Twilio**: entrantes, 200 con `<Response/>` (TwiML vacío); estados, 200 vacío. Nunca se devuelve texto interno.
- **Variables de entorno** (`.env.example`): `TWILIO_AUTH_TOKEN`, `PUBLIC_BASE_URL`, `TWILIO_REENVIO_ENTRANTES_URL` y `TWILIO_REENVIO_ESTADOS_URL` (por defecto `$CHATWOOT_URL/twilio/callback` y `/twilio/delivery_status`), `TWILIO_NORMALIZAR_FROM_AL_REENVIAR`. Con el token puesto y `NODE_ENV=production`, sin destino de reenvío el backend no arranca.

### Qué se probó (token falso)

`src/mensajeria/twilio/firma.test.ts`, `borde.test.ts`, `src/http/twilio.test.ts` y `src/mensajeria/twilio/borde.itest.ts` (app HTTP real + Postgres + reenviador falso): firma válida pasa; inválida, ausente, de otro token, de otra URL, con el cuerpo o la query alterados, o sin token/URL configurados → 403 y nada se reenvía; un reintento (y seis simultáneos) llega una sola vez; cada `MessageStatus` de un `MessageSid` llega una vez; el cuerpo y los `Referral*` llegan idénticos byte a byte; `From` intacto con la opción apagada; número desconocido → 200 sin reenviar; reenvío fallido → 502 y el reintento sí llega; cuerpo de más de 100 KB → 413. Vector de la documentación de Twilio (token `12345`, URL `https://mycompany.com/myapp.php?foo=1&bar=2`) = `GvWf1cFY/Q7PnoempGyD5oXAezc=`, que lo recuerdo de su documentación y de las pruebas de su SDK; no pude contrastarlo en línea, pero coincide con el cálculo.

### Qué falta probar con Twilio real

1. Que la firma de un webhook REAL de WhatsApp cuadre con nuestra URL pública (esquema, puerto, barra final, query): la causa más común de 403 con Twilio real es una URL distinta a la configurada en la consola. Probar con `PUBLIC_BASE_URL` exacta.
2. Que Twilio mande `MessageSid` y `MessageStatus` en los nombres y mayúsculas esperados en WhatsApp, y que en los estados `From` sea el número de la escuela (supuesto del orden de resolución).
3. Qué hace Twilio ante un 502/503 (cuántas veces y cuándo reintenta; por defecto solo reintenta ante fallas de conexión, no ante un 5xx). **Ya no hace falta que reintente:** el barrido propio de EA-03 reenvía lo pendiente. Queda por ver que un reintento de Twilio y el barrido nunca se pisan con Twilio real (lo garantiza el candado y está probado con carrera forzada).
4. Que Chatwoot acepte el cuerpo reenviado tal cual por `/twilio/callback` y `/twilio/delivery_status` (se probó a mano en N2 con `curl`, no con el reenvío del backend) y que `Referral*` llegue a `content_attributes.referral`.
5. Con la vía A, que el canal de Twilio en Chatwoot tenga como webhook de Twilio la URL del backend (no la de Chatwoot) y que Chatwoot deje de ser alcanzable desde internet en esas rutas (puerto 3001 hoy publicado en `0.0.0.0` solo en la demo local).
6. Latencia añadida y comportamiento con el tope de 15 s de Twilio (el reenvío HTTP corta a 10 s).

## Lo que la auditoría de la etapa A obligó a decir (EA-02, EA-21, EA-22)

Auditoría: `docs/auditorias/etapa-A.md`. Lo que sigue corrige lo que A7 afirmaba de más.

### EA-02. En la vía A los estados de entrega NO pasan por el borde

Chatwoot 4.18.0 pone en **cada mensaje que manda por Twilio** un `status_callback` propio (`send_on_twilio_service.rb:9,55` → `twilio_delivery_status_index_url`, derivado de su `FRONTEND_URL`). Un `status_callback` por mensaje manda sobre el que se configure en la consola de Twilio. Por tanto, **con la vía A los estados de lo que manda el sistema (enviado, entregado, leído, fallido) llegan directo a `POST {FRONTEND_URL}/twilio/delivery_status` de Chatwoot, sin firma** (Chatwoot no valida `X-Twilio-Signature`, H1), y `/webhooks/twilio/estados` y la tabla `evento_twilio` para estados no se usan.

- **Qué queda cerrado y qué no.** F1-10 (invariante 9 para Twilio) queda cerrado **solo para los mensajes entrantes**: si la consola de Twilio apunta al backend y Chatwoot deja de ser alcanzable en `/twilio/callback`, nadie puede inyectar entrantes, referrals ni reintentos. **Para los estados NO está cerrado.** No debe marcarse como cerrado hasta que se decida entre las tres opciones.
- **Opciones** (decisión de Eduardo):
  - **(a) Vía C:** el backend manda con su propio `StatusCallback` (hacia `/webhooks/twilio/estados`, firmado). Es la que cierra el invariante 9 de punta a punta, a costa de ser dueño del envío y de que el asesor deje de ver en Chatwoot lo que no pasa por su API.
  - **(b) Proxy delante de Chatwoot** que reescriba `/twilio/delivery_status` hacia el backend (que firma, descarta reintentos y reenvía). Chatwoot sigue enviando; los estados pasan por el borde.
  - **(c) Aceptar** que los estados lleguen por Chatwoot y **proteger `/twilio/*` de Chatwoot con la red** (no expuesto a internet; solo Twilio vía el backend). El riesgo residual: quien alcance esa ruta interna puede falsear estados (un `fallido` falso crea una tarea; un `leído` falso solo cambia un estado).
- **Mientras no se decida:** el sistema funciona (los estados llegan al Agent Bot como `message_updated`, fuente `EstadosEntregaChatwoot`), pero el invariante 9 para estados descansa en la red. **Sube a gravedad ALTA en cuanto algo se exponga a internet.**

### EA-21. Una cuenta de Twilio por despliegue (pendiente)

El borde usa un solo `TWILIO_AUTH_TOKEN`: no admite una cuenta de Twilio (un `AccountSid` y su token) por organización. Es coherente con «hoy existe una organización». Con dos organizaciones con cuentas distintas haría falta resolver el token por el número receptor antes de validar la firma. Además el índice único de `evento_twilio` es global: un `MessageSid` de otra organización se trata como duplicado. **No se construye** (CLAUDE.md: no se construye el alta de organizaciones); queda como requisito de la primera organización adicional.

### EA-22. Asignación automática de Chatwoot (pendiente)

La asignación automática de agentes de Chatwoot solo se apaga en las bandejas que aprovisiona `scripts/preparar-chatwoot.ts` (la demo). Una bandeja de Twilio creada a mano en producción la trae encendida, y una asignación automática contaría como «una persona tomó la conversación» (`en_atencion_humana`). Pendiente: **verificar al arrancar** que las bandejas del sistema no tengan asignación automática (y avisar o apagarla), y probarlo con Twilio real y presencia real de un asesor. Hasta entonces: apagarla a mano en cada bandeja nueva.

### Excepción al invariante 4 (decisión para Eduardo, sin tocar CLAUDE.md)

`ReenviadorTwilioHttp` hace un `fetch` hacia el callback público de Chatwoot desde `src/mensajeria/`. No escribe a un contacto ni usa la API `/api/v1` de Chatwoot, pero queda fuera de `MessagingProvider` y de sus reglas (ventana, plantilla, horario, baja, frecuencia). Propuesta: dejar escrito en `CLAUDE.md` que la tubería de entrada de Twilio (`src/mensajeria/twilio/`) es una excepción acotada al invariante 4 (reenvía entrantes y estados, no inicia mensajes), o moverla detrás del provider. `check:capas` permite `fetch` y hosts solo dentro de `src/mensajeria/`.
