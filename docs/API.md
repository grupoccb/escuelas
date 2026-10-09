# API de la aplicación

Todo vive bajo `/api` (JSON). Los webhooks de Chatwoot y Twilio (`/webhooks/*`) y `/salud` NO son parte
de esta API: tienen su propia autenticación. Código en `src/api/`.

## Convenciones

**Sesión.** Cookie `sesion` (`HttpOnly; SameSite=Lax; Path=/`, y `Secure` con `NODE_ENV=production` o `COOKIE_SEGURA=true`). Con cookie segura el nombre es
`__Host-sesion`: el navegador exige `Secure`, `Path=/` y sin `Domain`, y no deja que un subdominio hermano ponga otra con ese nombre.
Se obtiene con `POST /api/sesion`. Expira a las 12 h absolutas y por inactividad (`SESION_INACTIVIDAD_MIN`, 120 por defecto). Una sesión también deja de valer si su
organización se da de baja. Las sesiones expiradas o revocadas hace más de 30 días y los intentos de acceso de más de 48 h se marcan `eliminado_en` desde el barrido
(`src/auth/retencion.ts`, a lo más una vez por hora, idempotente); el registro de cambios y el de accesos a salud NO se purgan (solo de anexar; su retención la decide Eduardo).
No hay tokens en el cuerpo ni en cabeceras de autorización.
**Bloqueo de login.** 5 intentos fallidos por (correo, IP) en 15 min; la IP es la dirección IPv4 o el /64 de una IPv6 (una dirección distinta por intento no lo esquiva).

**CSRF.** Todo `POST`/`PUT`/`PATCH`/`DELETE` debe llevar `Content-Type: application/json` o `X-Requested-With: <algo>`. Si trae
`Origin` (o `Referer`) debe ser el de `ORIGEN_PUBLICO` (o, sin configurar, el mismo host). Esta API no concede CORS.

**Errores.** Siempre `{ "error": { "codigo", "mensaje", "detalles"? } }`:

| codigo | HTTP | Cuándo |
|---|---|---|
| `no_autenticado` | 401 | sin sesión, vencida o revocada; también un login fallido |
| `prohibido` | 403 | hay sesión pero el rol no tiene el permiso (o falla CSRF) |
| `no_encontrado` | 404 | no existe, o es de otra organización o fuera de tu alcance (nunca se distingue) |
| `validacion` | 400 | entrada inválida; `detalles: [{ campo, mensaje }]`, todos los errores juntos |
| `conflicto` | 409 | choca con el estado actual (correo repetido, tarea ya resuelta, último administrador…) |
| `limite_excedido` | 429 / 413 | demasiados intentos o peticiones (con `Retry-After`); 413 si el cuerpo es muy grande |
| `interno` | 500 | fallo propio; sin trazas ni textos de la base |

**Validación.** `src/api/validar.ts`: esquemas pequeños y tipados; los campos desconocidos se rechazan; los textos se recortan; en la query
un parámetro repetido es un error.

**Paginación.** `?limite=&pagina=`. `limite` por defecto 25, tope duro 100; `pagina` desde 1. Respuesta:
`{ "datos": [...], "paginacion": { "pagina", "limite", "total" } }`. Orden estable (criterio + `id`).

**Alcance.** Administrador: toda la organización. Asesor y recepción: sus sucursales (`usuario_sucursal`). Maestro: los grupos de su instructor.
Una fila sin sucursal (lead que aún no la elige) solo la ve el administrador.

**Catálogo (C1 en adelante).** Lectura: `catalogo:leer` (todos los roles; cada uno ve lo de su alcance de sucursal, el maestro la de sus grupos); escritura: `catalogo:escribir` (administrador).
La baja de un recurso del catálogo es lógica y se rechaza con 409 mientras algo vivo dependa de él.
**Dinero (C2).** Los importes de la API son **texto decimal** (`"1234.50"`, a lo más dos decimales, 0 a 9 999 999 999.99); un número JSON se rechaza (es un flotante). En código el dinero va en centavos `bigint`
(`src/lib/dinero.ts`: suma, resta, porcentaje con redondeo «mitad alejándose de cero», reparto sin perder centavos, formato es-MX) y `npm run check:dinero` prohíbe `parseFloat`, `.toNumber()` y `Number()`
sobre importes. Las fechas de vigencia son `AAAA-MM-DD` (calendario local) y `desde`/`hasta` son inclusivos. `precioVigente(db, programaId, fecha)` (`src/catalogo/precios.ts`) devuelve el precio que rige un día.
Las vigencias de un programa no se traslapan: restricción de exclusión (`btree_gist`) en la base.

**Promociones (C3).** `src/promociones/`: `resolverPromociones(promociones, contexto)` es PURA y determinista; `promocionesAplicables(db, contexto)` la alimenta desde la base. Reglas: candidata = activa, vigente (desde y hasta inclusivos), en el alcance
(lista vacía = todos), con cupo y condición cumplida; orden por `prioridad` (mayor primero; empate: menor id); las NO acumulables compiten (gana una) y las acumulables se suman; los descuentos se calculan sobre el importe ORIGINAL (no en cascada) y nunca lo dejan
bajo cero; `al_pagar_primera_mensualidad` deja PENDIENTES los beneficios «al cumplir la condición» (el uniforme gratis). `consumirCupo(db, promocionId, contexto)` (F-pre: EC-14/EC-16) primero comprueba que la promoción APLICA en el contexto (activa, vigente ese día, en su alcance y con su condición cumplida: la misma regla del resolutor) y luego toma un lugar con UN `UPDATE … WHERE (cupo_maximo IS NULL OR cupo_usado < cupo_maximo)` que compara las dos columnas en la base (gana uno; una sentencia de 0 filas no aborta la transacción de Postgres de quien inscribe; el `CHECK` de la base queda como red).
`producto_id` de un beneficio es un uuid SIN llave foránea hasta que llegue `producto` (H5); `inscripcion_id` de `promocion_aplicacion` ya es llave foránea (F3); `descripcion` dice qué se entrega.

**Cotizador (C5).** `src/cotizador/`: `cotizar(catalogo, entrada)` es PURA y determinista; `cargarCatalogoCotizable(db, {verticalId, sucursalIds?, fecha, fuente?})` la alimenta desde la base. Entrada: edad declarada **o** fecha de nacimiento,
vertical, sucursal y la fecha de la consulta (calendario local; reloj inyectable). Salida: los programas de esa vertical y sucursal cuyo rango `edad_min…edad_max` (inclusivos) cubre la edad y, de cada uno, sus grupos **activos con horario** (los de más lugares primero; días y horas en español por `formatearHorarios`, `src/lib/horario.ts`),
los lugares reales (`calcularCupo` con la `FuenteOcupacion`; lleno = `lista_de_espera` si el grupo la permite o `sin_lugar`), el precio vigente en la fecha (`null` = «sin precio»: no se inventa y no se calculan promociones) y las promociones aplicables con su desglose (resolutor de C3). Más de un programa para la misma edad
(programas `permite_traslape`) son alternativas. **Edad:** con fecha de nacimiento y `programa.fecha_corte_edad`, años cumplidos **a esa fecha** (no a hoy; quien nace después del corte aún no es elegible); con fecha de nacimiento y sin corte, a la fecha de la consulta; con solo la edad declarada («como 6») se usa tal cual
(`edadCumplida`, `src/lib/edad.ts`: el 29 de febrero se cumple el 1 de marzo en años no bisiestos). **Ocupación:** `FuenteOcupacion` (`src/catalogo/cupo.ts`) se inyecta en `DepsApi.fuenteOcupacion` (`ApiDepsEntrada.fuenteOcupacion`); por omisión `InscripcionesActivas` (F4: las inscripciones activas del grupo).

**Cotizaciones guardadas (C8).** Tabla `cotizacion`: lo que se le cotizó a una familia, **congelado** en `snapshot` (programa, grupos con lugares y horarios, precios y promociones de ESE día, importes como texto; nunca se recalcula: una inscripción
posterior —F3— puede respetarlo, y el asesor ve lo que se le dijo al contacto aunque el catálogo haya cambiado). Campos: `lead_id`, `prospecto_id`, `programa_id`, `sucursal_id`, `origen` (`bot` | `asesor`), `conversacion_id` (solo el bot), `creado_por_usuario_id` (solo el asesor), `grupo_elegido_id`,
`fecha` (calendario local de la sucursal), `vigente_hasta` (inclusive: a lo más `fecha + configuracion_organizacion.cotizacion_vigencia_dias`, 7 por defecto, y antes si vence el precio o una promoción cotizada) y `estatus` (`vigente` | `aceptada` | `vencida`). **Una vigente por (prospecto, programa)**: una nueva vence a la anterior en la misma
transacción (índice único parcial `cotizacion_vigente_key`). `vencida` la pone el mantenimiento horario del ciclo (`vencerCotizaciones`, con un día de margen sobre la fecha UTC) y la API ya la muestra aunque el barrido no haya corrido; `aceptada` la pondrá la inscripción (F3). **Elegir horario en el bot no es aceptar.**
Del bot: `src/captacion/maquina.ts` pide los efectos `guardar_cotizacion` y `elegir_grupo` y `entrante.ts` los ejecuta en la transacción del mensaje; los horarios que se le numeran al contacto son los del snapshot guardado.

**Lista de espera (C9).** Tabla `lista_espera`: quién espera un lugar en un grupo lleno que permite lista de espera (`grupo.permite_lista_espera`). Una entrada **viva** (`esperando` u `ofrecido`) por (grupo, prospecto); `posicion` es 1..N entre las vivas, única por grupo
(índice único parcial) y sin huecos: la mantiene `src/lista-espera/lista-espera.ts` bajo un candado por grupo (`lista_espera:<grupo>`). Estatus: `esperando` → `ofrecido` (se liberó un lugar y se le ofreció, con `ofrecido_en` y `vence_en` = horas de `configuracion_organizacion.lista_espera_oferta_horas`, 48 por defecto) → `inscrito` (F3) o `cancelado` (se quitó); cerrar una
entrada conserva su posición como historial y recorre a las demás. El alta la hace el bot (el contacto eligió un horario lleno y dijo que sí; deja la tarea `lista_espera_nueva` para el asesor) y se puede hacer desde código con `altaConCandado(db, {grupoId, prospectoId, leadId})` (idempotente).
**`ofrecerLugarLiberado(db, grupoId)`** marca como `ofrecido` al primero que `esperando` y crea la tarea `lista_espera_lugar_liberado` para el asesor (NO escribe a la familia); devuelve null si nadie espera. **F5 (baja o cambio de grupo) la invoca cuando un grupo libera un lugar**; F3 cierra la entrada con
`cerrarEntrada(db, id, "inscrito")` / `cerrarEntradaDe(db, grupoId, prospectoId, "inscrito")` cuando quien esperaba se inscribe. La lista de espera NO cuenta como ocupación del grupo.

**Clase muestra (D1).** Tabla `clase_muestra`: la clase de prueba de un prospecto en un grupo, en una **sesión** concreta (`fecha_hora`, un instante con zona; en la API se manda con desfase: `2026-10-12T16:00:00-06:00`, y sin zona se rechaza).
La fecha debe ser una sesión del grupo —día de la semana y hora de inicio de un `grupo_horario`, en la **zona horaria de la sucursal** (el cambio de horario de verano mueve el instante UTC, no la hora de pared; una hora local que no existe no es sesión)—, empezar con al menos
`configuracion_organizacion.clase_muestra_anticipacion_min` minutos de anticipación (120 por defecto, inclusiva) y no pasar de `clase_muestra_horizonte_dias` (60). Estatus: `agendada` (vigente, ocupa lugar) → `asistio` | `no_asistio` (D4) | `reagendada` (se movió; la nueva trae `reprogramada_de_id`) | `cancelada`.
**Lugares de la sesión = `cupo_maximo` − ocupados del grupo (`FuenteOcupacion`) − clases muestra agendadas de ESA fecha.** La última plaza bajo concurrencia la gana una persona: todo el que reparte lugares de un grupo toma antes **`bloquearCupoDeGrupo(tx, grupoId)`** (`src/catalogo/cupo.ts`: un `UPDATE` de la fila del grupo, que se puede tomar dentro de cualquier transacción)
y cuenta después; F4 (inscribir) y F5 (cambio de grupo) deben usar el MISMO candado. Un prospecto tiene a lo más una clase vigente por grupo (índice único parcial). **Reprogramar** = cancelar la anterior (`reagendada`) y agendar la nueva en UNA transacción: si la nueva no cabe no se escribe nada. **Cancelar** libera el lugar.
Al agendar, el lead pasa a la etapa de **`tipo_sistema = muestra_agendada`** (el código nunca busca etapas por nombre; `etapa_pipeline.tipo_sistema`, a lo más una viva por tipo y organización; solo avanza, salvo un lead perdido que se recupera; un inscrito no se mueve; sin etapa de ese tipo no se mueve) y queda en la sucursal de la clase
(de ahí sale su horario de envío); al cancelar la única clase vigente del lead vuelve a `contactado`. `notas` y el `motivo` de cancelación son texto libre **sin datos de salud**: la API rechaza (400) lo evidente (alergias, medicamentos, enfermedades…) y ninguno de los dos se guarda en el registro de cambios (ED-03); lo mismo vale para `practico_donde`, `practico_nivel` y `motivo_clase_detalle` del registro. Código: `src/clases-muestra/` (`sesiones.ts` puro, `agenda.ts`), `src/embudo/etapas.ts`.
**Del bot** (vertical con `cotizador_whatsapp_activo` **y** `clase_muestra_whatsapp_activo`): después de elegir horario con lugar el bot propone las próximas fechas con lugar de ese grupo (lista numerada, máx. 5, con lugares; se guardan en `conversacion.muestra_ofrecida` para que el número apunte a lo que vio), agenda con la elección y confirma; si la fecha se llenó mientras contestaba, manda las que quedan;
«asesor» siempre pasa a una persona. **Tras agendar, el bot pasa la conversación a una persona** (motivo de pase `muestra_agendada`, con una nota interna que lleva la clase): INV-6 hizo que los recordatorios de la clase sean avisos de SERVICIO y salgan aunque una persona atienda (ver «Clase de mensaje: servicio y marketing»). Ya no existe la solución provisional del «gracias».

**Aviso al maestro (D2, decisión 13: «plantilla por MessagingProvider y lista en la aplicación»).** Al agendar, reprogramar o cancelar una clase muestra se crea, en la misma transacción, un `aviso_maestro` para el instructor del grupo (`tipo` `agendada` | `reprogramada` | `cancelada`;
`datos` = alumno, grupo, sucursal, fecha y hora ya en la hora de la sucursal, y la fecha anterior si se movió; **nunca datos de salud**). Uno por (clase, tipo): un reintento no duplica (índice único). Si la clase cambia de instructor al reprogramar, el nuevo recibe «reprogramada» y el anterior «cancelada».
Es a la vez **la lista de la aplicación** (`GET /api/maestro/avisos`, `leido_en`) y **la unidad de envío por WhatsApp**: el barrido del minuto (`barrerAvisosMaestro`, en `correrCiclo`) lo manda con `MessagingProvider.avisarAInstructor`, que aplica las MISMAS reglas que a un contacto (`evaluarReglas`): baja del teléfono (→ `bloqueado`/`opt_out`), ventana de servicio de 24 h
(dentro, mensaje libre; fuera, SOLO la plantilla aprobada `aviso_maestro_<tipo>`; sin plantilla apta → `bloqueado` y una tarea `aviso_maestro_no_enviado` para el asesor), horario 09:00–20:00 de la sucursal del grupo (fuera de rango se recorre al siguiente horario válido; si con eso llegaría a la hora de la clase **o después** se descarta con `evento_pasado`),
frecuencia (el tope de automáticos por día de la organización, por teléfono) y **no** `en_atencion_humana` (no hay una persona atendiendo al instructor). Estado de entrega en `aviso_maestro.entrega`: `sin_telefono` (solo la lista de la aplicación y una tarea) · `pendiente` · `enviando` · `enviado` · `bloqueado` · `descartado` · `fallido`.
Un envío fallido no se reintenta solo; uno incierto (tiempo agotado, proceso muerto a media operación) **nunca se reenvía** y deja tarea. Si la clase se cancela antes de avisar, el «agendada» pendiente se descarta y el «cancelada» no se manda por WhatsApp (`nunca_se_aviso`), pero ambos quedan en la lista.
**El destinatario no es un lead:** el instructor tiene su propia conversación de WhatsApp (`conversacion_instructor`, ligada a la bandeja de la vertical del grupo), que se abre con la primera plantilla (`TransporteConversaciones.iniciarConversacion`: crea el contacto y la conversación en Chatwoot con el token de agente `CHATWOOT_ADMIN_TOKEN`; sin él, el aviso queda solo en la aplicación y con tarea)
y que registra cuándo responde. Un mensaje que llega por esa conversación (o de un teléfono de instructor activo que no es lead de esa vertical) NO crea lead ni activa el bot: solo abre su ventana de 24 h (`procesarEntrante` → `instructor`).

**Recordatorios de la clase muestra (D3).** Dos automatizaciones del evento nuevo `clase_muestra_proxima` (`offset_minutos` NEGATIVO y configurable: `-1440` = 24 h antes, `-120` = 2 h antes; ventana horaria y días permitidos propios, nunca más ancha que 09:00–20:00 — el seed de la demo permite también el domingo).
Al agendar una clase se crea, en la misma transacción, una ejecución por automatización aplicable (activas del evento, de la vertical y sucursal de la clase o sin restricción): `automatizacion_ejecucion` con `entidad_tipo = clase_muestra`, ocurrencia 1; **idempotente** por `(automatizacion_id, entidad_tipo, entidad_id, ocurrencia)`.
`planearRecordatorios` (`src/clases-muestra/recordatorios.ts`, PURA) decide cuándo sale cada una: el nominal es `inicio + offset`; **si ya pasó al agendar, esa ejecución nace `descartado` con motivo `ya_paso_el_momento`** (una clase agendada con menos de 24 h no tiene el de 24 h, y el de 2 h solo si alcanza); lo que cae fuera de la ventana horaria se recorre al siguiente horario válido de la sucursal;
**si ese horario es POSTERIOR O IGUAL al inicio de la clase, se descarta (`evento_pasado`)** y queda registrado. El motor las ejecuta a su hora (el destinatario es el lead de la clase, por su conversación, con el nombre del alumno de ESA clase) y `MessagingProvider` decide con todas sus reglas (baja, ventana de servicio y plantilla, horario, frecuencia; el recordatorio es de clase `servicio`, así que sale aunque `en_atencion_humana`). Antes de mandar el motor revisa que la clase siga agendada y no haya empezado, y si el servidor estuvo caído y lo atrasó, recorre o descarta con la misma regla.
**Reprogramar** cancela las pendientes de la anterior (`cancelado`, motivo `clase_reprogramada`) y programa las de la nueva; **cancelar** las cancela (`clase_cancelada`); lo ya enviado queda como historial. Variables que resuelve el motor para estas plantillas: `nombre_prospecto`, `nombre_grupo`, `fecha_clase`, `hora_clase`, `nombre_sucursal`.
Sin conversación de WhatsApp del lead (entró por otra vía) no hay por dónde mandar: `omitido` / `sin_conversacion` y una tarea `automatizacion_omitida` ligada a la clase.

**Asistencia y recuperación (D4).** `PATCH /api/clases-muestra/:id/asistencia {estatus: "asistio" | "no_asistio"}` — permiso `clases_muestra:asistencia` (el maestro de ESE grupo, el asesor de la sucursal, el administrador; recepción no; lo ajeno, 404). **Solo desde la hora de la clase** (justo a la hora ya se puede; antes, 409) y
solo transiciones válidas: `agendada → asistio | no_asistio`; **corrección** `asistio ↔ no_asistio` dentro de `clase_muestra_correccion_horas` (48 por defecto) desde que se marcó (después, 409); marcar lo mismo otra vez es idempotente (200, sin cambio ni registro); una clase `cancelada` o `reagendada` no se marca (409). Dos marcas simultáneas distintas: gana una y la otra recibe 409
(el cambio es condicional al estatus leído). Cada cambio queda en `registro_cambio` (`estatus` y `asistencia_marcada_en`) y deja una interacción `nota` en el lead.
**Asistió:** el lead pasa a la etapa de `tipo_sistema = muestra_asistida` (solo avanza), se cancelan la recuperación pendiente y la tarea de llamar. **No asistió:** se programan los intentos de la automatización del evento **`clase_muestra_no_asistio`** (`offset_minutos` POSITIVO: minutos DESPUÉS de marcarlo; los siguientes intentos cada `espaciado_minutos` — por omisión el mismo offset —;
`max_intentos` es el tope, 1–2) con la plantilla que ofrece reagendar, dentro del horario de envío (de noche se recorre a las 09:00; nunca se descarta por eso), respetando baja y frecuencia (MessagingProvider); la plantilla de recuperación es de clase `marketing`: con una persona atendiendo NO sale (`omitido`/`atencion_humana`), y se deja **una** tarea `llamar_no_asistio` para el asesor (vence a las 24 h). El motor revisa al ejecutar que la clase siga en `no_asistio`, que la familia no haya vuelto a agendar
(`ya_reagendo`) y, del segundo intento en adelante, que el anterior salió y que no ha contestado desde entonces (`contacto_respondio`). Volver a agendar al prospecto (D1) cancela lo pendiente (`volvio_a_agendar`) y descarta la tarea; corregir a «asistió» también (`asistencia_corregida`). Si la familia contesta, su conversación llega a un asesor, que reagenda con `POST /api/clases-muestra`.

**Registro de la clase muestra (D5).** `registro_clase_muestra` (1:1 con la clase, índice único parcial) + `registro_tutor` (una fila por adulto). Lo capturan el maestro de ESE grupo, el asesor de la sucursal y el administrador (`registro_muestra:leer|escribir`; recepción no ve nada;
reabrir un cerrado, `registro_muestra:reabrir`, solo el administrador). Lo ajeno responde 404. **Diseño sin atajos (invariante 13):** el alumno son columnas (nombre, apellidos, fecha de nacimiento del acta, sexo, escuela, turno, talla), los adultos son FILAS (nombre, parentesco, teléfono con `normalizarTelefono()`, correo, `es_responsable_pago`, `lo_lleva`,
`puede_recoger` — el «segundo adulto autorizado» es otra fila; a lo más un responsable de pago, uno que lo lleva y un teléfono sin repetir, impuesto también por índices únicos), los antecedentes (`practico_antes`, dónde, nivel, `motivo_clase` ∈ `disciplina|condicion_fisica|socializacion|competencia|otro`, un enum de la base) y la observación (nivel observado, `grupo_recomendado_id`,
`interes_percibido` ∈ `alto|medio|bajo`, notas libres que se rechazan si mencionan salud). **«Asistió o no» es `clase_muestra.estatus`**: `observacion.asistio` en el PATCH llama a `marcarAsistencia` (reglas de D4: desde la hora, ventana de corrección) en la misma transacción; si se rechaza, no se guarda nada de la petición.
`GET /api/clases-muestra/:id/registro` devuelve el registro o el esqueleto `estatus: "sin_captura"`, con `faltantes` (rutas de campo) y `salud` = `{contacto_registrado, completa, faltantes, puedes_ver_valores}` (**nunca valores**: se leen con `GET /api/salud/prospecto/:id`, con permiso, motivo y constancia).
`PATCH` guarda parcial (borrador; `null` borra un valor; una sección ausente no cambia; `tutores` es la lista COMPLETA, con `id` conserva la fila, un `id` de otro registro es 400) y valida: fecha de nacimiento real, no futura y de 1 a 99 años; sexo/turno/motivo/interés del catálogo; correo; teléfonos; coherencia de antecedentes (quien no practicó no tiene dónde ni nivel); grupo recomendado activo y de la misma vertical.
**Estados:** `borrador` → `POST …/registro/completar` → `completo` (409 con la lista de lo que falta: alumno, un adulto con responsable de pago, antecedentes y la ficha de salud entera; la observación se captura después y no se exige) → `POST …/registro/cerrar` → `cerrado` (exige completo; si la clase se dio, el interés percibido; el reglamento aceptado, D6; bloquea ediciones) → `POST …/registro/reabrir` (administrador).
Editar un completo al que le queda algo sin responder lo regresa a borrador. Escribir se serializa con un candado por clase: varias capturas simultáneas crean UN registro y se mezclan. Reprogramar la clase lleva el registro (borrador o completo) a la clase nueva; un cerrado se queda.
**Salud y seguridad:** la sección `salud` del PATCH es opaca para la ruta y la valida y guarda `src/sensibles/registro-salud.ts` con `guardarSensible()` (cifrada en `ficha_salud`, ligada al prospecto, con constancia en `acceso_dato_sensible`). Solo `salud:escribir` (administrador y maestro del grupo): un asesor que la manda recibe 403 con constancia y NADA de lo demás de esa petición se guarda. El contacto de emergencia debe ser una persona
distinta de los tutores (mismo teléfono normalizado o mismo nombre sin acentos): se comprueba al capturarlo, al cambiar los adultos (aunque quien los cambie no lea salud: la comparación interna deja la acción `validar` en el registro de accesos y no muestra nada) y al completar. `maestroDelSujeto` ya existe para prospectos: el maestro accede a la ficha de un prospecto con clase muestra vigente o dada en un grupo suyo.
**Registro de cambios:** solo estatus, motivo, interés, banderas y las SECCIONES tocadas (`secciones`): ni nombres, ni fechas de nacimiento, ni teléfonos, ni salud (el registro de cambios es de solo anexar y no se purga). **Conversión (F2):** `registroDeProspectoParaConversion(db, prospectoId)` (`src/clases-muestra/registro.ts`) entrega el registro completo en forma estructurada (alumno, adultos con banderas, antecedentes, observación) para crear `tutor`, `alumno` y `tutor_alumno` sin preguntar nada; la ficha de salud no viaja: está ligada al prospecto y F2 la pasa al alumno por el módulo sensible.

**Reglamento y autorización de imagen con evidencia (D6).** `documento_legal` (`reglamento` | `uso_imagen` | `aviso_privacidad`, versión, texto, `vigente_desde`, huella SHA-256 del texto, por organización y opcionalmente por vertical) y `aceptacion_legal`. **Ambas son de SOLO ANEXAR en la base** (disparadores: ni UPDATE, ni DELETE, ni TRUNCATE, también en cascada; mismo límite
que `registro_cambio`: el dueño de la tabla puede quitar el disparador, ver «Roles de base de datos»). Cambiar un texto es publicar la versión siguiente: `POST /api/documentos-legales` (administrador) numera bajo un candado por (tipo, vertical) —dos publicaciones simultáneas obtienen versiones distintas— y la nueva no puede regir antes que la anterior. **Vigente** = la versión más alta cuyo `vigente_desde` ya llegó;
la de una vertical manda sobre la general. `GET /api/documentos-legales/vigentes?vertical_id=` es lo que se le muestra a la familia hoy (con el texto de la tabla). **Aceptar:** `POST /api/clases-muestra/:id/registro/aceptaciones {documento_id, version, resultado: aceptada|rechazada|revocada, aceptante: {nombre?, parentesco?, registro_tutor_id?}, canal: presencial|web|whatsapp|telefono, evidencia?}`.
Solo se acepta (o rechaza) la versión VIGENTE y la que dice haber visto quien acepta debe coincidir: si no, 409 con la vigente. La fila guarda quién aceptó (nombre y parentesco, o el adulto del registro por su id), cuándo (reloj del servidor), el canal, quién lo capturó, la huella del texto mostrado (la copia el servidor: el cliente no la manda), IP y agente SOLO si el canal es `web`, y una evidencia opcional (a lo más 10 datos de texto corto).
**Repetir lo mismo no duplica** (200 con la fila existente, también con peticiones simultáneas: candado por (prospecto, tipo)). **Revocar** solo aplica a `uso_imagen` y solo si lo último fue «aceptada»: es una fila NUEVA (la aceptación original queda intacta) y se puede volver a autorizar con otra. `GET …/registro/aceptaciones` da el estado por tipo con su frase («Aceptó el reglamento v3 el 2026-11-10 (Rosa Mena, madre)», `al_corriente` si lo último es la versión vigente) y el historial.
**Sin la aceptación del reglamento un registro no pasa a `cerrado`** (409 con `detalles`: sin aceptar, rechazado o sin reglamento configurado); se acepta cualquier versión aceptada en su momento: la inscripción (F3) deberá pedir la vigente. Tablas, ids y textos de ejemplo `[SUPUESTO]` en `prisma/seed/seguimiento.sql`.

**Embudo con historial (D7).** Cada cambio de etapa de un lead anexa una fila a `lead_etapa_historial` (**solo de anexar**, disparador): etapa anterior y nueva, `origen` `usuario` | `sistema`, quién, `motivo` (el tipo de movimiento o la causa: `avance`, `retroceso`, `perdida`, `recuperacion`, `clase_muestra_agendada`…), `motivo_perdida_id`, nota, `es_recuperacion` y `secuencia` (el orden de registro: la fecha puede repetirse). El alta del lead (el bot) es la primera fila, sin etapa anterior; los leads previos al historial entraron con
una fila `alta_previa_al_historial`. **`PATCH /api/leads/:id/etapa {etapa_id, motivo_perdida_id?, nota?, desde_etapa_id?}`** (`leads:escribir`): las reglas puras están en `src/embudo/transiciones.ts` — **pasar a perdido EXIGE el motivo** (activo y de la organización; 400 si falta o si se manda sin perder); **recuperar** (de perdido a una etapa activa) **exige una nota**, suma `lead.recuperaciones` y limpia `lead.motivo_perdida_id` (la fila de la pérdida conserva su motivo); a una etapa de inscrito **no se llega moviendo etapas**
(409; la hace la conversión, F2); **de una inscrita solo el administrador vuelve atrás y nunca a perdido**; perdido → perdido no. Una etapa «de cierre» lo es por `es_ganado`/`es_perdido` o por su `tipo_sistema` (`inscrito`/`perdido`); el código nunca busca etapas por nombre. **Matriz configurable mínima:** `transicion_etapa` (desde, hacia, `prohibida` | `solo_administrador` | `permitida`) endurece un par; las reglas fijas no se levantan con ella. Mover es movimiento: reinicia `ultima_interaccion_en`.
Un movimiento se serializa por lead (candado `lead_etapa:<id>`) y es condicional a la etapa leída; con `desde_etapa_id` (la etapa que vio quien lo pide) un lead que ya cambió responde 409 (`detalles: desde_etapa_id`); dos movimientos simultáneos sin él se ordenan en cadena (cada «desde» es el «hacia» del anterior). Mover a la misma etapa es 200 sin cambio y sin historial. **Las transiciones del sistema** (`moverLeadAEtapa`: clase agendada, asistió, cancelada; un perdido que agenda se RECUPERA) escriben su fila con origen `sistema` y el reloj de quien llama.
`GET /api/leads/:id/historial` (`leads:leer`) trae los cambios (más antiguo primero) con `segundos_en_la_etapa` y `tiempo_por_etapa` (suma por etapa y veces que entró; el tramo vigente corre hasta ahora; un reloj que retrocede da 0, nunca negativos). **Lead estancado:** `GET /api/leads/estancados?etapa_id=&sucursal_id=` es una CONSULTA (no envía nada): leads cuya etapa tiene `dias_alerta_sin_movimiento` y llevan al menos esos días (completos) desde su última interacción (o desde su creación si nunca hubo),
sin las etapas de cierre ni las sin umbral, los más viejos primero, con el alcance por sucursal; usa el índice `lead(etapa_id, ultima_interaccion_en)`. **Motivos de pérdida:** `motivo_perdida` por organización, editable (`GET|POST /api/motivos-perdida`, `PATCH|DELETE /api/motivos-perdida/:id`; el código se deriva del nombre si no se manda y es único entre los vivos; dar de baja no toca lo ya perdido). Seed `[SUPUESTO]` en `prisma/seed/seguimiento.sql`.

**Lead frío y promoción por vencer (D8).** Dos automatizaciones nuevas sobre el motor (eventos `lead_frio` y `promocion_por_vencer` de `evento_disparador`); las programa el propio motor (`src/automatizaciones/seguimiento.ts`) y todo lo que mandan pasa por `MessagingProvider`, que les aplica TODAS sus reglas: máximo 1 de marketing cada 7 días y 3 automáticos al día por teléfono (`configuracion_organizacion`), baja de marketing y baja total, horario 09:00–20:00 de la sucursal (también la ventana propia de la automatización, nunca más ancha),
ventana de servicio y plantilla aprobada, y atención humana. **Lead frío** (entidad `lead`): frío = lleva en su etapa sin movimiento los días de `etapa_pipeline.dias_alerta_sin_movimiento` + `offset_minutos` extra (0); nunca en etapas de cierre ni sin umbral; solo lo que se enfrió HACE POCO (`condiciones.max_atraso_dias`, 14 por omisión: al encender la automatización no se le escribe de golpe a los leads viejos, esos salen en `GET /api/leads/estancados`). La ocurrencia es el EPISODIO de frío:
el segundo solo existe si el lead tuvo movimiento DESPUÉS de detectado el anterior y hay a lo más `max_intentos`. Al ejecutarse: revalida (lead vivo, etapa abierta y SIGUE frío: si se movió → `omitido`/`lead_se_movio`; si se inscribió → `lead_inscrito`; si se perdió → `lead_perdido`), crea **una tarea `lead_frio` pendiente por lead** (índice único parcial) y, si la automatización tiene plantilla y el lead una conversación, manda la plantilla de reenganche (`marketing`); sin conversación → `omitido`/`sin_conversacion`;
sin plantilla → `omitido`/`solo_tarea`; con una persona atendiendo (`en_atencion_humana`) la TAREA se crea igual (el motor no mira la atención humana: es un aviso interno y es justo esa persona quien debe verlo; ED-11) y la plantilla, de clase `marketing`, la frena el provider (`omitido`/`atencion_humana`). Si el provider frena el mensaje (baja, tope de frecuencia…) la tarea queda igual y la ejecución dice por qué. **Promoción por vencer** (entidad `aviso_promocion`): para cada lead con una cotización VIGENTE cuyo snapshot aplicó una promoción activa con fin, el aviso sale `-offset_minutos` antes de que acabe la promoción (`-4320` = 3 días antes; la promoción vale hasta el final de su `vigencia_hasta` en el calendario de la sucursal),
en el siguiente horario válido; si con eso llegaría cuando ya venció, queda `descartado`/`evento_pasado` (nunca se manda tarde). **Un aviso por (automatización, lead, promoción)** (índice único): no se repite aunque haya varias cotizaciones o varios motores. Se cancela si el lead se inscribió o se perdió, la cotización ya no vale (`cotizacion_no_vigente`), la promoción se apagó (`promocion_no_vigente`) o se prorrogó fuera de la ventana (`promocion_extendida`). Variables nuevas que resuelve el motor: `nombre_promocion` y `fecha_vencimiento` («viernes 13 de noviembre»); `nombre_prospecto` es el alumno de la cotización.
Todo está en `prisma/seed/seguimiento.sql` como ejemplo `[SUPUESTO]` (plantillas 707 y 708, automatizaciones 805 y 806).

**Choques de salón e instructor.** Dos grupos activos con el mismo salón, o el mismo instructor (aunque sea en otra sucursal), en franjas que se traslapan (mismo día, `inicio < fin` ajeno y `fin > inicio` ajeno; terminar justo cuando empieza la otra NO choca) → `409 conflicto` con `detalles: [{campo: "salon_id"|"instructor_id", mensaje: "El salón ya está ocupado por el grupo «X» el martes de 16:30 a 17:30 (se traslapa con 17:00–18:00)"}]`.
Lo calcula `src/catalogo/choques.ts` (`detectarChoques` pura + `choquesDeGrupo` con consulta). La base lo impone también con disparadores (`choque_de_ocupacion`, SQLSTATE 23P01) que toman un candado consultivo por salón e instructor: una restricción de exclusión (`btree_gist`) no sirve porque salón e instructor viven en `grupo` y las franjas en `grupo_horario`, y una exclusión mira una sola tabla.

**Registro de cambios.** Cada escritura **de la API** deja en `registro_cambio` quién, qué y antes/después (solo campos de la lista blanca; nunca contraseñas ni salud),
en la misma transacción. Queda fuera lo que no lo hace una persona con sesión: los procesos del sistema (el barrido, los webhooks de Chatwoot y de Twilio, p. ej. las asignaciones de
conversación) —el registro exige `usuario_id`—, la creación del `instructor` al promover a un maestro, y los inicios y cierres de sesión (esos solo van al log).
**Solo de anexar en la base:** ni `UPDATE`, ni `DELETE`, ni `TRUNCATE` (también en cascada) sobre `registro_cambio` y `acceso_dato_sensible`; ver «Roles de base de datos».

**Cabeceras.** En todo el backend: `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`. En `/api`: CSP `default-src 'none'`,
`Cache-Control: no-store`.

## Protección de rutas públicas (límites)

Límite por **IP** y ruta, en memoria (`src/http/limite.ts`: cubeta de fichas, ráfaga = cupo por minuto, con tope de memoria). Al excederlo: **429 con `Retry-After`**
(en `/api`, con la convención de errores y código `limite_excedido`; en los webhooks, sin cuerpo).

| Qué | Variable (por minuto) | Defecto | Detalle |
|---|---|---|---|
| Inicio de sesión | `LIMITE_LOGIN_POR_MINUTO` | 10 | Además del bloqueo por (correo, IP) de B1 |
| Resto de `/api` | `LIMITE_API_POR_MINUTO` | 600 | Antes de revisar la sesión |
| Landing pública (E1) | `LIMITE_LANDING_POR_MINUTO` | 30 | `GET` y `POST` de `/l/:vertical` comparten el cupo por IP; al excederlo, 429 con una página y `Retry-After`. Cuerpo máximo `LIMITE_CUERPO_LANDING` (16 KB → 413) |
| Webhooks: firmas INVÁLIDAS | `LIMITE_WEBHOOK_FALLOS_POR_MINUTO` | 30 | Por IP y por ruta; cada rechazo gasta este cupo y, agotado, los siguientes rechazos responden 429 |
| Webhooks: techo | `LIMITE_WEBHOOK_POR_MINUTO` | 6000 | Solo lo firmado y legítimo lo gasta; frena una inundación sin estorbar al tráfico normal |
| Tope de memoria | `LIMITE_MAX_CLAVES` | 50000 | Cubetas guardadas |

Los límites de webhooks se aplican **después** de verificar la firma, con dos cubetas separadas (EB-04): las firmas inválidas gastan solo el cupo de fallos y el tráfico
**firmado y legítimo** solo el techo. Por eso nadie agota el límite de lo legítimo mandando firmas inválidas, ni siquiera desde la misma IP (un balanceador sin `TRUST_PROXY`, una oficina con NAT).
Costo: el cuerpo (acotado por ruta) se lee y se verifica antes de decidir; verificar una firma es barato.
Tamaño de cuerpo por ruta (`src/api/cuerpos.ts`): login 4 KB, resto de la API 100 KB, Twilio 100 KB, Chatwoot 1 MB, landing 16 KB; al pasarlo, 413.

**IP real detrás de un balanceador:** `TRUST_PROXY` (número de saltos de confianza, p. ej. `1` con un ALB de AWS, o lista de redes). Sin definirlo se usa la IP de la conexión y
`X-Forwarded-For` se ignora, así que no sirve para esquivar el límite. No uses `true`. Las IPv6 se agrupan por /64.
**Defínelo siempre en producción** (EB-04): detrás de un balanceador sin `TRUST_PROXY` todos los clientes comparten una IP, y cinco intentos fallidos bloquean el login de cualquiera.
Con `NODE_ENV=production` y sin valor, el backend loguea una alerta fuerte (`trust_proxy_no_definido`) al arrancar; un valor explícito (`false` incluido) la silencia.
`docker-compose.yml` lo fija a `false` (el puerto se publica sin balanceador); un despliegue detrás de un ALB usa `1`. El caso contrario también es peligroso: `TRUST_PROXY=1` con el puerto expuesto directamente permite falsificar la IP.

**HSTS.** `Strict-Transport-Security` se manda cuando la cookie de sesión es `Secure` (`NODE_ENV=production` o `COOKIE_SEGURA=true`) o cuando `ORIGEN_PUBLICO` es `https://…`; no en la demo en http.

**Lo que NO resuelve:**
- El estado vive en el proceso: con **varias réplicas** cada una cuenta aparte (el límite efectivo se multiplica) y un reinicio lo borra. Con más de una réplica hace falta un almacén compartido (Redis, la base) o un WAF/balanceador que limite antes.
- Una IP compartida (oficina con NAT) comparte cupo; un atacante con muchísimas IPs distintas no se frena por IP (ni puede expulsar cubetas sin límite, pero sí algunas).
- No protege contra denegación de servicio de red (volumétrica): eso es del balanceador/CDN.

## Landing pública por vertical (E1)

Página servida por el backend, sin sesión ni JavaScript externo: **`GET /l/:vertical`** muestra el cuestionario y **`POST /l/:vertical`** (`application/x-www-form-urlencoded`) lo envía. `:vertical` es el `slug` de la vertical; los slugs son únicos por organización, así que si el mismo slug existe en dos
organizaciones hace falta `?org=<slug-de-la-organización>` (sin él, y para cualquier slug inexistente o raro, la respuesta es la MISMA página 404: no se revela qué hay). Parámetros opcionales de la URL: `c` (código de campaña/QR, ver E2/E3), `s` (sucursal sugerida, un id) y `utm_source|medium|campaign|content|term` (a lo más 100 caracteres; lo raro se ignora).
Todo lo que se ve sale de las tablas: nombre y color de la vertical (`vertical.color_marca` validado `#RRGGBB`, `vertical.logo_url` solo https), sus sucursales activas y el **aviso de privacidad vigente** (`documento_legal` de D6). Sin aviso vigente la página responde el MISMO 404 que una inexistente y no recoge datos (no habría evidencia de consentimiento; un 503 distinto diría qué verticales existen: EE-11).

**Cuestionario** (los mismos datos que el bot): `nombre_alumno` (quien tomará la clase), `edad` (1–99), `sucursal_id` (de las que ofrece la vertical; con una sola no se pregunta), `telefono` de contacto, `nombre_contacto` (opcional), `acepta_aviso` y los ocultos `documento_id`/`version` (el aviso que se mostró) y `c`/`utm_*`. Validación completa en el servidor: 422 con la página repintada, un mensaje por campo y los valores conservados.
**Un envío válido**, en este orden y sin duplicar nada si se repite: (1) `normalizarTelefono()`; (2) bajo un candado por (teléfono, vertical) se encuentra o se crea el **lead** (mismo teléfono y vertical = el mismo lead; los demás campos NO se reescriben si ya existía) con `atribucion = {fuente: "landing", utm?, codigo_rastreo?, campana_id?}` y `campana_id` si el código de campaña sirve (activo, vigente, con usos, con su **campaña activa y dentro de sus fechas**, de la organización y de la vertical; se consume ANTES de atribuir, con cambio condicional: EE-02/EE-03),
su fila de alta en el historial y el **prospecto** (el primero del lead es `origen = bot` para que el bot de WhatsApp siga sobre él; mismo nombre y edad = el mismo). **A un lead que ya existía (y ya tiene a alguien) no se le agregan prospectos** mandando su teléfono: el formulario no prueba que sea el dueño (EE-05); un hermano se agrega por WhatsApp o lo registra el asesor. Los nombres no pueden llevar direcciones web ni solo caracteres invisibles; (3) la **aceptación del aviso de privacidad** como evidencia (`aceptacion_legal`, canal `web`, IP y agente, huella del texto; D6); (4) el **consentimiento** (`consentimiento`, opt-in `todo`, origen `formulario`, con el id de esa aceptación),
**excepto si el teléfono tiene una baja** (un formulario no prueba que sea el dueño del número); (5) el **código de rastreo del lead** (`codigo_rastreo` tipo `lead`: un solo uso, 30 días) y la respuesta **`303` a `https://wa.me/<número>?text=…`** con el mensaje «Hola, quiero información de <vertical>. Mi código es ABCD-EFGH». El número es el del canal de WhatsApp de la sucursal que ELIGIÓ quien llena el formulario (aunque el teléfono ya fuera un lead de otra: EE-04), o el general de la vertical; sin número (la demo usa una bandeja API) se muestra una página de agradecimiento.
La respuesta es la misma exista o no el lead (**sin enumeración**).

**Anti-abuso:** límite por IP (`LIMITE_LANDING_POR_MINUTO`, 30), cuerpo de a lo más 16 KB (413), un campo trampa `sitio_web` (honeypot: si viene lleno, se responde exactamente como un envío bueno —303 a WhatsApp con un código que no existe— y no se guarda nada) y validación estricta. **El POST solo se acepta desde la propia página (EE-08):** se rechaza con 403 si `Sec-Fetch-Site` es `cross-site` o si `Origin` es otro sitio (el propio host, o `ORIGEN_PUBLICO` si está configurado); sin esas cabeceras (una prueba, `curl`) y con `Origin: null` pasa. **Seguridad de la página:** todo valor reflejado va escapado (texto y atributos); CSP `default-src 'none'` con `style-src`/`script-src` por **nonce** distinto en cada respuesta, `img-src https:`, `frame-ancestors 'none'`, `base-uri 'none'` y **sin `form-action`** (Chrome lo aplica a las redirecciones del envío y bloqueaba el 303 a `wa.me`, EE-01);
`Cache-Control: no-store`; `noindex`. Código: `src/captacion/landing.ts` (lógica), `src/http/landing.ts` (rutas), `src/http/landing-html.ts` (plantilla), `src/captacion/codigos.ts` (códigos de rastreo). **El bot** (`maquina.ts`): quien llenó la landing y luego escribe por WhatsApp recibe «Ya tenemos los datos que nos dejaste para <nombre>» y solo se le pregunta lo que falte (la sucursal, si no la dio): cero recaptura.

## Códigos de rastreo de WhatsApp (E2)

El enlace de WhatsApp que arma la landing (E1) y el QR de una campaña (E3) llevan un **código corto** en el mensaje prellenado («…Mi código es ABCD-EFGH»). `codigo_rastreo`: 8 caracteres de un alfabeto sin ambiguos (sin I, L, O, 0 ni 1) y con al menos un dígito, único entre los vivos de la organización (un CHECK y un índice parcial lo imponen); tipo `campana` (el del QR o el anuncio: lo usan muchas personas, con `max_usos` opcional) o `lead` (uno por lead de la landing: un solo uso, 30 días). Código: `src/captacion/codigos.ts` y `src/captacion/rastreo.ts`.
**Cuando llega un mensaje** (`procesarEntrante`): (1) el parser encuentra el código en el texto (mayúsculas o minúsculas; con espacio, guion, raya, punto, guion bajo o sin separador; rodeado de signos; nunca pegado a otras letras); (2) lo busca en LA organización: uno que no existe, de otra organización, apagado, fuera de vigencia, agotado o de otra vertical **se ignora sin romper nada** (el lead nace sin atribución);
(3) el texto que ve el bot sale **sin los códigos que la organización conoce** (existan o ya no sirvan) y sin el «Mi código es» que los precede: el código nunca se toma por el nombre, la edad ni la sucursal, y un mensaje que era SOLO el código a mitad de la captura no cuenta como respuesta fallida ni se contesta (en `inicio` el bot saluda como siempre). Una palabra que solo se parece a un código pero no está en la tabla no se toca. El mensaje se guarda tal como llegó;
(4) si el código sirve, **un lead nuevo recibe** `campana_id`, la sucursal del código (si el canal no fija una) y `atribucion = {fuente: "codigo", codigo_rastreo, campana_id, sucursal_del_codigo_id}`, y el código **se consume** (un uso, con el tope, de forma condicional: bajo concurrencia nadie pasa del tope). **El lead conserva su primera atribución:** el que ya tenía una (anuncio, landing, otro código) no cambia ni cuenta un uso; el orgánico (sin ninguna) sí la recibe;
el mismo lead escribiendo dos veces con el código cuenta una. **Vía de anuncios (A7):** si el primer mensaje trae la atribución del anuncio, manda el anuncio y el código no se cuenta; el adaptador no se toca. El código de un **lead de la landing**: escrito desde su mismo teléfono solo se consume; desde OTRO teléfono el lead nuevo hereda la campaña y la sucursal y queda ligado (`atribucion.lead_de_landing_id`) para que se pueda unir a la familia después. Un mensaje sin código sigue exactamente como antes.

**Administración** (`src/api/rutas/campanas.ts`): `GET|POST /api/campanas`, `GET|PATCH|DELETE /api/campanas/:id` (lectura `catalogo:leer`, escritura `catalogo:escribir`; la fuente de un QR en sucursal es la campaña con `origen = presencial`, que es lo que leerán los reportes I1/I2; una campaña con códigos o leads no se borra) y `GET|POST /api/codigos-rastreo`, `PATCH|DELETE /api/codigos-rastreo/:id` (todo `catalogo:escribir`): sin `codigo` se genera uno; con él se valida y normaliza; la sucursal y la vertical son las de la campaña si no se mandan;
el tope no baja de los usos; la baja libera el código; los de lead los crea el sistema y no se editan aquí.

## Código QR de una campaña (E3)

`GET /api/campanas/:id/qr?sucursal_id=&vertical_id=&formato=svg|png|url&mm=&escala=&descargar=true` (`campanas:qr`: administrador y asesor; el asesor solo pide sucursales de su alcance, fuera de él 404). El QR codifica la URL de la landing de la vertical con el código de rastreo **de esa campaña y esa sucursal** (`https://<origen público>/l/<vertical>?c=<código>&s=<sucursal>`, más `org=` solo si el slug de la vertical se repite entre organizaciones). Cada par (campaña, sucursal) tiene su propio código y su propio QR; el código se crea una sola vez (bajo candado, también con peticiones simultáneas) y se reutiliza mientras sirva (activo, vigente y sin agotar). Sin `sucursal_id` se usa la de la campaña; si tampoco hay, el QR es general (el asesor tiene que elegir una de las suyas). La vertical es la de la campaña (si la campaña no tiene, `vertical_id` es obligatorio) y debe impartirse en la sucursal.

- `formato=svg` (por omisión): `image/svg+xml`, `mm` = lado impreso (20 a 300, 60 por omisión), zona de silencio de 4 módulos, un solo `<path>`.
- `formato=png`: escala de grises de 8 bits, `escala` = píxeles por módulo (4 a 40, 16 por omisión: con menos, una URL larga no se lee, EE-14).
- `formato=url`: JSON `{url, codigo, codigo_formateado, vertical_id, sucursal_id, ...}`.
- `descargar=true` agrega `Content-Disposition: attachment` con un nombre ASCII seguro (`qr-<campaña>-<sucursal>.svg|png`). La respuesta lleva `X-Codigo-Rastreo`.
- La base pública sale de `ORIGEN_PUBLICO` (el primero) o `PUBLIC_BASE_URL`; fuera de producción, del host de la petición; en producción nunca del `Host` (409 si falta la configuración).
- Los booleanos de la query son `true` o `false`. Los QR usan corrección M; si la URL no cabe en la versión 10 (213 bytes) responde 400.
- La fuente `presencial` queda en la campaña (`campana.origen`) para los reportes I1/I2: el lead que entra por el QR hereda `campana_id` y la sucursal.

## Familia: tutores, alumnos y su relación (F1, invariante 13)

La familia es la entidad central. `tutor` (el adulto), `alumno` (quien toma las clases) y `tutor_alumno` (M:N con `parentesco` y las banderas `es_responsable_pago`, `es_contacto_urgencia`, `puede_recoger`, `lo_lleva`).
**Un tutor por teléfono normalizado** dentro de la organización (índice único parcial vivo + CHECK de E.164 sin el «1» de `+521`): el mismo teléfono, con cualquier formato (`+521…`, `+52…`, 10 dígitos, `whatsapp:…`), es la misma familia. Dar de alta a un alumno con un `tutor` nuevo cuyo teléfono ya existe lo LIGA al que hay
(sin pisarle los datos); `POST /api/tutores` con un teléfono que ya existe es 409 y dice cuál es (si el usuario lo ve). Un alumno tiene al menos un tutor, a lo más un responsable de pago (si nadie se marca, el primero) y a lo más uno que lo lleva. No hay campos de contacto en `alumno` (`telefono_mama` no existe y no debe existir).
`es_contacto_urgencia` es la bandera `es_contacto_emergencia` del modelo de datos; se llama distinto porque ese nombre es una raíz de dato de salud para `check:sensibles` (el contacto de emergencia con sus datos vive CIFRADO en `ficha_salud`).
**Salud: nada aquí.** Alergias, condiciones, medicamentos y contacto de emergencia del alumno van en `ficha_salud` con sujeto `alumno` (`PUT|GET /api/salud/alumno/:id`, permiso, motivo y constancia). `autoriza_uso_imagen` no se edita: se deriva de la última respuesta (por `secuencia`) a la autorización de imagen (D6) del prospecto del que viene (`autorizaUsoDeImagen`, `src/legal/aceptaciones.ts`).
`estatus` del alumno (`activo` | `baja` | `congelado`) lo mueven la inscripción y la baja (F3/F5), no el `PATCH`.
**Quién ve qué** (`src/familias/alcance.ts`): administrador todo; asesor y recepción, la familia dada de alta en SUS sucursales (`sucursal_id` del tutor y del alumno) o con una inscripción en un grupo de ellas; el maestro lee a los alumnos inscritos en SUS grupos, **sin teléfono ni correo de la familia y sin salud**, y no ve tutores. Una fila sin sucursal solo la ve el administrador. Lo ajeno es 404.
Quien da de alta con una sola sucursal la usa sin decirla; con varias debe elegir una de las suyas. Cada cambio queda en `registro_cambio` con SOLO qué campos se tocaron (`campos`), nunca sus valores (no hay nombres, teléfonos ni direcciones en un registro que no se purga).
Código: `src/familias/familia.ts` (`encontrarOCrearTutor` —seguro bajo concurrencia: `INSERT … ON CONFLICT DO NOTHING` y volver a buscar—, `crearAlumno`, `vincularTutor`), `src/familias/alcance.ts`, `src/api/rutas/familias.ts`.

## Inscripción (F3) y cupo real (F4)

`POST /api/inscripciones` inscribe a un alumno en un grupo (`src/inscripciones/inscribir.ts`, dentro de UNA transacción: la usan la API y la conversión de un lead, F2). En orden: (1) el alumno y el grupo existen y el grupo está activo; la **edad** (a la `fecha_corte_edad` del programa, o a hoy) cae en el rango del programa (409 `fuera_de_edad`; solo el administrador puede mandar `permitir_fuera_de_edad`); (2) el **precio** se CONGELA desde `precioVigente` al día de la inscripción (calendario de la sucursal del grupo);
sin precio vigente, 409 `sin_precio` con mensaje claro; (3) el **reglamento vigente** (la versión que rige hoy, D6) debe estar aceptado por la familia: la evidencia cuelga del prospecto del que viene el alumno (`prospecto.alumno_id`); sin aceptar, rechazado, aceptado en una versión anterior, sin reglamento configurado o un alumno sin prospecto de origen → 409 `reglamento`;
(4) toma el **candado del cupo** (`bloquearCupoDeGrupo`, el mismo de la clase muestra) y cuenta las inscripciones activas: lleno → 409 `grupo_lleno`; ya inscrito en ese grupo → 409 `ya_inscrito` (con el id de la inscripción); (5) resuelve las **promociones** (C3) con los hermanos ya inscritos de la familia (F7) y consume su cupo de forma atómica; si una se agotó entre tanto se vuelve a resolver sin ella;
(6) escribe la inscripción, una fila `promocion_aplicacion` por beneficio (inmediatos `entregado` con fecha, diferidos `pendiente`; cada una con el `descuento` y los `meses_gratis` que valió, CONGELADOS), pasa la cotización origen a `aceptada` (la vigente del prospecto y programa, o `cotizacion_id`), mueve al lead a la etapa de `tipo_sistema = inscrito` (con historial, origen `sistema`) y deja al alumno `activo`; (7) ya confirmada, cierra su entrada de la lista de espera como `inscrito`.
**Qué guarda:** `precio_inscripcion_aplicado` y `precio_mensualidad_aplicado` son el precio de LISTA del día (no se tocan nunca); `descuento_inscripcion_aplicado`, `descuento_mensualidad_aplicado` y `meses_gratis_aplicados` lo que valieron las promociones inmediatas; lo diferido (uniforme gratis al pagar la primera mensualidad…) queda en `promocion_aplicacion` pendiente para H4. `lead_id` y `prospecto_id` son el origen (costo por alumno inscrito por campaña). `promocion_id` es la promoción principal (la de mayor prioridad); todas están en `promocion_aplicacion`.
**Día de corte:** `dia_corte_pago` (1 a 31, por omisión el día del mes en que empieza el alumno) se guarda tal cual; en un mes más corto el corte cae en su último día (el 31 corta el 30 de abril y el 28 o 29 de febrero y vuelve a ser 31 en mayo). Funciones puras en `src/inscripciones/corte.ts` (`fechaDeCorte`, `proximoCorte`); la respuesta trae `proximo_corte`.
`fecha_inicio` no puede ser anterior a hoy ni pasar de un año. El precio de una inscripción existente NO cambia si luego sube el precio. Quién ve qué (`src/inscripciones/alcance.ts`): administrador todas; asesor y recepción las de grupos de sus sucursales; el maestro las de SUS grupos (lectura).
**Cupo real (F4).** La ocupación de un grupo = sus inscripciones `activa` (`InscripcionesActivas`, `src/catalogo/cupo.ts`; índice parcial `inscripcion_cupo_idx`). **Las congeladas y las bajas NO ocupan lugar** (decisión documentada en la bitácora de F4) y la lista de espera tampoco. Es la fuente por omisión de TODO lo que reparte o muestra lugares y `src/server.ts` crea UNA para todos: cotizador (API y bot), sesiones de la clase muestra, lista de espera e inscripción.
Cualquiera que reparta lugares de un grupo toma antes `bloquearCupoDeGrupo(tx, grupoId)` y cuenta después (F5 lo usa en el cambio de grupo y en reactivar).

## Conversión del lead en familia e inscripciones (F2, «cero recaptura»)

`POST /api/leads/:id/convertir` (`src/conversion/convertir.ts`; el grupo —el que se manda o el que se deduce de la cotización o del maestro— tiene que ser de las sucursales de quien convierte: 404 si lo manda fuera de su alcance, «falta el grupo» si lo deduce —EF-01—) convierte al lead en UNA transacción (si algo falla, nada queda): los **tutores** (los adultos del registro del maestro con sus banderas; si no hay registro, el propio contacto del lead; un tutor por teléfono normalizado, así que si el teléfono ya existe se LIGA al que hay sin pisarle los datos), por cada **prospecto un alumno** con todo lo que capturó el maestro (nombre completo, fecha del acta, sexo, escuela, turno, talla, antecedentes) y sus filas `tutor_alumno`, la **salud** (se MUDA de la ficha del prospecto a la del alumno por `trasladarFichaDeProspectoAAlumno`, `src/sensibles/traslado.ts`: se descifra y se vuelve a cifrar con el contexto del alumno sin que el valor salga del módulo; la ficha del prospecto queda dada de baja y vacía; el registro de accesos deja la acción `trasladar`; no exige `salud:leer` porque es una operación del sistema),
las **aceptaciones legales** (el reglamento y la imagen siguen ligados al prospecto —evidencia de solo anexar— y el alumno queda ligado a ese prospecto: `autoriza_uso_imagen` se deriva de ahí) y la **inscripción** de cada alumno (F3). Al final `lead.tutor_id` (el tutor de SU teléfono; si ningún adulto del registro lo tiene, el responsable de pago) y `prospecto.alumno_id` apuntan a lo creado y el lead pasa a la etapa de `tipo_sistema = inscrito` con su historial.
**Qué se pide y qué no.** El servidor junta lo ya capturado (bot, landing, registro del maestro aunque esté en borrador, cotización con el horario que eligió la familia —o, si no hay, el grupo que recomendó el maestro—) y calcula SOLO lo que falta. `GET /api/leads/:id/conversion` devuelve únicamente eso: `{lead_id, listo, ya_convertido, faltantes: [{campo, mensaje}], prospectos: [{prospecto_id, ya_convertido}]}`. Los `campo` son rutas como `tutor.parentesco`, `prospectos.<id>.alumno.apellidos`, `prospectos.<id>.alumno.fecha_nacimiento`, `prospectos.<id>.grupo_id`, y también lo que impediría inscribir (`prospectos.<id>.reglamento` sin aceptar, `prospectos.<id>.precio` sin precio vigente) para decirlo ANTES de empezar. El `POST` con algo faltante responde 409 `faltan_datos` con esa misma lista y no escribe nada.
`POST` `{tutor?: {parentesco?, nombre?, apellidos?, correo?}, prospectos?: [{prospecto_id, alumno?: {…lo que falte…}, inscripcion?: {grupo_id?, fecha_inicio?, dia_corte_pago?, meses_pagados_por_adelantado?, cotizacion_id?, permitir_fuera_de_edad?}}]}`: lo que se manda complementa y, si choca, GANA a lo capturado (una corrección). Sin `prospectos` se convierten todos los del lead. Respuesta `{ya_convertido, tutor_id, alumnos: [{prospecto_id, alumno_id, creado, tutor_ids, inscripcion: {id, grupo_id, creada} | null}]}`: **201** si se creó algo, **200** si ya estaba todo convertido. Un rechazo de la inscripción (`grupo_lleno`, `fuera_de_edad`…) es 409 con `detalles: [{campo: "motivo", mensaje}, {campo: "prospecto_id", …}]` y deshace TODO.
**Idempotencia y carreras.** Convertir dos veces no duplica: un prospecto con alumno lo reutiliza, el tutor es el mismo por su teléfono y una inscripción activa en el mismo grupo se devuelve tal cual. Un candado por lead (`conversion:<lead>`) hace que dos conversiones simultáneas se formen en fila (la segunda recibe lo ya convertido). Las inscripciones se hacen en orden de grupo para que dos conversiones no se estorben en orden inverso. La lista de espera se cierra como `inscrito` ya confirmada la conversión.
Permisos `conversion:leer` y `conversion:ejecutar`: administrador y asesor (de las sucursales del lead); el maestro los tiene en la matriz pero la ruta solo se los concede con el modo `maestro_en_sitio` y de SUS alumnos (ver «Quién cierra la inscripción»). `permitir_fuera_de_edad`, solo el administrador.

## Cambio de grupo, congelar, reactivar y baja (F5)

Todo con `inscripciones:escribir` (administrador, asesor, recepción; lo ajeno, 404; el maestro lee y no cambia). `src/inscripciones/cambios.ts`; cada operación corre en UNA transacción, deja un **movimiento** en `inscripcion_movimiento` (de SOLO ANEXAR por la base, con `secuencia`; de aquí sale el historial de cambios de grupo) y su registro de cambios (estatus, grupo, fecha y motivo; nada identificable), y es condicional al estado que leyó (dos operaciones simultáneas sobre la misma inscripción: una gana, la otra `cambio_concurrente`).
- **Cambio de grupo** (`POST /api/inscripciones/:id/cambiar-grupo {grupo_id}`): otro grupo activo del **mismo programa** (cambiar de programa es una baja y una inscripción nueva; el precio congelado no cambia). **Atómico**: el lugar nuevo y la salida del viejo son un solo `UPDATE`; si el grupo nuevo está lleno, 409 `grupo_lleno` y NADA cambia. Toma el candado de los DOS grupos en orden de id (A→B y B→A simultáneos no se interbloquean). Una inscripción congelada también cambia de grupo (sin pedir lugar; lo pedirá al reactivarse). 409: `mismo_grupo`, `otro_programa`, `ya_inscrito` (ya está activa en ese grupo), `estatus_invalido` (una baja no cambia).
- **Congelar** (`POST …/congelar`) libera el lugar (las congeladas no ocupan, F4); **reactivar** (`POST …/reactivar`) lo vuelve a pedir: si el grupo se llenó, 409 `grupo_lleno`.
- **Baja** (`POST …/baja {motivo_baja_id}`) desde activa o congelada: el motivo es obligatorio y del catálogo activo de la organización (400 si no); `fecha_baja` = hoy (o el día de inicio si aún no empezaba); libera el lugar; deja el precio y los descuentos congelados como estaban. Sus beneficios diferidos pendientes no se entregan (H4 debe ignorar los de una inscripción dada de baja) y el cupo de las promociones que usó no se devuelve.
- Lo que SUELTA un lugar activo (cambio de grupo, congelar, baja) llama, ya confirmada la transacción, a `ofrecerLugarLiberado` (C9): marca como `ofrecido` al primero de la lista de espera del grupo y crea la tarea `lista_espera_lugar_liberado` para el asesor (NO escribe a la familia); la respuesta trae `lista_espera: {tarea_id, prospecto_id, posicion} | null`.
- **Estatus del alumno**: se recalcula de sus inscripciones (alguna activa → `activo`; si no, alguna congelada → `congelado`; si no → `baja`). Inscribirse de nuevo lo reactiva.
- **Historial**: `GET /api/inscripciones/:id/movimientos` (`inscripciones:leer`): tipo (`cambio_grupo`, `congelacion`, `reactivacion`, `baja`), fecha local, grupos, motivo y quién.
- **Motivos de baja** (`GET /api/motivos-baja?activo=` con `catalogo:leer`; `POST`, `PATCH /:id`, `DELETE /:id` con `catalogo:escribir`): catálogo editable por organización, como los motivos de pérdida; dar de baja un motivo no toca lo ya dado de baja. Seed `[SUPUESTO]` en `prisma/seed/seguimiento.sql`: económico, cambio de domicilio, horario, insatisfacción, otro.
- **Defensas en la base**: una baja lleva SIEMPRE su motivo y su fecha, una congelada su «desde cuándo», un movimiento de cambio de grupo sus dos grupos distintos, y el disparador `inscripcion_cupo_maximo` cubre reactivar y mover de grupo (F4).

## Quién cierra la inscripción (F6, decisión 7 del plan)

Dos modos, por configuración de la organización (`configuracion_organizacion.modo_cierre`, leída siempre con `leerConfiguracion()`; sin API todavía, J8): **`asesor_whatsapp`** (por omisión) y **`maestro_en_sitio`**. Cambiar el modo cambia el comportamiento SIN tocar código; las rutas lo consultan en cada petición.
- **`POST /api/clases-muestra/:id/listo-para-cerrar`** (`clases_muestra:listo_para_cerrar`: administrador, asesor, maestro; en CUALQUIER modo): marca que la familia quedó lista para inscribirse. Solo de una clase a la que el alumno ASISTIÓ (409 `clase_no_asistida`) y de un lead que no esté inscrito (409 `ya_inscrito`). Deja `clase_muestra.listo_para_cerrar_en/por`, mueve al lead a la etapa de `tipo_sistema = negociacion` (solo avanza; con historial, origen `sistema`, motivo `listo_para_cerrar`), crea UNA tarea `listo_para_cerrar` para el asesor (índice único parcial: una pendiente por lead; la ve en `GET /api/tareas?tipo=listo_para_cerrar`) y una nota en el lead. Idempotente: 201 la primera vez, 200 después, sin duplicar nada ni con peticiones simultáneas (candado `conversion:<lead>`, el mismo de la conversión). El aviso al asesor es la tarea (y la etapa en el embudo): el API no manda mensajes por sí sola (invariante 4).
  La tarea se resuelve sola (`hecha`) cuando el lead se convierte.
- **Matriz de quién convierte** (`puedeConvertir`, `src/conversion/cierre.ts`): administrador y asesor siempre; **maestro solo con `maestro_en_sitio`** (con `asesor_whatsapp`, 403 «la inscripción la cierra el asesor» en `GET /api/leads/:id/conversion` y `POST /api/leads/:id/convertir`); recepción nunca.
- **El maestro en sitio**, además: solo convierte a SUS alumnos (los prospectos con una clase muestra a la que asistieron en un grupo suyo; lo demás, 404), solo elige grupos de las sucursales donde da clases (404) y no puede mandar `permitir_fuera_de_edad` (403, solo el administrador). Su vista previa de la conversión solo cubre esos prospectos. **El cobro no cambia**: sigue siendo registro manual (H2).

## Hermanos, cross-sell y bienvenida de inscripción (F7)

- **Promoción por hermanos, sola.** `inscribirAlumno` cuenta los hermanos ya inscritos (`src/inscripciones/hermanos.ts`) y se los da al resolutor: un hermano es OTRO alumno de alguno de los tutores del alumno (`tutor_alumno`) con al menos una inscripción ACTIVA (una congelada o una baja no cuenta; la vertical y la sucursal no importan). Se cuentan **alumnos distintos, no vínculos**: una mamá y una abuela ligadas a los mismos niños no duplican nada. `min_hermanos {hermanos: n}` cuenta al que se inscribe (con 1 hermano inscrito ya llega a 2). El cotizador sigue aceptando `hermanos_inscritos` a mano (es una cotización hipotética; al inscribir manda el conteo real).
- **`GET /api/familias/un-solo-hijo?sin_vertical_id=&sucursal_id=&limite=&pagina=`** (`tutores:leer`: administrador, asesor, recepción; cada quien ve las familias de su alcance): la lista de cross-sell. Cada tutor con **un solo hijo inscrito** (un solo alumno distinto con inscripción activa) trae `alumno`, `verticales_inscritas` y `verticales_sin` (las verticales activas de la organización donde NO está, con `disponible_en_su_sucursal`: si alguna sucursal de su inscripción la ofrece). Mamá y abuela del mismo único hijo aparecen las dos (cada una con su único hijo). `sin_vertical_id` deja las familias que aún no están en esa vertical. Se arma en memoria sobre las familias con alguna inscripción activa (`src/familias/cross-sell.ts`); para una organización muy grande habría que llevarlo a SQL.
- **Bienvenida de inscripción.** Automatización del evento nuevo `inscripcion_creada` sobre el motor (entidad `inscripcion`). Al inscribir (por la API o por la conversión) se crea, en la MISMA transacción, una ejecución por automatización aplicable (`programarBienvenida`, `src/inscripciones/bienvenida.ts`), idempotente por `(automatizacion_id, entidad_tipo, entidad_id, ocurrencia)`; fuera de 09:00–20:00 de la sucursal se recorre al siguiente horario válido. El motor la manda **al tutor responsable de pago** (la conversación del lead cuyo teléfono es el suyo **en la vertical de la inscripción** —EF-02: un lead es único por vertical y cada vertical tiene su canal—; si no tiene, la del lead de origen, solo si también es de esa vertical; si ninguna lo es, no se manda y queda tarea para el asesor) por `MessagingProvider` con todas sus reglas (baja, ventana de servicio y plantilla aprobada, horario, frecuencia, atención humana). Antes de mandar revisa que la inscripción siga activa (`inscripcion_no_vigente`); sin conversación queda `omitido/sin_conversacion` y una tarea `automatizacion_omitida` para el asesor. Variables: `nombre_prospecto` (el alumno), `nombre_grupo`, `nombre_sucursal`, `fecha_inicio` («martes 10 de noviembre»); **nunca datos de salud**.
  La plantilla del seed (`bienvenida_inscripcion`, 709) es de clase `servicio` (aviso sobre algo ya acordado, no marketing): sale aunque una persona atienda la conversación (INV-6).

## Rutas

| Método y ruta | Permiso | Descripción |
|---|---|---|
| `POST /api/sesion` `{organizacion?, correo, contrasena}` | pública | Inicia sesión (201 + cookie). `organizacion` = slug; se puede omitir si solo hay una |
| `DELETE /api/sesion` | pública | Cierra la sesión (204; borra la cookie). Como toda escritura, exige el encabezado anti-CSRF (`Content-Type: application/json` o `X-Requested-With`): sin él, 403 |
| `GET /api/yo` | sesión | Usuario, organización, sucursales y permisos |
| `POST /api/yo/contrasena` `{actual, nueva}` | sesión | Cambia tu contraseña (exige la actual y pasa por el bloqueo de intentos); cierra tus demás sesiones |
| `GET /api/usuarios?rol=&activo=` | `usuarios:administrar` | Lista |
| `POST /api/usuarios` `{correo, nombre, rol, contrasena, sucursales?}` | `usuarios:administrar` | Alta (409 si el correo existe) |
| `PATCH /api/usuarios/:id` `{nombre?, rol?, activo?, contrasena?, sucursales?}` | `usuarios:administrar` | Cambia; cierra sesiones si desactiva, cambia el rol o la contraseña. `contrasena` solo sirve para restablecer la de OTRA persona (sin la actual); la propia se cambia con `POST /api/yo/contrasena` (400 si se intenta aquí). Desactivar suelta el agente de Chatwoot |
| `GET /api/grupos?programa_id=&sucursal_id=` | `grupos:leer` | Grupos con programa, salón, instructor y horarios (el maestro, solo los suyos) |
| `POST /api/grupos` `{programa_id, nombre, cupo_maximo, permite_lista_espera?, salon_id?, instructor_id?, horarios?, activo?}` | `catalogo:escribir` | Alta. Revisa choques (409 con detalle). Salón de la sucursal del programa; instructor que dé clases ahí |
| `PATCH /api/grupos/:id` `{nombre?, cupo_maximo?, permite_lista_espera?, salon_id?\|null, instructor_id?\|null, horarios?, activo?}` | `catalogo:escribir` | Cambia. `horarios` REEMPLAZA el conjunto (`[{dia_semana 0-6, hora_inicio_min, hora_fin_min}]`). Bajo candado: dos asignaciones simultáneas que chocan, gana una |
| `DELETE /api/grupos/:id` | `catalogo:escribir` | Baja lógica (también de sus horarios) |
| `GET /api/precios?programa_id=&sucursal_id=&vigente_en=AAAA-MM-DD` · `GET /api/precios/:id` | `catalogo:leer` | Precios (historial de un programa: `?programa_id=`, más reciente primero); importes como texto `"1234.50"`, fechas `AAAA-MM-DD`; por sucursal según el rol |
| `POST /api/precios` `{programa_id, costo_inscripcion, costo_mensualidad, moneda?, vigencia_desde}` | `catalogo:escribir` | Vigencia nueva, abierta: **cierra la anterior el día previo**, en una transacción. 409 si ya hay una que empiece ese día o después. Importes en TEXTO (un número JSON da 400) |
| `PATCH /api/precios/:id` `{costo_inscripcion?, costo_mensualidad?, vigencia_hasta?\|null}` · `DELETE /api/precios/:id` | `catalogo:escribir` | Corrige costos o cierra/reabre la vigencia (409 si pisaría a otra); baja lógica (deja un hueco sin precio) |
| `GET /api/promociones?activo=&vigente_en=&vertical_id=&sucursal_id=&programa_id=` · `GET /api/promociones/:id` | `catalogo:leer` | Promociones con alcance (`verticales`/`sucursales`/`programas`; vacío = todas) y `beneficios`; cada rol ve las que valen en su sucursal; mayor prioridad primero |
| `POST /api/promociones` `{nombre, codigo, vigencia_desde, vigencia_hasta?, condicion_tipo?, condicion_valor?, cupo_maximo?, acumulable?, prioridad?, activo?, verticales?, sucursales?, programas?, beneficios?}` | `catalogo:escribir` | Alta completa en una transacción. Código en MAYÚSCULAS, único entre las vivas (409). `condicion_valor`: `min_hermanos {hermanos}` (cuenta al que se inscribe), `pago_anticipado {meses}`; las demás, nulo |
| `PATCH /api/promociones/:id` · `DELETE /api/promociones/:id` | `catalogo:escribir` | Cambia (las listas de alcance REEMPLAZAN; el cupo no baja de lo usado: 409; `cupo_usado` no se edita) / baja lógica (409 con entregas pendientes) |
| `POST /api/promociones/:id/beneficios` `{tipo, modo, valor?, producto_id?, descripcion?, momento_disparo?}` · `PATCH`/`DELETE …/beneficios/:beneficio_id` | `catalogo:escribir` | Beneficios: `descuento_inscripcion`/`descuento_mensualidad` (modo `porcentaje` 0.01–100, `monto_fijo` > 0, o `total`), `producto_gratis` (modo `total`), `meses_gratis` (modo `total`, valor 1–24); `valor` como TEXTO |
| `GET /api/salones?sucursal_id=&activo=` · `GET /api/salones/:id` | `catalogo:leer` | Salones; cada rol ve los de su alcance (el maestro, los de donde da clases) |
| `POST /api/salones` `{sucursal_id, nombre, capacidad?, activo?}` · `PATCH /api/salones/:id` `{nombre?, capacidad?\|null, activo?}` · `DELETE /api/salones/:id` | `catalogo:escribir` | Alta, cambio y baja lógica (409 si un grupo vivo lo usa). Nombre único por sucursal |
| `GET /api/instructores?sucursal_id=&activo=` · `GET /api/instructores/:id` | `catalogo:leer` | Instructores con sus sucursales; el maestro solo se ve a sí mismo; asesor y recepción, los de sus sucursales y los sin restricción |
| `POST /api/instructores` `{nombre, telefono?, correo?, sucursales?, usuario_id?, activo?}` · `PATCH /api/instructores/:id` · `DELETE /api/instructores/:id` | `catalogo:escribir` | Teléfono normalizado (+521 → +52); `usuario_id` solo de un maestro y único; no se da de baja, desactiva ni se le quita la sucursal mientras da grupos (409) |
| `GET /api/cotizador?vertical_id=&sucursal_id=&edad=\|fecha_nacimiento=&fecha=&hermanos_inscritos=&meses_pagados=` | `cotizador:leer` (administrador y asesor) | Cotiza: programas de la edad con grupos, horarios, lugares, precio vigente y promociones (importes como texto; `alternativas: true` si hay más de un programa). `fecha` por omisión = hoy en la zona de la sucursal. La sucursal debe estar en tu alcance (404 si no). Sin escritura: no hay `POST` |
| `GET /api/leads/:id/cotizaciones?limite=&pagina=` | `leads:leer` | Cotizaciones del lead (la más reciente primero) con su `snapshot`; `estatus` ya refleja el vencimiento. 404 si el lead no es de tu alcance |
| `POST /api/leads/:id/cotizaciones` `{prospecto_id, programa_id, hermanos_inscritos?, meses_pagados?}` | `leads:escribir` | El asesor cotiza a mano: el servidor cotiza (cotizador determinista, hoy en la zona de la sucursal del programa) y guarda lo cotizado. No acepta precios ni descuentos del cliente. 409 si el programa no corresponde a la edad del prospecto; 400 si el prospecto no es del lead / no tiene edad / el programa es de otra vertical o sucursal. Reemplaza (vence) la vigente anterior de ese prospecto y programa; registra el cambio. Si `hermanos_inscritos` o `meses_pagados` son distintos de 0 (habilitan `min_hermanos` / `pago_anticipado`), el snapshot lleva `supuestos: {hermanos_inscritos, meses_pagados}` y el registro de cambios los guarda (EC-08) |
| `GET /api/campanas?activo=&origen=` · `GET /api/campanas/:id` | `catalogo:leer` | Campañas (fuente, vertical y sucursal opcionales) |
| `POST /api/campanas` `{nombre, origen, vertical_id?, sucursal_id?, anuncio_id?, fecha_inicio?, fecha_fin?, activo?}` · `PATCH`/`DELETE /api/campanas/:id` | `catalogo:escribir` | Alta, cambio y baja lógica (409 con códigos o leads) |
| `GET /api/codigos-rastreo?campana_id=&sucursal_id=&tipo=&activo=` | `catalogo:escribir` | Códigos con sus usos y tope |
| `POST /api/codigos-rastreo` `{campana_id, sucursal_id?, vertical_id?, codigo?, max_usos?, vigente_desde?, vigente_hasta?}` · `PATCH`/`DELETE /api/codigos-rastreo/:id` | `catalogo:escribir` | Crea (genera o valida el código; 409 si ya existe vivo), cambia `activo`/tope/vigencia (el tope no baja de los usos) y da de baja |
| `GET /api/campanas/:id/qr?sucursal_id=&formato=svg\|png\|url` | `campanas:qr` | QR imprimible de la campaña por sucursal (crea o reutiliza su código de rastreo) |
| `GET /api/lista-espera?grupo_id=&prospecto_id=&estatus=&limite=&pagina=` | `lista_espera:leer` (administrador, asesor, recepción) | La fila de espera por grupo y posición, con prospecto, contacto y teléfono. Sin `estatus` trae las vivas. Alcance por la sucursal del programa del grupo |
| `PATCH /api/lista-espera/:id` `{posicion}` | `lista_espera:escribir` (administrador, asesor) | Mueve a alguien que espera a otra posición (1..N); las demás se recorren. 400 fuera de rango; 409 si ya se le ofreció un lugar o ya no está en la fila; registra el cambio |
| `DELETE /api/lista-espera/:id` | `lista_espera:escribir` | Quita de la fila (`cancelado`, sin borrar nada); las demás se recorren. 409 si ya no estaba; registra el cambio |
| `GET /api/clases-muestra?lead_id=&prospecto_id=&grupo_id=&sucursal_id=&estatus=&desde=&hasta=` | `clases_muestra:leer` (administrador, asesor, maestro) | Clases muestra por fecha. Asesor: las de sus sucursales; maestro: las de SUS grupos, sin teléfono ni contacto de la familia. `desde`/`hasta` son instantes con zona |
| `GET /api/clases-muestra/sesiones?grupo_id=&maximo=&incluir_llenas=` | `clases_muestra:leer` | Próximas sesiones agendables del grupo con sus `lugares` (`fecha_hora`, `fecha`, `hora` en la zona de la sucursal). Sin `incluir_llenas` solo las que tienen lugar |
| `GET /api/clases-muestra/:id` | `clases_muestra:leer` | Una clase (404 fuera de alcance) |
| `POST /api/clases-muestra` `{prospecto_id, grupo_id, fecha_hora, notas?}` | `clases_muestra:escribir` (administrador, asesor) | Agenda. 400 si la fecha no es sesión del grupo / sin anticipación / fuera de horizonte / grupo de otra vertical; 404 si el prospecto o el grupo no son de tu alcance; **409** `sin lugares` o ya tiene una vigente en el grupo. Registra el cambio |
| `POST /api/clases-muestra/:id/reprogramar` `{fecha_hora, grupo_id?, notas?}` | `clases_muestra:escribir` | Cancela la vigente y agenda la nueva en una transacción (201 con la nueva). 409 si la clase ya no está agendada, es la misma sesión o no hay lugar (la anterior queda intacta) |
| `POST /api/clases-muestra/:id/cancelar` `{motivo?}` | `clases_muestra:escribir` | Cancela y libera el lugar. 409 si ya no estaba agendada |
| `PATCH /api/clases-muestra/:id/asistencia` `{estatus: "asistio"\|"no_asistio"}` | `clases_muestra:asistencia` (administrador, asesor, maestro de ese grupo) | Marca la asistencia (ver «Asistencia y recuperación»). 409 antes de la hora de la clase, en una clase cancelada o reagendada, fuera de la ventana de corrección o ante una marca simultánea distinta |
| `GET /api/clases-muestra/:id/registro` | `registro_muestra:leer` (administrador, asesor, maestro de ese grupo) | El registro de la clase muestra (o `sin_captura`), con lo que falta; la salud solo como banderas |
| `PATCH /api/clases-muestra/:id/registro` `{alumno?, tutores?, salud?, antecedentes?, observacion?}` | `registro_muestra:escribir` | Guarda parcial (borrador). `salud` solo con `salud:escribir` (403 con constancia si no). 400 validación, 409 cerrado / clase no vigente / asistencia rechazada |
| `POST /api/clases-muestra/:id/registro/completar` · `…/cerrar` | `registro_muestra:escribir` | `borrador → completo` (409 con `detalles` de lo que falta) · `completo → cerrado` (409 si falta algo del cierre) |
| `POST /api/clases-muestra/:id/registro/reabrir` | `registro_muestra:reabrir` (administrador) | `cerrado → completo` |
| `GET /api/documentos-legales/vigentes?vertical_id=` | `registro_muestra:leer` | Reglamento, uso de imagen y aviso de privacidad vigentes (con texto y huella) |
| `GET /api/documentos-legales?tipo=&vertical_id=` · `GET /api/documentos-legales/:id` | `catalogo:leer` | Historial de versiones (sin texto) · una versión con su texto |
| `POST /api/documentos-legales` `{tipo, vertical_id?, titulo, texto, vigente_desde?}` | `catalogo:escribir` | Publica la versión SIGUIENTE (inmutable). 409 si `vigente_desde` es anterior a la de la versión previa |
| `GET /api/clases-muestra/:id/registro/aceptaciones` | `registro_muestra:leer` | Estado por tipo («aceptó el reglamento v3 el …») e historial de respuestas del prospecto |
| `POST /api/clases-muestra/:id/registro/aceptaciones` `{documento_id, version, resultado, aceptante, canal, evidencia?}` | `registro_muestra:escribir` | Registra aceptación, rechazo o revocación (201; 200 si ya estaba igual). 409 si no es la versión vigente / no hay qué revocar |
| `GET /api/maestro/clases-muestra?desde=&hasta=&estatus=` | `clases_muestra:leer` | Las clases muestra «del día y próximas» de SUS grupos (el maestro; los demás roles, lo de su alcance): por omisión de hace 24 h a 14 días, agendadas / asistidas / no asistidas, por fecha. Sin teléfono ni contacto de la familia para el maestro |
| `GET /api/maestro/avisos?leidos=` | `avisos_maestro:leer` (maestro; el administrador solo ve los de su propio instructor, si lo es) | Los avisos del maestro (los suyos, más reciente primero) con `entrega` (estado del envío por WhatsApp), `motivo_entrega`, `leido_en`, la clase y `datos` |
| `PATCH /api/maestro/avisos/:id` `{visto: boolean}` | `avisos_maestro:escribir` | Marca visto (o lo desmarca). Idempotente; solo cambia y registra si cambia. 404 si es de otro maestro |
| `GET /api/tareas?estado=&tipo=` | `tareas:leer` | Tareas para el asesor |
| `PATCH /api/tareas/:id` `{estado: hecha\|descartada}` | `tareas:resolver` | Resuelve (409 si ya estaba resuelta) |
| `PATCH /api/leads/:id/etapa` `{etapa_id, motivo_perdida_id?, nota?, desde_etapa_id?}` | `leads:escribir` | Mueve de etapa con historial. 400 sin motivo de pérdida / sin nota al recuperar; 409 a inscrito, de inscrito sin ser administrador, par prohibido o lead que ya cambió |
| `GET /api/leads/:id/historial` | `leads:leer` | Cambios de etapa y tiempo en cada una (404 fuera de tu alcance) |
| `GET /api/leads/estancados?etapa_id=&sucursal_id=&limite=&pagina=` | `leads:leer` | Leads sin movimiento más allá del umbral de su etapa (consulta; no envía nada) |
| `GET /api/motivos-perdida?activo=` | `catalogo:leer` | Catálogo de motivos de pérdida |
| `POST /api/motivos-perdida` `{nombre, codigo?, orden?}` · `PATCH`/`DELETE /api/motivos-perdida/:id` | `catalogo:escribir` | Alta (409 si el código existe), cambio y baja lógica |
| `GET /api/leads?etapa_id=&sucursal_id=&telefono=` | `leads:leer` | Lista (el teléfono se normaliza) |
| `GET /api/leads/:id` | `leads:leer` | Detalle con prospectos |
| `GET /api/tutores?telefono=&nombre=&sucursal_id=` · `GET /api/tutores/:id` | `tutores:leer` (administrador, asesor, recepción) | Tutores con sus alumnos y banderas; `telefono` en cualquier formato; `nombre` busca cada palabra en nombre y apellidos |
| `POST /api/tutores` `{nombre, apellidos?, telefono, correo?, direccion?, como_nos_conocio?, sucursal_id?}` · `PATCH`/`DELETE /api/tutores/:id` | `tutores:escribir` | Alta (409 si el teléfono ya es de un tutor), cambio (409 si el nuevo teléfono ya es de otro) y baja lógica (409 con alumnos o con un lead convertido) |
| `GET /api/familias/un-solo-hijo?sin_vertical_id=&sucursal_id=` | `tutores:leer` | Lista de cross-sell: tutores con UN solo hijo inscrito y las verticales en las que sí y no están |
| `GET /api/alumnos?nombre=&telefono=&tutor_id=&estatus=&sucursal_id=` · `GET /api/alumnos/:id` | `alumnos:leer` (también el maestro, solo SUS alumnos) | Alumnos con sus tutores; `telefono` busca por el teléfono de algún adulto de la familia (no para el maestro); el detalle trae `edad` y `autoriza_uso_imagen` derivado |
| `POST /api/alumnos` `{nombre, apellidos, fecha_nacimiento, sexo?, sucursal_id?, escuela_nombre?, escuela_turno?, talla_uniforme?, practico_*?, motivo_clase?, tutores: [{tutor_id \| tutor: {…}, parentesco, es_responsable_pago?, es_contacto_urgencia?, puede_recoger?, lo_lleva?}]}` · `PATCH /api/alumnos/:id` | `alumnos:escribir` (administrador, asesor, recepción) | Alta con al menos un tutor (existente por `tutor_id` o nuevo/detectado por teléfono) en UNA transacción; cambio de datos (sin salud ni `estatus`) |
| `POST /api/alumnos/:id/tutores` · `PATCH`/`DELETE /api/alumnos/:id/tutores/:tutor_id` | `alumnos:escribir` | Segundo tutor, la abuela…: liga por `tutor_id` o `tutor` nuevo; cambia parentesco y banderas (409 si pediría un segundo responsable de pago); quita el vínculo (409 si es el único) |
| `GET /api/inscripciones?alumno_id=&grupo_id=&estatus=&tutor_id=&lead_id=` · `GET /api/inscripciones/:id` | `inscripciones:leer` (administrador, asesor, recepción; el maestro, las de sus grupos) | Inscripciones con precios congelados, descuentos, promociones aplicadas (entregadas y pendientes), día de corte y próximo corte. **El maestro** solo ve quién está inscrito, el grupo, el estatus y las fechas: sin importes, descuentos, promociones, día de corte, cotización ni lead (EF-03) |
| `POST /api/inscripciones` `{alumno_id, grupo_id, fecha_inicio?, dia_corte_pago?, meses_pagados_por_adelantado?, cotizacion_id?, permitir_fuera_de_edad?}` | `inscripciones:escribir` (administrador, asesor, recepción) | Inscribe (201). 404 alumno o grupo ajeno/inexistente/inactivo; 400 fecha, día de corte o cotización inválidos; 409 con `detalles: [{campo: "motivo", mensaje}]`: `sin_precio`, `reglamento`, `fuera_de_edad`, `grupo_lleno`, `ya_inscrito` |
| `GET /api/leads/:id/conversion` | `conversion:leer` (administrador, asesor; el maestro solo con `maestro_en_sitio`) | SOLO lo que FALTA por capturar para convertir al lead (nada de lo ya capturado); `ya_convertido` cuando no queda nada por hacer |
| `POST /api/leads/:id/convertir` `{tutor?, prospectos?: [{prospecto_id, alumno?, inscripcion?}]}` | `conversion:ejecutar` | Convierte el lead en tutor(es), alumno(s) e inscripción(es) en UNA transacción. 201 si creó algo, 200 si ya estaba convertido, 409 `faltan_datos` (con la lista) o el motivo de la inscripción |
| `POST /api/inscripciones/:id/cambiar-grupo {grupo_id}` · `…/congelar` · `…/reactivar` · `…/baja {motivo_baja_id}` | `inscripciones:escribir` | Cambio de grupo atómico (mismo programa), congelar, reactivar (necesita lugar) y baja con motivo; devuelven la inscripción y `lista_espera` (la tarea si se liberó un lugar). 409 con `detalles: [{campo: "motivo", mensaje}]`: `grupo_lleno`, `otro_programa`, `mismo_grupo`, `ya_inscrito`, `estatus_invalido`, `cambio_concurrente` |
| `GET /api/inscripciones/:id/movimientos` | `inscripciones:leer` | Historial de solo anexar de la inscripción |
| `GET /api/motivos-baja?activo=` · `POST /api/motivos-baja {nombre, codigo?, orden?}` · `PATCH`/`DELETE /api/motivos-baja/:id` | `catalogo:leer` / `catalogo:escribir` | Catálogo editable de motivos de baja |
| `POST /api/clases-muestra/:id/listo-para-cerrar` | `clases_muestra:listo_para_cerrar` (administrador, asesor, maestro de ese grupo) | Marca la clase «lista para cerrar»: lead a negociación, UNA tarea para el asesor, idempotente (201 la primera vez, 200 después). 409 `clase_no_asistida` / `ya_inscrito` |
| `GET /api/registro-cambios?entidad_tipo=&entidad_id=&usuario_id=` | `registro_cambios:leer` | Auditoría |

| `GET /api/salud/:sujeto_tipo/:sujeto_id?motivo=&campos=` | `salud:leer` | Ficha de salud de un menor (`prospecto` o `alumno`). `motivo` obligatorio. Se registra el acceso, y también todo intento denegado (sin permiso, sujeto inexistente o ajeno, maestro fuera de su grupo) |
| `PUT /api/salud/:sujeto_tipo/:sujeto_id` `{motivo, alergias?, condiciones_medicas?, medicamentos?, contacto_emergencia?, autorizacion_atencion_medica?}` | `salud:escribir` | Guarda (cifrado). `null` borra un campo |

| `GET /api/salud-accesos?sujeto_id=&usuario_id=&resultado=` | `registro_cambios:leer` | Quién vio (o intentó ver) la ficha de quién: usuario, sujeto, acción, resultado, causa de la denegación, campos (solo nombres), motivo, ruta. Nunca valores. Más reciente primero |
| `POST /api/usuarios/:id/vincular-chatwoot` `{agente_id?}` | `usuarios:administrar` | Enlaza al usuario con su agente de Chatwoot (por correo, o por `agente_id`). 409 si el agente ya es de otro usuario o Chatwoot no responde |
| `DELETE /api/usuarios/:id/vincular-chatwoot` | `usuarios:administrar` | Desenlaza al usuario de su agente (idempotente; no toca Chatwoot). Las conversaciones dejan de apuntar al usuario pero conservan el agente |
| `GET /api/conversaciones?asignada_a=yo\|nadie\|<usuario>&estado=` | `conversaciones:leer` | Qué asesor tiene cada conversación (alcance por sucursal del lead) |

**Chatwoot ↔ usuarios.** El agente de Chatwoot se enlaza con `usuario.chatwoot_agent_id` (único entre los vivos). Cuando llega el evento de asignación
(`conversation_updated` con `assignee_id`, A3) el backend guarda en la conversación el agente (`asignada_a_agente_chatwoot_id`) y el usuario que le
corresponde (`asignada_a_usuario_id`); si el agente se vincula después, las conversaciones ya asignadas se completan. Quitar al asesor en Chatwoot
borra la asignación (no devuelve el bot). El directorio de agentes (`DirectorioAgentes`) usa `CHATWOOT_ADMIN_TOKEN`; sin él, vincular responde 409.

## Roles de base de datos (producción)

Los disparadores que hacen «solo de anexar» a `registro_cambio`, `acceso_dato_sensible`, `documento_legal`, `aceptacion_legal`, `lead_etapa_historial` e `inscripcion_movimiento` protegen de un `UPDATE`, un `DELETE` y un `TRUNCATE`, pero **el dueño de la tabla puede quitarlos**
(`ALTER TABLE … DISABLE TRIGGER`). La garantía completa exige dos cuentas distintas (EB-08):

- **Migraciones** (`prisma migrate deploy`): una cuenta dueña de las tablas (p. ej. `inscripciones_migrador`), que solo corre en el despliegue.
- **Aplicación** (`DATABASE_URL` del backend): una cuenta que **no es dueña** de nada y solo tiene lo necesario:

```sql
CREATE ROLE inscripciones_app LOGIN PASSWORD '…';
GRANT USAGE ON SCHEMA public TO inscripciones_app;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO inscripciones_app;   -- sin DELETE: el borrado es lógico (invariante 3)
REVOKE UPDATE ON registro_cambio, acceso_dato_sensible, documento_legal, aceptacion_legal, lead_etapa_historial, inscripcion_movimiento FROM inscripciones_app;       -- solo de anexar
ALTER DEFAULT PRIVILEGES FOR ROLE inscripciones_migrador IN SCHEMA public GRANT SELECT, INSERT, UPDATE ON TABLES TO inscripciones_app;
-- Sin TRUNCATE, ALTER ni TRIGGER: no se otorgan. Las tablas de la demo local (docker compose) usan una sola cuenta, a propósito.
```

(El `docker-compose.yml` de la demo usa una sola cuenta dueña: es una demo. El despliegue a AWS, bloque K6, debe crear las dos.)

## Datos sensibles: clave y rotación

`CLAVE_DATOS_SENSIBLES` (32 bytes en base64) es obligatoria; sin ella el backend se niega a guardar o leer salud, salvo con `NODE_ENV=development` o `test` explícito (clave de desarrollo pública).
Cada texto cifrado lleva el identificador (`kid`) de su clave. **Rotar:** pon la clave nueva en `CLAVE_DATOS_SENSIBLES` y la anterior en `CLAVES_DATOS_SENSIBLES_ANTERIORES` (comas); lo viejo se sigue
leyendo y lo que se guarde a partir de entonces usa la nueva. No hay un trabajo que re-cifre en lote: un registro viejo se re-cifra cuando se vuelve a guardar; la clave anterior se quita del llavero
solo cuando ya no queda nada con su `kid`.

## Guía para agregar a la API

### Un recurso nuevo

1. Tabla en `prisma/schema.prisma` con las convenciones de siempre (`organizacion_id`, `eliminado_en`, FK compuestas) y su migración.
2. `src/api/rutas/<recurso>.ts` con una función `rutasDe<Recurso>(deps: DepsApi): Router`. Cada ruta:
   `router.get("/x", requierePermiso("x:leer"), async (req, res) => { const ctx = contextoDe(res); … })`.
   **No pongas `autenticar`**: `crearApiRouter` lo monta una sola vez antes de todas las rutas protegidas. **Denegar por omisión**: cada ruta DEBE declarar su acceso con
   `requierePermiso(…)` (o, si vale cualquier persona con sesión, `soloSesion()`); sin la declaración `contextoDe(res)` lanza y la ruta responde 500 sin tocar la base.
   Usa **`ctx.db`** (ya con el alcance de la organización); nunca abras otro. Las escrituras llevan `express.json({ limit: LIMITE_CUERPO_API })`.
   Agrega la ruta a la tabla `LAS_RUTAS` de `src/api/rutas.test.ts` (escrita a mano): el test recorre el router real de Express y falla si hay una ruta que no está ahí o que declara otro permiso.
3. Móntalo en `src/api/index.ts` con `api.use(rutasDe<Recurso>(deps))`, **antes** del 404 final.
4. Entradas con `parsear(esquema, req.body)` / `parsearQuery(esquema, req.query)` / `parsear(objeto({ id: uuid() }), req.params)`.
5. Listas con `esquemaPaginacion` + `leerPaginacion` + `paginar` y un `orderBy` estable.
6. Si hay sucursal: `filtroDeSucursal(await ctx.alcance())`; lo ajeno responde `noEncontrado()`.
7. Un test `*.itest.ts` con `levantarApi` + `sembrarUsuario` (ver `src/api/autorizacion.itest.ts`): por rol, alcance, no-fuga y concurrencia si cambia estado.

### Un permiso nuevo

Una fila en `MATRIZ_DE_PERMISOS` (`src/api/permisos.ts`) y la misma fila en el `ACORDADO` de `permisos.test.ts`
(el test obliga a decidirlo a la vista). Las rutas lo piden con `requierePermiso("recurso:acción")`; el tipo `Permiso` hace que un nombre inexistente no compile.

### Registrar un cambio

Dentro de la transacción de la escritura:

```ts
await ctx.db.$transaction(async (tx) => {
  // …el cambio…
  await registrarCambio(tx, ctx, { entidad: "mi_tabla", entidadId: id, accion: "actualizar", antes: filaAntes, despues: filaDespues });
});
```

La entidad debe estar en `CAMPOS_AUDITABLES` (`src/api/registro.ts`) con SOLO los campos de negocio que se pueden guardar; nunca contraseñas, tokens ni datos de salud
(un test lo verifica). `actualizar` guarda únicamente lo que cambió.

### Datos sensibles (salud de menores)

Alergias, condiciones médicas, medicamentos, contacto de emergencia y autorización de atención médica (decisión 12):

- **Una sola puerta**: `leerSensible()` / `guardarSensible()` de `src/sensibles/`. La tabla `ficha_salud` guarda cada campo CIFRADO (AES-256-GCM, ligado a su fila y campo; clave en `CLAVE_DATOS_SENSIBLES`). `check:capas` prohíbe nombrar la tabla fuera de `src/sensibles/`.
- **Quién**: `salud:leer` y `salud:escribir` son del administrador y del maestro; recepción y asesor no. El maestro, además, solo accede a sujetos de SUS grupos (`maestroDelSujeto`): un prospecto con clase muestra vigente o dada en un grupo suyo (D5); un alumno es de su maestro con una inscripción activa o congelada en un grupo suyo (F3).
- **Rastro**: cada lectura y escritura —y cada intento denegado— queda en `acceso_dato_sensible` (quién, a quién, qué campos, motivo, ruta), solo de anexar.
- **Nunca en logs, notas ni mensajes**: `log.*` redacta por clave y por valor `Sensible`; `npm run check:sensibles` falla si un campo de salud aparece en un log, un mensaje, una nota o una tarea, **o si se llama a `.revelar()` o a `leerSensible` fuera de `src/sensibles/` y `api/rutas/salud.ts`** (EB-06); `src/sensibles/fuga.itest.ts` ejecuta los flujos con valores centinela y falla si alguno aparece (en logs, mensajes o cualquier tabla en claro). **Residual:** la guarda es revisión de texto; no ve código nuevo dentro de esas dos rutas, un acceso armado a trozos ni un `import()` dinámico: cada flujo nuevo debe sumarse a `fuga.itest.ts` y pasar revisión.
- **Para sumar un flujo que toque datos de salud** (D5, F1): úsalo SOLO con `leerSensible`/`guardarSensible`, no pases los valores a logs ni textos, y agrega el flujo a `fuga.itest.ts`.
- **Para agregar un campo sensible**: una entrada en `src/sensibles/campos.ts` (y la columna en `ficha_salud` si va en la ficha).

## Clase de mensaje: servicio y marketing (INV-6, invariante 6)

`en_atencion_humana` **bloquea al bot y al marketing**. Con una persona atendiendo, el sistema no contesta, no manda texto libre automático, no manda notas internas y no manda
ninguna plantilla de marketing (reenganche, recuperación de quien no llegó, lead frío, promoción por vencer): motivo `atencion_humana`. **Sí salen los avisos de servicio** sobre algo
que la familia ya acordó (recordatorio de clase muestra, bienvenida de inscripción, recordatorio de pago).

**Cada plantilla lo DECLARA** en `plantilla_mensaje.clase_mensaje` (`servicio` | `marketing`): `NOT NULL`, sin valor por omisión, independiente de `categoria` (la de Meta). Una `servicio` no
puede ser de categoría `marketing` (CHECK `plantilla_mensaje_servicio_no_marketing_chk`). Lo ausente o raro se trata como marketing (lo conservador). Clasificación de las existentes (migración
`20261018000000_clase_mensaje` y seeds) `[SUPUESTO]`: `servicio` = `recordatorio_clase_muestra`, `bienvenida_inscripcion`, `aviso_maestro_*`; `marketing` = `reenganche_captacion`, `recuperacion_no_asistio`,
`reenganche_lead_frio`, `promocion_por_vencer` y cualquier código que no se reconozca.

**Dónde vive:** solo en `MessagingProvider` (`evaluarReglas` / `pasaConAtencionHumana` en `src/mensajeria/reglas.ts`); ninguna automatización pregunta por el estado (hay un test que lo impide). Un aviso de servicio
con una persona atendiendo sigue sujeto a plantilla aprobada, ventana de servicio, horario 09:00–20:00 de la sucursal, baja TOTAL, frecuencia diaria e idempotencia. La **baja de marketing** bloquea lo
que declara marketing (aunque su categoría Meta sea `utility`) y no los avisos de servicio; la baja total bloquea todo. **Tope de marketing (EG-05, decisión de Eduardo):** 1 cada 7 días por teléfono (configurable: `max_marketing_por_ventana` y `ventana_marketing_dias`) y se aplica por la **CLASE declarada** de la plantilla (`clase_mensaje = marketing`), no por la categoría de Meta: el reenganche, la recuperación de quien no llegó, el lead frío y la promoción por vencer (categoría `utility`, clase `marketing`) cuentan y se frenan igual que cualquier otro marketing; un aviso de servicio ni cuenta ni se frena. Consecuencia: con la configuración por omisión el segundo intento del reenganche o de la recuperación (a las 48–50 h) queda `omitido`/`tope_frecuencia`.

## Webhooks y landing: un dato inesperado nunca es un 500 (WH, regla 5 de Eduardo)

Aplica a `POST /webhooks/chatwoot`, `POST /webhooks/twilio/entrantes`, `POST /webhooks/twilio/estados`, `GET|POST /l/:vertical` y al barrido de reenvío del borde de Twilio. La firma sigue
mandando (401/403/429 sin firma válida, invariante 9); lo de abajo vale para lo **firmado correctamente** cuyo contenido es raro. Código: `src/webhooks/`.

**Clasificación (UNA función: `clasificarError`, `src/webhooks/clasificar.ts`, con pruebas).**

| Clase | Qué es | Respuesta | Constancia |
|---|---|---|---|
| **Transitoria** | falla de infraestructura o del momento: base caída o inalcanzable (P1001, P1002, P1008, P1017, ECONNREFUSED…), pool agotado (P2024), transacción (P2028), conflicto de escritura o interbloqueo (P2034, 40P01), fallo de serialización (40001), apagado de la base (57P01…), recursos o conexión (clases SQLSTATE 08, 53, 58, XX), contención que no cede tras los reintentos (`ErrorTransitorio`) | **503** (Chatwoot, Twilio, landing con `Retry-After`) y el proveedor reintenta | ninguna |
| **Dato inesperado** | todo lo demás: JSON roto o vacío, forma rara, tipos o rangos incorrectos, números enormes, texto con NUL, restricción o llave foránea por datos, registro borrado o inexistente, bandeja sin aprovisionar, un error propio | **2xx** (Chatwoot `{ok:true,resultado:"inesperado"}`; Twilio 200, TwiML en entrantes; landing 422 con el formulario y un mensaje general) | **sí** + tarea |

Ante la duda es un dato inesperado: queda constancia y una persona lo ve. Si la propia constancia no se puede guardar (la base no responde), vuelve a ser transitoria (503): nada se pierde en silencio.
**Cambios de contrato respecto a antes:** el JSON roto (400) y un `MessageSid` ausente (400) de Twilio responden ahora 200 con constancia; cualquier fallo del procesamiento que daba 500 da 200 (datos) o 503 (momento).

**Constancia:** tabla `evento_inesperado` (migración `20261018010000_evento_inesperado`): `origen` (`chatwoot` | `twilio_entrante` | `twilio_estado` | `landing` | `barrido_twilio`), `clave`,
`causa`, `detalle`, `forma`, `intentos`, `organizacion_id` (**nulo** si el evento no se pudo atar a ninguna organización: se escribe solo desde `src/datos/sistema.ts`), `lead_id`, `conversacion_id`, `tarea_id`.
**Idempotente por evento del proveedor:** único por `(organización, origen, clave)`; la clave es el identificador del proveedor (`chatwoot:<id>` / `twilio:<MessageSid>` para un mensaje, `msg:<id>` si no se pudo
leer, `<MessageSid>[:<estado>]` en Twilio) o, si no hay, el SHA-256 del cuerpo (`sha:…`). Un reintento solo suma `intentos`. **Nunca lleva el contenido del evento:** `forma` es su estructura (claves, tipos, largos; solo
unas palabras de control como `event` o `message_type` conservan su valor) y `detalle` el nombre y el código del error, sin los valores que cite su mensaje (Prisma cita la consulta entera). El log (`evento_inesperado`) lleva lo mismo.

**Tarea para el asesor:** tipo `evento_inesperado` (nuevo valor de `tipo_tarea_asesor`). Con la conversación conocida, **una pendiente por conversación** (varios eventos raros seguidos no llenan la bandeja) y
cuelga del lead; sin ella (un contacto nuevo cuyo primer mensaje falló, un `MessageSid` ausente, un envío de la landing) la tarea lleva `lead_id` **nulo** (`tarea_asesor.lead_id` ahora admite nulo) y,
como el alcance de un asesor se calcula por la sucursal del lead, solo la ve el administrador (`GET /api/tareas?tipo=evento_inesperado`). La descripción no lleva datos del evento (a lo más el número de conversación de Chatwoot).

**Twilio:** si el registro del evento falla por datos (p. ej. un `MessageSid` que la base no guarda), el mensaje se **reenvía igual a Chatwoot, sin registro** (`BordeTwilio.reenviarSinRegistro`) y se deja la
constancia: un dato raro no cuesta el mensaje de una familia. Si ese reenvío tampoco sale, 502 (Twilio reintenta). **Barrido de reenvío:** un evento que agota `MAX_INTENTOS_REENVIO` reintentos, o cuyos datos hacen
lanzar al barrido (una restricción de la base), queda `abandonado` con constancia (`barrido_twilio`, clave `evento_twilio:<id>`) y tarea; una falla del momento no lo abandona, se reintenta en el siguiente barrido.

**No cubierto** (documentado): un cuerpo mayor al límite de la ruta responde 413 antes de leerse (no se sabe de qué organización es); y el límite de peticiones (429) sigue siendo del proveedor.

## Asistencia: pase de lista (G1)

Código: `src/asistencia/` (`pase.ts` las reglas y el guardado, `alcance.ts`), `src/api/rutas/asistencia.ts`. Tabla `asistencia` (migración `20261019000000_asistencia`): `inscripcion_id`, `grupo_id` (el grupo en que
se tomó), `fecha` (el día de calendario LOCAL de la sucursal), `estatus` (`presente` | `falta` | `justificada`), `metodo` (`manual` | `qr`), `registrado_por_usuario_id`. **Una fila por (inscripción, fecha)**
entre las vivas (índice único parcial): el pase es idempotente.

| Método y ruta | Permiso | Qué |
|---|---|---|
| `GET /api/grupos/:id/pase?fecha=AAAA-MM-DD` | `asistencia:leer` (administrador, asesor, recepción, maestro) | La lista del pase con lo ya registrado: `{ grupo, fecha, hoy, es_sesion, sesiones[], puede_registrar, problema, pase_tomado, lista: [{ inscripcion_id, alumno_id, alumno, activa, estatus, metodo }] }` |
| `PUT /api/grupos/:id/pase` `{ fecha, asistencias: [{ inscripcion_id, estatus, metodo? }] }` | `asistencia:registrar` (administrador, recepción, maestro) | Guardado masivo, idempotente, TODO o nada: `{ creadas, actualizadas, sin_cambio, lista }` |

- **Alcance:** el maestro solo toma y ve el pase de SUS grupos (los de su instructor); asesor y recepción los de sus sucursales; el administrador todos. Lo ajeno (otro maestro, otra sucursal, otra organización) es 404. El asesor lee pero no registra (403).
- **La fecha** tiene que ser una sesión del `grupo_horario` en la zona de la sucursal y **haber empezado ya**: `no_es_sesion` (ese día no da clase) o `fecha_futura` → 409 con `detalles: [{ campo: "motivo", mensaje }]`. El borde es el instante exacto de inicio de la primera sesión del día. La hora que no existe un día de cambio de horario no es sesión.
- **La lista** son las inscripciones ACTIVAS del grupo que ya habían empezado esa fecha (`fecha_inicio <= fecha`), más las que ya tienen fila ese día (para poder corregir un pase aunque el alumno se haya dado de baja después; a esas no se les crea una fila nueva). Una congelada, una baja o una de otro grupo → 400 con `asistencias[i].inscripcion_id`; una repetida → 400. Nada se guarda si algo falla.
- **Idempotente y concurrente:** guardar lo mismo otra vez no cambia nada ni deja otro registro de cambios. El guardado toma un candado por (grupo, fecha): dos pases simultáneos se forman en fila, gana el último pase completo, sin duplicar filas (y sin 500) y el índice único de la base lo respalda.
- **Registro de cambios:** cada alta y cada corrección (`registro_cambio`, entidad `asistencia`: estatus, método, inscripción, grupo y fecha; nada identificable).
- `metodo: "qr"` solo queda registrado: la lectura del código del alumno en mostrador es de la interfaz (J2).

## Asistencia: derivados y tarea por faltas (G2)

Código: `src/asistencia/derivados.ts`. Los derivados se **calculan al registrar el pase** (solo de las inscripciones cuyo estatus cambió) y se pueden consultar:

| Método y ruta | Permiso | Qué |
|---|---|---|
| `GET /api/inscripciones/:id/asistencia?desde=&hasta=&limite=&pagina=` | `asistencia:leer` | `{ inscripcion_id, alumno_id, derivados, datos: [{ id, fecha, estatus, metodo, grupo_id }], paginacion }`, lo más reciente primero. Alcance de las inscripciones (el maestro, las de SUS grupos; lo ajeno 404) |
| `GET /api/grupos/:id/asistencia/derivados` | `asistencia:leer` | Los derivados de las inscripciones ACTIVAS del grupo: `{ grupo, hoy, umbral_de_faltas, datos: [{ inscripcion_id, alumno_id, alumno, …derivados }] }` |
| respuesta de `PUT /api/grupos/:id/pase` | | además `alertas: [{ inscripcion_id, racha_de_faltas, umbral, accion: "tarea_creada" | "tarea_resuelta" | null, tarea_id }]` (las que llegaron al umbral o tuvieron acción) |

`derivados`: `{ ventana: { desde, hasta }, porcentaje_30_dias, presentes, faltas, justificadas, racha_de_faltas, inicio_de_racha, umbral_de_faltas, en_riesgo }`.

- **% de asistencia (30 días):** `presentes / (presentes + faltas)` sobre las filas de `hoy − 29` a `hoy` (días locales de la sucursal), con un decimal. Las **justificadas no cuentan ni a favor ni en contra**. Sin presentes ni faltas en la ventana: `null` (no hay dato; no es 0 %).
- **Racha de faltas:** de la sesión más reciente hacia atrás, por **sesiones con pase tomado** (solo hay fila de las sesiones en que se pasó lista), no por días del calendario: una clase sin pase no suma ni rompe. `falta` suma, `presente` corta, `justificada` no suma ni corta. `inicio_de_racha` es la fecha de la primera falta de la racha.
- **Tarea para el asesor** (`tipo = faltas_consecutivas`, ligada a la inscripción y a su lead si lo hay): se crea al llegar la racha al umbral (`configuracion_organizacion.umbral_faltas_consecutivas`, **3 por omisión**, entre 1 y 30). **Una pendiente por inscripción** y **una por racha** (`referencia_fecha` = el inicio de la racha; índices únicos parciales): repetir el pase, o resolverla a mano mientras la racha sigue, no la vuelve a crear; una racha nueva (otro inicio) sí. Se **resuelve sola** (`hecha`) cuando la racha baja del umbral: el alumno vuelve a asistir o se corrige el pase. La ve el administrador, el asesor de la sucursal del grupo (`GET /api/tareas`) aunque la inscripción no tenga lead, y no el de otra sucursal. Cada inscripción se recalcula bajo un candado propio (`racha:<id>`): pases simultáneos de fechas distintas no crean dos.

## Progresión genérica (G3)

Los peldaños de cada vertical son **filas** (`nivel_progresion`: `vertical_id`, `nombre`, `orden`, `color_hex`, `horas_minimas`, `clases_minimas`, `requisitos_texto`); lo que cada alumno obtuvo, `alumno_progresion`
(`alumno_id`, `nivel_id`, `fecha_obtenido`, `evento_id`, `instructor_id`, `observaciones`). Cómo se llama el avance en una vertical (cinturón, nivel, grado…) vive en `vertical.etiqueta_progresion` y
`vertical.etiqueta_evento`; el código no nombra ninguno (invariante 2) y **nunca hay una columna `cinturon_id`**. Migración `20261020000000_progresion`; seed `[SUPUESTO]` en `prisma/seed/progresion.sql`
(siete, seis —los del contexto §7— y tres peldaños para las tres verticales de la demo). Código: `src/progresion/`.

| Método y ruta | Permiso | Qué |
|---|---|---|
| `GET /api/niveles?vertical_id=` | `catalogo:leer` | Los peldaños, del primero al último |
| `POST /api/niveles` `{ vertical_id, nombre, orden, color_hex?, horas_minimas?, clases_minimas?, requisitos_texto? }` | `catalogo:escribir` | 201; `orden` y `nombre` únicos entre los vivos de la vertical (409) |
| `PATCH /api/niveles/:id` · `DELETE /api/niveles/:id` | `catalogo:escribir` | Cambiar; baja lógica (409 `nivel_en_uso` si algún alumno lo tiene) |
| `GET /api/alumnos/:id/progresion` | `alumnos:leer` | Por vertical donde el alumno tiene o tuvo inscripción o peldaños: `{ vertical, nivel_actual, siguiente_nivel, historial, niveles }` |
| `POST /api/alumnos/:id/progresion` `{ nivel_id, fecha_obtenido, observaciones?, instructor_id? }` | `progresion:escribir` (administrador, maestro) | Registra un peldaño |
| `DELETE /api/alumnos/:id/progresion/:progresion_id` | `progresion:corregir` (administrador) | Baja lógica de un registro equivocado (409 si lo otorgó un evento) |

- **Nivel actual** = el más reciente que obtuvo en esa vertical (`fecha_obtenido` y, a igualdad, el último registrado), aunque se haya registrado después de uno posterior. **Siguiente** = el de `orden` inmediatamente mayor al actual; sin nivel, el primero; en el último, `null`. Cada vertical lleva su propia progresión.
- **Otorgar** exige: el nivel y el alumno existen (404); la vertical tiene `usa_progresion`; el alumno tiene una inscripción **activa o congelada** en ESA vertical; la fecha no es futura (en la zona de la sucursal de esa inscripción); no lo tenía ya; y la fecha es coherente con el orden de sus peldaños (EG-07: uno más bajo no puede tener fecha posterior a la de uno más alto, ni uno más alto anterior a la de uno más bajo; el mismo día vale). Rechazos → 409 con `detalles: [{ campo: "motivo", mensaje }]`: `vertical_sin_progresion`, `sin_inscripcion_en_la_vertical`, `fecha_futura`, `nivel_ya_obtenido`, `fecha_incoherente_con_el_orden`. Un solo registro por (alumno, nivel) entre los vivos (índice único parcial).
- **Alcance:** el de los alumnos; el maestro registra y lee solo a los de SUS grupos (queda como instructor del registro; el administrador puede indicar `instructor_id`); asesor y recepción leen pero no registran (403). `observaciones` (texto libre, puede mencionar salud) solo las ven el administrador y el maestro y **no entran al registro de cambios**.

## Eventos y elegibilidad (G4)

Tablas `evento` y `evento_alumno` (migración `20261020010000_eventos`). Un evento es de una vertical y una sucursal: `tipo` (texto corto que elige la escuela), `nombre`, `fecha` (día local), `cuota` (**dinero exacto**, texto con dos decimales),
`cupo`, `requiere_vestuario` y `otorga_progresion` (si aprobar sube de peldaño; un recital, no). Cómo le llama la escuela vive en `vertical.etiqueta_evento`. Código: `src/eventos/`, `src/progresion/elegibilidad.ts`.

| Método y ruta | Permiso | Qué |
|---|---|---|
| `GET /api/eventos?vertical_id=&sucursal_id=&desde=&hasta=` · `GET /api/eventos/:id` | `eventos:leer` (todos los roles) | Con `cupo`, `ocupados`, `disponibles`; el maestro no ve `cuota` |
| `POST /api/eventos` · `PATCH /api/eventos/:id` · `DELETE /api/eventos/:id` | `eventos:escribir` (administrador) | La sucursal debe ofrecer la vertical; bajar el cupo por debajo de los ocupados → 409 `cupo_menor_a_ocupados`; borrar con participantes → 409 |
| `GET /api/eventos/:id/elegibles` | `eventos:leer` | Los alumnos con inscripción ACTIVA en la vertical: `{ elegible, motivo, clases_cumplidas, clases_requeridas, faltan, nivel_actual, siguiente_nivel, convocado }` |
| `GET /api/eventos/:id/alumnos` | `eventos:leer` | Los participantes (el maestro, los suyos) |
| `POST /api/eventos/:id/alumnos` `{ alumno_ids }` | `eventos:participantes` (administrador, recepción, maestro) | Convoca: `{ convocados, ya_convocados, rechazados: [{ alumno_id, motivo, faltan? }], cupo }`. Si nadie quedó convocado ni estaba ya → 409 con el motivo de cada uno |
| `PATCH /api/eventos/:id/alumnos/:alumno_id` `{ estatus }` | `eventos:participantes` | Solo hacia adelante: `convocado` → `confirmado` → `pagado` → `asistio` (se pueden saltar pasos; repetir es idempotente; retroceder → 409 `transicion_invalida`; `asistio` antes de la fecha → 409 `evento_futuro`) |
| `DELETE /api/eventos/:id/alumnos/:alumno_id` | `eventos:participantes` | Quita su lugar (baja lógica); 409 `con_resultado` si ya tiene resultado |
| `POST /api/eventos/:id/alumnos/:alumno_id/resultado` `{ resultado: aprobado | no_aprobado, nivel_id?, observaciones? }` | `eventos:participantes` | Solo de quien `asistio`. Aprobar un evento que otorga progresión **crea el peldaño** (por omisión el siguiente; `nivel_id` debe ser de la vertical y superior al actual) en la MISMA transacción: si no se puede (último nivel, nivel ajeno, inferior), el resultado tampoco queda. Idempotente (200 `sin_cambio`); otro resultado → 409 `resultado_ya_registrado`; 201 al crearlo |

- **Elegibilidad** (`evaluarElegibilidad`, pura): un alumno es elegible a un evento que sube de peldaño si tiene inscripción **activa** en la vertical y sus asistencias `presente` EN ESA VERTICAL **estrictamente después** de la fecha en que obtuvo su nivel actual (la clase del examen no cuenta para el siguiente) alcanzan las `clases_minimas` del **siguiente** peldaño (inclusivo). Sin nivel actual cuentan todas y el siguiente es el primero (que no pide clases). En el último peldaño: `sin_siguiente_nivel`. Faltas y justificadas no cuentan. Las horas mínimas no se exigen todavía. Motivos: `sin_inscripcion_activa`, `sin_siguiente_nivel`, `clases_insuficientes`. **Solo los elegibles se convocan**; un evento que no sube de peldaño solo pide ser alumno vigente.
- **Cupo atómico y protegido en la base.** Ocupan lugar los participantes vivos (convocado, confirmado, pagado y asistió). El código toma la fila del evento (`bloquearEvento`), cuenta y luego inserta, todo en una transacción; y el disparador `evento_alumno_cupo` (**falla cerrado**, con `FOR UPDATE` sobre la fila del evento) rechaza cualquier alta, revivir una borrada o mover a otro evento que pase del cupo — también por SQL directo —; otro (`evento_cupo_menor_a_ocupados`) impide bajar el cupo por debajo de los ocupados. Una carrera real de doce convocatorias por cuatro lugares deja exactamente cuatro y las demás reciben un 409 limpio.
- **Un solo peldaño por (evento, alumno)** (índice único parcial) y CHECK: el resultado solo existe con `asistio`, y el peldaño otorgado solo con `aprobado`.
- **Alcance:** administrador todos; asesor y recepción los eventos de sus sucursales; el maestro los de las sucursales donde da clase y solo convoca, marca y califica a SUS alumnos (los ajenos son `alumno_inexistente`). Registro de cambios de `evento` y `evento_alumno` (la cuota como texto exacto).

## Expediente del alumno (G5)

`GET /api/alumnos/:id/expediente` (permiso `alumnos:leer`) devuelve en UNA respuesta todo lo de la sección 9 del contexto. Código: `src/expediente/` (`expediente.ts`, `proveedores.ts`), `src/api/rutas/expediente.ts`.

| Sección | Contenido |
|---|---|
| `alumno` | `id`, `nombre`, `apellidos`, `estatus` |
| `trayectoria` | `fecha_de_inicio` (la inscripción más antigua), `antiguedad: { dias, meses }` (meses COMPLETOS), `grupo_actual`, `inscripciones[]` (grupo, programa, vertical, sucursal, estatus), `historial_de_cambios_de_grupo[]`, `niveles[]` (por vertical: nivel actual y su `fecha_obtenido`, con la etiqueta de la vertical), `proximo_examen[]` (por vertical: el evento que sube de peldaño más cercano en las sucursales donde está inscrito, el estatus del alumno en él y su **elegibilidad** —`elegible`, `motivo`, `clases_cumplidas`, `clases_requeridas`, `faltan`, `siguiente_nivel`—) |
| `economico` | `mensualidad_vigente` (`total` y por inscripción activa: precio de lista − descuento, en centavos exactos, como texto), `dia_de_corte[]` (día y `proximo_corte`), `promocion_aplicada[]`, `beneficios_pendientes[]` (los de `promocion_aplicacion` pendientes de inscripciones no dadas de baja), `estado_de_cuenta` y `antiguedad_cartera_vencida` |
| `operativo` | `asistencia` (`porcentaje_30_dias`, `racha_de_faltas` —la mayor entre sus inscripciones activas—, `umbral_de_faltas`, `por_inscripcion[]` con los derivados de G2), `eventos[]` (los que participó, con su estatus, resultado y peldaño otorgado) y `productos_comprados` |
| `comercial` | `origen_del_lead[]` (`campana`, `canal` de WhatsApp, `fuente`, `anuncio_id`, `codigo_de_rastreo`, `utm`), `dias_para_cerrar[]` (del alta del lead a la primera inscripción), `hermanos_inscritos[]` (con las verticales donde están) y `motivo_de_baja[]` |
| `salud` | `{ incluida: false, endpoint: "/api/salud/alumno/:id" }` — **la salud NO va en el expediente** (decisión 12): se lee aparte con `GET /api/salud/alumno/:id` (permiso, motivo y registro de accesos) |

- **Por rol:** administrador, asesor y recepción ven las cuatro secciones (asesor y recepción solo de los alumnos de SUS sucursales); el **maestro solo ve a sus alumnos y SIN importes** (EF-03): `economico` y `comercial` vienen en `null` (el origen del lead y el motivo de baja tampoco son suyos). Lo ajeno (otra sucursal, otro maestro, otra organización) es 404.
- **Enchufes hacia la etapa H** (`src/expediente/proveedores.ts`, invariante 11): `ProveedorEconomico.estadoDeCuenta` (saldo, vencido y antigüedad de la cartera vencida) y `ProveedorProductos.productosComprados` (H5). Hoy responden la implementación NULA documentada: `{ disponible: false, motivo: "finanzas_pendiente" }` y `{ disponible: false, motivo: "productos_pendiente" }`. Para enchufarlos, `ApiDepsEntrada.expediente` recibe la implementación real y el expediente no cambia. Con `disponible: true`, `estado_de_cuenta` trae `saldo`, `vencido` y `antiguedadCarteraVencidaDias` (dinero como texto), y `antiguedad_cartera_vencida` los repite como `{ dias, vencido }`.
- Solo lee; no escribe nada ni registra accesos a salud. Todo el dinero sale como texto con dos decimales (`src/lib/dinero.ts`).

## Cargos (H1)

Código: `src/finanzas/` (`cargos.ts`, `alcance.ts`, `presentar.ts`, `barrido.ts`), `src/api/rutas/finanzas-cargos.ts`. **Todo el dinero sale y entra como TEXTO con dos decimales** (`"1234.50"`); un número JSON se rechaza (400). Las columnas son `Decimal(12,2)` y el código opera en centavos `bigint` (`src/lib/dinero.ts`).

| Ruta | Permiso | Qué hace |
|---|---|---|
| `GET /api/cargos?tutor_id=&alumno_id=&inscripcion_id=&concepto=&estatus=&periodo=&con_saldo=&vence_desde=&vence_hasta=&limite=&pagina=` | `cargos:leer` | Lista paginada (más antiguo primero). `estatus=vencido|pendiente` filtra por el estatus EFECTIVO. |
| `GET /api/cargos/:id` | `cargos:leer` | Un cargo. |
| `POST /api/cargos { alumno_id, descripcion, monto, descuento?, fecha_vencimiento, sucursal_id? }` | `cargos:escribir` | Cargo suelto de concepto `evento`, a nombre del responsable de pago. |
| `POST /api/cargos/:id/cancelar { motivo }` | `cargos:escribir` | Cancela (estatus, no borrado). 409 si tiene pagos (`tiene_pagos`: primero se cancela el pago), si ya está cancelado o ya está pagado. |

- Un cargo: `tutor_id` (responsable de pago), `alumno`, `inscripcion_id`, `sucursal_id`, `concepto` (`inscripcion | mensualidad | evento | producto`), `periodo` (`AAAA-MM`), `monto`, `descuento`, `monto_final`, `monto_pagado`, `saldo`, `fecha_vencimiento`, `estatus` (guardado) y `estatus_efectivo` (`vencido` se deriva de la fecha aunque el barrido no haya corrido), `dias_de_atraso`.
- **Quién ve:** administrador y recepción escriben; el **asesor lee**; el **maestro no ve importes** (403 en toda la API de finanzas). Asesor y recepción solo ven las sucursales del cargo que tienen asignadas (lo ajeno es 404).
- **Qué se genera solo.** Al inscribir (F3), en la misma transacción: el cargo de **inscripción** y la **primera mensualidad** (mes en que empieza el alumno), con los descuentos de las promociones inmediatas ya congelados; los **meses gratis** dejan en cero las primeras n mensualidades; los **meses pagados por adelantado** generan esas mensualidades, todas con vencimiento el día de la inscripción. Sin tutor al que cobrarle no se inscribe (409 `sin_responsable_de_pago`, ANTES de escribir nada). Cada mes, el **barrido de finanzas** (`src/finanzas/barrido.ts`, dentro del ciclo de cada minuto, a lo más cada 10 min) genera la mensualidad del mes en curso (calendario local de la sucursal) de las inscripciones **activas** (ni congeladas ni dadas de baja), con el precio y el descuento congelados en la inscripción, y materializa como `vencido` los pendientes vencidos. El vencimiento es el día de corte de la inscripción con la regla del fin de mes (el 31 cae el 30 de abril y el 28 de febrero).
- **Idempotencia en la base:** único parcial por (inscripción, periodo) para la mensualidad y por inscripción para el cargo de inscripción; dos barridos en paralelo no duplican, y un cargo cancelado a propósito no se regenera.
- **Defensas en la base (regla de Eduardo):** CHECK de importes (`monto_final = monto − descuento`, `0 ≤ monto_pagado ≤ monto_final`), de coherencia con el saldo (pagado ⇔ `monto_pagado = monto_final`; cancelado solo sin pagos), disparador que impide editar el dinero, el responsable o el vencimiento de un cargo y que lo reabre una vez cancelado, y que impide borrarlo físicamente.

## Pagos (H2)

Código: `src/finanzas/` (`pagos.ts`, `distribucion.ts`, `despues-del-pago.ts`), `src/api/rutas/finanzas-pagos.ts`. **Registro manual** (decisión 10): sin pasarela.

| Ruta | Permiso | Qué hace |
|---|---|---|
| `GET /api/pagos/propuesta?tutor_id=&monto=` | `pagos:registrar` | Cómo se repartiría un pago (más antiguo primero) sin registrarlo: `ok`, `adeudado`, `aplicaciones[]`, `excedente`. |
| `POST /api/pagos { tutor_id, monto, metodo, referencia?, fecha?, clave_idempotencia?, aplicaciones?: [{ cargo_id, monto }] }` | `pagos:registrar` | Registra y reparte. `metodo`: `efectivo | tarjeta | transferencia`. 201 (o 200 con `repetido: true` si la clave ya existía). |
| `GET /api/pagos?tutor_id=&estatus=&desde=&hasta=` · `GET /api/pagos/:id` | `pagos:leer` | Pagos con sus aplicaciones. |
| `POST /api/pagos/:id/cancelar { motivo }` | `pagos:cancelar` | Cancela SIN borrar: el pago pasa a `cancelado`, sus aplicaciones a `revertida` y los cargos recalculan su saldo. |

- **Reparto.** Un pago es de la FAMILIA (tutor) y se reparte entre varios cargos de varios hijos. Sin `aplicaciones` el sistema propone el orden: el cargo que **venció primero** se paga primero (luego el creado antes, luego por id). Con `aplicaciones`, recepción ajusta el reparto, que debe sumar EXACTAMENTE el pago, ser de la familia y no pasar del saldo de cada cargo. **Pago parcial:** el último cargo alcanzado queda pendiente con saldo.
- **Excedente (decisión conservadora):** un pago mayor a lo adeudado se **rechaza** (409 `excedente_sin_cargo`, con `excedente` y `adeudado`); no existe «saldo a favor». Quien cobra registra lo adeudado y da el cambio. La base lo exige también (un pago aplicado cubre exactamente su monto, al confirmar la transacción).
- **Idempotencia:** `clave_idempotencia` (8–120 caracteres `A-Za-z0-9._:-`) o el encabezado `Idempotency-Key`, única por organización. Un reintento del mismo POST devuelve el mismo pago (`repetido: true`); la misma clave con otro monto, método o familia es 409 `clave_reutilizada`.
- **Rechazos:** `excedente_sin_cargo`, `reparto_invalido`, `saldo_cambio` (la base paró un sobrepago porque otro movió el saldo), `clave_reutilizada`, `ya_cancelado` (409); monto no positivo o con más de dos decimales, fecha futura (400); familia ajena (404).
- **Protección en la base, en la misma transacción:** el código toma el candado de la familia (un UPDATE de la fila del tutor) y lee los saldos con él; pero la garantía NO depende de eso. Cada aplicación suma en `cargo.monto_pagado` y en `pago.monto_aplicado` con un UPDATE atómico por disparador, y los CHECK de la base fallan cerrado (`cargo_importes_check`, `pago_importes_check`): 20 pagos simultáneos al mismo cargo, aun por SQL directo y sin candado, dejan pasar solo lo que cabe. `pago_aplicacion` es de solo anexar (salvo `aplicada → revertida`), un pago nunca se borra ni se edita, y un cargo y un pago deben ser de la misma familia.

## Estado de cuenta por familia (H3)

`GET /api/tutores/:id/estado-cuenta` (permiso `estado_cuenta:leer`: administrador, asesor y recepción; el maestro 403; la familia de otra sucursal u organización, 404). Solo lee. Código: `src/finanzas/estado-cuenta.ts`, `src/api/rutas/finanzas-cuenta.ts`.

- `resumen`: `total_cargado`, `total_pagado` (lo aplicado), `saldo` (Σ cargos − Σ aplicaciones vivas), `vencido` y `antiguedad`.
- `hijos[]`: por hijo, sus `cargos[]` (más antiguo primero, con `saldo`, `estatus_efectivo` y `dias_de_atraso`) y sus propios `total_cargado`, `total_pagado`, `saldo`, `vencido` y `antiguedad`.
- `pagos[]`: los últimos 100 pagos de la familia con sus aplicaciones.
- **Antigüedad de lo vencido** (días de atraso = hoy − vencimiento, en el calendario de la sucursal del cargo): `de_0_a_30` (1 a 30 días), `de_31_a_60`, `de_61_a_90` y `mas_de_90` (91 o más). Cada renglón suma el SALDO de sus cargos (un cargo a medio pagar cuenta por lo que falta). Los cargos cancelados se listan pero no cuentan; lo que aún no vence no entra a `vencido`.
- **Expediente (G5):** `ProveedorEconomicoDeFinanzas` implementa `ProveedorEconomico` y `src/server.ts` lo enchufa: `economico.estado_de_cuenta` trae `saldo`, `vencido` y `antiguedadCarteraVencidaDias` (el cargo vencido más viejo) reales. El maestro sigue sin ver importes.

## Beneficios diferidos (H4)

Código: `src/finanzas/beneficios.ts`, `entrega.ts`, `despues-del-pago.ts`; `src/api/rutas/finanzas-beneficios.ts`.

| Ruta | Permiso | Qué hace |
|---|---|---|
| `GET /api/beneficios/por-entregar?sucursal_id=` | `beneficios:leer` (administrador, asesor, recepción) | La lista de recepción: beneficios `liberado` de inscripciones no dadas de baja, con alumno (y su talla), responsable de pago y tipo. |
| `POST /api/beneficios/:id/entregar { producto_id?, cantidad?: 1 }` | `beneficios:entregar` (administrador, recepción) | Lo marca `entregado`. Un beneficio de producto es UNA pieza (`cantidad` mayor que 1 es 400, EH-06). Un beneficio de producto crea la venta promocional de precio 0 y descuenta el stock (H5). |

- **Ciclo:** `pendiente` (al inscribir) → `liberado` (en la MISMA transacción del pago que SALDA la primera mensualidad) → `entregado`. La «primera mensualidad» es la no cancelada de menor periodo que tiene importe; un pago parcial o el pago de la inscripción no liberan. **Una inscripción dada de baja no libera nada.** Liberar es idempotente (UPDATE condicionado a `pendiente`).
- **Cancelar el pago** que cumplía la condición: lo liberado y no entregado regresa a `pendiente`; lo ya entregado se marca `revision_en` y deja una tarea `beneficio_en_revision` (una pendiente por inscripción) para el asesor.
- **En la base:** el disparador `promocion_aplicacion_transicion` exige, para liberar, un pago aplicado, la primera mensualidad pagada y una inscripción que no esté de baja; sólo permite `liberado → entregado | pendiente`. (La entrega administrativa `pendiente → entregado` de antes de H4 se conserva en la base; la API nunca la usa.)

## Productos y ventas (H5)

Código: `src/finanzas/productos.ts`, `src/api/rutas/finanzas-productos.ts`. Dinero siempre como texto con dos decimales.

| Ruta | Permiso | Qué hace |
|---|---|---|
| `GET /api/productos?vertical_id=&activo=&con_stock=` · `GET /api/productos/:id` | `productos:leer` (administrador, asesor, recepción) | Catálogo. El maestro no ve precios (403). |
| `POST /api/productos { vertical_id, nombre, talla?, precio, stock? }` · `PATCH` · `DELETE` | `productos:escribir` (administrador) | Alta, cambio (el precio nuevo rige para ventas futuras) y baja lógica. |
| `POST /api/productos/:id/ajuste-stock { delta, motivo }` | `productos:stock` (administrador, recepción) | Ajuste ATÓMICO de inventario; uno que lo dejaría bajo cero es 409 `stock_insuficiente_para_ajuste` y no se aplica. |
| `GET /api/ventas?alumno_id=&tutor_id=&producto_id=&estatus=` · `GET /api/ventas/:id` | `ventas:leer` | Ventas con su cargo. Alcance por sucursal. |
| `POST /api/ventas { alumno_id, producto_id, cantidad, tutor_id?, sucursal_id? }` | `ventas:registrar` (administrador, recepción) | Vende: congela el precio, descuenta el stock y genera el cargo de concepto `producto` (vence el día de la venta) a nombre del responsable de pago. |
| `POST /api/ventas/:id/anular { motivo }` | `ventas:anular` | Cancela su cargo y devuelve las piezas. 409 `cargo_con_pagos` si ya hay pagos (primero se cancela el pago); la venta promocional (entrega de un beneficio) no se anula. |

- **Stock en la base:** el INSERT de la venta descuenta el stock por disparador y el CHECK `stock >= 0` falla cerrado: dos ventas por la última pieza, gana una (la otra, 409 `sin_stock`); anular devuelve las piezas por disparador; al confirmar, la base exige que toda venta registrada tenga su cargo vivo de cantidad × precio (y que una anulada o promocional no lo tenga).
- **El cargo de una venta** no se cancela suelto (409 `de_venta`): se anula la venta.
- **Entrega de beneficios de producto (H4):** `POST /api/beneficios/:id/entregar { producto_id?, cantidad?: 1 }` crea la venta promocional de precio 0 (descuenta el stock, sin cargo, ligada a su beneficio) y lo marca `entregado` en una sola transacción. El producto sale del beneficio (`promocion_beneficio.producto_id`, ahora con llave foránea) o, si éste solo dice «Uniforme», del que elija recepción (una talla). Rechazos: 409 `requiere_producto`, `sin_stock`, `no_liberado`, `ya_entregado`; 400 si el producto es de otra vertical o distinto del que fija el beneficio. 8 entregas simultáneas del mismo beneficio entregan una vez.
- **Expediente (G5):** `ProveedorProductosDeFinanzas` (enchufado en `server.ts`) lista en `operativo.productos_comprados` las ventas no anuladas del alumno, con las promocionales.

## Cobranza: recordatorios de pago y tarea por deuda (H6)

Código: `src/cobranza/` (`plan.ts`, `programar.ts`, `revalidar.ts`, `cargar.ts`, `ejecuciones.ts`, `tareas.ts`), el motor (`src/automatizaciones/motor.ts`) y el barrido de finanzas. **No hay rutas nuevas:** se configura con automatizaciones.

- **Dos eventos del motor** (la entidad es el `cargo`): `cargo_por_vencer` (`offset_minutos` NEGATIVO, medido desde el inicio del día de vencimiento en el calendario de la sucursal que cobra: `-4320` = 3 días antes; sale a lo más hasta el final del día de vencimiento) y `cargo_vencido` (`offset_minutos` desde el inicio del día siguiente al vencimiento: `1440` = un día después; `max_intentos` es el tope y `espaciado_minutos`, 7 días por omisión, separa un intento del anterior, que además tiene que haber salido). `condiciones.max_atraso_dias` (60 por omisión) = no se persigue deuda más vieja (esa la ve el asesor).
- **Plantilla de SERVICIO** (`clase_mensaje = servicio`, INV-6; seed `[SUPUESTO]` 710/711 y automatizaciones 808/809): sale aunque una persona atienda la conversación. Variables que entiende el motor para un cargo: `nombre_prospecto` (nombre de pila del alumno), `concepto_cargo` («Mensualidad de noviembre de 2026»), `monto_pendiente` (lo que FALTA de ese cargo, `$1,000.00`), `fecha_vencimiento` y `nombre_sucursal`. Nunca datos de salud.
- **Todas las reglas de `MessagingProvider`:** horario 09:00–20:00 de la sucursal (lo programado fuera de rango se recorre al siguiente horario válido y, además, las automatizaciones solo corren los `dias_permitidos`; «por vencer» que no alcanza antes del final del día de vencimiento se descarta y se registra), baja total, ventana de servicio con plantilla aprobada, tope de 3 automáticos al día (configurable) y atención humana según la clase declarada de la plantilla.
- **Idempotente** por `(automatización, cargo, ocurrencia)` en la base (invariante 8): seis motores a la vez mandan un solo mensaje.
- **Se cancelan** (estatus `cancelado`, motivo `cargo_saldado` / `cargo_cancelado` / `inscripcion_baja`) al saldarse el cargo, cancelarse el cargo o la venta, o darse de baja la inscripción, EN LA MISMA transacción; además el motor revalida antes de enviar. Queda una ventana de milisegundos entre esa revalidación y el envío.
- **Sin conversación de WhatsApp** de la familia en el canal de esa vertical: la ejecución se omite (`sin_conversacion`) y queda una tarea `cobranza_sin_canal` (una pendiente por cargo) que ve el asesor de la sucursal.
- **Tarea por deuda** (`deuda_vencida`): cuando una familia lleva `configuracion_organizacion.umbral_dias_deuda` días (15 por omisión) de atraso, el barrido de finanzas deja UNA tarea para el asesor, ligada a su cargo vencido más antiguo; se resuelve sola al saldarse, y si una persona la resuelve a mano no se vuelve a crear (una por cargo, en toda su vida).

## Cuadratura del dinero (H7)

Código: `src/finanzas/cuadratura.ts` (reglas puras `calcularCuadratura` + `cuadratura(db)`), comando `npm run cuadratura` (`scripts/cuadratura.ts`). **Solo lee.**

```
npm run cuadratura                                  # todas las organizaciones de DATABASE_URL
npm run cuadratura -- --organizacion <id|nombre>    # una
npm run cuadratura -- --json
```

Sale con código 0 si todo cuadra y 1 si hay una sola discrepancia (`✓ cuadra` / `✗ NO CUADRA` y una línea por discrepancia). Las reglas, siempre en centavos exactos:

1. `pagos_aplicados_igual_aplicaciones`: Σ pagos aplicados = Σ aplicaciones vivas; por pago, `monto_aplicado` = Σ de sus aplicaciones vivas, un pago aplicado cubre exactamente su monto y uno cancelado no tiene aplicaciones vivas.
2. `saldo_de_cada_cargo`: `monto_pagado` = Σ de las aplicaciones vivas del cargo; ningún cargo sobrepagado.
3. `estatus_coherente_con_el_saldo`: pagado ⇔ saldo 0; pendiente/vencido ⇔ saldo > 0; cancelado ⇒ sin pagos.
4. `aplicacion_de_la_misma_familia`: el pago y el cargo de cada aplicación son del mismo tutor.
5. `estado_de_cuenta_cuadra`: Σ cargos (no cancelados) − Σ aplicaciones vivas = Σ de los saldos por familia.
6. `ventas_y_cargos`: toda venta normal registrada tiene un solo cargo vivo de cantidad × precio; una anulada o promocional, ninguno.
7. `stock_no_negativo`.

La base impide casi todo esto (CHECK y disparadores de H1 a H5); la cuadratura es el segundo par de ojos y lo que se corre tras cada paso de las pruebas de propiedad (`src/finanzas/cuadratura.itest.ts`: secuencias aleatorias deterministas con semilla, más una carrera de 30 pagos a la misma familia) y al terminar los datos de demo (I4).

## Reporte de clases muestra (I1)

`GET /api/reportes/clases-muestra?desde=&hasta=&vertical_id=&sucursal_id=` (permiso `reportes:clases_muestra`: administrador y asesor; el asesor solo ve lo de SUS sucursales; recepción y maestro 403). Código: `src/reportes/clases-muestra.ts`, `src/reportes/fuente.ts`, `src/api/rutas/reportes-clases-muestra.ts`. También por comando: `npm run reporte:clases-muestra -- --desde 2026-09-01 --hasta 2026-09-30 [--organizacion …] [--json]`.

Devuelve `total`, `por_fuente`, `por_vertical` y `por_sucursal`; cada fila trae `agendadas`, `asistidas`, `no_asistidas`, `canceladas`, `pendientes`, `inscritas` y `conversion`.

- **Rango:** `desde` y `hasta` (inclusivos) son sobre el DÍA LOCAL de la clase en la zona de la sucursal de su grupo (una clase a las 20:00 locales del 31 es del 31, aunque sean las 02:00 UTC del 1.º). Sin rango, todo.
- **Agendadas** = todas menos las `reagendada` (la clase nueva ocupa su lugar y sí cuenta): agendadas + asistidas + no asistidas + canceladas. **Pendientes** = las que siguen `agendada` (aún sin marcar).
- **Inscritas** = de las asistidas, las de un prospecto que hoy tiene una inscripción (cualquier estatus). **Conversión** = inscritas / asistidas, porcentaje con UN decimal en texto (`"71.4"`), calculado con enteros; `null` (la pantalla muestra «—») si no hubo asistidas: nunca una división por cero.
- **Fuente** (`fuenteDe`): el origen de la campaña del lead (`facebook`, `instagram`, `tiktok`, `google`, `referido`, `presencial` —el QR en sucursal—, `otro`); si no hay campaña, `landing` (entró por el formulario), `codigo` (código de rastreo suelto) o `anuncio` (Click-to-WhatsApp); si no, `directo`.
