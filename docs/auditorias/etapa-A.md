# Auditoría adversarial de la etapa A (bloques A2–A8, noche 2)

Auditor: sesión con contexto nuevo, sin haber escrito el código. Fecha: 8 de octubre de 2026.
Objeto: rama `noche-2`, HEAD `c325aa6`, diff `bbd74c0..HEAD` (80 archivos, +6 801 / −269).
Método: copia limpia del commit (`git archive HEAD | tar -x -C <tmp>`), Postgres propio (`docker run --name auditoria-ea-pg … postgres:16-alpine`, puerto 5560), un proyecto compose aparte (`-p auditoria-etapa-a`, puertos 5571/3070/3071, imagen `auditoria-etapa-a-backend:local`), pruebas y mutaciones solo en copias. No se tocó el proyecto `inscripciones` (sus 6 contenedores y 3 volúmenes siguen como estaban), ni el `.env`, ni la base de la demo. Nada contra Twilio, Meta ni AWS reales. No se editó nada del repo salvo este archivo, no hay commits.

## 1. Resumen ejecutivo

- **Lo que se sostiene.** Desde cero y con volúmenes vacíos todo lo que la bitácora cita se reproduce: `npm ci` + `npm run validar` (169 tests, exit 0), `npm run test:int` (193 tests, exit 0; cuatro corridas seguidas sobre la misma base, también en Node 22.23.3), migraciones sobre base vacía y sobre base con datos de la noche 1 (sin pérdida, hashes idénticos), `migrate diff` sin diferencias, la demo con `docker compose -p auditoria-etapa-a up -d --build --wait` (48 s) y `npm run demo:contacto` (termina en `open`). Las cifras de cada bloque de la bitácora (127/119, 138/134, 138/142, 147/159, 148/181, 169/193) se reproducen commit por commit. Los tres flujos de A3 funcionan de punta a punta contra Chatwoot 4.18 real: aviso a los 30 min sin atención humana, asignación y primer mensaje del asesor pasan a `en_atencion_humana`. La firma de Twilio coincide con el SDK oficial en 4 000 casos aleatorios. Ningún test de la noche 1 se borró ni se debilitó sin motivo; no hay `skip`, `todo`, `only`, `@ts-ignore` ni `eslint-disable`.
- **Lo que no se sostiene.** Un hallazgo **ALTA** (EA-01): A3 reintrodujo en el barrido de 30 min el fallo de lead borrado que A2 había cerrado para el motor; un solo lead con `eliminado_en` y captura a medias hace fallar el barrido de 60 s para siempre y, como el motor corre después en el mismo tic, también se detienen el reenganche y la recuperación de huérfanos de F1-01 en todas las organizaciones. Once hallazgos MEDIA, entre ellos: los estados de entrega de Twilio no pasan por el borde firmado en la vía A (el propio Chatwoot fija el `status_callback` de cada mensaje), el "al menos una vez" del borde depende de que Twilio reintente un 5xx (por defecto no lo hace) y el reenviador HTTP real no tiene ninguna prueba (y trata una redirección como éxito).
- **Mutación.** 121 mutaciones reales sobre los arreglos de A2–A7 (más 3 controles): 101 las atrapa la suite; 20 sobreviven. De esas, 9 son equivalentes o redundantes y 11 son huecos reales de prueba (sección 5). Dos de los "HECHO" de A2 descansan en tests de concurrencia que no ejercen la carrera (F1-12 y el reclamo de la ejecución del motor): la mutación sobrevive.
- **Doble envío.** No encontré ninguna ruta que mande dos veces un mensaje al contacto con el código tal como está. Los fallos van hacia "no mandar", "mandar tarde" o "avisar de más".
- **Invariantes.** 10 cumplen (1, 2, 5, 6, 7, 8, 10, 11, 12, 13; el 1 y el 2 con una guarda esquivable) y 4 son parciales (3, 4, 9, 14); ninguno está roto de forma comprobada en el código actual. Detalle en la sección 7.

## 2. Tabla de hallazgos

Gravedad ALTA = rompe un invariante, duplica o pierde mensajes o datos, o fuga entre organizaciones (o, como aquí, anula una garantía que la bitácora da por cerrada con alcance global).

| ID | Gravedad | Archivo:línea | Resumen |
|---|---|---|---|
| EA-01 | **ALTA** | `src/captacion/espera.ts:60-90`, `src/captacion/resumen.ts:8`, `src/server.ts:38-44` | Un lead con `eliminado_en` y captura a medias hace fallar el barrido de 60 s para siempre: no corre el motor (reenganche, recuperación F1-01) en ninguna organización |
| EA-02 | MEDIA | `src/http/app.ts:120-155`; Chatwoot v4.18.0 `send_on_twilio_service.rb:9,55` | Los estados de entrega no pasan por `/webhooks/twilio/estados` en la vía A: Chatwoot manda su propio `status_callback` por mensaje y no valida firma. F1-10 "corregido" está sobrestimado |
| EA-03 | MEDIA | `src/mensajeria/twilio/borde.ts:139-195`, `prisma/schema.prisma:714` | "Al menos una vez" falso: el borde no guarda el cuerpo ni tiene barrido de reenvío; un reenvío fallido o un reclamo `procesando` huérfano se pierde si Twilio no reintenta el 5xx |
| EA-04 | MEDIA | `src/mensajeria/twilio/reenviador.ts:52-68` | El reenviador HTTP real no tiene pruebas y trata una redirección (POST→GET sin cuerpo→200) como reenvío exitoso: el mensaje se pierde y queda `reenviado` |
| EA-05 | MEDIA | `src/mensajeria/twilio/borde.ts:158-161` | Receptor no resuelto (número sin `whatsapp:` o no registrado): 200, nada se reenvía, solo un warning. Antes de A7 Chatwoot lo habría recibido |
| EA-06 | MEDIA | `src/mensajeria/provider.ts:186-189,198-201,377-406`, `src/captacion/espera.ts:90` | Si falla la NOTA del aviso de 30 min, la conversación pasa a `en_atencion_humana` sin que nadie la tome (contradice la decisión 1) |
| EA-07 | MEDIA | `src/captacion/espera.ts:56-106`, `src/automatizaciones/motor.ts:68-73,80-137,290-346`, `src/server.ts:38-44` | Sin aislamiento de fallos: un error en una conversación u organización aborta el barrido de todas las demás (reproducido también con una bandeja sin cuenta de Chatwoot) |
| EA-08 | MEDIA | `src/mensajeria/provider.itest.ts:61`, `src/automatizaciones/motor.itest.ts:149,546`, `src/mensajeria/entrega-fallida.itest.ts` | Tests de concurrencia vacuos: las mutaciones de F1-12, del reclamo de la ejecución, del recheck de F1-03 y de otros 3 candados sobreviven |
| EA-09 | MEDIA | `src/mensajeria/provider.ts:102-113`, `src/captacion/entrante.ts:84` | Un saliente del bot que quedó `pendiente` (muerte entre commit y `despachar`) sale días después, antes de la respuesta nueva: A2 solo cubrió el camino del motor |
| EA-10 | MEDIA | `src/mensajeria/reglas.ts:78-81,104` | Horario (14) y frecuencia siguen dependiendo de la etiqueta `origen` cuando hay ventana de servicio abierta: texto libre o plantilla con `origen` por defecto sale a las 03:00 |
| EA-11 | MEDIA | `src/mensajeria/provider.ts:141-156,261-279` | Conteo de frecuencia y envío no son atómicos (admitido): reproducido, tope 1 y salen 2. Además `enviando` no cuenta |
| EA-12 | MEDIA | `scripts/check-capas.ts:33-60`, `src/*/index.ts` (`deps.prisma`) | `check:capas` se esquiva con alias, multilínea, `deps["prisma"]`, `createRequire`, etc.; el arreglo de tipos que proponía F1-09 no se hizo |
| EA-13 | BAJA | `src/automatizaciones/motor.ts:62-64,164,293-297,335` | El reclamo guarda la hora de INICIO de la corrida, no la del reclamo: otro proceso puede marcar incierto un envío en curso (tarea falsa, ejecución `enviado` con `motivo_omision=envio_incierto`) |
| EA-14 | BAJA | `src/mensajeria/tareas.ts:23-38`, `provider.ts:347`, `motor.ts:210-218`, `entrante.ts:273` | `revision_manual` está sobrecargada: una pendiente por causa A se traga en silencio el aviso de la causa B (p. ej. envío incierto) |
| EA-15 | BAJA | `src/captacion/espera.ts:60-87` | El barrido no vuelve a comprobar el silencio dentro de la transacción: avisa y abre la conversación de un contacto que acaba de escribir |
| EA-16 | BAJA | `scripts/check-generico.ts:57` | Un byte NUL en la primera parte de un `.ts` hace que `check:generico` lo trate como binario y no lo escanee (el archivo corre normal en Node) |
| EA-17 | BAJA | `src/datos/prisma.ts:11-14`, bitácora A3 | Los itests corren contra cualquier `DATABASE_URL`; ya pasó una vez contra la base de la demo. No hay guarda de nombre de base |
| EA-18 | BAJA | `SPEC.md:117,141` | Las Fases 2 y 3 dicen "Construida en la sesión…", pero ningún bloque B–K está hecho |
| EA-19 | BAJA | `src/server.ts:49-66`, `docker-compose.yml` | El tope de cierre es 30 s pero `docker compose stop` mata a los 10 s; `finally { process.exit(0) }` oculta fallos de cierre |
| EA-20 | BAJA | `src/automatizaciones/motor.ts:301-304`, `src/mensajeria/twilio/borde.ts:132-135` | Los candados por comparación de timestamp exigen precisión de ms; una fila con µs (SQL `now()`) nunca se recupera (reproducido) |
| EA-21 | BAJA | `src/mensajeria/twilio/index.ts:30` | Un solo `TWILIO_AUTH_TOKEN` por despliegue: no admite una cuenta de Twilio por organización |
| EA-22 | BAJA | `scripts/preparar-chatwoot.ts:37`, `scripts/lib/chatwoot.ts:58-67` | La asignación automática de Chatwoot solo se apaga en bandejas aprovisionadas por script; una asignación automática en producción contaría como "persona tomó" |
| EA-23 | BAJA | `src/server.ts` (sin tests), `borde.ts:132`, `provider.ts:365`, `chatwoot/transporte.ts:121`, `check-capas.ts:57` | Huecos de prueba menores (sección 5) |

Conteo: 1 ALTA, 11 MEDIA, 11 BAJA.

## 3. Detalle de los hallazgos ALTA y MEDIA

### EA-01 (ALTA) Un lead borrado envenena el barrido para todas las organizaciones

Qué pasa.
- `barrerTiemposDeEspera` (`espera.ts:60-69`) elige las conversaciones a medias vencidas sin excluir `lead.eliminado_en`. Dentro de la transacción (`espera.ts:71-87`) hace `findFirst … include: { lead: true }` (el `include` no pasa por el scope, así que trae el lead borrado) y luego `resumenParaAsesor(tx, conv.lead.id, …)` (`espera.ts:84`), que hace `tx.lead.findFirstOrThrow` con el scope (`resumen.ts:8`): el lead está oculto y lanza.
- La transacción se revierte, `visible_a_asesores_en` no se marca y la conversación vuelve a ser candidata en el tic siguiente. No hay `try/catch` por conversación.
- `server.ts:38-44` encadena `await barrerTiemposDeEspera(…); await correrAutomatizaciones(…)`. Al lanzar la primera, la segunda no corre. `iniciarBarrido` solo registra `barrido_error` y repite al minuto.
- Efecto: sin reenganche, sin la recuperación de ejecuciones y envíos huérfanos de F1-01 (que A2 puso dentro de `correrAutomatizaciones`), sin conciliación de eventos de entrega, en todas las organizaciones, mientras exista el lead. Es el mismo defecto de F1-05 ("el entrante lanza error en bucle"), pero ahora en el barrido. A2 lo declaró corregido ("Lead borrado: el motor no programa ni ejecuta… `procesarEntrante` responde `ignorado`") porque corrigió motor y entrante; la espera es de A3 y nació sin el filtro.

Evidencia (BD limpia `aud_ev`, copia de HEAD; prueba en el Apéndice A):
```
$ DATABASE_URL=…/aud_ev node --test --test-concurrency=1 --test-name-pattern="lead-borrado-veneno" src/ae/ae4.itest.ts
EA-lead-borrado-veneno: tics que lanzaron = 3 /3 | Invalid `prisma.lead.findFirstOrThrow()` invocation: An operation failed because it depends on one or more re… | envío a medias de OTRA organización: enviando
```
(el envío `enviando` de otra organización, con 1 h de antigüedad, nunca se recupera en los 3 tics).

Corrección sugerida.
- Filtrar `lead: { eliminado_en: null }` en las dos consultas de `espera.ts` (`vencidas` y `sinAbrir`) y en el `findFirst` de la transacción.
- Envolver cada conversación (y cada organización) en `try/catch` con log y seguir (ver EA-07).
- En `server.ts` que el motor corra aunque la espera falle (`try { espera } finally { motor }` o dos barridos independientes).
- Un test que siembre un lead borrado con conversación a medias y exija que el motor siga recuperando.

### EA-02 (MEDIA) Los estados de Twilio saltan el borde en la vía A

El borde expone `/webhooks/twilio/estados` y la bitácora (A7) y `docs/DECISION-ATRIBUCION.md` dan por resuelto F1-10 (invariante 9 para Twilio). Pero en la vía A el mensaje saliente lo crea Chatwoot con la cuenta de Twilio, y Chatwoot pone **en cada mensaje** `status_callback = twilio_delivery_status_index_url` (su propia URL, derivada de `FRONTEND_URL`). Un `status_callback` por mensaje manda sobre el que se configure en la consola de Twilio, así que los estados irán directo a `POST {FRONTEND_URL}/twilio/delivery_status` de Chatwoot, sin firma, y la ruta `/webhooks/twilio/estados` y la tabla `evento_twilio` para estados no se usan.

Evidencia (imagen oficial de Chatwoot, solo lectura):
```
$ docker run --rm --entrypoint sh chatwoot/chatwoot:v4.18.0 -c 'cd /app; grep -n status_callback app/services/twilio/send_on_twilio_service.rb app/models/channel/twilio_sms.rb; grep -rn "RequestValidator\|X-Twilio-Signature" app lib config enterprise'
app/services/twilio/send_on_twilio_service.rb:9:    send_params[:status_callback] = channel.send(:twilio_delivery_status_index_url) …
app/services/twilio/send_on_twilio_service.rb:55:   send_params[:status_callback] = channel.send(:twilio_delivery_status_index_url) …
app/models/channel/twilio_sms.rb:66:    params[:status_callback] = twilio_delivery_status_index_url
(sin coincidencias de RequestValidator ni de X-Twilio-Signature)
```
Lo que sí funciona: los entrantes (si la consola de Twilio apunta al backend y Chatwoot deja de ser alcanzable en `/twilio/callback`). Probado de punta a punta contra el Chatwoot real del compose: firma válida 200 y `evento_twilio.reenviado`, reintento 200 sin reenviar, sin firma y token equivocado 403.
Corrección / decisión: el borde solo cubre estados si el `status_callback` apunta al backend (vía C, o un proxy que reescriba `/twilio/delivery_status` hacia el backend), o si se bloquea `/twilio/*` de Chatwoot desde internet y se acepta que los estados lleguen por el canal firmado del bot. Hay que decirlo en `DECISION-ATRIBUCION.md` (hoy el punto 5 de "Qué falta probar" solo menciona el webhook de entrantes) y no marcar F1-10 como cerrado hasta decidir. Sube a ALTA en cuanto algo se exponga a internet.

### EA-03 (MEDIA) El "al menos una vez" del borde no se cumple

`borde.ts` reclama el evento antes de reenviar y, si el reenvío falla, lo deja `fallido` y responde 502; la decisión documentada es "al menos una vez: un mensaje perdido es peor que uno repetido". Pero el reenvío solo se reintenta si **Twilio** vuelve a llamar, y Twilio por defecto no reintenta un 5xx (la propia sección A7 de `DECISION-ATRIBUCION.md` lo reconoce en el punto 3 de "Qué falta probar"). `evento_twilio` no guarda el cuerpo (`schema.prisma:714-736`, sin columna de cuerpo) y no existe ningún barrido que reenvíe eventos `fallido` o `procesando` con más de 60 s. Casos de pérdida: Chatwoot caído o en despliegue al llegar el mensaje (502 sin reintento); el proceso muere entre el reclamo y el reenvío (la fila queda `procesando` para siempre; un reintento de Twilio dentro de los 60 s recibe 503 y después ya no llega). Pierde justo el primer mensaje del anuncio. No es una regresión frente a "Twilio → Chatwoot directo" (Chatwoot caído también lo pierde), pero el borde añade un salto no durable y vende una garantía que no da.
Corrección: guardar el cuerpo (y cabeceras) en `evento_twilio` al reclamar, responder 200 solo tras guardarlo, y un barrido que reenvíe `fallido`/`procesando` vencidos (idempotente por el mismo candado); o, como mínimo, quitar la frase "al menos una vez" de la bitácora y de la documentación.

### EA-04 (MEDIA) El reenviador HTTP no tiene pruebas y toma una redirección por éxito

`ReenviadorTwilioHttp` (`reenviador.ts:45-68`) es lo que transporta el mensaje real y no tiene ningún test: `borde.itest.ts` y `twilio.test.ts` usan `ReenviadorTwilioFalso`, que solo guarda lo que recibe. La mutación `A7u` (el reenvío altera el cuerpo) sobrevive. Verifiqué a mano que los bytes (con `ReferralCtwaClid`, `+`, `=`, `&`, `ñ`) llegan idénticos con un servidor HTTP local. Pero `fetch` sigue redirecciones: con `CHATWOOT_URL=http://…` detrás de un balanceador que redirige a https (301/302), el POST se convierte en GET sin cuerpo y, si el destino responde 200, `res.ok` es verdadero:
```
reenviar() NO lanzó: el borde lo daría por reenviado
lo que vio el servidor: [ 'POST /twilio/callback cuerpo=24B', 'GET /login cuerpo=0B' ]
```
El evento queda `reenviado`, Twilio recibe 200 y el mensaje se pierde sin rastro.
Corrección: `redirect: "error"` (o `"manual"` y tratar 3xx como fallo), exigir 2xx/204 y probar la clase con un servidor HTTP local (bytes idénticos, cabeceras, 5xx, 3xx, tiempo agotado).

### EA-05 (MEDIA) Receptor no resuelto: se descarta con 200

`borde.ts:158-161`: si ni `To` (entrantes) ni `From`/`To` (estados) resuelve una bandeja, se loguea un warning y se responde 200 (TwiML vacío) **sin reenviar**. El número se busca como `whatsapp:+E164` exacto en `canal_whatsapp.numero_whatsapp`. Lo provoqué yo mismo: sembré el número como `+14155238886` (sin el prefijo `whatsapp:`) y un entrante con firma válida se descartó con 200 (`webhook_twilio_organizacion_desconocida`); con `whatsapp:+14155238886` pasó. Alta de un número nuevo, error de formato o canal desactivado = todos los mensajes de esa línea se pierden sin que Twilio ni nadie lo vea; antes de A7 Chatwoot los habría recibido sin depender de esta tabla.
Corrección: reenviar igual (sin organización no hay tarea que crear, pero el mensaje no se pierde) y alertar, o responder 5xx; como mínimo una alerta visible, no solo un `warn`.

### EA-06 (MEDIA) Una nota fallida convierte "visible" en "atendida"

`provider.ts:186-189` (incierto) y `198-201` (definitivo) marcan `pasar_a_asesor_pendiente` por **cualquier** envío fallido, incluida una `nota_interna`, y `pasarAAsesorSiToca` (`provider.ts:377-406`) la abre y la deja `en_atencion_humana`. En A3, `espera.ts:90` despacha la nota del aviso de 30 min: si Chatwoot falla o da tiempo agotado en ese momento, la conversación pasa a `en_atencion_humana` aunque nadie la haya tomado, y el bot y el reenganche se apagan. Es lo contrario de la decisión 1 ("visible no es atendido").
```
EA-nota-fallida (definitivo): estado=en_atencion_humana motivo=falla_envio pase_a_asesor interacciones=1
EA-nota-fallida (incierto):   estado=en_atencion_humana motivo=falla_envio pase_a_asesor interacciones=1
```
Corrección: que el fallo de una nota interna no marque `pasar_a_asesor_pendiente` (reintentar la nota o dejar tarea), o que `abrirParaAsesores`/la espera usen un camino que no pase a humano.

### EA-07 (MEDIA) Sin aislamiento de fallos entre conversaciones y organizaciones

`barrerTiemposDeEspera` y `correrAutomatizaciones` (`programarReenganches`, `recuperarAbandonadas`) iteran organizaciones y conversaciones sin `try/catch` por elemento (solo `ejecutarVencidas` lo tiene). Cualquier error persistente de un elemento detiene lo que viene después y, por el encadenamiento de `server.ts`, el motor entero. EA-01 es una instancia; otra, reproducida: una conversación cuya bandeja perdió `chatwoot_account_id` hace lanzar a `leerConversacion` ("no está aprovisionada") en `abrirParaAsesores` cada minuto.
```
EA-veneno: barridos que lanzaron = 3 /3 | La bandeja de la conversación … no está aprovisionada | mensaje de la otra organización quedó: enviando
```
También `siguienteHorarioValido` lanza si una automatización tiene `dias_permitidos` vacío. Hoy existe una organización; con dos, una configuración defectuosa de una detiene a la otra.
Corrección: `try/catch` por conversación y por organización con log y contador; alarma si un elemento falla N barridos seguidos.

### EA-08 (MEDIA) Pruebas de concurrencia que no ejercen la carrera

Las pruebas con `Promise.all` de varias llamadas no garantizan intercalado: el cliente de Prisma ejecuta la lectura y el primer reclamo de una llamada antes de empezar la siguiente. Mutaciones que sobreviven (la suite pasa con el candado quitado):
- `provider.ts:120` (`if (reclamo.count === 0) continue;`): la bitácora de A2 dice "F1-12 corregido… verificado por mutación en la auditoría". El código es correcto, pero el test `provider.itest.ts:61` (tres `despachar` simultáneos) pasa con el candado quitado (6 corridas seguidas, `reclamo.count 1` impreso una sola vez: las otras dos llamadas ya no veían el pendiente).
- `motor.ts:166` (`if (reclamo.count !== 1) continue;`): `motor.itest.ts:149` y `:546` (tres motores) pasan sin el candado.
- `espera.ts:78` (`visible_a_asesores_en: null` en el `updateMany`), `estados.ts:179` (recheck de la carrera de F1-03, "× 25 vueltas"), `estados.ts:121` (escritura condicional al estatus) y `borde.ts:132-135` (CAS del reclamo vencido).
Una versión que sí ejerce la carrera (retrasar la lectura de pendientes dentro de la extensión) pasa con el código original (1 envío) y falla con la mutación (3 envíos); está en el Apéndice B. Contraste: otros tests de concurrencia sí son efectivos. La versión "comprobar y luego actuar" de `reclamar` (mutación X10) la atrapa el test de 6 reintentos simultáneos, no reintentar la violación única del entrante (X11) la atrapa el de mensajes simultáneos de una conversación nueva, y quitar el control de versión de la toma (A3b) también falla.
Corrección: arreglar esos tests con una barrera real (retraso inyectado entre lectura y reclamo) y volver a verificar con la mutación; el plan pide test de concurrencia para lo que mueve dinero o cupo.

### EA-09 (MEDIA) Un saliente `pendiente` del bot sale tarde y antes que lo nuevo

A2 cubrió el camino del motor (mensaje ligado a la ejecución, cancelación en el `catch`, recuperación). Para el bot (`procesarEntrante`): el commit de la transacción deja los salientes `pendiente` y `despachar` corre después (`entrante.ts:84`). Si el proceso muere en medio, el pendiente queda; ninguna recuperación lo ve (solo recuperan `enviando` sin id y ejecuciones). `despachar` los toma por `secuencia`, sin caducidad:
```
EA-pendiente-viejo: envíos tras el mensaje nuevo: [ 'VIEJO: ¿cuál es tu nombre?', 'Mucho gusto. ¿Qué edad tiene Ana?' ]   (el viejo tenía 3 días)
```
Es la variante "mensaje pendiente que sale tarde y fuera de contexto" de F1-01, sin cerrar. Mitiga que Chatwoot reintente el webhook (no verificado).
Corrección: al despachar, bloquear (`bloqueado`/`obsoleto`) los pendientes con más de N minutos, o un barrido que los cancele y deje tarea.

### EA-10 (MEDIA) La etiqueta `origen` sigue decidiendo dentro de la ventana de servicio

F1-04 se corrigió para plantilla sin ventana abierta (`esIniciadoPorSistema`, `reglas.ts:78-81`). Queda: con la ventana abierta (el contacto escribió hace menos de 24 h), un saliente con `origen: "respuesta"` (el valor por defecto de `encolar`) no cuenta como iniciado por el sistema y se salta horario y tope de frecuencia, sea texto libre o plantilla. Un recordatorio que olvide la etiqueta sale a las 03:00:
```
EA-horario: [ [ 'enviado', undefined ] ]   (texto libre, origen por defecto, 03:00 hora local, ventana abierta)
```
Los bloques D3/D8/H6 (recordatorios, reenganche, cobranza) van a encolar muchos de estos. No hay forma de distinguir por contenido un recordatorio de una respuesta; la defensa robusta es de diseño: que `origen` sea obligatorio (sin valor por defecto) y que `respuesta` solo lo pueda crear el flujo que atiende un entrante (p. ej. exigir el id del mensaje entrante al que contesta).

### EA-11 (MEDIA) Frecuencia no atómica

Admitido en A6. Reproducido: tope 1, dos `despachar` simultáneos del mismo teléfono desde conversaciones distintas (dos verticales), ambos pasan:
```
EA-frecuencia: tope=1, enviados = 2 [ 'enviado' ] [ 'enviado' ]
```
Además el conteo (`provider.ts:261-279`) solo cuenta `enviado/entregado/leido` e inciertos: un mensaje en `enviando` (en vuelo) no cuenta. Hoy es alcanzable solo con más de una réplica (el motor corre en serie dentro de un proceso y es el único que inicia envíos con plantilla), por eso MEDIA y no ALTA; deja de ser teórico con la segunda réplica o con D3/H6. Corrección: candado consultivo por (organización, teléfono) en `src/datos/` (`pg_advisory_xact_lock`) o contar también `enviando`.

### EA-12 (MEDIA) `check:capas` sigue siendo una revisión de texto

A2 endureció las reglas (`generated/testutil` por ruta exacta, `pg`, `organizacion_id` en SQL, `twilio`, hosts, variables). Pero el arreglo de fondo que proponía F1-09 (que los módulos no reciban un `PrismaClient` crudo) no se hizo: `procesarEntrante`, `registrarEstadoEntrega`, `barrerTiemposDeEspera`, `correrAutomatizaciones`, `registrarTomaDeConversacion` y el borde reciben `deps.prisma: PrismaClient`. Siembras que **pasan** `check:capas` (copia `guard/`, exit 0):

| Siembra | Resultado |
|---|---|
| `const p = deps.prisma; return p.lead.findMany();` | PASA |
| `deps.prisma⏎ .lead⏎ .findMany()` (multilínea) | PASA |
| `deps['prisma'].lead.findMany()` | PASA |
| `const { lead } = deps.prisma; lead.findMany()` | PASA |
| `prisma.$transaction(async tx => tx.lead.findMany())` | PASA |
| `createRequire(import.meta.url)('twilio')` | PASA |
| `'https://api.' + 'twil' + 'io.com/x'` | PASA |
| ``process.env[`CHATWOOT_${x}`]`` | PASA |
| `fetch(url)` con URL en variable; Graph API de Meta | PASA |
| producción dentro de un `*.test.ts` | PASA |

Lo que sí atrapa (verificado): `import pg`, `deps.prisma.lead.findMany()` en una línea, `src/otro/generated/`, `src/otro/testutil/`, `.mts/.tsx/.js`, `$queryRaw` en cualquier forma, `organizacion_id=` en SQL. La bitácora documenta parte de estos límites ("residual: un cliente crudo pasado con otro nombre de variable no se ve"); el invariante 1 sigue descansando en que nadie lo haga. Corrección: exportar desde `src/datos` solo `conAlcance` y las funciones de `sistema.ts`, y que los módulos reciban un objeto con `{ listarOrganizaciones, resolver… }` en lugar de `PrismaClient`.

## 4. Detalle de los hallazgos BAJA

- **EA-13.** `motor.ts:62-64` toma `ahora` una vez al inicio y `ejecutarVencidas` escribe `ejecutado_en: ahora` (`:164`) al reclamar cada ejecución. Con una corrida larga (200 ejecuciones × hasta 4 s) o con réplicas, el reclamo luce más viejo de lo que es; un recuperador de otro proceso (`:293-297`, y `:335` que marca incierto cualquier `enviando` de la ejecución sin mirar su edad) lo resuelve mientras el envío sigue. Reproducido con relojes inyectados (A reclamó en R, su envío arranca en R+11 min; B corre en R+12): `B.recuperadas = 1`, el mensaje queda `fallido/envio_incierto` con `id_externo` (sí salió), la ejecución queda `enviado` con `motivo_omision=envio_incierto` y hay una tarea `revision_manual` falsa. No duplica el envío. Corrección: escribir la hora real del reclamo (`new Date()`/reloj del provider) y que el caso `enviando` use la edad del mensaje.
- **EA-14.** `asegurarTareaAsesor` ignora en silencio si ya hay una `revision_manual` pendiente en la conversación, aunque sea de otra causa. Reproducido: con una pendiente "CAUSA A" y un `enviando` viejo, `recuperarEnviosInciertos` recupera 1 pero queda 1 sola tarea (la de A). El aviso "pudo haber salido, no reenvíes" se pierde. Corrección: un tipo por causa (`envio_incierto`, `automatizacion_omitida`, `baja_pidio`) o una por (conversación, causa).
- **EA-15.** `espera.ts:60-69` lee las vencidas y las procesa una a una (cada una con `despachar` + `abrirParaAsesores`, hasta 4 s por llamada); la transacción no vuelve a exigir `ultimo_mensaje_entrante_en < corte`. Si el contacto responde en medio, igual se marca visible, se postea "dejó de contestar" y se abre. Reproducido (dos conversaciones, el contacto escribe en ambas mientras el barrido atiende la primera): `visible_a_asesores_en [true, true]`, 2 notas. Inofensivo para el contacto (el bot sigue), engañoso para el asesor.
- **EA-16.** `check-generico.ts:57` (`esBinario`): un `.ts` con un NUL en sus primeros 8 000 bytes no se escanea y Node lo ejecuta (comprobado con `// \0` + código). Siembra de prueba: `src/z.ts` con NUL y el término → exit 0. Otras siembras que pasan (residuales conocidos o inevitables): letras pegadas (`IDTERMINO`, `terminoka`), `'kar'+'ate'`, `k…`, un nombre de archivo con el término, términos no listados (`judo`, otras sucursales), y los `.sql` de `prisma/seed/` por diseño. Las que ahora sí fallan: `src/dist/`, `src/coverage/`, `termino2`, `2termino`, `idTermino` (camelCase), `get_termino_x`, `.mts/.css/.sh/.md/Dockerfile.x/.env`/`.github`, `prisma/seed/*.ts`, `prisma/migrations/*.sql`, acento. Siguen pasando, como dice la bitácora, `IDTERMINO` y `idterminoFoo` (letras pegadas).
- **EA-17.** Nada impide correr un `*.itest.ts` con la `DATABASE_URL` de la demo (la bitácora de A3 admite que ocurrió y dejó 8 organizaciones "Provider …" en `inscripciones`). Corrección: que `crearPrisma()` o un `before` global rechace bases cuyo nombre no termine en `_pruebas`/`_test` cuando `NODE_ENV=test`/en los itests.
- **EA-18.** `SPEC.md:117` y `:141` abren las Fases 2 y 3 con "Construida en la sesión…". A8 dice "detalladas", la bitácora marca B1–K9 PENDIENTE. Un lector (o Eduardo en frío) lo leerá como hecho. Debería decir "Planeada/Detallada".
- **EA-19.** `server.ts:53` fija 30 s para cerrar, pero compose/ECS por defecto matan a los 10 s/30 s; el cierre ordenado solo se garantiza si el barrido termina antes. Lo que quede lo cubre la recuperación (EA-01 aparte). `finally { process.exit(0) }` (`:63-65`) sale con 0 aunque `$disconnect` falle. Verificado: `docker stop` del backend en compose sale con código 0 en 0.3 s y registra `backend_cerrando`; `ash` ejecuta `node` como PID 1 en el `CMD`, así que sí recibe `SIGTERM`.
- **EA-20.** Los candados `updateMany … where ejecutado_en = <fecha leída>` (motor) y `reclamado_en = …` (borde) comparan un `Date` de JS (ms) con una columna de µs. Si una fila se escribe por SQL (`now()`), el candado nunca coincide y el recuperador la salta para siempre. Reproducido con datos sembrados por SQL (`ejecutado_en` con µs): no se recuperó hasta truncar a ms. Los datos reales de la noche 1 los escribió JavaScript, así que hoy no afecta; sí afectaría a un backfill.
- **EA-21.** El borde usa un único `TWILIO_AUTH_TOKEN` global (`twilio/index.ts:30`). Es coherente con "hoy existe una organización", pero no admite dos cuentas de Twilio (un `AccountSid` por organización) sin cambio. El índice único de `evento_twilio` es global; el `reclamar` trata la fila de otra organización como `duplicado` y la descarta (`borde.ts:122-127`).
- **EA-22.** `docs/BITACORA-NOCHE-2.md` (A3) reconoce que una asignación automática de Chatwoot contaría como "persona tomó" y por eso el aprovisionamiento la apaga, pero solo `preparar-chatwoot.ts` (demo) lo hace. Una bandeja de Twilio creada a mano en producción trae la asignación automática encendida por defecto. En mi instancia, con ella encendida y el asesor marcado en línea, el bot abrió la conversación y Chatwoot **no** la asignó (igual que dijo la bitácora), pero no pude probar con presencia real. Falta una verificación en el arranque.
- **EA-23.** Huecos de prueba menores, sin hallazgo propio: `server.ts` no tiene tests (probé a mano `SIGTERM`: sale limpio); el CAS de reclamo vencido del borde (`A7l`) no tiene prueba de concurrencia; `abrirParaAsesores` no comprueba que la conversación siga en `bot` (`A3m`); `clasificarFalloDeRed` con códigos mezclados (`A5k`); la regla `x-(twilio|chatwoot)-signature` de `check:capas` (`F1-09f`); el reenviador HTTP (EA-04).

## 5. Resultados de las mutaciones (prueba de mutación)

Arnés propio (`mut.mjs`): aplica la mutación a una copia, corre los 169 tests unitarios y los 193 de integración (base propia), restaura y compara. 124 corridas: 3 controles (`M00`, `X7`, `X9`: sobreviven como debe ser) y 121 mutaciones. **Atrapadas: 101. Sobreviven: 20.**

Por hallazgo corregido:

| Hallazgo | Mutaciones | Atrapadas | Sobreviven |
|---|---|---|---|
| F1-01 reclamos huérfanos / SIGTERM (`F1-01a…m`) | 13 | 10 | `F1-01f`, `F1-01i` (redundantes), `F1-01m` (**hueco real**, EA-08) |
| F1-12 reclamo por mensaje | 1 | 0 | `F1-12` (**el test es vacuo**, EA-08) |
| F1-02 / A3 toma, aviso, visible≠atendido, regla de atención humana (`A3a…m`, `INV6`, `X3-X5`, `X8`) | 18 | 15 | `A3e` (redundante con el fixture real), `A3i` (hueco: el test no ejerce la carrera), `A3m` (hueco) |
| F1-04 horario/frecuencia por contenido | 3 | 2 | `F1-04c` (equivalente: el enum de `origen` solo tiene 3 valores) |
| F1-05/06/07/11/13/14 | 11 | 11 | — |
| F1-08/09 guardas | 11 | 9 | `F1-08d` (NUL, EA-16), `F1-09f` (regla de firma sin test) |
| A4 baja que vuelve | 4 | 4 | — |
| A5 entrega fallida / incierto | 17 | 13 | `A5c` (recheck, **hueco**), `A5e` (CAS, **hueco**), `A5k` (hueco), `A5m` (equivalente: el índice único lo cubre) |
| A6 frecuencia | 13 | 12 | `A6e` (equivalente: el mensaje evaluado está `enviando`, no se cuenta) |
| Reglas de envío: ventana, horario, baja (`INV5`, `INV14-*`, `X1`, `X2`, `X6`) | 7 | 7 | — |
| A7 firma y borde | 21 | 16 | `A7e` (tiempo constante, no observable), `A7g`/`A7h` (guardas redundantes), `A7l` (CAS sin prueba de concurrencia), `A7u` (reenviador HTTP sin pruebas, EA-04) |
| Candados "comprobar y luego actuar" (`X10`, `X11`) | 2 | 2 | — |
| **Total** | **121** | **101** | **20** |

Solo lo que no se atrapa y es real: **EA-08** (F1-12, `F1-01m`, `A3i`, `A5c`, `A5e`, `A7l`), **EA-04** (`A7u`), **EA-16** (`F1-08d`), y menores (`A3m`, `A5k`, `F1-09f`).

Lo mejor protegido (cada mutación falla 3 o más tests): atención humana (`INV6`), ventana (`INV5`), horario (`INV14-*`), `sha256`/orden de parámetros en la firma, tope y frecuencia, `F1-01b/c` (recuperación).

Contraste que evita sobre-generalizar: las pruebas "simultáneas" **sí** ejercen la carrera en la toma (`A3b`), en el reclamo de eventos de Twilio (`X10`: comprobar-y-luego-actuar falla "reintentos simultáneos: uno solo reenvía") y en mensajes entrantes simultáneos (`X11`).

## 6. Resultados por punto pedido

### 6.1 Desde cero, tests y migraciones
```
git archive HEAD | tar -x -C ea/limpio && cd ea/limpio && npm ci                     # exit 0 (postinstall: prisma generate)
npm run validar                                                                       # exit 0 · tests 169 · pass 169 · fail 0 · check:generico 127 archivos · check:capas 38 archivos
DATABASE_URL_PRUEBAS=postgresql://aud:aud@localhost:5560/aud_pruebas npm run test:int # exit 0 · tests 193 · pass 193 · skipped 0 · todo 0
(4 corridas seguidas sobre la misma base)                                             # exit 0 las 4
docker run node:22 (npm ci + validar + test:int, Node v22.23.3)                       # exit 0 · 169 pass / 193 pass
```
Cifras por commit (copia por commit, `npm run validar` / `test:int`): A2 `dae9e9d` 127/119 · A3 `8f607f2` 138/134 · A4 `ebbf39c` 138/142 · A5 `ebb4fc9` 147/159 · A6 `b9913a3` 148/181 · A7 `ddf95c0` 169/193. Coinciden con la bitácora.

Migraciones nuevas (`20261009000000`…`20261009040000`):
- Base vacía: `migrate deploy` aplica las 12; `migrate diff --from-config-datasource --to-schema` → "No difference detected". Seeds `demo.sql`, `catalogo.sql`, `segunda-vertical.sql` aplican y `demo.sql` es idempotente (segunda corrida: `INSERT 0 0`).
- Base con datos de la noche 1: apliqué solo hasta `20261008130000_catalogo_fase2`, sembré 2 organizaciones, 6 leads (uno borrado, uno sin nombre, otro de otra organización con el mismo teléfono), 2 prospectos, 5 conversaciones (`bot` en tres pasos, `en_atencion_humana`, `opt_out`), 6 mensajes (`pendiente`, `enviando`, `fallido`, `enviado`, entrantes), 4 ejecuciones (programada, reclamada hace 1 h, enviada, omitida), 3 tareas, 1 consentimiento y la plantilla y la automatización del seed; hash md5 de cada tabla antes y después de aplicar las 5 migraciones nuevas: **idénticos** (organizacion, lead, prospecto, conversacion, mensaje, ejecucion, tarea, consentimiento, plantilla, automatizacion). Las nuevas columnas son nulas, las dos organizaciones reciben su fila de `configuracion_organizacion` (3/1/7), `migrate diff` → "No difference detected".
- Con esos datos viejos corrí `barrerTiemposDeEspera` y `correrAutomatizaciones` (transporte falso, reloj +20 min): la espera avisó 3 conversaciones a medias (nota + apertura, siguen en `bot`), el `enviando` colgado pasó a `fallido/envio_incierto` con tarea `revision_manual`, el pendiente viejo de una conversación sin ventana quedó `bloqueado/fuera_de_ventana`. La ejecución reclamada hace 1 h sin mensaje solo se recuperó tras truncar su `ejecutado_en` a ms (EA-20).
- Índices parciales y FK: `tarea_asesor_pendiente_key` (conversación, tipo, `mensaje_id IS NULL`) y `tarea_asesor_mensaje_tipo_key` (mensaje, tipo) existen; `evento_entrega_pendiente_unico_key` y `evento_twilio_unico_key` son parciales sobre `eliminado_en IS NULL`; las FK nuevas son compuestas con `organizacion_id` y `RESTRICT`; nulabilidad correcta; `CHECK` de topes (≥ 0, ventana 1–365). Ninguna migración nueva borra datos (`grep -iE "delete from|truncate|drop table|on delete (cascade|set)"` vacío).

### 6.2 Correcciones F1-01…F1-16
| F1 | ¿Corregido de verdad? |
|---|---|
| F1-01 | Sí, en el camino del motor y del mensaje `enviando` (10 de 13 mutaciones atrapadas, el resto redundantes salvo `F1-01m`). SIGTERM verificado en vivo (proceso suelto y `docker stop` en compose: `backend_cerrando`, exit 0). **Pendiente**: el pendiente del bot (EA-09), la hora de reclamo (EA-13) y que el barrido pueda quedar envenenado (EA-01/EA-07). |
| F1-02 | Sí con A3. E2E real: asignar la conversación en Chatwoot → `en_atencion_humana` (`via: asignacion`); mensaje del asesor → `via: mensaje`; abrirla el sistema no la toma. Mutaciones de A3 atrapadas (15/18). Ver EA-06 y EA-22. |
| F1-03 | Sí (A5): evento adelantado conciliado, `EnvioIncierto` sin reenvío; 13 de 17 mutaciones atrapadas; hueco en el recheck y en el CAS (EA-08). |
| F1-04 | Parcial: plantilla sin ventana ya no depende de la etiqueta; dentro de la ventana sí (EA-10). |
| F1-05 | Parcial: motor y entrante sí; el barrido de espera no (EA-01). |
| F1-06, F1-07, F1-11, F1-13, F1-14, F1-15, F1-16 | Sí (mutaciones atrapadas; `npm ci && npm run validar` sin generar a mano; nota de F1-16 presente). |
| F1-08, F1-09 | Mejoraron (tabla de EA-12 y EA-16), siguen esquivables. |
| F1-10 | Solo en parte (EA-02, EA-03). |
| F1-12 | Código correcto; el test es vacuo (EA-08). |
| F1-17, F1-18 | Pendientes, como dice la bitácora (`npm audit`: las mismas 4 altas, transitivas de la CLI de Prisma). |

### 6.3 Tests preexistentes modificados
`git diff bbd74c0..HEAD` sobre los archivos de test que ya existían (10): `check-capas.test.ts`, `check-generico.test.ts`, `alcance.itest.ts`, `reglas.test.ts` (solo adiciones); `app.test.ts` y `webhook.test.ts` (importes, firma del helper `deps`, campo `asignadaAPersona: false` agregado al resultado esperado, sin aserción borrada); `motor.itest.ts`, `baja-espera.itest.ts`, `entrante.itest.ts`, `estados.itest.ts` (abajo). Nombres de test de la noche 1 que ya no existen: 4 (los cuatro reemplazados, sin pérdida neta de tests: ningún archivo tiene menos casos que antes).

| Test | Cambio | Juicio |
|---|---|---|
| `estados.itest.ts` "mensaje o bandeja desconocidos…" | `mensaje_desconocido` → `guardado_para_conciliar` (2 aserciones), más una aserción nueva de dónde queda el evento | Legítimo (A5, F1-03) |
| `baja-espera.itest.ts` "la baja es de toda la organización" | Se borró `bloqueados.length >= 1 && every(motivo_bloqueo === "opt_out")`; ahora exige 0 salientes de cualquier tipo | Legítimo y no pierde cobertura: la mutación que quita `dado_de_baja` de `reglas.ts` (`X1`) la atrapan 2 tests unitarios y 1 de integración |
| `baja-espera.itest.ts` "tiempo de espera" | Se borraron `estado === en_atencion_humana`, `motivo_pase_asesor === sin_respuesta` y el conteo de `pase_a_asesor`; ahora `bot`, 0 interacciones, nota "Nadie la ha tomado", `hechas >= 1` → `=== 1`, idempotencia estricta | Legítimo: invierte el comportamiento por la decisión 1 de Eduardo (A3); más fuerte en lo demás |
| `entrante.itest.ts` "un asesor que toma la conversación…" | Se reemplazó por dos: `open` sin asesor sigue siendo del bot, y `asignadaAPersona` lo apaga | Legítimo (A3): la señal `open` ya no es válida |
| `motor.itest.ts` "frecuencia: un solo mensaje automático…" | Ahora fija `max_automaticos_por_dia = 1` en la configuración antes de afirmar lo mismo | Legítimo (decisión 4: por defecto 3 por día); el comportamiento por defecto lo cubre `frecuencia.itest.ts` |

Búsqueda de debilitadores en todo el repo: `grep -rnE "\.(skip|todo|only)\b|@ts-ignore|@ts-nocheck|eslint-disable"` → sin coincidencias; el único `@ts-expect-error` es la aserción de tipo de `alcance.itest.ts:106`. `eslint.config.js`, `tsconfig.json` y `.github/` sin cambios; `package.json` solo gana `postinstall`; `package-lock.json` sin cambios (0 dependencias nuevas).

### 6.4 Firma de Twilio (invariante 9), contra el algoritmo documentado
- **Algoritmo.** `firma.ts:21-29` es HMAC-SHA1 base64 de URL + `nombre+valor` ordenado, con valores repetidos ordenados y sin duplicados. Contrastado con `twilio@5.13.1` (instalado fuera del repo, en el espacio temporal): 3 000 casos aleatorios de `getExpectedTwilioSignature` (nombres repetidos, unicode, valores vacíos, `=`/`&`/`%`, URL con query y con puerto) → 0 diferencias; 1 000 cuerpos `application/x-www-form-urlencoded` reales (`URLSearchParams` → `parsearFormulario` → `verificarFirmaTwilio`) frente a `validateRequest` → 0 fallas. El vector de la documentación de Twilio (`12345` → `GvWf1cFY/Q7PnoempGyD5oXAezc=`) coincide con el SDK. Variantes `:443`/`:80`: igual que el SDK en los 4 casos (con y sin puerto por defecto; `:8443` distinto: rechaza en ambos).
- **Tiempo constante.** `iguales` usa `timingSafeEqual` con longitud igual y prueba todas las variantes sin salir antes (`firma.ts:42-55`); solo se filtra la longitud, que no es secreto.
- **Casos de borde** (servidor Express real con `crearApp`): sin firma 403; firma de otra ruta 403; query añadida a posteriori 403; query firmada 200; barra final firmada 200; cuerpo con `%` mal formado 403 (sin excepción); 200 KB sin firma 413; gzip que infla a 5 MB 413; gzip pequeño válido 200; `Content-Type: application/json` con firma del parseo de formulario 200; GET/PUT 404 (HTML por defecto de Express); parámetro `__proto__` 200 sin contaminar. La URL firmada sale de `PUBLIC_BASE_URL` + `req.originalUrl`, no de `Host`/`X-Forwarded-*`, así que un proxy no la altera; con ruta base distinta de la pública falla cerrado (403).
- **Idempotencia del borde, de punta a punta** con Chatwoot real: ver EA-02. Sin firma o con token equivocado: 403 y nada guardado.

### 6.5 Demo local (compose aparte)
```
docker compose -p auditoria-etapa-a -f docker-compose.yml -f override-auditoria.yml up -d --build --wait   # exit 0, 48 s (imágenes de Chatwoot ya en caché)
CHATWOOT_URL_HOST=http://localhost:3071 node --env-file=config/demo-local.env scripts/simular-contacto.ts     # → "Estado en Chatwoot: open (la conversación pasó a los asesores)"
--respuestas "Hola|Ana" + ultimo_mensaje_entrante_en −31 min → en ≤60 s: estado=bot, visible y abierta, Chatwoot: open sin asesor, nota privada "Nadie la ha tomado…"
POST /conversations/2/assignments (asesor)  → estado=en_atencion_humana, interaccion {"via":"asignacion","motivo":"persona_tomo_conversacion"}
POST /conversations/3/messages (asesor)     → estado=en_atencion_humana, interaccion {"via":"mensaje",…}
```
Al terminar: `down -v` solo de `auditoria-etapa-a`, imagen `auditoria-etapa-a-backend:local` borrada; `inscripciones-*` intacto. (El override de puertos y de imagen está fuera del repo.)

### 6.6 "HECHO" de la bitácora que no se reproducen como están escritos
| Afirmación | Resultado |
|---|---|
| A2: "F1-12 corregido; test de tres `despachar` simultáneos" | El código es correcto; el test no ejerce la carrera (EA-08) |
| A2: "F1-05 corregido" | Falso para el barrido de espera (EA-01) |
| A7: "resuelve F1-10 (invariante 9 para Twilio)" | Solo para entrantes; los estados no pasan por el borde en la vía A (EA-02) |
| A7: "Al menos una vez al reenviar" | No se cumple sin que Twilio reintente (EA-03) |
| A7: "los `Referral*` llegan intactos" | Cierto (verificado a mano con un servidor HTTP), pero sin prueba automática del reenviador real (EA-04) |
| A8: Fases 2 y 3 "Construida en la sesión" | No hay nada construido de B–K (EA-18) |
| Resto (cifras de tests, `check:*`, migraciones, E2E de A3, SIGTERM, `demo:contacto`, doc de Twilio de memoria) | Reproducido |

## 7. Los 14 invariantes

| # | Veredicto | Evidencia |
|---|---|---|
| 1 Aislamiento por organización | **Cumple** en el código; enforcement débil (EA-12) | Todo pasa por `conAlcance` (`src/datos/alcance.ts:60-103`); `$queryRaw*/$executeRaw*` ya no existen en el cliente con alcance, ni en el tipo ni en ejecución (`:43-69`, test `alcance.itest.ts:103`); las tablas nuevas (`configuracion_organizacion`, `evento_entrega_pendiente`, `evento_twilio`) llevan `organizacion_id`, `eliminado_en` y FK compuestas; las únicas consultas sin scope siguen siendo las de `src/datos/sistema.ts` (el borde usa `resolverBandejaPorNumero`, `sistema.ts:56`, ya documentada). Tests de aislamiento nuevos: `estados.itest.ts`, `configuracion.itest.ts`, `borde.itest.ts`, `entrega-fallida.itest.ts`. Reservas: `check:capas` esquivable; el índice de `evento_twilio` es global y una fila de otra organización se descarta en silencio (`borde.ts:122-127`) |
| 2 Cero términos de vertical | **Cumple hoy**; guarda parcial (EA-16) | `check:generico`: 127 archivos, 0 hallazgos; `grep -rniE "karate\|ballet\|baile\|twerk\|cintur\|cinta\|recital\|águilas\|centenario"` fuera de seeds, `docs/`, `CLAUDE.md`, `SPEC.md` y la lista de términos: vacío. 11 mutaciones de las dos guardas: 9 atrapadas |
| 3 Soft delete | **Cumple** en escritura; **parcial** en lectura (EA-01) | Sin `DELETE`/`TRUNCATE`/`ON DELETE CASCADE|SET` en las migraciones nuevas; `alcance.ts:75-77` rechaza `delete/deleteMany`; los eventos de entrega caducados se descartan con `eliminado_en` (`estados.ts:257-260`). El lead con `eliminado_en` rompe el barrido de espera |
| 4 Todo saliente por `MessagingProvider` | **Parcial** (cumple en la letra, ver nota) | Los únicos llamadores del transporte siguen en `provider.ts` (`:174-179`, `:367`, `:382`); `abrirParaAsesores` (A3) vive allí. El borde de Twilio (`twilio/reenviador.ts:56`) hace `fetch` hacia el callback público de Chatwoot desde `src/mensajeria/`: no escribe a un contacto, no es la API de Chatwoot (`/api/v1`) y la guarda lo permite por carpeta, pero queda fuera del provider y de sus reglas; conviene dejarlo escrito como excepción (decisión). `scripts/` sigue sin revisión (el nuevo `experimento-eventos-chatwoot.ts` manda mensajes como contacto, bot y asesor a una bandeja de pruebas) |
| 5 Dos ventanas | **Cumple** (con la mejora de EA-10 pendiente) | `ventana_gratis_hasta` solo se escribe al crear la conversación por anuncio (`entrante.ts:346`) y nada la lee para habilitar un envío (grep); fuera de ventana solo sale plantilla (`reglas.ts:101-102`); omisiones del motor y del provider crean tarea (F1-07: `motor.ts:210-221`, `provider.ts:166-168`); `INV5-fuera-ventana` y `X6` atrapadas. `F1-13` (máximo de la ventana) en `entrante.ts:129` |
| 6 `en_atencion_humana` bloquea | **Cumple** | Primera regla de `evaluarReglas` (`reglas.ts:88`), relectura por mensaje (`provider.ts:123`), la espera/aviso solo actúa en `bot` (`espera.ts:61`, `provider.ts:365`), la toma es idempotente y con versión (`toma.ts:36-61`); `INV6` falla 3 unitarias + 4 de integración; toma vs entrante simultáneo ×40: 40/40 terminan en humano. Reservas: EA-06 (una nota fallida marca humano sin toma) y EA-22; hay una ventana TOCTOU inevitable entre leer el estado y enviar |
| 7 Una sola función de teléfonos | **Cumple** | `normalizarTelefono`/`normalizarNumeroWhatsapp` (`src/lib/telefono.ts:21,57`) las usan `entrante.ts:301`, `sistema.ts:56`, `borde.ts:154` y `normalizarFromEnCuerpo` (`borde.ts:98`, apagado por defecto: `From` viaja sin tocar); ningún código nuevo formatea teléfonos. Nota operativa: `canal_whatsapp.numero_whatsapp` debe estar en la forma `whatsapp:+E164` (EA-05) |
| 8 Idempotencia | **Cumple** (con huecos de prueba, EA-08) | Webhook de Chatwoot: llave del proveedor (`entrante.ts:97-101`); borde: `evento_twilio` único por (proveedor, tipo, MessageSid, MessageStatus) (`40000/migration.sql`, `borde.ts:108-137`); automatizaciones: `createMany … skipDuplicates` (`motor.ts:129-132`) y reclamos de ejecución y de mensaje; tareas: índices parciales únicos (una por conversación y tipo; una por mensaje y tipo); eventos de entrega únicos. Ruta de doble envío: ninguna encontrada; pero la unicidad de reclamo no está bien probada (EA-08) |
| 9 Webhooks autenticados | **Parcial** | Chatwoot: HMAC-SHA256 + tolerancia 300 s (`webhook.ts:25-40`), sin cambios; toma y estados pasan tras la firma (`app.ts:64-104`). Twilio entrantes: firma correcta frente al SDK, 403 y sin tocar la base antes de validar (`app.ts:127-132`). Twilio estados: no cubierto en la vía A (EA-02) |
| 10 Determinismo | **Cumple** | Sin LLM; `maquina.ts` solo cambia un texto de la nota; reglas puras; dependencias de producción sin cambio (`package-lock.json` intacto) |
| 11 Adaptadores con fakes | **Cumple** | `ReenviadorTwilio` con `ReenviadorTwilioFalso` y `ReenviadorTwilioHttp`; `TransporteFalso` con `demoraMs/fallarSi/inciertoSi/alEnviar`; el loop completo y el borde corren sin credenciales; en producción con token y sin destino no arranca (`twilio/index.ts:43-45`, mutación `A7t` atrapada); el reenviador real sin pruebas (EA-04) |
| 12 Local primero | **Cumple** | Compose desde cero: 48 s, backend `healthy`, `demo:contacto` en `open`, A3 de punta a punta |
| 13 La familia es la entidad central | **Cumple** para lo construido | Sin tablas ni campos nuevos de contacto; `tarea_asesor`, `evento_*` y `configuracion_organizacion` no introducen atajos tipo `telefono_mama`; `lead` → `prospecto` intacto |
| 14 Horario de envío | **Parcial** | 09:00–20:00 local (`reglas.ts:169,222-225`), recorrer o descartar (`:244-252`), sin zona no sale (`:105`); `INV14-*` atrapadas (fin inclusivo, inicio 8, sin horario). Parcial por EA-10: dentro de la ventana de servicio el horario depende de la etiqueta. La nota y la apertura de A3 son internas (no cuentan) |

## 8. Decisiones de producto para Eduardo

1. **Estados de entrega de Twilio en la vía A (EA-02).** Opciones: (a) vía C (el backend manda con su propio `StatusCallback`); (b) proxy delante de Chatwoot que reescriba `/twilio/delivery_status` hacia el backend; (c) aceptar que los estados lleguen por Chatwoot y proteger `/twilio/*` de Chatwoot con la red. Mientras no se decida, F1-10 no debería quedar como cerrado.
2. **Durabilidad del borde (EA-03).** ¿Guardar el cuerpo y reenviar desde un barrido propio, o activar el reintento de Twilio ante 5xx y vivir con el riesgo? Depende también de la respuesta a la pregunta 1.
3. **Receptor desconocido (EA-05).** ¿Reenviar igual a Chatwoot y alertar, o responder 5xx, o seguir descartando con 200?
4. **Qué pasa si falla la nota del aviso de 30 min (EA-06).** ¿Reintentar la nota, dejar una tarea, o pasarla igual a humano? La implementación actual contradice la decisión 1.
5. **Cuánto es "demasiado tarde" para un saliente pendiente del bot (EA-09)** y si se cancela en silencio o con tarea.
6. **`origen` obligatorio (EA-10).** Propongo quitar el valor por defecto y exigir que lo que sea `respuesta` nazca del flujo de un entrante. Es un cambio de contrato para los bloques D3, D8 y H6.
7. **Candado por teléfono antes de la segunda réplica (EA-11).** Hoy el motor corre en serie; con dos réplicas la frecuencia se puede rebasar.
8. **Borrado de un lead (sigue de la lista de la primera auditoría).** Además de arreglar EA-01, decidir si borrar un lead cierra su conversación, la borra o la conserva, y si un lead borrado puede volver a escribir (hoy: se ignora con 200).
9. **Enforcement de los invariantes 1 y 2 (EA-12, EA-16).** ¿Basta una revisión de texto con límites documentados, o se hace la parte de tipos (módulos que no reciben `PrismaClient`)? Mi recomendación: hacerla antes de abrir la etapa B (autorización por rol).
10. **Una cuenta de Twilio o una por organización (EA-21).** Hoy un solo `TWILIO_AUTH_TOKEN`.
11. **Asignación automática de Chatwoot (EA-22).** Verificar con Twilio real y presencia real que no cuenta como "toma"; ¿el sistema debe comprobarlo al arrancar?
12. **Tareas.** Una `revision_manual` por causa (EA-14) y la bandeja de tareas de J3; cuando exista, decidir si `entrega_fallida` y `revision_manual` se agrupan por conversación.
13. **Reglas escritas.** Dejar en `CLAUDE.md` que la tubería de entrada de Twilio (`src/mensajeria/twilio/`) es una excepción acotada al invariante 4 (no escribe a contactos), o moverla detrás del provider.
14. **Redacción de `SPEC.md` (EA-18).** Cambiar "Construida" por "Planeada" en las Fases 2 y 3.

## Apéndice A. Prueba que reproduce EA-01

Vive solo en la copia temporal (`ea/exp/src/ae/ae4.itest.ts`); se corre con `DATABASE_URL=… node --test --test-concurrency=1 --test-name-pattern="lead-borrado-veneno" src/ae/ae4.itest.ts` sobre una base migrada. Resumen:

```ts
// Org B (creada antes): un mensaje `enviando` con 1 h de antigüedad que el motor debe recuperar.
const m = await dbB.mensaje.create({ data: altaConAlcance({ conversacion_id: rB.conversacionId!, direccion: "saliente", estatus: "enviando", cuerpo: "a medias", proveedor: "chatwoot" }) });
await dbB.mensaje.updateMany({ where: { id: m.id }, data: { actualizado_en: new Date(T0.getTime() - 3600_000) } });
// Org A: un lead a medias que luego se borra con soft delete.
const rA = await procesarEntrante({ prisma, mensajeria: prov(T0), reloj: () => T0 }, ev(A, conv, tel, "Hola"));
await dbA.lead.update({ where: { id: cA.lead_id }, data: { eliminado_en: new Date() } });
// Tres tics, exactamente como server.ts:
for (let minuto = 0; minuto < 3; minuto++) {
  const ahora = new Date(T0.getTime() + (40 + minuto) * 60_000);
  try {
    await barrerTiemposDeEspera({ prisma, mensajeria: prov(ahora), reloj: () => ahora });
    await correrAutomatizaciones({ prisma, mensajeria: prov(ahora), reloj: () => ahora });
  } catch (e) { errores.push((e as Error).message); }
}
// errores.length === 3 y el mensaje de la otra organización sigue `enviando`.
```

## Apéndice B. Prueba de F1-12 que sí ejerce la carrera

```ts
// Mismo escenario que provider.itest.ts:61, pero la lectura de pendientes devuelve y espera 150 ms:
const lento = db.$extends({ query: { mensaje: { async findMany({ args, query }) {
  const r = await query(args);
  if ((args.where as { estatus?: string })?.estatus === "pendiente") await new Promise((x) => setTimeout(x, 150));
  return r;
} } } });
await Promise.all([1, 2, 3].map(() => p.despachar(lento as never, conv.id)));
// código original: envíos de 'uno' = 1 (pasa) · con la mutación `if (reclamo.count === 0) continue;` quitada: 3 (falla)
```

## Apéndice C. Limpieza

Se bajó solo mi material: el contenedor `auditoria-ea-pg` (con sus bases `aud_pruebas*`, `aud_mig`, `aud_exp`, `aud_ev`, `aud_vacia`, `aud_n22`, `aud_c_*`) se eliminó con `docker rm -fv`; proyecto compose `auditoria-etapa-a` con `down -v`; imagen `auditoria-etapa-a-backend:local` y las imágenes `node:22` y `postgres:17` que descargué para esta auditoría. Los directorios temporales de la sesión (`ea/limpio`, `mut*`, `exp`, `guard`, `demoproj`, `twcheck`) quedan en el espacio temporal de la sesión, fuera del repo. El proyecto `inscripciones` (6 contenedores, 3 volúmenes, red) no se tocó. Queda un volumen anónimo huérfano de Docker (`6becf5b0…`, creado a las 06:25 UTC por mi primer contenedor de prueba, sin contenedor que lo use); no lo borré porque la herramienta me negó el permiso y no es de ningún proyecto compose: se puede quitar con `docker volume rm`.
