# ECS Fargate: backend (con la interfaz web adentro), Chatwoot (web y sidekiq), la tarea puntual de migración y la cuadratura diaria.

resource "aws_ecs_cluster" "principal" {
  name = local.prefijo

  setting {
    name  = "containerInsights"
    value = local.es_prod ? "enabled" : "disabled"
  }
}

# Nombres internos: el backend le habla a Chatwoot por chatwoot.<espacio>:3000 sin salir a Internet.
resource "aws_service_discovery_private_dns_namespace" "interno" {
  name = "${local.prefijo}.interno"
  vpc  = aws_vpc.principal.id
}

resource "aws_service_discovery_service" "chatwoot" {
  name = "chatwoot"

  dns_config {
    namespace_id   = aws_service_discovery_private_dns_namespace.interno.id
    routing_policy = "MULTIVALUE"

    dns_records {
      type = "A"
      ttl  = 10
    }
  }

  health_check_custom_config {
    failure_threshold = 1
  }
}

locals {
  chatwoot_interno = "http://chatwoot.${aws_service_discovery_private_dns_namespace.interno.name}:3000"

  entorno_backend = [
    { name = "NODE_ENV", value = "production" },
    { name = "PORT", value = "3000" },
    { name = "COOKIE_SEGURA", value = "true" },
    { name = "ORIGEN_PUBLICO", value = "https://${var.dominio_app}" },
    { name = "PUBLIC_BASE_URL", value = "https://${var.dominio_app}" },
    # Un salto de confianza: el balanceador. Sin esto todas las familias parecerían una sola IP (EB-04).
    { name = "TRUST_PROXY", value = "1" },
    { name = "CHATWOOT_URL", value = local.chatwoot_interno },
    { name = "CHATWOOT_URL_PUBLICA", value = "https://${var.dominio_chatwoot}" },
  ]

  secretos_backend = [
    { name = "DATABASE_URL", valueFrom = aws_secretsmanager_secret.generado["base-url-aplicacion"].arn },
    { name = "CLAVE_DATOS_SENSIBLES", valueFrom = aws_secretsmanager_secret.generado["clave-datos-sensibles"].arn },
    { name = "CHATWOOT_WEBHOOK_SECRETO", valueFrom = aws_secretsmanager_secret.generado["secreto-webhook-chatwoot"].arn },
    { name = "METRICAS_TOKEN", valueFrom = aws_secretsmanager_secret.generado["token-metricas"].arn },
    { name = "TWILIO_AUTH_TOKEN", valueFrom = aws_secretsmanager_secret.externo["twilio-auth-token"].arn },
    { name = "CHATWOOT_ADMIN_TOKEN", valueFrom = aws_secretsmanager_secret.externo["chatwoot-admin-token"].arn },
    { name = "CHATWOOT_BOT_TOKEN", valueFrom = aws_secretsmanager_secret.externo["chatwoot-bot-token"].arn },
  ]

  entorno_chatwoot = [
    { name = "RAILS_ENV", value = "production" },
    { name = "NODE_ENV", value = "production" },
    { name = "INSTALLATION_ENV", value = "docker" },
    { name = "RAILS_LOG_TO_STDOUT", value = "true" },
    { name = "FRONTEND_URL", value = "https://${var.dominio_chatwoot}" },
    { name = "FORCE_SSL", value = "true" },
    { name = "ENABLE_ACCOUNT_SIGNUP", value = "false" },
    { name = "POSTGRES_HOST", value = aws_db_instance.principal.address },
    { name = "POSTGRES_USERNAME", value = "chatwoot" },
    { name = "POSTGRES_DATABASE", value = "chatwoot" },
    { name = "POSTGRES_SSLMODE", value = "require" },
    { name = "REDIS_URL", value = "redis://${aws_elasticache_replication_group.redis.primary_endpoint_address}:6379" },
    { name = "ACTIVE_STORAGE_SERVICE", value = "amazon" },
    { name = "S3_BUCKET_NAME", value = aws_s3_bucket.adjuntos.id },
    { name = "AWS_REGION", value = var.region },
  ]

  secretos_chatwoot = [
    { name = "POSTGRES_PASSWORD", valueFrom = aws_secretsmanager_secret.generado["base-clave-chatwoot"].arn },
    { name = "SECRET_KEY_BASE", valueFrom = aws_secretsmanager_secret.generado["chatwoot-secret-key-base"].arn },
  ]
}

# ── Backend ──────────────────────────────────────────────────────────────────────────────────────────────

resource "aws_ecs_task_definition" "backend" {
  family                   = "${local.prefijo}-backend"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.backend_cpu
  memory                   = var.backend_memoria
  execution_role_arn       = aws_iam_role.ejecucion_backend.arn
  task_role_arn            = aws_iam_role.tarea_backend.arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "ARM64"
  }

  container_definitions = jsonencode([{
    name                   = "backend"
    image                  = var.imagen_backend
    essential              = true
    readonlyRootFilesystem = true
    portMappings           = [{ containerPort = 3000, protocol = "tcp" }]
    environment            = local.entorno_backend
    secrets                = local.secretos_backend
    stopTimeout            = 45 # el cierre ordenado espera hasta 30 s al barrido en curso (src/cierre.ts)
    healthCheck = {
      command     = ["CMD-SHELL", "wget -qO- http://127.0.0.1:3000/salud || exit 1"]
      interval    = 15
      timeout     = 5
      retries     = 3
      startPeriod = 30
    }
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.backend.name
        awslogs-region        = var.region
        awslogs-stream-prefix = "backend"
      }
    }
  }])
}

resource "aws_ecs_service" "backend" {
  name                              = "backend"
  cluster                           = aws_ecs_cluster.principal.id
  task_definition                   = aws_ecs_task_definition.backend.arn
  desired_count                     = var.backend_instancias
  launch_type                       = "FARGATE"
  health_check_grace_period_seconds = 60
  enable_execute_command            = false

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  deployment_minimum_healthy_percent = 100
  deployment_maximum_percent         = 200

  network_configuration {
    subnets          = aws_subnet.aplicacion[*].id
    security_groups  = [aws_security_group.backend.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.backend.arn
    container_name   = "backend"
    container_port   = 3000
  }

  depends_on = [aws_lb_listener.https]
}

# ── Migración: tarea puntual (`aws ecs run-task`) ANTES de cada despliegue del backend ─────────────────────────────
# Corre con la cuenta dueña de las tablas, aplica las migraciones y deja listo el rol de la aplicación (scripts/preparar-roles.ts).

resource "aws_ecs_task_definition" "migracion" {
  family                   = "${local.prefijo}-migracion"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 512
  memory                   = 1024
  execution_role_arn       = aws_iam_role.ejecucion_migracion.arn
  task_role_arn            = aws_iam_role.tarea_migracion.arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "ARM64"
  }

  container_definitions = jsonencode([{
    name      = "migracion"
    image     = var.imagen_migracion
    essential = true
    command   = ["sh", "-c", "npx prisma migrate deploy && node scripts/preparar-roles.ts"]
    secrets = [
      { name = "DATABASE_URL", valueFrom = aws_secretsmanager_secret.generado["base-url-migrador"].arn },
      { name = "CLAVE_ROL_APLICACION", valueFrom = aws_secretsmanager_secret.generado["base-clave-aplicacion"].arn },
    ]
    environment = [
      { name = "NODE_ENV", value = "production" },
      { name = "ROL_APLICACION", value = "inscripciones_app" },
      { name = "ROL_MIGRADOR", value = "inscripciones_migrador" },
    ]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.migracion.name
        awslogs-region        = var.region
        awslogs-stream-prefix = "migracion"
      }
    }
  }])
}

# ── Cuadratura diaria: el dinero se compara contra sí mismo; si no cuadra, la alarma de monitoreo.tf avisa ─────────────

resource "aws_ecs_task_definition" "cuadratura" {
  family                   = "${local.prefijo}-cuadratura"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 256
  memory                   = 512
  execution_role_arn       = aws_iam_role.ejecucion_backend.arn
  task_role_arn            = aws_iam_role.tarea_backend.arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "ARM64"
  }

  container_definitions = jsonencode([{
    name      = "cuadratura"
    image     = var.imagen_backend
    essential = true
    command   = ["node", "scripts/cuadratura.ts"]
    secrets   = [{ name = "DATABASE_URL", valueFrom = aws_secretsmanager_secret.generado["base-url-aplicacion"].arn }]
    environment = [
      { name = "NODE_ENV", value = "production" },
    ]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.backend.name
        awslogs-region        = var.region
        awslogs-stream-prefix = "cuadratura"
      }
    }
  }])
}

# ── Chatwoot ─────────────────────────────────────────────────────────────────────────────────────────────

resource "aws_ecs_task_definition" "chatwoot_web" {
  family                   = "${local.prefijo}-chatwoot-web"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.chatwoot_cpu
  memory                   = var.chatwoot_memoria
  execution_role_arn       = aws_iam_role.ejecucion_chatwoot.arn
  task_role_arn            = aws_iam_role.tarea_chatwoot.arn

  container_definitions = jsonencode([{
    name         = "chatwoot"
    image        = var.imagen_chatwoot
    essential    = true
    entryPoint   = ["docker/entrypoints/rails.sh"]
    command      = ["bundle", "exec", "rails", "s", "-p", "3000", "-b", "0.0.0.0"]
    portMappings = [{ containerPort = 3000, protocol = "tcp" }]
    environment  = local.entorno_chatwoot
    secrets      = local.secretos_chatwoot
    healthCheck = {
      command     = ["CMD-SHELL", "wget -qO- http://127.0.0.1:3000/api || exit 1"]
      interval    = 20
      timeout     = 5
      retries     = 5
      startPeriod = 90
    }
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.chatwoot.name
        awslogs-region        = var.region
        awslogs-stream-prefix = "web"
      }
    }
  }])
}

resource "aws_ecs_task_definition" "chatwoot_sidekiq" {
  family                   = "${local.prefijo}-chatwoot-sidekiq"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.chatwoot_cpu
  memory                   = var.chatwoot_memoria
  execution_role_arn       = aws_iam_role.ejecucion_chatwoot.arn
  task_role_arn            = aws_iam_role.tarea_chatwoot.arn

  container_definitions = jsonencode([{
    name        = "sidekiq"
    image       = var.imagen_chatwoot
    essential   = true
    command     = ["bundle", "exec", "sidekiq", "-C", "config/sidekiq.yml"]
    environment = local.entorno_chatwoot
    secrets     = local.secretos_chatwoot
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.chatwoot.name
        awslogs-region        = var.region
        awslogs-stream-prefix = "sidekiq"
      }
    }
  }])
}

# Crea o migra la base de Chatwoot (rails db:chatwoot_prepare) antes de cada actualización de versión: `aws ecs run-task`.
resource "aws_ecs_task_definition" "chatwoot_preparar" {
  family                   = "${local.prefijo}-chatwoot-preparar"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.chatwoot_cpu
  memory                   = var.chatwoot_memoria
  execution_role_arn       = aws_iam_role.ejecucion_chatwoot.arn
  task_role_arn            = aws_iam_role.tarea_chatwoot.arn

  container_definitions = jsonencode([{
    name        = "preparar"
    image       = var.imagen_chatwoot
    essential   = true
    command     = ["bundle", "exec", "rails", "db:chatwoot_prepare"]
    environment = local.entorno_chatwoot
    secrets     = local.secretos_chatwoot
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.chatwoot.name
        awslogs-region        = var.region
        awslogs-stream-prefix = "preparar"
      }
    }
  }])
}

resource "aws_ecs_service" "chatwoot_web" {
  name                              = "chatwoot"
  cluster                           = aws_ecs_cluster.principal.id
  task_definition                   = aws_ecs_task_definition.chatwoot_web.arn
  desired_count                     = 1
  launch_type                       = "FARGATE"
  health_check_grace_period_seconds = 120

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  network_configuration {
    subnets          = aws_subnet.aplicacion[*].id
    security_groups  = [aws_security_group.chatwoot.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.chatwoot.arn
    container_name   = "chatwoot"
    container_port   = 3000
  }

  service_registries {
    registry_arn = aws_service_discovery_service.chatwoot.arn
  }

  depends_on = [aws_lb_listener.https]
}

resource "aws_ecs_service" "chatwoot_sidekiq" {
  name            = "chatwoot-sidekiq"
  cluster         = aws_ecs_cluster.principal.id
  task_definition = aws_ecs_task_definition.chatwoot_sidekiq.arn
  desired_count   = 1
  launch_type     = "FARGATE"

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  network_configuration {
    subnets          = aws_subnet.aplicacion[*].id
    security_groups  = [aws_security_group.chatwoot.id]
    assign_public_ip = false
  }
}
