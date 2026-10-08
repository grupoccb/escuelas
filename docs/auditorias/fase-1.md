# Auditoría adversarial de la Fase 1 (noche 1)

Auditor: sesión con contexto nuevo, sin haber escrito el código. Fecha: 7–8 de octubre de 2026.
Objeto: rama `noche-2` (HEAD `f987191`), que contiene sin cambios de código los 26 commits de `noche-fase1`.
Alcance: lo que `docs/BITACORA-NOCHE.md` reclamó como HECHO (N0–N11).
Método: copia limpia del commit (`git archive noche-2`), Postgres y Compose en proyectos aparte (`auditoria-a1`, puertos 5543/5544/3010/3011), pruebas escritas solo en esa copia. No se editó nada del repo salvo este archivo. Nada contra Twilio, Meta ni AWS. Todo el material temporal se limpió al final.

## 1. Resumen ejecutivo

- **Lo que se sostiene.** Desde cero, con volúmenes vacíos y sin nada de mi máquina, todo lo que la bitácora cita se reproduce: `npm ci` + `prisma generate` + `npm run validar` (102 tests, exit 0), `npm run test:int` (94 tests, exit 0, también dos veces seguidas sobre la misma base y también en Node 22.23), `check:generico` (80 archivos), migraciones sobre base vacía y sobre base con datos viejos (sin pérdida), `docker compose up --build --wait` desde cero y `npm run demo:contacto` termina con la conversación en `open`. No se debilitó ningún test preexistente ni se saltó ninguno. Las consultas fuera del scope son solo las 4 de `src/datos/sistema.ts`, todas legítimas. No hay `DELETE` físico, ni FK en cascada, ni gate marcado.
- **Lo que no se sostiene.** Hay dos hallazgos ALTA. (1) Una ejecución de automatización o un mensaje reclamados cuyo proceso muere quedan huérfanos para siempre, sin recuperación ni alerta; y un fallo después de encolar deja un mensaje `pendiente` que sale después, mezclado con otra cosa, aunque la ejecución diga `fallido`. Un `SIGTERM` (cada despliegue) basta para provocarlo. (2) El invariante 6 solo se cumple si el sistema se entera de que hay un asesor: el estado `en_atencion_humana` solo se sincroniza cuando el contacto escribe. Un asesor que abre la conversación en Chatwoot no apaga las automatizaciones (reproducido contra Chatwoot real).
- **Lo que las guardas no prueban.** `check:generico` y `check:capas` pasan en verde pero se les cuela una violación de varias formas (carpeta `dist/`, `karate2`, `.mts`, `deps.prisma.lead.findMany()` fuera de `src/datos/`, etc.). Hoy no hay violaciones; la guarda no garantiza que no las haya mañana.
- **Mutación.** De 12 mutaciones a invariantes, 10 las atrapa la suite. Una es equivalente (borrado físico, lo bloquea otra rama). Una sobrevive de verdad: el reclamo por mensaje en `despachar` no tiene test de concurrencia (el código es correcto; verifiqué que un test lo atraparía).
- **Doble envío.** No encontré ninguna ruta que mande dos veces. Los fallos van todos hacia "no mandar" o "mandar tarde y fuera de contexto", no hacia duplicar.

## 2. Hallazgos

Gravedad ALTA = rompe un invariante, pierde o duplica mensajes o datos, o fuga entre organizaciones.

| ID | Gravedad | Archivo:línea | Resumen |
|---|---|---|---|
| F1-01 | ALTA | `src/automatizaciones/motor.ts:143-154`, `src/mensajeria/provider.ts:107-111,171-175`, `src/server.ts:42-47` | Reclamos huérfanos sin recuperación; mensaje `pendiente` que sale tarde y fuera de contexto |
| F1-02 | ALTA | `src/captacion/entrante.ts:125-133`, `src/http/app.ts:57-72`, `src/mensajeria/reglas.ts:64` | Invariante 6: el estado humano solo se sincroniza con un mensaje entrante |
| F1-03 | MEDIA | `src/mensajeria/estados.ts:75-77`, `src/mensajeria/chatwoot/transporte.ts:21,76` | Estado de entrega que llega antes del id externo se pierde; timeout de 4 s marca `fallido` algo que sí salió |
| F1-04 | MEDIA | `src/mensajeria/reglas.ts:80-84`, `src/mensajeria/provider.ts:128-129` | Horario (14) y frecuencia solo aplican si quien llama etiqueta `origen: "automatizacion"` |
| F1-05 | MEDIA | `src/captacion/entrante.ts:152,248-250`, `src/automatizaciones/motor.ts:74-91,169-172` | Lead con `eliminado_en`: el motor le sigue escribiendo y el entrante lanza error en bucle |
| F1-06 | MEDIA | `src/automatizaciones/motor.ts:158-216` | El reenganche no revalida: sale a quien contestó una hora antes |
| F1-07 | MEDIA | `src/automatizaciones/motor.ts:166,194,196,253` | Invariante 5: omisiones por falta de plantilla o variables no crean tarea al asesor |
| F1-08 | MEDIA | `scripts/check-generico.ts:25-38,63-68` | La guarda de términos deja pasar varias formas de colar uno |
| F1-09 | MEDIA | `scripts/check-capas.ts:28-52,59-70` | La guarda de capas no ve `pg`, ni `deps.prisma` crudo, ni carpetas `generated`/`testutil` anidadas |
| F1-10 | MEDIA | `src/http/app.ts`, `docker-compose.yml:121-122`, `docs/DECISION-ATRIBUCION.md` H1/M1 | Invariante 9 incumplido para Twilio: no existe validación de `X-Twilio-Signature` en ningún punto; Chatwoot no la hace |
| F1-11 | MEDIA | `src/mensajeria/index.ts:36-55` | Sin credenciales, el backend arranca con transporte falso y marca mensajes como `enviado` sin enviar nada |
| F1-12 | BAJA | `src/mensajeria/provider.ts:111` | Reclamo por mensaje sin test de concurrencia (mutación sobrevive) |
| F1-13 | BAJA | `src/captacion/entrante.ts:117` | Un mensaje entrante fuera de orden acorta la ventana de servicio |
| F1-14 | BAJA | `src/datos/alcance.ts` | `$queryRaw` sigue disponible en el cliente con alcance y ve todas las organizaciones |
| F1-15 | BAJA | `package.json`, `.gitignore` | `npm ci && npm run validar` falla hasta correr `prisma generate` |
| F1-16 | BAJA | `docs/BITACORA-NOCHE.md:142,152,158` | Bitácora contradice el cambio de 30 min a 72 h |
| F1-17 | BAJA | `config/demo-local.env`, `docker-compose.yml`, `Dockerfile` | Secretos de demo versionados, puertos en 0.0.0.0, contenedor como root |
| F1-18 | BAJA | `package-lock.json` | `npm audit`: 4 vulnerabilidades altas, todas transitivas de la CLI de Prisma |

### F1-01 (ALTA) Reclamos huérfanos y mensaje pendiente que sale fuera de contexto

Qué pasa.
- El motor reclama la ejecución poniendo `ejecutado_en` mientras `estatus` sigue `programado` (`motor.ts:143-147`). `leerVencidas` solo toma `ejecutado_en: null` (`motor.ts:133`) y `programarReenganches` no reprograma si la última ocurrencia no está `enviado` (`motor.ts:105`). Si el proceso muere entre el reclamo y el resultado, esa ejecución no se vuelve a tocar nunca, y ese lead tampoco recibirá otra ocurrencia.
- Lo mismo pasa un nivel abajo: `provider.ts:107-111` pasa el mensaje a `enviando` antes de mandarlo; si muere después del POST a Chatwoot y antes de `provider.ts:171`, queda `enviando` sin `id_externo`, así que ningún estado de entrega lo encontrará.
- `server.ts:42-47` responde a `SIGTERM` con `process.exit(0)` sin esperar el barrido que corre en `setInterval` (`server.ts:30-39`). Cada despliegue o reinicio es una forma de provocarlo. La bitácora (N8) lo reconoce ("es detectable. No añadí recuperación") pero no dice que no hay ninguna alarma ni consulta que lo detecte, ni que `SIGTERM` lo vuelve normal.
- Variante peor: si `despachar` lanza *después* de `encolar` (fallo de base, por ejemplo), el `catch` de `motor.ts:150-154` marca la ejecución `fallido/error_interno`, pero el mensaje de automatización queda `pendiente`. Sale en el siguiente `despachar` de esa conversación, que lo dispara cualquier mensaje entrante, y sale *antes* de la respuesta del bot porque se ordena por `secuencia`.

Evidencia reproducible (copia limpia, prueba del Apéndice A, bases en `aud_pruebas`):
```
F6b tras muerte: [ 'programado/ejecutado_en=true' ] [{"estatus":"enviando","id_externo":null}]
F6b motor a las 27h:  {"programadas":0,"enviadas":0,...}
F6b motor a las 50h:  {"programadas":0,"enviadas":0,...}
F6b motor a las 200h: {"programadas":0,"enviadas":0,...}
F6b estado final: [ 'programado/ejecutado_en=true' ]

F6a ejecucion: [ 'fallido/error_interno/ejecutado_en=...' ] mensajes pendientes: [{"origen":"automatizacion","estatus":"pendiente"}]
F6a envios tras contestar: [ 'plantilla:Hola Vertical Prueba', 'mensaje:Mucho gusto. ¿Qué edad tiene Sofia?' ]
```
(En F6b el "proceso que muere" es un transporte que nunca responde y una carrera de 1.5 s; en F6a es un `despachar` que lanza.)

Corrección sugerida.
- Reclamo con vencimiento: `ejecutado_en` más `reclamado_hasta` o un estatus `en_curso`; un barrido que devuelve a `programado` lo que lleva más de N minutos con mensaje todavía `pendiente`/sin `id_externo`, y que marca `fallido` + tarea para el asesor lo que ya salió o se ignora si salió.
- Para `enviando` sin `id_externo`: no reenviar (correcto para no duplicar) pero crear `tarea_asesor` y una consulta/alerta (`mensaje.estatus='enviando' AND actualizado_en < now()-interval '5 min'`).
- En el `catch` del motor, cancelar el mensaje encolado (`bloqueado`/`cancelado`) antes de marcar la ejecución.
- `SIGTERM`: dejar de programar, esperar al barrido en curso (promesa guardada) y recién entonces `prisma.$disconnect()`.

### F1-02 (ALTA) Invariante 6: `en_atencion_humana` no se entera de un asesor

Qué pasa. `provider.ts` bloquea todo si `conv.estado === 'en_atencion_humana'` (`reglas.ts:64`), pero esa columna solo se pone en dos sitios: el pase propio del bot y un mensaje entrante con `estadoConversacion === "open"` (`entrante.ts:130-133`). El webhook ignora los eventos de Chatwoot que no son mensajes (`app.ts:57-62`; `webhook.test.ts:46` fija que `conversation_status_changed` da `null`). Chatwoot 4.18 sí los emite al Agent Bot (`AgentBotListener` define `conversation_opened`, `conversation_status_changed`, `conversation_resolved`, `conversation_updated`). Consecuencia: si un asesor abre la conversación y el contacto no escribe, el reenganche (25 h) sale con plantilla. La suite lo cubre solo para el caso "el contacto escribe después" (`entrante.itest.ts:122`).

Evidencia (Compose limpio, Chatwoot real):
```
$ CHATWOOT_URL_HOST=http://localhost:3011 node --env-file=config/demo-local.env scripts/simular-contacto.ts --respuestas "Hola"
Estado en Chatwoot: pending            (conversación #2)
$ curl -X POST -H "api_access_token: demo-local-token-admin-0001" -d '{"status":"open"}' .../conversations/2/toggle_status
{"payload":{"success":true,"conversation_id":2,"current_status":"open",...}}
$ psql ... "select chatwoot_conversacion_id, estado from conversacion"
1 | en_atencion_humana
2 | bot                                 <- Chatwoot dice open, el backend dice bot
$ docker exec auditoria-a1-chatwoot-1 grep -n "def " app/listeners/agent_bot_listener.rb
conversation_resolved / conversation_opened / conversation_status_changed / conversation_updated / message_created ...
```
El motor selecciona precisamente `estado: "bot"` (`motor.ts:76`), así que esa conversación sigue siendo candidata.

Corrección sugerida. Manejar `conversation_opened` / `conversation_status_changed` (a `open` → `en_atencion_humana`, con la misma versión optimista) y `conversation_resolved` (decidir qué estado queda, ver decisiones). Además, antes de despachar algo automático, preguntar el estado a Chatwoot (barato, una llamada) o aceptar que lo automático se haga solo sobre conversaciones sincronizadas hace menos de N minutos.

### F1-03 (MEDIA) Estado de entrega perdido

- `registrarEstadoEntrega` devuelve `mensaje_desconocido` (`estados.ts:75-77`) cuando el evento llega antes de que el provider guarde `id_externo` (`provider.ts:171-175`). `app.ts:66` responde 200, así que Chatwoot no reintenta: el estado se pierde para siempre. La bitácora (N7) lo acepta con el argumento "órdenes de magnitud", sin medirlo. En el Compose limpio no apareció ningún `estado_entrega_mensaje_desconocido` (0 en el log), pero ese transporte (bandeja API) no emite `message_updated` de salientes; no pude medirlo con Twilio real.
- Variante realista: `TransporteChatwoot` tiene timeout de 4 s (`transporte.ts:21,76`). Si Chatwoot crea el mensaje y la respuesta se tarda más, el provider lo marca `fallido` sin `id_externo` (`provider.ts:154-167`) y pasa la conversación a un asesor, aunque el contacto lo recibió; y el `delivered`/`failed` posterior tampoco lo encuentra.
- Evidencia (prueba F6c): un transporte que, dentro de `enviarPlantilla`, entrega un `fallido 63016` antes de devolver el id:
```
F6c resultado del evento: mensaje_desconocido | mensaje final: {"estatus":"enviado","error":null,"error_codigo":null}
```
- Corrección: guardar el evento sin mensaje (tabla de eventos huérfanos con reintento al guardar `id_externo`), o hacer que el provider concilie por `id_proveedor`/hora; devolver 202/500 en lugar de 200 mientras el mensaje esté `enviando`.

### F1-04 (MEDIA) Horario y frecuencia dependen de una etiqueta

`evaluarReglas` solo aplica horario y frecuencia si `origen === "automatizacion"` (`reglas.ts:80-84`; `provider.ts:128-129`). El invariante 14 habla de "mensaje iniciado por el sistema", no de una etiqueta; cualquier llamador futuro (campaña, recordatorio) que use el `origen` por defecto (`respuesta`) con una plantilla evita ambas reglas. Reproducido: dos plantillas con `origen` por defecto, a las 03:00 hora local y con ventana vencida, salen las dos:
```
F9a: ["enviado:","enviado:"] envios [ 'plantilla', 'plantilla' ]
```
Hoy ningún código de producción lo hace; es latente, pero es justo la clase de regla que el invariante 4 dice que no depende del llamador. Corrección: derivar "iniciado por el sistema" de la ventana (no hay mensaje entrante vigente que se esté contestando) o de que lleve plantilla, no de la etiqueta; y un test que lo fije.

### F1-05 (MEDIA) Soft delete no se propaga por relaciones

`alcance.ts` documenta que `include` y filtros anidados no pasan por la extensión. Efecto real en una conversación viva cuyo lead tiene `eliminado_en`:
- El motor le programa y le manda el reenganche (`motor.ts:74-91` filtra `conversacion` por `lead: {…}` sin `eliminado_en`; `motor.ts:169-172` incluye el lead borrado).
- Un mensaje entrante encuentra la conversación con el lead borrado (`entrante.ts:248-250`) y `tx.lead.update` (`entrante.ts:152`) lanza "No record was found for an update" → 500 → Chatwoot reintenta sin fin y el contacto queda sin bot.
```
F4 lead borrado -> motor: {"programadas":1,"enviadas":1,...} envios [ 'plantilla' ]
✖ F4 ... Invalid `prisma.lead.update()` invocation ... entrante.ts:152:3
```
Hoy nada borra leads, pero es el primer lugar donde "derecho al olvido" o un borrado manual se vuelve incidente. Corrección: al borrar un lead, borrar o cerrar su conversación; que motor y entrante traten un lead borrado como "ignorar con 200"; test.

### F1-06 (MEDIA) El reenganche no revalida

`ejecutarUna` (`motor.ts:158-216`) no vuelve a comprobar que el contacto siga callado. Con la ejecución programada a las 09:00 (por el horario) y un mensaje del contacto a las 08:00 que lo deja en captura incompleta (`estado: bot`), el reenganche sale igual a las 09:05:
```
F10 programada: ... ['2026-10-10T15:00:00.000Z']
F10 tras contestar a las 08:00 y correr a las 09:05: {"enviadas":1} envios: ['mensaje','mensaje','mensaje','plantilla']
```
Corrección: antes de encolar, exigir `ultimo_mensaje_entrante_en <= ahora - offset` (misma condición que al programar) y omitir con `contacto_respondio` si no.

### F1-07 (MEDIA) Invariante 5: omisiones sin tarea

"Si no hay plantilla apta, no se manda y se crea tarea para el asesor." El provider lo cumple para `plantilla_no_apta`/`fuera_de_ventana` (`provider.ts:140-142`). Pero el motor omite sin tarea cuando la automatización no tiene plantilla (`motor.ts:166`), o cuando faltan/sobran variables (`motor.ts:194,196,253`); el test lo fija solo como omisión (`motor.itest.ts:293-295`). No lo marco ALTA porque el resultado (no mandar) es el correcto y el caso es de configuración; falta solo el aviso a una persona.

### F1-08 (MEDIA) `check:generico` se puede esquivar

Probado sembrando `'karate'` en una copia; el control (`src/z.ts`) falla como debe. No fallan:

| Siembra | Resultado |
|---|---|
| `src/dist/z.ts` o `src/coverage/z.ts` | PASA (`CARPETAS_EXCLUIDAS` ignora esos nombres a cualquier profundidad, `check-generico.ts:33`; `dist` ni siquiera está en `.gitignore`) |
| `'karate2'`, `'karateka'`, `IDKARATE` | PASA (bordes de dígito/letra y camelCase solo con minúscula previa, `check-generico.ts:63-68`) |
| `src/z.mts`, `.css`, `.sh`, `.md`, `.csv`, `Dockerfile*` | PASA (lista de extensiones, `:35-38`) |
| `.env` en la raíz | PASA (`extname(".env")` es vacío; la extensión `.env` añadida en N3 solo cubre `*.env` como `config/demo-local.env`) |
| `prisma/seed/z.ts` | PASA (la carpeta entera está excluida; vale para SQL pero permite un `.ts` con lógica) |
| `'kara'+'te'`, `'karate'`, término partido en dos líneas | PASA (inevitable; aceptable) |
| Verticales no listadas (`judo`, `Sur`) | PASA (la lista es de nombres de este cliente) |

Corrección: invertir la lógica de carpetas (lista blanca de las que se excluyen, con ruta exacta), escanear todos los archivos de texto no binarios, y tratar el dígito como borde de término. Los tests de la guarda (`check-generico.test.ts`) no cubren ninguno de estos casos.

### F1-09 (MEDIA) `check:capas` no demuestra el invariante 1

Control (`$queryRaw` en `src/captacion/z.ts`) falla. No fallan:
- `import pg from "pg"` + `new pg.Pool().query("select * from lead")` fuera de `src/datos/`.
- `export const f = (deps: any) => deps.prisma.lead.findMany();` — el `PrismaClient` crudo se pasa como `deps.prisma` a `procesarEntrante`, `registrarEstadoEntrega`, `barrerTiemposDeEspera` y `correrAutomatizaciones`, y nada impide usarlo sin scope (la guarda solo mira importar el cliente generado, `new PrismaClient`, `$queryRaw` y `organizacion_id:`).
- `src/foo/generated/` y `src/foo/testutil/` (`check-capas.ts:65` los excluye a cualquier profundidad), `*.mts`, y producción que viva en un `*.test.ts`.
- `organizacion_id = 1` dentro de un string SQL; `import("twilio")` dinámico; `fetch("https://messaging.twilio.com/…")`; una URL de Chatwoot armada sin `/api/v1/`.
- `scripts/` no se revisa (documentado en el encabezado).

Corrección: que `src/datos` exporte solo `conAlcance` y las 4 funciones de `sistema.ts`, y que los módulos reciban `{ listarOrganizaciones, resolver… }` en lugar de `PrismaClient`; así el tipo mismo impide la fuga. Excluir `generated`/`testutil` solo por ruta exacta (`src/generated`, `src/testutil`).

### F1-10 (MEDIA, bloqueante de lanzamiento) Invariante 9 para Twilio

`grep -rniE 'RequestValidator|X-Twilio-Signature'` en `app lib config enterprise` de la imagen de Chatwoot 4.18: sin resultados (reproduce H1). En este repo no existe ninguna validación de `X-Twilio-Signature` y la mitigación M1 (proxy en el borde) no está construida. Chatwoot queda publicado en `0.0.0.0:3001` (`docker-compose.yml:121-122`). La bitácora lo dice en su primera línea, así que no es un hallazgo oculto; lo anoto porque el invariante 9 dice "validan" y hoy ningún punto lo hace. Sube a ALTA en cuanto algo se exponga a internet. La parte de Chatwoot sí cumple (ver sección 3).

### F1-11 (MEDIA) Fallo silencioso al transporte falso

`mensajeriaDesdeEntorno` (`index.ts:36-55`) usa `TransporteFalso` si falta `CHATWOOT_URL` o `CHATWOOT_BOT_TOKEN`, con solo un `log.warn`. En producción (`Dockerfile` pone `NODE_ENV=production`) un secreto mal puesto produce un backend sano que acepta webhooks, registra mensajes `enviado` y no entrega nada. Corrección: con `NODE_ENV=production` y sin credenciales, no arrancar (o `/salud` en 503).

### Hallazgos BAJA, en breve

- **F1-12.** Mutación `if (reclamo.count === 0) continue;` → `// mutado` en `provider.ts:111`: 0 tests fallan (unit e int). Un test con tres `despachar` concurrentes sobre el mismo pendiente pasa con el código original (`envios de 'uno': 1`) y falla con la mutación (`2`). Falta agregarlo.
- **F1-13.** `entrante.ts:117` asigna `ventana_servicio_hasta` y `ultimo_mensaje_entrante_en` sin comparar con el valor actual. Un reintento atrasado de un mensaje anterior los mueve hacia atrás: `F7 ventana tras msg t+4h: 2026-10-09T20:00Z -> tras msg tardío de t+1h: 2026-10-09T17:00Z`. Usar el máximo.
- **F1-14.** `conAlcance(prisma, A).$queryRaw` devuelve filas de todas las organizaciones (`scope: ... ve [{"n":2}]`). Solo lo cubre el regex de `check:capas`. Omitir `$queryRaw*`/`$executeRaw*` del tipo `BaseDatos`.
- **F1-15.** `src/generated/` está en `.gitignore` y no hay `postinstall`/`prepare`: tras `npm ci`, `npm run validar` falla con decenas de TS2307/TS7006 hasta correr `npx prisma generate` (CI y Dockerfile ya lo hacen). Añadir `"postinstall": "prisma generate"` o ponerlo en `validar`.
- **F1-16.** `BITACORA-NOCHE.md` N5 sigue diciendo 30 min (líneas 142, 152, 158) y pide "confirmar los 30 min"; N8 los cambió a 72 h (`espera.ts:25`). La entrada de N5 debería actualizarse o apuntar a N8.
- **F1-17.** `config/demo-local.env` (tokens y secreto de webhook fijos), `SECRET_KEY_BASE` fijo y Postgres con `inscripciones/inscripciones` publicados en `0.0.0.0`; la imagen del backend corre como root y ejecuta `prisma migrate deploy` en cada arranque. Aceptable en local; impedir que ese `.env` llegue a AWS.
- **F1-18.** `npm audit`: 4 altas (`deepmerge-ts`, `mysql2`, dependencias de la CLI de `prisma`; MySQL no se usa). La imagen de producción incluye la CLI porque el `CMD` migra al arrancar. No usar `audit fix --force` (el plan lo prohíbe y baja Prisma a 6).

## 3. Invariantes, uno por uno

| # | Veredicto | Evidencia |
|---|---|---|
| 1 Aislamiento por organización | **Cumple** en el código; guarda débil (F1-09, F1-14) | Todo pasa por `conAlcance` (`alcance.ts:41-92`); las únicas consultas sin scope son `resolverBandejaChatwoot`, `resolverBandejaPorNumero`, `listarOrganizaciones`, `pingBaseDatos` (`sistema.ts:24,56,79,88`), todas para descubrir la organización o sin datos de negocio. Las 20 tablas de negocio tienen `organizacion_id` y todas, incluida `organizacion`, tienen `eliminado_en` (consulta a `information_schema`; `organizacion` es la raíz). 51 FK, todas `RESTRICT`. `alcance.itest.ts` (no-fuga) e `integridad.itest.ts` (23 referencias cruzadas rechazadas por la base) pasan. Mutación al filtro de `alcance.ts`: 76 tests fallan |
| 2 Cero términos de vertical | **Cumple hoy**; enforcement parcial (F1-08) | `check:generico` 0 hallazgos en 80 archivos; `grep -rniE` fuera de `docs/`, `prisma/seed/`, `config/terminos-prohibidos.txt`, `CLAUDE.md`, `SPEC.md` sin coincidencias en código |
| 3 Soft delete | **Parcial** | Cumple: ningún `DELETE`/`TRUNCATE` en `src`, `scripts`, migraciones ni seeds; `alcance.ts:57` rechaza `delete`/`deleteMany`; ninguna FK con cascada ni `SET NULL`; todas las tablas con `eliminado_en`. No cumple el espíritu en relaciones: F1-05 |
| 4 Todo saliente por `MessagingProvider` | **Parcial** | Cumple: los únicos llamadores del transporte están en `provider.ts:150-153,256`; el SDK de Twilio no existe en el repo. Las reglas de horario y frecuencia dependen del llamador (F1-04) |
| 5 Dos ventanas | **Parcial** | Cumple: dos columnas independientes (`schema.prisma`, `entrante.ts:117,300`), la gratis solo se escribe al crear la conversación y nada la lee para habilitar un envío; fuera de ventana solo sale plantilla (`reglas.ts:77-78`; mutación: 4 unit + 1 int fallan). Falta la tarea en omisiones del motor (F1-07) y F1-13 |
| 6 `en_atencion_humana` bloquea | **Parcial** | Cumple dentro del provider (`reglas.ts:64`, primera regla, ni notas pasan; se relee por mensaje en `provider.ts:114`; mutación: 3 unit + 3 int fallan). No cumple si el asesor entra sin que el contacto escriba (F1-02) |
| 7 Una función de teléfonos | **Cumple** | `normalizarTelefono` y su envoltorio `normalizarNumeroWhatsapp` en `lib/telefono.ts`; ningún otro código formatea; CHECK en `lead` y `consentimiento` rechaza `+521…` (integridad.itest). Mutación al colapso: 6 unit + 56 int fallan |
| 8 Idempotencia | **Parcial** | Cumple: llave del proveedor por mensaje entrante (`entrante.ts:92-96`, índice único), unicidad `(automatizacion_id, entidad_tipo, entidad_id, ocurrencia)`, reclamo de ejecución y de mensaje; no encontré doble envío. Mutación a la llave: 3 int fallan. No hay recuperación de reclamos (F1-01) y el reclamo por mensaje no tiene test (F1-12) |
| 9 Webhooks autenticados | **Parcial** | Chatwoot cumple: HMAC-SHA256 sobre `timestamp.cuerpo` crudo, tolerancia de 300 s, `timingSafeEqual` con longitud igual, sin secreto se rechaza todo (`webhook.ts:25-40`, `app.ts:43`); mutación a la firma: 2 unit fallan. Twilio no existe (F1-10) |
| 10 Determinismo | **Cumple** | `maquina.ts` es pura; cupo/reglas/ventanas son funciones puras; dependencias de producción: solo `express`, `pg`, `@prisma/*`, sin LLM |
| 11 Adaptadores con fakes | **Cumple**, con F1-11 | `TransporteConversaciones` + `TransporteFalso`, `AtribucionSimulada`, `FuenteEstadosEntrega`; el loop completo corre sin credenciales; las reales se activan por variables de entorno |
| 12 Local primero | **Cumple** | `docker compose -p auditoria-a1 up -d --build --wait` desde volúmenes vacíos: exit 0, backend `healthy`, 7 migraciones, 6/9/17 de catálogo, `npm run demo:contacto` → "Estado en Chatwoot: open" |
| 13 La familia es la entidad central | **Cumple** para lo construido | `lead` (adulto) → `prospecto` (1+); no hay `telefono_mama` ni equivalente; `tutor`/`alumno` no existen todavía (son de Fase 3, no se esperan) |
| 14 Horario de envío | **Parcial** | Cumple: 09:00–20:00 local (`reglas.ts:193-196`), recorrido y descarte (`recorrerODescartar`), sin zona horaria no sale, CHECK en la base (`automatizacion_horario_check`); mutación: 2 unit + 1 int fallan. Depende de la etiqueta `origen` (F1-04) |

## 4. Resultados de cada revisión pedida

### 4.1 Todo desde cero
```
git archive noche-2 | tar -x -C limpio && cd limpio && npm ci
npm run validar                          # antes de prisma generate: FALLA (TS2307, F1-15)
npx prisma generate && npm run validar   # exit 0 · ℹ tests 102 · pass 102 · fail 0 · check:generico 80 archivos
DATABASE_URL_PRUEBAS=postgresql://aud:aud@localhost:5543/aud_pruebas npm run test:int   # exit 0 · tests 94 · pass 94
(segunda corrida sobre la misma base)    # exit 0 · tests 94 · pass 94
docker run node:22-alpine ... validar + test:int                                      # exit 0 y exit 0 (Node v22.23.3; mi máquina tiene Node 25.6)
```
No encontré dependencias de estado previo salvo `prisma generate` (F1-15). `test:int` acumula organizaciones en la base de pruebas y sigue pasando con la base ya usada.

### 4.2 Tests preexistentes (`git diff main..noche-fase1`)
Archivos de test que ya existían en `main`: `app.test.ts`, `telefono.test.ts`, `check-generico.test.ts` (este último sin cambios). Ningún test borrado, ninguna aserción relajada, 0 usos de `skip`/`todo`/`only`/`@ts-ignore`/`eslint-disable` en todo el repo.

| Archivo | Cambio | Veredicto |
|---|---|---|
| `src/http/app.test.ts` | `get()` pasa a `pedir()`; `deps()` reemplaza al literal; los 2 tests de `/salud` conservan sus aserciones; +10 tests de webhook firmado | Legítimo |
| `src/lib/telefono.test.ts` | +import y +1 test (`normalizarNumeroWhatsapp`) | Legítimo |
| `scripts/check-generico.ts` | `.tmp` a carpetas excluidas (carpeta fuera de git); +extensiones `.rb`, `.env` (más estricto) | Legítimo, pero ver F1-08 |
| `eslint.config.js` | `.tmp/` a `ignores` | Legítimo |
| `.github/workflows/ci.yml` | Reemplaza el job `compose` por `demo`; ahora corre `validar`, `test:int` y `demo:contacto` | Más estricto |

Tests creados en `0c205e6` (demo 0.5, sin commit previo) y modificados después, revisados con `git diff 0c205e6 noche-fase1`: `entrante.itest.ts` (aserciones sobre `lead.nombre_prospecto` pasan a `lead.prospectos[0].nombre`; la nota al asesor añade contacto/origen), `alcance.itest.ts` (`nombre_prospecto` → `ctwa_clid` porque la columna se movió; `etapa_id` obligatorio), `webhook.test.ts` (la comparación fixture-vs-real ignora `crudo`, que por definición difiere), `reglas.test.ts` (solo imports). Todos legítimos y con la misma fuerza.

### 4.3 Guardas
Ver F1-08 y F1-09, con la lista completa de exclusiones leídas en `check-generico.ts:25-38` y `check-capas.ts:59-70`. Control positivo de ambas: sembrar `'karate'` / `$queryRaw` falla con exit 1.

### 4.5 Consultas fuera del scope
Lista completa de acceso sin scope (grep de `prisma.` y SQL crudo en `src`/`scripts`, sin tests ni `generated`):

| Dónde | Qué | Veredicto |
|---|---|---|
| `datos/sistema.ts:24` | `bandeja_chatwoot.findFirst` por (cuenta, bandeja) de Chatwoot | Legítima: es la forma de descubrir la organización; índice único global |
| `datos/sistema.ts:56` | `canal_whatsapp.findFirst` por número receptor | Legítima, mismo motivo; número único entre filas vivas |
| `datos/sistema.ts:79` | `organizacion.findMany` | Legítima: la usan el motor, la espera y los scripts para abrir un scope por organización |
| `datos/sistema.ts:88` | `$queryRaw SELECT 1` | Legítima: `/salud`, sin datos |
| `testutil/semilla.ts`, `*.itest.ts` | `prisma.*` y `pg` con SQL de seed | Legítima: siembran varias organizaciones a propósito; excluidos de `check:capas` |
| `scripts/test-int.ts` | `pg` para crear la base de pruebas | Legítima: `CREATE DATABASE`, nombre validado por regex |
| `scripts/preparar-chatwoot.ts`, `reporte-leads.ts` | Usan `listarOrganizaciones` + `conAlcance` | Legítima: pasan por el scope |

No encontré fugas entre organizaciones. Lo único que cruza organización es el `PrismaClient` crudo entregado a los módulos (F1-09) y `$queryRaw` (F1-14).

### 4.6 Ejecución reclamada a medias y estado de entrega adelantado
Ver F1-01 (huérfanos y mensaje pendiente tardío) y F1-03 (estado perdido). Pregunta explícita: ¿puede mandar dos veces? No: el reclamo condicional (`updateMany … WHERE estatus='programado'/'pendiente'`) es atómico y, si el proceso muere, ni la ejecución ni el mensaje se reintentan. ¿Se reintenta? No, nunca. ¿Queda huérfana para siempre? Sí.

### 4.7 Migraciones
- Base vacía: `prisma migrate deploy` aplica las 7; `prisma migrate diff --from-config-datasource --to-schema` → "No difference detected". Los seeds `demo.sql`, `catalogo.sql` y `segunda-vertical.sql` (aplicados por Compose y por los tests) pasan.
- Base con datos: apliqué solo `20261008024010_demo_local`, inserté 2 organizaciones, 3 verticales, 3 bandejas, 6 leads (mismo teléfono en dos verticales, uno borrado, uno sin nombre, uno solo con edad, uno de otra organización), 4 conversaciones en distintos estados y 4 mensajes, y apliqué las 6 restantes. Resultado: 6 leads (1 borrado, igual que antes), 4 conversaciones, 4 mensajes con su orden y estatus, cada lead con su etapa inicial, prospectos migrados (`Sofía/8`, `Luis`, `—/9`, `Ana/7` con `eliminado_en` conservado, `Beto/10`), las 3 bandejas con su canal y vertical. Sin pérdida de datos. Es una variante de lo que describe la bitácora (N3), no una copia de sus datos exactos.

### 4.8 Cada "HECHO" de la bitácora frente a sus comandos

| Afirmación | Resultado |
|---|---|
| `validar` 102 tests, `test:int` 94, `check:generico` 80 archivos | Reproducido exacto |
| Demo real desde volúmenes vacíos, bot hasta `open`, nota con datos | Reproducido (conversación #1 → `open`) |
| `reporte:leads` sobre la base de la demo | Reproducido (`(sin campaña) · … · Nuevo`, total correcto) |
| Seed de catálogo 6/9/17 | Reproducido en la base del Compose |
| N10: cero cambios de código | Reproducido: `git show --stat 2ad08ab` solo toca la bitácora, un seed y un test |
| Mutaciones del motor (reclamo, horario) | No re-ejecutadas literalmente; mis 12 mutaciones propias confirman que la suite las atrapa, salvo una (F1-12) |
| `getent hosts api.twilio.com` → 127.0.0.1; H1 (sin validador en Chatwoot) | Reproducidos en el Compose limpio (`127.0.0.1  api.twilio.com`; grep de `RequestValidator` sin resultados) |
| "No marqué ningún gate" | Verificado: `SPEC.md` commiteado en `noche-2` no tiene casillas `[x]` |
| "Dependencias nuevas: ninguna" | Verificado: `package.json` solo cambia `scripts` |
| "Guardas intactas" | Cierto en el sentido de no debilitadas; ver F1-08 sobre lo que nunca cubrieron |
| N2: P2 y reintento de Twilio en otra conversación (H2), bandeja Twilio falsa, contrato de plantillas (N8) | No reproducible aquí: dependen de restos locales de N2 en el Chatwoot del proyecto principal que no toqué; la bitácora no cita un comando |
| N8: "no se reintenta sola" una ejecución a medias | Cierto, pero la bitácora minimiza el alcance (F1-01) |
| N7: el estado adelantado "se pierde, en la práctica no ocurre" | Cierto que se pierde; "no ocurre" no está medido (F1-03) |

### 4.9 Extras
- **Webhooks (9).** Ver invariante 9. El cuerpo se firma crudo (`express.raw`) y se verifica antes de parsear; no hay endpoint de Twilio.
- **Soft delete (3).** Sin `DELETE` físico en código, seeds ni migraciones (`grep -iE 'delete from|truncate|drop table'`: solo `DROP CONSTRAINT` y dos `DROP COLUMN` (`bandeja_chatwoot.vertical_id` a `canal_whatsapp`, `lead.nombre_prospecto/edad_declarada` a `prospecto`, `migration.sql:301,325`), con los datos copiados antes (`:319`)).
- **Teléfonos (7).** Ningún otro código formatea; los `+521` de `scripts/simular-contacto.ts` y fixtures son entradas de prueba.
- **Cambios no míos.** `git status` muestra `SPEC.md` modificado sin commit (+42/-2) por otra sesión mientras audité; no lo toqué y mi auditoría lee solo lo commiteado en `noche-2`.

## 5. Decisiones de producto para Eduardo (no son defectos)

1. **Qué significa "un asesor atiende".** F1-02 pide sincronizar con Chatwoot. Decidir: ¿abrir la conversación basta o hace falta asignarla? ¿Al resolverla el bot vuelve a atender a ese contacto, o queda cerrado para siempre (hoy, `en_atencion_humana` no regresa)?
2. **Qué hacer con lo que queda a medias (F1-01).** Entregar "a lo sumo una vez" (hoy) más alarma y tarea al asesor, o "al menos una vez" con idempotencia propia (Chatwoot no ofrece llave de idempotencia). La opción conservadora es la primera.
3. **Alta tras baja.** Una baja deja la conversación en `opt_out` y el bot no vuelve a hablar (`entrante.ts:125`; `reglas.ts:70`). Insertar un `opt_in` a mano no basta: también hay que devolver la conversación a `bot`. Decidir la palabra de alta, quién la procesa, y si quien escribe después de darse de baja genera tarea. Ampliar las palabras de baja (`ALTO`, `PARAR`, `DETENER`) o dejar solo las cuatro del plan.
4. **Calendario del lead a medias** (25 h reenganche / 72 h asesor) y el tope de 1 automático por teléfono cada 24 h: ya los marcó la bitácora; confirmo que son constantes cambiables.
5. **Reenganche tras responder.** Con `max_intentos = 1`, quien responde después del reenganche y vuelve a callar nunca recibe otro. ¿Es lo que quieres, o una segunda ocurrencia desde el último mensaje?
6. **Falla de entrega (63016, etc.).** Si crea tarea al asesor o cancela algo (la bitácora lo deja abierto); sumar el caso del timeout de 4 s (F1-03).
7. **Borrado de un lead.** ¿Se cierra su conversación, se borra, o se conserva lo ya registrado? Define F1-05.
8. **Dónde vive M1 (firma de Twilio).** Antes de exponer algo a internet: proxy delante de Chatwoot o vía C (el backend recibe Twilio y reenvía). F1-10 sube a ALTA si algo se publica sin eso.
9. **Producción sin credenciales de mensajería.** ¿Falla al arrancar (recomendado) o corre con el falso? F1-11.
10. **Qué guarda es "la" guarda.** Si `check:generico` y `check:capas` van a ser la prueba formal de los invariantes 1 y 2, endurecerlas (F1-08, F1-09); si basta con revisión humana, bajar la expectativa y documentarlo.

## Apéndice A. Prueba usada para F1-01, F1-03, F1-04, F1-05, F1-13, F1-14

Vive solo en la copia temporal (`src/auditoria.itest.ts` dentro de una copia limpia del commit; no se agregó al repo). Se corre con `DATABASE_URL=… node --test --test-concurrency=1 src/auditoria.itest.ts` sobre una base migrada. Resumen de los escenarios, con las mismas variables de las pruebas existentes (`sembrarOrganizacion`, `MessagingProvider`, `TransporteFalso`, `correrAutomatizaciones`):

```ts
// F6b: el transporte nunca responde; "el proceso muere" tras 1.5 s; luego el motor a 27/50/200 h
const colgado = { enviarMensaje: () => new Promise(() => {}), enviarPlantilla: () => new Promise(() => {}),
                  enviarNotaInterna: () => new Promise(() => {}), abrirConversacion: async () => {} };
await Promise.race([correrAutomatizaciones({ prisma, mensajeria: new MessagingProvider({ transporte: colgado, reloj }), reloj, organizacionId }),
                    new Promise((r) => setTimeout(r, 1500))]);

// F6a: despachar lanza después de encolar
const rota = Object.create(buena) as MessagingProvider;
rota.despachar = async () => { throw new Error("caída de base simulada tras encolar"); };

// F6c: el estado llega dentro del envío, antes de que el provider guarde id_externo
enviarPlantilla: async () => { const id = "cw-" + randomInt(1e9);
  resultado = await registrarEstadoEntrega({ prisma }, { proveedor: "chatwoot", idExterno: id, idProveedor: "SM1",
    estado: "fallido", ocurrioEn: null, errorCodigo: 63016, errorTexto: "63016", bandeja: {…} }); return { idExterno: id }; }

// F9a: origen por defecto + plantilla, 03:00 local, ventana vencida
await prov.encolar(tx, convId, [{ tipo: "mensaje", cuerpo: "promo", plantilla: { id, variables: { "1": "x" } } }]);

// F4: soft-delete del lead y luego motor + entrante
await db.lead.update({ where: { id: conv.lead_id }, data: { eliminado_en: new Date() } });

// F7: dos entrantes con creadoEn t+4h y luego t+1h; comparar ventana_servicio_hasta
```
Las mutaciones se aplicaron con `sed` sobre la copia y se restauraron; `cmp` contra `git show noche-2:<archivo>` confirmó la restauración.

## Apéndice B. Limpieza

Se bajó solo `auditoria-a1` (`docker compose -p auditoria-a1 … down -v`) y se borró el contenedor `auditoria-a1-pg` con sus bases (`aud`, `aud_pruebas`, `aud_mig1`, `aud_n22`). El proyecto `inscripciones` (Postgres, Chatwoot, backend, sus volúmenes) no se tocó.
