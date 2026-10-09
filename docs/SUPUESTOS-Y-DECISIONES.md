# SUPUESTOS-Y-DECISIONES.md

Lista única de lo que Eduardo debe decidir y de lo que la escuela debe confirmar. Reúne lo disperso en `docs/BITACORA-NOCHE-2.md`, `docs/BITACORA-NOCHE.md`, `docs/auditorias/*.md`, `docs/DECISION-ATRIBUCION.md`, `docs/REVISION-INSUMOS.md` y los comentarios `[SUPUESTO]` de `prisma/seed/*.sql`. Corte: 9 de octubre de 2026, rama `noche-2` (J1 a J5 hechos, J6 sin cerrar, K2 de hoy ya aplicado).

## Cómo leerlo

- **Sección 2, decisiones de producto abiertas.** Cada fila es una pregunta que el sistema resolvió con un valor provisional. La columna "Decisión de Eduardo" está vacía: escribe la opción elegida (por ejemplo "a", "b" o un texto corto) y, si nada cambia, "se queda como está".
- **Sección 3, supuestos.** Cada fila es un valor, texto o regla que el equipo inventó para poder construir. La columna "Confirmación de la escuela" está vacía: la escuela responde "sí" o corrige el valor.
- **Sección 4, decisiones técnicas con alternativa descartada.** Solo informativa: lo que conviene saber, no requiere respuesta salvo que Eduardo quiera el otro camino.
- **Sección 5, nota final.** Lo resuelto hoy y lo pendiente de credenciales reales.
- **IDs.** `EA` a `EH` son hallazgos de las auditorías de cada etapa (`docs/auditorias/etapa-X.md`); `F1 §5.n` es el punto n de la sección 5 de la auditoría de la primera noche (`fase-1.md`); `EB §8.n` es el punto n de la sección 8 de la auditoría B. Los demás (D2, G4, H1, J5...) son el bloque de la bitácora donde quedó la pregunta.
- **Ya decididas por Eduardo y por eso no aparecen como abiertas:** las 15 decisiones de `docs/PLAN-NOCHE-2.md` (lead a medias a 30 minutos, baja que vuelve a escribir, entrega fallida, tope de frecuencia, los dos modos de cierre, sucursal sin el programa buscado, edad en varios programas, pagos manuales, usuarios con roles, salud de menores, aviso al maestro, cotizador por vertical) y EG-05 (el tope de marketing cuenta por la clase declarada de la plantilla).

## 2. Decisiones de producto abiertas

### 2.1 Mensajería, canal e invariante 6

| ID | Pregunta | Opciones y recomendación | Estado actual | Decisión de Eduardo |
|---|---|---|---|---|
| ATR | ¿Los mensajes de WhatsApp entran por la vía A (Chatwoot recibe de Twilio y reenvía los datos del anuncio) o por la vía C (el backend recibe de Twilio y reenvía a Chatwoot)? | `DECISION-ATRIBUCION.md` recomienda la A con firma validada en el borde e idempotencia por identificador de Twilio; la C es la salida si eso falla con Twilio real. Se decide al probar con Twilio real. | Funciona la A con simuladores; el borde de Twilio (A7) sirve a las dos; nada probado con Twilio real. | |
| EA-02 | ¿Cómo se protegen los estados de entrega (enviado, entregado, leído, fallido) que Chatwoot recibe directo de Twilio sin firma? | (a) vía C con callback propio; (b) proxy delante de Chatwoot que desvíe esas rutas al backend; (c) aceptarlo y cerrar esas rutas con la red. Sin recomendación firme; sube a gravedad ALTA en cuanto algo se exponga a internet. | Con la vía A esos estados llegan a Chatwoot sin firma. Solo los mensajes entrantes quedan protegidos; el resto descansa en la red. | |
| EB-10 y borde de Twilio | ¿Se deja por escrito que dos piezas quedan fuera de `MessagingProvider`: el directorio de agentes de Chatwoot y el reenviador de Twilio? | (a) ampliar el invariante 4 a "mensajes" y anotar las dos excepciones; (b) moverlas detrás de una interfaz de `MessagingProvider`. Sin recomendación firme; el implementador propone (a) para el reenviador. | Ninguna inicia mensajes; viven en `src/mensajeria/`; anotadas como excepción en la bitácora. `CLAUDE.md` no se tocó. | |
| EA-21 | ¿Una cuenta de Twilio por despliegue o una por organización? | Sin recomendación previa. Es requisito de la primera organización adicional. | Un solo `TWILIO_AUTH_TOKEN`; el registro de eventos de Twilio es global. | |
| EA-22 | ¿El sistema debe comprobar al arrancar que las bandejas de Chatwoot no tengan asignación automática (contaría como "una persona tomó la conversación")? | Sin recomendación previa; la bitácora propone verificar y avisar o apagarla, y probarlo con Twilio real. | Solo se apaga en las bandejas que crea el script de la demo; en producción hay que apagarla a mano. | |
| F1 §5.1 | ¿Qué cuenta como "un asesor atiende"? | Hoy: asignársela o escribir el primer mensaje o nota. Alternativas: que abrirla en pantalla ya pare al bot; que resolverla devuelva el bot. Se dejó lo conservador. | Abrirla no cuenta; resolverla en Chatwoot no devuelve el bot (queda en atención humana para siempre). | |
| F1-05 | ¿Qué pasa con la conversación de un lead que se borra? | Cerrarla, borrarla o conservarla. Sin recomendación previa. | El sistema ignora al lead borrado (responde 200 sin contestar); la conversación queda como está. | |
| F1 §5.3 | ¿Se agrega una palabra de alta para quien se dio de baja, y se amplían las palabras de baja (ALTO, PARAR, DETENER)? | Sin recomendación previa. | Solo BAJA, STOP, CANCELAR, NO MOLESTAR. Si escribe después, el bot calla y se crea una tarea para el asesor. Reactivar es manual en la tabla. | |
| F1 §5.5 | Si quien respondió al reenganche vuelve a callar, ¿recibe otro reenganche? | Con un intento máximo no recibe otro; la alternativa es una segunda ocurrencia contada desde su último mensaje. | Un solo reenganche (a las 25 h) por silencio. | |
| F1 §5.2 | ¿Se confirma que lo que queda a medias al caerse el sistema se entrega "a lo sumo una vez" y deja tarea? | Recomendación de la auditoría: sí (es la opción conservadora; la otra duplicaría mensajes). | Un envío incierto nunca se reenvía; deja tarea de revisión manual para el asesor. | |
| ED-11 y EG-12 | ¿Una automatización omitida porque hay una persona atendiendo debe dejar tarea? ¿El lead frío crea tarea aunque haya alguien atendiendo? | Sin recomendación previa. | Solo el lead frío conserva su tarea; las demás omisiones solo se registran. | |
| EG-13 | ¿La confirmación de baja ("BAJA", "STOP") debe salir aunque una persona atienda la conversación? | (a) tratarla como aviso de servicio (obligación de cumplimiento); (b) que la confirme la persona. Sin recomendación firme. | No sale con persona atendiendo; la baja sí se registra. | |
| ED-10 | Si dos automatizaciones de recordatorio aplican a la misma clase, ¿salen las dos? | Sin recomendación previa. | Salen las dos. | |
| D3-antelación | ¿Hay un mínimo de antelación para un recordatorio que se recorrió al horario de envío? | Una columna `antelacion_minima_min` en la automatización (propuesta del implementador). | Sale cualquiera que llegue antes de la clase, aunque falten 30 minutos. | |
| D3-familia | ¿Se avisa a la familia por WhatsApp cuando una persona reprograma o cancela su clase muestra? | Sin recomendación previa. | No sale nada; solo se avisa al maestro. | |
| D4-bot | ¿El bot reagenda solo a quien responde al mensaje de recuperación? | Sin recomendación previa. | Responde un asesor y reagenda a mano. | |
| D2-tope | ¿Los avisos al maestro tienen un tope propio de frecuencia? | Una columna más de configuración si se quiere. | Usan el tope general de 3 al día; el exceso solo queda en la lista de la aplicación. | |
| D2-teléfono | ¿Un maestro sin teléfono debe impedir que se agende la clase? | Sin recomendación previa. | No impide; solo queda en la lista y una tarea para el asesor. | |
| D8-baja | ¿La baja del contacto debe quitar también la tarea de lead frío para el asesor? | Una línea de código si se quiere. | La tarea se conserva (el asesor puede llamar a otro teléfono). | |
| G2-aviso | ¿Se avisa por WhatsApp a la familia cuando el alumno acumula faltas seguidas? | Sin recomendación previa; sería aviso de servicio o de marketing según su texto. | Solo hay tarea para el asesor. | |
| WH-ver | ¿Quién ve los eventos inesperados que no se pueden ligar a un lead? | Si debe verlos un asesor, hay que decidir por qué sucursal (la bandeja es candidata). | Solo el administrador, por `GET /api/tareas?tipo=evento_inesperado`. | |
| A5-tareas | ¿Se agrupan por conversación las tareas de entrega fallida y de revisión manual? | Sin recomendación previa; se decide al ver la bandeja real. | Son tareas distintas, una por mensaje o por causa. | |

### 2.2 Embudo y captación

| ID | Pregunta | Opciones y recomendación | Estado actual | Decisión de Eduardo |
|---|---|---|---|---|
| EE-06 | ¿El consentimiento se registra al enviar el formulario de la landing o cuando el número escribe por WhatsApp? | Sin recomendación firme; el formulario no prueba que quien lo llena sea dueño del teléfono. | El formulario guarda el aviso de privacidad como evidencia pero nunca levanta una baja ni cuenta como alta; nadie lee ese consentimiento todavía. | |
| EE-07 | Un lead perdido o inscrito que vuelve a llenar la landing, ¿se reactiva, crea tarea o se ignora? | Sin recomendación previa. | No cambia de etapa, no cuenta como movimiento y no crea tarea. | |
| EE-08 | ¿Hasta dónde se bloquea la inundación de formularios falsos (token firmado, tope por organización, CAPTCHA)? | Sin recomendación previa. | Límite por IP, campo trampa y rechazo de envíos de otro sitio (403). | |
| EE-13 | ¿La landing acepta solo teléfonos mexicanos? | Sin recomendación previa. | Acepta cualquier país y crea el lead. | |
| EE-01 | ¿El envío de la landing redirige directo a WhatsApp o pasa por una página con botón "Abrir WhatsApp"? | La auditoría consideraba más robusta la página intermedia (sirve mejor en navegadores dentro de apps). | Redirección directa (303); probada solo en Chrome, falta Safari, Firefox y celulares reales. | |
| E1-datos | ¿La landing debe pedir correo o nombre del tutor como obligatorios? | Sin recomendación previa. | El nombre de contacto es opcional; no se pide correo. | |
| E2-familia | Si la familia llena la landing y luego escribe desde otro teléfono, ¿se unen en una sola familia? | Sin recomendación previa; unirlas se resolvería en la conversión. | Quedan dos leads ligados, no fusionados. | |
| E2-código | ¿Un código de campaña debe tener vigencia o tope de usos por omisión? | Sin recomendación previa. | Sin vigencia ni tope; sigue a la campaña (si se apaga o vence, el código deja de servir). | |
| D7-recuperar | ¿Quién puede recuperar un lead perdido y qué transiciones de etapa se endurecen? ¿Hace falta pantalla para editar la matriz? | Sin recomendación previa. | Recuperan asesor y administrador, con nota obligatoria. La matriz de transiciones se edita solo en la base. | |
| N3 | ¿La sucursal de interés es del lead (el adulto) o de cada niño? | Se dejó en el lead; pasarla al niño es un cambio chico. | Una sola sucursal de interés por lead. | |
| C5-corte | ¿El bot debe pedir la fecha de nacimiento para medir la edad al corte de ciclo? ¿Cuándo empieza cada ciclo? | Sin recomendación previa. | Solo captura la edad que dice el contacto; ningún programa tiene fecha de corte. | |
| EC-22 | Si el bot ofrece un solo horario, ¿un "sí" cuenta como elegirlo? | Sin recomendación previa. | No se entiende; reintenta y a la tercera pasa al asesor. | |
| D1-muestra | ¿Se permite una clase muestra por grupo o una por sesión? ¿El lead que agenda en otra sucursal cambia de sucursal? | Sin recomendación previa. | Una vigente por alumno y grupo; el lead sí cambia a la sucursal de la clase. | |
| C9-oferta | Si la familia no toma a tiempo el lugar que se le ofreció de la lista de espera, ¿pasa al final, se cancela o se avisa antes? | Sin recomendación previa. | Nadie barre la oferta vencida; el asesor la ve en su tarea y decide. | |
| C-cot | Mientras precios, cupos y promociones sean de ejemplo, ¿el cliente puede recibir la cotización del bot sin que un asesor la revise? | Recomendación implícita de la bitácora: confirmar precios, cupos y promociones antes de encender una vertical con clientes reales. | La cotización sale sin revisión; el cotizador está encendido en la organización de demo. | |

### 2.3 Catálogo y precios

| ID | Pregunta | Opciones y recomendación | Estado actual | Decisión de Eduardo |
|---|---|---|---|---|
| EC-10 | ¿El maestro puede ver precios, promociones e instructores? | Propuesta de la auditoría: un permiso `precios:leer` que no incluya al maestro. | Sí los ve (comparte `catalogo:leer`). | |
| EC-13 | La verificación de capacidad por sucursal, ¿cuenta los grupos inactivos? | Sin recomendación previa. | Los cuenta (el resto de las verificaciones ya los ignora). | |
| EC-18 | ¿Se necesitan clases que cruzan la medianoche (por ejemplo 23:00 a 01:00)? | Sin recomendación previa. | No se pueden expresar (la hora de fin debe ser mayor que la de inicio). | |
| EC-19 | ¿La capacidad del salón debe limitar el cupo del grupo? | Sin recomendación previa. | No se contrastan. | |
| EC-20 | ¿Se puede corregir el costo de un precio ya usado, o solo cerrarlo y abrir otro? ¿Y borrar el precio vigente? | Sin recomendación previa. | Se puede corregir y borrar; sin precio vigente el cotizador dice "sin precio". | |
| EC-21 | ¿Una promoción sin alcance debe avisar o pedir confirmación antes de volverse universal? | Sin recomendación previa. | Sin filas de alcance vale para todos; quitar el último programa la vuelve universal sin aviso. | |
| C3-acum | ¿Una promoción no acumulable debe excluir también a las acumulables? | Si el negocio lo quiere, se marcan todas como no acumulables. | No: la ganadora no acumulable convive con las acumulables. | |
| EC-05 | ¿Quién fusiona los salones migrados con nombres casi iguales? | La verificación `salonesConNombreParecido` los lista; decide el administrador. | Nuevos nombres parecidos ya se rechazan; los viejos no se fusionan solos. | |
| CTX-13 | Centenario, karate 6 a 13 años, depende de un solo horario (martes y jueves 5:00 pm): ¿se abre otro? | Contexto §13: medirlo antes de decidir. | Un solo grupo. | |

### 2.4 Inscripción, cupo y vida del alumno

| ID | Pregunta | Opciones y recomendación | Estado actual | Decisión de Eduardo |
|---|---|---|---|---|
| EF-06 | ¿Una inscripción debe respetar las clases muestra ya agendadas del grupo (quitándole el lugar a quien paga) o se acepta un niño de más ese día? | Sin recomendación previa. | Gana la inscripción; la sesión de la clase muestra puede quedar sobrevendida. | |
| EF-07 | Al dar de alta un alumno con el teléfono de un tutor de otra sucursal, ¿se oculta su nombre y correo hasta que lo confirme un administrador? | Sin recomendación previa; la auditoría demostró que hoy se filtran esos datos. | Se liga a ese tutor y se devuelve su nombre, apellidos y correo. | |
| EF-12 | ¿"Listo para cerrar" y el seguimiento deben seguir para el segundo hijo de un lead que ya está "inscrito"? | Sin recomendación previa. | No: responde 409 y el seguimiento del lead se detiene. | |
| EF-13 | ¿Los meses pagados por adelantado pueden declararse sin pago? | Sin recomendación previa; H2 y H4 debían verificarlo contra el pago. | Quien inscribe declara hasta 24 meses; se generan los cargos, pero la promoción de pago anticipado se aplica sin evidencia de pago. | |
| F3-mostrador | ¿Cómo se registra el reglamento de una familia que llega a mostrador sin pasar por un lead ni por clase muestra? | Sin recomendación previa (J4 pregunta lo mismo para el asistente de inscripción). | Un alumno sin lead no puede inscribirse: la evidencia legal cuelga del prospecto. | |
| F3-fecha | ¿Se permiten inscripciones con fecha de inicio pasada (alumnos que ya venían)? | Sin recomendación previa; haría falta una carga de alumnos existentes. | Se rechazan. | |
| F5-baja | ¿Qué pasa con los beneficios diferidos y con el cupo de la promoción de quien se da de baja antes de pagar? | Sin recomendación previa. | No se devuelve el cupo de la promoción ni se cancelan los beneficios; las bajas se ignoran en la lista de entregas. | |
| F6-modo | ¿Qué modo de cierre usará la escuela: el asesor por WhatsApp o el maestro en sitio? | Ya se construyeron los dos; el modo en sitio inscribe pero no cobra. | `asesor_whatsapp` por omisión; cambiarlo es por SQL (no hay pantalla, J8). | |
| F7-tutor | ¿La bienvenida de inscripción debe salir también al segundo tutor o abuela? | Sin recomendación previa. | Solo al responsable de pago. | |
| F1-pago | ¿Un alumno puede tener dos responsables de pago? | Sin recomendación previa; el estado de cuenta se arma sobre uno. | A lo más uno. | |
| F1-nombre | ¿Se acepta que la bandera de contacto de urgencia se llame `es_contacto_urgencia` y no "contacto de emergencia"? | El nombre original lo prohíbe la guarda de datos de salud; no se debilitó la guarda. | Se llama `es_contacto_urgencia`. | |
| F2-horario | Si el horario que cotizó la familia y el que recomendó el maestro difieren, ¿quién manda? | Sin recomendación previa. | Gana el cotizado; el asesor puede mandar otro grupo explícito. | |
| F-apagar | ¿Apagar una automatización debe cancelar las ejecuciones que ya estaban programadas? | Sin recomendación previa (comportamiento heredado). | No las cancela. | |
| D6-imagen | ¿La autorización de uso de imagen es obligatoria para cerrar el registro del maestro, o puede quedar rechazada? | Sin recomendación previa. | Solo el reglamento es obligatorio. | |
| D6-firma | ¿La evidencia de aceptación necesita firma manuscrita o foto? | Sin recomendación previa; requeriría almacenar archivos. | Solo un texto corto de evidencia, canal y quién la capturó. | |
| D5-salud | ¿Quién captura la ficha de salud cuando el maestro no está? | Sin recomendación previa. | Solo el maestro del grupo o el administrador; el registro de un asesor no llega a "completo" sin ella. | |
| ED-09 | ¿Cuánto tiempo conserva el maestro acceso a la ficha de salud de un prospecto después de su clase? | Sin recomendación previa. | Mientras la clase esté agendada, asistida o no asistida en su grupo; se corta si se cancela o reagenda. | |
| EG-15 | ¿Hasta cuántos días atrás se puede pasar o corregir lista? | Sin recomendación previa. | Cualquier fecha pasada con sesión; para fechas viejas la lista usa el grupo actual del alumno. | |
| EG-09 | ¿El maestro puede marcar a un participante de un evento como pagado y quitarlo del evento? | El comentario del permiso dice que recepción cobra la cuota. Sin recomendación firme. | Sí puede. | |
| G3-peldaño | ¿Se puede dar un peldaño (cinturón o nivel) saltándose uno? | Sin recomendación previa. | Sí, con permiso de maestro o administrador. | |
| G4-cuota | ¿La cuota de un evento es una por evento o por alumno (becas, descuento por hermano)? ¿Se puede convocar a quien no cumple las clases mínimas con una excepción del administrador? | Sin recomendación previa. | Una cuota por evento; sin excepciones. | |
| G5-congelada | ¿El expediente debe mostrar al asesor los beneficios pendientes de una inscripción congelada? | Sin recomendación previa. | Sí; solo se excluyen las bajas. | |
| J2 | ¿El registro del maestro (largo, en secciones plegables) debe ser un asistente de un paso por pantalla? | Es un cambio de presentación, no de datos. Se decide viendo `docs/capturas/10` a `15` en un celular real. | Una página con secciones plegables. | |

### 2.5 Finanzas y cobranza

| ID | Pregunta | Opciones y recomendación | Estado actual | Decisión de Eduardo |
|---|---|---|---|---|
| EH-11 | ¿Qué pasa con las inscripciones anteriores al módulo de cobros? | (a) nada especial; (b) una fecha de arranque de la cobranza por organización; (c) mes en curso con vencimiento desde el día del primer barrido. Sin recomendación previa. | (a): no reciben cargo de inscripción ni meses pasados; el primer barrido genera el mes en curso, normalmente ya vencido, y la cobranza empieza a escribirles al día siguiente. | |
| EH-20 | Inscribirse el último día del mes, ¿prorrateo o mes gratis hasta el siguiente? | Sin recomendación previa. | Cobra el mes completo y al día siguiente el siguiente mes completo. | |
| EH-14 | ¿El estado de cuenta de una familia debe limitarse a las sucursales de quien lo consulta? | La auditoría lo ve probablemente deseado (la familia debe un total). | Muestra los cargos de todas las sucursales de la familia. | |
| EH-15 | ¿Recepción, que cobra, debe ver la tarea de deuda vencida? | Sin recomendación previa. | Solo la ven administrador y asesor. | |
| H1-congelar | Al reactivar una inscripción congelada a mitad de mes, ¿se cobra el mes completo? ¿Congelar cancela el cargo del mes en curso? | Sin recomendación previa. | Congelar no cancela cargos ya generados; reactivar genera el mes completo, sin prorrateo. | |
| H2-excedente | ¿Un pago mayor a lo adeudado se rechaza o se guarda como saldo a favor? | Se rechazó para no crear crédito, devoluciones ni otra tabla; la escuela da el cambio en mostrador. | 409 `excedente_sin_cargo`. | |
| H4-diferido | ¿Un descuento diferido (no producto) debe aplicarse a las mensualidades siguientes? | Sin recomendación previa. | Solo se marca entregado; los cargos llevan el descuento inmediato congelado. | |
| H5-stock | ¿El inventario es por sucursal? | Sin recomendación previa; el modelo no trae sucursal en el producto. | Stock global por producto. | |
| H2-cancelar | ¿Hasta cuándo se puede cancelar un pago viejo y quién puede? | Sin recomendación previa. | Sin límite de fecha; administrador y recepción. | |
| H1-resp | Si cambia el responsable de pago, ¿se pasan sus cargos abiertos al nuevo? | Reasignar rompería el estado de cuenta anterior. | Los cargos abiertos siguen a nombre del anterior. | |
| J5 | En la pantalla de pago, ¿el reparto a mano entre hijos debe partir en blanco en lugar de la propuesta del sistema? | Sin recomendación previa. | Parte de la propuesta (primero lo que venció antes). | |

### 2.6 Reportes

| ID | Pregunta | Opciones y recomendación | Estado actual | Decisión de Eduardo |
|---|---|---|---|---|
| EH-17 | En el reporte de clases muestra, ¿la conversión solo cuenta inscripciones de la misma vertical y posteriores a la clase? | Sin recomendación previa; hoy el desglose por vertical puede engañar. | Cuenta cualquier inscripción del prospecto, de cualquier vertical y fecha. | |
| I3-asesor | ¿El asesor debe ver importes en el reporte ejecutivo (ingreso recurrente y cartera vencida de sus sucursales)? | Se decidió que sí porque ya lee cargos; alternativa: ejecutivo solo para el administrador. | Los ve, solo de sus sucursales; el maestro solo ve ocupación. | |
| I2-gasto | ¿Hace falta distinguir el tipo de gasto de una campaña (anuncio, impresión, comisión)? ¿Una campaña sin gasto debe mostrar "—" y no 0.00? | Sin recomendación previa. | Una cifra por captura con nota libre; sin gasto muestra 0.00. | |
| I5-csv | En los CSV, ¿se acepta el apóstrofo delante de los teléfonos (`'+5255...`)? | Sin apóstrofo se abre la puerta a fórmulas maliciosas en Excel. | Todo texto que empiece con +, -, = o @ lleva apóstrofo. | |

### 2.7 Seguridad y privacidad

| ID | Pregunta | Opciones y recomendación | Estado actual | Decisión de Eduardo |
|---|---|---|---|---|
| EB-02 | ¿Se pide la contraseña actual (o 2FA) para crear administradores y cambiar roles? ¿Se retoma el 2FA al menos para administrador y maestro, que ven la salud de menores? | Sin recomendación previa. | Para cambiar la propia contraseña sí se pide la actual; para crear administradores y cambiar roles no. Sin 2FA. | |
| EB-03 | ¿Se agrega un tope de intentos por cuenta, independiente de la IP? | La bitácora no lo hizo porque bloquearía a la víctima legítima. | Bloqueo por correo más IP (5 intentos en 15 minutos). | |
| EB-19 y EG-20 | ¿Cuánto se conservan el registro de accesos a salud, el registro de cambios y las constancias de eventos inesperados? | Sin recomendación previa; el registro de cambios no guarda nombres ni valores para poder conservarse. | Solo de anexar y sin purga; las sesiones caducan a los 30 días y los intentos a las 48 horas. | |
| EB §8.4 | ¿Se ratifica que las tablas de solo anexar (registro de cambios, accesos a salud, aceptaciones legales, historiales) sean la excepción declarada a "soft delete en todo"? | Sin recomendación previa. | De hecho lo son: no admiten ni baja lógica; la base lo impide. | |
| EB §8.5 | ¿Qué pasa al dar de baja una organización? | Sin recomendación previa. | Sus sesiones mueren; el resto no se define. | |
| EB §8.6 | ¿El inicio de sesión sigue sin pedir el identificador de la organización? | (a) quitar ya el atajo y exigir el identificador; (b) mantenerlo mientras haya una sola organización. Sin recomendación previa. | Se puede omitir mientras haya una sola organización viva. | |
| EB-20 | ¿Se agrega lista de contraseñas comunes y cambio obligatorio en el primer ingreso? ¿El seed de demo corre alguna vez fuera de la máquina local? | Sin recomendación previa. | Contraseñas de demo públicas (`Demo-local-2026!`); política de 10 caracteres mínimo. | |
| EB §8.10 | ¿Se ratifican las excepciones de `sistema.ts` al aislamiento por organización (identificador de la organización, organización única, sesión por huella, número de la escuela, vertical pública y eventos inesperados sin organización)? | Sin recomendación previa. | Documentadas en el encabezado del archivo. | |
| EG-14 | ¿El maestro debe ver en el expediente solo lo de sus grupos? | Sin recomendación previa. | Ve todas las inscripciones, eventos y asistencia del alumno, y los nombres de sus hermanos. | |

### 2.8 Operación e infraestructura

| ID | Pregunta | Opciones y recomendación | Estado actual | Decisión de Eduardo |
|---|---|---|---|---|
| EB §8.9 | ¿El límite de peticiones se lleva a Redis o a la base, o se deja al balanceador o WAF, cuando haya más de una réplica? | Sin recomendación previa; el bloqueo del inicio de sesión ya está en la base. | Vive en memoria del proceso. | |
| EB-08 y EF-15 | ¿Se separan la cuenta de base de datos de migraciones y la de la aplicación antes de producción? | Recomendación documentada en `docs/API.md`: sí, dos cuentas (K6 debe crearlas). | La demo usa una sola cuenta que es superusuaria (podría apagar los disparadores de protección). | |
| I4-demo | ¿Se corre `npm run demo:datos -- --confirmar-base-de-demo` contra la base de la demo? | Llena tareas y reportes con ~300 alumnos y seis meses; genera cientos de tareas de cobranza. | Solo se corrió contra una copia. | |
| A8 | ¿Se aprueban los gates en borrador de las Fases 2 y 3 de `SPEC.md` y el gate nuevo de atribución de la Fase 1? | Los gates los marca Eduardo; los de las Fases 2 y 3 son un borrador del implementador. | Ninguna casilla está marcada. | |

### 2.9 Decisiones nuevas de la etapa K (endurecimiento y entrega)

| ID | Pregunta | Opciones y recomendación | Estado actual | Decisión de Eduardo |
|---|---|---|---|---|
| K2-EH13 | ¿Cuántos días hacia atrás puede fecharse un pago al registrarlo? | 400 días (un año con holgura) es el valor puesto; otra escuela podría querer 30 o 90. Recomendación: dejarlo y hacerlo configurable solo si alguien lo pide. | 400 días; más atrás es 400 `fecha_muy_antigua`. | |
| K2-EH12 | Repetir la clave de un pago ya CANCELADO: ¿conflicto (409 `pago_cancelado`) o devolver el pago cancelado? | Recomendación: 409 (la caja no lo lee como cobro). | 409. | |
| K3-EB20 | ¿Se obliga a cambiar la contraseña en el primer acceso de cada persona? | Recomendación: sí, cuando exista la pantalla de administración de usuarios (hoy el administrador fija la inicial). | No se obliga. | |
| K3-EB19 | ¿Cuánto tiempo se conservan `registro_cambio` y `acceso_dato_sensible` (son de solo anexar)? | Sin recomendación previa; depende de la política de la escuela y del aviso de privacidad (p. ej. 2 a 5 años). | Se conservan siempre. | |
| K4-SALUD | Con Chatwoot caído, ¿el backend debe seguir recibiendo tráfico (`degradado`) o salir del balanceador (`no lista`)? | Recomendación: seguir (los webhooks de Twilio y la interfaz funcionan; el bot y los avisos reintentan). `exigirChatwoot` lo cambia. | `degradado`, sigue recibiendo. | |
| K5-RPO | ¿Qué pérdida de datos y qué tiempo de recuperación son aceptables (RPO / RTO)? | Propuesta: RPO de minutos (restauración a un punto en el tiempo de RDS) y RTO de 30 a 60 minutos; respaldo lógico cifrado cada noche. | Escrito en `docs/RESPALDO.md` como `[SUPUESTO]`. | |
| K5-CLAVE | ¿Dónde se guarda la copia de la clave de cifrado de los datos de salud fuera de AWS? | Recomendación: un gestor de contraseñas de la dirección, con dos personas con acceso. | Solo Secrets Manager y el secreto protegido. | |
| K6-COSTO | ¿Qué configuración de AWS se contrata: staging (~200 USD al mes) y producción con Multi-AZ, una NAT por zona y WAF (~370), o una versión reducida? | Recomendación: producción con Multi-AZ y WAF; una sola NAT al inicio si hay que ahorrar (tabla de costos y riesgos en `docs/INFRA-AWS.md`). | Variables con valores de staging en los ejemplos. | |
| K6-REGION | ¿En qué región de AWS viven los datos? | `us-east-2` por costo; `mx-central-1` si la escuela exige que los datos de los menores se queden en México. | `us-east-2`. | |
| K6-CHATWOOT | ¿Una sola tarea de Chatwoot (la bandeja se cae unos minutos al desplegar) o varias? | Recomendación: una al inicio; Chatwoot 4 no está pensado para varias réplicas de `web` sin revisar sesiones y adjuntos. | Una. | |
| K6-ADMIN | ¿La bandeja de Chatwoot se abre a Internet con login o solo desde las redes de la escuela (`cidrs_administracion`)? | Recomendación: restringir a las redes de la escuela si los asesores trabajan desde sus oficinas. | Abierta con login. | |
| K8-HERMANO | ¿Hace falta una forma de agregar un segundo hijo a un lead ya capturado desde la interfaz? | Hoy solo lo hace el bot (un prospecto) o la landing; un hermano nuevo exige otro lead. | No hay. | |

## 3. Supuestos que la escuela debe confirmar

Dónde vive cada uno: "API" significa que el administrador puede cambiarlo por la API (la pantalla de administración, J7 y J8, aún no existe); "SQL" significa que hoy solo se cambia en la base; "código" significa que hay que tocar el programa.

### 3.1 Catálogo, salones y personas

| Área | Qué se asumió | Dónde vive | Valor actual | Confirmación de la escuela |
|---|---|---|---|---|
| Sucursales | Direcciones | `sucursal.direccion`; SQL | Vacías (el insumo dice pendiente); la oferta de otra sucursal sale sin dirección | |
| Programas | Rangos de edad de baile | `programa`; SQL | 15 a 99 en Salsa y Cumbia y en Twerk (contexto §12 lo marca pendiente) | |
| Programas | Salsa y Cumbia y Twerk en Águilas son alternativas por estilo para la misma edad | `programa.permite_traslape`; SQL | Ambos verdaderos; el bot pregunta cuál | |
| Programas | Fecha de corte de edad (inicio de ciclo) | `programa.fecha_corte_edad`; SQL | Vacía en todos | |
| Grupos | Cupo máximo de los 18 grupos | `grupo.cupo_maximo`; API | Karate 12, 18 y 20 (del insumo, sin confirmar); nuevos: Ballet 3-5 = 12, Ballet 6-13 y 14+ = 15, Salsa y Cumbia = 24, Twerk = 20; capacidad total 184 (Águilas) y 116 (Centenario) | |
| Horarios | Duración donde solo se dio la hora de inicio | `grupo_horario`; API | Karate 6-13 y 14+ = 60 min; Ballet 3-5 = 45; Salsa y Cumbia = 60; Ballet 6-13 entre semana en Centenario = 60 | |
| Salones | Cuántos salones hay y su capacidad | `salon`; API | Dojo 24 en cada sucursal; Salón 2 (Águilas) y Salón 1 (Centenario) de 30 | |
| Instructores | Quién da qué grupo | `instructor`, `instructor_sucursal`; API | 5 instructores de ejemplo con teléfonos ficticios, más "Maestro demo"; uno por vertical y sucursal, y uno solo para todo el baile | |
| Verticales | Colores de marca, logo, y que Baile no use progresión | `vertical`; SQL | Karate #C0392B, Ballet #8E44AD, Baile #E67E22; sin logo; Baile con `usa_progresion` en falso | |
| Progresión | Peldaños y clases mínimas | `nivel_progresion`; API | Karate: Blanco, Amarillo, Naranja, Verde, Azul, Café, Negro (0, 20, 30, 40, 50, 60, 100 clases); Ballet: Pre-ballet a Avanzado (0, 24, 36, 48, 60, 72; los nombres son del contexto §7); Baile: Principiante, Intermedio, Avanzado (0, 16, 32) | |
| Registro del maestro | Edad válida de 1 a 99 años; qué cuenta como "completo" (alumno, un adulto responsable de pago, antecedentes y ficha de salud entera); motivos para tomar la clase (disciplina, condición física, socialización, competencia, otro) | código (`registro-reglas.ts`) y esquema | Los valores indicados | |

### 3.2 Precios y promociones

| Área | Qué se asumió | Dónde vive | Valor actual | Confirmación de la escuela |
|---|---|---|---|---|
| Precios | Inscripción y mensualidad de los 14 programas, iguales en las dos sucursales, en pesos, vigentes desde 2026-01-01 | `precio`; API | Karate 3-5: 600 y 750; Karate 6-13: 600 y 850; Karate 14+: 700 y 950; Ballet 3-5: 600 y 800; Ballet 6-13: 600 y 900; Ballet 14+: 700 y 1,000; Salsa y Cumbia: 500 y 700; Twerk: 500 y 750 | |
| Promociones | Tres promociones de ejemplo, vigentes de 2026-01-01 a 2027-12-31, para todas las verticales y sucursales, sin tope de cupo | `promocion`, `promocion_beneficio`; API | Inscripción gratis (no acumulable, prioridad 10); uniforme gratis al pagar la primera mensualidad (acumulable, 5); 10 % en la mensualidad desde el segundo hermano (acumulable, 3) | |
| Productos | Stock global y que recepción ajusta el inventario | `producto`; API | Global por producto | |
| Cotización | Días que vale una cotización, a lo más (antes vence si lo cotizado vence: una promoción o el precio) | `configuracion_organizacion.cotizacion_vigencia_dias`; SQL | 7 días | |
| Lista de espera | Horas para tomar un lugar ofrecido | `configuracion_organizacion.lista_espera_oferta_horas`; SQL | 48 horas | |

### 3.3 Textos y plantillas

| Área | Qué se asumió | Dónde vive | Valor actual | Confirmación de la escuela |
|---|---|---|---|---|
| Documentos legales | Reglamento, autorización de uso de imagen y aviso de privacidad, versión 1. El aviso lo debe revisar un abogado antes de usarse | `documento_legal`; API (se publica una versión nueva, las anteriores no se editan) | Textos de ejemplo marcados `[SUPUESTO]` | |
| Bot | Todos los textos: saludo, preguntas, cotización, oferta de otra sucursal, lista de espera, agendado, cierre | `src/captacion/maquina.ts`; código | Genéricos; revisar el tono | |
| Landing | Texto del cuestionario y mensaje prellenado de WhatsApp | `src/captacion/landing.ts` y `src/http/landing-html.ts`; código | Genéricos | |
| Plantillas | Texto de las 11 plantillas, todas ficticias y "aprobadas" solo para la demo; hay que registrarlas y aprobarlas en Twilio y Meta con el mismo código y variables en el mismo orden | `plantilla_mensaje`; SQL (sin API, J8) | Ver las dos filas siguientes | |
| Plantillas | Clase de servicio (sale aunque una persona atienda): recordatorio de clase muestra, bienvenida de inscripción, tres avisos al maestro, recordatorio de pago por vencer y vencido | `plantilla_mensaje.clase_mensaje`; SQL | 7 de servicio | |
| Plantillas | Clase de marketing (se frena con persona atendiendo, con baja de marketing y por el tope semanal): reenganche de captación, recuperación de quien no llegó, reenganche de lead frío, promoción por vencer | `plantilla_mensaje.clase_mensaje`; SQL | 4 de marketing. Reenganche y recuperación están registradas como `utility` ante Meta; si Meta las reclasifica cambia el costo, no el tope | |
| Embudo | Nombres de las 7 etapas, de los 6 motivos de pérdida y de los 5 motivos de baja (económico, cambio de domicilio, horario, insatisfacción, otro) | `etapa_pipeline` (SQL); motivos por API | Sugeridos por el insumo; los motivos son de ejemplo | |

### 3.4 Tiempos, topes y reglas de mensajería

| Área | Qué se asumió | Dónde vive | Valor actual | Confirmación de la escuela |
|---|---|---|---|---|
| Frecuencia | Máximo de mensajes automáticos por teléfono al día y de marketing por semana | `configuracion_organizacion`; SQL | 3 al día (ventana móvil de 24 h) y 1 de marketing cada 7 días. Consecuencia de EG-05: el reenganche, la recuperación, el lead frío y la promoción por vencer comparten ese tope, así que mandan un solo mensaje por semana; para dos intentos hay que subirlo a 2 | |
| Horario | Ningún mensaje iniciado por el sistema fuera de 09:00 a 20:00 hora de la sucursal | invariante 14; código (fijo) | 09:00 a 20:00 | |
| Días de envío | Reenganche, lead frío, promoción, bienvenida y cobranza salen de lunes a sábado; recordatorios y recuperación de clase muestra, todos los días | `automatizacion.dias_permitidos`; SQL | Como se indica | |
| Lead a medias | Minutos sin respuesta para mostrarlo a los asesores, y horas para el reenganche | `src/captacion/espera.ts` (código); `automatizacion.offset_minutos` (SQL) | 30 minutos y 25 horas, un solo intento | |
| Clase muestra | Anticipación mínima, horizonte, máximo de fechas ofrecidas y horas para corregir la asistencia | `configuracion_organizacion` (SQL); el máximo de fechas, código | 2 horas, 60 días, 5 fechas y 48 horas | |
| Recordatorios | Cuánto antes se recuerda la clase muestra | `automatizacion` ids 802 y 803; SQL | 24 horas y 2 horas antes | |
| Recuperación | Cuándo y cuántas veces se escribe a quien no llegó | `automatizacion` id 804; SQL | 2 horas después de marcar la falta, otra a las 48 horas, 2 intentos como máximo | |
| Lead frío | Días sin movimiento por etapa, episodios y antigüedad máxima | `etapa_pipeline.dias_alerta_sin_movimiento` y `automatizacion` id 805; SQL | 2, 3, 3, 3 y 5 días; 3 episodios; no se persigue lo enfriado hace más de 14 días | |
| Promoción por vencer | Cuándo se avisa | `automatizacion` id 806; SQL | 3 días antes | |
| Código de rastreo | Vigencia y usos del código del lead de la landing | código | 30 días, un solo uso | |

### 3.5 Operación escolar y cobranza

| Área | Qué se asumió | Dónde vive | Valor actual | Confirmación de la escuela |
|---|---|---|---|---|
| Faltas | Faltas seguidas que disparan la tarea al asesor; que la falta justificada ni suma ni corta la racha; que la ve el asesor de la sucursal | `configuracion_organizacion.umbral_faltas_consecutivas` (SQL); el resto, código | 3 faltas | |
| Pase de lista | Quién lo registra y que no se pueda antes de que empiece la clase | `src/api/permisos.ts`; código | Maestro, recepción y administrador; el asesor solo lee | |
| Permisos | Qué ve y qué hace cada rol | `src/api/permisos.ts`; código | Recepción no ve tareas ni conversaciones; el asesor no escribe el catálogo; recepción cobra, da de baja y congela; el maestro ve trayectoria y operativo del alumno sin importes ni origen comercial y califica en eventos | |
| Eventos | Que cada evento otorga progresión por omisión y que recepción cobra y marca el estatus | `evento.otorga_progresion`; API | Sí | |
| Cobranza | Cuándo se recuerda un pago y a partir de cuántos días de deuda hay tarea para el asesor | `automatizacion` ids 808 y 809 (SQL); `configuracion_organizacion.umbral_dias_deuda` (SQL) | 3 días antes, 1 día después y cada 7 días (2 intentos); no se persigue deuda de más de 60 días; tarea a los 15 días de deuda | |
| Cargos | La primera mensualidad vence el día de corte de su mes (o el día de la inscripción si ese corte ya pasó); el barrido solo genera el mes en curso | `src/finanzas/cargos.ts`; código | Como se indica | |
| Pagos | Un pago no puede fecharse más de 400 días atrás (resuelve EH-13) | `src/finanzas/pagos.ts`; código | 400 días | |

### 3.6 Reportes, demo, seguridad e interfaz

| Área | Qué se asumió | Dónde vive | Valor actual | Confirmación de la escuela |
|---|---|---|---|---|
| Reporte ejecutivo | Ocupación a partir de la cual un grupo está "a reventar" y hasta la cual está "vacío" | `src/reportes/ejecutivo.ts`; código | 90 % y 25 % | |
| Datos de demo | Perfiles de pago, bajas, compras y asistencia del generador (no son datos de la escuela) | `src/demo/generador.ts`; código | 50 % puntual, 25 % parcial, 15 % tardío, 10 % moroso; 12 % de bajas; 40 % compra un producto; asistencia de 55 a 98 % | |
| Acceso | Duración de la sesión, bloqueo y contraseña | variables de entorno y código | 12 horas, 120 minutos de inactividad, 5 intentos en 15 minutos, contraseña de 10 caracteres como mínimo | |
| Límites | Peticiones por minuto por IP | `src/http/config-limites.ts`; código y entorno | Inicio de sesión 10, API 600, landing 30 | |
| Interfaz | Barra inferior del celular con 4 secciones y "Más"; quién ve "Hoy"; fuentes con nombre en pantalla (Facebook, Instagram, En sucursal (QR), Página de captación); motivo por omisión al ver salud ("Revisión del maestro antes de la clase") | `web/src/navegacion.ts`, `Embudo.tsx`; código | Como se indica | |

## 4. Decisiones técnicas con alternativa descartada

| # | Decisión tomada | Alternativa descartada | Por qué conviene saberlo |
|---|---|---|---|
| 1 | Vía A de atribución con el borde de Twilio que valida firma y descarta reintentos | Vía C: el backend manda y recibe todo por Twilio | La C cierra la firma de punta a punta (incluidos los estados de entrega, EA-02) pero el asesor deja de ver en Chatwoot lo que no pasa por su API. Es la salida si la A falla con Twilio real. |
| 2 | EB-10: el directorio de agentes y el reenviador de Twilio quedan fuera de `MessagingProvider` como excepciones anotadas | Moverlos detrás del proveedor | Por la letra del invariante 4 son excepción; por su espíritu (no inician mensajes) no. Pide decisión o cambio del texto de `CLAUDE.md`. |
| 3 | EF-15 y EB-08: una sola cuenta de base de datos en la demo | Dos cuentas (migraciones y aplicación) | Con una cuenta superusuaria, quien llegue a la base puede apagar los disparadores que protegen cupo y dinero. K6 debe crear las dos. La cuadratura (`npm run cuadratura`) es la red de seguridad. |
| 4 | Cupo y dinero se protegen en la base (disparadores, CHECK, candados), no solo en el código | Comprobar y luego actuar | Un SQL directo o un código olvidadizo no puede sobrevender un grupo ni sobrepagar un cargo. Costo: más migraciones y mensajes de error de base que el código traduce. |
| 5 | Los contadores del dinero se protegen por profundidad de disparador (EH-01), no por permisos de columna | `REVOKE UPDATE` en columnas | La aplicación necesita ese `UPDATE` de forma indirecta. Un superusuario puede saltarse los disparadores; para eso está la cuadratura. |
| 6 | Dinero en centavos enteros y texto en la API | Decimales de librería o flotantes | Sin errores de redondeo y sin librería; el redondeo (al centavo más cercano, la mitad alejándose de cero) está definido en `src/lib/dinero.ts`. |
| 7 | Salud de menores cifrada en la aplicación (AES-256-GCM), con clave en el entorno | Columnas en claro ocultas con una regla de consulta | Un respaldo de la base no revela salud. Si se pierde la clave los datos no se recuperan: respaldarla es tan importante como respaldar la base. |
| 8 | Webhooks: ante un dato inesperado se responde 200, se deja constancia y una tarea (WH) | Responder 5xx para que el proveedor reintente | Evita bucles infinitos por un dato raro; costo: un error propio se "acepta" y lo ve una persona, sin reintento automático. |
| 9 | Registro de cambios sin valores identificables (solo qué campos se tocaron), de solo anexar | Guardar antes y después | Como nunca se purga, guardar nombres y teléfonos los dejaría para siempre. Costo: no se puede reconstruir el valor anterior de un dato. |
| 10 | Documentos legales y aceptaciones inmutables; cambiar un texto es publicar la versión siguiente | Editar el texto con historial aparte | La evidencia de qué se aceptó no depende de que nadie toque la tabla. Costo: una versión mal publicada solo se reemplaza, no se corrige. |

## 5. Nota final

- **Resueltas en K2 (hoy), no aparecen como abiertas:** EH-12 (reintentar con la clave de un pago cancelado ahora responde 409 `pago_cancelado`); EH-13 (la fecha de un pago no puede ir más de 400 días atrás); EH-19 (el barrido de vencidos ahora procesa fila por fila); ED-08 (el orden de candados es lead y luego grupo, en el bot y en la API).
- **Pendientes técnicos que no son decisión de producto** (EF-11, EF-14, EF-18 a EF-25, EG-17 a EG-19, EC-11, EC-23, EC-25, EC-26, EB-16, EB-18, EB-26, entre otros) se quedan en las tablas de cada auditoría; no esperan respuesta de Eduardo.
- **Pendiente de credenciales reales:** lo que no se pudo probar sin Twilio, Meta, Chatwoot real o AWS está en `docs/PENDIENTES-CREDENCIALES-REALES.md`.
