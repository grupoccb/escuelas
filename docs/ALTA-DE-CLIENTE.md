# Alta de un cliente nuevo (bloque K7)

Cómo poner el sistema a trabajar para otra escuela **sin tocar una línea de código** (con UNA salvedad que la auditoría K9 dejó a la vista, EK-I02: las automatizaciones no se pueden crear por la API —solo editar, encender y apagar— y la plantilla de organización no las trae; mientras no se decida, una escuela nueva necesita que alguien técnico corra los seeds de plantillas y automatizaciones, `clase-muestra.sql` y `seguimiento.sql`, adaptados a su organización). La prueba de que se puede es `src/captacion/prueba-de-fuego.itest.ts` (una vertical nueva solo con filas) y `src/robustez/prueba-de-fuego-total.itest.ts` (una sucursal y una vertical nuevas dadas de alta solo por la API de administración, operando de punta a punta).

## Lo que SÍ y lo que NO se construye

**La organización (la escuela) nace por seed, a propósito.** El invariante 1 prohíbe construir el alta de organizaciones: hoy hay una, y las siguientes se crean con un SQL revisado por una persona, no con una pantalla. Todo lo demás se da de alta desde la administración (interfaz o API), con un usuario administrador.

## 1. La organización (una vez, con la cuenta que migra)

1. Copia `prisma/seed/plantilla-organizacion.sql` a `prisma/seed/<escuela>.sql` y cambia los dos textos marcados `CAMBIAR` (nombre e identificador corto: minúsculas, números y guiones; es lo que se escribe al iniciar sesión).
2. Córrelo contra la base de la escuela: `DATABASE_URL=<cuenta dueña> npx prisma db execute --file prisma/seed/<escuela>.sql`. Es idempotente. Crea la organización, las siete etapas del embudo con su papel para el sistema y la configuración con los valores del contexto (3 mensajes automáticos al día; 1 de marketing cada 7 días).
3. **NO uses `prisma/seed/demo.sql`**: trae usuarios con una contraseña pública. Tampoco `catalogo*.sql` ni `segunda-vertical.sql`: son el catálogo de la escuela de ejemplo. Su valor es como referencia de qué filas lleva un catálogo completo.
4. El primer administrador: `node --env-file=.env scripts/crear-usuario.ts --organizacion <identificador> --correo … --nombre … --rol administrador` (la contraseña se lee de `CONTRASENA` o se pide; mínimo 10 caracteres, no de las más usadas). Entra a la interfaz con él.

Un ambiente nuevo en AWS (infraestructura, secretos, migración): `docs/INFRA-AWS.md`. Una instancia de Twilio por despliegue (EA-21).

## 2. Todo lo demás, desde Administración (con el administrador)

En este orden, porque cada paso usa el anterior. «API» es el recurso de `docs/API.md`:

| # | Qué | Notas |
|---|---|---|
| 1 | **Verticales** | Nombre, identificador corto (el de la landing: `/l/<identificador>`), color y logo; interruptores del cotizador y de la clase muestra por WhatsApp; si usa progresión (cinturones, niveles…) y sus etiquetas. Los nombres de la escuela viven aquí: el código jamás los nombra |
| 2 | **Sucursales** | Nombre, dirección, zona horaria (de ahí sale el horario de 09:00 a 20:00 y el calendario de los cobros) y qué verticales ofrece |
| 3 | **Salones** | Por sucursal, con capacidad (opcional) |
| 4 | **Programas** | Por vertical y sucursal: edades (sin traslape con otro programa de la misma vertical y sucursal salvo que ambos lo permitan), descripción pública |
| 5 | **Instructores** | Con su teléfono (los avisos de clase muestra le llegan por WhatsApp); un usuario con rol maestro se liga a su instructor |
| 6 | **Grupos y horarios** | Cupo, salón, instructor, días y horas (el sistema revisa choques de salón e instructor) |
| 7 | **Precios** | Inscripción y mensualidad por programa, con vigencia (el nuevo cierra el anterior). Sin precio vigente no se inscribe ni se cotiza |
| 8 | **Promociones** | Condición (sin condición, mínimo de hermanos, al pagar la primera mensualidad…), vigencia, cupo, alcance y beneficios (descuento, mes gratis, producto) |
| 9 | **Productos** | Uniformes y artículos, con talla, precio y existencia; la entrega de un beneficio de producto descuenta del inventario |
| 10 | **Documentos legales** | Reglamento, uso de imagen y aviso de privacidad (versión 1); sin reglamento vigente no se puede inscribir. **El aviso de privacidad debe revisarlo un abogado** |
| 11 | **Canal de WhatsApp y bandeja de Chatwoot** | Un canal por vertical (y sucursal si la escuela separa números); su bandeja en Chatwoot con el Agent Bot apuntando a `https://<dominio>/webhooks/chatwoot`. En local lo hace `scripts/preparar-chatwoot.ts`; en AWS, a mano (`docs/INFRA-AWS.md`, paso 9) |
| 12 | **Plantillas y automatizaciones** | Las plantillas se registran y aprueban en Twilio/Meta con el MISMO código; cada una declara si es de servicio o de marketing. Las automatizaciones (reenganche, recordatorios, cobranza…) hoy las crea un paso técnico (seed) y desde Administración se encienden, se apagan y se ajustan por vertical y sucursal (EK-I02: pendiente decidir si nacen sembradas o con alta por API) |
| 13 | **Usuarios y roles** | Asesores (por sucursal), maestros (con su instructor), recepción (por sucursal), administradores. Vincular cada asesor con su agente de Chatwoot |
| 14 | **Campañas y códigos QR** | Una campaña por fuente (anuncio, QR de sucursal…); el QR lleva el código de rastreo; los gastos de campaña se capturan a mano para el costo por alumno |
| 15 | **Catálogos editables** | Motivos de pérdida y de baja, niveles de progresión, límites de frecuencia, modo de cierre de la inscripción (`maestro_en_sitio` o con asesor) |

## 3. Verificación antes de abrir

1. `GET /api/cotizador?vertical_id=…&sucursal_id=…&edad=…` devuelve un programa con grupos, lugares y precio para una edad de cada programa.
2. La landing `https://<dominio>/l/<identificador>` abre con el nombre y el color de la escuela; enviar el formulario crea un lead (y el `wa.me` lleva el código de rastreo).
3. Un mensaje de prueba por WhatsApp recorre el bot hasta la cotización; la clase muestra se agenda y el maestro recibe su aviso.
4. Una inscripción de prueba genera sus cargos; un pago de prueba cuadra: `npm run cuadratura` en verde. Cancela el pago y da de baja la inscripción de prueba.
5. `GET /salud/lista` en verde; `npm audit` sin sorpresas; el correo de alarmas confirmó su suscripción.
6. `npm run demo:guiada` muestra el recorrido completo con datos de ejemplo (en otra base) para enseñárselo al equipo.

## 4. Lo que la escuela debe entregar (antes de abrir)

Nombres y direcciones de sucursales; verticales, programas, edades, grupos, horarios, cupos y salones reales; precios, promociones y reglas de hermanos; textos del reglamento, uso de imagen y aviso de privacidad; los números de WhatsApp y su verificación en Meta; qué plantillas quiere y su texto; quiénes son los asesores, maestros y recepcionistas; el día de corte y las reglas de cobranza. Lo que hoy es ejemplo `[SUPUESTO]` está en `docs/SUPUESTOS-Y-DECISIONES.md`.
