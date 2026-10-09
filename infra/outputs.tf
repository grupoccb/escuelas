output "balanceador_dns" {
  description = "Apunta aquí (CNAME o alias) los dos dominios."
  value       = aws_lb.principal.dns_name
}

output "repositorio_ecr" {
  description = "Aquí se publican las dos imágenes: docker build --target produccion -t <repo>:<etiqueta> .  y  docker build --target migrar -t <repo>:<etiqueta>-migrar ."
  value       = aws_ecr_repository.backend.repository_url
}

output "cluster" {
  value = aws_ecs_cluster.principal.name
}

output "tarea_migracion" {
  description = "aws ecs run-task --cluster <cluster> --launch-type FARGATE --task-definition <esta> con las subredes de aplicación y el grupo del backend."
  value       = aws_ecs_task_definition.migracion.family
}

output "subredes_aplicacion" {
  value = aws_subnet.aplicacion[*].id
}

output "grupo_seguridad_backend" {
  value = aws_security_group.backend.id
}

output "bucket_respaldos" {
  value = aws_s3_bucket.respaldos.id
}

output "secretos_a_cargar_a_mano" {
  description = "Estos secretos se crean vacíos: cárgalos antes del primer arranque."
  value       = [for k in local.secretos_externos : "${local.prefijo}/${k}"]
}
