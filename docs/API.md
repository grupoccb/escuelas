# API de la aplicación

Todo vive bajo `/api` (JSON). Los webhooks de Chatwoot y Twilio (`/webhooks/*`) y `/salud` NO son parte
de esta API: tienen su propia autenticación. Código en `src/api/`.

## Convenciones

**Sesión.** Cookie `sesion` (`HttpOnly; SameSite=Lax; Path=/`, y `Secure` con `NODE_ENV=production` o `COOKIE_SEGURA=true`).
Se obtiene con `POST /api/sesion`. Expira a las 12 h absolutas y por inactividad (`SESION_INACTIVIDAD_MIN`, 120 por defecto).
No hay tokens en el cuerpo ni en cabeceras de autorización.

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

## Rutas

| Método y ruta | Permiso | Descripción |
|---|---|---|
| `POST /api/sesion` `{organizacion?, correo, contrasena}` | pública | Inicia sesión (201 + cookie). `organizacion` = slug; se puede omitir si solo hay una |
| `DELETE /api/sesion` | pública | Cierra la sesión (siempre 204) |
| `GET /api/yo` | sesión | Usuario, organización, sucursales y permisos |
| `POST /api/yo/contrasena` `{actual, nueva}` | sesión | Cambia tu contraseña; cierra tus demás sesiones |
| `GET /api/usuarios?rol=&activo=` | `usuarios:administrar` | Lista |
| `POST /api/usuarios` `{correo, nombre, rol, contrasena, sucursales?}` | `usuarios:administrar` | Alta (409 si el correo existe) |
| `PATCH /api/usuarios/:id` `{nombre?, rol?, activo?, contrasena?, sucursales?}` | `usuarios:administrar` | Cambia; cierra sesiones si desactiva, cambia el rol o la contraseña |
| `GET /api/grupos?programa_id=&sucursal_id=` | `grupos:leer` | Grupos con programa y horarios (el maestro, solo los suyos) |
| `GET /api/tareas?estado=&tipo=` | `tareas:leer` | Tareas para el asesor |
| `PATCH /api/tareas/:id` `{estado: hecha\|descartada}` | `tareas:resolver` | Resuelve (409 si ya estaba resuelta) |
| `GET /api/leads?etapa_id=&sucursal_id=&telefono=` | `leads:leer` | Lista (el teléfono se normaliza) |
| `GET /api/leads/:id` | `leads:leer` | Detalle con prospectos |
| `GET /api/registro-cambios?entidad_tipo=&entidad_id=&usuario_id=` | `registro_cambios:leer` | Auditoría |

| `GET /api/salud/:sujeto_tipo/:sujeto_id?motivo=&campos=` | `salud:leer` | Ficha de salud de un menor (`prospecto`; `alumno` llega con F1). `motivo` obligatorio. Se registra el acceso |
| `PUT /api/salud/:sujeto_tipo/:sujeto_id` `{motivo, alergias?, condiciones_medicas?, medicamentos?, contacto_emergencia?, autorizacion_atencion_medica?}` | `salud:escribir` | Guarda (cifrado). `null` borra un campo |

| `POST /api/usuarios/:id/vincular-chatwoot` `{agente_id?}` | `usuarios:administrar` | Enlaza al usuario con su agente de Chatwoot (por correo, o por `agente_id`). 409 si el agente ya es de otro usuario o Chatwoot no responde |
| `GET /api/conversaciones?asignada_a=yo\|nadie\|<usuario>&estado=` | `conversaciones:leer` | Qué asesor tiene cada conversación (alcance por sucursal del lead) |

**Chatwoot ↔ usuarios.** El agente de Chatwoot se enlaza con `usuario.chatwoot_agent_id` (único entre los vivos). Cuando llega el evento de asignación
(`conversation_updated` con `assignee_id`, A3) el backend guarda en la conversación el agente (`asignada_a_agente_chatwoot_id`) y el usuario que le
corresponde (`asignada_a_usuario_id`); si el agente se vincula después, las conversaciones ya asignadas se completan. Quitar al asesor en Chatwoot
borra la asignación (no devuelve el bot). El directorio de agentes (`DirectorioAgentes`) usa `CHATWOOT_ADMIN_TOKEN`; sin él, vincular responde 409.

## Guía para agregar a la API

### Un recurso nuevo

1. Tabla en `prisma/schema.prisma` con las convenciones de siempre (`organizacion_id`, `eliminado_en`, FK compuestas) y su migración.
2. `src/api/rutas/<recurso>.ts` con una función `rutasDe<Recurso>(deps: DepsApi): Router`. Cada ruta:
   `router.get("/x", autenticar(deps), requierePermiso("x:leer"), async (req, res) => { const ctx = contextoDe(res); … })`.
   Usa **`ctx.db`** (ya con el alcance de la organización); nunca abras otro. Las escrituras llevan `express.json({ limit: LIMITE_CUERPO_API })`.
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
