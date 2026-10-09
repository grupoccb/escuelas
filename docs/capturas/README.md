# Capturas para la revisión de Eduardo

Todo es **ficticio** (datos de prueba) y sale de `npm run test:navegador`: Chromium real contra el backend real y una base propia que se recrea en cada corrida. Cada captura se hace en
**celular (390×844)** y en **escritorio (1366×768)** y el nombre termina en `-celular.png` o `-escritorio.png`. Las capturas se regeneran en cada corrida y sus bytes cambian aunque nada
visible cambie (fechas del día, ids): lo que vale es lo que se ve.

El navegador de pruebas **nunca sale a un servicio externo** (ni WhatsApp, ni Meta, ni Twilio, ni AWS, ni Chatwoot): el salto a WhatsApp de la página de captación se atiende con una
página simulada y la prueba comprueba a dónde habría llevado; si algo intentara salir, la prueba falla.

## Los cinco recorridos (`recorrido-N-…`)

Cada recorrido es de punta a punta y comprueba además, contra la API, que lo que se ve en pantalla quedó guardado. Qué mirar en cada captura:

### 1. Del anuncio al lead que ve el asesor (`recorrido-1-anuncio-…`)
| Captura | Qué mirar |
|---|---|
| `01-landing` | La página pública de la disciplina: corta, sin menú, con un solo botón. ¿Se entiende qué piden y para qué? En celular, ¿el teclado numérico y los campos son cómodos? |
| `02-formulario-lleno` | Lo único que se pide: quién toma la clase, edad, sucursal, teléfono y aceptar el aviso de privacidad. Nada más. |
| `03-salto-a-whatsapp-simulado` | Lo que ocurre al enviar: salta a WhatsApp con el mensaje ya escrito y el código de rastreo (aquí es una página simulada). |
| `04-embudo-del-asesor` | El lead ya está en la primera columna del asesor, con su fuente (la campaña del anuncio) y su sucursal. |
| `05-ficha-con-su-origen` | La ficha: campaña, código del anuncio y utm que lo trajeron. De aquí se mide el costo por alumno. |

### 2. La clase muestra, el registro de la maestra y el pase de lista (`recorrido-2-clase-muestra-…`)
| Captura | Qué mirar |
|---|---|
| `01-clase-agendada-en-la-ficha` | Lo que ve el asesor: la clase muestra agendada del lead. |
| `02-hoy-de-la-maestra` | La maestra entra por la pantalla de acceso y ve SU día: alumno, hora y grupo, sin teléfonos de la familia. |
| `03-registro-del-alumno` | El registro en el celular de la maestra: secciones plegables, un campo por línea, guardado por sección. |
| `04-salud-guardada-y-fuera-de-pantalla` | Los datos de salud se capturan, se guardan cifrados y **salen de la pantalla**: no quedan a la vista ni en el navegador. Revisa que el aviso de sensibilidad sea claro. |
| `05-registro-completo` | Con alumno, adultos, salud, antecedentes, observación y reglamento aceptado, el registro se marca completo. |
| `06-asistio` | La maestra marca «Asistió» desde «Hoy» (desde la hora de la clase). |
| `07-pase-de-lista` | El pase de lista de su grupo: presentes, faltas y justificadas con botones grandes y un resumen. |

### 3. Del lead a la familia y la inscripción, sin recaptura (`recorrido-3-conversion-…`)
| Captura | Qué mirar |
|---|---|
| `01-ficha-del-lead` | El lead con clase asistida y botón para convertir. |
| `02-la-familia-sale-del-registro` | El adulto sale del registro de la maestra: **no hay un solo campo que llenar** en este paso. |
| `03-solo-faltan-los-apellidos` | Nombre, fecha de nacimiento, sexo y escuela ya están capturados y se ven; solo se pide lo que faltaba. Este es el corazón de «sin recaptura». |
| `04-grupo-recomendado-con-lugares-reales` | El grupo que recomendó la maestra viene elegido, con sus lugares reales (los que cuenta la base). |
| `05-confirmar` | El resumen de lo que se va a crear, antes de crearlo. |
| `06-alumno-inscrito` | El resultado: alumno creado e inscrito, con su precio congelado y sus cargos. |

### 4. El pago repartido entre dos hijos, el estado de cuenta y el uniforme (`recorrido-4-cobro-…`)
| Captura | Qué mirar |
|---|---|
| `01-lo-que-adeuda-la-familia` | Lo que adeuda la familia, cargo por cargo y por hijo, en el orden en que se pagaría. |
| `02-reparto-entre-dos-hijos` | El reparto a mano: $2,000.00 entre la primera mensualidad de cada hijo; la suma debe cuadrar al centavo para poder registrar. |
| `03-pago-registrado` | Qué cargo de qué hijo recibió cuánto. |
| `04-estado-de-cuenta` | Saldo y pagos de la familia después del cobro. |
| `05-uniformes-por-entregar` | Pagar la primera mensualidad liberó el uniforme de cada hijo: recepción ve a quién entregarle y de qué talla. |
| `06-uniforme-entregado` | Se entregó uno (baja una pieza del inventario) y el otro sigue pendiente. |

### 5. Tableros y exportación (`recorrido-5-tableros-…`)
| Captura | Qué mirar |
|---|---|
| `01-clases-muestra` | Agendadas, asistidas, no asistidas y conversión; por fuente, disciplina y sucursal, con la cifra escrita en cada barra y la tabla debajo. |
| `02-costo-por-campana` | El gasto lo captura el administrador a mano; el costo por lead, clase y alumno inscrito sale dividido al centavo. «—» donde no hay con qué dividir. |
| `03-ejecutivo` | Activos, altas y bajas, deserción, ingreso mensual recurrente, cartera vencida y ocupación por grupo. Cada tablero tiene su botón «Descargar CSV» (la prueba abre el archivo y comprueba las cifras exactas). |

## Pantallas sueltas (series por bloque)

| Serie | Qué es |
|---|---|
| `01`–`03` | Acceso, «Más» y «Sin acceso» (J1) |
| `10`–`15` | La maestra: Hoy, registro, salud, pase de lista (J2) |
| `20`–`22` | El asesor: embudo, ficha del lead, tareas (J3) |
| `30`–`33` | Conversión e inscripción paso a paso (J4) |
| `40`–`45` | Recepción: buscar, cobrar, estado de cuenta, uniformes, ventas (J5) |
| `50`–`57` | Familias y expediente, salud en vista aparte, por rol (J6) |
| `60`–`68` | Administración del catálogo, incluido el choque de salón y el traslape de edad (J7) |
| `70`–`73` | Plantillas, automatizaciones, usuarios y bandeja del administrador (J8) |
| `80`–`82` | Tableros (J9) |

## Lo que estas capturas NO prueban

- **Dispositivos reales:** son Chromium con el tamaño y el toque de un celular, no un iPhone ni un Android; la revisión visual con dispositivos reales (Safari, Firefox, lectores de pantalla, QR impresos) sigue pendiente.
- **Servicios reales:** WhatsApp, Twilio, Chatwoot y AWS están simulados o no se tocan (ver el cierre de la bitácora).
