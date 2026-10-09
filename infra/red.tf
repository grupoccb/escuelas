# VPC con tres capas: pública (balanceador y NAT), privada de aplicación (Fargate) y privada de datos (RDS, Redis).
# Nada de datos ni de aplicación tiene IP pública.

locals {
  prefijo = "${var.proyecto}-${var.ambiente}"
  es_prod = var.ambiente == "produccion"
}

resource "aws_vpc" "principal" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = { Name = "${local.prefijo}-vpc" }
}

resource "aws_internet_gateway" "principal" {
  vpc_id = aws_vpc.principal.id
  tags   = { Name = "${local.prefijo}-igw" }
}

resource "aws_subnet" "publica" {
  count                   = 2
  vpc_id                  = aws_vpc.principal.id
  availability_zone       = var.zonas[count.index]
  cidr_block              = cidrsubnet(var.vpc_cidr, 8, count.index)
  map_public_ip_on_launch = false

  tags = { Name = "${local.prefijo}-publica-${count.index}" }
}

resource "aws_subnet" "aplicacion" {
  count             = 2
  vpc_id            = aws_vpc.principal.id
  availability_zone = var.zonas[count.index]
  cidr_block        = cidrsubnet(var.vpc_cidr, 8, 10 + count.index)

  tags = { Name = "${local.prefijo}-aplicacion-${count.index}" }
}

resource "aws_subnet" "datos" {
  count             = 2
  vpc_id            = aws_vpc.principal.id
  availability_zone = var.zonas[count.index]
  cidr_block        = cidrsubnet(var.vpc_cidr, 8, 20 + count.index)

  tags = { Name = "${local.prefijo}-datos-${count.index}" }
}

resource "aws_eip" "nat" {
  count  = var.nat_por_zona ? 2 : 1
  domain = "vpc"
  tags   = { Name = "${local.prefijo}-nat-${count.index}" }
}

resource "aws_nat_gateway" "principal" {
  count         = var.nat_por_zona ? 2 : 1
  allocation_id = aws_eip.nat[count.index].id
  subnet_id     = aws_subnet.publica[count.index].id
  tags          = { Name = "${local.prefijo}-nat-${count.index}" }

  depends_on = [aws_internet_gateway.principal]
}

resource "aws_route_table" "publica" {
  vpc_id = aws_vpc.principal.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.principal.id
  }

  tags = { Name = "${local.prefijo}-publica" }
}

resource "aws_route_table_association" "publica" {
  count          = 2
  subnet_id      = aws_subnet.publica[count.index].id
  route_table_id = aws_route_table.publica.id
}

resource "aws_route_table" "aplicacion" {
  count  = 2
  vpc_id = aws_vpc.principal.id

  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.principal[var.nat_por_zona ? count.index : 0].id
  }

  tags = { Name = "${local.prefijo}-aplicacion-${count.index}" }
}

resource "aws_route_table_association" "aplicacion" {
  count          = 2
  subnet_id      = aws_subnet.aplicacion[count.index].id
  route_table_id = aws_route_table.aplicacion[count.index].id
}

# La capa de datos no tiene salida a Internet.
resource "aws_route_table" "datos" {
  vpc_id = aws_vpc.principal.id
  tags   = { Name = "${local.prefijo}-datos" }
}

resource "aws_route_table_association" "datos" {
  count          = 2
  subnet_id      = aws_subnet.datos[count.index].id
  route_table_id = aws_route_table.datos.id
}

# S3 por la red interna de AWS (respaldos y adjuntos): no pasa por la NAT, que cobra por GB.
resource "aws_vpc_endpoint" "s3" {
  vpc_id            = aws_vpc.principal.id
  service_name      = "com.amazonaws.${var.region}.s3"
  vpc_endpoint_type = "Gateway"
  route_table_ids   = concat(aws_route_table.aplicacion[*].id, [aws_route_table.datos.id])

  tags = { Name = "${local.prefijo}-s3" }
}

# Registros de flujo de la VPC: lo rechazado queda a la vista para una investigación.
resource "aws_flow_log" "vpc" {
  vpc_id               = aws_vpc.principal.id
  traffic_type         = "REJECT"
  log_destination_type = "cloud-watch-logs"
  log_destination      = aws_cloudwatch_log_group.flujos.arn
  iam_role_arn         = aws_iam_role.flujos.arn
}
