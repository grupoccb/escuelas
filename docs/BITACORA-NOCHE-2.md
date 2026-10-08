# BITACORA-NOCHE-2.md

Sesión del 7 de octubre de 2026. Rama `noche-2` (desde `noche-fase1`). Plan: `docs/PLAN-NOCHE-2.md`.

| Bloque | Estado | Commit | Nota |
|---|---|---|---|
| A0 | HECHO | f987191 | Preparación |
| A1 | HECHO | ver sección | Auditoría de la primera sesión: 2 ALTA, 9 MEDIA, 7 BAJA |
| A2 | HECHO | dae9e9d | Correcciones de A1: las 2 ALTA (F1-02 cierra con A3) y 11 de los demás hallazgos |
| A3 | HECHO | 8f607f2 | Lead a medias: visible a los 30 min sin marcar atención humana; una persona la toma por asignación o primer mensaje |
| A4 | HECHO | ebbf39c | Baja que vuelve a escribir: tarea `baja_volvio_a_escribir` (una pendiente por conversación), el sistema calla |
| A5 | HECHO | ebb4fc9 | Entrega fallida: tarea con el código de error, una por mensaje; cierra F1-03 (evento adelantado y tiempo agotado) |
| A6 | HECHO | b9913a3 | Frecuencia: 3 automáticos al día y 1 de marketing cada 7 días, configurable por organización (`configuracion_organizacion`) |
| A7 | HECHO | ddf95c0 | Firma en el borde: rutas de Twilio con `X-Twilio-Signature`, reintentos por `MessageSid`, reenvío sin modificar a Chatwoot |
| A8 | HECHO | (ver git log) | SPEC.md al día: Fase 1 como quedó, Fases 2 y 3 detalladas |
| A-fix | HECHO (2 pendientes, 1 decisión) | 46645c0…4ac0bb0 | Correcciones de la auditoría de la etapa A (`docs/auditorias/etapa-A.md`): ver la sección «Correcciones de la auditoría de la etapa A» |
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
| F1-03 | corregido en A5 | evento de entrega adelantado y tiempo agotado del transporte |
| F1-04 | corregido | |
| F1-05 | corregido | borrar un lead no cierra su conversación; ver "Para Eduardo" |
| F1-06 | corregido | |
| F1-07 | corregido | |
| F1-08 | corregido | residual: `karateka` y `IDKARATE` (letras pegadas) siguen pasando; verticales no listadas en `config/terminos-prohibidos.txt` tampoco se ven |
| F1-09 | corregido | residual: es revisión de texto; un cliente crudo pasado con otro nombre de variable no se ve (lo cubre el tipo `BaseDatos`); `scripts/` no se revisa |
| F1-10 | corregido en A7 | firma de Twilio en el borde; falta probarla con Twilio real |
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

## A4. Baja que vuelve a escribir

**Qué se hizo**
- Nuevo valor `baja_volvio_a_escribir` en el enum `tipo_tarea_asesor` (migración `20261009010000_tarea_baja_volvio_a_escribir`).
- `procesarEntrante` (`src/captacion/entrante.ts`): después de atender las palabras de baja y antes de cualquier otra cosa, si la conversación está en `opt_out` **o** el teléfono tiene una baja vigente en la organización (`estaDadoDeBaja(..., "todo")`), el mensaje se registra, se actualiza la ventana y se deja la tarea para el asesor. Resultado nuevo: `baja_volvio_a_escribir`. No corre la máquina de estados, no se encola ninguna respuesta (tampoco la confirmación de baja otra vez) y la conversación `bot` de un teléfono dado de baja (otra vertical de la misma organización) pasa a `opt_out`, así que el motor y la espera ya no la ven. Una conversación atendida por una persona se queda como está (y también recibe la tarea).
- Una pendiente por conversación: `asegurarTareaEnTransaccion` (`src/mensajeria/tareas.ts`) consulta y crea dentro de la transacción del entrante; si dos mensajes chocan, el índice único parcial existente rechaza al segundo, la transacción se repite y ya ve la tarea.
- La palabra de baja sigue siendo solo las cuatro del plan (`BAJA`, `STOP`, `CANCELAR`, `NO MOLESTAR`); repetirlas no crea tarea.

**Verificación**
- `src/captacion/baja-vuelve.itest.ts` (7 tests): baja → escribe → una tarea y silencio; escribe otra vez (incluida `ALTO`) → sigue siendo una; palabra de baja repetida → sin tarea; el asesor la resuelve y vuelve a escribir → tarea nueva (y otra vez una sola pendiente); otra vertical de la misma organización → tarea, silencio y conversación nacida en `opt_out`; baja de otra organización no afecta (el bot contesta, sin tarea); tres mensajes simultáneos × 4 vueltas → una sola tarea; con una persona atendiendo también deja tarea y no cambia el estado.
- `npm run validar` → exit 0 · `ℹ tests 138 · pass 138 · fail 0`.
- `npm run test:int` → exit 0 · `ℹ tests 142 · pass 142 · fail 0` (antes 134).

**Decisiones que tomé**
- *El sistema ya ni prepara respuestas para otra vertical de un teléfono dado de baja.* Antes el bot encolaba y el provider las bloqueaba con `opt_out` (quedaban filas `bloqueado`). Ahora no se encola nada. Alternativa descartada: dejar correr el bot y que el provider bloquee; el bot avanzaría pasos de captura sin poder preguntar nada. **Cambié una aserción de un test existente** (`baja-espera.itest.ts`, "la baja es de toda la organización"): ya no cuenta mensajes `bloqueado` (no hay) sino que afirma que no existe ningún saliente; el comportamiento exigido ("no sale nada") es el mismo.
- *También cuenta una conversación en `opt_out` aunque el teléfono ya no esté de baja* (por ejemplo, si alguien inserta un `opt_in` a mano): sigue callada y avisa a un asesor, en lugar de reactivar sola. Alternativa descartada: reactivar el bot automáticamente.
- *Con una persona atendiendo también se crea la tarea.* El asesor ya ve el mensaje en Chatwoot, pero la tarea le recuerda que esa persona está dada de baja (sus mensajes manuales no los frena el provider).

**Para Eduardo**
- Qué hace la tarea: solo avisa. Para levantar la baja hace falta un `opt_in` explícito (no hay palabra de alta; sigue abierto en la lista de decisiones de la auditoría).
- La tarea cita el mensaje del contacto (recortado a 160 caracteres) en la descripción.

## A5. Entrega fallida y F1-03

**Qué se hizo**
- **Tarea por entrega fallida.** Cuando un evento de entrega marca un mensaje `fallido`, `registrarEstadoEntrega` deja una tarea `entrega_fallida` para el asesor con el **código de error** en la descripción y en un campo estructurado (`tarea_asesor.codigo_error`), ligada al mensaje (`tarea_asesor.mensaje_id`). **Una por mensaje**: índice único `(mensaje_id, tipo)` sin importar el estado, así que el mismo evento repetido (también concurrente) y un fallo posterior del mismo mensaje, incluso con la tarea ya resuelta, no crean otra. El índice viejo "una pendiente por conversación y tipo" ahora solo vale para tareas sin mensaje (dos mensajes fallidos en la misma conversación = dos tareas). Migración `20261009020000_entrega_fallida` (enum, columnas, FK compuesta, tabla nueva, y los dos índices recreados/creados con SQL a mano).
- **F1-03 (a) Estado de entrega adelantado.** Si el evento llega antes de que `despachar` guarde el `id_externo`, ya no se pierde: se guarda en la tabla nueva `evento_entrega_pendiente` (con `organizacion_id`; único por `(organizacion, proveedor, id_externo, estado)`) y `registrarEstadoEntrega` responde `guardado_para_conciliar` (HTTP 200, el webhook no cambia). `despachar` concilia en cuanto guarda el id (`conciliarEventosPendientes`: aplica los eventos en orden de ocurrencia; idempotente; escritura condicional al estatus leído para que evento y conciliación simultáneos no retrocedan un estado). Para la carrera "el provider guardó el id justo entre mi búsqueda y mi guardado", el manejador del evento vuelve a buscar el mensaje tras guardar y, si ya existe, concilia él. `barrerEventosEntrega` (dentro de `recuperarEnviosInciertos`, o sea en el barrido de 60 s) concilia lo que se cortó y descarta con `eliminado_en` los eventos sin mensaje tras 1 h (los de mensajes de asesores, por ejemplo). Los eventos conciliados no se borran.
- **F1-03 (b) Tiempo agotado.** Nueva clase `EnvioIncierto` (subclase de `ErrorTransporte`). `TransporteChatwoot` distingue: *definitivo* = conexión rechazada/host no encontrado/red inalcanzable (`ECONNREFUSED`, `ENOTFOUND`, `EAI_AGAIN`, `EHOSTUNREACH`, `ENETUNREACH`) y cualquier HTTP de error salvo 408/502/504; *incierto* = tiempo agotado, conexión cortada, 408/502/504, 2xx sin id o con cuerpo ilegible, y **cualquier error de red que no podamos probar que ocurrió antes de enviar**. En el provider, un `EnvioIncierto` marca el mensaje `fallido` con error `envio_incierto` (el mismo estado final que deja la recuperación de A2, reutilizando su código: `marcarEnvioIncierto`), crea la tarea `revision_manual` (una pendiente por conversación), pasa la conversación a un asesor y **no reenvía**; los siguientes del lote no salen. El motor lo refleja como ejecución `fallido`/`envio_incierto`.
- **Fake configurable** (`TransporteFalso`): `demoraMs`, `fallarSi` (definitivo, ya existía), `inciertoSi` (el envío SÍ sale y el transporte lanza `EnvioIncierto`) y `alEnviar(envio, idExterno)` (momento exacto para que llegue un evento de entrega antes de devolver el id).

**Verificación**
- `src/mensajeria/entrega-fallida.itest.ts` (16 tests): tarea con código (campo y descripción); evento repetido/concurrente y fallo posterior = una sola (aun con la primera resuelta); dos mensajes = dos tareas; sin código; entregado/leído/fallo ignorado no crean; aislamiento por organización; el `fallido 63016` durante el envío se concilia y deja su tarea; estados fuera de orden durante el envío y evento repetido sin duplicar; carrera evento vs. guardado del id × 25 vueltas; evento ajeno guardado y descartado solo al caducar (soft delete); el barrido concilia lo que se cortó; aislamiento de eventos guardados; incierto = fallido/`envio_incierto` + tarea + sin reenvío (ni al redespachar ni en la recuperación); fallo definitivo no es incierto; lote con incierto; flujo completo desde el bot.
- `src/mensajeria/chatwoot/transporte.test.ts` (9 tests) contra un servidor HTTP local: tiempo agotado, conexión cortada, 2xx sin id/ilegible/`null`, 401/404/422/500 definitivos, 408/502/504 inciertos, conexión rechazada definitiva, nota y apertura, clasificación pura.
- `motor.itest.ts` (+1): envío incierto en el motor = ejecución `fallido/envio_incierto`, una sola salida, una tarea.
- `npm run validar` → exit 0 · `ℹ tests 147 · pass 147 · fail 0`. `npm run test:int` → exit 0 · `ℹ tests 159 · pass 159 · fail 0` (antes 142).

**Decisiones que tomé**
- *Envío incierto = `fallido`/`envio_incierto` de inmediato*, no quedarse en `enviando` hasta que pasen 5 min. Alternativa descartada: dejarlo `enviando` y que el recuperador de A2 lo resuelva después; el contacto tardaría 5+ min en tener tarea y un asesor sin tarea no sabría por qué la conversación está parada. Mismo estado final que el recuperador, mismo código.
- *Ante la duda, incierto.* Solo los códigos de red que prueban que la petición nunca llegó son definitivos. Costo: un Chatwoot apagado "con timeout" (no rechazo) se trata como incierto y genera tarea de revisión en lugar de un fallo simple. Es el lado seguro (a lo sumo una vez).
- *500 de Chatwoot = definitivo, 502/504/408 = incierto.* Un 500 puede, en teoría, haber creado el mensaje antes de fallar; no hay forma de saberlo. Alternativa descartada: todo 5xx incierto (llenaría de tareas por fallos reales de la aplicación).
- *Una tabla de eventos pendientes* y no devolver 5xx para que Chatwoot reintente: Chatwoot no reintenta eventos del Agent Bot de forma confiable y el reintento no aseguraría que el id ya esté guardado. Alternativa descartada: 202/500 mientras el mensaje esté `enviando`.
- *Descarte a 1 h* (`EVENTO_ENTREGA_VIGENCIA_MS`): un envío normal guarda su id en segundos y el peor caso (proceso muerto) lo resuelve el recuperador a los 5 min.
- *Tests existentes cambiados porque cambió la regla:* en `estados.itest.ts` el resultado `mensaje_desconocido` pasa a `guardado_para_conciliar` (dos aserciones), y el test de aislamiento comprueba además dónde queda guardado el evento. Los demás no se tocaron.
- El tope de frecuencia aún no cuenta los envíos inciertos que sí salieron; lo trata A6.

**Para Eduardo**
- Con Twilio real conviene medir si un mensaje de un asesor genera muchos eventos huérfanos (se descartan a la hora, no hacen daño).
- `entrega_fallida` y `revision_manual` aparecen como tareas distintas: cuando exista la bandeja de tareas (J3) habrá que decidir si se agrupan por conversación.

## A6. Frecuencia configurable por organización

**Qué se hizo**
- **Tabla `configuracion_organizacion`** (migración `20261009030000_configuracion_organizacion`): una fila viva por organización (índice único parcial), con `max_automaticos_por_dia` (3), `max_marketing_por_ventana` (1) y `ventana_marketing_dias` (7); CHECK de que los topes no sean negativos y la ventana vaya de 1 a 365 días (0 es válido: apaga lo automático). La migración crea la fila con los valores por defecto para las organizaciones que ya existen, y `prisma/seed/demo.sql` la trae para la organización de la demo (idempotente).
- **Lector único** `leerConfiguracion(db)` en `src/configuracion/index.ts`: devuelve la configuración del scope o `CONFIGURACION_POR_DEFECTO` si no hay fila. Para extenderla: columna con default + migración, campo y default en ese archivo, y una línea en `desdeFila` (instrucciones en el encabezado; un test comprueba que los defaults del código coinciden con los de la columna). Helper de pruebas: `fijarConfiguracion()` en `src/testutil/semilla.ts`.
- **El tope vive en `MessagingProvider`** (invariante 4). Se quitó `LIMITE_FRECUENCIA_POR_DEFECTO` y la dependencia `limiteFrecuencia`; el provider lee la configuración una vez por `despachar` (solo si hace falta). Reglas:
  - *Diario:* a todo lo iniciado por el sistema (`esIniciadoPorSistema`, sin cambios) le aplica `max_automaticos_por_dia` en una **ventana móvil de 24 h**, contando por teléfono en toda la organización (cualquier conversación o vertical), los de automatización y cualquiera con plantilla.
  - *Marketing:* a toda plantilla de categoría `marketing` le aplica además `max_marketing_por_ventana` dentro de `ventana_marketing_dias` (móvil). Cuenta también para el diario. Se aplica aunque la ventana de servicio esté abierta o el origen diga `respuesta`: una plantilla de marketing nunca es contestar. El borde es estricto: lo enviado exactamente hace 7 días ya no cuenta.
  - *Sin límite:* respuestas libres, confirmación de baja y notas internas (como antes).
  - Los envíos **inciertos** (A5) cuentan para ambos topes (pudieron haber salido); los bloqueados y los fallos definitivos no.
- `reglas.ts`: `EntradaReglas` gana `marketingRecientes` y `limiteMarketing` (opcionales: sin dato no se limita, así las pruebas simples no cambian).

**Verificación**
- `src/mensajeria/frecuencia.itest.ts` (15 tests): 3.º pasa y 4.º `tope_frecuencia`; ventana móvil (a las 23 h 59 min bloqueado, a las 24 h 1 min pasa); otro teléfono no cuenta; el tope se comparte entre verticales de la organización; otra organización con su propia configuración no se afecta ni consume mi tope; el cambio de configuración surte efecto (1 → 2 → 0); marketing 1 por 7 días (6 d 23 h bloqueado, 7 d pasa, y el de los 7 días abre ventana nueva); servicio y marketing no se frenan entre sí pero marketing sí cuenta en el diario; ventana y tope de marketing configurables; marketing con la ventana de servicio abierta limitado; respuestas, notas y confirmación de baja nunca limitadas; fallo definitivo no cuenta; incierto sí; el horario sigue ganando a la frecuencia.
- `src/configuracion/configuracion.itest.ts` (7): defaults sin fila, defaults = columnas, lectura y cambio, aislamiento, una fila viva por organización (borrada no cuenta), CHECK, seed de la demo con su fila (doble ejecución).
- `reglas.test.ts` (+1): tope de marketing puro. Tests existentes que asumían 1 por día (`provider.itest.ts`, `motor.itest.ts`) ahora fijan `max_automaticos_por_dia: 1` en la configuración de su organización y siguen afirmando lo mismo.
- `npm run validar` → exit 0 · `ℹ tests 148 · pass 148 · fail 0`. `npm run test:int` → exit 0 · `ℹ tests 181 · pass 181 · fail 0` (antes 159).

**Decisiones que tomé**
- *Marketing limitado también como "respuesta" dentro de la ventana de servicio.* Alternativa descartada: aplicar el tope de marketing solo a lo iniciado por el sistema; dejaría mandar promociones ilimitadas a quien escribió hace una hora.
- *Marketing cuenta en el diario.* Un mensaje de marketing es un automático; si no, 3 de servicio + 1 de marketing pasarían de lo que el contexto permite. Alternativa descartada: contadores independientes.
- *Ventana de 24 h fija en código* (no configurable): la decisión 4 fija "al día"; solo el número es configurable.
- *Contar incierto:* conservador (puede que se mande uno menos de lo permitido, nunca uno de más).
- *Migración que inserta filas para las organizaciones existentes* en vez de depender solo del seed (el lector ya tolera su ausencia). Alternativa descartada: no insertar nada; la demo ya creada se habría quedado sin fila hasta volver a correr el seed.

**Para Eduardo**
- **Límite conocido (no corregido):** el conteo y el envío no son atómicos. Dos mensajes automáticos al mismo teléfono despachados en el mismo instante desde conversaciones distintas pueden pasar los dos justo en el tope (3 → 4). Cerrarlo exige un candado por (organización, teléfono) con SQL crudo en `src/datos/`; no se hizo porque el motor y la espera corren en serie dentro de un solo proceso. Decídelo antes de tener más de una réplica del backend.
- Los valores 3 / 1 / 7 vienen del contexto (sección 11) y de la decisión 4; no hay interfaz para cambiarlos todavía (J8). Hoy se editan con SQL en `configuracion_organizacion`.

## A7. Firma en el borde (resuelve F1-10)

**Qué se hizo**
- **Rutas** `POST /webhooks/twilio/entrantes` y `POST /webhooks/twilio/estados` (`src/http/app.ts`; cuerpo de formulario, tope de 100 KB). Se valida `X-Twilio-Signature` sobre el cuerpo crudo antes de hacer nada (invariante 9); rechazo = **403** sin cuerpo (Chatwoot usa 401; Twilio documenta 403). Sin `TWILIO_AUTH_TOKEN` o sin `PUBLIC_BASE_URL`, todo se rechaza (como el webhook de Chatwoot sin secreto).
- **Firma sin el SDK** (`src/mensajeria/twilio/firma.ts`): HMAC-SHA1 base64 de `URL pública + nombre+valor de los parámetros ordenados`, comparación en tiempo constante, variantes con/sin `:443`/`:80` como Twilio. Sin dependencias nuevas.
- **Borde** (`src/mensajeria/twilio/borde.ts`): resuelve la organización por el número de la escuela (reusa `resolverBandejaPorNumero` de `src/datos/sistema.ts`, la excepción al scope ya documentada: entrantes por `To`; estados por `From` y luego `To`); reclama el evento en la tabla nueva `evento_twilio` (migración `20261009040000_evento_twilio`, índice único parcial `(proveedor, tipo, id_mensaje, estado_mensaje)`); reenvía el cuerpo **byte a byte** por la interfaz `ReenviadorTwilio` (fake y HTTP real hacia `$CHATWOOT_URL/twilio/callback` y `/twilio/delivery_status`, o `TWILIO_REENVIO_*_URL`). `From` no se toca; la opción `TWILIO_NORMALIZAR_FROM_AL_REENVIAR` (apagada) usa `normalizarNumeroWhatsapp()` y solo reescribe el valor de `From` en entrantes, con los demás bytes idénticos.
- **Reintentos**: reintento tras un reenvío exitoso → 200 sin reenviar; reenvío fallido → evento `fallido`, **502**, y el reintento lo reclama; reclamo en curso → 503; reclamo de más de 60 s → se da por muerto. Organización no resuelta → 200 sin reenviar y un warning; sin `MessageSid` → 400. Respuesta a Twilio: TwiML `<Response/>` en entrantes, 200 vacío en estados; nunca texto interno.
- `app.ts` gana un manejador de errores sin detalles (413/500 vacíos), que también cubre al webhook de Chatwoot.
- `src/server.ts` lo conecta con `bordeTwilioDesdeEntorno`; el log de arranque dice si está activo. Con el token puesto y `NODE_ENV=production`, sin destino de reenvío no arranca. `.env.example`, `docs/DEMO-LOCAL.md` y la sección nueva "A7" de `docs/DECISION-ATRIBUCION.md` (cableado y qué falta probar con Twilio real).

**Verificación**
- `firma.test.ts` (9): vector del ejemplo de la documentación de Twilio (`12345` → `GvWf1cFY/Q7PnoempGyD5oXAezc=`, de memoria; coincide con el cálculo), dos vectores fijos con token falso, comparación contra una implementación independiente, nombres repetidos, válida/inválida/longitud distinta/sin token, puerto por defecto, parseo del formulario (incl. `__proto__`), URL pública, y `verificarWebhookTwilio`. `borde.test.ts` (4): reescritura de `From` sin tocar los demás bytes. `src/http/twilio.test.ts` (8): firma válida, query firmada, 6 formas de firma inválida, sin token/URL, códigos de respuesta del borde, 413, solo POST.
- `borde.itest.ts` (12, app HTTP real + Postgres + reenviador falso): firma válida pasa y los bytes y `Referral*` llegan idénticos; inválida/ausente → 403 sin reenviar ni guardar; un reintento llega una sola vez (y 6 simultáneos × 4 vueltas, uno solo reenvía); cada `MessageStatus` una vez; organización por número (con `+521`), aislamiento, número desconocido, sin `MessageSid`, reenvío fallido y su reintento, reclamo muerto, `From` con la opción apagada y encendida.
- `npm run validar` → exit 0 · `ℹ tests 169 · pass 169 · fail 0` · `check:generico: 128 archivos` · `check:capas: 38 archivos`.
- `npm run test:int` → exit 0 · `ℹ tests 193 · pass 193 · fail 0`, también una segunda vez seguida sobre la misma base. Migraciones sobre base vacía: `migrate deploy` y `migrate diff` → "No difference detected".
- Nada contra Twilio real.

**Decisiones que tomé**
- *403* para firma inválida (no 401 como Chatwoot): es lo que documenta Twilio.
- *Al menos una vez* al reenviar: ante un fallo o un resultado desconocido del reenvío se responde 5xx y se deja reintentar, aunque Chatwoot pudiera repetir un mensaje (H2). Alternativa descartada: a lo sumo una vez; perder el primer mensaje de un anuncio es peor que verlo repetido.
- *Un evento reclamado antes de reenviar* (no "reenviar y luego registrar"): evita que dos reintentos simultáneos lleguen los dos a Chatwoot.
- *Estados resueltos por `From` y luego `To`*: en un estado de entrega `From` es la escuela. Supuesto a confirmar con Twilio real.
- *Índice único global, no por organización*, como pidió el plan: un `MessageSid` pertenece a una sola cuenta.
- *El borde no valida contra la base que el contacto exista ni crea nada*: solo transporta. El lead lo sigue creando el webhook de Chatwoot.
- Un `From` ilegible con la opción encendida pasa sin tocar (no se adivina).

**Para Eduardo**
- La lista de lo que falta probar con Twilio real está en `docs/DECISION-ATRIBUCION.md` (sección A7). Lo crítico: la URL pública exacta contra la que Twilio firma y qué hace Twilio ante un 502/503 (por defecto no reintenta ante un 5xx; si no reintenta, un reenvío fallido se perdería y habría que activar el reintento o poner una cola propia).
- Para usarlo: `TWILIO_AUTH_TOKEN` y `PUBLIC_BASE_URL` en el entorno del backend; el webhook del número de Twilio apunta a `PUBLIC_BASE_URL/webhooks/twilio/entrantes` y el de estados a `/webhooks/twilio/estados`. En la demo local queda apagado.
- Sigue sin resolverse la elección entre la vía A y la C; este borde sirve a las dos.

## A8. `SPEC.md` al día

**Qué se hizo**
- Fase 1 reescrita como quedó (bloques 1.1–1.7 y los ajustes de la etapa A), con sus gates sin marcar y un gate nuevo: elegir la vía de atribución con Twilio real.
- Fases 2 y 3 detalladas con los bloques de este plan (C–E y B, F–K), cada una con gates en borrador. Se quitó el "Fuera de alcance. No construir" (queda suspendido por el plan, solo para esta sesión).

**Verificación**
- `git diff --stat SPEC.md`; ninguna casilla `[x]`: `grep -c '\[x\]' SPEC.md` da 0.

**Decisiones que tomé**
- Los gates de Fases 2 y 3 son un borrador mío; Eduardo los ajusta. Alternativa descartada: no escribir gates; el SPEC los trae en todas las fases y sin ellos no hay qué marcar.

**Para Eduardo**
- Revisar los gates de Fases 2 y 3 y el gate nuevo de atribución en Fase 1.

## Correcciones de la auditoría de la etapa A

Auditoría: `docs/auditorias/etapa-A.md` (1 ALTA, 11 MEDIA, 11 BAJA). Estos commits son parte de la etapa A y se llaman `A-fix: …`; no hay bloque nuevo en el plan. Nueve commits, uno por grupo coherente:

| Commit | Qué |
|---|---|
| `46645c0` | EA-01, EA-07 (y el informe de la auditoría, y `src/testutil/carrera.ts`) |
| `4c9aebe`, `d6f8eee` | EA-12, EA-17 y EA-16 (el mensaje de `4c9aebe` nombra EA-16 por error; se hizo en `d6f8eee`) |
| `6ceace0` | EA-10 |
| `403862c` | EA-11, EA-08, parte de EA-23 |
| `4cb65aa` | EA-06, EA-14, EA-15 |
| `5e8090e` | EA-09, EA-13, EA-20 |
| `ee8f952` | EA-03, EA-04, EA-05, y la documentación de EA-02, EA-21, EA-22 |
| `4ac0bb0` | EA-18, EA-19, parte de EA-23 |

### Estado de cada hallazgo

| EA | Estado | Cómo / por qué |
|---|---|---|
| EA-01 ALTA | **corregido** | `espera.ts` ignora leads con `eliminado_en` en las dos consultas y dentro de la transacción. Un lead borrado ya no es un error: simplemente no existe para el barrido. |
| EA-02 | **documentado, NO corregido (decisión de Eduardo)** | En la vía A los estados no pasan por el borde (Chatwoot fija su `status_callback`). Las tres opciones (a: vía C, b: proxy, c: aceptar y proteger con la red) y que F1-10 queda cerrado **solo para entrantes** están en `docs/DECISION-ATRIBUCION.md`. No hay código que arreglar sin elegir. |
| EA-03 | **corregido** | El evento se guarda con cuerpo y cabeceras antes de reenviarlo; `reenviarPendientes()` (en el ciclo de cada minuto) reenvía los `fallido` y los `procesando` vencidos con el mismo candado, con 60 s entre intentos y hasta 10 (`abandonado` + alerta). Garantía exacta en `DECISION-ATRIBUCION.md`. Migración `20261009070000`. |
| EA-04 | **corregido** | `redirect: "manual"`, una 3xx es fallo y no se sigue; solo 2xx es éxito. 7 pruebas del reenviador real contra un servidor HTTP local. |
| EA-05 | **corregido** | Receptor no resuelto: se reenvía igual (sin registro) y queda `log.error` + contador `alertas.organizacionDesconocida`. Sin destino de reenvío solo alerta. No se pudo crear tarea: `tarea_asesor` exige lead. |
| EA-06 | **corregido** | Una nota fallida (definitiva o incierta) no marca `pasar_a_asesor_pendiente` ni frena los mensajes que siguen; deja una tarea `nota_fallida`. La conversación del aviso de 30 min sigue en `bot` y se abre igual. |
| EA-07 | **corregido** (menos la alarma por racha) | `try/catch` por conversación, por automatización, por ejecución, por fase y por organización, con log y contador (`errores`). `src/ciclo.ts` aísla espera, motor y barrido de Twilio. **No** se hizo la alarma «N barridos seguidos con el mismo elemento fallando»: solo log por barrido y contador. |
| EA-08 | **corregido** | Barreras reales (`src/testutil/carrera.ts`) en F1-12, reclamo del motor (ejecutar y recuperar), A3i, A5c, A5e, A7l, el reclamo de eventos, el candado de frecuencia; A3m y A5k con tests directos. Mutaciones abajo. |
| EA-09 | **corregido** | `PENDIENTE_VIGENCIA_MS` = 10 min (configurable por provider, `vigenciaPendienteMs`): un pendiente más viejo se bloquea con motivo `obsoleto`, sin tarea. La edad se mide con el reloj del provider (`creado_en` lo pone `encolar`). |
| EA-10 | **corregido** | `origen` obligatorio (unión discriminada); `respuesta`/`confirmacion_baja` exigen `respondeA` y `encolar` comprueba que sea el último entrante de la conversación (`respuestaA()`, `confirmacionBajaA()`). Test de compilación con `@ts-expect-error`. |
| EA-11 | **corregido** | `pg_advisory_xact_lock` por (organización, teléfono) alrededor de reclamar-y-contar (`src/datos/bloqueos.ts`, SQL crudo solo en `src/datos/alcance.ts`); `enviando` cuenta. Carrera real con barrera. |
| EA-12 | **corregido** | `PrismaRaiz` opaco: los módulos no ven modelos, `$transaction` ni SQL crudo. `crearPrismaDePruebas()` en `src/testutil/`. `check:capas` endurecido. Las siembras de la auditoría no compilan (test con `tsc`). Residual abajo. |
| EA-13 | **corregido** | El reclamo guarda la hora real; el recuperador mira la edad del propio mensaje `enviando`. |
| EA-14 | **corregido** | Tipos `envio_incierto`, `automatizacion_omitida`, `baja_solicitada`, `nota_fallida` (migración `20261009050000`). `revision_manual` queda en el enum (no se puede quitar un valor de un enum sin recrearlo) como genérico heredado. |
| EA-15 | **corregido** | La transacción del aviso de 30 min vuelve a exigir `ultimo_mensaje_entrante_en < corte`. |
| EA-16 | **corregido** | Un `.ts` (y demás texto por nombre) con byte nulo se reporta como hallazgo y se escanea. |
| EA-17 | **corregido** | `crearPrismaDePruebas()` y `scripts/test-int.ts` rechazan bases cuyo nombre no termine en `_pruebas`/`_test`; test (incluye un itest corrido contra `inscripciones`). Los scripts que usan `crearPrisma()` (demo) no se tocan. |
| EA-18 | **corregido** | `SPEC.md`: Fase 2 «Planeada», Fase 3 «Detallada», sin construir. |
| EA-19 | **corregido** | Cierre extraído a `src/cierre.ts` (testeado): sale con 1 si un paso falla o se agota el tope de 30 s; `stop_grace_period: 45s` en el backend de compose (un test lo compara con el tope). |
| EA-20 | **corregido** | El recuperador del motor compara el contador `reclamos` (migración `20261009060000`) y el reclamo vencido del borde compara `intentos`; probados con filas escritas por SQL con microsegundos. |
| EA-21 | **pendiente (documentado)** | Una cuenta de Twilio por despliegue. Requisito de la primera organización adicional; no se construye el alta de organizaciones. |
| EA-22 | **pendiente (documentado)** | Verificar al arrancar que las bandejas no tengan asignación automática; probar con Twilio real. |
| EA-23 | **corregido en lo que cabía** | A3m, A5k, F1-09f, A7l y el reenviador tienen test; el cierre de `server.ts` ya se prueba. **Sigue sin test el arranque de `server.ts`** (cableado de dependencias, `listen`). |

### Verificación

Último commit de código (`4ac0bb0`), con el árbol limpio:

```
$ npm run validar          → exit 0 · lint + typecheck + check:generico (141 archivos) + check:capas (41 archivos) + tests: 194 pass, 0 fail, 0 skipped
$ npm run test:int         → exit 0 · tests 244, pass 244, fail 0, skipped 0, todo 0      (corrida 1)
$ npm run test:int         → exit 0 · tests 244, pass 244, fail 0, skipped 0, todo 0      (corrida 2, seguida)
```

Línea base antes de empezar: `validar` 169 y `test:int` 193. Migraciones nuevas (`20261009050000_tareas_por_causa`, `…060000_ejecucion_reclamos`, `…070000_evento_twilio_durable`): aplican sobre base vacía (`zz_fix_vacia_pruebas`, creada y borrada), `migrate diff --from-config-datasource` → «No difference detected», y sobre `inscripciones_pruebas` con los datos de todas las corridas anteriores. Solo agregan valores de enum y columnas con default o nulas.

### Mutaciones verificadas (quitar el arreglo → el test debe fallar)

Herramienta: un script que aplica la mutación a una copia del archivo, corre los tests dirigidos y restaura. Todas **ATRAPADAS** salvo lo marcado.

- **EA-01/EA-07.** Quitar el filtro del lead en `vencidas` y en la transacción; solo en la transacción; en el reintento de apertura; sin `try/catch` por conversación, por organización y en el reintento de apertura; ciclo sin aislar la espera, el motor o Twilio; motor sin aislar conversación, automatización, fase `programar` ni `recuperarUna`. **Sobrevive** (equivalente por doble defensa): quitar el filtro solo en la consulta `vencidas` (la transacción lo cubre).
- **EA-12.** `PrismaRaiz` con firma abierta o con `$transaction`; cada regla nueva de `check:capas` (cliente completo, `testutil`, `fetch`, `createRequire`, `import()` dinámico, `CHATWOOT_`, módulos de red, cast, importar un test, `PrismaClient`).
- **EA-16/EA-17.** Saltar siempre los `.ts` con NUL; quitar la guarda del nombre de base.
- **EA-10.** Sin validar el entrante, aceptar cualquier entrante (no el último), regla «la etiqueta manda»; `origen` o `respondeA` opcionales (falla el `typecheck`).
- **EA-11.** Sin candado (`$transaction` simple); `enviando` no cuenta; candado global en vez de por teléfono; en `bloqueos.itest`: sin `pg_advisory_xact_lock`, clave sin la organización, alcance sin `organizacion_id`, organización distinta aceptada.
- **EA-08.** F1-12 sin reclamo condicional; motor sin reclamo al ejecutar, reclamo sin condición, recuperar sin reclamo o sin comparar, programar sin `skipDuplicates`; A3i quitando `version` **y** `visible_a_asesores_en`; A3m; A5c (recheck); A5e (escritura condicional y releer); A7l (CAS); X10 (comprobar y luego actuar); A5k (`some` por `every`, vacío definitivo); F1-09f. **Sobreviven** (par redundante a propósito): en A3i, quitar `version` solo o `visible_a_asesores_en: null` solo — cada uno basta por sí solo; quitar los dos falla.
- **EA-06/14/15.** Una nota que pasa a asesor (definitiva e incierta), que frena a los siguientes o que no deja tarea; tipo genérico en el incierto; sin recheck del silencio.
- **EA-09/13/20.** Sin regla `obsoleto`, sin pasar la edad, `encolar` con `creado_en` real, atención humana evaluada después; reclamo con la hora de inicio; `enviando` sin edad; los candados del motor y del borde comparando fechas; contador sin incrementar.
- **EA-03/04/05.** Reenviador que altera el cuerpo (A7u), sigue redirecciones, no trata la 3xx como fallo, no exige 2xx, sin timeout, sin cabecera; barrido con CAS sin `intentos`, sin los `procesando`, sin la espera de 60 s, sin tope de intentos; sin borrar ni guardar el cuerpo; abandonado que se reintenta; receptor desconocido sin reenviar o sin contador.
- **EA-19.** Salir siempre con 0, sin tope, `stop_grace_period` de 10 s, sin esperar al barrido.

### Tests de la noche anterior que cambiaron (y por qué)

- `provider.itest.ts` «una nota interna … no genera tarea al contacto»: ahora exige 0 tareas `envio_incierto` y **1** `nota_fallida` (lo pide EA-06).
- `borde.itest.ts` «número receptor desconocido: 200 sin reenviar»: ahora reenvía y alerta (EA-05).
- Los que afirmaban `tipo: "revision_manual"` (motor ×5, entrega fallida ×2, provider ×1, baja ×1) ahora afirman el tipo por causa (EA-14).
- Los que encolaban sin `origen` ahora lo dicen (`automatizacion`) o contestan a un entrante sembrado con `respuestaA` (EA-10).
- `check-capas.test.ts`: el ayudante `hallazgos()` ya no repite una misma línea que viola dos reglas a la vez (las expectativas son las mismas).
- Los itests y helpers pasan de `crearPrisma()`/`PrismaClient` a `crearPrismaDePruebas()`/`PrismaPruebas` (mecánico).
- Ninguno se borró ni se debilitó; `grep -rnE "\.(skip|todo|only)\b|@ts-ignore|@ts-nocheck|eslint-disable" src scripts` no encuentra nada (los únicos `@ts-expect-error` son aserciones de tipo de pruebas, y `tsc` falla si dejan de hacer falta).

### Decisiones que tomé (con la alternativa descartada)

1. **Tipo opaco `PrismaRaiz`** (src/datos/prisma.ts) en vez de reforzar el texto de `check:capas`: el compilador rechaza alias, multilínea, `deps["prisma"]`, desestructuración y `$transaction`. Residual **documentado y no resuelto**: un doble cast deliberado a una forma escrita a mano (`x as never as { lead: … }`) compila; la guarda de texto solo lo ve si `prisma` va en la misma línea. `scripts/` sigue sin revisarse.
2. **El candado consultivo vive en `src/datos/alcance.ts`** como `$conBloqueoDeClave` y presenta la transacción sin extender con el mismo alcance mediante una función compartida (`aplicarAlcance`). Alternativas descartadas: (a) ganchos de consulta para el SQL crudo con una lista de permitidos — obligaba a cambiar a `rejects` un test existente de F1-14; (b) un candado en una conexión aparte — dos conexiones por sección crítica y riesgo de inanición del pool. El candado se toma antes de reclamar y la red (el envío) va fuera de la transacción.
3. **`origen` validado al encolar, no con una columna nueva** (`en_respuesta_a_id`): evita una migración y una llave foránea más. Límite honesto: se evita el **olvido** de la etiqueta, no la mala fe (un recordatorio justo después de un entrante real y último podría disfrazarse de respuesta).
4. **Una nota fallida deja una tarea, no se reintenta sola:** el aviso ya quedó marcado como visible y reintentar una nota vieja la mostraría fuera de contexto; la tarea avisa que el asesor se quedó sin el resumen.
5. **El barrido de Twilio guarda el cuerpo** (datos de contacto) mientras el evento está pendiente y lo borra al reenviarlo; un `abandonado` lo conserva para rescate manual.
6. **Receptor sin organización se reenvía sin registro**: Twilio podría duplicar si reintenta tras un 502 (sin organización no hay candado ni dónde registrar). Un duplicado se prefirió a perder el mensaje.
7. **«dias_permitidos vacío» (pedido de EA-07) es imposible en la base** (CHECK `cardinality > 0`): se probó el mismo mecanismo (una conversación que hace lanzar a `siguienteHorarioValido`) con una zona horaria inválida.
8. **El pendiente `obsoleto` se mide con el reloj del provider**, no con el de la base: `encolar` escribe `creado_en`. Un mensaje insertado a mano por un test o un script con el reloj de la base y despachado con un reloj inyectado muy posterior se vería obsoleto.
9. **Hallazgo extra al probar el reenviador:** ante un 401 undici reintenta el POST y un `Uint8Array` ya cedido queda «detached» (error engañoso «fetch failed»); el cuerpo viaja ahora como `Blob`.
10. **Prisma ejecuta las extensiones en el orden en que se registran** (una extensión interior ve los argumentos antes que el alcance): los ganchos de `carrera.ts` no ven `organizacion_id`; los predicados se escriben con los campos originales.

### Para Eduardo

- **Decidir EA-02** (a/b/c) y el resto de la sección 8 de la auditoría que no son código: borrado de un lead (¿cierra su conversación?), una cuenta de Twilio por organización, verificación de la asignación automática de Chatwoot.
- **Excepción al invariante 4** (no toqué `CLAUDE.md`): `ReenviadorTwilioHttp` hace `fetch` a Chatwoot desde `src/mensajeria/`; propongo dejar por escrito que `src/mensajeria/twilio/` es una excepción acotada (no inicia mensajes), o moverla detrás del provider.
- El contrato de `encolar` cambió para D3, D8 y H6: `origen` obligatorio, y una respuesta se construye con `respuestaA(entranteId, …)`.
- Para los bloques de cupo y dinero: `src/testutil/carrera.ts` (`Barrera`, `conGanchos`, `soloOrganizaciones`) y `transaccionConBloqueo()` de `src/datos/bloqueos.ts`.
- Los eventos de Twilio `abandonado` y los avisos `webhook_twilio_organizacion_desconocida` salen como líneas `error` del log; aún no hay tablero que los muestre.
