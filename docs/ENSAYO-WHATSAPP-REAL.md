# Ensayo con WhatsApp real (sandbox de Twilio)

Para qué sirve: mandar un WhatsApp de verdad desde tu celular a la demo que corre en tu Mac y ver todo el recorrido: llega el mensaje, contesta el asistente, el asesor lo ve en Chatwoot y le responde, y lo que escribe llega a tu celular. Son unos 15 minutos la primera vez; la siguiente, 5.

Nadie más puede escribirle a este número: el sandbox de Twilio solo habla con los celulares que se unieron a él. Pero igual conviene cerrar el túnel al terminar (ver «Seguridad»).

## Antes de empezar

- [ ] **Cuenta de Twilio** con el sandbox de WhatsApp activado: en la consola, Messaging → Try it out → Send a WhatsApp message. Ahí ves el número del sandbox (casi siempre `+1 415 523 8886`) y tu código «join …».
- [ ] **Tu celular unido al sandbox:** desde WhatsApp, manda `join <tu código>` a ese número. Dura 72 horas: si pasaron más, vuelve a mandarlo.
- [ ] Tu **SID** (empieza con AC) y tu **Auth Token** (Account Info, botón de mostrar). Solo los copias a un archivo de tu Mac, paso 1.
- [ ] **Docker** corriendo con la demo (`docker compose up -d --build --wait`; ver `docs/DEMO-LOCAL.md`).
- [ ] Una herramienta de **túnel**, la que quieras de la sección «El túnel». Ninguna pide cuenta.

## Los pasos

**1. Prepara tu `.env` (2 min).** `.env` es el único archivo donde van los secretos; git lo ignora.

```sh
cat config/ensayo.env.example >> .env     # si no tienes .env, crea uno con ese contenido
```

Abre `.env` y llena `TWILIO_ACCOUNT_SID` y `TWILIO_AUTH_TOKEN`. Revisa que `TWILIO_WHATSAPP_NUMERO` sea el número que muestra tu consola. No pongas `ORIGEN_PUBLICO`: lo escribe el paso 4.

**2. Ensayo en seco (1 min).** Comprueba tus variables sin tocar nada:

```sh
npm run ensayo:preparar -- --simulado
```

Si algo falta, te dice qué y dónde conseguirlo. Esta corrida usa un Twilio falso en tu Mac: no toca Chatwoot, la base ni internet.

**3. Abre el túnel (2 min).** En otra ventana de Terminal, que se queda abierta todo el ensayo:

```sh
cloudflared tunnel --url http://localhost:3100
```

Verás una dirección `https://algo-con-palabras.trycloudflare.com`. Cópiala. (Puerto **3100**, no 3000: ver «El túnel».)

**4. Prepara todo con esa dirección (4 min la primera vez).**

```sh
npm run ensayo:preparar -- --url https://algo-con-palabras.trycloudflare.com
```

Guarda la dirección en `.env`, recrea el backend, Chatwoot y la puerta del ensayo (no borra datos), crea la bandeja de WhatsApp en Chatwoot, le pone el número a un canal de la escuela y te imprime lo que sigue.

**5. Dile a Twilio a dónde llamar (1 min).** En la consola de Twilio, Sandbox settings, pega **exactamente** lo que imprimió el paso 4 y pulsa **Save**:

- *When a message comes in:* `https://…/webhooks/twilio/entrantes` (método POST)
- *Status callback URL:* `https://…/webhooks/twilio/estados`

**6. Diagnóstico (30 s).**

```sh
npm run ensayo:diagnostico
```

Debe salir todo con ✔ (la consola de Twilio queda «a mano»: compara las dos direcciones letra por letra). Si hay ✘, cada una dice qué hacer.

**7. Las comprobaciones (5 min).** Abre Chatwoot en `http://localhost:3001` (usuario `asesor@demo.test`, contraseña `Demo-local-2026!`) y manda mensajes desde tu celular al número del sandbox.

## Lo que debes comprobar

- [ ] **Llega el mensaje.** Escribe «Hola». *Debe verse:* en Chatwoot, una conversación nueva en la bandeja «… (ensayo WhatsApp)» con tu «Hola»; en la aplicación (`http://localhost:3000`, «Embudo») una familia nueva.
- [ ] **Contesta el asistente.** *Debe verse:* en tu celular, en segundos, el saludo y la primera pregunta (cómo se llama quien tomaría las clases). Contesta las preguntas (nombre, edad, sucursal) o escribe «asesor».
- [ ] **Aparece la nota en Chatwoot.** Al terminar las preguntas, *debe verse* en la conversación una nota naranja con el resumen (nombre, edad, sucursal, origen). Tu celular no la recibe.
- [ ] **La respuesta del asesor llega al celular.** En Chatwoot, **Responder**, escribe «Hola, soy del equipo» y envía. *Debe verse:* el mensaje en tu celular. Después de esto el asistente se calla (hay una persona atendiendo): escribe algo desde el celular y no debe contestar el asistente.
- [ ] **Se guardan los estados de entrega.** Ver los estados guardados: en una terminal,
  ```sh
  docker compose exec -T postgres psql -U inscripciones -d inscripciones -c "select left(cuerpo,40) as mensaje, estatus, enviado_en, entregado_en, leido_en from mensaje where direccion='saliente' order by secuencia desc limit 5;"
  ```
  *Debe verse:* «entregado» y, si abriste el chat, «leido», con sus horas. Un mensaje que WhatsApp no pudo entregar queda «fallido» y deja la tarea «Mensaje no entregado» en «Tareas». (Lo que escribe un asesor desde Chatwoot no es del asistente: no sale en esta lista.)
- [ ] **`+521` y `+52` dan un solo lead.** WhatsApp decide en qué forma llega tu celular (`+521…` o `+52…`) y no se puede forzar desde el teléfono. Así que prueba las dos con tu propio número, firmando tú el mensaje con tu token:
  ```sh
  npm run ensayo:entrante -- --desde +5215512345678 --texto "Hola desde 521"
  npm run ensayo:entrante -- --desde +525512345678 --texto "Hola desde 52"
  ```
  (cambia los 10 dígitos por los de tu celular; el asistente contesta de verdad por Twilio, y la respuesta a la segunda forma puede no llegarte si el sandbox solo te conoce en una: no importa). *Debe verse:* en Chatwoot **dos** contactos (así los ve Chatwoot), y en el sistema **una** sola familia: en `docker compose exec -T postgres psql -U inscripciones -d inscripciones -c "select telefono, count(*) from lead where eliminado_en is null group by telefono order by 2 desc limit 3;"` tu número sale una vez, como `+52…`.
- [ ] **BAJA funciona.** Desde el celular escribe `BAJA`. *Debe verse:* una sola confirmación de la baja; desde ese momento, aunque escribas de nuevo, el sistema no te manda nada. (Para volver a recibir: ver «Regresar al modo simulado», o pide a un administrador quitar la baja.)

## Si algo falla

| Lo que ves | Causa probable | Qué revisar |
|---|---|---|
| Mandas «Hola» y no pasa nada, ni en Chatwoot | Twilio no llama a tu dirección | Paso 5: la consola debe tener la dirección **exacta** (con `https://`, sin barra al final) y el método POST. En Twilio, Monitor → Logs → Errors, busca el error 11200 o 11205. |
| `npm run ensayo:diagnostico` dice «Firma contra la URL pública» ✘, o en el log del backend `webhook_twilio_rechazado` | La firma no coincide: el token o la dirección de `.env` no son los de la consola | `docker compose logs backend \| grep webhook_twilio_rechazado`: el log dice «revisa que la URL configurada en Twilio sea exactamente …». Compárala con la consola. Revisa que `TWILIO_AUTH_TOKEN` sea el actual (si lo rotaste, cámbialo y repite el paso 4). |
| El túnel responde 404 en `/salud` | El túnel apunta al puerto 3000 y no al 3100 | Ciérralo y ábrelo con `http://localhost:3100`. |
| Todo funcionaba y dejó de llegar | El túnel se reinició y la dirección cambió | Pasos 3, 4 y 5 otra vez. Cada dirección nueva se pega de nuevo en la consola. |
| «Hola» no llega a Twilio o Twilio dice que no estás unido | La unión al sandbox venció (72 h) o escribes a otro número | Vuelve a mandar `join <código>` y revisa que escribas al número del sandbox. |
| Llega a Chatwoot pero el asistente no contesta | El Agent Bot no está en la bandeja, o la conversación ya la atiende una persona | Paso 4 otra vez (lo vuelve a poner). En Chatwoot, la conversación no debe estar asignada a nadie. Si había una tarea «Sin plantilla apta», es que pasó más de 24 h desde tu último mensaje: escribe tú primero. |
| El asistente contesta pero no te llega al celular | Chatwoot sigue con los dominios de Twilio bloqueados | `npm run ensayo:diagnostico`: «Chatwoot sin el bloqueo de Twilio» debe ir ✔. Necesita `ENSAYO_TWILIO_BLOQUEO_PREFIJO=apagado-` en `.env` y recrear con el paso 4. |
| El paso 4 dice «Chatwoot no pudo crear la bandeja de Twilio» | Lo mismo de arriba, o SID/token equivocados | Mira el motivo que imprime; `docker compose logs chatwoot \| tail -50`. |
| Contestas y no hay estado «entregado» en la base | Chatwoot no conoce la dirección pública | `npm run ensayo:diagnostico`: «Chatwoot conoce la URL pública». Los estados llegan por `https://…/twilio/delivery_status`. |
| Tarea «Mensaje no entregado» (o estado «fallido») | WhatsApp no pudo entregarlo: celular desvinculado del sandbox, fuera de las 24 h, etc. | El código de error está en la tarea (63016 = fuera de las 24 h; 63015 = no unido al sandbox). |
| Dos conversaciones para tu celular en Chatwoot | Normal: Chatwoot ve `+521…` y `+52…` como contactos distintos | En el sistema es una sola familia. |
| Quieres ver qué pasó con un mensaje | | `docker compose logs backend` (los teléfonos salen enmascarados) y, en Twilio, Monitor → Logs. |

## El túnel

Twilio tiene que poder llamar a tu Mac, y tu Mac no tiene dirección pública: un túnel le presta una. Importante: el túnel apunta al puerto **3100** (la «puerta del ensayo», un servicio del perfil `ensayo`), no al 3000. Esa puerta solo deja pasar lo que Twilio necesita (`POST` a los webhooks y `GET /salud`); la aplicación, `/api` y Chatwoot no se alcanzan desde afuera.

**Recomendado: cloudflared (TryCloudflare).** No pide cuenta ni tarjeta. Una vez: `brew install cloudflared`. Cada ensayo:

```sh
cloudflared tunnel --url http://localhost:3100
```

Da una dirección `https://….trycloudflare.com` que **cambia en cada arranque** y deja de funcionar al cerrar el comando. Es una herramienta de prueba, sin garantía de disponibilidad. (En esta Mac no estaba instalado; no se abrió ningún túnel para escribir esta guía.)

**Alternativa sin instalar nada: localhost.run por ssh.** Con el `ssh` que ya trae la Mac:

```sh
ssh -R 80:localhost:3100 nokey@localhost.run
```

Imprime una dirección `https://….lhr.life`. También cambia en cada arranque y la conexión puede cortarse (si pasa, vuelve a correr el comando y repite los pasos 4 y 5). No pude verificar su página oficial desde donde se escribió esta guía; si el comando no funciona, usa cloudflared.

**No usar:** ngrok pide cuenta (y su `ngrok` de esta Mac está sin sesión iniciada).

**Cuando la dirección cambia:** un solo comando lo reconfigura todo (guarda la dirección en `.env`, recrea los servicios y revisa la bandeja):

```sh
npm run ensayo:preparar -- --url https://la-nueva.trycloudflare.com
```

y pega la dirección nueva en la consola de Twilio (paso 5). Para saber qué dirección tiene hoy el sistema: `grep ORIGEN_PUBLICO .env`.

**Por qué la firma se calcula con la dirección pública.** Twilio firma cada llamada con la URL **completa que tiene configurada** (`https://…trycloudflare.com/webhooks/twilio/entrantes`). Detrás del túnel, el backend recibe la llamada por `http://…:3100`, con otro host y otro esquema; por eso valida la firma contra `ORIGEN_PUBLICO` (que es la misma dirección), nunca contra lo que ve en la petición. Los encabezados `X-Forwarded-Proto` y `X-Forwarded-Host` solo se creen si se configuró `TRUST_PROXY`, y aun así solo sirven para explicar un rechazo en el log, no para firmar.

## Un aviso para quien desarrolla

`npm run test:int` y `npm run dev` leen `.env`. Con las variables del ensayo activas (sobre todo `ORIGEN_PUBLICO` y `TWILIO_AUTH_TOKEN`) las pruebas no corren en su estado normal: **al terminar el ensayo, regresa al modo simulado** (comenta esas líneas) antes de correr pruebas.

## Seguridad

- **El token solo en `.env`.** Nunca en un documento, en un mensaje de chat ni en un archivo que se suba al repositorio. `npm run check:secretos` falla si un token de Twilio aparece en un archivo versionado o si `.gitignore` deja de ignorar `.env`. Los comandos solo muestran los últimos cuatro caracteres (`****a1b2`).
- **Cierra el túnel al terminar** (Ctrl+C en su ventana). Mientras está abierto, cualquiera que conozca la dirección puede mandar peticiones a los cuatro webhooks, pero sin la firma de tu token el backend contesta 403 y no reenvía nada. Solo alcanzan esos webhooks y `/salud`.
- **Esto es solo para tu Mac.** Lo único que se relaja es el bloqueo de los dominios de Twilio en el Chatwoot local (`ENSAYO_TWILIO_BLOQUEO_PREFIJO`) y que Chatwoot conozca la dirección pública. Un backend de producción **se niega a arrancar** si trae `ENSAYO_LOCAL=si` o esa variable, y `infra/` no las tiene.
- **No uses un número real de clientes.** El sandbox solo habla con tu celular. Los celulares de familias reales se prueban con el número de WhatsApp Business verificado, no con este ensayo.
- Las contraseñas de la demo son públicas (están en el repositorio). Por eso la puerta del ensayo no deja pasar la aplicación.

## Regresar al modo simulado

1. Cierra el túnel (Ctrl+C).
2. Corre:

   ```sh
   npm run ensayo:preparar -- --revertir
   ```

   Quita el número del canal, vuelve a apuntar la bandeja de la escuela a la bandeja de la demo, comenta en `.env` (con `#`) `ENSAYO_LOCAL`, `ENSAYO_TWILIO_BLOQUEO_PREFIJO`, `ORIGEN_PUBLICO` y `TWILIO_AUTH_TOKEN` (tus valores se quedan, apagados), detiene la puerta del ensayo y recrea los servicios de siempre. No borra nada en Chatwoot: la bandeja de Twilio y sus conversaciones siguen ahí; bórralas desde Chatwoot si no las quieres. Con `--ver` muestra qué haría sin hacerlo.
3. Comprueba: `npm run demo:contacto` vuelve a crear una familia y el asistente contesta (en el simulador, sin WhatsApp). En `docker compose config` ya no aparece `apagado-api.twilio.com`.

Si prefieres hacerlo a mano: en `.env` borra o comenta esas cuatro líneas, `docker compose stop ensayo-borde` y `docker compose up -d --build --wait`.

## Qué cubre este ensayo y qué no

Cubre, con un Twilio real de por medio: que la firma de un webhook real cuadra con la dirección pública, que Chatwoot recibe y manda por una bandeja de WhatsApp-por-Twilio, que los estados de entrega vuelven y se guardan, y `+521`/`+52` y BAJA con mensajes reales. **No** cubre (queda en `docs/PENDIENTES-CREDENCIALES-REALES.md`): plantillas aprobadas por Meta, un número de WhatsApp Business verificado, anuncios Click-to-WhatsApp (el sandbox no trae `Referral*`), el despliegue en AWS ni el volumen real.

Cómo se probó sin nada real: `src/mensajeria/ensayo/ensayo.itest.ts` corre todo este recorrido contra un Twilio falso que firma como el real (con la dirección pública, mandando a una dirección local, como el túnel) y un Chatwoot falso que se porta como el de Twilio.
