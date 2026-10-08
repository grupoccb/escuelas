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

### 0.5 Demo local

Objetivo: ver el loop de captación completo en Chatwoot local, sin Twilio, antes de construir sobre él.

- **Esquema mínimo:** solo las tablas que la demo necesita, todas con `organizacion_id` y `eliminado_en`. Es un subconjunto de 1.1; ahí se completa.
- **Seed:** una organización, una vertical y dos sucursales, con datos tomados de `seed-sucursales-horarios.sql`.
- **Chatwoot local:** bandeja tipo API y Agent Bot conectado al backend, configurados con un script reproducible que sobrevive a `docker compose down -v`.
- **Bot:** máquina de estados de tres preguntas (nombre, edad, sucursal), creación del lead y paso de la conversación a "open" en Chatwoot.
- **Simulador:** script que hace de contacto escribiendo en la bandeja.
- Sin Twilio. Respeta los invariantes 4, 6, 7, 9, 10 y 11.

### Gates de Fase 0

- [ ] **G0.1** `docker compose up` levanta Postgres, Chatwoot y backend. `npm test` en verde. `check:generico` falla cuando se siembra un término prohibido.
- [ ] **G0.2** `docs/REUSO-AGENDA-LISTA.md` revisado y aprobado por Eduardo.
- [ ] **G0.3a** Prueba simulada: P1, P2 y P3 contestadas con evidencia. Vía elegida.
- [ ] **G0.3b** Prueba con anuncio real: el lead queda registrado con campaña y clic. Requiere G0.5.
- [ ] **G0.4** Decisión de cuentas de Twilio documentada.
- [ ] **G0.5** Externo: verificación del perfil de WhatsApp de karate iniciada en Meta.
- [ ] **G0.6** Demo local: Eduardo corre el script de simulación y ve en Chatwoot la conversación completa, con los tres datos capturados y la conversación en "open".

Fase 1 puede arrancar con G0.1 a G0.4 y G0.3a en verde. G0.3b bloquea el lanzamiento, no la construcción.

---

## Fase 1 — Atención inmediata de leads

Construida en `docs/PLAN-NOCHE.md` (rama `noche-fase1`) y ajustada en `docs/PLAN-NOCHE-2.md` (etapa A, rama `noche-2`), contra los fakes. Alcance: una vertical con sus dos sucursales; las demás entran por seed (prueba de fuego hecha). Ningún pendiente de la escuela bloquea esta fase. Los gates los marca Eduardo; aquí queda la evidencia.

### Bloques (como quedaron)

- **1.1 Esquema.** `organizacion`, `vertical`, `sucursal`, `sucursal_vertical`, `canal_whatsapp`, `bandeja_chatwoot`, `campana`, `etapa_pipeline`, `lead`, `prospecto`, `conversacion`, `mensaje`, `interaccion`, `consentimiento`, `plantilla_mensaje`, `automatizacion`, `automatizacion_ejecucion`, `tarea_asesor`. Todas con `organizacion_id` y `eliminado_en`; toda referencia entre tablas es una llave foránea compuesta con la organización.
- **1.2 Entrada.** Mensaje entrante (webhook de Chatwoot firmado) → bandeja → vertical → lead y conversación con teléfono normalizado, idempotente por identificador del proveedor. La atribución entra por una interfaz (`FuenteAtribucion`); hoy la vía A (Chatwoot reenvía los `Referral*`).
- **1.3 Bot de tres preguntas.** Máquina de estados sin LLM: nombre, edad, sucursal. Validaciones, tres reintentos, palabras de baja (`BAJA`, `STOP`, `CANCELAR`, `NO MOLESTAR`) con una sola confirmación.
- **1.4 Handoff.** Captura completa: nota privada con el resumen, conversación abierta en Chatwoot y `en_atencion_humana`. Fuera de la ventana de servicio y sin plantilla apta: no se manda y se crea tarea para el asesor.
- **1.5 Estados de entrega.** `entregado`, `leído`, `fallido` guardados por mensaje; la fuente está detrás de una interfaz. Un `fallido` crea una tarea para el asesor con el código de error, una por mensaje (A5).
- **1.6 Reenganche.** Plantilla aprobada a las 25 h para el lead que dejó de contestar a mitad de la captura, con todas las reglas del `MessagingProvider`: ventana, plantilla, horario, baja, frecuencia (3 automáticos por día y 1 de marketing cada 7 días por teléfono, configurable por organización, A6) y atención humana. Idempotente por `(automatizacion_id, entidad_tipo, entidad_id, ocurrencia)`.
- **1.7 Reporte mínimo.** Leads por campaña, sucursal y etapa (`npm run reporte:leads`).
- **Ajustes de la sesión 2 (etapa A).** Lead a medias: a los 30 minutos sin respuesta la conversación se vuelve visible para los asesores con la nota de datos parciales, sin marcar `en_atencion_humana`; ese estado lo activa una persona al asignarse la conversación o al mandar un mensaje. Quien se dio de baja y vuelve a escribir deja una tarea para el asesor y el bot sigue callado. Reclamos huérfanos recuperados sin reenviar (a lo sumo una vez). Borde firmado para Twilio (`X-Twilio-Signature`, reintentos por `MessageSid`, reenvío sin modificar).

### Gates de Fase 1 (los marca Eduardo)

- [ ] El loop completo corre offline con los fakes, de mensaje entrante a handoff.
- [ ] Test de no-fuga entre dos organizaciones en verde.
- [ ] El mismo número escrito como `+521` y `+52` produce un solo lead.
- [ ] Con el lead `en_atencion_humana`, ninguna automatización manda nada.
- [ ] Un reintento de webhook no duplica lead ni mensaje.
- [ ] Prueba de fuego: una vertical nueva queda operando solo con filas de seed, sin cambios de código.
- [ ] Prueba en teléfonos reales con Telcel, AT&T y Movistar.
- [ ] El asesor ve en Chatwoot la transcripción completa y los tres datos capturados.
- [ ] Elegir la vía de atribución (A o C) con una prueba en Twilio real (G0.3b).

---

## Fase 2 — Cotizador, clase muestra, recordatorios

Construida en la sesión `docs/PLAN-NOCHE-2.md` (rama `noche-2`), contra simuladores. Sin gates marcados. Los datos que la escuela aún no da (precios, cupos, duraciones, direcciones, edades, salones) van como valores de ejemplo `[SUPUESTO]` en los seeds y se editan desde administración; ninguno vive en código.

Decisiones de producto tomadas (ver el plan): el bot pregunta cuál programa cuando una edad cae en más de uno; si la sucursal no tiene el programa se ofrece la otra (configurable); el cotizador por WhatsApp se enciende o apaga por vertical; el aviso al maestro sale por plantilla del `MessagingProvider` y también queda en una lista dentro de la aplicación.

### Bloques

- **2.1 Oferta (C1–C4).** Instructores y salones con choque de salón real; precios versionados por fecha; promociones con beneficios, condiciones, momento de disparo, acumulación y prioridad; catálogo de las tres verticales del insumo con sus verificaciones.
- **2.2 Cotizador (C5–C9).** Edad, vertical y sucursal dan programa, grupos con lugar, precio vigente y promociones aplicables, respetando la fecha de corte de edad. Varios programas para una edad, otra sucursal, cotización guardada, cotizador por WhatsApp y lista de espera.
- **2.3 Clase muestra (D1–D4).** Agendar, reprogramar y cancelar respetando lugares; aviso al maestro; recordatorios de 24 h y 2 h (si ya no alcanzan antes de la clase, se descartan); asistió / no asistió y recuperación.
- **2.4 Registro y seguimiento (D5–D8).** Registro del maestro (sección 8 del contexto), reglamento y autorización de imagen con evidencia, embudo con historial y motivos de pérdida, lead frío y promoción por vencer.
- **2.5 Entrada por QR (E1–E3).** Landing pública por vertical con cuestionario, código de rastreo de WhatsApp y códigos QR por campaña y sucursal.

### Gates de Fase 2 (borrador, los marca Eduardo)

- [ ] Una edad, una vertical y una sucursal dan los grupos con lugar, el precio vigente y las promociones aplicables.
- [ ] Una edad que cae en dos programas hace que el bot pregunte cuál.
- [ ] Dos personas por el último lugar de un grupo: solo una lo obtiene.
- [ ] El recordatorio que ya no alcanza antes de la clase se descarta y queda registrado, también para el grupo del domingo.
- [ ] Ningún campo de salud aparece en logs, notas de Chatwoot ni mensajes de WhatsApp.
- [ ] Datos reales de la escuela cargados (reemplazan los `[SUPUESTO]`).
- [ ] Plantillas de recordatorio y aviso aprobadas por Meta.

## Fase 3 — Alumnos, CRM, cobranza, tableros

Construida en la misma sesión, contra simuladores. Sin gates marcados. Pagos en registro manual (sin pasarela). Usuarios con correo y contraseña y roles (administrador, asesor, maestro, recepción). Quién cierra la inscripción es configuración de la organización: por defecto el asesor por WhatsApp, y el maestro marca "listo para cerrar".

### Bloques

- **3.1 Usuarios y API (B1–B6).** Usuarios y roles por organización y sucursal, API base con errores y paginación, datos de salud con registro de accesos, enlace con los agentes de Chatwoot y protección de rutas públicas.
- **3.2 Familia e inscripción (F1–F7).** Tutor, alumno y su relación M:N; conversión del lead en una transacción sin recaptura; inscripción con precios congelados y promoción; cupo real; cambio de grupo, congelar y baja; los dos modos de cierre; hermanos.
- **3.3 Operación (G1–G5).** Pase de lista idempotente, derivados de asistencia, progresión genérica, eventos y expediente del alumno.
- **3.4 Finanzas (H1–H7).** Cargos generados cada mes de forma idempotente, pagos repartidos entre cargos de varios hijos, estado de cuenta por familia, beneficios diferidos, productos y ventas, cobranza con horario y frecuencia, y cuadratura en decimales exactos.
- **3.5 Reportes (I1–I5).** Clases muestra, costo por alumno inscrito por campaña, ejecutivo, datos de demo deterministas y exportación a CSV.
- **3.6 Interfaz web (J1–J10).** React + Vite en español, primero celular, para maestro, asesor, recepción y administración, con tableros y recorridos en navegador.
- **3.7 Endurecimiento (K1–K9).** Prueba de fuego total, concurrencia, seguridad, observabilidad, respaldo, infraestructura como código para AWS (sin desplegar), documentación, demo guiada y auditoría final.

### Gates de Fase 3 (borrador, los marca Eduardo)

- [ ] Conversión de lead a familia sin recaptura de ningún dato.
- [ ] Un pago de la madre cubre las mensualidades de dos hijos y los saldos cuadran.
- [ ] Los beneficios diferidos se liberan solo al registrar el pago que cumple la condición.
- [ ] Una sucursal y una vertical nuevas operan de punta a punta dadas de alta solo desde administración.
- [ ] Revisión visual de la interfaz por Eduardo en dispositivos reales.
- [ ] Respaldo y restauración probados fuera de la máquina de desarrollo.
- [ ] Infraestructura de AWS revisada antes de desplegar.
