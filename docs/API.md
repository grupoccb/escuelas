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
bajo cero; `al_pagar_primera_mensualidad` deja PENDIENTES los beneficios «al cumplir la condición» (el uniforme gratis). `consumirCupo(db, promocionId)` toma un lugar con un UPDATE atómico condicional (gana uno; la base además impide pasarse del tope).
`producto_id` de un beneficio es un uuid SIN llave foránea hasta que llegue `producto` (H5), e `inscripcion_id` de `promocion_aplicacion` igual hasta F3; `descripcion` dice qué se entrega.

**Cotizador (C5).** `src/cotizador/`: `cotizar(catalogo, entrada)` es PURA y determinista; `cargarCatalogoCotizable(db, {verticalId, sucursalIds?, fecha, fuente?})` la alimenta desde la base. Entrada: edad declarada **o** fecha de nacimiento,
vertical, sucursal y la fecha de la consulta (calendario local; reloj inyectable). Salida: los programas de esa vertical y sucursal cuyo rango `edad_min…edad_max` (inclusivos) cubre la edad y, de cada uno, sus grupos **activos con horario** (los de más lugares primero; días y horas en español por `formatearHorarios`, `src/lib/horario.ts`),
los lugares reales (`calcularCupo` con la `FuenteOcupacion`; lleno = `lista_de_espera` si el grupo la permite o `sin_lugar`), el precio vigente en la fecha (`null` = «sin precio»: no se inventa y no se calculan promociones) y las promociones aplicables con su desglose (resolutor de C3). Más de un programa para la misma edad
(programas `permite_traslape`) son alternativas. **Edad:** con fecha de nacimiento y `programa.fecha_corte_edad`, años cumplidos **a esa fecha** (no a hoy; quien nace después del corte aún no es elegible); con fecha de nacimiento y sin corte, a la fecha de la consulta; con solo la edad declarada («como 6») se usa tal cual
(`edadCumplida`, `src/lib/edad.ts`: el 29 de febrero se cumple el 1 de marzo en años no bisiestos). **Ocupación:** `FuenteOcupacion` (`src/catalogo/cupo.ts`) se inyecta en `DepsApi.fuenteOcupacion` (`ApiDepsEntrada.fuenteOcupacion`); hoy `SinInscripciones` y F4 pone la que cuenta las inscripciones activas.

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
(de ahí sale su horario de envío); al cancelar la única clase vigente del lead vuelve a `contactado`. `notas` es texto libre **sin datos de salud** y no se guarda en el registro de cambios. Código: `src/clases-muestra/` (`sesiones.ts` puro, `agenda.ts`), `src/embudo/etapas.ts`.
**Del bot** (vertical con `cotizador_whatsapp_activo` **y** `clase_muestra_whatsapp_activo`): después de elegir horario con lugar el bot propone las próximas fechas con lugar de ese grupo (lista numerada, máx. 5, con lugares; se guardan en `conversacion.muestra_ofrecida` para que el número apunte a lo que vio), agenda con la elección y confirma; si la fecha se llenó mientras contestaba, manda las que quedan;
«asesor» siempre pasa a una persona. **El bot NO pasa la conversación a una persona al agendar** (con `en_atencion_humana` ningún recordatorio saldría: invariante 6): deja una nota interna a los asesores y hace visible la conversación; un «gracias» después no la pasa, cualquier otra cosa sí.

**Aviso al maestro (D2, decisión 13: «plantilla por MessagingProvider y lista en la aplicación»).** Al agendar, reprogramar o cancelar una clase muestra se crea, en la misma transacción, un `aviso_maestro` para el instructor del grupo (`tipo` `agendada` | `reprogramada` | `cancelada`;
`datos` = alumno, grupo, sucursal, fecha y hora ya en la hora de la sucursal, y la fecha anterior si se movió; **nunca datos de salud**). Uno por (clase, tipo): un reintento no duplica (índice único). Si la clase cambia de instructor al reprogramar, el nuevo recibe «reprogramada» y el anterior «cancelada».
Es a la vez **la lista de la aplicación** (`GET /api/maestro/avisos`, `leido_en`) y **la unidad de envío por WhatsApp**: el barrido del minuto (`barrerAvisosMaestro`, en `correrCiclo`) lo manda con `MessagingProvider.avisarAInstructor`, que aplica las MISMAS reglas que a un contacto (`evaluarReglas`): baja del teléfono (→ `bloqueado`/`opt_out`), ventana de servicio de 24 h
(dentro, mensaje libre; fuera, SOLO la plantilla aprobada `aviso_maestro_<tipo>`; sin plantilla apta → `bloqueado` y una tarea `aviso_maestro_no_enviado` para el asesor), horario 09:00–20:00 de la sucursal del grupo (fuera de rango se recorre al siguiente horario válido; si con eso llegaría a la hora de la clase **o después** se descarta con `evento_pasado`),
frecuencia (el tope de automáticos por día de la organización, por teléfono) y **no** `en_atencion_humana` (no hay una persona atendiendo al instructor). Estado de entrega en `aviso_maestro.entrega`: `sin_telefono` (solo la lista de la aplicación y una tarea) · `pendiente` · `enviando` · `enviado` · `bloqueado` · `descartado` · `fallido`.
Un envío fallido no se reintenta solo; uno incierto (tiempo agotado, proceso muerto a media operación) **nunca se reenvía** y deja tarea. Si la clase se cancela antes de avisar, el «agendada» pendiente se descarta y el «cancelada» no se manda por WhatsApp (`nunca_se_aviso`), pero ambos quedan en la lista.
**El destinatario no es un lead:** el instructor tiene su propia conversación de WhatsApp (`conversacion_instructor`, ligada a la bandeja de la vertical del grupo), que se abre con la primera plantilla (`TransporteConversaciones.iniciarConversacion`: crea el contacto y la conversación en Chatwoot con el token de agente `CHATWOOT_ADMIN_TOKEN`; sin él, el aviso queda solo en la aplicación y con tarea)
y que registra cuándo responde. Un mensaje que llega por esa conversación (o de un teléfono de instructor activo que no es lead de esa vertical) NO crea lead ni activa el bot: solo abre su ventana de 24 h (`procesarEntrante` → `instructor`).

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
| Landing pública (E1) | `LIMITE_LANDING_POR_MINUTO` | 30 | Perfil listo: la landing usará `limitarApiPorIp(limitador, "landing", limites.landing)` y `LIMITE_CUERPO_LANDING` |
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
| `GET /api/lista-espera?grupo_id=&prospecto_id=&estatus=&limite=&pagina=` | `lista_espera:leer` (administrador, asesor, recepción) | La fila de espera por grupo y posición, con prospecto, contacto y teléfono. Sin `estatus` trae las vivas. Alcance por la sucursal del programa del grupo |
| `PATCH /api/lista-espera/:id` `{posicion}` | `lista_espera:escribir` (administrador, asesor) | Mueve a alguien que espera a otra posición (1..N); las demás se recorren. 400 fuera de rango; 409 si ya se le ofreció un lugar o ya no está en la fila; registra el cambio |
| `DELETE /api/lista-espera/:id` | `lista_espera:escribir` | Quita de la fila (`cancelado`, sin borrar nada); las demás se recorren. 409 si ya no estaba; registra el cambio |
| `GET /api/clases-muestra?lead_id=&prospecto_id=&grupo_id=&sucursal_id=&estatus=&desde=&hasta=` | `clases_muestra:leer` (administrador, asesor, maestro) | Clases muestra por fecha. Asesor: las de sus sucursales; maestro: las de SUS grupos, sin teléfono ni contacto de la familia. `desde`/`hasta` son instantes con zona |
| `GET /api/clases-muestra/sesiones?grupo_id=&maximo=&incluir_llenas=` | `clases_muestra:leer` | Próximas sesiones agendables del grupo con sus `lugares` (`fecha_hora`, `fecha`, `hora` en la zona de la sucursal). Sin `incluir_llenas` solo las que tienen lugar |
| `GET /api/clases-muestra/:id` | `clases_muestra:leer` | Una clase (404 fuera de alcance) |
| `POST /api/clases-muestra` `{prospecto_id, grupo_id, fecha_hora, notas?}` | `clases_muestra:escribir` (administrador, asesor) | Agenda. 400 si la fecha no es sesión del grupo / sin anticipación / fuera de horizonte / grupo de otra vertical; 404 si el prospecto o el grupo no son de tu alcance; **409** `sin lugares` o ya tiene una vigente en el grupo. Registra el cambio |
| `POST /api/clases-muestra/:id/reprogramar` `{fecha_hora, grupo_id?, notas?}` | `clases_muestra:escribir` | Cancela la vigente y agenda la nueva en una transacción (201 con la nueva). 409 si la clase ya no está agendada, es la misma sesión o no hay lugar (la anterior queda intacta) |
| `POST /api/clases-muestra/:id/cancelar` `{motivo?}` | `clases_muestra:escribir` | Cancela y libera el lugar. 409 si ya no estaba agendada |
| `GET /api/maestro/clases-muestra?desde=&hasta=&estatus=` | `clases_muestra:leer` | Las clases muestra «del día y próximas» de SUS grupos (el maestro; los demás roles, lo de su alcance): por omisión de hace 24 h a 14 días, agendadas / asistidas / no asistidas, por fecha. Sin teléfono ni contacto de la familia para el maestro |
| `GET /api/maestro/avisos?leidos=` | `avisos_maestro:leer` (maestro; el administrador solo ve los de su propio instructor, si lo es) | Los avisos del maestro (los suyos, más reciente primero) con `entrega` (estado del envío por WhatsApp), `motivo_entrega`, `leido_en`, la clase y `datos` |
| `PATCH /api/maestro/avisos/:id` `{visto: boolean}` | `avisos_maestro:escribir` | Marca visto (o lo desmarca). Idempotente; solo cambia y registra si cambia. 404 si es de otro maestro |
| `GET /api/tareas?estado=&tipo=` | `tareas:leer` | Tareas para el asesor |
| `PATCH /api/tareas/:id` `{estado: hecha\|descartada}` | `tareas:resolver` | Resuelve (409 si ya estaba resuelta) |
| `GET /api/leads?etapa_id=&sucursal_id=&telefono=` | `leads:leer` | Lista (el teléfono se normaliza) |
| `GET /api/leads/:id` | `leads:leer` | Detalle con prospectos |
| `GET /api/registro-cambios?entidad_tipo=&entidad_id=&usuario_id=` | `registro_cambios:leer` | Auditoría |

| `GET /api/salud/:sujeto_tipo/:sujeto_id?motivo=&campos=` | `salud:leer` | Ficha de salud de un menor (`prospecto`; `alumno` llega con F1). `motivo` obligatorio. Se registra el acceso, y también todo intento denegado (sin permiso, sujeto inexistente o ajeno, maestro fuera de su grupo) |
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

Los disparadores que hacen «solo de anexar» a `registro_cambio` y `acceso_dato_sensible` protegen de un `UPDATE`, un `DELETE` y un `TRUNCATE`, pero **el dueño de la tabla puede quitarlos**
(`ALTER TABLE … DISABLE TRIGGER`). La garantía completa exige dos cuentas distintas (EB-08):

- **Migraciones** (`prisma migrate deploy`): una cuenta dueña de las tablas (p. ej. `inscripciones_migrador`), que solo corre en el despliegue.
- **Aplicación** (`DATABASE_URL` del backend): una cuenta que **no es dueña** de nada y solo tiene lo necesario:

```sql
CREATE ROLE inscripciones_app LOGIN PASSWORD '…';
GRANT USAGE ON SCHEMA public TO inscripciones_app;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO inscripciones_app;   -- sin DELETE: el borrado es lógico (invariante 3)
REVOKE UPDATE ON registro_cambio, acceso_dato_sensible FROM inscripciones_app;       -- solo de anexar
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
- **Quién**: `salud:leer` y `salud:escribir` son del administrador y del maestro; recepción y asesor no. El maestro, además, solo accede a sujetos de SUS grupos: esa regla (`maestroDelSujeto`) se implementa cuando exista la inscripción (F1/F3); hoy falla cerrado (404).
- **Rastro**: cada lectura y escritura —y cada intento denegado— queda en `acceso_dato_sensible` (quién, a quién, qué campos, motivo, ruta), solo de anexar.
- **Nunca en logs, notas ni mensajes**: `log.*` redacta por clave y por valor `Sensible`; `npm run check:sensibles` falla si un campo de salud aparece en un log, un mensaje, una nota o una tarea, **o si se llama a `.revelar()` o a `leerSensible` fuera de `src/sensibles/` y `api/rutas/salud.ts`** (EB-06); `src/sensibles/fuga.itest.ts` ejecuta los flujos con valores centinela y falla si alguno aparece (en logs, mensajes o cualquier tabla en claro). **Residual:** la guarda es revisión de texto; no ve código nuevo dentro de esas dos rutas, un acceso armado a trozos ni un `import()` dinámico: cada flujo nuevo debe sumarse a `fuga.itest.ts` y pasar revisión.
- **Para sumar un flujo que toque datos de salud** (D5, F1): úsalo SOLO con `leerSensible`/`guardarSensible`, no pases los valores a logs ni textos, y agrega el flujo a `fuga.itest.ts`.
- **Para agregar un campo sensible**: una entrada en `src/sensibles/campos.ts` (y la columna en `ficha_salud` si va en la ficha).
