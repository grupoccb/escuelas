# Lo que falta con credenciales reales (bloque K7)

Todo el sistema se probó con servicios simulados (transporte falso, Chatwoot local con Twilio apuntado a loopback, Terraform sin desplegar). Esta es la lista de lo que **no se puede comprobar sin credenciales o sin el mundo real**, en el orden en que conviene hacerlo. Cada punto dice qué es, quién lo hace, y cómo se sabe que quedó bien. Las decisiones de producto abiertas y los `[SUPUESTO]` del catálogo están aparte, en `docs/SUPUESTOS-Y-DECISIONES.md`.

## 1. Cuentas y dominio (antes de todo)

| # | Qué | Quién | Listo cuando |
|---|---|---|---|
| 1.1 | **Cuenta de AWS** de la escuela (o de Grupo CCB) con un usuario de administración y MFA | Grupo CCB | Se puede correr `terraform plan` con ese usuario |
| 1.2 | **Dominio** y los dos nombres (`app.<dominio>`, `bandeja.<dominio>`) y su **certificado TLS** en ACM, validado por DNS | Grupo CCB / quien lleve el DNS | `infra/` recibe `certificado_arn`; `https://app.<dominio>/salud` responde por HTTPS con el certificado válido |
| 1.3 | **Bucket y tabla de bloqueo del estado de Terraform** (cifrados) | Grupo CCB | `terraform init -backend-config=backend.hcl` funciona |
| 1.4 | **Primer despliegue real** (`terraform plan` revisado línea por línea → `apply`) | Grupo CCB | Los 10 pasos de `docs/INFRA-AWS.md`. **Nunca se ha corrido un `plan` real**: se validaron `fmt` y `validate`, no los permisos, cuotas ni nombres únicos de tu cuenta |
| 1.5 | Correo de alarmas confirmado (SNS) y una alarma de prueba disparada a propósito | Grupo CCB | Llega el correo; se resuelve |

## 2. Twilio, WhatsApp y Meta

| # | Qué | Listo cuando |
|---|---|---|
| 2.1 | **Cuenta de Twilio** y **WhatsApp Business Account (WABA)** verificada en Meta Business Manager; nombre visible de la escuela aprobado | WhatsApp muestra el nombre de la escuela al contacto |
| 2.2 | **Números de WhatsApp** de cada canal (uno por vertical, o por sucursal si la escuela separa), dados de alta como remitentes de Twilio | Un mensaje de prueba sale y entra por cada número |
| 2.3 | **Plantillas aprobadas por Meta** (Twilio Content Templates) con el MISMO `codigo` que las filas de `plantilla_mensaje` y el orden de variables de cada una: `recordatorio_clase_muestra`, `aviso_maestro_agendada` / `_reprogramada` / `_cancelada`, `recuperacion_no_asistio`, `bienvenida_inscripcion`, `reenganche_captacion`, `reenganche_lead_frio`, `promocion_por_vencer`, `recordatorio_pago_*` (las de marketing en categoría marketing, las de servicio en utilidad). Los textos del seed son ejemplo | Cada una figura «aprobada» y un envío real de cada una llega bien. **Las del seed están marcadas «aprobadas» solo para la demo: ninguna lo está de verdad** |
| 2.4 | **Webhooks de Twilio** hacia `https://app.<dominio>/webhooks/twilio/entrantes` (y `/estados` si se elige la vía C) con `TWILIO_AUTH_TOKEN` y `PUBLIC_BASE_URL` en el backend | Un mensaje entrante real aparece en Chatwoot y el backend; uno con firma falsa recibe 403 |
| 2.5 | **Vía de atribución A o C** (`docs/DECISION-ATRIBUCION.md`; Eduardo decide). La vía A (Chatwoot recibe de Twilio y el backend recibe del Agent Bot) funciona simulada con tres salvedades: **Chatwoot 4.18 no valida la firma de Twilio** (el backend la valida en el borde), un reintento de Twilio duplica el mensaje (por eso el borde deduplica por `MessageSid`) y **hay que confirmar con Twilio real que el referral llega con esos nombres** (`ReferralSourceId`, `ReferralCtwaClid`…) | Un anuncio Click-to-WhatsApp real crea un lead con su campaña (`lead.atribucion`) |
| 2.6 | **Estados de entrega de la vía A** (EA-02): en la vía A Chatwoot fija su propio `status_callback` y los estados no pasan por el borde del backend. Elegir: (a) vía C, (b) un proxy que valide, o (c) aceptar y proteger por red | Un mensaje enviado real llega a `entregado`/`leído` y uno a un número inválido a `fallido` con su tarea |
| 2.7 | **Envío de plantillas con Twilio real** desde Chatwoot (formato de `template_params`, reflejo del estado de aprobación) y que un mensaje enviado por Chatwoot quede con el `MessageSid` real | Una plantilla fuera de la ventana de 24 h llega; una libre dentro de ella también |
| 2.8 | **Un anuncio Click-to-WhatsApp real** en Meta Ads Manager con la campaña y el `anuncio_id` dados de alta en el sistema (y un QR impreso) | El lead aparece atribuido; el costo por alumno inscrito sale de lo que se capture |

## 3. Chatwoot en AWS

| # | Qué | Listo cuando |
|---|---|---|
| 3.1 | Crear la cuenta, el **Agent Bot** (URL `https://app.<dominio>/webhooks/chatwoot` y el secreto `secreto-webhook-chatwoot`), las **bandejas** de WhatsApp por Twilio y los **agentes** (asesores) | Un mensaje entrante llega al bot; una persona toma la conversación y el sistema calla al bot |
| 3.2 | **Sin asignación automática** de conversaciones en las bandejas (EA-22: hoy no se verifica al arrancar) | Una conversación nueva no se asigna sola a un agente |
| 3.3 | Tokens de administrador y del bot en Secrets Manager; **vincular cada usuario con su agente** (`POST /api/usuarios/:id/vincular-chatwoot`: el directorio de agentes nunca se probó contra un Chatwoot real, B5) | Asignar una conversación en Chatwoot se refleja en la ficha del lead |
| 3.4 | Base `chatwoot` en RDS con la extensión `vector` y la tarea `chatwoot-preparar`; adjuntos en S3 (revisar que Chatwoot 4.18 acepte el rol de la tarea sin llaves de acceso) | La bandeja abre, se suben adjuntos y se reinicia la tarea sin perder nada |
| 3.5 | Una sola cuenta de Twilio por despliegue (EA-21) si algún día hay otra escuela | — |

## 4. Pruebas en el mundo real

| # | Qué | Listo cuando |
|---|---|---|
| 4.1 | **Teléfonos reales de cada compañía** (Telcel, AT&T, Movistar): el formato `+521…` / `+52…` se colapsa con `normalizarTelefono`, pero nunca se probó contra números reales de WhatsApp; ¿la familia recibe y contesta bien? | Los tres envían y reciben; el mismo número no genera dos familias |
| 4.2 | **La landing en navegadores reales**: se probó en Chromium (Playwright), no en Safari, Firefox ni celulares. El `Origin: null` de Firefox (EF-25) y el salto a `wa.me` | Un envío desde un iPhone y un Android abre WhatsApp con el mensaje y el código |
| 4.3 | **El QR impreso** leído con cámaras de celular reales (solo se probó con un lector de software) | Se escanea desde pantalla y desde papel |
| 4.4 | **La interfaz en celulares reales** (maestro a 390 px, recepción) | El maestro registra a un alumno en su teléfono |
| 4.5 | **Carga con los datos de la escuela**: las ráfagas de `src/robustez/` corrieron en una máquina local; falta una prueba con el volumen real y varias tareas | Latencias y barridos dentro de lo esperado con la base de la escuela |
| 4.6 | **Ensayo de restauración** con la base real y el cifrado de respaldos (`docs/RESPALDO.md`) | RTO medido y anotado; la clave de salud abre las fichas restauradas |
| 4.7 | **Revisión de seguridad externa** (prueba de penetración) y revisión de la configuración real de AWS; las 4 vulnerabilidades altas de la CLI de Prisma quedan fuera de producción pero conviene vigilarlas | Informe sin altos pendientes |
| 4.8 | **Rotación de la clave de datos de salud**: el procedimiento está escrito y probado en pequeño; ensayarlo con datos reales y conservar las claves anteriores mientras existan respaldos | Una ficha cifrada con la clave vieja se lee tras rotar |

## 5. Lo que depende de la escuela

| # | Qué | Quién |
|---|---|---|
| 5.1 | Confirmar los **`[SUPUESTO]` del catálogo** (precios, cupos, duraciones de clase, capacidad de salones, edades, promociones, colores, instructores) y los tiempos y topes de las automatizaciones | La escuela y Eduardo (`docs/SUPUESTOS-Y-DECISIONES.md`) |
| 5.2 | **Reglamento, uso de imagen y aviso de privacidad** definitivos; el aviso lo revisa un abogado | La escuela y su abogado |
| 5.3 | **Textos de las plantillas** (tono, nombre de la escuela, datos de contacto) y su envío a aprobación | La escuela |
| 5.4 | Quiénes son los usuarios (asesores, maestros, recepción) y a qué sucursales pertenecen; el día de corte y las reglas de cobranza | La escuela |
| 5.5 | **Contraseñas iniciales** de cada persona y un primer ingreso supervisado (no hay cambio obligatorio de contraseña en el primer acceso, EB-20) | Grupo CCB |

## 6. Cosas que SÍ se resolvieron y conviene no repetir

Todo lo que tenía que ver con el sistema solo (cupo, dinero, webhooks, concurrencia, respaldos, infraestructura escrita, seguridad de la aplicación) está probado con servicios simulados y evidencia en `docs/BITACORA-NOCHE-2.md`. Lo que sigue pendiente es la unión con el mundo real: las credenciales, los proveedores y las personas.
