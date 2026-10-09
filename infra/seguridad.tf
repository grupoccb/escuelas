# Grupos de seguridad: cada capa solo habla con la de al lado y por el puerto que necesita.

resource "aws_security_group" "balanceador" {
  name        = "${local.prefijo}-balanceador"
  description = "Entrada publica HTTPS y HTTP (redireccion)"
  vpc_id      = aws_vpc.principal.id

  tags = { Name = "${local.prefijo}-balanceador" }
}

resource "aws_vpc_security_group_ingress_rule" "balanceador_https" {
  security_group_id = aws_security_group.balanceador.id
  cidr_ipv4         = "0.0.0.0/0"
  from_port         = 443
  to_port           = 443
  ip_protocol       = "tcp"
  description       = "HTTPS"
}

resource "aws_vpc_security_group_ingress_rule" "balanceador_http" {
  security_group_id = aws_security_group.balanceador.id
  cidr_ipv4         = "0.0.0.0/0"
  from_port         = 80
  to_port           = 80
  ip_protocol       = "tcp"
  description       = "HTTP solo para redirigir a HTTPS"
}

resource "aws_security_group" "backend" {
  name        = "${local.prefijo}-backend"
  description = "Tareas del backend"
  vpc_id      = aws_vpc.principal.id

  tags = { Name = "${local.prefijo}-backend" }
}

resource "aws_vpc_security_group_ingress_rule" "backend_desde_balanceador" {
  security_group_id            = aws_security_group.backend.id
  referenced_security_group_id = aws_security_group.balanceador.id
  from_port                    = 3000
  to_port                      = 3000
  ip_protocol                  = "tcp"
  description                  = "Solo el balanceador"
}

resource "aws_security_group" "chatwoot" {
  name        = "${local.prefijo}-chatwoot"
  description = "Tareas de Chatwoot"
  vpc_id      = aws_vpc.principal.id

  tags = { Name = "${local.prefijo}-chatwoot" }
}

resource "aws_vpc_security_group_ingress_rule" "chatwoot_desde_balanceador" {
  security_group_id            = aws_security_group.chatwoot.id
  referenced_security_group_id = aws_security_group.balanceador.id
  from_port                    = 3000
  to_port                      = 3000
  ip_protocol                  = "tcp"
  description                  = "Solo el balanceador"
}

# El backend le habla a Chatwoot (enviar mensajes, reenviar lo de Twilio) por la red interna, sin salir a Internet.
resource "aws_vpc_security_group_ingress_rule" "chatwoot_desde_backend" {
  security_group_id            = aws_security_group.chatwoot.id
  referenced_security_group_id = aws_security_group.backend.id
  from_port                    = 3000
  to_port                      = 3000
  ip_protocol                  = "tcp"
  description                  = "Backend a Chatwoot"
}

# Y Chatwoot al backend: el webhook del Agent Bot.
resource "aws_vpc_security_group_ingress_rule" "backend_desde_chatwoot" {
  security_group_id            = aws_security_group.backend.id
  referenced_security_group_id = aws_security_group.chatwoot.id
  from_port                    = 3000
  to_port                      = 3000
  ip_protocol                  = "tcp"
  description                  = "Webhook del Agent Bot"
}

resource "aws_vpc_security_group_egress_rule" "backend_salida" {
  security_group_id = aws_security_group.backend.id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
  description       = "Salida (Twilio, ECR, Secrets Manager por la NAT)"
}

resource "aws_vpc_security_group_egress_rule" "chatwoot_salida" {
  security_group_id = aws_security_group.chatwoot.id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
  description       = "Salida (Twilio, correo, ECR por la NAT)"
}

resource "aws_vpc_security_group_egress_rule" "balanceador_a_tareas" {
  security_group_id = aws_security_group.balanceador.id
  cidr_ipv4         = var.vpc_cidr
  from_port         = 3000
  to_port           = 3000
  ip_protocol       = "tcp"
  description       = "Hacia las tareas"
}

resource "aws_security_group" "base_datos" {
  name        = "${local.prefijo}-base-datos"
  description = "RDS PostgreSQL"
  vpc_id      = aws_vpc.principal.id

  tags = { Name = "${local.prefijo}-base-datos" }
}

resource "aws_vpc_security_group_ingress_rule" "base_desde_backend" {
  security_group_id            = aws_security_group.base_datos.id
  referenced_security_group_id = aws_security_group.backend.id
  from_port                    = 5432
  to_port                      = 5432
  ip_protocol                  = "tcp"
  description                  = "Backend y tarea de migracion"
}

resource "aws_vpc_security_group_ingress_rule" "base_desde_chatwoot" {
  security_group_id            = aws_security_group.base_datos.id
  referenced_security_group_id = aws_security_group.chatwoot.id
  from_port                    = 5432
  to_port                      = 5432
  ip_protocol                  = "tcp"
  description                  = "Chatwoot"
}

resource "aws_security_group" "redis" {
  name        = "${local.prefijo}-redis"
  description = "ElastiCache de Chatwoot"
  vpc_id      = aws_vpc.principal.id

  tags = { Name = "${local.prefijo}-redis" }
}

resource "aws_vpc_security_group_ingress_rule" "redis_desde_chatwoot" {
  security_group_id            = aws_security_group.redis.id
  referenced_security_group_id = aws_security_group.chatwoot.id
  from_port                    = 6379
  to_port                      = 6379
  ip_protocol                  = "tcp"
  description                  = "Chatwoot"
}
