# Inventario de configuración (V5)

9 de octubre de 2026. Responde una pregunta: **¿qué puede cambiarse sin tocar código, quién lo cambia y cómo?** Se recorrió `prisma/schema.prisma`, `src/configuracion/`, las constantes con nombre y los números sueltos de `src/**`, los seeds (`prisma/seed/*.sql`), el entorno (`.env.example`, `docker-compose.yml`, `infra/ecs.tf`) y lo que ya había en Administración.

Cada fila dice qué es, dónde vive, quién lo cambiaría (**Escuela**, **CCB** = Grupo CCB / el equipo técnico, **nadie**), con qué frecuencia y la decisión:

| Decisión | Significa |
|---|---|
| **V5 → administración** | Estaba como constante o solo se cambiaba por SQL; V5 lo pasó a la pantalla (con rango, valor de siempre, explicación, validación en servidor, CHECK en la base, registro de cambios y efecto sin reiniciar) |
| **Ya en administración** | Ya se editaba desde una pantalla de Administración (se dice cuál) |
| **Por API / comando / entorno** | No tiene pantalla (todavía o a propósito); se cambia con el comando o la variable que se da aquí, con ejemplo |
| **No se cambia** | Es una regla del producto o de WhatsApp; se dice por qué |

Regla de oro de V5: **ningún ajuste nuevo cambió el comportamiento de nadie.** Cada uno nació con el valor que tenía la constante que reemplaza (una prueba lo comprueba) y las organizaciones sin fila de configuración siguen leyendo los valores de siempre.

## Cómo se hace cada cosa

### A. Desde Administración (lo normal)
Entrar como administrador → **Administración**. Las áreas: Disciplinas, Sucursales, Programas, Grupos y horarios, Instructores y salones, Precios, Promociones, Canales de WhatsApp, Módulos, **Configuración**, **Textos del asistente**, **Etapas del embudo**, **Motivos de pérdida y de baja**, Plantillas de mensaje, Automatizaciones, Usuarios y roles, Bandeja del administrador.

### B. Por la API (lo que aún no tiene pantalla)
La API es la misma que usa la interfaz (`docs/API.md`). Con un administrador:

```bash
# 1) Iniciar sesión y guardar la cookie (el identificador es el de la escuela, el que se escribe al entrar)
curl -s -c cookie.txt -H 'Content-Type: application/json' \
  -d '{"organizacion":"<identificador>","correo":"admin@escuela.mx","contrasena":"…"}' https://<dominio>/api/sesion

# 2) Llamar con la cookie. Todo método que cambia algo lleva Content-Type JSON (o X-Requested-With).
curl -s -b cookie.txt -H 'Content-Type: application/json' -X PATCH \
  -d '{"lead_a_medias_minutos":45}' https://<dominio>/api/configuracion
```

En local (la demo): `http://localhost:3000` y la organización `escuela-demo`. Cada cambio queda en el registro de cambios (`GET /api/registro-cambios?entidad_tipo=…`).

### C. Por SQL revisado (altas que a propósito no tienen API)
Con la cuenta que migra, nunca con la de la aplicación:

```bash
DATABASE_URL=<cuenta dueña> npx prisma db execute --file prisma/seed/<escuela>.sql
```

Los seeds son idempotentes. Solo hay tres cosas que hoy se dan de alta así: la organización, las automatizaciones y la matriz de transiciones de etapa (ver sus filas).

### D. Entorno
Variables del proceso (`.env` en local, `infra/ecs.tf` y Secrets Manager en AWS). **Cambiarlas exige reiniciar el servicio.** Lista completa en la sección 11.

---

## 1. Horario y ventanas de los mensajes

| Ítem | Qué es | Dónde vive | Quién · cuándo | Decisión |
|---|---|---|---|---|
| Hora de inicio y de fin del envío | Entre qué horas puede salir lo que **inicia** el sistema (recordatorios, reenganche, avisos de pago, promociones). La escuela puede **estrecharlo** (p. ej. 10:00–18:00), nunca ampliarlo | `configuracion_organizacion.horario_envio_inicio_min` / `horario_envio_fin_min` (540 y 1200). CHECK `configuracion_horario_envio_chk`. Lector: `leerConfiguracion` → `MessagingProvider` (último filtro) y todo lo que programa (`src/mensajeria/horario-envio.ts`) | Escuela · rara vez | **V5 → administración** (Configuración → «Horario de los mensajes automáticos»). Con una automatización que tiene su propio horario vale el **más estrecho** de los dos; si no se tocan, manda el de la escuela |
| Piso y techo 09:00 y 20:00 | El horario nunca es más amplio que 09:00–20:00, hora local de la sucursal | `HORARIO_DE_ENVIO` en `src/mensajeria/reglas.ts`; CHECK en la base (también en `automatizacion`) | nadie | **No se cambia** (invariante 14) |
| Responder a quien acaba de escribir | No tiene restricción de horario | `esIniciadoPorSistema` (`reglas.ts`) | nadie | **No se cambia** (invariante 14) |
| Zona horaria de cada sucursal | Decide la hora local del envío y del calendario de cobros | `sucursal.zona_horaria` | Escuela · al dar de alta una sucursal | **Ya en administración** (Sucursales). Sin zona no sale nada automático |
| Horario y días de cada automatización | Franja y días de la semana en que puede salir ese aviso | `automatizacion.hora_inicio_min`, `hora_fin_min`, `dias_permitidos` | Escuela · rara vez | **Ya en administración** (Automatizaciones → Ajustar) |
| Ventana de servicio de 24 h | Mensaje libre solo dentro de las 24 h desde el último mensaje del contacto; fuera, plantilla aprobada | `DURACION_VENTANA_SERVICIO_MS` (`reglas.ts`) | nadie | **No se cambia** (invariante 5; regla de WhatsApp) |
| Ventana gratis de 72 h | 72 h desde la entrada por anuncio; solo afecta el costo | `DURACION_VENTANA_GRATIS_MS` (`reglas.ts`) | nadie | **No se cambia** (invariante 5; regla de Meta) |

## 2. Topes de frecuencia

| Ítem | Qué es | Dónde vive | Quién · cuándo | Decisión |
|---|---|---|---|---|
| Mensajes automáticos por teléfono al día | Tope en ventana móvil de 24 h (3) | `configuracion_organizacion.max_automaticos_por_dia` (0–100) | Escuela · rara vez | **Ya en administración** (Configuración → «Frecuencia de mensajes») |
| Mensajes de marketing por ventana | Cuántos mensajes de marketing por teléfono (1) | `max_marketing_por_ventana` (0–100) | Escuela · rara vez | **Ya en administración** (Configuración) |
| Días de la ventana de marketing | Cada cuántos días (7) | `ventana_marketing_dias` (1–365) | Escuela · rara vez | **Ya en administración** (Configuración) |

## 3. Avisos automáticos (reenganche, recordatorios, cobranza)

| Ítem | Qué es | Dónde vive | Quién · cuándo | Decisión |
|---|---|---|---|---|
| Reenganche de 25 h | Cuánto silencio antes de escribirle a quien dejó de contestar (1500 min) | `automatizacion.offset_minutos` del evento `lead_sin_respuesta` (seed `demo.sql`) | Escuela · rara vez | **Ya en administración** (Automatizaciones). No es una constante del código |
| Recordatorios de la clase muestra (24 h y 2 h antes) | Cuándo sale cada recordatorio | `offset_minutos` negativo de `clase_muestra_proxima` (seed `clase-muestra.sql`) | Escuela · rara vez | **Ya en administración** (Automatizaciones) |
| Recuperación de quien no llegó, aviso de cambio de clase, lead frío, promoción por vencer, pago por vencer y pago atrasado | Desfase, número de intentos y espaciado entre intentos de cada aviso | `automatizacion.offset_minutos`, `max_intentos` (1–10), `espaciado_minutos` (≥ 60) | Escuela · rara vez | **Ya en administración** (Automatizaciones). El signo del desfase lo valida el servidor según el evento |
| Encender / apagar un aviso | Si se programan envíos nuevos | `automatizacion.activo` | Escuela | **Ya en administración** (Automatizaciones). Lo ya programado sigue su curso |
| Plantilla de cada aviso | Cuál se manda; su clase (servicio o marketing) la declara la plantilla (invariante 6) | `automatizacion.plantilla_id` | Escuela · rara vez | **Ya en administración** (Automatizaciones y Plantillas). La clase debe corresponder al evento (EK-A1) |
| Hasta cuántos días de atraso se persigue | Lead frío: no se avisa de quien se enfrió hace más de N días (14, máx. 90). Pago atrasado: no se manda recordatorio de lo vencido hace más de N días (60, máx. 365) | `automatizacion.condiciones.max_atraso_dias`; constantes `ATRASO_MAXIMO_POR_OMISION_DIAS` (14 en `seguimiento.ts`, 60 en `cobranza/plan.ts`) como respaldo | Escuela · rara vez | **V5 → administración** (Automatizaciones → Ajustar, solo en esos dos avisos; `PATCH /api/automatizaciones/:id {max_atraso_dias}`) |
| **Crear o borrar** una automatización | Cada evento tiene su motor; el alta es un paso técnico | `automatizacion` | CCB · al dar de alta una escuela | **Por comando (seed)**. Ver «Alta de una automatización» abajo. Pendiente EK-I02 de la auditoría K9 |
| Reclamo vencido de una ejecución | A los 10 min una ejecución reclamada sin resultado se da por abandonada y se recupera | `RECLAMO_VENCE_MS` (`motor.ts`) | nadie | **No se cambia** (robustez del motor) |
| Mensaje pendiente obsoleto | Un pendiente de más de 10 min no se manda (EA-09) | `PENDIENTE_VIGENCIA_MS` (`provider.ts`) | nadie | **No se cambia** (evita mandar algo fuera de contexto) |
| Envío incierto | A los 5 min un envío sin respuesta del proveedor se marca incierto y deja tarea (no se reenvía) | `ENVIO_INCIERTO_MS` (`provider.ts`), `AVISO_INCIERTO_MS` (`avisos-instructor.ts`) | nadie | **No se cambia** (nunca mandar dos veces) |
| Aviso al maestro frenado por tope | Reintento a la hora (1 h) y margen mínimo antes de la clase (2 h) | `REINTENTO_POR_TOPE_MS`, `MARGEN_MINIMO_MS` (`avisos-instructor.ts`) | nadie | **No se cambia** (nadie lo ha pedido; moverlo es un cambio de código con prueba) |
| Candidatos por corrida | Cuántos leads o cargos revisa cada barrido (200 y 500) | `POR_CORRIDA` (`motor.ts`), `CANDIDATOS_POR_CORRIDA` (`seguimiento.ts`, `cobranza/programar.ts`) | nadie | **No se cambia** (rendimiento; se procesa en el barrido siguiente) |
| Frecuencia de los barridos | El ciclo corre cada minuto; la retención y el vencimiento de cotizaciones, cada hora; las finanzas, cada 10 min | `intervaloMs: 60_000` (`server.ts`), `RETENCION_CADA_MS`, `FINANZAS_CADA_MS` (`ciclo.ts`) | nadie | **No se cambia**. La alarma `barrido-atrasado` vigila que corra |

**Alta de una automatización** (ejemplo; el patrón completo está en `prisma/seed/seguimiento.sql`):

```sql
INSERT INTO automatizacion (organizacion_id, nombre, evento_disparador, offset_minutos, plantilla_id, max_intentos, dias_permitidos)
VALUES ('<organizacion>', 'Reenganche', 'lead_sin_respuesta', 1500, '<plantilla>', 1, ARRAY[1,2,3,4,5,6]);
```

## 4. El asistente de WhatsApp (bot)

| Ítem | Qué es | Dónde vive | Quién · cuándo | Decisión |
|---|---|---|---|---|
| Textos de lo que dice el asistente | 31 mensajes (saludo, preguntas, reintentos, ofertas de otra sucursal, lista de espera, fechas de clase muestra, pase al asesor…) con huecos como `{nombre}` | Por omisión en `src/captacion/textos.ts` (genéricos, sin nombres de disciplina ni sucursal); lo que la escuela cambia en `texto_bot` (una fila viva por mensaje y organización). Lector: `leerTextosPersonalizados` | Escuela · rara vez | **V5 → administración** (Textos del asistente). Validación: solo los huecos de cada mensaje, los obligatorios (`{lista}` donde hay opciones), hasta 600 caracteres, sin enlaces. Restablecer = volver al de siempre |
| Cotización, cierres con piezas condicionales (con horario, con programa, clase muestra agendada) | Mensajes que arman precios, promociones y piezas opcionales (sucursal, lista de espera) | `maquina.ts` (`fijos`) | nadie | **No se cambia**: la cotización mueve dinero (determinismo, invariante 10) y los cierres tienen variantes; se decide con la escuela si algún día los quiere propios |
| Confirmación de baja | «Listo, ya no recibirás más mensajes…» | `maquina.ts` (`confirmacionBaja`) | nadie | **No se cambia**: su redacción es parte del consentimiento |
| Palabras de baja y de sí / no / asesor | `baja`, `stop`, `cancelar`, `no molestar`; listas de afirmativas y negativas | `PALABRAS_DE_BAJA`, `AFIRMATIVAS`, `NEGATIVAS`, `PIDEN_PERSONA` (`maquina.ts`) | nadie | **No se cambia** (opt-out y comprensión determinista) |
| Minutos antes de avisar de un lead a medias | Si alguien deja de contestar a mitad de las preguntas, a los 30 min el asesor ve su conversación con lo que alcanzó a decir | `configuracion_organizacion.lead_a_medias_minutos` (5–1440). Antes `TIEMPO_ESPERA_MS` | Escuela · rara vez | **V5 → administración** (Configuración → «El asistente de WhatsApp») |
| Respuestas que no entiende antes de pasar con una persona | 3 por omisión | `configuracion_organizacion.bot_max_intentos` (1–10). Antes `MAX_INTENTOS` | Escuela · rara vez | **V5 → administración** (Configuración) |
| Qué hace si la sucursal no tiene programa | Ofrecer la otra o avisar al asesor | `configuracion_organizacion.sucursal_sin_programa` | Escuela · rara vez | **Ya en administración** (Configuración) |
| Vigencia de la cotización | Días que vale una cotización (7) | `cotizacion_vigencia_dias` (1–365) | Escuela · rara vez | **Ya en administración** (Configuración) |
| Cuántas fechas de clase muestra propone | Hasta 5 | `FECHAS_PROPUESTAS` (`entrante.ts`) | nadie | **No se cambia** (el menú de WhatsApp tiene que caber en un mensaje legible) |
| Edad válida en el bot | 1 a 99 años | `extraerEdad` (`maquina.ts`) | nadie | **No se cambia** (validación de captura) |
| Reintentos internos | Reintentos de un webhook (8), de la toma (3), candidatos por mensaje de rastreo (10) | `MAX_REINTENTOS` (`entrante.ts`, `toma.ts`), `MAX_CANDIDATOS_POR_MENSAJE` (`rastreo.ts`) | nadie | **No se cambia** (robustez de la entrada) |
| Pasos que cuentan como «a medias» | Qué pasos esperan respuesta | `PASOS_A_MEDIAS` (`maquina.ts`) | nadie | **No se cambia** (es la máquina de estados) |

## 5. Textos de plantillas y de avisos

| Ítem | Qué es | Dónde vive | Quién · cuándo | Decisión |
|---|---|---|---|---|
| Plantillas de mensaje | Código, clase (servicio / marketing), categoría, estado de aprobación, variables y texto de referencia | `plantilla_mensaje` | Escuela y CCB · al aprobar cada plantilla en Twilio | **Ya en administración** (Plantillas de mensaje). Ojo: lo que se manda por WhatsApp fuera de la ventana es el texto **aprobado por Meta** en Twilio; el «texto de referencia» es para saber de qué trata |
| Texto libre del aviso al maestro (cuando no hay plantilla propia) | Respaldo para «nueva clase muestra», «reprogramada», «cancelada» | `textoDeAviso` (`avisos-instructor.ts`) | nadie | **No se cambia**: el camino normal es la plantilla, que sí se edita |
| Textos de las tareas del asesor | Descripción de cada tarea (`lead_frio`, `entrega_fallida`…) | Código (`src/mensajeria/tareas.ts`, `cobranza/tareas.ts`, `clases-muestra/aviso-cambio.ts`…) | nadie | **No se cambia**: son avisos internos del sistema, con instrucciones en `docs/OPERACION.md` |
| Texto de la landing pública | Título, preguntas y botón de la página de registro | `src/http/landing-html.ts` | Escuela (quizá) · rara vez | **No se cambia** hoy; nombre, color y logo de la disciplina sí viven en tablas (Disciplinas). Ver «Para Eduardo» |
| Reglamento, uso de imagen y aviso de privacidad | Texto legal versionado e inmutable; una versión nueva no pisa a la anterior | `documento_legal` | Escuela y su abogado · rara vez | **Por API**: `POST /api/documentos-legales {tipo, vertical_id?, titulo, texto, vigente_desde?}` (publica la versión siguiente); `GET /api/documentos-legales` lista el historial. Sin pantalla todavía |

## 6. Embudo, motivos y alertas

| Ítem | Qué es | Dónde vive | Quién · cuándo | Decisión |
|---|---|---|---|---|
| Nombre, orden y alta/baja de las etapas del embudo | Las siete de siempre y las que agregue la escuela | `etapa_pipeline` | Escuela · rara vez | **V5 → administración** (Etapas del embudo). Las de sistema se renombran pero no se quitan ni cambian de orden entre sí; las de cierre van al final; una etapa con leads no se quita |
| Días sin movimiento que avisan | Por etapa; alimenta «Estancados» y el aviso de lead frío | `etapa_pipeline.dias_alerta_sin_movimiento` (1–365; nulo = sin aviso) | Escuela · rara vez | **V5 → administración** (Etapas del embudo → Cambiar) |
| Papel de cada etapa para el sistema | `nuevo`, `contactado`, `muestra_agendada`, `muestra_asistida`, `negociacion`, `inscrito`, `perdido` | `etapa_pipeline.tipo_sistema` (a lo más una viva por papel) | nadie | **No se cambia**: el código busca por papel, nunca por nombre |
| Qué movimientos de etapa se permiten | Reglas por par de etapas: `permitida`, `solo_administrador`, `prohibida` (por omisión, todo permitido) | `transicion_etapa` | CCB · casi nunca | **Por comando (SQL)**, sin API. Ejemplo abajo |
| Motivos de pérdida de un lead | Catálogo que se elige al marcar «Perdido» | `motivo_perdida` (API `/api/motivos-perdida`) | Escuela · rara vez | **V5 → administración** (Motivos de pérdida y de baja). Antes solo API |
| Motivos de baja de una inscripción | Catálogo que se elige al dar de baja | `motivo_baja` (API `/api/motivos-baja`) | Escuela · rara vez | **V5 → administración** (Motivos de pérdida y de baja). Antes solo API |
| Umbral de faltas seguidas | Faltas con las que una inscripción genera su tarea (3) | `umbral_faltas_consecutivas` (1–30) | Escuela · rara vez | **Ya en administración** (Configuración → «Avisos al asesor») |
| Días de atraso que generan tarea de cobranza | 15 | `umbral_dias_deuda` (1–365) | Escuela · rara vez | **Ya en administración** (Configuración) |
| Ocupación «a reventar» y «vacío» del tablero | 90 % y 25 % | `configuracion_organizacion.ocupacion_a_reventar_pct` (1–100) y `ocupacion_vacio_pct` (0–99, siempre menor). Antes `UMBRAL_A_REVENTAR` / `UMBRAL_VACIO` | Escuela · rara vez | **V5 → administración** (Configuración → «Tablero ejecutivo»). Solo cambia la etiqueta del tablero; no mueve cupos |

Ejemplo de la matriz de transiciones (prohibir que alguien pase directo de «Nuevo» a «Negociación»):

```sql
INSERT INTO transicion_etapa (organizacion_id, desde_etapa_id, hacia_etapa_id, regla)
VALUES ('<organizacion>', '<id de la etapa Nuevo>', '<id de la etapa Negociación>', 'prohibida');
```

## 7. Clase muestra, lista de espera y cotizaciones

| Ítem | Qué es | Dónde vive | Quién · cuándo | Decisión |
|---|---|---|---|---|
| Anticipación mínima para agendar | Minutos antes de la clase (120) | `clase_muestra_anticipacion_min` (0–10080) | Escuela · rara vez | **Ya en administración** (Configuración → «Clase muestra») |
| Días hacia adelante | Horizonte de agenda (60) | `clase_muestra_horizonte_dias` (1–365) | Escuela · rara vez | **Ya en administración** |
| Horas para corregir asistió / no asistió | 48 | `clase_muestra_correccion_horas` (1–720) | Escuela · rara vez | **Ya en administración** |
| Horas para tomar un lugar de la lista de espera | 48 | `lista_espera_oferta_horas` (1–720) | Escuela · rara vez | **Ya en administración** (Configuración → «Cotizaciones y lista de espera») |
| Quién cierra la inscripción | El asesor por WhatsApp o el maestro en sitio | `modo_cierre` | Escuela · una vez | **Ya en administración** (Configuración) |

## 8. Catálogo (todo lo que describe a la escuela)

| Ítem | Dónde vive | Decisión |
|---|---|---|
| Disciplinas (nombre, etiquetas, color, logo, interruptores del bot) | `vertical` | **Ya en administración** (Disciplinas) |
| Sucursales, dirección, zona horaria y qué disciplinas imparte | `sucursal`, `sucursal_vertical` | **Ya en administración** (Sucursales) |
| Programas (edades, traslape, fecha de corte de edad) | `programa` | **Ya en administración** (Programas) |
| Grupos, cupo, lista de espera, salón, instructor y horarios | `grupo`, `grupo_horario` | **Ya en administración** (Grupos y horarios) |
| Instructores y salones | `instructor`, `salon` | **Ya en administración** (Instructores y salones) |
| Precios con vigencia (inscripción y mensualidad) | `precio` | **Ya en administración** (Precios) |
| Promociones, condiciones, beneficios y alcance | `promocion*` | **Ya en administración** (Promociones) |
| Canales de WhatsApp y bandejas de Chatwoot | `canal_whatsapp`, `bandeja_chatwoot` | **Ya en administración** (Canales de WhatsApp) |
| Módulos encendidos | `modulo_*` en `configuracion_organizacion` | **Ya en administración** (Módulos) |
| Usuarios, roles, sucursales y agente de Chatwoot | `usuario*` | **Ya en administración** (Usuarios y roles) |
| Campañas, códigos de rastreo, QR y gastos de campaña | `campana`, `codigo_rastreo`, `gasto_campana` | **Por API** (`docs/API.md`: `/api/campanas`, `/api/codigos-rastreo`, gastos). El QR se descarga con `GET /api/campanas/:id/qr` |
| Niveles de progresión de cada disciplina | `nivel_progresion` | **Por API**: `POST /api/niveles {vertical_id, nombre, orden, color_hex?, horas_minimas?, clases_minimas?, requisitos_texto?}`. Módulo «Operación» (apagado el primer día). Sin pantalla todavía |
| Eventos de la escuela (exámenes, festivales) | `evento` | **Por API** (`/api/eventos`). Módulo «Operación». Sin pantalla todavía |
| Productos (uniformes) con talla, precio y existencia | `producto` | **Por API** (`POST /api/productos`, `PATCH /api/productos/:id`, `POST /api/productos/:id/ajuste-stock`); recepción ve y vende lo que existe. Módulo «Finanzas». Sin pantalla de alta todavía |
| Día de corte de pago | `inscripcion.dia_corte_pago` (1–31, regla del fin de mes) | **Ya en el asistente de inscripción**: lo elige la familia al inscribirse. El rango 1–31 no se cambia |

## 9. Seguridad, sesiones y límites

| Ítem | Qué es | Dónde vive | Quién · cuándo | Decisión |
|---|---|---|---|---|
| Inactividad de la sesión | 120 min por omisión | `SESION_INACTIVIDAD_MIN` (entorno; 1 a 720) | CCB | **Por entorno**: `SESION_INACTIVIDAD_MIN=60`. Reiniciar |
| Duración absoluta de la sesión | 12 h | `DURACION_SESION_MS` (`auth/sesiones.ts`) | nadie | **No se cambia** (seguridad) |
| Bloqueo por intentos fallidos de acceso | 5 fallos en 15 min | `BLOQUEO_POR_DEFECTO` (`auth/acceso.ts`) | nadie | **No se cambia** (seguridad; si ocurre un bloqueo legítimo, `docs/SEGURIDAD.md`) |
| Límites por IP | Inicio de sesión (10/min), API (600/min), landing (30/min), webhooks con firma inválida (30/min), techo de webhooks (6000/min), memoria del limitador (50000) | Entorno: `LIMITE_LOGIN_POR_MINUTO`, `LIMITE_API_POR_MINUTO`, `LIMITE_LANDING_POR_MINUTO`, `LIMITE_WEBHOOK_FALLOS_POR_MINUTO`, `LIMITE_WEBHOOK_POR_MINUTO`, `LIMITE_MAX_CLAVES` | CCB · casi nunca | **Por entorno** (enteros positivos). Ejemplo: `LIMITE_LANDING_POR_MINUTO=60`. Reiniciar |
| Contraseñas | Mínimo 10 y máximo 128 caracteres; lista de contraseñas comunes | `LONGITUD_MINIMA_CONTRASENA`, `CONTRASENAS_COMUNES` (`auth/contrasena.ts`) | nadie | **No se cambia** (seguridad) |
| Parámetros del hash de contraseñas | scrypt N=32768 | `PARAMETROS_POR_DEFECTO` (`auth/contrasena.ts`) | nadie | **No se cambia** |
| Retención de sesiones e intentos de acceso | 30 días y 48 horas | `RETENCION_POR_DEFECTO` (`auth/retencion.ts`) | nadie | **No se cambia** (privacidad; se purga por baja lógica) |
| Tolerancia del reloj en el webhook de Chatwoot | 300 s | `TOLERANCIA_SEGUNDOS` (`mensajeria/chatwoot/webhook.ts`) | nadie | **No se cambia** (anti-repetición) |
| Reintentos del borde de Twilio | Reclamo de 60 s y 10 reintentos antes de alertar | `RECLAMO_TWILIO_VENCE_MS`, `MAX_INTENTOS_REENVIO` (`mensajeria/twilio/borde.ts`) | nadie | **No se cambia** |
| Tamaño máximo de los cuerpos de petición | 100 kb API, 16 kb landing, 1 mb Chatwoot… | `src/api/cuerpos.ts` | nadie | **No se cambia** |
| Paginación | 25 por defecto, 100 máximo | `src/api/paginacion.ts` | nadie | **No se cambia** |

## 10. Reglas del producto que no son ajustes

| Ítem | Dónde vive | Decisión |
|---|---|---|
| Hasta 10 niños por lead | `MAXIMO_DE_NINOS_POR_LEAD` (`captacion/prospectos.ts`) | **No se cambia**: protección contra errores de captura; el asesor ve un mensaje claro |
| Vigencia del código de rastreo de un lead de la landing (30 días) | `VIGENCIA_DEL_CODIGO_DE_LEAD_DIAS` (`captacion/codigos.ts`) | **No se cambia** (nadie lo ha pedido; una cifra distinta es un cambio de código) |
| Antigüedad máxima de un pago registrado (400 días) | `DIAS_MAXIMOS_DE_ANTIGUEDAD_DEL_PAGO` (`finanzas/pagos.ts`) | **No se cambia** (validación contable) |
| Ventana del porcentaje de asistencia (30 días) | `VENTANA_DE_PORCENTAJE_DIAS` (`asistencia/derivados.ts`) | **No se cambia** (definición de la métrica del expediente) |
| Estatus de asistencia, roles, condiciones de promoción | Enums del código (`ESTATUS_DE_ASISTENCIA`, `ROLES`, `CONDICIONES`) | **No se cambia**: son el vocabulario del producto |
| Dinero en centavos exactos, soft delete, idempotencia | Invariantes | **No se cambia** |
| Términos prohibidos en el código (check:generico) | `config/terminos-prohibidos.txt` | **Por comando**: se edita el archivo y `npm run check:generico` lo vigila. Solo lo toca CCB |

## 11. Entorno

Cambiar cualquiera exige **reiniciar el servicio**. En producción el backend se niega a arrancar si algo débil o de demostración queda en estas variables (`src/seguridad/entorno.ts`).

| Variable | Qué es | Quién |
|---|---|---|
| `DATABASE_URL` | Base de datos de la aplicación (cuenta sin dueño en producción) | CCB |
| `DATABASE_URL_PRUEBAS`, `DATABASE_URL_NAVEGADOR`, `DATABASE_URL_DEMO_GUIADA` | Bases de las pruebas y de la demo guiada (deben terminar en `_pruebas`, `_navegador_pruebas`…) | Desarrollo |
| `PORT` (`PUERTO` en las pruebas de navegador), `WEB_DIR` | Puerto y carpeta de la interfaz compilada | CCB |
| `NODE_ENV`, `ENTORNO_DEMO` | Modo de ejecución; `ENTORNO_DEMO=si` solo en la demo local | CCB |
| `ORIGEN_PUBLICO`, `PUBLIC_BASE_URL`, `COOKIE_SEGURA`, `TRUST_PROXY` | Origen permitido, URL pública que firma Twilio, cookie `Secure`, saltos de proxy | CCB |
| `SESION_INACTIVIDAD_MIN` | Minutos de inactividad que cierran la sesión (120) | CCB |
| `LIMITE_*` | Límites por IP (ver sección 9) | CCB |
| `CLAVE_DATOS_SENSIBLES`, `CLAVES_DATOS_SENSIBLES_ANTERIORES` | Clave de cifrado de las fichas de salud y las anteriores (rotación) | CCB |
| `CHATWOOT_URL`, `CHATWOOT_URL_PUBLICA`, `CHATWOOT_URL_HOST`, `CHATWOOT_CUENTA`, `CHATWOOT_BOT_TOKEN`, `CHATWOOT_ADMIN_TOKEN`, `CHATWOOT_ADMIN_EMAIL`, `CHATWOOT_ADMIN_PASSWORD`, `CHATWOOT_WEBHOOK_SECRETO` | Chatwoot (el secreto, 24 o más caracteres) | CCB |
| `TWILIO_AUTH_TOKEN`, `TWILIO_REENVIO_ENTRANTES_URL`, `TWILIO_REENVIO_ESTADOS_URL`, `TWILIO_NORMALIZAR_FROM_AL_REENVIAR` | Borde de Twilio (apagado mientras falten el token y `PUBLIC_BASE_URL`) | CCB |
| `METRICAS_TOKEN` | Para leer `/metricas` | CCB |
| `RESPALDO_CLAVE`, `ROL_APLICACION`, `CLAVE_ROL_APLICACION`, `CONTRASENA` | Respaldos cifrados, roles de base de datos y contraseña del primer administrador (`scripts/`) | CCB |
| `SALTAR_PRUEBAS_LENTAS` | Solo desarrollo | Desarrollo |

Ejemplo (local, `.env`): `SESION_INACTIVIDAD_MIN=60` y `LIMITE_LOGIN_POR_MINUTO=5`, luego `docker compose up -d --build backend`. En AWS: `infra/ecs.tf` (`local.entorno_backend`) y `terraform apply`.

---

## Lo que V5 pasó a administración (resumen)

1. **Configuración**: horario de los mensajes automáticos (inicio y fin, dentro de 09:00–20:00), minutos antes de avisar de un lead a medias, respuestas que el asistente no entiende antes de pasar con una persona, umbrales de ocupación del tablero. Todo el resto de la pantalla ahora explica cada ajuste (rango, valor de siempre, qué pasa si se cambia, aviso si su módulo está apagado).
2. **Textos del asistente**: 31 mensajes del bot, con vista previa y validación.
3. **Etapas del embudo**: nombre, orden, días de aviso, alta y baja de las propias.
4. **Motivos de pérdida y de baja**: pantalla (la API ya existía).
5. **Automatizaciones**: tope de días de atraso del lead frío y del pago atrasado.

## Para Eduardo (decisiones que tomé por la opción conservadora)

- **Los textos por omisión viven en el código, no en el seed.** En la tabla solo está lo que la escuela cambia. Alternativa descartada: sembrar los 31 textos en cada organización (si un default cambia en una versión, habría que migrar filas y una organización sin seed se quedaría sin bot).
- **Quedaron en el código la cotización, los cierres con piezas condicionales y la confirmación de baja.** La cotización arma dinero; la confirmación es parte del consentimiento. Si la escuela los quiere propios, se decide con ella.
- **El horario de la escuela y el de cada automatización se intersectan** (vale el más estrecho). Si no se tocan, manda el de la escuela.
- **Sin pantalla todavía, a propósito:** niveles de progresión, eventos, productos, documentos legales, campañas y códigos de rastreo. Todos están detrás de módulos apagados el primer día (excepto campañas) y tienen API. Si el recorrido por rol (V7) muestra que la escuela los cambia seguido, se les hace pantalla.
- **La matriz de transiciones de etapa y el alta de automatizaciones siguen por SQL** (EK-I02 de la auditoría K9): se dan de alta una vez por escuela.
- **Texto de la landing:** hoy está en el código. Si la escuela quiere palabras propias en la página de registro, hay que decidir cuáles (es de lo más visible para las familias).
