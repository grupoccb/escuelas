# Auditoría adversarial de la etapa B (bloques B1–B6, noche 2)

Auditor: sesión con contexto nuevo, sin haber escrito el código. Fecha: 8 de octubre de 2026.
Objeto: rama `noche-2`, HEAD `8534ccd`, diff `etapa-A..HEAD` sin `docs/` (85 archivos, +7 017 / −40).
Método: copia limpia del commit (`git archive HEAD | tar -x -C <tmp>`), Postgres propio (`docker run --rm --name auditoria-eb-pg … postgres:16-alpine`, puerto 5581), la imagen del backend construida desde esa copia (`auditoria-eb-backend:local`) y corrida sin tocar el proyecto compose `inscripciones`. No se usó la `DATABASE_URL` del `.env` ni la base de la demo. No se editó nada del repositorio salvo este archivo y no hay commits. Nada contra Twilio, Meta ni AWS; el Chatwoot de la demo no se tocó (el directorio de agentes se probó con el adaptador falso y con servidores locales). Los scripts de prueba del auditor viven en el directorio temporal de la sesión y no se agregan al repositorio; cada hallazgo trae el comando o el procedimiento para repetirlo.

## 1. Resumen ejecutivo

- **Lo que se sostiene.**
  - Desde cero todo lo que la bitácora cita se reproduce en el HEAD: `npm ci` + `npm run validar` (257 tests, exit 0), `npm run test:int` (330 tests, exit 0: 1.ª corrida sobre base nueva y 2.ª seguida sobre la misma, en Node 25.6.0, y otra sobre base nueva en Node 22.23.3).
  - Las migraciones aplican sobre base vacía y sobre una base con datos de la etapa A (incluida una organización de la demo, otra de otro cliente y una borrada): las 23 tablas preexistentes quedan con las mismas filas y el mismo hash, solo aparecen las 8 tablas nuevas, el `slug` se rellena bien y `prisma migrate diff` no muestra diferencias.
  - Autorización: construí una matriz de 15 rutas × 4 roles + sin sesión, escrita a partir de `docs/API.md` y no del código: 75 comprobaciones, 0 discrepancias. 57 comprobaciones de IDOR (otra sucursal, otro grupo, otra organización, filtros por query, mass assignment con `organizacion_id`, `contrasena_hash`, `__proto__`…): 0 fallas. No encontré fuga entre organizaciones ni escalada de privilegios.
  - Sesiones: fijación imposible (el servidor nunca acepta un token que él no generó), la baja o el cambio de rol/contraseña mata las sesiones en la siguiente petición, el token solo vive como SHA-256, la enumeración de usuarios por mensaje o por tiempo no es posible (medido: 149.8 ms vs 149.8 ms de mediana en 24 muestras por caso), scrypt `N=2^15, r=8, p=3` es una combinación de la tabla de OWASP, y la CSRF resistió 14 variantes de `Origin`, `Referer`, `Content-Type` y método.
  - Datos de salud: AES-256-GCM con IV aleatorio y datos asociados ligados a organización, sujeto y campo; sin clave en producción el backend no arranca (reproducido con la imagen); un centinela de salud no aparece en logs, respuestas de error, `registro_cambio` ni notas en 11 peticiones hostiles (validación, JSON roto, NUL, demasiado largo, maestro, asesor, otra organización).
  - Ninguna dependencia nueva (`package.json` solo cambia scripts); ningún test preexistente se debilitó; no hay `skip`, `todo`, `only`, `@ts-ignore` ni `eslint-disable` nuevos.
- **Lo que no se sostiene.** No encontré ningún hallazgo ALTA según el criterio del encargo (nada rompe un invariante de forma comprobada, permite acceso no autorizado, escalada o fuga entre organizaciones o de datos sensibles, ni pierde datos). Sí hay 12 hallazgos MEDIA y 14 BAJA. Los que más pesan:
  - El registro de accesos a salud **no registra las denegaciones por permiso ni la escritura denegada del maestro**, aunque `docs/API.md` y el código lo prometen (EB-01).
  - Un administrador puede **restablecer su propia contraseña sin dar la actual** por `PATCH /api/usuarios/:id` (EB-02).
  - Los **valores por defecto de despliegue fallan hacia el lado malo**: sin `TRUST_PROXY` detrás de un balanceador (el despliegue previsto en AWS) cualquiera bloquea el login de otro y deja en 429 a los webhooks legítimos (EB-04, demostrado); HSTS nunca se emite con la configuración real (EB-05); sin `NODE_ENV=production` los datos de menores se cifran con una clave pública (EB-07).
  - Las **garantías están en las convenciones, no en la estructura**: una ruta nueva sin `autenticar` ni permiso pasa tsc, eslint, las tres guardas y las 57 pruebas de autorización (EB-09); `check:sensibles` se esquiva con `.revelar()` (EB-06); las tablas "de solo anexar" se vacían con `TRUNCATE` (EB-08).
  - El commit B1 **no pasa `test:int` sobre una base vacía** y su prueba depende del estado de la base (EB-11).
- **Mutación.** 100 mutaciones sobre los arreglos de seguridad y autorización de la etapa: 82 las atrapan los tests, 18 sobreviven (8 equivalentes o redundantes, 10 huecos reales de prueba). Cuatro de los huecos tienen semántica de seguridad (hash ficticio del login, IP real en el bloqueo, login sin slug con varias organizaciones, redirecciones del directorio con el token de administrador). Sección 5.
- **Invariantes.** 9 cumplen (1 con excepciones documentadas, 2, 6, 7, 8, 9, 10, 11, 12), 3 no los toca la etapa (5, 13, 14), 2 son parciales (3 y 4) y ninguno está roto de forma comprobada. Sección 6.
- **Bitácora.** Todo "HECHO" de B1–B6 se reproduce, con tres matices: B1 no pasa `test:int` sobre base vacía (EB-11); la bitácora de B6 cita una demo con el agente real de Chatwoot que no pude reproducir; y declara "equivalente" una mutación (quitar el `if (esSensible)` de `redactar`) que sí atrapa un test unitario.

## 2. Tabla de hallazgos

Criterio de gravedad: ALTA = rompe un invariante, permite acceso no autorizado o escalada, fuga de datos sensibles o entre organizaciones, o pierde datos. MEDIA = una garantía documentada no se cumple o falla hacia el lado inseguro por defecto, pero no hay explotación directa sin otra condición. BAJA = endurecimiento, deuda o inexactitud.

| ID | Gravedad | Archivo:línea | Resumen |
|---|---|---|---|
| EB-01 | MEDIA | `src/sensibles/ficha.ts:119,154,123,158,160`; `docs/API.md:135` | El registro de accesos a salud no registra las denegaciones por permiso, los sujetos inexistentes ni la escritura denegada del maestro; la documentación dice que sí |
| EB-02 | MEDIA | `src/api/rutas/usuarios.ts:165-170,193` | `PATCH /api/usuarios/:id` con el id propio restablece la contraseña sin pedir la actual ni pasar por el bloqueo |
| EB-03 | MEDIA | `src/auth/acceso.ts:100`, `src/api/rutas/sesion.ts:45`, `src/http/ip.ts:16` | El bloqueo (correo, IP) usa la dirección IPv6 completa: se evade con direcciones del mismo /64; el límite de B6 (/64, 10/min) es la única barrera |
| EB-04 | MEDIA | `src/http/app.ts:58`, `src/server.ts` | Sin `TRUST_PROXY` detrás de un balanceador todos comparten IP: 5 fallos bloquean a la víctima y 31 firmas inválidas dejan en 429 a los webhooks de terceros (demostrado) |
| EB-05 | MEDIA | `src/http/app.ts:69`, `src/server.ts:35` | `Strict-Transport-Security` nunca se emite con la configuración real de producción |
| EB-06 | MEDIA | `scripts/check-sensibles.ts:29-43` | `check:sensibles` se esquiva con `.revelar()` y nombres neutros; el test de fuga solo cubre flujos ya escritos |
| EB-07 | MEDIA | `src/sensibles/cifrado.ts:52-61` | Sin `NODE_ENV=production` y sin clave, los datos de menores se cifran con una clave pública del repositorio; no hay identificador de clave |
| EB-08 | MEDIA | `prisma/migrations/20261010020000_registro_cambio/migration.sql:43`, `…030000_datos_sensibles/migration.sql:75` | Las tablas "de solo anexar" se vacían con `TRUNCATE`; la aplicación conecta como dueña y puede quitar los disparadores |
| EB-09 | MEDIA | `src/api/index.ts:81-88`, `src/api/autorizacion.itest.ts:139,186` | Una ruta nueva sin guarda pasa tsc, eslint, las guardas y todas las pruebas de autorización; el primer test de matriz es tautológico |
| EB-10 | MEDIA | `src/mensajeria/chatwoot/directorio.ts:26`, `src/api/rutas/usuarios.ts:206` | El directorio de agentes llama a la API de Chatwoot con un token de administrador fuera de `MessagingProvider` (invariante 4, lectura literal): decisión de Eduardo |
| EB-11 | MEDIA | `src/api/sesion.itest.ts:76-89`, commit `25c3392` | B1 no pasa `test:int` sobre una base vacía; `sesion.itest.ts` solo depende del número de organizaciones vivas |
| EB-12 | MEDIA | secciones 3 y 5 | 10 mutaciones sobreviven por huecos de prueba; 4 con semántica de seguridad |
| EB-13 | BAJA | `src/auth/sesiones.ts:86-107`, `src/datos/sistema.ts:122` | La sesión sobrevive a la baja lógica de su organización |
| EB-14 | BAJA | `src/auth/acceso.ts:126-137`, `src/api/errores-http.ts:33-38` | NUL en correo/slug/nombre/motivo y `Content-Encoding` raro dan 500 `interno` (en el login, sin sesión) con ruido de `log.error` |
| EB-15 | BAJA | `src/sensibles/cifrado.ts:39-41` | Se acepta una etiqueta GCM truncada (4 bytes); Node ya lo marca como obsoleto (DEP0182) |
| EB-16 | BAJA | `src/auth/acceso.ts:126-133` | El slug de la organización se puede enumerar por tiempo (≈5.5 ms) y por el 429 del bloqueo |
| EB-17 | BAJA | `src/http/limite.ts:76-90` | Una inundación de 50 001 claves distintas devuelve sus fichas a una IP ya limitada; IPv6 lo hace barato |
| EB-18 | BAJA | `src/auth/contrasena.ts`, `src/http/app.ts` | Cada login sin sesión cuesta ≈150 ms de CPU y 32 MiB; techo de webhooks × tope de cuerpo permite ≈100 MB/s por IP; `/salud` sin límite |
| EB-19 | BAJA | tablas `sesion`, `intento_acceso`, `acceso_dato_sensible` | Sin purga ni retención; `intento_acceso` crece con intentos de gente sin sesión |
| EB-20 | BAJA | `prisma/seed/demo.sql:78-90`, `docker-compose.yml` | Los usuarios del seed tienen una contraseña conocida y publicada, el compose publica el puerto 3000 en 0.0.0.0; política de contraseñas sin lista de comunes |
| EB-21 | BAJA | `src/api/rutas/salud.ts:25,46` | `motivo` viaja en la URL (GET) y se guarda en claro; no hay forma de consultar `acceso_dato_sensible` |
| EB-22 | BAJA | `src/api/registro.ts`, `docs/API.md` | "Cada escritura deja registro" está sobrestimado (instructor, asignaciones por webhook, login/logout) |
| EB-23 | BAJA | `src/api/rutas/usuarios.ts:206-250` | No hay forma de desvincular un agente de Chatwoot; un usuario desactivado conserva el vínculo |
| EB-24 | BAJA | `src/api/cookies.ts:9-20` | Cookie sin prefijo `__Host-`; una cookie `sesion` inválida colocada primero anula la válida |
| EB-25 | BAJA | `docs/API.md`, `src/api/rutas/sesion.ts:60` | Inexactitudes de documentación: `DELETE /api/sesion` "siempre 204" pero la CSRF lo puede rechazar con 403 |
| EB-26 | BAJA | `package-lock.json`, `Dockerfile` | `npm audit`: 4 avisos altos en la cadena del CLI de Prisma (no son dependencias nuevas), y la imagen de producción lleva ese CLI |

Conteo: 0 ALTA, 12 MEDIA, 14 BAJA.

## 3. Detalle de los hallazgos MEDIA (y BAJA con evidencia propia)

### EB-01 (MEDIA) El registro de accesos a salud es menos completo de lo que se dice

`docs/API.md:135` ("cada lectura y escritura —y cada intento denegado— queda en `acceso_dato_sensible`") y el encabezado de `ficha.ts:9` ("Los intentos denegados también se registran") no se cumplen:

- `leerSensible` y `guardarSensible` lanzan `sin_permiso` y `sujeto_no_encontrado` antes de registrar nada (`ficha.ts:119,123,154,158`).
- `guardarSensible` lanza `no_es_de_tu_grupo` sin pasar por `denegar` (`ficha.ts:160`): solo la **lectura** denegada del maestro queda registrada.
- La ruta además corta con `requierePermiso("salud:leer")` antes de llegar al servicio, así que un asesor o recepción que prueba ids no deja rastro alguno.

Evidencia (organización de prueba; maestro, asesor y administrador; `probes/authz.ts`):
```
maestro GET  /api/salud/prospecto/<id>?motivo=prueba  -> 404
maestro PUT  /api/salud/prospecto/<id>                -> 404
asesor  GET  /api/salud/prospecto/<id>?motivo=prueba  -> 403
SELECT usuario_id, accion, resultado FROM acceso_dato_sensible …
  maestro | leer     | denegado          (solo la lectura)
  admin   | escribir | permitido
  admin   | leer     | permitido
```
El test `src/sensibles/ficha.itest.ts:104-121` lo fija así: afirma "no queda ni registro de sus intentos por permiso" y espera exactamente dos filas aunque el maestro intentó leer y escribir. La decisión 12 pide un registro de accesos; un registro que omite los intentos de sondeo no sirve para detectar a quien prueba ids.
Corrección sugerida: registrar toda denegación (permiso, sujeto inexistente, maestro ajeno) en una transacción aparte, en lectura y escritura; o, si se decide no hacerlo, corregir `docs/API.md:135` y el comentario. Hoy tampoco hay endpoint para consultar el registro (EB-21).

### EB-02 (MEDIA) El administrador restablece su propia contraseña sin la actual

`POST /api/yo/contrasena` exige la contraseña actual y pasa por el bloqueo de intentos (diseñado para que una sesión robada no sirva para adivinarla), pero `PATCH /api/usuarios/:id` con el id propio acepta `contrasena` sin ninguna de las dos cosas (`usuarios.ts:165-170`, la revocación excluye solo la sesión actual en `:193`).

Evidencia (`probes/sesion.ts`, dos sesiones del mismo administrador):
```
admin PATCH a sí mismo contrasena (sin 'actual')      -> 200
otras sesiones del admin -> 401 ; la propia -> 200
```
Quien tenga una sesión de administrador abierta (equipo compartido, cookie robada, sesión de 12 h olvidada) puede fijar una contraseña que solo él conoce y dejar fuera al dueño. Es la cuenta que ve los datos de salud de los menores.
Corrección sugerida: rechazar `contrasena` en `PATCH` cuando `id === ctx.usuario.id` (que use `/api/yo/contrasena`) y exigir reautenticación (contraseña actual) para crear administradores y cambiar roles.

### EB-03 (MEDIA) El bloqueo por (correo, IP) usa la dirección IPv6 completa

`iniciarSesion` recibe `normalizarIp(req.ip)` (`sesion.ts:45`), que solo quita el prefijo de IPv4 mapeada; la llave del limitador de B6 sí agrupa por /64 (`ip.ts:16`). El bloqueo de B1 no.

Evidencia (`probes/ipv6.ts`, `iniciarSesion` directo, mismo correo, scrypt barato):
```
20 intentos desde 20 direcciones de un mismo /64: verificados=20 bloqueados=0
20 intentos desde la misma IPv4 (correo en MAYÚSCULAS): verificados=5 bloqueados=15
variantes del correo (espacios, ＠ de ancho completo, mayúsculas anchas) tras el bloqueo: verificados=0 bloqueados=4
```
Las variantes del correo sí caen en la misma llave (NFKC + minúsculas + trim): no hay evasión por mayúsculas, espacios ni Unicode. La evasión es por IP. La única barrera efectiva contra un atacante con un /64 es el límite de B6: 10 logins/min por /64 = 14 400 intentos al día contra una cuenta. Con un /48 (65 536 /64) el bloqueo y el límite dejan de existir. La política de 10 caracteres y el costo de scrypt lo hacen poco práctico para contraseñas fuertes, pero no para las débiles que la política permite (EB-20).
Corrección sugerida: usar `llaveDeIp` también en el bloqueo y agregar un tope por cuenta (correo) independiente de la IP, con espera creciente.

### EB-04 (MEDIA) Sin `TRUST_PROXY` detrás de un balanceador, todos los clientes son una sola IP

`docs/API.md` y `.env.example` lo advierten, pero el valor por defecto (ninguna confianza) es el que produce el daño en el despliegue previsto (AWS con ALB), y no hay aviso ni falla al arrancar con `NODE_ENV=production`.

Evidencia (`probes/alb.ts`: la app real con límites y `confiarEnProxy: false`; las "IPs" se distinguen solo por `X-Forwarded-For`, que se ignora):
```
atacante (203.0.113.66), 5 intentos con el correo de la víctima: 401,401,401,401,401
víctima legítima (198.51.100.20) con su contraseña CORRECTA: 429
otro usuario legítimo, otro correo: 201
webhook de un tercero legítimo tras 31 firmas inválidas del atacante: 429
```
Con la imagen en producción (`NODE_ENV=production`), 14 logins con `X-Forwarded-For` distinto desde un mismo cliente dan `401 401 401 401 401 429 …`. Efecto: cinco peticiones bloquean durante 15 min a cualquier usuario cuyo correo se conozca (los correos de los administradores se deducen), y 30 firmas inválidas por minuto dejan en 429 al tráfico de Twilio que llegue por el mismo balanceador (la ruta del borde de Twilio, A7). El caso opuesto (`TRUST_PROXY=1` con el puerto expuesto directamente) permite falsificar la IP; el 3000 está publicado en 0.0.0.0 en el compose.
Corrección sugerida: con `NODE_ENV=production` exigir que `TRUST_PROXY` esté definido de forma explícita (incluido un valor que signifique "ninguno"), o al menos un `log.warn` al arrancar; documentar el valor para el ALB.

### EB-05 (MEDIA) HSTS nunca se emite con la configuración real

`crearApp` calcula el encabezado con `deps.api?.cookieSegura ?? false` (`app.ts:69`), pero `server.ts:35` no pasa `cookieSegura`: la resuelve más adentro `resolverDepsApi` (`index.ts:61`). El test "la cookie lleva Secure…" pasa `cookieSegura: true` a mano y por eso no lo ve.

Evidencia (imagen `auditoria-eb-backend:local`, `NODE_ENV=production`, sobre una base propia):
```
$ curl -s -i localhost:3190/api/yo | grep -i strict-transport
(sin coincidencias)
$ curl -s -i -X POST … localhost:3190/api/sesion      # login correcto
Set-Cookie: sesion=…; Path=/; Expires=…; HttpOnly; Secure; SameSite=Lax
```
La cookie sí sale `Secure`, pero el navegador nunca recibe HSTS. `docs/API.md` y la bitácora (B3) dicen "HSTS con cookie segura".
Corrección sugerida: resolver `cookieSegura` una vez en `server.ts` (o en `crearApp`) y usar el mismo valor para la cookie y para HSTS; test de extremo a extremo con la configuración de `server.ts`.

### EB-06 (MEDIA) `check:sensibles` se esquiva

La guarda compara nombres de campo; no vigila `Sensible.revelar()`. Prueba (archivo de usuario en una copia de trabajo, `src/captacion/ev1.ts`):
```ts
const r = await leerSensible(db, { usuarioId, organizacionId, rol: "administrador" }, { sujetoTipo: "prospecto", sujetoId: id, motivo: "depuración" });
const vals = Object.values(r.campos).map((v) => v?.revelar());
log.info("depuracion", { vals });
log.warn("nota", { nota: `Datos: ${vals.join(", ")}` });
```
```
$ node scripts/check-sensibles.ts   -> ✓ Ningún dato de salud en logs, notas ni mensajes
$ node scripts/check-capas.ts       -> ✓ …        $ npx tsc --noEmit && npx eslint …  -> sin errores
{"nivel":"info","evento":"depuracion","vals":["CENTINELA-ALERGIA-EV1",null,null,null,null]}
{"nivel":"warn","evento":"nota","nota":"Datos: CENTINELA-ALERGIA-EV1, , , , "}
```
Con `revelar()` el valor deja de ser `Sensible`, la redacción por clave no lo ve (la clave se llama `vals`) y ninguna guarda lo detecta; `fuga.itest.ts` solo ejecuta los flujos que ya existen, así que no cubre uno nuevo. La bitácora lo admite ("quien agregue un flujo… debe sumarlo"), pero es una convención.
Corrección sugerida: regla de `check:sensibles` que prohíba `.revelar(` y la importación de `leerSensible` fuera de `src/sensibles/` y `api/rutas/salud.ts`; que `leerSensible` no devuelva valores en claro a quien no lo pide con una opción explícita.

### EB-07 (MEDIA) La clave de cifrado falla abierta fuera de producción

`cifradorDesdeEntorno` usa una clave fija del repositorio cuando falta `CLAVE_DATOS_SENSIBLES` y `NODE_ENV !== "production"` (`cifrado.ts:52-61`), con solo un `log.warn`. `package.json` no fija `NODE_ENV` en `npm start`; cualquier arranque sin la variable (staging, una VM) cifra datos reales de menores con una clave que cualquiera puede leer en el repositorio. `docker-compose.yml` además lleva una clave real de demo (documentada como solo demo). Tampoco hay identificador de clave: el texto cifrado empieza con `v1.` pero no dice con qué clave; un reemplazo accidental de la clave deja filas ilegibles mezcladas con filas nuevas, sin forma de detectarlo.
Reproducido: sin clave y con `NODE_ENV=production` la imagen aborta con `Falta CLAVE_DATOS_SENSIBLES…` (el lado bueno); el lado malo es el primero.
Corrección sugerida: exigir la clave siempre y permitir la de desarrollo solo con una variable explícita (`PERMITIR_CLAVE_DE_DESARROLLO=true`); guardar un identificador de clave en el prefijo (`v1.<kid>…`).

### EB-08 (MEDIA) "Solo de anexar" no cubre `TRUNCATE` ni a quien es dueño

Los disparadores son `BEFORE UPDATE OR DELETE … FOR EACH ROW`. Evidencia (copia de la base de pruebas, rol de la aplicación):
```
update registro_cambio set accion='x'   -> ERROR: registro_cambio es de solo anexar …
delete from acceso_dato_sensible        -> ERROR: acceso_dato_sensible es de solo anexar …
truncate registro_cambio, acceso_dato_sensible -> TRUNCATE TABLE      (count(*) = 0)
```
La aplicación conecta con el mismo rol que ejecuta las migraciones y es dueña de las tablas, así que también puede `ALTER TABLE … DISABLE TRIGGER`. La aplicación no emite estas sentencias (el cliente con alcance prohíbe SQL crudo), así que hoy requiere acceso a la base o una inyección; pero "es realmente de solo anexar" es una garantía de la base, y la base no la sostiene.
Corrección sugerida: `BEFORE TRUNCATE … FOR EACH STATEMENT` en ambas tablas y un rol de aplicación sin `TRUNCATE`, `ALTER` ni `TRIGGER` (el rol de migración, aparte).

### EB-09 (MEDIA) Nada impide una ruta sin guarda; el primer test de matriz es tautológico

`api/index.ts` comenta "a partir de aquí TODO exige sesión", pero la sesión y el permiso se ponen ruta por ruta (`autenticar(deps)`, `requierePermiso(...)`). Enumeré el router (`app.router.stack`): 17 rutas de `/api` (solo `POST` y `DELETE /sesion` públicas), `GET /salud` y 3 webhooks; todas llevan guarda hoy.
Prueba de la debilidad (copia de trabajo): se agregó `api.get("/nueva", (_req, res) => { res.json({ ok: true }); });` en `src/api/index.ts`:
```
$ npx tsc --noEmit && npx eslint src/api/index.ts      -> sin errores
$ node scripts/check-capas.ts && node scripts/check-sensibles.ts   -> ✓ ✓
$ node --test --test-concurrency=1 src/api/autorizacion.itest.ts src/api/sesion.itest.ts src/api/base.itest.ts src/api/permisos.test.ts
ℹ tests 57  ℹ pass 57  ℹ fail 0
```
Sobre el test de matriz: `autorizacion.itest.ts:139` ("cada permiso de la matriz × cada rol") prueba una ruta de sonda `requierePermiso(permiso)` y calcula lo esperado con `tienePermiso`, la misma función que usa el código: es tautológico respecto de la matriz. El test de rutas reales (`autorizacion.itest.ts:186`) sí declara a mano permiso y respuesta, pero solo para 8 rutas; `conversaciones`, `registro-cambios`, `salud` y `vincular-chatwoot` se cubren en otros archivos y nada exige que la lista sea exhaustiva. `permisos.test.ts` sí es una fotografía escrita a mano (bien).
Corrección sugerida: que `crearApiRouter` aplique `autenticar` a todo lo que monta después de las rutas públicas (denegar por omisión) y que un test recorra el router y exija que cada ruta esté en una lista explícita de públicas o declare un permiso.

### EB-10 (MEDIA, decisión) Invariante 4: el directorio de agentes llama a la API de Chatwoot fuera de `MessagingProvider`

`DirectorioAgentesChatwoot.listarAgentes` hace `fetch` a `/api/v1/accounts/:id/agents` con `CHATWOOT_ADMIN_TOKEN` (un administrador de la cuenta). No es un mensaje saliente, pero el invariante 4 dice "Nadie llama al SDK de Twilio ni a la API de Chatwoot fuera de él". `check:capas` lo permite por vivir en `src/mensajeria/`. La bitácora de B5 lo presenta como cumplimiento ("invariante 4") sin anotarlo como excepción, como sí se hizo con el borde de Twilio en la etapa A. El adaptador tiene fake y no sigue redirecciones (`redirect: "manual"`), pero esa última propiedad **no tiene test** (mutación N24, sección 5): con `follow`, una redirección de Chatwoot enviaría el encabezado `api_access_token` al destino.
Decisión para Eduardo (sección 8): ampliar el texto del invariante o mover el directorio detrás de una interfaz de `MessagingProvider`. Por la letra, ALTA; por el espíritu (no es un mensaje), MEDIA; la dejo MEDIA siguiendo el precedente del borde de Twilio.

### EB-11 (MEDIA) B1 no pasa `test:int` sobre base vacía; `sesion.itest.ts` depende del estado

`iniciarSesion` permite omitir el slug cuando existe **exactamente una** organización viva (`unicaOrganizacion`). El test `no se distingue «no existe» de «contraseña mala»` (`sesion.itest.ts:76`) incluye un intento sin organización que espera 401; eso solo es cierto si la base ya tiene dos o más organizaciones.
Evidencia, por commit en copias limpias con una base vacía por bloque (`porcommit.sh`):
```
B1 25c3392  validar exit=0 (201 tests)  test:int exit=1  tests 265 · pass 264 · fail 1
            ✖ no se distingue «no existe» de «contraseña mala» … 201 !== 401  (sesion.itest.ts:89)
B2 48e963e  validar exit=0 (205)        test:int exit=0  tests 287 · pass 287
B3 c0cb71f  validar exit=0 (219)        test:int exit=0  tests 297 · pass 297
B4 e6511d6  validar exit=0 (235)        test:int exit=0  tests 314 · pass 314
B5 08fc9eb  validar exit=0 (240)        test:int exit=0  tests 324 · pass 324
B6 c73d7b9  validar exit=0 (257)        test:int exit=0  tests 330 · pass 330
```
En el HEAD pasa porque `autorizacion.itest.ts` corre antes y deja dos organizaciones; ejecutado solo sobre una base nueva falla la primera vez y pasa la segunda (`node --test src/api/sesion.itest.ts` con `solo_pruebas`: `fail 1`, luego `fail 0`). La bitácora de B1 dice `test:int` "265 pass"; no se reproduce desde cero (sí sobre la base de pruebas ya usada).
Corrección sugerida: el test crea su segunda organización o no depende del número de organizaciones; y `unicaOrganizacion` merece una prueba propia (EB-12, N04).

### EB-12 (MEDIA) Huecos de prueba con semántica de seguridad

Ver sección 5. Resumen: sobreviven M12 (no verificar el hash ficticio cuando el usuario no existe), M70 (la IP real no llega al bloqueo del login por HTTP), N04 (login sin slug con varias organizaciones toma la primera), N24 (el directorio seguiría redirecciones con el token de administrador), además de M02, M23, M56, M64, N03 y N05.

### BAJA con evidencia

**EB-13 Sesión tras la baja lógica de la organización.** `validarSesion` no revisa `organizacion.eliminado_en` y `buscarSesionPorHash` busca sin organización (`sistema.ts:122`). Probe (`probes/sesion.ts`): se marcó `eliminado_en` en una organización con sesión abierta: `/api/yo` → 200 y `/api/usuarios` → 200 (hasta 12 h); un login nuevo → 401. La mutación N05 (el slug resuelve organizaciones borradas) tampoco la ve ningún test. Corrección: exigir organización viva en `validarSesion`.

**EB-14 500 por entradas que el validador debería rechazar.** Un NUL en `correo` o `organizacion` del login (sin sesión), en `nombre` o `motivo`, y un `Content-Encoding: br` o gzip falso dan `500 interno` y un `log.error` (`api_error_interno`, `P2010`/`P2039`/"Decompression failed"). No se filtra texto interno (se comprobó el cuerpo y el log), pero un anónimo puede llenar el log de errores y confundir las alertas. El manejador cubre `encoding.*` pero no `charset.unsupported`/`Decompression failed`. Corrección: `texto()` rechaza `\u0000`; mapear los errores del parser a 400/415.

**EB-15 Etiqueta GCM truncada.** `createDecipheriv("aes-256-gcm", …)` sin `authTagLength` acepta etiquetas de 4, 8 o 12 bytes (`probes/gcm.ts`, Node 22.23.3 y 25.6.0: las cuatro longitudes descifran; Node emite `DEP0182`). Quien escriba en la base falsifica un texto cifrado con probabilidad 2⁻³² por intento (cada intento pasa por la API y deja registro). Corrección: `authTagLength: 16` y comprobar `tag.length === 16`; el test "a prueba de alteraciones" debe probar una etiqueta truncada.

**EB-16 Enumeración del slug.** Organización inexistente: 144.3 ms; existente con usuario inexistente: 149.8 ms (mediana de 24; la diferencia es la transacción del bloqueo). Además, por lectura del código, el 6.º intento sobre una organización existente da 429 y sobre una inexistente sigue 401 (la rama de organización inexistente no cuenta intentos; el patrón 401×5 y luego 429 sí se observó con la existente). Un slug no es un secreto; anotarlo.

**EB-17 Expulsión de cubetas.** `LimitadorDeTasa` (tope 50 000): tras agotar a una IP, `consumir` 50 001 claves nuevas en 10 ms la deja con 10 fichas otra vez (`probes/limites.ts`: "víctima tras la inundación → PERMITIDO"). Solo reinicia el límite de B6 (el bloqueo por correo está en la base). El documento ya admite el límite del enfoque; con IPv6 (cada /64 es una clave) cuesta poco.

**EB-18 Costos sin sesión.** Un login cuesta ≈150 ms de CPU del pool de 4 hilos de libuv y 32 MiB (medido en los 24 intentos de cada caso); unos 26 logins/s (desde varias IPs) saturan el pool, que también sirve DNS para las llamadas a Chatwoot. El techo de webhooks (6 000/min) por el tope de 1 MB de Chatwoot permite en teoría ≈100 MB/s de cuerpos por IP antes de la firma. `/salud` hace `SELECT 1` por petición sin límite.

**EB-19 Retención.** `sesion` (una fila por login, nunca se purga), `intento_acceso` (una por intento fallido, de cualquiera que escriba al login) y `acceso_dato_sensible` no tienen limpieza ni política de retención; las dos primeras tampoco pueden "borrarse" (soft delete) por el flujo normal sin un job.

**EB-20 Contraseñas y seed.** `prisma/seed/demo.sql:78-90` crea administrador, asesor, maestro y recepción con `Demo-local-2026!`; `docker-compose.yml` lo corre en cada `up` y publica 3000 y 5432 en 0.0.0.0. Está declarado "solo demo", pero nada impide correrlo fuera de ahí. La política (10–128 caracteres, ni el correo ni el nombre, ≥3 caracteres distintos) acepta `1234567890`, `passwordpassword`; no hay cambio obligatorio en el primer ingreso. Decisión 11 excluye 2FA.

**EB-21 `motivo` y consulta del registro.** `GET /api/salud/…?motivo=…` pone texto libre en la URL (registros de acceso del balanceador, historial) y se guarda en claro en `acceso_dato_sensible.motivo`; si alguien escribe ahí un dato de salud queda sin cifrar (comprobado en `probes/fuga2.ts`: el centinela puesto en `motivo` aparece en esa tabla y en ningún otro lado). No hay endpoint de lectura de `acceso_dato_sensible`: el registro es de solo escritura para el administrador.

**EB-22 "Cada escritura".** `docs/API.md` y la bitácora dicen que cada escritura deja `registro_cambio`. No lo dejan: la creación del `instructor` al promover a un maestro (`asegurarInstructor`), las asignaciones de conversación por webhook (`guardarAsignacion`, `registrarDesasignacionDeConversacion`), los logins y cierres de sesión (solo `log.*`). El registro exige `usuario_id` (los procesos del sistema quedan fuera).

**EB-23 Vínculo con el agente.** No existe `DELETE` ni cambio a `null`; un usuario desactivado conserva `chatwoot_agent_id`, y el índice único parcial (`WHERE eliminado_en IS NULL`) cuenta a los desactivados (`activo=false` no es `eliminado_en`), así que el agente no se puede reasignar a quien lo reemplace (409 permanente).

**EB-24 Cookie.** Sin `__Host-`, una cookie `sesion` falsa en una posición anterior (cookie tossing desde un subdominio) gana: `Cookie: sesion=<43×a>; sesion=<válida>` → 401 y se borra la cookie; con el orden inverso → 200 (`probes/cookie2.ts`). Solo es denegación de servicio puntual.

**EB-25 Documentación.** `DELETE /api/sesion` "siempre 204": sin `Content-Type: application/json` ni `X-Requested-With` la CSRF lo rechaza con 403 (la interfaz debe mandar el encabezado). La cifra de la bitácora de B6 "check:generico: 204 archivos" sale 203 sobre `git archive` (204 en el árbol de trabajo del autor, que tiene archivos ignorados por git); sin importancia, pero no es idéntica.

**EB-26 Dependencias.** `npm audit`: 4 avisos altos (`deepmerge-ts` y `mysql2` dentro de la cadena `prisma` → `@prisma/config`), ninguno en el camino de ejecución; la solución propuesta (`audit fix --force`) está prohibida por el plan. El `Dockerfile` instala todas las dependencias, incluido el CLI de Prisma, para correr `prisma migrate deploy` en cada arranque. Ninguna dependencia se agregó en B1–B6 (`git diff etapa-A..HEAD -- package.json` solo toca scripts).

## 4. Verificación desde cero

Comandos y resultados (copia limpia del HEAD, Postgres propio):

```
$ npm ci && npm run validar                     -> exit 0 · ℹ tests 257 · pass 257 · fail 0
                                                   check:generico: 203 · check:capas: 79 · check:sensibles: 79
$ npm run test:int      (base nueva, 1.ª corrida; Node 25.6.0) -> exit 0 · ℹ tests 330 · pass 330 · fail 0
$ npm run test:int      (2.ª corrida seguida)     -> exit 0 · ℹ tests 330 · pass 330 · fail 0
$ docker run node:22-alpine … npm run validar    -> exit 0 · # tests 257 ;  test:int -> exit 0 · # tests 330 (Node 22.23.3)
$ DATABASE_URL=…/aud_mig node --test src/api/sesion.itest.ts  -> "Los tests no corren contra la base «aud_mig»…" (la guarda EA-17 funciona)
```
(El host corre Node 25.6.0; la imagen y el contenedor de verificación, 22.23.3.)

**Migraciones con datos de la etapa A.** Base `aud_mig`: migraciones hasta `20261009070000_evento_twilio_durable` (árbol de la etiqueta `etapa-A`), seed de la demo (`demo.sql` + `catalogo.sql` de la etapa A) y datos propios: una segunda organización "Escuela B" (vertical, sucursal, etapa, canal, bandeja, lead, prospecto, conversación, mensaje y tarea), un lead y datos de la demo, dos organizaciones con nombres difíciles (`ESCUELA  DEMO!!`, `日本語`, `Ñandú & Hijos`) y una borrada. Después se aplicaron las cinco migraciones de B (`20261010000000` a `20261010040000`):
```
(hash md5 por tabla sobre las columnas preexistentes, antes y después)
diff pre.txt post.txt  ->  solo aparecen las 8 tablas nuevas, con 0 filas:
  acceso_dato_sensible, ficha_salud, instructor, intento_acceso, registro_cambio, sesion, usuario, usuario_sucursal
organizacion.slug:  Escuela demo -> escuela-demo · Escuela B -> escuela-b · Ñandú & Hijos -> nandu-hijos
                    ESCUELA  DEMO!! -> escuela-demo-00000000 (colisión resuelta con sufijo) · 日本語 -> org-00000000 · la borrada -> NULL
$ npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma   -> No difference detected.
(la misma comprobación sobre la base nueva de test:int: No difference detected.)
```
El seed de B (`demo.sql`, `catalogo.sql`) vuelve a aplicarse dos veces sin error (idempotente). Con la imagen del backend contra esa misma base y el seed: administrador ve 9 grupos, asesor 6, maestro 2, recepción 9; el asesor recibe 403 en `/api/usuarios`; el login sin `organizacion` con varias organizaciones vivas da 401. Esto reproduce lo que la bitácora de B6 cuenta ("el maestro ve 2 grupos de 9").

**Imagen en modo producción.** `docker build` desde la copia limpia: sin `CLAVE_DATOS_SENSIBLES` el proceso aborta (`ErrorCifrado: Falta CLAVE_DATOS_SENSIBLES…`); con ella arranca y escucha; las cabeceras de seguridad y la CSP de `/api` están; un cuerpo de 2 MB al webhook de Chatwoot da 413; la cookie sale `Secure`; no sale HSTS (EB-05).

## 5. Resultados de mutación

Método: copias de trabajo (`w1`–`w4`) del HEAD, una base por copia, cada mutación es un reemplazo exacto de texto (se verificó que el texto aparece una sola vez), y se corre `npm test` + `npm run test:int` completos; las que sobreviven se pasan además por `tsc`, `eslint` y las tres guardas. 100 mutaciones: 72 de la primera pasada (M01–M72) y 28 de la segunda (N01–N28). Dos resultados que parecían sospechosos (M11, M14, atrapadas por un test ajeno mientras corrían cuatro copias en paralelo) se repitieron en solitario y se confirmaron.

Resultado: **82 atrapadas por los tests, 18 sobreviven a los tests** (de esas 18, 7 las detiene luego `tsc`/`eslint`, solo por la forma de la mutación: constante en `if`, variable sin usar).

Atrapadas (resumen por área): expiración absoluta y por inactividad, revocación, usuario inactivo, cookie (HttpOnly, SameSite, Secure), umbral y llave del bloqueo, liberar intentos, cierre de otras sesiones y verificación de la contraseña actual, las tres ramas de CSRF, cierre de sesiones al desactivar, último administrador, sucursales ajenas, permiso por ruta (usuarios, salud) y matriz (tres filas cambiadas), `requierePermiso`, `filtroDeSucursal`, filtros de leads, tareas, conversaciones y grupos (maestro y asesor), registro de acceso de lectura y escritura, maestro ajeno, AAD, IV fijo y clave de desarrollo en producción, redacción de logs (claves, arreglos, `Sensible`, raíz `medicament`), lista blanca del registro, registro de cambios de usuarios, tareas y vínculo, tope de paginación, campos desconocidos, `trust proxy` en `true`, cupo y anotación de firmas inválidas, `Retry-After`, tope de cuerpo del login, mensaje interno al cliente, B5 (guardar usuario, completar conversaciones), política de contraseña, cierre de sesión, tareas atómicas, alcance de organización y de soft delete (N01, N02), IPv4/IPv6 en la llave (N22), tope de memoria del limitador (N19), límite de login y de `/api` (N20, N21), sal fija y NFKC de contraseñas (N26, N27), token de 1 byte de entropía (N28), normalización del teléfono (N07, N08), guardas `check:capas` y `check:sensibles` (N11, N12).

Sobreviven a los tests (18):

| ID | Mutación | Clasificación |
|---|---|---|
| M01 | comparación de la contraseña con `Buffer.equals` en lugar de `timingSafeEqual` | Equivalente funcional (solo `eslint` la ve por la importación sin uso); el tiempo constante no es verificable por un test funcional |
| M17 | `normalizarCorreo` sin minúsculas | Redundante: el validador `correo()` ya pasa a minúsculas |
| M40 | `GET /api/salud` sin `requierePermiso` | Redundante: `leerSensible` repite el permiso (la mutación M41 inversa sí se atrapa) |
| M67 | vincular sin la comprobación previa de "agente de otro usuario" | Equivalente: el índice único responde 409 igual (la bitácora ya lo decía) |
| M72 | quitar la guarda de `delete`/`deleteMany` del alcance | Equivalente: la rama `else` lanza `ErrorAlcance` igual |
| N10 | `check:sensibles` sin vigilar `enviarNotaInterna` | Redundante: la regla 3 prohíbe nombrar el campo en cualquier parte |
| N17 | quitar la verificación al cargar de `CAMPOS_AUDITABLES` | Redundante: el test de lista blanca recorre las mismas listas |
| N23 | no borrar la cookie con un token inválido | Equivalente |
| **M02** | `PARAMETROS_POR_DEFECTO` de scrypt `N=32768,r=8,p=3` → `N=1024,r=8,p=1` | **Hueco**: ningún test fija los parámetros por defecto; un hash débil para altas nuevas pasaría |
| **M12** | no verificar el hash ficticio cuando el usuario no existe | **Hueco con semántica de seguridad**: es la defensa contra la enumeración por tiempo; hoy es correcta (medido) pero no está protegida por una prueba |
| **M23** | permitir que un administrador se desactive a sí mismo | **Hueco**: hoy la regla del último administrador lo oculta; con dos administradores no hay prueba |
| **M56** | `GET /api/usuarios` sin desempate por `id` | **Hueco**: la paginación estable solo se prueba con `registro_cambio` |
| **M64** | registrar el mensaje de los errores de Prisma (que citan valores) | **Hueco**: nada comprueba lo que se escribe en el log ante un error de Prisma |
| **M70** | el bloqueo del login usa una IP fija en lugar de la del cliente | **Hueco con semántica de seguridad**: por HTTP "otra IP no se afecta" solo prueba el límite de B6; el bloqueo por (correo, IP) se prueba llamando a `iniciarSesion`, no a la ruta |
| **N03** | el alcance ignora que la sucursal esté borrada | **Hueco**: un usuario conserva acceso a una sucursal dada de baja |
| **N04** | `unicaOrganizacion` devuelve la primera organización aunque haya varias | **Hueco con semántica de seguridad**: con dos o más organizaciones el login sin slug sería ambiguo y ningún test lo cubre (de ahí también EB-11) |
| **N05** | el slug resuelve organizaciones borradas | **Hueco** (ver EB-13) |
| **N24** | el directorio sigue redirecciones | **Hueco con semántica de seguridad**: `api_access_token` viajaría a un destino ajeno (ver EB-10) |

Sobre la bitácora de B4: afirma que quitar el `if (esSensible)` de `redactar` es equivalente; la mutación M50 muestra que no lo es: la salida pasa de `"[REDACTADO]"` a `{}` y `sensibles.test.ts` ("redactar: …con valores Sensible") falla.

Sobre la eficacia del test de fuga (`fuga.itest.ts`) y la guarda: las mutaciones de la redacción (M48, M49, M50, M51) las atrapan los tests **unitarios** (`sensibles.test.ts`, `check-sensibles.test.ts`), no `fuga.itest.ts`; el test de fuga, como queda dicho en EB-06, protege contra una regresión en flujos existentes, no contra un flujo nuevo.

## 6. Invariantes contra el código nuevo

| # | Estado | Observaciones |
|---|---|---|
| 1 Aislamiento | Cumple, con excepciones documentadas | Todo `src/api`, `src/auth` y `src/sensibles` pasa por `conAlcance`; `check:capas` limpio. Excepciones (`sistema.ts`): `resolverOrganizacionPorSlug`, `unicaOrganizacion` y `buscarSesionPorHash` consultan sin organización; están acotadas y justificadas, pero conviene que Eduardo las ratifique. 57 comprobaciones de IDOR y la no-fuga de las pruebas pasan; `include` anidados (grupos, conversaciones, leads) no se filtran por organización (límite conocido de `alcance.ts`) pero tampoco por `eliminado_en`: una tarea o una conversación de un lead dado de baja sigue visible para el administrador y el asesor de la sucursal |
| 2 Cero términos de vertical | Cumple | `check:generico` 203 archivos, exit 0; el código nuevo solo usa los términos genéricos (organización, sucursal, grupo) |
| 3 Soft delete | Parcial | Ningún `DELETE` físico en código nuevo (búsqueda en `src/`). Pero `registro_cambio` y `acceso_dato_sensible` llevan `eliminado_en` y un disparador impide usarlo (decisión B3, declarada), y `TRUNCATE` los vacía (EB-08); `sesion` e `intento_acceso` crecen sin retención (EB-19) |
| 4 MessagingProvider | Parcial | Ningún mensaje saliente nuevo. El directorio de agentes llama a la API de Chatwoot fuera de él (EB-10) |
| 5 Dos ventanas | No tocado | — |
| 6 `en_atencion_humana` | Cumple | B5 solo anota la asignación; desasignar no devuelve el bot (probado en `chatwoot.itest.ts`) |
| 7 `normalizarTelefono` | Cumple | `GET /api/leads?telefono=` y el contacto de emergencia pasan por ella (mutaciones N07 y N08 atrapadas); no hay otro tratamiento de teléfonos |
| 8 Idempotencia | Cumple | La desasignación y la toma son idempotentes; las altas de la API no lo son (fuera de alcance) |
| 9 Webhooks autenticados | Cumple | B6 limita **antes** de la firma pero no la sustituye: una firma inválida sigue dando 401/403 y no gasta el cupo de los válidos; 200 webhooks firmados seguidos sin un 429. Efecto colateral por IP compartida: EB-04 |
| 10 Determinismo | Cumple | No aplica a B |
| 11 Adaptadores con fakes | Cumple | `DirectorioAgentesFalso` y el cifrador inyectable; fuera de producción y sin variables, el directorio es un falso vacío |
| 12 Local primero | Cumple | La imagen se construye y arranca; no volví a levantar el compose completo con Chatwoot (sección 9) |
| 13 La familia es la entidad central | No tocado | `ficha_salud` se liga por `sujeto_tipo` + `sujeto_id` polimórfico sin llave foránea (decisión de B4); `alumno` aún no existe |
| 14 Horario de envío | No tocado | — |

## 7. Pruebas modificadas, debilitadores y dependencias

- **Tests preexistentes modificados** (`git diff etapa-A..HEAD` sobre los archivos que ya existían): `prueba-de-fuego.itest.ts`, `catalogo.itest.ts` y `configuracion.itest.ts` solo agregan `.replaceAll("escuela-demo", …)` para que el `slug` del seed sea único por corrida; `src/http/app.test.ts`, `webhook.test.ts` y `scripts/check-capas.test.ts` solo agregan pruebas nuevas. Nada se borró ni se relajó.
- **Debilitadores**: búsqueda de `skip`, `todo`, `only`, `xit`, `@ts-ignore`, `@ts-expect-error`, `eslint-disable` en las líneas agregadas: ninguno. El único `process.exit(0)` agregado es de `scripts/crear-usuario.ts` (`--solo-hash`).
- **Dependencias nuevas**: ninguna (`package.json`: dos scripts nuevos, `check:sensibles` y su inclusión en `validar`). El plan permitía solo las imprescindibles; B1 usó `node:crypto` (scrypt) y B3 un validador propio.
- **Cifras de la bitácora** (tests por archivo): `contrasena.test.ts` 7, `sesion.itest.ts` 21, `permisos.test.ts` 4, `autorizacion.itest.ts` 22, `validar.test.ts` 10, `registro.test.ts` 4, `base.itest.ts` 10, `ficha.itest.ts` 15, `fuga.itest.ts` 2, `check-sensibles.test.ts` 8, `chatwoot.itest.ts` 10, `directorio.test.ts` 3, `limite.test.ts` 9, `limites.test.ts` 8, `limites.itest.ts` 6: coinciden con lo que la bitácora declara.

## 8. Decisiones de producto para Eduardo

1. **Invariante 4 y el directorio de agentes (EB-10).** ¿El invariante se refiere solo a mensajes (y se ajusta el texto), o toda llamada a la API de Chatwoot vive detrás de `MessagingProvider` (y el directorio se mueve)? Mientras tanto, anotar la excepción como se hizo con el borde de Twilio.
2. **Valores por defecto seguros en producción (EB-04, EB-05, EB-07).** ¿Se acepta que el backend se niegue a arrancar con `NODE_ENV=production` sin `TRUST_PROXY` explícito y que la clave de desarrollo solo valga con una variable explícita? Cuál es el valor de `TRUST_PROXY` para el ALB previsto.
3. **Quién puede cambiar qué sin volver a identificarse (EB-02).** ¿Pedir la contraseña actual para cambiar la propia, crear administradores y cambiar roles? ¿Se retoma el 2FA que la decisión 11 dejó fuera, al menos para administrador y maestro, que ven la salud de los menores?
4. **Auditoría de solo anexar (EB-08, EB-01, EB-21).** ¿Aceptar que `registro_cambio` y `acceso_dato_sensible` sean la excepción declarada al soft delete (hoy lo son de hecho)? ¿Se separa el rol de base de datos de la aplicación del de migraciones? ¿Quién debe poder consultar quién vio la ficha de un menor y registrar también los intentos denegados?
5. **Qué pasa al dar de baja una organización (EB-13)** y cuánto se conservan sesiones e intentos (EB-19).
6. **Login sin slug (EB-11, N04).** Es cómoda con un cliente. Con el segundo cliente deja de funcionar para todos los que la usen. ¿Se quita ya y se obliga el slug, o se mantiene mientras haya una sola organización?
7. **Alcance real del maestro sobre la salud.** Hoy falla cerrado (404) y por eso esa ruta no puede usarse; hasta F1/F3 solo el administrador lee la ficha. ¿Se acepta para el piloto?
8. **Contraseñas (EB-20).** ¿Lista de contraseñas comunes, cambio obligatorio en el primer ingreso? ¿El seed de demo puede correr alguna vez fuera de la máquina local?
9. **Varias réplicas.** El límite de peticiones vive en memoria (documentado). ¿Se lleva a Redis o a la base, o se delega al balanceador/WAF? El bloqueo del login ya está en la base.
10. **Excepciones al invariante 1** de `sistema.ts` (slug, organización única, sesión por hash): ¿ratificadas?

## 9. Lo que no pude reproducir o no cubrí

- **Demo con Chatwoot real** de la bitácora de B6 (vincular al asesor con su agente real de Chatwoot por correo, agente 2): no la levanté; el proyecto compose `inscripciones` no se tocó y no creé otro con Chatwoot. Lo que sí reproduje con la imagen: migración sobre datos de la etapa A, login, `GET /api/yo`, grupos por rol y 403 del asesor.
- Pruebas de CSRF en un navegador real (Fetch Metadata, comportamiento de `Origin: null` en `iframe sandbox`): solo con peticiones HTTP construidas a mano (14 variantes).
- Rendimiento bajo carga sostenida del limitador y de scrypt: las cifras de EB-17 y EB-18 son por cálculo y por pruebas puntuales, no una prueba de carga.
- No audité `docs/` ni la lógica de captación de la etapa A más allá de lo que B toca.

---

Estado al 9 de octubre: ver docs/HALLAZGOS-ABIERTOS-V1.md
