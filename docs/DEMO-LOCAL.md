# Demo local (SPEC 0.5)

El loop de captación completo en tu máquina, sin Twilio: un contacto escribe a la bandeja de
Chatwoot, el bot le hace tres preguntas, se crea el lead y la conversación pasa a los asesores.

## Correrla

```bash
docker compose up -d --build --wait   # ~30 s desde cero; todo queda configurado
npm run demo:contacto                 # simula al contacto con un guion
```

El simulador muestra la conversación en la terminal y al final imprime el enlace a Chatwoot.

- Chatwoot: http://localhost:3001
- Usuario: `asesor@demo.test` · contraseña `Demo-local-2026!`

Ver cuántos leads hay por campaña, sucursal y etapa:

```bash
DATABASE_URL=postgresql://inscripciones:inscripciones@localhost:5432/inscripciones npm run reporte:leads
```

Otras formas:

```bash
npm run demo:contacto -- --interactivo                 # tú escribes como el contacto
npm run demo:contacto -- --respuestas "Hola|Ana|7|1"   # otro guion
npm run demo:contacto -- --telefono +5215512345678     # número fijo (un lead por número)
```

## Qué ver en Chatwoot

En la conversación nueva de la bandeja de la vertical:

1. Los mensajes del contacto y del bot, en orden.
2. Una **nota privada** del bot con nombre, edad, sucursal y teléfono.
3. El aviso "La conversación fue reabierta por Bot de captación": quedó en **Abiertas**, lista
   para un asesor.
4. Si te asignas la conversación o escribes como asesor (mensaje o nota privada), el backend la
   pasa a atención humana y el bot ya no interviene. Estar **abierta** no basta: lo que cuenta es
   que una persona la tome.

### Lead a medias (30 minutos)

Si el contacto deja de contestar a mitad de las tres preguntas, a los 30 minutos la conversación
aparece en **Abiertas** con una nota privada "El contacto dejó de contestar…" y los datos
parciales. Todavía **nadie la atiende**: el bot sigue si el contacto vuelve a escribir, y a las
25 h puede salir el reenganche. En el simulador, `--respuestas "Hola|Ana"` deja un lead a medias;
el aviso sale en el siguiente barrido de un minuto después de que se cumplan los 30 minutos (para
verlo sin esperar, ajusta `ultimo_mensaje_entrante_en` de la conversación en la base).

### Cotizador por WhatsApp (C6 a C9)

Las tres verticales de la demo traen **encendido** el cotizador de WhatsApp (`vertical.cotizador_whatsapp_activo`). Después de nombre, edad y sucursal, el bot consulta el catálogo: si la edad cae en
varios programas (los marcados como alternativas) pregunta cuál; si la sucursal no tiene programa para la edad, ofrece la otra sucursal (o pasa al asesor, según
`configuracion_organizacion.sucursal_sin_programa`); manda **una cotización** (horarios con lugar, inscripción, mensualidad y la promoción vigente) y espera que el contacto elija un horario o escriba
«asesor»; un horario lleno con lista de espera pregunta si quiere entrar a la lista. Al final pasa al asesor con la cotización y el horario elegido en la nota privada. Se guarda en `cotizacion` y se ve en
`GET /api/leads/:id/cotizaciones`; la lista de espera, en `GET /api/lista-espera`. Para apagarlo en una vertical (vuelve la captura de tres preguntas):
`UPDATE vertical SET cotizador_whatsapp_activo = false WHERE slug = '…'`. Precios, cupos y promociones del seed son **[SUPUESTO]**.

### Del lead al alumno inscrito (F1 a F7)

Con el lead que dejó el simulador y la sesión de un asesor (ver «Usuarios de la aplicación»), por la API:

```bash
# 1) ¿Qué falta por capturar? Solo lo que el bot, el maestro y la cotización NO dieron (vacío = listo para convertir)
GET  /api/leads/:id/conversion
# 2) Convertir: tutor(es), alumno(s) e inscripción en UNA transacción (201; repetirlo devuelve lo ya convertido, 200)
POST /api/leads/:id/convertir   {"tutor":{"parentesco":"madre"},"prospectos":[{"prospecto_id":"…","alumno":{"apellidos":"…","fecha_nacimiento":"2018-05-04"},"inscripcion":{"grupo_id":"…"}}]}
# 3) Después: cambiar de grupo, congelar, reactivar o dar de baja con motivo; historial; cross-sell
POST /api/inscripciones/:id/cambiar-grupo | congelar | reactivar | baja
GET  /api/inscripciones/:id/movimientos
GET  /api/familias/un-solo-hijo        # tutores con un solo hijo inscrito y las verticales en las que no están
```

Quién cierra la inscripción (decisión 7): por omisión el maestro marca la clase «lista para cerrar» (`POST /api/clases-muestra/:id/listo-para-cerrar`) y el
asesor convierte; con `configuracion_organizacion.modo_cierre = 'maestro_en_sitio'` el maestro también puede convertir a sus alumnos al terminar la clase.
El seed trae los motivos de baja de ejemplo `[SUPUESTO]` y la plantilla/automatización de **bienvenida de inscripción** (`bienvenida_inscripcion`, de servicio): con el
motor corriendo, al inscribir sale a la conversación del tutor responsable (por el transporte configurado; sin Twilio real, solo se registra).

## Usuarios de la aplicación (API)

La API vive en `http://localhost:3000/api` (ver `docs/API.md`). El seed de la demo crea la
organización `escuela-demo` y cuatro usuarios, todos con la contraseña **`Demo-local-2026!`**
(solo demo; en un ambiente real el primer administrador se crea con `scripts/crear-usuario.ts`):

| Correo | Rol | Sucursales |
|---|---|---|
| `admin@demo.test` | administrador | todas |
| `asesor@demo.test` | asesor | solo la primera |
| `maestro@demo.test` | maestro | sus grupos |
| `recepcion@demo.test` | recepción | las dos |

```bash
curl -i -c /tmp/sesion.txt -H 'content-type: application/json' \
  -d '{"correo":"admin@demo.test","contrasena":"Demo-local-2026!"}' http://localhost:3000/api/sesion
curl -b /tmp/sesion.txt http://localhost:3000/api/yo
```

(`organizacion` puede omitirse mientras exista una sola organización.)

Vincular al asesor demo con su agente de Chatwoot (mismo correo, `asesor@demo.test`) para saber qué conversaciones tiene:

```bash
# como administrador (cookie de arriba); el id sale de GET /api/usuarios?rol=asesor
curl -b /tmp/sesion.txt -X POST -H 'x-requested-with: curl' http://localhost:3000/api/usuarios/<id>/vincular-chatwoot
curl -b /tmp/sesion-asesor.txt 'http://localhost:3000/api/conversaciones?asignada_a=yo'   # tras asignarte una conversación en Chatwoot
```

Datos de salud (solo administrador y maestro del grupo): `PUT/GET /api/salud/prospecto/:id` — ver `docs/API.md`.
La clave de cifrado de la demo (`CLAVE_DATOS_SENSIBLES` en `docker-compose.yml`) es pública a propósito.

### Límites de peticiones

El backend limita por IP el inicio de sesión (10 por minuto), el resto de `/api` (600) y los webhooks con firma inválida (30); lo legítimo
firmado no se ahoga. Detalle y variables en `docs/API.md`. En la demo local todo llega desde la misma IP: si pruebas contraseñas malas verás un `429`.

## Cómo está armada

| Pieza | Dónde |
|---|---|
| Cuenta, asesor y Agent Bot en Chatwoot | `chatwoot/setup.rb` (servicio `chatwoot-setup`) |
| Migraciones, seed y bandeja conectada al bot | `prisma/seed/demo.sql`, `scripts/preparar-chatwoot.ts` (servicio `demo-preparar`) |
| Webhook firmado del bot | `src/http/app.ts`, `src/mensajeria/chatwoot/webhook.ts` |
| Bot (máquina de estados) | `src/captacion/maquina.ts` |
| Lead, conversación e idempotencia | `src/captacion/entrante.ts` |
| Aviso a los 30 min (visible, no atendido) | `src/captacion/espera.ts` |
| Una persona toma la conversación (asignación o primer mensaje) | `src/captacion/toma.ts`, `src/mensajeria/chatwoot/webhook.ts` |
| Qué eventos manda Chatwoot al bot (experimento) | `scripts/experimento-eventos-chatwoot.ts`, `src/mensajeria/chatwoot/payload-*.json` |
| Reglas de envío y pase al asesor | `src/mensajeria/provider.ts`, `src/mensajeria/reglas.ts` |
| Topes de frecuencia (configurables por organización) | `src/configuracion/index.ts`, tabla `configuracion_organizacion` |
| Borde de Twilio (firma, reintentos, reenvío a Chatwoot) | `src/mensajeria/twilio/`, rutas en `src/http/app.ts` |
| Usuarios, sesiones y contraseñas | `src/auth/`, `src/api/rutas/sesion.ts`, `scripts/crear-usuario.ts` |
| Simulador del contacto | `scripts/simular-contacto.ts` |
| Catálogo de la primera vertical (programas, grupos, horarios, salón «Dojo») | `prisma/seed/catalogo.sql` |
| Catálogo COMPLETO de las tres verticales del insumo: 14 programas, 18 grupos, 31 horarios, salones, instructores, precios y promociones de ejemplo `[SUPUESTO]` | `prisma/seed/catalogo-completo.sql` (el servicio `demo-preparar` lo corre después de `catalogo.sql`; crea también las bandejas de Ballet y Baile) |
| Clase muestra (D1 a D4): el papel de cada etapa del embudo (`tipo_sistema`), la clase muestra por WhatsApp encendida, las plantillas del aviso al maestro y del recordatorio, y sus automatizaciones de 24 h y 2 h `[SUPUESTO]` | `prisma/seed/clase-muestra.sql` (el servicio `demo-preparar` lo corre después de `catalogo-completo.sql`) |
| Reporte de leads por campaña, sucursal y etapa | `npm run reporte:leads` |
| Seguimiento (D6 a D8, E1 y E2): reglamento, uso de imagen y aviso de privacidad v1 de ejemplo `[SUPUESTO]` con su huella; motivos de pérdida; plantillas y automatizaciones de lead frío y promoción por vencer | `prisma/seed/seguimiento.sql` (el servicio `demo-preparar` lo corre después de `clase-muestra.sql`) |
| Segunda vertical, solo con filas (opcional) | `prisma/seed/segunda-vertical.sql` |

Todo es idempotente: `docker compose down -v && docker compose up -d --build --wait` deja la
demo igual. Las credenciales son de desarrollo y están en `config/demo-local.env`.

## Límites

- Sin Twilio: la bandeja es tipo API y el "contacto" es el simulador. El borde de Twilio
  (`POST /webhooks/twilio/entrantes` y `/webhooks/twilio/estados`) existe pero **está apagado** en la
  demo: sin `TWILIO_AUTH_TOKEN` y `PUBLIC_BASE_URL` rechaza todo con 403. Se prueba con los tests
  (token falso), no con la demo.
- Reglas en `MessagingProvider` (invariante 4): atención humana, baja (por teléfono, en toda la
  organización), conversación cerrada, plantilla aprobada, ventana de servicio de 24 h, horario
  09:00–20:00 de la sucursal para lo que inicia el sistema, y topes de frecuencia por teléfono
  (3 mensajes automáticos en 24 h y 1 de marketing cada 7 días; cambian por organización en
  `configuracion_organizacion`, que el seed de la demo deja con esos valores).
- Clase muestra: con el cotizador y la clase muestra encendidos, tras elegir horario el bot propone las próximas fechas con lugar y agenda
  (la conversación sigue con el bot, que deja una nota y la hace visible, para que los recordatorios salgan). El asesor agenda, reprograma
  y cancela por `/api/clases-muestra`. El maestro recibe un aviso por plantilla (`aviso_maestro_*`, solo si tiene teléfono y las reglas lo
  permiten) y en `/api/maestro/avisos`; para abrirle la conversación contra Chatwoot real hace falta `CHATWOOT_ADMIN_TOKEN` (sin él, solo la
  lista y una tarea). Al lead le llegan los recordatorios de 24 h y 2 h antes (09:00–20:00 de la sucursal; los domingos también).
- Quien se dio de baja y vuelve a escribir no recibe respuesta: el asesor ve una tarea
  `baja_volvio_a_escribir`. Un mensaje que Twilio reporta como no entregado deja una tarea
  `entrega_fallida` con el código de error (una por mensaje).
- Fuera de la ventana de servicio y sin plantilla apta no se manda nada y se crea una tarea para
  el asesor (`tarea_asesor`).
- Reenganche: a las 25 h sin contestar a mitad de la captura el motor manda la plantilla del seed
  (ficticia). Contra la bandeja API de la demo llega como texto; con Twilio real iría como
  Content Template. Sale aunque la conversación ya sea visible para los asesores, mientras
  ninguna persona la haya tomado.
- Tomar una conversación = asignársela en Chatwoot o mandar el primer mensaje como asesor. Resolverla
  no devuelve el bot: queda en atención humana (una conversación nueva de Chatwoot sí empieza de cero).
- Las bandejas se crean con la asignación automática de Chatwoot apagada: nadie debe quedar como
  asesor sin haberla tomado a propósito.
- Un contacto que vuelve a escribir en una conversación nueva reutiliza su lead y el bot le
  vuelve a preguntar.
