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
| B1 | HECHO | 25c3392 | Usuarios, roles, sesiones y contraseñas con scrypt; login con bloqueo; CSRF |
| B2 | HECHO | 48e963e | Matriz permiso×rol, alcance por sucursal y por grupo del maestro, usuarios/grupos/tareas/leads |
| B3 | HECHO | c0cb71f | API base: errores, validador, paginación, registro de cambios solo de anexar, cabeceras; docs/API.md |
| B4 | HECHO | e6511d6 | Datos sensibles: ficha de salud cifrada, registro de accesos, redacción en logs, `check:sensibles` y test de fuga |
| B5 | HECHO | 08fc9eb | Usuario ↔ agente de Chatwoot, qué asesor tiene cada conversación |
| B6 | HECHO | c73d7b9 | Límite de peticiones por IP y ruta, 429 con Retry-After, `trust proxy`, tope de cuerpo por ruta |
| B-fix | HECHO (6 pendientes, 1 decisión) | 25616f5…6a19fad | Correcciones de la auditoría de la etapa B (`docs/auditorias/etapa-B.md`): ver la sección «Correcciones de la auditoría de la etapa B» |
| C1 | HECHO | 96d241f | Instructores y salones: tabla `salon`, `grupo.salon_id`, choques de salón e instructor (función pura + API 409 + disparadores en la base) |
| C2 | HECHO | 32c8f41 | Precios versionados por fecha (exclusión btree_gist), `precioVigente`, `src/lib/dinero.ts` en centavos `bigint` y `check:dinero` |
| C3 | HECHO | d6c38f4 | Promociones: tablas del modelo, resolutor puro (prioridad, acumulación, cupo, montos exactos), consumo de cupo atómico y API CRUD |
| C4 | HECHO | c4bdc80 | Catálogo completo de las tres verticales del insumo (14 programas, 18 grupos, 31 horarios) con salones, instructores, precios y promociones de ejemplo; las tres verificaciones como tests |
| C5 | HECHO | ver sección | Cotizador determinista: `src/cotizador/` (puro + capa de consulta), `programa.fecha_corte_edad`, `edadCumplida`, horarios en español, `GET /api/cotizador` |
| C6 | HECHO | ver sección | Varios programas para una edad: el bot (máquina pura) pregunta cuál, lo guarda en `prospecto.programa_sugerido_id`; `vertical.cotizador_whatsapp_activo` |
| C7 | HECHO | ver sección | Otra sucursal: política `configuracion_organizacion.sucursal_sin_programa` (`ofrecer_otra` por defecto | `avisar_asesor`), paso `otra_sucursal` |
| C8 | HECHO | ver sección | Cotización guardada (`cotizacion`, snapshot congelado) y cotizador por WhatsApp por vertical: el bot cotiza, el contacto elige horario, handoff con la cotización; `GET/POST /api/leads/:id/cotizaciones` |
| C9 | HECHO | ver sección | Lista de espera: tabla `lista_espera` (posición densa y única, alta atómica), el bot la ofrece en un horario lleno, API de asesor (listar, quitar, mover) y `ofrecerLugarLiberado` |
| C-fix | HECHO (12 pendientes, 7 decisiones) | cd6ba4e…a9690ad | Correcciones de la auditoría de la etapa C (`docs/auditorias/etapa-C.md`): ver la sección «Auditoría y correcciones de la etapa C» |
| D1 | HECHO | e2bfc20 | Clase muestra: tabla `clase_muestra`, sesiones por zona horaria, lugares de la sesión con candado de cupo, reprogramar atómico, `tipo_sistema` de etapa, API y bot |
| D2 | HECHO | 576f00e | Aviso al maestro: `aviso_maestro` (lista en la aplicación + unidad de envío), `MessagingProvider.avisarAInstructor` con todas las reglas, `conversacion_instructor` y plantillas del seed |
| D3 | HECHO | 7df6d8d | Recordatorios de 24 h y 2 h: evento `clase_muestra_proxima`, plan puro con el borde «posterior o igual», cancelación al reprogramar o cancelar, el motor ejecuta clases |
| D4 | HECHO | de73e25 | Asistió / no asistió (transiciones válidas, corrección con ventana, etapa del lead) y recuperación de quien no llegó (evento `clase_muestra_no_asistio`, intentos espaciados con tope, tarea de llamar) |
| D5 | HECHO | ver `git log` (`D5:`) | Registro del maestro por API: `registro_clase_muestra` + `registro_tutor`, salud solo con `guardarSensible()`, borrador → completo → cerrado, permisos por rol, conversión sin recaptura |
| D6 | HECHO | ver `git log` (`D6:`) | Reglamento y autorización de imagen: `documento_legal` versionado e inmutable, `aceptacion_legal` de solo anexar con evidencia, revocación como fila nueva, el registro no cierra sin reglamento |
| D7 | HECHO | ver `git log` (`D7:`) | Embudo con historial de solo anexar, motivos de pérdida, perdido/recuperado, matriz de transiciones, tiempo por etapa, leads estancados (consulta) y concurrencia por lead |
| D8 | HECHO | ver `git log` (`D8:`) | Lead frío y promoción por vencer sobre el motor: eventos nuevos, `aviso_promocion` (uno por lead y promoción), plantillas de marketing por el provider con frecuencia, bajas, horario y atención humana |
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

## Cierre de la etapa A

- Auditoría de cierre: `docs/auditorias/etapa-A.md` (1 ALTA, 11 MEDIA, 11 BAJA). La ALTA (EA-01) y casi todos los demás se corrigieron en commits `A-fix` (ver la sección anterior). Pendientes que son decisión de Eduardo: EA-02 (estados de entrega de Twilio en la vía A), EA-21, EA-22 y la excepción del borde de Twilio al invariante 4 (no toqué `CLAUDE.md`).
- Verificación personal en el último commit: `npm run validar` exit 0 (194 tests); `npm run test:int` exit 0 (244 tests).
- Etiqueta `etapa-A`.

## B1. Usuarios y roles

**Qué se hizo**
- **Tablas** (migración `20261010000000_usuarios_y_sesiones`): `usuario` (correo normalizado en minúsculas, único entre los vivos de la organización; rol como enum `rol_usuario`: administrador, asesor, maestro, recepcion; `contrasena_hash`; `activo`), `usuario_sucursal` (M:N; el administrador ve todas sin filas), `sesion` (solo el SHA-256 del token, `expira_en`, `ultima_actividad_en`, `revocada_en`), `intento_acceso` (bloqueo). `organizacion.slug` (único entre las vivas, `CHECK` de formato; backfill desde el nombre en la migración, con sufijo del id si dos coinciden). Índices parciales y CHECK a mano al final de la migración.
- **Contraseñas** (`src/auth/contrasena.ts`): `scrypt` de `node:crypto`, N=2^15, r=8, p=3 (combinación equivalente de OWASP), sal de 16 bytes por usuario, formato `scrypt$N$r$p$sal$hash` que recuerda sus parámetros, comparación con `timingSafeEqual`, NFKC, cotas de parámetros al leer de la base. Política: 10 a 128 caracteres, ni el correo ni el nombre, ni un solo carácter repetido. Sin dependencias nuevas.
- **Sesiones** (`src/auth/sesiones.ts`): token de 32 bytes aleatorios (base64url) en cookie `sesion` `HttpOnly; SameSite=Lax; Path=/` y `Secure` con `NODE_ENV=production` (o `COOKIE_SEGURA`). Expiración absoluta de 12 h; inactividad configurable (`SESION_INACTIVIDAD_MIN`, 120 por defecto). La actividad se refresca a lo más cada minuto con una escritura condicional a `revocada_en IS NULL`. El usuario se relee en cada petición: desactivarlo o borrarlo corta la sesión al instante.
- **Login** (`src/auth/acceso.ts`, `POST /api/sesion {organizacion?, correo, contrasena}`): un solo mensaje y un solo código para organización inexistente, correo inexistente, usuario inactivo y contraseña mala; si el usuario no existe se verifica contra un hash ficticio con los mismos parámetros. Bloqueo temporal por (correo, IP): 5 intentos en 15 min; el cupo se RESERVA antes de verificar bajo un candado consultivo (`transaccionConBloqueo`) y se libera al acertar, así que intentos simultáneos no se cuelan. También cuenta para correos inexistentes. `DELETE /api/sesion` (siempre 204), `GET /api/yo`, `POST /api/yo/contrasena` (exige la actual con el mismo bloqueo, aplica la política y cierra las demás sesiones).
- **Excepción acotada al scope** en `src/datos/sistema.ts` (documentada en su encabezado): `resolverOrganizacionPorSlug`, `unicaOrganizacion` (si hay exactamente una organización viva el campo `organizacion` puede omitirse) y `buscarSesionPorHash` (la cookie solo trae un token; la sesión dice la organización, y de ahí todo va con `conAlcance`). El usuario por correo NO necesita excepción: se busca ya dentro del alcance.
- **CSRF** (`src/api/csrf.ts`): SameSite=Lax + todo método que cambia algo debe traer `Content-Type: application/json` o `X-Requested-With`, y su `Origin`/`Referer`, si vienen, deben coincidir con `ORIGEN_PUBLICO` (o con el propio host si no está configurado).
- **Esqueleto de API** necesario para el login: `src/api/` (`errores.ts` con la convención, `validar.ts`, `cookies.ts`, `csrf.ts`, `cabeceras.ts`, `autenticar.ts`, `contexto.ts`, `index.ts`), montado en `crearApp` solo si se pasa `api`. B3 completa lo que falta (paginación, registro de cambios, documentación).
- **Seed**: `prisma/seed/demo.sql` trae `slug` y cuatro usuarios de demo (contraseña común `Demo-local-2026!`, hashes precalculados, marcados solo-demo) y las sucursales del asesor y de recepción. `scripts/crear-usuario.ts` da de alta al primer administrador real (o imprime solo el hash con `--solo-hash`).
- `src/testutil/api.ts`: `sembrarUsuario`, `levantarApi` (la app real en un puerto libre) y `ClienteApi` con frasco de cookies.

**Verificación**
- `npm run validar` → exit 0 · `ℹ tests 201 · pass 201 · fail 0` · `check:generico: 162 archivos` · `check:capas: 57 archivos`.
- `npm run test:int` → exit 0 · `ℹ tests 265 · pass 265 · fail 0` (antes 244).
- Tests: `contrasena.test.ts` (7), `sesion.itest.ts` (21): cookie y hash en base, mensajes idénticos, expiración absoluta con uso continuo, inactividad, desactivar corta la sesión, cambio de contraseña, CSRF (origen ajeno, formulario, ORIGEN_PUBLICO), 404 JSON y cabeceras, bloqueo (misma pareja, otra IP, otro correo, correos inexistentes, ventana), bloqueo con 12 intentos simultáneos (5 y 7), dos logins simultáneos, revocación vs uso simultáneo, refresco condicional en medio de la validación, aislamiento entre organizaciones.
- Mutaciones: refresco de actividad sin `revocada_en: null` → falla el test del refresco; reservar el intento sin candado (`$transaction` simple) → falla el de los 12 simultáneos.

**Decisiones que tomé**
- *Bloqueo en la base y no en memoria*: sobrevive a un reinicio y a varias réplicas. Costo: una fila por intento fallido (se marcan eliminadas al acertar; no hay `DELETE` físico). Alternativa descartada: contador en memoria (lo resuelve B6 solo por IP).
- *Bloqueo por (correo, IP)*, como se pidió: un atacante con muchas IPs puede probar contraseñas contra un mismo correo; lo frena el costo de scrypt, la política de 10 caracteres y el límite por IP de B6. Alternativa descartada: bloqueo solo por correo (permite dejar fuera a cualquiera con 5 intentos).
- *`slug` nullable*: las organizaciones de prueba nacen sin él; las reales lo reciben del seed. Alternativa descartada: NOT NULL con default; obligaba a inventar uno en cada alta.
- *Sin rehash automático* al subir los parámetros de scrypt: el hash guarda los suyos y sigue valiendo; se puede agregar al login cuando haga falta.
- *`Secure` según entorno*, no siempre: la demo corre en http://localhost.
- *Tests existentes cambiados porque cambió el seed*: `catalogo`, `prueba-de-fuego` y `configuracion` ahora re-prefijan también el `slug` del seed (global entre organizaciones vivas); nada se debilitó.
- La API de usuarios (`/api/usuarios`) y los permisos llegan en B2; este bloque no deja ninguna ruta con permiso, solo sesión.

**Para Eduardo**
- La contraseña de los usuarios de demo es conocida y está en el repo a propósito; no usar ese seed fuera de la demo.
- Decidir si se quiere 2FA o inicio de sesión con terceros más adelante (hoy fuera de alcance por la decisión 11).

## B2. Autorización por rol y sucursal

**Qué se hizo**
- **Matriz en un solo archivo**, `src/api/permisos.ts`: permisos `recurso:acción` → roles (`usuarios:administrar`, `leads:leer|escribir`, `tareas:leer|resolver`, `conversaciones:leer`, `grupos:leer`, `catalogo:leer|escribir`, `registro_cambios:leer`, `salud:leer|escribir`). Lo que no está, se niega. `requierePermiso(...)` (`src/api/autorizar.ts`) es el único modo en que una ruta decide; el nombre del permiso es un tipo, así que uno inexistente no compila.
- **Alcance** (`src/api/alcance.ts`): `alcanceDeSucursales(db, usuario)` (administrador: todas; asesor y recepción: las de `usuario_sucursal`), `filtroDeSucursal()` para armar el `where`, y `ctx.alcance()` memoizado por petición. Un maestro se limita por GRUPOS: la tabla nueva `instructor` (migración `20261010010000_instructor_y_grupo`: `organizacion_id`, `usuario_id` opcional único entre los vivos, `nombre`, `activo`) y `grupo.instructor_id` (FK compuesta opcional). No hay salones ni choques (C1).
- **Rutas reales** (todas con `autenticar` + `requierePermiso`): `GET /api/yo` (usuario, sucursales, permisos), `GET|POST /api/usuarios` y `PATCH /api/usuarios/:id` (administrador), `GET /api/grupos`, `GET /api/tareas`, `PATCH /api/tareas/:id` (hecha/descartada, atómico), `GET /api/leads` y `GET /api/leads/:id`.
- **Reglas de usuarios**: el correo no se cambia; no puedes desactivarte ni quitarte el rol de administrador; nunca queda la organización sin un administrador activo (comprobado bajo el candado `usuarios:administradores`); desactivar, cambiar el rol o restablecer la contraseña cierra sus sesiones; un usuario con rol maestro tiene su `instructor` (se crea si falta); las sucursales se reemplazan marcando eliminadas las que sobran.
- **Un recurso fuera de tu alcance o de otra organización da 404**, nunca 403 (no se confirma que exista). Un id mal formado da 400.
- Se adelantó de B3 lo que las listas necesitan: `src/api/paginacion.ts` (`?limite=&pagina=`, tope de 100, respuesta `{datos, paginacion}`).
- Seed: el instructor del maestro de la demo y dos grupos suyos (`Lun-Mié…`) en `catalogo.sql`. Los ids del seed pasaron a la convención de 3 dígitos (`…501`, `…511`, `…521`) para que los tests puedan re-prefijarlos.

**Verificación**
- `npm run validar` → exit 0 (`check:generico: 173 archivos`, `check:capas: 65 archivos`); `npm run test:int` → exit 0 · `ℹ tests 287 · pass 287 · fail 0` (antes 265).
- `permisos.test.ts` (4): la matriz comparada con una copia escrita a mano (cambiarla obliga a cambiar el test), el administrador lo tiene todo, salud solo administrador y maestro.
- `autorizacion.itest.ts` (22): la tabla permiso × rol (12 permisos × 4 roles = 48 comprobaciones, 200/403, sobre una ruta de sonda con `requierePermiso`) y la tabla de las rutas reales por rol; alcance de leads, tareas y grupos por rol y sucursal; el maestro solo ve sus grupos (y uno sin grupos ve la lista vacía); seis resoluciones simultáneas de una tarea → 1 vez 200 y 5 veces 409; altas simultáneas del mismo correo → una; dos administradores que se quitan el rol a la vez → queda uno; no-fuga entre organizaciones en las dos direcciones (leer, modificar, listar y filtrar con ids ajenos).
- Mutaciones atrapadas: candado de «último administrador» → `$transaction` simple; filtro de sucursal en el PATCH de tareas y en el detalle de leads; filtro del maestro; resolver sin `estado: pendiente`.

**Decisiones que tomé**
- *Un lead sin sucursal lo ve solo el administrador.* Alternativa descartada: que cualquier asesor vea los leads sin sucursal (para atenderlos); los dejaría ver teléfonos de otras sucursales. Si quieres lo contrario, es una línea en `filtroDeSucursal`.
- *Recepción NO tiene `salud:*` ni `tareas:*` ni `conversaciones:leer`*; el asesor tampoco tiene `salud:*`. Mínimo privilegio; ampliar es una fila en la matriz.
- *El permiso `salud:leer` del maestro se queda corto a propósito*: «maestro del grupo» necesita la inscripción (F3); hasta entonces B4 falla cerrado para el maestro.
- *404 y no 403* para lo ajeno. Alternativa descartada: 403 (confirma que el id existe).
- *El `instructor` se crea al crear o promover a un maestro* para que «sus grupos» funcione sin otro paso. Alternativa descartada: alta manual del instructor (C1 lo hará con salones y disponibilidad).
- *Sin registro de cambios todavía*: las escrituras de este bloque lo reciben en B3.

**Para Eduardo**
- Revisar la matriz (`src/api/permisos.ts`): sobre todo que recepción no vea tareas ni conversaciones y que el asesor no escriba el catálogo.

## B3. API base

**Qué se hizo**
- **Un solo montaje** `src/api/` detrás de `/api` (`crearApiRouter`, un router por recurso en `src/api/rutas/`). Orden fijo: cabeceras de API → CSRF → rutas públicas → `autenticar` → rutas → 404 JSON → manejador de errores. `docs/API.md` documenta convenciones, rutas y la guía para agregar un recurso, un permiso y un registro de cambio.
- **Convención de errores** (`src/api/errores.ts`): `{ error: { codigo, mensaje, detalles? } }` con los códigos estables `no_autenticado`, `prohibido`, `no_encontrado`, `validacion`, `conflicto`, `limite_excedido`, `interno`. El manejador (`errores-http.ts`) traduce también los errores del parser de cuerpos (413, JSON inválido) y, ante cualquier otro, responde `interno` genérico; en el log de un error de Prisma solo van el tipo y el código (sus mensajes citan los valores de la consulta).
- **Validador propio** (`src/api/validar.ts`, sin librerías): `texto`, `entero`, `booleano`, `enumerado`, `uuid`, `correo`, `listaDe`, `opcional`, `nulable`, `objeto` (rechaza campos desconocidos), y para la query `enteroDeTexto`/`booleanoDeTexto`; `parsear` y `parsearQuery` juntan TODOS los errores. Tipos inferidos del esquema.
- **Paginación** (`paginacion.ts`): `?limite=&pagina=`, defecto 25, tope duro 100 (se recorta y la respuesta dice el límite real), página hasta 10 000, `{datos, paginacion:{pagina,limite,total}}`, orden estable (criterio + `id`).
- **Registro de cambios** (migración `20261010020000_registro_cambio`): tabla `registro_cambio` (organización, usuario, entidad, accion, antes/despues JSON) **solo de anexar** — un disparador impide UPDATE y DELETE —. `registrarCambio(tx, ctx, …)` va en la misma transacción que el cambio y guarda SOLO los campos de la lista blanca de su entidad (`CAMPOS_AUDITABLES`); al cargar el módulo se verifica que ninguna lista nombre contraseñas, tokens ni hashes. Lo usan alta y cambio de usuarios (la contraseña se registra solo como «restablecida»), resolver tareas y cambiar la contraseña propia. `GET /api/registro-cambios` (solo administrador; filtros por entidad, id y usuario).
- **Cabeceras de seguridad** (`cabeceras.ts`): `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer` en todo el backend (HSTS con cookie segura); en `/api` además CSP `default-src 'none'; frame-ancestors 'none'`, `Cache-Control: no-store` y `Cross-Origin-Resource-Policy`.

**Verificación**
- `npm run validar` → exit 0 (`ℹ tests 219` unitarios; `check:generico: 179`, `check:capas: 67`). `npm run test:int` → exit 0 · `ℹ tests 297 · pass 297 · fail 0` (antes 287).
- `validar.test.ts` (10) y `registro.test.ts` (4): campos desconocidos, todos los errores juntos, sin coacción, `__proto__`, query con parámetros repetidos, lista blanca con la fila completa y la contraseña presente.
- `base.itest.ts` (10): crear/modificar/restablecer deja `crear`, `actualizar` (solo `rol`) y `restablecer_contrasena` sin rastro de contraseña ni hash; un cambio rechazado (409/404/400) no deja registro; si registrar falla (gancho que lanza) el cambio se revierte y el cliente ve `interno` sin el texto; solo el administrador lo consulta y no ve otra organización; UPDATE, DELETE y el soft delete del registro fallan por el disparador; paginación con 7 filas de la MISMA fecha en tres páginas (sin repetidos ni huecos); tope y entradas inválidas; un fallo de la base no filtra nada; forma de cada código de error.

**Decisiones que tomé**
- *El registro es solo de anexar, también contra el soft delete.* La convención dice «nunca DELETE físico»; para una tabla de auditoría tampoco se admite `eliminado_en` (la columna existe por la convención y nunca se usa). Alternativa descartada: permitir `UPDATE` de `eliminado_en`.
- *`usuario_id` obligatorio* en el registro: todo cambio tiene autor. Los procesos del sistema que escriban en el futuro (barridos) tendrán que decidir su autor.
- *La paginación se recorta, no se rechaza* (`limite=1000` → 100). Alternativa descartada: 400; el cliente aprende el tope de la respuesta.
- *`actualizar` guarda solo diferencias* y no escribe nada si no cambió lo auditable.
- *Paginación y errores se adelantaron a B2* porque las primeras rutas ya los necesitan; B3 los fija como convención y los documenta.

**Para Eduardo**
- Qué entidades se auditan hoy: usuarios, tareas (y el vínculo de Chatwoot en B5). Cada bloque que agregue una escritura debe agregar su entidad a `CAMPOS_AUDITABLES`.

## B4. Datos sensibles (decisión 12)

**Qué se hizo**
- **Lista central** `src/sensibles/campos.ts`: las columnas de la ficha (`alergias`, `condiciones_medicas`, `medicamentos`, `contacto_emergencia`, `autorizacion_atencion_medica`) y las RAÍCES que delatan un dato de salud en cualquier nombre (snake_case, camelCase, con o sin acento: `alergia`, `medicament`, `tipo_sangre`, `seguro_medico`, `observaciones_medicas`, `ficha_salud`…), más las raíces de secretos (`contrasena`, `token`, `cookie`, `hash`…). Una sola fuente para el log, el registro de cambios y la guarda estática.
- **Redacción automática en `src/lib/log.ts`**: toda clave sensible o secreta sale como `[REDACTADO]` a cualquier profundidad (también en arreglos), y cualquier valor envuelto en `Sensible` (`src/sensibles/marca.ts`: `toJSON`, `toString`, `util.inspect` y plantillas lo ocultan; solo `revelar()` lo muestra). Maneja ciclos y profundidad.
- **Tabla `ficha_salud`** (migración `20261010030000_datos_sensibles`): `sujeto_tipo` (`prospecto|alumno`) + `sujeto_id` y una columna por campo con el valor CIFRADO con AES-256-GCM (`src/sensibles/cifrado.ts`; clave `CLAVE_DATOS_SENSIBLES`; datos asociados = organización|sujeto|campo, así que un texto cifrado copiado a otra fila o campo no descifra). Una ficha viva por sujeto (índice parcial). **Nadie la consulta directamente**: `check:capas` tiene una regla nueva («decisión 12») que prohíbe nombrar `ficha_salud` o `acceso_dato_sensible` fuera de `src/sensibles/`.
- **`leerSensible()` / `guardarSensible()`** (`src/sensibles/ficha.ts`): exigen el permiso (`salud:leer` / `salud:escribir`: solo administrador y maestro), comprueban que el sujeto exista en la organización, y para el maestro además que sea de SUS grupos (`maestroDelSujeto`); registran cada acceso en **`acceso_dato_sensible`** (quién, a quién, qué campos —solo nombres—, motivo, ruta; solo de anexar por disparador; también los intentos denegados) en la MISMA transacción que la lectura; devuelven los valores envueltos en `Sensible`. La escritura se serializa por sujeto con un candado consultivo.
- **API** `GET/PUT /api/salud/:sujeto_tipo/:sujeto_id` (`src/api/rutas/salud.ts`, la única ruta que revela valores): `motivo` obligatorio, `campos` opcional, teléfono de emergencia por `normalizarTelefono()`, lo ajeno o no permitido para el maestro da 404.
- **Guarda estática** `npm run check:sensibles` (`scripts/check-sensibles.ts`, ya parte de `validar`): falla si un nombre de campo sensible aparece (1) dentro de una llamada a `log.info|warn|error`, (2) dentro de una llamada que arma un mensaje, una nota o una tarea (`encolar`, `enviarMensaje`, `enviarPlantilla`, `enviarNotaInterna`, `respuestaA`, `resumenParaAsesor`, `asegurarTarea*`…) o (3) en cualquier parte de `src/` fuera de `src/sensibles/` y la ruta de salud. Ignora comentarios y tests. Sus tests siembran cada violación.
- **Test de fuga** `src/sensibles/fuga.itest.ts`: una organización cuyos menores tienen ficha con valores CENTINELA; se ejecutan la captura completa con handoff (con la ficha ya creada cuando se arma la nota), el aviso de 30 min, el reenganche del motor, la baja y la baja que vuelve a escribir, la entrega fallida, el fallo de la nota y las denegaciones, con `TransporteFalso` y un colector de logs; exige que ningún centinela aparezca en los logs, en los envíos del transporte ni **en ninguna tabla de la organización, fila por fila** (la ficha guarda texto cifrado). Incluye un control que muestra que el detector sí ve una fuga.
- Seguridad de arranque: `server.ts` construye el cifrador al arrancar, así que con `NODE_ENV=production` sin `CLAVE_DATOS_SENSIBLES` el backend no arranca. En compose la demo trae una clave pública a propósito.

**Verificación**
- `npm run validar` → exit 0 · `ℹ tests 235 · pass 235` · `check:generico: 192` · `check:capas: 73` · `check:sensibles: 73 archivos`. `npm run test:int` → exit 0 · `ℹ tests 314 · pass 314 · fail 0` (antes 297).
- Mutaciones atrapadas: sin la redacción por clave en `log` (falla el test de fuga); sin la regla del maestro; sin registrar el acceso de lectura; datos asociados fijos en el cifrado; guardar sin cifrar (9 tests); sin el candado de escritura (con una carrera forzada por barrera). Equivalente que sobrevive: quitar el `if (esSensible)` de `redactar` — un `Sensible` no tiene propiedades enumerables, así que la rama genérica ya lo deja en `{}` (defensa doble).

**Decisiones que tomé**
- *Cifrar en la aplicación y no solo «no seleccionar por defecto»*: un volcado de la base no revela salud de menores, y ninguna consulta accidental puede mostrarla. Costo: la clave en el entorno y sin rotación (el prefijo `v1` la deja abierta). Alternativa descartada: columnas en claro con un `omit` global (un `SELECT *` o un respaldo las expondría).
- *Maestro: tiene el permiso pero falla cerrado* hasta que exista la inscripción; la regla se conecta en `maestroDelSujetoPorDefecto` (F1/F3). Alternativa descartada: dejarlo leer cualquier ficha de la organización.
- *Recepción NO lee ni escribe salud* (ni el asesor): mínimo privilegio; la inscripción por WhatsApp o en mostrador capturará la ficha por la ruta que F1/F3 decidan (ampliar es una fila en la matriz).
- *`sujeto_id` polimórfico sin llave foránea* (el brief fija `prospecto|alumno`): el servicio comprueba que exista dentro de la organización; F1 agrega la comprobación de `alumno`. Alternativa descartada: dos columnas con FK (no hay tabla `alumno` todavía).
- *`motivo` obligatorio en la lectura*: deja constancia de por qué se abrió el dato. El cliente (J2) pondrá uno por defecto razonable.
- *El maestro denegado recibe 404*, no 403 (no confirma que el menor exista); el intento queda registrado.
- *La redacción es por clave*: un texto libre con el valor sí pasa. Por eso existen la guarda estática y el test de fuga; ninguna de las dos cubre un flujo nuevo hasta que se agregue: **quien agregue un flujo con datos de salud debe sumarlo a `fuga.itest.ts`**.
- *Se movió `esCampoProhibidoEnRegistro`* de `registro.ts` a `sensibles/campos.ts` (ahora cubre también salud).

**Para Eduardo**
- Decidir quién captura la ficha en la inscripción (hoy solo administrador y maestro pueden escribirla) y cuándo la ve el maestro (la regla «sus grupos» llega con F1/F3).
- La clave de la demo está en `docker-compose.yml`; en producción va en el gestor de secretos y respaldarla es tan importante como respaldar la base (sin ella los datos no se recuperan).

## B5. Usuario y agente de Chatwoot

**Qué se hizo**
- **Esquema** (migración `20261010040000_agente_chatwoot`): `usuario.chatwoot_agent_id` (único entre los vivos de la organización, índice parcial); en `conversacion`, `asignada_a_usuario_id` (FK compuesta a `usuario`) y `asignada_a_agente_chatwoot_id` (el agente tal como lo dice Chatwoot).
- **Adaptador `DirectorioAgentes`** (`src/mensajeria/directorio.ts`, invariante 11): interfaz `listarAgentes(cuenta)`; `DirectorioAgentesFalso` (agentes declarados en la prueba, con falla simulable) y `DirectorioAgentesChatwoot` (`src/mensajeria/chatwoot/directorio.ts`, invariante 4) sobre `GET /api/v1/accounts/:id/agents` con el token de un administrador de la cuenta (`CHATWOOT_ADMIN_TOKEN`), sin seguir redirecciones, con tiempo máximo y tolerante a entradas mal formadas. `directorioAgentesDesdeEntorno()`: real con `CHATWOOT_URL` + token; falso vacío fuera de producción; `null` en producción (vincular responde 409).
- **Asignación** (`src/captacion/toma.ts`): el evento real de asignación (`conversation_updated` con `assignee_id`, A3) guarda ahora el agente y el usuario vinculado a él — también cuando la conversación ya estaba en manos de una persona (reasignación) —; la organización sale de la bandeja, nunca del id del agente. Nuevo `interpretarDesasignacion` + `registrarDesasignacionDeConversacion` para el payload real de «quitar al asesor» (`assignee_id → null`): borra la asignación anotada y NO cambia el estado de atención (conservador, como A3). El webhook de Chatwoot lo enruta en `app.ts` y `server.ts` lo conecta.
- **Endpoints**: `POST /api/usuarios/:id/vincular-chatwoot {agente_id?}` (administrador; sin `agente_id` busca por correo; deja `registro_cambio`; 409 si el agente ya es de otro usuario —también en carrera, con el índice como respaldo— o si Chatwoot no responde; 404 sin agente con ese correo; 400 con un `agente_id` que no existe) y `GET /api/conversaciones?asignada_a=yo|nadie|<usuario>&estado=` (permiso `conversaciones:leer`: administrador y asesor; alcance por sucursal del lead). `GET /api/usuarios` ahora devuelve `chatwoot_agent_id`.
- Vincular completa las conversaciones que ya estaban asignadas a ese agente antes del vínculo (por eso se guarda también el id del agente), y quita al usuario las del agente anterior si se le cambia.

**Verificación**
- `npm run validar` → exit 0 (`ℹ tests 240 · pass 240`; `check:generico: 198`, `check:capas: 76`, `check:sensibles: 76`). `npm run test:int` → exit 0 · `ℹ tests 324 · pass 324 · fail 0` (antes 314).
- `chatwoot.itest.ts` (10), con el directorio falso y los payloads REALES `payload-conversacion-asignada.json` / `payload-conversacion-desasignada.json` apuntados a la bandeja de prueba: vincular por correo, por id, errores (400/404/409), carrera de dos vínculos al mismo agente (uno gana), caída del directorio sin filtrar el detalle, otra organización → 404; asignación guarda agente y usuario, reasignación con estado sin cambio, desasignación borra y no devuelve el bot, agente sin usuario y vínculo posterior, mismo id de agente en otra organización no cruza, FK compuesta en la base; `asignada_a=yo|nadie|uuid`, alcance por sucursal, recepción y maestro 403, no-fuga. `directorio.test.ts` (3) contra un servidor HTTP local; `webhook.test.ts` y `app.test.ts` (+1 cada uno) para la desasignación.
- Mutaciones atrapadas: sin guardar la asignación en la toma, sin completar conversaciones al vincular, sin el filtro de sucursal de las conversaciones. Equivalente: sin la comprobación previa de «agente de otro usuario» (el índice único responde 409 igual).

**Decisiones que tomé**
- *Se guarda también el id del agente* (`asignada_a_agente_chatwoot_id`) además del usuario pedido: si el asesor se vincula después de que le asignaron conversaciones, sin él no habría cómo recuperarlas. Alternativa descartada: solo `asignada_a_usuario_id` (perdería esas asignaciones).
- *Desasignar borra la asignación pero no el estado de atención.* Alternativa descartada: devolver el bot (ver A3).
- *Mensaje de un asesor no cuenta como asignación* (solo el evento de asignación): un asesor que responde sin habérsela asignado no queda como dueño.
- *Directorio por cuenta, primera cuenta de la organización*: hoy cada organización tiene una cuenta de Chatwoot (EA-21).
- *El directorio devuelve 409 cuando Chatwoot no responde* y no 502/500, y sin el detalle: el administrador sabe que reintente.

**Para Eduardo**
- En un ambiente real hace falta `CHATWOOT_ADMIN_TOKEN` (un administrador de la cuenta); la demo ya lo trae en `config/demo-local.env`.
- Los usuarios deben tener el MISMO correo que su agente de Chatwoot para vincularlos sin escribir el id.

## B6. Protección de rutas públicas

**Qué se hizo**
- **Limitador en memoria** (`src/http/limite.ts`): cubeta de fichas (token bucket) por clave, con ráfaga = cupo por minuto y recarga continua, reloj inyectable y **tope de memoria** (`LIMITE_MAX_CLAVES`, 50 000 cubetas: al llenarse se tiran primero las inactivas —ya llenas— y luego las menos usadas). Claves por IP (`src/http/ip.ts`: se quita el prefijo de IPv4 mapeada y las IPv6 se agrupan por /64) y por ruta.
- **Dónde se aplica** (`src/http/limite-http.ts`, `src/http/app.ts`, `src/api/index.ts`): login (10/min por IP, antes de leer el cuerpo y además del bloqueo por correo+IP de B1); el resto de `/api` (600/min, antes de revisar la sesión); la landing (perfil `landing`, 30/min, listo para E1); y los **webhooks públicos** de Chatwoot y de Twilio (entrantes y estados, cupo separado cada uno) con dos protecciones: cupo de **firmas inválidas** por IP (30/min; agotado, 429 sin leer el cuerpo) y un techo generoso por IP (6 000/min). El tráfico firmado y legítimo no gasta el cupo de fallos.
- **Respuestas 429 con `Retry-After`**: en `/api` con la convención de errores (`limite_excedido`); en los webhooks, sin cuerpo.
- **`trust proxy` configurable** (`TRUST_PROXY`: número de saltos, lista de redes; por omisión ninguno): sin configurarlo, `X-Forwarded-For` se ignora y no sirve para esquivar el límite.
- **Tope de cuerpo por ruta** centralizado en `src/api/cuerpos.ts` (login 4 KB, API 100 KB, Twilio 100 KB, Chatwoot 1 MB, landing 16 KB); 413 al pasarlo.
- Configuración por variables (`src/http/config-limites.ts`, `.env.example`); `server.ts` siempre las pasa. Sin `limites` (los demás tests de la app) no se limita nada.
- **Documentado en `docs/API.md` lo que NO resuelve**: el estado vive en el proceso (varias réplicas multiplican el límite y un reinicio lo borra: haría falta Redis/la base o un WAF/balanceador), IPs compartidas (NAT) comparten cupo, un atacante con muchísimas IPs no se frena por IP, y nada contra DoS volumétrico.

**Verificación**
- `npm run validar` → exit 0 (`ℹ tests 257`; `check:generico: 204`, `check:capas: 79`, `check:sensibles: 79`). `npm run test:int` → exit 0 · `ℹ tests 330 · pass 330 · fail 0`, **dos corridas seguidas** (antes 324).
- `limite.test.ts` (9): ráfaga, recarga y tope, claves independientes, `espiar`, tope de memoria con 600 claves y una IP activa que conserva su cubeta, inactivas primero, IP/IPv6, configuración y `TRUST_PROXY`. `limites.test.ts` (8, sin base): 200 webhooks firmados de Twilio y 100 de Chatwoot seguidos desde una IP sin un solo 429; ráfaga de firmas inválidas → 429 con `Retry-After` y sin llegar al borde; otra IP intacta; sin `trust proxy` falsificar `X-Forwarded-For` no da cupo; techo; cupos separados por ruta; 413. `limites.itest.ts` (6): login por IP (incluso con la contraseña correcta), otra IP y recarga con reloj de mentira, límite general de `/api`, 90 peticiones normales sin 429, y un webhook firmado que pasa con el cupo de login y API agotado.
- Mutaciones atrapadas: no anotar las firmas inválidas, quitar el tope de memoria, `trust proxy` en `true`, quitar el límite general de `/api` y el del login.
- **Demo real** (`docker compose up -d --build --wait`, sin `down -v`): las migraciones B1–B5 aplican sobre la base con datos de la demo (el slug de «Escuela demo» se rellenó) y el seed crea los usuarios; con curl: login sin `organizacion` (hay una sola viva), `GET /api/yo`, lista de usuarios, **vincular al asesor con su agente de Chatwoot REAL por correo** (agente 2), el maestro ve 2 grupos de 9, el administrador los 9, el asesor recibe 403 en `/api/usuarios`.

**Decisiones que tomé**
- *Cubeta de fichas y no ventana deslizante exacta*: misma idea con memoria constante por clave y ráfagas permitidas. Alternativa descartada: guardar las marcas de tiempo de cada petición (memoria proporcional al tráfico).
- *Los webhooks no se limitan «en general»*: se limitan las firmas inválidas (lo que hace un atacante) y hay un techo muy alto. Un cupo bajo por IP ahogaría a Twilio/Chatwoot (pocas IPs, ráfagas de campaña). Costo: una IP que falla firmas espera aunque ahora firme bien.
- *La API tiene su límite general ANTES de revisar la sesión*: así también frena a quien manda cookies inventadas.
- *Defecto de 600/min en la API*: holgado para una interfaz; ajustable.

**Para Eduardo**
- **Limpieza de la base de la demo** (no fue por estos bloques): la base `inscripciones` tenía dos organizaciones de prueba vivas, «A 63459c59» y «B 310f5e8f» (creadas a las 07:22 UTC por alguna corrida de pruebas contra la base de la demo), que hacían fallar `demo-preparar` al reconstruir (índice único de bandeja de Chatwoot). Las marqué con `eliminado_en` junto con sus bandejas (sin borrado físico); queda una bandeja huérfana (cuenta 2, bandeja 6) en Chatwoot. Es el mismo tipo de incidente que A3: los tests solo deben correr con `npm run test:int`.
- Si el backend va detrás de un balanceador, definir `TRUST_PROXY=1` o los límites verán a todos con la IP del balanceador.

## Correcciones de la auditoría de la etapa B

Auditoría: `docs/auditorias/etapa-B.md` (0 ALTA, 12 MEDIA, 14 BAJA; el informe entra en el primer commit). Cuatro commits `B-fix: …`, uno por grupo coherente:

| Commit | Qué |
|---|---|
| `25616f5` | EB-09 (denegar por omisión), EB-01 y EB-21 (registro de accesos a salud), EB-02, EB-23 |
| `25eaf31` | EB-03, EB-11, EB-12, EB-13, EB-14, EB-24, EB-19 |
| `dbbc5aa` | EB-04, EB-05, EB-17, EB-07, EB-15 |
| `6a19fad` | EB-06, EB-08, EB-22, EB-25 |

### Estado de cada hallazgo

| EB | Estado | Cómo / por qué |
|---|---|---|
| EB-01 | **corregido** | `leerSensible` y `guardarSensible` registran TODA denegación —sin permiso, sujeto inexistente o de otra organización, maestro fuera de su grupo— en lectura y escritura (`registrarDenegado`, en su propia transacción, con la columna nueva `causa`; migración `20261010050000`). La guarda de permiso de la ruta (`requierePermisoConRastro`) registra el intento de un rol sin permiso, que antes ni llegaba al servicio. Un identificador mal formado no tiene a quién atribuirse: 400/403 sin fila. Se reescribió el test que fijaba lo contrario. |
| EB-02 | **corregido** | `PATCH /api/usuarios/:id` con el id propio y `contrasena` → 400 (usa `POST /api/yo/contrasena`, que pide la actual y pasa por el bloqueo). Un administrador sí restablece la de OTRA persona sin la actual. Test: la 6.ª pega con la actual correcta da 429. No se pidió la actual para crear administradores ni cambiar roles (sigue abierta la decisión 3 del informe). |
| EB-03 | **corregido** | El bloqueo de login usa `llaveDeIp` (IPv4 o /64 de IPv6) igual que el límite de B6. Test: 20 direcciones del mismo /64 → 5 verificadas y 15 bloqueadas. **No** se agregó el tope por cuenta (correo) independiente de la IP que sugería el informe: bloquearía a la víctima legítima (queda como decisión). |
| EB-04 | **corregido** | (a) con `NODE_ENV=production` y sin `TRUST_PROXY` el backend loguea una alerta fuerte (`trust_proxy_no_definido`); `docker-compose.yml` lo fija a `false` (test que lo comprueba), `.env.example` y `docs/API.md` documentan `1` para el ALB. (b) Los límites de webhooks se aplican DESPUÉS de verificar la firma, con dos cubetas: los rechazos gastan solo el cupo de fallos y lo firmado solo el techo; 31 firmas inválidas ya no dejan en 429 al tráfico legítimo de la misma IP. Alternativa descartada: negarse a arrancar sin `TRUST_PROXY` (rompería despliegues que ya corren con `NODE_ENV=production` sin balanceador). Costo del diseño: el cuerpo (acotado) se lee y verifica antes de decidir. |
| EB-05 | **corregido** | `hstsActivo(cookieSegura, env)`: HSTS si la cookie es Secure (misma resolución que la API) o `ORIGEN_PUBLICO` es https. `crearApp` ya no depende de un valor que `server.ts` no pasaba; test con las variables de entorno reales. |
| EB-06 | **corregido en lo razonable; residual documentado** | `check:sensibles` falla si se llama a `.revelar()` (también `?.revelar`, `["revelar"]`) o se nombra `leerSensible` fuera de `src/sensibles/` y `api/rutas/salud.ts`. Residual (en el encabezado de la guarda y en `docs/API.md`): código nuevo dentro de esas dos rutas, un acceso armado a trozos o un `import()` dinámico no se ven; cada flujo nuevo debe sumarse a `fuga.itest.ts`. |
| EB-07 | **corregido** | Sin `CLAVE_DATOS_SENSIBLES` el backend NO cifra, salvo `NODE_ENV=development|test` explícito (`npm run dev` lo fija). Formato nuevo `v2.<kid>.<iv>.<tag>.<texto>`; el `kid` son 6 bytes del SHA-256 de la clave. Rotación con `CLAVES_DATOS_SENSIBLES_ANTERIORES`; el formato `v1` se sigue leyendo; un kid desconocido da un error claro. No hay re-cifrado en lote (un registro viejo se re-cifra al guardarse). |
| EB-08 | **corregido en la base; rol documentado** | Disparadores `BEFORE TRUNCATE … FOR EACH STATEMENT` en `registro_cambio` y `acceso_dato_sensible` (migración `20261010060000`, también en cascada). Verificado además en una base creada sin esa migración: el test falla. `docs/API.md` («Roles de base de datos») documenta las dos cuentas: la de la aplicación no es dueña ni tiene TRUNCATE/ALTER/TRIGGER. El compose de la demo sigue con una sola cuenta (K6 debe crear las dos). |
| EB-09 | **corregido** | `autenticar` se monta UNA vez en `crearApiRouter`, antes de las rutas protegidas; cada ruta DEBE declarar `requierePermiso(…)` o `soloSesion()` y `contextoDe(res)` lanza (500) si no lo hizo. `src/api/rutas.test.ts` recorre el router REAL de Express y lo compara con una tabla escrita a mano (también lo que no es `/api`). El test de matriz tautológico ahora parte de `src/testutil/permisos-acordados.ts` (escrito a mano) y no de `tienePermiso`. Consecuencia: una ruta desconocida de `/api` da 401 sin sesión y 404 con sesión. |
| EB-10 | **NO se corrige: decisión de Eduardo** | `DirectorioAgentesChatwoot` llama a la API de Chatwoot con un token de administrador desde `src/mensajeria/` pero fuera de `MessagingProvider`. Por la letra del invariante 4 es una excepción; por su espíritu (no manda mensajes) no. Opciones: ampliar el texto del invariante a «mensajes» y anotar la excepción, o mover el directorio detrás de una interfaz de `MessagingProvider`. Mientras tanto queda anotada aquí como excepción, como la del borde de Twilio. Se agregó el test que faltaba (no sigue redirecciones con el token). |
| EB-11 | **corregido** | `sesion.itest.ts` crea su segunda organización (no depende de cuántas haya vivas) y `unicaOrganizacion` tiene su prueba pura. `test:int` corrido contra una base NUEVA (ver Verificación). |
| EB-12 | **corregido (las 4 + M02)** | M12: el login hace el mismo trabajo de scrypt exista o no el usuario (contador `derivacionesHechas`); M70: por HTTP con `trust proxy` el bloqueo usa la IP real; N04: `unicaOrganizacion` con varias → null; N24: el directorio no sigue redirecciones (servidor local que redirige); M02: parámetros por defecto de scrypt. Las demás (M23, M56, M64, N03) siguen sin test: sin semántica de seguridad directa. |
| EB-13 | **corregido** | `buscarSesionPorHash` exige organización viva. Test (incluye N05, el slug de una organización borrada). |
| EB-14 | **corregido** | `texto()`/`textoLiteral()` rechazan NUL (400); el manejador mapea cualquier 4xx del parser (gzip/br/deflate rotos → 400; encoding/charset no admitidos → 415) en vez de 500. |
| EB-15 | **corregido** | Etiqueta GCM de 16 bytes exigida al cifrar y al descifrar (`authTagLength`). Test con etiquetas de 4, 8, 12 y 15 bytes. |
| EB-16 | **pendiente (documentado)** | Enumeración del slug por tiempo (~5 ms) y por el 429. Un slug no es un secreto; arreglarlo exige gastar el mismo trabajo y contar intentos por organización inexistente. |
| EB-17 | **corregido (mitigado)** | Al llenarse, el limitador tira la cubeta con MÁS fichas de las 64 más viejas; una inundación de claves nuevas ya no expulsa la cubeta agotada de una IP limitada. Si las 64 están agotadas se tira la más vieja: el tope sigue protegiendo la memoria, no es un cortafuegos. |
| EB-18 | **pendiente (documentado)** | Costo de CPU/memoria del login anónimo, 100 MB/s teóricos de cuerpo por IP y `/salud` sin límite. Es del balanceador/WAF; el límite por IP y el tope de cuerpo existen. |
| EB-19 | **corregido en sesiones e intentos** | `purgarCaducados` (`src/auth/retencion.ts`): marca `eliminado_en` en sesiones expiradas/revocadas hace >30 días e intentos de >48 h; idempotente, aislada por organización, invocada por el barrido a lo más una hora (`ciclo.ts`, `retencion: {}` en `server.ts`). **Pendiente, decisión de Eduardo:** cuánto se conserva `acceso_dato_sensible` / `registro_cambio` (solo de anexar). |
| EB-20 | **pendiente (decisión)** | Contraseñas de la demo publicadas, puerto 3000 en 0.0.0.0, política sin lista de comunes, sin cambio obligatorio. Decisiones 8 del informe. |
| EB-21 | **corregido en parte** | Nuevo `GET /api/salud-accesos` (administrador): quién vio a quién, con causa de denegación y solo nombres de campos. Queda: `motivo` viaja en la URL del GET y se guarda en claro (documentado: no escribir datos de salud en el motivo). |
| EB-22 | **documentado** | `docs/API.md` ya no promete «cada escritura»: lista lo que queda fuera (procesos del sistema, `instructor` al promover a un maestro, login/logout). No se registraron esos cambios: exige un `usuario_id` de sistema. |
| EB-23 | **corregido** | `DELETE /api/usuarios/:id/vincular-chatwoot` (idempotente, con registro) y desactivar a alguien suelta su agente y sus asignaciones. |
| EB-24 | **corregido** | Cookie `__Host-sesion` con cookie segura (Secure, Path=/, sin Domain); la `sesion` suelta no sirve. |
| EB-25 | **corregido** | `DELETE /api/sesion` documentado con su 403 anti-CSRF. |
| EB-26 | **pendiente (documentado)** | 4 avisos altos de `npm audit` en la cadena del CLI de Prisma; `audit fix --force` está prohibido y la imagen necesita el CLI para migrar. K3 (revisión de seguridad) lo retoma. |

### Verificación

- Mutaciones (cada test nuevo falla al quitar su arreglo, una por una; el script y el resultado de cada una están en el historial de la sesión): `autenticar` único, `accesoDeclarado`, quitar un `requierePermiso`, denegación de lectura/escritura registrada, `requierePermisoConRastro`, `esYo && contrasena`, desactivar suelta el agente, `llaveDeIp` en el bloqueo, hash ficticio, IP fija en el login, `trust proxy`, parámetros de scrypt, organización borrada (sesión y slug), NUL, parser 4xx, nombre `__Host-`, `unicaOrganizacion`, redirecciones del directorio, retención (rama de expiradas y llamada del ciclo), cubeta de fallos/techo (dos mutaciones), HSTS, expulsión de cubetas, aviso de `TRUST_PROXY`, `.revelar()` de la guarda. EB-08 se verificó creando una base sin la migración.
- `npm run validar` → exit 0; `npm run test:int` → exit 0. Conteos finales de todo lo de esta sesión (B-fix + C1–C4): ver «Cierre de la etapa C (parte 1)».

### Para Eduardo

- **Decisión (EB-10):** el directorio de agentes y el invariante 4 (arriba).
- **Decisiones del informe sin cerrar:** 2FA / reautenticación para crear administradores y cambiar roles (EB-02), tope por cuenta del login (EB-03), retención de los registros solo de anexar (EB-19), qué pasa al dar de baja una organización (sus sesiones ya mueren), contraseñas de la demo y política (EB-20), varias réplicas (el límite vive en memoria), ratificar las excepciones de `sistema.ts` al invariante 1.
- **Cambios de contrato a tener en cuenta (interfaz J1):** una ruta desconocida de `/api` da 401 sin sesión; la cookie segura se llama `__Host-sesion`; `PATCH /api/usuarios/:id` ya no acepta `contrasena` sobre uno mismo.
- **Un fallo no reproducido:** en la primera corrida de `test:int` contra una base nueva falló una vez el login de un test de `chatwoot.itest.ts` (404 donde esperaba 201); no se reprodujo en 25 corridas del archivo ni en dos de la suite completa. Si reaparece, mirar primero el reuso de puertos entre servidores de prueba consecutivos.

## C1. Instructores y salones

**Qué se hizo**
- **Migración `20261011000000_instructores_y_salones`:** tabla `salon` (sucursal, nombre único por sucursal viva, capacidad opcional); `instructor` gana `telefono` y `correo`; tabla `instructor_sucursal` (dónde da clases; vacío = sin restricción); `grupo.salon` (texto) se reemplaza por `grupo.salon_id` (FK compuesta). **Los textos existentes se migran sin perder datos:** una fila de `salon` por (sucursal del programa, texto sin espacios en los extremos), incluidos los grupos dados de baja; un texto vacío queda «sin salón»; la migración falla (y no pierde nada) si algún grupo con texto quedara sin `salon_id`. Probada de tres formas: sobre una copia de la base de la demo (9 grupos → 2 salones, 9 con salón), sobre una base descartable con casos feos (espacios, vacíos, un grupo dado de baja, el mismo nombre en dos sucursales, un choque heredado: `migracion-salones.itest.ts`) y sobre base vacía (`test:int`).
- **Choques, tres capas.** (1) `src/catalogo/choques.ts`: `detectarChoques` / `choquesDe` PURAS (mismo día, `inicio < fin ajeno` y `fin > inicio ajeno`; terminar cuando empieza la otra NO choca; salón o instructor, éste también entre sucursales) más `choquesDeGrupo` (consulta). (2) La API (`POST/PATCH /api/grupos`, `docs/API.md`) los revisa y responde `409 conflicto` con el detalle de qué se pisa con qué; toda escritura de ocupación va bajo un candado por organización, así que dos asignaciones simultáneas que chocan se serializan y gana una. (3) Disparadores en la base (`grupo_choques_trg`, `grupo_horario_choques_trg`, error `choque_de_ocupacion` con SQLSTATE 23P01) que toman un candado consultivo por salón e instructor y revisan: la red de seguridad si algo escribe sin la API (un seed, un script).
- **Verificación 3 del insumo** (`src/catalogo/verificacion.ts`) reescrita sobre `salon` (no texto), más `choquesDeInstructor`. Los tests puros usan nombres neutros.
- **API:** `GET/POST/PATCH/DELETE` de `/api/salones` y `/api/instructores`, y escritura de `/api/grupos` (alta, cambio —salón, instructor, horarios que REEMPLAZAN el conjunto, cupo, activo— y baja). Lectura `catalogo:leer` (cada rol ve lo de su sucursal; el maestro ve donde da clases y solo se ve a sí mismo como instructor); escritura `catalogo:escribir` (administrador). Validan: el salón es de la sucursal del programa (también un disparador), el instructor da clases en esa sucursal, las franjas de un grupo no se pisan entre sí, el teléfono pasa por `normalizarTelefono()`, `usuario_id` solo de un maestro y único. Bajas lógicas con 409 si algo vivo depende. `registrarCambio` en todo (`salon`, `instructor`, `grupo`).
- **Semillas:** `catalogo.sql` crea los salones «Dojo» con ids (531, 532, capacidad `[SUPUESTO]`) y los grupos referencian `salon_id`; el instructor de la demo se acota a la primera vertical.

**Verificación**
- `npm run validar` → exit 0; `npm run test:int` → exit 0 (conteos finales en la sección de cierre de la etapa C).
- Tests nuevos: `choques.test.ts` (5, puros), `catalogo.test.ts` (reescrito + instructor), `ocupacion.itest.ts` (16: permisos por rol, alcance, no-fuga, validaciones, choques de salón e instructor con detalle, contiguos/otro día/inactivo, horarios que reemplazan, registro de cambios, **carrera de 2 y de 8 peticiones simultáneas** y dos transacciones directas contra los disparadores), `migracion-salones.itest.ts`.
- Mutaciones atrapadas (una por una): traslape con `<=` (contiguas), quitar el candado de la API (la carrera se rompe: el perdedor ya no trae detalle), quitar la revisión previa, quitar la validación de sucursal del salón, no normalizar el teléfono, cambiar el orden de los tres tiempos de los horarios; y, sobre una base creada con la migración MUTADA, quitar los dos `pg_advisory_xact_lock` de los disparadores: el test de dos transacciones directas falla (entran las dos).

**Decisiones que tomé**
- *Restricción de exclusión con `btree_gist`: descartada, con razón.* Una exclusión mira una sola tabla y aquí el salón/instructor viven en `grupo` y las franjas en `grupo_horario`. Alternativa: tabla sombra mantenida por disparadores + exclusión (más piezas que sincronizar). Elegí disparadores de verificación con candado consultivo (READ COMMITTED: tras esperar el candado, la consulta ve lo confirmado por quien lo tenía) y el mismo candado en la API para dar el detalle. Para C2 (precios) sí aplica la exclusión, porque es una sola tabla.
- *Candado por organización (`catalogo:ocupacion`) en las escrituras de ocupación:* serializa la edición del catálogo, que es rara y de un administrador; alternativa descartada: candado por salón/instructor (hay que tomar varios en orden fijo y el costo de complejidad no se paga).
- *Los horarios se cambian en tres tiempos* (quitar, actualizar el grupo, crear) porque los disparadores revisan cada escritura y un orden ingenuo da choques falsos con el salón o instructor viejo/nuevo.
- *Los disparadores se crean después de migrar los datos:* una base con choques heredados migra igual y la verificación los reporta.
- *Un instructor sin sucursales = sin restricción* (igual que el alcance vacío de las promociones).
- *Las bajas de programas, verticales y sucursales y el alta de programas* quedan para J7: aquí solo lo que C1 pide (instructores, salones y la asignación en grupos).

**Para Eduardo**
- **[SUPUESTO]** capacidad de los salones «Dojo» (24) del seed; los salones de las otras verticales llegan con C4. Todo editable por la API.
- Un salón o instructor que hoy tiene dos grupos que se pisan (si los hubiera en la base real) migra sin error y aparece en la verificación 3; hay que corregirlo a mano antes de poder editar esos grupos.

## C2. Precios versionados por fecha

**Qué se hizo**
- **Tabla `precio`** (migración `20261011010000_precios`): `programa_id`, `costo_inscripcion` y `costo_mensualidad` `Decimal(12,2)`, `moneda` (3 letras mayúsculas, `MXN` por defecto), `vigencia_desde` y `vigencia_hasta` (`DATE`, inclusivas; `hasta` nula = abierta). **Las vigencias de un programa no se traslapan por una restricción de exclusión** (`btree_gist`: `EXCLUDE USING gist (programa_id WITH =, daterange(desde, hasta, '[]') WITH &&) WHERE eliminado_en IS NULL`), más CHECK de costos ≥ 0, moneda y `hasta ≥ desde`.
- **`precioVigente(db, programaId, 'AAAA-MM-DD')`** (`src/catalogo/precios.ts`): determinista; el precio que rige ese día en centavos `bigint`, o null. Con la parte pura `rigeEn`, `elegirVigente`, `planDeAlta` y `sumarDias`.
- **API** `/api/precios` (`docs/API.md`): lista/historial por programa (`?programa_id=`), `vigente_en=`, alta, corrección y baja lógica. **Alta = vigencia nueva abierta; la anterior se cierra el día previo en la misma transacción, bajo un candado por programa**; 409 si ya hay una que empiece ese día o después. `registrarCambio` en el alta y en el cierre de la anterior. Alcance por sucursal del programa (404 a lo ajeno); escritura solo del administrador.
- **`src/lib/dinero.ts`:** centavos `bigint`; `deTexto`/`aTexto` estrictos (dos decimales como máximo, sin redondear en silencio), `deDecimal`, `formatear` es-MX (exacto, sin pasar por flotante), `sumar`, `restar`, `multiplicar`, `porcentaje` y `descuentoPorcentual`, `repartir` (sin perder ni inventar centavos), `noNegativo`. **Redondeo definido y documentado en el archivo: al centavo más cercano y, en la mitad exacta, alejándose de cero** (15 % de $1,234.50 = $185.18; 0.5 centavo → 1). La API recibe los importes como **texto** y rechaza un número JSON (`dinero()` en `validar.ts`); también `fechaISO()`.
- **`npm run check:dinero`** (en `validar`): prohíbe `parseFloat`, `.toNumber()` y `Number()/parseInt/toFixed/Math.round…` sobre una línea con palabras de dinero, y en las «zonas de dinero» (`promociones/`, `cotizador/`, `finanzas/`, `pagos/`, `cobranza/`, `catalogo/precios.ts`) cualquiera de esas llamadas. Con 7 tests de la guarda. Residual (en el encabezado): es revisión de texto, no ve un importe con nombre neutro fuera de las zonas.

**Verificación**
- `npm run validar` → exit 0 (ahora con `check:dinero`); `npm run test:int` → exit 0 (conteos finales en el cierre de la etapa C).
- Tests nuevos: `dinero.test.ts` (10: tabla de casos, ida y vuelta con 20 000 importes, `porcentaje` contra la definición en 30 000 casos aleatorios con PRNG fijo, monotonía, `repartir` suma siempre el total, formato es-MX hasta más allá de 2^53 centavos), `check-dinero.test.ts` (7), `precios.test.ts` (puros: fin de mes/año/bisiesto, bordes inclusivos, plan de alta), `precios.itest.ts` (9: bordes de fecha, alta y cierre del día previo, historial, 409 por fecha repetida o anterior, 14 entradas inválidas, cambios y reapertura, permisos y alcance, no-fuga, la base rechaza traslapes y CHECK, y **tres carreras**: 6 altas con la misma fecha → una gana; 6 con fechas distintas → historial contiguo y una sola abierta; dos transacciones directas con rangos que se traslapan → una gana).
- Mutaciones atrapadas: cerrar la anterior en `desde` en vez del día previo, `lte`→`lt` y `gte`→`gt` en `precioVigente`, `parseFloat`/zona/línea de dinero en la guarda, redondeo hacia abajo/truncado, `repartir` sin resto; y, sobre una base creada SIN la restricción de exclusión, fallan los tres tests que dependen de ella. Dos mutaciones equivalentes: quitar la rama `typeof number` de `dinero()` (el siguiente `typeof !== string` también lo rechaza; el mensaje sí se prueba) y no mapear el error de exclusión en el alta (con el candado nunca se llega a él: es red de seguridad).

**Decisiones que tomé**
- *Importes como texto en la API y `bigint` en código* (no `Prisma.Decimal` ni flotantes): sumar y repartir exactos con el tipo del lenguaje, sin librería; `Decimal(12,2)` solo en la columna. Alternativa descartada: `Prisma.Decimal` por todos lados (aritmética de decimal.js con redondeo configurable por contexto global: más fácil de equivocar).
- *Las fechas de vigencia son fechas de calendario (texto `AAAA-MM-DD`), no instantes:* «el precio de hoy» es una fecha local de la sucursal; evita husos horarios en una regla de negocio. El cotizador (C5) le pasará la fecha local.
- *El historial solo crece hacia delante* (no se da de alta una vigencia que empiece antes de la última): cambiar el pasado se hace con `PATCH`/`DELETE` explícitos. Una baja deja un hueco sin precio (`precioVigente` → null), a propósito: mejor «sin precio» que un precio equivocado.
- *Corregir costos de una vigencia pasada se permite* (una errata): lo ya inscrito congela su precio en F3, así que no se reescribe lo cobrado.
- *Aviso de carrera:* con la exclusión, dos transacciones directas que compiten pueden terminar en `exclusion_violation` o en el interbloqueo que Postgres detecta (ambas esperan a la otra): el test acepta las dos. La API pasa por el candado y siempre da 201/409.

**Para Eduardo**
- Los precios de ejemplo `[SUPUESTO]` llegan con C4 (seed). Mientras no haya precio vigente de un programa, el cotizador (C5) tendrá que decir «sin precio» en vez de inventar uno.
- Aparece una extensión nueva de Postgres, `btree_gist` (incluida en las imágenes oficiales y permitida en RDS); el usuario que migra necesita poder crearla.

## C3. Promociones

**Qué se hizo**
- **Tablas** (migración `20261011020000_promociones`): `promocion` (nombre, código único entre las vivas, vigencia, `condicion_tipo` enum, `condicion_valor` JSON, `cupo_maximo`/`cupo_usado`, `acumulable`, `prioridad`, `activo`), el alcance en tablas puente (`promocion_vertical`, `promocion_sucursal`, `promocion_programa`; **sin filas = todos**), `promocion_beneficio` (tipo, modo, valor `Decimal`, `producto_id`, `descripcion`, `momento_disparo`) y `promocion_aplicacion` (inscripción, promoción, beneficio, `estatus` pendiente/entregado, `fecha_entrega`, quién autorizó). Todo con `organizacion_id`, `eliminado_en` y FK compuestas. CHECK en la base: vigencia, cupo (`cupo_usado ≤ cupo_maximo`, nunca negativo), condición coherente con su valor, **combinaciones válidas de beneficio**, y «entregado ⇔ tiene fecha»; índices parciales: código único vivo, una fila viva por alcance y **una aplicación viva por (inscripción, beneficio)** (invariante 8).
- **Resolutor PURO** (`src/promociones/resolver.ts`, reglas en su encabezado y en `docs/API.md`): candidata = activa + vigente (bordes inclusivos) + en alcance + con cupo + condición cumplida; orden por prioridad (mayor primero) y menor id; las **no acumulables compiten** (gana una) y las **acumulables se suman**; los descuentos se calculan sobre el importe original y se recortan para no pasar de cero; devuelve aplicadas, **descartadas con su motivo** y el desglose por beneficio con totales ahora/diferido (centavos `bigint`). `meses_gratis` y `descuento_mensualidad` son por mensualidad. Validaciones puras de condición y beneficio en `condicion.ts`; carga desde la base en `cargar.ts`.
- **Cupo seguro bajo concurrencia** (`cupo.ts`): `consumirCupo` = un `UPDATE … WHERE cupo_usado < cupo_maximo` atómico (más el CHECK de la base como red); `liberarCupo` nunca baja de cero.
- **API** `/api/promociones` y `/api/promociones/:id/beneficios` (alta completa en una transacción, cambios que reemplazan el alcance, bajas lógicas con 409 si hay entregas pendientes, `registrarCambio` en promociones y beneficios, lectura por sucursal según el rol).

**Verificación**
- `npm run validar` → exit 0 y `npm run test:int` → exit 0 (conteos finales en el cierre de la etapa C). La base de pruebas se recreó VACÍA durante este bloque (se corrigió una migración aún sin commitear) y la suite de este bloque pasó sobre ella.
- Tests nuevos: `resolver.test.ts` (16: 15 % de $1,234.50 = $185.18, monto fijo/total/recorte a cero, 10 % + 10 % = 20 %, meses gratis, diferidos, cada condición con sus bordes, vigencias, alcance, cupo, orden de los motivos, prioridad y desempate por id, acumulación, **30 barajas del mismo conjunto dan exactamente el mismo resultado**), `condicion.test.ts` (matriz completa de tipo × modo × valor), `promociones.itest.ts` (13: alta, entradas inválidas, cambios, bajas, beneficios, filtros, permisos y alcance, no-fuga y FKs, carga + resolutor reales, **cupo 1 con dos consumos que se solapan de verdad (barrera de `carrera.ts`) y cupo 3 con 12 simultáneos**, y los CHECK de la base).
- Mutaciones atrapadas: bordes de vigencia, `hermanosInscritos + 1`, `>=` del cupo, orden de prioridad, recorte a cero, acumulación, diferido según la condición. Equivalente: quitar el `WHERE cupo_usado < …` de `consumirCupo` (el CHECK de la base lo rechaza y el código lo toma como «no hay lugar»): dos capas.

**Decisiones que tomé**
- *Mayor `prioridad` gana*; empate por menor id. Las **no acumulables compiten entre sí y la ganadora convive con todas las acumulables** (así lo pide el encargo); si el negocio quiere que una no acumulable excluya también a las acumulables, se marcan no acumulables.
- *`min_hermanos {hermanos: n}` cuenta al que se inscribe* (`hermanosInscritos + 1 ≥ n`): «2 hermanos» = este y al menos uno ya inscrito. `pago_anticipado {meses: n}` = meses pagados al inscribirse.
- *Descuentos sobre el ORIGINAL, no en cascada* (dos de 10 % son 20 %): predecible y sin depender del orden. Alternativa descartada: cascada (19 %).
- *`producto_id` y `inscripcion_id` sin llave foránea* (documentados en el schema) hasta que existan `producto` (H5) e `inscripcion` (F3); se agregó `descripcion` al beneficio para que recepción sepa qué entregar mientras no haya productos. Alternativa descartada: diferir la columna.
- *`meses_gratis` y `producto_gratis` van con modo `total`* (el modo no aplica); el valor de `meses_gratis` es el número de meses.
- *`condicion_valor` nulo = NULL de SQL* (`JSON_NULO_SQL`, nuevo en `src/datos/tipos.ts`), porque el CHECK compara contra `IS NULL`; dos CHECK tenían un hueco (un `NULL` pasa un CHECK) y lo encontró el test antes de commitear.
- *No se construyó el registro de aplicaciones* (insertar `promocion_aplicacion`, marcar entregado): es de F3/H4. Solo la tabla y sus garantías.

**Para Eduardo**
- Las promociones de ejemplo `[SUPUESTO]` (inscripción gratis, uniforme al pagar la primera mensualidad, descuento por hermanos) llegan con el seed de C4.
- Decisión abierta de negocio: ¿una promoción NO acumulable debe excluir también a las acumulables? Hoy no (arriba).

## C4. Catálogo de las tres verticales del insumo

**Qué se hizo**
- **Migración `20261011030000_verticales_y_traslape`:** `vertical` gana `etiqueta_progresion`, `etiqueta_evento`, `usa_progresion`, `color_marca` (CHECK `#RRGGBB`) y `logo_url`; todas nulables salvo `usa_progresion` (falso por defecto) con un CHECK: si usa progresión, debe traer su etiqueta. `programa` gana **`permite_traslape`** (falso por defecto).
- **Seed `prisma/seed/catalogo-completo.sql`** (después de `demo.sql` y `catalogo.sql`; idempotente; ids de 3 dígitos finales): completa la organización de demo con las otras dos verticales, sus `sucursal_vertical`, **canal y bandeja** de Ballet y Baile, los salones, los programas, grupos y horarios que faltaban (**14 programas, 18 grupos y 31 horarios** en total, como la revisión del insumo), cinco instructores de ejemplo con sus sucursales, **precios de ejemplo para los 14 programas**, **tres promociones de ejemplo** (inscripción gratis; uniforme gratis al pagar la primera mensualidad, que queda pendiente; descuento por hermanos) y los textos de las tres verticales (Karate «Cinturón»/«Examen», Ballet «Nivel»/«Recital» y Baile «Nivel»/«Showcase» sin progresión). Se integró en `docker-compose.yml` (`demo-preparar`) y en `docs/DEMO-LOCAL.md`. `scripts/preparar-chatwoot.ts` no necesitó cambios: recorre las bandejas y reutiliza la de Chatwoot que ya exista por id o por nombre, así que no duplica; solo crea las de Ballet y Baile la primera vez.
- **Verificación 1 con alternativas:** `traslapesDeEdad` ya no cuenta como error el traslape entre dos programas que tienen `permite_traslape`; `alternativasPorEdad` los lista aparte, con las edades compartidas. Es el caso conocido del insumo (los dos programas de baile de 15 a 99 en una sucursal: «varios programas para una misma edad», decisión 9; el cotizador de C6 preguntará cuál). Marcar solo uno, o ninguno, sí es error.
- **Las tres verificaciones del insumo, como tests** sobre el catálogo completo (`catalogo-completo.itest.ts`): traslape de edades (0 errores y 1 alternativa), capacidad por sucursal (**184 y 116**) y choques de salón (**0**, con la tabla `salon`; también 0 de instructor).

**Verificación**
- `npm run validar` y `npm run test:int` → exit 0 (conteos en el cierre de la etapa C). El seed se aplicó además dos veces sobre una copia de la base de la demo (14/18/31, 3 bandejas, 0 grupos sin instructor) y `prueba-de-fuego.itest.ts` (N10) pasa sin cambios.
- `catalogo-completo.itest.ts` (9): cuentas exactas del insumo, los textos y colores de las verticales (y los CHECK), las tres verificaciones, 14 precios vigentes con la misma mensualidad en las dos sucursales, las tres promociones con el resolutor de C3 (inscripción gratis, uniforme pendiente, 10 % por hermanos y fuera de vigencia), una bandeja por vertical sin duplicados, que `segunda-vertical.sql` (comparte los ids de Ballet) corre después sin duplicar, y que `demo.sql` + `segunda-vertical.sql` siguen dando 1 y 2 verticales.
- Mutaciones atrapadas: ignorar `permite_traslape`, subir un cupo (rompe 184), solapar un horario del seed (la base rechaza la carga: los disparadores de C1 validan el seed), agregar un grupo de más.

**Decisiones que tomé**
- *`permite_traslape` como bandera del programa* (la opción que sugería el encargo): genérica, sin términos de vertical, editable. Alternativa descartada: otra dimensión «estilo» en el modelo (más grande y sin necesidad todavía).
- *Las etiquetas de la vertical solo se llenan si siguen vacías:* correr el seed otra vez no pisa lo que el administrador haya editado.
- *Un instructor de ejemplo por sucursal y vertical, sin choques:* para que la demo tenga a quién asignar y los disparadores de C1 queden ejercitados con datos reales.
- *Precios de ejemplo iguales en las dos sucursales.* Inscripción $500–$700, mensualidad $700–$1,000 según el programa. **Todo [SUPUESTO].**

**Para Eduardo**
- **[SUPUESTO] en `catalogo-completo.sql`** (todo editable desde administración cuando J7 exista): colores de marca de las tres verticales; capacidad de los salones nuevos (30); cupos de los 9 grupos nuevos (los de Ballet y Baile del insumo no estaban marcados, el contexto §12 dice que el cupo real está pendiente); las horas de fin de los horarios que en el insumo solo traían la de inicio (45 o 60 min); los 5 instructores (nombres, teléfonos ficticios y reparto); **los 14 precios**; y las 3 promociones (vigentes hasta 2027-12-31).
- Las direcciones de las sucursales siguen vacías (`[PENDIENTE]` en el insumo).
- **Ids de los seeds** para quien construya encima (C5–C9): organización `…001`; verticales Karate `…101`, Ballet `…102`, Baile `…103`; sucursales Águilas `…201`, Centenario `…202`; canal/bandeja `…401` (Karate), `…402` (Ballet), `…403` (Baile); salones `…531`/`…532` (Dojo de cada sucursal), `…533` (Salón 2 de Águilas), `…534` (Salón 1 de Centenario); programas nuevos `…111`–`…118` (los 6 de la primera vertical tienen ids aleatorios: se buscan por sucursal y nombre); grupos nuevos `…131`–`…139`; instructores `…521` (Maestro demo, ligado al usuario maestro) y `…522`–`…526`; promociones `…551`–`…553`, beneficios `…561`–`…563`. Usuarios de la demo `…501`–`…504`.

## Cierre de la etapa C (parte 1: C1 a C4) y de las correcciones de la etapa B

**Estado.** B-fix, C1, C2, C3 y C4 HECHOS. C5 a C9 (cotizador) siguen PENDIENTES: esta parte deja listos sus insumos. No se etiqueta `etapa-C` (falta la mitad de la etapa y la auditoría).

**Verificación del último commit** (`c4bdc80`):
```
$ npm run validar          → exit 0 · ℹ tests 319 · pass 319 · fail 0   (lint, typecheck, check:generico 240 archivos, check:capas 92, check:sensibles 92, check:dinero 92)
$ npm run test:int         → exit 0 · ℹ tests 394 · pass 394 · fail 0   (1.ª corrida)
$ npm run test:int         → exit 0 · ℹ tests 394 · pass 394 · fail 0   (2.ª corrida seguida)
$ DATABASE_URL_PRUEBAS=…/vacia_c_pruebas npm run test:int → exit 0 · ℹ tests 394 · pass 394 · fail 0   (base NUEVA, vacía)
$ docker compose up -d --build --wait   → backend y demo-preparar sanos; Ballet y Baile crean sus bandejas en Chatwoot (7 y 8) la primera vez y
                                           una segunda corrida de demo-preparar las reutiliza (3 bandejas, sin duplicados); 14 programas, 18 grupos, 31 horarios
```
Línea base al empezar: validar 257 tests, test:int 330. Antes de este cierre, en la primera corrida de `test:int` sobre una base nueva falló una vez un login de `chatwoot.itest.ts` (ver la nota de B-fix) y en otra hubo dos pruebas que dependían del orden de `creado_en` de filas casi simultáneas: se volvieron independientes del orden; desde entonces la suite pasó sin fallos en las cinco corridas completas posteriores.

**Para el siguiente implementador (C5 a C9, cotizador)** — helpers y datos que ya existen:
- `precioVigente(db, programaId, 'AAAA-MM-DD')` → `{ id, programaId, costoInscripcion, costoMensualidad (centavos bigint), moneda, desde, hasta } | null` (`src/catalogo/precios.ts`). Fechas de calendario locales como texto.
- `promocionesAplicables(db, contexto)` / `resolverPromociones(promociones, contexto)` (`src/promociones/`): contexto `{ fecha, verticalId, sucursalId, programaId, hermanosInscritos, mesesPagadosPorAdelantado, costoInscripcion, costoMensualidad }` → `{ aplicadas, descartadas (con motivo), lineas (por beneficio, ahora/pendiente), inscripcion, mensualidad, mesesGratisAhora, mesesGratisDiferidos }`. Para consumir el cupo al INSCRIBIR (F3), `consumirCupo(db, promocionId)` (atómico) y `liberarCupo`.
- `cupoPorGrupo(db, grupoId, fuente?)` (`src/catalogo/cupo.ts`): `{ cupoMaximo, ocupados, disponibles, lleno, oferta: lugar | lista_de_espera | sin_lugar }`; la fuente de ocupación es una interfaz (hoy `SinInscripciones`; F4 pone la real).
- `detectarChoques` / `choquesDe` / `choquesDeGrupo` (`src/catalogo/choques.ts`) y la verificación del catálogo `cargarCatalogo` + `traslapesDeEdad` / `alternativasPorEdad` / `resumenDeCapacidad` / `choquesDeSalon` / `choquesDeInstructor` (`src/catalogo/verificacion.ts`).
- **Varios programas para una edad (C6):** `alternativasPorEdad(catalogo)` ya lista los pares marcados `programa.permite_traslape`; el cotizador debe devolver todos los programas que aceptan la edad en la vertical y sucursal y, si hay más de uno, preguntar cuál.
- Dinero: `src/lib/dinero.ts` (`deTexto`, `aTexto`, `deDecimal`, `formatear`, `sumar`, `restar`, `porcentaje`, `repartir`, `cantidadEntera`…) y la guarda `npm run check:dinero` (zona de dinero: `src/cotizador/`, `src/finanzas/`, `src/pagos/`, `src/cobranza/`, `src/promociones/`: ahí no se permite ni `Number()`).
- Permisos: `catalogo:leer` (todos) / `catalogo:escribir` (administrador). Rutas nuevas declaran su permiso con `requierePermiso(…)` y se agregan a la tabla `LAS_RUTAS` de `src/api/rutas.test.ts`. `ctx.alcanceCatalogo()` da las sucursales cuyo catálogo ve el usuario.
- Seeds: orden `demo.sql` → `catalogo.sql` → `catalogo-completo.sql` (+ `segunda-vertical.sql` opcional); ids en la sección C4. Los tests los re-prefijan con el patrón `00000000-0000-4000-8000-000000000(\d{3})` (ver `src/catalogo/catalogo-completo.itest.ts`).
- Migraciones de esta parte: `20261010050000_acceso_causa`, `…060000_truncate_solo_anexar`, `20261011000000_instructores_y_salones`, `…010000_precios` (necesita `btree_gist`), `…020000_promociones`, `…030000_verticales_y_traslape`. La siguiente debe usar `20261012…` o posterior.

**Decisiones de producto abiertas** (todas con valor por defecto razonable ya implementado):
1. EB-10: el directorio de agentes de Chatwoot y el invariante 4 (arriba).
2. Si una promoción NO acumulable debe excluir también a las acumulables (hoy no; C3).
3. Cuánto se conserva el registro de accesos a salud y el de cambios (solo de anexar; EB-19) y si se separan las cuentas de base de datos de migraciones y de aplicación antes de producción (EB-08; documentado en `docs/API.md`).
4. Reautenticación o 2FA para crear administradores y cambiar roles (EB-02) y un tope de intentos por cuenta independiente de la IP (EB-03).
5. Todos los `[SUPUESTO]` del seed de C4 (precios, cupos de los grupos nuevos, capacidad de salones, colores, instructores, promociones, horas de fin) y las direcciones de las sucursales.

## C5. Cotizador determinista

**Qué se hizo**
- **`src/cotizador/`** (zona de dinero de `check:dinero`; sin LLM, invariante 10): `cotizar(catalogo, entrada)` es **pura** (sin base, reloj ni flotantes); `cargarCatalogoCotizable(db, {verticalId, sucursalIds?, fecha, fuente?})` la alimenta por el scope; `cotizacionAJson` saca los importes como texto decimal. Salida por programa que cubre la edad (`edad_min…edad_max` inclusivos, misma vertical y sucursal, programa y sucursal activos): sus **grupos activos con horario** (de más lugares a menos; un grupo sin horario no se ofrece), **lugares reales** (`calcularCupo`), **precio vigente** en la fecha (`null` = «sin precio»: ni se inventa ni se calculan promociones) y **promociones aplicables con desglose** (resolutor de C3). Si hay más de un programa son alternativas (`permite_traslape`; decisión 9 → C6).
- **Fecha de corte de edad** (migración `20261012000000_cotizador_edad_corte`): `programa.fecha_corte_edad` (nula). Con fecha de nacimiento, la edad se mide **a esa fecha** y no a hoy (quien nace después del corte aún no es elegible); sin corte, a la fecha de la consulta; con solo `edad_declarada` se usa tal cual (documentado en el encabezado de `cotizar.ts`). `edadCumplida(fechaNac, fecha)` en `src/lib/edad.ts` (el 29 de febrero se cumple el 1 de marzo en años no bisiestos; el día del cumpleaños ya cuenta).
- **Horarios y fechas en español** (`src/lib/horario.ts`): `formatearHorarios` junta los días con la misma hora («lunes y miércoles de 16:00 a 17:00»), el domingo va al final; `fechaLocal(instante, zona)` da «hoy» en la zona de la sucursal.
- **Punto de enchufe de la ocupación (para F4):** `FuenteOcupacion` entra por `cargarCatalogoCotizable({fuente})` y por `DepsApi.fuenteOcupacion` / `ApiDepsEntrada.fuenteOcupacion` (por omisión `SinInscripciones`). **No se creó la tabla `inscripcion`.**
- **API** `GET /api/cotizador?vertical_id=&sucursal_id=&edad=|fecha_nacimiento=&fecha=&hermanos_inscritos=&meses_pagados=`; permiso nuevo `cotizador:leer` (administrador y asesor); sucursal fuera del alcance → 404. Documentado en `docs/API.md`.
- Helpers de prueba nuevos en `src/testutil/semilla.ts`: `sembrarPrograma` (programa + grupos + horarios + precio) y `OcupacionFija` (fuente de ocupación que el test cambia).

**Verificación**
```
$ npm run validar     → exit 0 · tests 350 · pass 350 · fail 0
$ npm run test:int    → exit 0 · tests 406 · pass 406 · fail 0   (dos corridas; la 2.ª sin tocar archivos)
```
Tests nuevos: `src/lib/edad.test.ts` (6: cumpleaños, 29 de febrero, cuenta día por día durante 40 años), `src/lib/horario.test.ts` (5), `src/cotizador/cotizar.test.ts` (20: cada borde de rango 5/6 y 13/14 y los extremos, sin programa, vertical y sucursal, alternativas, grupo lleno con y sin lista de espera, orden, dinero exacto 15 % de $1,234.50 = $185.18, promoción vencida en sus bordes, fecha de corte —antes/después/mismo día—, solo edad declarada, entradas imposibles, determinismo con el catálogo barajado), `src/cotizador/cotizador.itest.ts` (12: endpoint, bordes, fuente de ocupación inyectada, **cambio de precio a mitad** el 14/15 de octubre y equivalencia con `precioVigente`, promoción vencida, fecha de corte por la API, «hoy» en la zona de la sucursal, permisos por rol, alcance por sucursal, no-fuga, 12 validaciones, programas inactivos/borrados/grupos inactivos/sucursal que deja de ofrecer la vertical).
Mutaciones atrapadas: `>=`→`>` y `<=`→`<` en el rango de edad, ignorar el corte, aceptar nacidos después del corte, quitar el orden por lugares, ofrecer grupos sin horario, `>=`→`>` en el día y en el mes del cumpleaños, ignorar la vertical.

**Decisiones que tomé**
- *Catálogo cargado una vez + función pura* (en vez de una consulta SQL por cotización como el §9 del modelo): el bot (C6–C8) decide con el mismo catálogo en memoria y la máquina de estados sigue pura; el costo es cargar los programas de la vertical (decenas de filas). Alternativa descartada: replicar la consulta SQL del insumo (agregaciones `json_agg` que habría que mantener junto a una versión en código).
- *Sin `POST /api/cotizador/cotizar`:* el `GET` ya recibe todo lo que cambia el resultado (edad o nacimiento, hermanos, meses por adelantado, fecha) y no escribe nada. El `POST` que sí tiene sentido es el de guardar la cotización (C8).
- *Solo grupos con horario:* sin horario no se puede ofrecer; la verificación 2 del catálogo ya exige cero grupos sin horario.
- *Con fecha de nacimiento Y edad declarada manda la fecha de nacimiento* (es el dato más preciso).
- *Quien nace después de la fecha de corte no entra al programa* (todavía «no tiene edad»), en lugar de dar una edad negativa.

**Para Eduardo**
- **No se puso `fecha_corte_edad` en ningún programa del seed:** no hay una fecha de inicio de ciclo que la escuela haya dado. Se captura por programa cuando exista J7 (o por SQL). El cotizador y los tests ya la respetan.
- El bot captura solo la **edad declarada** (el contacto dice «8»), no la fecha de nacimiento: para un programa con corte, la edad declarada se usa tal cual. Si la escuela quiere que la edad se mida al corte desde WhatsApp, hay que pedir la fecha de nacimiento (decisión de producto; no se cambió el flujo de tres preguntas).

## C6. Varios programas para una edad (decisión 9)

**Qué se hizo**
- **La máquina de estados consulta el catálogo con el cotizador puro** (`src/captacion/maquina.ts`; sigue sin leer base ni red). El contexto trae `cotizador?: { verticalId, catalogo }` (el catálogo cotizable ya cargado); si no viene, la captura es la de siempre. Con el cotizador encendido, al conocer edad y sucursal: **un** programa para la edad → lo anota y cierra mencionándolo (`textos.cierreConPrograma`); **varios** (programas marcados `permite_traslape`) → paso nuevo `programa` con la lista numerada («1. Nombre — descripción pública»), se elige por número o por nombre; respuesta inválida → reintento y a la **tercera** pasa al asesor (`sin_entender`), como los demás pasos. Los nombres y descripciones salen de las tablas.
- **Efectos declarativos:** la máquina no escribe; devuelve `efectos` (`{tipo: "programa_sugerido", programaId}`) y `procesarEntrante` los aplica en su transacción (`prospecto.programa_sugerido_id`). Los bloques siguientes agregan más efectos al mismo mecanismo.
- **Migración `20261012010000_programa_sugerido_y_cotizador_vertical`:** valor `programa` en el enum `paso_captacion` (los datos existentes no cambian: solo se agrega un valor), `prospecto.programa_sugerido_id` (**FK compuesta** a `programa`, Restrict) y **`vertical.cotizador_whatsapp_activo`** (falso por defecto). La columna de la decisión 15 se adelantó de C8 a este bloque porque C6, C7 y C8 solo corren con el cotizador encendido.
- **Interruptor por vertical:** `cotizador_whatsapp_activo`. **Apagado, la captura NO cambia** (tres preguntas, cierre y pase; los tests existentes de la máquina y del loop pasan sin tocarse). El seed `catalogo-completo.sql` lo enciende en las tres verticales de la demo, solo mientras nadie haya editado la vertical (`actualizado_en = creado_en`).
- La nota al asesor agrega «• Programa: …» solo si el cotizador anotó uno. `PASOS_A_MEDIAS` (en `maquina.ts`) es la lista única de pasos «a medias»: la usan el aviso de 30 min (`espera.ts`) y el reenganche (`motor.ts`); un paso nuevo que espera respuesta se agrega ahí.
- Ayudante de pruebas nuevo `src/testutil/bot.ts` (`escenarioBot`): organización con catálogo, transporte falso y contactos que escriben.

**Verificación**
```
$ npm run validar     → exit 0 · tests 359 · pass 359 · fail 0
$ npm run test:int    → exit 0 · tests 414 · pass 414 · fail 0
```
Tests nuevos: `maquina-cotizador.test.ts` (9: un programa, varios con la lista exacta, sin descripción, elegir por número/nombre, reintentos y tercer fallo, una sola sucursal, programas de otra sucursal, sin cotizador = captura de siempre con el estado final idéntico al de antes, la nota), `cotizador-bot.itest.ts` (6: elección y `programa_sugerido_id`, único programa, tres fallos con nota de datos parciales, cotizador apagado, aviso de 30 min en el paso `programa`, FK compuesta contra otra organización) y dos en `catalogo-completo.itest.ts` (las tres verticales de la demo con el cotizador encendido y el seed no pisa una decisión del administrador; el cotizador sobre el catálogo completo: 6 combinaciones × 99 edades, solo hay varios programas si todos son alternativas, y la edad de las alternativas da exactamente 2).

**Decisiones que tomé**
- *`programaId` y `efectos` opcionales en el estado y en el resultado de la máquina:* así el estado final de la captura sin cotizador es idéntico (los `deepEqual` existentes siguen valiendo sin cambiar una coma). Alternativa descartada: campos siempre presentes (habría obligado a editar los tests de la máquina).
- *Con un solo programa no se pregunta:* se anota y se menciona en el cierre; así la nota ya trae el programa. Con **cero** programas la captura cierra como siempre (C7 decide qué hacer).
- *El catálogo se carga solo en los pasos que lo usan* (`edad`, `sucursal`, `programa`; luego los de C7–C9): el resto de los mensajes no paga las consultas.
- *La lista de programas no se guarda:* se recalcula del catálogo en cada respuesta (determinista, ordenada por nombre). Si el administrador edita el catálogo entre la pregunta y la respuesta, el número podría apuntar a otro programa; es una ventana de minutos y rara. (La lista de horarios de C8 sí se guarda, porque ahí hay lugares que cambian.)

**Para Eduardo**
- Con el cotizador encendido, **un contacto cuya edad cae en un programa recibe un cierre distinto** («… para <programa> en la sucursal …»). Es el comportamiento pedido; apagar el interruptor de la vertical lo deja como antes.

## C7. Otra sucursal (decisión 8)

**Qué se hizo**
- **Configuración** (patrón de `src/configuracion/index.ts`): columna `configuracion_organizacion.sucursal_sin_programa` (enum `politica_sucursal_sin_programa`: `ofrecer_otra` por defecto | `avisar_asesor`), campo `sucursalSinPrograma` en `ConfiguracionOrganizacion` y en `CONFIGURACION_POR_DEFECTO` (el test que compara los defaults del código con los de la columna lo cubre). Migración `20261012020000_sucursal_sin_programa` (enum nuevo, valor `otra_sucursal` en `paso_captacion` y una columna con default: sin pérdida de datos).
- **Bot (máquina pura):** con el cotizador encendido y **sin programa para la edad en la sucursal elegida**: con `ofrecer_otra` y al menos una otra sucursal que sí lo tenga, paso `otra_sucursal`: «En la sucursal X por ahora no tenemos clases para N (E años), pero en la sucursal Y (dirección) sí. ¿Quieres que te cotice ahí? Responde sí o no.» (con varias, lista numerada con dirección). **Sí / el número / el nombre** → se recotiza allí (cambia `lead.sucursal_interes_id`, y sigue C6: un programa se anota, varios se preguntan). **No / «asesor»**, o ninguna otra sucursal con programa, o política `avisar_asesor` → pasa al asesor con motivo nuevo `sin_programa` y nota («La sucursal elegida no tiene programa para la edad y el contacto no pasó a otra sucursal…», con los datos capturados). Respuestas que no se entienden reintentan y a la tercera `sin_entender`.
- `PASOS_A_MEDIAS` incluye `otra_sucursal` (aviso de 30 min y reenganche). `sí`/`no` se reconocen completos, sin importar acentos, mayúsculas ni signos («¡Sí, por favor!»).
- **Un catálogo vacío para la vertical NO es «sin programa para su edad»:** significa que el catálogo aún no se cargó; la captura cierra como siempre (así el cotizador encendido no rompe una vertical sin catálogo).

**Verificación**
```
$ npm run validar     → exit 0 · tests 371 · pass 371 · fail 0
$ npm run test:int    → exit 0 · tests 422 · pass 422 · fail 0
```
Tests nuevos: 12 en `maquina-cotizador.test.ts` (oferta con una y con varias sucursales y con dirección, aceptar por sí/número/nombre/«¡Sí, por favor!», rechazar, tercer fallo, `avisar_asesor`, sin otra sucursal, catálogo vacío, recotizar con varios programas, la nota) y 8 en `cotizador-bot.itest.ts` (aceptar: cambia la sucursal del lead y anota el programa; rechazar; política `avisar_asesor`; la política es por organización; sin alternativa; cotizador apagado; reintentos; aviso de 30 min). Cambié por diseño las aserciones de `configuracion.itest.ts` que comparaban el objeto de configuración completo (ahora trae `sucursalSinPrograma: "ofrecer_otra"`); no se debilitó ninguna.
Mutaciones atrapadas: aceptar un «sí» con varias opciones, que «no» no pase al asesor, quitar la guarda de catálogo vacío, ignorar la política `avisar_asesor`. **Equivalentes** (sobreviven): excluir la sucursal elegida de «las otras» (nunca tiene programa, así que no aparece) y la guarda `yaOfrecida` (con el mismo catálogo, una sucursal ofrecida siempre tiene programa; es defensa por si un cambio posterior rompe esa simetría).

**Decisiones que tomé**
- *La política vive en la configuración de la organización, no en la vertical:* así lo pide el plan («configurable») y el patrón de A6; alternativa descartada: columna en `vertical` (más flexible pero no se pidió y duplica el mecanismo).
- *Una frase libre («mejor un asesor, gracias») no cuenta como «no»:* solo las respuestas completas conocidas; lo demás reintenta y a la tercera pasa al asesor, como el resto del bot (determinista, sin interpretar texto libre).
- *Con la política `avisar_asesor` y también cuando no hay alternativa el contacto recibe un mensaje claro* («Por ahora no encontré un programa para N… Te comunico con un asesor») en vez del cierre de siempre, que decía «te escribe con horarios y costos».

**Para Eduardo**
- **[SUPUESTO]** los textos de las ofertas y de «sin programa» (genéricos, en `src/captacion/maquina.ts`): revisar el tono.
- No hay API ni pantalla para cambiar la política todavía (J8, administración de mensajería). Hoy se cambia con SQL: `UPDATE configuracion_organizacion SET sucursal_sin_programa = 'avisar_asesor'`.
- Las direcciones de las sucursales de la demo siguen vacías: la oferta sale sin dirección hasta que la escuela las dé.

## C8. Cotización guardada y cotizador por WhatsApp (decisión 15)

**Qué se hizo**
- **Tabla `cotizacion`** (migración `20261012030000_cotizacion`; `organizacion_id`, `eliminado_en` y FK compuestas como el resto): `lead_id`, `prospecto_id`, `programa_id`, `sucursal_id`, `origen` (`bot` | `asesor`), `conversacion_id` (solo el bot), `creado_por_usuario_id` (solo el asesor), `grupo_elegido_id`, `fecha`, `vigente_hasta`, `estatus` (`vigente` | `aceptada` | `vencida`) y **`snapshot` JSON**: programa, grupos con lugares y horarios, precio y promociones de ese día, importes como texto. En la base: **una vigente por (prospecto, programa)** (índice único parcial), `vigente_hasta ≥ fecha`, origen coherente (el bot dentro de una conversación y sin asesor; el asesor sin conversación) y snapshot objeto. `configuracion_organizacion.cotizacion_vigencia_dias` (7 por defecto, entre 1 y 365). Enum `paso_captacion` + `horario`.
- **El bot cotiza** (con `vertical.cotizador_whatsapp_activo`): después de las tres preguntas (y de C6/C7) manda **una cotización**: programa, horarios numerados con su lugar («10 lugares», «1 lugar», «lista de espera»), inscripción y mensualidad (con la promoción vigente: «$500.00 → $450.00» y «Promoción vigente: nombre: $50.00 menos en la inscripción») y «responde con el número del horario… o escribe «asesor»». **Registra lo cotizado** (efecto `guardar_cotizacion`: reemplaza a la vigente anterior del mismo prospecto y programa). Al **elegir horario** guarda `cotizacion.grupo_elegido_id` (efecto `elegir_grupo`) y hace el **handoff** al asesor con la nota (programa, cotización con precio y vigencia, promociones y horario elegido). «asesor» → motivo `pidio_asesor` con la cotización en la nota. Sin lugar en ningún grupo: la cotización sale igual y pasa al asesor. Sin precio vigente: «el costo te lo confirma un asesor». Respuestas inválidas: reintento y a la tercera, `sin_entender`. Todo por `MessagingProvider` (`respuestaA`); se interrumpe en `horario` → aviso de 30 min (`PASOS_A_MEDIAS`).
- **Con el cotizador apagado la captura NO cambia** (tres preguntas, cierre, pase y sin filas en `cotizacion`): hay un test. El interruptor es por vertical (otro test).
- **Vigencia:** `vigente_hasta = min(fecha + días de la configuración, fin del precio vigente, fin de cada promoción cotizada)`. `vencida` la pone `vencerCotizaciones` en el mantenimiento horario del ciclo (con un día de margen sobre la fecha UTC; nunca vence una antes de tiempo) y la API ya la muestra vencida aunque el barrido no haya corrido.
- **Los números apuntan a lo que vio:** los horarios que se le numeran al contacto salen del **snapshot guardado**, no del catálogo de hoy (si el grupo A se llena entre la cotización y la respuesta, su «1» sigue siendo A). Test.
- **Precios congelados:** cambiar el precio después no toca el snapshot (test) y la nota dice lo que se cotizó.
- **API** (`docs/API.md`): `GET /api/leads/:id/cotizaciones` (`leads:leer`) y `POST /api/leads/:id/cotizaciones` (`leads:escribir`: administrador y asesor) —el asesor cotiza a mano—: el servidor cotiza con el cotizador (nada de precios del cliente), guarda congelado, reemplaza la vigente, registra el cambio (`registro_cambio`: crear + actualizar de la reemplazada) bajo un candado por (prospecto, programa). Alcance por sucursal del lead (404) y del programa.

**Verificación**
```
$ npm run validar     → exit 0 · tests 389 · pass 389 · fail 0
$ npm run test:int    → exit 0 · tests 448 · pass 448 · fail 0   (base de pruebas recreada VACÍA para este bloque: todas las migraciones aplican desde cero)
```
Tests nuevos: `cotizacion.test.ts` (8: vigencia con tope de precio/promoción y año nuevo, `venceEl`, opciones elegibles, snapshot ida y vuelta, JSON ajeno, descripción de promociones —15 % de $500 = $75—, resumen para la nota, `estatusEfectivo`), 10 en `maquina-cotizador.test.ts` (cotización con singular/plural/lista de espera, promoción, vigencia, sin precio, sin lugar, elegir horario por número y nombre, el snapshot manda, «asesor», lista de espera en el cierre, la nota), 12 en `cotizador-bot.itest.ts` (cotizar y guardar congelado, elegir horario y nota, «asesor», cotizador apagado, interruptor por vertical, precios congelados, numeración estable, sin precio, sin lugar, webhook repetido, dos respuestas simultáneas, aviso de 30 min, vigencia por configuración, sin datos de salud) y `cotizaciones.itest.ts` (12: cotizar a mano, vigencia y promoción que acorta, reemplazo + registro de cambios, **6 cotizaciones simultáneas → 1 vigente y 5 vencidas**, 409 por edad y 10 validaciones, permisos por rol, alcance, no-fuga, paginación y estatus derivado, `vencerCotizaciones` con sus márgenes, barrido y ciclo, y las garantías de la base). Los tests de C6 y C7 que esperaban el cierre con programa ahora esperan la cotización y el paso `horario`: cambió **por diseño** (C8 reemplaza el cierre provisional de C6) y está dicho aquí; ninguna aserción se debilitó.
Mutaciones atrapadas: usar los horarios de hoy en vez de los guardados, ignorar el tope de vigencia, ofrecer grupos llenos sin lista, que «asesor» no pase a una persona, no cargar el snapshot, no reemplazar la vigente anterior, no anotar el horario, permitir cotizar a recepción, y sin el margen de `estatusEfectivo`.

**Decisiones que tomé**
- *Elegir horario NO marca `aceptada`:* aceptar es inscribirse (F3). La cotización queda `vigente` con `grupo_elegido_id`; F3 la pasa a `aceptada`. Alternativa descartada: `aceptada` al elegir (pierde la diferencia entre «le interesa este horario» y «se inscribió»).
- *Un solo mensaje con toda la cotización* (programa, horarios, precio, promoción y la pregunta) en vez de varios: menos mensajes automáticos al día (límite de frecuencia de A6) y el contacto ve todo junto.
- *Una vigente por (prospecto, programa) y la nueva vence a la anterior* (en vez de acumular vigentes): lo último que se dijo es lo que vale; las anteriores quedan como historial (`vencida`).
- *`snapshot` incluye `descartadas` de promociones y todos los grupos (también los llenos sin lista):* es el registro completo de lo que el cotizador calculó; el contacto solo ve lo elegible.
- *Sin `PATCH` para elegir horario a mano:* no se pidió; el asesor cotiza de nuevo o lo atiende por Chatwoot.
- *El `POST` toma la edad del prospecto (`edad_declarada`):* no la recibe del cliente, para que lo cotizado coincida con lo capturado.

**Para Eduardo**
- **[SUPUESTO]** vigencia de 7 días de una cotización y todos los textos del mensaje de cotización (genéricos, en `src/captacion/maquina.ts`): revisar tono y si quiere más datos (dirección de la sucursal, duración de la clase).
- Con el cotizador encendido, **el contacto recibe la cotización sin que un asesor la revise**: precios y promociones salen de las tablas, así que lo cargado en el catálogo (todo `[SUPUESTO]` hoy) es lo que se le dice al cliente. Antes de encender una vertical con clientes reales hay que confirmar precios, cupos y promociones.
- Los programas con fecha de corte de edad no se pueden cotizar por fecha de nacimiento desde WhatsApp (el bot solo captura la edad); ver C5.

## C9. Lista de espera

**Qué se hizo**
- **Tabla `lista_espera`** (migración `20261012040000_lista_espera`): `grupo_id`, `prospecto_id`, `lead_id` (FK compuestas), `estatus` (`esperando` | `ofrecido` | `inscrito` | `cancelado`), `posicion`, `ofrecido_en`, `vence_en`. En la base: **una viva (esperando u ofrecido) por (grupo, prospecto)** y **posición única por grupo entre las vivas** (índices únicos parciales), `posicion ≥ 1` y oferta coherente (ofrecido ⇒ fechas con `vence_en > ofrecido_en`; esperando ⇒ sin fechas). `configuracion_organizacion.lista_espera_oferta_horas` (48 por defecto, 1 a 720). Enum `paso_captacion` + `lista_espera`; tareas nuevas `lista_espera_nueva` y `lista_espera_lugar_liberado`.
- **Posición:** densa (1..N) entre las vivas; la alta siempre queda al final (orden de llegada determinista); cerrar una entrada conserva su posición como historial y recorre a las demás; mover reordena. Todo cambio corre bajo un **candado por grupo** (`lista_espera:<grupo>`) y la base impide repetir una posición aunque alguien se salte el candado. El recorrido usa dos pasos (sacar de en medio las que cambian y asignarlas) para no chocar con el índice único.
- **Módulo** `src/lista-espera/lista-espera.ts`: `altaListaEspera(tx, …)` (sin candado, para la transacción de otro flujo; idempotente), `altaConCandado(db, …)`, `cerrarEntrada(db, id, "cancelado" | "inscrito")`, `cerrarEntradaDe(db, grupoId, prospectoId, …)`, `moverEnListaEspera`, **`ofrecerLugarLiberado(db, grupoId)`** (marca al primero que espera como `ofrecido`, fija `vence_en` y crea la tarea `lista_espera_lugar_liberado` con el nombre del prospecto, la posición y la hora límite en la zona de la sucursal; atómico: tres lugares liberados a la vez van a tres familias distintas; NO escribe a nadie) y `entradasVivasDe`.
- **El bot:** al elegir un horario **lleno que permite lista de espera**, en lugar de cerrar pregunta «¿Quieres que te apuntemos en la lista de espera? … Responde sí o no» (paso `lista_espera`; el horario queda como tentativo en `cotizacion.grupo_elegido_id`). **Sí** → alta en la lista + tarea `lista_espera_nueva` para el asesor (con la posición; si el grupo ya recuperó un lugar lo avisa; si dejó de permitir lista, no apunta a nadie y la tarea lo dice) + handoff con «Lista de espera: grupo (posición N)» en la nota. **No** → vuelve a los horarios y descarta el tentativo. «asesor» → persona. Lo que no entiende reintenta y a la tercera, `sin_entender`. El grupo lleno **sin** lista de espera no se ofrece. Todo por `MessagingProvider`; el paso entra en `PASOS_A_MEDIAS` (aviso de 30 min).
- **API para el asesor** (`docs/API.md`): `GET /api/lista-espera?grupo_id=&prospecto_id=&estatus=` (`lista_espera:leer`: administrador, asesor y recepción; sin `estatus` trae las vivas), `PATCH /api/lista-espera/:id {posicion}` (mover) y `DELETE /api/lista-espera/:id` (quitar = `cancelado`, sin borrar) con `lista_espera:escribir` (administrador y asesor); alcance por la sucursal del programa del grupo (404 si no); cada cambio queda en `registro_cambio` en la misma transacción.
- `MAX_REINTENTOS` de `procesarEntrante` sube de 3 a 8: varias familias aceptando la lista del mismo grupo a la vez se disputan la posición (cada intento fallido es que otra ganó); el webhook sigue siendo idempotente.
- `src/server.ts` crea UNA `fuenteOcupacion` (`SinInscripciones`) y la pasa a la API y al bot: F4 cambia esa línea.

**Verificación**
```
$ npm run validar     → exit 0 · tests 392 · pass 392 · fail 0
$ npm run test:int    → exit 0 · tests 482 · pass 482 · fail 0
```
Tests nuevos: 4 en `maquina-cotizador.test.ts`, `lista-espera.itest.ts` (15: orden de llegada e idempotencia, rechazos, **10 altas simultáneas → posiciones 1..10** con una barrera que fuerza a todas a leer lo mismo, **sin candado la base rechaza la posición repetida** (6 simultáneas → gana 1, el resto violación de unicidad), la misma familia 5 veces a la vez, quitar/mover/recorrer, `ofrecerLugarLiberado` (tarea, vencimiento, horas de la configuración, **3 lugares a la vez → 3 familias distintas**), el punto de enchufe de F3, no-fuga y las garantías de la base), `api.itest.ts` (7: listar con filtros y paginación, permisos por rol, alcance por sucursal, mover, quitar con registro, **4 quitar simultáneos y quitar+mover**, no-fuga) y 12 en `cotizador-bot.itest.ts` (grupo lleno solo con lista, sí/no/asesor/inválidas, tres familias en orden, **5 familias aceptando a la vez → posiciones 1..5 y 5 tareas** (corrida 4 veces seguidas sin fallar), «sí» repetido sin duplicar, lugar recuperado, grupo que dejó de permitir lista, cotizador apagado, aviso de 30 min).
Mutaciones atrapadas: quitar el candado, posición +2, no sacar de en medio al recorrer, ofrecer al último en vez del primero, ofrecer a un ya ofrecido, no recorrer al cerrar, mover a un ofrecido, no ser idempotente, ignorar `permite_lista_espera`.

**Decisiones que tomé**
- *Dos entradas del mismo prospecto en grupos distintos son válidas* (la unicidad es por grupo): una familia puede esperar dos horarios.
- *La oferta de un lugar no escribe a la familia:* solo marca y deja la tarea, como pidió el encargo y para respetar las reglas de ventana, plantilla y horario de `MessagingProvider`. El asesor decide cómo avisar. Alternativa descartada: mandar una plantilla automática (necesita plantilla aprobada y horario).
- *Una oferta vencida no pasa sola al siguiente:* `vence_en` es la fecha límite que ve el asesor en la tarea; quitar a quien no tomó el lugar (`DELETE`) y volver a llamar `ofrecerLugarLiberado` es decisión de una persona. Alternativa descartada: barrido que devuelva ofertas vencidas (decide el negocio si pasa al final de la fila, se cancela o se avisa antes).
- *Posición densa y mantenida por el código* (en vez de un contador de llegada inmutable más una posición calculada): el asesor puede mover y la posición que ve es la que vale. Costo: reordenar al cerrar o mover (pocas filas por grupo).
- *Sin `POST /api/lista-espera`:* el encargo pidió listar, quitar y mover; el alta manual del asesor puede llegar con la interfaz (J3) usando `altaConCandado`.
- *`inscrito` solo lo marca F3* (`cerrarEntrada`): hoy nadie lo usa.

**Para Eduardo**
- Los textos de la pregunta de la lista y de los cierres son genéricos: revisar tono.
- **Decisión de producto abierta:** qué pasa cuando una familia no toma el lugar ofrecido a tiempo (¿pasa al final, se cancela, se avisa?). Hoy lo resuelve una persona con las tareas.
- El bot solo apunta **un** prospecto por conversación (límite de C-anteriores); varios hijos a la lista llegarán con la interfaz del asesor.

## Cierre de C5 a C9 (cotizador) — para quien siga

**Estado.** C5, C6, C7, C8 y C9 HECHOS (commits en el historial: `C5:` … `C9:`). Etapa C completa salvo la auditoría y la etiqueta `etapa-C` (las hace quien coordina).

**Cómo enchufar lo que falta**
- **Ocupación real (F4).** `FuenteOcupacion` (`src/catalogo/cupo.ts`: `ocupados(db, grupoId)`) es la única fuente de «lugares ocupados». Escribe una que cuente las inscripciones activas del grupo y cámbiala en **`src/server.ts`** (`const fuenteOcupacion = new SinInscripciones()`): se inyecta a la API (`api.fuenteOcupacion` → `DepsApi.fuenteOcupacion` → cotizador y cotizaciones a mano) y al bot (`procesarEntrante({ fuenteOcupacion })`). Los tests usan `OcupacionFija` (`src/testutil/semilla.ts`). La lista de espera NO cuenta como ocupación. La inscripción debe tomar el cupo de forma atómica (dos inscripciones por el último lugar: gana una).
- **Un lugar liberado (F5).** Cuando una baja o un cambio de grupo libere un lugar, llama `ofrecerLugarLiberado(db, grupoId)` (`src/lista-espera/lista-espera.ts`) **después de confirmar la baja** (usa su propia transacción con el candado del grupo): marca al siguiente como `ofrecido` y deja la tarea `lista_espera_lugar_liberado`. Devuelve null si nadie espera. Si quien esperaba se inscribe (F3/F5), ciérrale la entrada con `cerrarEntrada(db, id, "inscrito")` o `cerrarEntradaDe(db, grupoId, prospectoId, "inscrito")`.
- **Cotización guardada (F3).** La tabla `cotizacion` guarda el `snapshot` congelado (programa, grupos con lugares y horarios, `precio.costo_inscripcion` / `costo_mensualidad` en texto, `promociones` con `inscripcion` y `mensualidad` → `final_ahora` y `final_con_diferidos`, `lineas` con lo diferido) y `grupo_elegido_id`. Para respetar lo cotizado en la inscripción: busca la `cotizacion` vigente del prospecto y programa (`estatus = 'vigente'`, `vigente_hasta ≥ hoy`), toma los precios del snapshot (los importes ya son texto: `deTexto`) y, al inscribir, pásala a `aceptada`. Si no se respeta, el precio vigente de hoy sale de `precioVigente`. `promocion_aplicacion.inscripcion_id` sigue sin FK hasta F3.
- **Cotizar desde otro módulo:** `cargarCatalogoCotizable(db, {verticalId, sucursalIds, fecha, fuente})` + `cotizar(catalogo, {verticalId, sucursalId, edadDeclarada | fechaNacimiento, hermanosInscritos, mesesPagadosPorAdelantado})` (puro) + `cotizacionAJson`; guardar con `guardarCotizacion(tx, …)` (reemplaza la vigente anterior del prospecto y programa).
- **Pasos nuevos del bot:** `programa`, `otra_sucursal`, `horario`, `lista_espera` (enum `paso_captacion`). Todo paso que espera respuesta va en `PASOS_A_MEDIAS` (`maquina.ts`) y, si usa el catálogo, en `PASOS_CON_CATALOGO` (`entrante.ts`). La máquina pide **efectos** (`programa_sugerido`, `guardar_cotizacion`, `elegir_grupo`, `entrar_lista_espera`) que `aplicarEfectos` ejecuta en la transacción del mensaje.
- **Configuración nueva** (`configuracion_organizacion`, sin API todavía; J8): `sucursal_sin_programa`, `cotizacion_vigencia_dias`, `lista_espera_oferta_horas`. **Interruptor por vertical:** `vertical.cotizador_whatsapp_activo`.
- **Permisos nuevos:** `cotizador:leer`, `lista_espera:leer`, `lista_espera:escribir`.
- **Migraciones de C5 a C9:** `20261012000000_cotizador_edad_corte`, `…010000_programa_sugerido_y_cotizador_vertical`, `…020000_sucursal_sin_programa`, `…030000_cotizacion`, `…040000_lista_espera`. La siguiente debe usar `20261013…` o mayor.

**Decisiones de producto abiertas de C5 a C9** (todas con un valor por defecto razonable ya implementado)
1. Fecha de inicio de ciclo por programa (`programa.fecha_corte_edad`) y si el bot debe pedir la fecha de nacimiento (hoy solo captura la edad; un programa con corte usa la edad declarada tal cual).
2. Vigencia de una cotización (7 días), horas para tomar un lugar de la lista de espera (48) y qué pasa cuando no lo toman.
3. Si el cliente puede recibir la cotización sin revisión de un asesor mientras precios, cupos y promociones del seed sigan siendo `[SUPUESTO]`.
4. Textos del bot (genéricos): tono de la cotización, de la oferta de otra sucursal y de la lista de espera.
5. Política `sucursal_sin_programa` por defecto (`ofrecer_otra`) —decisión 8 ya tomada— y quién la cambia (hoy SQL).

**Verificación del último commit de código de C5 a C9** (árbol limpio; el último ajuste fue un test que dependía del orden de dos filas escritas en la misma transacción):
```
$ npm run validar                      → exit 0 · tests 392 · pass 392 · fail 0
$ npm run test:int                     → exit 0 · tests 482 · pass 482 · fail 0   (1.ª corrida)
$ npm run test:int                     → exit 0 · tests 482 · pass 482 · fail 0   (2.ª corrida seguida)
$ DATABASE_URL_PRUEBAS=…/vacia_c9_pruebas npm run test:int → exit 0 · tests 482 · pass 482 · fail 0   (base NUEVA y vacía; luego se borró)
```
Línea base al empezar C5: validar 319 tests, test:int 394. Dos fallos intermitentes vistos y resueltos/anotados: (1) `cotizaciones.itest.ts` comparaba el ORDEN de dos filas de `registro_cambio` escritas en la misma transacción (comparten `creado_en`): ahora compara el conjunto; (2) una vez, en una corrida de `validar`, `src/http/twilio.test.ts` («respuestas del borde…») dio 404 en vez de 500; no se reprodujo en 6 corridas aisladas ni en las dos siguientes de `validar`. **No es de este trabajo** (no toca ese archivo ni la ruta), pero conviene vigilarlo: parece una intermitencia previa del test del borde.

## Auditoría y correcciones de la etapa C

Auditoría: `docs/auditorias/etapa-C.md` (0 ALTA, 10 MEDIA —9 más 1 de producto— y 16 BAJA; el informe entra en el primer commit, `cd6ba4e`). Commits `C-fix: …`:

| Commit | Qué |
|---|---|
| `cd6ba4e` | Informe de la auditoría |
| `7b8b0b8` | EC-07 |
| `dafb14f` | EC-05 |
| `efd45a2` | EC-01, EC-02, EC-03, EC-04, EC-12 |
| `8ea14dd` + `b41edfe` | EC-06 (el segundo corrige dos `no-useless-escape` que dejaron `validar` en rojo en el primero) |
| `9488ea6` | EC-08 |
| `2df6f63` | EC-09 (pruebas de las 11 mutaciones que sobrevivían) |
| `a9690ad` | EC-14, EC-15 |

### Estado de cada hallazgo

| EC | Estado | Cómo / por qué |
|---|---|---|
| EC-01 | **corregido** | `elegirHorario` devuelve `false` (no lanza) con un grupo inexistente o de otro programa; la máquina trata un grupo que ya no está en el catálogo de hoy como «ya no está disponible» y manda la cotización actualizada (que reemplaza a la anterior). El mensaje del contacto se procesa y se guarda. Pruebas: itest con el grupo dado de baja entre la cotización y la respuesta, unitaria de la máquina y de `elegirHorario`. |
| EC-02 | **corregido** | `cotizacionDelBot` y `horariosCotizadosAlContacto` exigen que el último día no haya pasado (no esperan al barrido). Si en `horario`/`lista_espera` ya no hay cotización útil, `entrante.ts` pone `cotizacionVencida` y la máquina manda una cotización NUEVA con aviso, en vez de interpretar el número contra una lista que no vio; el horario que luego elige sí queda registrado y sale en la nota. Probado por barrido y por fecha pasada sin barrido. |
| EC-03 | **corregido** | Sin `ctx.cotizador` (interruptor apagado a media conversación) los pasos `programa`, `otra_sucursal`, `horario` y `lista_espera` cierran como la captura de siempre (`captura_completa`, mensaje «¡Gracias! Ya tengo los datos…»), y sin opciones que ofrecer pasan al asesor al instante: nada de «Responde con el número:» con la lista vacía. |
| EC-04 | **corregido (por el mensaje)** | Si el grupo elegido se llenó y no tiene lista de espera, el bot anota la preferencia (como pedía la prueba de C8: «el número apunta a lo que vio») y pasa al asesor, pero ya no dice «Anotamos a…»: dice que ese grupo ya no tiene lugar y que un asesor le ofrece otra opción. No se cambió el registro del horario (decisión de C8 intacta). |
| EC-05 | **corregido para lo nuevo; lo heredado, reportado** | `src/catalogo/salones.ts`: clave sin mayúsculas, acentos ni espacios de más; la API la usa al crear y renombrar, bajo el candado de ocupación, y guarda el nombre limpio. Verificación nueva `salonesConNombreParecido` para los salones ya migrados (no se fusionan solos: decisión del administrador). No se editó la migración vieja. Pruebas: 5 variantes, renombrar, baja que libera el nombre, 6 rondas × 16 altas simultáneas (sin el candado falla 5 de 5). |
| EC-06 | **corregido** | `check:dinero` lee el texto entero (el paréntesis ya no puede esconderse en otra línea) y prohíbe corchetes, `globalThis`, `~~`, `Math.fround`, funciones de flotantes sin llamar, y en zonas de dinero `+x`, `* 0.15` y `* 1`. El repositorio sigue limpio. Cada una de las 10 reglas de texto y `fround` tiene una prueba que falla si se quita. |
| EC-07 | **corregido** | `fechaISO()` acepta de 1900 a 2999. Pruebas: unitaria de los extremos y de integración (alta de precio, filtro y cotizador con `0000-01-01` → 400). |
| EC-08 | **corregido** | El snapshot de la cotización del asesor lleva `supuestos {hermanos_inscritos, meses_pagados}` si alguno es distinto de 0 (el del bot no cambia), el registro de cambios los guarda y la nota dice «Cotizado suponiendo…». `docs/API.md` actualizado. |
| EC-09 | **corregido** | Las 11 mutaciones con hueco real (R18, P05, Q07, Z06, X24, X39, X40, S3, S4, S5, S6) ahora se atrapan; ver «Mutaciones». |
| EC-10 | **pendiente: decisión de Eduardo** | El maestro lee precios, promociones, salones e instructores de su sucursal por `catalogo:leer`. Propuesta en el informe: un permiso `precios:leer` sin el maestro. |
| EC-11 | **pendiente (documentado)** | La alta del bot corre en la transacción del mensaje y no toma el candado del grupo, así que contra un «quitar» concurrente puede dejar 1, 2, 4. Arreglarlo exige poder tomar un candado consultivo dentro de una transacción ya abierta con scope (hoy `$conBloqueoDeClave` abre la suya). El orden no se afecta y el siguiente cambio bajo candado renumera. |
| EC-12 | **corregido** | `procesarEntrante` quita los NUL del contenido y del nombre del contacto antes de tocar la base. |
| EC-13 | **pendiente: decisión** | `resumenDeCapacidad` suma grupos inactivos; ¿la verificación 2 cuenta solo lo activo? |
| EC-14 | **corregido** | `PATCH /api/promociones/:id` pone `cupo_usado <= tope` dentro del propio `UPDATE`: si un consumo gana la carrera responde 409 y no 500. Prueba determinista con un cliente que sube el contador justo antes de escribir (con el código anterior da 500). Advertencia para F3 escrita en `src/promociones/cupo.ts` (`consumirCupo` dentro de una transacción). |
| EC-15 | **corregido** | El vencimiento de cotizaciones tiene su propia frecuencia horaria en el ciclo (`deps.cotizaciones.cadaMs`), con o sin retención. |
| EC-16 | **documentado** | `consumirCupo` solo mira `activo` y el tope; la advertencia para F3 (resolver antes vigencia, alcance y condición) está en el encabezado de `src/promociones/cupo.ts`. |
| EC-17 | **pendiente (H5)** | `producto_id` sin llave foránea hasta que exista la tabla de productos. |
| EC-18 a EC-22 | **pendientes: decisiones de producto** | Clases que cruzan la medianoche, capacidad del salón vs cupo del grupo, reescribir una vigencia pasada o borrar la vigente, alcance vacío = todos, «sí» ante un único horario. |
| EC-23 | **pendiente** | N+1 de `fuente.ocupados` y catálogo completo por mensaje del bot; F4 trae la fuente real y es el momento de optimizarlo. |
| EC-24 | **aceptado** | Las aserciones de orden de `ficha.itest.ts` quedaron como conjuntos; se anota, no se revierte (las filas son las mismas). |
| EC-25 | **pendiente** | Volver a correr `catalogo-completo.sql` resucita un precio de ejemplo dado de baja. |
| EC-26 | **pendiente (no probado)** | Crecimiento de `acceso_dato_sensible` ante un usuario sin permiso que insiste; solo lo frena el límite por IP. |

### Mutaciones

- Auditoría: 139 mutaciones sobre reglas de negocio de la etapa: 120 atrapadas y 19 sobrevivientes (8 equivalentes o redundantes, 11 huecos reales). Detalle y clasificación en el informe, sección 4.
- Correcciones: las 11 que eran huecos se atrapan ahora (7 por mutación de código y 4 por mutación de las migraciones aplicadas a bases nuevas) y cada arreglo se mutó contra sus pruebas nuevas: EC-01 a EC-04 y EC-12, 17 mutaciones del arreglo: 14 atrapadas a la primera, 2 tras añadir una prueba (aviso solo si hay cotización nueva; NUL en el nombre del contacto) y 1 que resultó redundante (`hoy` en `elegirHorario`) y se quitó; EC-08, 5 de 5; EC-06, las 10 reglas y `fround`; EC-05, comparación literal y quitar el candado; EC-14, quitar la condición del `UPDATE` da 500; EC-15, volver a acoplar y quitar la frecuencia.
- Pruebas que se escribieron mal la primera vez y se corrigieron antes del commit (no debilitadas): la de la carrera de salones se repite en seis rondas porque con una sola quitar el candado no siempre la hacía fallar; la del cupo (EC-14) pasó de «25 rondas al azar» a un gancho determinista porque con el azar no detectaba el error.

### Verificación

Línea base de la auditoría (HEAD `110eb73`): `validar` 392 tests, `test:int` 482. Al cerrar las correcciones (sin migraciones nuevas):

```
$ npm run validar                      → exit 0 · tests 409 · pass 409 · fail 0
$ npm run test:int                     → exit 0 · tests 500 · pass 500 · fail 0   (1.ª corrida)
$ npm run test:int                     → exit 0 · tests 500 · pass 500 · fail 0   (2.ª corrida seguida)
$ DATABASE_URL_PRUEBAS=…/fix2_pruebas npm run test:int → exit 0 · tests 500 · pass 500 · fail 0   (base NUEVA y vacía; luego se borró)
```

Las corridas usaron un Postgres propio (`docker run … postgres:16-alpine`, puerto 5591), nunca la base de la demo ni el proyecto compose `inscripciones`. Cada commit `C-fix` pasó `validar` y `test:int` con exit 0, salvo `8ea14dd`: su `validar` falló por dos `no-useless-escape` de ESLint y su `test:int` tuvo la prueba colgada del incidente de red de abajo (lo corrige `b41edfe`, el commit siguiente, con las dos corridas en verde; no se reescribió la historia). Las 17 mutaciones de EC-01 a EC-04/EC-12 y las demás se corrieron contra las pruebas nuevas con un script temporal (cada una cambia una cadena del código, corre las pruebas y restaura el archivo).

### Para Eduardo

- **Decisiones del informe sin cerrar:** EC-10 (maestro y precios), EC-13 (capacidad e inactivos), EC-18 a EC-22 (producto) y qué hacer con los salones heredados con nombres casi iguales (`salonesConNombreParecido` los lista).
- **Para F3/F4:** `consumirCupo` y su advertencia (EC-14/EC-16); la ocupación real entra por `FuenteOcupacion`; cuando haya inscripciones, el aviso de «ya se llenó» (EC-04) y la oferta de lista de espera dependerán de ella.
- **Un incidente de entorno:** durante una corrida de `test:int` una prueba de `borde.itest.ts` (EA-20) se colgó 5 minutos con `fetch failed` contra `127.0.0.1`; sola y en la corrida completa siguiente pasó. Parece un fallo de red local de la máquina, no del código; si reaparece, anotarlo.


## D1. Agendar, reprogramar y cancelar la clase muestra

**Qué se hizo**
- **Tabla `clase_muestra`** (migración `20261014000000_clase_muestra`): `lead_id`, `prospecto_id`, `grupo_id` (FK compuestas), `fecha_hora` (instante de la **sesión**), `estatus` (`agendada|asistio|no_asistio|reagendada|cancelada`), `agendada_por` (`bot|usuario`) con su usuario o su conversación (CHECK de coherencia), `reprogramada_de_id` (auto-referencia compuesta), `motivo_cancelacion`, `notas` (sin datos de salud; no se audita). Índice único parcial `clase_muestra_vigente_key`: **una vigente por (prospecto, grupo)**. CHECK: la fecha cae en un minuto exacto.
- **Sesiones** (`src/clases-muestra/sesiones.ts`, PURO): el `grupo_horario` (día de la semana + minutos de pared) se convierte a instantes con la **zona de la sucursal**; `esSesionDelGrupo` exige la hora canónica (una hora local inexistente del salto de primavera no es sesión; la que se repite en el retroceso de otoño cuenta una vez); `sesionesEntre`, `problemaDeFecha` (sesión / anticipación inclusiva / horizonte inclusivo), `describirSesion` («lunes 12 de octubre a las 16:00»). Exporté `instanteLocal` y `partesLocales` de `reglas.ts`.
- **Lugares de la sesión** = `cupo_maximo − ocupados(FuenteOcupacion) − clases muestra agendadas de ESA fecha` (`calcularLugaresDeSesion`, `lugaresDeSesion`, `proximasSesionesConLugar`). **Candado:** `bloquearCupoDeGrupo(tx, grupoId)` (`src/catalogo/cupo.ts`) toma la fila del grupo con un `UPDATE` y se cuenta DESPUÉS; sirve dentro de cualquier transacción y es el que F4/F5 deben usar. Reprogramar entre dos grupos los toma en orden de id (sin interbloqueos).
- **Agenda** (`src/clases-muestra/agenda.ts`): `agendarClaseMuestra`, `reprogramarClaseMuestra` (valida y reserva ANTES de escribir; la vieja pasa a `reagendada` con un cambio condicional; si no cabe no se escribe nada), `cancelarClaseMuestra`. Devuelven `{ok:false, motivo}`, no lanzan por reglas de negocio. Al agendar el lead pasa a `muestra_agendada` y queda en la sucursal de la clase; al cancelar su única clase vuelve a `contactado`.
- **Embudo por tipo** (`src/embudo/etapas.ts`): `etapa_pipeline.tipo_sistema` (enum `nuevo, contactado, muestra_agendada, muestra_asistida, negociacion, inscrito, perdido`; única viva por tipo y organización). `moverLeadAEtapa` solo avanza (salvo lead perdido o `permitirRetroceso`), no mueve a un inscrito, deja una interacción `cambio_etapa` y es un no-op si la organización no configuró ese tipo. El backfill de la demo está en `prisma/seed/clase-muestra.sql` (nuevo archivo, corre después de `catalogo-completo.sql` en `docker-compose.yml`).
- **Configuración:** `clase_muestra_anticipacion_min` (120) y `clase_muestra_horizonte_dias` (60), con CHECK. **Interruptor** `vertical.clase_muestra_whatsapp_activo` (encendido en la demo por el seed; solo vale con el cotizador encendido).
- **API** (`docs/API.md`): `GET /api/clases-muestra` (lista, filtros), `GET /sesiones`, `GET /:id`, `POST`, `POST /:id/reprogramar`, `POST /:id/cancelar`. Permisos nuevos `clases_muestra:leer` (administrador, asesor, maestro) y `clases_muestra:escribir` (administrador, asesor). Validador nuevo `instanteISO()` (exige zona). Registro de cambios (`clase_muestra`, sin `notas`).
- **Bot:** paso nuevo `fecha_muestra`. Tras elegir un horario con lugar propone hasta 5 fechas con lugar (se guardan en `conversacion.muestra_ofrecida`), agenda con la elección (efecto `agendar_muestra`, bajo el candado) y confirma; si la fecha se llenó, manda las que quedan; «asesor»/«no» pasan a una persona; tres respuestas inválidas, `sin_entender`. Todo por `MessagingProvider` con `respuestaA`. Con la clase muestra apagada, o sin fechas con lugar, el flujo es el de antes (hay tests).

**Verificación**
```
$ npm run validar     → exit 0 · tests 428 · pass 428 · fail 0   (línea base 409)
$ npm run test:int    → exit 0 · tests 547 · pass 547 · fail 0   (línea base 500)
```
Tests nuevos: `sesiones.test.ts` (8: zona, DST de primavera y otoño en Nueva York, hora inexistente, extremos inclusivos, Tokio y Tijuana), `maquina-muestra.test.ts` (9), `agenda.itest.ts` (20: lugares, anticipación, horizonte, índice único, etapas, reprogramar atómico, reversión, 4 de concurrencia), `api.itest.ts` (12: permisos por rol, alcance por sucursal y por grupo del maestro, validación, registro de cambios, paginación, concurrencia por HTTP), `bot.itest.ts` (10: el loop completo, la fecha que se llena, idempotencia, 4 contactos por la última plaza), `seed.itest.ts` (4) y los de `validar`, `reglas` y `configuracion`. Los tests viejos que cambiaron: `configuracion.itest.ts` (el objeto trae los dos campos nuevos) y `permisos.test.ts` (el maestro tiene `clases_muestra:leer`); ninguno se debilitó.
Mutaciones: quitar el candado (`bloquearCupoDeGrupo` sin `UPDATE`) hace fallar los 2 de concurrencia de `agenda.itest.ts` y el de 4 contactos del bot (3 de 3 corridas).

**Decisiones que tomé (con la alternativa descartada)**
1. **Candado = `UPDATE` de la fila del grupo, no un candado consultivo.** `transaccionConBloqueo` abre su propia transacción y el bot / la API ya están dentro de una (la nota EC-11 lo describe). La fila se toma desde cualquiera y F4/F5 usan la misma. Alternativa descartada: poner la parte del bot fuera de su transacción (rompería la atomicidad del mensaje) o un disparador en la base (no conoce los inscritos, que salen de `FuenteOcupacion`).
2. **El bot NO pasa la conversación a una persona al agendar.** El pase marca `en_atencion_humana` y, por el invariante 6, ningún recordatorio (D3) saldría jamás para lo agendado por el bot. En su lugar: nota interna al asesor + conversación visible (abierta, sin atender; si Chatwoot falla lo reintenta el barrido de espera) y, mientras tanto, un «gracias» no la pasa a una persona (`esAgradecimiento`, lista cerrada); cualquier otra cosa sí. Alternativa descartada: pasar siempre (mata los recordatorios) o un permiso especial del recordatorio sobre el invariante 6 (prohibido).
3. **Si la fecha ya no cabe al agendar desde el bot, se repite el mensaje entero** (`ConflictoVersion`): el contexto nuevo ya no ofrece esa fecha y el bot manda las que quedan. Alternativa: que la máquina pida «agendar» y el efecto devuelva un fallo para escribir otro texto (la máquina es pura y ya decidió la respuesta).
4. **Las fechas propuestas se guardan** (`conversacion.muestra_ofrecida`) y se vuelven a leer con los lugares de hoy: el número que contesta apunta a lo que vio aunque pasen horas. Alternativa descartada: recalcular la lista en cada mensaje (la sesión de las 16:00 desaparece de la lista al acercarse y el «1» apuntaría a otra).
5. **Una vigente por (prospecto, grupo)**, no solo por sesión: leí «mismo grupo/sesión» como la regla más estricta y razonable (una prueba por grupo). Si la escuela quiere dos pruebas en fechas distintas del mismo grupo, se relaja el índice.
6. **El lead cambia a la sucursal de la clase** al agendar (el precedente es C7): de ahí el provider saca el horario de envío. Alternativa descartada: pasar una zona explícita por mensaje (cambiaría la firma de `encolar`). Consecuencia: un lead agendado en otra sucursal sale del alcance del asesor de la anterior.
7. **El maestro no ve teléfono ni contacto de la familia** en la lista (solo alumno, grupo y fecha), y `notas` no entra al registro de cambios (texto libre; la salud va solo en la ficha cifrada).
8. **Sin etapa configurada, el movimiento es un no-op** (no se inventa una etapa ni se busca por nombre). El seed de la demo marca las 7 por id.

**Para Eduardo**
- **[SUPUESTO]** anticipación mínima de 2 h, horizonte de 60 días, máximo 5 fechas propuestas y los textos del bot (genéricos, en `src/captacion/maquina.ts`): revisar el tono.
- Decisión de producto: ¿una prueba por grupo (hoy) o por sesión?; ¿el lead que agenda en otra sucursal debe cambiar de sucursal?
- La respuesta de la familia a «gracias» usa una lista cerrada de agradecimientos; lo demás pasa a una persona.
- No hay `PATCH` de notas ni de la sucursal de una clase; reprogramar a otro grupo sí existe.


## D2. Aviso al maestro (decisión 13)

**Qué se hizo**
- **Tablas** (migración `20261014010000_aviso_maestro`): `aviso_maestro` (instructor, clase, `tipo` agendada/reprogramada/cancelada, `datos` foto del aviso sin datos de salud, `entrega` sin_telefono/pendiente/enviando/enviado/bloqueado/descartado/fallido, `motivo_entrega`, `programado_para`, `enviado_en`, `id_externo`, `leido_en`; **único por (clase, tipo)**), `conversacion_instructor` (la conversación de WhatsApp del instructor: bandeja, id de Chatwoot, ventana de servicio; únicos parciales por (instructor, bandeja) y por (bandeja, conversación de Chatwoot)), `tarea_asesor.clase_muestra_id` y el tipo de tarea `aviso_maestro_no_enviado`.
- **Por WhatsApp, a través de `MessagingProvider`** (`avisarAInstructor`; el código vive en `src/mensajeria/avisos-instructor.ts`): destinatario que no es un lead. Reusa `evaluarReglas` con un estado sintético (`estado: bot`): **baja** del teléfono, **ventana de servicio** (la del instructor: dentro, mensaje libre; fuera, solo la plantilla aprobada `aviso_maestro_<tipo>`; sin plantilla apta se bloquea y se crea tarea: invariante 5), **horario 09:00–20:00** de la sucursal del grupo (recorrer al siguiente horario válido; si llega a la hora de la clase **o después**, se descarta con motivo `evento_pasado`: `recorrerODescartar` ganó un parámetro `limiteExclusivo`), **frecuencia** (`maxAutomaticosPorDia` por teléfono, contando avisos y automáticos a contactos) y `en_atencion_humana` no aplica. Reclamo `pendiente → enviando` bajo el candado del teléfono, `fallido` sin reintento automático, envío incierto jamás se reenvía (tarea), recuperación de los `enviando` huérfanos.
- **Transporte:** `TransporteConversaciones.iniciarConversacion(cuenta, bandeja, contacto)` abre una conversación nueva con quien no escribió primero (falso: id propio; Chatwoot: `POST /contacts` + `POST /conversations` con `CHATWOOT_ADMIN_TOKEN`, reutiliza el contacto si el teléfono ya existe). **No verificado contra un Chatwoot real** (solo contra un servidor HTTP local en `transporte.test.ts`). La apertura corre bajo un candado por instructor: dos avisos a la vez abren UNA conversación.
- **Lo que responde el instructor:** `procesarEntrante` reconoce la conversación de un instructor (o un teléfono de instructor activo que no sea lead de esa vertical) y solo abre su ventana de 24 h: ni lead, ni embudo, ni bot (resultado `instructor`).
- **En la aplicación:** `GET /api/maestro/clases-muestra` (las del día y próximas de SUS grupos: de hace 24 h a 14 días), `GET /api/maestro/avisos?leidos=` y `PATCH /api/maestro/avisos/:id {visto}` (idempotente, registra el cambio solo si cambia). Permisos `avisos_maestro:leer` y `:escribir` (maestro; el administrador por regla, pero solo ve los de su propio instructor).
- **Hooks:** `agendarClaseMuestra`, `reprogramarClaseMuestra` y `cancelarClaseMuestra` crean el aviso en su misma transacción (`crearAvisoMaestro`, `src/clases-muestra/avisos.ts`); `correrCiclo` corre `barrerAvisosMaestro` cada minuto (`resumen.avisosMaestro`).
- **Seed** (`prisma/seed/clase-muestra.sql`, ids 702-704): las tres plantillas `aviso_maestro_*` `[SUPUESTO]`, utility, «aprobadas» solo para la demo.

**Verificación**
```
$ npm run validar     → exit 0 · tests 432 · pass 432 · fail 0   (428 + 4 del transporte)
$ npm run test:int    → exit 0 · tests 575 · pass 575 · fail 0
```
Tests nuevos: `avisos.itest.ts` (19: un aviso por clase y tipo, reprogramar con y sin cambio de instructor, envío con plantilla y variables, conversación reutilizada, horario con recorrer, el borde de la hora de la clase —las 09:00 se descartan y las 09:01 salen—, zona de Tokio, ventana de servicio, sin plantilla → tarea, baja, frecuencia, sin teléfono, `en_atencion_humana` no aplica, fallo e incierto, recuperación, cancelar antes de avisar, 2 de concurrencia, no-fuga), `maestro.itest.ts` (8: lista propia, visto idempotente, 404/400/403, clases del día y próximas, el instructor que responde, el ciclo), 4 en `transporte.test.ts` (servidor HTTP local) y 1 en `seed.itest.ts`.
Mutaciones atrapadas: sin reclamo (10 tests), sin candado de la conversación, límite inclusivo (el borde), sin frecuencia, sin baja, zona fija, incierto tratado como definitivo. La del candado de la conversación sobrevivió hasta que el transporte falso demoró también `iniciarConversacion` (el test no solapaba): corregido y atrapada.

**Decisiones que tomé (con la alternativa descartada)**
1. **El instructor tiene su propia conversación (`conversacion_instructor`) y su propio aviso, y el provider reusa `evaluarReglas`.** Alternativa descartada A: modelarlo como un `lead` (contamina el embudo, las métricas y el bot le contestaría «Hola, gracias por escribir»). B: mandar la plantilla directo con Twilio (rompe el invariante 4). C: generalizar `mensaje` para que `conversacion_id` sea opcional (toca todo el provider y sus 346+ tests de integración por un caso lateral).
2. **Aviso = lista + unidad de envío en una sola tabla.** La lista de la aplicación existe aunque WhatsApp falle o el instructor no tenga teléfono; el estado de entrega es honesto. Alternativa: tabla de avisos y tabla de mensajes (doble fuente de verdad).
3. **Frecuencia y baja aplican a instructores** como pide el encargo. Consecuencia: un maestro con más de 3 clases nuevas en un día recibe 3 por WhatsApp y el resto solo en la lista (queda `tope_frecuencia`). Si Eduardo prefiere otro tope para instructores, es una columna más de configuración.
4. **Un instructor que también es un lead de esa vertical se atiende como lead** (y si el lead se creó después, el teléfono sigue siendo del lead). Es el caso raro; la alternativa (dos personas en un número) no tiene respuesta correcta.
5. **Cancelar antes de que el instructor se entere no manda nada por WhatsApp** (ni el «agendada» ni el «cancelada»), pero la lista conserva ambos.
6. **Un grupo sin instructor, o con uno inactivo, no genera aviso** (no hay a quién). Alternativa: tarea al asesor «asigna un instructor»; no se pidió.
7. **El aviso no lleva el apellido ni datos de la familia, solo el nombre del alumno** que ya pedía el encargo.
8. **Estados de entrega de Chatwoot/Twilio (entregado, leído) no se reflejan en el aviso:** `registrarEstadoEntrega` busca por `mensaje.id_externo` y el aviso no es un `mensaje`; llegan a `evento_entrega_pendiente` y caducan. Queda `enviado` como estado final.

**Para Eduardo**
- **[SUPUESTO]** el texto de las tres plantillas y el tope de frecuencia para instructores. Las plantillas hay que registrarlas y aprobarlas en Twilio/Meta con el mismo `codigo` (`aviso_maestro_agendada`, `…_reprogramada`, `…_cancelada`) y sus variables en el orden del seed.
- **Para producción:** `CHATWOOT_ADMIN_TOKEN` (ya lo pide el directorio de agentes) también sirve para abrir la conversación con el instructor; sin él, el aviso queda en la aplicación y con tarea. Verificar con Chatwoot real el alta de contacto y conversación (no se hizo).
- **Decisión de producto:** ¿un maestro sin teléfono debería bloquear el alta de la clase, o basta la tarea? Hoy basta la tarea.


## D3. Recordatorios de 24 h y 2 h

**Qué se hizo**
- **Evento nuevo** `clase_muestra_proxima` (migración `20261014020000_recordatorios_clase_muestra`; más `clase_muestra.ultimo_recordatorio_en`). Las automatizaciones llevan `offset_minutos` NEGATIVO y configurable (`-1440`, `-120`) y su propia ventana horaria y días (el seed permite también el domingo). El seed (`prisma/seed/clase-muestra.sql`) trae la plantilla `recordatorio_clase_muestra` (utility, `[SUPUESTO]`) y las dos automatizaciones (ids 705, 802, 803).
- **`planearRecordatorios`** (`src/clases-muestra/recordatorios.ts`, PURA): nominal = inicio + offset; si ya pasó al agendar → `descartado`/`ya_paso_el_momento` (sin él no existe); fuera de la ventana horaria → siguiente horario válido de la sucursal; **si ese horario es posterior o IGUAL al inicio de la clase → `descartado`/`evento_pasado`** (`recorrerODescartar` con límite exclusivo). `programarRecordatoriosDeClase` crea las ejecuciones en la transacción de agendar y reprogramar (`createMany` con `skipDuplicates`: idempotente por `(automatizacion_id, entidad_tipo, entidad_id, ocurrencia)`); `cancelarRecordatoriosDeClase` pone las pendientes en `cancelado` al reprogramar o cancelar.
- **Motor:** `ejecutarUna` entiende `entidad_tipo = clase_muestra`: el destinatario es el lead de la clase, por su conversación más reciente; antes de mandar comprueba que la clase siga `agendada` (si no, `omitido`/`clase_no_vigente`) y que no haya empezado (si no, `descartado`/`evento_pasado`); si el servidor se atrasó y ya es de noche recorre o descarta con la misma regla exclusiva; las variables salen de la clase (`nombre_prospecto` del alumno de ESA clase, `nombre_grupo`, `fecha_clase`, `hora_clase`, `nombre_sucursal`); sin conversación de WhatsApp → `omitido`/`sin_conversacion` y una tarea. Todo lo demás (ventana, plantilla, horario, baja, frecuencia 3/día, atención humana) lo decide `MessagingProvider`, como siempre.

**Verificación**
```
$ npm run validar     → exit 0 · tests 445 · pass 445 · fail 0
$ npm run test:int    → exit 0 · tests 592 · pass 592 · fail 0
```
Tests nuevos: `recordatorios.test.ts` (13, puros: el domingo, el borde 09:30 / 09:00, el lunes 09:00, días permitidos, menos de 24 h, el momento exacto, offsets configurables, clase al final del día, ventana propia, **el salto de primavera y el retroceso de otoño en Nueva York**, Tokio y Kiritimati, determinismo) y `recordatorios.itest.ts` (16, con el motor real, reloj inyectado y el transporte falso: el flujo completo del domingo hora por hora, el borde en la base, el lunes, menos de 24 h, reprogramar y cancelar, lo enviado se conserva, idempotencia y 4 pasadas simultáneas, atención humana / baja / frecuencia, recordatorio atrasado, clase ya no vigente, lead sin conversación, hermanos, configuración, **horario de verano en Nueva York y Tokio**, no-fuga) + 1 de seed.
Mutaciones atrapadas: `>=` → `>` en el borde (7 tests), `<` → `<=` en el momento exacto, ignorar los días permitidos, no cancelar las pendientes, ignorar la zona, el límite inclusivo en el motor (atrapada al agregar el caso «lunes 20:30 → martes 09:00»), no revalidar la clase, no descartar la clase pasada.

**Decisiones que tomé (con la alternativa descartada)**
1. **El borde: posterior o IGUAL al inicio se descarta** (lo pidió el encargo). Un detalle del encargo: su ejemplo «domingo 09:30 → el de 2 h se descarta» no sale de esa regla (07:30 se recorre a las 09:00, media hora ANTES de la clase, y por la regla sale). Seguí la regla, no el ejemplo, y dejé las dos pruebas (09:30 sale a las 09:00; 09:00 se descarta). Si Eduardo quiere un mínimo de antelación (p. ej. no mandar un recordatorio de «2 h antes» a 30 minutos de la clase), es una columna más en la automatización (`antelacion_minima_min`); no se pidió.
2. **Las ejecuciones se crean al agendar**, no las descubre un barrido: la hora de salida se conoce entonces y queda a la vista (también las descartadas, con su motivo). Alternativa descartada: un paso `programar` del motor que escanee clases (como el reenganche): lo que cae ya fuera de rango nacería tarde y no habría registro del descarte.
3. **Las que no alcanzan se guardan como `descartado`** en vez de no crear la fila: la unicidad impide que un reintento la «recupere» más tarde y se ve por qué no salió.
4. **El recordatorio es del LEAD por su conversación más reciente.** Un lead con varias conversaciones (raro: una por vertical, y el lead es por vertical) usa la última creada.
5. **Reprogramar no toca lo ya enviado.** Y no hay un «recordatorio de reprogramación»: el aviso al lead de un cambio lo da el asesor o el bot; el recordatorio nuevo sale con la fecha nueva.
6. **Con atención humana el recordatorio NO sale** (invariante 6, sin excepción). Por eso el bot (D1) no pasa la conversación a una persona al agendar; pero en cuanto una persona toma la conversación, los recordatorios dejan de salir. Si Eduardo quiere que un recordatorio salga aunque haya una persona atendiendo, hay que cambiar el invariante, no el código.

**Para Eduardo**
- **[SUPUESTO]** los textos de la plantilla y los tiempos (24 h y 2 h). Registrar `recordatorio_clase_muestra` en Twilio con las 5 variables en ese orden.
- Un lead cuya ventana de 24 h sigue abierta recibe la plantilla igual (el motor siempre manda plantilla); no hay texto libre para recordatorios.
- Pendiente de producto: el aviso a la familia cuando una persona reprograma o cancela su clase (hoy no sale nada por WhatsApp; solo el aviso al maestro).


## D4. Asistió / no asistió y recuperación de quien no llegó

**Qué se hizo**
- **Migración `20261014030000_asistencia_clase_muestra`:** `clase_muestra.asistencia_marcada_en` y `asistencia_marcada_por_usuario_id` (FK compuesta; CHECK de que van juntos), `configuracion_organizacion.clase_muestra_correccion_horas` (48; CHECK 1–720), `automatizacion.espaciado_minutos` (≥ 60), evento `clase_muestra_no_asistio` y tipo de tarea `llamar_no_asistio`.
- **`marcarAsistencia`** (`src/clases-muestra/asistencia.ts`): `agendada → asistio | no_asistio` **desde la hora de la clase** (justo a la hora ya; antes, `aun_no_empieza`), corrección `asistio ↔ no_asistio` dentro de la ventana de la configuración contada desde que se marcó, lo mismo otra vez es **idempotente** (sin cambio, sin registro), `cancelada` y `reagendada` no se marcan. El cambio es **condicional al estatus leído**: dos marcas distintas simultáneas → gana una y la otra recibe `cambio_concurrente` (409); dos iguales → una cambia y la otra ve el resultado. Cada marca deja una interacción `nota` en el lead.
- **Asistió:** el lead pasa a `muestra_asistida` (solo avanza; un lead en negociación no retrocede), se cancela la recuperación pendiente y se descarta la tarea de llamar. **No asistió:** se programa la recuperación y se deja **una** tarea `llamar_no_asistio` (vence a las 24 h, con el nombre del alumno, la fecha y el grupo). Corregir un «asistió» a «no asistió» devuelve al lead a `muestra_agendada`.
- **Recuperación** (`src/clases-muestra/recuperacion.ts`): `planearRecuperacion` PURA; el evento es el momento de MARCAR: el primer intento sale `offset_minutos` después (+120), los siguientes cada `espaciado_minutos` (+2880; si es nulo, el mismo offset), hasta `max_intentos` (1–2), recorridos al siguiente horario válido de la sucursal y **nunca descartados por eso** (no hay clase a la que llegar tarde). Las ejecuciones de todos los intentos se crean al marcar (idempotentes por la llave de siempre). El motor revisa al ejecutar: la clase sigue `no_asistio` (`clase_no_vigente`), la familia no volvió a agendar (`ya_reagendo`) y, del segundo en adelante, el anterior salió (`intento_anterior_no_salio`) y no ha contestado desde entonces (`contacto_respondio`). Todo lo demás lo decide `MessagingProvider` (baja, frecuencia, atención humana, plantilla, horario).
- **Volver a agendar** (D1) a quien no llegó cancela lo pendiente (`volvio_a_agendar`) y descarta la tarea (`darPorRecuperadoAlProspecto`, llamado desde `agendarClaseMuestra`).
- **API:** `PATCH /api/clases-muestra/:id/asistencia {estatus}`, permiso nuevo `clases_muestra:asistencia` (administrador, asesor y maestro; el maestro solo de SUS grupos, el asesor de su sucursal; lo ajeno, 404; recepción, 403). Registro de cambios (`estatus`, `asistencia_marcada_en`). `asistencia_marcada_en` también sale en las listas.
- **Migraciones y seed sobre una copia de la base de la demo con datos** (`pg_dump` de `inscripciones` a una base aparte, luego borrada): `prisma migrate deploy` aplica las 4 migraciones, el seed corre dos veces sin error y `migrate diff` da «No difference detected». Ahí apareció que en una base creada antes de `demo.sql` la primera etapa («Nuevo») la crea la migración de Fase 1 con otro id, así que el seed la marca `nuevo` por su lugar (la primera abierta de la organización) y no por el id 601.
- **Seed** (`prisma/seed/clase-muestra.sql`, ids 706 y 804): plantilla `recuperacion_no_asistio` `[SUPUESTO]` y la automatización (+120 min, cada 48 h, 2 intentos, también el domingo).

**Verificación**
```
$ npm run validar     → exit 0 · tests 449 · pass 449 · fail 0
$ npm run test:int    → exit 0 · tests 622 · pass 622 · fail 0
```
Tests nuevos: `recuperacion.test.ts` (4, puros: offsets, espaciado, tope, horario de noche, domingo, Nueva York), `asistencia.itest.ts` (22: la hora exacta, idempotencia, etapa que solo avanza, recuperación y tarea, las dos correcciones, la ventana, volver a agendar, el flujo con el motor —primer y segundo intento, tope, horario, contesta, el anterior no salió, baja / frecuencia / atención humana, revalidación, sin conversación, atraso del servidor, Nueva York—, 3 de concurrencia, no-fuga), `asistencia-api.itest.ts` (6: permisos y alcance, hora, estados, validación, corrección, 6 PATCH simultáneos) y los de seed y `fuga.itest.ts` (**un flujo nuevo que recorre D1 a D4 con fichas de salud centinela y exige que no aparezcan en logs, notas, mensajes ni en ninguna tabla**).
Mutaciones atrapadas: `<` → `<=` y sin la regla de «no antes de la hora», ventana `>=` y sin ventana, sin el cambio condicional (2 tests), asistió que no cancela la recuperación ni cierra la tarea, corregir que no regresa la etapa, idempotencia rota, motor sin `contacto_respondio`, sin `intento_anterior_no_salio`, sin `ya_reagendo`, y la recuperación con límite de clase (atrapada al agregar «el servidor estuvo caído y el intento se atrasó hasta la noche»). **Sobrevive (equivalente):** quitar la revisión «ya hay una tarea pendiente» en `tareaDeLlamar`, porque la tarea solo se crea en la transición condicional de estatus y no hay otro camino que la repita; queda como defensa.

**Decisiones que tomé (con la alternativa descartada)**
1. **El evento de la recuperación es el momento de marcar**, no la hora de la clase: el maestro puede marcar horas o un día después, y «2 h después de la clase» ya habría pasado. Alternativa descartada: `inicio + offset` (mismo problema que los recordatorios, pero hacia adelante).
2. **Todos los intentos se programan al marcar y se revalidan al ejecutar.** Alternativa descartada: crear el segundo cuando sale el primero, como el reenganche: no deja ver desde el principio qué va a pasar ni cancelar en bloque.
3. **El segundo intento exige que el primero haya salido** y que la familia no haya contestado. Si el primero lo frenó la frecuencia o falló, el segundo no insiste. Alternativa descartada: intentarlo igual (insistir a quien pidió la baja no pasa porque el provider lo bloquea, pero insistir tras un fallo del proveedor es ruido).
4. **Corregir un «asistió» a «no asistió» regresa la etapa del lead a `muestra_agendada`** (solo si estaba en `muestra_asistida`); corregir al revés solo avanza. No hay un `muestra_no_asistida`: el plan de etapas es el del sistema (D7 lo ampliará con historial).
5. **La tarea «llamar» se descarta (no se resuelve) cuando ya no hace falta** (asistió, o volvió a agendar): no cuenta como trabajo hecho.
6. **El maestro marca asistencia de las clases de SUS grupos sin ver el teléfono de la familia**; el asesor ve el teléfono para llamar.
7. **Responder a la recuperación → asesor.** Una respuesta de la familia llega a una conversación en `completo` / `bot` que el bot pasa a una persona (existente), y la persona reagenda con `POST /api/clases-muestra`. No se hizo un reagendado conversacional por el bot (habría que preguntar cuál de los dos grupos y fechas, y no se pidió). La parte del encargo «el bot reagenda» queda **pendiente** y documentada aquí.

**Para Eduardo**
- **[SUPUESTO]** el texto de la plantilla, +120 min, 48 h entre intentos y el tope de 2.
- Decisión de producto abierta: ¿el bot debe reagendar solo a quien responde a la recuperación? Hoy lo hace el asesor.
- Decisión de producto: ¿cuántas horas se admite corregir la asistencia (hoy 48)?

## Cierre de la etapa D (D1 a D4) — para quien siga (D5 a D8)

**Estado.** D1 a D4 HECHOS (commits `e2bfc20`, `576f00e`, `7df6d8d`, `de73e25`). D5 a D8 no se tocaron. Etapa D sin auditar ni etiquetar (lo hace quien coordina).

**Verificación del último commit de código (`de73e25`; árbol limpio)**
```
$ npm run validar                      → exit 0 · tests 449 · pass 449 · fail 0   (línea base de la etapa: 409; tres corridas seguidas)
$ npm run test:int                     → exit 0 · tests 622 · pass 622 · fail 0   (línea base: 500; 1.ª, 2.ª y 3.ª corrida seguidas)
$ DATABASE_URL_PRUEBAS=…/vacia_d_pruebas npm run test:int → exit 0 · tests 622 · pass 622 · fail 0   (base NUEVA y vacía; luego se borró)
```
Las migraciones también se aplicaron sobre una copia con datos de la base de la demo (`pg_dump`, luego borrada): sin diferencias con el schema. Una vez, en una corrida de `validar`, `src/barrido.test.ts` («un barrido que lanza no mata el intervalo») falló por tiempos con la máquina ocupada; no se tocó ese archivo ni `barrido.ts` y pasó en las tres corridas siguientes. Es una intermitencia previa (el test depende de temporizadores de decenas de milisegundos); conviene vigilarla.

**Qué hay para enchufar lo que sigue**
- **Embudo por tipo (D7).** `etapa_pipeline.tipo_sistema` (enum `nuevo, contactado, muestra_agendada, muestra_asistida, negociacion, inscrito, perdido`; a lo más una viva por tipo y organización). `src/embudo/etapas.ts`: `etapaDeSistema(tx, tipo)`, `moverLeadAEtapa(tx, leadId, tipo, {motivo, permitirRetroceso?})` (solo avanza, salvo lead perdido; no mueve a un ganado; deja una `interaccion` `cambio_etapa` con `desde_etapa_id`, `hacia_etapa_id`, `tipo_sistema` y `motivo`) y `tipoDeEtapaDelLead`. D7 puede reemplazar esa interacción por su historial sin cambiar quién llama. El código nunca busca etapas por nombre. Backfill de la demo: `prisma/seed/clase-muestra.sql` (ids 601 a 607).
- **Candado del cupo (F4/F5).** `bloquearCupoDeGrupo(tx, grupoId)` (`src/catalogo/cupo.ts`): toma la fila del grupo con un `UPDATE`; cuenta DESPUÉS. La inscripción y el cambio de grupo deben tomarlo (es el mismo que usa la clase muestra). La ocupación sigue entrando por `FuenteOcupacion` (en `server.ts`, `SinInscripciones`); `lugaresDeSesion` ya resta las inscripciones que esa fuente devuelva.
- **Sesiones y zona horaria (cualquiera).** `src/clases-muestra/sesiones.ts` (puro): `esSesionDelGrupo`, `sesionesEntre`, `sesionesAgendables`, `describirSesion`, `instanteDeSesion`. `src/mensajeria/reglas.ts` exporta ahora `instanteLocal` y `partesLocales` y `recorrerODescartar(..., limiteExclusivo)`.
- **Automatizaciones sobre una entidad que no es una conversación.** El motor entiende `entidad_tipo = clase_muestra` (destinatario: el lead por su conversación más reciente) y los eventos `clase_muestra_proxima` (offset negativo) y `clase_muestra_no_asistio` (offset positivo, `espaciado_minutos`). **Para D8 (lead frío, promoción por vencer):** el patrón es el mismo: eventos nuevos en `evento_disparador`, ejecuciones creadas por quien conoce el momento (idempotentes por la llave de siempre), validación al ejecutar dentro de `ejecutarUna` (bloque `evento === …`), variables nuevas en `resolverVariables`. `omitir` con motivo, `descartado`/`evento_pasado` solo si hay un evento al cual llegar tarde.
- **Destinatarios que no son leads (D5: registro del maestro).** `MessagingProvider.avisarAInstructor` y `conversacion_instructor` (src/mensajeria/avisos-instructor.ts). `TransporteConversaciones.iniciarConversacion` es nuevo: cualquier transporte propio debe implementarlo (los falsos de los tests de F1-12 ya lo hacen).
- **Datos de salud (D5).** Nada de D1 a D4 los toca; `fuga.itest.ts` ya tiene un flujo con centinelas que recorre la clase muestra: **agrega ahí el registro del maestro** y usa `leerSensible`/`guardarSensible` como siempre. Las `notas` de la clase muestra son texto libre y NO se auditan ni deben llevar salud.
- **Permisos nuevos:** `clases_muestra:leer` (administrador, asesor, maestro), `clases_muestra:escribir` (administrador, asesor), `clases_muestra:asistencia` (administrador, asesor, maestro), `avisos_maestro:leer` y `:escribir` (administrador, maestro; el administrador solo ve los de su propio instructor). Cada ruta nueva va en `LAS_RUTAS` de `src/api/rutas.test.ts` y cada permiso en `permisos-acordados.ts`.
- **Tablas nuevas:** `clase_muestra`, `aviso_maestro`, `conversacion_instructor`; columnas: `etapa_pipeline.tipo_sistema`, `vertical.clase_muestra_whatsapp_activo`, `conversacion.muestra_ofrecida`, `tarea_asesor.clase_muestra_id`, `automatizacion.espaciado_minutos`, `configuracion_organizacion.clase_muestra_{anticipacion_min,horizonte_dias,correccion_horas}`. Enums: `paso_captacion.fecha_muestra`, `evento_disparador.{clase_muestra_proxima,clase_muestra_no_asistio}`, `tipo_tarea_asesor.{aviso_maestro_no_enviado,llamar_no_asistio}`. Migraciones: `20261014000000_clase_muestra`, `…010000_aviso_maestro`, `…020000_recordatorios_clase_muestra`, `…030000_asistencia_clase_muestra`. **La siguiente debe usar `20261015…` o mayor.**
- **Helpers de prueba nuevos (`src/testutil/`):** `sembrarEmbudo`, `sembrarFamilia`, `OcupacionFija` (ya existía), `escenarioBot({claseMuestra, embudo})`.
- **Ids de seed (`prisma/seed/clase-muestra.sql`, corre después de `catalogo-completo.sql`):** plantillas 702 a 706 (`aviso_maestro_agendada|reprogramada|cancelada`, `recordatorio_clase_muestra`, `recuperacion_no_asistio`), automatizaciones 802 (24 h), 803 (2 h) y 804 (recuperación). Usa 9xx / 7xx / 8xx siguientes para lo que venga.
- **Config sin API todavía (J8):** `clase_muestra_anticipacion_min`, `clase_muestra_horizonte_dias`, `clase_muestra_correccion_horas`, `vertical.clase_muestra_whatsapp_activo`, y las automatizaciones (offsets, espaciado, tope).

**Decisiones de producto abiertas de D1 a D4** (todas con un valor razonable ya implementado)
1. Una clase muestra por grupo (hoy) o por sesión; si el lead que agenda en otra sucursal debe cambiar de sucursal (hoy sí).
2. Tope de frecuencia propio para avisos a instructores (hoy el general de 3/día) y qué pasa con un maestro sin teléfono (hoy: la lista y una tarea).
3. Un mínimo de antelación para los recordatorios recorridos (hoy cualquiera antes de la clase sale, aunque sea 30 minutos antes) — el ejemplo «domingo 09:30» del encargo no se descarta con la regla pedida (ver D3).
4. Que el bot reagende solo a quien responde a la recuperación (hoy lo hace el asesor).
5. Avisar a la familia cuando una persona reprograma o cancela su clase (hoy no sale nada por WhatsApp).
6. Textos de todas las plantillas y del bot, tiempos y topes: `[SUPUESTO]`.
7. `CHATWOOT_ADMIN_TOKEN` en producción para abrir la conversación del instructor (sin él, solo la lista y una tarea); verificar el alta de contacto y conversación contra Chatwoot real.


## D5. Registro del maestro (sección 8 del contexto)

**Qué se hizo**
- **Migración `20261015000000_registro_clase_muestra`:** `registro_clase_muestra` (1:1 con la clase, índice único parcial; estatus `borrador|completo|cerrado`; alumno, antecedentes y observación como columnas; dos banderas de presencia de la salud) y `registro_tutor` (una fila por adulto con teléfono normalizado y banderas `es_responsable_pago`, `lo_lleva`, `puede_recoger`; índices únicos parciales: un responsable de pago, uno que lo lleva y un teléfono por registro). Enums `estatus_registro_muestra`, `sexo_persona`, `turno_escolar`, `motivo_clase_muestra` (`disciplina|condicion_fisica|socializacion|competencia|otro`), `interes_percibido`. CHECK de coherencia (estatus ↔ sellos, quien no practicó no tiene dónde ni nivel, detalle del motivo solo con motivo, salud completa ⇒ contacto). La acción `validar` se agrega al CHECK de `acceso_dato_sensible`.
- **Servicio** `src/clases-muestra/registro.ts` (+ reglas puras en `registro-reglas.ts`): `guardarRegistro` (valida TODO antes de escribir; candado por clase; tutores por reemplazo del conjunto con `id` para conservar filas), `completarRegistro`, `cerrarRegistro` (con un punto de enganche `agregarRequisitoDeCierre` para D6), `reabrirRegistro`, `leerRegistro`, `trasladarRegistroDeClase` (reprogramar lleva el registro a la clase nueva) y **`registroDeProspectoParaConversion`** (lo que F2 lee para crear tutor, alumno y `tutor_alumno` sin preguntar nada).
- **Salud** `src/sensibles/registro-salud.ts`: la sección `salud` del PATCH es un objeto opaco para la ruta (la guarda `check:sensibles` impide nombrar esos campos fuera de `src/sensibles/`); `leerEntradaDeSalud` la valida (esquema cerrado, teléfono con `normalizarTelefono()`), `guardarSaludDelRegistro` la guarda con `guardarSensible()` (cifrada, permiso `salud:escribir`, regla del maestro, constancia). `estadoDeSalud` dice qué falta SIN descifrar. **El contacto de emergencia debe ser otra persona que los tutores** (mismo teléfono normalizado o mismo nombre sin acentos): al capturarlo (en memoria, antes de escribir), al cambiar los adultos y al completar (`contactoDeEmergenciaCoincide`: compara dentro del módulo, no devuelve valores y deja la acción `validar` en el registro de accesos).
- **`maestroDelSujeto` real para prospectos** (en `ficha.ts`): el maestro accede a la ficha de un prospecto con clase muestra agendada, asistida o no asistida en un grupo cuyo instructor es él; cancelada o reagendada ya no. Alumnos siguen fallando cerrado hasta F1.
- **API** (`src/api/rutas/registro-muestra.ts`): `GET|PATCH /api/clases-muestra/:id/registro`, `POST …/completar|cerrar|reabrir`. Permisos nuevos `registro_muestra:leer|escribir` (administrador, asesor, maestro) y `registro_muestra:reabrir` (administrador). Alcance: el maestro por sus grupos, el asesor por sucursal (`alcanceDeClases`). Documentado en `docs/API.md`.
- **Registro de cambios sin datos identificables:** `registro_clase_muestra` audita solo `estatus`, `motivo_clase`, `practico_antes`, `interes_percibido`, `grupo_recomendado_id`, `salud_completa` y `secciones` (qué partes se tocaron). Un test comprueba que no aparecen nombres, fechas de nacimiento, teléfonos, correos ni escuela.

**Verificación**
```
$ npm run validar     → exit 0 · tests 458 · pass 458 · fail 0
$ npm run test:int    → exit 0 · tests 635 · pass 635 · fail 0
```
Tests nuevos: `registro-reglas.test.ts` (4) y `registro-salud.test.ts` (4) puros; `registro.itest.ts` (12): cada campo, las validaciones (fecha de nacimiento razonable con sus bordes, sexo, correo, teléfonos, duplicados, dos responsables, `id` de otro registro, antecedentes incoherentes, notas con salud, grupo de otra vertical, campos desconocidos), borrador → completo → cerrado, asistió o no con la regla de D4 (el rechazo revierte la petición entera), permisos por rol (recepción 403; el asesor captura todo menos la salud, y su intento de salud deja constancia sin guardar lo demás), IDOR (adulto de otro registro, clase de otra organización, otro maestro, otra sucursal), la salud solo cifrada, el contacto de emergencia distinto en los tres momentos, concurrencia (6 capturas simultáneas de secciones distintas: un registro, ninguna se pierde), reprogramar, la conversión sin recaptura y las restricciones de la tabla. `fuga.itest.ts`: un flujo nuevo (D5) con centinelas que ejecuta capturas, rechazos de validación con el valor dentro, completar, cerrar y reabrir y exige que no aparezcan en logs, en NINGUNA respuesta ni error de la API (salvo la lectura autorizada por la ruta de salud), ni en ninguna tabla.
Mutación atrapada: quitar el candado de la captura → el test de concurrencia falla (índice único del registro).

**Decisiones que tomé (con la alternativa descartada)**
1. **La salud del registro vive en `ficha_salud` del PROSPECTO, no en el registro.** El registro lleva solo dos banderas de presencia. Alternativa descartada: columnas cifradas en el registro (duplica la ficha y obliga a migrar al convertir). F2 mueve la ficha del prospecto al alumno.
2. **El asesor captura el registro pero NO la salud** (según el marco de B4: `salud:escribir` es del administrador y el maestro). Un asesor que manda la sección recibe 403 y no se guarda nada de esa petición; el registro de un asesor no llega a `completo` hasta que el maestro o el administrador capturan la salud. Alternativa descartada: dejar que el asesor escriba salud; contradice la decisión 12.
3. **Los valores de salud no se devuelven en el registro**: solo banderas y qué falta; para verlos, `GET /api/salud/prospecto/:id` (permiso, motivo y constancia). Alternativa descartada: incluirlos en el GET del registro (dos puertas de lectura para lo mismo).
4. **«Asistió o no» no se duplica**: es `clase_muestra.estatus`; `observacion.asistio` llama a las reglas de D4 en la misma transacción. Alternativa descartada: una columna `asistio` en el registro (dos fuentes que se contradicen).
5. **Completo = lo necesario para convertir** (alumno, un adulto con responsable de pago, antecedentes y la ficha de salud entera, aunque la respuesta sea «ninguna»); la observación del maestro no se exige para completar (se captura después de la clase) pero **cerrar** pide el interés percibido si la clase se dio. Completar es una acción explícita, nunca automática.
6. **Un teléfono por adulto, un responsable de pago y uno que lo lleva por registro.** Alternativa descartada: permitir dos adultos con el mismo teléfono: F1 define «un tutor por teléfono normalizado».
7. **Tutores = lista completa por reemplazo** (con `id` se conserva la fila). Alternativa descartada: endpoints por adulto (más rutas y más estados intermedios para una pantalla de celular).
8. **Las notas libres se rechazan si mencionan salud** (lista corta de raíces en `src/sensibles/`). No es una garantía, es un freno; la fuga real la cubren la sección de salud y el test de fuga.
9. **El registro de cambios no guarda nombres ni fechas de nacimiento** (es de solo anexar y nunca se purga): solo qué secciones se tocaron. Si Eduardo quiere ver el antes y el después de un dato, habría que decidir una política de retención.
10. **Reprogramar lleva el registro** (borrador o completo) a la clase nueva; uno cerrado se queda. Se tocó `agenda.ts` con una sola línea.

**Para Eduardo**
- Revisar la decisión 2 (el asesor no captura salud): en la práctica, ¿quién la captura el día de la clase cuando el maestro no está? Hoy: el maestro del grupo o el administrador.
- **[SUPUESTO]** edad válida 1–99 años; catálogo de motivos tal como lo pidió el encargo; qué cuenta como «completo».
- F2 debe llamar a `registroDeProspectoParaConversion` y mover la ficha de salud del prospecto al alumno con el módulo de datos sensibles.


## D6. Reglamento y autorización de imagen con evidencia de aceptación

**Qué se hizo**
- **Migración `20261015010000_documentos_legales`:** `documento_legal` (tipo `reglamento|uso_imagen|aviso_privacidad`, versión, título, texto, huella SHA-256, `vigente_desde`, vertical opcional; único por (organización, tipo, vertical-o-general, versión)) y `aceptacion_legal` (documento y versión aceptada, resultado `aceptada|rechazada|revocada`, lead, prospecto, registro y adulto del registro opcionales, quién aceptó —nombre y parentesco—, canal, quién lo capturó, `aceptado_en`, huella de lo mostrado, evidencia opcional, IP y agente, `secuencia`). **Las dos de SOLO ANEXAR por disparadores** (UPDATE, DELETE y TRUNCATE, también en cascada), igual que `registro_cambio`.
- **`src/legal/documentos.ts`:** `documentoVigente` (la versión más alta con `vigente_desde` ya llegado; el documento de la vertical manda sobre el general), `crearVersionDeDocumento` (numera bajo un candado por (tipo, vertical); la nueva no puede regir antes que la anterior). **`src/legal/aceptaciones.ts`:** `registrarAceptacion` (solo la versión vigente y la que dice haber visto quien acepta; idempotente; candado por (prospecto, tipo); revocar solo la imagen y solo lo aceptado), `estadoLegal` (con la frase «Aceptó el reglamento v3 el … (nombre, parentesco)») y `problemasDeReglamento`.
- **API** (`src/api/rutas/legal.ts`): `GET /api/documentos-legales/vigentes`, `GET /api/documentos-legales[/:id]`, `POST /api/documentos-legales`, `GET|POST /api/clases-muestra/:id/registro/aceptaciones`. Sin permisos nuevos: lectura `registro_muestra:leer`/`catalogo:leer`, escritura `registro_muestra:escribir` y publicar `catalogo:escribir`.
- **Cierre del registro (D5) exige el reglamento aceptado** (409 con `detalles`: sin aceptar, rechazado, o sin reglamento configurado).
- **Seed** `prisma/seed/seguimiento.sql` (nuevo; lo seguirán D7, D8, E1 y E2): los tres documentos v1 de ejemplo `[SUPUESTO]` con su huella calculada en SQL; ya en el `docker-compose` y en `docs/DEMO-LOCAL.md`.

**Verificación**
```
$ npm run validar     → exit 0 · tests 458 · pass 458 · fail 0
$ npm run test:int    → exit 0 · tests 646 · pass 646 · fail 0
```
Tests nuevos (`src/legal/legal.itest.ts`, 10, cada uno con su organización limpia porque publicar versiones cambia lo vigente; y `seed.itest.ts`, 1): lo vigente y la versión nueva que no toca a la anterior (y la fecha futura que no rige todavía ni puede ser anterior); un documento por vertical sobre el general, publicar solo el administrador, otra organización invisible; **tres publicaciones simultáneas obtienen versiones distintas y consecutivas**; **UPDATE, DELETE y TRUNCATE rechazados por la base** y la huella que el cliente no puede mandar; quién, cuándo, canal, capturista, huella e IP/agente solo por la web; versión vieja, futura o que no coincide con lo mostrado: 409 y no se escribe nada; **seis aceptaciones simultáneas iguales dejan UNA fila**; revocación como fila nueva con la original intacta (solo imagen, solo si estaba aceptada, idempotente, se puede volver a autorizar); sin reglamento aceptado / rechazado / sin reglamento configurado el registro no se cierra; permisos, IDOR (documento de otra organización, adulto de otro registro) y validación de la evidencia.
Mutaciones atrapadas: sin el candado de (prospecto, tipo) → duplicados; sin la comprobación de la versión vigente → el test de versiones falla.

**Decisiones que tomé (con la alternativa descartada)**
1. **Los documentos son inmutables en la base** (no solo por convención): cambiar un texto es la versión siguiente. Alternativa descartada: un `UPDATE` con historial aparte (la prueba de qué se aceptó dependería de que nadie toque la tabla). Consecuencia: no hay baja lógica de un documento (`eliminado_en` existe por convención pero el disparador impide moverlo); una versión mal publicada se reemplaza con la siguiente.
2. **La huella la calcula el servidor**, no el cliente: la aceptación copia el `texto_hash` del documento. El cliente solo dice qué versión vio; si no es la vigente, no se registra.
3. **El estado es la fila más reciente por (prospecto, tipo)**, ordenada por `secuencia` (el reloj puede repetirse). Alternativa descartada: una fila de estado que se actualiza (se perdería la historia que es justo la evidencia).
4. **La aceptación cuelga del prospecto** (y del registro si ya existe): el registro puede moverse al reprogramar, la aceptación no. El aviso de privacidad de la landing (E1) usará la misma tabla.
5. **Revocar solo la autorización de imagen** y solo si lo último fue «aceptada». Alternativa descartada: permitir revocar el reglamento (aceptar un reglamento no es un permiso retirable; si la familia no está de acuerdo, se baja).
6. **Cerrar acepta cualquier versión del reglamento aceptada en su momento**, no exige la vigente al cerrar; la inscripción (F3) sí deberá pedir la vigente. Alternativa descartada: exigir la vigente al cerrar (obligaría a re-aceptar registros viejos por un cambio de texto).
7. **Sin reglamento configurado el registro no se cierra** (hay que publicar uno): la alternativa de dejar pasar hacía que una escuela sin reglamento cerrara sin ninguna evidencia.
8. **IP y agente solo con el canal `web`**: son datos personales y solo aportan cuando la aceptación llegó por un navegador.

**Para Eduardo**
- **[SUPUESTO]** los tres textos del seed (reglamento, uso de imagen, aviso de privacidad): la escuela pone los suyos y el aviso debe revisarlo su abogado. Se publican como versión 2 desde administración (no se editan).
- Decisión de producto: ¿la autorización de imagen es obligatoria para cerrar el registro o puede quedar «rechazada»? Hoy solo el reglamento es obligatorio.
- Pendiente de producto: firma manuscrita/foto como evidencia (hoy solo texto corto en `evidencia`); no se pidió ni se construyó almacenamiento de archivos.


## D7. Embudo: cambios de etapa con historial, motivos de pérdida, perdido y recuperado

**Qué se hizo**
- **Migración `20261015020000_embudo_historial`:** `lead_etapa_historial` (de SOLO ANEXAR por disparadores; `secuencia` para el orden de registro), `motivo_perdida` (catálogo por organización, código único entre los vivos), `transicion_etapa` (matriz configurable por par) y en `lead`: `motivo_perdida_id` y `recuperaciones`. Los leads que ya existían entran al historial con una fila de alta (`alta_previa_al_historial`). **Probada sobre una base con datos** (dos leads vivos y uno borrado): el relleno solo toma los vivos, y `migrate diff` contra el schema da «No difference detected».
- **Reglas puras** (`src/embudo/transiciones.ts`): `evaluarTransicion` (avance, retroceso, lateral, perdida, recuperación; las reglas fijas y la matriz), `tramosEnEtapa` / `tiempoPorEtapa` y `estaEstancado` / `diasSinMovimiento`. **Servicio** (`src/embudo/historial.ts`): `moverEtapaDeLead` (candado por lead + cambio condicional a la etapa leída + `desde_etapa_id`), `historialDeLead` (cambios con el tiempo que estuvo en cada etapa), `registrarAltaDeLead` (lo llama el bot al crear el lead). `src/embudo/estancados.ts`: la consulta de leads estancados con el índice `lead(etapa_id, ultima_interaccion_en)`.
- **`moverLeadAEtapa` (D1/D4) escribe el historial** con origen `sistema` y el reloj de quien llama; un perdido que agenda una clase se **recupera** (suma, limpia el motivo, deja la nota).
- **API** (`src/api/rutas/embudo.ts`, montada ANTES de leads por `/leads/estancados`): `PATCH /api/leads/:id/etapa`, `GET /api/leads/:id/historial`, `GET /api/leads/estancados`, `GET|POST|PATCH|DELETE /api/motivos-perdida`. Sin permisos nuevos (`leads:leer|escribir`, `catalogo:leer|escribir`). `GET /api/leads` y `/:id` ahora traen `motivo_perdida_id` y `recuperaciones`.
- **Seed** (`prisma/seed/seguimiento.sql`): los seis motivos del encargo `[SUPUESTO]` (precio, horario, distancia, no contestó, eligió otra escuela, otro). Los umbrales por etapa ya los traía `demo.sql` (2, 3, 3, 3 y 5 días).

**Verificación**
```
$ npm run validar     → exit 0 · tests 466 · pass 466 · fail 0
$ npm run test:int    → exit 0 · tests 659 · pass 659 · fail 0
```
Tests nuevos: `transiciones.test.ts` (8, puros: la matriz de reglas completa, los tramos con empates y relojes que retroceden, el umbral exacto del lead estancado) y `embudo.itest.ts` (12): mover con historial, interacción y registro de cambios; permisos, alcance y entradas; perdido exige motivo (activo, de la organización); recuperar (nota, contador, limpia el motivo, dos vueltas); inscrito; la matriz configurable; transiciones del sistema (agendar, asistir, recuperar por agendar); el alta por el bot; historial y tiempo en cada etapa con reloj inyectado + solo-anexar (UPDATE, DELETE, TRUNCATE, restricciones); **leads estancados** (umbral exacto, sin interacción, etapas de cierre, sin umbral, alcance, paginación, que no escribe nada y que el índice existe); **concurrencia** (con `desde_etapa_id` gana uno y el otro 409; seis sin él se serializan en cadena); motivos de pérdida (CRUD, permisos, aislamiento entre organizaciones). Más 2 de seed.
Mutación atrapada: quitar el candado por lead → la prueba de la cadena falla (aparecen 409 en el intercalado).

**Decisiones que tomé (con la alternativa descartada)**
1. **El historial es de solo anexar y trae `secuencia`.** La fecha no basta (se repite con un reloj inyectado y entre dos cambios del mismo milisegundo); el primer intento de test lo mostró. Alternativa descartada: ordenar por `creado_en, id` (un uuid aleatorio rompe el desempate).
2. **Etapa «de cierre» por bandera o por `tipo_sistema`**: una escuela puede haber puesto `es_ganado` sin `tipo_sistema` (o al revés); el código acepta cualquiera de los dos y nunca busca por nombre.
3. **A inscrito no se llega moviendo etapas, ni el administrador**: la inscripción es la conversión (F2), que mueve al lead con su propia transacción. Hasta F2 nadie puede marcar un inscrito a mano por la API. Alternativa descartada: dejar que el administrador lo haga (se brinca la transacción de conversión y los cargos).
4. **De inscrito solo el administrador vuelve atrás y nunca a perdido** (una baja es de la inscripción, F5). La matriz (`transicion_etapa`) endurece pares pero NO levanta las reglas fijas.
5. **Mover es movimiento** (reinicia `ultima_interaccion_en`): un asesor que trabaja el lead lo saca de la alerta de estancado. Las transiciones del sistema no lo tocan: el bot ya actualiza `ultima_interaccion_en` con cada mensaje del contacto.
6. **La alerta de estancado es una consulta**, sin envíos ni tareas (D8 decide qué hacer). Días COMPLETOS: cumplir el umbral ya cuenta.
7. **`desde_etapa_id` opcional** para el control optimista. Sin él, dos movimientos simultáneos no se rechazan: se ordenan (el último gana, y el historial lo muestra en cadena). Alternativa descartada: exigirlo siempre (rompería a quien llama sin haber leído al lead).
8. **Dar de baja un motivo de pérdida es lógico** y no toca los leads ya perdidos por él; no se puede elegir uno dado de baja o inactivo.
9. **La matriz se edita por base/seed**; no hay API de administración de la matriz todavía (J7/J8). `transicion_etapa` existe, se respeta y está probada.

**Para Eduardo**
- **[SUPUESTO]** los seis motivos de pérdida, y los días por etapa de `demo.sql`.
- Decisión de producto: ¿quién puede recuperar un lead? Hoy asesor y administrador (cualquiera con `leads:escribir`), con nota obligatoria.
- Decisión de producto abierta: reglas por defecto de la matriz (hoy solo las fijas) y si hace falta una pantalla para editarla.


## D8. Lead frío y promoción por vencer, con frecuencia y bajas

**Qué se hizo**
- **Migraciones `20261015030000_lead_frio_promocion` y `20261015031000_tarea_lead_frio_indice`:** eventos `lead_frio` y `promocion_por_vencer` en `evento_disparador`, tipo de tarea `lead_frio`, tabla `aviso_promocion` (único por (automatización, lead, promoción) entre los vivos) y el índice «una tarea `lead_frio` pendiente por lead» (en su propia migración: Postgres no deja usar un valor de enum recién agregado en la misma transacción).
- **`src/automatizaciones/seguimiento.ts`:** reglas puras (`esFrioReciente`, `siguienteOcurrenciaDeFrio`, `planearAvisoDePromocion`, `finDePromocion`, `promocionesDeSnapshot`, `fechaLarga`) y lo que toca la base (`programarLeadsFrios`, `programarAvisosDePromocion`, `revalidarLeadFrio`, `revalidarAvisoDePromocion`, `asegurarTareaDeLeadFrio`). **El motor** (`motor.ts`) los programa en la MISMA fase «programar» del reenganche (una sola consulta de automatizaciones y cada una aislada, EA-07: así el test EA-07 existente, que espera UN error cuando falla esa consulta, sigue siendo cierto sin tocarlo) y `ejecutarUna` entiende las entidades `lead` y `aviso_promocion`: valida, crea la tarea y manda la plantilla SOLO por `MessagingProvider.despachar` con el mismo cierre que los recordatorios (fuera de horario → recorre o descarta; bloqueado → `omitido` con el motivo del provider). Variables nuevas: `nombre_promocion` y `fecha_vencimiento`.
- **Seed** (`prisma/seed/seguimiento.sql`): plantillas 707 (reenganche) y 708 (promoción) de marketing y automatizaciones 805 (lead frío, 3 episodios, `max_atraso_dias` 14, lunes a sábado) y 806 (promoción, `-4320` min = 3 días antes), todo `[SUPUESTO]`.

**Verificación**
```
$ npm run validar     → exit 0 · tests 473 · pass 473 · fail 0
$ npm run test:int    → exit 0 · tests 679 · pass 679 · fail 0
```
Tests nuevos: `seguimiento.test.ts` (7, puros: umbral exacto, episodios, ids del snapshot, el fin de la promoción en varias zonas con cambio de horario, el plan completo con ventanas estrechas y días no permitidos) y `seguimiento.itest.ts` (19, con el motor real, el provider, el transporte falso y reloj inyectado): lead frío (umbral y etapas, **idempotencia con tres motores a la vez**, solo lo reciente, cancelación por movimiento / inscripción / pérdida, horario por sucursal con otra zona, **máximo 1 de marketing por 7 días con el segundo episodio**, episodios solo con movimiento y `max_intentos`, bajas de marketing y total, **atención humana: ni tarea ni mensaje**, tope de 3 al día, sin conversación / sin plantilla, sucursal, una tarea pendiente por lead + índice) y promoción (aún no, ventana, no repite aunque haya otra cotización o tres motores, un aviso por lead y promoción, seis cancelaciones, descarte por llegar tarde, ventana propia, bajas, atención humana, tope diario configurable por organización, solo cotizaciones vigentes con promociones activas y con fin). Más 1 de seed.
Mutaciones atrapadas: quitar la omisión por atención humana, quitar la exigencia de movimiento entre episodios (2 tests) y quitar la cancelación por inscripción.

**Decisiones que tomé (con la alternativa descartada)**
1. **La ocurrencia del lead frío es el episodio de frío**, no el intento: la segunda solo existe si el lead se movió DESPUÉS de detectado el anterior (se mide contra `creado_en` de la ejecución anterior con el reloj del motor). Alternativa descartada: una por semana mientras siga frío (insistir cada vez que pasa el tiempo; el provider ya limita marketing a 1 por semana, pero la tarea y el ruido se repetirían).
2. **Solo lo que se enfrió recientemente** (`condiciones.max_atraso_dias`, 14): al encender la automatización por primera vez no se le manda marketing a los leads viejos de golpe. Alternativa descartada: todos los fríos (un día de producción con cientos de mensajes). Los viejos se ven en `/api/leads/estancados` (D7).
3. **La tarea es lo principal y la plantilla «si procede»**: si el provider frena el mensaje (baja, tope de marketing, tope diario) la tarea queda; sin conversación o sin plantilla, solo la tarea. **Con una persona atendiendo se omite entero** (ni tarea): ella ya tiene el lead y el invariante 6 no admite excepción. Alternativa descartada: crear la tarea aunque haya alguien atendiendo (sería una automatización actuando sobre un lead que una persona tiene).
4. **Un aviso de promoción por (automatización, lead, promoción)** en una tabla propia, con índice único: es la entidad de la ejecución (de ahí salen lead, cotización y promoción) y el candado de idempotencia contra varias cotizaciones o varios motores. Alternativa descartada: `entidad_id` = cotización (se repetiría el aviso de la misma promoción con cada cotización nueva) o un uuid derivado del par (no se puede volver a leer).
5. **El «evento» de la promoción es el final de su último día** (las 00:00 del día siguiente en la zona de la sucursal) y `offset_minutos` es negativo, como en los recordatorios: `-4320` = 3 días antes. Si el horario válido llegaría cuando ya venció, se descarta y queda el aviso (no se reevalúa cada minuto). Alternativa descartada: evento = `vigencia_hasta` a las 00:00 (se avisaría un día antes de lo debido).
6. **Revalidar al ejecutar** (lo que cambió desde que se programó): inscrito, perdido, cotización ya no vigente, promoción apagada o prorrogada. Una promoción prorrogada fuera de la ventana cancela el aviso en vez de mandar «vence el viernes» cuando ya no es verdad.
7. **El motor fija `creado_en` de lo que programa con su reloj** (inyectable): es la referencia para «movimiento después de detectado».

**Para Eduardo**
- **[SUPUESTO]** los textos de las plantillas, 3 días antes, 3 episodios, 14 días de atraso máximo, lunes a sábado. Registrar `reenganche_lead_frio` (2 variables) y `promocion_por_vencer` (3) en Twilio como categoría `marketing`.
- Decisión de producto: ¿un lead que una persona atiende debe generar igualmente la tarea de frío? Hoy no (invariante 6); se ve en estancados.
- Decisión de producto: la baja total / de marketing no quita la tarea para el asesor (puede llamarlo si hay otro teléfono); si Eduardo prefiere que tampoco haya tarea, es una línea en `ejecutarUna`.
