# Auditoría adversarial de la etapa H (finanzas: H1–H7) e I1, con la verificación de las correcciones G-fix

Auditor: sesión con contexto nuevo, sin haber escrito el código. Fecha: 8 de octubre de 2026.
Objeto: rama `noche-2`, HEAD `57c98c8`, diff `etapa-G..HEAD` sin `docs/` (75 archivos, +6 823 / −26): H1–H5 (commit único `95a61ed`), H6 cobranza (`e9d1548`), H7 cuadratura (`af743b1`), I1 reporte de clases muestra (`57c98c8`), más la decisión EG-05 de Eduardo y la verificación independiente de los seis commits `G-fix`.
Método: copia limpia del commit (`git archive HEAD | tar -x -C <tmp>`) y un Postgres propio (`docker run --rm --name auditoria-eh-pg … postgres:16-alpine`, puerto 5801; bases `*_pruebas` propias, plantilla para las mutaciones). Nunca se usó la `DATABASE_URL` del `.env`, la base de la demo ni el proyecto compose `inscripciones`. Nada contra servicios reales. En la fase 1 solo se editó este archivo; los guiones del auditor (ataques de concurrencia, SQL directo, mutaciones) viven en el directorio temporal de la sesión y cada hallazgo trae cómo repetirlo.

## 1. Resumen ejecutivo

- **Lo que se sostiene.**
  - Desde cero se reproducen las cifras de la bitácora: `npm ci` + `npm run validar` (**588** tests, exit 0) y `npm run test:int` sobre base vacía (**1 006** tests, exit 0).
  - **Pagos simultáneos (ataque A).** 80 hilos pagando 100 a un cargo de 1 000 con claves distintas: pasan exactamente 10 y 70 reciben 409; 60 pagos cruzados en orden distinto sobre los mismos 4 cargos mezclados con 10 barridos, 20 cancelaciones simultáneas del mismo pago más pagos nuevos y cancelaciones del cargo, pago contra baja de la inscripción, 40 POST con la misma clave (uno crea, 39 devuelven el mismo): **ningún 5xx, ningún sobrepago, saldo negativo ni aplicación mayor al pago**, y la cuadratura da cero después de cada ataque. Quince rondas de barrido (`materializarVencidos`) contra pagos con reparto manual en orden inverso: sin interbloqueo.
  - **Defensa en la base.** Con el rol sin dueño de la guía de `docs/API.md` (`SELECT, INSERT, UPDATE`): `INSERT` de una aplicación que sobrepasa el cargo (`cargo_importes_check`), de otra familia (`cargo_no_aplicable`) o de un pago que no se cubre (`pago_cubre_su_monto`), `UPDATE` de montos de aplicaciones, cambio de familia o de importes del cargo, `DELETE`, `TRUNCATE`, `DISABLE TRIGGER` y `SET session_replication_role` fallan cerrado. Los tests de la etapa cubren la mayoría (ver mutaciones). **Pero ese rol sí puede falsear los contadores** (EH-01).
  - **Cancelaciones (ataque B).** Pago ya cancelado, cargo con pagos, venta pagada, pagar un cargo cancelado: todos 409 con el saldo, el estado de cuenta y el stock coherentes; nada se borra.
  - **Generación mensual (ataque C).** 50 barridos en paralelo × 7 instantes en la frontera de mes y de zona (incluido 2028 bisiesto): un solo cargo por (inscripción, periodo); corte 31 cae 30 nov / 31 dic / 28 feb / 29 feb 2028; corte 29 cae 28 feb; congeladas y bajas no generan.
  - **Autorización (G).** El maestro recibe 403 en las 9 rutas de lectura y las escrituras de finanzas que se probaron; el asesor no escribe; otra organización y otra sucursal reciben 404 (cargo, pago, estado de cuenta, cancelar pago/cargo); los campos extra (`monto_aplicado`, `estatus`, `organizacion_id`, `monto_pagado`, `concepto`) se rechazan con 400.
  - **Aritmética del dinero.** Ni `Number(`, `parseFloat`, `toFixed` sobre importes, `*` ni `/` en `finanzas/`, `cobranza/` ni `api/rutas/finanzas-*`; todo en centavos `bigint`; la API rechaza números JSON y notación científica.
  - **Migraciones.** Las siete de H aplican sobre base vacía y sobre una base de la etapa G con datos (organización, 3 inscripciones activas, una congelada, una baja): filas intactas.
  - **Invariantes 1–14**: sin rupturas en lo nuevo (sección 5). Tests preexistentes: ninguno debilitado (sección 5).
  - **Correcciones G-fix**: las nueve del encargo se verifican (sección 6); EG-01 queda corto de cobertura (EH-10).
- **Lo que no se sostiene.** **1 ALTA, 10 MEDIA, 9 BAJA** (más 5 decisiones de producto). Lo que más pesa:
  - **EH-01 (ALTA).** El rol de la aplicación puede **falsear el dinero con un `UPDATE`/`INSERT` directo**: `UPDATE cargo SET monto_pagado = monto_final, estatus = 'pagado'` deja un cargo pagado sin pago; `INSERT` de un cargo ya «pagado» o de un pago con `monto_aplicado = monto` sin aplicaciones pasa todos los CHECK y el disparador diferido; `UPDATE cargo/pago SET eliminado_en` borra (lógicamente) un cargo pagado y deja que el barrido genere otra mensualidad. Solo la cuadratura lo ve, después. Va contra la regla de Eduardo «la defensa vive en la base aunque el código se equivoque».
  - **EH-02/EH-03 (MEDIA).** Dos garantías que dependen solo del código: el cargo de una venta se puede cancelar suelto por SQL (el disparador diferido vigila la venta, no el cargo), y la base libera un beneficio con **cualquier** mensualidad pagada, no con la primera. Las mutaciones M09 y M18 sobreviven.
  - **EH-04 (MEDIA).** La misma clave de idempotencia usada por dos familias a la vez → **500** (el único violado no se traduce).
  - **EH-07 (MEDIA).** `npm run cuadratura` contra una base viva da **falsas alarmas** (8 de 3 249 corridas mientras se pagaba): lee cinco tablas en cinco consultas sin instantánea común.
- **Mutaciones.** 65 (50 de código + 15 sobre la base): 46 mueren, 19 sobreviven; 4 equivalentes o redundantes y 15 son huecos de prueba o hallazgos (sección 4).

## 2. Tabla de hallazgos

Criterio de gravedad (el del encargo): ALTA = rompe un invariante, dinero o cupo mal calculado/duplicado/sobrepagado, saldo incoherente, cuadratura que no detecta una incoherencia, mensaje enviado indebidamente o perdido, fuga de datos, acceso no autorizado, pérdida de datos. MEDIA = una garantía documentada no se cumple o falla hacia el lado malo, sin explotación directa grave. BAJA = endurecimiento, deuda o inexactitud.

| ID | Gravedad | Archivo:línea | Resumen |
|---|---|---|---|
| EH-01 | **ALTA** | `prisma/migrations/20261021000000_cargos/migration.sql:101-115`, `…010000_pagos/migration.sql:162-178` | Contadores del dinero falseables por SQL directo del rol de la aplicación: `cargo.monto_pagado`/`estatus='pagado'`, `pago.monto_aplicado`, `INSERT` de cargo «pagado» o pago «aplicado» sin aplicaciones, `eliminado_en` de cargo/pago/aplicación/venta |
| EH-02 | MEDIA | `…030000_productos_ventas/migration.sql:164-187`, `src/finanzas/cargos.ts:272` | El cargo de una venta se puede cancelar suelto por SQL (el disparador diferido solo se dispara con la venta); el filtro `venta_id: null` del código no tiene test (M09 sobrevive) |
| EH-03 | MEDIA | `…020100_beneficios_diferidos_defensas/migration.sql:26`, `src/finanzas/beneficios.ts:50` | La base libera un beneficio diferido si **alguna** mensualidad con importe está pagada, no la primera; el código sí compara con la primera pero M18 sobrevive |
| EH-04 | MEDIA | `src/finanzas/pagos.ts:149` | La misma `clave_idempotencia` de dos familias a la vez → 500 (violación del único sin traducir; S04 sobrevive) |
| EH-05 | MEDIA | `src/finanzas/productos.ts:86`, `src/api/rutas/finanzas-productos.ts:179` | `POST /api/ventas` con `sucursal_id` inexistente o de otra organización → 500 (llave foránea sin validar) |
| EH-06 | MEDIA | `src/api/rutas/finanzas-beneficios.ts:32`, `src/finanzas/productos.ts:150` | Entregar un beneficio de producto acepta `cantidad` hasta 20: una pieza ganada entrega 20 sin cobro |
| EH-07 | MEDIA | `src/finanzas/cuadratura.ts:142` | La cuadratura lee cinco tablas en cinco consultas sin instantánea: falsas alarmas mientras se opera (8/3 249) |
| EH-08 | MEDIA | `src/finanzas/cuadratura.ts:76-130` | La cuadratura no compara cada cargo con el precio congelado de su inscripción (un cargo de monto equivocado cuadra) ni detecta un pago aplicado que cubre menos que su monto con `monto_aplicado` coherente (M35 sobrevive) |
| EH-09 | MEDIA | `prisma/schema.prisma:2930-2950` | `pago_aplicacion_pago_cargo_key` no está en el schema: `prisma migrate diff` ya no da «No difference detected» y el siguiente `migrate dev` genera `DROP INDEX`; ninguna prueba lo protege (S05 sobrevive) |
| EH-10 | MEDIA | `src/webhooks/clasificar.ts:33-60` | EG-01 corregido a medias: `P1000`, `P1003`, `P1010`, `P1011`, `P2021`, `P2022` y los `kind` del adaptador (`ConnectionClosed`, `SocketTimeout`, `TooManyConnections`, `DatabaseNotReachable`, `AuthenticationFailed`) se clasifican «inesperado» y el evento se pierde (200) |
| EH-11 | MEDIA (producto) | `src/finanzas/cargos.ts:213-262` | Inscripciones previas a H: no reciben cargo de inscripción ni meses pasados; el primer barrido genera el mes en curso, normalmente **ya vencido**, y la cobranza empieza a escribirles al día siguiente |
| EH-12 | BAJA | `src/finanzas/pagos.ts:120-127` | Reintentar con la clave de un pago **cancelado** responde 200 con ese pago cancelado (la caja puede leerlo como cobro) |
| EH-13 | BAJA | `src/finanzas/pagos.ts:146` | La fecha del pago no tiene cota inferior (`1900-01-01` pasa) |
| EH-14 | BAJA (producto) | `src/finanzas/estado-cuenta.ts:127` | El estado de cuenta de una familia muestra cargos de todas las sucursales a quien tiene alcance de una (el listado de cargos sí filtra) |
| EH-15 | BAJA (producto) | `src/api/permisos.ts:22` | La tarea `deuda_vencida` solo la ven administrador y asesor; recepción, que cobra, no |
| EH-16 | BAJA | `src/automatizaciones/motor.ts:430-450` | Ventana de milisegundos entre revalidar el cargo y enviar el recordatorio (el texto dice «si ya pagaste, ignora este mensaje») |
| EH-17 | BAJA (producto) | `src/reportes/clases-muestra.ts:97` | La conversión cuenta una inscripción de **otra vertical** o anterior a la clase del mismo prospecto como conversión de esa clase |
| EH-18 | BAJA | pruebas de H | Huecos de prueba que sobreviven: M08, M21, M32, M44, M50, S02, S14, S15 y los de EH-02/03/04/09 |
| EH-19 | BAJA | `src/finanzas/barrido.ts` | Barrido contra pagos: el interbloqueo es posible en teoría (filas en distinto orden); no se reprodujo en 15 rondas |
| EH-20 | BAJA (producto) | `src/finanzas/cargos.ts:101-110` | Inscribirse el último día del mes cobra el mes completo y, al día siguiente, el siguiente mes completo (sin prorrateo; decisión ya anotada por el implementador) |

Conteo: **1 ALTA, 10 MEDIA** (EH-02 a EH-11; EH-11 de producto), **9 BAJA** (EH-12 a EH-20; EH-14, 15, 17 y 20 de producto).

## 3. Detalle y evidencia

### EH-01 — El dinero se falsea por SQL directo con el rol de la aplicación (ALTA)

Procedimiento (base propia, rol `app_aud` creado con el `GRANT SELECT, INSERT, UPDATE ON ALL TABLES` de `docs/API.md`):
```
UPDATE cargo SET monto_pagado = monto_final, estatus = 'pagado' WHERE id = …;          → UPDATE 1  (cargo «pagado» sin ningún pago)
INSERT INTO cargo (…, monto_pagado, estatus) VALUES (…, 100, 100, 'pagado');            → INSERT 0 1
INSERT INTO pago (…, monto, monto_aplicado, …) VALUES (…, 100, 100, …);                 → INSERT 0 1  (cubre «exactamente su monto» sin aplicaciones)
UPDATE cargo SET eliminado_en = now() WHERE id = …;  UPDATE pago SET eliminado_en = …;  → UPDATE 1
```
Rechazados como debe ser: `DELETE`, `TRUNCATE` (permiso denegado), `DISABLE TRIGGER` (no es dueño), `SET session_replication_role` (permiso denegado), `UPDATE pago_aplicacion SET monto_aplicado`, `UPDATE pago SET monto_aplicado = monto_aplicado + 1` (CHECK `pago_importes_check`).
Por qué pasa: `cargo_blindaje` solo congela monto, descuento, responsable y vencimiento, no `monto_pagado` ni el paso a `pagado`; `pago_blindaje` no mira `monto_aplicado` ni `eliminado_en`; el disparador diferido `pago_cubre_su_monto` compara `monto_aplicado` con `monto`, no con las aplicaciones. La cuadratura lo detecta (`npm run cuadratura` sale con 1 y nombra `pagos_aplicados_igual_aplicaciones`, `saldo_de_cada_cargo`, `estatus_coherente_con_el_saldo`) pero después del hecho; el soft-delete de un cargo pagado ni siquiera lo ve (el cargo sale del alcance) y deja que el barrido genere otra mensualidad del mismo periodo (el único parcial excluye lo borrado).
Corrección: los contadores solo los mueve un disparador de aplicaciones (`pg_trigger_depth() > 1`), los cargos y pagos nacen con contadores en cero, y cargo/pago/aplicación/venta no admiten cambios de `eliminado_en` (se cancelan, no se borran). Test: SQL directo con cada una de las formas; mutación: quitar cada guarda.

### EH-02 — Cargo de una venta cancelable suelto (MEDIA)
`UPDATE cargo SET estatus='cancelado' WHERE venta_id IS NOT NULL` pasa en la base: `venta_cuadra_con_su_cargo_trg` es un disparador diferido sobre `venta`, no sobre `cargo`. El código lo evita con `venta_id: null` en `cancelarCargo`, pero quitar ese filtro (M09) no rompe ningún test. Corrección: disparador diferido también sobre `cargo` (cambio de estatus de un cargo con `venta_id`) + test de la API (409 `de_venta`) y de SQL.

### EH-03 — La base libera con cualquier mensualidad pagada (MEDIA)
El disparador `promocion_aplicacion_transicion` exige `EXISTS (cargo mensualidad pagado con monto_final > 0)` de la inscripción, no que sea la **primera**. Con `meses_pagados_por_adelantado` o un reparto manual, pagar el 2.º mes sin el 1.º sería suficiente para la base. El código (`primeraMensualidadDe`) sí lo compara, pero si se quita esa comparación (M18) ningún test falla. Corrección: el disparador exige que la primera (menor periodo no cancelado con importe) esté pagada + test de código y SQL.

### EH-04 — Misma clave, dos familias, 500 (MEDIA)
`registrarPago` serializa por el candado del tutor, así que la misma clave de la misma familia es segura (40 simultáneos: 1 × 201, 39 × 200). Con **dos** familias a la vez los candados son distintos, ambas pasan la lectura y la segunda inserción viola `pago_clave_idempotencia_key` → `P2002` → 500. Repetir: `A5b` del guion (dos POST simultáneos con la misma clave y tutores distintos → `[201, 500]`). Corrección: traducir la violación a `clave_reutilizada` (409) + test con barrera. La mutación S04 (quitar el único) sobrevive hoy.

### EH-05 / EH-06 — Ventas y entrega de beneficios (MEDIA)
- `POST /api/ventas` con `sucursal_id` aleatorio o de otra organización (con rol administrador, que no pasa por el filtro de alcance) → 500 por la llave foránea compuesta. `POST /api/cargos` sí lo valida. Corrección: validar que la sucursal exista en la organización (404).
- `POST /api/beneficios/:id/entregar { producto_id, cantidad: 20 }` crea una venta promocional de **20** piezas por un beneficio de «Uniforme». El beneficio no lleva cantidad, así que lo ganado es una pieza. Corrección: la cantidad de la entrega de un beneficio es 1 (la API ya no la acepta) + test.

### EH-07 — Cuadratura con falsas alarmas (MEDIA)
`cuadratura(db)` lanza cinco `findMany` en un `Promise.all` sobre conexiones distintas: cada una ve un instante. Repetir (`E1`): 150 cargos, 3 rondas de pagos de 10 en 10 simultáneos, y la cuadratura en bucle: 8 de 3 249 corridas reportan `Σ pagos aplicados 240.00 ≠ Σ aplicaciones vivas 250.00`; al terminar, cuadra. Si el comando se corre «tras cada migración o restauración» (K5) contra una base con tráfico, puede sonar la alarma sin motivo y enseñar a ignorarla. Corrección: una transacción `REPEATABLE READ` de solo lectura.

### EH-08 — Lo que la cuadratura no ve (MEDIA)
Cuadra consigo misma (pagos, aplicaciones, cargos, ventas) pero no compara el cargo con **lo que debió cobrar**: un cargo de mensualidad con `monto` distinto de `inscripcion.precio_mensualidad_aplicado` (un error del barrido, un precio sin congelar) cuadra perfecto. Tampoco hay regla de duplicado por (inscripción, periodo) para lo que el único parcial no ve (soft-delete). Y M35 sobrevive: un pago aplicado que cubre menos que su monto con `monto_aplicado` igual a la suma de sus aplicaciones no tiene test. Corrección: regla 8 `cargo_igual_al_precio_congelado` (monto de inscripción y de mensualidad contra la inscripción, descuento entre 0 y monto, una mensualidad por periodo) + tests.

### EH-09 — Deriva del schema (MEDIA)
`npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` sobre la base migrada devuelve `DROP INDEX "pago_aplicacion_pago_cargo_key"`: el único `(pago_id, cargo_id)` es un índice **simple** (no parcial) y Prisma sí lo espera en el schema. La auditoría anterior daba «No difference detected»; esta etapa lo rompió. Un `prisma migrate dev` futuro lo borraría en silencio. Corrección: declararlo en el modelo (`@@unique([pago_id, cargo_id], map: "pago_aplicacion_pago_cargo_key")`) + test SQL de la restricción.

### EH-10 — EG-01 incompleto (MEDIA)
`clasificarError` con códigos sintéticos: `P1000` (credenciales), `P1003`, `P1010`, `P1011` (TLS), `P2021`, `P2022` (tabla o columna inexistente: igual que `42P01`/`42703`, que sí están) y los `kind` de `DriverAdapterError` (`ConnectionClosed`, `SocketTimeout`, `TooManyConnections`, `DatabaseNotReachable`, `AuthenticationFailed`) dan `inesperado`. Una rotación de credenciales o una migración pendiente pierde eventos (200, constancia, nadie reintenta). Nadie puede escribirlos por WhatsApp, así que ampliar las listas no reabre el bucle del dato. Corrección: sumarlos a las listas estructurales + tabla de prueba.

### EH-11 — Inscripciones previas a H (MEDIA, producto)
Base de la etapa G + 3 inscripciones activas (una con `dia_corte_pago = 5`), migración H y un barrido el 18 de nov: 3 mensualidades de noviembre generadas **y ya vencidas** (vencían el día 5), sin cargo de inscripción ni meses anteriores; la congelada y la baja no reciben nada. Con las automatizaciones 808/809 activas, a las 24 horas empiezan los recordatorios «venció el pago…». No es un defecto del código sino una decisión no tomada. Se documenta; opciones para Eduardo: (a) dejarlo; (b) una bandera de organización «fecha de arranque de la cobranza» para que lo anterior a H no genere cargos ni recordatorios; (c) generar el mes en curso con vencimiento a partir de hoy. No se corrige sin su decisión.

### EH-12 a EH-20 (BAJA)
- **EH-12.** Repetir el POST con la clave de un pago cancelado devuelve 200 y el pago con `estatus: "cancelado"` (el cuerpo es veraz, el código HTTP invita a leerlo como cobro). Sugerido: 409 `pago_cancelado`. No se cambia: la pantalla futura decide.
- **EH-13.** Fecha de pago sin cota inferior (`1900-01-01`). Poner un tope razonable (1 año atrás) es decisión de la escuela.
- **EH-14.** `estadoDeCuentaDeFamilia` suma los cargos de todas las sucursales de la familia aunque el usuario solo vea una (el tutor es visible si algún hijo está en su sucursal). Probablemente deseado (la familia debe un total); anotado.
- **EH-15.** Recepción cobra pero no ve las tareas `deuda_vencida` (solo administrador y asesor).
- **EH-16.** Entre `cargarCobro`/`revalidarCobro` y `despachar` hay milisegundos; un pago en esa ventana deja salir un recordatorio de un cargo ya pagado. Evaluado: aceptable por el texto de la plantilla; la mitigación barata (revalidar justo antes de despachar) se aplica en la fase 2.
- **EH-17.** `inscritas` = prospectos con **cualquier** inscripción, de cualquier vertical y de cualquier fecha; una familia que asistió a una clase muestra de una vertical y se inscribió en otra suma como conversión de la primera. Definición documentada, pero engañosa en el desglose por vertical.
- **EH-18.** Mutaciones que sobreviven por falta de prueba, en sección 4.
- **EH-19.** El barrido (`UPDATE … SET estatus='vencido'` sobre muchas filas) y un pago (filas en orden de reparto) pueden tomar candados en orden distinto; Postgres abortaría a uno con 40P01 (el pago daría 500, reintento seguro por la clave). No se reprodujo en 15 rondas × 8 pagos × 4 barridos (180 pagos, 0 errores).
- **EH-20.** Ver sección 7.

## 4. Mutaciones (65: 50 de código, 15 sobre la base)

Cada una se aplicó sobre una copia limpia, se corrió el subconjunto de pruebas del área (unitarias primero, luego de integración) y se restauró. **Mueren 46; sobreviven 19.**

Sobreviven (código): `M06` (el barrido no genera el mes de inicio de una inscripción previa a H: se cubre en la fase 2), `M07` (equivalente: el periodo en curso nunca está en la lista de anteriores), `M08` (`materializarVencidos` con `lte`: marca vencido el mismo día de vencimiento), `M09` (EH-02), `M18` (EH-03), `M21` (repetir la revisión de un beneficio entregado), `M29` (redundante con la suma por pago), `M32` (aplicación revertida de un pago no cancelado), `M35` (EH-08), `M38` (la cobranza programa para una baja y el motor la omite al revalidar: equivalente en el efecto), `M41` (equivalente: `ejecutado_en: null` ya excluye lo enviado), `M43` (equivalente), `M44` (un cargo cancelado muestra saldo en el estado de cuenta), `M50` (venta de un producto de precio 0).
Sobreviven (base): `S02` (`pago_cancelacion_check`), `S04` (único de la clave de idempotencia: EH-04), `S05` (único pago/cargo: EH-09), `S14` (único venta/beneficio), `S15` (único de la tarea de deuda).
Mueren, entre otras: los 6 CHECK/disparadores principales (`cargo_estatus_saldo_check`, `cargo_blindaje`, `pago_blindaje`, `pago_aplicacion_cambio`, `pago_aplicacion_reversa`, `cargo_no_se_borra`, `promocion_aplicacion_transicion`, `venta_promocional_check`, únicos de mensualidad y de inscripción), el orden y el reparto del pago, el excedente, la idempotencia, el sobrepago, la cancelación, el stock, la vertical del producto, el estatus efectivo, los bordes de antigüedad (30/31/60/61/90), los meses gratis y adelantados, el tope de intentos y de atraso de la cobranza, la baja y el pago que cancelan recordatorios, y las reglas de la cuadratura (salvo M29, M32 y M35).

## 5. Invariantes y pruebas preexistentes

| # | Resultado |
|---|---|
| 1 | Todo por `conAlcance`; los disparadores filtran por `organizacion_id`; `check:capas` pasa. IDOR entre organizaciones: 404 en las 6 rutas probadas |
| 2 | `check:generico` pasa; las plantillas y automatizaciones de cobranza son datos del seed |
| 3 | Sin `DELETE` físico (disparadores y permiso del rol). **Falta** impedir el soft-delete del dinero: EH-01 |
| 4 | Cobranza sale por `encolar` + `despachar` de `MessagingProvider`; nadie llama a Twilio ni a Chatwoot |
| 5 | El recordatorio fuera de la ventana de servicio va como plantilla aprobada `utility`; sin plantilla apta, tarea (`cobranza_sin_canal`) |
| 6 | `recordatorio_pago_*` declaradas `servicio` (CHECK de la clase): salen con una persona atendiendo; baja total, horario y frecuencia siguen aplicando (pruebas de la etapa) |
| 7 | La cobranza busca la conversación por el teléfono normalizado del tutor |
| 8 | Pagos: único por clave (EH-04: hueco en la concurrencia entre familias). Generación: único parcial por (inscripción, periodo). Cobranza: único por (automatización, cargo, ocurrencia). Tarea de deuda: una por cargo en toda su vida |
| 9 | Webhooks sin cambios en H; EG-01 corregido a medias (EH-10) |
| 10 | Sin LLM; todo cálculo en centavos `bigint` |
| 11 | Sin integraciones nuevas |
| 12 | Todo corre en local |
| 13 | El cargo es del tutor responsable y del alumno; un pago solo cubre cargos del mismo tutor (disparador) |
| 14 | Cobranza: 06:00 sale a las 09:00, domingo a lunes, por vencer descartado si llega tarde (pruebas de la etapa; confirmadas) |

**Tests preexistentes** (`git diff etapa-G..HEAD` sobre `*.test.ts`/`*.itest.ts` que ya existían): `atencion-humana-matriz.itest.ts` (se agregó `recordatorio_pago_*` a las plantillas de servicio y a la lista de las del seed: es lo acordado en INV-6, no una relajación; el prefijo es un comodín, anotado), `configuracion.itest.ts` (tres `deepEqual` completos ganan el campo `umbralDiasDeuda: 15`: más estrictos, no menos), `rutas.test.ts` (24 rutas nuevas con su permiso declarado: el test sigue exigiendo que toda ruta declare permiso). Ninguno debilitado.

**Desde cero.** `npm ci`: exit 0. `npm run validar`: 588 tests, exit 0. `npm run test:int` sobre base vacía: 1 006 tests, exit 0. Migraciones: base vacía ✓, base con datos de la etapa G ✓. `prisma migrate diff`: **no** limpio (EH-09).

### Notas de los ataques D y E (cuadratura y aritmética del dinero)

- **La cuadratura falla cuando debe.** Se corrompió una base real por SQL (con el rol sin dueño de la guía y con los disparadores apagados) de seis formas —cargo «pagado» sin aplicaciones, pago «aplicado» sin aplicaciones, aplicación de un pago borrado de forma lógica, cargo con estatus que miente, `monto_pagado` movido a mano, cargo de una venta cancelado a mano— y `npm run cuadratura` salió con **1** nombrando `pagos_aplicados_igual_aplicaciones`, `saldo_de_cada_cargo` y `estatus_coherente_con_el_saldo` (con el id de la fila rota). Stock negativo y centavos fraccionarios no se pueden fabricar: los frenan `producto_stock_check` y `Decimal(12,2)`. Las mutaciones de cada regla (M26–M35) matan salvo las redundantes (M29, M32, M35: ver EH-08/EH-18).
- **La prueba de propiedad no es tautológica.** `cuadratura.itest.ts` arma cada estado por la API real (inscribir, pagar, cancelar, vender, anular, congelar, barrido de meses), usa tres semillas fijas con un PRNG propio, una organización nueva por corrida (no depende del orden ni de otras bases) y compara el estado de cuenta con una suma independiente (agregados de cargos y aplicaciones, no las funciones de la cuadratura). Su límite: solo genera estados que el código produce, así que no prueba la detección de corrupciones (eso lo hacen los unitarios sobre filas sintéticas) ni que el cargo cobre lo correcto (EH-08).
- **Dinero exacto.** `Number(`, `parseFloat`, `toFixed`, `Math.*`, `*` y `/` sobre importes: ninguno en `finanzas/`, `cobranza/`, `api/rutas/finanzas-*`; `toFixed(2)` solo en `lib/dinero.ts` (`deDecimal`), que pasa por texto. Límites probados contra el validador de importes de la API (`dinero()`): `"9999999999.99"` entra; `"10000000000.00"`, `"-1.00"`, `"1e3"`, `"0.001"`, `"NaN"`, `"1,000.00"`, `"1."`, `".5"`, dígitos no ASCII y un número JSON se rechazan (400); `"-0"` y `"00012.5"` equivalen a 0 y 12.50. `check:dinero` sigue siendo una heurística por zonas: un módulo nuevo fuera de las zonas (`src/tableros/`, un `api/rutas/` de otro nombre) que calcule dinero con flotantes no se vigila hasta que alguien lo agregue a `ZONAS_DE_DINERO`; `lib/` queda fuera a propósito (solo conteos).
- **Cobranza (F).** Confirmado con las pruebas de la etapa y el motor: 06:00 sale a las 09:00, domingo a lunes, plantilla de servicio con una persona atendiendo sale (y con baja total no), tope diario, idempotencia por (automatización, cargo, ocurrencia), cancelación al saldar, cancelar y dar de baja, y tarea por deuda una sola vez por cargo; el texto no lleva salud (solo nombre de pila, concepto, monto y fecha). La ventana de milisegundos es EH-16.

## 6. Verificación de correcciones G (`G-fix`)

Método: sobre una copia de HEAD se revirtió **solo el código fuente** de cada commit `G-fix` (`git diff c^ c` sin pruebas ni docs, aplicado en reversa) y se corrió el test que el commit agregó o cambió. Los seis commits son los de `git log --grep='G-fix'`.

| ID | Commit | Resultado | Observación |
|---|---|---|---|
| EG-01 | `9290dc6` | **verificado** (con observación) | Revertido: fallan 2 tests de clasificación y el de Prisma/Postgres reales; la estructura manda sobre el texto. Observación: las listas no cubren `P1000`, `P1003`, `P1010`, `P1011`, `P2021`, `P2022` ni los `kind` del adaptador → **EH-10** |
| EG-02 | `9290dc6` | verificado | Revertido: falla el test de `account.id`/`inbox.id` fuera de rango y el de cada defensa por separado |
| EG-03 | `bc36161` | verificado | Revertido: falla el test del pase del grupo nuevo (500 por el índice único) |
| EG-04 | `bc36161` | verificado | Revertido: falla el test de repetir el pase tras un corte |
| EG-06 | `9290dc6` | verificado | Las dos mutaciones de la constancia mueren con los tests del commit |
| EG-07 | `ebbaa48` | verificado | Revertido: falla «un peldaño más bajo con fecha posterior no hace retroceder» |
| EG-08 | `5c4daf2` | verificado | Revertidos `servidor.ts` y `api.ts` (comodín `listen(0)`): falla `servidor.test.ts`. `escucharSinReuso` ahora escucha en `127.0.0.1` |
| EG-10 | `2f4f945` | verificado | El commit es solo de prueba: se aplicó la mutación (quitar el filtro de vertical de `clasesDeLaVertical`) y el test `EG-10` falla; el resto del archivo pasa |
| EG-11 | `2f4f945` | verificado | Quitar `eventos/` y `expediente/` de `ZONAS_DE_DINERO`: falla `EG-11` de `check-dinero.test.ts`. `H` agregó más zonas sin quitarlas |
| EG-16 | `b637ef8` | verificado | Revertido `inscribir.ts`: falla «cotización cuyo último día ya pasó» |
| EG-05 | — | **pendiente → decisión de Eduardo** | Se implementa en la fase 2 (commit aparte) |

## 7. Decisiones de producto para Eduardo

1. **EH-11.** ¿Qué pasa con las inscripciones anteriores a H? (a) nada especial (hoy), (b) fecha de arranque de la cobranza por organización, (c) mes en curso con vencimiento desde el día del primer barrido.
2. **EH-20.** Inscribirse el último día del mes: ¿prorrateo, o mes gratis hasta el siguiente? Hoy cobra el mes entero y al día siguiente otro.
3. **EH-14 / EH-15.** ¿El estado de cuenta debe limitarse a las sucursales de quien lo consulta? ¿Recepción debe ver la tarea de deuda?
4. **EH-12 / EH-13.** ¿Reintentar con la clave de un pago cancelado debe ser 409? ¿Cuánto hacia atrás se puede fechar un pago?
5. **EH-17.** Conversión por vertical: ¿solo cuenta la inscripción en la misma vertical y posterior a la clase?
6. **EG-05 (decidida).** El tope de marketing de 1 cada 7 días se aplica por la **clase declarada** de la plantilla. Consecuencia: la recuperación de quien no llegó (2 intentos) y el reenganche (que son `utility` en Meta pero `marketing` en clase) quedan sujetos al tope; ver la bitácora.
7. Las seis decisiones abiertas del cierre de H1–H5 (reactivar a mitad de mes, excedente como crédito, descuento diferido, stock por sucursal, ventana para cancelar pagos viejos, un responsable de pago por cargo) siguen abiertas.

---

Estado al 9 de octubre: ver docs/HALLAZGOS-ABIERTOS-V1.md
