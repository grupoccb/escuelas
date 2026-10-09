# Observabilidad (bloque K4)

## Logs

Una línea JSON por evento en la salida estándar (`src/lib/log.ts`): `{"t":"…","nivel":"info|warn|error","evento":"nombre_en_minusculas", …campos}`. En AWS los recoge CloudWatch Logs (`infra/monitoreo.tf`) y los filtros de métricas leen el campo `evento`.

Qué NUNCA sale en un log (cada punto tiene su prueba):

- **Teléfonos completos.** Quien loguea usa `enmascararTelefono()` (`+52******5678`); además `log.ts` enmascara por su cuenta cualquier número de 10 a 15 dígitos dentro de cualquier texto (también en mensajes de error, con o sin `+` o `whatsapp:`). `src/observabilidad/observabilidad.itest.ts` recorre el bot, la landing, los webhooks de Chatwoot y Twilio, la API y varias fallas, y exige que ningún teléfono completo aparezca.
- **Datos de salud de menores** (`src/sensibles/fuga.itest.ts`, `npm run check:sensibles`).
- **Secretos**: contraseñas, token de sesión, firmas y cuerpos de webhook (`src/seguridad/revision.itest.ts`).

Eventos que importan para operar: `ciclo_completado` (cada minuto), `ciclo_con_errores`, `evento_inesperado`, `entorno_inseguro`, `entorno_demo`, `trust_proxy_no_definido`, `cuadratura_descuadre`, `webhook_*_rechazado`, `metricas_rechazado`.

## Salud

| Ruta | Pregunta | Responde |
|---|---|---|
| `GET /salud` | ¿El proceso está vivo? | Siempre `200 {"ok":true}`. No toca la base: una caída de la base no debe reiniciar las tareas en bucle. Lo usa el healthcheck del contenedor. |
| `GET /salud/lista` | ¿Puede atender tráfico? | `200` o `503` con `{"listo":bool,"degradado":bool,"comprobaciones":{"base","migraciones","barrido","chatwoot"}}`, cada una `ok`, `falla` o `no_aplica`. Lo usa el balanceador. |

`/salud/lista` comprueba:

- **base**: responde en 3 segundos.
- **migraciones**: todas las del código (`prisma/migrations`, que va en la imagen) están terminadas en `_prisma_migrations` y ninguna quedó a medias. Una versión nueva del código sobre una base sin migrar NO recibe tráfico.
- **barrido**: terminó un ciclo en los últimos 5 minutos (o el proceso arrancó hace menos). Un proceso con el barrido muerto deja de recibir tráfico y ECS lo reemplaza.
- **chatwoot**: alcanzable si hay `CHATWOOT_URL`. Si falla, el servicio queda `degradado: true` pero SIGUE listo: una caída de Chatwoot no debe sacar al backend del balanceador (sigue recibiendo webhooks y atendiendo la interfaz).

Ninguna de las dos devuelve versiones, nombres de base, URLs ni mensajes de error.

## Métricas (`GET /metricas`, formato Prometheus)

Protegida con `Authorization: Bearer <METRICAS_TOKEN>`. **Sin `METRICAS_TOKEN` la ruta no existe (404)**; el balanceador responde 404 a `/metricas` (`infra/alb.tf`), así que solo se lee desde dentro de la VPC (otro servicio, un Prometheus). Demo local: `curl -H "Authorization: Bearer demo-local-metricas-token-0001-solo-demo" http://localhost:3000/metricas`.

Las etiquetas son de conjuntos cerrados (estatus, motivos, tipos, orígenes): nunca un teléfono, un nombre ni un identificador.

| Métrica | Tipo | Qué es |
|---|---|---|
| `inscripciones_webhooks_total{origen,resultado}` | contador | Webhooks de `chatwoot`, `twilio_entrante`, `twilio_estado` por `aceptado`, `rechazado` (firma inválida), `inesperado` (dato raro: constancia y tarea), `reintentar` (503/502, el proveedor repite) y `limitado` (429). |
| `inscripciones_http_respuestas_total{grupo,clase}` | contador | Respuestas por `api`, `webhooks`, `landing`, `salud`, `metricas`, `web` y clase `2xx`…`5xx`. |
| `inscripciones_ciclos_total{resultado}`, `inscripciones_ciclo_errores_total` | contador | Ciclos del barrido `completo`, `con_errores`, `fallido`. |
| `inscripciones_barrido_edad_segundos` | medidor | Segundos desde el último ciclo (o desde el arranque). Alarma si pasa de 600. |
| `inscripciones_mensajes{direccion,estatus}` | medidor | Mensajes entrantes y salientes por estado (`recibido`, `pendiente`, `enviando`, `enviado`, `entregado`, `leido`, `bloqueado`, `fallido`). |
| `inscripciones_mensajes_bloqueados{motivo}` | medidor | Bloqueados por `MessagingProvider`: `fuera_de_ventana`, `opt_out`, `atencion_humana`, `tope_frecuencia`, `fuera_de_horario`… |
| `inscripciones_entregas_fallidas` | medidor | Mensajes salientes cuya entrega falló. |
| `inscripciones_ejecuciones_automatizacion{estatus}`, `inscripciones_ejecuciones_omitidas{motivo}` | medidor | Ejecuciones del motor por estatus (incluye `descartado`) y las omitidas por motivo. |
| `inscripciones_tareas_pendientes{tipo}` | medidor | Tareas del asesor sin resolver por tipo (ver `docs/OPERACION.md`). |
| `inscripciones_cargos_vencidos` | medidor | Cargos con estatus vencido. |
| `inscripciones_eventos_inesperados{origen}` | medidor | Constancias de eventos inesperados. |
| `inscripciones_organizaciones`, `inscripciones_proceso_inicio_timestamp_seconds`, `inscripciones_ultimo_ciclo_timestamp_seconds` | medidor | Contexto. |

Los contadores son del proceso (se reinician con él; con varias tareas, suma con `sum()`); los medidores salen de la base y valen igual con una o con diez tareas (caché de 15 s para no recorrer las tablas en cada lectura). El conteo suma todas las organizaciones.

Alarmas en CloudWatch (`infra/monitoreo.tf`): barrido atrasado, ciclos con errores, descuadre, errores del backend, eventos inesperados, 5xx, sin tareas sanas y RDS. Los números para decidir qué vigilar a diario: `inscripciones_tareas_pendientes` (la bandeja de trabajo humano), `inscripciones_mensajes_bloqueados` (qué se está frenando y por qué), `inscripciones_entregas_fallidas`, `inscripciones_cargos_vencidos`.
