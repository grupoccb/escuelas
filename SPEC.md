# SPEC.md — Plan por fases

Versión 1 · 7 de octubre de 2026

Fase 0 está detallada. Fase 1 está en borrador: se detalla al cerrar Fase 0, porque su arquitectura depende del resultado del gate G0.3.

Los gates los marca Eduardo.

---

## Fase 0 — Cimientos y prueba de atribución

Objetivo: tener el repo listo para construir y confirmar que el dato del anuncio llega al backend antes de construir sobre ese supuesto.

### 0.1 Andamiaje

- Repo con el stack de `CLAUDE.md`, lint, tests y CI mínima.
- `docker compose` con Postgres, Chatwoot y el backend.
- `npm run check:generico` implementado según el invariante 2.
- `normalizarTelefono()` con sus tests (invariante 7): `+521…` y `+52…` devuelven lo mismo.
- Insumos del cliente copiados a `docs/insumos/` (los cinco archivos de la sección 14 del contexto).

### 0.2 Inventario de reuso de Agenda Lista

Leer el repo de Agenda Lista (ruta que da Eduardo, solo lectura) y escribir `docs/REUSO-AGENDA-LISTA.md` con:

- Stack real de Agenda Lista y diferencias contra `CLAUDE.md`.
- Por cada pieza candidata: archivos, qué hace, si se porta tal cual, adaptada o no se porta, y por qué.
- Piezas candidatas: `MessagingProvider`, validación de firma de Twilio, callbacks de estado, soft delete, scope multi-tenant, firewall `check:generico`, recordatorios y scheduler, códigos de rastreo de WhatsApp, normalización de teléfonos si existe.
- Lo que no se porta: `AppointmentService`, modelo de citas, alta de negocios, agente conversacional.

No se porta código en este paso. Solo el inventario.

### 0.3 Prueba de atribución y de transporte

Tres preguntas que la prueba debe contestar con evidencia:

**P1. ¿Llega el dato del anuncio al backend?** Twilio manda los parámetros `Referral*` (incluido `ReferralCtwaClid`) en el webhook entrante, y ese webhook lo recibe Chatwoot.

- Paso a, simulado: mandar a Chatwoot un webhook entrante de Twilio con parámetros `Referral*` y registrar el payload completo que Chatwoot entrega al Agent Bot.
- Paso b, real: repetir con un anuncio Click-to-WhatsApp real de presupuesto mínimo, cuando el sender de karate esté en producción.

Vías posibles, en orden de preferencia:

| Vía | Descripción | Se elige si |
|---|---|---|
| A | Chatwoot reenvía los `Referral*` al Agent Bot | El paso a los muestra en el payload |
| B | El backend consume Twilio Event Streams para mensajes entrantes | A falla y Event Streams trae los campos necesarios |
| C | El backend recibe el webhook de Twilio, guarda la atribución y lo reenvía a Chatwoot | A y B fallan |

**P2. ¿Qué mensajes ve el asesor?** Confirmar que una respuesta del bot enviada por la API de Chatwoot aparece en la transcripción, y si un mensaje enviado directo con el SDK de Twilio aparece o no. De esto depende qué transporte usa `MessagingProvider` en cada caso, porque el contexto pide a la vez "todo saliente por SDK de Twilio" y "el asesor retoma con transcripción completa".

**P3. ¿Cómo recibe el backend los estados de entrega?** `delivered`, `read`, `failed`: por evento de Chatwoot, por callback de Twilio o por Event Streams.

Resultado: `docs/DECISION-ATRIBUCION.md` con la vía elegida, la evidencia y el diagrama corregido de la sección 4 del contexto.

### 0.4 Cuentas de Twilio y WABA

Decidir y documentar en `docs/DECISION-CUENTAS-TWILIO.md`: una WABA con tres senders o una subcuenta y WABA por vertical. Define la forma de `canal_whatsapp`. Confirmar con Twilio antes de decidir.

### Gates de Fase 0

- [ ] **G0.1** `docker compose up` levanta Postgres, Chatwoot y backend. `npm test` en verde. `check:generico` falla cuando se siembra un término prohibido.
- [ ] **G0.2** `docs/REUSO-AGENDA-LISTA.md` revisado y aprobado por Eduardo.
- [ ] **G0.3a** Prueba simulada: P1, P2 y P3 contestadas con evidencia. Vía elegida.
- [ ] **G0.3b** Prueba con anuncio real: el lead queda registrado con campaña y clic. Requiere G0.5.
- [ ] **G0.4** Decisión de cuentas de Twilio documentada.
- [ ] **G0.5** Externo: verificación del perfil de WhatsApp de karate iniciada en Meta.

Fase 1 puede arrancar con G0.1 a G0.4 y G0.3a en verde. G0.3b bloquea el lanzamiento, no la construcción.

---

## Fase 1 — Atención inmediata de leads (borrador)

Alcance: solo karate, las dos sucursales. Ballet y baile entran por seed.

Ningún pendiente de la escuela de la sección 12 del contexto bloquea esta fase: precios, cupos y duraciones son de Fase 2.

### Bloques

- **1.1 Esquema mínimo.** `organizacion`, `vertical`, `sucursal`, `sucursal_vertical`, `canal_whatsapp`, `campana`, `etapa_pipeline`, `lead`, `conversacion`, `mensaje`, `interaccion`, `consentimiento`. Seed de karate y las dos sucursales.
- **1.2 Entrada.** Mensaje entrante → vertical por número receptor → lead y conversación, con teléfono normalizado, idempotencia y atribución por la vía elegida en G0.3.
- **1.3 Bot de tres preguntas.** Máquina de estados: nombre, edad, sucursal. Validaciones, reintentos, tiempo de espera y palabras de baja (`BAJA`, `STOP`, `CANCELAR`, `NO MOLESTAR`).
- **1.4 Handoff.** La conversación pasa a "open" en Chatwoot con el resumen del lead a la vista del asesor. El lead queda `en_atencion_humana`.
- **1.5 Estados de entrega.** `delivered`, `read`, `failed` guardados por mensaje.
- **1.6 Reenganche.** Plantilla aprobada para el lead que dejó de contestar después de 24 h, con todas las reglas de `MessagingProvider`.
- **1.7 Reporte mínimo.** Leads por campaña, sucursal y etapa. Es lo que hoy no existe.

### Gates de Fase 1 (borrador)

- [ ] El loop completo corre offline con los fakes, de mensaje entrante a handoff.
- [ ] Test de no-fuga entre dos organizaciones en verde.
- [ ] El mismo número escrito como `+521` y `+52` produce un solo lead.
- [ ] Con el lead `en_atencion_humana`, ninguna automatización manda nada.
- [ ] Un reintento de webhook no duplica lead ni mensaje.
- [ ] Prueba de fuego: ballet queda operando solo con filas de seed, sin cambios de código.
- [ ] Prueba en teléfonos reales con Telcel, AT&T y Movistar.
- [ ] El asesor ve en Chatwoot la transcripción completa y los tres datos capturados.

---

## Fase 2 — Cotizador, clase muestra, recordatorios

Fuera de alcance. No construir. Requiere los pendientes de la escuela (sección 12 del contexto) y la decisión de fallback entre sucursales (sección 13).

## Fase 3 — Alumnos, CRM, cobranza, tableros

Fuera de alcance. No construir. Requiere la decisión de quién cierra la inscripción y cobra (sección 13).
