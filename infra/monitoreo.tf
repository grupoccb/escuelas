# CloudWatch: logs con retención, alarmas a un tema de SNS y la cuadratura diaria.
# Los filtros leen los logs JSON del backend (src/lib/log.ts): una línea por evento con `evento` y `nivel`.

resource "aws_cloudwatch_log_group" "backend" {
  name              = "/${var.proyecto}/${var.ambiente}/backend"
  retention_in_days = var.retencion_logs_dias
  kms_key_id        = aws_kms_key.datos.arn
}

resource "aws_cloudwatch_log_group" "chatwoot" {
  name              = "/${var.proyecto}/${var.ambiente}/chatwoot"
  retention_in_days = var.retencion_logs_dias
  kms_key_id        = aws_kms_key.datos.arn
}

resource "aws_cloudwatch_log_group" "migracion" {
  name              = "/${var.proyecto}/${var.ambiente}/migracion"
  retention_in_days = var.retencion_logs_dias
  kms_key_id        = aws_kms_key.datos.arn
}

resource "aws_cloudwatch_log_group" "flujos" {
  name              = "/${var.proyecto}/${var.ambiente}/flujos-vpc"
  retention_in_days = 30
  kms_key_id        = aws_kms_key.datos.arn
}

# CloudWatch Logs necesita permiso para usar la llave de KMS.
data "aws_iam_policy_document" "llave_logs" {
  statement {
    sid       = "AdministracionDeLaCuenta"
    actions   = ["kms:*"]
    resources = ["*"]

    principals {
      type        = "AWS"
      identifiers = ["arn:aws:iam::${data.aws_caller_identity.actual.account_id}:root"]
    }
  }

  statement {
    sid       = "LogsCifranConLaLlave"
    actions   = ["kms:Encrypt*", "kms:Decrypt*", "kms:ReEncrypt*", "kms:GenerateDataKey*", "kms:Describe*"]
    resources = ["*"]

    principals {
      type        = "Service"
      identifiers = ["logs.${var.region}.amazonaws.com"]
    }
  }
}

resource "aws_kms_key_policy" "datos" {
  key_id = aws_kms_key.datos.id
  policy = data.aws_iam_policy_document.llave_logs.json
}

resource "aws_sns_topic" "alarmas" {
  name              = "${local.prefijo}-alarmas"
  kms_master_key_id = "alias/aws/sns"
}

resource "aws_sns_topic_subscription" "correo" {
  topic_arn = aws_sns_topic.alarmas.arn
  protocol  = "email"
  endpoint  = var.correo_alarmas
}

# ── Métricas a partir de los logs ───────────────────────────────────────────────────────────────────────

resource "aws_cloudwatch_log_metric_filter" "ciclo_completado" {
  name           = "ciclo-completado"
  log_group_name = aws_cloudwatch_log_group.backend.name
  pattern        = "{ $.evento = \"ciclo_completado\" }"

  metric_transformation {
    name          = "CiclosCompletados"
    namespace     = "Inscripciones"
    value         = "1"
    default_value = "0"
  }
}

resource "aws_cloudwatch_log_metric_filter" "ciclo_con_errores" {
  name           = "ciclo-con-errores"
  log_group_name = aws_cloudwatch_log_group.backend.name
  pattern        = "{ $.evento = \"ciclo_con_errores\" }"

  metric_transformation {
    name          = "CiclosConErrores"
    namespace     = "Inscripciones"
    value         = "1"
    default_value = "0"
  }
}

resource "aws_cloudwatch_log_metric_filter" "descuadre" {
  name           = "cuadratura-descuadre"
  log_group_name = aws_cloudwatch_log_group.backend.name
  pattern        = "{ $.evento = \"cuadratura_descuadre\" }"

  metric_transformation {
    name          = "Descuadres"
    namespace     = "Inscripciones"
    value         = "1"
    default_value = "0"
  }
}

resource "aws_cloudwatch_log_metric_filter" "errores" {
  name           = "errores-del-backend"
  log_group_name = aws_cloudwatch_log_group.backend.name
  pattern        = "{ $.nivel = \"error\" }"

  metric_transformation {
    name          = "Errores"
    namespace     = "Inscripciones"
    value         = "1"
    default_value = "0"
  }
}

resource "aws_cloudwatch_log_metric_filter" "eventos_inesperados" {
  name           = "eventos-inesperados"
  log_group_name = aws_cloudwatch_log_group.backend.name
  pattern        = "{ $.evento = \"evento_inesperado\" }"

  metric_transformation {
    name          = "EventosInesperados"
    namespace     = "Inscripciones"
    value         = "1"
    default_value = "0"
  }
}

# ── Alarmas ─────────────────────────────────────────────────────────────────────────────────────────────

# El barrido (recordatorios, reenganche, cobranza, recuperación de envíos inciertos) corre cada minuto. Si en 10 minutos no se completó
# NINGÚN ciclo, algo está parado: una familia dejaría de recibir avisos sin que nadie lo note. Sin datos = alarma.
resource "aws_cloudwatch_metric_alarm" "barrido_atrasado" {
  alarm_name          = "${local.prefijo}-barrido-atrasado"
  alarm_description   = "Ningún ciclo del barrido se completó en 10 minutos"
  namespace           = "Inscripciones"
  metric_name         = "CiclosCompletados"
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 2
  threshold           = 1
  comparison_operator = "LessThanThreshold"
  treat_missing_data  = "breaching"
  alarm_actions       = [aws_sns_topic.alarmas.arn]
  ok_actions          = [aws_sns_topic.alarmas.arn]
}

resource "aws_cloudwatch_metric_alarm" "ciclos_con_errores" {
  alarm_name          = "${local.prefijo}-ciclos-con-errores"
  alarm_description   = "El barrido termina con errores varias veces seguidas"
  namespace           = "Inscripciones"
  metric_name         = "CiclosConErrores"
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 3
  threshold           = 3
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alarmas.arn]
}

resource "aws_cloudwatch_metric_alarm" "descuadre" {
  alarm_name          = "${local.prefijo}-descuadre"
  alarm_description   = "La cuadratura del dinero encontró una diferencia (cargos, pagos y aplicaciones no cuadran)"
  namespace           = "Inscripciones"
  metric_name         = "Descuadres"
  statistic           = "Sum"
  period              = 3600
  evaluation_periods  = 1
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alarmas.arn]
}

resource "aws_cloudwatch_metric_alarm" "errores_backend" {
  alarm_name          = "${local.prefijo}-errores-backend"
  alarm_description   = "Más de 10 errores registrados por el backend en 5 minutos"
  namespace           = "Inscripciones"
  metric_name         = "Errores"
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 10
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alarmas.arn]
}

resource "aws_cloudwatch_metric_alarm" "eventos_inesperados" {
  alarm_name          = "${local.prefijo}-eventos-inesperados"
  alarm_description   = "Muchos webhooks con datos inesperados (cada uno ya dejó constancia y tarea para un asesor)"
  namespace           = "Inscripciones"
  metric_name         = "EventosInesperados"
  statistic           = "Sum"
  period              = 900
  evaluation_periods  = 1
  threshold           = 20
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alarmas.arn]
}

resource "aws_cloudwatch_metric_alarm" "cinco_xx" {
  alarm_name          = "${local.prefijo}-5xx"
  alarm_description   = "El backend responde 5xx (un webhook solo da 5xx por una falla del momento)"
  namespace           = "AWS/ApplicationELB"
  metric_name         = "HTTPCode_Target_5XX_Count"
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 2
  threshold           = 5
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alarmas.arn]

  dimensions = {
    LoadBalancer = aws_lb.principal.arn_suffix
    TargetGroup  = aws_lb_target_group.backend.arn_suffix
  }
}

resource "aws_cloudwatch_metric_alarm" "sin_tareas_sanas" {
  alarm_name          = "${local.prefijo}-sin-tareas-sanas"
  alarm_description   = "El balanceador no tiene ninguna tarea sana del backend"
  namespace           = "AWS/ApplicationELB"
  metric_name         = "HealthyHostCount"
  statistic           = "Minimum"
  period              = 60
  evaluation_periods  = 3
  threshold           = 1
  comparison_operator = "LessThanThreshold"
  treat_missing_data  = "breaching"
  alarm_actions       = [aws_sns_topic.alarmas.arn]

  dimensions = {
    LoadBalancer = aws_lb.principal.arn_suffix
    TargetGroup  = aws_lb_target_group.backend.arn_suffix
  }
}

resource "aws_cloudwatch_metric_alarm" "rds_cpu" {
  alarm_name          = "${local.prefijo}-rds-cpu"
  alarm_description   = "CPU de la base de datos por encima de 80 % durante 15 minutos"
  namespace           = "AWS/RDS"
  metric_name         = "CPUUtilization"
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 3
  threshold           = 80
  comparison_operator = "GreaterThanThreshold"
  alarm_actions       = [aws_sns_topic.alarmas.arn]

  dimensions = {
    DBInstanceIdentifier = aws_db_instance.principal.identifier
  }
}

resource "aws_cloudwatch_metric_alarm" "rds_espacio" {
  alarm_name          = "${local.prefijo}-rds-espacio"
  alarm_description   = "Menos de 10 GB libres en la base de datos"
  namespace           = "AWS/RDS"
  metric_name         = "FreeStorageSpace"
  statistic           = "Minimum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 10737418240
  comparison_operator = "LessThanThreshold"
  alarm_actions       = [aws_sns_topic.alarmas.arn]

  dimensions = {
    DBInstanceIdentifier = aws_db_instance.principal.identifier
  }
}

resource "aws_cloudwatch_metric_alarm" "rds_conexiones" {
  alarm_name          = "${local.prefijo}-rds-conexiones"
  alarm_description   = "Conexiones a la base de datos cerca del tope"
  namespace           = "AWS/RDS"
  metric_name         = "DatabaseConnections"
  statistic           = "Maximum"
  period              = 300
  evaluation_periods  = 2
  threshold           = 150
  comparison_operator = "GreaterThanThreshold"
  alarm_actions       = [aws_sns_topic.alarmas.arn]

  dimensions = {
    DBInstanceIdentifier = aws_db_instance.principal.identifier
  }
}

# ── Cuadratura diaria ────────────────────────────────────────────────────────────────────────────────────

data "aws_iam_policy_document" "eventos_asume" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["events.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "eventos" {
  name               = "${local.prefijo}-eventos"
  assume_role_policy = data.aws_iam_policy_document.eventos_asume.json
}

data "aws_iam_policy_document" "eventos_ejecuta" {
  statement {
    actions   = ["ecs:RunTask"]
    resources = [aws_ecs_task_definition.cuadratura.arn]

    condition {
      test     = "ArnEquals"
      variable = "ecs:cluster"
      values   = [aws_ecs_cluster.principal.arn]
    }
  }

  statement {
    actions   = ["iam:PassRole"]
    resources = [aws_iam_role.ejecucion_backend.arn, aws_iam_role.tarea_backend.arn]
  }
}

resource "aws_iam_role_policy" "eventos" {
  name   = "correr-cuadratura"
  role   = aws_iam_role.eventos.id
  policy = data.aws_iam_policy_document.eventos_ejecuta.json
}

resource "aws_cloudwatch_event_rule" "cuadratura" {
  name                = "${local.prefijo}-cuadratura-diaria"
  description         = "Compara cargos, pagos y aplicaciones (npm run cuadratura)"
  schedule_expression = "cron(30 9 * * ? *)" # 09:30 UTC = 03:30 en la Ciudad de México
}

resource "aws_cloudwatch_event_target" "cuadratura" {
  rule      = aws_cloudwatch_event_rule.cuadratura.name
  target_id = "cuadratura"
  arn       = aws_ecs_cluster.principal.arn
  role_arn  = aws_iam_role.eventos.arn

  ecs_target {
    launch_type         = "FARGATE"
    task_count          = 1
    task_definition_arn = aws_ecs_task_definition.cuadratura.arn

    network_configuration {
      subnets          = aws_subnet.aplicacion[*].id
      security_groups  = [aws_security_group.backend.id]
      assign_public_ip = false
    }
  }
}
