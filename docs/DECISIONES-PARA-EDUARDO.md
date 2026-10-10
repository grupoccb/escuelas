# Decisiones para Eduardo

Una sola lista, sin duplicados, de todo lo que falta decidir o conseguir para que la escuela use el sistema: 128 decisiones en tres grupos. Corte: 10 de octubre de 2026, rama `v1-escuela`; D-01 a D-117 después del bloque V10b (bloque V11 del plan) y D-118 a D-128 de la auditoría final V13 (todas del grupo C: el sistema sigue con el valor de hoy mientras no se decida).

Reúne y reemplaza, sin repetir, lo que estaba disperso en `docs/SUPUESTOS-Y-DECISIONES.md` (que ahora apunta a esta lista y conserva los valores vigentes), `docs/HALLAZGOS-ABIERTOS-V1.md` (las 52 filas de «decisión de producto» y las filas de credenciales), `docs/PENDIENTES-CREDENCIALES-REALES.md`, los «Para Eduardo» de `docs/BITACORA-V1.md`, `docs/BITACORA-NOCHE-2.md` y `docs/BITACORA-NOCHE.md`, las auditorías (`docs/auditorias/`), `docs/DECISION-ATRIBUCION.md`, `docs/REVISION-INSUMOS.md`, `docs/QUE-PEDIRLE-A-LA-ESCUELA.md`, `docs/ENSAYO-WHATSAPP-REAL.md` y los `[SUPUESTO]` de `prisma/seed/*.sql`. Cada decisión lleva todos sus identificadores de origen. Lo que ya decidiste no se vuelve a preguntar: está en la tabla «Ya decidido» al final.

## Cómo usar este archivo

1. Empieza por el **cuadro-resumen** (10 minutos): cada fila tiene una recomendación en tres palabras.
2. Revisa **«Las 10 que más urgen»** y decide esas primero, en ese orden.
3. Para decidir con detalle, abre la decisión por su número (D-01…). Cada una tiene la pregunta, qué hace el sistema hoy, las opciones con su consecuencia, mi recomendación, qué pasa si no se decide y dónde se cambia.
4. **Responde en el mismo archivo**: escribe la opción (por ejemplo «A», «B» o un texto corto) donde dice `Decidido: ______`. Si no escribes nada, se queda lo que dice «Si no se decide».
5. Una prueba (`scripts/decisiones.test.ts`, dentro de `npm test`) comprueba que el archivo conserva los tres grupos y los siete campos de cada decisión, que ningún identificador de origen se repite y que todas las filas de «decisión de producto» de `docs/HALLAZGOS-ABIERTOS-V1.md` aparecen aquí. Así esta lista no se queda atrás.

**Los tres grupos**

| Grupo | Qué significa | Decisiones |
|---|---|---|
| A. Bloquea salir con captación | Lo que la escuela necesita decidir o entregar, o Grupo CCB y tú necesitan conseguir, para usar el primer día el asistente de tres preguntas, el pase al asesor, las tareas, el embudo y el reporte de leads (incluye credenciales reales y producción) | 28 |
| B. Bloquea un módulo posterior | Lo que hay que decidir antes de encender un módulo: cotizador, clase muestra, inscripción, operación, finanzas o tableros. Cada decisión dice a cuál | 52 |
| C. Puede esperar | Mejoras, pantallas faltantes y preferencias; si no se decide, se queda el valor de hoy sin riesgo | 48 |

## Las 10 que más urgen

| # | Decisión | Qué es | Por qué primero |
|---|---|---|---|
| 1 | D-03 | Números de WhatsApp y cuenta verificada | El trámite de Meta es lo que más tarda (semanas). Empezarlo hoy en paralelo con todo lo demás. |
| 2 | D-26 | Ensayo con el sandbox de WhatsApp antes de todo | Quince minutos con el sandbox: descubre problemas de firma, dirección pública y Chatwoot antes de pedirle nada a la escuela. |
| 3 | D-04 | Plantilla de reenganche a aprobar en Meta | Meta tarda en aprobar; sin la plantilla no sale el rescate de quien dejó la conversación a medias. |
| 4 | D-10 | Aviso de privacidad y textos legales definitivos | El abogado es el cuello de botella: sin aviso vigente la página de registro no abre. |
| 5 | D-16 | Datos básicos de la escuela para abrir | Sin disciplinas, sucursales y asesores no hay nada que cargar; una sesión de una hora lo resuelve. |
| 6 | D-06 | Escuela nueva con sus automatizaciones | Sin esto, una escuela nueva abre sin reenganche y sin que nada lo avise. |
| 7 | D-21 | Cuenta de AWS, dominio y primer despliegue | Cuenta, dominio y certificado toman días; sin ellos no hay producción. |
| 8 | D-01 | Vía de atribución: A o C | Se confirma con el ensayo y el primer anuncio real; define cómo se configura Twilio. |
| 9 | D-02 | Avisos de entrega (entregado, leído) en AWS | Hay que resolverlo antes de exponer algo a internet en AWS. |
| 10 | D-17 | Accesos del primer día: contraseñas y permisos | Contraseñas iniciales y permisos: lo último antes de que entren personas reales. |

## Credenciales reales

Todo lo que no se puede comprobar sin Twilio, Meta, Chatwoot o AWS reales está en `docs/PENDIENTES-CREDENCIALES-REALES.md` (los pasos, quién los hace y cómo se sabe que quedó bien) y el ensayo con el sandbox de WhatsApp en `docs/ENSAYO-WHATSAPP-REAL.md`. Aquí **no se repiten esos pasos**: solo aparecen las decisiones que dependen de ti. Ninguna credencial real se ha usado en esta sesión.

| Decisión | Tema | Grupo |
|---|---|---|
| D-03 | Números de WhatsApp y cuenta verificada | A |
| D-04 | Plantilla de reenganche a aprobar en Meta | A |
| D-05 | Quién marca «aprobada» y mapa servicio/marketing | A |
| D-01 | Vía de atribución: A o C | A |
| D-02 | Avisos de entrega (entregado, leído) en AWS | A |
| D-21 | Cuenta de AWS, dominio y primer despliegue | A |
| D-22 | Tamaño y región de AWS | A |
| D-23 | Chatwoot en AWS: réplicas, acceso y caída | A |
| D-24 | Asignación automática de Chatwoot | A |
| D-25 | Respaldos: cuánto dato se puede perder | A |
| D-26 | Ensayo con el sandbox de WhatsApp antes de todo | A |
| D-27 | Pruebas en teléfonos y navegadores reales | A |
| D-28 | Pruebas de producción: carga, restauración y seguridad externa | A |
| D-38 | Textos a aprobar para la clase muestra | B |
| D-46 | Copia de la clave de cifrado de salud | B |
| D-103 | Una cuenta de Twilio por organización | C |

## Qué decisión desbloquea cuál módulo

Los módulos son los siete de V1 (la captación nunca se apaga). Todo lo del grupo A es de captación o de producción. Cada módulo se enciende en Administración → Módulos cuando sus decisiones del grupo B estén tomadas y sus datos cargados (`docs/QUE-PEDIRLE-A-LA-ESCUELA.md` dice qué datos pide cada etapa).

| Módulo | Decisiones del grupo B que lo desbloquean | Cuántas |
|---|---|---|
| Cotizador | D-29, D-30, D-31, D-32, D-33, D-34, D-35, D-36, D-37 | 9 |
| Clase muestra | D-38, D-39, D-40, D-41, D-42, D-43, D-44, D-45, D-46, D-47, D-48 | 11 |
| Inscripción | D-49, D-50, D-51, D-52, D-53, D-54, D-55, D-56, D-57, D-58, D-59 | 11 |
| Operación | D-60, D-61, D-62, D-63, D-64 | 5 |
| Finanzas | D-65, D-66, D-67, D-68, D-69, D-70, D-71, D-72, D-73, D-74, D-75 | 11 |
| Tableros | D-76, D-77, D-78, D-79, D-80 | 5 |

Dependencias entre módulos (V1): inscripción necesita el cotizador; operación y finanzas necesitan inscripción; tableros necesita inscripción, finanzas y clase muestra.

## Cuadro-resumen

| Id | Decisión | Grupo | Módulo | Recomendación |
|---|---|---|---|---|
| D-01 | Vía de atribución: A o C | A | Captación | Vía A, confirmar |
| D-02 | Avisos de entrega (entregado, leído) en AWS | A | Captación | Enrutar al backend |
| D-03 | Números de WhatsApp y cuenta verificada | A | Captación | Uno por disciplina |
| D-04 | Plantilla de reenganche a aprobar en Meta | A | Captación | Marketing, texto breve |
| D-05 | Quién marca «aprobada» y mapa servicio/marketing | A | Captación | A mano, luego sincronizar |
| D-06 | Escuela nueva con sus automatizaciones | A | Captación | Sembrarlas apagadas |
| D-07 | Tono de los 31 textos del asistente | A | Captación | Revisar y personalizar |
| D-08 | Palabras propias en la página de registro | A | Captación | Sí, pocas |
| D-09 | Qué pasa al enviar el formulario | A | Captación | Página de gracias |
| D-10 | Aviso de privacidad y textos legales definitivos | A | Captación | Borrador CCB, abogado |
| D-11 | Dónde queda el consentimiento | A | Captación | Preguntar al abogado |
| D-12 | Palabras de baja y baja con una persona atendiendo | A | Captación | Sumar ALTO, PARAR |
| D-13 | Qué cuenta como «un asesor atiende» | A | Captación | Como hoy |
| D-14 | Tiempos del lead a medias | A | Captación | 30 min y 25 h |
| D-15 | Topes y horario de los mensajes automáticos | A | Captación | Confirmar como están |
| D-16 | Datos básicos de la escuela para abrir | A | Captación | Sesión con CCB |
| D-17 | Accesos del primer día: contraseñas y permisos | A | Captación | Cambio obligatorio |
| D-18 | Nombres de las etapas y motivos de pérdida | A | Captación | Los de la escuela |
| D-19 | Familias «inscritas a mano»: cómo regularizarlas | A | Captación | Inscribir una por una |
| D-20 | Dato de soporte: a quién avisar | A | Captación | Nombre y teléfono |
| D-21 | Cuenta de AWS, dominio y primer despliegue | A | Captación | Cuenta por cliente |
| D-22 | Tamaño y región de AWS | A | Captación | Multi-zona, us-east-2 |
| D-23 | Chatwoot en AWS: réplicas, acceso y caída | A | Captación | Una tarea, red cerrada |
| D-24 | Asignación automática de Chatwoot | A | Captación | Avisar al arrancar |
| D-25 | Respaldos: cuánto dato se puede perder | A | Captación | Respaldo nocturno S3 |
| D-26 | Ensayo con el sandbox de WhatsApp antes de todo | A | Captación | Hacerlo primero |
| D-27 | Pruebas en teléfonos y navegadores reales | A | Captación | Antes de abrir |
| D-28 | Pruebas de producción: carga, restauración y seguridad externa | A | Captación | Hacerlas antes |
| D-29 | Precios reales de los 14 programas | B | Cotizador | Pedir lista de precios |
| D-30 | Promociones reales y cuáles son «no acumulables» | B | Cotizador | Listar promociones vigentes |
| D-31 | Cupo real de los 18 grupos | B | Cotizador | Confirmar cada cupo |
| D-32 | Duración de clase, salones y capacidad | B | Cotizador | Pedir horario completo |
| D-33 | Edades de los programas y fecha de corte | B | Cotizador | Pedir edades y corte |
| D-34 | Tres reglas de edición del catálogo | B | Cotizador | Endurecer las tres |
| D-35 | Recuperar una baja y corregir un precio mal capturado | B | Cotizador | Editar vigencia sin uso |
| D-36 | La cotización del asistente sale sin revisión | B | Cotizador | Confirmar datos antes |
| D-37 | Lista de espera: lugar ofrecido que no se toma | B | Cotizador | Pasar al siguiente |
| D-38 | Textos a aprobar para la clase muestra | B | Clase muestra | Mandar las siete |
| D-39 | Tiempos de la clase muestra y sus recordatorios | B | Clase muestra | Confirmar tiempos |
| D-40 | Una clase muestra por grupo o por sesión | B | Clase muestra | Una por grupo |
| D-41 | Reagendar a quien no llegó: ¿lo hace el asistente? | B | Clase muestra | Lo hace el asesor |
| D-42 | Recordatorios: antelación, duplicados y aviso al asesor | B | Clase muestra | Mínimo de antelación |
| D-43 | Aviso al maestro: tope y teléfono faltante | B | Clase muestra | Tarea, no bloquear |
| D-44 | Maestros reales y quién da cada grupo | B | Clase muestra | Pedir maestros y teléfonos |
| D-45 | Ficha de salud: quién la captura y cuánto la ve el maestro | B | Clase muestra | Como está |
| D-46 | Copia de la clave de cifrado de salud | B | Clase muestra | Gestor de contraseñas |
| D-47 | Reglamento, uso de imagen y evidencia de aceptación | B | Clase muestra | Texto de la escuela |
| D-48 | Reglamento de cada niño y de los hermanos | B | Clase muestra | Preguntar al abogado |
| D-49 | Quién cierra la inscripción: asesor o maestro en sitio | B | Inscripción | Asesor por WhatsApp |
| D-50 | Alumnos que ya vienen: inscripciones con fecha pasada | B | Inscripción | Carga de existentes |
| D-51 | Familia que llega a mostrador sin lead | B | Inscripción | Formulario en ficha |
| D-52 | Inscripción contra clases muestra ya agendadas | B | Inscripción | Contar las muestras |
| D-53 | Datos del tutor de otra sucursal | B | Inscripción | Ocultar hasta confirmar |
| D-54 | Segundo hijo de un lead ya inscrito y meses por adelantado | B | Inscripción | Ya cubierto; exigir pago |
| D-55 | Qué hijo paga completo con el descuento por hermanos | B | Inscripción | El primero capturado |
| D-56 | Bienvenida: una por familia o por hijo, y a quién | B | Inscripción | Una por inscripción |
| D-57 | Un solo responsable de pago | B | Inscripción | Uno por alumno |
| D-58 | Horario cotizado o recomendado por el maestro | B | Inscripción | Gana el cotizado |
| D-59 | Bajas: beneficios, cupo de la promoción y quién puede dar de baja | B | Inscripción | Conservar y avisar |
| D-60 | Pase de lista: quién y hasta cuándo | B | Operación | Como hoy |
| D-61 | Faltas seguidas y aviso a la familia | B | Operación | Solo tarea |
| D-62 | Niveles, cinturones y clases mínimas | B | Operación | Pedir los reales |
| D-63 | Eventos: cuota, excepciones y quién marca pagado | B | Operación | Una cuota por evento |
| D-64 | Qué ve el maestro y el asesor del expediente | B | Operación | Solo sus grupos |
| D-65 | Calendario de cobranza y día de corte | B | Finanzas | Confirmar calendario |
| D-66 | Inscripciones anteriores al módulo de cobros | B | Finanzas | Fecha de arranque |
| D-67 | Inscribirse el último día del mes | B | Finanzas | Cobrar mes completo |
| D-68 | Congelar y reactivar una inscripción | B | Finanzas | Cobrar completo |
| D-69 | Pago mayor a lo que se debe | B | Finanzas | Rechazar, dar cambio |
| D-70 | Descuentos diferidos en mensualidades siguientes | B | Finanzas | Solo marcar entregado |
| D-71 | Inventario: pantalla de entrada y por sucursal | B | Finanzas | Pantalla de inventario |
| D-72 | Límites de los pagos: fecha, repetición y cancelación | B | Finanzas | Como están |
| D-73 | Reparto de un pago entre hijos | B | Finanzas | Propuesta del sistema |
| D-74 | Recepción: corte de caja formal, estado de cuenta por WhatsApp y permisos | B | Finanzas | Corte formal después |
| D-75 | Estado de cuenta por sucursal y deuda vencida para recepción | B | Finanzas | Familia completa |
| D-76 | Conversión de clases muestra: misma disciplina y posterior | B | Tableros | Contar bien |
| D-77 | Tablero ejecutivo: importes para el asesor y umbrales | B | Tableros | Dejar y ajustar umbrales |
| D-78 | Gasto de campaña: tipo de gasto y «—» sin gasto | B | Tableros | Mostrar guion |
| D-79 | Teléfonos en los CSV con apóstrofo | B | Tableros | Dejar el apóstrofo |
| D-80 | Pantalla de campañas y vigencia de códigos | B | Tableros | Ampliar después |
| D-81 | Casos raros de la página de registro | C | Captación | Dejar como está |
| D-82 | Unir la familia si escribe desde otro teléfono | C | Captación | Resolver al convertir |
| D-83 | Sucursal del lead: del adulto o de cada niño | C | Captación | Del lead, corregible |
| D-84 | Quién recupera un lead perdido y la matriz de etapas | C | Captación | Pantalla después |
| D-85 | Notas del lead sin cambiar de etapa | C | Captación | Construir notas |
| D-86 | Identificadores y códigos QR de lo dado de baja | C | Captación | Reservar para siempre |
| D-87 | Horario de envío por sucursal | C | Captación | Por organización basta |
| D-88 | Conversación de un lead que se borra | C | Captación | Conservarla |
| D-89 | Mensaje que queda a medias si se cae el sistema | C | Captación | A lo sumo una vez |
| D-90 | Agrupar tareas y quién ve los eventos inesperados | C | Captación | Ver con tareas reales |
| D-91 | Lead frío: con atención humana, con baja y sus tiempos | C | Captación | Como hoy |
| D-92 | Respaldo por SMS si falla WhatsApp | C | Captación | No construir |
| D-93 | ¿Copiar la nota de «inscrito a mano» al registro de cambios? | C | Captación | No copiar |
| D-94 | Un «sí» ante un único horario | C | Cotizador | Entender el sí |
| D-95 | Clases que cruzan la medianoche | C | Cotizador | No hace falta |
| D-96 | Salones migrados con nombres casi iguales | C | Cotizador | Que fusione el administrador |
| D-97 | Maestro reprograma o cancela una clase muestra | C | Clase muestra | Solo asesor |
| D-98 | Nombre de la bandera de contacto de urgencia | C | Inscripción | Aceptar el nombre |
| D-99 | Pantalla del maestro en celular | C | Operación | Dejar y observar |
| D-100 | El maestro y los precios | C | Operación | Quitar precios al maestro |
| D-101 | Un solo horario para una disciplina en una sucursal | C | Tableros | Medir primero |
| D-102 | Excepciones al invariante 4 (mensajes fuera de MessagingProvider) | C | Varios | Anotar la excepción |
| D-103 | Una cuenta de Twilio por organización | C | Varios | Cuando haya otra escuela |
| D-104 | Doble verificación para administradores y tope por cuenta | C | Varios | Pedir contraseña actual |
| D-105 | Cuánto se conserva el registro de accesos y cambios | C | Varios | Conservar 5 años |
| D-106 | Ratificar excepciones a reglas de organización y bajas | C | Varios | Ratificar como están |
| D-107 | Límites de peticiones con varias réplicas | C | Varios | Balanceador y firewall |
| D-108 | Liberar un bloqueo de acceso | C | Varios | Botón Liberar |
| D-109 | Dos administradores que editan lo mismo | C | Varios | No por ahora |
| D-110 | Sesión vencida a media captura en formularios cortos | C | Varios | Solo el registro del maestro |
| D-111 | Nombres de módulos, texto de «grupo lleno» y fuentes en pantalla | C | Varios | Ajustar a la escuela |
| D-112 | Teléfonos más fáciles de leer en pantalla | C | Varios | Función de presentación |
| D-113 | Pantallas para niveles, productos, eventos y documentos legales | C | Varios | Según uso |
| D-114 | Carga desde Excel: fecha de inicio por grupo y más hojas | C | Varios | Ampliar si hay datos |
| D-115 | Dónde aterriza el administrador | C | Varios | Dejar el embudo |
| D-116 | Gates de las Fases 2 y 3 del SPEC | C | Varios | Revisarlos tú |
| D-117 | Datos de ejemplo en la demo | C | Varios | Solo en una copia |
| D-118 | Cobros que se generan con Finanzas apagada | C | Finanzas | Seguir generando |
| D-119 | Qué se recupera al encender un módulo que estuvo apagado | C | Finanzas | Botón Ponerse al corriente |
| D-120 | Inscripción sin Clase muestra: dónde se acepta el reglamento | C | Inscripción | Ruta propia |
| D-121 | Lo que dice el asistente cuando el Cotizador está apagado | C | Cotizador | Texto sin horarios |
| D-122 | Etapas «Clase muestra agendada / asistida» con Clase muestra apagada | C | Clase muestra | Dejarlas manuales |
| D-123 | Administración con módulos apagados: ¿qué se sigue mostrando? | C | Varios | Dejarlo con avisos |
| D-124 | Registro de la clase muestra con Finanzas u Operación apagadas | C | Clase muestra | Seguir pidiéndolos |
| D-125 | Registro de cambios y accesos con módulos apagados | C | Varios | Dejarlo |
| D-126 | Qué enlaces se permiten en los textos del asistente | C | Varios | Rechazar enlaces |
| D-127 | Qué perdona la marca de demo al arrancar y qué pasa sin NODE_ENV | C | Varios | Cerrar más |
| D-128 | Una etapa propia del embudo antes de «Nuevo» | C | Varios | Siempre «Nuevo» |

---

## A. Bloquea salir con captación

### D-01 · Vía de atribución: A o C

**Grupo:** A · **Módulo:** Captación · **Esfuerzo:** S (horas)

**Pregunta:** ¿Los WhatsApp entran primero por Chatwoot (vía A) o los recibe primero nuestro sistema y él se los pasa a Chatwoot (vía C)?

**Contexto:** Hoy funciona la vía A: Twilio llama a nuestro sistema, que valida la firma, descarta repetidos y reenvía a Chatwoot; el asesor ve todo en Chatwoot. Todo se probó con un Twilio falso. El sandbox de WhatsApp no manda los datos de un anuncio (de qué campaña llegó la familia), así que eso solo se comprueba con un anuncio real. Detalle: `docs/DECISION-ATRIBUCION.md`.

**Opciones:**
- **A.** Vía A (la de hoy). Chatwoot recibe y manda; nuestro sistema vigila la entrada. El asesor lo ve todo. Si Twilio real no entrega los datos del anuncio con los nombres esperados, hay que pasar a la C.
- **B.** Vía C. Nuestro sistema recibe y manda todo y solo le copia la conversación a Chatwoot. La firma queda cerrada de punta a punta, pero el asesor deja de ver en Chatwoot lo que no pase por la API de Chatwoot, y el sistema se vuelve dueño del contrato con Twilio.

**Recomendación:** Vía A. Ya está construida y probada; la C solo se justifica si el primer anuncio real demuestra que los datos de la campaña no llegan.

**Si no se decide:** Se queda la vía A y se comprueba con el ensayo (sandbox) y con el primer anuncio real.

**Dónde se cambia:** Consola de Twilio (direcciones del webhook) y `docs/ENSAYO-WHATSAPP-REAL.md`. Pasar a la C: L (el sistema tendría que enviar y recibir todo).

**Ids origen:** ATR, CRED-2.4, CRED-2.5, CRED-2.8

- [ ] Decidido: ______

### D-02 · Avisos de entrega (entregado, leído) en AWS

**Grupo:** A · **Módulo:** Captación · **Esfuerzo:** M (un día o dos)

**Pregunta:** ¿Cómo llegan, en producción, los avisos de «entregado» y «leído» para que nadie pueda falsearlos?

**Contexto:** Chatwoot pone su propia dirección para recibir esos avisos y no valida la firma de Twilio. En V9 se construyó en nuestro sistema la ruta con firma (`POST /twilio/delivery_status`) y se probó con un Twilio falso; falta decidir cómo llega esa ruta al sistema en AWS. Hoy nada está en internet, así que el riesgo es teórico.

**Opciones:**
- **A.** Que el balanceador mande esa ruta del dominio de Chatwoot a nuestro sistema (o que Chatwoot apunte a un camino que pase por él). Los avisos pasan por la validación de firma.
- **B.** Vía C (ver D-01): nuestro sistema manda con su propia dirección de avisos.
- **C.** Aceptarlo y cerrar esas rutas de Chatwoot con la red. Quien alcance la red interna podría falsear un «fallido» (crea una tarea) o un «leído».

**Recomendación:** A. Es la opción construida y cierra el invariante 9 también para los estados.

**Si no se decide:** En AWS los avisos llegarían a Chatwoot sin firma. Sube a gravedad ALTA en cuanto algo quede expuesto a internet.

**Dónde se cambia:** `infra/alb.tf` (regla del balanceador) o la variable `FRONTEND_URL` de Chatwoot; requiere AWS. Esfuerzo M.

**Ids origen:** EA-02, CRED-2.6

- [ ] Decidido: ______

### D-03 · Números de WhatsApp y cuenta verificada

**Grupo:** A · **Módulo:** Captación · **Esfuerzo:** S (horas)

**Pregunta:** ¿La escuela quiere un número de WhatsApp por disciplina (o por sucursal) o uno solo para todas, y a nombre de quién se verifica ante Meta?

**Contexto:** Cada canal de WhatsApp pertenece a una disciplina (así sabe el asistente de qué disciplina hablar); hoy no se puede compartir un solo número entre disciplinas sin construir una pregunta nueva en el asistente. La verificación de la cuenta de WhatsApp Business en Meta es el trámite que más tarda. Los pasos: `docs/PENDIENTES-CREDENCIALES-REALES.md`, secciones 2.1 y 2.2.

**Opciones:**
- **A.** Un número por disciplina (3 números). Funciona hoy; la familia ve el nombre de la disciplina que le interesa.
- **B.** Un número por disciplina y sucursal (hasta 6). También funciona hoy; separa la bandeja de cada sucursal pero multiplica trámites y costo.
- **C.** Un solo número para toda la escuela. Hay que construir: un canal sin disciplina y una pregunta «¿cuál disciplina?» en el asistente (esfuerzo M a L).

**Recomendación:** A, y arrancar con el número de la disciplina de más demanda; las otras se suman cuando Meta las verifique, sin frenar la apertura.

**Si no se decide:** Sin número verificado no hay WhatsApp: la página de registro termina en «gracias» y el ensayo con el sandbox es lo único que se puede probar.

**Dónde se cambia:** Cuenta de Meta/Twilio (externo), luego Administración → Canales de WhatsApp. S para A y B.

**Ids origen:** CRED-2.1, CRED-2.2

- [ ] Decidido: ______

### D-04 · Plantilla de reenganche a aprobar en Meta

**Grupo:** A · **Módulo:** Captación · **Esfuerzo:** S (horas)

**Pregunta:** ¿Qué texto y con qué categoría se manda a aprobación en Meta para el mensaje que retoma una conversación que quedó a medias?

**Contexto:** Si alguien deja la conversación a medias, a las 25 horas (la ventana de 24 h ya se cerró) solo puede salir una plantilla aprobada, una sola vez. El texto de ejemplo («Hola, quedó pendiente tu consulta sobre …») está marcado «aprobada» solo para la demo; ninguna de las 13 plantillas del sistema lo está de verdad. Para el sistema es de marketing (se frena con persona atendiendo, con baja de marketing y por el tope de 1 por semana) aunque en el ejemplo está registrada como utilidad ante Meta.

**Opciones:**
- **A.** Registrarla como marketing. Es lo honesto para un texto que invita a retomar; Meta no la reclasifica y cuesta más por mensaje.
- **B.** Registrarla como utilidad. Más barata, pero Meta puede rechazarla o reclasificarla (cambia el costo, no el tope).

**Recomendación:** A. Evita un rechazo en la primera revisión y no cambia el tope.

**Si no se decide:** Sin plantilla aprobada el sistema no manda el reenganche y deja una tarea para que el asesor llame (invariante 5). Nada se pierde, pero se pierde el rescate automático.

**Dónde se cambia:** Twilio Content Templates (mismo código y variables en el mismo orden) y Administración → Plantillas de mensaje. S.

**Ids origen:** CRED-2.3, CRED-2.7, CRED-5.3

- [ ] Decidido: ______

### D-05 · Quién marca «aprobada» y mapa servicio/marketing

**Grupo:** A · **Módulo:** Captación · **Esfuerzo:** S (horas)

**Pregunta:** ¿Quién marca una plantilla como aprobada en el sistema —el administrador a mano o una sincronización con Twilio— y estás de acuerdo con qué mensajes son de servicio y cuáles de marketing?

**Contexto:** Hoy el administrador fija el estado a mano en Administración → Plantillas de mensaje; un error de dedo debilita la regla «plantilla aprobada o nada» hasta que exista la sincronización (requiere cuenta real de Twilio). El mapa vigente: 9 plantillas de servicio (recordatorio y cambios de la clase muestra, tres avisos al maestro, bienvenida, dos recordatorios de pago) salen aunque una persona atienda; 4 de marketing (reenganche, recuperación de quien no llegó, lead frío, promoción por vencer) no.

**Opciones:**
- **A.** A mano al inicio, marcando «aprobada» solo cuando la consola de Twilio la muestre aprobada; construir la sincronización después del primer mes real.
- **B.** Construir ya la sincronización con Twilio (trae el estado y el identificador de cada plantilla). Requiere credenciales reales para probarla.
- **C.** Cambiar el mapa de algún mensaje (por ejemplo, tratar la recuperación de quien no llegó como servicio). Cambia quién puede escribirle a una familia con atención humana.

**Recomendación:** A para el arranque, y dejar el mapa como está: es el conservador (ante la duda, marketing).

**Si no se decide:** Se queda a mano y el mapa como está.

**Dónde se cambia:** Administración → Plantillas de mensaje (estado y clase); la sincronización sería código nuevo en `src/mensajeria/` (M a L).

**Ids origen:** EK-01 (confirmación), estado_aprobacion

- [ ] Decidido: ______

### D-06 · Escuela nueva con sus automatizaciones

**Grupo:** A · **Módulo:** Captación · **Esfuerzo:** M (un día o dos)

**Pregunta:** ¿Una escuela nueva debe nacer con sus reenganches y recordatorios ya creados (apagados) o los sigue creando una persona técnica en cada alta?

**Contexto:** La plantilla de organización solo trae las siete etapas y la configuración con la captación encendida: no trae plantillas ni automatizaciones, y no hay forma de crear una automatización desde pantalla (solo editar, encender y apagar). Sin la automatización del reenganche no sale el mensaje de las 25 h aunque la plantilla esté aprobada.

**Opciones:**
- **A.** Sembrarlas en la plantilla de organización, apagadas y con textos de ejemplo; el administrador las enciende cuando sus plantillas estén aprobadas.
- **B.** Agregar `POST /api/automatizaciones` y una pantalla para crearlas. Más flexible, más código y más pruebas.
- **C.** Dejarlo como paso técnico de Grupo CCB en cada alta (hoy).

**Recomendación:** A. La escuela sale completa de fábrica y el administrador solo enciende; B queda para cuando haya un evento nuevo.

**Si no se decide:** Cada alta depende de que alguien técnico corra los seeds adaptados; si se olvida, la escuela abre sin reenganche y sin que nada lo avise.

**Dónde se cambia:** `prisma/seed/plantilla-organizacion.sql` y `docs/ALTA-DE-CLIENTE.md`. Esfuerzo M.

**Ids origen:** EK-12, EK-I02, V1-1, V2-4

- [ ] Decidido: ______

### D-07 · Tono de los 31 textos del asistente

**Grupo:** A · **Módulo:** Captación · **Esfuerzo:** S (horas)

**Pregunta:** ¿Quién revisa el tono de los 31 mensajes del asistente de WhatsApp y los pasa a las palabras de la escuela antes de abrir?

**Contexto:** Los textos son genéricos. La escuela los cambia sin tocar código en Administración → Textos del asistente (con vista previa y «volver al texto de siempre»); no aceptan enlaces ni más de 600 caracteres. Quedan fijos en el programa la redacción de la cotización, los cierres con piezas condicionales y la confirmación de baja.

**Opciones:**
- **A.** Abrir con los textos de siempre y ajustarlos con lo que se vea en la primera semana.
- **B.** Que la escuela los revise antes de abrir (1 a 2 horas con CCB) y se guarden los suyos.
- **C.** Además, pasar a pantalla los textos que hoy están en el programa (cotización y baja).

**Recomendación:** B. El asistente es la primera cara de la escuela; C solo si un texto fijo choca.

**Si no se decide:** Salen los genéricos.

**Dónde se cambia:** Administración → Textos del asistente. S (B) o M (C).

**Ids origen:** SUP-BOT

- [ ] Decidido: ______

### D-08 · Palabras propias en la página de registro

**Grupo:** A · **Módulo:** Captación · **Esfuerzo:** S (horas)

**Pregunta:** ¿La página de registro (el formulario que abre el QR o el anuncio) debe llevar las palabras de la escuela?

**Contexto:** El texto del cuestionario y el mensaje de WhatsApp que se llena solo son genéricos y viven en el programa (`src/captacion/landing.ts`, `src/http/landing-html.ts`); el nombre, el color, las sucursales y el aviso de privacidad sí salen de las tablas. Es lo más visible para las familias.

**Opciones:**
- **A.** Dejar el genérico.
- **B.** Que Grupo CCB cambie las frases a las de la escuela (código, una vez por cliente).
- **C.** Pasar esos textos a pantalla, como los del asistente.

**Recomendación:** B para el primer cliente; C si llega un segundo.

**Si no se decide:** Sale el texto genérico.

**Dónde se cambia:** `src/captacion/landing.ts` y `src/http/landing-html.ts` (B: S); pantalla nueva (C: M).

**Ids origen:** V5-1, SUP-LANDING

- [ ] Decidido: ______

### D-09 · Qué pasa al enviar el formulario

**Grupo:** A · **Módulo:** Captación · **Esfuerzo:** M (un día o dos)

**Pregunta:** Al enviar el formulario, ¿la persona salta directo a WhatsApp o pasa por una página con el botón «Abrir WhatsApp», y se le pide algo más que el nombre y el teléfono?

**Contexto:** Hoy es un salto directo (redirección 303) y el botón dice «Enviar y continuar a WhatsApp»; si el salto falla (WhatsApp no instalado, navegador dentro de Instagram o Facebook) la persona queda en una página sin formulario. El nombre es opcional y no se pide correo. Probado solo en Chrome sin ventana: faltan Safari, Firefox y celulares (`docs/PENDIENTES-CREDENCIALES-REALES.md`, 4.2).

**Opciones:**
- **A.** Dejar el salto directo.
- **B.** Una página intermedia de «gracias» con el botón «Abrir WhatsApp» (funciona mejor dentro de otras aplicaciones y deja un camino si falla el salto).
- **C.** B, y además pedir el nombre del tutor o el correo como obligatorios (más datos, menos registros).

**Recomendación:** B, sin pedir más datos obligatorios: lo que falte se pregunta en WhatsApp.

**Si no se decide:** Salto directo y datos como hoy.

**Dónde se cambia:** `src/http/landing.ts` y `src/http/landing-html.ts`. Esfuerzo S a M.

**Ids origen:** EE-01, E1-datos

- [ ] Decidido: ______

### D-10 · Aviso de privacidad y textos legales definitivos

**Grupo:** A · **Módulo:** Captación · **Esfuerzo:** S (horas)

**Pregunta:** ¿Quién redacta el aviso de privacidad definitivo y quién (el abogado de la escuela) lo revisa antes de abrir?

**Contexto:** Sin un aviso de privacidad vigente la página de registro no abre: responde como si no existiera y no recoge datos (verificado en `src/http/landing.ts`). El texto de la demo es de ejemplo. El asistente de WhatsApp no lo menciona hoy. Se publica como una versión nueva por la API de documentos legales (no hay pantalla; los textos publicados no se editan). Reglamento y uso de imagen: ver D-47.

**Opciones:**
- **A.** La escuela entrega el texto de su abogado.
- **B.** Grupo CCB propone un borrador y la escuela lo valida con su abogado.

**Recomendación:** B: ahorra tiempo y el abogado revisa algo concreto.

**Si no se decide:** La página de registro queda cerrada; el asistente de WhatsApp sigue funcionando.

**Dónde se cambia:** `POST /api/documentos-legales` (administrador) por tipo y disciplina; publicar versión 1. Esfuerzo S.

**Ids origen:** SUP-AVISO, CRED-5.2

- [ ] Decidido: ______

### D-11 · Dónde queda el consentimiento

**Grupo:** A · **Módulo:** Captación · **Esfuerzo:** M (un día o dos)

**Pregunta:** ¿El consentimiento para escribirle a la familia se registra al enviar el formulario o hasta que el número escribe por WhatsApp, y el asistente debe mandar el aviso?

**Contexto:** El formulario guarda el aviso que aceptó como evidencia (con IP y navegador), pero eso nunca levanta una baja ni cuenta como alta, y nadie lee ese consentimiento todavía; el formulario tampoco prueba que quien lo llena sea el dueño del teléfono. Por WhatsApp no se pide ninguna aceptación. Los textos editables del asistente no admiten enlaces.

**Opciones:**
- **A.** Dejarlo como está (evidencia en el formulario; WhatsApp sin aceptación).
- **B.** Que el primer mensaje del asistente mande el enlace del aviso (programa, no texto editable).
- **C.** Registrar el consentimiento cuando el número escriba por primera vez, y solo entonces tratar como alta.

**Recomendación:** Preguntarle al abogado de la escuela al revisar el aviso; mientras tanto A, con B listo para activarse.

**Si no se decide:** Se queda la opción A, que es lo que hace el sistema hoy.

**Dónde se cambia:** `src/captacion/entrante.ts` (B o C: M). Cambia una regla legal: que la decida el abogado.

**Ids origen:** EE-06

- [ ] Decidido: ______

### D-12 · Palabras de baja y baja con una persona atendiendo

**Grupo:** A · **Módulo:** Captación · **Esfuerzo:** S (horas)

**Pregunta:** ¿Qué palabras dan de baja a una familia, hace falta una palabra de alta, y debe salir la confirmación de baja si una persona está atendiendo?

**Contexto:** Hoy dan de baja BAJA, STOP, CANCELAR y NO MOLESTAR. Si alguien dado de baja vuelve a escribir, el asistente calla y se crea una tarea para el asesor (decisión ya tomada); reactivar a la familia es manual en la base. Si pide la baja mientras lo atiende una persona, el sistema registra la baja pero no manda la confirmación: crea una tarea para que la persona la confirme.

**Opciones:**
- **A.** Dejarlo así (cuatro palabras, sin palabra de alta, confirma una persona).
- **B.** Sumar ALTO, PARAR y DETENER, y tratar la confirmación de baja como aviso de servicio (sale siempre).
- **C.** B, y una palabra de alta (por ejemplo ALTA) que reactive sin pasar por la base.

**Recomendación:** B. Atender una baja pronto es obligación de cumplimiento; la palabra de alta no hace falta, el asesor reactiva a quien lo pida.

**Si no se decide:** Se queda la opción A, que es lo que hace el sistema hoy.

**Dónde se cambia:** Constante `PALABRAS_DE_BAJA` en `src/captacion/maquina.ts` y regla de clase de mensaje en `MessagingProvider`; no tiene pantalla a propósito. Esfuerzo S.

**Ids origen:** fase-1 §5 (3), EG-13

- [ ] Decidido: ______

### D-13 · Qué cuenta como «un asesor atiende»

**Grupo:** A · **Módulo:** Captación · **Esfuerzo:** S (horas)

**Pregunta:** ¿Cuándo debe callar el asistente porque una persona ya atiende la conversación?

**Contexto:** Hoy calla cuando un asesor se la asigna («Tomar el control»), escribe un mensaje o escribe una nota privada. Abrirla en pantalla no cuenta: si la familia escribe justo entonces, el asistente puede contestar. Al «Resolver» la conversación en Chatwoot se cierra; si la familia vuelve a escribir, Chatwoot abre una conversación nueva y el asistente empieza de cero (comprobado en V8).

**Opciones:**
- **A.** Dejarlo como está.
- **B.** Que abrir la conversación en pantalla también pare al asistente (Chatwoot no avisa quién la está mirando; habría que inventar una señal).

**Recomendación:** A y enseñar «Tomar el control» (la guía del asesor ya lo explica).

**Si no se decide:** Se queda la opción A, que es lo que hace el sistema hoy.

**Dónde se cambia:** `src/mensajeria/chatwoot/webhook.ts`. B sería L y poco fiable.

**Ids origen:** F1 §5.1

- [ ] Decidido: ______

### D-14 · Tiempos del lead a medias

**Grupo:** A · **Módulo:** Captación · **Esfuerzo:** S (horas)

**Pregunta:** ¿Estás de acuerdo con avisar a los asesores a los 30 minutos de silencio, un solo reenganche a las 25 horas y pasar a una persona tras 3 respuestas que no entiende?

**Contexto:** Es lo que decidió el plan de la noche 2 (30 minutos). La escuela cambia los minutos y las respuestas sin entender en Administración → Configuración; el desfase del reenganche, en Automatizaciones. Con un solo intento permitido, quien responde después del reenganche y vuelve a callar nunca recibe otro.

**Opciones:**
- **A.** Dejarlo como está.
- **B.** Permitir una segunda ocurrencia del reenganche contada desde el último mensaje de la familia (sube de 1 a 2 intentos, y el tope de 1 mensaje de marketing por semana la frena igual).

**Recomendación:** A. Ajustar con datos reales de la primera semana.

**Si no se decide:** Se queda la opción A, que es lo que hace el sistema hoy.

**Dónde se cambia:** Administración → Configuración y → Automatizaciones. S.

**Ids origen:** SUP-LEAD-MEDIAS, fase-1 §5 (5)

- [ ] Decidido: ______

### D-15 · Topes y horario de los mensajes automáticos

**Grupo:** A · **Módulo:** Captación · **Esfuerzo:** S (horas)

**Pregunta:** ¿Confirmas 3 mensajes automáticos al día por teléfono, 1 de marketing por semana, horario de 9:00 a 20:00 y envíos de lunes a sábado?

**Contexto:** Los topes vienen del contexto (3 por día en ventana móvil de 24 h; 1 de marketing cada 7 días) y se cambian en Administración → Configuración; la escuela puede estrechar el horario pero nunca salir de 9:00 a 20:00 (invariante 14). Como el reenganche, la recuperación, el lead frío y la promoción por vencer comparten el tope de marketing, mandan un solo mensaje por semana. Los envíos de cobranza, bienvenida, reenganche y lead frío salen de lunes a sábado; los recordatorios de clase, todos los días (el domingo por defecto de los insumos no es una regla de `CLAUDE.md`).

**Opciones:**
- **A.** Dejarlos como están.
- **B.** Subir el tope de marketing a 2 por semana para permitir un segundo intento de rescate.
- **C.** Permitir envíos en domingo (hay un grupo en domingo; su recordatorio de 2 h se recorre al lunes y llegaría después de la clase).

**Recomendación:** A para abrir; revisar C con la escuela porque afecta a quien tiene clase en domingo.

**Si no se decide:** Se queda la opción A, que es lo que hace el sistema hoy.

**Dónde se cambia:** Administración → Configuración (topes y horario) y → Automatizaciones (días). S.

**Ids origen:** SUP-TOPES, C7

- [ ] Decidido: ______

### D-16 · Datos básicos de la escuela para abrir

**Grupo:** A · **Módulo:** Captación · **Esfuerzo:** S (horas)

**Pregunta:** ¿Cuándo y cómo entrega la escuela los datos básicos para abrir captación (nombre, disciplinas, colores, sucursales con zona horaria y dirección, asesores y administrador)?

**Contexto:** La lista, con para qué sirve cada dato y qué pasa si falta, es `docs/QUE-PEDIRLE-A-LA-ESCUELA.md`, sección 1 (lista para mandarse); las hojas de Excel están en `docs/plantillas-catalogo/` y se cargan en Administración → Cargar catálogo. Hoy las direcciones de las sucursales están vacías, los colores de marca son de ejemplo (rojo, morado y naranja) y los usuarios de la demo tienen contraseñas públicas. La lista completa de valores de ejemplo está en `docs/SUPUESTOS-Y-DECISIONES.md`.

**Opciones:**
- **A.** La escuela llena las hojas por su cuenta y las manda (revisión por fila y columna en menos de un día hábil).
- **B.** Una sesión de una hora de Grupo CCB con la escuela que llena las hojas en vivo.

**Recomendación:** B para la primera escuela: se resuelven dudas en el momento y se cargan los datos el mismo día.

**Si no se decide:** No se puede abrir: sin disciplinas y sucursales el asistente no sabe de qué hablar; sin zona horaria no se garantiza el horario de envío.

**Dónde se cambia:** Administración → Cargar catálogo (simulación primero, luego aplicar). S.

**Ids origen:** SUPUESTOS, SUP-DIRECCIONES, SUP-COLORES, QPE-1, CRED-5.1, CRED-5.4

- [ ] Decidido: ______

### D-17 · Accesos del primer día: contraseñas y permisos

**Grupo:** A · **Módulo:** Captación · **Esfuerzo:** M (un día o dos)

**Pregunta:** ¿Se obliga a cada persona a cambiar su contraseña en el primer ingreso, y la matriz de permisos por rol está bien para el primer día?

**Contexto:** Hoy no se obliga: el administrador fija la contraseña inicial y entrega «en persona»; cada quien puede cambiarla en «Mi cuenta». Ya hay lista de contraseñas comunes, mínimo de 10 caracteres, bloqueo tras 5 intentos en 15 minutos, sesión de 12 horas con 120 minutos de inactividad y el arranque de producción rechaza las contraseñas de la demo. Matriz: recepción no ve tareas ni conversaciones; el asesor no escribe el catálogo; el maestro ve lo operativo del alumno sin importes (`src/api/permisos.ts`).

**Opciones:**
- **A.** Dejarlo así con un primer ingreso supervisado por Grupo CCB.
- **B.** Construir el cambio obligatorio en el primer ingreso (la persona nunca usa la contraseña que le dieron).

**Recomendación:** B antes de abrir con personas reales; la matriz, como está.

**Si no se decide:** Las contraseñas iniciales que escribió el administrador siguen siendo válidas hasta que cada quien las cambie por su voluntad.

**Dónde se cambia:** Ingreso y «Mi cuenta» (`web/src/` y `POST /api/yo/contrasena`); crear personas: `scripts/crear-usuario.ts`. Esfuerzo M.

**Ids origen:** EB-20, K3-EB20, CRED-5.5, SUP-ACCESO, SUP-PERMISOS

- [ ] Decidido: ______

### D-18 · Nombres de las etapas y motivos de pérdida

**Grupo:** A · **Módulo:** Captación · **Esfuerzo:** S (horas)

**Pregunta:** ¿Las siete etapas del embudo y los seis motivos de pérdida se llaman como los usa la escuela?

**Contexto:** Las etapas son Nuevo, Contactado, Clase muestra agendada, Clase muestra asistida, Negociación, Inscrito y Perdido; los días sin movimiento que avisan son 2, 3, 3, 3 y 5. Los nombres vienen del insumo (sugeridos) y los motivos de pérdida son de ejemplo. Se editan en Administración → Etapas del embudo y → Motivos; las de sistema se renombran pero no se quitan.

**Opciones:**
- **A.** Abrir con estos nombres.
- **B.** Renombrarlos con la escuela en la sesión de datos básicos.

**Recomendación:** B, de paso: cuesta 10 minutos y evita explicar nombres ajenos.

**Si no se decide:** Salen con estos nombres.

**Dónde se cambia:** Administración → Etapas del embudo y → Motivos. S.

**Ids origen:** SUP-ETAPAS

- [ ] Decidido: ______

### D-19 · Familias «inscritas a mano»: cómo regularizarlas

**Grupo:** A · **Módulo:** Captación · **Esfuerzo:** S (horas)

**Pregunta:** Cuando la escuela encienda la inscripción, ¿cómo se regulariza a las familias que se marcaron «inscrito a mano» durante la captación?

**Contexto:** Ya decidiste (V10b): con la inscripción apagada el asesor o el administrador marca «Inscrito» a mano, con nota de al menos 10 caracteres y quedando quién lo hizo. Un inscrito a mano NO genera alumno, inscripción ni cobros: no cuenta en «alumnos activos» ni en el ingreso del tablero ejecutivo (sí cuenta en el reporte de leads y en el costo por alumno de la campaña, aparte). Al encender la inscripción y inscribir a la familia de verdad, el sistema lo permite sin choque y deja de contarla «a mano».

**Opciones:**
- **A.** Inscribir a cada familia desde su ficha cuando se encienda el módulo (el sistema lo permite hoy).
- **B.** Construir una carga masiva de alumnos existentes con su fecha real de inicio (ver D-50).
- **C.** No regularizar: se quedan solo como cifra de captación.

**Recomendación:** A, y B junto con la carga de alumnos que ya venían: son el mismo problema.

**Si no se decide:** Esas familias no tendrán alumno ni cargos hasta que alguien las inscriba.

**Dónde se cambia:** Ficha del lead → «Convertir e inscribir» (A: S por familia). B: L.

**Ids origen:** V10b-regularizar

- [ ] Decidido: ______

### D-20 · Dato de soporte: a quién avisar

**Grupo:** A · **Módulo:** Captación · **Esfuerzo:** S (horas)

**Pregunta:** ¿A quién (nombre, teléfono o correo y horario) debe avisar la escuela cuando algo falla?

**Contexto:** Las cuatro guías por rol (`docs/guias/`, con PDF listos para mandar) dicen en «A quién avisar» «tu contacto de Grupo CCB», sin nombre. Falta el dato real antes de entregarlas.

**Opciones:**
- **A.** Una persona de Grupo CCB con teléfono y correo.
- **B.** Un correo o línea de soporte general del producto.

**Recomendación:** A para el primer cliente; B cuando haya varios.

**Si no se decide:** Las guías se entregan con el texto genérico y la escuela no sabe a quién llamar.

**Dónde se cambia:** `docs/guias/*.md` y regenerar los PDF con `npm run guias:capturas`; después `npm run guias:validar`. S.

**Ids origen:** V8-4

- [ ] Decidido: ______

### D-21 · Cuenta de AWS, dominio y primer despliegue

**Grupo:** A · **Módulo:** Captación · **Esfuerzo:** M (un día o dos)

**Pregunta:** ¿Quién pone la cuenta de AWS, el dominio con su certificado y cuándo se hace el primer despliegue real?

**Contexto:** Todo está escrito en Terraform y validado, pero nunca se ha corrido un `plan` real: se revisó el texto, no los permisos, cuotas ni nombres únicos de una cuenta verdadera. En producción la aplicación solo acepta el origen configurado en `ORIGEN_PUBLICO` (https) y no arranca con valores de la demo. Pasos: `docs/PENDIENTES-CREDENCIALES-REALES.md`, sección 1 y `docs/INFRA-AWS.md`; aquí no se repiten.

**Opciones:**
- **A.** Una cuenta de AWS por cliente, a nombre de Grupo CCB al inicio (transferible), con el dominio de la escuela (`app.` y `bandeja.`).
- **B.** La cuenta y el dominio a nombre de la escuela desde el inicio, con Grupo CCB como administrador.
- **C.** Una cuenta compartida de CCB para todos los clientes (barata, pero mezcla datos de menores y costos).

**Recomendación:** A. Aísla los datos de menores y los costos por cliente y arranca más rápido; se puede transferir.

**Si no se decide:** No hay producción: todo sigue en la demo local y el ensayo con el sandbox.

**Dónde se cambia:** Fuera del producto: AWS, DNS y `infra/` (variables). El `plan` real revisado línea por línea es el primer paso. Esfuerzo M.

**Ids origen:** CRED-1.1, CRED-1.2, CRED-1.3, CRED-1.4, CRED-1.5

- [ ] Decidido: ______

### D-22 · Tamaño y región de AWS

**Grupo:** A · **Módulo:** Captación · **Esfuerzo:** S (horas)

**Pregunta:** ¿Qué configuración de AWS se contrata y en qué región viven los datos de los menores?

**Contexto:** Costo aproximado (`[SUPUESTO]`): unos 200 USD al mes en staging y 370 en producción con varias zonas, una NAT por zona y firewall web; hay una versión reducida con una sola NAT (tabla en `docs/INFRA-AWS.md`). La región por omisión es `us-east-2` (costo); `mx-central-1` si la escuela exige que los datos se queden en México.

**Opciones:**
- **A.** Producción con varias zonas y firewall; una sola NAT al inicio si hay que ahorrar.
- **B.** Versión reducida (una zona): más barata, pero una falla de zona tira el sistema.
- **C.** Región de México (`mx-central-1`) si el abogado o la escuela lo piden.

**Recomendación:** A en `us-east-2`, y confirmar con el abogado si el aviso de privacidad debe decir que los datos viven en el extranjero.

**Si no se decide:** Los ejemplos de variables quedan con valores de staging.

**Dónde se cambia:** Variables de `infra/` (ejemplos de entorno). S.

**Ids origen:** K6-COSTO, K6-REGION

- [ ] Decidido: ______

### D-23 · Chatwoot en AWS: réplicas, acceso y caída

**Grupo:** A · **Módulo:** Captación · **Esfuerzo:** M (un día o dos)

**Pregunta:** ¿Se acepta que Chatwoot corra en una sola tarea, que su acceso se limite a las redes de la escuela y que el sistema siga recibiendo mensajes aunque Chatwoot esté caído?

**Contexto:** Una sola tarea implica que la bandeja se cae unos minutos al desplegar (Chatwoot 4 no está pensado para varias réplicas sin revisar sesiones y adjuntos). Hoy está abierto a internet con su login. Con Chatwoot caído, el backend queda «degradado»: sigue recibiendo los webhooks de Twilio y la interfaz; el asistente y los avisos reintentan. Crear la cuenta, el Agent Bot, las bandejas y los agentes: `docs/PENDIENTES-CREDENCIALES-REALES.md`, sección 3.

**Opciones:**
- **A.** Una tarea, acceso restringido a las redes de la escuela y seguir recibiendo con Chatwoot caído (lo recomendado en K6/K4).
- **B.** Acceso abierto a internet con login (los asesores podrán entrar desde cualquier lugar, p. ej. su casa).
- **C.** Que el backend salga del balanceador si Chatwoot cae (pierde la recepción de mensajes).

**Recomendación:** A si los asesores trabajan en las oficinas; si trabajan desde casa, B con autenticación fuerte.

**Si no se decide:** Quedan los valores de K6: una tarea, abierto con login, backend degradado.

**Dónde se cambia:** `infra/` (`cidrs_administracion`, tareas) y la variable `exigirChatwoot`. S a M.

**Ids origen:** K6-CHATWOOT, K6-ADMIN, K4-SALUD, CRED-3.1, CRED-3.3, CRED-3.4

- [ ] Decidido: ______

### D-24 · Asignación automática de Chatwoot

**Grupo:** A · **Módulo:** Captación · **Esfuerzo:** M (un día o dos)

**Pregunta:** ¿El sistema debe comprobar al arrancar que ninguna bandeja de Chatwoot tenga la asignación automática encendida —y avisar o apagarla—, o basta con apagarla a mano?

**Contexto:** Una asignación automática contaría como «una persona tomó la conversación» y callaría al asistente en cada mensaje nuevo. El ensayo (`ensayo:preparar`) y el script de la demo la apagan en las bandejas que crean; una bandeja de producción creada a mano la trae encendida y hoy nadie lo verifica.

**Opciones:**
- **A.** Apagarla a mano y dejarlo en la lista de verificación del alta.
- **B.** Verificar al arrancar y avisar (log de error y tarea para el administrador).
- **C.** Verificar y apagarla sola.

**Recomendación:** B. Apagarla sola cambia la configuración de otro sistema sin que nadie lo vea; avisar es seguro. Probarlo exige un Chatwoot real.

**Si no se decide:** Queda A: depende de que quien cree la bandeja lo recuerde.

**Dónde se cambia:** `src/mensajeria/` (directorio de agentes) y `docs/ALTA-DE-CLIENTE.md`. Esfuerzo M, con Chatwoot real.

**Ids origen:** EA-22, CRED-3.2

- [ ] Decidido: ______

### D-25 · Respaldos: cuánto dato se puede perder

**Grupo:** A · **Módulo:** Captación · **Esfuerzo:** M (un día o dos)

**Pregunta:** ¿Cuántos datos y cuánto tiempo sin sistema son aceptables, y se construye el respaldo lógico nocturno a S3 o basta con el de la base de datos de AWS?

**Contexto:** Supuesto escrito en `docs/RESPALDO.md`: pérdida de minutos con la restauración a un punto en el tiempo de la base de AWS, hasta 24 h con un respaldo lógico nocturno, y recuperación en 30 a 60 minutos (se mide en el primer ensayo). Hoy `npm run respaldo` es manual: la tarea programada con `pg_dump`, el permiso de escritura solo al bucket de respaldos y la alarma si no corre NO existen todavía (la documentación lo decía y se corrigió en K9).

**Opciones:**
- **A.** Solo el respaldo de la base de AWS (pérdida de minutos; sin copia fuera de la base).
- **B.** Construir también el respaldo lógico cifrado cada noche a S3 con alarma.

**Recomendación:** B. Cuesta poco y es la única copia que protege contra un error humano en la base o un borrado de la instancia.

**Si no se decide:** Queda A y la documentación honesta.

**Dónde se cambia:** `infra/` (tarea programada, permisos, alarma), `docs/RESPALDO.md`. Requiere AWS. Esfuerzo M.

**Ids origen:** K5-RPO, EK-08, CRED-4.9

- [ ] Decidido: ______

### D-26 · Ensayo con el sandbox de WhatsApp antes de todo

**Grupo:** A · **Módulo:** Captación · **Esfuerzo:** S (horas)

**Pregunta:** ¿Corres el ensayo con el sandbox de WhatsApp de Twilio antes de pedir a la escuela números y plantillas?

**Contexto:** Son unos 15 minutos la primera vez, en tu Mac y con tu celular, sin AWS ni dominio: llega el mensaje, contesta el asistente, el asesor responde desde Chatwoot, se guardan los estados de entrega, `+521` y `+52` dan un solo lead y BAJA funciona. No prueba plantillas ni los datos de un anuncio. Pasos y casillas: `docs/ENSAYO-WHATSAPP-REAL.md`; qué cubre: `docs/PENDIENTES-CREDENCIALES-REALES.md`, sección 0. No se repiten aquí.

**Opciones:**
- **A.** Correrlo antes de pedirle nada a la escuela.
- **B.** Saltarlo y probar directo con el número definitivo.

**Recomendación:** A. Detecta problemas de firma, dirección pública y Chatwoot con costo cero.

**Si no se decide:** Los problemas aparecen con el número definitivo y la escuela mirando. Hoy esto no se ha corrido contra Twilio ni Chatwoot reales: lo comprueba Eduardo.

**Dónde se cambia:** `npm run ensayo:preparar`, `ensayo:diagnostico` y `ensayo:entrante` (ya existen). S.

**Ids origen:** CRED-0, V8-5, V9-1, V9-2, V9-3

- [ ] Decidido: ______

### D-27 · Pruebas en teléfonos y navegadores reales

**Grupo:** A · **Módulo:** Captación · **Esfuerzo:** S (horas)

**Pregunta:** ¿Quién prueba, antes del primer día, con teléfonos de las tres compañías, un iPhone y un Android, y un QR impreso?

**Contexto:** La landing se probó solo en Chrome sin ventana; el QR, solo con un lector de software; `+521`/`+52` se colapsan con `normalizarTelefono` pero nunca contra números reales de Telcel, AT&T y Movistar; la interfaz del maestro y de recepción, solo con pantallas simuladas. Lista en `docs/PENDIENTES-CREDENCIALES-REALES.md`, sección 4 (puntos 4.1 a 4.4).

**Opciones:**
- **A.** Prueba de aceptación de una tarde con dos asesores y los dispositivos reales, antes de abrir.
- **B.** Abrir y corregir sobre la marcha.

**Recomendación:** A.

**Si no se decide:** Los fallos de dispositivo (por ejemplo el salto a WhatsApp desde Instagram) los descubren las familias.

**Dónde se cambia:** Fuera del producto (una tarde de Grupo CCB y la escuela). S.

**Ids origen:** CRED-4.1, CRED-4.2, CRED-4.3, CRED-4.4, E1, E3

- [ ] Decidido: ______

### D-28 · Pruebas de producción: carga, restauración y seguridad externa

**Grupo:** A · **Módulo:** Captación · **Esfuerzo:** L (varios días)

**Pregunta:** ¿Se contrata una revisión de seguridad externa y se ensayan la carga, la restauración y la rotación de la clave antes de abrir con datos reales?

**Contexto:** Todo se probó en una sola máquina con servicios simulados: la ráfaga más grande fue de 200 peticiones; nunca se ha medido la restauración con la base real ni corrido una prueba de penetración. Las 4 vulnerabilidades altas de la CLI de Prisma quedan fuera de producción. Los límites de tamaño de cuerpo y el firewall los pone el balanceador (`infra/alb.tf`). Lista: `docs/PENDIENTES-CREDENCIALES-REALES.md`, sección 4 (4.5 a 4.8, 4.10).

**Opciones:**
- **A.** Hacer todo antes de abrir (revisión externa, ensayo de restauración con tiempo medido, rotación de la clave, TLS verificado hacia la base).
- **B.** Abrir con captación sola (pocos datos, sin salud) y hacerlo antes de encender clase muestra.

**Recomendación:** B, con la condición de que lo anterior esté hecho antes del primer dato de salud de un menor.

**Si no se decide:** Se abre sin haber medido la recuperación ni revisado desde fuera.

**Dónde se cambia:** Fuera del producto; informes de `docs/OBSERVABILIDAD.md` y `docs/RESPALDO.md`. Esfuerzo M a L.

**Ids origen:** CRED-4.5, CRED-4.6, CRED-4.7, CRED-4.8, CRED-4.10, A7, B5, D2, K3 (pruebas externas), K4, K6, K2, EB-18, EC-26

- [ ] Decidido: ______

---

## B. Bloquea un módulo posterior

### Módulo: Cotizador

#### D-29 · Precios reales de los 14 programas

**Grupo:** B · **Módulo:** Cotizador · **Esfuerzo:** S (horas)

**Pregunta:** ¿Cuáles son la inscripción y la mensualidad reales de cada programa, y desde qué fecha rigen?

**Contexto:** Los precios de hoy son de ejemplo: inscripción y mensualidad de los 14 programas, iguales en las dos sucursales, vigentes desde 2026-01-01 (por ejemplo Karate 3 a 5 años: 600 y 750; Ballet 14+: 700 y 1,000; Salsa y Cumbia: 500 y 700). Sin precio vigente el cotizador dice «sin precio» y no se inscribe. Se cargan con la hoja `precios.csv` (Administración → Cargar catálogo) o en Administración → Precios; un precio nuevo cierra el anterior el día previo y no cambia lo ya cobrado. Qué pedir: `docs/QUE-PEDIRLE-A-LA-ESCUELA.md`, sección 2.

**Opciones:**
- **A.** La escuela da una lista por programa (y sucursal si difieren) y la carga Grupo CCB con la simulación.
- **B.** Dejar los de ejemplo mientras el cotizador siga apagado (no afectan a nadie apagado).

**Recomendación:** A antes de encender el cotizador: el asistente le dice el precio a las familias sin que un asesor lo revise.

**Si no se decide:** El cotizador no debe encenderse con clientes reales: diría precios inventados.

**Dónde se cambia:** Hoja `precios.csv` o Administración → Precios. S.

**Ids origen:** SUP-PRECIOS

- [ ] Decidido: ______

#### D-30 · Promociones reales y cuáles son «no acumulables»

**Grupo:** B · **Módulo:** Cotizador · **Esfuerzo:** S (horas)

**Pregunta:** ¿Qué promociones reales tiene la escuela hoy, con sus fechas y cupos, y cuáles de ellas no se pueden combinar con otras?

**Contexto:** Las tres de la demo son de ejemplo, vigentes hasta 2027-12-31 y acumulables: inscripción gratis, uniforme gratis al pagar la primera mensualidad y 10 % en la mensualidad desde el segundo hermano. Decisión tuya ya tomada (V2): una promoción no acumulable no se combina con ninguna otra; compite sola contra el grupo de acumulables por prioridad, luego mayor beneficio al cliente y luego menor id. Hay que revisar cuáles promociones reales estarían marcadas «no acumulable»: cada una aplicaría sola.

**Opciones:**
- **A.** La escuela entrega sus promociones y quién puede combinarse con quién; CCB las da de alta en Administración → Promociones.
- **B.** Arrancar sin promociones (se cotiza a precio de lista) y agregarlas después.

**Recomendación:** A. Una promoción mal marcada cobra de menos o de más a todos.

**Si no se decide:** Se cotiza con las promociones de ejemplo (si estuvieran vigentes y alcanzaran a la familia) o sin ellas.

**Dónde se cambia:** Administración → Promociones. S.

**Ids origen:** SUP-PROMOCIONES, V2-3

- [ ] Decidido: ______

#### D-31 · Cupo real de los 18 grupos

**Grupo:** B · **Módulo:** Cotizador · **Esfuerzo:** S (horas)

**Pregunta:** ¿Cuál es el cupo real de cada uno de los 18 grupos?

**Contexto:** Los cupos de Karate (12, 18 y 20) vienen del insumo sin confirmar; los de Ballet (3 a 5 años: 12; 6 a 13 y 14+: 15), Salsa y Cumbia (24) y Twerk (20) son de ejemplo. Capacidad total de ejemplo: 184 en Águilas y 116 en Centenario. De ellos salen «quedan N lugares», la lista de espera y el bloqueo de una inscripción de más (en la base).

**Opciones:**
- **A.** La escuela confirma cada cupo en la hoja `grupos.csv`.
- **B.** Usar los de ejemplo para la demo y confirmarlos al encender el cotizador.

**Recomendación:** A junto con los precios: se piden en la misma hoja.

**Si no se decide:** El asistente ofrecería lugares que quizá no existen.

**Dónde se cambia:** Hoja `grupos.csv` o Administración → Grupos y horarios. S.

**Ids origen:** SUP-CUPOS

- [ ] Decidido: ______

#### D-32 · Duración de clase, salones y capacidad

**Grupo:** B · **Módulo:** Cotizador · **Esfuerzo:** S (horas)

**Pregunta:** ¿Cuánto dura cada clase, cuántos salones hay y cuántas personas caben en cada uno?

**Contexto:** Donde el insumo solo dio la hora de inicio, el fin es de ejemplo: Karate 6 a 13 y 14+: 60 min; Ballet 3 a 5: 45; Salsa y Cumbia: 60; Ballet 6 a 13 entre semana en Centenario: 60. Salones: «Dojo» de 24 en cada sucursal, «Salón 2» (Águilas) y «Salón 1» (Centenario) de 30. Con eso el sistema detecta choques de salón o de maestro. El modelo no guarda «duración» aparte: sale de las horas del horario.

**Opciones:**
- **A.** La escuela entrega horarios con hora de fin y salones con capacidad (`horarios.csv`, `salones.csv`).
- **B.** Usar los de ejemplo hasta que alguien note un error (no recomendable).

**Recomendación:** A.

**Si no se decide:** Choques y horarios que el asistente da a las familias pueden estar mal.

**Dónde se cambia:** Hojas `horarios.csv` y `salones.csv`. S.

**Ids origen:** SUP-DURACIONES, SUP-SALONES

- [ ] Decidido: ______

#### D-33 · Edades de los programas y fecha de corte

**Grupo:** B · **Módulo:** Cotizador · **Esfuerzo:** S (horas)

**Pregunta:** ¿Qué rango de edad tiene cada programa, cuáles se pueden elegir entre sí, y la edad se mide al día de la consulta o a una fecha de corte?

**Contexto:** Salsa y Cumbia y Twerk tienen 15 a 99 años en el insumo marcados como pendientes; en Águilas ambos están marcados como alternativas por estilo (el asistente pregunta cuál). Ningún programa tiene fecha de corte de edad: hoy se usa la edad que dice el contacto (el asistente pregunta la edad, no la fecha de nacimiento; el asesor sí puede capturar fecha de nacimiento en la ficha, que se usa al cotizar). Con corte, un niño que cumple años después del inicio del ciclo entra al programa que le toca ese ciclo.

**Opciones:**
- **A.** Dar rangos reales y, si hay corte, la fecha de inicio de ciclo por programa.
- **B.** Sin corte: la edad del día. Un niño puede cambiar de programa a mitad de ciclo.
- **C.** Además, que el asistente pregunte la fecha de nacimiento (cambia el flujo de tres preguntas).

**Recomendación:** A y B salvo que la escuela mida por ciclo; C solo si hay corte.

**Si no se decide:** Quedan los rangos y la edad del día como hoy.

**Dónde se cambia:** Administración → Programas (edades, corte y «permite traslape»); C en `src/captacion/maquina.ts` (M).

**Ids origen:** SUP-EDADES, SUP-CORTE, C5-corte

- [ ] Decidido: ______

#### D-34 · Tres reglas de edición del catálogo

**Grupo:** B · **Módulo:** Cotizador · **Esfuerzo:** M (un día o dos)

**Pregunta:** ¿Se endurecen tres reglas del catálogo: contar solo grupos activos en la capacidad, avisar si el cupo de un grupo pasa la capacidad de su salón y pedir confirmación al volver universal una promoción?

**Contexto:** Hoy la verificación de capacidad por sucursal cuenta también los grupos inactivos (el resto de las verificaciones los ignora). Por la API, un cupo mayor que la capacidad del salón solo es informativo; por la carga desde Excel ya es error. Una promoción sin filas de alcance vale para todos, y quitar el último programa la vuelve universal sin aviso.

**Opciones:**
- **A.** Dejarlas.
- **B.** Endurecer las tres: contar solo activos; cupo por encima de la capacidad como error también por la API; confirmación al quedar universal.

**Recomendación:** B. Las tres evitan errores silenciosos y cuestan poco.

**Si no se decide:** Quedan como hoy.

**Dónde se cambia:** `src/catalogo/` y `src/api/rutas/promociones.ts`, más textos de Administración. M.

**Ids origen:** EC-13, EC-19, EC-21

- [ ] Decidido: ______

#### D-35 · Recuperar una baja y corregir un precio mal capturado

**Grupo:** B · **Módulo:** Cotizador · **Esfuerzo:** M (un día o dos)

**Pregunta:** ¿Quieres que el administrador pueda recuperar lo dado de baja y corregir un precio mal capturado, o basta con desactivar y capturar otro?

**Contexto:** La pantalla de Precios no deja editar un precio guardado (así lo ya cobrado nunca cambia): hay que capturar otro con fecha posterior, por lo que un precio equivocado rige hasta ese día. La API sí permite corregir los importes o dar de baja una vigencia (queda en el registro de cambios), y lo ya inscrito conserva su precio congelado; sin precio vigente el cotizador dice «sin precio». «Dar de baja» no se deshace desde pantalla (soporte puede hacerlo, no se borra nada); el diálogo ofrece «desactivar», que sí se deshace.

**Opciones:**
- **A.** Dejarlo así (lo conservador).
- **B.** Un botón «Corregir» en la pantalla solo para vigencias que todavía no tengan inscripciones ni cotizaciones.
- **C.** B, más una pantalla «Papelera» por tipo con «Recuperar», que define qué pasa con lo que dependía de eso.

**Recomendación:** B. Resuelve el error más probable el primer día sin abrir la papelera.

**Si no se decide:** Un precio equivocado se corrige con otro de fecha posterior.

**Dónde se cambia:** `src/api/rutas/precios.ts` y Administración → Precios (B: M); Papelera (C: L).

**Ids origen:** V7-ADMIN-31, EC-20

- [ ] Decidido: ______

#### D-36 · La cotización del asistente sale sin revisión

**Grupo:** B · **Módulo:** Cotizador · **Esfuerzo:** S (horas)

**Pregunta:** ¿Está bien que el asistente mande la cotización (programa, horario, precio y promociones) sin que un asesor la revise?

**Contexto:** Con el cotizador encendido, el contacto recibe la cotización de inmediato: precios, cupos y promociones salen de las tablas, así que lo cargado es lo que se le dice al cliente. La cotización vale 7 días a lo más (antes si vence la promoción o el precio).

**Opciones:**
- **A.** Sin revisión, pero solo después de confirmar precios, cupos y promociones.
- **B.** Que el asistente solo capture y el asesor cotice (cotizador apagado).

**Recomendación:** A, condicionado a la confirmación de datos reales.

**Si no se decide:** Mientras los datos sean de ejemplo, no encender el cotizador con clientes reales.

**Dónde se cambia:** Administración → Módulos (interruptor del cotizador) y por disciplina en Administración → Disciplinas. S.

**Ids origen:** C-cot

- [ ] Decidido: ______

#### D-37 · Lista de espera: lugar ofrecido que no se toma

**Grupo:** B · **Módulo:** Cotizador · **Esfuerzo:** M (un día o dos)

**Pregunta:** Si una familia no toma a tiempo el lugar que se le ofreció de la lista de espera, ¿pasa al final, se cancela su lugar o se le avisa antes?

**Contexto:** Un grupo lleno manda a la familia a la lista de espera. Al liberarse un lugar el asesor recibe una tarea y se lo ofrece; la familia tiene 48 horas (`lista_espera_oferta_horas`, editable en Configuración). Nadie barre la oferta vencida: el asesor la ve y decide.

**Opciones:**
- **A.** Dejarlo manual: el asesor decide.
- **B.** Al vencer, la oferta pasa al siguiente de la lista y se crea una tarea.
- **C.** B, y un aviso a la familia unas horas antes de vencer (mensaje de servicio).

**Recomendación:** A al principio (pocos grupos llenos); B cuando el volumen lo justifique.

**Si no se decide:** Se queda la opción A, que es lo que hace el sistema hoy.

**Dónde se cambia:** Administración → Configuración (horas); B y C son código nuevo en `src/lista-espera/` (M).

**Ids origen:** C9-oferta, SUP-LISTA-ESPERA

- [ ] Decidido: ______

### Módulo: Clase muestra

#### D-38 · Textos a aprobar para la clase muestra

**Grupo:** B · **Módulo:** Clase muestra · **Esfuerzo:** S (horas)

**Pregunta:** ¿Qué textos se mandan a aprobación en Meta para la clase muestra (aviso al maestro, recordatorios, recuperación y avisos de cambio)?

**Contexto:** Hay 7 plantillas: `aviso_maestro_agendada`, `_reprogramada`, `_cancelada` (3, servicio), `recordatorio_clase_muestra` (5 variables, servicio), `recuperacion_no_asistio` (marketing), y las dos de V2, `aviso_clase_reprogramada` (6 variables) y `aviso_clase_cancelada` (5), de servicio. Los textos de `prisma/seed/clase-muestra.sql` son de ejemplo. Hay que registrarlas con el mismo código y las variables en el mismo orden.

**Opciones:**
- **A.** La escuela revisa los siete textos (tono, nombre de la escuela, contacto) y Grupo CCB los registra.
- **B.** Usar los de ejemplo sin cambiar.

**Recomendación:** A, con el mismo envío en que se aprueba el de reenganche.

**Si no se decide:** Sin plantilla aprobada no sale ningún aviso fuera de la ventana de 24 h; queda tarea para el asesor y el maestro solo ve el aviso en la aplicación.

**Dónde se cambia:** Twilio Content Templates y Administración → Plantillas de mensaje. S.

**Ids origen:** V2-1, SUP-PLANT-MUESTRA

- [ ] Decidido: ______

#### D-39 · Tiempos de la clase muestra y sus recordatorios

**Grupo:** B · **Módulo:** Clase muestra · **Esfuerzo:** S (horas)

**Pregunta:** ¿Confirmas los tiempos de la clase muestra: agendar con 2 horas de anticipación, hasta 60 días adelante, 5 fechas ofrecidas, corregir asistencia hasta 48 horas, recordatorios a 24 h y 2 h, y recuperación a las 2 h y 48 h?

**Contexto:** Los cuatro primeros se cambian en Administración → Configuración (el máximo de 5 fechas, no); los recordatorios y la recuperación, en Automatizaciones. La recuperación escribe 2 horas después de marcar la falta, otra a las 48 horas, dos intentos como máximo, y es de marketing (comparte el tope de 1 por semana).

**Opciones:**
- **A.** Dejarlos.
- **B.** Ajustarlos con la escuela en la sesión de datos.

**Recomendación:** A y revisar en el primer mes.

**Si no se decide:** Se quedan.

**Dónde se cambia:** Administración → Configuración y → Automatizaciones. S.

**Ids origen:** SUP-MUESTRA, SUP-RECORDATORIOS

- [ ] Decidido: ______

#### D-40 · Una clase muestra por grupo o por sesión

**Grupo:** B · **Módulo:** Clase muestra · **Esfuerzo:** S (horas)

**Pregunta:** ¿Se permite una sola clase muestra vigente por alumno y grupo, o una por cada sesión, y el lead que agenda en otra sucursal cambia de sucursal?

**Contexto:** Hoy hay una vigente por alumno y grupo, y el lead cambia a la sucursal de la clase que agendó (desde ahí solo lo ven los asesores de esa sucursal).

**Opciones:**
- **A.** Como hoy.
- **B.** Una por sesión (puede agendar varias fechas del mismo grupo).

**Recomendación:** A. Una prueba por grupo evita llenar los grupos con curiosos.

**Si no se decide:** Se queda la opción A, que es lo que hace el sistema hoy.

**Dónde se cambia:** `src/clases-muestra/` (B: M).

**Ids origen:** D1-muestra

- [ ] Decidido: ______

#### D-41 · Reagendar a quien no llegó: ¿lo hace el asistente?

**Grupo:** B · **Módulo:** Clase muestra · **Esfuerzo:** M (un día o dos)

**Pregunta:** Cuando una familia responde al mensaje de recuperación, ¿el asistente reagenda solo la clase o lo hace un asesor?

**Contexto:** Hoy responde un asesor y reagenda a mano. El asistente solo calla y deja la conversación para la persona.

**Opciones:**
- **A.** Asesor (como hoy).
- **B.** Que el asistente ofrezca nuevas fechas (usa el mismo flujo de la clase muestra del asistente).

**Recomendación:** A hasta ver cuánta gente responde.

**Si no se decide:** Se queda la opción A, que es lo que hace el sistema hoy.

**Dónde se cambia:** `src/captacion/maquina.ts` (B: M).

**Ids origen:** D4

- [ ] Decidido: ______

#### D-42 · Recordatorios: antelación, duplicados y aviso al asesor

**Grupo:** B · **Módulo:** Clase muestra · **Esfuerzo:** M (un día o dos)

**Pregunta:** ¿Un recordatorio que se recorrió al horario de envío puede salir con solo 30 minutos de anticipación, se mandan los dos recordatorios si ambos aplican, y se avisa al asesor cuando los recordatorios se apagan por atención humana?

**Contexto:** El recordatorio fuera de 9:00 a 20:00 se recorre al siguiente horario válido, y si con eso llegaría después de la clase se descarta y se registra. Hoy sale cualquiera que llegue antes de la clase, aunque falten 30 minutos; si dos automatizaciones aplican a la misma clase salen las dos; omitir un recordatorio por atención humana solo se registra (la excepción es el lead frío).

**Opciones:**
- **A.** Dejarlo así.
- **B.** Agregar un mínimo de antelación por automatización (`antelacion_minima_min`), mandar solo uno de los recordatorios y crear tarea al omitir por atención humana.

**Recomendación:** A y revisar con datos reales; B si la escuela se queja de recordatorios inútiles.

**Si no se decide:** Se queda la opción A, que es lo que hace el sistema hoy.

**Dónde se cambia:** `src/automatizaciones/` (B: M, con migración).

**Ids origen:** D3-antelación, ED-10, ED-11

- [ ] Decidido: ______

#### D-43 · Aviso al maestro: tope y teléfono faltante

**Grupo:** B · **Módulo:** Clase muestra · **Esfuerzo:** S (horas)

**Pregunta:** ¿Los avisos al maestro tienen su propio tope de frecuencia, y un maestro sin teléfono debe impedir que se agende la clase?

**Contexto:** Usan el tope general de 3 mensajes al día; el exceso queda solo en la lista de la aplicación. Un maestro sin teléfono no impide agendar: queda una tarea para el asesor («Aviso al maestro no enviado», una pendiente por familia con la clase más reciente) y el maestro ve la clase en su pantalla «Hoy».

**Opciones:**
- **A.** Como hoy.
- **B.** Tope propio para los avisos al maestro y no dejar agendar si el maestro no tiene teléfono.

**Recomendación:** A, pero pedir el teléfono de cada maestro en la carga de instructores.

**Si no se decide:** Se queda la opción A, que es lo que hace el sistema hoy.

**Dónde se cambia:** `src/clases-muestra/` (B: S).

**Ids origen:** D2-tope, D2-teléfono

- [ ] Decidido: ______

#### D-44 · Maestros reales y quién da cada grupo

**Grupo:** B · **Módulo:** Clase muestra · **Esfuerzo:** S (horas)

**Pregunta:** ¿Quiénes son los maestros, con su teléfono de WhatsApp, en qué sucursales dan clase y qué grupo da cada uno?

**Contexto:** Hay 5 maestros de ejemplo con teléfonos ficticios (uno por disciplina y sucursal, y uno solo para todo el baile) más «Maestro demo». Cada maestro ve solo las clases de sus grupos y le llega por WhatsApp el aviso cuando se agenda, cambia o cancela una clase muestra.

**Opciones:**
- **A.** La escuela da la lista (`instructores.csv`) y la columna «Instructor» de `grupos.csv`.
- **B.** Arrancar sin teléfonos y que los maestros vean todo en la aplicación.

**Recomendación:** A.

**Si no se decide:** Sin teléfono el maestro no se entera si no abre la aplicación.

**Dónde se cambia:** Hojas `instructores.csv` y `grupos.csv`; usuarios con rol maestro en Administración → Usuarios y roles. S.

**Ids origen:** SUP-INSTRUCTORES

- [ ] Decidido: ______

#### D-45 · Ficha de salud: quién la captura y cuánto la ve el maestro

**Grupo:** B · **Módulo:** Clase muestra · **Esfuerzo:** M (un día o dos)

**Pregunta:** ¿Quién captura la ficha de salud cuando el maestro no está, y hasta cuándo puede el maestro verla después de la clase?

**Contexto:** Solo el maestro del grupo o el administrador captura la salud (el asesor no); el registro de un asesor no llega a «completo» sin ella. El maestro ve la salud de un prospecto mientras la clase esté agendada, asistida o no asistida en su grupo; se corta si se cancela o se reagenda. Siempre se pide un motivo y queda constancia de cada consulta. Salud de menores nunca va a logs, notas ni mensajes (decisión tuya).

**Opciones:**
- **A.** Dejarlo como está.
- **B.** Permitir que un asesor capture la salud cuando el maestro falte (queda con registro).
- **C.** Acortar la ventana de lectura del maestro a la hora de la clase.

**Recomendación:** A.

**Si no se decide:** Se queda la opción A, que es lo que hace el sistema hoy.

**Dónde se cambia:** `src/api/permisos.ts` y `src/sensibles/` (B y C: M).

**Ids origen:** D5-salud, ED-09

- [ ] Decidido: ______

#### D-46 · Copia de la clave de cifrado de salud

**Grupo:** B · **Módulo:** Clase muestra · **Esfuerzo:** S (horas)

**Pregunta:** ¿Dónde se guarda, fuera de AWS, la copia de la clave que cifra los datos de salud, y qué dos personas tienen acceso a ella?

**Contexto:** La salud de menores se cifra en la aplicación (AES-256-GCM) con una clave que hoy vive solo en Secrets Manager y en el secreto protegido. Si se pierde, los datos de salud no se pueden recuperar ni con un respaldo de la base. Procedimiento de rotación: ya escrito y probado en pequeño.

**Opciones:**
- **A.** Un gestor de contraseñas de la dirección, con dos personas con acceso (propuesta).
- **B.** Solo Secrets Manager (hoy).

**Recomendación:** A, antes del primer dato de salud.

**Si no se decide:** Una cuenta de AWS perdida o dañada deja los datos de salud ilegibles para siempre.

**Dónde se cambia:** Fuera del producto; `docs/RESPALDO.md` y `docs/SEGURIDAD.md`. S.

**Ids origen:** K5-CLAVE

- [ ] Decidido: ______

#### D-47 · Reglamento, uso de imagen y evidencia de aceptación

**Grupo:** B · **Módulo:** Clase muestra · **Esfuerzo:** S (horas)

**Pregunta:** ¿Cuáles son los textos definitivos del reglamento y de la autorización de uso de imagen, es obligatoria la autorización de imagen y qué evidencia se guarda (firma o foto, o solo el texto)?

**Contexto:** Los tres textos de la demo (reglamento, imagen y aviso) son de ejemplo, versión 1. Solo el reglamento es obligatorio para cerrar el registro del maestro; la imagen puede quedar rechazada. La evidencia hoy es un texto corto (canal, quién lo capturó y huella del documento); no se guardan firmas ni fotos. Los textos publicados no se editan: se publica la siguiente versión. El aviso de privacidad se decide aparte (D-10).

**Opciones:**
- **A.** Textos de la escuela, imagen opcional, evidencia de texto (como hoy).
- **B.** Imagen obligatoria.
- **C.** Guardar firma o foto como evidencia (requiere almacenar archivos: L).

**Recomendación:** A. Si el abogado pide firma, que sea una decisión legal explícita.

**Si no se decide:** Sin reglamento vigente no se puede inscribir a nadie.

**Dónde se cambia:** `POST /api/documentos-legales` (administrador). A: S; C: L.

**Ids origen:** SUP-REGLAMENTO, D6-imagen, D6-firma

- [ ] Decidido: ______

#### D-48 · Reglamento de cada niño y de los hermanos

**Grupo:** B · **Módulo:** Clase muestra · **Esfuerzo:** M (un día o dos)

**Pregunta:** ¿Basta que quien aceptó el reglamento por un hijo lo acepte por sus hermanos con un clic del asesor, y cómo se registra el reglamento de un niño sin clase muestra?

**Contexto:** La aceptación es por niño y se registra en la clase muestra. V3 agregó un botón que copia la aceptación vigente de un hermano (mismo adulto, mismo canal y versión) como una aceptación nueva con la nota «extendida_de_prospecto»; 409 si el hermano no aceptó o si el reglamento cambió. Con la clase muestra apagada y la inscripción encendida, nadie puede registrar el reglamento de un niño que no tenga un hermano que ya lo aceptó.

**Opciones:**
- **A.** Dejar el clic del asesor para hermanos y nada más (lo vigente).
- **B.** Exigir la constancia propia de cada niño (el asesor registra el formulario completo otra vez).
- **C.** Agregar un formulario de aceptación en la ficha del lead para quien no pasó por clase muestra.

**Recomendación:** Que lo decida el abogado; mientras, A y C como solución para la escuela con clase muestra apagada.

**Si no se decide:** Se queda la opción A, que es lo que hace el sistema hoy.

**Dónde se cambia:** `src/legal/` y la ficha del asesor (C: M).

**Ids origen:** V3-1, V3-2

- [ ] Decidido: ______

### Módulo: Inscripción

#### D-49 · Quién cierra la inscripción: asesor o maestro en sitio

**Grupo:** B · **Módulo:** Inscripción · **Esfuerzo:** S (horas)

**Pregunta:** ¿La escuela cerrará la inscripción con el asesor por WhatsApp o con el maestro en la propia clase?

**Contexto:** Ya decidiste que se construyen los dos modos y que el de arranque es «asesor por WhatsApp» (el maestro marca «listo para cerrar»). El modo del maestro en sitio inscribe pero no cobra y no muestra importes; está probado en navegador desde V4. Se cambia en Administración → Configuración, con confirmación y sin tocar la base. Falta saber cuál usará la escuela.

**Opciones:**
- **A.** Asesor por WhatsApp.
- **B.** Maestro en sitio (ya no es por SQL: es un interruptor en Configuración).

**Recomendación:** A para arrancar; B si la escuela inscribe en la propia clase.

**Si no se decide:** Queda A.

**Dónde se cambia:** Administración → Configuración → modo de cierre. S.

**Ids origen:** F6-modo

- [ ] Decidido: ______

#### D-50 · Alumnos que ya vienen: inscripciones con fecha pasada

**Grupo:** B · **Módulo:** Inscripción · **Esfuerzo:** L (varios días)

**Pregunta:** ¿Cómo entran al sistema los alumnos que ya asisten hoy, con su fecha real de inicio?

**Contexto:** Una inscripción con fecha de inicio pasada se rechaza. Para una escuela que ya opera, todos los alumnos actuales son «que ya venían». Además, lo anterior al módulo de cobros no recibe cargo de inscripción ni meses pasados (ver D-66).

**Opciones:**
- **A.** Permitir fecha de inicio pasada en la inscripción (el sistema genera solo los cargos que se le indiquen).
- **B.** Una carga masiva desde Excel de alumnos existentes, con fecha de inicio, grupo y día de corte.
- **C.** Inscribir a todos como nuevos desde la fecha de arranque.

**Recomendación:** B, junto con la regularización de los «inscritos a mano»: es el camino de la escuela real.

**Si no se decide:** No se puede cargar a quien ya viene; la escuela tendría que inscribir de cero con la fecha de hoy.

**Dónde se cambia:** `src/inscripciones/` y una hoja nueva en Cargar catálogo (B: L).

**Ids origen:** F3-fecha

- [ ] Decidido: ______

#### D-51 · Familia que llega a mostrador sin lead

**Grupo:** B · **Módulo:** Inscripción · **Esfuerzo:** M (un día o dos)

**Pregunta:** ¿Cómo se registra el reglamento de una familia que llega a mostrador sin haber pasado por un lead ni por una clase muestra?

**Contexto:** Un alumno dado de alta directo (mostrador) crea la familia pero no puede inscribirse: la evidencia legal cuelga del prospecto. Hoy la familia debe tener un lead.

**Opciones:**
- **A.** Crear un lead al vuelo para el mostrador y registrar ahí la aceptación.
- **B.** Un formulario de aceptación en el alta del alumno.
- **C.** Dejarlo: toda familia pasa por un lead.

**Recomendación:** A (menos código y mismo rastro legal) si la escuela recibe familias directas.

**Si no se decide:** Una familia de mostrador no puede inscribirse hasta crear su lead.

**Dónde se cambia:** `src/inscripciones/` (A o B: M).

**Ids origen:** F3-mostrador

- [ ] Decidido: ______

#### D-52 · Inscripción contra clases muestra ya agendadas

**Grupo:** B · **Módulo:** Inscripción · **Esfuerzo:** M (un día o dos)

**Pregunta:** ¿Una inscripción debe respetar las clases muestra ya agendadas en el grupo o se acepta un niño de más ese día?

**Contexto:** Gana la inscripción (quien paga): la sesión de la clase muestra puede quedar sobrevendida. Un grupo puede llenarse con una muestra agendada que luego no cabe.

**Opciones:**
- **A.** Como hoy: gana la inscripción.
- **B.** Contar las muestras agendadas al inscribir (avisando al asesor).

**Recomendación:** A y que el asesor reagende la muestra desplazada.

**Si no se decide:** Se queda la opción A, que es lo que hace el sistema hoy.

**Dónde se cambia:** `src/inscripciones/` (B: M).

**Ids origen:** EF-06

- [ ] Decidido: ______

#### D-53 · Datos del tutor de otra sucursal

**Grupo:** B · **Módulo:** Inscripción · **Esfuerzo:** M (un día o dos)

**Pregunta:** Al dar de alta un alumno con el teléfono de un tutor que ya es de otra sucursal, ¿se oculta su nombre y correo hasta que lo confirme un administrador?

**Contexto:** Hoy se liga a ese tutor y se devuelve su nombre, apellidos y correo aunque quien captura no vea esa sucursal (la auditoría lo demostró).

**Opciones:**
- **A.** Dejarlo.
- **B.** Devolver solo «ya existe» y pedir confirmación del administrador.

**Recomendación:** B por privacidad de datos de otras sucursales.

**Si no se decide:** Se filtran datos personales entre sucursales.

**Dónde se cambia:** `src/inscripciones/` y `src/familias/` (M).

**Ids origen:** EF-07

- [ ] Decidido: ______

#### D-54 · Segundo hijo de un lead ya inscrito y meses por adelantado

**Grupo:** B · **Módulo:** Inscripción · **Esfuerzo:** M (un día o dos)

**Pregunta:** ¿Los meses pagados por adelantado pueden declararse sin pago, y se da por cerrado el seguimiento del segundo hijo?

**Contexto:** EF-12 quedó cubierto por V3 (un lead ya inscrito vuelve a tener a quién inscribir, desde la ficha). Para los adelantos, quien inscribe declara hasta 24 meses: se generan los cargos y la promoción de pago anticipado se aplica sin evidencia de pago.

**Opciones:**
- **A.** Dejarlo (confianza en quien inscribe).
- **B.** Que los meses adelantados queden como cargos y la promoción espere al pago registrado.

**Recomendación:** B. La promoción debe seguir al dinero registrado.

**Si no se decide:** Se queda la opción A, que es lo que hace el sistema hoy.

**Dónde se cambia:** `src/inscripciones/` y `src/finanzas/` (M).

**Ids origen:** EF-12, EF-13

- [ ] Decidido: ______

#### D-55 · Qué hijo paga completo con el descuento por hermanos

**Grupo:** B · **Módulo:** Inscripción · **Esfuerzo:** S (horas)

**Pregunta:** Con el descuento por hermanos, ¿qué hijo paga completo: el capturado primero, el más caro o el más barato?

**Contexto:** Hoy el orden de captura: el primero paga completo y el segundo recibe la promoción (como dice el texto de la promoción de la demo). El precio que se ve en el asistente es el que se cobra (V3).

**Opciones:**
- **A.** El primero capturado (hoy).
- **B.** El más caro paga completo; el descuento va al más barato.
- **C.** El más barato paga completo (la familia paga más).

**Recomendación:** A. Es la única regla que no inventa una preferencia por precio.

**Si no se decide:** Se queda la opción A, que es lo que hace el sistema hoy.

**Dónde se cambia:** `src/promociones/resolver.ts` (M).

**Ids origen:** EK-09 (producto)

- [ ] Decidido: ______

#### D-56 · Bienvenida: una por familia o por hijo, y a quién

**Grupo:** B · **Módulo:** Inscripción · **Esfuerzo:** M (un día o dos)

**Pregunta:** ¿La bienvenida de inscripción sale una vez por familia o una por cada hijo, y llega solo al responsable de pago o también al otro tutor?

**Contexto:** Hoy sale una por inscripción (dos hermanos inscritos a la vez reciben dos bienvenidas) y solo al responsable de pago; el texto y el calendario (lunes a sábado, 9:00 a 20:00) son de ejemplo. Apagar la automatización sí cancela las ya programadas (K9).

**Opciones:**
- **A.** Una por inscripción, solo al responsable (hoy).
- **B.** Una por familia con los nombres de todos los hijos.
- **C.** Además enviar al segundo tutor o a la abuela.

**Recomendación:** A. Nadie se queda sin aviso de su grupo y su primer día.

**Si no se decide:** Se queda la opción A, que es lo que hace el sistema hoy.

**Dónde se cambia:** `src/automatizaciones/` y la plantilla de bienvenida (B o C: M).

**Ids origen:** F7-tutor, EF-14, V3-3, SUP-BIENVENIDA

- [ ] Decidido: ______

#### D-57 · Un solo responsable de pago

**Grupo:** B · **Módulo:** Inscripción · **Esfuerzo:** M (un día o dos)

**Pregunta:** ¿Un alumno puede tener dos responsables de pago, y si cambia el responsable se pasan sus cargos abiertos al nuevo?

**Contexto:** A lo más uno por alumno (el estado de cuenta se arma sobre uno), fijado al generar el cargo. Si cambia, los cargos abiertos siguen a nombre del anterior para no romper su estado de cuenta.

**Opciones:**
- **A.** Uno, y los abiertos no se mueven (hoy).
- **B.** Uno, y reasignar los cargos abiertos al nuevo (con registro).
- **C.** Hasta dos, con el pago repartido (cambia el estado de cuenta: L).

**Recomendación:** A. Cuando un caso real exija pasar los cargos, se hace B.

**Si no se decide:** Se queda la opción A, que es lo que hace el sistema hoy.

**Dónde se cambia:** `src/finanzas/` y `src/inscripciones/` (B: M; C: L).

**Ids origen:** F1-pago, H1-resp

- [ ] Decidido: ______

#### D-58 · Horario cotizado o recomendado por el maestro

**Grupo:** B · **Módulo:** Inscripción · **Esfuerzo:** S (horas)

**Pregunta:** Si el horario que cotizó la familia y el que recomendó el maestro difieren, ¿quién manda?

**Contexto:** Gana el cotizado; el asesor puede mandar otro grupo explícito al convertir.

**Opciones:**
- **A.** Gana el cotizado (hoy).
- **B.** Gana el del maestro con aviso a la familia.

**Recomendación:** A. La familia ya escuchó ese horario.

**Si no se decide:** Se queda la opción A, que es lo que hace el sistema hoy.

**Dónde se cambia:** `src/conversion/` (B: M).

**Ids origen:** F2-horario

- [ ] Decidido: ______

#### D-59 · Bajas: beneficios, cupo de la promoción y quién puede dar de baja

**Grupo:** B · **Módulo:** Inscripción · **Esfuerzo:** M (un día o dos)

**Pregunta:** Cuando alguien se da de baja antes de pagar, ¿qué pasa con los beneficios diferidos y con el cupo de la promoción que usó, y los cinco motivos de baja son los de la escuela?

**Contexto:** No se devuelve el cupo de la promoción ni se cancelan los beneficios (las bajas se ignoran en la lista de entregas). Cualquier rol con escritura de inscripciones (incluida recepción) puede dar de baja o congelar. Los motivos (económico, cambio de domicilio, horario, insatisfacción, otro) son de ejemplo y se editan en Administración → Motivos de pérdida y de baja.

**Opciones:**
- **A.** Dejarlo.
- **B.** Devolver el cupo de la promoción y cancelar los beneficios pendientes al dar de baja antes del primer pago.

**Recomendación:** B para el cupo de promociones limitadas; revisar con la escuela los motivos.

**Si no se decide:** Una promoción de cupo limitado se «consume» aunque el alumno nunca pague.

**Dónde se cambia:** `src/inscripciones/cambios.ts` y `src/promociones/` (M).

**Ids origen:** F5-baja, SUP-MOTIVOS-BAJA

- [ ] Decidido: ______

### Módulo: Operación

#### D-60 · Pase de lista: quién y hasta cuándo

**Grupo:** B · **Módulo:** Operación · **Esfuerzo:** S (horas)

**Pregunta:** ¿Quién puede pasar lista y cuántos días atrás se puede pasar o corregir?

**Contexto:** Maestro, recepción y administrador la registran; el asesor solo lee; no se puede pasar antes de que empiece la clase. Se puede corregir cualquier fecha pasada con sesión (queda registro de cambios; para fechas viejas la lista usa el grupo actual del alumno).

**Opciones:**
- **A.** Dejarlo.
- **B.** Límite de antigüedad (por ejemplo 30 días) y después solo el administrador.

**Recomendación:** B con 30 días.

**Si no se decide:** Se queda la opción A, que es lo que hace el sistema hoy.

**Dónde se cambia:** `src/asistencia/pase.ts` (B: S).

**Ids origen:** SUP-PASE, EG-15

- [ ] Decidido: ______

#### D-61 · Faltas seguidas y aviso a la familia

**Grupo:** B · **Módulo:** Operación · **Esfuerzo:** S (horas)

**Pregunta:** ¿Cuántas faltas seguidas disparan la tarea al asesor y se avisa también por WhatsApp a la familia?

**Contexto:** Tres faltas seguidas (editable en Configuración, de 1 a 30); la falta justificada ni suma ni corta la racha; la ve el asesor de la sucursal. No se manda nada a la familia: un mensaje sería de servicio o de marketing según su texto.

**Opciones:**
- **A.** Solo tarea al asesor (hoy).
- **B.** Además un aviso a la familia (plantilla de servicio, requiere texto aprobado).

**Recomendación:** A: es el asesor quien debe llamar.

**Si no se decide:** Se queda la opción A, que es lo que hace el sistema hoy.

**Dónde se cambia:** Administración → Configuración (umbral); B en `src/asistencia/` (M).

**Ids origen:** SUP-FALTAS, G2-aviso

- [ ] Decidido: ______

#### D-62 · Niveles, cinturones y clases mínimas

**Grupo:** B · **Módulo:** Operación · **Esfuerzo:** S (horas)

**Pregunta:** ¿Cuáles son los peldaños de avance de cada disciplina, cuántas clases pide cada uno y se puede saltar uno?

**Contexto:** Los nombres y las clases mínimas son de ejemplo: siete peldaños por color en la primera disciplina (0, 20, 30, 40, 50, 60 y 100 clases), seis en la segunda (los nombres vienen del contexto; 0, 24, 36, 48, 60, 72) y tres en la tercera (0, 16, 32), que hoy no usa progresión. Dar un peldaño que se salta uno lo puede hacer el maestro o el administrador. No hay pantalla (por API).

**Opciones:**
- **A.** La escuela da sus peldaños y los carga CCB por la API.
- **B.** Usar los de ejemplo mientras el módulo de operación sigue apagado.
- **C.** Impedir saltar peldaños.

**Recomendación:** A, y dejar saltar con permiso.

**Si no se decide:** Los de ejemplo aparecerían en pantalla.

**Dónde se cambia:** `POST /api/niveles` (sin pantalla; ver D-113). S.

**Ids origen:** SUP-PROGRESION, G3-peldaño

- [ ] Decidido: ______

#### D-63 · Eventos: cuota, excepciones y quién marca pagado

**Grupo:** B · **Módulo:** Operación · **Esfuerzo:** M (un día o dos)

**Pregunta:** ¿La cuota de un evento es una por evento o por alumno, puede convocar el administrador a quien no cumple las clases mínimas, y puede el maestro marcar «pagado»?

**Contexto:** Una cuota por evento; sin excepciones; el evento otorga progresión por omisión. El maestro hoy puede marcar a un participante como pagado y quitarlo del evento, aunque el comentario del permiso dice que recepción cobra la cuota. El cobro del evento se hace con un cargo normal.

**Opciones:**
- **A.** Dejarlo, salvo que solo recepción marque «pagado».
- **B.** Cuota por alumno (becas, descuento por hermano) y excepciones del administrador.

**Recomendación:** A con el cambio de «pagado» solo para recepción.

**Si no se decide:** Se queda como hoy.

**Dónde se cambia:** `src/eventos/` y `src/api/permisos.ts` (S a M).

**Ids origen:** SUP-EVENTOS, G4-cuota, EG-09

- [ ] Decidido: ______

#### D-64 · Qué ve el maestro y el asesor del expediente

**Grupo:** B · **Módulo:** Operación · **Esfuerzo:** M (un día o dos)

**Pregunta:** ¿El maestro debe ver del expediente del alumno solo lo de sus grupos, y el asesor debe ver los beneficios pendientes de una inscripción congelada?

**Contexto:** El maestro ve todas las inscripciones, eventos y asistencia del alumno y los nombres de sus hermanos, sin importes ni datos comerciales. El asesor ve los beneficios pendientes de una inscripción congelada (solo se excluyen las bajas).

**Opciones:**
- **A.** Dejarlo.
- **B.** Filtrar al maestro a sus grupos y quitar nombres de hermanos.

**Recomendación:** B para el maestro; dejar al asesor.

**Si no se decide:** Se queda la opción A, que es lo que hace el sistema hoy.

**Dónde se cambia:** `src/expediente/` (M).

**Ids origen:** EG-14, G5-congelada

- [ ] Decidido: ______

### Módulo: Finanzas

#### D-65 · Calendario de cobranza y día de corte

**Grupo:** B · **Módulo:** Finanzas · **Esfuerzo:** S (horas)

**Pregunta:** ¿Confirmas que se recuerde el pago 3 días antes, 1 día después y cada 7 días (2 intentos), que no se persiga deuda de más de 60 días y que a los 15 días de deuda haya tarea para el asesor?

**Contexto:** Los recordatorios de pago son aviso de servicio (salen aunque una persona atienda, de lunes a sábado de 9:00 a 20:00, con plantilla aprobada). El umbral de la tarea (15 días) se cambia en Configuración; los desfases, en Automatizaciones. El día de corte de pago (1 a 31) lo elige la familia al inscribirse. La primera mensualidad vence el día de corte de su mes (o el día de la inscripción si ese corte ya pasó) y el barrido solo genera el mes en curso.

**Opciones:**
- **A.** Dejarlo.
- **B.** Ajustarlo con la escuela (por ejemplo, recordar 5 días antes).

**Recomendación:** A y ajustar con datos del primer mes de cobranza.

**Si no se decide:** Se queda la opción A, que es lo que hace el sistema hoy.

**Dónde se cambia:** Administración → Configuración y → Automatizaciones; plantillas en Plantillas. S.

**Ids origen:** SUP-COBRANZA, SUP-DIA-CORTE

- [ ] Decidido: ______

#### D-66 · Inscripciones anteriores al módulo de cobros

**Grupo:** B · **Módulo:** Finanzas · **Esfuerzo:** M (un día o dos)

**Pregunta:** ¿Qué pasa con las inscripciones que existen antes de encender finanzas?

**Contexto:** No reciben cargo de inscripción ni meses pasados; el primer barrido genera solo el mes en curso, normalmente ya vencido, y la cobranza empieza a escribirles al día siguiente. Una prueba fija este comportamiento. Importa si la escuela enciende captación y luego finanzas con alumnos existentes.

**Opciones:**
- **A.** Nada especial (hoy).
- **B.** Una fecha de arranque de la cobranza por escuela: nada se cobra ni se recuerda antes de ella.
- **C.** El mes en curso con vencimiento desde el día del primer barrido (no nace vencido).

**Recomendación:** C: evita que las familias reciban un cobro vencido al encender finanzas.

**Si no se decide:** Al encender finanzas, familias que pagaron fuera del sistema reciben un recordatorio de mensualidad vencida.

**Dónde se cambia:** `src/finanzas/cargos.ts` (B o C: M).

**Ids origen:** EH-11

- [ ] Decidido: ______

#### D-67 · Inscribirse el último día del mes

**Grupo:** B · **Módulo:** Finanzas · **Esfuerzo:** M (un día o dos)

**Pregunta:** Cuando alguien se inscribe el último día del mes, ¿se prorratea o se le da gratis hasta el siguiente?

**Contexto:** Hoy cobra el mes completo y al día siguiente el siguiente mes completo.

**Opciones:**
- **A.** Como hoy.
- **B.** Prorratear por días.
- **C.** El primer mes gratis si se inscribe en los últimos días del mes.

**Recomendación:** C si la escuela lo acepta: evita un cobro de dos mensualidades en dos días; A en otro caso.

**Si no se decide:** Se queda la opción A, que es lo que hace el sistema hoy.

**Dónde se cambia:** `src/finanzas/cargos.ts` (B o C: M).

**Ids origen:** EH-20

- [ ] Decidido: ______

#### D-68 · Congelar y reactivar una inscripción

**Grupo:** B · **Módulo:** Finanzas · **Esfuerzo:** M (un día o dos)

**Pregunta:** Al reactivar una inscripción congelada a mitad de mes, ¿se cobra el mes completo, y congelar cancela el cargo del mes en curso?

**Contexto:** Congelar no cancela cargos ya generados; reactivar genera el mes completo, sin prorrateo. Una inscripción congelada no genera mensualidad mientras lo esté.

**Opciones:**
- **A.** Como hoy.
- **B.** Congelar cancela el cargo del mes en curso aún sin pagos.
- **C.** Reactivar prorratea el mes.

**Recomendación:** A y revisar con casos reales.

**Si no se decide:** Se queda la opción A, que es lo que hace el sistema hoy.

**Dónde se cambia:** `src/inscripciones/cambios.ts` y `src/finanzas/` (M).

**Ids origen:** H1-congelar

- [ ] Decidido: ______

#### D-69 · Pago mayor a lo que se debe

**Grupo:** B · **Módulo:** Finanzas · **Esfuerzo:** L (varios días)

**Pregunta:** Si alguien paga más de lo que debe, ¿se rechaza o se guarda como saldo a favor?

**Contexto:** Se rechaza (409 «excedente_sin_cargo») para no crear crédito, devoluciones ni otra tabla; la escuela da el cambio en mostrador. La pantalla ya dice qué hacer (V7).

**Opciones:**
- **A.** Rechazar (hoy).
- **B.** Guardar saldo a favor y aplicarlo a cargos futuros.

**Recomendación:** A. Los pagos adelantados se resuelven declarando meses por adelantado.

**Si no se decide:** Se queda la opción A, que es lo que hace el sistema hoy.

**Dónde se cambia:** `src/finanzas/pagos.ts` (B: L, con tabla nueva).

**Ids origen:** H2-excedente

- [ ] Decidido: ______

#### D-70 · Descuentos diferidos en mensualidades siguientes

**Grupo:** B · **Módulo:** Finanzas · **Esfuerzo:** M (un día o dos)

**Pregunta:** ¿Un descuento diferido que no es producto debe aplicarse a las mensualidades siguientes?

**Contexto:** Solo se marca entregado; los cargos llevan el descuento inmediato congelado. Un beneficio diferido de producto (el uniforme) se entrega por la pantalla «Uniformes».

**Opciones:**
- **A.** Como hoy.
- **B.** Aplicarlo a las mensualidades siguientes.

**Recomendación:** A mientras no haya una promoción real de este tipo.

**Si no se decide:** Se queda la opción A, que es lo que hace el sistema hoy.

**Dónde se cambia:** `src/promociones/` y `src/finanzas/cargos.ts` (B: M).

**Ids origen:** H4-diferido

- [ ] Decidido: ______

#### D-71 · Inventario: pantalla de entrada y por sucursal

**Grupo:** B · **Módulo:** Finanzas · **Esfuerzo:** M (un día o dos)

**Pregunta:** ¿Se construye una pantalla para dar de alta productos y registrar entradas de piezas, y el inventario es global o por sucursal?

**Contexto:** Recepción tiene el permiso de ajustar existencias y la API existe (`POST /api/productos/:id/ajuste-stock`), pero no hay pantalla para dar entrada de piezas ni dar de alta un producto; el texto de «Uniformes» ya remite a quien administra. El inventario es global por producto.

**Opciones:**
- **A.** Una pantalla de productos e inventario global.
- **B.** A, por sucursal (el modelo no trae sucursal en el producto: migración).
- **C.** Seguir con la API.

**Recomendación:** A antes de encender finanzas si la escuela vende uniformes; B solo si dos sucursales no comparten bodega.

**Si no se decide:** Para dar entrada de piezas hay que pedirlo a Grupo CCB (por API).

**Dónde se cambia:** Pantalla nueva en `web/src/pantallas/` (A: M; B: L).

**Ids origen:** H5-stock, V7-RECEPCION-13, V7-RECEPCION-21 (inventario, «Evento»)

- [ ] Decidido: ______

#### D-72 · Límites de los pagos: fecha, repetición y cancelación

**Grupo:** B · **Módulo:** Finanzas · **Esfuerzo:** S (horas)

**Pregunta:** ¿Qué tan atrás puede fecharse un pago (400 días), qué responde reintentar con la clave de un pago cancelado (409) y hasta cuándo puede cancelarse un pago viejo?

**Contexto:** Más de 400 días atrás es 400 `fecha_muy_antigua`; repetir la clave de un pago cancelado da 409 `pago_cancelado` para que la caja no lo lea como cobro; un pago viejo se cancela sin límite de fecha por administrador y recepción (queda registro).

**Opciones:**
- **A.** Dejar los tres.
- **B.** Límite de cancelación (por ejemplo, 30 días) y 90 días hacia atrás.

**Recomendación:** A y hacerlo configurable solo si alguien lo pide.

**Si no se decide:** Se quedan.

**Dónde se cambia:** `src/finanzas/pagos.ts` (B: S).

**Ids origen:** K2-EH13, K2-EH12, H2-cancelar

- [ ] Decidido: ______

#### D-73 · Reparto de un pago entre hijos

**Grupo:** B · **Módulo:** Finanzas · **Esfuerzo:** S (horas)

**Pregunta:** En la pantalla de pago, ¿el reparto a mano entre hijos parte de la propuesta del sistema o en blanco, y se confirma el orden «inscripción antes que mensualidad» a igual vencimiento?

**Contexto:** Parte de la propuesta (primero lo que venció antes). Ya decidiste «más antiguo primero» y V10 completó el desempate (vencimiento, luego inscripción antes que mensualidad, luego creación, luego id) para que el reparto sea estable.

**Opciones:**
- **A.** Propuesta y orden actuales.
- **B.** Reparto en blanco.
- **C.** Otro desempate (por ejemplo, mensualidad primero).

**Recomendación:** A.

**Si no se decide:** Se queda la opción A, que es lo que hace el sistema hoy.

**Dónde se cambia:** `CONCEPTOS_EN_ORDEN` en `src/finanzas/distribucion.ts` y la pantalla de pago (S).

**Ids origen:** J5, V10-desempate

- [ ] Decidido: ______

#### D-74 · Recepción: corte de caja formal, estado de cuenta por WhatsApp y permisos

**Grupo:** B · **Módulo:** Finanzas · **Esfuerzo:** M (un día o dos)

**Pregunta:** ¿Recepción necesita un corte de caja formal con conteo y diferencia, mandar el estado de cuenta por WhatsApp y seguir viendo el embudo de leads?

**Contexto:** El «Cierre del día» solo lee: cuenta lo registrado ese día por persona y forma de pago, con devoluciones restadas; no guarda el conteo físico ni quién cerró, y el «día» es el de la primera sucursal que ve el usuario. El estado de cuenta se imprime o baja a Excel; por WhatsApp no sale (haría falta una plantilla de servicio y un botón). Recepción conserva por la API la lectura de leads (se ocultó solo la nota privada del asesor).

**Opciones:**
- **A.** Dejar los tres.
- **B.** Corte formal (conteo, diferencia, quién cerró, devoluciones por caja, día por sucursal).
- **C.** Estado de cuenta por WhatsApp (plantilla de servicio aprobada, horario y baja aplican).
- **D.** Quitar `leads:leer` a recepción (cambia la matriz de permisos).

**Recomendación:** A al abrir finanzas; D ya (recepción no necesita ver el embudo); B y C cuando la escuela los pida.

**Si no se decide:** Se queda la opción A, que es lo que hace el sistema hoy.

**Dónde se cambia:** `src/api/permisos.ts` (D: S); `src/finanzas/` y plantillas (B o C: M a L).

**Ids origen:** V7-RECEPCION corte, WhatsApp, leads:leer

- [ ] Decidido: ______

#### D-75 · Estado de cuenta por sucursal y deuda vencida para recepción

**Grupo:** B · **Módulo:** Finanzas · **Esfuerzo:** S (horas)

**Pregunta:** ¿El estado de cuenta de una familia debe limitarse a las sucursales de quien lo consulta, y recepción debe ver la tarea de deuda vencida?

**Contexto:** El estado de cuenta muestra los cargos de todas las sucursales de la familia (la auditoría lo ve probablemente deseado: la familia debe un total). La tarea de deuda vencida la ven solo el administrador y el asesor; recepción, que cobra, no.

**Opciones:**
- **A.** Dejarlo.
- **B.** Limitar el estado de cuenta a las sucursales de quien consulta.
- **C.** Mostrar la deuda vencida a recepción (lectura).

**Recomendación:** A y C.

**Si no se decide:** Se queda la opción A, que es lo que hace el sistema hoy.

**Dónde se cambia:** `src/api/permisos.ts` (C: S).

**Ids origen:** EH-14, EH-15

- [ ] Decidido: ______

### Módulo: Tableros

#### D-76 · Conversión de clases muestra: misma disciplina y posterior

**Grupo:** B · **Módulo:** Tableros · **Esfuerzo:** M (un día o dos)

**Pregunta:** En el reporte de clases muestra, ¿la conversión solo cuenta inscripciones de la misma disciplina y posteriores a la clase?

**Contexto:** Hoy cuenta cualquier inscripción del prospecto, de cualquier disciplina y fecha, por lo que el desglose por disciplina puede engañar. V10b ya cuenta como inscritas las clases asistidas de un lead marcado «inscrito a mano», con la cifra aparte.

**Opciones:**
- **A.** Dejarlo.
- **B.** Contar solo inscripciones de la misma disciplina y posteriores a la clase.

**Recomendación:** B.

**Si no se decide:** El reporte sobreestima la conversión por disciplina.

**Dónde se cambia:** `src/reportes/clases-muestra.ts` (S a M).

**Ids origen:** EH-17

- [ ] Decidido: ______

#### D-77 · Tablero ejecutivo: importes para el asesor y umbrales

**Grupo:** B · **Módulo:** Tableros · **Esfuerzo:** S (horas)

**Pregunta:** ¿El asesor debe ver los importes del tablero ejecutivo (ingreso recurrente y cartera vencida de sus sucursales), y los umbrales «a reventar» (90 %) y «vacío» (25 %) son los correctos?

**Contexto:** El asesor los ve, solo de sus sucursales; el maestro solo ve ocupación. Los umbrales se cambian en Administración → Configuración.

**Opciones:**
- **A.** Dejarlo.
- **B.** Tablero ejecutivo solo para el administrador.

**Recomendación:** A; ajustar umbrales con la ocupación real.

**Si no se decide:** Se queda la opción A, que es lo que hace el sistema hoy.

**Dónde se cambia:** `src/api/permisos.ts` (B: S) y Configuración (umbrales).

**Ids origen:** I3-asesor, SUP-UMBRALES

- [ ] Decidido: ______

#### D-78 · Gasto de campaña: tipo de gasto y «—» sin gasto

**Grupo:** B · **Módulo:** Tableros · **Esfuerzo:** S (horas)

**Pregunta:** ¿Hace falta distinguir el tipo de gasto de una campaña (anuncio, impresión, comisión) y una campaña sin gasto debe mostrar «—» en lugar de 0.00?

**Contexto:** Hay una cifra por captura con nota libre. Una campaña sin gasto muestra 0.00 aunque haya leads (el tablero ya avisa por campaña sin gasto). V10b ya cuenta como alumno inscrito a los marcados a mano para el costo por alumno (sin divisor: «—»).

**Opciones:**
- **A.** Dejarlo.
- **B.** «—» sin gasto, y un tipo de gasto opcional.

**Recomendación:** B por claridad del tablero.

**Si no se decide:** Se queda la opción A, que es lo que hace el sistema hoy.

**Dónde se cambia:** `src/reportes/costo-campana.ts` y Tableros (S a M).

**Ids origen:** I2-gasto, EK-28

- [ ] Decidido: ______

#### D-79 · Teléfonos en los CSV con apóstrofo

**Grupo:** B · **Módulo:** Tableros · **Esfuerzo:** S (horas)

**Pregunta:** En los archivos CSV, ¿se acepta el apóstrofo delante de los teléfonos (`'+5255…`)?

**Contexto:** Todo texto que empiece con +, -, = o @ lleva apóstrofo para que Excel lo trate como texto y no como fórmula (decisión de seguridad de I5). Quien abre el archivo lo ve con apóstrofo en algunas aplicaciones.

**Opciones:**
- **A.** Dejarlo.
- **B.** Quitarlo para teléfonos (abre la puerta a fórmulas maliciosas en Excel).

**Recomendación:** A.

**Si no se decide:** Se queda la opción A, que es lo que hace el sistema hoy.

**Dónde se cambia:** `src/exportacion/` (B: S).

**Ids origen:** V7-ASESOR-20, I5-csv

- [ ] Decidido: ______

#### D-80 · Pantalla de campañas y vigencia de códigos

**Grupo:** B · **Módulo:** Tableros · **Esfuerzo:** M (un día o dos)

**Pregunta:** ¿La pantalla de campañas y códigos QR se amplía (códigos sueltos, límites de usos, fechas) y un código de campaña debe vencer o tener tope de usos?

**Contexto:** La pantalla es mínima desde V7: alta, edición, baja y vista previa del QR por sucursal; los códigos de rastreo sueltos van por API. Un código sigue a su campaña (si se apaga o vence, deja de servir), sin vigencia ni tope propios. El gasto se captura en Tableros.

**Opciones:**
- **A.** Dejarla mínima.
- **B.** Ampliarla.

**Recomendación:** A hasta tener campañas reales.

**Si no se decide:** Se queda la opción A, que es lo que hace el sistema hoy.

**Dónde se cambia:** `web/src/pantallas/admin/` (B: M).

**Ids origen:** V7-ADMIN campañas, E2-código

- [ ] Decidido: ______

---

## C. Puede esperar

### D-81 · Casos raros de la página de registro

**Grupo:** C · **Módulo:** Captación · **Esfuerzo:** M (un día o dos)

**Pregunta:** ¿Qué hace la página de registro con quien ya es un lead perdido o inscrito, con teléfonos de otros países y con envíos falsos en masa?

**Contexto:** Un lead perdido o inscrito que vuelve a llenar la página no cambia de etapa, no cuenta como movimiento y no crea tarea. Acepta teléfonos de cualquier país. Contra la inundación hay límite por IP, campo trampa y rechazo de envíos de otro sitio (403), pero no token firmado, tope por organización ni CAPTCHA.

**Opciones:**
- **A.** Dejarlo así.
- **B.** Crear una tarea al volver un perdido o inscrito; aceptar solo números mexicanos; agregar token y tope por organización.

**Recomendación:** A y vigilar la bandeja de tareas la primera semana; B si aparece abuso.

**Si no se decide:** Se queda la opción A, que es lo que hace el sistema hoy.

**Dónde se cambia:** `src/captacion/landing.ts` (B: M).

**Ids origen:** EE-07, EE-08, EE-13

- [ ] Decidido: ______

### D-82 · Unir la familia si escribe desde otro teléfono

**Grupo:** C · **Módulo:** Captación · **Esfuerzo:** M (un día o dos)

**Pregunta:** Si una familia llena la página con un teléfono y escribe por WhatsApp desde otro, ¿se unen en una sola familia?

**Contexto:** Quedan dos leads ligados pero no fusionados. Unirlos se resolvería en la conversión a familia.

**Opciones:**
- **A.** Dejarlos ligados.
- **B.** Ofrecer al asesor «unir leads» con el mismo registro de cambios.

**Recomendación:** A hasta ver cuántos casos hay.

**Si no se decide:** Se queda la opción A, que es lo que hace el sistema hoy.

**Dónde se cambia:** `src/captacion/` y la ficha del asesor (B: M).

**Ids origen:** E2

- [ ] Decidido: ______

### D-83 · Sucursal del lead: del adulto o de cada niño

**Grupo:** C · **Módulo:** Captación · **Esfuerzo:** S (horas)

**Pregunta:** ¿La sucursal de interés es del lead (el adulto) o de cada niño, y puede corregirse una sucursal mal puesta?

**Contexto:** Una sola sucursal de interés por lead; poner sucursal a un lead que no tiene solo se puede una vez (cambiarla sacaría al lead del embudo de quien lo atiende) y corregir una mal puesta no tiene pantalla.

**Opciones:**
- **A.** Dejarlo.
- **B.** Permiso del administrador para corregir la sucursal, con registro.
- **C.** Pasar la sucursal al niño (cambio chico en el modelo).

**Recomendación:** B.

**Si no se decide:** Una sucursal mal puesta se corrige por SQL.

**Dónde se cambia:** `src/api/rutas/leads.ts` y la ficha (B: S; C: M).

**Ids origen:** V7-ASESOR sucursal, N3

- [ ] Decidido: ______

### D-84 · Quién recupera un lead perdido y la matriz de etapas

**Grupo:** C · **Módulo:** Captación · **Esfuerzo:** M (un día o dos)

**Pregunta:** ¿Quién puede recuperar un lead perdido, se endurecen los movimientos de etapa y hace falta una pantalla para editar la matriz?

**Contexto:** Recuperan asesor y administrador (cualquiera con `leads:escribir`), con nota obligatoria. La matriz de movimientos permitidos por etapa (permitida, solo administrador, prohibida; por omisión todo permitido) se edita solo en la base.

**Opciones:**
- **A.** Dejarlo.
- **B.** Pantalla para editar la matriz y reglas por omisión más estrictas.

**Recomendación:** A.

**Si no se decide:** Se queda la opción A, que es lo que hace el sistema hoy.

**Dónde se cambia:** Tabla `transicion_etapa` (B: M).

**Ids origen:** D7-recuperar

- [ ] Decidido: ______

### D-85 · Notas del lead sin cambiar de etapa

**Grupo:** C · **Módulo:** Captación · **Esfuerzo:** M (un día o dos)

**Pregunta:** ¿Se agrega una bitácora de notas del lead («le llamé, no contestó») sin tener que cambiar de etapa?

**Contexto:** Hoy la nota solo existe ligada a un cambio de etapa; lo demás es nota privada en Chatwoot. Es una tarea diaria del asesor.

**Opciones:**
- **A.** Seguir con notas de Chatwoot.
- **B.** Una bitácora de notas en la ficha (con cuidado: sin datos de salud).

**Recomendación:** B si la primera semana lo piden; es la queja más probable.

**Si no se decide:** Se queda la opción A, que es lo que hace el sistema hoy.

**Dónde se cambia:** Tabla y ficha nuevas (M).

**Ids origen:** V7-ASESOR-10

- [ ] Decidido: ______

### D-86 · Identificadores y códigos QR de lo dado de baja

**Grupo:** C · **Módulo:** Captación · **Esfuerzo:** M (un día o dos)

**Pregunta:** Cuando se da de baja una disciplina o un código de rastreo, ¿su identificador queda reservado para siempre o se puede reutilizar?

**Contexto:** Hoy se puede reutilizar (la prueba J7 fija eso): un QR ya impreso podría acabar apuntando a otra disciplina o campaña. Se intentó reservarlo y se revirtió para no cambiar una decisión ya tomada.

**Opciones:**
- **A.** Se puede reutilizar y al dar de baja se avisa que los QR impresos dejarán de servir.
- **B.** Reservarlo para siempre (se cambia la prueba J7 y el contrato de `DELETE`).

**Recomendación:** B: un QR impreso es dinero gastado.

**Si no se decide:** Se queda A, sin el aviso.

**Dónde se cambia:** `src/api/rutas/verticales.ts` y `codigos-rastreo` (S a M).

**Ids origen:** EK-25 (identificador de una disciplina dada de baja), EE-15 (reserva)

- [ ] Decidido: ______

### D-87 · Horario de envío por sucursal

**Grupo:** C · **Módulo:** Captación · **Esfuerzo:** M (un día o dos)

**Pregunta:** ¿Cada sucursal necesita su propio horario de envío?

**Contexto:** El horario es de la escuela y se puede estrechar (nunca salir de 9:00 a 20:00); la zona horaria sí es por sucursal.

**Opciones:**
- **A.** Uno por escuela.
- **B.** Uno por sucursal.

**Recomendación:** A salvo que dos sucursales abran a horas distintas.

**Si no se decide:** Se queda la opción A, que es lo que hace el sistema hoy.

**Dónde se cambia:** Migración y Configuración (B: M).

**Ids origen:** V5-3

- [ ] Decidido: ______

### D-88 · Conversación de un lead que se borra

**Grupo:** C · **Módulo:** Captación · **Esfuerzo:** S (horas)

**Pregunta:** Cuando se borra un lead, ¿su conversación se cierra, se borra o se conserva?

**Contexto:** Hoy nada borra leads. Si se borrara, el sistema ya lo ignora (responde 200 sin contestar); la conversación de Chatwoot queda como está.

**Opciones:**
- **A.** Conservarla.
- **B.** Cerrarla.
- **C.** Borrarla.

**Recomendación:** A. No hay forma de borrar hoy; decidir cuando exista.

**Si no se decide:** Se queda la opción A, que es lo que hace el sistema hoy.

**Dónde se cambia:** `src/captacion/` (B o C: M).

**Ids origen:** fase-1 §5 (7), A2, F1-05

- [ ] Decidido: ______

### D-89 · Mensaje que queda a medias si se cae el sistema

**Grupo:** C · **Módulo:** Captación · **Esfuerzo:** S (horas)

**Pregunta:** ¿Confirmas que un mensaje que queda a medias al caerse el sistema se entregue «a lo sumo una vez» y deje una tarea de revisión para el asesor?

**Contexto:** Un envío incierto nunca se reenvía y deja una tarea («revisión manual» o «envío incierto») para que la persona decida si le escribe al contacto. No hay alarma aparte.

**Opciones:**
- **A.** Confirmar (es lo conservador).
- **B.** Reenviar automáticamente (podría duplicar mensajes).

**Recomendación:** A.

**Si no se decide:** Se queda la opción A, que es lo que hace el sistema hoy.

**Dónde se cambia:** `src/automatizaciones/motor.ts` (B: M).

**Ids origen:** F1 §5.2

- [ ] Decidido: ______

### D-90 · Agrupar tareas y quién ve los eventos inesperados

**Grupo:** C · **Módulo:** Captación · **Esfuerzo:** M (un día o dos)

**Pregunta:** ¿Se agrupan por conversación las tareas de entrega fallida y de revisión manual, y los eventos inesperados sin lead los ve algún asesor además del administrador?

**Contexto:** Son tareas distintas, una por mensaje o por causa. Los eventos que no se pueden ligar a un lead los ve solo el administrador (`GET /api/tareas?tipo=evento_inesperado`); si los viera un asesor, habría que decidir por qué sucursal. Los que no se pueden atar a ninguna organización solo quedan en los registros.

**Opciones:**
- **A.** Dejarlo hasta ver la bandeja real.
- **B.** Agrupar por conversación y mostrar eventos inesperados a los asesores de la bandeja.

**Recomendación:** A.

**Si no se decide:** Se queda la opción A, que es lo que hace el sistema hoy.

**Dónde se cambia:** `src/api/rutas/tareas.ts` (B: M).

**Ids origen:** A5-tareas, WH-ver

- [ ] Decidido: ______

### D-91 · Lead frío: con atención humana, con baja y sus tiempos

**Grupo:** C · **Módulo:** Captación · **Esfuerzo:** S (horas)

**Pregunta:** ¿Un lead que una persona atiende debe generar igualmente la tarea de «lead frío», la baja total o de marketing debe quitarla, y son los tiempos correctos?

**Contexto:** Con una persona atendiendo no hay tarea de lead frío (se ve en estancados); la baja del contacto no quita la tarea (el asesor puede llamar a otro teléfono). Tiempos de ejemplo: 2, 3, 3, 3 y 5 días sin movimiento por etapa; hasta 3 episodios; no se persigue lo enfriado hace más de 14 días; la promoción por vencer se avisa 3 días antes. Estas automatizaciones son de marketing y no nacen sembradas en una escuela nueva.

**Opciones:**
- **A.** Dejarlo.
- **B.** Crear siempre la tarea de lead frío y quitarla con la baja.

**Recomendación:** A.

**Si no se decide:** Se queda la opción A, que es lo que hace el sistema hoy.

**Dónde se cambia:** `src/automatizaciones/` (B: S).

**Ids origen:** EG-12, D8-baja, SUP-LEAD-FRIO

- [ ] Decidido: ______

### D-92 · Respaldo por SMS si falla WhatsApp

**Grupo:** C · **Módulo:** Captación · **Esfuerzo:** L (varios días)

**Pregunta:** ¿Se reintenta por SMS cuando WhatsApp falla?

**Contexto:** Los insumos lo proponen. No está en `CLAUDE.md` ni en el SPEC y no se construye; tendría que pasar por las mismas reglas de `MessagingProvider` (horario, baja y frecuencia). Una entrega fallida hoy genera una tarea para el asesor.

**Opciones:**
- **A.** No.
- **B.** Sí, dentro de `MessagingProvider`.

**Recomendación:** A.

**Si no se decide:** No se construye.

**Dónde se cambia:** `src/mensajeria/` (B: L).

**Ids origen:** C8

- [ ] Decidido: ______

### D-93 · ¿Copiar la nota de «inscrito a mano» al registro de cambios?

**Grupo:** C · **Módulo:** Captación · **Esfuerzo:** S (horas)

**Pregunta:** ¿La nota obligatoria de «inscrito a mano» debe copiarse también al registro de cambios?

**Contexto:** Hoy la nota queda en el historial de etapas del lead y el registro de cambios apunta a esa fila (quién, cuándo, de qué etapa a inscrito). No se copia porque ese registro es de solo anexar y no se purga, y una nota libre puede mencionar la salud del niño.

**Opciones:**
- **A.** No copiar (hoy).
- **B.** Copiarla (agregar un campo a la lista permitida del registro).

**Recomendación:** A.

**Si no se decide:** Se queda la opción A, que es lo que hace el sistema hoy.

**Dónde se cambia:** `src/api/registro.ts` (B: S).

**Ids origen:** V10b-nota

- [ ] Decidido: ______

### D-94 · Un «sí» ante un único horario

**Grupo:** C · **Módulo:** Cotizador · **Esfuerzo:** S (horas)

**Pregunta:** Si el asistente ofrece un solo horario, ¿un «sí» cuenta como elegirlo?

**Contexto:** No se entiende: reintenta y a la tercera pasa al asesor.

**Opciones:**
- **A.** Como hoy.
- **B.** Entender «sí», «ok» y similares cuando hay un solo horario.

**Recomendación:** B.

**Si no se decide:** Se queda la opción A, que es lo que hace el sistema hoy.

**Dónde se cambia:** `src/captacion/maquina.ts` (S).

**Ids origen:** EC-22

- [ ] Decidido: ______

### D-95 · Clases que cruzan la medianoche

**Grupo:** C · **Módulo:** Cotizador · **Esfuerzo:** M (un día o dos)

**Pregunta:** ¿Se necesitan clases que cruzan la medianoche (por ejemplo, de 23:00 a 01:00)?

**Contexto:** No se pueden expresar: la hora de fin debe ser mayor que la de inicio.

**Opciones:**
- **A.** No.
- **B.** Permitirlas.

**Recomendación:** A.

**Si no se decide:** Se queda la opción A, que es lo que hace el sistema hoy.

**Dónde se cambia:** `src/catalogo/` (B: M).

**Ids origen:** EC-18

- [ ] Decidido: ______

### D-96 · Salones migrados con nombres casi iguales

**Grupo:** C · **Módulo:** Cotizador · **Esfuerzo:** S (horas)

**Pregunta:** ¿Quién fusiona los salones heredados con nombres casi iguales?

**Contexto:** La verificación `salonesConNombreParecido` los lista; los nuevos se rechazan, los viejos no se fusionan solos.

**Opciones:**
- **A.** El administrador los revisa a mano.
- **B.** Una herramienta de fusión.

**Recomendación:** A.

**Si no se decide:** Se queda la opción A, que es lo que hace el sistema hoy.

**Dónde se cambia:** Administración → Instructores y salones (A: S).

**Ids origen:** EC-05

- [ ] Decidido: ______

### D-97 · Maestro reprograma o cancela una clase muestra

**Grupo:** C · **Módulo:** Clase muestra · **Esfuerzo:** S (horas)

**Pregunta:** ¿El maestro puede reprogramar o cancelar una clase muestra?

**Contexto:** No: no tiene el permiso de escribir clases; solo asesor y administrador. Si un cambio lo hace una persona, la familia recibe un aviso de servicio (decisión de V2).

**Opciones:**
- **A.** Solo asesor y administrador.
- **B.** Darle el permiso al maestro.

**Recomendación:** A.

**Si no se decide:** Se queda la opción A, que es lo que hace el sistema hoy.

**Dónde se cambia:** `src/api/permisos.ts` (S).

**Ids origen:** V2-5

- [ ] Decidido: ______

### D-98 · Nombre de la bandera de contacto de urgencia

**Grupo:** C · **Módulo:** Inscripción · **Esfuerzo:** S (horas)

**Pregunta:** ¿Se acepta que la bandera de contacto de urgencia se llame `es_contacto_urgencia` y no «contacto de emergencia»?

**Contexto:** El nombre original contiene una raíz que la guarda de datos de salud prohíbe; no se debilitó la guarda. Es un nombre interno que no sale en pantalla.

**Opciones:**
- **A.** Aceptarlo.
- **B.** Renombrar la guarda para permitir el nombre original.

**Recomendación:** A.

**Si no se decide:** Se queda la opción A, que es lo que hace el sistema hoy.

**Dónde se cambia:** `scripts/check-sensibles.ts` (B).

**Ids origen:** F1-nombre

- [ ] Decidido: ______

### D-99 · Pantalla del maestro en celular

**Grupo:** C · **Módulo:** Operación · **Esfuerzo:** M (un día o dos)

**Pregunta:** ¿Se rehace la pantalla del maestro para pasar lista en 3 toques, mostrar la contraseña, ofrecer una cola de guardado sin señal, quitar el doble botón de guardar o presentar el registro por pasos?

**Contexto:** Hoy pasar lista con una falta son 4 toques (3 si todos vinieron); para 3, el pase tendría que ser lo primero que ve el maestro. No hay «mostrar contraseña». Sin señal no hay cola automática: lo escrito se conserva en pantalla y se reintenta a mano (una cola pediría guardar datos de menores en el teléfono). Cada sección del registro tiene «Guardar esta sección» y hay un «Guardar borrador» fijo. El registro largo es una página con secciones plegables.

**Opciones:**
- **A.** Dejarlo y observar al maestro real una semana.
- **B.** Hacer del pase de lista el inicio del maestro y agregar «mostrar contraseña».
- **C.** Registro por pasos (una cosa por pantalla).

**Recomendación:** A; B si los maestros pasan lista a diario.

**Si no se decide:** Se queda la opción A, que es lo que hace el sistema hoy.

**Dónde se cambia:** `web/src/pantallas/maestro/` (B: S; C: M). Capturas en `docs/capturas/`.

**Ids origen:** V7-MAESTRO-14, V7-MAESTRO-17, V7-MAESTRO-18, V7-MAESTRO cola, J2

- [ ] Decidido: ______

### D-100 · El maestro y los precios

**Grupo:** C · **Módulo:** Operación · **Esfuerzo:** M (un día o dos)

**Pregunta:** ¿El maestro puede ver precios, promociones e instructores?

**Contexto:** Sí: comparte el permiso de leer el catálogo. La propuesta de la auditoría es un permiso aparte de precios que no incluya al maestro.

**Opciones:**
- **A.** Dejarlo.
- **B.** Separar el permiso de precios y quitárselo al maestro.

**Recomendación:** B si la escuela no quiere que los maestros vean precios.

**Si no se decide:** Se queda la opción A, que es lo que hace el sistema hoy.

**Dónde se cambia:** `src/api/permisos.ts` (B: M, cambia la matriz).

**Ids origen:** EC-10

- [ ] Decidido: ______

### D-101 · Un solo horario para una disciplina en una sucursal

**Grupo:** C · **Módulo:** Tableros · **Esfuerzo:** S (horas)

**Pregunta:** ¿Se abre otro horario para la disciplina y rango de edad de Centenario que hoy depende de un solo horario (martes y jueves a las 5:00 pm)?

**Contexto:** Un solo grupo. El contexto (§13) dice medir la ocupación antes de decidir; el tablero de ocupación marca los grupos «a reventar» (90 %) y «vacíos» (25 %).

**Opciones:**
- **A.** Medir con el tablero.
- **B.** Abrir otro horario ya.

**Recomendación:** A.

**Si no se decide:** Se queda un horario.

**Dónde se cambia:** Tablero de ocupación y Administración → Grupos y horarios (S).

**Ids origen:** CTX-13

- [ ] Decidido: ______

### D-102 · Excepciones al invariante 4 (mensajes fuera de MessagingProvider)

**Grupo:** C · **Módulo:** Varios · **Esfuerzo:** S (horas)

**Pregunta:** ¿Se deja por escrito que dos piezas quedan fuera de `MessagingProvider` —el directorio de agentes de Chatwoot sin mandar mensajes y el reenviador de Twilio— o se mueven detrás de él?

**Contexto:** Ninguna de las dos inicia mensajes: una lee quiénes son los agentes y la otra reenvía lo que Twilio manda (entrantes y estados). Pero por la letra del invariante 4 («nadie llama a Twilio ni a Chatwoot fuera de él») son excepción. `CLAUDE.md` no se ha tocado; están anotadas en las bitácoras. La sonda de salud también llama a Chatwoot.

**Opciones:**
- **A.** Ampliar el invariante 4 a «mensajes» y anotar las excepciones acotadas (`src/mensajeria/twilio/` y el directorio de agentes).
- **B.** Moverlas detrás de una interfaz de `MessagingProvider`.

**Recomendación:** A. Es la lectura fiel de lo que el invariante cuida (que ninguna regla de ventana, horario o baja se salte) y no requiere código.

**Si no se decide:** Queda como excepción anotada en las bitácoras.

**Dónde se cambia:** `CLAUDE.md` (lo decides tú; yo no lo toco). S.

**Ids origen:** EB-10

- [ ] Decidido: ______

### D-103 · Una cuenta de Twilio por organización

**Grupo:** C · **Módulo:** Varios · **Esfuerzo:** L (varios días)

**Pregunta:** ¿Cuándo se permite que cada organización tenga su propia cuenta de Twilio?

**Contexto:** Hay un solo token de Twilio por despliegue y el registro de eventos de Twilio es global (un mensaje de otra organización se tomaría por repetido). Hoy existe una sola organización y `CLAUDE.md` prohíbe construir el alta de organizaciones. Hace falta cuando llegue la segunda escuela.

**Opciones:**
- **A.** Esperar a la segunda escuela.
- **B.** Construirlo ya (resolver el token por el número receptor antes de validar la firma).

**Recomendación:** A.

**Si no se decide:** Se queda un token por despliegue.

**Dónde se cambia:** `src/mensajeria/twilio/` y `evento_twilio` (B: L).

**Ids origen:** EA-21, CRED-3.5

- [ ] Decidido: ______

### D-104 · Doble verificación para administradores y tope por cuenta

**Grupo:** C · **Módulo:** Varios · **Esfuerzo:** S (horas)

**Pregunta:** ¿Se pide la contraseña actual (o un segundo factor) para crear administradores y cambiar roles, y se agrega un tope de intentos por cuenta además del de IP?

**Contexto:** Para cambiar la propia contraseña ya se pide la actual; para crear administradores y cambiar roles solo se pide la sesión. El bloqueo de 5 intentos en 15 minutos es por correo y IP juntos (un tope solo por cuenta bloquearía a la persona legítima). No hay 2FA (decisión 11: correo y contraseña con roles). El administrador y el maestro ven la salud de menores.

**Opciones:**
- **A.** Dejarlo.
- **B.** Pedir la contraseña actual para crear administradores y cambiar roles.
- **C.** B, más segundo factor para administrador y maestro.

**Recomendación:** B ahora; C cuando haya salud real en producción.

**Si no se decide:** Quien robe una sesión de administrador puede crear otro administrador.

**Dónde se cambia:** `src/api/rutas/usuarios.ts` (B: S; C: L).

**Ids origen:** EB-02, EB-03

- [ ] Decidido: ______

### D-105 · Cuánto se conserva el registro de accesos y cambios

**Grupo:** C · **Módulo:** Varios · **Esfuerzo:** M (un día o dos)

**Pregunta:** ¿Cuánto tiempo se conservan el registro de accesos a salud, el registro de cambios y las constancias de eventos inesperados?

**Contexto:** Son tablas de solo anexar y no se purgan (las sesiones caducan a los 30 días, los intentos de entrada a las 48 horas, y las constancias de eventos sin organización a los 30 días con tope de 500 por día). El registro de cambios no guarda nombres ni valores, justamente para poder conservarse. Depende de la política de la escuela y del aviso de privacidad.

**Opciones:**
- **A.** Conservarlos siempre.
- **B.** Fijar una retención (2 a 5 años) y purgar con borrado lógico.

**Recomendación:** B con 5 años, tras confirmar con el abogado.

**Si no se decide:** Crecen sin límite.

**Dónde se cambia:** `src/seguridad/` y un barrido nuevo (B: M).

**Ids origen:** EB-19, EG-20, K3-EB19

- [ ] Decidido: ______

### D-106 · Ratificar excepciones a reglas de organización y bajas

**Grupo:** C · **Módulo:** Varios · **Esfuerzo:** S (horas)

**Pregunta:** ¿Ratificas que las tablas de solo anexar sean la excepción declarada a «soft delete en todo», qué pasa al dar de baja una organización, que el inicio de sesión no pida el identificador de la organización mientras haya una sola, y las excepciones de `sistema.ts` al aislamiento?

**Contexto:** Registro de cambios, accesos a salud, aceptaciones legales e historiales no admiten ni baja lógica (la base lo impide). Dar de baja una organización mata sus sesiones; el resto no se define. El identificador de la organización se puede omitir mientras haya una sola viva. Seis excepciones al scope viven en `src/datos/sistema.ts` (documentadas).

**Opciones:**
- **A.** Ratificar las cuatro como están.
- **B.** Exigir ya el identificador de la organización al entrar y definir la baja completa de una organización.

**Recomendación:** A mientras haya una sola escuela.

**Si no se decide:** Quedan como están.

**Dónde se cambia:** `CLAUDE.md` y `src/auth/` (B: M).

**Ids origen:** EB §8.4, EB §8.5, EB §8.6, EB §8.10

- [ ] Decidido: ______

### D-107 · Límites de peticiones con varias réplicas

**Grupo:** C · **Módulo:** Varios · **Esfuerzo:** M (un día o dos)

**Pregunta:** Cuando haya más de una réplica del sistema, ¿el límite de peticiones se lleva a Redis o a la base, o se deja al balanceador y al firewall?

**Contexto:** Hoy el límite vive en la memoria de cada proceso (el del inicio de sesión ya está en la base). Límites actuales por IP y por minuto: inicio de sesión 10, API 600, página de registro 30. Con un balanceador hay que definir `TRUST_PROXY=1` o todos se verán con la IP del balanceador.

**Opciones:**
- **A.** Dejarlo al balanceador y al firewall web.
- **B.** Llevarlo a la base.

**Recomendación:** A mientras haya una réplica; decidir antes de la segunda.

**Si no se decide:** Quedan en memoria.

**Dónde se cambia:** `src/http/config-limites.ts` y `infra/` (B: M).

**Ids origen:** EB §8.9, SUP-LIMITES

- [ ] Decidido: ______

### D-108 · Liberar un bloqueo de acceso

**Grupo:** C · **Módulo:** Varios · **Esfuerzo:** S (horas)

**Pregunta:** ¿El administrador debe poder liberar a alguien bloqueado por contraseñas equivocadas?

**Contexto:** Hoy el bloqueo se libera solo a los 15 minutos; la pantalla de usuarios lo avisa.

**Opciones:**
- **A.** Esperar los 15 minutos.
- **B.** Un botón «Liberar» con registro de cambios.

**Recomendación:** B.

**Si no se decide:** Se queda la opción A, que es lo que hace el sistema hoy.

**Dónde se cambia:** `src/auth/` y Administración → Usuarios y roles (S).

**Ids origen:** V7-ADMIN-30

- [ ] Decidido: ______

### D-109 · Dos administradores que editan lo mismo

**Grupo:** C · **Módulo:** Varios · **Esfuerzo:** L (varios días)

**Pregunta:** ¿Se agrega control de versión para que dos administradores que editan lo mismo no se pisen?

**Contexto:** Hoy gana el último. Exigiría una columna de versión en unas 15 tablas y mensajes de conflicto en cada pantalla; con dos sucursales y un administrador a la vez no se justifica.

**Opciones:**
- **A.** No por ahora.
- **B.** Agregarlo.

**Recomendación:** A.

**Si no se decide:** Gana el último.

**Dónde se cambia:** Migración y pantallas (B: L).

**Ids origen:** EK-25 (versión)

- [ ] Decidido: ______

### D-110 · Sesión vencida a media captura en formularios cortos

**Grupo:** C · **Módulo:** Varios · **Esfuerzo:** M (un día o dos)

**Pregunta:** ¿Los formularios cortos de asesor, recepción y administrador conservan lo escrito si la sesión vence a media captura?

**Contexto:** Los borradores en memoria solo cubren el registro del maestro (lo más largo); en los demás se pierde lo escrito. Extenderlo tiene riesgo de datos de menores en memoria.

**Opciones:**
- **A.** Dejarlo.
- **B.** Extender los borradores en memoria a todos los formularios (sin tocar el almacenamiento del navegador).

**Recomendación:** A.

**Si no se decide:** Se queda la opción A, que es lo que hace el sistema hoy.

**Dónde se cambia:** `web/src/lib/borradores.ts` (B: M).

**Ids origen:** EK-26 (sesión vencida)

- [ ] Decidido: ______

### D-111 · Nombres de módulos, texto de «grupo lleno» y fuentes en pantalla

**Grupo:** C · **Módulo:** Varios · **Esfuerzo:** S (horas)

**Pregunta:** ¿Se ajustan a las palabras de la escuela los nombres y ayudas de los módulos, el texto de la tarea «avisar al asesor» cuando el grupo está lleno y los nombres de las fuentes (Facebook, Instagram, «En sucursal (QR)», «Página de captación»)?

**Contexto:** Los nombres y las ayudas de los módulos viven en `src/modulos/index.ts`; «Avisar al asesor» crea la misma tarea de «listo para cerrar» y no dice que el grupo estaba lleno; las fuentes están en `FUENTES` (`Embudo.tsx`) y el código viene del servidor. La barra del celular muestra 4 secciones y «Más».

**Opciones:**
- **A.** Dejarlos.
- **B.** Cambiarlos en la sesión de revisión de textos.

**Recomendación:** B (cuestan minutos).

**Si no se decide:** Se quedan.

**Dónde se cambia:** `src/modulos/index.ts`, `web/src/pantallas/asesor/Embudo.tsx`. S.

**Ids origen:** V1-3, V4-2, SUP-INTERFAZ

- [ ] Decidido: ______

### D-112 · Teléfonos más fáciles de leer en pantalla

**Grupo:** C · **Módulo:** Varios · **Esfuerzo:** S (horas)

**Pregunta:** ¿Se permite una función solo de presentación que muestre los teléfonos agrupados («55 3055 9109»)?

**Contexto:** Hoy se ven como «+525530559109», difíciles de leer o dictar. El invariante 7 dice que ningún otro código toca el formato del teléfono.

**Opciones:**
- **A.** Dejarlo.
- **B.** Una función de presentación que no cambie lo guardado, junto a `normalizarTelefono()`.

**Recomendación:** B (es solo mostrar). Pide tu visto bueno por el invariante.

**Si no se decide:** Se queda la opción A, que es lo que hace el sistema hoy.

**Dónde se cambia:** `src/lib/telefono.ts` y la interfaz (S).

**Ids origen:** V7-RECEPCION-19

- [ ] Decidido: ______

### D-113 · Pantallas para niveles, productos, eventos y documentos legales

**Grupo:** C · **Módulo:** Varios · **Esfuerzo:** M (un día o dos)

**Pregunta:** ¿Se hacen pantallas para niveles, eventos, productos y documentos legales, que hoy se editan solo por API?

**Contexto:** Están detrás de módulos apagados el primer día. Los documentos legales publicados por API alcanzan para el aviso, el reglamento y la imagen.

**Opciones:**
- **A.** Esperar a que el uso lo pida.
- **B.** Hacerlas por prioridad: documentos legales primero.

**Recomendación:** B para documentos legales; A para lo demás.

**Si no se decide:** Se queda por API.

**Dónde se cambia:** `web/src/pantallas/admin/` (M por pantalla).

**Ids origen:** V5-2

- [ ] Decidido: ______

### D-114 · Carga desde Excel: fecha de inicio por grupo y más hojas

**Grupo:** C · **Módulo:** Varios · **Esfuerzo:** M (un día o dos)

**Pregunta:** ¿La escuela necesita «fecha de inicio» por grupo y que la carga cree también promociones, productos, canales, usuarios y documentos legales?

**Contexto:** El modelo no tiene fecha de inicio por grupo (existe en la inscripción). La carga actual no crea canales de WhatsApp, usuarios, promociones, productos ni documentos legales (llevan números verificados, contraseñas o textos legales).

**Opciones:**
- **A.** Dejarlo; usar las pantallas.
- **B.** Hojas de promociones y productos.
- **C.** Fecha de inicio de ciclo por grupo (migración y regla del cotizador).

**Recomendación:** A; B si la escuela trae muchas promociones o productos.

**Si no se decide:** Se queda la opción A, que es lo que hace el sistema hoy.

**Dónde se cambia:** `src/catalogo/importacion/` (B: M; C: L).

**Ids origen:** V6-1, V6-2

- [ ] Decidido: ______

### D-115 · Dónde aterriza el administrador

**Grupo:** C · **Módulo:** Varios · **Esfuerzo:** S (horas)

**Pregunta:** ¿El administrador debe entrar a Administración mientras falten pasos por completar?

**Contexto:** Entra al embudo, con un aviso corto «Para empezar» y un enlace a los pasos.

**Opciones:**
- **A.** Embudo con aviso (hoy).
- **B.** Administración mientras falten pasos.

**Recomendación:** A.

**Si no se decide:** Se queda la opción A, que es lo que hace el sistema hoy.

**Dónde se cambia:** `web/src/navegacion.ts` (S).

**Ids origen:** V7 aterrizaje

- [ ] Decidido: ______

### D-116 · Gates de las Fases 2 y 3 del SPEC

**Grupo:** C · **Módulo:** Varios · **Esfuerzo:** S (horas)

**Pregunta:** ¿Se aprueban los gates en borrador de las Fases 2 y 3 de `SPEC.md` y el gate nuevo de atribución de la Fase 1?

**Contexto:** Los gates los marca Eduardo; los de las Fases 2 y 3 son un borrador del implementador. Ninguna casilla está marcada.

**Opciones:**
- **A.** Revisarlos y marcarlos tú.
- **B.** Posponerlos.

**Recomendación:** A cuando termines de decidir el grupo A.

**Si no se decide:** Ninguna casilla marcada.

**Dónde se cambia:** `SPEC.md` (S).

**Ids origen:** A8

- [ ] Decidido: ______

### D-117 · Datos de ejemplo en la demo

**Grupo:** C · **Módulo:** Varios · **Esfuerzo:** S (horas)

**Pregunta:** ¿Se llena la base de la demo con alumnos, pagos y asistencias de ejemplo (`npm run demo:datos`)?

**Contexto:** Llena tareas y reportes con unos 300 alumnos y seis meses de historia (cientos de tareas de cobranza). Los porcentajes del generador (50 % puntual, 25 % parcial, 15 % tardío, 10 % moroso; 12 % de bajas; 40 % compra un producto; asistencia de 55 a 98 %) son de ejemplo. Solo se ha corrido contra una copia. V12 reconstruye la demo desde cero.

**Opciones:**
- **A.** No sobre la demo principal; solo en copias.
- **B.** Sí, con `--confirmar-base-de-demo`.

**Recomendación:** A.

**Si no se decide:** No se corre.

**Dónde se cambia:** `npm run demo:datos` (S).

**Ids origen:** I4-demo, SUP-DEMO

- [ ] Decidido: ______

### D-118 · Cobros que se generan con Finanzas apagada

**Grupo:** C · **Módulo:** Finanzas · **Esfuerzo:** S (horas)

**Pregunta:** ¿Con Finanzas apagada se siguen generando los cargos al inscribir o convertir, y qué se hace con ellos al encender el módulo?

**Contexto:** Hoy inscribir o convertir con Finanzas apagada CREA los cargos (inscripción y primera mensualidad) aunque nadie los ve (`GET /api/cargos` da 404). Al encender Finanzas semanas después, el barrido los vuelve vencidos de golpe y crea la tarea de deuda vencida.

**Opciones:**
- **A.** Seguir generándolos siempre, para no perder la obligación, y al encender Finanzas empezar la cobranza de lo atrasado de forma gradual (hoy sale todo junto).
- **B.** Generarlos solo con Finanzas encendida: sin el módulo no nace ningún cargo y quien inscribe recibe un aviso de que el cobro hay que llevarlo aparte.
- **C.** Generarlos siempre pero marcados «sin cobrar todavía»: al encender el módulo la escuela decide cuáles cobrar.

**Recomendación:** A con aviso al encender: no se pierde ninguna obligación.

**Si no se decide:** Se queda la opción A tal como está hoy, sin el aviso al encender.

**Dónde se cambia:** `src/inscripciones/inscribir.ts` (`crearCargosAlInscribir`) y `src/finanzas/barrido.ts` (M).

**Ids origen:** EV-02

- [ ] Decidido: ______

### D-119 · Qué se recupera al encender un módulo que estuvo apagado

**Grupo:** C · **Módulo:** Finanzas · **Esfuerzo:** M (días)

**Pregunta:** Cuando Finanzas (o cualquier módulo que corre solo) estuvo apagado semanas, ¿qué debe ponerse al corriente al encenderlo?

**Contexto:** Ya se corrigió el TEXTO de la guía y del diálogo de apagar (lo guardado se conserva; lo que pasó en ese tiempo no se recupera). Lo que el sistema hace: solo genera la mensualidad del mes en curso, los meses que pasaron nunca se generan y los recordatorios programados durante el apagón quedan omitidos, así que un cargo que sigue vencido puede no recibir nunca su primer recordatorio por WhatsApp. Un mes apagado es un mes sin cobrar en el sistema.

**Opciones:**
- **A.** No recuperar nada (hoy): la escuela cobra a mano lo de ese tiempo; el aviso del diálogo ya lo dice.
- **B.** Al encender, generar las mensualidades de los meses faltantes de cada inscripción activa y reprogramar los recordatorios de lo que siga vencido.
- **C.** Ofrecer un botón «Ponerse al corriente» en Módulos que muestra qué se generaría y deja a la escuela confirmarlo.

**Recomendación:** C: la escuela ve qué se generaría antes de que pase.

**Si no se decide:** Se queda la opción A (nada se recupera solo) y el aviso del diálogo.

**Dónde se cambia:** `src/finanzas/barrido.ts`, `src/finanzas/cargos.ts`, `web/src/pantallas/admin/Modulos.tsx` (M).

**Ids origen:** EV-03

- [ ] Decidido: ______

### D-120 · Inscripción sin Clase muestra: dónde se acepta el reglamento

**Grupo:** C · **Módulo:** Inscripción · **Esfuerzo:** S (horas)

**Pregunta:** ¿Se puede tener la Inscripción encendida con la Clase muestra apagada?

**Contexto:** Hoy el reglamento solo se acepta en las pantallas de clase muestra. El administrador puede apagar Clase muestra con Inscripción encendida (la API lo permite); después inscribir o convertir una familia nueva da «Falta que la familia acepte el reglamento» y la pantalla donde se acepta devuelve «No disponible». La escuela se queda sin poder inscribir a una familia nueva.

**Opciones:**
- **A.** Agregar la dependencia: Inscripción necesita Clase muestra (no se puede apagar una con la otra encendida).
- **B.** Crear una ruta para aceptar el reglamento dentro de Inscripción, para que no dependa de la clase muestra.
- **C.** Dejarlo como está y explicarlo en la guía del administrador.

**Recomendación:** B: es lo que menos cambia lo que ya funciona.

**Si no se decide:** Se queda la opción C (como hoy).

**Dónde se cambia:** `src/modulos/index.ts` (dependencias y el CHECK de la base) o `src/api/rutas/legal.ts` (M).

**Ids origen:** EV-04

- [ ] Decidido: ______

### D-121 · Lo que dice el asistente cuando el Cotizador está apagado

**Grupo:** C · **Módulo:** Cotizador · **Esfuerzo:** S (horas)

**Pregunta:** Con el Cotizador apagado (y con solo la captación, el arranque de la escuela), ¿el asistente de WhatsApp y la página de registro pueden decir «te damos horarios y costos exactos»?

**Contexto:** El plan dice que sin cotizador el asistente no ofrece horarios ni precios. Hoy el cierre dice «un asesor te escribe con horarios y costos» y la página de registro, «te escribimos por WhatsApp con horarios y costos». Es el texto del asistente SIN cotizador (ya existía) y la bitácora de V1 lo dejó como diseño.

**Opciones:**
- **A.** Dejarlo: es una promesa de que el asesor dará los horarios, no una oferta del asistente.
- **B.** Cambiarlo a un texto sin mencionar horarios ni costos («un asesor te escribe para ayudarte») cuando el Cotizador está apagado.

**Recomendación:** B, para ser literales con el plan.

**Si no se decide:** Se queda la opción A (el texto de hoy).

**Dónde se cambia:** `src/captacion/` (textos del asistente), `src/http/landing-html.ts` (S).

**Ids origen:** EV-12

- [ ] Decidido: ______

### D-122 · Etapas «Clase muestra agendada / asistida» con Clase muestra apagada

**Grupo:** C · **Módulo:** Clase muestra · **Esfuerzo:** S (horas)

**Pregunta:** Con solo la captación, ¿se siguen listando esas dos etapas y se puede mover un lead a ellas a mano?

**Contexto:** Hoy siguen listadas y mover un lead a ellas responde 200. «Inscrito» sí se oculta cuando la Inscripción está apagada (V10b).

**Opciones:**
- **A.** Dejarlas como etapas manuales: el asesor las puede usar aunque el módulo esté apagado.
- **B.** Ocultarlas y rechazar el movimiento mientras Clase muestra esté apagada, como se hizo con «Inscrito».

**Recomendación:** A: no estorban y algunas escuelas agendan clases muestra a mano.

**Si no se decide:** Se queda la opción A (como hoy).

**Dónde se cambia:** `src/embudo/transiciones.ts`, `src/api/rutas/etapas.ts` (S).

**Ids origen:** EV-13

- [ ] Decidido: ______

### D-123 · Administración con módulos apagados: ¿qué se sigue mostrando?

**Grupo:** C · **Módulo:** Varios · **Esfuerzo:** M (días)

**Pregunta:** ¿Administración debe esconder por completo lo de los módulos apagados o seguir mostrándolo con el aviso «En pausa»?

**Contexto:** Hoy Administración sigue mostrando y editando lo de módulos apagados (promociones con uniforme, automatizaciones, plantillas, textos del asistente, límites de cotización, clase muestra y tablero, motivos de baja, «Cargar catálogo» con precios, ayuda de Grupos con «lista de espera»), con avisos «En pausa» o «apagado». `GET /api/configuracion` y `GET /api/textos-bot` devuelven también esos ajustes. El plan dice «no aparece en la interfaz» para lo apagado.

**Opciones:**
- **A.** Dejarlo con los avisos (hoy): permite preparar un módulo antes de encenderlo.
- **B.** Esconder por módulo todo lo que lo mencione y no devolverlo por la API.
- **C.** Esconder lo que da miedo (precios, uniformes, automatizaciones) y dejar la configuración general.

**Recomendación:** A: preparar antes de encender es justo para lo que sirve apagar.

**Si no se decide:** Se queda la opción A (como hoy).

**Dónde se cambia:** `web/src/pantallas/admin/`, `src/api/rutas/configuracion.ts`, `src/api/rutas/textos-bot.ts` (L).

**Ids origen:** EV-14

- [ ] Decidido: ______

### D-124 · Registro de la clase muestra con Finanzas u Operación apagadas

**Grupo:** C · **Módulo:** Clase muestra · **Esfuerzo:** S (horas)

**Pregunta:** ¿El registro del alumno que llena el maestro debe seguir pidiendo «Talla de uniforme» y «Nivel observado en la clase» con Finanzas u Operación apagadas?

**Contexto:** Hoy sigue pidiéndolos aunque el uniforme (Finanzas) y los niveles (Operación) no estén encendidos; los datos se guardan para cuando se enciendan.

**Opciones:**
- **A.** Seguir pidiéndolos: se capturan una sola vez y no hay que volver a preguntar (cero recaptura).
- **B.** Esconder cada campo mientras su módulo esté apagado.

**Recomendación:** A, por la regla de no recapturar.

**Si no se decide:** Se queda la opción A (como hoy).

**Dónde se cambia:** `web/src/pantallas/maestro/` y el esquema del registro de clase muestra (S).

**Ids origen:** EV-17

- [ ] Decidido: ______

### D-125 · Registro de cambios y accesos con módulos apagados

**Grupo:** C · **Módulo:** Varios · **Esfuerzo:** S (horas)

**Pregunta:** ¿El administrador debe seguir viendo en el registro de cambios y en los accesos lo que pasó en módulos que hoy están apagados?

**Contexto:** `GET /api/registro-cambios` (importes, productos, ids) y `GET /api/salud-accesos` siguen mostrando datos de módulos apagados. Puede ser deseable como bitácora de auditoría.

**Opciones:**
- **A.** Dejarlo: es una bitácora, no una pantalla del módulo.
- **B.** Filtrarlo por módulo encendido, como las tareas.

**Recomendación:** A: una bitácora de auditoría no debe desaparecer al apagar algo.

**Si no se decide:** Se queda la opción A (como hoy).

**Dónde se cambia:** `src/api/rutas/registro-cambios.ts`, `src/api/rutas/salud.ts` (S).

**Ids origen:** EV-20

- [ ] Decidido: ______

### D-126 · Qué enlaces se permiten en los textos del asistente

**Grupo:** C · **Módulo:** Varios · **Esfuerzo:** S (horas)

**Pregunta:** ¿El filtro de enlaces de los textos del asistente debe ser una lista corta de dominios o rechazar todo lo que parezca un enlace?

**Contexto:** Hoy el filtro reconoce una lista corta de dominios: pasan `promo.xyz`, `.shop`, `.store`, `.dev`, `.ai`, y también `tel:`, `mailto:`, `whatsapp://` y el carácter invisible U+202E. No hay riesgo de código (la pantalla escapa todo y un `http://` metido por SQL no llega al asistente porque el lector lo revalida).

**Opciones:**
- **A.** Dejar el filtro de hoy.
- **B.** Rechazar cualquier texto con aspecto de enlace (con punto y dos letras, o con esquema) y los caracteres de dirección invisibles.

**Recomendación:** B: es más simple de explicar a la escuela.

**Si no se decide:** Se queda la opción A (como hoy).

**Dónde se cambia:** `src/api/rutas/textos-bot.ts` y `src/captacion/textos.ts` (S).

**Ids origen:** EV-25

- [ ] Decidido: ______

### D-127 · Qué perdona la marca de demo al arrancar y qué pasa sin NODE_ENV

**Grupo:** C · **Módulo:** Varios · **Esfuerzo:** S (horas)

**Pregunta:** ¿Hasta dónde debe perdonar ENTORNO_DEMO=si al arrancar, y qué debe hacer el sistema si NODE_ENV no está definido?

**Contexto:** Ya se corrigió lo que no es de política: NODE_ENV se lee sin distinguir mayúsculas y un valor desconocido (`prod`, `staging`) cuenta como producción con todas sus negativas; ENTORNO_DEMO=si no deja arrancar si la base no es local o del compose; hay una prueba que impide que `infra/` defina variables de demo, ensayo o pruebas. Falta decidir: con ENTORNO_DEMO=si hoy siguen permitidas las variables del ensayo y del reloj de pruebas (PRUEBAS_AHORA), y sin NODE_ENV el sistema se comporta como desarrollo.

**Opciones:**
- **A.** Dejarlo como está.
- **B.** Que ENTORNO_DEMO=si perdone solo los valores públicos de la demo (claves y contraseñas) y nunca el reloj de pruebas.
- **C.** Además, tratar un NODE_ENV sin definir como producción en cualquier arranque de servidor (`npm run dev` ya lo define).

**Recomendación:** B y C juntas: lo más cerrado y sin costo para la demo.

**Si no se decide:** Se queda la opción A con las correcciones ya hechas.

**Dónde se cambia:** `src/seguridad/entorno.ts` (S).

**Ids origen:** EV-28

- [ ] Decidido: ______

### D-128 · Una etapa propia del embudo antes de «Nuevo»

**Grupo:** C · **Módulo:** Varios · **Esfuerzo:** S (horas)

**Pregunta:** ¿Una etapa propia puede ordenarse antes de «Nuevo» y volverse la etapa inicial de todo lead nuevo?

**Contexto:** Hoy sí: la etapa inicial es la primera por orden que no es de cierre; si la escuela pone una propia primero, el asistente y la página de registro dejan ahí a todos los leads nuevos.

**Opciones:**
- **A.** Dejarlo: es la escuela quien decide dónde empieza el embudo.
- **B.** No permitir que una propia quede antes de las de sistema: la inicial siempre es «Nuevo».

**Recomendación:** B: evita que un orden mal puesto cambie por dónde entran las familias.

**Si no se decide:** Se queda la opción A (como hoy).

**Dónde se cambia:** `src/embudo/etapas.ts` y `src/api/rutas/etapas.ts` (orden) (S).

**Ids origen:** EV-30

- [ ] Decidido: ______

---

## Ya decidido

Para que no se vuelvan a preguntar. Fuentes: `docs/PLAN-V1.md`, `docs/PLAN-NOCHE-2.md`, `docs/PLAN-NOCHE.md` y las instrucciones de los bloques V10 y V10b.

| Origen | Decisión tomada |
|---|---|
| PLAN-V1, 1 | La escuela arranca con captación: asistente de tres preguntas, pase al asesor, tareas, embudo y reporte de leads. Lo demás se enciende por módulos |
| PLAN-V1, 2 | Módulos por organización: captación, cotizador, clase muestra, inscripción, operación (asistencia, niveles y eventos), finanzas y tableros; uno apagado no aparece, no responde, no corre y el asistente no lo ofrece |
| PLAN-V1, 3 | En la organización de demo todo encendido; en la plantilla de una organización nueva, solo captación |
| PLAN-V1, 4 | Reprogramar o cancelar una clase muestra por una persona sí avisa a la familia, como aviso de servicio (hecho en V2) |
| PLAN-V1, 5 | Un lead sin sucursal lo ven todos los asesores de la organización hasta que tenga sucursal |
| PLAN-V1, 6 | Una promoción no acumulable no se combina con ninguna otra |
| PLAN-V1, 7 | En desarrollo local se aceptan `localhost` y `127.0.0.1`; en producción solo `ORIGEN_PUBLICO` |
| V10b (instrucción) | Con la inscripción apagada el asesor o el administrador marca «Inscrito» a mano, con nota obligatoria y registro de quién; con la inscripción encendida solo se llega inscribiendo; el reporte de leads y el costo por campaña cuentan los dos casos |
| V10 (instrucción) | La prueba intermitente de pagos se resuelve con la causa raíz y una prueba que falla siempre sin el arreglo, sin reintentos ni aserciones relajadas |
| PLAN-NOCHE-2, 1 | Lead a medias: aviso a los 30 minutos, visible no atendido (los 72 h se revirtieron) |
| PLAN-NOCHE-2, 2 | Quien se dio de baja y vuelve a escribir: tarea para el asesor; el asistente sigue callado |
| PLAN-NOCHE-2, 3 | Entrega fallida: tarea para el asesor |
| PLAN-NOCHE-2, 4 | Frecuencia: máximo 3 mensajes automáticos por teléfono al día y 1 de marketing cada 7 días; configurable por organización |
| PLAN-NOCHE-2, 5 | Atribución: firma validada en el borde (A7); la vía A o C se decide al probar con Twilio real (D-01) |
| PLAN-NOCHE-2, 6 | Precios, cupos, duraciones, direcciones, edades y salones: valores de ejemplo `[SUPUESTO]` en los seeds, editables desde administración, ninguno en código |
| PLAN-NOCHE-2, 7 | Quién cierra la inscripción: se construyen los dos modos; por defecto el asesor por WhatsApp (queda por elegir cuál usa la escuela: D-49) |
| PLAN-NOCHE-2, 8 | Sucursal sin el programa buscado: configurable; por defecto se ofrece la otra |
| PLAN-NOCHE-2, 9 | Edad que cae en más de un programa: el asistente pregunta cuál quiere |
| PLAN-NOCHE-2, 10 | Pagos: registro manual, sin pasarela |
| PLAN-NOCHE-2, 11 | Usuarios: correo y contraseña con roles, sin inicio de sesión con terceros |
| PLAN-NOCHE-2, 12 | Salud de menores: dato sensible, solo para quien lo necesita, nunca en registros, notas de Chatwoot ni mensajes |
| PLAN-NOCHE-2, 13 | Aviso al maestro: plantilla por `MessagingProvider` y lista en la aplicación |
| PLAN-NOCHE-2, 14 | Interfaz: React y Vite, en español, primero celular, sobria; Eduardo revisa lo visual en dispositivos reales |
| PLAN-NOCHE-2, 15 | Cotizador por WhatsApp: se enciende o apaga por disciplina; encendido en la demo |
| EG-05 | El tope de marketing cuenta por la clase declarada de la plantilla (servicio o marketing) |
| PLAN-NOCHE, 1 a 6 | Se sigue con Chatwoot; el lead es el adulto y tiene uno o más prospectos (niños); el consentimiento es por organización; integridad entre organizaciones en la base; contestar a quien acaba de escribir no tiene horario; un recordatorio que ya no alcanza se descarta, nunca se manda tarde |
| Resueltas por cambios posteriores | Una no acumulable excluye a las acumulables (V2); aviso a la familia al reprogramar o cancelar (V2); segundo hijo desde la ficha (V3); apagar una automatización cancela lo programado (K9); dos cuentas de base de datos (K3); cambiar el modo de cierre sin SQL (V4/V5); horarios, topes, tiempos y textos del asistente en pantalla (V5) |
