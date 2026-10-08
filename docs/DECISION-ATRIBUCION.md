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
