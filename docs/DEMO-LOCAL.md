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
4. Si contestas como asesor o el contacto vuelve a escribir, el bot ya no interviene.

## Cómo está armada

| Pieza | Dónde |
|---|---|
| Cuenta, asesor y Agent Bot en Chatwoot | `chatwoot/setup.rb` (servicio `chatwoot-setup`) |
| Migraciones, seed y bandeja conectada al bot | `prisma/seed/demo.sql`, `scripts/preparar-chatwoot.ts` (servicio `demo-preparar`) |
| Webhook firmado del bot | `src/http/app.ts`, `src/mensajeria/chatwoot/webhook.ts` |
| Bot (máquina de estados) | `src/captacion/maquina.ts` |
| Lead, conversación e idempotencia | `src/captacion/entrante.ts` |
| Reglas de envío y pase al asesor | `src/mensajeria/provider.ts`, `src/mensajeria/reglas.ts` |
| Simulador del contacto | `scripts/simular-contacto.ts` |

Todo es idempotente: `docker compose down -v && docker compose up -d --build --wait` deja la
demo igual. Las credenciales son de desarrollo y están en `config/demo-local.env`.

## Límites

- Sin Twilio: la bandeja es tipo API y el "contacto" es el simulador.
- Reglas activas en `MessagingProvider`: atención humana, estado de la conversación y ventana
  de servicio de 24 h. Plantillas, horario, opt-out y frecuencia entran en Fase 1.
- Fuera de la ventana de servicio no se manda nada, pero todavía no se crea la tarea para el
  asesor (no existe la tabla).
- Un contacto que vuelve a escribir en una conversación nueva reutiliza su lead y el bot le
  vuelve a preguntar.
