# Infraestructura de AWS (bloque K6). Escrita y VALIDADA, nunca desplegada desde este repositorio:
# `terraform fmt -check` y `terraform validate` (sin credenciales); no hay `plan` ni `apply` contra AWS real.
# Ver docs/INFRA-AWS.md: arquitectura, costos aproximados, supuestos y el orden de un despliegue real.

terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.60"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  # El estado guarda secretos generados (claves, contraseñas): SIEMPRE en un bucket cifrado, con bloqueo.
  # Se configura con `terraform init -backend-config=backend.hcl` (ver backend.hcl.example). Para validar basta
  # `terraform init -backend=false`.
  backend "s3" {}
}

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Proyecto = var.proyecto
      Ambiente = var.ambiente
      Gestion  = "terraform"
    }
  }
}
