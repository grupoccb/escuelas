# Inventario de reuso de Agenda Lista

Paso 0.2 del SPEC. Gate G0.2: lo revisa y aprueba Eduardo.

- Repo leído: `grupoccb/agendalista`, rama `master`, commit `aed0f37` (15 sep 2026, merge de #186 desde `QA`). `QA` y `master` no tienen diferencias de código.
- Acceso de solo lectura: clon temporal fuera de este proyecto. No se portó código en este paso.

---

## 1. Stack real de Agenda Lista y diferencias contra `CLAUDE.md`

| Capa | `CLAUDE.md` (este proyecto) | Agenda Lista | ¿Difiere? |
|---|---|---|---|
| Runtime | Node + TypeScript | Node ≥ 22 con TypeScript nativo (type stripping): `node archivo.ts`, sin build para correr. ESM, `tsconfig` con `erasableSyntaxOnly` y `allowImportingTsExtensions` | Parcial |
| Framework web | Next.js (App Router) | **No usa Next.js.** API en Express 5 (`api/src/http/app.ts`, ~3,400 líneas), empaquetada con `serverless-http` para Lambda. Front aparte en React 18 + Vite (`web/`) | **Sí** |
| Base de datos | PostgreSQL + Prisma | **DynamoDB single-table** (PK `TENANT#<id>`, GSI1 y GSI2). Sin ORM: `@aws-sdk/lib-dynamodb` directo en `api/src/data/repo.ts` | **Sí** |
| Despliegue | AWS (ECS o EC2 + RDS según el contexto) | AWS serverless: Lambda + API Gateway/Function URL + CloudFront + EventBridge Scheduler. CloudFormation en `infra/`. Su CLAUDE.md prohíbe RDS por costo | **Sí** |
| Local | `docker compose` con Postgres, Chatwoot y backend | `docker compose` solo con DynamoDB Local; la API corre con `node api/src/http/server.ts` | **Sí** |
| Tests | Sin definir | `node:test` + `node:assert` (sin Jest ni Vitest). `*.test.ts` unitarias, `*.itest.ts` contra DynamoDB Local. Playwright para e2e | Sin conflicto |
| Lint | Sin definir | No hay ESLint. La disciplina vive en `tsc --noEmit` estricto y en guardas propias (`scripts/check-*.ts`) | Sin conflicto |
| CI | Mínima | GitHub Actions: `ci.yml` llama a `validar.yml` (guardas + typecheck + build + unitarias + integración); `deploy.yml` por OIDC | Sin conflicto |
| Mensajería | Twilio, con Chatwoot como bandeja | Twilio por HTTP directo (`fetch` a la API REST, el SDK solo como devDependency). **No hay Chatwoot**: la bandeja es propia (`web/src/Conversations.tsx`) | Sí, en bandeja |
| IA | Ninguna en Fase 1 (invariante 10) | Bedrock (Haiku/Sonnet) en el bot | No aplica |

### Lectura

`CLAUDE.md` dice que si el stack de Agenda Lista difiere, gana el de Agenda Lista, "porque de ahí se porta código". El inventario de abajo muestra que **lo que se porta es casi todo TypeScript puro sin dependencia de la base ni del framework**: la firma de Twilio, la interfaz del proveedor, las guardas `check:*`, la detección de baja y el patrón de claim de recordatorios. Lo que sí está atado a DynamoDB (`data/repo.ts`, `data/keys.ts`) es justo lo que no se porta, porque el modelo de esta escuela es relacional (M:N tutor-alumno, `pago_aplicacion`, cupo por grupo, índices únicos parciales).

Adoptar el stack de Agenda Lista completo chocaría con:

- **Invariante 12 y G0.1**: piden Postgres en `docker compose`. Chatwoot necesita Postgres de todos modos.
- **Sección Stack de `CLAUDE.md`**: los índices únicos parciales se describen como SQL en migraciones de Prisma.
- **Invariantes 1 y 3**: hablan de "toda tabla lleva `organizacion_id`" y de la columna `eliminado_en`, lenguaje relacional.

**Decisión (Eduardo, 7 oct 2026): híbrido con Express.** PostgreSQL + Prisma; de Agenda Lista se toman Node ≥ 22 con TS nativo, ESM, `node:test`, las guardas `check:*`, la CI reutilizable y la API en Express 5. Sin UI en Fase 0. La sección Stack de `CLAUDE.md` ya refleja esta decisión.

Recomendación original: tomar de Agenda Lista las convenciones de runtime y calidad (Node ≥ 22 con TS nativo, ESM, `tsconfig.base.json`, `node:test`, guardas `scripts/check-*.ts`, CI con workflow reutilizable) y conservar PostgreSQL + Prisma por el modelo relacional y por Chatwoot. Sobre Next.js frente a Express: la Fase 1 casi no tiene UI (solo el reporte 1.7), así que cualquiera de los dos funciona. Express facilita portar `adapters.ts` y `webhook.ts` sin cambios.

---

## 2. Piezas candidatas

Leyenda: **Tal cual** = se copia con cambios cosméticos (imports, nombres). **Adaptada** = se copia la base y se cambia lógica. **No se porta** = se escribe de cero o no aplica.

### 2.1 `MessagingProvider`

- **Archivos:** `api/src/messaging/provider.ts` (55 líneas), `twilioProvider.ts` (167), `index.ts` (134), `twiml.ts` (23), más sus `*.test.ts`.
- **Qué hace:** interfaz `sendMessage` / `sendTemplate` / `parseInbound` / `verifySignature` / `descargarMedia`. `TwilioProvider` pega a la API REST de Twilio con `fetch` y tiene **transporte inyectable** (`Transport`), lo que permite probar sin red. Incluye la guarda `TEST_WHATSAPP_TO`, que redirige todo saliente a un número de pruebas en dev. `resolveTenantProvider` arma el proveedor con número, plantillas y credenciales por tenant.
- **Veredicto: Adaptada.**
- **Por qué:** en Agenda Lista el provider es **solo transporte**. Las reglas que el invariante 4 exige dentro de `MessagingProvider` están dispersas o no existen:
  - Ventana de servicio (24 h): no se modela. Los recordatorios usan plantilla siempre, y `trialAviso.ts` manda texto libre "best-effort".
  - Ventana gratis (72 h CTWA): no existe.
  - Horario 09:00–20:00: no existe.
  - Opt-out: lo revisa el runner de recordatorios (`hasOptIn`), no el provider.
  - Atención humana: compuerta pura en `bot/botMode.ts`, consultada por el pipeline inbound, no por el provider.
  - Frecuencia: no existe.

  Aquí se porta la interfaz, el `TwilioProvider` con transporte inyectable y la guarda `TEST_WHATSAPP_TO`. Se envuelve en una capa nueva que concentre las seis reglas (ventana, plantilla, horario, opt-out, frecuencia, atención humana) antes de llegar al transporte. Falta un segundo transporte para la API de Chatwoot, que depende de P2 en 0.3. `parseInbound` hoy ignora los parámetros `Referral*`; hay que agregarlos según lo que salga de 0.3. Se cambia el nombre `Tenant*` por `Organizacion*`.

### 2.2 Validación de firma de Twilio

- **Archivos:** `api/src/messaging/twilioSignature.ts` (41 líneas) y `twilioSignature.test.ts` (7 tests). También `webhook.ts` (`handleInbound`, que rechaza con 403 antes de procesar) y `adapters.ts` (reconstrucción de la URL pública detrás de CloudFront/ngrok con `PUBLIC_BASE_URL`).
- **Qué hace:** HMAC-SHA1 de URL + parámetros ordenados, comparación en tiempo constante. Implementado a mano, sin SDK.
- **Veredicto: Tal cual.** `twilioSignature.ts` y su test se copian sin cambios. `webhook.ts` y `adapters.ts` se copian si la API es Express; con Next.js se adapta `webhookRequestFromExpress` a `Request` de Web API.
- **Por qué:** cumple el invariante 9 para Twilio y es determinista. Pendiente aparte, que no existe en Agenda Lista: la validación del secreto compartido de los webhooks de Chatwoot.

### 2.3 Callbacks de estado

- **Archivos:** `api/src/messaging/webhook.ts` (`handleStatusCallback`), endpoint en `api/src/http/app.ts:1444`. `twilioProvider.ts` agrega `StatusCallback` a cada envío si existe `PUBLIC_BASE_URL`.
- **Qué hace:** valida firma, normaliza `MessageStatus`/`ErrorCode` y enmascara el teléfono. **Solo registra en log; no persiste el estado por mensaje.**
- **Veredicto: Adaptada.**
- **Por qué:** el parseo y la validación sirven tal cual. El bloque 1.5 exige guardar `delivered`/`read`/`failed` por mensaje e idempotencia por identificador del proveedor; eso se escribe nuevo sobre la tabla `mensaje`. La fuente del estado (Twilio, Chatwoot o Event Streams) se decide en P3 de 0.3, así que puede que este callback ni se use.

### 2.4 Soft delete

- **Archivos:** banderas `active: false` en clientes, servicios y profesionales (`api/src/admin/*.ts`, `http/app.ts`).
- **Qué hace:** "baja lógica" por entidad con un booleano. **No es soft delete general:** `data/repo.ts` y `data/rateLimit.ts` usan `DeleteCommand` físico en al menos cinco sitios (lista de espera, locks de cobro, eventos de cobro, dedup de inbound, rate limit).
- **Veredicto: No se porta.**
- **Por qué:** el invariante 3 exige `eliminado_en` en toda tabla y cero `DELETE` físico. Se implementa de cero en la capa de Prisma (extensión o middleware que filtre `eliminado_en IS NULL` y convierta `delete` en `update`). Lo útil de Agenda Lista es la idea de una guarda estática; ver 2.6.

### 2.5 Scope multi-tenant

- **Archivos:** `api/src/data/keys.ts` (PK `TENANT#<id>` en toda clave), `attachScope` en `api/src/http/app.ts:755`, guarda `scripts/check-tenant.ts`, e2e `e2e/desktop-tenant-isolation.spec.ts`.
- **Qué hace:** el aislamiento es estructural: en DynamoDB no se puede consultar sin la PK, y la PK lleva el tenant. `attachScope` saca el tenant de la sesión y nunca del cliente. `check:tenant` revisa con regex que `app.ts` no lea el tenant global del demo después de `app.use(attachScope)`.
- **Veredicto: No se porta el código. Se adapta el principio.**
- **Por qué:** en Postgres el aislamiento no es estructural; hay que imponerlo. El invariante 1 pide un scope único (cliente Prisma extendido que inyecta `organizacion_id` en todo `where`/`data`) más un test de no-fuga entre dos organizaciones. Se toman dos ideas: el tenant sale del contexto del request (o del canal en webhooks), nunca del payload; y una guarda estática que falle si alguien usa el cliente Prisma crudo fuera del módulo de scope.

### 2.6 Firewall `check:generico` y guardas hermanas

- **Archivos:** `scripts/check-generico.ts`, `scripts/check-messaging.ts`, `scripts/check-writes.ts`, `scripts/check-tenant.ts`. Dependen de `api/src/lib/paths.ts` (`REPO_ROOT`).
- **Qué hacen:**
  - `check:generico`: escanea `.ts/.tsx/.js/.json` en `api`, `web`, `scripts` y `sitio`, con regex de palabra completa con `\p{L}` (respeta acentos). Excluye `verticales/` y `*.test.ts`. Sale con código 1 y lista archivo:línea.
  - `check:messaging`: falla si fuera de `messaging/` aparece `api.twilio.com`, el SDK de Twilio, el header de firma o imports internos.
  - `check:writes`: falla si la capa HTTP o el front usan primitivas de escritura de DynamoDB.
- **Veredicto:**
  - `check:generico`: **Adaptada.** Se conserva el motor (walk + regex + reporte) y cambia la lista de términos: los del invariante 2 más nombres de sucursal. Las rutas a escanear se ajustan a este repo. Diferencia de criterio: el invariante 2 prohíbe los términos también en "tests de lógica", así que **no** se excluye `*.test.ts` en bloque. Solo se excluyen seeds y fixtures de seed.
  - `check:messaging`: **Adaptada.** Misma idea, extendida a la API de Chatwoot (invariante 4).
  - `check:writes`: **No se porta.** Está atada a DynamoDB y a `AppointmentService`. Su lugar lo toma una guarda equivalente para el cliente Prisma crudo (ver 2.5).
  - `check:tenant`: **No se porta.** Es regex sobre un solo archivo de Agenda Lista.
- **Por qué:** es la pieza con mejor relación valor/esfuerzo y no depende del stack.

### 2.7 Recordatorios y scheduler

- **Archivos:** `api/src/reminders/reminderEngine.ts` (selección pura), `reminderRunner.ts` (claim → envío → liberación si falla), `tickCore.ts`, `handler.ts` (Lambda por EventBridge cada 10 min), `idleNudge.ts`, `infra/reminders.yml` (con DLQ). Claim condicional en `data/repo.ts:204` (`claimReminderSent`).
- **Qué hace:** patrón at-most-once. Antes de enviar, un update condicional marca el recordatorio. Si otro tick ganó, no se envía. Si el envío falla, se libera para reintentar. `canSend` evita marcar como enviado lo que no se puede mandar por configuración.
- **Veredicto: Adaptada (solo el patrón del runner). No se porta el motor.**
- **Por qué:** el motor está escrito para citas (24 h/2 h, estados de cita); eso es Fase 2 y no se construye ahora. El patrón claim/liberación del runner es el que pide el invariante 8 para automatizaciones; en Postgres el claim es un `INSERT` en `automatizacion_ejecucion` con índice único `(automatizacion_id, entidad_tipo, entidad_id, ocurrencia)`. Para Fase 1 aplica solo al reenganche (1.6). El disparador (EventBridge contra cron en contenedor) se decide al desplegar, no ahora.

### 2.8 Códigos de rastreo de WhatsApp

- **Archivos:** no existen. Lo más cercano es `api/src/landing/utm.ts` (`parseUtm`: sanea `source`/`medium`/`campaign` a 120 caracteres), usado en el lead comercial y en el signup web. El enlace `wa.me` de `web/src/Landing.tsx` lleva texto fijo sin código. No hay manejo de `Referral*` ni de `ctwa_clid` en ninguna rama.
- **Veredicto: No se porta** (salvo `parseUtm`, tal cual, si la ruta de QR a landing de la sección 5 entra en alcance).
- **Por qué:** la atribución CTWA se diseña en 0.3 según la vía elegida (A, B o C).

### 2.9 Normalización de teléfonos

- **Archivos:** `api/src/landing/lead.ts` (`normalizePhoneMx`), usada por `admin/clients.ts`, `admin/import.ts`, `tenancy/validate.ts` y `landing/comercialLead.ts`. El inbound solo quita el prefijo `whatsapp:` (`bot/inboundService.ts:37`).
- **Qué hace:** 10 dígitos → `+52…`; 12 con `52` → `+52…`; **13 con `521` → `+521…` (conserva el 1)**.
- **Veredicto: No se porta.**
- **Por qué:** contradice el invariante 7, que exige colapsar `+521` a `+52`. Además el inbound no pasa por ella, así que el mismo número puede quedar con dos formatos. Se escribe `normalizarTelefono()` de cero en 0.1. Sí se puede reusar la idea de los casos de prueba.

### 2.10 Otras piezas útiles que no estaban en la lista

| Pieza | Archivos | Veredicto | Por qué |
|---|---|---|---|
| Detección de baja | `api/src/bot/baja.ts` + test | Adaptada | Determinista, sin acentos, palabra completa, solo aplica al remitente. Se agregan `CANCELAR` y `NO MOLESTAR` (sección 11 del contexto) cuidando falsos positivos, porque "cancelar" es ambiguo en conversación. |
| Detección de pedido de humano | `api/src/bot/humano.ts` | Adaptada | Regex determinista útil para disparar el handoff (1.4). Los textos de respuesta son de Agenda Lista y se reescriben. |
| Compuerta de modo manual | `api/src/bot/botMode.ts` | No se porta | Reactiva el bot sola después de 1 h. Aquí `en_atencion_humana` bloquea sin excepción y sin auto-reactivación (invariante 6). |
| Dedup de inbound | `data/repo.ts:563-620` (`InboundDedup` con TTL 48 h) | No se porta | Atado a DynamoDB con TTL y con borrado físico para liberar. En Postgres es índice único sobre el SID del proveedor en `mensaje` (invariante 8). |
| Logger con enmascarado de teléfono | `api/src/obs/logger.ts` (`log`, `maskPhone`) | Tal cual (por revisar) | Evita PII en logs. Falta leerlo completo antes de portarlo. |
| CI reutilizable | `.github/workflows/ci.yml` + `validar.yml` | Adaptada | Quitar DynamoDB Local y agregar el servicio Postgres. |
| `tsconfig.base.json` | raíz | Tal cual | Configuración estricta para TS nativo de Node. |

---

## 3. Lo que no se porta

| Pieza | Archivos | Por qué |
|---|---|---|
| `AppointmentService` y máquina de estados de cita | `api/src/appointments/*` | Dominio de citas. Las clases muestra son Fase 2, con otro modelo (`clase_muestra`, cupo por grupo). |
| Modelo de citas, disponibilidad y slots | `api/src/availability/*`, `data/slots.ts`, `calendar/*` | Motor de huecos por profesional. Aquí el cupo es por grupo con horario fijo. |
| Alta de negocios y onboarding | `api/src/tenancy/provision.ts`, `setup.ts`, `scripts/onboard-tenant.ts`, signup, billing/OpenPay | Invariante 1: no se construye el alta de organizaciones; hay una sola y sale del seed. |
| Agente conversacional | `api/src/bot/agent/*`, `classifier.ts`, `botRedactor.ts`, `lib/bedrock.ts`, `bench/*` | Invariante 10: el bot de Fase 1 es una máquina de estados sin LLM. |
| Capa de datos DynamoDB | `api/src/data/*`, `infra/dynamodb-table.yml` | Otro motor de base de datos. |
| Fidelidad, recompra, minería, transcripción | `loyalty/`, `recompra/`, `mineria/`, `transcripcion/` | Fuera de alcance. |
| Bandeja propia | `web/src/Conversations.tsx`, `MobileInbox.tsx` | La bandeja aquí es Chatwoot. |
| Vertical `escuela` de Agenda Lista | `verticales/escuela/*` | Modelada como citas con profesional, no como programa → grupo → horario. |

---

## 4. Riesgos y pendientes que salen del inventario

1. **Decisión de stack** (sección 1). Bloquea el andamiaje de 0.1.
2. **No hay integración con Chatwoot** en Agenda Lista. Todo lo de Chatwoot (Agent Bot, transporte saliente, secreto compartido) se escribe nuevo y depende de 0.3.
3. **Las reglas de envío no están centralizadas** en Agenda Lista. La capa de reglas de `MessagingProvider` es trabajo nuevo de Fase 1, no un port.
4. **`normalizePhoneMx` hace lo contrario de lo que pide el invariante 7.** Si en algún momento se comparten contactos entre ambos sistemas, los formatos no van a coincidir.
