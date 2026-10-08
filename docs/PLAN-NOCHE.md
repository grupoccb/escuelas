# PLAN-NOCHE.md — Sesión nocturna sin supervisión

7 de octubre de 2026. Va en `docs/PLAN-NOCHE.md`.

Eduardo no va a estar. Nadie contesta preguntas hasta la mañana. El objetivo es que al despertar encuentre la Fase 1 construida y probada contra los fakes, con evidencia, en una rama que pueda revisar o descartar.

Después de cualquier compactación de contexto, lo primero es volver a leer este archivo y `docs/BITACORA-NOCHE.md`.

## Autorización, solo para esta sesión

`CLAUDE.md` dice que no se empieza una fase hasta que Eduardo marque los gates. Esta noche esa regla queda suspendida con estos límites:

- Puedes construir los bloques N0 a N11 sin esperar gates.
- **No marcas ningún gate** en `SPEC.md`. Dejas la evidencia y Eduardo los marca.
- Todos los invariantes de `CLAUDE.md` siguen vigentes, con las dos correcciones de N1.
- Fase 3 no se toca. De Fase 2 solo lo que dice N11.

## Decisiones ya tomadas por Eduardo

No las vuelvas a preguntar:

1. **Se sigue con Chatwoot** como bandeja de asesores.
2. **Lead y prospecto.** El lead es el adulto que escribe. Tiene uno o más `prospecto` (cada niño o alumno potencial), como en el modelo de `docs/insumos/`. El bot captura un prospecto; el asesor agrega los demás.
3. **Consentimiento con organización.** `consentimiento` lleva `organizacion_id`. Una baja aplica a toda la organización, es decir, a todas sus verticales, no solo a la que recibió el mensaje.
4. **Integridad entre organizaciones en la base.** Una fila no puede apuntar a una fila de otra organización. Se garantiza con llaves foráneas compuestas que incluyen `organizacion_id`, no solo en el código.
5. **Horario.** Contestar a quien acaba de escribir no tiene restricción de horario. El horario aplica a lo que el sistema inicia.
6. **Recordatorio que ya no alcanza.** Si recorrerlo al siguiente horario válido lo deja después del evento, se descarta y se registra. Nunca se manda tarde.

## Bloques, en orden

Cada bloque termina con `npm run validar` y `npm run test:int` en verde, un commit y una entrada en la bitácora.

**N0. Preparación.**
- Commit del trabajo de 0.5 que quedó sin commit, tal como está.
- Crea la rama `noche-fase1` y trabaja solo ahí.
- Crea `docs/BITACORA-NOCHE.md` con la tabla de estado vacía.

**N1. Correcciones a `CLAUDE.md`.** Solo estos dos invariantes, con este texto:

> 13. **La familia es la entidad central.** `tutor` y `alumno` se relacionan M:N. Un `lead` es el adulto que escribe y tiene uno o más `prospecto` (cada niño o alumno potencial) con sus datos estructurados, para que la conversión posterior no recapture nada. Ningún atajo tipo `alumno.telefono_mama`.

> 14. **Horario de envío.** Ningún mensaje iniciado por el sistema (recordatorio, reenganche, campaña) sale fuera de 09:00–20:00 hora local de la sucursal. Lo programado fuera de rango se recorre al siguiente horario válido; si con eso llegaría después del evento, se descarta y se registra. Responder a un mensaje entrante dentro de la ventana de servicio no tiene restricción de horario.

**N2. Prueba simulada de atribución y transporte (paso 0.3a del SPEC).**
- Crea en el Chatwoot local una bandeja de WhatsApp por Twilio con credenciales falsas.
- Mándale un webhook entrante con el formato de Twilio y parámetros `Referral*`, incluido `ReferralCtwaClid`.
- Registra el payload completo que Chatwoot entrega al Agent Bot y revisa en su base de datos dónde quedaron esos parámetros, si quedaron.
- P2: confirma con evidencia qué mensajes aparecen en la transcripción. Lo que requiera credenciales reales de Twilio queda como pendiente, no lo simules con suposiciones.
- P3: documenta qué eventos de estado de entrega emite Chatwoot.
- Escribe `docs/DECISION-ATRIBUCION.md` con la evidencia y una vía **propuesta** (A, B o C). La decisión es de Eduardo.
- Si la bandeja de Twilio no se puede levantar sin credenciales reales, documenta hasta dónde llegaste y sigue.

**N3. Esquema de Fase 1 (bloque 1.1).**
- Tablas: `organizacion`, `vertical`, `sucursal`, `sucursal_vertical`, `canal_whatsapp`, `campana`, `etapa_pipeline`, `lead`, `prospecto`, `conversacion`, `mensaje`, `interaccion`, `consentimiento`, `plantilla_mensaje`, `automatizacion`, `automatizacion_ejecucion` y la tabla de tareas para el asesor.
- Todas con `organizacion_id` y `eliminado_en`. Decisiones 3 y 4 aplicadas.
- Las dos ventanas del invariante 5 como campos separados.
- Índices únicos parciales como SQL en la migración.
- Migra lo que la demo de 0.5 ya creó. Seed de una vertical y sus dos sucursales, tomado de `docs/insumos/`.
- Test que demuestre que la base rechaza una referencia entre organizaciones.

**N4. Entrada (bloque 1.2).**
- Vertical por número receptor, lead y conversación, teléfono normalizado, idempotencia por identificador de mensaje del proveedor.
- La atribución entra por una interfaz con una implementación simulada. Elegir vía A, B o C después debe cambiar un adaptador y nada más.

**N5. Bot (bloque 1.3).** Validaciones, reintentos, tiempo de espera y palabras de baja (`BAJA`, `STOP`, `CANCELAR`, `NO MOLESTAR`) con confirmación única.

**N6. Handoff (bloque 1.4).** Conversación a "open", resumen para el asesor, `en_atencion_humana`. Fuera de ventana y sin plantilla apta: no se manda nada y se crea la tarea para el asesor.

**N7. Estados de entrega (bloque 1.5).** `delivered`, `read`, `failed` guardados por mensaje, con la fuente detrás de una interfaz según lo que salió en P3.

**N8. Reenganche (bloque 1.6).**
- Todas las reglas del invariante 4 dentro de `MessagingProvider`: ventana, plantilla, horario, opt-out, frecuencia y atención humana.
- Idempotencia de automatizaciones según el invariante 8.
- Solo contra el transporte falso. Ningún envío real.

**N9. Reporte mínimo (bloque 1.7).** Leads por campaña, sucursal y etapa, como consulta y como comando que Eduardo pueda correr.

**N10. Prueba de fuego.** Da de alta una segunda vertical solo con filas de seed, tomadas de `docs/insumos/`, y demuestra con un test que el loop completo funciona para ella sin cambiar código.

**N11. Solo si N0 a N10 quedaron HECHO: catálogo de Fase 2.**
- `programa`, `grupo`, `grupo_horario`, con el seed de la primera vertical y las tres consultas de verificación del insumo.
- Consulta determinista de cupo por grupo.
- Nada más de Fase 2: sin precios, sin promociones, sin cotizador, sin clase muestra, sin recordatorios.

## Reglas de la noche

**Cuando algo no sale**
- Si un bloque no queda en verde tras tres intentos serios, regresa al último commit, márcalo BLOQUEADO con el motivo y lo que probaste, y sigue con el siguiente bloque que no dependa de él.
- Nunca debilites un test, una guarda `check:*` o un invariante para que algo pase. No saltes tests.
- Si un bloque exige romper un invariante, es BLOQUEADO.

**Cuando falta una decisión**
- Toma la opción más conservadora que respete `CLAUDE.md`, anótala en la bitácora bajo "Decisiones que tomé" con la alternativa que descartaste, y sigue.
- No te detengas a preguntar.

**Lo que no se hace**
- Nada contra Twilio, Meta o AWS reales. Sin credenciales reales.
- `git push`, merge a la rama principal o reescribir historia.
- `docker compose down -v` sobre el proyecto principal. Para pruebas con volúmenes vacíos usa otro nombre de proyecto, como en 0.5.
- Modificar `docs/insumos/` o el repo de Agenda Lista.
- `npm audit fix --force`.
- Agregar un LLM al bot.
- Dependencias nuevas, salvo que sean indispensables; cada una se anota en la bitácora con su motivo.

## Bitácora

`docs/BITACORA-NOCHE.md` empieza con esta tabla y se actualiza al cerrar cada bloque:

| Bloque | Estado | Commit | Nota |
|---|---|---|---|
| N0 | HECHO / BLOQUEADO / PENDIENTE | hash | una línea |

Debajo, una sección por bloque con:
- qué se hizo,
- comandos de verificación y su salida,
- decisiones que tomaste y la alternativa descartada,
- lo que Eduardo tiene que revisar o decidir.

Al terminar, agrega arriba de todo un resumen de cinco líneas como máximo: qué quedó, qué no, y las tres cosas que Eduardo debe ver primero.
