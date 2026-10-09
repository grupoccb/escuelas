# Secretos en Secrets Manager. Nada en claro en el código, en las definiciones de tarea ni en variables de entorno de texto:
# las tareas los reciben por `secrets` (se resuelven al arrancar) y solo su rol de ejecución puede leerlos.
#
# Los valores generados aquí (contraseñas, claves) quedan también en el ESTADO de Terraform: por eso el estado vive en un bucket
# cifrado (versions.tf). Los de terceros (Twilio, tokens de Chatwoot) se cargan a mano con `aws secretsmanager put-secret-value`.

resource "random_password" "base_aplicacion" {
  length  = 32
  special = false
}

resource "random_password" "base_chatwoot" {
  length  = 32
  special = false
}

resource "random_id" "clave_datos_sensibles" {
  byte_length = 32
}

resource "random_id" "secreto_webhook_chatwoot" {
  byte_length = 32
}

resource "random_id" "chatwoot_secret_key_base" {
  byte_length = 64
}

resource "random_id" "token_metricas" {
  byte_length = 32
}

locals {
  secretos_generados = {
    "base-url-aplicacion"      = "postgresql://inscripciones_app:${random_password.base_aplicacion.result}@${aws_db_instance.principal.address}:5432/inscripciones?sslmode=require"
    "base-url-migrador"        = "postgresql://inscripciones_migrador:${random_password.base_maestra.result}@${aws_db_instance.principal.address}:5432/inscripciones?sslmode=require"
    "base-clave-aplicacion"    = random_password.base_aplicacion.result
    "base-clave-chatwoot"      = random_password.base_chatwoot.result
    "clave-datos-sensibles"    = random_id.clave_datos_sensibles.b64_std
    "secreto-webhook-chatwoot" = random_id.secreto_webhook_chatwoot.hex
    "chatwoot-secret-key-base" = random_id.chatwoot_secret_key_base.hex
    "token-metricas"           = random_id.token_metricas.hex
  }

  # Los que se cargan a mano: el secreto se crea vacío con un marcador y se llena una sola vez, fuera de Terraform.
  secretos_externos = ["twilio-auth-token", "chatwoot-admin-token", "chatwoot-bot-token"]
}

resource "aws_secretsmanager_secret" "generado" {
  for_each    = local.secretos_generados
  name        = "${local.prefijo}/${each.key}"
  kms_key_id  = aws_kms_key.datos.arn
  description = "Generado por Terraform"

  recovery_window_in_days = local.es_prod ? 30 : 0
}

resource "aws_secretsmanager_secret_version" "generado" {
  for_each      = local.secretos_generados
  secret_id     = aws_secretsmanager_secret.generado[each.key].id
  secret_string = each.value
}

resource "aws_secretsmanager_secret" "externo" {
  for_each    = toset(local.secretos_externos)
  name        = "${local.prefijo}/${each.key}"
  kms_key_id  = aws_kms_key.datos.arn
  description = "Se carga a mano: aws secretsmanager put-secret-value --secret-id ${local.prefijo}/${each.key} --secret-string '...'"

  recovery_window_in_days = local.es_prod ? 30 : 0
}

# La clave de cifrado de los datos de salud se respalda APARTE de la base (docs/RESPALDO.md): sin ella los respaldos de la base no sirven para
# leer salud. Un `terraform destroy` o un cambio que la reemplace perdería esos datos para siempre, así que Terraform se niega a destruirla.
resource "aws_secretsmanager_secret" "clave_datos_protegida" {
  name        = "${local.prefijo}/clave-datos-sensibles-copia"
  kms_key_id  = aws_kms_key.datos.arn
  description = "Copia de la clave de cifrado de datos de salud. Protegida contra destruccion."

  recovery_window_in_days = 30

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_secretsmanager_secret_version" "clave_datos_protegida" {
  secret_id     = aws_secretsmanager_secret.clave_datos_protegida.id
  secret_string = random_id.clave_datos_sensibles.b64_std
}

data "aws_caller_identity" "actual" {}
