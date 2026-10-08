# BITACORA-NOCHE-2.md

Sesión del 7 de octubre de 2026. Rama `noche-2` (desde `noche-fase1`). Plan: `docs/PLAN-NOCHE-2.md`.

| Bloque | Estado | Commit | Nota |
|---|---|---|---|
| A0 | HECHO | f987191 | Preparación |
| A1 | HECHO | ver sección | Auditoría de la primera sesión: 2 ALTA, 9 MEDIA, 7 BAJA |
| A2 | HECHO | ver sección | Correcciones de A1: las 2 ALTA (F1-02 cierra con A3) y 11 de los demás hallazgos |
| A3 | HECHO | ver sección | Lead a medias: visible a los 30 min sin marcar atención humana; una persona la toma por asignación o primer mensaje |
| A4 | PENDIENTE | | Baja que vuelve a escribir |
| A5 | PENDIENTE | | Entrega fallida |
| A6 | PENDIENTE | | Frecuencia |
| A7 | PENDIENTE | | Firma en el borde |
| A8 | PENDIENTE | | SPEC.md al día |
| B1 | PENDIENTE | | Usuarios y roles |
| B2 | PENDIENTE | | Autorización por rol y sucursal |
| B3 | PENDIENTE | | API base |
| B4 | PENDIENTE | | Datos sensibles |
| B5 | PENDIENTE | | Usuario y agente de Chatwoot |
| B6 | PENDIENTE | | Protección de rutas públicas |
| C1 | PENDIENTE | | Instructores y salones |
| C2 | PENDIENTE | | Precios versionados |
| C3 | PENDIENTE | | Promociones |
| C4 | PENDIENTE | | Catálogo de las tres verticales |
| C5 | PENDIENTE | | Cotizador determinista |
| C6 | PENDIENTE | | Varios programas para una edad |
| C7 | PENDIENTE | | Otra sucursal |
| C8 | PENDIENTE | | Cotización guardada y cotizador por WhatsApp |
| C9 | PENDIENTE | | Lista de espera |
| D1 | PENDIENTE | | Clase muestra: agendar, reprogramar, cancelar |
| D2 | PENDIENTE | | Aviso al maestro |
| D3 | PENDIENTE | | Recordatorios de 24 h y 2 h |
| D4 | PENDIENTE | | Asistió / no asistió y recuperación |
| D5 | PENDIENTE | | Registro del maestro |
| D6 | PENDIENTE | | Reglamento y autorización de imagen |
| D7 | PENDIENTE | | Embudo con historial |
| D8 | PENDIENTE | | Lead frío y promoción por vencer |
| E1 | PENDIENTE | | Landing pública por vertical |
| E2 | PENDIENTE | | Código de rastreo de WhatsApp |
| E3 | PENDIENTE | | Códigos QR |
| F1 | PENDIENTE | | Tutor, alumno y relación M:N |
| F2 | PENDIENTE | | Conversión en una transacción |
| F3 | PENDIENTE | | Inscripción |
| F4 | PENDIENTE | | Cupo real |
| F5 | PENDIENTE | | Cambio de grupo, congelar y baja |
| F6 | PENDIENTE | | Quién cierra la inscripción |
| F7 | PENDIENTE | | Hermanos |
| G1 | PENDIENTE | | Pase de lista |
| G2 | PENDIENTE | | Derivados de asistencia |
| G3 | PENDIENTE | | Progresión genérica |
| G4 | PENDIENTE | | Eventos y elegibilidad |
| G5 | PENDIENTE | | Expediente del alumno |
| H1 | PENDIENTE | | Cargos |
| H2 | PENDIENTE | | Pagos |
| H3 | PENDIENTE | | Estado de cuenta por familia |
| H4 | PENDIENTE | | Beneficios diferidos |
| H5 | PENDIENTE | | Productos y ventas |
| H6 | PENDIENTE | | Cobranza |
| H7 | PENDIENTE | | Cuadratura |
| I1 | PENDIENTE | | Reporte de clases muestra |
| I2 | PENDIENTE | | Costo por alumno inscrito por campaña |
| I3 | PENDIENTE | | Reporte ejecutivo |
| I4 | PENDIENTE | | Datos de demo |
| I5 | PENDIENTE | | Exportación a CSV |
| J1 | PENDIENTE | | Interfaz: base |
| J2 | PENDIENTE | | Interfaz: maestro en celular |
| J3 | PENDIENTE | | Interfaz: asesor |
| J4 | PENDIENTE | | Interfaz: conversión e inscripción |
| J5 | PENDIENTE | | Interfaz: recepción |
| J6 | PENDIENTE | | Interfaz: familia y expediente |
| J7 | PENDIENTE | | Interfaz: administración del catálogo |
| J8 | PENDIENTE | | Interfaz: mensajería y usuarios |
| J9 | PENDIENTE | | Interfaz: tableros |
| J10 | PENDIENTE | | Interfaz: recorridos en navegador |
| K1 | PENDIENTE | | Prueba de fuego total |
| K2 | PENDIENTE | | Concurrencia y ráfagas |
| K3 | PENDIENTE | | Revisión de seguridad |
| K4 | PENDIENTE | | Observabilidad |
| K5 | PENDIENTE | | Respaldo y restauración |
| K6 | PENDIENTE | | Infraestructura como código |
| K7 | PENDIENTE | | Documentación |
| K8 | PENDIENTE | | Demo guiada |
| K9 | PENDIENTE | | Auditoría final |

## A0. Preparación

**Qué se hizo**
- Rama `noche-2` creada desde `noche-fase1`. Esta bitácora con los 78 bloques. Commit `f987191`.

**Verificación (línea base)**
- `npm run validar` → exit 0 (102 tests). `npm run test:int` → exit 0 (94 tests).

**Decisiones que tomé**
- Las etapas se ejecutan con subagentes implementadores (un brief común con las convenciones del repo) y un subagente auditor distinto por etapa. Alternativa descartada: hacerlo todo en una sola conversación; el tope de turnos de la sesión no alcanza para 78 bloques.

**Para Eduardo**
- Nada.

## A1. Auditoría de la primera sesión

**Qué se hizo**
- Subagente con contexto nuevo, sin haber escrito el código, trabajó sobre una copia limpia del commit y proyectos de Docker aparte (`auditoria-a1`, ya bajado). Informe completo: `docs/auditorias/fase-1.md`.

**Resultado**
- Se reproduce desde cero: `validar` (102 tests), `test:int` (94 tests, también dos veces seguidas), migraciones sobre base vacía y con datos, `docker compose` y la demo. Ningún test preexistente debilitado.
- ALTA: **F1-01** reclamos huérfanos (ejecución del motor y mensaje `enviando`) sin recuperación, y mensaje `pendiente` que sale tarde si falla `despachar`; **F1-02** `en_atencion_humana` no se entera de un asesor que entra sin que el contacto escriba.
- MEDIA: F1-03 estado de entrega antes del id externo; F1-04 horario/frecuencia dependen de la etiqueta `origen`; F1-05 lead borrado; F1-06 reenganche no revalida; F1-07 omisiones sin tarea; F1-08/F1-09 las guardas `check:*` se dejan esquivar; F1-10 sin validación de firma de Twilio (se resuelve en A7); F1-11 producción arranca con transporte falso.
- BAJA: F1-12 a F1-18.

**Para Eduardo**
- Diez decisiones de producto al final del informe (sección 5). Las que ya tienen respuesta en el plan: calendario del lead a medias (A3), baja que vuelve a escribir (A4), entrega fallida (A5), frecuencia (A6), firma en el borde (A7). Quedan abiertas: reenganche tras responder con `max_intentos = 1`, borrado de un lead, qué hace "resuelta" en Chatwoot.

## A2. Correcciones de la auditoría

**Qué se hizo** (cada punto con su test; los tests viejos no se tocaron, solo se agregaron)

- **F1-01 (ALTA) Reclamos huérfanos.**
  - *Ejecución del motor.* El mensaje queda ligado a la ejecución (`mensaje_id`) en la MISMA transacción que lo encola. Un barrido de recuperación corre al inicio de cada `correrAutomatizaciones` (o sea, dentro del barrido de 60 s de `server.ts`) y resuelve toda ejecución reclamada hace más de `RECLAMO_VENCE_MS` (10 min, configurable con `reclamoVenceMs`): mensaje con `id_externo` (o ya enviado) → ejecución `enviado`; mensaje `pendiente` → mensaje `bloqueado`/`ejecucion_abandonada` y ejecución `fallido`; mensaje `enviando` sin id → `fallido`/`envio_incierto` y tarea `revision_manual`; mensaje bloqueado o fallido → se refleja en la ejecución. Nunca reenvía.
  - *Mensaje `enviando`.* El reclamo deja su hora en `actualizado_en` (reloj del provider). `MessagingProvider.recuperarEnviosInciertos()` marca `fallido` con error `envio_incierto` lo que lleva más de `ENVIO_INCIERTO_MS` (5 min) en `enviando` sin id, y crea tarea `revision_manual` si era para el contacto. Idempotente.
  - *Catch del motor.* Si `despachar` lanza tras `encolar`, el catch cancela el mensaje (`bloqueado`/`ejecucion_fallida`) ANTES de marcar la ejecución `fallido`. Ya no sale después, mezclado con otra cosa.
  - *SIGTERM/SIGINT.* Nuevo `src/barrido.ts` (`iniciarBarrido`): los barridos no se solapan y `detener()` espera al que está en curso. `server.ts` en señal: detiene el barrido, espera peticiones en curso y recién entonces `$disconnect()`.
  - Tests: `motor.itest.ts` (F6a, F6b con transporte colgado y reloj inyectado, una prueba por caso de recuperación, dos motores a la vez), `provider.itest.ts`, `barrido.test.ts`.
- **F1-02 (ALTA)** → el test que reproduce el escenario (asesor toma la conversación y el contacto NO escribe → ninguna automatización sale) vive en `src/captacion/atencion-humana.itest.ts` y lo cierra A3, porque necesita la sincronización con Chatwoot. Ver A3.
- **F1-04 Horario y frecuencia por contenido.** `esIniciadoPorSistema()` (en `reglas.ts`): es del sistema todo saliente con origen distinto de `respuesta`/`confirmacion_baja` y también el que lleva plantilla sin ventana de servicio abierta. A ése le aplican horario (invariante 14) y tope de frecuencia aunque diga `respuesta`. El conteo de frecuencia suma los de `automatizacion` y los que llevaron plantilla. Tests: `reglas.test.ts`, `provider.itest.ts` (plantilla con origen por defecto a las 03:00 → `fuera_de_horario`).
- **F1-05 Lead borrado.** El motor no programa ni ejecuta para un lead con `eliminado_en` (ejecución `omitido`/`lead_eliminado`); `procesarEntrante` responde `ignorado` (200) sin registrar ni contestar. Tests en `motor.itest.ts` y `entrante.itest.ts`.
- **F1-06 Reenganche revalida.** Antes de encolar exige que el silencio de `ocurrencia × offset` desde el último mensaje del contacto siga cumplido; si no, `omitido`/`contacto_respondio`. Test con el escenario del informe.
- **F1-07 Omisiones sin tarea.** `sin_plantilla`, `variables_invalidas`, `variable_desconocida`, `variable_vacia` y `plantilla_sin_cuerpo` crean `tarea_asesor` `revision_manual` (una pendiente por conversación, helper `asegurarTareaAsesor` en `src/mensajeria/tareas.ts`, que también usa `MessagingProvider`).
- **F1-08 / F1-09 Guardas.** `check:generico`: carpetas excluidas por ruta exacta (`dist` o `coverage` anidados SÍ se escanean), el dígito deja de ocultar un término (`termino2`), se escanea todo archivo de texto no binario (`.mts`, `.css`, `.sh`, `.md`, `Dockerfile*`, `.env` de la raíz…), `prisma/seed/*.ts` SÍ se escanea y solo se excluye `prisma/seed/**/*.sql`; exclusiones exactas: `docs/`, `src/generated`, el archivo de términos, `package-lock.json`, `CLAUDE.md` y `SPEC.md` (los dos últimos citan los términos a propósito y ahora entran en el alcance por ser `.md`). `check:capas`: `pg` y `@prisma/*` fuera de `src/datos/`, `prisma.<modelo>.…` sobre el cliente crudo, `organizacion_id` dentro de SQL, `import("twilio")`, hosts de Twilio, URLs de Chatwoot y variables `CHATWOOT_*` fuera de `src/mensajeria/`, `generated`/`testutil` solo por ruta exacta, `.mts`/`.tsx`/`.js`. Cada violación tiene su test que la siembra y comprueba que falla (`check-generico.test.ts`, `check-capas.test.ts`). Ninguna regla vieja se debilitó.
- **F1-11.** Con `NODE_ENV=production` y sin `CHATWOOT_URL`/`CHATWOOT_BOT_TOKEN`, `mensajeriaDesdeEntorno` lanza y el backend no arranca (`src/mensajeria/index.test.ts`).
- **F1-12.** Test de tres `despachar` simultáneos: un solo envío. Verificado por mutación en la auditoría; aquí el test queda en `provider.itest.ts`.
- **F1-13.** `ventana_servicio_hasta` y `ultimo_mensaje_entrante_en` usan el máximo (`entrante.itest.ts`).
- **F1-14.** `BaseDatos`/`Consultas` ya no tienen `$queryRaw*`/`$executeRaw*` (ni en el tipo de la transacción) y, si se fuerza con un cast, lanzan `ErrorAlcance` (extensión `client` de Prisma). `pingBaseDatos` sigue por `sistema.ts` con el cliente sin alcance. Test en `alcance.itest.ts` con `@ts-expect-error` para el tipo.
- **F1-15.** `"postinstall": "prisma generate"`. El `Dockerfile` usa `npm ci --ignore-scripts` porque en ese punto aún no se copió el schema (ya corre `prisma generate` después). Verificado en una copia limpia: `npm ci && npm run validar` → exit 0, 127 tests.
- **F1-16.** Nota en la sección N5 de `docs/BITACORA-NOCHE.md` que apunta a N8 y a A3.

**Tabla de hallazgos**

| Hallazgo | Estado | Nota |
|---|---|---|
| F1-01 ALTA | corregido | ver arriba |
| F1-02 ALTA | corregido en A3 | el test que lo reproduce está en A3 (`atencion-humana.itest.ts`) |
| F1-03 | pendiente (A5) | se deja para A5 por indicación |
| F1-04 | corregido | |
| F1-05 | corregido | borrar un lead no cierra su conversación; ver "Para Eduardo" |
| F1-06 | corregido | |
| F1-07 | corregido | |
| F1-08 | corregido | residual: `karateka` y `IDKARATE` (letras pegadas) siguen pasando; verticales no listadas en `config/terminos-prohibidos.txt` tampoco se ven |
| F1-09 | corregido | residual: es revisión de texto; un cliente crudo pasado con otro nombre de variable no se ve (lo cubre el tipo `BaseDatos`); `scripts/` no se revisa |
| F1-10 | pendiente (A7) | firma de Twilio |
| F1-11 | corregido | |
| F1-12 | corregido | |
| F1-13 | corregido | |
| F1-14 | corregido | |
| F1-15 | corregido | |
| F1-16 | corregido | |
| F1-17 | pendiente | BAJA, no se pidió: secretos de demo versionados, puertos en 0.0.0.0, contenedor como root |
| F1-18 | pendiente | BAJA, no se pidió: `npm audit` (transitivas de la CLI de Prisma); sin `audit fix --force` |

**Verificación**
- `npm run validar` → exit 0 · `ℹ tests 127 · pass 127 · fail 0` (antes 102) · `check:generico: 105 archivos` (antes 80: ahora entra todo texto) · `check:capas: 32 archivos`.
- `npm run test:int` → exit 0 · `ℹ tests 119 · pass 119 · fail 0` (antes 94).
- Mutaciones sobre `motor.ts` (quitar el cancelado del catch, quitar la recuperación, quitar la revalidación): fallan F6a, F6b, los 6 tests de recuperación y F1-06.
- Copia limpia sin `src/generated`: `npm ci && npm run validar` → exit 0.

**Decisiones que tomé**
- *Umbrales:* 5 min para un envío incierto y 10 min para una ejecución reclamada. Un envío normal tarda segundos (el transporte corta a 4 s). Son constantes (`ENVIO_INCIERTO_MS`, `RECLAMO_VENCE_MS`).
- *Ejecución abandonada sin mensaje ligado:* queda `fallido`/`ejecucion_abandonada`, no se libera para reintentar. Con el cambio de esta noche un mensaje encolado siempre queda ligado en la misma transacción, así que "sin mensaje" significa que nada se encoló; aun así no se reintenta (política "a lo sumo una vez"), porque no se podría probar para ejecuciones anteriores al cambio. Costo: ese lead no recibe reenganche. Alternativa descartada: liberarla para reintentar.
- *Hora de reclamo del mensaje en `actualizado_en`:* evita una columna nueva y funciona con el reloj inyectado de los tests. Alternativa descartada: columna `reclamado_en` (migración sin necesidad).
- *Recuperación dentro de `correrAutomatizaciones`* y no un barrido aparte: ya corre cada 60 s y ya recorre las organizaciones.
- *F1-14 con la extensión `client` de Prisma* y no con un `Proxy`: probado que sobrescribe el método también dentro de `$transaction`. Alternativa descartada: Proxy sobre el cliente (riesgo con los métodos internos de Prisma).
- *Frecuencia:* la cuentan los mensajes de `automatizacion` y los que llevaron plantilla. Un "respuesta con plantilla dentro de la ventana" (hoy no existe) también contaría; es conservador.

**Para Eduardo**
- Una ejecución o un envío "inciertos" crean una tarea `revision_manual` para el asesor: él decide si le escribe al contacto. Confirmar que ése es el aviso que quieres (hoy no hay alarma aparte).
- F1-05 solo cubre lo que pasa si un lead se borra; qué hacer con su conversación al borrarlo (cerrarla, borrarla, conservarla) sigue siendo la decisión 7 del informe de la auditoría.
- `check:generico` ahora escanea `.md` fuera de `docs/`. Si agregas un README o notas con los términos, fallará: van en `docs/`.

## A3. Lead a medias

**Qué se hizo**
- `TIEMPO_ESPERA_MS` vuelve a **30 minutos** (`src/captacion/espera.ts`); los 72 h de N8 se revierten (comentarios y tests incluidos; el 72 h que queda en el código es la ventana gratis del anuncio, otra cosa).
- **A los 30 min sin respuesta a mitad de la captura:** nota privada con los datos parciales y la conversación se **abre en Chatwoot** (visible a los asesores), pero la conversación del backend **sigue en `bot`**. Dos marcas nuevas en `conversacion` (migración `20261009000000_lead_a_medias`): `visible_a_asesores_en` (el aviso, reclamado con la versión de la conversación: dos barridos no avisan dos veces) y `abierta_para_asesores_en` (la apertura; si Chatwoot falla se reintenta sin repetir la nota, pasado 1 min). La apertura vive en `MessagingProvider.abrirParaAsesores()` (invariante 4).
- **Si el contacto regresa, el bot continúa la captura** donde iba (verificado también contra Chatwoot real, ver abajo). **El reenganche de 25 h puede salir** (el motor ya solo mira conversaciones en `bot`; no hizo falta tocarlo). Si el contacto vuelve y se calla otra vez, no se avisa de nuevo. La captura completa no cambia (nota, abrir, `en_atencion_humana`).
- **`en_atencion_humana` se activa cuando una PERSONA toma la conversación** (`src/captacion/toma.ts`, misma versión optimista): asignación a un asesor, o el primer mensaje de un asesor. Anula `pasar_a_asesor_pendiente`, deja una `interaccion` `pase_a_asesor` (`motivo: persona_tomo_conversacion`, `via`, `agente_chatwoot_id`) y es idempotente (la asignación y el primer mensaje llegan los dos).
- **La señal vieja se quitó:** un entrante con `estadoConversacion === "open"` ya NO marca atención humana, porque el propio sistema deja la conversación `open` (a los 30 min y al terminar la captura). En su lugar, respaldo: si el mensaje del contacto trae la conversación asignada a una persona (`meta.assignee_type == "User"`) y el backend no se enteró, se apaga el bot.
- `webhook.ts`: `interpretarTomaDeConversacion()`; `app.ts` la enruta (tras la firma, invariante 9); `server.ts` la conecta.
- Las bandejas se crean con la **asignación automática de Chatwoot apagada** (`scripts/lib/chatwoot.ts`, `preparar-chatwoot.ts`).
- **Resolver no devuelve el bot** (decisión conservadora): `conversation_resolved` se ignora y la conversación queda `en_atencion_humana`; una conversación NUEVA de Chatwoot abre otra fila y el bot empieza de cero.
- `docs/DEMO-LOCAL.md` actualizado. Notas del asesor: la de "sin respuesta" ahora dice que nadie la ha tomado.

**Qué eventos llegan al Agent Bot (Chatwoot 4.18, medido; `scripts/experimento-eventos-chatwoot.ts`)**

Experimento con una bandeja API de pruebas y el bot de capturas de la noche 1 (ya existían), actuando como contacto, bot y asesor. Fixtures reales (sin datos sensibles) en `src/mensajeria/chatwoot/payload-*.json`; los tests de `webhook.test.ts` y `app.test.ts` las usan.

| Acción | Eventos que llegan | ¿Sirve de señal? |
|---|---|---|
| El bot (token del bot) contesta o deja una nota | `message_created` saliente, `sender.type: agent_bot`; luego `conversation_updated` | No: es el propio sistema |
| El bot abre la conversación | `conversation_opened`, `conversation_status_changed`, `conversation_updated` (cambian `status` y `assignee_agent_bot_id → null`); sin asesor | **No**: abrir ≠ atender |
| Un asesor se la asigna | `conversation_updated` con `changed_attributes: [{assignee_id: {previous_value: null, current_value: 2}}]` y `meta.assignee_type: "User"` | **Sí**: llega |
| El asesor escribe su primer mensaje (o una nota privada) | `message_created` saliente, `sender.type: "user"` | **Sí**: llega |
| El asesor la resuelve | `conversation_resolved`, `conversation_status_changed`, `conversation_updated` | No (se ignora) |
| El contacto escribe tras resolverla | `conversation_status_changed` a `pending` (conserva al asesor) y `message_created` entrante con `meta.assignee_type: "User"` | Respaldo (`asignadaAPersona`) |
| El asesor se desasigna | `conversation_updated` con `assignee_id: 2 → null` | No (se ignora) |
| El contacto escribe con la conversación `open` y sin asesor | `message_created` entrante normal | El bot lo recibe y continúa |

**La asignación SÍ llega**, así que no hizo falta depender solo del primer mensaje; se usan las dos señales. Con el asesor en línea y la asignación automática encendida, al abrir el bot la conversación no llegó ninguna asignación automática (probado una vez); aun así se apagó en el aprovisionamiento. El experimento dejó Chatwoot como estaba (bandejas de prueba borradas, asesor de vuelta a "sin conexión").

**Verificación**
- `npm run validar` → exit 0 · `ℹ tests 138 · pass 138 · fail 0` · `check:generico: 110 archivos` · `check:capas: 33 archivos`.
- `npm run test:int` → exit 0 · `ℹ tests 134 · pass 134 · fail 0`.
- Integración, escenarios pedidos: (i) 30 min → nota + abierta + estado `bot` (`lead-a-medias.itest.ts`, `baja-espera.itest.ts`); (ii) el contacto regresa y el bot continúa, y al terminar pasa al asesor; (iii) el reenganche sale entre medias; (iv) un asesor se asigna / escribe el primer mensaje y no sale ninguna automatización aunque el contacto no escriba, con el control negativo de que sin la señal el reenganche sí sale (`atencion-humana.itest.ts`, cierra F1-02); (v) idempotencia del barrido, también con tres barridos simultáneos; más apertura reintentable, toma concurrente con un mensaje del contacto (5 vueltas) y "resuelta no devuelve el bot".
- Unitarios con payloads reales: lo que cuenta y lo que no como toma (14 fixtures), enrutado y firma en `app.test.ts`.
- **De punta a punta contra el Chatwoot y el backend de la demo** (`docker compose up -d --build --wait`, demo reconstruida con la imagen nueva): `npm run demo:contacto` termina en `open`; un lead a medias (`--respuestas "Hola|Ana"`, `ultimo_mensaje_entrante_en` adelantado 31 min) queda a los ≤60 s en `bot`, con nota privada y `open` sin asesor en Chatwoot; al volver a escribir el contacto el bot pregunta la sucursal (`bot|sucursal`); al asignársela el administrador en Chatwoot, el backend la pasa a `en_atencion_humana` (log `toma_de_conversacion`, `via: asignacion`).

**Decisiones que tomé**
- *Qué cuenta como toma:* asignación a un `user` o mensaje saliente de un `user`, **público o nota privada** (quien escribe una nota está atendiendo). Alternativa descartada: solo mensajes públicos. Un asesor que solo mira la conversación (la abre en pantalla) no apaga al bot.
- *Respaldo por `meta.assignee_type == "User"` en el entrante* además de los dos eventos: si se pierde el webhook de asignación (caída del backend), el siguiente mensaje del contacto lo corrige. Alternativa descartada: no tener respaldo.
- *Resuelta no devuelve el bot* (ver arriba). Alternativa descartada: devolver a `bot` al resolver; el bot volvería a escribirle a quien un asesor ya atendió.
- *Dos columnas* (`visible_a_asesores_en`, `abierta_para_asesores_en`) en vez de una: con una sola, un fallo de Chatwoot al abrir obligaba a repetir la nota. Alternativa descartada: reutilizar `pasar_a_asesor_pendiente`, que sí pasa a `en_atencion_humana` (es justo lo que se quita).
- *Tests existentes cambiados porque cambió la regla* (no se debilitó nada): en `baja-espera.itest.ts` el test del tiempo de espera ahora afirma el comportamiento nuevo (30 min, estado `bot`, sin interacción de pase); en `entrante.itest.ts` el test "un asesor que toma la conversación … apaga al bot" (que usaba `open` como señal) se reemplazó por dos: `open` sin asesor sigue siendo del bot, y asignada a una persona sí lo apaga; a `webhook.test.ts` se le agregó el campo `asignadaAPersona` al resultado esperado y a `app.test.ts` el nuevo dep en su helper.
- `scripts/experimento-eventos-chatwoot.ts` queda en el repo para repetir la medición (por ejemplo con Twilio real).

**Para Eduardo**
- **Un incidente mío, ya arreglado:** corrí una vez `provider.itest.ts` con la `DATABASE_URL` de `.env` (la base de la demo, no la de pruebas) y dejó 8 organizaciones "Provider …" en la base `inscripciones`; con ellas `demo-preparar` creó una bandeja de más en Chatwoot y falló. Las 8 organizaciones se marcaron con `eliminado_en` (sin borrado físico), se borró esa bandeja de Chatwoot y la demo quedó sana (`docker compose up -d --wait` y `demo:contacto` en verde). `npm run test:int` siempre usa `inscripciones_pruebas`.
- Los eventos se midieron en una bandeja tipo **API**; son eventos del núcleo de Chatwoot (no del canal), pero conviene repetir `scripts/experimento-eventos-chatwoot.ts` con la bandeja de **Twilio real** cuando exista.
- Mientras nadie la tome, **el bot sigue contestando aunque la conversación esté abierta en Chatwoot**. Si un asesor la abre para leerla y el contacto escribe justo entonces, el bot responde. Para pararlo, el asesor se la asigna o escribe. Si prefieres que abrirla en pantalla también pare al bot, hay que decidirlo (Chatwoot no avisa que alguien "la está mirando").
- Si en producción se enciende la asignación automática de Chatwoot, una asignación automática contaría como "persona la tomó". Por eso el aprovisionamiento la apaga.
- Resolver una conversación en Chatwoot la deja sin bot para siempre en esa conversación (decisión 3 de la lista de la auditoría, ver arriba).
- La demo de estas pruebas dejó las conversaciones 14, 15 y 16 en Chatwoot (la 15 asignada al asesor demo).
