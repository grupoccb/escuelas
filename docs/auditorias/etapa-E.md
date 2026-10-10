# Auditoría adversarial de la etapa E (bloques E1–E3, noche 2)

Auditor: sesión con contexto nuevo, sin haber escrito el código. Fecha: 8 de octubre de 2026.
Objeto: rama `noche-2`, HEAD `7435209`, commits `a308268` (E1), `456edc0` (E2) y `7435209` (E3); `git diff etapa-C..HEAD` sin `docs/` filtrado a lo de E (landing, códigos de rastreo, campañas, QR, el cambio de `entrante.ts` y `maquina.ts`, la dependencia `jsqr`).
Método: copia limpia del commit (`git archive HEAD | tar -x -C <tmp>`), Postgres propio (`docker run … postgres:16-alpine`, puerto 5692, base `inscripciones_pruebas` propia), servidor Express de la app real levantado desde la copia con el limitador de peticiones de producción y datos sembrados con los helpers de `testutil`. No se usó la `DATABASE_URL` del `.env` ni la base de la demo. Nada contra servicios reales (el único tráfico externo posible, `wa.me`, se observó como la petición que el navegador intenta, sin enviar datos personales). En la fase 1 no se editó nada del repositorio. Los guiones del auditor (sondeos HTTP, CDP contra Chrome, mutaciones, comparación del QR contra un codificador de referencia) viven en `scratchpad/copiaE/.sondeo/`; cada hallazgo trae su procedimiento.

## 1. Resumen ejecutivo

- **Lo que se sostiene.**
  - `npm ci` + `npm run validar` desde cero: exit 0, **498** tests. `npm run test:int` sobre base vacía: exit 0, **712** tests, 0 fallos (cifras de la bitácora de E1–E3 consistentes con el HEAD: 481/693 → 485/704 → 498/712 al sumar E3). El subconjunto de E (`landing.itest`, `rastreo.itest`, `qr.itest`, `campanas.itest`, `qr.test`, `landing.test`, `rastreo.test`, `landing-url.test`) corrió **15 veces seguidas sin un solo fallo**: no hay tests flaky en E.
  - **QR.** El codificador propio es correcto: la matriz es **idéntica bit a bit** a la del codificador de referencia `qrcode` (misma versión, nivel y máscara) en 147 combinaciones de versión 1–10 × niveles L/M/Q × longitudes de 20 a 213 bytes (más UTF-8 con eñes, acentos, CJK y emoji); la máscara que elige coincide con la de la referencia en 70 de 70 casos. Con un lector que no es jsQR (OpenCV `QRCodeDetector`), los PNG a escalas 2, 4, 8, 16 y 40 y los SVG rasterizados a 200, 400 y 800 px decodifican **exactamente** la URL en las tres URL de prueba (versiones 3, 8 y 10). Un lector más (`@zxing/library`) falla en 10 de 141 imágenes sintéticas, pero **falla igual con las matrices del codificador de referencia**, así que es una limitación del detector sobre imágenes sintéticas y no del código del proyecto.
  - **XSS.** Todo lo reflejado se escapa: probé `"><script>`, `'`, backtick, NUL y saltos de línea en `utm_*`, `c`, `s`, `org` y en los siete campos del cuerpo (repintado del 422): ninguna carga útil queda ejecutable. Los parámetros raros (`c`, `s`) no se reflejan crudos (se normalizan o se descartan). CSP con nonce por respuesta, `frame-ancestors 'none'`, `base-uri 'none'`, `Referrer-Policy: no-referrer`, `Cache-Control: no-store`, `X-Content-Type-Options`, `X-Frame-Options`. Cuerpo de 20 KB → 413 sin cuerpo; 50 parámetros → 413; JSON → 422 (no se acepta); `%` roto en la ruta → 400; URL de 60 KB → 431. Sin inyección en `wa.me` (solo dígitos del canal más el mensaje codificado) ni redirección abierta (el `Location` nunca sale de datos del visitante).
  - **Aislamiento.** Un código de otra organización no atribuye ni se toca (el índice único es por organización; la consulta va con alcance). Mass assignment cerrado: `organizacion_id`, `eliminado_en`, `usos`, `tipo`, `lead_id` y `codigo` en un `PATCH` dan 400 «Campo desconocido».
  - **Autorización.** Las diez rutas nuevas están en la matriz de `rutas.test.ts` con su permiso; recepción y maestro reciben 403 en el QR; el asesor solo pide sucursales de su alcance.
  - **Código de rastreo.** El parser es lineal (1 MB de texto adversarial en 2–18 ms), los falsos positivos en frases corrientes son nulos salvo grupos de 4+4 dígitos sin 0 ni 1 (que solo se tocan si la organización conoce ese código), el texto del código no llega al bot (R10 y R11 muertas) y el consumo en el bot es condicional en la base.
  - **Pruebas preexistentes.** Los cambios a tests que ya existían son aditivos o justificados (`rutas.test.ts`: las rutas nuevas; `embudo.itest.ts`: la corrección de `NOT … in` → `OR [nulo, notIn]`). Ninguna aserción debilitada, ninguna guarda `check:*` tocada.
  - **Dependencia nueva.** `jsqr@1.4.0`, fija, solo `devDependencies`, solo importada por `src/testutil/lector-qr.ts` (nunca por código de producción); Apache-2.0, sin dependencias propias. `npm audit` reporta 4 altas (`mysql2` y `deepmerge-ts`, bajo la CLI de Prisma) que ya existían y que no se arreglan con `--force` (prohibido); ninguna es de `jsqr`.
- **Lo que no se sostiene.** **1 ALTA, 8 MEDIA (2 de producto o legales) y 8 BAJA.**
  - **EE-01 (ALTA, funcional, demostrada en Chrome 154):** la CSP de la landing trae `form-action 'self'` y Chrome aplica esa directiva también a las **redirecciones** del envío: el `303` a `https://wa.me/…` queda **bloqueado**. El lead se crea, pero la persona se queda en el formulario con el botón «Enviando…» deshabilitado para siempre y nunca llega a WhatsApp. Es la función central de E1 y falla en el navegador dominante.
  - **EE-02/EE-03 (MEDIA):** el tope de usos de un código de campaña se rebasa bajo concurrencia en la landing (8 leads atribuidos con `max_usos = 1`; mutación L21 sobrevive) y apagar una campaña (`activo = false`) o pasar su `fecha_fin` no apaga sus códigos: siguen atribuyendo (demostrado).
  - **EE-04/EE-05 (MEDIA):** la landing sí revela si un teléfono ya es un lead (el número de WhatsApp del `wa.me` cambia según la sucursal del lead existente; demostrado), y quien mande el teléfono de otra persona le agrega prospectos con el nombre que quiera, le ve el código pendiente y el bot saluda después con ese texto.
  - **EE-06/EE-07 (MEDIA, producto):** el formulario registra un `opt_in` sin verificar al dueño del teléfono (contradice la propia decisión 1 de E1), y un lead `perdido` o `inscrito` que vuelve a llenar la landing no se reactiva ni cuenta como movimiento.
  - **EE-08 (MEDIA):** el único freno contra la inundación de leads es el límite por IP más un honeypot; el POST acepta cualquier origen (sin comprobar `Origin`/`Sec-Fetch-Site`), así que una página ajena puede hacer que los navegadores de sus visitantes creen leads con teléfonos arbitrarios, cada uno desde su propia IP.
- **Mutaciones.** 68 mutaciones sobre reglas de E (landing, parser, consumo, atribución, QR, API): **54 muertas, 14 sobreviven** (4 equivalentes, 10 huecos de prueba reales, EE-09). Ver la sección 3.
- **Bitácora.** Todo «HECHO» de E1–E3 se reproduce con las cifras que cita. Las afirmaciones «respuesta igual exista o no el lead» (E1) y «nadie puede cambiar un lead mandando su teléfono» (E1, decisión 2) son **parcialmente falsas** (EE-04, EE-05).

## 2. Tabla de hallazgos

Criterio de gravedad: ALTA = rompe un invariante, dinero o cupo mal calculado o duplicado, mensaje enviado indebidamente o perdido, fuga de datos, acceso no autorizado o pérdida de datos; aquí además se clasifica como ALTA la falla total de la función central de un bloque. MEDIA = una garantía documentada no se cumple o hay un hueco de prueba con semántica de negocio, sin explotación grave. BAJA = endurecimiento, deuda o inexactitud.

| ID | Gravedad | Archivo:línea | Resumen |
|---|---|---|---|
| EE-01 | ALTA (funcional) | `src/http/landing.ts:34,129`; `src/http/landing-html.ts:152` | `form-action 'self'` bloquea en Chrome el `303` a `wa.me`: el visitante nunca llega a WhatsApp y su botón queda «Enviando…» deshabilitado (demostrado con Chrome 154) |
| EE-02 | MEDIA | `src/captacion/landing.ts:221,240` | El tope `max_usos` de un código de campaña se rebasa bajo concurrencia en la landing: la atribución se decide antes y el consumo condicional no se comprueba (8 leads con tope 1; demostrado) |
| EE-03 | MEDIA | `src/captacion/codigos.ts:57-68`, `src/captacion/rastreo.ts:73-75` | Campaña apagada (`activo = false`) o con `fecha_fin` vencida: sus códigos siguen atribuyendo (demostrado con la landing) |
| EE-04 | MEDIA | `src/captacion/landing.ts:217,281` | Oráculo de existencia de leads: el número de `wa.me` del redirect sale de la sucursal del lead YA existente, no de la elegida; la respuesta cambia según el teléfono exista o no (demostrado con dos canales) |
| EE-05 | MEDIA | `src/captacion/landing.ts:217,244-250,257-263` | Quien manda el teléfono de otro lead le agrega prospectos arbitrarios (nombre de hasta 120 caracteres, con URL permitidas), obtiene su código de rastreo pendiente y el bot saluda al dueño con ese nombre (demostrado en la base) |
| EE-06 | MEDIA (producto) | `src/captacion/landing.ts:273-278` | El formulario inserta un `opt_in` por teléfono sin verificar al titular, justo lo que la decisión 1 de E1 dice evitar; es evidencia de consentimiento falsificable por terceros |
| EE-07 | MEDIA (producto) | `src/captacion/landing.ts:217-255` | Un lead `perdido`, `inscrito` o ya frío que vuelve a llenar la landing no cambia de etapa, no cuenta como movimiento (`ultima_interaccion_en` no se actualiza) y no genera tarea |
| EE-08 | MEDIA | `src/http/landing.ts:50-60,92-130` | Sin verificación de origen, sin token ni tope por teléfono/organización: el POST funciona cross-site y cada envío inserta ~6 filas; el límite por IP no frena una inundación repartida entre navegadores |
| EE-09 | MEDIA | sección 3 | 14 mutaciones sobreviven de 68; 10 son huecos de prueba reales (CSP del script, código de otra vertical en landing y en bot, selección de máscara del QR, zona de silencio, tope del código de lead, vertical inactiva, nombre de contacto largo, etapa inicial) |
| EE-10 | BAJA | `src/http/landing.ts:98-104` | La respuesta al honeypot (200, página de gracias) es distinguible de la de éxito (303); la documentación dice «como a cualquiera» |
| EE-11 | BAJA | `src/http/landing.ts:62-80` | 503 (vertical con aviso faltante) vs 404 revela qué slugs existen |
| EE-12 | BAJA | `src/captacion/landing.ts:88,123` | Nombres con solo caracteres invisibles (`U+200B`) o con controles bidireccionales (`U+202E`) pasan la validación |
| EE-13 | BAJA | `src/captacion/landing.ts:152` | Se aceptan teléfonos de cualquier país (`+999999999999`) y se crea un lead que recibe un `wa.me` |
| EE-14 | BAJA | `src/api/rutas/campanas.ts:96,216-232` | `escala=1` produce un PNG ilegible en versiones altas (OpenCV falla en v10) y el QR reutiliza un código aunque la campaña haya cambiado de vertical (la landing descarta en silencio un código de otra vertical) |
| EE-15 | BAJA | `src/api/rutas/campanas.ts:279-300` | `POST /api/codigos-rastreo` no valida que la sucursal sea de la vertical ni que la campaña esté activa; `DELETE` libera la cadena y un QR impreso puede acabar atribuyendo a otra campaña |
| EE-16 | BAJA | `src/captacion/rastreo.ts:78-80` | Sin tope de candidatos por mensaje: un mensaje con >32 767 códigos distintos daría un `IN` inválido (inalcanzable por WhatsApp, 4096 caracteres; alcanzable solo si Chatwoot reenviara 1 MB) |
| EE-17 | BAJA | `src/http/landing-html.ts:152` | Tras volver con «atrás» desde WhatsApp (bfcache) el botón sigue «Enviando…» deshabilitado (agravante de EE-01) |

Conteo: 1 ALTA, 8 MEDIA (EE-06 y EE-07 de producto; EE-09 agrupa los huecos de prueba reales), 8 BAJA.

## 3. Detalle y evidencia

### EE-01 — La CSP bloquea el `303` a WhatsApp en Chrome (ALTA, funcional)

`politica()` pone `form-action 'self'` (`landing.ts:34`) y el envío termina con `res.redirect(303, enlace)` a `https://wa.me/…` (`landing.ts:129`). Chrome comprueba `form-action` contra cada redirección de un envío de formulario; Firefox y Safari no lo hacen igual. La prueba de la bitácora (`landing.itest.ts`) usa `fetch(..., redirect: "manual")` y nunca ejercita un navegador.
Repetir: levantar la app con la landing (`.sondeo/servidor.ts`), abrir Chrome headless por CDP (`.sondeo/cdp.mjs <slug> <sucursal_id> x`), llenar el formulario y enviarlo. Resultado: el servidor registra `landing_envio` y crea el lead (verificado en la base), pero el navegador se queda en `http://127.0.0.1:3977/l/<slug>?c=…`, con el botón «Enviando… disabled=true», y la consola da `Sending form data to '…' violates the following Content Security Policy directive: "form-action 'self'". The request has been blocked.` (Chrome 154.0.8037.98).
Con `form-action 'self' https://wa.me` la petición a `wa.me` sí sale, pero `wa.me` responde con otra redirección (a `api.whatsapp.com`) que vuelve a bloquear la directiva: un parche de lista blanca es frágil.
Corrección propuesta: en `src/http/landing.ts`, quitar `form-action` de la CSP de la página del formulario (con `default-src 'none'` y ningún HTML inyectable no hace falta; `base-uri 'none'` y el escape cubren el vector) **o** responder el POST exitoso con un 200 que lleve un enlace «Abrir WhatsApp» y un `<script nonce>` que haga `location.replace(enlace)`; esta segunda es más robusta (funciona con cualquier navegador, deja un botón de respaldo si el redireccionamiento automático falla y permite mostrar «Si no se abre, pulsa aquí»). Test: una prueba que lea la cabecera `Content-Security-Policy` de la página y verifique que `form-action` o no está o incluye el destino y toda su cadena de redirección, más (si se opta por el 200) que la respuesta contenga el enlace `https://wa.me/…` con el código. Mutación a verificar: volver a poner `form-action 'self'`.

### EE-02 — El tope de usos se rebasa bajo concurrencia en la landing (MEDIA)

En `registrarEnvioDeLanding`, `buscarCodigoUsable` (`landing.ts:221`) lee `usos < max_usos` sin bloqueo, la atribución se escribe en el lead nuevo y **después** el `updateMany` condicional (`landing.ts:240`) cuenta el uso, pero su resultado (`count`) se ignora. Cada lead tiene su propio candado (por teléfono), así que ocho leads distintos pasan la lectura a la vez. En el bot (E2) el mismo problema está resuelto porque `consumirCodigo` devuelve `false` y no se atribuye.
Repetir: `.sondeo/sondeo3.ts <info>`: se crea una campaña con un código de `max_usos = 1`, se mandan 8 POST simultáneos con teléfonos distintos y `c=<código>`. Resultado: `usos = 1`, `max_usos = 1`, pero **8 leads con `campana_id` de la campaña**. Mutación L21 («consumo sin tope») sobrevive.
Corrección: en la transacción de la landing, consumir primero con `consumirCodigo(tx, delCodigo)` (cambio condicional) y solo si devuelve `true` poner `campana_id`/atribución del código; si no, crear el lead sin atribución de campaña. Test de concurrencia forzada: ocho envíos distintos a la vez con un código de un uso dejan exactamente un lead con `campana_id`.

### EE-03 — Apagar la campaña no apaga sus códigos (MEDIA)

`buscarCodigoUsable` y `sirve()` (bot) miran `activo`, vigencia y usos **del código**, nunca `campana.activo`, `fecha_inicio` ni `fecha_fin`. `PATCH /api/campanas/:id {activo:false}` da 200 y los QR impresos siguen atribuyendo.
Repetir: `.sondeo/sondeo3.ts` (tramo final): se apaga la campaña, se crea otro código y se envía la landing con él: el lead nace con `campana_id` (verificado en la base: `ZWC3B5KY usos 1`).
Corrección: en ambas rutas, exigir `campana.activo = true` y la fecha de hoy dentro de `[fecha_inicio, fecha_fin]` (incluyendo el día final) —por ejemplo con `where: { campana: { activo: true, eliminado_en: null, … } }`— y un test por cada caso (campaña apagada, campaña vencida, campaña con inicio futuro) en landing y bot. Alternativa: que apagar la campaña apague en cascada sus códigos (menos recomendable: la reactivación pierde el estado).

### EE-04 — La landing sí revela si un teléfono ya existe (MEDIA)

`numeroDeContacto(db, …, creado.sucursalId)` (`landing.ts:281`) toma la sucursal del lead tal como ya está en la base, no la elegida en este envío (`datos.sucursalId`). Con dos canales (uno por sucursal) el visitante que manda un teléfono con la sucursal Sur obtiene el número de Sur si el teléfono es nuevo y el número de Norte si ya había un lead de Norte.
Repetir: `.sondeo/sondeo5.mjs <info>` con dos canales sembrados: «teléfono nuevo elige Norte → …0001», «mismo teléfono eligiendo Sur → …0001 (el de Norte)», «teléfono NUEVO eligiendo Sur → …0002». Contradice la afirmación «sin enumeración» de la cabecera de `landing.ts` y de la bitácora (el test «sin enumeración» solo compara con un único canal). Además la sucursal que elige quien ya es lead se ignora sin avisar (el lead conserva la anterior).
Corrección: usar siempre `datos.sucursalId` para elegir el canal del `wa.me` (aunque el lead conserve su sucursal) y devolver un código de rastreo nuevo en cada envío exitoso o, al menos, indistinguible; test con dos canales que compare el `Location` de un teléfono nuevo y de uno existente con la misma sucursal elegida, y otro con sucursal distinta.

### EE-05 — Se pueden agregar prospectos y ver el código de un lead ajeno (MEDIA)

Para un teléfono que ya es lead, `registrarEnvioDeLanding` no reescribe el lead pero **sí** agrega un prospecto cuando el nombre o la edad difieren (`landing.ts:244-263`) y devuelve el código de rastreo pendiente del lead (`codigoDeLead`, `landing.ts:263`), sin ninguna prueba de que quien escribe sea el dueño del teléfono. El nombre de alumno admite hasta 120 caracteres sin más filtro que `<>` y el bot lo interpola en su saludo (`textos.saludoConDatos`), así que alguien puede dejar «Paga aquí https://…» como nombre del niño de otro lead.
Repetir: un POST con el teléfono de un lead existente y `nombre_alumno=Intruso, edad=5`: la base queda con dos prospectos (`Ana`/bot y `Intruso`/landing), y el `Location` trae el código vivo del lead (`EMYN-RC5P`, el mismo que recibió la primera vez).
Corrección: para un lead que ya existía antes de este envío (lead no nuevo) no agregar prospectos ni devolver su código vivo: devolver un código nuevo propio de este envío o ninguno y la página de gracias genérica; el nombre del alumno se filtra con la misma lista de caracteres que el del contacto y se limita el contenido tipo URL (`/https?:|www\./i`); `saludoConDatos` no debe repetir texto que el visitante no haya confirmado. Test: reenviar con otro niño no cambia el número de prospectos de un lead preexistente.

### EE-06 — `opt_in` falsificable (MEDIA, producto/legal)

`landing.ts:273-278` inserta un `consentimiento` `opt_in` (`origen: "formulario"`) para cualquier teléfono sin baja. La decisión 1 de E1 explica que el formulario «no prueba que quien lo llena sea su dueño; alguien podría suscribir a otra persona» y por eso no levanta bajas, pero sí registra el consentimiento de teléfonos nuevos. Hoy ningún código lee `opt_in` (solo se escribe), así que no hay efecto operativo; pero la fila queda como evidencia de consentimiento que cualquier tercero puede fabricar, y D8 (marketing) o H6 (cobranza) podrían tomarla como base.
Decisión de producto/jurídica: o se verifica el teléfono (el primer mensaje entrante desde ese número, que ya existe, es la verificación natural: registrar el `opt_in` cuando el lead escribe) o se registra con `origen: "formulario_sin_verificar"` y no se usa para marketing. Corrección sugerida mínima: renombrar el origen y documentar que no habilita marketing hasta que el número escriba por WhatsApp.

### EE-07 — Un lead cerrado o perdido que vuelve a llenar la landing no pasa nada (MEDIA, producto)

`registrarEnvioDeLanding` reutiliza el lead por teléfono y vertical sin mirar su etapa ni `ultima_interaccion_en` (`landing.ts:217-255`). Un `perdido` que regresa por un QR no se «recupera» (D7), y uno enfriándose no se calienta (el reloj del lead frío de D8 sigue corriendo).
Corrección: si el lead existe, poner `ultima_interaccion_en = ahora` y, si su etapa es de pérdida, usar el camino de recuperación de D7 (`recuperarLead`) o crear la tarea para el asesor; test por cada caso. Decisión de producto: ¿un `inscrito` que llena la landing debe generar tarea (posible hermano)?

### EE-08 — Sin defensa más allá del límite por IP (MEDIA)

El POST no comprueba `Origin` ni `Sec-Fetch-Site`; `origin: https://evil.example` da 303 igual (probado). Combinado con el límite de 30 por minuto **por IP**, una página ajena puede hacer que los navegadores de sus visitantes envíen formularios (cada uno desde su IP) con teléfonos arbitrarios; cada envío exitoso inserta lead, historial, prospecto, aceptación, consentimiento y código. No hay tope por teléfono, por organización ni token anti-CSRF; el honeypot solo detiene bots ingenuos. Con una IP, 30 leads/min = 43 200/día sin que nadie lo note.
Corrección: (a) rechazar con 403 un POST cuyo `Origin` (o `Referer`, o `Sec-Fetch-Site: cross-site`) no sea el origen público configurado; (b) token firmado en el formulario (HMAC del nonce + hora, vigente 2 h, mínimo 2 s desde la carga) para frenar bots y reenvíos; (c) tope por organización y hora (configurable) con alerta; (d) registrar y avisar cuando el límite por IP se agota muchas veces. Test: POST sin token / con origen ajeno / enviado en menos de 2 s → 403 sin crear nada.

### EE-09 — Huecos de prueba (MEDIA)

Ver la tabla de mutaciones. Los diez reales: L05 (CSP del script sin nonce), L16 y R08 (código de otra vertical atribuye en la landing y en el bot), L21 (EE-02), Q01 (la elección de máscara del QR no está probada; la implementación sí coincide con la referencia), Q03 (zona de silencio de 2 módulos en vez de 4), C02 (cambiar el tope de un código de lead), X06 (la landing de una vertical **inactiva** sigue abierta), X12 (nombre de contacto de más de 120 caracteres) y X14 (etapa inicial: no cubre una organización cuya etapa de menor orden es de cierre).

### EE-10 a EE-17 (BAJA)

- **EE-10:** el honeypot responde 200 con «gracias» mientras que un envío bueno da 303 (`landing.ts:98-104`). Un robot puede distinguirlos. Responder con el mismo camino (303 a un `wa.me` válido sin crear nada) o con una página idéntica.
- **EE-11:** `landing.ts` responde 404 para slug inexistente y 503 para vertical viva sin aviso vigente; el segundo revela qué slugs existen. Usar el mismo 404.
- **EE-12:** `sinControl` solo quita C0; `"​"` o `"‮"` se aceptan como nombre (probado: 303). Rechazar la categoría `Cf` (formato) y exigir al menos una letra.
- **EE-13:** `normalizarTelefono("+999999999999")` pasa y se arma un `wa.me` con el canal; si la operación es solo en México conviene limitar a +52 en la landing por configuración.
- **EE-14:** `escala` admite 1; el PNG de una versión 10 a escala 1 mide 65 px y OpenCV no lo lee (`larga-1.png`). Subir el mínimo a 4. Además `GET …/qr` reutiliza un código aunque `codigo.vertical_id` ya no sea el de la campaña; la landing lo descarta en silencio y el QR ya impreso pierde la atribución: exigir `codigo.vertical_id === vertical.id` al reutilizar.
- **EE-15:** `POST /api/codigos-rastreo` no valida que `sucursal_id` pertenezca a la vertical (el QR sí) ni `campana.activo`; `DELETE` libera la cadena (decisión documentada) pero una reimpresión puede atribuir a otra campaña.
- **EE-16:** sin tope de candidatos en `resolverCodigosDeMensaje`; poner un máximo de 10 antes de consultar.
- **EE-17:** el script que deshabilita el botón no se deshace con `pageshow`; agregar `window.addEventListener("pageshow", …)` que lo reactive.

## 4. Mutaciones sobre reglas de E (68; 54 muertas, 14 sobreviven)

Procedimiento: `python3 .sondeo/mutar.py [prefijo]` (cada mutación edita la copia, corre los tests citados contra la base propia y restaura). Códigos: L = landing, R = rastreo/atribución, Q = QR/API, C = campañas/códigos, X = otras reglas de landing.

| Mutación | Resultado |
|---|---|
| L01 honeypot sin efecto · L02 el limitador no consume · L03/L04 `escapar` sin `"` ni `<` · L06 sin `frame-ancestors` · L08 sin filtro de `<>` · L09 el formulario levanta la baja · L10 la atribución se reescribe en un lead existente · L11 logo `http` · L12 color sin validar · L13 sin candado por teléfono · L14 sin aceptar aviso · L15 versión del aviso no comparada · L17 sucursal sin validar · L18 teléfono sin normalizar · L19 `wa.me` sin codificar · L20 cuerpo de 10 MB · L22 no cuenta el uso · L23 sin IP en la evidencia | muertas |
| R01 parser sin `lookbehind` · R02 código sin dígito · R03 no quita «Mi código es» · R04 consumo sin tope · R05 sin `vigente_hasta` · R07 siempre pisa la atribución · R10 el bot ve el código · R11 solo-código cuenta como respuesta · R12 código de lead de otro · R13 quita todos los candidatos · R14 `buscarCodigoUsable` sin `activo` | muertas |
| Q02 bits de nivel · Q04 BCH de formato · Q05 BCH de versión · Q06 XML sin escapar · Q07 permiso a recepción · Q08 sin alcance de sucursal · Q09 sin candado del QR · Q10 confiar en `Host` en producción · Q11 URL sin codificar · Q12 divisor Reed-Solomon · Q13 nombre de archivo sin limpiar · Q14 campaña de otra vertical · C01 tope bajo los usos · C03 borrar campaña con códigos · X01 IPv6 sin /64 · X02 número `wa.me` sin mínimo · X04 sin 503 sin aviso · X05 sucursal inactiva ofrecida · X07 prospecto comparado estricto · X08 `s` sin validar · X09 `utm` sin limpiar · X10 `utm` sin tope · X11 sin `Cache-Control` · X13 consentimiento duplicado | muertas |
| **L05** CSP del script con `'unsafe-inline'` | **sobrevive** (hueco real: la prueba solo mira `style-src`/`frame-ancestors`) |
| **L07** edad hasta 120 | sobrevive (equivalente: el patrón `\d{1,2}` ya limita a 99) |
| **L16 / R08** un código de otra vertical atribuye | **sobreviven** (hueco real, en landing y bot) |
| **L21** consumo del código sin tope en la landing | **sobrevive** (es EE-02) |
| R06 `sirve()` sin `activo` | sobrevive (equivalente: `consumirCodigo` exige `activo` y el uso falla) |
| R09 el código pisa la atribución del anuncio | sobrevive (equivalente: `aplicarCodigoAlLead` ya no atribuye si hay atribución) |
| **Q01** elegir siempre la máscara 0 | **sobrevive** (hueco real; la implementación sí coincide con la referencia en 70/70) |
| **Q03** zona de silencio de 2 módulos | **sobrevive** (hueco real; el estándar pide 4) |
| **C02** editar el tope de un código de lead | **sobrevive** (hueco real, la base lo rechazaría con 500 en vez de 409) |
| X03 `SLUG` permisivo | sobrevive (equivalente: la consulta es parametrizada y no halla nada) |
| **X06** la vertical inactiva sigue visible | **sobrevive** (hueco real) |
| **X12** nombre de contacto sin tope de 120 | **sobrevive** (hueco real) |
| **X14** etapa inicial sin filtrar `inscrito`/`perdido` | **sobrevive** (hueco real) |

## 5. Los 14 invariantes contra lo nuevo de E

1. **Aislamiento por organización.** Cumple. Toda consulta nueva va con `conAlcance`; la única sin alcance es `resolverVerticalPublica` (`src/datos/sistema.ts`), documentada y acotada a vertical activa y organización viva. El índice único de `codigo_rastreo` es por `(organizacion_id, codigo)`; un código de otra organización no atribuye (R14 y la prueba de otra organización).
2. **Cero términos de vertical.** Cumple (`check:generico` en verde; el nombre de la vertical sale de la tabla, el mensaje prellenado es genérico).
3. **Soft delete.** Cumple. `DELETE /api/campanas|codigos-rastreo` ponen `eliminado_en`; los códigos de lead vencidos se apagan con `activo = false`, nunca se borran.
4. **Todo saliente por `MessagingProvider`.** Cumple: E no manda mensajes (la landing redirige al navegador del visitante; el bot sigue por el provider).
5. **Dos ventanas.** No aplica (E no envía).
6. **`en_atencion_humana` bloquea la automatización.** Cumple: el atajo de «solo el código» no responde nada y el resto del flujo no cambió.
7. **Una sola función de teléfonos.** Cumple: la landing usa `normalizarTelefono`. Ver EE-13 sobre su laxitud, que es de la función, no de E.
8. **Idempotencia.** Cumple para la landing (candado por teléfono, índice único del lead, una aceptación) y para el bot; **falla en el tope de usos de la landing** (EE-02).
9. **Webhooks autenticados.** No cambian en E.
10. **Determinismo.** Cumple (sin LLM; el parser, la atribución y el QR son deterministas).
11. **Adaptadores con fakes.** No aplica.
12. **Local primero.** Cumple.
13. **La familia es la entidad central.** Cumple en lo estructural (lead + prospectos con datos estructurados, sin `alumno.telefono_mama`), pero EE-05 permite añadir prospectos a un lead sin verificar a quién pertenece.
14. **Horario de envío.** No aplica (E no inicia mensajes).

## 6. Bitácora: lo reproducible

- E1: validar 481 y test:int 693 en su momento; en el HEAD 498/712, ambos exit 0. Las mutaciones «quitar el candado por teléfono» y «levantar el consentimiento aunque haya baja» se atrapan (L13, L09: muertas). **No reproducible tal cual:** «respuesta igual exista o no el lead» (EE-04) y «nadie puede cambiar un lead mandando su teléfono» (EE-05).
- E2: «consumo sin condición» y «entregar el texto crudo» muertas (R04, R10). **Matiz:** la concurrencia está probada en el bot, no en la landing (EE-02).
- E3: la ida y vuelta con un lector independiente se reproduce y se refuerza (OpenCV + referencia bit a bit). «Un candado distinto por petición rompe la concurrencia» (Q09 muerta).

## 7. Decisiones de producto para Eduardo

1. Landing → WhatsApp: ¿redirección directa o una página intermedia con botón «Abrir WhatsApp» (mejor para navegadores integrados de apps y para EE-01/EE-17)?
2. Consentimiento: ¿se registra al enviar el formulario o cuando el número escribe por WhatsApp? (EE-06).
3. Un lead perdido o inscrito que vuelve por la landing: ¿se reactiva, crea tarea o se ignora? (EE-07).
4. ¿Hasta qué punto bloquear la inundación (token, tope por organización, CAPTCHA)? (EE-08).
5. ¿Los códigos de campaña deben seguir a la campaña (activo y fechas) o ser independientes? (EE-03; recomendación: seguir a la campaña).
6. ¿La landing solo acepta teléfonos mexicanos? (EE-13).

## 8. Estado de la corrección

Ver la sección «Auditoría y correcciones de las etapas D y E» de `docs/BITACORA-NOCHE-2.md`: EE-01 (ALTA, verificada en Chrome 154), EE-02 a EE-05, EE-08 (en parte), EE-09 y las BAJA EE-10, EE-11, EE-12, EE-14, EE-16 y EE-17 quedaron corregidas con su prueba; EE-06, EE-07, EE-13 y EE-15 y la parte de EE-08 que es trabajo grande (token firmado, tope por organización) quedan pendientes como decisión de producto.

---

Estado al 9 de octubre: ver docs/HALLAZGOS-ABIERTOS-V1.md
