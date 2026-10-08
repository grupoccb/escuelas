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
| Simulador del contacto | `scripts/simular-contacto.ts` |
| Catálogo de la vertical (programas, grupos, horarios) | `prisma/seed/catalogo.sql` |
| Reporte de leads por campaña, sucursal y etapa | `npm run reporte:leads` |
| Segunda vertical, solo con filas (opcional) | `prisma/seed/segunda-vertical.sql` |

Todo es idempotente: `docker compose down -v && docker compose up -d --build --wait` deja la
demo igual. Las credenciales son de desarrollo y están en `config/demo-local.env`.

## Límites

- Sin Twilio: la bandeja es tipo API y el "contacto" es el simulador.
- Reglas en `MessagingProvider` (invariante 4): atención humana, baja (por teléfono, en toda la
  organización), conversación cerrada, plantilla aprobada, ventana de servicio de 24 h, horario
  09:00–20:00 de la sucursal para lo que inicia el sistema, y tope de frecuencia.
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
