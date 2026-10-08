# PLAN-NOCHE-2.md — El sistema completo contra simuladores

7 de octubre de 2026. Va en `docs/PLAN-NOCHE-2.md`. Reemplaza cualquier versión anterior de este archivo.

La primera sesión (`docs/PLAN-NOCHE.md`, bitácora en `docs/BITACORA-NOCHE.md`) construyó la Fase 1 en la rama `noche-fase1`: 12 bloques en cerca de una hora. Esta sesión está dimensionada para unas ocho horas: 78 bloques en 11 etapas que llevan el sistema desde el anuncio hasta el alumno inscrito, con asistencia, cobranza, tableros e interfaz web.

Eduardo no va a estar y nadie contesta preguntas hasta la mañana. No te detengas entre etapas a resumir ni a pedir confirmación. Después de cualquier compactación de contexto, lo primero es volver a leer este archivo y `docs/BITACORA-NOCHE-2.md`.

Fuentes: `CLAUDE.md`, `docs/CONTEXTO-PROYECTO.md` y los cinco archivos de `docs/insumos/`. Donde choquen, manda `CLAUDE.md`, luego este plan, luego `docs/REVISION-INSUMOS.md`.

## Autorización, solo para esta sesión

- Queda suspendida la regla de `CLAUDE.md` de no construir fases futuras, y el "Fuera de alcance. No construir" de las Fases 2 y 3 en `SPEC.md`.
- Queda suspendida la regla de esperar gates. **No marcas ningún gate**; dejas evidencia.
- Los 14 invariantes de `CLAUDE.md` siguen vigentes sin excepción.

## Decisiones de Eduardo

No las vuelvas a preguntar.

**Ajustes a lo ya construido**
1. **Lead a medias.** Vuelve a 30 minutos, pero visible no es atendido (bloque A3). Los 72 h se revierten.
2. **Alguien dado de baja que vuelve a escribir:** tarea para el asesor. El bot sigue callado.
3. **Entrega fallida:** tarea para el asesor.
4. **Frecuencia:** máximo 3 mensajes automáticos por teléfono al día y 1 de marketing cada 7 días (contexto, sección 11). Configurable por organización.
5. **Atribución:** se construye la firma en el borde (A7). La elección entre vía A y C sigue abierta hasta probar con Twilio real.

**Datos y decisiones que la escuela aún no da**
6. **Precios, cupos, duraciones, direcciones, edades y salones:** valores de ejemplo marcados `[SUPUESTO]` en los seeds y editables desde administración. Ninguno vive en código.
7. **Quién cierra la inscripción:** se construyen los dos modos, por configuración de la organización. Por defecto, el asesor por WhatsApp; el maestro marca "listo para cerrar".
8. **Sucursal sin el programa buscado:** configurable. Por defecto se ofrece la otra sucursal.
9. **Edad que cae en más de un programa:** el bot pregunta cuál quiere. Es la salida genérica al traslape que reportó `docs/REVISION-INSUMOS.md`.

**Alcance técnico**
10. **Pagos:** registro manual. Sin pasarela de pago.
11. **Usuarios:** correo y contraseña con roles. Sin inicio de sesión con terceros.
12. **Salud de menores:** alergias, condiciones y medicamentos son datos sensibles. Solo los ven los roles que los necesitan. Nunca van a logs, a notas de Chatwoot ni a mensajes de WhatsApp.
13. **Aviso al maestro:** plantilla por `MessagingProvider` y lista en la aplicación.
14. **Interfaz:** React + Vite, en español, primero celular. Sobria y funcional; Eduardo revisa lo visual después, en dispositivos reales.
15. **Cotizador por WhatsApp:** se enciende o apaga por vertical. Encendido en la organización de demo.

## Reglas de la sesión

Aplican todas las reglas de la noche de `docs/PLAN-NOCHE.md`. Además:

**Ramas y puntos de corte**
- Rama `noche-2`, creada desde `noche-fase1`. No se toca `noche-fase1` ni `main`.
- Un commit por bloque. Al cerrar cada etapa, una etiqueta `etapa-A`, `etapa-B`, etc., para que Eduardo pueda quedarse con el sistema hasta cualquier etapa.

**Cierre de cada bloque**
- `npm run validar` y `npm run test:int` en verde, commit y entrada en la bitácora.
- Toda regla de negocio lleva test. Lo que mueve dinero o cupo lleva además test de concurrencia.

**Cierre de cada etapa**
- Un subagente con contexto nuevo, que no escribió la etapa, intenta refutarla: corre todo desde volúmenes vacíos en un proyecto compose aparte, revisa los invariantes contra el código y busca tests debilitados.
- Sus hallazgos van a `docs/auditorias/etapa-X.md`. Los defectos claros de gravedad alta se corrigen antes de etiquetar. Lo que sea decisión de producto se anota para Eduardo.

**Dependencias**
- Se permiten las que hagan falta para la interfaz, las pruebas en navegador, las gráficas y la infraestructura como código. Elige las más usadas y estables, fija la versión y anota cada una con su motivo.
- Siguen prohibidos un LLM en el bot y `npm audit fix --force`.

**Cuando algo no sale**
- Tres intentos serios; si no, regresa al último commit, marca BLOQUEADO con motivo y sigue con el siguiente bloque que no dependa de él.
- Si una etapa completa queda bloqueada, sigue con la siguiente que no dependa de ella.

**Sin tráfico real**
- Nada contra Twilio, Meta ni AWS. La infraestructura se escribe y se valida sin desplegar.

## Etapa A — Auditoría y ajustes de Fase 1

- **A0. Preparación.** Rama, bitácora nueva con la tabla de los 78 bloques, línea base de `validar` y `test:int`.
- **A1. Auditoría de la primera sesión.** Subagente con contexto nuevo. Entrega `docs/auditorias/fase-1.md`. Revisa: todo desde cero con volúmenes vacíos; `git diff main..noche-fase1` sobre tests que ya existían; qué excluye cada guarda `check:*`; los 14 invariantes uno por uno; consultas fuera del scope de organización; la ejecución reclamada que queda a medias y el evento de entrega que llega antes de guardarse el identificador; migraciones sobre base vacía y con datos; cualquier "HECHO" que no se pueda reproducir.
- **A2. Correcciones** de los hallazgos altos de A1, cada una con su test.
- **A3. Lead a medias.** A los 30 minutos la conversación se vuelve visible para los asesores con la nota de datos parciales, sin marcar `en_atencion_humana`. Ese estado se activa cuando una persona la toma: se la asigna en Chatwoot o manda el primer mensaje. Verifica qué eventos de Chatwoot llegan al backend; si la asignación no llega, usa el primer mensaje del asesor. Mientras nadie la tome, el bot continúa la captura si el contacto regresa y el reenganche de 25 h puede salir. La captura completa no cambia.
- **A4. Baja que vuelve a escribir.** Tarea para el asesor, una pendiente por conversación.
- **A5. Entrega fallida.** Tarea con el código de error, una por mensaje.
- **A6. Frecuencia** según la decisión 4, en la configuración de la organización.
- **A7. Firma en el borde.** El backend expone las rutas que Twilio llama en lugar de Chatwoot (entrantes y estados). Valida `X-Twilio-Signature`, descarta reintentos por `MessageSid` y reenvía el cuerpo sin modificar. No normalices `From` antes de reenviar: queda como opción apagada. Pruebas con token falso: firma válida pasa, inválida se rechaza, un reintento llega una sola vez, los `Referral*` llegan intactos.
- **A8. `SPEC.md` al día.** Fase 1 como quedó y las Fases 2 y 3 detalladas con los bloques de este plan. Sin marcar gates.

## Etapa B — Usuarios, permisos y API

- **B1. Usuarios y roles** por organización: administrador, asesor, maestro, recepción. Contraseñas con hash, sesiones, cierre de sesión.
- **B2. Autorización** por rol y por sucursal. Un maestro solo ve sus grupos. Test por cada rol de lo que sí y lo que no puede.
- **B3. API base.** Convención de errores, validación de entrada, paginación. Registro de quién cambió qué.
- **B4. Datos sensibles** según la decisión 12, con registro de accesos y un test que falle si un campo de salud aparece en un log, una nota o un mensaje.
- **B5. Usuario y agente de Chatwoot** enlazados, para saber qué asesor tiene cada conversación.
- **B6. Protección de rutas públicas:** límite de peticiones y tamaño.

## Etapa C — Oferta completa y cotizador

- **C1. Instructores y salones.** Asignación a grupos; el choque de salón se detecta con datos reales de salón.
- **C2. Precios versionados por fecha.** Inscripción y mensualidad por programa.
- **C3. Promociones.** `promocion`, `promocion_beneficio`, `promocion_aplicacion`, con las condiciones y momentos de disparo del modelo de datos, acumulación y prioridad.
- **C4. Catálogo de las tres verticales** del insumo, con sus verificaciones.
- **C5. Cotizador determinista.** Edad, vertical y sucursal dan programa, grupos con lugar, precio vigente y promociones aplicables. Respeta la fecha de corte de edad.
- **C6. Varios programas para una edad:** decisión 9.
- **C7. Otra sucursal:** decisión 8.
- **C8. Cotización guardada** y cotizador por WhatsApp después de las tres preguntas: propone horarios y registra lo cotizado. Decisión 15.
- **C9. Lista de espera** cuando no hay lugar.

## Etapa D — Clase muestra y seguimiento

- **D1. Agendar, reprogramar y cancelar** la clase muestra, desde el bot o el asesor, respetando lugares.
- **D2. Aviso al maestro:** decisión 13.
- **D3. Recordatorios de 24 h y 2 h.** Si ya no alcanza antes de la clase, se descarta. Probar el grupo del domingo.
- **D4. Asistió o no asistió,** y recuperación de quien no llegó.
- **D5. Registro del maestro:** todos los campos de la sección 8 del contexto, por API.
- **D6. Reglamento y autorización de imagen** con evidencia de aceptación.
- **D7. Embudo:** cambios de etapa con historial, motivos de pérdida, lead perdido y recuperado.
- **D8. Lead frío y promoción por vencer,** con frecuencia y bajas.

## Etapa E — Entrada por QR y landing

- **E1. Landing pública por vertical** con el cuestionario; crea el lead.
- **E2. Código de rastreo de WhatsApp:** el enlace lleva un código que identifica campaña y sucursal; al llegar el mensaje, la atribución queda en el lead.
- **E3. Códigos QR** por campaña y sucursal.

## Etapa F — Familia e inscripción

- **F1. Tutor, alumno y su relación** M:N con las banderas del modelo. Un tutor por teléfono normalizado.
- **F2. Conversión en una transacción:** del lead salen tutor, alumnos e inscripciones. Test de cero recaptura: ningún dato ya capturado se vuelve a pedir.
- **F3. Inscripción** con precios congelados, promoción aplicada, origen del lead y día de corte.
- **F4. Cupo real.** La ocupación cuenta inscripciones activas. Dos inscripciones por el último lugar: gana una.
- **F5. Cambio de grupo con historial, congelar y baja con motivo.**
- **F6. Quién cierra:** decisión 7, los dos modos.
- **F7. Hermanos.** La promoción por hermanos se aplica sola; lista de familias con un solo hijo inscrito; bienvenida de inscripción.

## Etapa G — Operación

- **G1. Pase de lista** por grupo y fecha, idempotente.
- **G2. Derivados:** asistencia de 30 días, racha de faltas y tarea al llegar al umbral.
- **G3. Progresión genérica** con etiquetas por vertical y sus niveles como filas.
- **G4. Eventos** y elegibilidad por clases mínimas.
- **G5. Expediente del alumno:** todo lo de la sección 9 del contexto en una consulta.

## Etapa H — Finanzas

- **H1. Cargos.** Inscripción y mensualidades; generación mensual idempotente por inscripción y periodo.
- **H2. Pagos.** Un pago se reparte entre varios cargos de varios hijos; pago parcial; cancelación sin borrar.
- **H3. Estado de cuenta por familia,** saldo y antigüedad de lo vencido.
- **H4. Beneficios diferidos.** Se liberan al registrar el pago que cumple la condición; lista de uniformes por entregar.
- **H5. Productos y ventas.**
- **H6. Cobranza:** recordatorios con horario y frecuencia.
- **H7. Cuadratura.** Dinero en decimales exactos, nunca punto flotante. Tests que comprueban que pagos, aplicaciones, cargos y saldos cuadran siempre.

## Etapa I — Reportes y datos

- **I1. Clases muestra:** agendadas, asistidas, no asistidas y conversión, por fuente, vertical y sucursal.
- **I2. Costo por alumno inscrito por campaña,** con el gasto capturado a mano.
- **I3. Ejecutivo:** activos, altas, bajas, deserción, ingreso recurrente, cartera vencida y ocupación por grupo.
- **I4. Datos de demo:** unos 300 alumnos y seis meses de historia, generados de forma determinista.
- **I5. Exportación a CSV.**

## Etapa J — Interfaz web

- **J1. Base:** inicio de sesión, navegación por rol, servida desde `docker compose`.
- **J2. Maestro, en celular:** clases muestra del día, registro del alumno, pase de lista.
- **J3. Asesor:** embudo de leads, tareas, ficha del lead con su cotización y enlace a la conversación en Chatwoot.
- **J4. Conversión e inscripción,** paso a paso y sin recaptura.
- **J5. Recepción:** registrar pago, estado de cuenta, uniformes por entregar, ventas.
- **J6. Familia y expediente del alumno.**
- **J7. Administración del catálogo:** verticales, sucursales, programas, grupos, horarios, instructores, precios y promociones.
- **J8. Administración de mensajería y usuarios:** plantillas, automatizaciones, límites, roles.
- **J9. Tableros** de clases muestra y ejecutivo.
- **J10. Recorridos en navegador** de los cinco flujos principales, con capturas de celular y de escritorio en `docs/capturas/` para la revisión de Eduardo.

## Etapa K — Endurecimiento y entrega

- **K1. Prueba de fuego total:** una sucursal y una vertical nuevas dadas de alta solo desde administración, sin tocar código, operando de punta a punta.
- **K2. Concurrencia y ráfagas** en cupo, pagos y webhooks.
- **K3. Revisión de seguridad:** sesiones, roles, inyección, secretos y dependencias, con correcciones.
- **K4. Observabilidad:** logs estructurados con teléfonos enmascarados, salud y métricas del canal.
- **K5. Respaldo y restauración** probados en local.
- **K6. Infraestructura como código** para AWS, escrita y validada sin desplegar.
- **K7. Documentación:** operación por rol, alta de un cliente nuevo y lista de lo que falta con credenciales reales.
- **K8. Demo guiada** con un solo comando: del anuncio simulado al alumno inscrito con su primer pago.
- **K9. Auditoría final** de todo el sistema por un subagente nuevo, correcciones y resumen.

## Bitácora

`docs/BITACORA-NOCHE-2.md`, con el formato de la primera: tabla de estado de los 78 bloques al inicio y una sección por bloque con qué se hizo, verificación con su salida, decisiones tomadas con la alternativa descartada y lo que Eduardo debe revisar.

Al terminar, arriba de todo:
- resumen de diez líneas como máximo,
- las cinco cosas que Eduardo debe ver primero,
- una lista única de todos los `[SUPUESTO]` y de las decisiones de producto que quedaron abiertas.
