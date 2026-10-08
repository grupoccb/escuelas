# Auditoría adversarial de la etapa F (F-pre, F1–F7: familia e inscripción, noche 2)

Auditor: sesión con contexto nuevo, sin haber escrito el código. Fecha: 8 de octubre de 2026.
Objeto: rama `noche-2`, HEAD `2b93aaf`, diff `etapa-E..HEAD` sin `docs/` (62 archivos, +6 270 / −86), más la verificación independiente de las correcciones de C, D y E (`C-fix`, `D-fix`, `E-fix`).
Método: copia limpia del commit (`git archive HEAD | tar -x -C <tmp>`), Postgres propio (`docker run --rm --name auditoria-ef-pg … postgres:16-alpine`, puerto 5601; un segundo, `auditoria-ef-pg2`, puerto 5602, para el verificador de C/D/E) con bases `*_pruebas` propias. No se usó la `DATABASE_URL` del `.env` ni la base de la demo, ni el proyecto compose `inscripciones`. Nada contra Twilio, Meta, AWS ni `wa.me`. En la fase 1 no se editó nada del repositorio salvo este archivo. Los guiones del auditor (ataques por SQL directo, concurrencia, API, mutaciones) viven en el directorio temporal de la sesión; cada hallazgo trae el procedimiento para repetirlo.

## 1. Resumen ejecutivo

- **Lo que se sostiene.**
  - Desde cero, todo lo que la bitácora cita se reproduce: `npm ci` + `npm run validar` (**506** tests, exit 0), `npm run test:int` (**835** tests, exit 0) en la primera corrida sobre base vacía y en la segunda seguida sobre la misma base.
  - Migraciones: las ocho de F aplican sobre base vacía y sobre una base en el estado de la etapa E con datos (2 organizaciones, 8 leads con prospecto, cotización, clase muestra, registro del maestro completo, 8 fichas de salud cifradas, aceptaciones). Las 56 tablas preexistentes conservan exactamente sus filas; aparecen 6 tablas nuevas (`tutor`, `alumno`, `tutor_alumno`, `inscripcion`, `inscripcion_movimiento`, `motivo_baja`); `prisma migrate diff --from-config-datasource --to-schema` da «No difference detected» sobre la base migrada desde E y sobre la creada desde cero.
  - **Cupo (el centro de la etapa).** Se atacó por SQL directo con una conexión propia: el grupo lleno rechaza la inscripción N+1, reactivar una congelada, mover una activa a un grupo lleno, resucitar una borrada y pasar una baja a activa (con o sin limpiar sus campos); dos activas del alumno en el mismo grupo, precio negativo, descuento mayor que el precio, día de corte 32, meses negativos, otra organización por llave foránea, `cupo_maximo` ≤ 0, `UPDATE`/`DELETE`/`TRUNCATE` de `inscripcion_movimiento`: todo falla cerrado. Concurrencia real contra Postgres (30–50 hilos): inscribir + cambiar de grupo + reactivar + alta por SQL directo sobre el mismo grupo con cupo 1, 3 y 10 deja exactamente 1, 3 y 10 activas y ningún error distinto del rechazo del disparador; 30 cambios cruzados A↔B simultáneos no se interbloquean. Sin el `FOR UPDATE` del disparador falla un test, con `>=` por `>` fallan tres, sin el disparador fallan cuatro.
  - **Dinero.** Los importes salen de `precioVigente`/`dinero.ts` (texto con dos decimales, centavos enteros), ningún `Number`/`parseFloat` en el código nuevo, y los tests de precio congelado, descuento y promoción pasan con las mutaciones correspondientes (sección 4).
  - **Fuga de salud.** El test de centinelas (`fuga.itest.ts`) cubre alta de alumno, captura de salud, conversión (la ficha se muda de prospecto a alumno), inscripción y lecturas de la familia: ni logs, ni respuestas, ni ninguna fila de ninguna tabla de la organización llevan los valores. Rutas nuevas con permisos declarados, cuerpos estrictos (campos desconocidos rechazados) y registro de cambios sin valores identificables.
  - **Pruebas preexistentes.** Los cambios a tests existentes son los esperables (matriz de permisos del maestro, configuración con `modoCierre`, 28 líneas nuevas en `rutas.test.ts`, `FK` real en `promociones.itest.ts`); ninguna aserción relajada ni guarda `check:*` debilitada.
- **Lo que no se sostiene.** **1 hallazgo ALTA**, **8 MEDIA** y **17 BAJA** (EF-16 a EF-26 son defectos de C/D/E que encontró la verificación independiente). Los que más pesan:
  - **EF-01 (ALTA).** La conversión de un lead (`POST /api/leads/:id/convertir`) no comprueba que el grupo esté dentro del alcance de sucursales de quien convierte: un asesor del sur inscribe a un lead del sur en un grupo del norte y le consume el cupo (201, demostrado). `POST /api/inscripciones` sí lo impide (404) y su test no existe para la conversión.
  - **EF-02.** La bienvenida de inscripción toma «la conversación más reciente del teléfono del tutor» sin mirar la vertical: si la familia escribió a dos verticales, el aviso de la inscripción en una sale por el canal de la otra.
  - **EF-03.** El maestro (permiso `inscripciones:leer`) ve precios, descuentos, promociones y la cotización de las inscripciones de sus grupos.
  - **EF-04.** «Precio congelado» y «el grupo es del programa» no tienen defensa en la base: una escritura directa puede cambiar el precio aplicado o mover una inscripción a un grupo de otro programa.
  - **EF-05.** 19 de 64 mutaciones sobreviven; 13 son huecos de prueba reales (entre ellos, que los permisos de alumno y de grupo al inscribir se tapan entre sí, y que el precio se toma «hoy» y no «el día de inicio»).
- **Bitácora.** Todo «HECHO» de F-pre y F1–F7 se reproduce con las cifras que cita (506, 835, base vacía incluida). La lista de «decisiones abiertas» es completa; esta auditoría añade tres a la sección 8.

## 2. Tabla de hallazgos

Criterio de gravedad: ALTA = rompe un invariante, cupo/dinero mal calculado o duplicado, mensaje enviado indebidamente o perdido, fuga de datos sensibles o entre organizaciones, acceso no autorizado, pérdida de datos. MEDIA = una garantía documentada no se cumple, falla hacia el lado malo o hay un hueco de prueba con semántica de negocio, pero sin explotación directa grave. BAJA = endurecimiento, deuda o inexactitud.

| ID | Gravedad | Archivo:línea | Resumen |
|---|---|---|---|
| EF-01 | **ALTA** | `src/api/rutas/conversion.ts:143-154`, `src/conversion/convertir.ts:188-206` | La conversión no limita el grupo al alcance de sucursales del asesor: inscribe (y consume cupo) en un grupo de otra sucursal; `POST /api/inscripciones` sí lo impide (demostrado: 201) |
| EF-02 | MEDIA | `src/automatizaciones/motor.ts:628-636` | La bienvenida de inscripción elige la conversación más reciente del teléfono sin filtrar por la vertical de la inscripción: puede salir por el canal de otra vertical |
| EF-03 | MEDIA | `src/inscripciones/presentar.ts:66-109`, `src/api/permisos.ts` | El maestro ve precios, descuentos, meses gratis, promociones y cotización de las inscripciones de sus grupos (demostrado) |
| EF-04 | MEDIA | `prisma/migrations/20261016010000_inscripcion`, `…011000_cupo_en_la_base` | Sin defensa en la base: cambiar el precio/descuentos aplicados tras inscribir, o inscribir en un grupo de otro programa que `inscripcion.programa_id` (regla 3 de Eduardo) |
| EF-05 | MEDIA | secciones 3 y 4 | 19 mutaciones sobreviven de 64; 13 son huecos de prueba reales (entre ellos EF-05a: los chequeos de alumno visible y de grupo visible al inscribir se enmascaran uno al otro) |
| EF-06 | MEDIA (producto) | `src/clases-muestra/agenda.ts:67-81`, `src/inscripciones/inscribir.ts` | Una inscripción no cuenta las clases muestra agendadas: se puede llenar el grupo con una muestra ya agendada y la sesión queda sobrevendida (decisión documentada en F4, sin cifras) |
| EF-07 | MEDIA (producto) | `src/api/rutas/familias.ts:376-389` | Dar de alta un alumno con el teléfono de un tutor de OTRA sucursal liga a ese tutor y devuelve su nombre, apellidos y correo (demostrado); el acceso directo da 404 |
| EF-08 | BAJA | `src/inscripciones/hermanos.ts:15`, `src/familias/cross-sell.ts`, `src/familias/alcance.ts` | Las condiciones anidadas (`inscripciones: { some: { estatus: "activa" } }`) no pasan por el alcance: una inscripción con baja lógica contaría como hermano/hijo inscrito |
| EF-09 | BAJA | `scripts/check-dinero.ts:36` | `src/inscripciones/` y `src/conversion/` mueven dinero y no están en las zonas estrictas de `check:dinero` |
| EF-10 | BAJA | `docs/API.md:383` | El `REVOKE UPDATE` del rol de la aplicación no lista `inscripcion_movimiento`, de solo anexar |
| EF-11 | BAJA | `src/inscripciones/inscribir.ts:183` | Dos hermanos inscritos a la vez no se ven entre sí (cada transacción cuenta 0 hermanos inscritos): ninguno recibe la promoción por hermanos (razonado, no demostrado) |
| EF-12 | BAJA (producto) | `src/conversion/cierre.ts:55` | Con el primer hijo inscrito el lead pasa a «inscrito»: «listo para cerrar» del segundo hijo responde 409 `ya_inscrito` y el seguimiento del lead se detiene |
| EF-13 | BAJA (producto) | `src/inscripciones/inscribir.ts:144` | `meses_pagados_por_adelantado` es una declaración: quien inscribe activa la promoción de pago anticipado sin evidencia de pago (hasta H2) |
| EF-14 | BAJA | `src/inscripciones/bienvenida.ts` | Dos hijos convertidos a la vez = dos bienvenidas; apagar la automatización no cancela las ya programadas (heredado, anotado en la bitácora) |
| EF-15 | BAJA | `docker-compose.yml`, `docs/API.md:370` | En la demo la aplicación es superusuaria: `SET session_replication_role = replica` desactiva los disparadores de cupo (demostrado); la guía de roles de producción ya lo cubre (K6) |
| EF-16 | MEDIA | `src/captacion/maquina.ts:373,384` (D-1) | Hermano de EC-04: con lista de espera permitida, un grupo que se llena entre la cotización y la respuesta sigue diciendo «¡Listo! Anotamos a…» |
| EF-17 | MEDIA | `src/http/*.test.ts`, `src/testutil/` (D-2) | ED-06 no está resuelto de raíz: servidores de prueba en comodín conviven con otros en `127.0.0.1` del mismo puerto (macOS) y los tests paralelos se cruzan |
| EF-18 | BAJA | `src/catalogo/salones.ts:11` (D-3) | `claveDeSalon` no quita caracteres invisibles (U+200B, U+00AD, U+200D): «Sala​ Uno» es otro salón |
| EF-19 | BAJA | `src/captacion/entrante.ts` (D-4) | NUL en `referral.*`, `ctwa_clid` o el id del mensaje sigue dando 500 en el webhook |
| EF-20 | BAJA | `scripts/check-dinero.ts` (D-5) | Quedan evasiones de `check:dinero` en `src/promociones/` (`x * .15`, `.map(Math.round)`, `(0, Math.round)(x)`…) |
| EF-21 | BAJA | `src/sensibles/registro-salud.ts` (D-6) | El filtro de texto libre deja pasar «está enfermo», «gripe y fiebre», «tdah», «autismo», «a s m a» |
| EF-22 | BAJA | `src/captacion/entrante.ts:496` (D-7) | La etapa inicial del lead del bot solo excluye las banderas `es_ganado/es_perdido`, no `tipo_sistema` (la landing sí) |
| EF-23 | BAJA | `src/captacion/landing.ts:208` (D-8) | El honeypot usa el número de canal por omisión y el envío real el de la sucursal: distinguibles con dos canales |
| EF-24 | BAJA | `src/captacion/landing.ts:127` (D-9) | `INVISIBLES` solo quita la categoría `Cf`: los rellenos Hangul pasan como nombre; `wa . me/123` evade `DIRECCION_WEB` |
| EF-25 | BAJA | `src/http/landing.ts:44` (D-10) | `Origin: null` sin `Sec-Fetch-Site` pasa (documentado) |
| EF-26 | BAJA | `src/mensajeria/chatwoot/transporte.test.ts:38` (D-11) | El test «200 con id» usa `timeoutMs = 300` y falla bajo carga |

Conteo: **1 ALTA, 8 MEDIA** (EF-02 a EF-07, EF-16, EF-17; dos de ellas de producto), **17 BAJA** (EF-08 a EF-15 y EF-18 a EF-26).

## 3. Detalle y evidencia

### EF-01 — La conversión no respeta el alcance de sucursales del grupo (ALTA)

`POST /api/leads/:id/convertir` comprueba que el *lead* sea de las sucursales del asesor (`acceso`, `conversion.ts:116-129`) y, solo para el maestro, que el grupo pedido sea de las sucursales donde da clases (`conversion.ts:143-154`). Para el asesor no hay ninguna comprobación del grupo: ni el que viaja en `inscripcion.grupo_id` ni el que `planear` deduce de la cotización o de la recomendación del maestro (`convertir.ts:182-206`). `POST /api/inscripciones` y `…/cambiar-grupo` sí lo exigen con `dondeInscripcionVisible(ctx)["grupo"]`. La conversión es entonces un camino lateral para saltarse el aislamiento por sucursal y para gastar el cupo de una sucursal ajena.
Repetir (guion `atq3.ts`): organización con sucursales Norte y Sur, un asesor ligado solo a Sur, un lead de Sur con reglamento aceptado y un grupo de Norte; `POST /api/leads/<lead>/convertir {"tutor":{"parentesco":"madre"},"prospectos":[{"prospecto_id":"…","alumno":{"apellidos":"Perez","fecha_nacimiento":"2018-01-01"},"inscripcion":{"grupo_id":"<grupo de Norte>"}}]}` → **201**, alumno inscrito en el grupo de Norte. En la misma organización, `POST /api/inscripciones` de una recepción de Norte a un grupo de Sur → 404.
Corrección: el alcance de grupo entra a `planear` (un filtro opcional de grupos visibles): un grupo fuera de alcance, explícito o deducido, no existe para quien convierte (el explícito, 404; el deducido, falta de datos con el mismo texto que «el grupo no existe»). Test: asesor del sur con grupo del norte explícito (404), con grupo del norte deducido de la cotización (409 `faltan_datos`) y el administrador sí puede (201); mutación: quitar el filtro.

### EF-02 — La bienvenida puede salir por el canal de otra vertical (MEDIA)

`conversacionDeBienvenida` busca `conversacion` con `lead.telefono = <teléfono del tutor responsable>` ordenada por `creado_en desc`, sin filtrar por la vertical de la inscripción. Un lead es único por `(organización, vertical, teléfono)` (`lead_telefono_vivo_key`) y cada vertical tiene su propio canal/bandeja, así que una familia que escribió a dos verticales tiene dos conversaciones con el mismo teléfono. Si la más reciente es la de la otra vertical, «¡Bienvenidos! … quedó inscrito en <grupo>» sale por el número de esa otra vertical, a la conversación equivocada, con su ventana de servicio y su historial.
Corrección: primero la conversación de la vertical de la inscripción (por el teléfono del responsable de pago), luego la del lead de origen de la inscripción, y si ninguna es de esa vertical, no se manda (tarea para el asesor), no se «adivina» otra vertical. Test: familia con dos verticales, la más reciente de la otra vertical; la bienvenida va a la de la vertical inscrita, y sin conversación de esa vertical deja tarea y no envía.

### EF-03 — El maestro ve el dinero de las inscripciones (MEDIA)

`inscripciones:leer` incluye al maestro (lo que necesita: quiénes están inscritos en sus grupos) pero `presentarInscripcion` devuelve a todos los roles `precio_*_aplicado`, `descuento_*_aplicado`, `meses_gratis_aplicados`, `meses_pagados_por_adelantado`, `promociones` (con montos), `promocion_id`, `cotizacion_id` y `lead_id`. Demostrado (`atq3.ts`, T4): `GET /api/inscripciones` como maestro devuelve `precio_mensualidad_aplicado: "800.00"` y los descuentos. Es el mismo criterio que EC-10 (catálogo) pero sobre lo que cada familia negoció.
Corrección: para el rol maestro la presentación omite los importes, las promociones, la cotización y el lead; conserva alumno, grupo, estatus y fechas. Test con centinelas de importe.

### EF-04 — Precio congelado y coherencia programa/grupo sin defensa en la base (MEDIA)

La regla 3 de Eduardo pide una defensa en la base que falle cerrada aunque el código se equivoque. Para el cupo existe (disparador `inscripcion_cupo_maximo`, probada). Para el dinero, la base solo acota (`>= 0`, `descuento <= precio`, día 1–31): nada impide `UPDATE inscripcion SET precio_mensualidad_aplicado = …` después de inscribir (el «precio congelado» es solo una promesa del código), ni que `inscripcion.programa_id` difiera del programa del grupo (el cambio de grupo y el precio asumen que son el mismo).
Corrección: migración `20261017…`: el disparador de cupo también comprueba `grupo.programa_id = NEW.programa_id`; un disparador `BEFORE UPDATE` rechaza cambiar `precio_*_aplicado`, `descuento_*_aplicado`, `meses_gratis_aplicados`, `meses_pagados_por_adelantado`, `fecha_inscripcion`, `alumno_id` y `programa_id`. Test por SQL directo para cada columna y mutación de cada una.

### EF-05 — 19 mutaciones sobreviven (MEDIA)

Ver la sección 4.

### EF-06 — Clase muestra e inscripción no se cuentan entre sí (MEDIA, producto)

`calcularLugaresDeSesion = cupo − inscripciones activas − clases muestra agendadas en esa fecha` (D1), pero la inscripción solo cuenta inscripciones. Con cupo 10, 9 inscritas y una muestra agendada, la sesión muestra 0 lugares; si entonces se inscribe un décimo alumno (9 < 10) la sesión del día queda con 10 + 1. La bitácora de F4 lo declara decisión («una clase muestra agendada no es una inscripción»). Se deja a Eduardo (sección 8): el costo es que un grupo puede tener un niño de más en esa clase; la alternativa (inscribir contando las muestras de la próxima sesión) quita lugares a quien paga para guardárselos a quien viene a probar.

### EF-07 — Alta de alumno por teléfono ajeno devuelve los datos del tutor de otra sucursal (MEDIA, producto)

`POST /api/alumnos` con `tutores: [{ tutor: { telefono } }]` llama a `encontrarOCrearTutor`: si el teléfono ya es de un tutor lo liga («detección de familia») y la respuesta incluye `tutores[].nombre/apellidos/correo` del tutor existente. Demostrado (`atq4.ts`): el asesor del sur obtiene nombre y correo de un tutor del norte (que por `GET /api/tutores/:id` le da 404) con solo saber el teléfono. La detección entre sucursales es deliberada (hermanos en dos sucursales); lo que se puede acotar es lo que se devuelve. Decisión para Eduardo: o se oculta nombre/apellidos/correo de tutores fuera de alcance hasta que el administrador confirme el vínculo, o se acepta como el costo de la detección.

### EF-08 a EF-15 (BAJA)

- **EF-08.** `conAlcance` no filtra relaciones anidadas (lo dice su encabezado): `alumno.findMany({ where: { inscripciones: { some: { estatus: "activa" } } } })` cuenta una inscripción con `eliminado_en`. Hoy ninguna ruta borra inscripciones, así que solo es alcanzable por SQL, pero es la clase de error que el invariante 3 quiere evitar. Se añade `eliminado_en: null` a las condiciones anidadas de `hermanos.ts`, `cross-sell.ts` y `alcance.ts`.
- **EF-09.** `ZONAS_DE_DINERO` no incluye `inscripciones/` ni `conversion/`. Hoy están limpias.
- **EF-10.** `docs/API.md:383`: falta `inscripcion_movimiento` en el `REVOKE UPDATE` (el disparador lo cubre, pero el dueño de la tabla puede quitarlo; la guía existe justo para eso).
- **EF-11.** `hermanosInscritos` cuenta inscripciones *activas ya confirmadas*; dos hermanos que se inscriben simultáneamente por separado no se ven y ninguno recibe la promoción. La conversión de un lead con dos hijos sí funciona (misma transacción). Se deja como limitación documentada; la corrección exigiría un candado por familia (decisión de producto: se prefiere que gane el cliente).
- **EF-12.** Producto: ver sección 8.
- **EF-13.** Producto: `meses_pagados_por_adelantado` lo declara quien inscribe (hasta 24). Con una promoción de pago anticipado de efecto inmediato basta declararlo. H2/H4 deben verificarlo contra el pago.
- **EF-14.** Heredado de F7 (anotado por el implementador).
- **EF-15.** Demostrado: con `session_replication_role = replica` la conexión superusuaria inserta la inscripción N+1 sin que el disparador actúe (ataque 15b). Es el aviso de la guía de roles; queda como requisito de K6, no de código.

### EF-16 a EF-26 (hallazgos nuevos en C/D/E, de la verificación independiente)

Ver la sección 6 para los demás. **EF-16** (D-1): el arreglo de EC-04 cubre `oferta === "sin_lugar"` pero no `lista_de_espera`; reproducción: `escenarioBot` con `permiteListaEspera: true`, `OcupacionFija.fijar(grupo, 10)` tras cotizar y contestar «1». **EF-17** (D-2): comprobado con `adv/puerto.mjs` que un servidor en `127.0.0.1:P` y otro en el comodín `:P` de otro proceso conviven en macOS y las peticiones a `127.0.0.1:P` llegan al específico; `escucharSinReuso` usa `listen(0)` (comodín) y otros tests `listen(0, "127.0.0.1")`; con 8 procesos paralelos 13 de 24 corridas fallan.

## 4. Mutaciones sobre las reglas de F (64 a código y 6 a migraciones)

Procedimiento: un guion (`mut.mjs`) aplica la mutación en una copia con su base propia, corre primero los tests del módulo y, si pasan, los 12 archivos de F; restaura. Primero, 64 mutaciones al código; después, 6 a las migraciones (base nueva por mutación).

**Muertas (45 de 64).** Cupo: `>=` por `>` en inscribir, cambiar de grupo y reactivar; sin candado en inscribir; candados sin ordenar (cambios cruzados); ocupados cuenta congeladas; `lt` por `lte` y `gt` por `gte` en el cupo de promoción; consumo sin comprobar contexto (EC-16); reintentos de promoción agotada a 0; cambio de programa permitido. Dinero: precio de inscripción = mensualidad; descuento de mensualidad = el de inscripción; hermanos = 0; hermanos sin exigir «activa»; corte sin fin de mes; cotización vigente sin fecha; cotización aceptada sin marcar. Reglas: sin reglamento, fuera de edad siempre permitido, inicio `<=` hoy, sin `ya_inscrito`, lead sin pasar a «inscrito», día de corte desde hoy, alumno no se activa, sin bienvenida, bienvenida sin recorrer horario, bienvenida a inscripción no vigente. Baja/congelar: baja antes de empezar, motivo inactivo, estatus del alumno sin «congelado». Conversión: con faltantes, lo mandado no gana, sin traslado de salud, candado por lead distinto. Permisos: maestro siempre convierte, recepción convierte, listo sin asistencia, listo no idempotente, IDOR de prospectos del maestro, fuera de edad por cualquiera (API), permiso de inscribir al maestro, el maestro ve todas las inscripciones, cross-sell `!== 1`, `skipDuplicates` del tutor.

**Sobreviven (19 de 64).**

| # | Mutación | Veredicto |
|---|---|---|
| 4 | el precio se toma al día de inicio, no al de la inscripción | **hueco real** (ningún test cambia el precio entre hoy y el inicio) |
| 7 | `meses_gratis_aplicados` siempre 0 | **hueco real** (ninguna aserción sobre meses gratis guardados) |
| 9 | `edad_max + 1` | **hueco real** (falta el borde superior) |
| 12 | una cotización vencida se puede aceptar | **hueco real** |
| 18 | no se devuelve el cupo de promoción tomado cuando otra se agota | **hueco real** |
| 27 | congelar sin condición de estatus en el `UPDATE` | hueco real (carrera de congelar contra baja) |
| 30 | baja de una congelada avisa a la lista de espera | **hueco real** (se avisaría de un lugar que no se liberó) |
| 32 | cambio de grupo no condicional al estado leído | hueco real (carrera) |
| 33 | hermanos incluye al propio alumno | **hueco real** (segunda inscripción del mismo alumno) |
| 39 | sin responsable de pago por omisión en la conversión | **hueco real** |
| 40 | conversión sin ordenar los grupos | hueco real (el interbloqueo de dos conversiones cruzadas no se prueba) |
| 47 | el alumno visible no se exige al inscribir | **hueco real** (lo tapa el chequeo del grupo) |
| 49 | el grupo visible no se exige al inscribir | **hueco real** (lo tapa el chequeo del alumno) |
| 58 | el traslado pisa la salud que el alumno ya tenía | **hueco real** |
| 59 | el traslado no limpia la ficha del prospecto | **hueco real** (en la mutación «sin limpiar» el dato queda duplicado) |
| 41 | teléfono del lead sin normalizar | equivalente (el lead ya trae E.164 por su `CHECK`) |
| 53 | `skipDuplicates` de la bienvenida | equivalente (la ejecución es nueva; el reintento lo cubre la unicidad) |
| 57 | el maestro ve los tutores (alcance) | equivalente por capas (el permiso `tutores:leer` ya lo excluye) |
| 60 | vincular sin la regla del 2.º responsable de pago | equivalente por capas (el índice único parcial la hace cumplir y `comoConflicto` devuelve 409) |

**Mutaciones a las migraciones (6; 5 mueren).** Sin `FOR UPDATE` en el disparador (falla 1 test), `>=` por `>` (3), sin el disparador (4), sin el tope del descuento de inscripción (1), índice de «una activa por alumno y grupo» sin `UNIQUE` (1) mueren; «el precio de inscripción puede ser negativo» sobrevive y es equivalente: el tope `descuento <= precio` con descuento ≥ 0 ya lo impide.

## 5. Los 14 invariantes contra lo nuevo de F

| # | Invariante | Veredicto |
|---|---|---|
| 1 | Aislamiento por organización | Se cumple. Todas las tablas nuevas llevan `organizacion_id` y llaves compuestas; toda consulta nueva pasa por el scope (`check:capas` verde); el disparador filtra por `organizacion_id`; test de «otra organización» en conversión, familias e inscripción. El alcance de *sucursal* no es el invariante 1, pero EF-01 es la misma clase de fuga hacia dentro de la organización. |
| 2 | Cero términos de vertical | Se cumple (`check:generico`, 382 archivos). Los textos de la bienvenida y los motivos de baja son filas de seed `[SUPUESTO]`. |
| 3 | Soft delete | Se cumple en la aplicación (no hay `DELETE` ni ruta que borre inscripciones). EF-08: las condiciones anidadas no filtran borrados. |
| 4 | Todo saliente por `MessagingProvider` | Se cumple (la bienvenida pasa por el motor). EF-02: elige mal el canal. |
| 5 | Dos ventanas | No se tocó; la bienvenida es plantilla `utility`. |
| 6 | `en_atencion_humana` | Reformulado por Eduardo (INV-6 pendiente); la bienvenida hoy se bloquea. No se audita como defecto. |
| 7 | Una sola función de teléfonos | Se cumple: tutor, lead, búsqueda y conversión pasan por `normalizarTelefono`; la base rechaza `+521`. |
| 8 | Idempotencia | Se cumple: conversión (candado por lead + vínculos únicos), bienvenida (`automatizacion_ejecucion` única), inscripción (único parcial). |
| 9 | Webhooks autenticados | No cambió. |
| 10 | Determinismo | Se cumple: cupo, precio, descuento, hermanos y corte son código determinista. |
| 11 | Adaptadores con fakes | Se cumple. |
| 12 | Local primero | Se cumple (todo corre contra Postgres local). |
| 13 | La familia es la entidad central | Se cumple: M:N con banderas, un tutor por teléfono, sin atajos en `alumno`. EF-07 acota qué se devuelve al detectar la familia. |
| 14 | Horario de envío | Se cumple: la bienvenida se recorre a 09:00–20:00 de la sucursal y no se descarta (no hay evento al cual llegar tarde). |

## 6. Verificación de correcciones C, D y E

Verificador independiente (contexto nuevo, copias propias y bases `ver_*`): para cada commit revirtió el arreglo de código fuente conservando los tests nuevos y confirmó que fallan; corrió variantes adversariales que el test del commit no cubre. `validar` 506 / `test:int` 835, exit 0 en el HEAD. Revisó también las líneas eliminadas en tests de los 18 commits: todas son sustituciones por la expectativa nueva; no hay aserciones relajadas ni guardas debilitadas.

| ID | Commit | Veredicto | Observación |
|---|---|---|---|
| EC-07 | 7b8b0b8 | verificado | Años 1900 y 2999 aceptados, 1899, 3000, 9999 y 0000 dan 400 en precios, cotizador, campañas, promociones, clases muestra y filtros |
| EC-05 | dafb14f | verificado, hueco hermano | Sin el candado falla la carrera de 16 altas; hueco: EF-18 (invisibles) |
| EC-01, EC-02, EC-03 | efd45a2 | verificado | 13 tests fallan al revertir |
| EC-04 | efd45a2 | observación | Cubre `sin_lugar`; el caso con lista de espera sigue mintiendo: EF-16 |
| EC-12 | efd45a2 | verificado en lo corregido | EF-19: otros campos con NUL |
| EC-06 | 8ea14dd, b41edfe | verificado, evasiones menores | EF-20 |
| EC-08 | 9488ea6 | verificado | |
| EC-09 | 2df6f63 | verificado, 11 de 11 | X24 la mata el test de EC-02, no el de este commit |
| EC-14, EC-15 | a9690ad | verificado | |
| ED-01, ED-02 | 6a46ad3 | verificado | «baja», «  Baja. », «STOP!!», «NO MOLESTAR», «bàja» se registran; 4 BAJA simultáneas dejan 1 consentimiento y 1 confirmación |
| ED-03 | e88ef41 | verificado, hueco hermano | EF-21 |
| ED-04 | fe9f258 | verificado | |
| ED-05 | e931919 | verificado, 10 de 10 | |
| ED-06 | db70880 | observación (incompleta) | 116/116 en 3 corridas seguidas, pero con 8 procesos en paralelo falla: EF-17 y EF-26 |
| ED-07, ED-12, ED-13 | 2870190 | verificado, hueco hermano | EF-22 |
| EE-01, EE-17 | 5a9b83a | verificado | No se volvió a ejercitar Chrome |
| EE-10 | 5a9b83a | observación | El honeypot ya responde 303, pero con dos canales es distinguible: EF-23 |
| EE-02 | 6bd60ad | verificado | 12 envíos concurrentes con `max_usos = 3` dejan exactamente 3 |
| EE-03, EE-04 | 6bd60ad | verificado | |
| EE-05, EE-12 | 6bd60ad | verificado, evasiones | EF-24 |
| EE-16 | 6bd60ad | verificado | |
| EE-08 | de44e6a | verificado, límite documentado | EF-25 |
| EE-11 | de44e6a | verificado | 404 idéntico para slug inexistente, vertical sin aviso y vertical inactiva |
| EE-09, EE-14 | 4bf427b | verificado | |

**Ningún arreglo previo falla del todo**; dos están incompletos (EC-04 → EF-16, ED-06 → EF-17).

## 7. Cifras reproducidas (HEAD `2b93aaf`)

```
npm ci                         ok
npm run validar                exit 0 · tests 506 · pass 506 · fail 0
npm run test:int  (base vacía) exit 0 · tests 835 · pass 835 · fail 0
npm run test:int  (2.ª seguida) exit 0 · tests 835 · pass 835 · fail 0
prisma migrate diff (E→F con datos / vacía→F)   No difference detected / No difference detected
```

## 8. Decisiones de producto (para Eduardo)

1. **EF-06.** ¿Una inscripción debe respetar las clases muestra ya agendadas del grupo (quitando el lugar a quien paga) o se acepta un niño de más ese día? Hoy gana la inscripción.
2. **EF-07.** ¿La detección de familia entre sucursales debe ocultar nombre y correo del tutor ajeno hasta que lo confirme un administrador?
3. **EF-12.** ¿«Listo para cerrar» y el seguimiento deben seguir funcionando para el segundo hijo de un lead ya «inscrito»? Hoy no: 409.
4. **EF-13.** ¿Los meses por adelantado pueden declararse sin pago? La promoción de pago anticipado se da en la inscripción.
5. **Pendientes de F ya anotados** (siguen abiertos): alumno de mostrador sin prospecto no puede inscribirse (no hay dónde aceptar el reglamento), inscripciones con fecha pasada, beneficios diferidos y cupo de promoción de quien se da de baja, modo de cierre de la escuela, bienvenida al segundo tutor.
