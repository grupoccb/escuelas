# Infraestructura de AWS (bloque K6)

Código en `infra/` (Terraform). **Está escrito y validado, nunca desplegado**: nada de lo que hay aquí se ha ejecutado contra AWS ni contra credenciales reales. Lo que se comprobó:

```
npm run infra:validar      # terraform fmt -check, init -backend=false, validate (Terraform local, o la imagen hashicorp/terraform por docker)
node --test scripts/infra-validar.test.ts   # guardas de texto: cifrado, red privada, TLS, secretos fuera del código, alarmas
```

No hay `plan` ni `apply` en ningún script. El despliegue lo hace una persona con credenciales, siguiendo el orden de abajo. Todo valor marcado `[SUPUESTO]` es una decisión que no tomó la escuela ni Eduardo.

## Qué crea

```
Internet ── WAF ── ALB (HTTPS 443; 80 redirige) ──┬─ /webhooks/*  /api/*  /l/*  /salud*  y todo lo demás ─► backend (Fargate, 2 tareas)
                                                  ├─ bandeja.<dominio> ───────────────────────────────────► Chatwoot web (Fargate)
                                                  └─ /metricas ► 404 (no se publica)
VPC 10.40.0.0/16, 2 zonas
  subredes públicas  : ALB, NAT
  subredes de app    : backend, Chatwoot web, Chatwoot sidekiq, tareas puntuales (sin IP pública, salen por NAT)
  subredes de datos  : RDS PostgreSQL 16, ElastiCache Redis (sin salida a Internet)
Secrets Manager (KMS) ── DATABASE_URL, clave de datos de salud, secreto del webhook, token de métricas, Twilio, Chatwoot
S3 (KMS, versiones, sin acceso público) ── respaldos (ciclo de vida) y adjuntos de Chatwoot
CloudWatch ── logs con retención, filtros de métricas, 10 alarmas → SNS → correo; cuadratura diaria (EventBridge → tarea Fargate)
```

| Archivo | Contenido |
|---|---|
| `versions.tf`, `variables.tf` | Proveedores, backend remoto del estado, variables por ambiente. |
| `red.tf`, `seguridad.tf` | VPC de tres capas, NAT (una o una por zona), endpoint de S3, registros de flujo rechazados, grupos de seguridad mínimos. |
| `base_datos.tf` | RDS PostgreSQL 16 cifrado, privado, respaldos, parámetros (`rds.force_ssl`, esperas de candados al log), ElastiCache. Llave KMS con rotación. |
| `secretos.tf` | Secretos generados (contraseñas, claves) y secretos a cargar a mano (Twilio, tokens de Chatwoot). Copia protegida de la clave de datos de salud (`prevent_destroy`). |
| `ecr.tf` | Repositorio con etiquetas inmutables y escaneo al subir. |
| `ecs.tf` | Clúster, backend, Chatwoot (web y sidekiq), tarea de migración, tarea de cuadratura, descubrimiento de nombres interno. |
| `alb.tf` | Balanceador, HTTPS, reglas por ruta y por nombre, WAF con reputación de IP y tasa por IP (sin contar webhooks). |
| `iam.tf` | Un rol de ejecución por servicio que lee SOLO sus secretos; el rol de tarea del backend no tiene permisos. |
| `s3.tf` | Respaldos y adjuntos: sin acceso público, KMS, versiones, solo TLS, ciclo de vida (frío a 30 y 90 días, caducan al año). |
| `monitoreo.tf` | Grupos de logs, filtros, alarmas, tema SNS, cuadratura diaria. |

### Las alarmas

| Alarma | Qué detecta | De dónde sale |
|---|---|---|
| `barrido-atrasado` | Ningún ciclo del barrido en 10 minutos (sin datos = alarma) | log `ciclo_completado` (`src/ciclo.ts`) |
| `ciclos-con-errores` | El barrido termina con errores 3 veces seguidas | log `ciclo_con_errores` |
| `descuadre` | La cuadratura diaria encontró diferencias entre cargos, pagos y aplicaciones | log `cuadratura_descuadre` (`scripts/cuadratura.ts`) |
| `5xx` | Más de 5 respuestas 5xx del backend en 10 minutos | métrica del ALB |
| `sin-tareas-sanas` | Ninguna tarea sana del backend | métrica del ALB (usa `/salud/lista`) |
| `errores-backend` | Más de 10 logs de nivel `error` en 5 minutos | filtro de logs |
| `eventos-inesperados` | Más de 20 webhooks con datos inesperados en 15 minutos | log `evento_inesperado` |
| `rds-cpu`, `rds-espacio`, `rds-conexiones` | Base de datos saturada | métricas de RDS |

## Decisiones y alternativas descartadas

1. **Una sola instancia de RDS con dos bases** (la de la aplicación y la de Chatwoot, que necesita pgvector). Alternativa: dos instancias, el doble de costo base. Se separan sin tocar código cuando el volumen lo pida. `[SUPUESTO]`
2. **ElastiCache en lugar de un contenedor de Redis.** La cola de Chatwoot (sidekiq) perdería trabajos en cada reinicio de un contenedor sin disco. Los mensajes de las familias no pasan por esa cola: si Redis cae, Chatwoot reintenta. Un solo nodo en staging, dos en producción. Sin TLS hacia Redis porque la red es privada y Chatwoot 4.18 necesita configuración extra para ello. `[SUPUESTO]`
3. **Dos cuentas de base de datos** (EB-08, EF-15): la maestra de RDS es la dueña de las tablas y solo la usa la tarea de migración; el backend usa `inscripciones_app`, que se crea con `scripts/preparar-roles.ts` (sin DELETE, sin UPDATE en las seis tablas de solo anexar, sin ALTER ni TRUNCATE ni disparadores). Probado en `src/seguridad/roles.itest.ts`: todo el sistema funciona con esa cuenta y no puede apagar las defensas.
4. **Imágenes separadas** (`Dockerfile`): `produccion` (sin la CLI de Prisma, sin las 4 vulnerabilidades altas transitivas, usuario sin privilegios, sistema de archivos de solo lectura) y `migrar` (con la CLI; corre como tarea puntual, no es un servicio expuesto). Alternativa descartada: una sola imagen con la CLI y migrar al arrancar (cada instancia migraría y la CLI quedaría en producción).
5. **Los secretos generados viven también en el estado de Terraform.** Por eso el estado va a un bucket cifrado con bloqueo (`backend.hcl.example`). Alternativa descartada: pasar los secretos como variables (acabarían en historiales de shell y en CI).
6. **Chatwoot sin autoescalado y con una sola tarea.** Es la bandeja de unos pocos asesores. Si la caída de la bandeja es inaceptable, se sube `desired_count`, pero Chatwoot 4 no está pensado para varias réplicas de `web` sin revisar sesiones y adjuntos. `[SUPUESTO]`
7. **El backend sin autoescalado.** Dos tareas fijas bastan para el volumen de una escuela; el barrido es idempotente y corre en ambas (sin líder). Se puede agregar `aws_appautoscaling_target` por CPU.
8. **`/metricas` no se publica.** El ALB responde 404; se lee desde dentro de la VPC (otra tarea o un Prometheus) con `METRICAS_TOKEN`.

## Orden de un despliegue real (nada de esto se ha hecho)

1. Crear el bucket y la tabla de bloqueo del estado (fuera de este módulo) y copiar `backend.hcl.example` a `backend.hcl`.
2. Pedir el certificado de ACM para los dos dominios (validación por DNS).
3. `cp ambientes/staging.tfvars.example ambientes/staging.tfvars`, editar y `terraform init -backend-config=backend.hcl`, `terraform plan -var-file=ambientes/staging.tfvars` (revisar, nadie lo ha ejecutado) y `apply`.
4. Cargar a mano los secretos externos (`terraform output secretos_a_cargar_a_mano`): token de Twilio, token de administrador y del bot de Chatwoot.
5. Publicar las dos imágenes en el repositorio de `terraform output repositorio_ecr` (`--target produccion` y `--target migrar`) y volver a aplicar con las etiquetas.
6. En RDS: crear la base `chatwoot` y su usuario con `CREATE EXTENSION vector` (una vez, con la cuenta maestra) y correr la tarea `chatwoot-preparar`.
7. Correr la tarea de migración (`terraform output tarea_migracion`): aplica las migraciones y crea la cuenta de la aplicación. Se repite en CADA despliegue, antes de actualizar el servicio.
8. Apuntar el DNS de los dos dominios al ALB (`balanceador_dns`).
9. Configurar en Chatwoot la cuenta, la bandeja de WhatsApp (Twilio) y el Agent Bot con la URL `https://<dominio_app>/webhooks/chatwoot` y el secreto `secreto-webhook-chatwoot`; en Twilio, los webhooks hacia `https://<dominio_app>/webhooks/twilio/...` (vía A o C: ver `docs/DECISION-ATRIBUCION.md`).
10. Verificar `https://<dominio_app>/salud/lista`, correr `npm run cuadratura` como tarea puntual y confirmar la suscripción del correo de alarmas.

Para lo que necesita credenciales reales y no se puede probar sin ellas: `docs/PENDIENTES-CREDENCIALES-REALES.md`.

## Costos aproximados (USD al mes, región us-east-2, precios de lista) `[SUPUESTO]`

Son órdenes de magnitud para decidir, no una cotización: los precios cambian y el tráfico real no se conoce. Sin impuestos, sin transferencia de datos salvo lo que se indica, sin soporte de AWS.

| Concepto | Staging | Producción |
|---|---|---|
| ALB (cargo fijo y unos pocos LCU) | 22 | 25 |
| NAT (33 por gateway) | 33 (una) | 66 (una por zona) + datos |
| Fargate backend (0.5 vCPU, 1 GB, ARM) | 14 (1 tarea) | 29 (2 tareas) |
| Fargate Chatwoot web y sidekiq (1 vCPU, 2 GB, x86) | 72 | 72 |
| RDS PostgreSQL (small / medium; Multi-AZ en producción) + disco | 30 | 118 |
| ElastiCache (1 / 2 nodos `cache.t4g.micro`) | 12 | 23 |
| WAF | 0 | 8 |
| Secrets Manager (14 secretos) | 6 | 6 |
| CloudWatch (logs, 10 alarmas, métricas) | 7 | 12 |
| KMS, S3, ECR | 5 | 8 |
| **Total aproximado** | **~200** | **~370** |

Dónde se ahorra, en orden de impacto: una sola NAT en producción (−33, a costa de que una caída de zona deje a la aplicación sin salida); `rds_multi_az = false` (−59, a costa de minutos de caída si la zona falla); quitar el WAF (−8); retención de logs más corta. Dónde NO se debe ahorrar: el cifrado, los respaldos, y las alarmas.

## RPO y RTO

Ver `docs/RESPALDO.md`. Con esta infraestructura: respaldos automáticos de RDS con retención de 14 días (hasta 35) y recuperación a un punto en el tiempo (RPO de minutos), más el respaldo lógico (`npm run respaldo`) que HOY es manual: la infraestructura no trae una tarea programada ni permisos para escribir en el bucket de respaldos (K9, EK-03; queda como pendiente, ver `docs/PENDIENTES-CREDENCIALES-REALES.md`). RTO: restaurar a una instancia nueva tarda del orden de 30 a 60 minutos más el cambio de `DATABASE_URL`. La clave de cifrado de datos de salud NO se respalda con la base: vive en Secrets Manager y tiene una copia protegida contra borrado; guarda otra copia fuera de AWS (un gestor de contraseñas de la dirección).

## Lo que este módulo no cubre

El bucket y la tabla del estado, el certificado de ACM, el DNS, la cuenta de AWS y sus usuarios de administración, la cuenta de Twilio y la aprobación de plantillas por Meta, el pipeline de CI que construye y sube las imágenes, un `terraform plan` real. Ninguno de ellos se puede validar sin credenciales.
