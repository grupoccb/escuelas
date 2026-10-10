// Guardas de texto sobre infra/*.tf: lo que `terraform validate` no ve y que no se puede aflojar por descuido (cifrado, red privada, secretos, TLS,
// reglas de acceso). Si alguien debilita algo a propósito, este test se lo hace notar y tiene que justificarlo en la revisión.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const DIR = fileURLToPath(new URL("../infra/", import.meta.url));
const archivos = readdirSync(DIR).filter((f) => f.endsWith(".tf"));
const leer = (nombre: string): string => readFileSync(join(DIR, nombre), "utf8");
const todo = archivos.map(leer).join("\n");

test("RDS: cifrada, privada, con respaldos, sin credenciales en claro y con protección contra borrado en producción", () => {
  const bd = leer("base_datos.tf");
  assert.match(bd, /storage_encrypted\s*=\s*true/);
  assert.match(bd, /publicly_accessible\s*=\s*false/);
  assert.match(bd, /backup_retention_period\s*=\s*var\.rds_retencion_respaldos_dias/);
  assert.match(bd, /deletion_protection\s*=\s*local\.es_prod/);
  assert.match(bd, /rds\.force_ssl/);
  assert.match(bd, /password\s*=\s*random_password\.base_maestra\.result/, "la contraseña sale de un generador, no de un literal");
  assert.match(bd, /multi_az\s*=\s*var\.rds_multi_az/);
});

test("ningún secreto literal en el código de infraestructura", () => {
  assert.ok(!/(password|secret|token|clave)\s*=\s*"[^"$][^"]{5,}"/i.test(todo), "una contraseña, secreto o token entre comillas");
  assert.ok(!/AKIA[0-9A-Z]{16}/.test(todo), "una llave de acceso de AWS");
  assert.ok(!/AC[0-9a-f]{32}/.test(todo), "un SID de Twilio");
  assert.ok(!/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(todo), "una llave privada");
  for (const f of archivos) assert.ok(!/\bsecret_string\s*=\s*"[^$]/.test(leer(f)), `${f}: secret_string literal`);
});

test("S3: todo bucket tiene bloqueo de acceso público, cifrado KMS, versiones, solo TLS y ciclo de vida los respaldos", () => {
  const s3 = leer("s3.tf");
  for (const bloque of ["block_public_acls       = true", "block_public_policy     = true", "ignore_public_acls      = true", "restrict_public_buckets = true"]) assert.ok(s3.includes(bloque), bloque);
  assert.match(s3, /sse_algorithm\s*=\s*"aws:kms"/);
  assert.match(s3, /status\s*=\s*"Enabled"/);
  assert.match(s3, /aws:SecureTransport/);
  assert.match(s3, /aws_s3_bucket_lifecycle_configuration"\s+"respaldos"/);
});

test("red: nada de datos ni de aplicación con IP pública; la base solo acepta al backend y a Chatwoot", () => {
  assert.match(leer("red.tf"), /map_public_ip_on_launch\s*=\s*false/);
  const seg = leer("seguridad.tf");
  const reglasDeBase = seg.split("resource ").filter((b) => b.includes("security_group_id            = aws_security_group.base_datos.id") && b.includes("ingress_rule"));
  assert.ok(reglasDeBase.length >= 2);
  for (const r of reglasDeBase) {
    assert.match(r, /referenced_security_group_id/, "la base se abre a un grupo de seguridad, no a una red");
    assert.ok(!r.includes("0.0.0.0/0"));
  }
  assert.ok(!/assign_public_ip\s*=\s*true/.test(leer("ecs.tf")), "ninguna tarea con IP pública");
  assert.match(leer("ecr.tf"), /image_tag_mutability\s*=\s*"IMMUTABLE"/);
});

test("balanceador: HTTPS con TLS 1.2+, HTTP solo redirige, /metricas no se publica y hay reglas por ruta", () => {
  const alb = leer("alb.tf");
  assert.match(alb, /ELBSecurityPolicy-TLS13-1-2/);
  assert.match(alb, /status_code\s*=\s*"HTTP_301"/);
  assert.match(alb, /"\/metricas"/);
  for (const ruta of ["/webhooks/*", "/api/*", "/l/*", "/salud"]) assert.ok(alb.includes(`"${ruta}"`), ruta);
  assert.match(alb, /path\s*=\s*"\/salud\/lista"/, "el balanceador usa la lectura de «listo», no solo la de «vivo»");
  assert.match(alb, /drop_invalid_header_fields\s*=\s*true/);
});

test("secretos: todo valor sensible de las tareas viene de Secrets Manager (secrets/valueFrom), no de environment", () => {
  const ecs = leer("ecs.tf");
  const entorno = ecs.slice(ecs.indexOf("entorno_backend"), ecs.indexOf("secretos_backend"));
  assert.ok(!/(DATABASE_URL|CLAVE_DATOS|TWILIO_AUTH|WEBHOOK_SECRETO|METRICAS_TOKEN|CHATWOOT_ADMIN_TOKEN|CHATWOOT_BOT_TOKEN)/.test(entorno), "un secreto en environment");
  const secretos = ecs.slice(ecs.indexOf("secretos_backend"), ecs.indexOf("entorno_chatwoot"));
  for (const nombre of ["DATABASE_URL", "CLAVE_DATOS_SENSIBLES", "CHATWOOT_WEBHOOK_SECRETO", "TWILIO_AUTH_TOKEN", "METRICAS_TOKEN"]) assert.ok(secretos.includes(`"${nombre}"`), nombre);
  assert.match(ecs, /name = "TRUST_PROXY", value = "1"/);
  assert.match(ecs, /name = "COOKIE_SEGURA", value = "true"/);
});

test("alarmas: barrido atrasado, 5xx, descuadre, errores y tareas sanas", () => {
  const m = leer("monitoreo.tf");
  for (const a of ["barrido_atrasado", "ciclos_con_errores", "descuadre", "cinco_xx", "sin_tareas_sanas", "errores_backend", "rds_espacio"]) assert.ok(m.includes(`"${a}"`), a);
  // V10 / EA-07: la alarma de «el barrido termina con errores varias veces seguidas» lee el evento que escribe `src/ciclo.ts`.
  assert.match(m, /ciclo_con_errores/);
  assert.match(m, /resource "aws_cloudwatch_metric_alarm" "ciclos_con_errores"[\s\S]*?evaluation_periods\s*=\s*3/);
  assert.match(m, /ciclo_completado/);
  assert.match(m, /cuadratura_descuadre/);
  assert.match(m, /treat_missing_data\s*=\s*"breaching"/);
});

test("roles mínimos: el rol de tarea del backend no tiene permisos propios y ningún rol usa Action o Resource «*» abierto", () => {
  const iam = leer("iam.tf");
  assert.ok(!/actions\s*=\s*\["\*"\]/.test(iam));
  assert.ok(!/"Action"\s*:\s*"\*"/.test(iam));
  assert.match(iam, /El programa del backend no llama a ningún servicio de AWS/);
});

test("el estado se guarda cifrado en un backend remoto", () => {
  assert.match(leer("versions.tf"), /backend "s3"/);
});

test("EK-01: las URL de la base hacia RDS cifran con la semántica de libpq (sin ella, `pg` verificaría una CA que Node no conoce y nada conectaría)", () => {
  const urls = leer("secretos.tf").split("\n").filter((l) => /"base-url-(aplicacion|migrador)"/.test(l));
  assert.equal(urls.length, 2);
  for (const l of urls) assert.match(l, /sslmode=require&uselibpqcompat=true/, l.trim());
});

test("V10 / EK-29: la clave que cifra los datos de salud no se puede destruir ni regenerar por descuido (prevent_destroy en el generador y en su copia)", () => {
  const bloque = (recurso: string): string => {
    const i = todo.indexOf(recurso);
    assert.ok(i >= 0, `${recurso} existe`);
    return todo.slice(i, todo.indexOf("\n}\n", i) + 3);
  };
  assert.match(bloque('resource "random_id" "clave_datos_sensibles"'), /prevent_destroy\s*=\s*true/);
  assert.match(bloque('resource "aws_secretsmanager_secret" "clave_datos_protegida"'), /prevent_destroy\s*=\s*true/);
});
