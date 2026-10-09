# Roles mínimos. Cada servicio tiene su rol de TAREA (lo que hace el programa) y comparte un rol de EJECUCIÓN por servicio
# (lo que necesita ECS para arrancarlo: bajar la imagen, escribir logs, leer SUS secretos y ninguno más).

data "aws_iam_policy_document" "ecs_asume" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

# ── Backend ──────────────────────────────────────────────────────────────────────────────────────────────

resource "aws_iam_role" "ejecucion_backend" {
  name               = "${local.prefijo}-ejecucion-backend"
  assume_role_policy = data.aws_iam_policy_document.ecs_asume.json
}

resource "aws_iam_role_policy_attachment" "ejecucion_backend_ecs" {
  role       = aws_iam_role.ejecucion_backend.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

data "aws_iam_policy_document" "secretos_backend" {
  statement {
    sid     = "LeerSusSecretos"
    actions = ["secretsmanager:GetSecretValue"]
    resources = [
      aws_secretsmanager_secret.generado["base-url-aplicacion"].arn,
      aws_secretsmanager_secret.generado["clave-datos-sensibles"].arn,
      aws_secretsmanager_secret.generado["secreto-webhook-chatwoot"].arn,
      aws_secretsmanager_secret.generado["token-metricas"].arn,
      aws_secretsmanager_secret.externo["twilio-auth-token"].arn,
      aws_secretsmanager_secret.externo["chatwoot-admin-token"].arn,
      aws_secretsmanager_secret.externo["chatwoot-bot-token"].arn,
    ]
  }

  statement {
    sid       = "DescifrarSecretos"
    actions   = ["kms:Decrypt"]
    resources = [aws_kms_key.datos.arn]
  }
}

resource "aws_iam_role_policy" "secretos_backend" {
  name   = "secretos"
  role   = aws_iam_role.ejecucion_backend.id
  policy = data.aws_iam_policy_document.secretos_backend.json
}

# El programa del backend no llama a ningún servicio de AWS: su rol de tarea no tiene permisos.
resource "aws_iam_role" "tarea_backend" {
  name               = "${local.prefijo}-tarea-backend"
  assume_role_policy = data.aws_iam_policy_document.ecs_asume.json
}

# ── Migración (tarea puntual en cada despliegue): lee la cuenta dueña y la clave de la aplicación para crear su rol ─────

resource "aws_iam_role" "ejecucion_migracion" {
  name               = "${local.prefijo}-ejecucion-migracion"
  assume_role_policy = data.aws_iam_policy_document.ecs_asume.json
}

resource "aws_iam_role_policy_attachment" "ejecucion_migracion_ecs" {
  role       = aws_iam_role.ejecucion_migracion.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

data "aws_iam_policy_document" "secretos_migracion" {
  statement {
    sid     = "LeerSusSecretos"
    actions = ["secretsmanager:GetSecretValue"]
    resources = [
      aws_secretsmanager_secret.generado["base-url-migrador"].arn,
      aws_secretsmanager_secret.generado["base-clave-aplicacion"].arn,
    ]
  }

  statement {
    sid       = "DescifrarSecretos"
    actions   = ["kms:Decrypt"]
    resources = [aws_kms_key.datos.arn]
  }
}

resource "aws_iam_role_policy" "secretos_migracion" {
  name   = "secretos"
  role   = aws_iam_role.ejecucion_migracion.id
  policy = data.aws_iam_policy_document.secretos_migracion.json
}

resource "aws_iam_role" "tarea_migracion" {
  name               = "${local.prefijo}-tarea-migracion"
  assume_role_policy = data.aws_iam_policy_document.ecs_asume.json
}

# ── Chatwoot ─────────────────────────────────────────────────────────────────────────────────────────────

resource "aws_iam_role" "ejecucion_chatwoot" {
  name               = "${local.prefijo}-ejecucion-chatwoot"
  assume_role_policy = data.aws_iam_policy_document.ecs_asume.json
}

resource "aws_iam_role_policy_attachment" "ejecucion_chatwoot_ecs" {
  role       = aws_iam_role.ejecucion_chatwoot.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

data "aws_iam_policy_document" "secretos_chatwoot" {
  statement {
    sid     = "LeerSusSecretos"
    actions = ["secretsmanager:GetSecretValue"]
    resources = [
      aws_secretsmanager_secret.generado["base-clave-chatwoot"].arn,
      aws_secretsmanager_secret.generado["chatwoot-secret-key-base"].arn,
    ]
  }

  statement {
    sid       = "DescifrarSecretos"
    actions   = ["kms:Decrypt"]
    resources = [aws_kms_key.datos.arn]
  }
}

resource "aws_iam_role_policy" "secretos_chatwoot" {
  name   = "secretos"
  role   = aws_iam_role.ejecucion_chatwoot.id
  policy = data.aws_iam_policy_document.secretos_chatwoot.json
}

# Chatwoot sube sus adjuntos a S3: solo a SU bucket.
resource "aws_iam_role" "tarea_chatwoot" {
  name               = "${local.prefijo}-tarea-chatwoot"
  assume_role_policy = data.aws_iam_policy_document.ecs_asume.json
}

data "aws_iam_policy_document" "adjuntos_chatwoot" {
  statement {
    actions   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
    resources = ["${aws_s3_bucket.adjuntos.arn}/*"]
  }

  statement {
    actions   = ["s3:ListBucket"]
    resources = [aws_s3_bucket.adjuntos.arn]
  }

  statement {
    actions   = ["kms:Decrypt", "kms:GenerateDataKey"]
    resources = [aws_kms_key.datos.arn]
  }
}

resource "aws_iam_role_policy" "adjuntos_chatwoot" {
  name   = "adjuntos"
  role   = aws_iam_role.tarea_chatwoot.id
  policy = data.aws_iam_policy_document.adjuntos_chatwoot.json
}

# ── Monitoreo de RDS y registros de flujo ───────────────────────────────────────────────────────────────

data "aws_iam_policy_document" "rds_monitoreo_asume" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["monitoring.rds.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "monitoreo_rds" {
  name               = "${local.prefijo}-monitoreo-rds"
  assume_role_policy = data.aws_iam_policy_document.rds_monitoreo_asume.json
}

resource "aws_iam_role_policy_attachment" "monitoreo_rds" {
  role       = aws_iam_role.monitoreo_rds.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonRDSEnhancedMonitoringRole"
}

data "aws_iam_policy_document" "flujos_asume" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["vpc-flow-logs.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "flujos" {
  name               = "${local.prefijo}-flujos-vpc"
  assume_role_policy = data.aws_iam_policy_document.flujos_asume.json
}

data "aws_iam_policy_document" "flujos_escribe" {
  statement {
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents", "logs:DescribeLogStreams"]
    resources = ["${aws_cloudwatch_log_group.flujos.arn}:*"]
  }
}

resource "aws_iam_role_policy" "flujos" {
  name   = "escribir-logs"
  role   = aws_iam_role.flujos.id
  policy = data.aws_iam_policy_document.flujos_escribe.json
}
