# Sistema de captación y gestión para escuelas de disciplina

Producto de Grupo CCB. Primer cliente: una escuela con tres disciplinas (en la demo: Karate, Ballet y Baile) y dos sucursales. El nombre comercial está por definir.

Este archivo es la entrada para quien baja el repo y tiene que **probarlo**: qué hace, cómo se arma, qué reglas respeta, para qué sirve Chatwoot, en qué momento entra Twilio y qué falta. Cada tema enlaza al documento donde está el detalle.

> **Qué se puede probar hoy y qué no.** Todo corre en tu computadora con datos de ejemplo y con **mensajería simulada**. Nada sale a WhatsApp, Twilio, Meta ni AWS. Lo que sí requiere cuentas reales está en [la sección 8](#8-qué-falta).

---

## Índice

1. [Qué hace](#1-qué-hace)
2. [Probarlo en 10 minutos](#2-probarlo-en-10-minutos)
3. [Cómo está armado](#3-cómo-está-armado)
4. [Chatwoot: para qué sirve y en qué momento entra](#4-chatwoot-para-qué-sirve-y-en-qué-momento-entra)
5. [Twilio y WhatsApp: en qué momento entran](#5-twilio-y-whatsapp-en-qué-momento-entran)
6. [Las reglas del sistema](#6-las-reglas-del-sistema)
7. [Guion de pruebas, paso a paso](#7-guion-de-pruebas-paso-a-paso)
8. [Qué falta](#8-qué-falta)
9. [Pruebas automáticas y comandos](#9-pruebas-automáticas-y-comandos)
10. [Mapa de documentos](#10-mapa-de-documentos)
11. [Problemas comunes](#11-problemas-comunes)

---

## 1. Qué hace

Cubre el camino completo de una familia, desde que escribe por WhatsApp hasta que es alumna y paga:

| Etapa | Qué pasa | Quién interviene |
|---|---|---|
| **Captación** | Una persona escribe por WhatsApp (o escanea un QR / abre la página pública de la escuela). Un asistente automático le pregunta nombre, edad y sucursal, y crea el *lead* con su atribución (de qué campaña vino). | Asistente (sin IA) → asesor |
| **Cotización** | Con la edad, la disciplina y la sucursal, el sistema calcula el programa, los horarios con lugar, el precio vigente y las promociones aplicables. Si no hay lugar, ofrece lista de espera. | Asistente / asesor |
| **Clase muestra** | Se agenda, reprograma o cancela respetando lugares. Se avisa al maestro y se recuerda a la familia 24 h y 2 h antes. El maestro registra al alumno (incluida salud, cifrada) y pasa lista. | Asesor, maestro |
| **Inscripción** | El lead se convierte en **familia** (tutor + alumno + inscripción) en una sola operación, sin recapturar datos. Hermanos, cambio de grupo, congelar y baja con motivo. | Asesor (o maestro, según configuración) |
| **Operación** | Pase de lista, progresión de niveles, expediente del alumno. | Maestro, recepción |
| **Cobranza** | Mensualidades que se generan solas, pagos repartidos entre los hijos, estado de cuenta, uniformes por entregar, ventas, cierre del día, recordatorios de pago. Los pagos son **registro manual** (no hay pasarela). | Recepción |
| **Tableros** | Embudo, fuentes y costo por campaña, clases muestra, altas y bajas, retención, ingreso y cartera vencida, ocupación, comparativo por disciplina y sucursal. | Administrador, asesor |
| **Administración** | Catálogo (disciplinas, sucursales, programas, grupos, precios, promociones), plantillas de mensaje, automatizaciones, usuarios, módulos, configuración. Todo sin tocar código. | Administrador |

Cuatro roles: **administrador**, **asesor**, **maestro** y **recepción**. Cada uno ve solo sus pantallas. Hay una guía de una hoja por rol en [`docs/guias/`](docs/guias/README.md).

### Módulos que se encienden y apagan

Una escuela nueva arranca solo con la **captación**. Lo demás se enciende desde **Administración → Módulos**, sin reiniciar nada. Un módulo apagado desaparece de la interfaz, su API responde como una ruta que no existe, el asistente no lo ofrece y sus automatizaciones no corren. No se borra nada: al encenderlo vuelve todo lo guardado.

| Módulo | Qué enciende | Necesita |
|---|---|---|
| Captación | Asistente, embudo, tareas, página pública, QR, campañas. **No se apaga nunca.** | — |
| Cotizador | Programas, horarios con lugar, precios, promociones, lista de espera | — |
| Clase muestra | Agendar, registro del maestro, avisos y recordatorios | — |
| Inscripción | Convertir lead en familia; alumnos, inscripciones, expediente | Cotizador |
| Operación | Pase de lista, niveles, eventos | Inscripción |
| Finanzas | Cargos, pagos, estado de cuenta, uniformes, ventas, cobranza | Inscripción |
| Tableros | Reportes | Inscripción, Finanzas y Clase muestra |

La demo trae los siete encendidos.

---

## 2. Probarlo en 10 minutos

### Qué necesitas

- **Docker Desktop** abierto.
- **Node 22.18 o más nuevo** (`node -v`).
- La rama **`diseno-v2`**: es la que trae todo (incluido el rediseño de la interfaz). `main` está muy atrasada (solo tiene el andamiaje inicial).

```bash
git clone https://github.com/grupoccb/escuelas.git
cd escuelas
git checkout diseno-v2
npm install          # instala también las dependencias de web/
```

### Levantar la demo (un comando)

```bash
npm run demo:todo -- --si
```

Reconstruye todo desde cero y deja **http://localhost:3000** con una escuela de ejemplo: tres disciplinas, dos sucursales, unos 300 alumnos y seis meses de historia. Tarda unos 3 minutos con Docker caliente y hasta ~25 la primera vez en una máquina limpia (descarga ~5 GB). Sin `--si` no hace nada: te dice qué borraría y se detiene.

Para solo volver a encender lo ya creado: `docker compose up -d`. Para apagar: `npm run demo:todo -- --apagar`.

### Usuarios

La contraseña de los cuatro es **`Demo-local-2026!`**. El campo «Escuela» se deja vacío. Es pública y solo sirve en la demo: un backend de una escuela real se niega a arrancar con ella.

| Correo | Rol | Qué ver primero |
|---|---|---|
| `admin@demo.test` | Administrador | Administración (módulos, catálogo, plantillas, automatizaciones) y Tableros |
| `asesor@demo.test` | Asesor | Embudo (leads nuevos, un contactado, una clase muestra lista para inscribir), Tareas |
| `maestro@demo.test` | Maestro | Hoy y Pase de lista (conviene verlo en el celular) |
| `recepcion@demo.test` | Recepción | Registrar pago: busca a *Marisol Vivanco Lozano* (55 9901 0009) |

### Dónde está cada cosa

| Qué | Dirección |
|---|---|
| La aplicación (interfaz compilada) | http://localhost:3000 |
| Chatwoot (bandeja de los asesores) | http://localhost:3001 — `asesor@demo.test` / `Demo-local-2026!` |
| Interfaz en modo desarrollo (recarga en vivo) | `npm run web:dev` → http://localhost:5173 (usa el backend de :3000) |
| Postgres | `localhost:5432` (usuario y base `inscripciones`) |

Más opciones (otra historia, una segunda demo en otros puertos, borrar todo): [`docs/DEMO-LOCAL.md`](docs/DEMO-LOCAL.md).

---

## 3. Cómo está armado

### Piezas

| Pieza | Qué es | Dónde |
|---|---|---|
| **Backend** | Node 22 con TypeScript nativo (sin paso de build), Express 5. Aquí viven todas las reglas. | `src/` |
| **Base de datos** | PostgreSQL con Prisma 7. Toda tabla lleva `organizacion_id` y `eliminado_en`. | `prisma/` |
| **Interfaz** | React + Vite, en español, primero celular. La sirve el mismo backend. | `web/` |
| **Chatwoot** | Bandeja de los asesores (autohospedado). | `chatwoot/`, `docker-compose.yml` |
| **Twilio WhatsApp** | La línea de WhatsApp. **No corre en la demo**: se simula. | `src/mensajeria/twilio/` |
| **Infraestructura AWS** | Escrita en Terraform, **nunca desplegada**. | `infra/` |

### Mapa del código (`src/`)

| Carpeta | Qué contiene |
|---|---|
| `captacion/` | El asistente de tres preguntas (máquina de estados), alta del lead, aviso de lead a medias |
| `mensajeria/` | `MessagingProvider` (único camino de salida), reglas de envío, transporte Chatwoot, borde de Twilio, transporte falso |
| `cotizador/`, `lista-espera/`, `promociones/` | Programa, lugares, precio y promociones por edad |
| `clases-muestra/`, `asistencia/`, `progresion/`, `eventos/` | Clase muestra, pase de lista, niveles |
| `conversion/`, `inscripciones/`, `familias/`, `expediente/` | Del lead a la familia y su expediente |
| `finanzas/`, `cobranza/`, `exportacion/` | Cargos, pagos, estado de cuenta, CSV |
| `reportes/` | Los datos de los tableros |
| `automatizaciones/`, `barrido.ts`, `ciclo.ts` | Recordatorios, reenganche, lead frío: el motor que corre cada minuto |
| `api/`, `http/`, `auth/` | Rutas `/api`, páginas públicas, sesiones y permisos |
| `modulos/`, `configuracion/`, `administracion/`, `catalogo/` | Módulos, ajustes, alta y carga del catálogo |
| `sensibles/`, `seguridad/`, `observabilidad/`, `respaldo/` | Salud cifrada, endurecimiento, métricas, respaldos |

La referencia completa de endpoints está en [`docs/API.md`](docs/API.md).

### El viaje de un mensaje (arquitectura real, con Twilio)

```
 Familia (WhatsApp)
        │  ① escribe
        ▼
     Twilio ──② webhook firmado──▶ BORDE DE TWILIO (nuestro backend)
                                      │ valida X-Twilio-Signature,
                                      │ descarta reintentos por MessageSid,
                                      │ reenvía SIN modificar
                                      ▼
                                   Chatwoot  ──③ webhook firmado──▶ Agent Bot = nuestro backend
                                   (bandeja)                           │ máquina de estados:
                                      ▲                                │ nombre → edad → sucursal
                                      │                                │ crea lead + conversación
                                      │ ④ respuesta por la API         ▼
                                      └────────────────────────── MessagingProvider
                                                                       (ventana, plantilla, horario,
                                                                        baja, frecuencia, atención humana)
        ▲
        │ ⑤ Chatwoot envía por Twilio y registra el mensaje en la transcripción
```

Dos ideas clave:

- **Todo mensaje saliente pasa por `MessagingProvider`**, el único lugar con las reglas de envío. Nadie más llama a Chatwoot ni a Twilio.
- **Todo saliente va por la API de Chatwoot**, no directo por el SDK de Twilio. Así el asesor ve la transcripción completa. Un mensaje mandado directo por Twilio no aparecería en Chatwoot ([`docs/DECISION-ATRIBUCION.md`](docs/DECISION-ATRIBUCION.md)).

### Lo que es real y lo que es simulado en la demo

| Pieza | En la demo |
|---|---|
| Postgres, backend, interfaz, bot, cotizador, cobranza, tableros | **Reales** |
| Chatwoot | **Real**, local, con una bandeja tipo API por disciplina |
| El contacto (la familia) | **Simulado**: `npm run demo:contacto` escribe en la bandeja de Chatwoot |
| Twilio y WhatsApp | **No existen**: el borde de Twilio está apagado (responde 403 sin `TWILIO_AUTH_TOKEN`) y el transporte de mensajes es falso |
| AWS | No se usa |

---

## 4. Chatwoot: para qué sirve y en qué momento entra

Chatwoot es la **bandeja de los asesores**: donde ven y atienden las conversaciones de WhatsApp. El sistema no reemplaza a Chatwoot; se conecta a él.

**Dos papeles que cumple:**

1. **Conversación.** Guarda cada conversación con su transcripción completa (mensajes de la familia, del asistente y del asesor). El asesor responde desde ahí.
2. **Agent Bot.** Chatwoot le avisa a nuestro backend (webhook firmado con un secreto compartido) de cada mensaje nuevo. El backend decide qué responder y contesta por la API de Chatwoot.

**En qué momento entra, paso a paso:**

| Momento | Qué pasa en Chatwoot |
|---|---|
| La familia escribe | Se crea una conversación en la bandeja de la disciplina. El asistente contesta. |
| El asistente captura nombre, edad y sucursal | Deja una **nota privada** (solo la ven los asesores) con el resumen. La conversación pasa a **Abiertas**, lista para un asesor. |
| La familia deja de contestar a mitad de las preguntas | A los **30 minutos** la conversación se vuelve visible para los asesores con una nota de «datos parciales». Aún nadie la atiende. A las **25 h** puede salir un reenganche con plantilla. |
| Un asesor **toma** la conversación | Se la asigna o escribe un mensaje o una nota. El sistema marca la conversación **en atención humana**: el asistente se calla y el marketing no sale. |
| El asesor resuelve la conversación | El asistente **no** vuelve. Una conversación nueva de Chatwoot sí empieza de cero. |

**Lo que Chatwoot NO hace:** no decide reglas de envío (eso es `MessagingProvider`) ni guarda lo de negocio (leads, familias, pagos): eso vive en nuestra base.

**Vincular al asesor con su agente:** para que la ficha del lead sepa qué conversaciones tiene cada asesor, el administrador vincula al usuario con su agente de Chatwoot (mismo correo). Detalle en [`docs/DEMO-LOCAL.md`](docs/DEMO-LOCAL.md).

---

## 5. Twilio y WhatsApp: en qué momento entran

Twilio es el **proveedor de la línea de WhatsApp**. Está *por delante* de Chatwoot: la familia nunca habla con Chatwoot, habla con un número de WhatsApp que Twilio gestiona.

| Momento | Qué hace Twilio |
|---|---|
| **Entra un mensaje** | Twilio llama a nuestro backend (`POST /webhooks/twilio/entrantes`). El backend valida la firma `X-Twilio-Signature`, descarta reintentos duplicados y reenvía el cuerpo, sin modificar, a Chatwoot. |
| **Entra por un anuncio Click-to-WhatsApp** | El primer mensaje trae los datos del anuncio (`Referral*`, incluido `ReferralCtwaClid`). Se guardan para saber de qué campaña vino el lead. |
| **Sale un mensaje** | Chatwoot lo envía **por** Twilio. Dentro de las 24 h desde el último mensaje de la familia, texto libre; fuera de esa ventana, solo una **plantilla aprobada por Meta** (Twilio Content Templates). |
| **Estados de entrega** | Twilio avisa `enviado → entregado → leído` o `fallido`. Un fallido crea una tarea para el asesor con el código de error. |

**Qué NO se ha probado con Twilio real** (todo se probó con simuladores): que el anuncio real traiga los `Referral*` con esos nombres exactos, el envío real de plantillas, y los teléfonos de Telcel, AT&T y Movistar. Ver [la sección 8](#8-qué-falta).

### Para probar con un WhatsApp de verdad (opcional, 15 min)

Hay un ensayo con el **sandbox de Twilio** que no requiere AWS, dominio ni número verificado: lo guía [`docs/ENSAYO-WHATSAPP-REAL.md`](docs/ENSAYO-WHATSAPP-REAL.md). Necesitas una cuenta de Twilio con el sandbox activo, tu celular unido a él y una herramienta de túnel (por ejemplo `cloudflared`). Comandos: `npm run ensayo:preparar`, `npm run ensayo:diagnostico`, `npm run ensayo:entrante`. Cierra el túnel al terminar.

---

## 6. Las reglas del sistema

### Invariantes (nunca se rompen)

La fuente es [`CLAUDE.md`](CLAUDE.md); aquí van resumidas.

1. **Aislamiento por organización.** Toda consulta filtra por `organizacion_id` a través de un scope único. Hay una prueba de no-fuga entre dos organizaciones.
2. **Cero términos de vertical en el código.** «Karate», «ballet», «cinturón», nombres de sucursal, etc. viven solo en tablas. `npm run check:generico` falla el build si aparecen. Una disciplina nueva se da de alta solo con datos.
3. **Soft delete.** Columna `eliminado_en`. Nunca `DELETE` físico.
4. **Todo mensaje saliente pasa por `MessagingProvider`.**
5. **Dos ventanas.** `ventana_servicio_hasta` = 24 h desde el último mensaje de la familia (decide si se puede mandar texto libre). `ventana_gratis_hasta` = 72 h desde la entrada por anuncio (solo afecta el costo). Fuera de la ventana de servicio: plantilla aprobada o nada; si no hay plantilla apta, no se manda y se crea una tarea para el asesor.
6. **`en_atencion_humana` bloquea al bot y al marketing.** Con una persona atendiendo salen solo los avisos de **servicio** sobre algo ya acordado (recordatorio de clase muestra, recordatorio de pago). Cada plantilla declara si es de servicio o de marketing.
7. **Una sola función de teléfonos.** `normalizarTelefono()` convierte a E.164 y colapsa `+521` a `+52`. `+5215512345678` y `+525512345678` son el mismo lead.
8. **Idempotencia.** Un reintento nunca manda dos veces ni duplica un lead (webhooks únicos por id del proveedor; automatizaciones únicas por `(automatización, entidad, ocurrencia)`; pagos con clave de idempotencia).
9. **Webhooks autenticados.** Twilio con `X-Twilio-Signature`; Chatwoot con secreto compartido.
10. **Determinismo.** El asistente es una máquina de estados, **sin IA**. Cupo, precios, promociones y cuentas son código determinista.
11. **Integraciones detrás de adaptadores con fakes.** Todo el sistema corre offline con transportes falsos; lo real se activa por variables de entorno.
12. **Local primero.** Todo corre con `docker compose`.
13. **La familia es la entidad central.** Tutor y alumno son relación M:N. Un *lead* es el adulto que escribe y tiene uno o más *prospectos* (cada niño), para que la conversión no recapture nada.
14. **Horario de envío.** Nada iniciado por el sistema sale fuera de **09:00–20:00 hora local de la sucursal**. Lo programado fuera de rango se recorre al siguiente horario válido; si con eso llegaría después del evento, se descarta y se registra. Responder dentro de la ventana de servicio no tiene restricción de horario.

### Reglas de mensajería (todas en `MessagingProvider`)

Antes de enviar algo se revisa, en este orden de importancia: **atención humana** (frena bot y marketing), **baja** (la persona pidió no recibir; por teléfono, en toda la organización), **conversación cerrada**, **ventana de 24 h / plantilla aprobada**, **horario 09:00–20:00** y **tope de frecuencia** (3 mensajes automáticos por día y 1 de marketing cada 7 días por teléfono; configurable). Si una regla bloquea, el mensaje queda `bloqueado` con su motivo y, cuando corresponde, se crea una tarea para el asesor.

Palabras de baja que reconoce el asistente: `BAJA`, `STOP`, `CANCELAR`, `NO MOLESTAR` (una sola confirmación). Quien se dio de baja y vuelve a escribir no recibe respuesta automática: el asesor recibe una tarea.

### Reglas de negocio importantes

- **Cupo real.** Dos personas por el último lugar: solo una lo obtiene.
- **Dinero en decimales exactos**, nunca en flotantes. Viaja como texto con dos decimales (`"1234.50"`); un número JSON se rechaza. `npm run cuadratura` comprueba que todo cuadra.
- **Precios congelados** al inscribir; un precio nuevo empieza en su fecha y no cambia lo ya cobrado.
- **Un pago puede cubrir a varios hijos** (el cargo más antiguo primero; se puede ajustar a mano, pero debe sumar exacto). No hay saldo a favor: un pago de más se rechaza. Un pago equivocado se **cancela** (no se borra) y se registra el correcto.
- **Beneficios diferidos** (por ejemplo, un uniforme gratis al pagar la primera mensualidad) se liberan solo al registrar el pago que cumple la condición.
- **Datos de salud**: cifrados, solo administrador y maestro del grupo, piden un motivo y quedan en el registro de accesos. No aparecen en logs, notas de Chatwoot ni mensajes.
- **Quién cierra la inscripción** es configuración: por defecto el maestro marca «listo para cerrar» y el asesor convierte.
- **Plantillas de servicio vs. marketing**: una plantilla de servicio no puede ser de categoría marketing.

### Reglas del código (las hacen cumplir las guardas)

| Guarda | Qué garantiza |
|---|---|
| `check:generico` | Cero términos de vertical o sucursal en el código |
| `check:dinero` | Ningún importe pasa por punto flotante |
| `check:estilo` | En la interfaz, ningún color ni medida suelta: todo viene de variables en `web/src/estilos/base.css` |
| `check:capas`, `check:sensibles`, `check:secretos` | Capas del código, datos sensibles y secretos fuera del repo |

---

## 7. Guion de pruebas, paso a paso

Con la demo arriba (sección 2). Cada paso dice **qué hacer** y **qué debe verse**.

### A. Captación (de la familia al asesor)

1. En una terminal: `npm run demo:contacto`. Simula a una persona que escribe y muestra la conversación.
   *Debe verse:* el asistente preguntando nombre, edad y sucursal, y al final un enlace a Chatwoot.
2. Abre Chatwoot (http://localhost:3001, `asesor@demo.test`). 
   *Debe verse:* la conversación nueva con los mensajes en orden, una **nota privada** con el resumen y la conversación en **Abiertas**.
3. Entra a la aplicación como `asesor@demo.test` → **Embudo**.
   *Debe verse:* el lead nuevo en la columna «Nuevo», con su campaña.
4. Prueba un lead a medias: `npm run demo:contacto -- --respuestas "Hola|Ana"`. A los 30 minutos aparece como visible con nota de datos parciales (puedes verlo sin esperar ajustando `ultimo_mensaje_entrante_en`, ver `docs/DEMO-LOCAL.md`).
5. Prueba el número duplicado: `npm run demo:contacto -- --telefono +5215512345678` y luego lo mismo con `+525512345678`. *Debe verse:* un solo lead.

### B. Asesor: del lead a la clase muestra

6. En **Embudo**, abre la ficha del lead. *Debe verse:* datos capturados, cotización, conversación.
7. Agenda una **clase muestra**. *Debe verse:* solo grupos con lugar; el maestro recibe un aviso; se programan recordatorios de 24 h y 2 h.
8. Arrastra una tarjeta a otra etapa, o usa el botón alternativo (todo lo arrastrable tiene alternativa sin arrastre). Márcala como **perdido** con un motivo.
9. **Tareas**: revisa que haya tareas del sistema (por ejemplo, de un mensaje que no pudo salir) y resuélvelas.

### C. Maestro (mejor en el celular)

10. Entra como `maestro@demo.test` → **Hoy**. *Debe verse:* las clases muestra del día (o del próximo día con clase).
11. Llena el **registro del alumno** (incluye salud) y pasa **lista**. *Debe verse:* el pase de lista se guarda una sola vez aunque lo repitas.

### D. Inscripción

12. Como asesor, convierte al lead que ya asistió a su clase (**Inscribir**). *Debe verse:* la familia con tutor, alumno e inscripción creados **sin recapturar** ningún dato.
13. Agrega a un hermano. *Debe verse:* la promoción por hermanos aplicada.

### E. Recepción: cobranza

14. Entra como `recepcion@demo.test` → **Registrar pago**. Busca a *Marisol Vivanco Lozano* (55 9901 0009).
15. Cobra un monto: el sistema propone el reparto entre sus cargos. Registra.
    *Debe verse:* el recibo, lo aplicado a cada cargo (mensualidad y uniforme), el saldo después del pago y, si se pagó la primera mensualidad, el **uniforme por entregar** en **Uniformes**.
16. Si el mismo envío se repite (la caja se trabó y se reintenta con la misma clave), *debe verse:* «Este pago ya estaba registrado: no se duplicó». No se cobra dos veces.
17. **Estado de cuenta** de la familia: saldo, vencido por antigüedad, descarga en CSV.
18. **Cierre del día**: lo cobrado hoy por persona y forma de pago.

### F. Administración y tableros

19. Como `admin@demo.test` → **Administración**. Recorre: **Módulos** (apaga el cotizador y observa qué desaparece y cómo el asistente pasa al asesor sin cotizar; vuelve a encenderlo), **Disciplinas** (cambia el color de una y míralo reflejado en toda la interfaz), **Precios**, **Promociones**, **Plantillas**, **Usuarios**, **Cargar catálogo** (descarga las plantillas CSV, súbelas con un error a propósito y mira cómo se reporta por fila y columna).
20. **Tableros** (administrador y asesor): las 8 secciones, los filtros de disciplina, sucursal, mes y rango, y las descargas en CSV. Con el filtro de disciplina cambia el color a la de esa disciplina.
21. **Familias → «Con atraso»**: la lista debe coincidir con el número de «familias con atraso» de Tableros (sección 06).

### G. Reglas que conviene intentar romper

- Con una conversación **en atención humana** (toma una en Chatwoot y escribe algo), el asistente debe quedarse callado.
- Una familia que escribe `BAJA` no debe recibir más mensajes automáticos.
- Un recordatorio fuera de 09:00–20:00 se recorre al siguiente horario; si llegaría después de la clase, se descarta y se registra.
- Reintentar un webhook o un pago no duplica nada.
- Entra con un rol distinto y verifica que **no** ve las pantallas ajenas (el maestro no ve importes; recepción no ve salud).

También hay un recorrido narrado y reproducible: `npm run demo:guiada` (usa su propia base; no toca la demo).

---

## 8. Qué falta

### 8.1 Lo que depende de cuentas y del mundo real

Todo se probó con servicios simulados. Lo que **no se puede comprobar sin credenciales** está en [`docs/PENDIENTES-CREDENCIALES-REALES.md`](docs/PENDIENTES-CREDENCIALES-REALES.md), con quién lo hace y cómo se sabe que quedó bien. Resumen:

- **Cuenta de Twilio y WhatsApp Business (WABA) verificada en Meta**, con los números de cada canal. El trámite de Meta tarda semanas: es lo primero.
- **Plantillas aprobadas por Meta**, con el mismo `codigo` que las filas de `plantilla_mensaje`. Las del seed figuran como «aprobadas» solo para la demo; **ninguna lo está de verdad**.
- **Un anuncio Click-to-WhatsApp real** para confirmar que llegan los `Referral*` y que el lead queda atribuido.
- **Elegir la vía de atribución** (A: Chatwoot reenvía los datos del anuncio; C: el backend los recibe y reenvía) y cómo se protegen los estados de entrega en AWS.
- **Pruebas en teléfonos reales** (Telcel, AT&T, Movistar), en navegadores reales (Safari, Firefox) y con el QR impreso.
- **AWS**: cuenta, dominio y certificado, y el primer despliegue. La infraestructura está escrita en Terraform pero **nunca se ha corrido un `plan` real**. Respaldo programado, TLS verificado hacia la base y rotación de la clave de salud también están pendientes.
- **Chatwoot en AWS**: Agent Bot, bandejas, agentes, y apagar la asignación automática de conversaciones.
- **Revisión de seguridad externa** y una prueba de carga con el volumen real.

### 8.2 Lo que depende de la escuela

[`docs/QUE-PEDIRLE-A-LA-ESCUELA.md`](docs/QUE-PEDIRLE-A-LA-ESCUELA.md) está listo para mandarse. Hasta que lo responda, los datos de ejemplo están marcados `[SUPUESTO]` en los seeds y se editan desde Administración:

- Precios, cupos, duración de clases, capacidad de salones, edades, promociones, instructores y colores.
- Reglamento, autorización de imagen y aviso de privacidad **definitivos** (el aviso lo revisa un abogado; sin aviso vigente la página de registro no abre).
- Textos de las plantillas, usuarios, sucursales por usuario, día de corte y reglas de cobranza.

### 8.3 Decisiones abiertas

La lista única está en [`docs/DECISIONES-PARA-EDUARDO.md`](docs/DECISIONES-PARA-EDUARDO.md) (cada decisión con sus opciones y una recomendación). Los **gates** de cada fase del [`SPEC.md`](SPEC.md) los marca Eduardo, no quien implementa: los que aparecen sin marcar siguen pendientes de su revisión.

> Nota: el texto de `SPEC.md` para las fases 2 y 3 dice «sin construir». Ya está construido (ver las bitácoras `docs/BITACORA-NOCHE-2.md` y `docs/BITACORA-V1.md`); lo que falta marcar son los gates.

### 8.4 Pendientes técnicos conocidos

- **Filtro de faltas en el servidor.** En Alumnos, «Solo con atraso o faltas» filtra el **atraso** en el servidor (sobre toda la escuela), pero las **faltas** solo se revisan en la página visible. Haría falta un `asistencia_menor_a` en `GET /api/alumnos`.
- **Datos que la API no trae** y que el rediseño de la interfaz no pudo mostrar (detalle en [`docs/BITACORA-REDISENO-V2.md`](docs/BITACORA-REDISENO-V2.md)): folio consecutivo de pago, rol de quien cobró, nota o autor al resolver una tarea, inventario por sucursal, conteos de inscripciones por disciplina y por grupo, la disciplina de cada hijo en el expediente (hoy se arma con tres lecturas).
- **Alcance de Ventas:** `GET /api/ventas` devuelve solo las últimas 10, sin filtro de fecha.
- **Tableros:** el gasto con filtro es proporcional; la cartera y la ocupación son la foto de hoy; la retención es por cohorte de inscripción; el ingreso recurrente es potencial (cuota vigente), no cobrado.
- **Inscripción** conserva 6 pasos (el prototipo de diseño traía 4) porque son reglas de negocio.
- **Página pública de captación:** «¿Para quién es la clase?» no se guarda (el modelo no tiene ese campo) y no hay estado «enviado» (redirige a WhatsApp).
- **Primer acceso:** no hay cambio obligatorio de contraseña (hallazgo EB-20).

---

## 9. Pruebas automáticas y comandos

### Instalación de lo necesario

```bash
npm install                                  # raíz y web/
docker compose up -d postgres                # las pruebas de integración necesitan Postgres
npx --prefix web playwright install chromium # solo la primera vez, para las pruebas en navegador
```

### Comandos principales

| Comando | Qué hace |
|---|---|
| `npm run validar` | Todo lo estático: lint, tipos, las guardas `check:*`, pruebas unitarias del backend y de la interfaz. **Empieza por aquí.** |
| `npm run test:int` | Pruebas de integración contra una base propia `inscripciones_pruebas` (nunca la de la demo) |
| `npm run test:navegador` | Recorridos en Chromium contra el backend real y una base propia. Nunca sale a WhatsApp, Twilio, Meta, AWS ni Chatwoot |
| `npm run cuadratura` | Comprueba que el dinero cuadra |
| `npm run guias:validar` | Comprueba que cada botón citado en las guías existe en la interfaz |
| `npm run diseno:inventario` | Comprueba que cada pantalla y estado de la interfaz tiene su captura y su fila en `docs/diseno/INVENTARIO.md` |
| `npm run diseno:todo capturas` / `a11y` | Recaptura todas las escenas / corre accesibilidad sobre todas |
| `PRUEBAS_AHORA=2026-10-10T06:30:00Z npm run test:int` | Corre las pruebas en otro «ahora», para descubrir lo que depende de la hora |

Último estado verificado (rama `diseno-v2`, 11 de octubre de 2026): `validar` exit 0; `test:int` 1482 pasan, 0 fallas; `test:navegador` 297 pasan, 1 omitida; capturas y accesibilidad de las 7 tandas verdes; `diseno:tamanos` 52 pasan; `diseno:teclado` 13 pasan; inventario completo (1227 filas).

---

## 10. Mapa de documentos

| Si quieres… | Lee |
|---|---|
| Entender el negocio y el modelo de datos | [`docs/CONTEXTO-PROYECTO.md`](docs/CONTEXTO-PROYECTO.md) |
| Las reglas que nunca se rompen | [`CLAUDE.md`](CLAUDE.md) |
| El plan por fases y sus gates | [`SPEC.md`](SPEC.md) |
| Levantar y recorrer la demo | [`docs/DEMO-LOCAL.md`](docs/DEMO-LOCAL.md) |
| Usar el sistema por rol (una hoja cada uno) | [`docs/guias/`](docs/guias/README.md) |
| Cada endpoint de la API | [`docs/API.md`](docs/API.md) |
| La operación diaria y lo que cada pantalla de Administración cambia | [`docs/OPERACION.md`](docs/OPERACION.md), [`docs/CONFIGURACION-INVENTARIO.md`](docs/CONFIGURACION-INVENTARIO.md) |
| Cómo viaja la atribución del anuncio y cómo se transporta lo que sale | [`docs/DECISION-ATRIBUCION.md`](docs/DECISION-ATRIBUCION.md) |
| Probar con un WhatsApp real (sandbox) | [`docs/ENSAYO-WHATSAPP-REAL.md`](docs/ENSAYO-WHATSAPP-REAL.md) |
| Lo que falta con credenciales reales | [`docs/PENDIENTES-CREDENCIALES-REALES.md`](docs/PENDIENTES-CREDENCIALES-REALES.md) |
| Decisiones abiertas y valores supuestos | [`docs/DECISIONES-PARA-EDUARDO.md`](docs/DECISIONES-PARA-EDUARDO.md), [`docs/SUPUESTOS-Y-DECISIONES.md`](docs/SUPUESTOS-Y-DECISIONES.md) |
| Dar de alta una escuela nueva | [`docs/ALTA-DE-CLIENTE.md`](docs/ALTA-DE-CLIENTE.md), [`docs/QUE-PEDIRLE-A-LA-ESCUELA.md`](docs/QUE-PEDIRLE-A-LA-ESCUELA.md) |
| Seguridad, respaldos, observabilidad, AWS | [`docs/SEGURIDAD.md`](docs/SEGURIDAD.md), [`docs/RESPALDO.md`](docs/RESPALDO.md), [`docs/OBSERVABILIDAD.md`](docs/OBSERVABILIDAD.md), [`docs/INFRA-AWS.md`](docs/INFRA-AWS.md) |
| El sistema visual y el rediseño de la interfaz | [`docs/diseno/SISTEMA-VISUAL.md`](docs/diseno/SISTEMA-VISUAL.md), [`docs/BITACORA-REDISENO-V2.md`](docs/BITACORA-REDISENO-V2.md) |
| Cómo se construyó (historia por etapa) | [`docs/BITACORA-NOCHE.md`](docs/BITACORA-NOCHE.md), [`docs/BITACORA-NOCHE-2.md`](docs/BITACORA-NOCHE-2.md), [`docs/BITACORA-V1.md`](docs/BITACORA-V1.md) |

---

## 11. Problemas comunes

| Qué ves | Qué hacer |
|---|---|
| «Docker no responde» | Abre Docker Desktop, espera a que diga que está corriendo y repite. |
| «El puerto 3000 lo usa otra cosa» | Cierra lo que lo use, o levanta la demo en otros puertos: `npm run demo:todo -- --si --proyecto otra --puerto 3300`. |
| El comando dice «No se ejecutó nada» | Es la confirmación. Repite con `--si`. |
| «Este comando se niega a correr» | Tienes `NODE_ENV=production` o una `DATABASE_URL` no local en tu terminal. Ábrela limpia. |
| Entrar dice «Demasiados intentos» | La demo limita los intentos por IP (10 por minuto). Espera unos minutos. |
| El maestro no ve clases en «Hoy» | Hoy ninguno de sus grupos da clase: mira «Próximas». |
| La interfaz se ve igual que antes | Recarga forzada (Cmd/Ctrl + Shift + R). Si cambiaste código, reconstruye: `docker compose up -d --build --wait`. |
| Quiero Chatwoot también en blanco | `npm run demo:todo -- --si --con-chatwoot` (por omisión se conserva). |
| Quiero ver cómo se hizo | `docker compose -p inscripciones logs backend`, o `--simulacro` para ver el plan sin ejecutar. |

**Lo que el comando de la demo nunca hace:** toca solo su proyecto de compose, nunca las bases de pruebas (`*_pruebas`), nunca Chatwoot salvo con `--con-chatwoot`, y se niega a correr con `NODE_ENV=production` o una base que no sea local. Nunca manda nada a Twilio ni a Meta.
