# Revisión de insumos contra `CLAUDE.md`

Archivos revisados en `docs/insumos/` (no se modificaron):

| Archivo | Qué es |
|---|---|
| `schema-twilio-whatsapp.sql` | DDL de mensajería: canales, plantillas, consentimiento, conversaciones, mensajes, automatizaciones, cotización |
| `seed-sucursales-horarios.sql` | Catálogo: 3 verticales, 2 sucursales, 14 programas, 18 grupos, 31 horarios |
| `modelo-datos-escuela-multivertical.md` | Modelo completo, cotizador y transacción de conversión |
| `twilio-whatsapp-studio-escuela.md` | Arquitectura Twilio + Studio, catálogo de plantillas, reglas de operación |
| `studio-flow-captacion.json` | Flow de Studio con 30 estados (captación, cotizador, clase muestra, handoff) |

`docs/insumos/CONTEXTO-PROYECTO.md` es idéntico a `docs/CONTEXTO-PROYECTO.md`; ya se revisó en la sesión anterior.

**Prueba del seed.** Se corrió `seed-sucursales-horarios.sql` en una base temporal (tablas mínimas con sus columnas) y luego sus tres consultas de verificación. La base se borró después. Resultados:

- El seed carga sin errores: 3 verticales, 2 sucursales, 6 filas de `sucursal_vertical`, 14 programas, 18 grupos y 31 horarios.
- Capacidad: Águilas 184 y Centenario 116, igual que en el contexto.
- Choques de salón: 0. Grupos sin horario: 0.
- **Traslape de edades: 1, cuando debía dar 0.** Ver C9.

---

## 1. Lo que contradice a `CLAUDE.md`

### Los cuatro puntos pedidos

| # | Dónde | Qué dice el insumo | Invariante | Qué se hace |
|---|---|---|---|---|
| C1 | `schema` §4 `conversacion`; vista `v_conversacion_enviable`; `twilio-…md` §5 y §6 | **Ventana única.** Una columna `ventana_abierta_hasta` con `tipo_ventana IN ('servicio_24h','entrada_72h_ctwa')`. La vista decide si se puede enviar con `ventana_abierta_hasta > now()`. | 5 | Son dos columnas: `ventana_servicio_hasta` (24 h desde el último entrante; decide si se manda mensaje libre) y `ventana_gratis_hasta` (72 h desde la entrada por anuncio; solo afecta el costo). Con una sola columna, una conversación que entró por anuncio aceptaría mensaje libre hasta 72 h después aunque la ventana de servicio ya hubiera cerrado. |
| C2 | Todas las tablas del `schema` y del seed | **Sin soft delete.** Ninguna tabla tiene `eliminado_en`; usan un booleano `activo`. Hay `UNIQUE` totales: `canal_whatsapp(numero_whatsapp)`, `conversacion(canal_whatsapp_id, telefono)`, `mensaje(message_sid)`, `plantilla_mensaje(codigo, vertical_id, idioma)`. Ningún insumo trae `DELETE` explícito; el modelo (§11) sí pide `eliminado_en`, pero el DDL no lo implementa. | 3 | Toda tabla lleva `eliminado_en`. `activo` se conserva solo donde es un interruptor operativo (una sucursal que deja de ofrecerse), no como sustituto del borrado. Los `UNIQUE` totales sobre datos de negocio pasan a índices únicos parciales `WHERE eliminado_en IS NULL`; si no, un registro borrado bloquea que se vuelva a dar de alta. Los de idempotencia (`message_sid`, `automatizacion_ejecucion`) quedan totales a propósito: un mensaje procesado sigue procesado aunque se borre. |
| C3 | `schema` completo, seed completo, modelo §3–§8 | **Sin `organizacion_id`.** El modelo menciona `organizacion` en el mapa de módulos, pero ninguna tabla la referencia. Lo más delicado: `consentimiento` y `v_consentimiento_actual` se indexan solo por teléfono, así que un opt-out en una organización bloquearía (o desbloquearía) a la misma persona en otra. El seed hace `CROSS JOIN` de todas las sucursales con todas las verticales y busca por `nombre` sin filtrar organización. Las automatizaciones del seed se insertan sin organización. | 1 | Toda tabla lleva `organizacion_id` y se consulta a través del scope único. El consentimiento es por organización. El seed se reescribe con `organizacion_id` explícito y uniones acotadas a la organización. |
| C4 | `schema` §1 `canal_whatsapp.numero_whatsapp`; `twilio-…md` §5; modelo §11 | **Formato de teléfono.** `numero_whatsapp` se guarda como `'whatsapp:+5215512345678'`, con el prefijo de transporte y el `1`. El modelo pide un único parcial en `tutor(telefono)` "normalizado a **10 dígitos**". `conversacion.telefono` y `consentimiento.telefono` dicen "E.164" sin aclarar el `1`. | 7 | Todo teléfono se guarda en E.164 con `+52` colapsado, por `normalizarTelefono()`. El prefijo `whatsapp:` y, si Twilio lo exige, el `1` los pone el adaptador de Twilio al enviar; no se guardan. 10 dígitos no sirve porque pierde el país. |

### Otras contradicciones encontradas

| # | Dónde | Qué dice el insumo | Invariante | Qué se hace |
|---|---|---|---|---|
| C5 | `studio-flow-captacion.json` (completo); `twilio-…md` §1 y §3 | Studio recibe el webhook entrante y manda los mensajes con `Send Message` y `Send & Wait For Reply`. El backend solo responde HTTP. | 4 y 6 | Superado por la decisión de Chatwoot (contexto §4). Fuera del backend nadie manda mensajes: si Studio enviara, las reglas de ventana, horario y atención humana no se aplicarían. |
| C6 | Vista `v_conversacion_enviable` | Las reglas de envío (ventana, bot activo, consentimiento, salientes en 24 h) viven en una vista SQL. | 4 | Las reglas viven en `MessagingProvider`. La vista además cuenta salientes por conversación, mientras que el tope de frecuencia es por contacto. No se usa como fuente de reglas. |
| C7 | `schema` §6 `automatizacion.dias_permitidos DEFAULT '{1,2,3,4,5,6}'` | Excluye el domingo por defecto. | 14 (agrega una regla) | `CLAUDE.md` solo restringe la hora (09:00–20:00 local de la sucursal), no el día. Hay un grupo el domingo a las 10:00 en Águilas: su recordatorio de 2 h caería en domingo y se recorrería al lunes, después de la clase. Si el cliente quiere restringir días, debe ser configuración explícita y no un default. **Decisión de Eduardo.** |
| C8 | `twilio-…md` §6 "Fallback a SMS" | Si falla WhatsApp, reintentar por SMS con el mismo Messaging Service. | — | No está en `CLAUDE.md` ni en el SPEC. Tendría que pasar por las mismas reglas de `MessagingProvider` (horario, opt-out, frecuencia). Pendiente de decisión; no se construye. |
| C9 | Seed, programas de una vertical en Águilas (líneas 50–51) | Dos programas con el mismo rango, 15–99, en la misma vertical y sucursal. Es lo que hace fallar la verificación 1. | Modelo §3 ("un programa = un rango de edad"; "el cotizador devuelve exactamente uno") | En esa vertical el programa es un estilo, no un rango de edad. El cotizador de Fase 2 tiene que aceptar varios programas para una misma edad, o el modelo necesita otra dimensión (estilo). No bloquea Fase 0 ni Fase 1. **Decisión de Eduardo**, ligada al pendiente "rangos de edad de baile" del contexto §12. |
| C10 | Modelo §5 `lead` y `prospecto` | El lead es el adulto. Los niños van en `prospecto` (nombre, edad declarada), varios por lead. | 13 | El invariante 13 pide que el lead guarde nombre, edad y sucursal estructurados. Ambos son compatibles si el bot crea un `prospecto` por niño. La demo (0.5) captura uno solo y lo guarda en el lead; cuando entren varios hijos por lead hay que decidir si se crea `prospecto` en 1.1. **Decisión de Eduardo.** |

---

## 2. Lo que quedó superado

| Insumo | Qué | Lo reemplaza |
|---|---|---|
| `studio-flow-captacion.json` | Todo el flow como orquestador de captación | Chatwoot es dueño del webhook y el bot es una máquina de estados en el backend (contexto §4, invariante 10). Se conserva como referencia para Fase 2, como dice el contexto. |
| `twilio-…md` §1 | Arquitectura "Sender → Messaging Service → Studio Flow" y "Backend → Studio Executions" | Arquitectura del contexto §4. La vía de atribución se decide en 0.3. |
| `twilio-…md` §4 | Endpoints que Studio consume (`/api/whatsapp/inbound`, `/api/sucursales`, `/api/cotizador`…) | El backend recibe eventos del Agent Bot de Chatwoot; no expone una API para Studio. |
| `twilio-…md` §8 | Orden de implementación | `SPEC.md`. |
| `schema` | `canal_whatsapp.flow_captacion_sid`, `conversacion.studio_execution_sid`, `automatizacion.flow_sid` (en el md) | Sin Studio no aplican. |
| `schema` | `conversacion.asignado_a REFERENCES usuario(id)` (tabla `usuario` no definida) | La asignación a asesores vive en Chatwoot. |
| `schema` | `conversacion UNIQUE (canal_whatsapp_id, telefono)`: una conversación por contacto y canal para siempre | Chatwoot abre una conversación nueva por hilo. La relación entre conversación de Chatwoot y conversación del backend se fija en 0.3/1.1. La demo usa una por conversación de Chatwoot. |
| `schema` | Ventana única (C1) | Invariante 5. |
| Contexto §4 | "Chatwoot no soporta plantillas con Twilio" | Ya las soporta (`CLAUDE.md`, precedencia). |
| `twilio-…md` §0 | "A partir del 1 de octubre de 2026 los mensajes de servicio dejan de ser gratuitos" | No es una contradicción, pero si es correcto ya está vigente (hoy es 7 oct 2026), así que el costo de responder dentro de la ventana de servicio ya no es cero fuera de la entrada gratuita de 72 h. No lo verifiqué contra Meta. |

---

## 3. Lo que se aprovecha tal cual

| Insumo | Qué | Nota |
|---|---|---|
| Seed | **Los datos**: verticales, sucursales, programas, rangos, grupos, salones, cupos, horarios | El SQL no se usa tal cual (C2, C3), pero los valores sí. Cuadran con el contexto §7 y no hay choques de salón. Los cupos no están marcados `[SUPUESTO]`, aunque el contexto §12 dice que el cupo real por grupo está pendiente: hay que confirmar con la escuela si son reales. |
| Seed | Las tres consultas de verificación | Se pueden convertir en tests del seed. La primera tiene que contemplar C9. |
| Modelo | Jerarquía vertical → sucursal → programa → grupo → `grupo_horario`; `precio` versionado; `promocion` + `promocion_beneficio` + `promocion_aplicacion`; `tutor_alumno` M:N; `pago_aplicacion`; `inscripcion.lead_id` y precios congelados; transacción de conversión | Con `organizacion_id` y `eliminado_en` agregados. Es Fase 2/3. |
| Modelo §9 | Consulta del cotizador | Fase 2, con el scope por organización y considerando C9. |
| `schema` §6–§7 | `automatizacion` y `automatizacion_ejecucion` con `UNIQUE (automatizacion_id, entidad_tipo, entidad_id, ocurrencia)` | Es exactamente el invariante 8. Se agrega `organizacion_id`; `motivo_omision` (`fuera_ventana`, `opt_out`, `atencion_humana`, `tope_frecuencia`) encaja con las reglas de `MessagingProvider`. |
| `schema` §4 | Valores de `conversacion.estado`: `bot`, `en_atencion_humana`, `cerrada`, `opt_out` | La demo los usa. |
| `schema` §5 | Columnas de `mensaje`: dirección, estatus de entrega, `error_code`, fechas de entrega y lectura, `message_sid` único | Base para el bloque 1.5. |
| `schema` §2 | `plantilla_mensaje` con `estado_aprobacion` y el índice de "enviable" | Con `organizacion_id` y `eliminado_en`. |
| `twilio-…md` §2 | Catálogo de plantillas (códigos, categorías, variables) | Insumo para Fase 1 (reenganche) y Fase 2. |
| `twilio-…md` §6 | Reglas de oro: horario, opt-out, tope de frecuencia, atención humana | Coinciden con `CLAUDE.md`, salvo la ventana (C1). |
| `twilio-…md` §3 F8 | Handoff por palabras clave o tres respuestas no entendidas | La demo usa los tres intentos fallidos. Las palabras clave quedan para 1.3. |
| `twilio-…md` §7 | Métricas del canal | Insumo para 1.7. |
| Flow | Textos y orden de las tres preguntas | Se adaptó la pregunta del nombre: "¿cómo se llama tu hijo o hija?" deja fuera al adulto que pregunta por sí mismo, y hay programas 14+ y adultos. |
