variable "proyecto" {
  description = "Prefijo de todos los recursos."
  type        = string
  default     = "inscripciones"
}

variable "ambiente" {
  description = "staging o produccion. Cambia tamaños, redundancia y protecciones contra borrado."
  type        = string

  validation {
    condition     = contains(["staging", "produccion"], var.ambiente)
    error_message = "El ambiente es staging o produccion."
  }
}

variable "region" {
  description = "Región de AWS. [SUPUESTO] us-east-2 por costo; Mexico (mx-central-1) si la escuela exige residencia de datos."
  type        = string
  default     = "us-east-2"
}

# ── Red ──────────────────────────────────────────────────────────────────────────────────────────────────

variable "vpc_cidr" {
  type    = string
  default = "10.40.0.0/16"
}

variable "zonas" {
  description = "Dos zonas de disponibilidad (el balanceador y RDS Multi-AZ las necesitan)."
  type        = list(string)

  validation {
    condition     = length(var.zonas) == 2
    error_message = "Indica exactamente dos zonas de disponibilidad."
  }
}

variable "nat_por_zona" {
  description = "true: una NAT por zona (alta disponibilidad, el doble de costo). false: una sola (staging)."
  type        = bool
  default     = false
}

# ── Dominio y TLS ────────────────────────────────────────────────────────────────────────────────────────

variable "dominio_app" {
  description = "Nombre público del backend y la interfaz, p. ej. app.escuela.example. Es el que usa Twilio (PUBLIC_BASE_URL) y la cookie de sesión."
  type        = string
}

variable "dominio_chatwoot" {
  description = "Nombre público de Chatwoot (la bandeja de los asesores), p. ej. bandeja.escuela.example."
  type        = string
}

variable "certificado_arn" {
  description = "ARN del certificado de ACM (en la misma región) que cubre los dos dominios. El DNS lo apunta a mano o con Route 53 fuera de este módulo."
  type        = string
}

variable "cidrs_administracion" {
  description = "Redes desde las que se puede abrir la bandeja de Chatwoot y la interfaz sin pasar por el WAF (vacío = todo Internet; los webhooks siempre son públicos)."
  type        = list(string)
  default     = []
}

# ── Contenedores ─────────────────────────────────────────────────────────────────────────────────────────

variable "imagen_backend" {
  description = "Imagen del backend en ECR (target «produccion» del Dockerfile), con su etiqueta inmutable."
  type        = string
}

variable "imagen_migracion" {
  description = "Imagen con la CLI de Prisma (target «migrar» del Dockerfile). Solo corre como tarea puntual en cada despliegue."
  type        = string
}

variable "imagen_chatwoot" {
  description = "Imagen de Chatwoot, fijada a la misma versión que usa el docker compose."
  type        = string
  default     = "chatwoot/chatwoot:v4.18.0"
}

variable "backend_cpu" {
  type    = number
  default = 512
}

variable "backend_memoria" {
  type    = number
  default = 1024
}

variable "backend_instancias" {
  description = "Tareas del backend. El barrido de cada minuto es idempotente y corre en todas: no hace falta un líder."
  type        = number
  default     = 2
}

variable "chatwoot_cpu" {
  type    = number
  default = 1024
}

variable "chatwoot_memoria" {
  type    = number
  default = 2048
}

# ── Base de datos ────────────────────────────────────────────────────────────────────────────────────────

variable "rds_clase" {
  type    = string
  default = "db.t4g.medium"
}

variable "rds_almacenamiento_gb" {
  type    = number
  default = 50
}

variable "rds_almacenamiento_max_gb" {
  description = "Tope del crecimiento automático."
  type        = number
  default     = 200
}

variable "rds_multi_az" {
  description = "true en produccion. Duplica el costo de la instancia."
  type        = bool
  default     = false
}

variable "rds_retencion_respaldos_dias" {
  type    = number
  default = 14

  validation {
    condition     = var.rds_retencion_respaldos_dias >= 7 && var.rds_retencion_respaldos_dias <= 35
    error_message = "Entre 7 y 35 días."
  }
}

variable "redis_clase" {
  description = "ElastiCache para la cola de Chatwoot (sidekiq). Un contenedor de Redis sin disco perdería los trabajos en cada reinicio."
  type        = string
  default     = "cache.t4g.micro"
}

# ── Operación ────────────────────────────────────────────────────────────────────────────────────────────

variable "correo_alarmas" {
  description = "A dónde llegan las alarmas (SNS; hay que confirmar la suscripción desde el correo)."
  type        = string
}

variable "retencion_logs_dias" {
  type    = number
  default = 90
}

variable "respaldos_retencion_dias" {
  description = "Cuándo caducan los respaldos lógicos en S3."
  type        = number
  default     = 365
}

variable "waf_activo" {
  description = "Regla por tasa (EB-18) y conjunto común de reglas administradas delante del balanceador."
  type        = bool
  default     = true
}

variable "waf_limite_5min" {
  description = "Peticiones por IP en cinco minutos antes de bloquear (el backend ya limita por minuto; esto frena lo que ni llega a él)."
  type        = number
  default     = 3000
}
