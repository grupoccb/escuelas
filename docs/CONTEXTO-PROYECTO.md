# Sistema de captación y gestión — Escuela multi-disciplina

Documento de contexto para el equipo de desarrollo.
Última actualización: octubre 2026.

---

## 1. El negocio

Escuela con **tres verticales** (Karate, Ballet, Baile) y **dos sucursales** (Águilas, Centenario). Cada vertical tiene sus propias cuentas de redes sociales y su propia marca.

**Problema actual:** los leads llegan por Facebook e Instagram y se atienden a mano por WhatsApp. No hay registro de dónde vino cada lead, cuántos se perdieron ni por qué. Cuando se cierra una inscripción, los datos se recapturan desde cero.

**Objetivo:** un solo sistema que lleve al prospecto desde el anuncio hasta ser alumno inscrito, y que después administre su vida como alumno (niveles, asistencia, mensualidades).

---

## 2. Alcance por fases

| Fase | Contenido | Estado |
|---|---|---|
| **1** | Atención inmediata de leads por WhatsApp: bot captura nombre, edad y sucursal; handoff a asesor humano; atribución de campaña | **En definición — es lo que se construye primero** |
| **2** | Cotizador automático (horarios + precios + promos), agenda de clase muestra, recordatorios | Diseñado |
| **3** | Alta de alumno, CRM, niveles, asistencia, cobranza, tableros | Modelado |

La Fase 1 arranca solo con **karate**. Ballet y baile entran como configuración, sin tocar código. Si hay que programar algo para darlos de alta, la arquitectura falló.

---

## 3. Principios de diseño

Estos no son preferencias, son las reglas que sostienen el modelo:

1. **Configurable sobre hardcodeado.** Verticales, sucursales, programas, grupos, horarios, precios, promociones y etapas del pipeline son filas en tablas. El cliente abre una tercera sucursal sin llamarnos.
2. **La familia es la entidad central.** Un tutor con N alumnos en N verticales. Esto habilita descuento por hermanos, estado de cuenta único y detección de cross-sell. Es barato ahora e imposible de agregar después.
3. **Mensajería desde el backend.** Todo mensaje saliente se manda con el SDK de Twilio desde el backend, nunca desde una herramienta de flujos. Ahí viven las validaciones de ventana, opt-out, horario y frecuencia — en un solo lugar.
4. **Anuncios Click-to-WhatsApp, no de formulario.** La ventana de entrada de 72 horas que abre un anuncio CTWA es gratuita. Es la diferencia entre un embudo casi sin costo de mensajería y uno que sangra por mensaje.
5. **Cero recaptura.** Al cerrar el lead, tutor y alumno se crean arrastrando todo. Si el operador vuelve a teclear el nombre del niño, el sistema falló.
6. **Idempotencia en automatizaciones.** Un reintento del scheduler no puede mandar el mismo recordatorio dos veces.

---

## 4. Arquitectura de Fase 1

```
Anuncio CTWA (Facebook / Instagram)
        │
        ▼
     Twilio WhatsApp Business API
        │   (un sender por vertical, Messaging Service propio)
        ▼
     Chatwoot  ← dueño del webhook entrante
        │
        │ Agent Bot API
        ▼
     Backend propio
        │  · identifica vertical por el número receptor
        │  · crea lead + conversación
        │  · captura nombre, edad, sucursal
        │  · guarda atribución CTWA
        ▼
     Flip a "open" → asesor retoma con transcripción completa
```

### Por qué Chatwoot

Son 2-3 asesores. Twilio Flex es plataforma de contact center con precio por asiento: desproporcionado. Construir bandeja propia son 4-6 semanas en algo que no es el diferenciador del producto.

Chatwoot es open source, autohospedado gratis, tiene canal nativo de Twilio WhatsApp (incluido Messaging Service), asignación entre asesores, app móvil y Agent Bot API para conectar nuestro bot.

**Despliegue:** ECS o EC2 + RDS PostgreSQL en AWS.

**Limitación conocida:** Chatwoot no soporta plantillas de WhatsApp con Twilio. No afecta Fase 1 porque todo ocurre dentro de la ventana de 72h; los mensajes de reenganche salen del backend con el SDK de Twilio directamente.

### Twilio Studio queda fuera

Se evaluó y se descartó para Fase 1. Dos razones:

- **Conflicto de webhook.** Solo un sistema puede recibir los mensajes entrantes. Chatwoot advierte que cambiar la URL del webhook rompe una integración de Studio existente.
- **No se justifica.** El bot de Fase 1 son tres preguntas. Studio sirve para orquestar flujos visuales complejos; aquí sería andamiaje.

Existe un flow de Studio ya armado (`studio-flow-captacion.json`) por si en Fase 2 el cotizador conversacional amerita orquestación visual.

### Puntos de atención

- Validar `X-Twilio-Signature` en todos los webhooks.
- Status callback de Twilio guardando `delivered` / `read` / `failed`.
- **Normalización de teléfonos mexicanos.** WhatsApp usa `+521` en algunos contextos y `+52` en otros. Normalizar a E.164 quitando el `1` después del `52`, en **una sola función**, y agregarlo solo al enviar si Twilio lo requiere. Es el bug número uno de estas integraciones: crea conversaciones duplicadas de la misma persona. Probar con Telcel, AT&T y Movistar antes de lanzar.
- Estado `en_atencion_humana` debe bloquear **toda** automatización. Sin esto, el bot le contesta encima al asesor que está negociando.
- Verificación de perfil WABA en Meta por cada vertical: tres marcas, tres trámites. Iniciar con anticipación.

---

## 5. Flujo completo del negocio

### Captación
1. Los administradores publican en las redes de cada vertical. Dos rutas de entrada: **QR a landing con cuestionario** o **anuncio Click-to-WhatsApp con encuesta preliminar**.
2. Ambas desembocan en WhatsApp. El agente captura nombre del niño, edad y sucursal.
3. Con esos tres datos consulta cupo disponible y propone horarios (Fase 2: lo hace el bot; Fase 1: lo hace el asesor con la info ya capturada).

### Clase muestra
4. Al agendarse, **el maestro es notificado** con el alumno, el grupo y la hora.
5. El día de la clase, el maestro registra los datos completos del niño desde su celular.

### Conversión
6. Al cerrar, el lead se convierte en tutor + alumno(s) en una sola transacción, arrastrando datos, precio congelado y promoción aplicada.

### Operación continua
7. Progresión (cintas / niveles), asistencia, mensualidades, eventos.

---

## 6. Modelo de datos

### Jerarquía

```
Organización
 └ Vertical (Karate, Ballet, Baile)
    └ Sucursal
       └ Programa      ← define el RANGO DE EDAD
          └ Grupo      ← define el HORARIO
             └ grupo_horario (días y horas)
```

Esta separación es importante: **un programa es un rango de edad, un grupo es una opción de horario**. Un niño de 8 años en Águilas cae en el programa "Karate 6-13" y elige entre cuatro grupos.

### Tablas por módulo

**Configuración:** `organizacion`, `vertical`, `sucursal`, `sucursal_vertical`, `instructor`

**Oferta:** `programa`, `grupo`, `grupo_horario`, `precio` (versionado por fecha), `promocion`, `promocion_beneficio`, `promocion_aplicacion`

**CRM:** `campana`, `lead`, `prospecto`, `etapa_pipeline`, `interaccion`, `clase_muestra`, `motivo_perdida`, `cotizacion`

**Identidad:** `tutor`, `alumno`, `tutor_alumno`, `inscripcion`

**Operación:** `asistencia`, `nivel_progresion`, `alumno_progresion`, `evento`, `evento_alumno`

**Finanzas:** `cargo`, `pago`, `pago_aplicacion`, `producto`, `venta`

**Mensajería:** `canal_whatsapp`, `plantilla_mensaje`, `conversacion`, `mensaje`, `consentimiento`, `automatizacion`, `automatizacion_ejecucion`

### Decisiones clave del modelo

**`tutor_alumno` es M:N.** Un alumno puede tener mamá, papá y abuela registrados, con banderas de `es_responsable_pago`, `es_contacto_emergencia` y `puede_recoger`. Un tutor puede tener varios hijos en varias verticales.

**`pago_aplicacion` permite que un solo pago de la mamá cubra la mensualidad de dos hijos.** Un pago se reparte entre N cargos.

**`promocion_beneficio` está separada de `promocion`.** "Inscripción gratis + uniforme al pagar la primera mensualidad" son dos beneficios con distinto momento de disparo. Si se modela como un campo `descuento`, el segundo caso no cabe. El beneficio diferido queda en estado `pendiente` hasta que el pago se registra, y recepción ve la lista de uniformes por entregar.

**`nivel_progresion` es genérica.** Sirve igual para cinturones de karate y niveles de ballet. La vertical define la etiqueta (`etiqueta_progresion`: "Cinturón" / "Nivel") y el evento (`etiqueta_evento`: "Examen" / "Recital"). Nunca modelar `cinturon_id` en la tabla de alumnos.

**`inscripcion.lead_id` guarda el origen.** Una sola columna que permite calcular el costo por alumno inscrito por campaña. Es el argumento de venta del sistema completo.

**Precios congelados al inscribir.** `precio_inscripcion_aplicado` y `precio_mensualidad_aplicado` se copian a la inscripción. Si suben los precios, el alumno existente conserva el suyo.

### Índices que importan

- Único parcial en `tutor(telefono)` normalizado → deduplicación de familias.
- `lead(etapa_id, ultima_interaccion_en)` → tablero de leads estancados.
- `inscripcion(grupo_id) WHERE estatus='activa'` → cálculo de cupo.
- Único en `automatizacion_ejecucion(automatizacion_id, entidad_tipo, entidad_id, ocurrencia)` → idempotencia.
- Soft delete en todo (`eliminado_en`). Nunca `DELETE` físico.

---

## 7. Catálogo actual

**Rangos de edad (exclusivos, sin traslape):** 3-5, 6-13, 14+

14 programas, 18 grupos, 2 sucursales. Capacidad instalada aproximada: **300 lugares** (Águilas 184, Centenario 116). Ese número es el techo del embudo — define cuánto presupuesto de anuncios tiene sentido antes de que el cuello de botella deje de ser la demanda y pase a ser el cupo.

### Horarios

**Águilas**

| Vertical | Programa | Grupos |
|---|---|---|
| Karate | 3-5 | Lun-Mié 4:00 pm · Mar-Jue 4:00 pm |
| Karate | 6-13 | Lun-Mié 5:00 · Mar-Jue 5:00 · Sáb 10:00 am |
| Karate | 14+ | Mar-Jue 6:15 pm |
| Ballet | 3-5 | Lun-Mié 6:30 pm |
| Ballet | 6-13 | Sáb 12:00–1:30 pm |
| Ballet | 14+ y adultos | Sáb 1:30–3:00 pm |
| Baile | Salsa y cumbia | Mar-Jue 8:00 pm |
| Baile | Twerk | Dom 10:00–11:30 am |

**Centenario**

| Vertical | Programa | Grupos |
|---|---|---|
| Karate | 3-5 | Mar-Jue 4:00 pm |
| Karate | 6-13 | Mar-Jue 5:00 pm |
| Karate | 14+ | Mar-Jue 6:15 pm |
| Ballet | 3-5 | Lun-Mié 4:00 pm |
| Ballet | 6-13 | Lun-Mié 5:00 · Sáb 10:00–11:30 am |
| Baile | Salsa y cumbia | Lun-Mié 6:30 pm |

"Lun-Mié **o** Mar-Jue" son **dos grupos distintos**, no un grupo de cuatro días. El cupo se cuenta por grupo.

### Niveles de ballet

Se recomiendan seis peldaños en lugar de tres: **Pre-ballet → Básico I → Básico II → Intermedio I → Intermedio II → Avanzado**. La progresión es el principal motor de retención — cada cambio de nivel es un momento en que la familia renueva su compromiso. Con tres niveles una alumna puede pasar dos años sin un solo hito.

---

## 8. Campos del registro en clase muestra

Captura del maestro en sucursal, idealmente desde el celular.

**Alumno** — nombre completo · fecha de nacimiento (del acta, no la edad declarada por el papá) · sexo · escuela y turno al que asiste · talla de uniforme o vestuario

**Tutores** — nombre y parentesco de quien lo lleva · teléfono · correo · responsable de pago · segundo adulto autorizado para recogerlo

**Salud y seguridad** — contacto de emergencia distinto al tutor · alergias · condiciones médicas relevantes · medicamentos · autorización de atención médica de urgencia

**Antecedentes** — si ha practicado antes, dónde y qué nivel traía · **motivo por el que buscan la clase** (disciplina, condición física, socialización, competencia). Este último le dice al asesor cómo cerrar.

**Observación del maestro** — asistió o no · nivel observado · grupo recomendado (puede diferir del cotizado) · interés percibido · notas libres

**Legal** — aceptación del reglamento · **autorización de uso de imagen**. Esta cierra el círculo: las fotos de las clases son el material de los anuncios que generan los leads.

---

## 9. Expediente del alumno

Además de los campos de registro, lo que se genera con el tiempo:

**Trayectoria** — fecha de inicio · antigüedad · grupo actual · historial de cambios de grupo · nivel o cinta actual · fecha de obtención · próximo examen y elegibilidad (clases mínimas cumplidas)

**Económico** — mensualidad vigente · día de corte · promoción aplicada · beneficios pendientes de entrega · estado de cuenta · antigüedad de cartera vencida

**Operativo** — % de asistencia últimos 30 días · racha de faltas consecutivas · eventos en los que participó · productos comprados

**Comercial** — origen del lead (campaña y canal) · días que tardó en cerrar · hermanos inscritos y en qué verticales · motivo de baja si aplica

Dos campos derivados valen más que el resto: **faltas consecutivas** es el predictor más temprano de deserción, y **tutor con un solo hijo inscrito** es la lista de cross-sell más rentable de la escuela.

---

## 10. Tableros

**Clases muestra** — agendadas · asistidas · no-show · tasa de conversión. Todo segmentado por fuente (Facebook, Instagram, TikTok, QR en sucursal, referido), por vertical y por sucursal. Más el **costo por alumno inscrito de cada canal**: el número que le dice al cliente dónde poner su presupuesto.

**Ejecutivo** — alumnos activos por vertical y sucursal · altas y bajas del mes · churn · ingreso mensual recurrente · cartera vencida · **% de ocupación por grupo**.

El porcentaje de ocupación es el que casi nadie mide y el más accionable: señala qué grupo está a reventar (abrir otro) y cuál está vacío (promoverlo o cerrarlo).

---

## 11. Reglas de operación de mensajería

**Ventana.** Antes de cada envío saliente, consultar `ventana_abierta_hasta`. Dentro → mensaje libre. Fuera → plantilla aprobada obligatoria; si no hay plantilla apta, **no se manda nada** y se crea tarea para el asesor.

**Horario.** Nada fuera de 09:00–20:00 hora local de la sucursal. Un mensaje de cobranza a las 6 a.m. cuesta más en reputación de lo que recupera. Los programados fuera de rango se recorren al siguiente slot válido.

**Opt-out.** `BAJA`, `STOP`, `CANCELAR`, `NO MOLESTAR` → registrar opt-out, confirmar una vez, bloquear todo marketing.

**Frecuencia.** Máximo 1 mensaje de marketing por contacto cada 7 días y 3 automáticos al día en total. Configurable, con default conservador.

**Prioridad.** Si la conversación está `en_atencion_humana`, ninguna automatización dispara. Sin excepción.

---

## 12. Pendientes de la escuela

Bloquean el seed definitivo:

- Duraciones reales de las clases donde solo se dio hora de inicio (están marcadas `[SUPUESTO]` en el SQL)
- Cupo máximo real por grupo, según tamaño de cada salón
- Costos de inscripción y mensualidad por programa
- Direcciones de ambas sucursales
- Rangos de edad de las clases de baile (se asumió 15+)
- Cuántos salones tiene cada sucursal

## 13. Decisiones de producto pendientes

- **¿Quién cierra la inscripción y cobra?** ¿El maestro ahí mismo al terminar la clase muestra, o el asesor por WhatsApp después? De esto depende si el registro del maestro incluye captura de pago o solo marca el lead como "listo para cerrar".
- **Fallback entre sucursales.** Centenario no tiene ballet 14+ ni twerk. Cuando entre ese lead, ¿el sistema ofrece Águilas automáticamente? Convierte un "no hay" en una opción.
- **Centenario, grupo 6-13 de karate:** depende de un solo horario (Mar-Jue 5:00 pm). Si una familia no puede a esa hora, se cae el lead. Vale medirlo antes de decidir si abrir otro.

---

## 14. Archivos entregados

| Archivo | Contenido |
|---|---|
| `schema-twilio-whatsapp.sql` | DDL de la capa de mensajería (canales, conversaciones, mensajes, automatizaciones) |
| `seed-sucursales-horarios.sql` | Catálogo completo de sucursales, programas, grupos y horarios, con queries de verificación |
| `modelo-datos-escuela-multivertical.md` | Modelo de datos completo con diagrama ER y la consulta del cotizador |
| `twilio-whatsapp-studio-escuela.md` | Catálogo de plantillas, reglas de ventana y automatizaciones (nota: la parte de Studio quedó superada por la decisión de Chatwoot) |
| `studio-flow-captacion.json` | Flow de Studio importable — reservado para Fase 2 |

El seed trae tres queries de verificación al final: traslape de edades (debe devolver cero filas), resumen de capacidad, y detección de choques de salón. Correrlas después de cada cambio en el catálogo.
