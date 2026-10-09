# Balanceador con HTTPS. Reglas por ruta hacia el backend (webhooks, API, landing, salud y la interfaz web) y por nombre hacia Chatwoot.
# /metricas NO se publica nunca: lo lee solo quien esté dentro de la VPC (con su token).

resource "aws_lb" "principal" {
  name                       = local.prefijo
  load_balancer_type         = "application"
  internal                   = false
  security_groups            = [aws_security_group.balanceador.id]
  subnets                    = aws_subnet.publica[*].id
  drop_invalid_header_fields = true
  idle_timeout               = 60
  enable_deletion_protection = local.es_prod
}

resource "aws_lb_target_group" "backend" {
  name                 = "${local.prefijo}-backend"
  port                 = 3000
  protocol             = "HTTP"
  target_type          = "ip"
  vpc_id               = aws_vpc.principal.id
  deregistration_delay = 30

  health_check {
    # Readiness: la base responde, las migraciones están al día y el barrido corre. Una tarea que no está lista no recibe tráfico.
    path                = "/salud/lista"
    matcher             = "200"
    interval            = 15
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }
}

resource "aws_lb_target_group" "chatwoot" {
  name                 = "${local.prefijo}-chatwoot"
  port                 = 3000
  protocol             = "HTTP"
  target_type          = "ip"
  vpc_id               = aws_vpc.principal.id
  deregistration_delay = 30

  health_check {
    path                = "/api"
    matcher             = "200"
    interval            = 30
    timeout             = 10
    healthy_threshold   = 2
    unhealthy_threshold = 5
  }
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.principal.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = "redirect"

    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}

resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.principal.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = var.certificado_arn

  # La interfaz web la sirve el backend: lo que ninguna regla reconoce va a él.
  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.backend.arn
  }
}

# /metricas no sale a Internet.
resource "aws_lb_listener_rule" "metricas_cerradas" {
  listener_arn = aws_lb_listener.https.arn
  priority     = 5

  action {
    type = "fixed-response"

    fixed_response {
      content_type = "text/plain"
      status_code  = "404"
      message_body = "No encontrado"
    }
  }

  condition {
    path_pattern {
      values = ["/metricas", "/metricas/*"]
    }
  }
}

# Bandeja de los asesores: por nombre. Con `cidrs_administracion` solo esas redes la abren.
resource "aws_lb_listener_rule" "chatwoot" {
  listener_arn = aws_lb_listener.https.arn
  priority     = 10

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.chatwoot.arn
  }

  condition {
    host_header {
      values = [var.dominio_chatwoot]
    }
  }

  dynamic "condition" {
    for_each = length(var.cidrs_administracion) > 0 ? [1] : []

    content {
      source_ip {
        values = var.cidrs_administracion
      }
    }
  }
}

resource "aws_lb_listener_rule" "chatwoot_cerrada" {
  count        = length(var.cidrs_administracion) > 0 ? 1 : 0
  listener_arn = aws_lb_listener.https.arn
  priority     = 11

  action {
    type = "fixed-response"

    fixed_response {
      content_type = "text/plain"
      status_code  = "403"
      message_body = "Acceso restringido"
    }
  }

  condition {
    host_header {
      values = [var.dominio_chatwoot]
    }
  }
}

# Webhooks de Twilio y de Chatwoot: públicos (el proveedor no tiene IP fija), autenticados por firma en el backend.
resource "aws_lb_listener_rule" "webhooks" {
  listener_arn = aws_lb_listener.https.arn
  priority     = 20

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.backend.arn
  }

  condition {
    path_pattern {
      values = ["/webhooks/*"]
    }
  }
}

resource "aws_lb_listener_rule" "api" {
  listener_arn = aws_lb_listener.https.arn
  priority     = 30

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.backend.arn
  }

  condition {
    path_pattern {
      values = ["/api/*"]
    }
  }
}

resource "aws_lb_listener_rule" "landing" {
  listener_arn = aws_lb_listener.https.arn
  priority     = 40

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.backend.arn
  }

  condition {
    path_pattern {
      values = ["/l/*"]
    }
  }
}

resource "aws_lb_listener_rule" "salud" {
  listener_arn = aws_lb_listener.https.arn
  priority     = 50

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.backend.arn
  }

  condition {
    path_pattern {
      values = ["/salud", "/salud/lista"]
    }
  }
}

# ── WAF delante del balanceador (EB-18): lo que el backend no alcanza a frenar (inundación de login anónimo, cuerpos grandes) ─────────

resource "aws_wafv2_web_acl" "principal" {
  count = var.waf_activo ? 1 : 0
  name  = local.prefijo
  scope = "REGIONAL"

  default_action {
    allow {}
  }

  # Reputación de IP (listas de Amazon).
  rule {
    name     = "reputacion-ip"
    priority = 1

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesAmazonIpReputationList"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "reputacion-ip"
      sampled_requests_enabled   = true
    }
  }

  # Tasa por IP, SIN contar los webhooks: Twilio manda desde pocas IPs y en una campaña puede ser mucho tráfico legítimo.
  rule {
    name     = "tasa-por-ip"
    priority = 2

    action {
      block {}
    }

    statement {
      rate_based_statement {
        limit              = var.waf_limite_5min
        aggregate_key_type = "IP"

        scope_down_statement {
          not_statement {
            statement {
              byte_match_statement {
                search_string         = "/webhooks/"
                positional_constraint = "STARTS_WITH"

                field_to_match {
                  uri_path {}
                }

                text_transformation {
                  priority = 0
                  type     = "NONE"
                }
              }
            }
          }
        }
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "tasa-por-ip"
      sampled_requests_enabled   = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = local.prefijo
    sampled_requests_enabled   = true
  }
}

resource "aws_wafv2_web_acl_association" "principal" {
  count        = var.waf_activo ? 1 : 0
  resource_arn = aws_lb.principal.arn
  web_acl_arn  = aws_wafv2_web_acl.principal[0].arn
}
