# API de la aplicación

Todo vive bajo `/api` (JSON). Los webhooks de Chatwoot y Twilio (`/webhooks/*`) y `/salud` NO son parte
de esta API: tienen su propia autenticación. Código en `src/api/`.

## Convenciones

**Sesión.** Cookie `sesion` (`HttpOnly; SameSite=Lax; Path=/`, y `Secure` con `NODE_ENV=production` o `COOKIE_SEGURA=true`). Con cookie segura el nombre es
`__Host-sesion`: el navegador exige `Secure`, `Path=/` y sin `Domain`, y no deja que un subdominio hermano ponga otra con ese nombre.
Se obtiene con `POST /api/sesion`. Expira a las 12 h absolutas y por inactividad (`SESION_INACTIVIDAD_MIN`, 120 por defecto). Una sesión también deja de valer si su
organización se da de baja. Las sesiones expiradas o revocadas hace más de 30 días y los intentos de acceso de más de 48 h se marcan `eliminado_en` desde el barrido
(`src/auth/retencion.ts`, a lo más una vez por hora, idempotente); el registro de cambios y el de accesos a salud NO se purgan (solo de anexar; su retención la decide Eduardo).
No hay tokens en el cuerpo ni en cabeceras de autorización.
**Bloqueo de login.** 5 intentos fallidos por (correo, IP) en 15 min; la IP es la dirección IPv4 o el /64 de una IPv6 (una dirección distinta por intento no lo esquiva).

**CSRF.** Todo `POST`/`PUT`/`PATCH`/`DELETE` debe llevar `Content-Type: application/json` o `X-Requested-With: <algo>`. Si trae
`Origin` (o `Referer`) debe ser el de `ORIGEN_PUBLICO` (o, sin configurar, el mismo host). Esta API no concede CORS.

**Errores.** Siempre `{ "error": { "codigo", "mensaje", "detalles"? } }`:

| codigo | HTTP | Cuándo |
|---|---|---|
| `no_autenticado` | 401 | sin sesión, vencida o revocada; también un login fallido |
| `prohibido` | 403 | hay sesión pero el rol no tiene el permiso (o falla CSRF) |
| `no_encontrado` | 404 | no existe, o es de otra organización o fuera de tu alcance (nunca se distingue) |
| `validacion` | 400 | entrada inválida; `detalles: [{ campo, mensaje }]`, todos los errores juntos |
| `conflicto` | 409 | choca con el estado actual (correo repetido, tarea ya resuelta, último administrador…) |
| `limite_excedido` | 429 / 413 | demasiados intentos o peticiones (con `Retry-After`); 413 si el cuerpo es muy grande |
| `interno` | 500 | fallo propio; sin trazas ni textos de la base |

**Validación.** `src/api/validar.ts`: esquemas pequeños y tipados; los campos desconocidos se rechazan; los textos se recortan; en la query
un parámetro repetido es un error.

**Paginación.** `?limite=&pagina=`. `limite` por defecto 25, tope duro 100; `pagina` desde 1. Respuesta:
`{ "datos": [...], "paginacion": { "pagina", "limite", "total" } }`. Orden estable (criterio + `id`).

**Alcance.** Administrador: toda la organización. Asesor y recepción: sus sucursales (`usuario_sucursal`). Maestro: los grupos de su instructor.
Una fila sin sucursal (lead que aún no la elige) solo la ve el administrador.

**Registro de cambios.** Cada escritura deja en `registro_cambio` quién, qué y antes/después (solo campos de la lista blanca; nunca contraseñas ni salud),
en la misma transacción.

**Cabeceras.** En todo el backend: `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`. En `/api`: CSP `default-src 'none'`,
`Cache-Control: no-store`.

## Protección de rutas públicas (límites)

Límite por **IP** y ruta, en memoria (`src/http/limite.ts`: cubeta de fichas, ráfaga = cupo por minuto, con tope de memoria). Al excederlo: **429 con `Retry-After`**
(en `/api`, con la convención de errores y código `limite_excedido`; en los webhooks, sin cuerpo).

| Qué | Variable (por minuto) | Defecto | Detalle |
|---|---|---|---|
| Inicio de sesión | `LIMITE_LOGIN_POR_MINUTO` | 10 | Además del bloqueo por (correo, IP) de B1 |
| Resto de `/api` | `LIMITE_API_POR_MINUTO` | 600 | Antes de revisar la sesión |
| Landing pública (E1) | `LIMITE_LANDING_POR_MINUTO` | 30 | Perfil listo: la landing usará `limitarApiPorIp(limitador, "landing", limites.landing)` y `LIMITE_CUERPO_LANDING` |
| Webhooks: firmas INVÁLIDAS | `LIMITE_WEBHOOK_FALLOS_POR_MINUTO` | 30 | Por IP y por ruta; agotado, la IP recibe 429 antes de que se lea el cuerpo |
| Webhooks: techo | `LIMITE_WEBHOOK_POR_MINUTO` | 6000 | Frena una inundación; no estorba al tráfico normal |
| Tope de memoria | `LIMITE_MAX_CLAVES` | 50000 | Cubetas guardadas |

El tráfico de webhooks **firmado y legítimo** no gasta cupo de fallos: solo cuentan las firmas inválidas. (Una IP que acumula firmas inválidas espera aunque ahora firme bien.)
Tamaño de cuerpo por ruta (`src/api/cuerpos.ts`): login 4 KB, resto de la API 100 KB, Twilio 100 KB, Chatwoot 1 MB, landing 16 KB; al pasarlo, 413.

**IP real detrás de un balanceador:** `TRUST_PROXY` (número de saltos de confianza, p. ej. `1`, o lista de redes). Sin definirlo se usa la IP de la conexión y
`X-Forwarded-For` se ignora, así que no sirve para esquivar el límite. No uses `true`. Las IPv6 se agrupan por /64.

**Lo que NO resuelve:**
- El estado vive en el proceso: con **varias réplicas** cada una cuenta aparte (el límite efectivo se multiplica) y un reinicio lo borra. Con más de una réplica hace falta un almacén compartido (Redis, la base) o un WAF/balanceador que limite antes.
- Una IP compartida (oficina con NAT) comparte cupo; un atacante con muchísimas IPs distintas no se frena por IP (ni puede expulsar cubetas sin límite, pero sí algunas).
- No protege contra denegación de servicio de red (volumétrica): eso es del balanceador/CDN.

## Rutas

| Método y ruta | Permiso | Descripción |
|---|---|---|
| `POST /api/sesion` `{organizacion?, correo, contrasena}` | pública | Inicia sesión (201 + cookie). `organizacion` = slug; se puede omitir si solo hay una |
| `DELETE /api/sesion` | pública | Cierra la sesión (204; borra la cookie). Como toda escritura, exige el encabezado anti-CSRF (`Content-Type: application/json` o `X-Requested-With`): sin él, 403 |
| `GET /api/yo` | sesión | Usuario, organización, sucursales y permisos |
| `POST /api/yo/contrasena` `{actual, nueva}` | sesión | Cambia tu contraseña (exige la actual y pasa por el bloqueo de intentos); cierra tus demás sesiones |
| `GET /api/usuarios?rol=&activo=` | `usuarios:administrar` | Lista |
| `POST /api/usuarios` `{correo, nombre, rol, contrasena, sucursales?}` | `usuarios:administrar` | Alta (409 si el correo existe) |
| `PATCH /api/usuarios/:id` `{nombre?, rol?, activo?, contrasena?, sucursales?}` | `usuarios:administrar` | Cambia; cierra sesiones si desactiva, cambia el rol o la contraseña. `contrasena` solo sirve para restablecer la de OTRA persona (sin la actual); la propia se cambia con `POST /api/yo/contrasena` (400 si se intenta aquí). Desactivar suelta el agente de Chatwoot |
| `GET /api/grupos?programa_id=&sucursal_id=` | `grupos:leer` | Grupos con programa y horarios (el maestro, solo los suyos) |
| `GET /api/tareas?estado=&tipo=` | `tareas:leer` | Tareas para el asesor |
| `PATCH /api/tareas/:id` `{estado: hecha\|descartada}` | `tareas:resolver` | Resuelve (409 si ya estaba resuelta) |
| `GET /api/leads?etapa_id=&sucursal_id=&telefono=` | `leads:leer` | Lista (el teléfono se normaliza) |
| `GET /api/leads/:id` | `leads:leer` | Detalle con prospectos |
| `GET /api/registro-cambios?entidad_tipo=&entidad_id=&usuario_id=` | `registro_cambios:leer` | Auditoría |

| `GET /api/salud/:sujeto_tipo/:sujeto_id?motivo=&campos=` | `salud:leer` | Ficha de salud de un menor (`prospecto`; `alumno` llega con F1). `motivo` obligatorio. Se registra el acceso, y también todo intento denegado (sin permiso, sujeto inexistente o ajeno, maestro fuera de su grupo) |
| `PUT /api/salud/:sujeto_tipo/:sujeto_id` `{motivo, alergias?, condiciones_medicas?, medicamentos?, contacto_emergencia?, autorizacion_atencion_medica?}` | `salud:escribir` | Guarda (cifrado). `null` borra un campo |

| `GET /api/salud-accesos?sujeto_id=&usuario_id=&resultado=` | `registro_cambios:leer` | Quién vio (o intentó ver) la ficha de quién: usuario, sujeto, acción, resultado, causa de la denegación, campos (solo nombres), motivo, ruta. Nunca valores. Más reciente primero |
| `POST /api/usuarios/:id/vincular-chatwoot` `{agente_id?}` | `usuarios:administrar` | Enlaza al usuario con su agente de Chatwoot (por correo, o por `agente_id`). 409 si el agente ya es de otro usuario o Chatwoot no responde |
| `DELETE /api/usuarios/:id/vincular-chatwoot` | `usuarios:administrar` | Desenlaza al usuario de su agente (idempotente; no toca Chatwoot). Las conversaciones dejan de apuntar al usuario pero conservan el agente |
| `GET /api/conversaciones?asignada_a=yo\|nadie\|<usuario>&estado=` | `conversaciones:leer` | Qué asesor tiene cada conversación (alcance por sucursal del lead) |

**Chatwoot ↔ usuarios.** El agente de Chatwoot se enlaza con `usuario.chatwoot_agent_id` (único entre los vivos). Cuando llega el evento de asignación
(`conversation_updated` con `assignee_id`, A3) el backend guarda en la conversación el agente (`asignada_a_agente_chatwoot_id`) y el usuario que le
corresponde (`asignada_a_usuario_id`); si el agente se vincula después, las conversaciones ya asignadas se completan. Quitar al asesor en Chatwoot
borra la asignación (no devuelve el bot). El directorio de agentes (`DirectorioAgentes`) usa `CHATWOOT_ADMIN_TOKEN`; sin él, vincular responde 409.

## Guía para agregar a la API

### Un recurso nuevo

1. Tabla en `prisma/schema.prisma` con las convenciones de siempre (`organizacion_id`, `eliminado_en`, FK compuestas) y su migración.
2. `src/api/rutas/<recurso>.ts` con una función `rutasDe<Recurso>(deps: DepsApi): Router`. Cada ruta:
   `router.get("/x", requierePermiso("x:leer"), async (req, res) => { const ctx = contextoDe(res); … })`.
   **No pongas `autenticar`**: `crearApiRouter` lo monta una sola vez antes de todas las rutas protegidas. **Denegar por omisión**: cada ruta DEBE declarar su acceso con
   `requierePermiso(…)` (o, si vale cualquier persona con sesión, `soloSesion()`); sin la declaración `contextoDe(res)` lanza y la ruta responde 500 sin tocar la base.
   Usa **`ctx.db`** (ya con el alcance de la organización); nunca abras otro. Las escrituras llevan `express.json({ limit: LIMITE_CUERPO_API })`.
   Agrega la ruta a la tabla `LAS_RUTAS` de `src/api/rutas.test.ts` (escrita a mano): el test recorre el router real de Express y falla si hay una ruta que no está ahí o que declara otro permiso.
3. Móntalo en `src/api/index.ts` con `api.use(rutasDe<Recurso>(deps))`, **antes** del 404 final.
4. Entradas con `parsear(esquema, req.body)` / `parsearQuery(esquema, req.query)` / `parsear(objeto({ id: uuid() }), req.params)`.
5. Listas con `esquemaPaginacion` + `leerPaginacion` + `paginar` y un `orderBy` estable.
6. Si hay sucursal: `filtroDeSucursal(await ctx.alcance())`; lo ajeno responde `noEncontrado()`.
7. Un test `*.itest.ts` con `levantarApi` + `sembrarUsuario` (ver `src/api/autorizacion.itest.ts`): por rol, alcance, no-fuga y concurrencia si cambia estado.

### Un permiso nuevo

Una fila en `MATRIZ_DE_PERMISOS` (`src/api/permisos.ts`) y la misma fila en el `ACORDADO` de `permisos.test.ts`
(el test obliga a decidirlo a la vista). Las rutas lo piden con `requierePermiso("recurso:acción")`; el tipo `Permiso` hace que un nombre inexistente no compile.

### Registrar un cambio

Dentro de la transacción de la escritura:

```ts
await ctx.db.$transaction(async (tx) => {
  // …el cambio…
  await registrarCambio(tx, ctx, { entidad: "mi_tabla", entidadId: id, accion: "actualizar", antes: filaAntes, despues: filaDespues });
});
```

La entidad debe estar en `CAMPOS_AUDITABLES` (`src/api/registro.ts`) con SOLO los campos de negocio que se pueden guardar; nunca contraseñas, tokens ni datos de salud
(un test lo verifica). `actualizar` guarda únicamente lo que cambió.

### Datos sensibles (salud de menores)

Alergias, condiciones médicas, medicamentos, contacto de emergencia y autorización de atención médica (decisión 12):

- **Una sola puerta**: `leerSensible()` / `guardarSensible()` de `src/sensibles/`. La tabla `ficha_salud` guarda cada campo CIFRADO (AES-256-GCM, ligado a su fila y campo; clave en `CLAVE_DATOS_SENSIBLES`). `check:capas` prohíbe nombrar la tabla fuera de `src/sensibles/`.
- **Quién**: `salud:leer` y `salud:escribir` son del administrador y del maestro; recepción y asesor no. El maestro, además, solo accede a sujetos de SUS grupos: esa regla (`maestroDelSujeto`) se implementa cuando exista la inscripción (F1/F3); hoy falla cerrado (404).
- **Rastro**: cada lectura y escritura —y cada intento denegado— queda en `acceso_dato_sensible` (quién, a quién, qué campos, motivo, ruta), solo de anexar.
- **Nunca en logs, notas ni mensajes**: `log.*` redacta por clave y por valor `Sensible`; `npm run check:sensibles` falla si un campo de salud aparece en un log, un mensaje, una nota o una tarea; `src/sensibles/fuga.itest.ts` ejecuta los flujos con valores centinela y falla si alguno aparece (en logs, mensajes o cualquier tabla en claro).
- **Para sumar un flujo que toque datos de salud** (D5, F1): úsalo SOLO con `leerSensible`/`guardarSensible`, no pases los valores a logs ni textos, y agrega el flujo a `fuga.itest.ts`.
- **Para agregar un campo sensible**: una entrada en `src/sensibles/campos.ts` (y la columna en `ficha_salud` si va en la ficha).
