# Auditoría adversarial de la etapa C (bloques C1–C9 y B-fix, noche 2)

Auditor: sesión con contexto nuevo, sin haber escrito el código. Fecha: 8 de octubre de 2026.
Objeto: rama `noche-2`, HEAD `110eb73`, diff `etapa-B..HEAD` sin `docs/` (87 archivos, +10 775 / −164), más una revisión rápida de los commits B-fix (`etapa-A..etapa-B` después de `8534ccd`) que la auditoría de B no vio.
Método: copia limpia del commit (`git archive HEAD | tar -x -C <tmp>`), Postgres propio (`docker run --rm --name auditoria-ec-pg … postgres:16-alpine`, puerto 5591) con bases `*_pruebas` propias, y un proyecto compose aparte (`docker compose -p auditoria-ec up -d --build --wait`, puertos 5592/3100/3101, borrado después con `down -v` solo de ese proyecto). No se usó la `DATABASE_URL` del `.env` ni la base de la demo, ni el proyecto compose `inscripciones` (siguió con sus 6 contenedores). Nada contra Twilio, Meta ni AWS. En la fase 1 no se editó nada del repositorio salvo este archivo. Los scripts de prueba del auditor (propiedades de dinero, sondeos de API, fuzz del bot, mutaciones) viven en el directorio temporal de la sesión; cada hallazgo trae el procedimiento para repetirlo.

## 1. Resumen ejecutivo

- **Lo que se sostiene.**
  - Desde cero, todo lo que la bitácora cita se reproduce en el HEAD: `npm ci` + `npm run validar` (**392** tests, exit 0), `npm run test:int` (**482** tests, exit 0: primera corrida sobre base vacía y segunda seguida sobre la misma), y las unitarias bajo Node 22.23.3 (imagen `node:22-alpine`, 390/392; los 2 que fallan solo porque monté el repositorio de solo lectura y `check-capas.test.ts` necesita crear `.tmp/`).
  - Migraciones: aplican sobre base vacía y sobre una base con datos de la etapa B (organización de demo con 21 grupos, de ellos 20 con salón de texto "feo": vacío, solo espacios, minúsculas, mayúsculas, doble espacio, salto de línea, uno borrado, uno en otra sucursal). Las 32 tablas preexistentes conservan sus filas (mismos conteos); aparecen las 11 nuevas; ningún grupo con texto de salón queda sin `salon_id`; `prisma migrate diff --from-config-datasource --to-schema` da «No difference detected» en las dos bases.
  - Seeds: `demo.sql` + `catalogo.sql` + `catalogo-completo.sql` corridos dos veces dan exactamente las mismas filas por tabla (idempotentes): 14 programas, 18 grupos, 31 horarios, 14 precios, 3 promociones, capacidad 184 (Águilas) y 116 (Centenario), y `segunda-vertical.sql` después no duplica. Todo lo que la escuela no dio está marcado `[SUPUESTO]` en el comentario.
  - `docker compose -p auditoria-ec up -d --build --wait` desde cero termina con exit 0: `demo-preparar` sale 0, `GET /salud` responde `{"ok":true,"db":"ok"}`, la base queda con 14/18/31 y las 3 bandejas con ids de Chatwoot, y el asesor demo recibe 404 al cotizar en una sucursal que no es suya (el alcance se respeta).
  - **Dinero.** 200 000 casos aleatorios de porcentaje contra una referencia entera independiente, 50 000 repartos, 100 000 idas y vueltas texto↔centavos y 20 000 conjuntos aleatorios de promociones (hasta 6 promociones con 3 beneficios, acumulables o no, prioridades al azar, descuentos de 0.01 % a 100 %, montos fijos, «total», meses gratis): **0 fallos**. En todos, `final = original − descuentos`, ningún final es negativo ni fraccionario, ningún descuento pasa del 100 %, las líneas suman lo que dicen los totales, nunca hay dos no acumulables y el resultado no depende del orden en que llegan las promociones.
  - **Concurrencia.** Cuatro altas simultáneas de un mismo precio: una gana (201) y tres reciben 409; tres altas simultáneas con fechas distintas dejan vigencias consecutivas sin traslape.
  - **Pruebas preexistentes.** `maquina.test.ts`, los `entrante*.itest.ts` y `maquina*.test.ts` originales no se tocaron desde la etapa A; los cambios a pruebas existentes son los esperables (`salon` de texto → `salon_id`, configuración con los campos nuevos, ordenar antes de comparar en `ficha.itest.ts`: EC-24). Ninguna guarda `check:*` se debilitó.
- **Lo que no se sostiene.** **0 hallazgos ALTA** según el criterio del encargo. Hay **9 MEDIA**, **1 MEDIA de producto** y **16 BAJA**. Los que más pesan:
  - **El bot puede fallar o mentir al elegir horario** (EC-01 a EC-04): si dan de baja el grupo entre la cotización y la respuesta, el mensaje del contacto revienta con un `RangeError` (500, sin respuesta, sin guardar); si la cotización venció, el horario elegido **no se registra** y el bot igual dice «Anotamos a…»; si se apaga el interruptor del cotizador con conversaciones a medias, el contacto recibe «Responde con el número del horario:» seguido de una lista vacía; si el grupo se llenó, se confirma igual.
  - **Los choques de salón se evaden con el nombre** (EC-05): «Salón A», «salón a» y «Salón  A» son tres salones distintos para la API, para el disparador de la base y para la migración (que solo recorta espacios).
  - **`check:dinero` se esquiva** con una llamada partida en dos líneas, acceso por corchetes, un alias o aritmética sin llamadas (EC-06). Hoy no hay ninguna violación real en `src/`.
  - **500 con una fecha `0000-01-01`** en tres rutas (EC-07).
  - **19 mutaciones sobreviven de 139** (EC-09): 8 son equivalentes o redundantes y **11 son huecos de prueba reales**, entre ellos el fin de vigencia de una cotización (`venceEl` el menor), el cupo agotado de una promoción al cotizar, y cuatro propiedades de los disparadores de choques en la base.
- **Bitácora.** Todo «HECHO» de C1–C9 se reproduce con las cifras que cita (392 y 482, base vacía incluida, 184/116, 0 choques).

## 2. Tabla de hallazgos

Criterio de gravedad: ALTA = rompe un invariante, dinero o cupo mal calculado o duplicado, acceso no autorizado o pérdida de datos. MEDIA = una garantía documentada no se cumple, falla hacia el lado malo o hay un hueco de prueba con semántica de negocio, pero sin explotación directa. BAJA = endurecimiento, deuda o inexactitud.

| ID | Gravedad | Archivo:línea | Resumen |
|---|---|---|---|
| EC-01 | MEDIA | `src/cotizador/guardar.ts:81`, `src/captacion/maquina.ts:273` | Si el grupo elegido se da de baja entre la cotización y la respuesta, `elegirHorario` lanza `RangeError`: el webhook responde 500, el mensaje del contacto no se guarda y no recibe respuesta (demostrado) |
| EC-02 | MEDIA | `src/cotizador/guardar.ts:56-91`, `src/captacion/maquina.ts:436` | Con la cotización vencida, el horario que elige el contacto no se guarda en ningún lado, el bot dice «Anotamos a…» y la nota al asesor omite el horario; el número se interpreta contra el catálogo de hoy (demostrado) |
| EC-03 | MEDIA | `src/captacion/maquina.ts:159,273-345` | Cotizador apagado (o catálogo vacío) con conversaciones en `programa`, `otra_sucursal`, `horario` o `lista_espera`: el bot contesta «Responde con el número del horario:» con la lista vacía y solo pasa al asesor tras tres intentos (demostrado) |
| EC-04 | MEDIA | `src/captacion/maquina.ts:273-295` | El horario se llenó entre la cotización y la respuesta: el bot confirma «¡Listo! Anotamos a…» sin avisar que ya no hay lugar (demostrado con `OcupacionFija`) |
| EC-05 | MEDIA | `src/api/rutas/salones.ts:78,102`, `prisma/migrations/20261011000000_…/migration.sql:83-88` | El nombre de un salón se compara literal: mayúsculas, acentos y espacios internos crean salones distintos y los choques no los ven; la migración solo hace `btrim` de espacios (deja `\n`, `\t`, `SALÓN A`) (demostrado en API y en migración) |
| EC-06 | MEDIA | `scripts/check-dinero.ts:29-31` | La guarda se esquiva: `.toNumber` y `()` en líneas distintas, `x["toNumber"]()`, `Math["round"]`, `Math.fround`, `const f = parseFloat`, `+precio * 0.15`, `x * 1` en una zona de dinero |
| EC-07 | MEDIA | `src/api/validar.ts:102-110` | `fechaISO()` acepta `0000-01-01`: `POST /api/precios`, `GET /api/precios?vigente_en=` y `GET /api/cotizador?fecha=` responden 500 `interno` (la base no admite el año 0) |
| EC-08 | MEDIA | `src/api/rutas/cotizaciones.ts:98,163`, `src/cotizador/cotizacion.ts:52` | La cotización del asesor acepta `hermanos_inscritos` y `meses_pagados` que activan promociones, pero ni el snapshot ni el registro de cambios guardan esos supuestos: lo cotizado no se puede auditar |
| EC-09 | MEDIA | secciones 3 y 4 | 19 mutaciones sobreviven de 139; 11 son huecos de prueba reales |
| EC-10 | MEDIA (producto) | `src/api/permisos.ts:32` | `catalogo:leer` incluye al maestro: lee precios, promociones (valores, cupo usado), salones de su sucursal e instructores; no es de su incumbencia |
| EC-11 | BAJA | `src/lista-espera/lista-espera.ts:90-95`, `src/captacion/entrante.ts:262` | La alta del bot corre sin el candado del grupo: contra un «quitar» concurrente deja posiciones 1, 2, 4 (demostrado); la documentación promete «sin huecos» |
| EC-12 | BAJA | `src/captacion/entrante.ts` (todo paso) | Un NUL (`\u0000`) en el mensaje entrante hace fallar `mensaje.create` (500 en el webhook); preexistente de la Fase 1, sale en el fuzz de entradas hostiles |
| EC-13 | BAJA | `src/catalogo/verificacion.ts:147` | `resumenDeCapacidad` suma grupos inactivos; desde C1 el resto de la verificación ya los ignora |
| EC-14 | BAJA | `src/api/rutas/promociones.ts:369`, `src/promociones/cupo.ts:21` | `PATCH` del cupo sin candado: si el consumo gana la carrera, el `CHECK` de la base responde 500; y el `catch` de `consumirCupo` dentro de una transacción no la salva (F3 debe saberlo) |
| EC-15 | BAJA | `src/ciclo.ts:81-103` | El vencimiento de cotizaciones corre solo si la retención está configurada y a lo más cada hora; sin `retencion`, el bot reutiliza cotizaciones de cualquier edad |
| EC-16 | BAJA | `src/promociones/cupo.ts:14` | `consumirCupo` solo mira `activo`: no comprueba vigencia, alcance ni condición (F3 tiene que hacerlo) |
| EC-17 | BAJA | `prisma/schema.prisma:1134` | `promocion_beneficio.producto_id` es un uuid sin llave foránea hasta H5; la API acepta cualquiera (demostrado) |
| EC-18 | BAJA (producto) | `src/api/rutas/grupos.ts:41`, CHECK de `grupo_horario` | Una clase que cruza la medianoche (23:00–01:00) no se puede expresar: `inicio < fin` |
| EC-19 | BAJA (producto) | `src/api/rutas/salones.ts` | La `capacidad` del salón no se contrasta con el `cupo_maximo` del grupo |
| EC-20 | BAJA (producto) | `src/api/rutas/precios.ts:150-190` | `PATCH` permite reescribir costos de una vigencia pasada y `DELETE` de la vigente deja al programa sin precio (cotiza «sin precio») |
| EC-21 | BAJA (producto) | `src/api/rutas/promociones.ts` (`fijarAlcance`) | Alcance vacío = todos: quitar el último programa de una promoción la vuelve universal |
| EC-22 | BAJA (producto) | `src/captacion/maquina.ts:273` | Ante un único horario, un «sí» no se entiende (reintento) |
| EC-23 | BAJA | `src/cotizador/cargar.ts:62` | N+1 (`fuente.ocupados` por grupo) y el catálogo completo de la vertical se carga en cada mensaje del bot en los pasos con catálogo |
| EC-24 | BAJA | `src/sensibles/ficha.itest.ts` | Las aserciones del orden de las filas de accesos ahora se comparan ordenadas: mismas filas, ya no el orden |
| EC-25 | BAJA | `prisma/seed/catalogo-completo.sql:184-199` | `INSERT … ON CONFLICT DO NOTHING` de precios: si un administrador dio de baja el precio de un programa, volver a correr el seed lo resucita |
| EC-26 | BAJA (B-fix) | `src/api/autorizar.ts:48-62` | `requierePermisoConRastro` inserta una fila por cada intento denegado a salud (solo lo frena el límite por IP); no probado |

Conteo: 0 ALTA, 10 MEDIA (9 + 1 de producto), 16 BAJA (6 de ellas decisiones de producto).

## 3. Detalle y evidencia

### EC-01 — Grupo dado de baja entre la cotización y la respuesta (MEDIA)

`elegirHorario` verifica que el grupo elegido sea del programa cotizado y, si no lo encuentra (porque se dio de baja), lanza `RangeError` (`guardar.ts:81`) en lugar de devolver `false`. `procesarEntrante` solo repite conflictos de versión y unicidad, así que el error sale como 500 (`http/app.ts:157`).
Repetir: escenario del bot con un programa con dos grupos; el contacto recorre «Hola, Ana, 8, 1» y queda en `horario`; se hace `update grupo set eliminado_en = now()` del primer grupo; el contacto escribe «1». Resultado observado: `RangeError: El horario elegido no es de un grupo del programa cotizado`; la conversación sigue en `horario` con 0 intentos; al reintentar «1» pasa lo mismo cada vez. La transacción se revierte entera: **el mensaje del contacto no se guarda** y no recibe respuesta (Chatwoot no reintenta el webhook), solo sale del callejón si manda otra cosa.
Corrección: `elegirHorario` devuelve `false` en vez de lanzar, y la máquina trata un horario que ya no existe en el catálogo de hoy como «ya no está disponible»: manda una cotización actualizada.

### EC-02 — Cotización vencida: el horario elegido se pierde (MEDIA)

`cotizacionDelBot` solo mira `estatus = 'vigente'`; el barrido horario (`vencerCotizaciones`) la pasa a `vencida` un día después de `vigente_hasta` (margen UTC) y mientras tanto el bot la sigue usando (EC-15). Cuando ya está vencida, `horariosCotizadosAlContacto` devuelve `null`, la máquina cae al catálogo de hoy para numerar (`opcionesVigentes`) y `elegirHorario` devuelve `false` en silencio: no hay a qué cotización anotárselo.
Repetir: cotizar con el bot, `vencerCotizaciones(db, ahoraMás30Días)`, contestar «2». Resultado: `paso = completo`, `en_atencion_humana`, el mensaje dice «¡Listo! Anotamos a Ana en G2 (…)», la única cotización está `vencida` con `grupo_elegido_id = null` y **la nota al asesor no menciona ningún horario**. Además el «2» se interpretó contra el catálogo de hoy, que puede estar numerado distinto a lo que el contacto vio.
Mutación relacionada: X24 (quitar el filtro `estatus: "vigente"` de `cotizacionDelBot`) sobrevive.
Corrección: si ya no hay cotización vigente (por estatus **o por fecha**) en `horario`/`lista_espera`, la máquina manda una cotización nueva (que reemplaza a la anterior) en vez de interpretar un número contra una lista que el contacto no vio.

### EC-03 — Interruptor apagado o catálogo vacío con conversaciones a medias (MEDIA)

Los pasos `programa`, `otra_sucursal`, `horario` y `lista_espera` dependen de `ctx.cotizador`. Si el administrador apaga `cotizador_whatsapp_activo` (o el catálogo queda sin opciones), `opcionesVigentes` devuelve `[]` y el bot contesta `reintentoHorario([])` = «Responde con el número del horario, o escribe «asesor»…:» seguido de nada. Repetir: llegar a `horario`, apagar el interruptor, contestar «1»: mensaje con la lista vacía, `intentos_fallidos = 1`; tras tres contestaciones, `sin_entender`.
Corrección: en esos pasos, sin cotizador o sin opciones, la máquina cierra como la captura de siempre (`captura_completa`) y pasa al asesor de inmediato.

### EC-04 — «Anotamos a…» aunque el grupo se llenó (MEDIA)

La decisión documentada es que el número apunta a lo que el contacto vio (`C8: el número que responde apunta a los horarios QUE VIO`), y se conserva. Pero la confirmación no distingue un horario que sigue con lugar de uno que ya se llenó: con `OcupacionFija` en 10/10 el bot responde «¡Listo! Anotamos a Ana en G1 (…) … para confirmar». Hoy no pasa en producción porque `SinInscripciones` nunca llena un grupo; con F4 será común.
Corrección: se conserva el registro del horario elegido y el pase al asesor, pero el mensaje dice que por el momento no tiene lugar y que un asesor le ayuda con otra opción.

### EC-05 — Salones que difieren solo en la forma del nombre (MEDIA)

`texto()` recorta y normaliza a NFKC, pero no unifica mayúsculas ni espacios internos. `POST /api/salones` en la misma sucursal con «Salón A», «salón a», «SALÓN A», «Salón  A» y «Salon A» responde 201 las cinco veces. El disparador de choques de la base compara `salon_id`, así que dos grupos en la misma sala física con dos de esos nombres no chocan. La migración de `grupo.salon` (texto) tiene el mismo defecto: con los 20 textos feos del escenario quedaron 9 salones, entre ellos `salón a`, `SALÓN A`, `Salón  A` y uno con un salto de línea (`btrim` solo quita espacios).
Antes de C1 la verificación por texto también comparaba literal, así que no es una regresión, pero la promesa de C1 («el choque de salón se detecta con datos reales de salón») queda hueca para datos sucios.
Corrección: la API compara por una clave normalizada (minúsculas, sin acentos, espacios colapsados) al crear y al renombrar. Los salones ya migrados no se fusionan solos (decisión del administrador); queda documentado.

### EC-06 — `check:dinero` se esquiva (MEDIA)

Con el arreglo de prueba (`node scripts/check-dinero.ts --raiz <tmp>`), en una zona de dinero (`src/promociones/`) la guarda **no** dice nada de: `x.toNumber` + salto de línea + `()`, `x["toNumber"]()`, `Math["round"](x)`, `Math.fround(x)`, `export const pf = parseFloat; pf(s)`, `+precio * 0.15`, `s * 1`, `n * 0.15` y `~~x`; y fuera de las zonas tampoco ve `Number(v)` con nombres neutros ni `o.monto * 1.16`. Hoy no hay ninguna violación real (revisé a mano la veintena de usos de `Number(`/`Math.` de `src/`: ninguno toca un importe), y la cabecera del script admite el límite, pero la regla 2 («`.toNumber()` prohibido») y la 1 se saltan trivialmente.
Corrección: la guarda lee el texto con los saltos de línea colapsados; prohíbe el acceso por corchetes (`["toNumber"]`, `Math[…]`), `Math.fround`, los alias sin llamada (`= parseFloat`, `= Number`), y en las zonas de dinero cualquier literal decimal en una multiplicación o división (`* 0.15`), la multiplicación por 1 y el `+x` unario.

### EC-07 — Año 0000 → 500 (MEDIA)

`fechaISO()` (`validar.ts:102`) acepta cualquier cuatro dígitos; `new Date("0000-01-01T00:00:00Z")` es válido para JavaScript pero Postgres no tiene año 0. Repetir: `POST /api/precios {vigencia_desde:"0000-01-01"…}` → 500; `GET /api/precios?vigente_en=0000-01-01` → 500; `GET /api/cotizador?…&fecha=0000-01-01` → 500 (`codigo: interno`). También `9999-12-31` pasa y hace que `sumarDias` (vigencia de la cotización) genere un año de cinco cifras.
Corrección: `fechaISO()` exige año entre 1900 y 2999.

### EC-08 — Los supuestos de la cotización del asesor no quedan registrados (MEDIA)

`POST /api/leads/:id/cotizaciones` recibe `hermanos_inscritos` (0–20) y `meses_pagados` (0–24) del asesor y con ellos el resolutor aplica `min_hermanos` o `pago_anticipado`. El snapshot guarda el resultado (la promoción aplicada y los importes) pero no la entrada que la habilitó, ni el registro de cambios la incluye: nadie puede saber después por qué esa familia tuvo un 10 % que no le tocaba.
Corrección: el snapshot lleva `supuestos` (solo si algún valor es distinto de 0, para no cambiar los snapshots del bot) y la nota al asesor los muestra.

### EC-09 — Huecos de prueba (MEDIA)

Ver sección 4. Los once reales: fin de vigencia = el menor (Q07), precio que termina el mismo día que empieza el siguiente (P05), cupo agotado de una promoción al cotizar desde la base (X39), `moneda` del precio al cargar (X40), cotización vencida no se reutiliza (X24), grupo de otro programa (Z06), campo `meses` de las líneas que no son meses gratis (R18) y cuatro propiedades de los disparadores de choques en la base (S3: candado del instructor; S4: un grupo inactivo no ocupa el salón; S5: un horario dado de baja no ocupa; S6: reactivar un horario dado de baja vuelve a revisar).

### EC-10 — El maestro lee precios, promociones e instructores (MEDIA de producto)

C reutilizó `catalogo:leer` (que ya incluía al maestro para sus grupos) para precios, promociones, salones e instructores. Un maestro ve la lista de precios, los descuentos con su cupo usado y los salones de las sucursales donde da clases. En B2 la decisión fue «un maestro solo ve sus grupos». No se corrige por su cuenta: es decisión de Eduardo (sección 7).

### EC-11 — Posición con hueco por carrera (BAJA)

Demostrado: tres familias (1, 2, 3); la transacción del bot lee `max = 3`; el asesor quita a la 1.ª (se recorre a 1, 2); el bot inserta la 4.ª → posiciones `[1, 2, 4]`. El orden sigue siendo correcto y la siguiente operación bajo candado las vuelve a numerar, pero `moverEnListaEspera` rechazaría «4» como fuera de rango y la API mostraría un hueco. Sale de que `entrarAListaDeEspera` corre dentro de la transacción del mensaje, que no toma el candado del grupo (la propia documentación del módulo lo admite para el bot). Queda pendiente: arreglarlo exige que el cliente transaccional del bot pueda tomar el candado consultivo.

### EC-12 — NUL en el mensaje entrante (BAJA)

Fuzz de 25 entradas hostiles (vacío, 100 000 caracteres, emoji, dígitos Unicode, bidi, `1e3`, SQL, plantillas) en cinco de los seis pasos del bot (`edad`, `sucursal`, `programa`, `otra_sucursal`, `horario`; el de `lista_espera` no logré sembrarlo en el fuzz y lo cubren las pruebas existentes): ninguna produce error salvo `"1\u0000"`, que hace fallar `prisma.mensaje.create` (`invalid byte sequence`, SQLSTATE 22021) en cualquier paso → 500 en el webhook. Preexistente (EB-14 lo cerró solo para la API).

### EC-13 a EC-26

Descritos en la tabla; las más relevantes para quien siga:
- **EC-14.** `PATCH /api/promociones/:id` lee `cupo_usado`, compara y escribe sin candado. Si entre la lectura y la escritura el consumo sube el contador, el `CHECK promocion_cupo_check` lo rechaza con un error que sale como 500. Además `consumirCupo` captura ese mismo error para devolver `false`, pero dentro de una transacción de Postgres una sentencia fallida aborta toda la transacción: F3 no debe llamarla dentro de la transacción de la inscripción sin un `SAVEPOINT`, o debe comprobar el tope antes.
- **EC-15.** `ciclo.ts:81`: `if (deps.retencion) { … vencerCotizacionesDeTodas … }`. Es un acoplamiento accidental: apagar la retención apaga el vencimiento de cotizaciones.
- **EC-24.** `ficha.itest.ts` pasó de comparar `[a, b, c]` en orden a comparar ordenados, con el argumento «la base corre en una VM cuya hora puede dar saltitos». Las filas siguen siendo las mismas; solo se pierde la aserción de orden. Aceptable, pero es un debilitamiento y se anota.
- **EC-26.** Revisión rápida de los B-fix (`25616f5`, `25eaf31`, `dbbc5aa`, `6a19fad`): no encontré nada ALTA ni MEDIA. Autenticar una vez y exigir la declaración de acceso por ruta es consistente (`contextoDe` lanza sin declaración; `rutas.test.ts` recorre el router real); `requierePermisoConRastro` registra la denegación; la retención usa baja lógica e idempotente; el prefijo `__Host-` se aplica solo con cookie segura. Lo único que apunto es el crecimiento de `acceso_dato_sensible` ante un usuario sin permiso que insiste (no probado).

## 4. Mutaciones

139 mutaciones sobre reglas de negocio de la etapa, aplicadas una por una sobre una copia limpia y ejecutando solo las pruebas que debían atraparlas (unitarias; si sobreviven, las de integración contra Postgres real):

| Bloque | Mutaciones | Atrapadas | Sobreviven |
|---|---|---|---|
| Resolutor de promociones, dinero, precios, choques, cotizador, edad, cupo, lista de espera, cotización, bot, condiciones | 82 | 75 | 7 |
| Alcance por sucursal, API (grupos, instructores, salones, precios, promociones, cotizaciones, lista de espera), cargador, JSON, horario, bot | 40 | 32 | 8 |
| Disparadores y restricciones de la base (migraciones mutadas y aplicadas a bases nuevas) | 17 | 13 | 4 |
| **Total** | **139** | **120** | **19** |

Las 19 que sobreviven, clasificadas:

| Mutación | Clase | Comentario |
|---|---|---|
| P07 `precioVigente` ordena al revés | equivalente | con vigencias sin traslape (la exclusión lo garantiza) el orden no importa |
| U04 `consumirCupo`: `lt`→`lte` | equivalente | el `CHECK` de la base más el `catch` devuelven `false` igual |
| U05 `consumirCupo` sin la condición | equivalente | ídem: lo atrapa el `CHECK` (no el `UPDATE` condicional) |
| X23 `ofrecerLugarLiberado` sin `estatus: "esperando"` en el `UPDATE` | redundante | con el candado del grupo no se puede dar |
| X25 `elegirHorario` sin `estatus: "vigente"` | redundante | ya filtra `cotizacionDelBot` |
| X32 `sumarDias` `+ n + 0` | equivalente | |
| X36 `oferta !== "lugar"` | equivalente | `sin_lugar` no llega a esa rama |
| X16 reactivar un grupo no revisa choques en la API | redundante | lo atrapa el disparador de la base con un 409 menos detallado |
| R18 `meses: 1` en las líneas base | **hueco** | ninguna prueba mira `meses` en líneas que no son meses gratis |
| P05 `anterior.hasta >= desde` → `>` | **hueco** | falta el caso «el precio anterior termina justo el día que empieza el nuevo» |
| Q07 `venceEl` = el mayor en lugar del menor | **hueco** | falta una cotización con fin de precio **y** de promoción |
| Z06 `elegirHorario` sin exigir grupo del programa | **hueco** | |
| X24 `cotizacionDelBot` sin `vigente` | **hueco** | ver EC-02 |
| X39 `cupoUsado: 0` al cargar promociones | **hueco** | una promoción con cupo agotado se seguiría cotizando; solo la prueba unitaria del resolutor cubre el cupo |
| X40 `moneda` fija «MXN» al leer el precio | **hueco** | |
| S3 sin candado consultivo del instructor | **hueco** | solo se prueba el del salón |
| S4 el grupo inactivo ocupa el salón (SQL) | **hueco** | |
| S5 el horario dado de baja ocupa (SQL) | **hueco** | |
| S6 el disparador no mira `eliminado_en` del horario (SQL) | **hueco** | |

Atrapadas notables (lo que la prueba de concurrencia debía proteger): quitar el candado del salón (S2), quitar el candado de la lista de espera (X22), el candado de las altas de precio (X20), la exclusión `daterange` (S8/S9), la posición única y la entrada viva única de la lista (S15/S16), la cotización vigente única (S14), el `CHECK` de cupo (S11) y la aplicación única por beneficio (S13).

## 5. Invariantes contra lo nuevo

| # | Estado | Nota |
|---|---|---|
| 1 | Cumple | Las 11 tablas nuevas llevan `organizacion_id`, soft delete, llaves foráneas compuestas y pasan por `conAlcance`; `check:capas` limpio. El único SQL crudo nuevo vive en las migraciones (disparadores). Pruebas de no-fuga para precios, promociones, salones, cotizaciones y lista de espera. |
| 2 | Cumple | `check:generico` limpio; `grep` de los términos en `src/`, `scripts/`, `config/`, compose: solo `config/terminos-prohibidos.txt`. Las verticales viven en filas de seed. |
| 3 | Cumple | Ningún `DELETE` físico en código ni migraciones (el único `DROP COLUMN grupo.salon` ocurre después de comprobar que ningún texto quedó sin `salon_id`). |
| 4 | Cumple | El bot responde con `respuestaA` por `MessagingProvider`; `ofrecerLugarLiberado` solo deja una tarea para el asesor. |
| 5 | No lo toca | |
| 6 | Cumple | El bot solo contesta en `estado = bot`; las salidas a persona pasan a `en_atencion_humana`. |
| 7 | Cumple | El teléfono del instructor pasa por `normalizarTelefono`. |
| 8 | Cumple | Un webhook repetido no duplica cotización, horario ni lista (probado); la lista y la cotización vigente tienen índices únicos parciales. |
| 9 | No lo toca | |
| 10 | Cumple | Cupo, precios, promociones y vencimientos son código determinista; 20 000 casos aleatorios sin diferencias y sin dependencia del orden de entrada. Nota: el orden usa `localeCompare("es-MX")` e `Intl`; en la imagen `node:22-alpine` el ICU es completo (formatos y días idénticos a los de Node 25). |
| 11 | Cumple | La ocupación entra por `FuenteOcupacion` (hoy `SinInscripciones`); las pruebas la sustituyen por `OcupacionFija`. |
| 12 | Cumple | El compose sube desde cero con `--wait`. |
| 13 | Cumple | Cotización y lista de espera cuelgan de `prospecto` y `lead`; ningún atajo `alumno.telefono_mama`. |
| 14 | Cumple | C no inicia mensajes del sistema; las ofertas de lugar liberado son tareas. |

Ningún invariante roto. Ninguno parcial por culpa de C.

## 6. Preguntas del encargo, una por una

1. **Desde cero.** Sí (ver el resumen). Base vacía y con datos de B, sin pérdida; `migrate diff` vacío.
2. **Dinero.** `dinero.ts` es exacto en todos los bordes que probé (negativos, 0,5 centavos, `-0.5`, `Decimal(12,2)` máximo, `formatear` de importes de 18 dígitos sin pérdida, `"1\n"` rechazado). `check:dinero`: EC-06.
3. **Precios versionados.** Cierre de la anterior, traslapes y concurrencia bien resueltos por la exclusión; `precioVigente` usa la fecha local de la sucursal (`fechaLocal`), mutación X30 atrapada. Huecos: P05 (EC-09) y EC-07. Reescritura histórica: EC-20.
4. **Promociones.** Resolutor correcto según las propiedades; descuento > 100 % imposible (recorte por importe original) y no hay doble aplicación. El consumo de cupo es correcto, pero lo garantiza el `CHECK` y no el `UPDATE` condicional (U04/U05 equivalentes): quitar solo el `UPDATE` no falla ninguna prueba porque la base lo corrige. `promocion_aplicacion` aún no se escribe (F3/H4).
5. **Cotizador.** Edades en bordes (5/6, 13/14, 99, 29 de febrero, fecha de corte), programas y grupos inactivos, sucursal sin programa, sucursal de otra organización (404), alcance del rol (404 al asesor fuera de su sucursal): todo cubierto y las mutaciones Q01–Q04, E01–E02, X01–X04 las atrapan. Pendiente: horarios que cruzan la medianoche (EC-18).
6. **Bot.** Sin regresiones en el flujo original (las pruebas originales no se tocaron). Con el cotizador apagado la captura es la de siempre (probado). La palabra de baja se evalúa antes de la máquina, en todos los pasos. Nunca se queda sin salida: o el contacto escribe «asesor», o a la tercera respuesta que no entiende pasa; los puntos débiles son EC-01 a EC-04 y EC-12.
7. **Lista de espera.** Diez altas simultáneas, tres lugares liberados a la vez, cuatro quitas simultáneas: correcto. Carrera bot contra asesor: EC-11.
8. **Choques.** Contiguos no chocan (S1/C01/C02 atrapadas), mismo día distinta hora no choca, inactivos no ocupan (C06; en SQL, hueco S4). Migración de salones: sin pérdida, pero EC-05.
9. **API nueva.** Toda ruta tiene permiso declarado (`rutas.test.ts` recorre el router real); sin IDOR entre organizaciones ni sucursales en lo que probé (X04–X09); esquemas cerrados (sin asignación masiva); el registro de cambios usa lista blanca. Observaciones: EC-08, EC-10, EC-17.
10. **Seeds.** Reproducidos (184/116, 14/18/31, 0 choques) y compose desde cero con puertos propios. EC-25.
11. **Bitácora y pruebas.** Ningún «HECHO» falla al reproducirlo; no se debilitó ninguna prueba preexistente salvo el ordenado de `ficha.itest.ts` (EC-24).

## 7. Decisiones de producto para Eduardo

1. **¿El maestro debe ver precios, promociones e instructores?** (EC-10). Hoy sí, por reutilizar `catalogo:leer`. Propuesta: un permiso `precios:leer` sin el maestro.
2. **Salones ya migrados con nombres casi iguales** (EC-05): quién los fusiona. La API ya impedirá nuevos.
3. **Reescribir una vigencia pasada** (EC-20): ¿se permite corregir costos de un precio ya usado, o solo cerrarlo y abrir otro?
4. **Alcance vacío = todos** (EC-21): ¿debería avisar o pedir confirmación al dejar una promoción sin alcance?
5. **Clases que cruzan la medianoche** (EC-18) y **capacidad del salón vs cupo del grupo** (EC-19).
6. **Un «sí» ante un único horario** (EC-22): ¿lo toma como elección?
7. **Qué hacer con una oferta de lista de espera vencida** (`vence_en`): hoy nadie la barre; la lleva el asesor.
8. **La capacidad de la verificación 2** (EC-13): ¿cuenta grupos inactivos?

## 8. Pendiente al cierre de la fase 1

Todo MEDIA salvo EC-10 y todo BAJA que sea defecto (no decisión) se corrige en la fase 2 con su prueba y su mutación, o queda documentado en la bitácora como pendiente con su motivo. El seguimiento de cada ID está en `docs/BITACORA-NOCHE-2.md`, sección «Auditoría y correcciones de la etapa C».
