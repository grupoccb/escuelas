# BITACORA-V1.md

Sesión del 9 de octubre de 2026. Rama `v1-escuela` (desde `noche-2`). Plan: `docs/PLAN-V1.md`. Remoto: `origin` = `https://github.com/grupoccb/escuelas.git`.

| Bloque | Estado | Commit | Nota |
|---|---|---|---|
| V0 | HECHO | ver `git log` (`V0:`) | Remoto agregado y ramas/etiquetas subidas; rama `v1-escuela`; línea base |
| V1 | HECHO | ver `git log` (`V1:`) | Módulos por organización: interruptores en Administración, guarda de rutas, motor, bot y barridos |
| V2 | PENDIENTE | | Decisiones 4 a 7 |
| V3 | PENDIENTE | | Segundo hijo |
| V4 | PENDIENTE | | Cierre con el maestro en sitio (EK-15) |
| V5 | PENDIENTE | | Configuración sin SQL |
| V6 | PENDIENTE | | Carga del catálogo real |
| V7 | PENDIENTE | | Recorrido por rol |
| V8 | PENDIENTE | | Guías de una página por rol |
| V9 | PENDIENTE | | Ensayo con WhatsApp real, preparado |
| V10 | PENDIENTE | | Hallazgos abiertos |
| V11 | PENDIENTE | | Decisiones para Eduardo |
| V12 | PENDIENTE | | Demo de un solo comando |
| V13 | PENDIENTE | | Auditoría final |

## V0. Preparación

**Qué se hizo**
- `origin` agregado (`https://github.com/grupoccb/escuelas.git`). `git ls-remote origin` devolvió vacío con exit 0: el remoto no traía commits, así que no hubo nada que chocara y no se forzó nada.
- `git push -u origin main noche-fase1 noche-2` y `git push origin --tags`: las tres ramas y las once etiquetas `etapa-A` … `etapa-K` subieron como ramas y etiquetas nuevas (exit 0).
- Rama `v1-escuela` creada desde `noche-2`.
- `docs/PLAN-V1.md` entra al repositorio en este commit. `.claude/settings.json` (permisos locales del agente) se queda sin commit: es configuración de la máquina de Eduardo.

**Línea base** (antes de tocar código)
- `npm run validar` → exit 0 (676 tests de backend + 48 de la interfaz, 0 fallas).
- `npm run test:int` → exit 0 (1125 tests, 0 fallas).
- `npm run test:navegador` → exit 0 (103 pruebas en Chromium, 2.3 min).

**Decisiones que tomé**
- Sin decisiones de producto.

**Para Eduardo**
- Nada.

## V1. Módulos por organización

**Qué se hizo**
- **Datos.** Migración `20261025000000_v1_modulos`: seis columnas `modulo_*` (default `true`) en `configuracion_organizacion` y un CHECK con las dependencias. La captación no tiene columna: no se apaga. **Sin fila de configuración, todo está encendido**, y las filas existentes quedan con todo encendido (la demo, los fixtures y los tests no cambian). `prisma/seed/plantilla-organizacion.sql` crea la fila con solo la captación (no toca una fila que ya exista); `demo.sql` lo deja explícito: todo encendido.
- **Un solo lector** `leerModulos(db)` en `src/modulos/index.ts` (por el scope, invariante 1): catálogo con nombre y línea de ayuda en español, dependencias, mensajes de dependencia, evento→módulo y tipo de tarea→módulo. **Sin caché**: lee la base en cada petición, mensaje del bot y vuelta del motor, así que encender o apagar surte efecto sin reiniciar.
- **API.** `guardaDeModulos()` (`src/api/modulos-rutas.ts`) después de `autenticar`: ruta de módulo apagado → 404 «Ruta no encontrada» (igual que una ruta inexistente) para los cuatro roles. Tabla ruta→módulo escrita a mano; `modulos-rutas.test.ts` recorre el router real y falla si una ruta no cae en ninguna fila (y si una fila queda muerta). `GET/PUT /api/modulos` (solo administrador, bajo el mismo candado que `PATCH /api/configuracion`, 409 con mensaje de qué hacer primero, registro de cambios). `GET /api/yo` trae `modulos` y los permisos EFECTIVOS (`MODULO_DE_PERMISO`, `Record` completo). El expediente no consulta lo de un módulo apagado; `GET /api/tareas` no lista tareas de un módulo apagado. Documentado en `docs/API.md`, `docs/OPERACION.md` y `docs/ALTA-DE-CLIENTE.md`.
- **Automatizaciones.** El motor lee los módulos por organización en cada corrida: no programa eventos de un módulo apagado y omite (`modulo_apagado`, sin mandar) lo ya programado. Los barridos de finanzas, de avisos al maestro y de vencimiento de cotizaciones saltan la organización con su módulo apagado.
- **Bot.** `contextoCaptacion` exige el módulo del cotizador (además del interruptor de la vertical) y el de la clase muestra; la nota al asesor no menciona lo apagado. Las conversaciones a medias cierran como la captura de siempre (EC-03), sin 500.
- **Interfaz.** `Yo.modulos`; barra, «Más» e inicio por rol (`inicioDe`) sin lo apagado; `RequierePermiso` con módulo: dirección directa → «No disponible» sin peticiones; la ficha del lead no pide cotizaciones ni clases muestra apagadas; expediente con secciones nulas; Automatizaciones marca «En pausa» las de un módulo apagado; **Administración → Módulos** con los siete interruptores, su línea de ayuda y por qué uno no se puede mover.
- Capturas en `docs/capturas/v1/` (`01` administración con los interruptores, `02` y `03` barra de un asesor con solo la captación en escritorio y celular, `04` «No disponible», `05` administración en celular con casi todo apagado).

**Verificación**
- Pruebas nuevas (tablas de casos por módulo): `src/modulos/modulos.test.ts` y `src/api/modulos-rutas.test.ts` (unitarias); `modulos-api.itest.ts` (para cada uno de los seis módulos: todas sus rutas → 404 a los cuatro roles y las demás siguen vivas; apagar y encender con la misma app en pie; solo el administrador; dependencias; registro de cambios; no-fuga entre organizaciones; sin fila = todo encendido; CHECK de la base; expediente; tareas), `modulos-automatizaciones.itest.ts` (los seis eventos omitidos como `modulo_apagado` y no revividos; finanzas no programa ni genera mensualidades; avisos al maestro), `modulos-bot.itest.ts` (el texto del bot no contiene la oferta; módulos que el bot nunca ofrece; apagar a mitad de conversación sin 500; vencimiento de cotizaciones); web: `navegacion.test.ts` (barra por módulo, inicio, y que TODA ruta del cliente declara su módulo), `modulos.test.ts`; Playwright `web/e2e/modulos.spec.ts` (una organización aparte en el mundo: por módulo la barra no lo muestra, la URL directa dice «No disponible» sin ninguna petición del módulo y encenderlo lo devuelve sin reiniciar; pantalla de interruptores).
- `plantilla-organizacion.itest.ts` y `prueba-de-fuego-total.itest.ts` actualizados: la escuela nacida de la plantilla arranca con solo la captación y el administrador enciende los demás por `PUT /api/modulos` (es el camino documentado).
- `npm run validar` → exit 0 (688 tests de backend + 65 de la interfaz, 0 fallas; antes 676 + 48).
- `npm run test:int` → exit 0 (1174 tests, 0 fallas; antes 1125; salida final `ℹ tests 1174 / ℹ pass 1174 / ℹ fail 0 / EXIT 0`).
- `npm run test:navegador` → exit 0 (114 pruebas en Chromium, 2.5 min; antes 103: `114 passed`, EXIT 0).

**Decisiones que tomé**
- **La captación no se apaga** (módulo base, conservador). Alternativa descartada: apagable con prueba. Sin columna, la entrada de leads jamás depende de un interruptor.
- **Sin fila = todo encendido; la plantilla crea las filas apagadas.** Alternativa descartada: «sin fila = apagado» más una migración que inserte filas: habría roto los fixtures que crean organizaciones sin fila.
- **Inscripción necesita el cotizador** (no estaba en el brief): el asistente de inscripción elige el grupo con la oferta de `GET /api/cotizador`. Alternativa descartada: darle otra fuente de grupos al asistente (trabajo de producto). Otras dependencias: operación y finanzas → inscripción; tableros → inscripción, finanzas y clase muestra; clase muestra y cotizador → captación. Sin cascada: se rechaza con 409 y un mensaje (la opción más simple).
- **Catálogo (precios, promociones, grupos, plantillas, automatizaciones, canales) y configuración quedan en la captación**: no se apagan, para poder prepararlos antes de encender un módulo. Lista de espera → cotizador; gastos de campaña → tableros; reporte de ocupación → inscripción; documentos legales vigentes y salud de un prospecto → clase muestra; salud de un alumno → inscripción.
- **Permisos efectivos en `/api/yo`** (el rol menos los módulos apagados) en vez de que la interfaz conozca la tabla. Alternativa descartada: mapa permiso→módulo duplicado en `web/`.
- **Lo omitido no se revive**: al encender de nuevo, lo programado mientras estuvo apagado se queda `omitido`; lo nuevo sigue las reglas de siempre (horario, `evento_pasado`, topes). Los avisos pendientes al maestro NO se omiten: se quedan pendientes y `avisarAInstructor` aplica sus reglas al volver. Finanzas genera solo la mensualidad del mes en curso al encender (idempotente), no las de los meses apagados. Encender el lead frío o la promoción por vencer puede crear de golpe tareas para leads que hoy cumplen la condición (los mensajes de marketing siguen frenados por los topes y el horario).
- El saludo del bot «para darte horarios y costos exactos…» y el cierre «un asesor te escribe con horarios y costos» son del bot SIN cotizador (ya existían): no son una oferta, no se cambiaron.
- **La escuela de módulos del navegador no vive en el mundo compartido**: una segunda escuela viva rompe «la escuela es opcional» del inicio de sesión y la landing (que exigen una sola). `web/e2e/modulos.spec.ts` la siembra al empezar y la da de baja (soft delete) al terminar.
- La migración ya estaba aplicada en `inscripciones_pruebas` cuando agregué la dependencia inscripción→cotizador; la edité antes de commitear y recreé esa base (solo la de pruebas).

**Para Eduardo**
- Decidir si la plantilla debería traer también las automatizaciones (EK-I02): hoy con solo captación solo corre el reenganche si alguien siembra las automatizaciones.
- Para encender un módulo en la demo local existente hay que aplicar la migración (`prisma migrate deploy` sobre la base de la demo); no lo hice (la demo sigue como estaba; V12 la reconstruye).
- Los textos de «Módulos» (nombre y línea de ayuda por módulo) están en `src/modulos/index.ts`; ajústalos si la escuela los quiere con otras palabras.
