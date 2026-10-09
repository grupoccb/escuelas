# PostgreSQL gestionado (RDS) y Redis (ElastiCache). [SUPUESTO] UNA instancia de RDS con dos bases (la de la aplicación
# y la de Chatwoot, que necesita la extensión pgvector) para bajar el costo; si la escuela crece se separan sin tocar el código.

resource "aws_db_subnet_group" "principal" {
  name       = "${local.prefijo}-datos"
  subnet_ids = aws_subnet.datos[*].id
}

resource "aws_kms_key" "datos" {
  description             = "Cifrado de RDS, S3 y secretos de ${local.prefijo}"
  deletion_window_in_days = 30
  enable_key_rotation     = true
}

resource "aws_kms_alias" "datos" {
  name          = "alias/${local.prefijo}-datos"
  target_key_id = aws_kms_key.datos.key_id
}

resource "aws_db_parameter_group" "principal" {
  name   = "${local.prefijo}-pg16"
  family = "postgres16"

  # Toda conexión cifrada: la aplicación y Chatwoot piden sslmode=require.
  parameter {
    name  = "rds.force_ssl"
    value = "1"
  }

  # Una consulta o transacción colgada no sostiene candados para siempre (los de cupo y dinero son de milisegundos).
  parameter {
    name  = "idle_in_transaction_session_timeout"
    value = "60000"
  }

  parameter {
    name  = "log_min_duration_statement"
    value = "1000"
  }

  # Interbloqueos y esperas largas de candados a los registros.
  parameter {
    name  = "log_lock_waits"
    value = "1"
  }
}

resource "random_password" "base_maestra" {
  length  = 32
  special = false
}

resource "aws_db_instance" "principal" {
  identifier     = "${local.prefijo}-postgres"
  engine         = "postgres"
  engine_version = "16"
  instance_class = var.rds_clase

  allocated_storage     = var.rds_almacenamiento_gb
  max_allocated_storage = var.rds_almacenamiento_max_gb
  storage_type          = "gp3"
  storage_encrypted     = true
  kms_key_id            = aws_kms_key.datos.arn

  # Cuenta maestra = dueña de las tablas, solo para migraciones (EB-08). La de la aplicación se crea aparte con scripts/preparar-roles.ts.
  username = "inscripciones_migrador"
  password = random_password.base_maestra.result
  db_name  = "inscripciones"

  db_subnet_group_name   = aws_db_subnet_group.principal.name
  vpc_security_group_ids = [aws_security_group.base_datos.id]
  publicly_accessible    = false
  multi_az               = var.rds_multi_az
  parameter_group_name   = aws_db_parameter_group.principal.name

  backup_retention_period   = var.rds_retencion_respaldos_dias
  backup_window             = "08:00-09:00" # UTC: de madrugada en México
  maintenance_window        = "sun:09:30-sun:10:30"
  copy_tags_to_snapshot     = true
  delete_automated_backups  = false
  deletion_protection       = local.es_prod
  skip_final_snapshot       = !local.es_prod
  final_snapshot_identifier = local.es_prod ? "${local.prefijo}-final" : null

  auto_minor_version_upgrade          = true
  performance_insights_enabled        = true
  performance_insights_kms_key_id     = aws_kms_key.datos.arn
  enabled_cloudwatch_logs_exports     = ["postgresql", "upgrade"]
  monitoring_interval                 = 60
  monitoring_role_arn                 = aws_iam_role.monitoreo_rds.arn
  iam_database_authentication_enabled = false
  apply_immediately                   = !local.es_prod
}

resource "aws_elasticache_subnet_group" "redis" {
  name       = "${local.prefijo}-redis"
  subnet_ids = aws_subnet.datos[*].id
}

# Cola de trabajos de Chatwoot. Un solo nodo: si cae, Chatwoot reintenta; los mensajes de las familias NO pasan por aquí.
resource "aws_elasticache_replication_group" "redis" {
  replication_group_id       = "${local.prefijo}-redis"
  description                = "Cola de Chatwoot"
  engine                     = "redis"
  engine_version             = "7.1"
  node_type                  = var.redis_clase
  num_cache_clusters         = local.es_prod ? 2 : 1
  automatic_failover_enabled = local.es_prod
  multi_az_enabled           = local.es_prod
  subnet_group_name          = aws_elasticache_subnet_group.redis.name
  security_group_ids         = [aws_security_group.redis.id]
  at_rest_encryption_enabled = true
  transit_encryption_enabled = false # Chatwoot 4.x no sabe hablar TLS con Redis sin configuración extra; la red es privada. [SUPUESTO]
  snapshot_retention_limit   = local.es_prod ? 7 : 0
  apply_immediately          = !local.es_prod
}
