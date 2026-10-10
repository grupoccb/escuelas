# Operación diaria (bloque K7)

Para quien usa el sistema (administrador, asesor, maestro, recepción) y para quien lo mantiene. **Guías de una página por rol, con capturas, para quien nunca vio el sistema: [`docs/guias/README.md`](guias/README.md)** (asesor, con Chatwoot; maestro, para el celular; recepción; administrador). Las pantallas se llaman como en la barra de la interfaz. Todo lo que dice «el sistema manda…» pasa por `MessagingProvider`: respeta la ventana de 24 h (fuera de ella solo sale una plantilla aprobada), el horario de 09:00 a 20:00 de la sucursal, las bajas, el tope de frecuencia y la atención humana.

## Módulos: qué tiene encendido la escuela (V1)

La escuela arranca con la **captación**: el bot de tres preguntas, el pase al asesor, las tareas, el embudo y el reporte de leads. Lo demás se enciende cuando esté lista, desde **Administración → Módulos** (solo el administrador), sin reiniciar nada y sin tocar código:

| Módulo | Qué enciende | Necesita |
|---|---|---|
| Cotizador | Programa, horarios con lugar, precio y promociones por edad; cotizaciones y lista de espera; el bot los ofrece por WhatsApp | — |
| Clase muestra | Agendar la clase, el registro del maestro, avisos al maestro y recordatorios a la familia; el bot ofrece agendar | — |
| Inscripción | Convertir al lead en familia e inscribir; familias, alumnos y expedientes; la bienvenida | Cotizador |
| Operación diaria (asistencia, niveles y eventos) | Pase de lista, niveles y eventos | Inscripción |
| Finanzas | Cargos, pagos, estado de cuenta, uniformes, productos y ventas, y recordatorios de pago | Inscripción |
| Tableros | Los reportes de clases muestra, costo por campaña y el ejecutivo | Inscripción, Finanzas y Clase muestra |

Lo que pasa con un módulo apagado: su sección no aparece en la barra y su dirección dice «No disponible»; su API responde como una ruta que no existe (también al administrador); el bot no lo ofrece; sus automatizaciones y barridos no corren (una automatización que ya estaba programada se omite sin mandar); sus tareas no se listan. **No se borra nada**: al encenderlo vuelve todo lo guardado. Al encender un módulo después de un tiempo, lo que ya pasó NO se manda de golpe: lo omitido se queda omitido y lo nuevo sigue las reglas de siempre (horario de 09:00 a 20:00, descartar lo que ya pasó, topes de frecuencia); finanzas genera la mensualidad del mes en curso (una sola vez), no las de los meses apagados. La captación nunca se apaga. Se enciende en orden (primero la base) y se apaga al revés; la pantalla dice qué falta.

Las organizaciones que ya existían (la demo incluida) tienen todo encendido; una escuela nueva nace con solo la captación (`docs/ALTA-DE-CLIENTE.md`).

## Cargar el catálogo desde Excel (V6)

**Administración → Cargar catálogo** (solo el administrador). Sirve para dar de alta, de una sola vez, las disciplinas, sucursales, salones, instructores, programas, grupos, horarios y precios de la escuela, o para cambiarlos en bloque. Qué pedirle a la escuela y para qué sirve cada dato: `docs/QUE-PEDIRLE-A-LA-ESCUELA.md` (listo para mandarse).

1. **Descargar las plantillas** (todas juntas o una por una). Cada una trae una fila de ejemplo inventada (se ignora) y el `LEEME.txt` explica cómo llenarlas. También están en `docs/plantillas-catalogo/`.
2. **Subir los archivos llenos** (puede elegir varios a la vez; uno con el mismo nombre reemplaza al anterior) y pulsar **Revisar**. La revisión valida todo y **no guarda nada**.
3. Si hay errores, se listan por archivo, con la fila y la columna («Fila 7, columna “Salón”: no existe el salón “Sala 3” en la sucursal “Centro”…»). Se corrigen en Excel, se vuelven a subir y se revisa de nuevo. No aparece «Aplicar» hasta que la revisión sale limpia.
4. Con la revisión limpia se ve el resumen (nuevos, actualizados y sin cambios) y cada cambio con palabras; **Aplicar** pide confirmar y guarda todo o nada. Subir lo mismo otra vez dice **Sin cambios**.

Lo que conviene saber: nunca borra (si quita una fila del archivo, lo que ya estaba se queda; para dar de baja algo se usa su pantalla); una celda vacía en algo que ya existe no borra su dato; un precio nuevo empieza en su fecha y no cambia lo que ya se cobró ni las inscripciones hechas; los horarios solo se agregan. Las mismas verificaciones del catálogo que las pantallas (traslape de edades, choque de salón o de instructor, cupo contra capacidad) corren antes de aceptar. No crea canales de WhatsApp, usuarios, promociones, productos ni documentos legales: esos se dan de alta en su pantalla.

Desde la línea de comandos (por ejemplo, una carga inicial hecha por Grupo CCB): `npm run catalogo:importar -- --organizacion <identificador> --carpeta <carpeta con los .csv>` simula; con `--aplicar --administrador <correo>` carga, a nombre de ese administrador en el registro de cambios. Detalle técnico: `docs/API.md`, «Carga del catálogo (V6)».

## Configuración sin SQL (V5)

Todo lo que la escuela cambia en la operación normal se edita en **Administración** (solo el administrador), sin reiniciar nada y sin tocar la base. Cada cambio queda en el registro de cambios.

| Pantalla | Qué cambia |
|---|---|
| **Configuración** | Horario de los mensajes automáticos (la escuela puede **estrecharlo**, nunca pasar de 09:00 a 20:00), topes de mensajes, minutos de silencio antes de avisar de un lead a medias, respuestas que el asistente no entiende antes de pasar con una persona, vigencia de cotizaciones, lista de espera, clase muestra, umbrales de faltas y de cobranza, umbrales «a reventar» y «vacío» del tablero y modo de cierre. Cada ajuste dice su rango, su valor de siempre y qué pasa si se cambia; si pertenece a un módulo apagado, avisa que no hace nada hasta encenderlo |
| **Textos del asistente** | Lo que el asistente de WhatsApp dice en cada paso (31 mensajes), con vista previa. Los huecos como `{nombre}` los llena el sistema; no se aceptan huecos que no existen, enlaces ni más de 600 caracteres. «Volver al texto de siempre» restablece |
| **Etapas del embudo** | Nombre, orden y días sin movimiento que avisan; agregar etapas propias y quitarlas si no tienen leads. Las del sistema (Nuevo, Contactado, Clase muestra…, Inscrito, Perdido) se renombran pero no se quitan ni cambian de orden entre sí |
| **Motivos de pérdida y de baja** | Las dos listas de motivos: agregar, renombrar, ordenar, apagar (lo ya registrado se conserva) y quitar |
| **Automatizaciones** | Desfase, intentos, espaciado, horario, días, plantilla y, en el lead frío y el pago atrasado, hasta cuántos días de atraso se persigue |

Las campañas y sus códigos QR tienen pantalla desde V7 (Administración → Campañas y códigos QR). Lo que no tiene pantalla (niveles de progresión, eventos, productos, documentos legales, la matriz de transiciones de etapa, el alta de automatizaciones y las variables de entorno) está en **`docs/CONFIGURACION-INVENTARIO.md`**, con su comando o su variable y un ejemplo. Ahí también está lo que **no** se cambia a propósito (ventanas de 24 y 72 h, el piso y techo de 09:00 a 20:00, palabras de baja, etc.) y por qué.

## Por rol

### Recepción (inicio: Registrar pago)
- **Cobrar** (`Registrar pago`): busca a la familia por el teléfono (con o sin +52 o +521), por el nombre de la mamá o por el de un hijo (no importan acentos ni mayúsculas); escribe el monto; el sistema propone el reparto (el cargo más antiguo primero, entre todos los hijos). Si la familia pide otro reparto, se ajusta a mano y TIENE que sumar exactamente el pago. Un pago de más se rechaza (no hay saldo a favor): se cobra lo adeudado. Cada envío lleva una clave: si la caja se traba y se reenvía, no se cobra dos veces.
- **Corregir un cobro equivocado**: se cancela el pago (queda registrado, no se borra) y se registra el correcto. Un cargo con pagos no se cancela suelto.
- **Estado de cuenta**: saldo (lo que debe) por hijo y total, y cuánto lleva vencido (1–30, 31–60, 61–90 y más de 90 días). Se imprime (o se guarda en PDF) y se baja a Excel; por WhatsApp no se manda desde aquí.
- **Cierre del día** (`Cierre del día`): lo cobrado hoy por persona y forma de pago, y lo cancelado. Para cuadrar la caja: contar el efectivo y compararlo con «Efectivo» de tu caja (la tarjeta, con el reporte de la terminal; las transferencias, con el banco). Un pago de un día anterior que se cancela hoy se resta (sale dinero de la caja de hoy). Solo lee.
- **Uniformes y ventas**: `Uniformes` lista lo que se ganó con una promoción y ya se puede entregar (cuando se pagó la primera mensualidad). Se entrega eligiendo la talla del inventario. `Ventas` vende un producto (nace un cargo a nombre del responsable de pago) o anula una venta sin pagos.
- **Pase de lista** en mostrador cuando el maestro no lo toma.
- Ve alumnos y familias de SUS sucursales, nunca datos de salud.

### Asesor (inicio: Embudo)
- **Embudo**: cada lead en su etapa (Nuevo → Contactado → Clase muestra agendada → asistida → Negociación → Inscrito / Perdido). Mover de etapa deja historial; marcar «Perdido» pide el motivo, y recuperarlo pide una nota. «Estancados» son los que llevan más días sin movimiento de lo que marca su etapa.
- **Marcar como inscrito (solo con la inscripción apagada, V10b).** Una escuela que arranca solo con la captación no puede inscribir en el sistema; para que el embudo llegue a «Inscrito», el asesor (o el administrador) toca **Marcar como inscrito** en la tarjeta del embudo o en la ficha del lead, escribe una nota obligatoria (¿cómo se inscribió?, ¿pagó?, ¿en qué grupo?; mínimo 10 caracteres; sin datos de salud), confirma y ve el resultado. Queda guardado quién lo marcó, cuándo y la nota (historial de la ficha: «Inscrito a mano por … el …»; registro de cambios, sin copiar la nota). Un lead perdido primero se recupera. **No genera alumno, inscripción ni cobros**: es solo el cierre. Si se equivoca, solo un administrador lo corrige (con nota) moviéndolo de etapa. Cuando la escuela enciende la inscripción, el botón desaparece y se inscribe desde la ficha; el lead que estaba marcado a mano se puede inscribir de verdad sin problema y a partir de ahí cuenta por su inscripción.
- **Tareas**: la bandeja de trabajo humano del sistema (ver la tabla de abajo). Cada tarea se marca «hecha» o «descartada».
- **Ficha del lead**: atribución (de qué anuncio o QR llegó), cotizaciones, clase muestra, historial y el enlace directo a la conversación en Chatwoot. Cuando una persona escribe o se asigna la conversación en Chatwoot, el sistema marca «atención humana»: el bot y el marketing callan; los recordatorios de lo ya acordado (clase muestra, pago) siguen saliendo.
- **Cotizar a mano**, **agendar / reprogramar / cancelar la clase muestra**, **convertir** al lead en familia, alumno e inscripción (el asistente solo pide lo que falta; nunca vuelve a pedir lo ya capturado) y cobrarlo en recepción.
- Ve los leads y las familias de SUS sucursales.

### Maestro (inicio: Hoy; pensado para el celular)
- **Hoy**: las clases muestra de sus grupos (de hace 24 h a 14 días), con la hora local de la sucursal. No ve teléfonos ni correos de la familia ni importes.
- **Registro del alumno** de la clase muestra: alumno completo, adultos como filas (quién paga, quién lo lleva, quién puede recogerlo), antecedentes, observación y **salud** (cifrada; solo el administrador y el maestro de ese grupo la ven, cada lectura queda registrada con su motivo). Se guarda como borrador, se «completa» (el sistema dice qué falta), y se acepta el reglamento y el uso de imagen con evidencia (versión, quién, cuándo).
- **Asistencia**: asistió / no asistió (se puede corregir hasta 24 h después). Si no asistió, el sistema le escribe a la familia para reagendar y deja una tarea de llamada al asesor.
- **Listo para cerrar**: avisa al asesor que la familia está lista para inscribirse (una tarea por lead). Con el modo `maestro_en_sitio` (Administración → Configuración → «Modo de cierre») el maestro puede cerrar la inscripción de SUS alumnos: en «Hoy», «Inscribir a mi alumno» (solo se habilita con el registro completo, el grupo recomendado y el reglamento aceptado) pide confirmar y dice en qué grupo queda; no muestra importes. Si el grupo se llenó, la pantalla lo dice, no cobra nada y ofrece «Avisar al asesor».
- **Avisos**: cada clase que se agenda, reprograma o cancela le llega por WhatsApp (plantilla) y a su pantalla. Si no llegó por WhatsApp, lo ve igual en la aplicación.
- **Pase de lista** de sus grupos; **progresión** de sus alumnos.

### Administrador (inicio: Embudo; todos los permisos)
- Todo lo anterior, más: **Administración** (verticales, sucursales, programas, grupos, horarios, instructores, precios, promociones, plantillas, automatizaciones, límites, usuarios y roles; la interfaz y `docs/API.md`), **registro de cambios** y **quién vio la salud de quién**, **reportes** (ejecutivo, clases muestra, costo por alumno inscrito, exportaciones CSV) (los inscritos a mano se cuentan aparte, V10b: el reporte de leads —`npm run reporte:leads`— y el CSV de leads los distinguen de los inscritos de verdad, el costo por alumno inscrito los suma como un alumno cada uno y la conversión de clases muestra también; el tablero ejecutivo, que sale de inscripciones y cargos reales, **no** los cuenta como alumnos activos ni como altas) y la conciliación (`npm run cuadratura`).
- **Dar de baja un usuario** lo desconecta al instante. Nunca queda la organización sin administrador activo.
- Qué NO se edita a mano: un precio ya cobrado (se congela en cada inscripción), un pago (se cancela y se registra otro), el historial de etapas, las aceptaciones legales (solo se anexan; el texto nuevo es una versión nueva).

## Tarea del asesor: agregar otro niño (V3)

La familia que escribe trae a un niño; muchas traen a dos o más. Cuando el asesor lo sepa (en la llamada, en el chat o en persona), lo anota en la ficha del lead, sin cerrar nada y sin volver a preguntar lo del adulto:

1. En la ficha del lead, sección **Niños**, botón **Agregar otro niño**.
2. Escribe el **nombre** y la **fecha de nacimiento** (si no la saben, la **edad**). Los apellidos son opcionales pero evitan que la inscripción los pida después. Si la escuela tiene más de una disciplina en esa sucursal, aparece **Disciplina de interés**.
3. **Guardar**, o **Guardar y agregar otro** si hay más hermanos: el formulario se queda abierto y limpio. En celular funciona igual (fecha con el selector del teléfono, edad con el teclado numérico).
4. Si por su edad no hay un programa en esa disciplina y sucursal, la ficha lo avisa en amarillo: el niño se guarda igual; revísalo con la familia.
5. En la fila de cada niño: **Corregir** (nombre, fecha, disciplina) y **Quitar** (pide confirmación; no se quita a quien ya es alumno ni a quien tiene una clase muestra agendada o está en una lista de espera). Una familia puede tener hasta **10 niños** en la ficha.
6. **Cotizar** (solo si el cotizador está encendido) abre el formulario con ese niño; propone contar como hermanos ya inscritos a los niños que van antes en la ficha, suponiendo que se inscriben juntos, y enseña el precio con la promoción por hermanos. Con el cotizador apagado la ficha no muestra nada de cotización.

**Inscribir a los hermanos (botón «Inscribir a los niños»).** El asistente se abre con todos los niños que aún no son alumnos marcados; desmarca a quien se inscribirá después (se queda en la ficha). Se inscriben **todos juntos en una sola operación: entran todos o ninguno**. El adulto se pregunta una sola vez; lo que el asesor ya escribió de cada niño se ve como «Capturado» y no se pide. En «Precio», cada niño se cotiza contando a los que se inscriben antes que él, así que el precio con la promoción por hermanos que se ve antes de confirmar es el que se cobra (el primero paga completo; el segundo recibe la promoción de 2 hermanos, y así). En «Reglamento e imagen», si un hermano ya tiene el reglamento aceptado, el botón **Aceptan lo mismo que por (nombre)** lo registra para este niño (mismo adulto y medio, solo la versión vigente; queda anotado de dónde salió): úsalo solo si la familia de verdad aceptó por ambos.

**Si a uno no le alcanza el lugar.** No se inscribe a nadie y la pantalla lo dice: «No se inscribió a nadie: (niño) se quedó sin lugar…». Elige **Dejar fuera a (niño)** (se inscribe a los demás y él se queda en la ficha para después) o **Ponerlo en lista de espera** (se apunta en la fila del grupo y se inscribe a los demás); o vuelve al paso «Grupo y horario» y elige otro. Un hermano que llega después, con el lead ya inscrito, se inscribe igual: el botón **Convertir e inscribir** sigue en la ficha mientras haya un niño por inscribir y no pide nada del adulto.

**Después de inscribir.** Cada hijo tiene sus cargos (inscripción y primera mensualidad) a nombre del mismo responsable de pago: recepción ve a la familia en **Estado de cuenta** con los dos hijos y su saldo.

## Qué hacer con cada tarea del asesor

| Tarea | Qué pasó | Qué hacer |
|---|---|---|
| `sin_plantilla_apta` | Había que escribirle a alguien fuera de la ventana de 24 h y no hay plantilla aprobada que sirva | Escríbele tú por Chatwoot (plantilla o llamada) o pide aprobar la plantilla que falta |
| `revision_manual` | Una automatización no salió por datos faltantes o de configuración | Lee la descripción, corrige el dato o la plantilla y, si procede, contacta a la familia a mano |
| `automatizacion_omitida` | Una automatización no se mandó por un problema de configuración | Igual que arriba; avisa al administrador si se repite |
| `baja_volvio_a_escribir` | Quien pidió la baja volvió a escribir. El sistema calla | Decide: si quiere regresar, atiéndelo; si no, confirma la baja |
| `baja_solicitada` | Pidieron la baja mientras los atendía una persona | Confirma la baja (o aclara con la familia) |
| `entrega_fallida` | WhatsApp reportó que un mensaje no se entregó (con el código de error) | Revisa el teléfono; llama o escribe por otro medio; corrige el teléfono del tutor |
| `envio_incierto` | Un mensaje quedó a medias y no se sabe si salió. **No se reenvía solo** | Mira la conversación en Chatwoot: si la familia no lo recibió, escríbele tú |
| `nota_fallida` | No se pudo dejar la nota interna del resumen | El resumen está en la ficha; lee la conversación |
| `lista_espera_nueva` | Alguien entró a la lista de espera de un grupo lleno | Ofrécele otra opción o avísale cuando se libere un lugar |
| `lista_espera_lugar_liberado` | Se liberó un lugar y le toca al primero de la fila | Ofrécele el lugar (tiene 48 h por omisión) y, si acepta, inscríbelo; si no, pasa al siguiente |
| `aviso_maestro_no_enviado` | El aviso de una clase muestra al maestro no salió por WhatsApp (sin teléfono, sin plantilla, fallo) | Avisa al maestro por otro medio y corrige su teléfono en Administración |
| `llamar_no_asistio` | La familia no llegó a su clase muestra | Llámale para reagendar (el sistema ya le escribió una vez) |
| `lead_frio` | El lead lleva más días sin movimiento de lo que marca su etapa | Retómalo (llamada, mensaje) o márcalo como perdido con su motivo |
| `listo_para_cerrar` | El maestro o un asesor marcó que la familia está lista | Convierte al lead (la vista previa dice qué falta) y pasa a recepción a cobrar. Se resuelve sola al convertir |
| `faltas_consecutivas` | Una inscripción llegó al umbral de faltas seguidas (3 por omisión) | Contacta a la familia; se resuelve sola cuando vuelve a asistir |
| `evento_inesperado` | Llegó algo raro por un webhook o la landing que el sistema no pudo procesar (el mensaje de la familia NO se pierde: se reenvía) | Revisa la conversación; si no hay conversación, la ve solo el administrador: avisa al equipo técnico con la hora |
| `beneficio_en_revision` | Se canceló el pago que había liberado un beneficio ya entregado | Decide con recepción si se cobra el beneficio o se deja así |
| `deuda_vencida` | Una familia lleva más de 15 días de atraso | Llámale; ofrece regularizar; se resuelve sola al saldarse |
| `cobranza_sin_canal` | No hay conversación de WhatsApp para mandar el recordatorio de pago | Cobra por llamada o por otro medio |

## Ensayo con WhatsApp real (V9)

Para probar la demo con un celular de verdad, sin AWS: `docs/ENSAYO-WHATSAPP-REAL.md` (pasos, comprobaciones, qué hacer si algo falla y cómo regresar al modo simulado). Comandos: `npm run ensayo:preparar` (crea la bandeja de Twilio en Chatwoot y apunta el canal; `--simulado` ensaya en seco, `--revertir` regresa), `npm run ensayo:diagnostico` (✔/✘ en 10 segundos) y `npm run ensayo:entrante` (un entrante firmado, para `+521`/`+52`). Compose: `docker compose --profile ensayo up -d --wait` agrega `ensayo-borde` (puerto 3100, la única puerta que se expone al túnel); lo único que se relaja es el bloqueo de los dominios de Twilio del Chatwoot local, por la variable `ENSAYO_TWILIO_BLOQUEO_PREFIJO` de `.env`. Cómo se firma contra la URL pública: `docs/DECISION-ATRIBUCION.md` (A7) y el log `webhook_twilio_rechazado`, que dice en español qué URL esperaba.

## Variables de producción

El backend **se niega a arrancar** en producción si falta o es débil algo de esto (`src/seguridad/entorno.ts`; mensaje `entorno_inseguro` con el código de cada problema). En AWS las pone `infra/ecs.tf`; para otro despliegue:

| Variable | Qué es |
|---|---|
| `NODE_ENV=production` | Activa cookie `Secure`, HSTS y las revisiones de arranque |
| `DATABASE_URL` | La cuenta SIN dueño (`inscripciones_app`, creada por `scripts/preparar-roles.ts`), con `sslmode=require` |
| `CLAVE_DATOS_SENSIBLES` | 32 bytes en base64 (`openssl rand -base64 32`). **Respáldala aparte** (`docs/RESPALDO.md`): sin ella no se leen las fichas de salud |
| `ORIGEN_PUBLICO`, `PUBLIC_BASE_URL` | `https://…` del sistema (lo que firma Twilio; el origen de las peticiones que cambian algo). En producción es el ÚNICO origen aceptado (y es obligatorio: sin él el backend no arranca). En local no hace falta: se aceptan `localhost` y `127.0.0.1` con cualquier puerto (V2) |
| `COOKIE_SEGURA=true`, `TRUST_PROXY=1` | La cookie solo por https; un salto de confianza (el balanceador) para leer la IP real |
| `CHATWOOT_URL`, `CHATWOOT_BOT_TOKEN`, `CHATWOOT_ADMIN_TOKEN`, `CHATWOOT_WEBHOOK_SECRETO`, `CHATWOOT_URL_PUBLICA` | Chatwoot (el secreto: 24 o más caracteres) |
| `TWILIO_AUTH_TOKEN` | Para validar la firma de los webhooks de Twilio (con `PUBLIC_BASE_URL`) |
| `METRICAS_TOKEN` | Para leer `/metricas` (sin él, la ruta no existe) |
| `LIMITE_*` | Límites por IP (valores por omisión sensatos; `docs/API.md`) |

NO existen en producción: `ENSAYO_LOCAL` y `ENSAYO_TWILIO_BLOQUEO_PREFIJO` (V9: son solo del ensayo con WhatsApp real en la Mac de Eduardo, `docs/ENSAYO-WHATSAPP-REAL.md`; el backend se niega a arrancar con ellas), `ENTORNO_DEMO`, `config/demo-local.env` ni ningún valor que contenga «demo-local». Los usuarios de la demo (`admin@demo.test`… con la contraseña pública `Demo-local-2026!`) solo se crean con el seed de la demo: **nunca corras `prisma/seed/demo.sql` en la base de una escuela real** (usa `prisma/seed/plantilla-organizacion.sql`; `docs/ALTA-DE-CLIENTE.md`).

## Rutina

| Cuándo | Qué | Cómo |
|---|---|---|
| Cada día | Ver la bandeja de tareas y el correo de alarmas | Interfaz → Tareas; CloudWatch → SNS |
| Cada día (automático) | Cuadratura del dinero | EventBridge → `npm run cuadratura`; alarma `descuadre` |
| Cada semana | Revisar `inscripciones_mensajes_bloqueados` y `inscripciones_entregas_fallidas`; plantillas rechazadas por Meta | `/metricas` desde la VPC; consola de Twilio |
| Cada mes | `npm audit` (raíz y `web/`); rotar la contraseña de la cuenta de la aplicación si cambió alguien del equipo técnico | `docs/SEGURIDAD.md` |
| Cada trimestre | Ensayo de restauración (base nueva, conteos, cuadratura, migraciones) y anotar la fecha | `docs/RESPALDO.md` |
| Al desplegar | Tarea de migración ANTES de actualizar el servicio; verificar `/salud/lista` y la cuadratura | `docs/INFRA-AWS.md` |

## Si suena una alarma

| Alarma | Qué significa | Primer paso |
|---|---|---|
| `barrido-atrasado` | El ciclo de cada minuto no corre: no salen recordatorios ni cobranza ni se recuperan envíos | Logs del backend (`ciclo_error`, `barrido_error`); reiniciar la tarea si está colgada (ECS la reemplaza solo si `/salud/lista` falla) |
| `ciclos-con-errores` | El barrido corre pero algo falla en cada vuelta | Logs `ciclo_error` con el nombre del barrido |
| `descuadre` | Los cargos, pagos y aplicaciones no cuadran | `npm run cuadratura -- --json`; NO corregir a mano: investigar con el registro de cambios; avisar al equipo técnico |
| `5xx` / `sin-tareas-sanas` | El backend falla o no hay tareas listas | `/salud/lista` dice cuál comprobación falla (base, migraciones, barrido) |
| `eventos-inesperados` | Muchos webhooks con datos raros | Tareas `evento_inesperado`; ¿cambió Chatwoot o Twilio de formato? |
| `rds-*` | La base de datos está saturada o sin espacio | Subir clase o disco (`infra/variables.tf`) |

## Demo local frente a producción

La demo (`docker compose up -d --build --wait`, `npm run demo:guiada`) usa contraseñas, tokens y claves PÚBLICAS, transporte de mensajes falso y puertos solo en 127.0.0.1. Es para enseñar y probar; nunca para datos reales. El backend de producción no arranca con esos valores.
