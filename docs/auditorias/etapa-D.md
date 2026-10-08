# Auditoría adversarial de la etapa D (bloques D1–D8, noche 2)

Auditor: sesión con contexto nuevo, sin haber escrito el código. Fecha: 8 de octubre de 2026.
Objeto: rama `noche-2`, HEAD `7435209` (último commit de E), diff `etapa-C..HEAD` sin `docs/`; esta auditoría cubre D1–D8 (clase muestra y seguimiento). La etapa E tiene su propio informe (`docs/auditorias/etapa-E.md`).
Método: copia limpia del commit (`git archive HEAD | tar -x -C <tmp>`), Postgres propio (`docker run --rm --name auditoria-ede-pg … postgres:16-alpine`, puerto 5691) con bases propias (`inscripciones_pruebas`, `mut*_pruebas`, `datosc`), y un proyecto compose aparte (`docker compose -p auditoria-ede up -d --build --wait`, puertos 5694/3030/3031, borrado después con `down -v` solo de ese proyecto). No se usó la `DATABASE_URL` del `.env` ni la base de la demo ni el proyecto compose `inscripciones`. Nada contra Twilio, Meta ni AWS. En la fase 1 no se editó el repositorio salvo estos informes; los sondeos y las mutaciones corrieron en copias temporales. Cada hallazgo trae cómo repetirlo.

## 1. Resumen ejecutivo

- **Lo que se sostiene.**
  - Desde cero, todo lo que la bitácora cita se reproduce: `npm ci` + `npm run validar` (**498** tests, exit 0), `npm run test:int` (**712** tests, exit 0: primera corrida sobre base vacía y segunda seguida sobre la misma). Compose desde volúmenes vacíos: `demo-preparar` sale 0, `/salud` responde `{"ok":true,"db":"ok"}`, la base queda con 14 programas / 18 grupos / 31 horarios, 3 documentos legales, 6 motivos de pérdida, 6 automatizaciones y las 3 bandejas con id de Chatwoot.
  - Migraciones: aplican sobre base vacía y sobre una base con datos de la etapa C (31 migraciones hasta `20261012040000`, seed de demo completo y 25 leads con prospecto y conversación): las 25 tablas preexistentes conservan exactamente sus filas, el historial de etapas se rellena (25 filas para 25 leads), `prisma migrate diff --from-config-datasource --to-schema` da «No difference detected» y `clase-muestra.sql` + `seguimiento.sql` corridos dos veces dan los mismos conteos (idempotentes).
  - **Cupo.** La última plaza con 20 intentos simultáneos desde la API (20 familias, cupo 1): una gana, 19 reciben `sin_lugar`. Seis reprogramaciones cruzadas A↔B a la vez: sin interbloqueo (y quitar el orden por id lo atrapa un test). Cuatro reprogramaciones simultáneas de la misma clase: una sola gana, queda UNA clase vigente. Fechas que no son sesión, pasadas, con grupo inactivo o borrado: rechazadas. Cambio de horario de verano (Nueva York): la hora inexistente de marzo no es sesión, la repetida de noviembre cuenta una vez, y la hora de pared se conserva.
  - Los recordatorios, el aviso al maestro, la asistencia, la recuperación y el lead frío pasan por `MessagingProvider`/el motor con baja, ventana, plantilla, horario 09:00–20:00, frecuencia y atención humana; las propiedades «posterior o igual al inicio se descarta», la cancelación al reprogramar/cancelar y la idempotencia están probadas y las mutaciones sobre ellas se atrapan.
  - Datos de salud: el test de fuga recorre D1–D5 con centinelas y se **rompe** si se quita la redacción de `log.ts` (M71, M72) o el permiso de escritura (M43). Ningún valor de salud llega a logs, notas, mensajes, avisos, resumen del asesor, errores, `registro_cambio`, respuestas de rutas no autorizadas ni tablas (revisadas todas las filas de la organización). IDOR: el maestro de otro grupo, la recepción y el asesor de otra sucursal reciben 404/403; confirmado con el sondeo y con mutaciones.
  - Pruebas preexistentes: no se debilitó ninguna aserción (`git diff etapa-C..HEAD` sobre los `*.test.ts`/`*.itest.ts` anteriores son solo ampliaciones: permisos, rutas, configuración, transporte). Ninguna guarda `check:*` cambió.
  - **Mutaciones:** 92 aplicadas sobre reglas de negocio de D (lugares, candado, reprogramar, recordatorios, motor, avisos, asistencia, recuperación, salud, reglamento, embudo, D8, bot, redacción, alcance); **78 atrapadas, 14 sobreviven** (4 equivalentes o redundantes y 10 huecos de prueba reales).
- **Lo que no se sostiene.** **1 hallazgo ALTA**, **5 MEDIA** y **10 BAJA** (de ellas 4 son decisiones de producto). Los que más pesan:
  - **ED-01 (ALTA).** Un instructor que responde `BAJA`, `STOP`, `CANCELAR` o `NO MOLESTAR` a un aviso **no queda dado de baja**: `entranteDeInstructor` atiende su mensaje antes de mirar palabras de baja, no escribe en `consentimiento` y no contesta nada; los avisos siguientes le siguen llegando (demostrado).
  - **ED-02 (MEDIA).** Si un instructor ya tiene su conversación y escribe desde otra conversación de Chatwoot, la alta de `conversacion_instructor` choca con el índice único y el webhook responde 500 en cada mensaje: se pierde lo que escribió (incluida una baja) (demostrado).
  - **ED-03 (MEDIA).** El motivo de cancelación (texto libre) se guarda en `registro_cambio`, que es de solo anexar y nunca se purga; el filtro de salud solo mira 2 de ~12 campos de texto libre (demostrado: alergias, medicamentos, diabetes y epilepsia pasan en `notas`, `motivo_cancelacion`, `practico_donde`, `motivo_clase_detalle`, nombre del alumno y escuela).
  - **ED-04 (MEDIA).** El tope de 3 automáticos al día por teléfono deja el aviso al maestro `bloqueado` para siempre, sin reintento ni tarea para el asesor: el maestro no se entera por WhatsApp de la cuarta clase del día (probado por el propio test D2, como comportamiento «esperado»).
  - **ED-05 (MEDIA).** Diez mutaciones de seguridad o de negocio sobreviven: el maestro que conserva acceso a la ficha de salud tras cancelar o reagendar (M49), el alcance de sucursal del asesor al agendar (M75, M76), el borde exclusivo de la promoción por vencer (M66), el aviso de una clase que ya empezó (M33), la versión vigente de un documento de vertical (M53), programa/sucursal inactivos (M85, M86), la regla de instructor-que-también-es-contacto (M88) y la ventana que nunca se acorta (M89).
  - **ED-06 (MEDIA).** Tests flaky: `barrido.test.ts` depende de esperas de 30 ms; `twilio.test.ts` y `borde.itest.ts` abren un servidor por prueba, lo cierran sin esperarlo y reusan sockets `keep-alive` del `fetch` global (no se reprodujo en 30 corridas, sí por diseño: ver el detalle).
- **Bitácora.** Todo «HECHO» de D1–D8 se reproduce con las cifras que cita. **Pendiente declarado por D4** («el bot no reagenda solo tras la recuperación»): el plan (`PLAN-NOCHE-2.md`, D4: «Asistió o no asistió, y recuperación de quien no llegó») no lo exige y D1 pide «agendar, reprogramar y cancelar… desde el bot **o** el asesor»; el asesor lo cubre. Se deja como decisión de producto (sección 8), sin implementar.

## 2. Tabla de hallazgos

Criterio de gravedad: ALTA = rompe un invariante, dinero o cupo mal calculado o duplicado, mensaje enviado indebidamente o perdido, fuga de datos sensibles o entre organizaciones, acceso no autorizado, pérdida de datos. MEDIA = una garantía documentada no se cumple, falla hacia el lado malo o hay un hueco de prueba con semántica de negocio, pero sin explotación directa. BAJA = endurecimiento, deuda o inexactitud.

| ID | Gravedad | Archivo:línea | Resumen |
|---|---|---|---|
| ED-01 | ALTA | `src/captacion/entrante.ts:136,346` | La baja (`BAJA`/`STOP`/…) de un instructor se ignora: no se registra, no se confirma y los avisos siguen saliendo |
| ED-02 | MEDIA | `src/captacion/entrante.ts:356`, `prisma/migrations/20261014010000_aviso_maestro/migration.sql` | Un instructor con conversación previa que escribe desde otra conversación de Chatwoot revienta con la unicidad `conversacion_instructor_instructor_key`: 500 y mensaje perdido |
| ED-03 | MEDIA | `src/api/registro.ts:32`, `src/api/rutas/clases-muestra.ts`, `src/clases-muestra/registro.ts:274-279` | Salud en texto libre: `motivo_cancelacion` va al registro de cambios (inmutable) y el filtro solo cubre `observacion.notas` y `nivel_observado` |
| ED-04 | MEDIA | `src/mensajeria/avisos-instructor.ts:160-164` | El tope de frecuencia deja el aviso al maestro `bloqueado` de forma definitiva, sin reintento ni tarea |
| ED-05 | MEDIA | secciones 3 y 4 | 14 mutaciones sobreviven de 92; 10 son huecos de prueba reales (alcance del asesor, acceso del maestro, borde de la promoción…) |
| ED-06 | MEDIA | `src/barrido.test.ts`, `src/http/twilio.test.ts:47-60`, `src/mensajeria/twilio/borde.itest.ts:57-69` | Tests flaky: temporizadores de decenas de ms y servidores cerrados sin esperar con `fetch` `keep-alive` |
| ED-07 | BAJA | `src/clases-muestra/agenda.ts:216-241` | Dos reprogramaciones simultáneas: la perdedora recibe «ya tiene una clase vigente en ese grupo» (409) en vez de «la clase ya no está agendada» |
| ED-08 | BAJA | `src/captacion/entrante.ts:213-262`, `src/clases-muestra/agenda.ts:176` | Orden de candados invertido entre el bot (lead → grupo) y la API (grupo → lead): un interbloqueo es posible para el mismo lead y el mismo grupo a la vez (razonado, no reproducido) |
| ED-09 | BAJA (producto) | `src/sensibles/ficha.ts:50-56` | Un maestro conserva acceso a la ficha de salud de un prospecto mientras tenga una clase `no_asistio`/`asistio` en su grupo, sin límite de tiempo |
| ED-10 | BAJA (producto) | `src/clases-muestra/recordatorios.ts:70-75` | Si hay una automatización general y otra de la vertical con el mismo evento y offset, la familia recibe el recordatorio dos veces |
| ED-11 | BAJA (producto) | `src/automatizaciones/motor.ts:310-340` | Cuando una persona toma la conversación, los recordatorios se omiten (`atencion_humana`) sin avisarle a esa persona ni dejar tarea |
| ED-12 | BAJA | `src/embudo/etapas.ts:41` | `moverLeadAEtapa` (sistema) solo respeta `es_ganado`; la ruta humana también respeta `tipo_sistema = inscrito` (`aEtapaParaTransicion`) |
| ED-13 | BAJA | `src/api/rutas/embudo.ts:108-117` | `PATCH /leads/:id/etapa` registra el cambio en otra transacción posterior: si falla, la etapa cambió sin registro |
| ED-14 | BAJA | `src/clases-muestra/registro.ts:314-391` | `guardarRegistro` escribe las secciones comunes y después la salud (otra transacción): si la salud falla, lo demás ya quedó guardado y la respuesta es de error |
| ED-15 | BAJA | `src/captacion/entrante.ts:600-615` | El contexto del bot calcula hasta 60 sesiones × grupo × `count` en cada mensaje de `horario` y `fecha_muestra` (N+1) |
| ED-16 | BAJA | `src/clases-muestra/registro.ts:343-355`, `src/clases-muestra/agenda.ts` | Carrera: un `PATCH` del registro de la clase vieja en el instante de reprogramar crea un registro huérfano en la clase `reagendada` |

Conteo: 1 ALTA, 5 MEDIA, 10 BAJA (3 de ellas decisiones de producto: ED-09, ED-10, ED-11).

## 3. Detalle y evidencia

### ED-01 — La baja de un instructor se ignora (ALTA)

`registrarYAvanzar` llama a `entranteDeInstructor` (`entrante.ts:136`) **antes** de cualquier tratamiento de baja. Esa función solo registra el mensaje (`ventana_servicio_hasta`) y devuelve `"instructor"`: no mira `esPalabraDeBaja`, no escribe en `consentimiento`, no confirma. El contexto §11 y el invariante del provider piden: «`BAJA`, `STOP`, `CANCELAR`, `NO MOLESTAR` → registrar opt-out, confirmar una vez, bloquear todo». El aviso al maestro sí consulta `estaDadoDeBaja` (`avisos-instructor.ts:144`), pero como la baja nunca se registra por el camino real, esa regla solo funciona si alguien inserta la fila a mano (así la prueba D2 la «demuestra»).
Repetir: organización con un instructor activo con teléfono `T`; el contacto `T` escribe «BAJA» a la bandeja de la vertical. Resultado observado: `resultado = instructor`, `estaDadoDeBaja(T) = false`, ningún envío; el siguiente aviso al instructor sale.
Corrección: en `entranteDeInstructor`, si el texto es una palabra de baja, registrar la baja total con `registrarBaja` (origen `palabra_clave`, evidencia con el id del mensaje) y confirmarla una vez por el provider; los avisos pendientes quedan `bloqueado`/`opt_out`. Test: la baja por el camino real corta el siguiente aviso, no se repite la confirmación, y el aislamiento por organización.

### ED-02 — Instructor que escribe desde una conversación nueva (MEDIA)

El índice `conversacion_instructor_instructor_key (instructor_id, bandeja_chatwoot_id)` permite una sola conversación viva por instructor y bandeja. Si el instructor ya tiene una y Chatwoot le abre otra (se resolvió la anterior, otro número de WhatsApp de la escuela…), `entranteDeInstructor` intenta `create` y falla con «Unique constraint failed on conversacion_instructor_instructor_key»; `procesarEntrante` repite 8 veces (`esViolacionUnica`) y lanza: 500 en el webhook, y Chatwoot no reintenta. Se pierde el mensaje (y con él una baja o la respuesta «no puedo ese día»).
Repetir: crear `conversacion_instructor` (instructor, bandeja, conv 5551) y mandar un entrante del teléfono del instructor con `chatwootConversacionId = 5552`. Resultado observado: excepción, 0 leads, ventana sin actualizar.
Corrección: si el instructor ya tiene su conversación en esa bandeja, se actualiza a la conversación nueva (`chatwoot_conversacion_id`) en vez de crear otra.

### ED-03 — Salud en texto libre y registro de cambios inmutable (MEDIA)

`CAMPOS_AUDITABLES.clase_muestra` incluye `motivo_cancelacion` (`registro.ts:32`) mientras que `notas` se excluyó expresamente «para que no lleve salud». El motivo de cancelación es texto libre de hasta 300 caracteres que escribe una persona y «está enfermo» es de las razones más comunes de cancelar; `registro_cambio` es de solo anexar y no se purga, así que lo que se escriba ahí es permanente. Además `mencionaSalud` solo se aplica a `observacion.notas` y `observacion.nivel_observado`: no a `clase_muestra.notas`, `practico_donde`, `practico_nivel`, `motivo_clase_detalle`, `escuela`, ni a los nombres.
Repetir (sondeo contra la API real): `POST /api/clases-muestra {…, notas: "toma medicamentos para el asma"}` → 201; `PATCH …/registro {alumno: {nombre: "Ana (alérgica a la penicilina)", escuela: "Colegio X - tiene diabetes"}, antecedentes: {practico_donde: "dejó el deporte por una lesión de rodilla", motivo_clase: "otro", motivo_clase_detalle: "su médico recomendó por la epilepsia"}}` → 200; `POST …/cancelar {motivo: "tiene alergia y está enfermo"}` → 200 y `registro_cambio.despues.motivo_cancelacion = "tiene alergia y está enfermo"`.
Corrección: quitar `motivo_cancelacion` del registro de cambios (el dato vive en `clase_muestra`, con su permiso y su baja lógica) y aplicar el filtro de salud a los textos narrativos (`notas` de la clase, `practico_donde`, `practico_nivel`, `motivo_clase_detalle`, `motivo` de cancelación). Los nombres no se filtran (un falso positivo bloquearía una inscripción). El filtro sigue siendo un freno a lo evidente, no una garantía.

### ED-04 — Aviso al maestro perdido por el tope de frecuencia (MEDIA)

Para el instructor, `evaluarReglas` aplica `limiteFrecuencia` (3 al día por teléfono) y, al excederse, el aviso queda `bloqueado/tope_frecuencia` (`avisos-instructor.ts:160-164`): estado final, sin reprogramación ni tarea. Un grupo con varios alumnos agendados el mismo día (lo normal: una clase muestra por alumno) deja sin aviso por WhatsApp a partir del cuarto en 24 h. El test D2 («la frecuencia… también frena los avisos a un instructor») lo trata como correcto; la bitácora lo lista como decisión abierta pero no deja ninguna señal operativa (solo la lista de la aplicación).
Corrección: ante `tope_frecuencia` el aviso se reprograma una hora después mientras falten al menos dos horas para la clase (como `fuera_de_horario`); si ya no cabe, queda `bloqueado` y se crea la tarea para el asesor. Es decisión de producto si los avisos a instructores deben tener un tope propio (queda abierta, sección 8).

### ED-05 — Huecos de prueba (MEDIA)

Ver sección 4. Los 10 reales: M33 (aviso al maestro de una clase que ya empezó), M49 (el acceso del maestro a la ficha de salud termina al cancelar o reagendar la clase: el comentario del código lo afirma y ningún test lo comprueba), M53 (versión vigente de un documento propio de la vertical), M66 (borde exclusivo de la promoción por vencer), M75 y M76 (un asesor de otra sucursal agenda con un prospecto o un grupo ajeno), M85 y M86 (programa o sucursal inactivos), M88 y M89 (el teléfono del instructor que también es contacto; la ventana de 24 h del instructor nunca se acorta con un entrante tardío).

### ED-06 — Tests flaky (MEDIA)

- `src/barrido.test.ts`: intervalos de 3–5 ms y esperas fijas de 30–40 ms. Con la máquina ocupada (los implementadores lo vieron dos veces) el primer tic llega tarde y `iniciados` vale 0. Solución: sondear hasta que se cumpla la condición con un tope, no dormir un tiempo fijo.
- `src/http/twilio.test.ts` (404 en vez de 500, una vez) y `src/mensajeria/twilio/borde.itest.ts` («fetch failed», una vez): cada prueba levanta `listen(0)`, hace `fetch` y llama a `server.close()` sin esperarlo; el `fetch` global (undici) conserva el socket `keep-alive` y el siguiente servidor puede recibir el mismo puerto efímero, así que la petición viaja por un socket del servidor anterior (respuesta de otra aplicación o conexión cerrada). Solución: `connection: close` en las peticiones y cerrar el servidor esperando el cierre.
- No se pudo reproducir: 0 fallos en 30 corridas de cada uno, también con 15 procesos simultáneos. La causa es por diseño y la corrección es barata.

### ED-07 a ED-16 — BAJAS

- **ED-07.** 4 reprogramaciones simultáneas de una clase: 1 ok y 3 «ya_tiene_clase» (la clase nueva del ganador está en el mismo grupo). Seguro, pero el mensaje es engañoso; debería decir que la clase ya no está agendada.
- **ED-08.** El bot toma las filas en el orden conversación/lead (`tx.lead.update` en `registrarYAvanzar`) y después el grupo (`agendarClaseMuestra`); la API toma el grupo y después el lead (`crearClase` y `moverLeadAEtapa`). Dos transacciones sobre el MISMO lead y el MISMO grupo a la vez pueden interbloquearse; Postgres aborta una (40P01) y en el bot el mensaje se pierde (no es un conflicto repetible). Requiere que un asesor agende al lead en el mismo instante en que el lead elige fecha.
- **ED-09.** `maestroDelSujetoPorDefecto` cuenta las clases `agendada`, `asistio` y `no_asistio`: el maestro lee la ficha de salud de un prospecto indefinidamente después de una clase que ya pasó. Decisión de producto (ventana de acceso).
- **ED-10.** `programarRecordatoriosDeClase` toma TODAS las automatizaciones activas del evento aplicables (vertical o sin vertical). Si el administrador crea una específica de una vertical además de la general, salen las dos.
- **ED-11.** El motor omite el recordatorio cuando la conversación está `en_atencion_humana` (invariante 6, correcto) pero no deja constancia visible: quien tomó la conversación no sabe que ya no saldrán solos.
- **ED-12.** `moverLeadAEtapa` mira `lead.etapa.es_ganado` pero no `tipo_sistema === "inscrito"`; si la escuela marcó el tipo sin la bandera, el sistema podría mover a un inscrito.
- **ED-13.** `registrarCambio` del movimiento de etapa corre en otra transacción posterior al movimiento (`embudo.ts:108-117`); un fallo ahí deja el cambio sin registro (el historial `lead_etapa_historial` sí queda).
- **ED-14.** Parcial: validación antes de escribir (bien), pero la salud se guarda al final en su propia transacción; si falla por permiso del sujeto o por la base, el resto ya quedó.
- **ED-15.** `contextoClaseMuestra` pide `proximasSesionesConLugar(…, maximo: 60, incluirLlenas: true)` por cada grupo cotizado y cuenta las muestras sesión por sesión.
- **ED-16.** `guardarRegistro` lee la clase fuera del candado del registro y `reprogramarClaseMuestra` mueve el registro sin tomarlo: un `PATCH` sobre la clase vieja justo en ese instante crea un registro nuevo atado a la clase `reagendada`.

## 4. Mutaciones (92 aplicadas, 78 atrapadas)

Procedimiento: copia con el commit, una mutación a la vez, ejecutando solo los tests del módulo (con `--test-concurrency=1` y su propia base), restauración después. Las mutaciones M01–M92 están en la tabla; «SOBREVIVE» = ningún test falló.

| Zona | Mutaciones atrapadas | Sobreviven |
|---|---|---|
| Lugares y candado (`agenda.ts`) | M01 sin restar muestras · M02 `>= 1`→`>= 0` · M03/M04 conteo sin estatus o sin fecha · M05 sin candado · M06 sin orden por id · M07 sin excluir la clase vieja · M08 sin cambio condicional · M12 misma sesión · M13 otra vertical · M14 ya tiene clase · M84 grupo inactivo | M85 programa inactivo · M86 sucursal inactiva |
| Sesiones (`sesiones.ts`) | M16 anticipación `<`→`<=` · M17 horizonte `>`→`>=` · M18 hora canónica | — |
| Recordatorios (`recordatorios.ts`, motor) | M09/M10 sin cancelar al cancelar o reprogramar · M19 borde `>=`→`>` · M20 `ya_paso_el_momento` · M23 clase no vigente · M24 clase ya empezó · M25 límite exclusivo | M21 (equivalente: el único llamador acaba de agendar) · M22 (redundante: lo enviado trae `ejecutado_en`) |
| Atención humana, baja, frecuencia | M26 atención humana (D8) · M30 baja del instructor · M31 frecuencia del instructor | — |
| Aviso al maestro | M32 límite exclusivo · M34 reclamo condicional · M35 «nunca se avisó» · M36 sin teléfono | M33 clase que ya empezó |
| Asistencia y recuperación | M27 contacto respondió · M28 ya reagendó · M29 intento anterior · M37 no antes de la hora · M38 ventana de corrección · M39 cambio condicional · M40 cancelar recuperación · M41 tope de intentos · M90 idempotencia · M91 regreso de etapa · M92 `ocurrencia > 1` | — |
| Registro y salud | M42 palabras de salud · M43 permiso de escritura de salud · M46 reglamento al cerrar · M47 responsable de pago · M48 fecha futura · M50 contacto = tutor · M82 filtro de notas · M83 interés percibido · M87 traslado del registro · M71/M72 redacción del log | M44, M45 (cada una sola es redundante; quitadas las dos juntas, M44+M45 se atrapa) · M49 acceso del maestro por estatus de la clase |
| Legal | M51 versión vigente · M52 solo la imagen se revoca · M54 idempotencia · M55 IP solo por la web | M53 orden de versiones de una vertical |
| Embudo | M56 destino ganado · M57 perdido exige motivo · M58 recuperar exige nota · M59 transición prohibida · M60 `desde_etapa_id` (409) · M61 estancado `>=` · M62 ganado a perdido · M73 candado por lead | — |
| D8 | M63 «reciente» · M64 tope de episodios · M65 vencida `>=` · M67 promoción prorrogada · M68 lead perdido | M66 límite exclusivo del descarte de la promoción |
| Bot | M69 fecha sin lugar · M70 «gracias» tras agendar | — |
| Autorización de rutas | M74 filtro del maestro · M77 `visible` de la asistencia · M78/M79 avisos propios · M80/M81 alcance del registro y las aceptaciones | M75 prospecto del asesor · M76 grupo del asesor |
| Instructor | M30 baja | M88 teléfono también contacto · M89 ventana nunca se acorta |

(M93 era una mutación nula y no cuenta.) De los 14 que sobreviven: 4 son equivalentes o redundantes (M21, M22 y la pareja M44/M45) y **10 son huecos reales** (ED-05).

## 5. Los 14 invariantes contra lo nuevo de D

| # | Invariante | Veredicto |
|---|---|---|
| 1 | Aislamiento por organización | Se sostiene. Toda consulta nueva va por `conAlcance`; `check:capas` pasa; hay test de no-fuga en agenda, recordatorios, avisos, asistencia, bot y registro. Única consulta sin scope nueva: `resolverVerticalPublica` (E1). |
| 2 | Cero términos de vertical | Se sostiene (`check:generico` pasa; los textos del bot y las plantillas viven en tablas o son genéricos). |
| 3 | Soft delete | Se sostiene. Sin `DELETE` físico en el código nuevo. Excepción justificada y documentada: `documento_legal`, `aceptacion_legal` y `lead_etapa_historial` son de solo anexar por disparador (UPDATE, DELETE y TRUNCATE rechazados), como `registro_cambio`. |
| 4 | Todo saliente por `MessagingProvider` | Se sostiene. El aviso al maestro y la apertura de la conversación del instructor viven en `avisos-instructor.ts`, invocado solo por `provider.avisarAInstructor`; el transporte `iniciarConversacion` se llama únicamente desde ahí. **Matiz ED-01:** la confirmación de baja a un instructor no existe. |
| 5 | Dos ventanas | Se sostiene: el aviso al maestro usa su propia ventana de servicio de 24 h (`conversacion_instructor`) y plantilla fuera de ella; sin plantilla apta no se manda y hay tarea. |
| 6 | `en_atencion_humana` bloquea todo | Se sostiene para contactos (recordatorios, recuperación, lead frío, promoción por vencer). Para el instructor «no aplica» por diseño (no hay persona atendiéndolo). Ver ED-11. |
| 7 | Una sola función de teléfonos | Se sostiene: tutores del registro, contacto de emergencia e instructor entrante pasan por `normalizarTelefono`. |
| 8 | Idempotencia | Se sostiene: aviso único por (clase, tipo) en la base; ejecuciones únicas por la llave de siempre; aceptación repetida no duplica; aviso de promoción único por (automatización, lead, promoción). |
| 9 | Webhooks autenticados | Sin cambio en D (la landing es pública a propósito: etapa E). |
| 10 | Determinismo | Se sostiene: lugares, sesiones, recordatorios, transiciones y el bot de fechas son código determinista, sin LLM. |
| 11 | Adaptadores con fakes | Se sostiene: `TransporteFalso.iniciarConversacion`; el real exige `CHATWOOT_ADMIN_TOKEN` y falla claro sin él. |
| 12 | Local primero | Se sostiene: todo corre en compose (verificado desde cero). |
| 13 | La familia es la entidad central | Se sostiene: `registro_tutor` en filas, relación con el prospecto, sin atajos tipo `alumno.telefono_mama`; el registro queda listo para convertir sin recapturar. |
| 14 | Horario de envío | Se sostiene: recordatorios, recuperación, lead frío, promoción por vencer y avisos al maestro se recorren a 09:00–20:00 de la sucursal; el borde «posterior o igual» está probado (M19, M25, M32). Responder dentro de la ventana de servicio sin restricción de horario. |

El único invariante con un hueco concreto es el del **opt-out** del contexto §11 aplicado a los instructores (ED-01).

## 6. Bitácora y plan

- Todos los HECHO de D1–D8 se reproducen: `validar` 498 / `test:int` 712, dos corridas seguidas y una sobre base vacía, exit 0.
- El plan pide en D3 «Probar el grupo del domingo»: está probado (domingo 10:00, 09:30 y 09:00; automatizaciones de la demo con los 7 días permitidos) y el caso de la hora de verano también.
- El plan pide en D1 «desde el bot o el asesor»: el bot agenda; el asesor agenda, reprograma y cancela por API. Que el bot reprograme o cancele no está en el plan.
- D4 declara pendiente «el bot reagenda solo a quien responde a la recuperación». Se evalúa como **no requerido por el plan** (ver arriba) y se pasa a decisión de producto.

## 7. Estado de la corrección

Ver la sección «Auditoría y correcciones de las etapas D y E» de `docs/BITACORA-NOCHE-2.md`.

## 8. Decisiones de producto (para Eduardo)

1. ¿El bot debe reagendar solo a quien responde a la recuperación (D4)? Hoy lo hace el asesor.
2. ¿Los avisos al maestro tienen un tope propio de frecuencia (hoy el general de 3 al día)? Con ED-04 corregido no se pierden, pero se retrasan.
3. ¿Cuánto tiempo conserva el maestro acceso a la ficha de salud de un prospecto después de la clase (ED-09)?
4. ¿Qué pasa si hay dos automatizaciones de recordatorio aplicables (ED-10)? Hoy salen las dos.
5. ¿Debe avisarse a quien toma la conversación que los recordatorios de la clase ya no saldrán solos (ED-11)?
6. Mínimo de antelación para un recordatorio recorrido (hoy cualquiera antes de la clase sale, aunque sea 30 minutos antes).
7. Avisar a la familia cuando una persona reprograma o cancela su clase (hoy no sale nada por WhatsApp).
