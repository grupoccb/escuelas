# Auditoría adversarial de INV-6, WH y la etapa G (G1–G5: operación, noche 2)

Auditor: sesión con contexto nuevo, sin haber escrito el código. Fecha: 8 de octubre de 2026.
Objeto: rama `noche-2`, HEAD `301be25`, diff `etapa-F..HEAD` sin `docs/` (94 archivos, +6 167 / −227): INV-6 (invariante 6 reformulado), WH (un webhook nunca responde 500 por un dato inesperado), G1 pase de lista, G2 derivados de asistencia, G3 progresión, G4 eventos y elegibilidad, G5 expediente; más la verificación independiente de las correcciones `F-fix`.
Método: copia limpia del commit (`git archive HEAD | tar -x -C <tmp>`), dos Postgres propios (`docker run --rm --name auditoria-eg-pg … postgres:16-alpine`, puertos 5701 y 5702, bases `*_pruebas` propias). No se usó la `DATABASE_URL` del `.env` ni la base de la demo, ni el proyecto compose `inscripciones`. Nada contra Twilio, Meta, AWS ni navegador. En la fase 1 no se editó nada del repositorio salvo este archivo. Los guiones del auditor (fuzz de webhooks, errores reales de Postgres, pruebas de G, mutaciones) viven en el directorio temporal de la sesión; cada hallazgo trae el procedimiento para repetirlo.

## 1. Resumen ejecutivo

- **Lo que se sostiene.**
  - Desde cero, las cifras de la bitácora se reproducen: `npm ci` + `npm run validar` (**537** tests, exit 0), `npm run test:int` (**924** tests, exit 0) en la primera corrida sobre base vacía y en la segunda seguida sobre la misma base.
  - Migraciones: las seis de INV-6/WH/G aplican sobre base vacía y sobre una base en el estado de la etapa F con datos (la organización de la demo, sus 18 grupos y 9 plantillas con sus seeds): las filas se conservan y la clasificación `clase_mensaje` de las 9 plantillas sale como la documentada. `prisma migrate diff --from-config-datasource --to-schema` da «No difference detected» sobre ambas.
  - **INV-6.** La matriz {en_atencion_humana × clase × origen} está implementada solo en `reglas.ts` (`pasaConAtencionHumana`) y la consulta `MessagingProvider`; ninguna automatización pregunta por el estado (hay un test que lo escanea). El aviso de servicio con una persona atendiendo sigue sujeto a plantilla, horario, frecuencia, baja total y plantilla aprobada; la baja de marketing no lo frena; la clase ausente o rara se trata como marketing; la columna es `NOT NULL` sin valor por omisión y una `servicio` no puede ser de categoría `marketing` (CHECK). 9 de las 12 mutaciones del diseño mueren y las otras tres son un equivalente y dos hallazgos (sección 4). Los tests existentes que cambiaron lo hicieron por el diseño y no se debilitaron más allá de lo que Eduardo reformuló (sección 3, INV-6).
  - **WH.** 36 504 variantes hostiles correctamente firmadas de Chatwoot (cada hoja de cada payload real × 27 valores: NUL, 1e300, enteros fuera de rango, `null`, arreglos, objetos, 70 KB, unicode, SQL), 1 360 de Twilio (entrantes y estados × 34 parámetros × 20 valores) y 978 de la landing (23 campos × 21 valores, POST y GET, más 12 rutas y cuerpos raros): **ningún 500**. La constancia no lleva el contenido (solo la forma), es idempotente por evento y la tarea es una por conversación.
  - **Cupo del evento (G4).** Defensa en la base (`evento_alumno_cupo`, `FOR UPDATE` + cuenta posterior) y en el código (`bloquearEvento`); los tests de la etapa incluyen doce convocatorias simultáneas por HTTP y carrera por SQL directo. Las mutaciones del cupo (`>` por `>=`, otorgar sin elegibilidad, estatus que retrocede) mueren. La cuota es `Decimal(12,2)` y pasa por `dinero.ts`.
  - **Dinero y salud.** Ni el maestro ni nadie ve salud en el expediente (solo la ruta aparte con motivo y registro); el maestro no recibe un solo importe por ninguna de 25 rutas `GET` alcanzables (centinelas `7777.77`, `1111.11`, `5555.55`).
  - **Correcciones F-fix.** Los nueve commits se verificaron revirtiendo el arreglo: el test nuevo de cada uno falla (sección 6). Además, 9 de 10 mutaciones de las que sobrevivían en F mueren ahora; la que sobrevive revela un hueco real hermano (EG-16).
- **Lo que no se sostiene.** **2 hallazgos ALTA**, **8 MEDIA** y **10 BAJA**. Los que más pesan:
  - **EG-01 (ALTA).** La función única de clasificación (`clasificarError`) deja como «dato inesperado» fallas de infraestructura que sí son del momento: `Client has encountered a connection error and is not queryable` (una conexión matada, un *failover*), `Connection ended unexpectedly`, `Query read timeout`, `read ECONNRESET` / `write EPIPE` / `EAI_AGAIN` sin código, `P2037`, `25006` (réplica de solo lectura), `AbortError`/`TimeoutError`, `UND_ERR_*`. El webhook responde 200, deja constancia + tarea y **el evento se pierde** (Chatwoot / Twilio no reintentan). Demostrado con `pg_terminate_backend` sobre una transacción de Prisma.
  - **EG-02 (ALTA).** Un webhook de Chatwoot firmado con `account.id` o `inbox.id` mayor que el rango de `int` (2 147 483 648, 4 294 967 296, 2^53−1) responde **503 para siempre**: la propia constancia revienta al resolver la bandeja con ese número (`P2020`) y se interpreta como «la infraestructura está mal». Chatwoot reintenta sin fin. 60 de las 36 504 variantes.
  - **EG-03 (MEDIA).** `PUT /api/grupos/:id/pase` da **500** cuando una inscripción cambió de grupo y el grupo nuevo toma el pase de una fecha en que el viejo ya la había pasado (violación del índice único `(inscripcion, fecha)`): la lista la ofrece como pendiente.
  - **EG-04 (MEDIA).** Si el proceso muere (o el recálculo falla) entre guardar el pase y recalcular los derivados, el reintento del mismo pase devuelve `sin_cambio` y **nunca** se recalcula: la tarea de faltas consecutivas no nace.
  - **EG-05 (MEDIA).** El tope de marketing (1 cada 7 días, §11 del contexto) se aplica por la **categoría de Meta**, no por la **clase declarada**: `reenganche_captacion` y `recuperacion_no_asistio` (categoría `utility`, clase `marketing`) se saltan el tope.
  - **EG-08 (MEDIA).** EF-17 (tests flaky) tiene causa raíz: `escucharSinReuso` usa `listen(0)` (comodín); en macOS un servidor del comodín puede recibir un puerto que otro proceso ya tiene en `127.0.0.1` y la petición llega al equivocado (un 404 HTML o un servidor que nunca contesta: 300 s hasta «Headers Timeout»). Reproducido: 300 colisiones en 20 000 aperturas; 1 a 2 de 24 corridas paralelas fallaban. Con `lsof` en el momento de la falla el otro dueño del puerto resultó ser un **proceso ajeno a las pruebas** (los auxiliares del editor, que escuchan en `127.0.0.1`), así que alinear solo los servidores de prueba entre sí no basta: hay que escuchar en `127.0.0.1`.
- **Bitácora.** Todo «HECHO» de INV-6, WH y G1–G5 se reproduce con las cifras que cita (537 / 924, base vacía incluida). La lista de «decisiones abiertas» es completa; esta auditoría añade cinco a la sección 8.

## 2. Tabla de hallazgos

Criterio de gravedad: ALTA = rompe un invariante, cupo/dinero mal calculado o duplicado, mensaje enviado indebidamente o perdido, fuga de datos sensibles o entre organizaciones, acceso no autorizado, pérdida de datos, webhook que da 500 por un dato. MEDIA = una garantía documentada no se cumple, falla hacia el lado malo o hay un hueco de prueba con semántica de negocio, pero sin explotación directa grave. BAJA = endurecimiento, deuda o inexactitud.

| ID | Gravedad | Archivo:línea | Resumen |
|---|---|---|---|
| EG-01 | **ALTA** | `src/webhooks/clasificar.ts:33-60,112-130` | Fallas de infraestructura clasificadas como dato inesperado: el webhook responde 200 y el evento se pierde (conexión matada, lectura agotada, `P2037`, `25006`, `AbortError`, `UND_ERR_*`, errores de red sin código) |
| EG-02 | **ALTA** | `src/webhooks/inesperado.ts:71-79`, `src/datos/sistema.ts:34-50` | `account.id` o `inbox.id` fuera del rango de `int`: la constancia revienta al resolver la bandeja y el webhook da 503 para siempre (bucle del proveedor) |
| EG-03 | MEDIA | `src/asistencia/pase.ts:83-100,145-155` | `PUT …/pase` → 500: la inscripción que cambió de grupo aparece pendiente en el grupo nuevo en una fecha que el viejo ya pasó |
| EG-04 | MEDIA | `src/api/rutas/asistencia.ts:82`, `src/asistencia/pase.ts:166` | El recálculo de derivados solo corre para filas que cambiaron: si se corta después de guardar, el reintento no lo repara y la tarea de faltas nunca nace |
| EG-05 | MEDIA (producto) | `src/mensajeria/reglas.ts:142`, `src/mensajeria/provider.ts:371,435` | El tope de marketing por ventana usa la categoría de Meta y no la clase declarada: reenganche y recuperación (utility/marketing) se lo saltan. Se intentó corregir y rompe dos pruebas de diseño existentes (dos intentos en menos de 7 días): decisión de Eduardo |
| EG-06 | MEDIA | `src/webhooks/inesperado.ts:117-120,172-177` | Hueco de pruebas de la garantía «nada se pierde en silencio»: dos mutaciones (tragarse toda excepción de la constancia; devolver `aceptado` si la constancia no se guarda) sobreviven |
| EG-07 | MEDIA | `src/progresion/progresion.ts:71-95` | Un peldaño inferior al actual, registrado a mano con una fecha posterior, hace retroceder al alumno (actual = el más reciente por fecha); el camino por evento sí lo impide |
| EG-08 | MEDIA | `src/testutil/servidor.ts:15` | Causa raíz de EF-17: servidor de prueba en el comodín convive con otros en `127.0.0.1` del mismo puerto |
| EG-09 | MEDIA (producto) | `src/api/rutas/eventos.ts:293,311` | El maestro puede marcar a un participante `pagado` y quitar a uno que ya pagó, sin que exista el pago (H) ni quien cobre |
| EG-10 | MEDIA | `src/progresion/elegibilidad.ts:42-46`, `src/mensajeria/avisos-instructor.ts:155` | Huecos de prueba con semántica: quitar el filtro de vertical a las clases cuenta asistencias de otra vertical (M45); el aviso al instructor ignora la clase (M11) |
| EG-11 | BAJA | `scripts/check-dinero.ts:36` | `eventos/`, `expediente/` y `api/rutas/eventos.ts` mueven o muestran dinero (cuota, mensualidades) y no son zonas estrictas |
| EG-12 | BAJA (producto) | `src/automatizaciones/motor.ts:287-294` | Lead frío: con una persona atendiendo ya no se omite la ejecución entera y la tarea se crea: comportamiento nuevo no pedido por Eduardo |
| EG-13 | BAJA (producto) | `src/mensajeria/reglas.ts:112` | La confirmación de baja (`BAJA`, `STOP`) queda bloqueada si una persona atiende; el contexto (§11) pide confirmarla una vez |
| EG-14 | BAJA (producto) | `src/expediente/expediente.ts:62-107,172-175` | El maestro ve en el expediente los otros grupos, maestros y sucursales de su alumno; los hermanos no pasan por el alcance de sucursal |
| EG-15 | BAJA (producto) | `src/asistencia/pase.ts:33-40` | El pase acepta cualquier fecha pasada (hasta 2000-01-01) y la lista de una fecha vieja usa el grupo ACTUAL de cada inscripción |
| EG-16 | BAJA | `src/inscripciones/inscribir.ts:167-170` | Hermano de EF-05 #12: una cotización explícita con `vigente_hasta` vencido pero aún `vigente` (el barrido no corrió) se acepta |
| EG-17 | BAJA | `src/asistencia/derivados.ts:107-148` | La tarea de faltas consecutivas sigue pendiente aunque la inscripción se dé de baja o se congele |
| EG-18 | BAJA | `prisma/migrations/20261018000000_clase_mensaje` | La clase de una plantilla ya aprobada se puede cambiar por SQL sin dejar rastro (hoy no hay API de plantillas) |
| EG-19 | BAJA | `prisma/migrations/20261017000000_inscripcion_blindaje` | `inscripcion.promocion_id`, `lead_id` y `cotizacion_id` no están congelados en la base (un `UPDATE` pasa) |
| EG-20 | BAJA | `src/webhooks/inesperado.ts:109-114` | Las constancias sin organización (cuerpos rotos o receptor desconocido, con firma válida) no tienen tope ni retención: una fila por cuerpo distinto |

Conteo: **2 ALTA, 8 MEDIA** (EG-03 a EG-10; EG-09 de producto), **10 BAJA** (EG-11 a EG-20; EG-12 a EG-15 de producto).

## 3. Detalle y evidencia

### EG-01 — La clasificación pierde eventos por fallas del momento (ALTA)

`clasificarError` decide por códigos (`PRISMA_TRANSITORIOS`, `SQLSTATE_TRANSITORIOS`, clases `08/53/58/XX`, `NODE_TRANSITORIOS`) y por un texto (`TEXTO_TRANSITORIO`). Lo demás es `inesperado` «ante la duda». Con la base arriba para otra conexión, `registrarEventoInesperado` guarda la constancia, el webhook responde 200 y el proveedor no reintenta: el mensaje de la familia no se procesa.
Repetir (`aud/clasif.ts` y `aud/errores-reales.ts`, con un Postgres propio): contra el cliente real de Prisma se matan los backends con `pg_terminate_backend` dentro de una transacción → `Error: Client has encountered a connection error and is not queryable` → `inesperado:error_interno`. Con errores sintéticos con la forma que dan `pg`, `undici` y Prisma: `Connection ended unexpectedly`, `Query read timeout`, `read ECONNRESET`, `write EPIPE`, `getaddrinfo EAI_AGAIN db` (sin `code`), `P2037` (demasiadas conexiones), `25006` (`cannot execute INSERT in a read-only transaction`: *failover* a réplica), `PrismaClientRustPanicError`, `AbortError`, `TimeoutError`, `UND_ERR_CONNECT_TIMEOUT`, `UND_ERR_SOCKET` → todos `inesperado`. Sí clasifica bien `57P01`, `25P03`, `40P01`, `40001`, `55P03`, `57014`, `53300`, `ECONNREFUSED` y «Connection terminated unexpectedly».
**El sentido inverso (hallado después, `aud/texto-hostil.ts`).** La clasificación mira el texto del error ANTES que si el error es un dato. Prisma cita en el mensaje el valor que no pudo convertir, así que un valor que contiene «Can't reach database server», «connection terminated unexpectedly», «deadlock detected» o «timeout exceeded when trying to connect» dentro de un error de validación, de uuid mal formado (`P2023`), de enum o de fecha inválida se clasifica **transitorio**: 503 y el proveedor repite sin fin un mensaje que nunca podrá procesarse. 24 de 28 combinaciones (4 frases × 7 errores). El texto lo controla quien escribe por WhatsApp.
Corrección: la estructura manda (códigos, nombres de clase, error de validación de Prisma) y el texto solo decide si el error no trae ninguna señal estructurada de ser un dato; se amplían las tres listas (códigos `errorCode`/`P2037`/`25006`, clases `28` y `3D` y `42P01`/`42703` —configuración o migración pendiente—, nombres `AbortError`/`TimeoutError`/`PrismaClientRustPanicError`, `UND_ERR_*` y los textos de `pg` y de red). Test: una tabla de errores sintéticos que debe dar `transitorio`, otra de datos que citan esos textos y debe seguir dando `inesperado`, y una prueba con Prisma y Postgres reales (conexión matada en plena transacción; valores con las frases); 14 mutaciones sobre cada lista y el orden, todas muertas.

### EG-02 — `account.id`/`inbox.id` fuera de rango → 503 sin fin (ALTA)

Procedimiento: fuzz de cada hoja de cada payload (`aud-fuzz.itest.ts`). 60 de 36 504 variantes dieron 503: `account.id`, `inbox.id` o `inbox_id` iguales a 2 147 483 648, 4 294 967 296 o 9 007 199 254 740 991 (el único valor «entero seguro» pero fuera de `int`), en los 11 payloads que llevan cuenta y bandeja. `contextoChatwootDe` los acepta (`Number.isSafeInteger`), `registrarEventoInesperado` llama a `resolverBandejaChatwoot` **sin** `try` (a diferencia de `conversacionDe`, que ya lo hace por esta misma razón) y la consulta lanza `P2020` (valor fuera de rango). Como el fallo ocurre dentro de la constancia, `atender` lo toma por «ni la constancia se pudo guardar» → «reintentar» → 503. El proveedor repite eternamente.
Corrección: `bandejaDe` trata como «sin bandeja» un dato que la base no puede guardar (relanzando solo lo transitorio), y `resolverBandejaChatwoot` devuelve `null` para números fuera de `int`. Test: los tres valores en cuenta y bandeja → 200 con constancia sin organización, una vez; mutación: quitar cualquiera de las dos defensas.

### EG-03 — 500 en el pase del grupo nuevo (MEDIA)

`listaDelPase` ofrece como pendiente a toda inscripción activa cuyo `grupo_id` actual es el del pase, aunque ya tenga una fila ese día de **otro** grupo (el que tenía cuando pasó la lista). Al guardar, `asistencia.create` viola `asistencia_inscripcion_fecha_key` y la respuesta es `500 interno`.
Repetir (`aud-g.itest.ts`, S1): inscribir en el grupo A, pasar lista del lunes 16, `cambiar-grupo` a otro grupo que sesiona los lunes, `PUT /api/grupos/<nuevo>/pase` del lunes 16 → 500.
Corrección: la lista del grupo excluye a quien ya tiene fila ese día en otro grupo (ya asistió o faltó a su clase de ese día); el grupo viejo sigue mostrándola para corregir. Test: el PUT no es 500 sino 400 «no está en la lista» y el viejo corrige. Mutación: quitar el filtro.

### EG-04 — El recálculo no se repara (MEDIA)

El PUT calcula `guardado.inscripciones` (solo las filas que cambiaron) y recalcula **después** de confirmar el pase. Si el proceso muere (o `recalcularDerivados` lanza) tras confirmar, repetir el mismo pase devuelve `sin_cambio`, `tocadas` queda vacío y la tarea no se crea. Repetir (S2): dos faltas por la API y una tercera con `guardarPase` directo (sin recalcular); el `PUT` idéntico devuelve `creadas: 0, sin_cambio: 1, alertas: []` y `tareas = 0`.
Corrección: el PUT recalcula las inscripciones de **todas** las entradas (idempotente, cada una bajo su candado `racha:<id>`). Test: el escenario anterior crea la tarea al reintentar; mutación: volver a las cambiadas.

### EG-05 — El tope de marketing no mira la clase (MEDIA)

INV-6 introduce la clase declarada y `reglas.ts` ya la usa para la baja de marketing, pero el tope «máximo 1 mensaje de marketing por contacto cada 7 días» (§11 del contexto) sigue usando `categoria === "marketing"` (reglas.ts:142; `esMarketing` y `enviadosAlTelefono(…, soloMarketing)` en provider.ts:371,435). `aud/mk.ts`: con `marketingRecientes = 5` y `limiteMarketing = 1`, una plantilla (marketing, marketing) da `tope_frecuencia` y una (utility, marketing) da `null`. Las dos plantillas clasificadas como marketing pero de categoría utility (`reenganche_captacion`, `recuperacion_no_asistio`) no cuentan ni son contadas. La mutación M12 (usar la clase) sobrevive: no hay test.
Corrección propuesta: es marketing lo que declara `clase = marketing` **o** viene de Meta como `marketing`, en las reglas, en el conteo y en el conteo de envíos previos. **Intentada en la fase 2 y revertida**: con ella fallan `hasta max_intentos, espaciados; después no hay más` (reenganche, motor) y `D4 recuperación: el primer intento sale 2 h después…; el segundo, 48 h después` (clases muestra): ambas pruebas de diseño exigen un segundo intento de reenganche o de recuperación dentro de los 7 días, lo que el tope semanal de §11 prohíbe. No se debilitaron las pruebas ni se reinterpretó el tope: queda como decisión (sección 8): ¿reenganche y recuperación cuentan para el tope de 1 por semana, o se exceptúan por diseño?

### EG-06 — La constancia que no se guarda (MEDIA, hueco de prueba)

M19 (tragarse toda excepción que no sea de unicidad en `registrarEventoInesperado`) y M23 (devolver `aceptado` cuando la constancia no se pudo guardar) sobreviven los 90 tests de WH: ningún test hace fallar la propia escritura de la constancia. Es la garantía central de la regla («nada se pierde en silencio»). Corrección: test que hace fallar la escritura de la constancia (con `conGanchos`) ante un dato inesperado y exige 503 sin tarea, y otro que exige que un error que no sea de unicidad se propague.

### EG-07 — El peldaño inferior retrocede al alumno (MEDIA)

Repetir (S3): peldaño 3 el 1-nov y peldaño 1 el 10-nov por `POST /api/alumnos/:id/progresion` (administrador) → `nivel_actual: N1, siguiente: N2`. `otorgarNivel` no compara con el actual; solo el camino por evento exige `nivel_no_superior`. Corrección: un peldaño de orden inferior o igual al actual solo se registra con una fecha anterior a la del actual (el historial a mano sigue siendo posible, el retroceso no). Test existente («nivel actual = el más reciente por fecha aunque se registre después») sigue pasando.

### EG-08 — Causa raíz de EF-17 (MEDIA)

`escucharSinReuso` hace `createServer(…).listen(0)`: escucha en el comodín (`::`). Otros servidores efímeros (`transporte.test.ts`, `reenviador.test.ts`, `directorio.test.ts`) usan `listen(0, "127.0.0.1")`. En macOS un comodín puede recibir un puerto que ya tiene otro proceso en `127.0.0.1` y la conexión a `127.0.0.1:P` va al más específico: otro servidor de otro test (un 404 HTML de Express, o uno que nunca contesta a propósito: «Headers Timeout» tras 300 s).
Repetir: `aud/puerto.mjs` abre 300 servidores en `127.0.0.1:0` y luego 20 000 comodines: **300 colisiones**; a la inversa (comodines existentes, específicos nuevos) cero. Con 24 procesos paralelos de `src/http/*.test.ts src/mensajeria/**/*.test.ts src/api/*.test.ts`, 1 de 24 fallaba por `fetch failed` / `HeadersTimeoutError` en `app.test.ts`.
Corrección: el helper compartido escucha en `127.0.0.1` y el resultado se espera con `listening`; un test guarda que ningún test escuche en el comodín. Verificación: la misma tanda de 24 corridas paralelas, antes y después.

### EG-09 — El maestro cobra y descobra (MEDIA, producto)

`eventos:participantes` incluye al maestro y `cambiarEstatus` no distingue el estatus: puede pasar a un participante a `pagado` (la cuota es dinero) y `DELETE …/alumnos/:id` quita a quien ya pagó (solo se impide con resultado). El comentario del permiso dice que recepción «cobra la cuota». Se deja a Eduardo (sección 8): o se limita `pagado` y la baja de un `pagado` a administrador y recepción, o se acepta hasta que H2 derive `pagado` de un pago real.

### EG-10 — Huecos de prueba con semántica (MEDIA)

M45: quitar `programa: { vertical_id }` de `clasesDeLaVertical` (contaría asistencias de otra vertical para la elegibilidad) sobrevive porque ningún test pone a un alumno en dos verticales con asistencias. M11: el aviso al instructor siempre se evalúa como servicio sin que ningún test lo note (si un instructor tuviera una plantilla de marketing, la baja de marketing no la frenaría). M49: `bloquearEvento` sin escribir sobrevive (la defensa de la base lo cubre, pero la convocatoria deja de ser parcial: pasa a ser todo-o-nada con 409). Corrección: tres tests.

### EG-11 a EG-20 (BAJA)

- **EG-11.** `ZONAS_DE_DINERO` no incluye `eventos/`, `expediente/` ni `api/rutas/eventos.ts`. Hoy están limpios (la cuota pasa por `aTexto`/`deDecimal`); la mutación M60 la mata la regla general, no la zona.
- **EG-12.** El motor ya no mira la atención humana en lead frío y crea la tarea del asesor aun con una persona atendiendo (ED-11 «decisión»). El texto de Eduardo bloquea «reenganche, lead frío ni promociones»; la tarea es un aviso interno y es defendible, pero es comportamiento nuevo no pedido. Se anota (sección 8).
- **EG-13.** La confirmación de baja (`origen: confirmacion_baja`) no es un aviso de servicio de plantilla y sale bloqueada con `atencion_humana`: la baja se registra, pero nadie la confirma salvo la persona. Alternativa (a decidir): tratarla como servicio. Hereda de antes de INV-6.
- **EG-14.** El expediente del maestro muestra todas las inscripciones, eventos y asistencia del alumno, no solo las de sus grupos (S5: el maestro A ve «Norte B»). `hermanos_inscritos` lista nombres de hermanos sin aplicar el alcance de sucursal.
- **EG-15.** El pase acepta cualquier fecha pasada con sesión (el 2000-01-03 pasa, S6) y arma la lista con el grupo actual de cada inscripción; para fechas viejas puede mostrar a quien aún no estaba en el grupo. Sin tope de antigüedad configurable.
- **EG-16.** `inscribir.ts:168` rechaza la cotización explícita solo si `estatus = vencida`; `vigente_hasta` vencido y `estatus = vigente` (hasta que el barrido corra) se acepta y se marca `aceptada`. Existe `estatusEfectivo` para esto. La mutación F12 sobrevive porque el test usa `estatus = vencida`.
- **EG-17.** Una tarea `faltas_consecutivas` pendiente no se resuelve cuando la inscripción pasa a baja o congelada (solo un pase la recalcula).
- **EG-18.** Cambiar `clase_mensaje` de una plantilla aprobada por SQL no deja rastro ni exige re-aprobación; sin API de plantillas es solo un riesgo operativo. Anotar en la guía de roles de K6.
- **EG-19.** Además de lo que EF-04 congela, `promocion_id`, `lead_id` y `cotizacion_id` se pueden cambiar con un `UPDATE` (probado con `lead_id = null`).
- **EG-20.** Cada cuerpo roto distinto con firma válida crea una constancia sin organización; no hay tope ni retención. Requiere el secreto de Chatwoot o el token de Twilio, así que es BAJA.

## 4. Mutaciones (60 + 10)

Procedimiento: `mut.py` aplica la mutación en una copia con su base propia, corre los tests del módulo y la revierte. 60 mutaciones sobre INV-6, WH, G1–G5 y permisos; después 10 sobre las reglas de F que EF-05 dejó con pruebas nuevas.

**Muertas (59 de 70).**
- INV-6 (9 de 12): sin bloqueo por atención humana; respuestas con plantilla que pasan; servicio por categoría y no por clase; plantilla nula tratada como servicio; baja de marketing solo por categoría; baja de marketing que frena también servicio; baja total que no frena; clase del provider siempre servicio (en dos sitios).
- WH (13 de 16): `ErrorTransitorio` ignorado; `40P01`, clases SQLSTATE y texto «connection terminated» fuera de la lista; `responder` invertido; la constancia no suma intentos (con y sin organización); una tarea por evento aun con conversación; la forma conserva textos; el Twilio inesperado deja de reenviarse; enteros no seguros; landing sin 503 transitorio; `idSeguro` deja NUL.
- G1–G2 (12 de 13): `>=` por `>` en el instante de la sesión; lista con congeladas; sin candado por (grupo, fecha); el cambio de método no se guarda; corrección que no recalcula; ventana de 29 días; racha que no se corta; justificada que suma; umbral estricto; justificadas en el porcentaje; sin memoria de la racha; alcance abierto.
- G3–G5 y permisos (16 de 19): elegible con una clase menos; el día del examen cuenta; ausentes como clases; siguiente con `>=`; peldaño con fecha futura; cupo del evento con `>`; convocar a no elegibles; el estatus retrocede; resultado sin asistencia; peldaño no superior; el maestro ve la cuota; el maestro ve los eventos de todas las sucursales; asesor que convoca; asesor que pasa lista; maestro que corrige la progresión; expediente del maestro con importes.
- F (9 de 10): precio al día de inicio; meses gratis sin guardar; `edad_max + 1`; hermanos que incluye al propio alumno; sin responsable de pago por omisión; alumno visible y grupo visible no exigidos (cada uno por separado); el traslado pisa la salud; conversión sin ordenar los candados.

**Sobreviven (11).**

| # | Mutación | Veredicto |
|---|---|---|
| M02 | una nota interna pasa con atención humana (quitar `tipo === "mensaje"`) | equivalente: la nota del bot tiene origen `respuesta`, que ya excluye `origen === "automatizacion"` |
| M11 | el aviso al instructor siempre es de servicio | **hueco real** (EG-10) |
| M12 | el tope de marketing por clase (control) | **hallazgo EG-05** |
| M14 | quitar `P2024` de los códigos transitorios | equivalente: el texto de Prisma lo cubre |
| M19 | la constancia traga cualquier error que no sea de unicidad | **hueco real** (EG-06) |
| M23 | sin constancia, responder `aceptado` | **hueco real** (EG-06) |
| M31 | inventar asistencia a una inscripción dada de baja sin fila | equivalente: la lista solo la incluye si ya tiene fila |
| M45 | las clases cuentan de cualquier vertical | **hueco real** (EG-10) |
| M49 | `bloquearEvento` sin escribir | hueco menor: la base lo cubre; cambia la convocatoria de parcial a todo-o-nada (EG-10) |
| M60 | cuota con `String(Number(…))` | equivalente en valor; la guarda `check:dinero` lo prohíbe por la palabra «cuota» |
| F12 | una cotización con `vigente_hasta` vencido se acepta | **hueco real** (EG-16) |

## 5. Los 14 invariantes contra lo nuevo

| # | Invariante | Veredicto |
|---|---|---|
| 1 | Aislamiento por organización | Se cumple. Tablas nuevas con `organizacion_id`, llaves compuestas y test de no-fuga en G1–G5 y WH. `evento_inesperado.organizacion_id` admite nulo (eventos que no se pueden atar a ninguna organización) y se escribe solo desde `src/datos/sistema.ts`; es una excepción documentada, no una fuga (CHECK: sin organización no hay lead, conversación ni tarea). |
| 2 | Cero términos de vertical | Se cumple (`check:generico`). La progresión usa `etiqueta_progresion` por vertical y niveles como filas; nada de `cinturon_id`. Los peldaños de las tres verticales viven en `prisma/seed/progresion.sql` `[SUPUESTO]`. |
| 3 | Soft delete | Se cumple: ningún `DELETE` físico; las rutas `DELETE` de niveles, eventos, participantes y progresión son bajas lógicas. |
| 4 | Todo saliente por `MessagingProvider` | Se cumple. La tarea del lead frío y la constancia no salen por ahí (son internas). El reenvío sin registro de Twilio es el reenviador existente, no el SDK. |
| 5 | Dos ventanas | No se tocó; el aviso de servicio sin ventana abierta sigue exigiendo plantilla aprobada. |
| 6 | `en_atencion_humana` | Cumple el texto reformulado: bloquea al bot y al marketing, deja pasar al servicio, la verificación vive solo en `reglas.ts`/provider (test de escaneo). Hallazgos acotados: EG-05, EG-12, EG-13, EG-18. No se reinterpretó el texto. |
| 7 | Una sola función de teléfonos | Se cumple: ni G ni WH tocan teléfonos; el constancia usa solo la forma. |
| 8 | Idempotencia | Se cumple: constancia única por (organización, origen, clave); pase único por (inscripción, fecha); tarea de faltas única por inscripción pendiente y por racha; resultado de evento con reclamo condicional. EG-04 es el único caso donde un reintento no repara. |
| 9 | Webhooks autenticados | No cambió: la firma se valida antes de parsear; 401/403 sin constancia (probado). |
| 10 | Determinismo | Se cumple: elegibilidad, racha, porcentaje y cupo son código determinista. |
| 11 | Adaptadores con fakes | Se cumple (`ProveedorEconomico`/`ProveedorProductos` nulos documentados, enchufes de H). |
| 12 | Local primero | Se cumple. |
| 13 | La familia es la entidad central | Se cumple: sin atajos en `alumno`; el expediente cruza tutores/hermanos por `tutor_alumno`. |
| 14 | Horario de envío | Se cumple también para el aviso de servicio con atención humana (probado en `reglas.test.ts` y con el provider). |

## 6. Verificación de correcciones F (regla 2 de Eduardo)

Verificador independiente: copia propia (`g2`) del HEAD con base propia; para cada commit se revirtió el arreglo de código fuente (`git apply -R` de la parte sin tests) conservando el test nuevo y se corrió el archivo del test; además se corrieron variantes que el test del commit no cubre.

| ID | Commit | Veredicto | Observación |
|---|---|---|---|
| EF-01 (ALTA) | `6c9ef58` | verificado | Revertido, falla «EF-01: la conversión no reparte el cupo de otra sucursal…» (13/14); con el arreglo, 14/14. Cubre grupo explícito y deducido de la cotización; el administrador sí puede |
| EF-02 | `5ce7801` | verificado | Revertido, falla «la bienvenida sale por la conversación de la VERTICAL…» (12/13) |
| EF-03 | `f97d836` | verificado | Revertido, falla (12/13). Además, el maestro no recibe un solo importe en 25 rutas `GET` con centinelas (`aud-g2`); `/api/precios` y `/api/promociones` son de catálogo, no de la familia |
| EF-04 | `b7ef6ec` | verificado | Sin la migración `20261017000000_inscripcion_blindaje` falla `EF-04` (7/8). Con ella, `UPDATE` de precio, descuento, meses, fecha de inscripción, alumno y programa → `inscripcion_precio_congelado`; promoción aplicada congelada. Residual: EG-19 (promoción, lead y cotización) |
| EF-05 | `bb51a12`, `ce280a1` | verificado, con un hueco hermano | 9 de 10 mutaciones muertas (precio al día de inicio, meses gratis, borde de edad, hermano de sí mismo, responsable de pago, visible alumno y grupo, traslado de salud, orden de candados). F12 sobrevive: EG-16 |
| EF-08 | `41ae7ed` | verificado | Revertido, falla «EF-08…» (21/23 junto con EF-09) |
| EF-09 | `41ae7ed` | verificado | Revertido, falla «EF-09…». Quedan sin zona `eventos/` y `expediente/`: EG-11 |
| EF-10 | `41ae7ed` | verificado | `docs/API.md:383` lista `inscripcion_movimiento` en el `REVOKE UPDATE` |
| EF-16 | `1a7dab8` | verificado | Revertido, falla «EF-16 (hermano de EC-04)…» (47/48) |
| EF-26 | `ad6835e` | verificado | 16 corridas simultáneas de `transporte.test.ts` con otra tanda de pruebas corriendo: 16 de 16 verdes |
| EF-17 | — | **diagnosticado** (la bitácora lo dejaba «HECHO (parcial)») | Causa raíz y reproducción en EG-08 |

**Ningún arreglo previo falla.** Sin regresiones: `validar` y `test:int` verdes en el HEAD (sección 7) y la migración EF-04 aplica sobre una base con datos.

## 7. Cifras reproducidas (HEAD `301be25`)

```
npm ci                               ok
npm run validar                      exit 0 · tests 537 · pass 537 · fail 0
npm run test:int  (base vacía)       exit 0 · tests 924 · pass 924 · fail 0
npm run test:int  (2.ª seguida)      exit 0 · tests 924 · pass 924 · fail 0
prisma migrate diff (F con datos → HEAD / vacía → HEAD)   No difference detected / No difference detected
fuzz Chatwoot 36 504 · Twilio 1 360 · landing 978         500: 0 · 503 por datos: 60 (EG-02)
```

## 8. Decisiones de producto (para Eduardo)

1. **EG-05.** ¿El reenganche y la recuperación de quien no llegó (clase `marketing`, categoría `utility`) cuentan para el tope de 1 mensaje de marketing por contacto cada 7 días? Hoy no cuentan, y dos pruebas de diseño exigen un segundo intento a las 24–48 h. Si cuentan, hay que dar a esas dos plantillas otro tope. No se tocó.
2. **EG-09.** ¿El maestro puede marcar a un participante `pagado` y quitarlo del evento? Hoy sí; el comentario del permiso dice que recepción cobra la cuota.
3. **EG-12.** ¿La tarea de lead frío debe crearse aunque una persona atienda? Hoy sí (el motor ya no mira la atención humana); el texto de Eduardo solo menciona que no salga el reenganche.
4. **EG-13.** ¿La confirmación de baja debe salir aunque una persona atienda (es una obligación de cumplimiento) o la confirma la persona? Hoy no sale.
5. **EG-14 / EG-15.** ¿El maestro debe ver en el expediente solo lo de sus grupos? ¿Hasta cuántos días atrás se puede pasar lista?
6. **Pendientes ya anotados en la bitácora** (siguen abiertos): excepciones del administrador para convocar a quien no cumple las clases mínimas; si un peldaño puede saltarse uno; una cuota por evento y no por alumno; qué ve el maestro en el expediente; beneficios pendientes de una inscripción congelada en el expediente.

## 9. Estado tras las correcciones (fase 2)

Commits `G-fix` (cada uno con su prueba verificada por mutación; `validar` y `test:int` en verde sobre una copia limpia con su propia base):

| ID | Estado | Commit |
|---|---|---|
| EG-01 (ALTA), EG-02 (ALTA), EG-06 | corregidos (EG-01: 14 mutaciones muertas; EG-02: 5 de 6, la sexta es equivalente; EG-06: sus 2 mutaciones muertas) | `9290dc6` |
| EG-03, EG-04 | corregidos (5 mutaciones muertas) | `bc36161` |
| EG-07 | corregido (4 mutaciones muertas) | `ebbaa48` |
| EG-08 | corregido de raíz (0 de 72 corridas paralelas fallan; antes 1 a 2 de 24) | `5c4daf2` |
| EG-10 (M45), EG-11 | corregidos (M11 y M49 se dejan como hueco menor) | `2f4f945` |
| EG-16 | corregido (2 mutaciones muertas) | `b637ef8` |
| EG-05, EG-09, EG-12 a EG-15 | pendientes: decisión de Eduardo (EG-05 se intentó y se revirtió: rompe dos pruebas de diseño) | — |
| EG-17 a EG-20 | pendientes (BAJA) | — |
