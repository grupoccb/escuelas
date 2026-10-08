# BITACORA-NOCHE-2.md

Sesión del 7 de octubre de 2026. Rama `noche-2` (desde `noche-fase1`). Plan: `docs/PLAN-NOCHE-2.md`.

| Bloque | Estado | Commit | Nota |
|---|---|---|---|
| A0 | HECHO | f987191 | Preparación |
| A1 | HECHO | ver sección | Auditoría de la primera sesión: 2 ALTA, 9 MEDIA, 7 BAJA |
| A2 | PENDIENTE | | Correcciones de hallazgos altos de A1 |
| A3 | PENDIENTE | | Lead a medias |
| A4 | PENDIENTE | | Baja que vuelve a escribir |
| A5 | PENDIENTE | | Entrega fallida |
| A6 | PENDIENTE | | Frecuencia |
| A7 | PENDIENTE | | Firma en el borde |
| A8 | PENDIENTE | | SPEC.md al día |
| B1 | PENDIENTE | | Usuarios y roles |
| B2 | PENDIENTE | | Autorización por rol y sucursal |
| B3 | PENDIENTE | | API base |
| B4 | PENDIENTE | | Datos sensibles |
| B5 | PENDIENTE | | Usuario y agente de Chatwoot |
| B6 | PENDIENTE | | Protección de rutas públicas |
| C1 | PENDIENTE | | Instructores y salones |
| C2 | PENDIENTE | | Precios versionados |
| C3 | PENDIENTE | | Promociones |
| C4 | PENDIENTE | | Catálogo de las tres verticales |
| C5 | PENDIENTE | | Cotizador determinista |
| C6 | PENDIENTE | | Varios programas para una edad |
| C7 | PENDIENTE | | Otra sucursal |
| C8 | PENDIENTE | | Cotización guardada y cotizador por WhatsApp |
| C9 | PENDIENTE | | Lista de espera |
| D1 | PENDIENTE | | Clase muestra: agendar, reprogramar, cancelar |
| D2 | PENDIENTE | | Aviso al maestro |
| D3 | PENDIENTE | | Recordatorios de 24 h y 2 h |
| D4 | PENDIENTE | | Asistió / no asistió y recuperación |
| D5 | PENDIENTE | | Registro del maestro |
| D6 | PENDIENTE | | Reglamento y autorización de imagen |
| D7 | PENDIENTE | | Embudo con historial |
| D8 | PENDIENTE | | Lead frío y promoción por vencer |
| E1 | PENDIENTE | | Landing pública por vertical |
| E2 | PENDIENTE | | Código de rastreo de WhatsApp |
| E3 | PENDIENTE | | Códigos QR |
| F1 | PENDIENTE | | Tutor, alumno y relación M:N |
| F2 | PENDIENTE | | Conversión en una transacción |
| F3 | PENDIENTE | | Inscripción |
| F4 | PENDIENTE | | Cupo real |
| F5 | PENDIENTE | | Cambio de grupo, congelar y baja |
| F6 | PENDIENTE | | Quién cierra la inscripción |
| F7 | PENDIENTE | | Hermanos |
| G1 | PENDIENTE | | Pase de lista |
| G2 | PENDIENTE | | Derivados de asistencia |
| G3 | PENDIENTE | | Progresión genérica |
| G4 | PENDIENTE | | Eventos y elegibilidad |
| G5 | PENDIENTE | | Expediente del alumno |
| H1 | PENDIENTE | | Cargos |
| H2 | PENDIENTE | | Pagos |
| H3 | PENDIENTE | | Estado de cuenta por familia |
| H4 | PENDIENTE | | Beneficios diferidos |
| H5 | PENDIENTE | | Productos y ventas |
| H6 | PENDIENTE | | Cobranza |
| H7 | PENDIENTE | | Cuadratura |
| I1 | PENDIENTE | | Reporte de clases muestra |
| I2 | PENDIENTE | | Costo por alumno inscrito por campaña |
| I3 | PENDIENTE | | Reporte ejecutivo |
| I4 | PENDIENTE | | Datos de demo |
| I5 | PENDIENTE | | Exportación a CSV |
| J1 | PENDIENTE | | Interfaz: base |
| J2 | PENDIENTE | | Interfaz: maestro en celular |
| J3 | PENDIENTE | | Interfaz: asesor |
| J4 | PENDIENTE | | Interfaz: conversión e inscripción |
| J5 | PENDIENTE | | Interfaz: recepción |
| J6 | PENDIENTE | | Interfaz: familia y expediente |
| J7 | PENDIENTE | | Interfaz: administración del catálogo |
| J8 | PENDIENTE | | Interfaz: mensajería y usuarios |
| J9 | PENDIENTE | | Interfaz: tableros |
| J10 | PENDIENTE | | Interfaz: recorridos en navegador |
| K1 | PENDIENTE | | Prueba de fuego total |
| K2 | PENDIENTE | | Concurrencia y ráfagas |
| K3 | PENDIENTE | | Revisión de seguridad |
| K4 | PENDIENTE | | Observabilidad |
| K5 | PENDIENTE | | Respaldo y restauración |
| K6 | PENDIENTE | | Infraestructura como código |
| K7 | PENDIENTE | | Documentación |
| K8 | PENDIENTE | | Demo guiada |
| K9 | PENDIENTE | | Auditoría final |

## A0. Preparación

**Qué se hizo**
- Rama `noche-2` creada desde `noche-fase1`. Esta bitácora con los 78 bloques. Commit `f987191`.

**Verificación (línea base)**
- `npm run validar` → exit 0 (102 tests). `npm run test:int` → exit 0 (94 tests).

**Decisiones que tomé**
- Las etapas se ejecutan con subagentes implementadores (un brief común con las convenciones del repo) y un subagente auditor distinto por etapa. Alternativa descartada: hacerlo todo en una sola conversación; el tope de turnos de la sesión no alcanza para 78 bloques.

**Para Eduardo**
- Nada.

## A1. Auditoría de la primera sesión

**Qué se hizo**
- Subagente con contexto nuevo, sin haber escrito el código, trabajó sobre una copia limpia del commit y proyectos de Docker aparte (`auditoria-a1`, ya bajado). Informe completo: `docs/auditorias/fase-1.md`.

**Resultado**
- Se reproduce desde cero: `validar` (102 tests), `test:int` (94 tests, también dos veces seguidas), migraciones sobre base vacía y con datos, `docker compose` y la demo. Ningún test preexistente debilitado.
- ALTA: **F1-01** reclamos huérfanos (ejecución del motor y mensaje `enviando`) sin recuperación, y mensaje `pendiente` que sale tarde si falla `despachar`; **F1-02** `en_atencion_humana` no se entera de un asesor que entra sin que el contacto escriba.
- MEDIA: F1-03 estado de entrega antes del id externo; F1-04 horario/frecuencia dependen de la etiqueta `origen`; F1-05 lead borrado; F1-06 reenganche no revalida; F1-07 omisiones sin tarea; F1-08/F1-09 las guardas `check:*` se dejan esquivar; F1-10 sin validación de firma de Twilio (se resuelve en A7); F1-11 producción arranca con transporte falso.
- BAJA: F1-12 a F1-18.

**Para Eduardo**
- Diez decisiones de producto al final del informe (sección 5). Las que ya tienen respuesta en el plan: calendario del lead a medias (A3), baja que vuelve a escribir (A4), entrega fallida (A5), frecuencia (A6), firma en el borde (A7). Quedan abiertas: reenganche tras responder con `max_intentos = 1`, borrado de un lead, qué hace "resuelta" en Chatwoot.
