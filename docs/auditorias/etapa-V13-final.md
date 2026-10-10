# Auditoría final V13 — sesión V1 (V0 a V12)

Auditor: agente V13, que no escribió nada de la sesión. Objetivo: refutar lo hecho desde una copia limpia.
Código auditado: rama `v1-escuela`, HEAD `51cb20f` (= `origin/v1-escuela`), clonado con `git clone --no-hardlinks` y `npm ci`. Todo se corrió con Postgres propio (contenedor `v13-pg`, puerto 5543, bases `v13_*`), compose aparte (`-p v13audit`, puertos 3390/3391/5590) y sin tocar el repo fuente, la demo `inscripciones` ni su base. No se hizo `push`.
Seis ayudantes (A a F, copias `atq-a`…`atq-f`) atacaron por área; el auditor principal corrió las compuertas, verificó por su cuenta los hallazgos graves y consolidó. Ids provisionales de los ayudantes entre paréntesis.

## 1. Resultado en una mirada

- **Hay una evasión completa de la guarda de módulos (EV-01, ALTA):** con el módulo apagado, cambiar las mayúsculas de la ruta (`/API/cargos`, `/api/PAGOS`, `/Api/leads/:id/convertir`) devuelve datos y también ESCRIBE (pagos, ventas, eventos, cotizaciones, conversión que crea alumno, inscripción y cargos). Las 109 rutas de módulo se escapan. Es contra la decisión 2 del plan («un módulo apagado: sus rutas no responden») y las pruebas de V1 no lo ven porque solo usan la capitalización canónica. Reproducido en pruebas de integración y en la demo real levantada con `demo:todo`. Arreglo de una línea verificado (ver EV-01).
- Todo lo demás de «módulo apagado» resistió: 0 peticiones de la interfaz a rutas apagadas en 3 591 peticiones, 2 505 peticiones de barrido por rol/método sin una sola anomalía, ciclo completo del motor en 7 instantes sin filas nuevas, bot en 9 guiones × 7 configuraciones sin ofertas, CHECK de la base con sus 64 combinaciones, carreras sin estados inconsistentes.
- Las compuertas desde cero pasan (tabla 2), con una salvedad real: **`test:navegador` falló 1 de 3 corridas completas y 1 de 4 corridas bajo carga** (EV-10, prueba intermitente de `v3-segundo-hijo.spec.ts`), después de que V10b-fix declaró las pruebas estables.
- Totales: **1 ALTA, 9 MEDIA, 35 BAJA** (más 3 notas informativas). Ninguna dependencia nueva, ningún secreto en la historia, `.claude/settings.json` sin tocar por ningún commit, ningún aserto debilitado sin sustituto.

## 2. Corridas desde cero (exit codes reales; logs completos sin filtrar en `scratchpad/audit/logs/` y `hallazgos/g-repro/*.log`)

| Corrida | Entorno | Resultado |
|---|---|---|
| `npm ci` | copia limpia | exit 0 |
| `npm run validar` | — | **exit 0**: 967 pruebas de backend + 101 de la interfaz, 0 fallas; lint, tsc y las cinco guardas `check:*` en verde (coincide con la bitácora de V12) |
| `npm run test:int` | base vacía `v13_int_pruebas`, migraciones desde cero | **exit 0**: `ℹ tests 1419 / pass 1419 / fail 0` (coincide con V12). 136 avisos `DeprecationWarning: Client.activeQuery` (EV-38) |
| `npm run test:navegador` | base vacía, hora real | **exit 0**: `255 passed, 1 skipped (8.0m)` (el omitido es la captura de Chatwoot, que solo corre con `GUIAS_ESCRIBIR`) |
| `PRUEBAS_AHORA=2026-10-11T05:30:00Z npm run test:navegador` (23:30 del sábado en México) | idem | corrida 1: **exit 1**, `253 passed, 1 failed, 1 did not run, 1 skipped`; corrida 2: **exit 0**, `255 passed (8.0m)` (EV-10) |
| `npm run guias:validar` | — | **exit 0** (21 pruebas) |
| `GUIAS_ESCRIBIR=1 … e2e/v8-guias.spec.ts` contra un Chatwoot real local (proyecto `v13audit`, dos conversaciones creadas con `demo:contacto`) | — | **exit 0**, 5 pasadas: la sección de Chatwoot de la guía del asesor SÍ se comprueba cuando hay Chatwoot (los ayudantes no pudieron) |
| `npm run infra:validar` | — | **exit 0** (fmt, init sin backend, validate) |
| `npm run cuadratura` | base `v13_datos_pruebas` (ver migraciones con datos) | **exit 0**: cuadra, 667 cargos, 381 pagos |
| `npm run demo:guiada` | base propia | **exit 0**, cuadratura en verde, pasos 12 a 14 (módulos, inscrito a mano) narrados |
| `npm run demo:todo -- --si --proyecto v13audit --puerto 3390 --puerto-chatwoot 3391 --puerto-postgres 5590` | volúmenes vacíos | **exit 0** en 2 min 11 s (imágenes ya construidas); 12 comprobaciones en ✓, incluye los cuatro usuarios, 7 módulos, cuadratura (1 750 cargos, 1 235 pagos). Antes se corrió con `--simulacro`: el plan solo toca el proyecto `v13audit`; la demo principal (`inscripciones-*`) siguió «Up 18 hours (healthy)» y el repo fuente sin cambios |
| Migraciones sobre base vacía | 77 migraciones | exit 0 (las tres corridas arriba) |
| Migraciones sobre base con datos | base construida con el código de `noche-2` (migraciones hasta `20261024010000`, `demo-datos` 120 alumnos, 4 meses, 242 leads, 667 cargos), luego `prisma migrate deploy` con las de V1 a V10b | exit 0; conteo de filas por tabla antes/después idéntico (73 tablas; única diferencia: `texto_bot` nueva, 0 filas); la fila de configuración existente queda con los seis módulos encendidos; `cuadratura` exit 0 |

Nota: `npm run test:navegador` deja **380 PNG rastreados de `docs/capturas/` modificados** en el árbol (las pruebas reescriben las capturas versionadas). Quien corra la suite en su copia de trabajo verá el árbol sucio (EV-45).

## 3. Hallazgos

Formato: severidad · qué se atacó · evidencia · ¿decisión de producto?

### ALTA

**EV-01 (A-01, D-09) — La guarda de módulos se evade cambiando las mayúsculas de la ruta: lo apagado responde y escribe.**
- Causa: `guardaDeModulos` clasifica con `moduloDeRuta(req.baseUrl + req.path)` y sus expresiones (`src/api/modulos-rutas.ts`) distinguen mayúsculas; Express enruta sin distinguirlas (no hay `case sensitive routing`). Una capitalización distinta no cae en ninguna fila, la guarda deja pasar y el router entrega al manejador de siempre.
- Evidencia 1, mía, API real con todos los módulos apagados (`hallazgos/g-repro/evasion-principal.itest.ts`):
  ```
  GET /api/cargos  -> 404 {"error":{"codigo":"no_encontrado","mensaje":"Ruta no encontrada"}}
  GET /API/cargos  -> 200 {"datos":[],"paginacion":{...}}      (también HEAD y OPTIONS)
  GET /api/CARGOS  -> 200 · GET /Api/Cargos -> 200 · GET /API/REPORTES/EJECUTIVO -> 200
  GET /Api/Inscripciones -> 200 · /api/Clases-Muestra -> 200 · /api/EVENTOS -> 200 · /api/Lista-Espera -> 200 · /api/PAGOS -> 200 · /api/Niveles -> 200
  ```
- Evidencia 2, en la demo real de `demo:todo` (puerto 3390, datos de 6 meses), administrador, finanzas y tableros apagados con `PUT /api/modulos`:
  ```
  /api/cargos -> 404 {"error":{"codigo":"no_encontrado","mensaje":"Ruta no encontrada"}}
  /API/cargos -> 200 {"datos":[{"id":"c62d0e13-…","tutor_id":"6d9af656-…
  /api/Cargos -> 200 · /Api/Reportes/Ejecutivo -> 200 {"mes":"2026-10","activos":{"total_alumnos":273,…
  ```
- Evidencia 3, escrituras (ayudante A, `a-repro/evasion-escritura.itest.ts`): `POST /Api/pagos` → 201 (pagos 1→2), `POST /api/EVENTOS` → 201, `POST /api/Ventas` → 201, `POST /api/leads/:id/Cotizaciones` → 201, con los controles en minúsculas dando 404. Ayudante D (`d-repro/d-cierre.itest.ts`): con la inscripción apagada, `POST /api/leads/:id/convertir` → 404 pero `POST /Api/leads/:id/convertir` → **201** con alumno, inscripción activa y 2 cargos (rompe además la regla de V10b: con la inscripción apagada solo se «marca a mano»).
- Alcance: `a-repro/evasion-tabla.test.ts` → **109 de 109** rutas de módulo se escapan con `/API/`; con `/api` correcto y solo la cola en otra capitalización se escapan 18 (cotizaciones, conversion, convertir, aceptaciones-del-hermano, gastos, pase, asistencia, estado-cuenta, uniformes-por-entregar, vigentes, salud/prospecto|alumno). Probado con administrador, recepción y asesor; sin sesión sigue 401. Resistieron barra final, `//`, `/./`, `..`, `%67`, `;a=b`, `?x=1`, `%2F`, prefijos parecidos (404).
- Por qué no lo vieron las pruebas de V1: `modulos-rutas.test.ts` y `modulos-api.itest.ts` recorren las rutas con la capitalización canónica.
- Arreglo verificado en la copia: `.toLowerCase()` en `moduloDeRuta` y `patronDeRuta` (`hallazgos/g-repro/EV-01-parche-sugerido.diff`, una línea por función) → las variantes dan 404 (0 respuestas 200 en el barrido de variantes) y `modulos-rutas.test.ts` sigue en 5/5. Mejor aún: `case sensitive routing` + `strict routing` en la app y el router, más un caso de prueba con `/API/…` y colas en mayúsculas.
- Decisión de producto: no.

### MEDIA

**EV-02 (A-03) — Con Finanzas apagada, inscribir o convertir CREA cargos que nadie ve; al encender salen de golpe como deuda vencida.**
`a-repro/cargos-apagado.itest.ts`: finanzas apagada, `POST /api/inscripciones` → 201 y 2 cargos nuevos pendientes (`GET /api/cargos` → 404). Con el reloj 40 días después y finanzas encendida, el barrido los vuelve vencidos y crea la tarea `deuda_vencida`. `crearCargosAlInscribir` (`src/inscripciones/inscribir.ts:259`) no consulta el módulo. Contra el criterio «ningún cargo nuevo de un módulo apagado» y «al encender no se dispara lo atrasado de golpe». **Decisión de producto: sí** (¿se generan siempre, para no perder la obligación, o solo con finanzas encendida, y qué se hace con los anteriores al encender?).

**EV-03 (E-03, EB-06) — «Al apagar un módulo nada se borra y todo vuelve al encenderlo» es falso para finanzas y para lo programado.**
La guía del administrador (paso 4) y el diálogo de apagar lo dicen. Realidad (`src/finanzas/barrido.ts:30-33`, `cargos.ts:202`): solo se genera la mensualidad del mes en curso; los meses que pasaron con finanzas apagada nunca se generan; los recordatorios programados mientras estuvo apagado quedan `omitido` y no se revisan, así que un cargo que sigue vencido puede nunca recibir su primer recordatorio por WhatsApp. Un mes apagado = un mes sin cobrar en el sistema, y ni la guía ni el diálogo lo avisan. **Decisión de producto: sí.**

**EV-04 (A-02) — «Inscripción» sin «Clase muestra» es una configuración permitida pero inservible.**
El reglamento solo se acepta en rutas de clase muestra. `PUT /api/modulos {clase_muestra:false}` con inscripción encendida responde 200; después `POST /api/inscripciones` y `convertir` dan 409 «Falta que la familia acepte el reglamento» y la pantalla donde se acepta devuelve 404 (`a-repro/dependencia-reglamento.itest.ts`). El administrador puede dejar a la escuela sin poder inscribir a una familia nueva. Falta una dependencia en el CHECK. **Decisión de producto: sí** (agregar inscripción→clase muestra, o una ruta de aceptación bajo inscripción).

**EV-05 (EB-03) — El espaciado entre recordatorios de cobro cuenta desde el vencimiento, no desde el envío anterior: al encender finanzas la misma familia recibe el mismo recordatorio dos días seguidos.**
`b-repro/apagado-ciclo.itest.ts` (test «ENCENDER finanzas…», `DETALLE=1`): tras encender finanzas el 11 dic, un cargo recibe el recordatorio de la inscripción y el de la mensualidad DOS veces en dos días consecutivos (12-11 y 12-12) pese a `espaciado_minutos = 10080`. Causa: `nominalDeRecordatorio` (`src/cobranza/plan.ts`). Preexistente a V1 pero encender un módulo después de semanas lo hace visible. Sin decisión de producto (calcular la ocurrencia n+1 desde `enviado_en` de la n).

**EV-06 (D-01) — La nota de «inscrito a mano» (y la de recuperar un lead) acepta datos de salud.**
`PATCH /api/leads/:id/etapa` con la inscripción apagada y nota «El niño tiene asma y toma salbutamol, pagó» → 200; `mencionaSalud` de la misma base de código la detecta (`true`) y ya se usa en las notas de clase muestra (`src/api/rutas/clases-muestra.ts:135`), pero no en `src/api/rutas/embudo.ts`. La nota queda en `lead_etapa_historial.nota`, visible a todos los asesores. Contra la regla «salud nunca a notas». Sin decisión de producto.

**EV-07 (E-01) — ReDoS en la carga del catálogo: una petición de un administrador congela el servidor para todas las organizaciones.**
`src/api/rutas/catalogo-importacion.ts:63`: `/^[A-Za-z0-9+/\s]*={0,2}\s*$/.test(contenido_base64)`; `\s` está en la clase repetida y en el `\s*` final: retroceso cuadrático. Verificado por mí aparte con la expresión sola: 20 000 espacios + `!` → 167 ms, 40 000 → 674 ms, 80 000 → 2 740 ms; y por el ayudante E por la API real (185 / 693 / 2 757 ms; control válido 43 ms). El tope del cuerpo es 8 MB: con 1 M de espacios ≈ 7 min de CPU del hilo único. Requiere sesión de administrador (no es anónimo). Corrección: quitar espacios antes y validar con `/^[A-Za-z0-9+/]*={0,2}$/`. Sin decisión de producto.

**EV-08 (E-02) — La guía del maestro dice que la asistencia se corrige «hasta 24 horas»; el valor real es 48 h y es configurable.**
`docs/guias/maestro.md` paso 2 vs `src/clases-muestra/asistencia.ts:55` / `src/configuracion/index.ts:71` (default 48, rango 1–720). Ni `guias:validar` ni `v8-guias.spec.ts` comparan números de la guía con la configuración. Sin decisión de producto.

**EV-09 (F-01) — `demo:vivo` y `demo:datos` solo se protegen con una bandera, y `demo:vivo` da de baja alumnos.**
No hay guarda de `NODE_ENV=production`, de servidor no local ni de que la organización sea la de demo (con una sola organización la toma). `NODE_ENV=production DATABASE_URL=postgresql://inscripciones:inscripciones@127.0.0.2:5543/inscripciones node scripts/demo-vivo.ts --confirmar-base-de-demo` pasa la guarda y llega a Prisma (`f-repro/entorno.ts`). `demo:todo` sí se niega en esos casos. V12 prometió que `demo:vivo` no toca producción. Corrección sugerida: reutilizar `revisarGuardas` de `demo-todo`. Sin decisión de producto.

**EV-10 (propio) — Prueba intermitente: `web/e2e/v3-segundo-hijo.spec.ts:271` («SIN LUGAR para uno…»).**
- Corrida completa con `PRUEBAS_AHORA=2026-10-11T05:30:00Z`: `253 passed, 1 failed (esta prueba), 1 did not run`; la misma corrida repetida: 255 passed; sin `PRUEBAS_AHORA` y con la máquina libre: 255 passed. Aislada, 2/2 pasa. Con 10 procesos `yes` de carga de CPU, 4 corridas del archivo: 3 pasan y 1 falla (`hallazgos/g-repro/v3-estres.sh`, `v3-stress-falla.log`): `expect(getByTestId('conversion-lista')).toContainText('Primera')` → elemento no encontrado a los 10 s.
- El `error-context.md` muestra la pantalla todavía con «El grupo ya no tiene lugares… Segundo se quedó sin lugar» y la casilla de Segundo desmarcada: después de «Dejar fuera a Segundo» el segundo clic en «Convertir e inscribir» volvió a mandar a Segundo. Causa probable (no demostrada): `Conversion.tsx` arma el cuerpo con `pendientes` (viene de `vista`, que se recarga tras desmarcar); si el clic llega antes de esa recarga, se manda el niño que ya se dejó fuera. El servidor responde bien (nada a medias), pero es una prueba intermitente y, con red lenta en un celular, un clic apresurado se rechaza dos veces.
- Choca con V10b-fix («las pruebas ya no dependen de la hora ni del día», 255/255 en 16 instantes) y con la instrucción de Eduardo de no aceptar pruebas intermitentes. Sin decisión de producto.

### BAJA

Módulos apagados (interfaz, motor, datos):
- **EV-11 (EB-01)** El motor lee los módulos UNA vez por organización al empezar la corrida (`src/automatizaciones/motor.ts:95`, hasta 200 ejecuciones): si se apaga el módulo a mitad, salen los 6 recordatorios ya en cola (`b-repro/carrera-barrido.itest.ts`). Los barridos de finanzas y de avisos al maestro tienen una ventana menor.
- **EV-12 (EB-02)** Con el cotizador apagado (y con solo captación, el arranque de la escuela) el bot dice «Para darte horarios y costos exactos…» y «un asesor te escribe… con horarios y costos» y la landing (`src/http/landing-html.ts:126`) «te escribimos por WhatsApp con horarios y costos». La bitácora lo declara como diseño; el plan dice que el bot no ofrece horarios ni precios. **Decisión de producto: sí.**
- **EV-13 (EB-04)** Las etapas «Clase muestra agendada/asistida» siguen listadas y se puede mover un lead a ellas (200) con solo la captación (`b-repro/etapas-modulo.itest.ts`). **Decisión: sí** (ocultarlas como se hizo con «Inscrito», o dejarlas manuales).
- **EV-14 (C-01, A-07)** Administración sigue mostrando y editando lo de módulos apagados (promociones con uniforme, automatizaciones, plantillas, textos del asistente, configuración con límites de cotización/clase muestra/tablero, motivos de baja, «Cargar catálogo» con `precios.csv`, ayuda de Grupos con «lista de espera»). Lleva avisos «En pausa»/«apagado», y es la decisión documentada en V1, pero choca con la literalidad del plan («no aparece en la interfaz»). `GET /api/configuracion` y `GET /api/textos-bot` devuelven también esos ajustes. Capturas en `hallazgos/c-repro/EV-ui-admin-*.png`. **Decisión: sí.**
- **EV-15 (C-02)** El filtro «Tipo de tarea» de `/tareas` lista los 20 tipos con su módulo apagado (`web/src/pantallas/asesor/Tareas.tsx:88`); la lista sí está filtrada en el servidor.
- **EV-16 (C-03)** «Para empezar» (`/admin`) dice «sin horario no aparecen en el cotizador» con el cotizador apagado (`src/administracion/primeros-pasos.ts:104,115`).
- **EV-17 (C-04)** El registro de la clase muestra sigue pidiendo «Talla de uniforme» y «Nivel observado en la clase» con finanzas u operación apagadas. **Decisión: sí.**
- **EV-18 (C-05)** Una sesión abierta no se entera de que un módulo se apagó hasta volver a la pestaña o recargar (`SesionContext` guarda `/api/yo`); mientras tanto la barra enseña lo apagado. Las acciones dan 404: ventana de obsolescencia, sin fuga de datos.
- **EV-19 (C-06)** Las guías del asesor y del maestro suponen todo encendido; solo `recepcion.md` y `administrador.md` mencionan «apagado».
- **EV-20 (A-04)** `GET /api/registro-cambios` (importes, productos, ids) y `GET /api/salud-accesos` siguen mostrando datos de módulos apagados al administrador. **Decisión: sí** (puede ser deseable como bitácora de auditoría).
- **EV-21 (A-05)** `GET /api/exportaciones/leads` con inscripción apagada trae la columna «Cómo se inscribió» y el valor «Por inscripción».
- **EV-22 (A-06)** Los mensajes de baja de grupo/programa hablan de inscripciones y mandan a «pásala a otro grupo», ruta que con el módulo apagado es 404.
- **EV-23 (A-08)** Una fila de configuración dada de baja por SQL (`eliminado_en`) hace que los seis módulos queden encendidos (falla abierta); sin API que lo haga.

V2 a V5, V10b:
- **EV-24 (D-02)** `DELETE /api/etapas/:id` en carrera con `PATCH /api/leads/:id/etapa` hacia esa etapa deja al lead en una etapa dada de baja en 54 a 58 de 60 vueltas (`d-repro/d-etapas.itest.ts`): se rompe «una etapa con leads no se quita». No verificado cómo lo pinta el tablero.
- **EV-25 (D-03)** El filtro de «enlaces» de los textos del asistente es una lista corta de dominios: pasan `promo.xyz`, `.shop`, `.store`, `.dev`, `.ai`, `tel:`, `mailto:`, `whatsapp://` y U+202E (`d-repro/d-v5.itest.ts`). Sin XSS (React escapa) y un `http://` metido por SQL no llega al bot (el lector lo revalida). **Decisión: sí.**
- **EV-26 (D-04)** La «nota obligatoria» de inscrito a mano se cumple con 10 caracteres invisibles (ZWSP, U+2800, U+3164) o `..........` (`trim()` no los quita).
- **EV-27 (D-05)** La tarea «avisar el cambio de clase» queda pendiente con una fecha vieja aunque el aviso bueno sí salió (`d-repro/d-aviso.itest.ts`).
- **EV-28 (D-06, F-02)** «Producción» depende de que `NODE_ENV` sea exactamente `production` (`Production`, `prod` o sin definir → sin comprobaciones de arranque y la API acepta `localhost`), y `ENTORNO_DEMO=si` con `NODE_ENV=production` apaga TODAS las negativas de arranque; ningún test de infra afirma que `infra/ecs.tf` nunca define `ENTORNO_DEMO`, `ENSAYO_LOCAL` ni `PRUEBAS_*`. Sin esa variable, `node src/server.ts` real sale con exit 1 con `ENSAYO_LOCAL`, `ENSAYO_TWILIO_BLOQUEO_PREFIJO` y `PRUEBAS_AHORA` (probado). **Decisión: sí.**
- **EV-29 (D-07)** `convertir` con `prospectos: []` responde «ya convertido» sin convertir nada (200, 0 alumnos).
- **EV-30 (D-08)** Una etapa propia puede ordenarse antes de «nuevo» y se vuelve la etapa inicial de todo lead nuevo del bot y la landing. **Decisión: sí.**
- **EV-31 (sospecha, sin prueba)** `inscritosAMano` descarta al lead si tiene CUALQUIER fila de inscripción (también una dada de baja) y el costo por campaña cuenta solo inscripciones `activa`: un lead con una inscripción previa en baja marcado a mano con la inscripción apagada no se contaría en ningún lado. Solo por lectura de `src/embudo/inscrito-a-mano.ts` y `src/reportes/costo-campana.ts`; falta una prueba.

V6, V8, V9, V10, V12:
- **EV-32 (E-04)** Un importe de 16 dígitos o más en el catálogo da 500 «Ocurrió un error» (simulación y aplicar), sin fila ni columna (`e-repro/v6e.itest.ts`); 11 dígitos sí dan el mensaje por fila. Nada se escribe.
- **EV-33 (E-05)** El importador ignora sin aviso una cabecera repetida y las celdas de más; una fila cuyo primer dato empieza con «Ejemplo» se descarta aunque sea real (solo avisa).
- **EV-34 (E-06)** `guias:validar` y `v8-guias.spec` abren las pantallas con `goto`, nunca por la barra: se quitó «Cierre del día» de la barra de recepción y siguieron en verde (renombrar un botón sí hace fallar `guias:validar`).
- **EV-35 (E-07)** La bitácora cuenta 73 fricciones de V7 corregidas; la tabla suma 72 (asesor: 14, no 15).
- **EV-36 (E-08)** La búsqueda por nombre de familias trae hasta 20 000 filas con hijos por consulta y trunca sin avisar (`src/api/rutas/familias.ts:306-318`). No medido a escala.
- **EV-37 (E-09)** `npm run catalogo:importar -- --aplicar` no tiene guarda de producción ni confirmación (la bitácora no lo menciona).
- **EV-38 (F-03)** La guarda de EK-27 (`src/testutil/prisma-pruebas.ts:52`) lee `activeQuery`, obsoleto en `pg` 8.23: cada corrida de itest imprime `DeprecationWarning` (136 veces en mi `test:int`); con `pg@9` la guarda quedaría inerte sin avisar.
- **EV-39 (F-04)** `ensayo:preparar --revertir` no comenta líneas con prefijo `export ` (queda `ENSAYO_LOCAL=si` activo) y `--url` deja un `ORIGEN_PUBLICO` duplicado posterior que gana (`f-repro/envarch.ts`).
- **EV-40 (F-05)** `validarOrigenPublico` acepta anfitriones con `$()` o comillas invertidas y borra saltos de línea sin avisar. Sin inyección real (autoataque del operador).
- **EV-41 (F-06)** El borde público del ensayo reenvía el `X-Forwarded-For` del cliente; solo importaría con `TRUST_PROXY` activo.
- **EV-42 (F-07)** Las pruebas de EC-11 y EF-22 «fallan sin el arreglo» solo porque el itest no compila al faltar el símbolo nuevo; no se comprobó que detecten la regresión de comportamiento (las otras 17 de las 19 muestreadas sí fallan por aserción).
- **EV-43 (F-08)** El orden de antigüedad compara `creado_en` en milisegundos en memoria mientras los listados ordenan en la base por microsegundos (teórico, sin repro).
- **EV-44 (F-09)** «Contraseña de demo negada en producción» vale al establecer una contraseña y como variable de entorno, no al iniciar sesión: si `prisma/seed/demo.sql` llegara a una base real, esos usuarios entrarían (la imagen `produccion` no lleva los seeds).
- **EV-45 (propio)** `npm run test:navegador` reescribe 380 PNG rastreados de `docs/capturas/` (árbol sucio tras cada corrida; riesgo de commitear capturas por accidente y de ruido en los diffs).

### Notas informativas (no cuentan como hallazgos)
- La comprobación «El maestro ve clases muestra en Hoy» de `demo:todo` dice «2 clases agendadas (0 de hoy)» el sábado 10 de oct: la comprobación pasa sin clases del día (no verificado qué promete el resumen).
- Con la inscripción apagada, «Marcar como inscrito» aparece en TODAS las tarjetas del embudo, también las de la etapa inicial (observación de C; D confirma que el servidor lo gobierna con las reglas de V10b).
- Recepción y maestro con módulos apagados pueden quedar con solo «Más» en la barra, sin mensaje que diga que su escuela aún no activa nada para su rol.

## 4. Lo que se atacó y resistió (para que el informe sea creíble)

**Módulo apagado — API (A):** 2 505 peticiones (6 módulos × cada ruta apagada × administrador, asesor, recepción, maestro y sin sesión × método real, HEAD y OPTIONS, con ids reales sembrados): 0 anomalías (siempre 404 con sesión y 401 sin ella) — solo con la capitalización canónica (ver EV-01). 231 endpoints clasificados (ninguno devuelve `null`), 20 tipos de tarea y 10 eventos asignados. ~30 GET × 4 roles × 6 módulos buscando ids de lo apagado en ficha, prospectos, tareas, embudo, historial, conversaciones, grupos, campañas, expediente, `/api/yo`, textos y «primeros pasos»: ninguna fuga (salvo EV-20 y EV-21). Rutas fuera de `/api` (`/salud`, `/salud/lista`, `/metricas`, webhooks sin firma, `/l/…`): nada de módulos. CHECK de la base: de las 64 combinaciones por `UPDATE`, 14 coherentes pasan y 50 incoherentes se rechazan; segunda fila de la organización, rechazada; NULL, rechazado; dos sesiones concurrentes, la segunda falla el CHECK; ráfaga de 30 `PUT /api/modulos` mezclados: 21×200, 9×409, 0×500, una fila. Registro de cambios del propio interruptor: quién, antes y después, sin registrar un PUT que no cambia nada. No-fuga entre organizaciones: con una organización en solo captación y otra con todo, la primera solo recibió lead frío y reenganche; la segunda, 28 mensajes. Carreras con parpadeo de interruptores: 40 inscripciones a un grupo de cupo 5 → 5 activas, 0 sin cargos; 30 pagos al mismo cargo → cuadratura sin discrepancias; 20 conversiones → todas enteras.

**Módulo apagado — motor, bot, landing (B):** ciclo completo (espera, motor, avisos al maestro, finanzas, vencimiento de cotizaciones) en 7 instantes del 10 de noviembre al 10 de diciembre con cada módulo apagado (con dependencias) y datos sembrados antes, comparando una foto de TODAS las tablas con `organizacion_id`: ninguna fila, mensaje o tarea del módulo apagado; el control con todo encendido sí genera todo (18 mensajes, 3 tareas, 12 ejecuciones). Al encender tras un mes: a las 21:00 locales no sale nada. Bot: 9 guiones × 7 configuraciones y 8 pasos a medias × 8 respuestas con el módulo apagado a mitad: sin 500, sin cotización, clase muestra, lista de espera, inscripción ni precio (solo EV-12). Ningún saliente fuera de `MessagingProvider`.

**Interfaz en navegador (C):** 8 escenarios × 4 roles × ~50 direcciones (incluidas las 20 pantallas de Administración y variantes `/PAGOS`, `/Cuenta`, `/TABLEROS`, `/pagos/`), escritorio 1366 y celular 390: 3 591 peticiones `/api`, **0** a un módulo apagado, ninguna sin clasificar; 0 enlaces a rutas apagadas; URL directa a las 14 rutas del cliente de cada módulo → «No disponible» sin peticiones; barra, «Más» e inicio de sesión limpios; ficha y expediente limpios; tareas de módulos apagados no se listan; las guías no se sirven en la aplicación; no hay manifiesto ni service worker. El cliente siempre llama en minúsculas, por eso EV-01 no se ve por interfaz.

**V2 a V5, V10b (D):** carrera reprogramar+cancelar (20 vueltas): siempre un ganador, una ejecución, sin interbloqueo; 21:30 con clase a las 09:00 → se descarta y deja tarea; con clase a las 10:00 sale a las 09:00 y no antes; 08:59 → 0 envíos; en atención humana el aviso de servicio sale. Lead sin sucursal: barrido de TODAS las rutas GET → ni recepción, ni maestro, ni otras organizaciones, ni sin sesión lo ven; el asesor de la sucursal contraria no ve el de otra. Promociones: fuzz de 30 000 casos, 0 mezclas indebidas, 0 finales negativos o mayores al precio. Orígenes: 25 orígenes, en producción solo `ORIGEN_PUBLICO` exacto. V3: el segundo niño falla por 6 causas → delta 0 en alumnos, inscripciones, cargos y tutores; mismo prospecto dos veces → 1 inscripción. V4: el maestro no ve ni inscribe al hermano ajeno. V5: horario de envío 539, 1201, 1200.5, `"1200"`, `null`, NaN, 9e13, negativos, inicio>=fin, overnight → 400; por SQL el CHECK rechaza 480, 1260, NULL e inicio>fin; textos con huecos ajenos, `{constructor}`, largo 601 y NUL se rechazan. V10b: módulo encendido → 409 con el mensaje de qué hacer, recepción y maestro 403, asesor de otra sucursal 404.

**V6 a V8 (E):** el catálogo lo sube solo el administrador (403 a los otros tres roles, 401 sin sesión); la simulación no cambia la huella md5 de ninguna tabla; fallo a mitad de aplicar → rollback total; idempotente con mayúsculas/acentos/espacios y con dos aplicaciones simultáneas; fórmulas (`=`, `+`, `@`, tab) se guardan como texto y salen neutralizadas en el CSV de leads; archivos hostiles (línea de 5 MB, 100 000 filas, NUL, UTF-16, Latin-1, comillas sin cerrar, 5 001 filas) → error por archivo, 20–810 ms, sin 500 (salvo EV-07 y EV-32); cuerpo de 9 MB → 413. Nota privada del asesor: 0 fugas en 516 combinaciones ruta×rol. Borradores del maestro con salud en Chromium real: sessionStorage, localStorage, IndexedDB, Cache Storage, service workers, cookies, `window.name`, `history.state`, URL, consola y red, antes y después de guardar y tras cerrar sesión: todo vacío. Nueve fricciones de V7 muestreadas (RECEPCION-17, ASESOR-03, ASESOR-01, RECEPCION-02, RECEPCION-06, MAESTRO-01, MAESTRO-06, MAESTRO-11, ADMIN-22), con el arreglo revertido: las nueve pruebas fallan. Los PDF coinciden con las guías y cada uno cabe en 1 página.

**V9, V10, V12, invariantes (F):** firma de Twilio: 4 rutas × 11 variantes → 403 (431 la de 100 kB), nunca 200 ni 500; con firma válida y 14 cuerpos raros → ninguna respuesta >= 500; repetir `MessageSid`+estado deja una fila. Puerta pública del túnel: 17 rutas × 8 métodos, solo pasan los 4 POST de Twilio y `GET /salud`, y el backend no recibe cookie ni `Authorization` del cliente. 22 trucos de origen rechazados en producción. `ensayo:preparar` no imprime el token completo (`****3456`) y no escribe fuera de `.env`. Arranque en producción con `ENSAYO_LOCAL`, `ENSAYO_TWILIO_BLOQUEO_PREFIJO`, `PRUEBAS_AHORA`, `PRUEBAS_DESFASE_MS` (incluso `=0`): exit 1 con código y mensaje (salvo con `ENTORNO_DEMO=si`, EV-28). V10: 19 filas «corregidas» muestreadas con el arreglo revertido: 17 fallan por aserción de comportamiento y 2 solo por no compilar (EV-42); la prueba intermitente de pagos parciales: 0 fallas en 30 corridas con `PRUEBAS_AHORA` en 5 instantes; orden de reparto = enum `concepto_cargo`. V12: `demo:todo` con un `docker` falso hizo 0 llamadas en todas las guardas probadas (sin `--si` solo imprime; proyecto con mayúsculas o `a;b` rechazado; `NODE_ENV=production` rechazado; base remota rechazada; puertos repetidos rechazados). Invariantes sobre las 13 266 líneas añadidas fuera de pruebas (`git diff 89c8904..HEAD`): sin SQL crudo nuevo ni `DELETE` físico (los DELETE HTTP nuevos hacen `eliminado_en`); sin envíos fuera de `MessagingProvider`; sin términos de vertical (`check:generico` y grep a mano de karate, ballet, baile, cinturón, cinta, recital, twerk, kata, tatami, sensei, zapatilla, coreograf, salsa, danza y nombres de sucursal en `src`, `scripts`, `web/src`, `web/e2e`, `config`, `prisma`); sin float en dinero; CHECK 09:00–20:00 presentes en la base (`configuracion_horario_envio_chk`, `automatizacion_horario_check`); sin `telefono_mama`. Pruebas debilitadas: 162 archivos de prueba cambiados, 39 aserciones quitadas, todas por un cambio de comportamiento decidido y con sustituta en el mismo diff; cero `skip`/`only`/`todo`/`retries`/`expect.soft` nuevos (el único `skip` es la captura de Chatwoot, condicionada a Docker); las guardas `check:*` solo se endurecieron. Dependencias: ninguna nueva (`package.json` solo agrega scripts); `npm audit --omit=dev`: 4 altas en la cadena de la CLI de Prisma (preexistente, K3). Secretos: `git log --all -p` (161 061 líneas añadidas) sin tokens reales; `.claude/settings.json` no aparece en ningún commit de `89c8904..HEAD` y su modificación en el árbol de trabajo es local; `.gitignore` cubre `.env`, respaldos y volcados.

**Bitácora vs realidad (HECHO que se reproduce):** `validar` 967 + 101, `test:int` 1 419, `test:navegador` 255 (+1 omitido), `demo:guiada` y `demo:todo` exit 0, 117 decisiones en 28/52/37 (contadas en la tabla resumen), cero dependencias nuevas, `.claude` sin commitear. **No se reproduce:** «un módulo apagado… sus rutas no responden» (EV-01), «las pruebas ya no dependen de la hora ni del día / 255 de 255 en 16 instantes» (EV-10), «nada se borra y todo vuelve al encenderlo» (EV-03), 73 fricciones corregidas (EV-35).

## 5. Lo que NO se pudo verificar y por qué

- Nada contra Twilio, Meta ni AWS reales (sin credenciales); la bandeja de Twilio en Chatwoot por su API sigue sin ejecutarse (V9 lo declara). Los avisos reales por WhatsApp se probaron solo con transporte falso.
- Carreras con dos procesos reales de clase muestra (agendar/cancelar mientras se apaga) y la conversión a fondo con el módulo apagado en pleno vuelo: el parpadeo del interruptor casi no coincidió con las conversiones (20×201). Solo se ejerció a fondo la carrera del motor (EV-11).
- Webhooks de Chatwoot y Twilio por HTTP firmado con un módulo apagado: se probó el camino que invocan (`procesarEntrante`) y la matriz de firmas, no cada combinación módulo×webhook. La landing pública y el QR por HTTP con un módulo apagado: solo lectura de código y del HTML fijo (EV-12).
- `/metricas` con token válido (no se montó el recolector).
- Las 396 capturas de `docs/capturas/v1/v7-*` y las 22 de `docs/guias/img/` imagen por imagen (no hay OCR); «sin salud a la vista» está comprobado por el DOM de los specs. Las 66 MB de `docs/capturas`.
- El «lector fresco» de V8 (una persona que sigue la guía) no es reproducible. Mutaciones de las 83 fricciones restantes de V7. `EC-11`/`EF-22` con mutación fina; `EG-19` por SQL directo.
- Archivos `.csv` reales de Excel (Windows/Mac, regionales): solo sintéticos en UTF-8, UTF-16 y Latin-1. Rendimiento de la búsqueda de familias a escala (EV-36).
- Celular de 390 px solo se rastreó en 2 de los 8 escenarios de módulos (la lógica de la barra es la misma). El tablero del embudo con un lead en una etapa dada de baja (EV-24) no se vio en navegador.
- La condición de V10 «un agente distinto verifica las correcciones» no se evaluó; tampoco el tiempo de «15 minutos» del ensayo con Twilio real ni «unos 3 minutos» de `demo:todo` con Docker frío (la corrida de 2 min 11 s fue con imágenes ya construidas).
- `demo:todo` se corrió solo con `--proyecto v13audit` y puertos distintos; no se corrió contra `inscripciones` (prohibido en el encargo).

## 6. Dónde está la evidencia reproducible

Todo en `/private/tmp/claude-501/-Users-jecm-Documents-Claude-Projects-Inscripciones/74eb0af1-3e0b-4015-9763-c086804436f8/scratchpad/audit/`:
- `limpio/` — copia limpia con este informe; `logs/` y `hallazgos/g-repro/*.log` — salidas completas de cada compuerta.
- `hallazgos/{a,b,c,d,e,f}.md` — informes de cada ayudante con su detalle; `hallazgos/{a,b,c,d,e,f}-repro/` — las pruebas que reproducen (copiar a `src/v13/` o `web/e2e/` de una copia limpia y correr con `DATABASE_URL=postgresql://inscripciones:inscripciones@localhost:5543/<base>_pruebas node --test src/v13/<archivo>`; requieren el contenedor `v13-pg`).
- `hallazgos/g-repro/` — del auditor principal: `evasion-principal.itest.ts` (EV-01), `EV-01-parche-sugerido.diff`, `v3-estres.sh` y `v3-stress-falla.log` (EV-10).
- Mapa de ids: EV-01 = A-01/D-09; EV-02 = A-03; EV-03 = E-03/EB-06; EV-04 = A-02; EV-05 = EB-03; EV-06 = D-01; EV-07 = E-01; EV-08 = E-02; EV-09 = F-01; EV-11 = EB-01; EV-12 = EB-02; EV-13 = EB-04; EV-14 = C-01/A-07; EV-15 = C-02; EV-16 = C-03; EV-17 = C-04; EV-18 = C-05; EV-19 = C-06; EV-20 = A-04; EV-21 = A-05; EV-22 = A-06; EV-23 = A-08; EV-24 = D-02; EV-25 = D-03; EV-26 = D-04; EV-27 = D-05; EV-28 = D-06/F-02; EV-29 = D-07; EV-30 = D-08; EV-32 = E-04; EV-33 = E-05; EV-34 = E-06; EV-35 = E-07; EV-36 = E-08; EV-37 = E-09; EV-38 = F-03; EV-39 = F-04; EV-40 = F-05; EV-41 = F-06; EV-42 = F-07; EV-43 = F-08; EV-44 = F-09.

## 7. Decisiones de producto que salen de esta auditoría

EV-02, EV-03, EV-04, EV-12, EV-13, EV-14, EV-17, EV-20, EV-25, EV-28, EV-30. Todo lo demás se puede corregir sin decidir nada (en particular EV-01, EV-05, EV-06, EV-07, EV-09 y EV-10 antes de dar por cerrada la sesión).
