# SUPUESTOS-Y-DECISIONES.md

> **La lista única de lo que Eduardo debe decidir está en [`docs/DECISIONES-PARA-EDUARDO.md`](DECISIONES-PARA-EDUARDO.md)** (bloque V11): cada decisión una sola vez, en tres grupos, con sus opciones, mi recomendación y qué pasa si no se decide. Este archivo ya no repite las preguntas: es el **registro de cada pregunta que alguna vez se hizo** (con su identificador de origen), de si quedó **resuelta** (y dónde) o **abierta** (y en qué decisión de la lista única se responde), y de **los valores supuestos que hoy están en vigor** para que la escuela los confirme.

Corte: 10 de octubre de 2026, rama `v1-escuela`, después de V10b. Antes: 9 de octubre, rama `noche-2`.

## Cómo leerlo

- **Sección 1, qué se resolvió y qué sigue abierto.** Cada fila es una pregunta que las bitácoras y las auditorías dejaron a Eduardo. La columna «Estado» dice «Resuelto» con la referencia (bloque, plan o prueba) o «Abierta» con el número de la decisión (`D-xx`) donde se responde. Nada se pregunta dos veces.
- **Sección 2, valores supuestos en vigor.** Cada fila es un valor, texto o regla que el equipo inventó para poder construir y que la escuela debe confirmar. La columna «Confirmación de la escuela» está vacía: la escuela responde «sí» o corrige el valor. La columna «Dónde se cambia» ya refleja las pantallas de Administración de V5, V6 y V7 (antes decía «SQL» en muchas filas).
- **Sección 3, `[SUPUESTO]` de los seeds.** Qué archivo de `prisma/seed/` marca qué, con su valor actual.
- **Sección 4, decisiones técnicas con alternativa descartada.** Solo informativa: no requiere respuesta salvo que Eduardo quiera el otro camino.
- **Sección 5, nota final.**
- **Identificadores.** `EA` a `EK` son hallazgos de las auditorías (`docs/auditorias/etapa-X.md`); `F1 §5.n` es el punto n de la sección 5 de la auditoría de la primera noche (`fase-1.md`); `EB §8.n`, el punto n de la sección 8 de la auditoría B; `V1-…` a `V10b` son los bloques de la sesión V1 (`docs/BITACORA-V1.md`); los demás (D2, G4, H1, J5…) son el bloque de `docs/BITACORA-NOCHE-2.md` donde quedó la pregunta. `docs/HALLAZGOS-ABIERTOS-V1.md` es la tabla de todos los hallazgos con su clasificación.
- **Ya decididas por Eduardo y por eso no aparecen como abiertas:** `docs/PLAN-V1.md` (decisiones 1 a 7), `docs/PLAN-NOCHE-2.md` (15 decisiones), `docs/PLAN-NOCHE.md` (6), EG-05 y la instrucción de V10b. La tabla «Ya decidido» está al final de `docs/DECISIONES-PARA-EDUARDO.md`.

## 1. Qué se resolvió y qué sigue abierto

### 1.1 Mensajería, canal e invariante 6

| ID | Pregunta | Estado | Referencia |
|---|---|---|---|
| ATR | ¿Vía A (Chatwoot recibe de Twilio) o vía C (el backend recibe y reenvía)? | Abierta → D-01 | `docs/DECISION-ATRIBUCION.md`; con simuladores funciona la A; falta Twilio real |
| EA-02 | ¿Cómo se protegen los estados de entrega que Chatwoot recibe sin firma? | Abierta → D-02 (V9 construyó la ruta con firma; falta decidir el enrutamiento en AWS) | `POST /twilio/delivery_status`, `src/mensajeria/ensayo/ensayo.itest.ts` |
| EB-10 y borde de Twilio | ¿Se anota que el directorio de agentes y el reenviador de Twilio quedan fuera de `MessagingProvider`? | Abierta → D-102 | `CLAUDE.md` no se tocó |
| EA-21 | ¿Una cuenta de Twilio por despliegue o por organización? | Abierta → D-103 | Requisito de la segunda organización |
| EA-22 | ¿Se verifica al arrancar que las bandejas no tengan asignación automática? | Abierta → D-24 | `ensayo:preparar` y `preparar-chatwoot` la apagan en lo que crean |
| F1 §5.1 | ¿Qué cuenta como «un asesor atiende»? | Abierta → D-13 | Comprobado en V8: «Tomar el control», escribir mensaje o nota; resolver abre una conversación nueva |
| F1-05 | ¿Qué pasa con la conversación de un lead que se borra? | Abierta → D-88 | Hoy nada borra leads |
| F1 §5.3 | ¿Palabra de alta y más palabras de baja? | Abierta → D-12 | `PALABRAS_DE_BAJA` en `src/captacion/maquina.ts` |
| F1 §5.5 | ¿Segundo reenganche a quien responde y vuelve a callar? | Abierta → D-14 | `max_intentos = 1` |
| F1 §5.2 | ¿Se confirma el envío «a lo sumo una vez» con tarea de revisión? | Abierta → D-89 | Tareas `envio_incierto` y `revision_manual` |
| ED-11 y EG-12 | ¿Una omisión por atención humana deja tarea? ¿El lead frío crea tarea con persona atendiendo? | Abiertas → ED-11: D-42; EG-12: D-91 | Solo el lead frío conserva su tarea |
| EG-13 | ¿La confirmación de baja sale con una persona atendiendo? | Abierta → D-12 | Tarea `baja_solicitada` |
| ED-10 | Dos recordatorios aplicables, ¿salen los dos? | Abierta → D-42 | Salen los dos |
| D3-antelación | ¿Mínimo de antelación de un recordatorio recorrido? | Abierta → D-42 | Sale cualquiera que llegue antes de la clase |
| D3-familia | ¿Se avisa a la familia al reprogramar o cancelar su clase muestra? | **Resuelto** | Decisión 4 de `docs/PLAN-V1.md`, hecha en V2 (`aviso_clase_reprogramada` y `aviso_clase_cancelada`, de servicio) |
| D4-bot | ¿El bot reagenda solo a quien responde a la recuperación? | Abierta → D-41 | Responde un asesor |
| D2-tope | ¿Tope propio de frecuencia para avisos al maestro? | Abierta → D-43 | Usan el tope general |
| D2-teléfono | ¿Un maestro sin teléfono impide agendar? | Abierta → D-43 | No impide; deja una tarea por familia |
| D8-baja | ¿La baja quita la tarea de lead frío? | Abierta → D-91 | La tarea se conserva |
| G2-aviso | ¿Aviso por WhatsApp a la familia por faltas seguidas? | Abierta → D-61 | Solo tarea |
| WH-ver | ¿Quién ve los eventos inesperados sin lead? | Abierta → D-90 | Solo el administrador |
| A5-tareas | ¿Se agrupan las tareas de entrega fallida y revisión manual? | Abierta → D-90 | Una por mensaje o causa |

### 1.2 Embudo y captación

| ID | Pregunta | Estado | Referencia |
|---|---|---|---|
| EE-06 | ¿Dónde se registra el consentimiento? | Abierta → D-11 | El formulario guarda el aviso como evidencia |
| EE-07 | Un lead perdido o inscrito que vuelve a llenar la página | Abierta → D-81 | No cambia de etapa ni crea tarea |
| EE-08 | ¿Hasta dónde bloquear la inundación de formularios? | Abierta → D-81 | Límite por IP, campo trampa, verificación de origen |
| EE-13 | ¿La página acepta solo teléfonos mexicanos? | Abierta → D-81 | Cualquier país |
| EE-01 | ¿Redirección directa o página con botón «Abrir WhatsApp»? | Abierta → D-09 | Redirección 303; falta Safari, Firefox y celulares |
| E1-datos | ¿La página pide correo o nombre del tutor como obligatorios? | Abierta → D-09 | No |
| E2-familia | ¿Se unen las familias que escriben desde otro teléfono? | Abierta → D-82 | Dos leads ligados |
| E2-código | ¿Vigencia o tope de usos del código de campaña? | Abierta → D-80 | Sin vigencia ni tope; sigue a la campaña |
| D7-recuperar | ¿Quién recupera un lead perdido y se edita la matriz? | Abierta → D-84 | Asesor y administrador, con nota |
| N3 | ¿La sucursal de interés es del lead o del niño? | Abierta → D-83 | Del lead |
| C5-corte | ¿El bot pide la fecha de nacimiento para el corte de ciclo? | Abierta → D-33 | Solo edad declarada |
| EC-22 | ¿Un «sí» ante un único horario cuenta? | Abierta → D-94 | No |
| D1-muestra | ¿Una clase muestra por grupo o por sesión? ¿Cambia la sucursal del lead? | Abierta → D-40 | Una vigente por alumno y grupo; el lead sí cambia |
| C9-oferta | ¿Qué pasa con el lugar ofrecido que no se toma? | Abierta → D-37 | Nadie barre la oferta vencida |
| C-cot | ¿Cotización sin revisión de un asesor? | Abierta → D-36 | Sale sin revisión |

### 1.3 Catálogo y precios

| ID | Pregunta | Estado | Referencia |
|---|---|---|---|
| EC-10 | ¿El maestro ve precios, promociones e instructores? | Abierta → D-100 | Sí (`catalogo:leer`) |
| EC-13 | ¿La capacidad por sucursal cuenta grupos inactivos? | Abierta → D-34 | Los cuenta |
| EC-18 | ¿Clases que cruzan la medianoche? | Abierta → D-95 | No se pueden expresar |
| EC-19 | ¿La capacidad del salón limita el cupo? | Abierta → D-34 | Por la carga desde Excel sí (error); por la API solo informativo |
| EC-20 | ¿Corregir o borrar un precio ya usado? | Abierta → D-35 | La API permite corregir y dar de baja; la pantalla no |
| EC-21 | ¿Una promoción sin alcance pide confirmación? | Abierta → D-34 | Vale para todos sin aviso |
| C3-acum | ¿Una promoción no acumulable excluye a las acumulables? | **Resuelto** | Decisión 6 de `docs/PLAN-V1.md`, hecha en V2 (`src/promociones/acumulacion.test.ts`, `acumulacion.itest.ts`) |
| EC-05 | ¿Quién fusiona los salones con nombres casi iguales? | Abierta → D-96 | `salonesConNombreParecido` los lista |
| CTX-13 | Un solo horario de una disciplina en una sucursal | Abierta → D-101 | Medir antes de decidir |

### 1.4 Inscripción, cupo y vida del alumno

| ID | Pregunta | Estado | Referencia |
|---|---|---|---|
| EF-06 | ¿La inscripción respeta las clases muestra agendadas? | Abierta → D-52 | Gana la inscripción |
| EF-07 | ¿Se oculta el tutor de otra sucursal al dar de alta un alumno? | Abierta → D-53 | Se devuelve nombre, apellidos y correo |
| EF-12 | ¿Segundo hijo de un lead ya inscrito? | **Resuelto** en lo funcional | V3 (el lead ya inscrito vuelve a tener a quién inscribir); el resto en D-54 |
| EF-13 | ¿Meses por adelantado sin pago? | Abierta → D-54 | Hasta 24 meses declarados |
| F3-mostrador | ¿Reglamento de una familia sin lead? | Abierta → D-51 | No puede inscribirse |
| F3-fecha | ¿Inscripciones con fecha de inicio pasada? | Abierta → D-50 | Se rechazan (`src/inscripciones/inscribir.ts`) |
| F5-baja | Beneficios y cupo de quien se da de baja antes de pagar | Abierta → D-59 | No se devuelve el cupo |
| F6-modo | ¿Asesor por WhatsApp o maestro en sitio? | Abierta → D-49 | Los dos modos existen; se cambia en Configuración (V4 y V5) |
| F7-tutor | ¿Bienvenida también al segundo tutor? | Abierta → D-56 | Solo al responsable de pago |
| F1-pago | ¿Dos responsables de pago? | Abierta → D-57 | A lo más uno |
| F1-nombre | ¿Se acepta `es_contacto_urgencia`? | Abierta → D-98 | Es el nombre vigente |
| F2-horario | Cotizado o recomendado por el maestro | Abierta → D-58 | Gana el cotizado |
| F-apagar | ¿Apagar una automatización cancela lo programado? | **Resuelto** | K9 (`automatizacion_apagada` en `src/automatizaciones/motor.ts`) |
| D6-imagen | ¿La autorización de imagen es obligatoria? | Abierta → D-47 | Solo el reglamento es obligatorio |
| D6-firma | ¿Firma o foto como evidencia? | Abierta → D-47 | Texto corto |
| D5-salud | ¿Quién captura la ficha de salud sin el maestro? | Abierta → D-45 | Maestro del grupo o administrador |
| ED-09 | ¿Cuánto ve el maestro la salud tras la clase? | Abierta → D-45 | Mientras la clase esté agendada, asistida o no asistida |
| EG-15 | ¿Antigüedad máxima del pase de lista? | Abierta → D-60 | Cualquier fecha pasada con sesión |
| EG-09 | ¿El maestro marca pagado y quita participantes? | Abierta → D-63 | Sí puede |
| G3-peldaño | ¿Se puede saltar un peldaño? | Abierta → D-62 | Sí, con permiso |
| G4-cuota | ¿Cuota por evento o por alumno? ¿Excepciones? | Abierta → D-63 | Una por evento; sin excepciones |
| G5-congelada | ¿Beneficios pendientes de una inscripción congelada para el asesor? | Abierta → D-64 | Sí |
| J2 | ¿Registro del maestro por pasos? | Abierta → D-99 | Una página con secciones plegables |

### 1.5 Finanzas y cobranza

| ID | Pregunta | Estado | Referencia |
|---|---|---|---|
| EH-11 | ¿Qué pasa con las inscripciones anteriores al módulo de cobros? | Abierta → D-66 | `src/finanzas/cargos.itest.ts` fija el comportamiento |
| EH-20 | Inscribirse el último día del mes | Abierta → D-67 | Cobra el mes completo |
| EH-14 | ¿Estado de cuenta limitado a las sucursales de quien consulta? | Abierta → D-75 | Todas las sucursales de la familia |
| EH-15 | ¿Recepción ve la tarea de deuda vencida? | Abierta → D-75 | No |
| H1-congelar | Reactivar una inscripción congelada a mitad de mes | Abierta → D-68 | Mes completo, sin prorrateo |
| H2-excedente | ¿Pago mayor a lo adeudado? | Abierta → D-69 | 409 `excedente_sin_cargo` |
| H4-diferido | ¿Descuento diferido en mensualidades siguientes? | Abierta → D-70 | Solo se marca entregado |
| H5-stock | ¿Inventario por sucursal? | Abierta → D-71 | Global por producto |
| H2-cancelar | ¿Hasta cuándo se cancela un pago viejo y quién? | Abierta → D-72 | Sin límite; administrador y recepción |
| H1-resp | Cambio del responsable de pago | Abierta → D-57 | Los cargos abiertos siguen con el anterior |
| J5 | ¿Reparto a mano en blanco o desde la propuesta? | Abierta → D-73 | Parte de la propuesta |

### 1.6 Reportes

| ID | Pregunta | Estado | Referencia |
|---|---|---|---|
| EH-17 | Conversión del reporte de clases muestra | Abierta → D-76 | Cuenta cualquier inscripción del prospecto (V10b suma los inscritos a mano, aparte) |
| I3-asesor | ¿Importes del ejecutivo para el asesor? | Abierta → D-77 | Los ve, solo de sus sucursales |
| I2-gasto | ¿Tipo de gasto y «—» sin gasto? | Abierta → D-78 | Una cifra por captura; sin gasto 0.00 |
| I5-csv | ¿Apóstrofo delante de los teléfonos en CSV? | Abierta → D-79 | Sí, por seguridad |

### 1.7 Seguridad y privacidad

| ID | Pregunta | Estado | Referencia |
|---|---|---|---|
| EB-02 | ¿Contraseña actual o 2FA para crear administradores? | Abierta → D-104 | Solo la sesión |
| EB-03 | ¿Tope de intentos por cuenta? | Abierta → D-104 | Por correo más IP |
| EB-19 y EG-20 | ¿Cuánto se conservan los registros de solo anexar? | Abierta → D-105 | Sin purga; constancias de eventos 30 días (EG-20, V10) |
| EB §8.4 | ¿Tablas de solo anexar como excepción a «soft delete»? | Abierta → D-106 | La base lo impide |
| EB §8.5 | ¿Qué pasa al dar de baja una organización? | Abierta → D-106 | Sus sesiones mueren |
| EB §8.6 | ¿El inicio de sesión pide el identificador? | Abierta → D-106 | Opcional con una sola organización |
| EB-20 | ¿Cambio obligatorio de contraseña? | Abierta → D-17 | Lista de contraseñas comunes ya hecha en K3 |
| EB §8.10 | ¿Excepciones de `sistema.ts` al aislamiento? | Abierta → D-106 | Documentadas en el encabezado |
| EG-14 | ¿El maestro solo ve sus grupos? | Abierta → D-64 | Ve todo el expediente operativo |

### 1.8 Operación e infraestructura

| ID | Pregunta | Estado | Referencia |
|---|---|---|---|
| EB §8.9 | ¿Límite de peticiones en Redis/base/balanceador? | Abierta → D-107 | En memoria |
| EB-08 y EF-15 | ¿Dos cuentas de base de datos? | **Resuelto** | K3: `scripts/lib/roles-bd.ts` y `src/seguridad/roles.itest.ts`; la demo conserva su cuenta única a propósito |
| I4-demo | ¿Se corre `demo:datos` contra la demo? | Abierta → D-117 | Solo contra una copia |
| A8 | ¿Gates en borrador de las Fases 2 y 3? | Abierta → D-116 | Sin marcar |

### 1.9 Decisiones nuevas de la etapa K y de la sesión V1

| ID | Pregunta | Estado | Referencia |
|---|---|---|---|
| K2-EH13 | ¿Cuántos días atrás se fecha un pago? | Abierta → D-72 | 400 días |
| K2-EH12 | ¿Repetir la clave de un pago cancelado? | Abierta → D-72 | 409 `pago_cancelado` |
| K3-EB20 | ¿Cambio obligatorio de contraseña en el primer acceso? | Abierta → D-17 | No se obliga |
| K3-EB19 | ¿Retención de registros de solo anexar? | Abierta → D-105 | Siempre |
| K4-SALUD | Con Chatwoot caído, ¿el backend sigue recibiendo? | Abierta → D-23 | `degradado`, sigue recibiendo |
| K5-RPO | ¿RPO y RTO aceptables? | Abierta → D-25 | `docs/RESPALDO.md` |
| K5-CLAVE | ¿Dónde se copia la clave de salud? | Abierta → D-46 | Solo Secrets Manager |
| K6-COSTO | ¿Qué configuración de AWS? | Abierta → D-22 | Variables de staging en los ejemplos |
| K6-REGION | ¿En qué región? | Abierta → D-22 | `us-east-2` |
| K6-CHATWOOT | ¿Una tarea de Chatwoot o varias? | Abierta → D-23 | Una |
| K6-ADMIN | ¿Chatwoot abierto o solo desde las redes de la escuela? | Abierta → D-23 | Abierta con login |
| K8-HERMANO | ¿Cómo se agrega un segundo hijo a un lead ya capturado? | **Resuelto** | V3: `GET/POST /api/leads/:id/prospectos` y la sección «Niños» de la ficha |
| EK-12 / K1 / EK-I02 | ¿Las escuelas nuevas nacen con automatizaciones? | Abierta → D-06 | La plantilla de organización no las trae |
| EK-09 | ¿Qué hijo paga completo con el descuento por hermanos? | Abierta → D-55 | El capturado primero |
| EK-01 | Mapa evento → clase de mensaje y `estado_aprobacion` a mano | Abierta → D-05 | Administración → Plantillas |
| EK-08 | ¿Respaldo lógico programado a S3? | Abierta → D-25 | No existe en la infraestructura |
| Cierre de V7 | Con solo captación nadie llega a «Inscrito» | **Resuelto** | V10b (marcar a mano con nota y registro); la regularización posterior es D-19 |
| V1 a V10b | Pendientes de los bloques V1 a V9 | Abiertas → ver `docs/DECISIONES-PARA-EDUARDO.md` | Cada id de `docs/HALLAZGOS-ABIERTOS-V1.md` («decisión de producto») está en una decisión de la lista única |

## 2. Valores supuestos que la escuela debe confirmar

Dónde se cambia cada uno: «pantalla» es una de Administración (V5, V6 y V7: Configuración, Textos del asistente, Etapas del embudo, Motivos, Cargar catálogo, Precios, Promociones, Grupos, Programas, Plantillas, Automatizaciones, Campañas…); «API» sin pantalla (`docs/API.md`); «SQL» solo con el equipo técnico; «código» si hay que tocar el programa. El inventario completo de lo configurable es `docs/CONFIGURACION-INVENTARIO.md`.

### 2.1 Catálogo, salones y personas

| Área | Qué se asumió | Dónde se cambia | Valor actual | Decisión | Confirmación de la escuela |
|---|---|---|---|---|---|
| Sucursales | Direcciones | Pantalla (Sucursales) o `sucursales.csv` | Vacías (el insumo dice pendiente); la oferta de otra sucursal sale sin dirección | D-16 | |
| Programas | Rangos de edad de baile | Pantalla (Programas) o `programas.csv` | 15 a 99 en Salsa y Cumbia y en Twerk (contexto §12 lo marca pendiente) | D-33 | |
| Programas | Salsa y Cumbia y Twerk en Águilas son alternativas por estilo para la misma edad | Pantalla («Permite traslape de edad») | Ambos verdaderos; el bot pregunta cuál | D-33 | |
| Programas | Fecha de corte de edad (inicio de ciclo) | Pantalla (Programas) | Vacía en todos | D-33 | |
| Grupos | Cupo máximo de los 18 grupos | Pantalla (Grupos) o `grupos.csv` | Karate 12, 18 y 20 (del insumo, sin confirmar); Ballet 3-5 = 12, Ballet 6-13 y 14+ = 15, Salsa y Cumbia = 24, Twerk = 20; capacidad total 184 (Águilas) y 116 (Centenario) | D-31 | |
| Horarios | Duración donde solo se dio la hora de inicio | Pantalla (Grupos) o `horarios.csv` | Karate 6-13 y 14+ = 60 min; Ballet 3-5 = 45; Salsa y Cumbia = 60; Ballet 6-13 entre semana en Centenario = 60 | D-32 | |
| Salones | Cuántos salones hay y su capacidad | Pantalla o `salones.csv` | Dojo 24 en cada sucursal; Salón 2 (Águilas) y Salón 1 (Centenario) de 30 | D-32 | |
| Instructores | Quién da qué grupo | Pantalla o `instructores.csv` | 5 instructores de ejemplo con teléfonos ficticios, más «Maestro demo»; uno por disciplina y sucursal, y uno solo para todo el baile | D-44 | |
| Disciplinas | Colores de marca, logo, y que Baile no use progresión | Pantalla (Disciplinas) | Karate #C0392B, Ballet #8E44AD, Baile #E67E22; sin logo; Baile con `usa_progresion` en falso | D-16 | |
| Progresión | Peldaños y clases mínimas | API (`/api/niveles`) | Karate: Blanco, Amarillo, Naranja, Verde, Azul, Café, Negro (0, 20, 30, 40, 50, 60, 100 clases); Ballet: Pre-ballet a Avanzado (0, 24, 36, 48, 60, 72; los nombres son del contexto §7); Baile: Principiante, Intermedio, Avanzado (0, 16, 32) | D-62 | |
| Registro del maestro | Edad válida de 1 a 99 años; qué cuenta como «completo» (alumno, un adulto responsable de pago, antecedentes y ficha de salud entera); motivos para tomar la clase | Código (`registro-reglas.ts`) y esquema | Los valores indicados | D-45 | |

### 2.2 Precios y promociones

| Área | Qué se asumió | Dónde se cambia | Valor actual | Decisión | Confirmación de la escuela |
|---|---|---|---|---|---|
| Precios | Inscripción y mensualidad de los 14 programas, iguales en las dos sucursales, en pesos, vigentes desde 2026-01-01 | Pantalla (Precios) o `precios.csv` | Karate 3-5: 600 y 750; Karate 6-13: 600 y 850; Karate 14+: 700 y 950; Ballet 3-5: 600 y 800; Ballet 6-13: 600 y 900; Ballet 14+: 700 y 1,000; Salsa y Cumbia: 500 y 700; Twerk: 500 y 750 | D-29 | |
| Promociones | Tres promociones de ejemplo, vigentes de 2026-01-01 a 2027-12-31, para todas las disciplinas y sucursales, sin tope de cupo | Pantalla (Promociones) | Inscripción gratis (acumulable, prioridad 10), uniforme gratis al pagar la primera mensualidad (acumulable, 5), 10 % en la mensualidad desde el segundo hermano (acumulable, 3). Desde V2 una no acumulable no se combina con nadie; las tres de la demo son acumulables | D-30 | |
| Productos | Stock global y que recepción ajusta el inventario | API (no hay pantalla) | Global por producto | D-71 | |
| Cotización | Días que vale una cotización, a lo más (antes vence si lo cotizado vence) | Pantalla (Configuración) | 7 días | D-36 | |
| Lista de espera | Horas para tomar un lugar ofrecido | Pantalla (Configuración) | 48 horas | D-37 | |

### 2.3 Textos y plantillas

| Área | Qué se asumió | Dónde se cambia | Valor actual | Decisión | Confirmación de la escuela |
|---|---|---|---|---|---|
| Documentos legales | Reglamento, autorización de uso de imagen y aviso de privacidad, versión 1. El aviso lo debe revisar un abogado antes de usarse | API (`POST /api/documentos-legales`: se publica una versión nueva, las anteriores no se editan) | Textos de ejemplo marcados `[SUPUESTO]` | D-10, D-47 | |
| Bot | Los 31 textos del asistente (saludo, preguntas, oferta de otra sucursal, lista de espera, agendado, cierre…) | Pantalla (Textos del asistente); la cotización, los cierres con piezas condicionales y la baja, código (`src/captacion/maquina.ts`) | Genéricos; revisar el tono | D-07 | |
| Página de registro | Texto del cuestionario y mensaje prellenado de WhatsApp | Código (`src/captacion/landing.ts` y `src/http/landing-html.ts`) | Genéricos | D-08 | |
| Plantillas | Texto de las 13 plantillas, todas ficticias y «aprobadas» solo para la demo; hay que registrarlas y aprobarlas en Twilio y Meta con el mismo código y variables en el mismo orden | Pantalla (Plantillas); alta en Twilio | Ver las dos filas siguientes | D-04, D-38 | |
| Plantillas | Clase de servicio (sale aunque una persona atienda): recordatorio de clase muestra, bienvenida de inscripción, tres avisos al maestro, aviso de cambio y de cancelación de la clase muestra (V2), recordatorio de pago por vencer y vencido | Pantalla (Plantillas, clase del mensaje) | 9 de servicio | D-05 | |
| Plantillas | Clase de marketing (se frena con persona atendiendo, con baja de marketing y por el tope semanal): reenganche de captación, recuperación de quien no llegó, reenganche de lead frío, promoción por vencer | Pantalla (Plantillas) | 4 de marketing. Reenganche de captación y recuperación están registradas como `utility` ante Meta; si Meta las reclasifica cambia el costo, no el tope | D-05 | |
| Embudo | Nombres de las 7 etapas, de los 6 motivos de pérdida y de los 5 motivos de baja (económico, cambio de domicilio, horario, insatisfacción, otro) | Pantalla (Etapas del embudo, Motivos) | Sugeridos por el insumo; los motivos son de ejemplo | D-18, D-59 | |

### 2.4 Tiempos, topes y reglas de mensajería

| Área | Qué se asumió | Dónde se cambia | Valor actual | Decisión | Confirmación de la escuela |
|---|---|---|---|---|---|
| Frecuencia | Máximo de mensajes automáticos por teléfono al día y de marketing por semana | Pantalla (Configuración) | 3 al día (ventana móvil de 24 h) y 1 de marketing cada 7 días. Consecuencia de EG-05: el reenganche, la recuperación, el lead frío y la promoción por vencer comparten ese tope, así que mandan un solo mensaje por semana; para dos intentos hay que subirlo a 2 | D-15 | |
| Horario | Ningún mensaje iniciado por el sistema fuera de 09:00 a 20:00 hora de la sucursal; la escuela puede estrecharlo | Invariante 14; pantalla (Configuración) solo para estrechar | 09:00 a 20:00 | D-15 | |
| Días de envío | Reenganche, lead frío, promoción, bienvenida y cobranza salen de lunes a sábado; recordatorios y recuperación de clase muestra, todos los días | Pantalla (Automatizaciones) | Como se indica | D-15 | |
| Lead a medias | Minutos sin respuesta para mostrarlo a los asesores, y horas para el reenganche | Pantalla (Configuración) y (Automatizaciones) | 30 minutos y 25 horas, un solo intento | D-14 | |
| Clase muestra | Anticipación mínima, horizonte, máximo de fechas ofrecidas y horas para corregir la asistencia | Pantalla (Configuración); el máximo de fechas, código | 2 horas, 60 días, 5 fechas y 48 horas | D-39 | |
| Recordatorios | Cuánto antes se recuerda la clase muestra | Pantalla (Automatizaciones) | 24 horas y 2 horas antes | D-39 | |
| Recuperación | Cuándo y cuántas veces se escribe a quien no llegó | Pantalla (Automatizaciones) | 2 horas después de marcar la falta, otra a las 48 horas, 2 intentos como máximo | D-39 | |
| Lead frío | Días sin movimiento por etapa, episodios y antigüedad máxima | Pantalla (Etapas del embudo y Automatizaciones) | 2, 3, 3, 3 y 5 días; 3 episodios; no se persigue lo enfriado hace más de 14 días | D-91 | |
| Promoción por vencer | Cuándo se avisa | Pantalla (Automatizaciones) | 3 días antes | D-91 | |
| Código de rastreo | Vigencia y usos del código del lead de la página de registro | Código | 30 días, un solo uso | D-80 | |

### 2.5 Operación escolar y cobranza

| Área | Qué se asumió | Dónde se cambia | Valor actual | Decisión | Confirmación de la escuela |
|---|---|---|---|---|---|
| Faltas | Faltas seguidas que disparan la tarea al asesor; que la falta justificada ni suma ni corta la racha; que la ve el asesor de la sucursal | Pantalla (Configuración) el umbral; el resto, código | 3 faltas | D-61 | |
| Pase de lista | Quién lo registra y que no se pueda antes de que empiece la clase | Código (`src/api/permisos.ts`) | Maestro, recepción y administrador; el asesor solo lee | D-60 | |
| Permisos | Qué ve y qué hace cada rol | Código (`src/api/permisos.ts`) | Recepción no ve tareas ni conversaciones; el asesor no escribe el catálogo; recepción cobra, da de baja y congela; el maestro ve trayectoria y operativo del alumno sin importes ni origen comercial y califica en eventos | D-17 | |
| Eventos | Que cada evento otorga progresión por omisión y que recepción cobra y marca el estatus | API | Sí | D-63 | |
| Cobranza | Cuándo se recuerda un pago y a partir de cuántos días de deuda hay tarea para el asesor | Pantalla (Automatizaciones y Configuración) | 3 días antes, 1 día después y cada 7 días (2 intentos); no se persigue deuda de más de 60 días; tarea a los 15 días de deuda | D-65 | |
| Cargos | La primera mensualidad vence el día de corte de su mes (o el día de la inscripción si ese corte ya pasó); el barrido solo genera el mes en curso | Código (`src/finanzas/cargos.ts`) | Como se indica | D-65 | |
| Pagos | Un pago no puede fecharse más de 400 días atrás (resuelve EH-13) | Código (`src/finanzas/pagos.ts`) | 400 días | D-72 | |

### 2.6 Reportes, demo, seguridad e interfaz

| Área | Qué se asumió | Dónde se cambia | Valor actual | Decisión | Confirmación de la escuela |
|---|---|---|---|---|---|
| Reporte ejecutivo | Ocupación a partir de la cual un grupo está «a reventar» y hasta la cual está «vacío» | Pantalla (Configuración, desde V5) | 90 % y 25 % | D-77 | |
| Datos de demo | Perfiles de pago, bajas, compras y asistencia del generador (no son datos de la escuela) | Código (`src/demo/generador.ts`) | 50 % puntual, 25 % parcial, 15 % tardío, 10 % moroso; 12 % de bajas; 40 % compra un producto; asistencia de 55 a 98 % | D-117 | |
| Acceso | Duración de la sesión, bloqueo y contraseña | Variables de entorno y código | 12 horas, 120 minutos de inactividad, 5 intentos en 15 minutos, contraseña de 10 caracteres como mínimo y fuera de las más usadas | D-17 | |
| Límites | Peticiones por minuto por IP | `src/http/config-limites.ts`; código y entorno | Inicio de sesión 10, API 600, página de registro 30 | D-107 | |
| Interfaz | Barra inferior del celular con 4 secciones y «Más»; quién ve «Hoy»; fuentes con nombre en pantalla (Facebook, Instagram, En sucursal (QR), Página de captación); motivo por omisión al ver salud («Revisión del maestro antes de la clase») | `web/src/navegacion.ts`, `Embudo.tsx`; código | Como se indica | D-111 | |
| Módulos | Nombre y línea de ayuda de cada módulo | `src/modulos/index.ts`; código | Cotizador, Clase muestra, Inscripción, Operación diaria, Finanzas, Tableros | D-111 | |
| Respaldos y AWS | RPO de minutos (base de AWS) y de hasta 24 h (respaldo nocturno), RTO de 30 a 60 minutos; costo aproximado de AWS: 200 USD al mes en staging y 370 en producción | `docs/RESPALDO.md`, `docs/INFRA-AWS.md` | `[SUPUESTO]` | D-25, D-22 | |

## 3. `[SUPUESTO]` de los seeds, por archivo

Hay 57 líneas con la marca `[SUPUESTO]` en `prisma/seed/`. Todo lo que tiene la marca es ejemplo editable desde Administración; ninguno vive en el código (decisión 6 de `docs/PLAN-NOCHE-2.md`). Esta tabla dice qué marca cada archivo y dónde está su decisión.

| Archivo | Líneas marcadas | Qué marca (valor vigente) | Decisión |
|---|---|---|---|
| `catalogo.sql` | 7 | Horas de fin de los horarios donde el insumo solo dio la de inicio (60 min en Karate 6-13 y 14+); capacidad 24 del «Dojo» de cada sucursal; maestros sin asignar para ver que un maestro solo ve los suyos | D-32, D-44 |
| `catalogo-completo.sql` | 12 | Colores de marca; capacidad 30 de los salones nuevos; cupos de los 9 grupos nuevos; horas de fin (45 o 60 min); 5 instructores de ejemplo; los 14 precios (vigentes desde 2026-01-01); las 3 promociones (hasta 2027-12-31); Baile sin progresión | D-16, D-31, D-32, D-44, D-29, D-30, D-62 |
| `clase-muestra.sql` | 9 | Textos de las plantillas del aviso al maestro (3), del recordatorio (24 h y 2 h), de la recuperación (2 h, 48 h, 2 intentos) y de los avisos de cambio y cancelación (V2); clase de cada plantilla (servicio o marketing); interruptor por disciplina | D-38, D-39, D-05 |
| `seguimiento.sql` | 11 | Textos legales de ejemplo (reglamento, imagen, aviso); 6 motivos de pérdida; días sin movimiento por etapa; lead frío y promoción por vencer (textos, 3 días antes, 3 episodios, 14 días); 5 motivos de baja; bienvenida (lunes a sábado); recordatorios de pago | D-47, D-10, D-18, D-91, D-59, D-56, D-65 |
| `progresion.sql` | 17 | Peldaños, colores y clases mínimas de las tres disciplinas (los seis de Ballet son los del contexto §7; las clases mínimas son supuestas) | D-62 |
| `demo.sql` | 1 | Clase del reenganche de captación (marketing) | D-04 |
| `plantilla-organizacion.sql` | 0 | Sin supuestos: solo las siete etapas y la configuración con solo la captación encendida | D-06 |
| `segunda-vertical.sql` | 0 | Sin supuestos | — |

## 4. Decisiones técnicas con alternativa descartada

Informativas. Las ya anteriores a la sesión V1 conservan su número; las nuevas van al final.

| # | Decisión tomada | Alternativa descartada | Por qué conviene saberlo |
|---|---|---|---|
| 1 | Vía A de atribución con el borde de Twilio que valida firma y descarta reintentos | Vía C: el backend manda y recibe todo por Twilio | La C cierra la firma de punta a punta (incluidos los estados de entrega, EA-02) pero el asesor deja de ver en Chatwoot lo que no pasa por su API. Es la salida si la A falla con Twilio real (D-01) |
| 2 | EB-10: el directorio de agentes y el reenviador de Twilio quedan fuera de `MessagingProvider` como excepciones anotadas | Moverlos detrás del proveedor | Por la letra del invariante 4 son excepción; por su espíritu (no inician mensajes) no (D-102) |
| 3 | Cupo y dinero se protegen en la base (disparadores, CHECK, candados), no solo en el código | Comprobar y luego actuar | Un SQL directo o un código olvidadizo no puede sobrevender un grupo ni sobrepagar un cargo. Costo: más migraciones y mensajes de error de base que el código traduce |
| 4 | Los contadores del dinero se protegen por profundidad de disparador (EH-01), no por permisos de columna | `REVOKE UPDATE` en columnas | La aplicación necesita ese `UPDATE` de forma indirecta. Un superusuario puede saltarse los disparadores; para eso está la cuadratura (`npm run cuadratura`) |
| 5 | Dinero en centavos enteros y texto en la API | Decimales de librería o flotantes | Sin errores de redondeo y sin librería; el redondeo (al centavo más cercano, la mitad alejándose de cero) está definido en `src/lib/dinero.ts` |
| 6 | Salud de menores cifrada en la aplicación (AES-256-GCM), con clave en el entorno | Columnas en claro ocultas con una regla de consulta | Un respaldo de la base no revela salud. Si se pierde la clave los datos no se recuperan: respaldarla es tan importante como respaldar la base (D-46) |
| 7 | Webhooks: ante un dato inesperado se responde 200, se deja constancia y una tarea (WH) | Responder 5xx para que el proveedor reintente | Evita bucles infinitos por un dato raro; costo: un error propio se «acepta» y lo ve una persona, sin reintento automático |
| 8 | Registro de cambios sin valores identificables (solo qué campos se tocaron), de solo anexar | Guardar antes y después | Como nunca se purga, guardar nombres y teléfonos los dejaría para siempre. Costo: no se puede reconstruir el valor anterior de un dato |
| 9 | Documentos legales y aceptaciones inmutables; cambiar un texto es publicar la versión siguiente | Editar el texto con historial aparte | La evidencia de qué se aceptó no depende de que nadie toque la tabla. Costo: una versión mal publicada solo se reemplaza, no se corrige |
| 10 | Módulos por organización sin caché y con un solo lector (`leerModulos`), con una ruta apagada que responde 404 como una inexistente (V1) | Caché por proceso; mensaje «módulo apagado» | Encender o apagar surte efecto al instante sin reiniciar; un 404 no revela qué módulo existe |
| 11 | Textos del asistente: el texto por omisión vive en el código y la tabla guarda solo lo que la escuela cambió (V5) | Sembrar los 31 textos en cada organización | Una organización sin seed no se queda sin asistente; cambiar un texto por omisión no migra filas |
| 12 | Horario de envío: se estrecha por escuela, nunca se amplía, y manda la intersección con el de cada automatización (V5, invariante 14) | Ignorar el horario de la automatización | Una escuela no puede enviar fuera de 09:00 a 20:00 por error |
| 13 | Inscrito a mano: la nota se guarda en el historial de etapas y el registro de cambios solo apunta a ella (V10b) | Copiar la nota al registro de cambios | El registro no se purga y una nota libre puede mencionar la salud de un niño (D-93) |
| 14 | El reparto de un pago sigue un orden total: vencimiento, concepto (inscripción antes que mensualidad), creación, id (V10) | Ordenar por la hora de la fila | Las filas de un mismo instante empataban y salían en orden físico; ahora el resultado es estable (D-73) |
| 15 | Las pruebas pueden correr a otra hora con `PRUEBAS_AHORA`, que producción rechaza (V10b-fix) | Congelar el reloj | Ninguna prueba depende ya de la hora del día; el reloj de pruebas nunca llega a producción |
| 16 | Ensayo con WhatsApp real: el túnel apunta a una puerta propia (`ensayo-borde`) y no al backend (V9) | Apuntarlo al puerto 3000 | Habría expuesto a internet la interfaz y `/api` con las contraseñas públicas de la demo mientras dura el túnel |

## 5. Nota final

- **Resueltas desde el corte anterior** (ya no aparecen como abiertas): D3-familia, C3-acum (V2); K8-HERMANO, EF-11 y EF-12 en lo funcional (V3); F-apagar (K9); EB-08 y EF-15 (K3); «con solo captación nadie llega a Inscrito» (V10b); EH-12, EH-13, EH-19 y ED-08 (K2); la configuración que antes solo se cambiaba por SQL (horario, topes, tiempos, textos del asistente, etapas, motivos, modo de cierre y umbrales) pasó a Administración (V5).
- **Pendientes técnicos que no son decisión de producto** se quedan en las tablas de cada auditoría y en `docs/HALLAZGOS-ABIERTOS-V1.md` (33 corregidos en V10 con prueba que falla sin el arreglo, 14 ya resueltos, 10 que no aplican); no esperan respuesta de Eduardo.
- **Pendiente de credenciales reales:** lo que no se pudo probar sin Twilio, Meta, Chatwoot real o AWS está en `docs/PENDIENTES-CREDENCIALES-REALES.md` y el ensayo con el sandbox, en `docs/ENSAYO-WHATSAPP-REAL.md`. Las decisiones que dependen de ti están en el grupo A de `docs/DECISIONES-PARA-EDUARDO.md`.
