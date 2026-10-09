# Buckets: respaldos lógicos (pg_dump cifrado) y adjuntos de Chatwoot. Privados, cifrados con la llave del proyecto y con versiones.

resource "aws_s3_bucket" "respaldos" {
  bucket        = "${local.prefijo}-respaldos-${data.aws_caller_identity.actual.account_id}"
  force_destroy = false
}

resource "aws_s3_bucket" "adjuntos" {
  bucket        = "${local.prefijo}-adjuntos-${data.aws_caller_identity.actual.account_id}"
  force_destroy = false
}

locals {
  buckets = {
    respaldos = aws_s3_bucket.respaldos.id
    adjuntos  = aws_s3_bucket.adjuntos.id
  }
}

resource "aws_s3_bucket_public_access_block" "todos" {
  for_each                = local.buckets
  bucket                  = each.value
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "todos" {
  for_each = local.buckets
  bucket   = each.value

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_versioning" "todos" {
  for_each = local.buckets
  bucket   = each.value

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "todos" {
  for_each = local.buckets
  bucket   = each.value

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.datos.arn
    }
    bucket_key_enabled = true
  }
}

# Solo TLS.
data "aws_iam_policy_document" "solo_tls" {
  for_each = local.buckets

  statement {
    sid       = "SoloTLS"
    effect    = "Deny"
    actions   = ["s3:*"]
    resources = ["arn:aws:s3:::${each.value}", "arn:aws:s3:::${each.value}/*"]

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_policy" "solo_tls" {
  for_each = local.buckets
  bucket   = each.value
  policy   = data.aws_iam_policy_document.solo_tls[each.key].json

  depends_on = [aws_s3_bucket_public_access_block.todos]
}

# Ciclo de vida de los respaldos: a almacenamiento frío a los 30 días y fuera al año; las versiones viejas a los 90 días.
resource "aws_s3_bucket_lifecycle_configuration" "respaldos" {
  bucket = aws_s3_bucket.respaldos.id

  rule {
    id     = "envejecer-respaldos"
    status = "Enabled"

    filter {}

    transition {
      days          = 30
      storage_class = "STANDARD_IA"
    }

    transition {
      days          = 90
      storage_class = "GLACIER_IR"
    }

    expiration {
      days = var.respaldos_retencion_dias
    }

    noncurrent_version_expiration {
      noncurrent_days = 90
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "adjuntos" {
  bucket = aws_s3_bucket.adjuntos.id

  rule {
    id     = "limpiar-versiones-viejas"
    status = "Enabled"

    filter {}

    noncurrent_version_expiration {
      noncurrent_days = 90
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}
