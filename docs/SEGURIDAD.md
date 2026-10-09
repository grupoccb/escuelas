# Revisión de seguridad (bloque K3)

Qué se revisó, qué se encontró, qué se corrigió y qué queda. Cada punto con prueba: lo que se puede volver a correr está en `src/seguridad/`, `src/seguridad/roles.itest.ts` y `scripts/check-secretos.*`.

## Resultado en una tabla

| Área | Estado | Prueba |
|---|---|---|
| Sesiones: token de 256 bits, solo su SHA-256 en la base, cookie `HttpOnly` + `SameSite=Lax` + `Secure` + `__Host-`, expira (12 h absolutas, inactividad), se revoca al cerrar/cambiar rol/contraseña/desactivar, fijación imposible | Correcto (etapa B) + reforzado | `src/api/sesion.itest.ts`, `src/seguridad/revision.itest.ts` (token, fijación, cierre) |
| Roles y alcance: matriz permiso × rol, alcance por sucursal y por grupo del maestro, no-fuga entre organizaciones | Correcto (etapa B) | `src/api/autorizacion.itest.ts`, `rutas.test.ts` |
| Inyección SQL | Todo pasa por Prisma (parametrizado); el único SQL crudo está en `src/datos/` con valores enlazados. 4 conjuntos de parámetros hostiles (SQL, NUL, CRLF, Unicode, números enormes, fechas imposibles) contra TODAS las rutas GET: ningún 5xx y las tablas intactas | `revision.itest.ts` («inyección») |
| Inyección de cabeceras | `Content-Disposition` solo con `[A-Za-z0-9._-]`; sin saltos de línea; Express rechaza CR/LF en cabeceras | `revision.itest.ts` (exportaciones), `src/exportacion/` |
| Inyección CSV | Fórmulas neutralizadas (`=`, `+`, `-`, `@`, tab, CR), escape RFC 4180 | `src/exportacion/` (I5) |
| Inyección HTML / XSS | La landing escapa todo lo que refleja y lleva CSP con nonce; la interfaz es React (sin `dangerouslySetInnerHTML`); la CSP de la interfaz no permite scripts en línea ni dominios externos | `src/http/landing.itest.ts`, `src/http/web.test.ts`, `web/e2e` |
| Contaminación de prototipo, asignación masiva | Cuerpos con `__proto__`/`constructor` no dan 5xx ni contaminan; los campos desconocidos son 400 (validador estricto) | `revision.itest.ts` |
| CORS | La API nunca concede acceso a otro origen (ni preflight ni credenciales); defensa CSRF por `Origin` + JSON/`X-Requested-With` + `SameSite` | `revision.itest.ts`, `sesion.itest.ts` |
| Cabeceras | `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer` en TODA respuesta; CSP `default-src 'none'` y `no-store` en `/api`; CSP propia en la interfaz; HSTS cuando la cookie es segura u `ORIGEN_PUBLICO` es https; sin `X-Powered-By` | `revision.itest.ts`, `src/api/cabeceras` |
| Límites | Cuerpo máximo por ruta (413), límites por IP (login, API, landing, webhooks con cubetas separadas), WAF por tasa delante del balanceador (`infra/alb.tf`) | `revision.itest.ts`, `src/api/limites.itest.ts` |
| `trust proxy` | Sin él, falsificar `X-Forwarded-For` no da cupo; con `TRUST_PROXY=1` (ALB) se lee la IP real; alerta fuerte al arrancar en producción sin definirlo | `src/api/limites.itest.ts`, `src/seguridad/entorno.ts` |
| SSRF en reenviadores | El destino de los reenvíos (Twilio → Chatwoot) y de la sonda de salud salen SOLO de variables de entorno, nunca de la petición; el directorio de agentes no sigue redirecciones; la URL base pública para QR no se toma del encabezado `Host` en producción | `src/mensajeria/`, `src/captacion/landing-url.ts` |
| Webhooks | Firma de Twilio (`X-Twilio-Signature`) y de Chatwoot (HMAC con marca de tiempo) sobre el cuerpo crudo, antes de parsear; datos inesperados: 200 con constancia, nunca 500 (incluye NUL en cualquier campo, EF-19) | `src/webhooks/inesperados.itest.ts`, `src/robustez/rafagas.itest.ts`, `revision.itest.ts` |
| Secretos en el repositorio | Guarda `check:secretos` (llaves privadas, AWS, Twilio, GitHub, Slack, Stripe, JWT, `.env` real, asignaciones largas en configuración). Excepciones por ruta exacta y con motivo: solo los valores públicos de la demo | `scripts/check-secretos.ts` y su test; corre dentro de `npm run validar` |
| Secretos en logs | Ni contraseñas (buenas o malas), ni token de sesión, ni firmas, ni cuerpos de webhook; claves sensibles redactadas por nombre; datos de salud por valor `Sensible`; teléfonos enmascarados siempre | `revision.itest.ts`, `src/sensibles/fuga.itest.ts`, `src/observabilidad/observabilidad.itest.ts` |
| Valores de demostración en producción | El backend se NIEGA a arrancar con `NODE_ENV=production` si encuentra la clave de datos de la demo, variables con valores `demo-local…`, la base `inscripciones/inscripciones`, cookie sin `Secure`, origen sin https o secretos cortos. La demo local lo declara con `ENTORNO_DEMO=si` | `src/seguridad/entorno.test.ts` |
| Cuenta de base de datos de la aplicación | Dos cuentas: la que migra es dueña; la de la aplicación no puede borrar, truncar, alterar ni apagar disparadores ni actualizar las tablas de solo anexar. Todo el sistema funciona con ella | `src/seguridad/roles.itest.ts`, `scripts/preparar-roles.ts` |
| Imagen de producción | Sin la CLI de Prisma, sin dependencias de desarrollo, usuario sin privilegios, sistema de archivos de solo lectura (ECS) | `src/seguridad/despliegue.test.ts`, probada construyendo y arrancando la imagen |
| Contraseñas | scrypt (N=2^15, r=8, p=3), 10–128 caracteres, bloqueo por (correo, IP), rechazo de las más comunes y de la de la demo | `src/auth/contrasena.test.ts` |
| Dependencias | Ver abajo | `npm audit` |

## Dependencias

```
npm audit                                       → 4 vulnerabilidades altas (todas transitivas de la CLI de Prisma)
npm audit --omit=dev --omit=optional            → 0 vulnerabilidades  (lo que corre en producción)
cd web && npm audit                             → 0 vulnerabilidades
```

Las 4 altas son `deepmerge-ts` (agotamiento de pila al mezclar grafos recursivos) y `mysql2` (degradación de autenticación; bomba de descompresión), que cuelgan de `prisma` → `@prisma/config` y `prisma` → `mysql2`. **Ninguna llega al servicio**: la CLI de Prisma (`prisma`) es una dependencia opcional de `@prisma/client` y solo sirve para generar el cliente y migrar. Se mitigó así:

1. La imagen `produccion` del `Dockerfile` instala con `npm ci --omit=dev --omit=optional --ignore-scripts`: sin la CLI (79 MB de `node_modules` contra 325 MB) y `npm audit` sobre ese árbol da 0.
2. La CLI vive solo en las imágenes `migrar` (tarea puntual de cada despliegue, en una subred privada, sin puerto abierto) y `demo` (local).
3. No se corrió `npm audit fix --force` (instalaría Prisma 6, un cambio incompatible). Cuando Prisma publique una 7.x que actualice `@prisma/config` y `mysql2`, basta subir la versión exacta en `package.json`.

Qué hacer cada mes: `npm audit` en la raíz y en `web/`; si aparece algo en `--omit=dev --omit=optional`, es del servicio y se atiende de inmediato.

## Hallazgos de esta revisión

| ID | Gravedad | Qué | Qué se hizo |
|---|---|---|---|
| K3-01 | ALTA | Nada impedía arrancar en producción con la clave de cifrado de la demo (publicada en el repositorio), la base `inscripciones/inscripciones` o secretos `demo-local…`: los datos de salud de los menores habrían quedado cifrados con una clave pública | `src/seguridad/entorno.ts`: se niega a arrancar; la demo se declara con `ENTORNO_DEMO=si` |
| K3-02 | MEDIA | La imagen corría como root y llevaba la CLI de Prisma con sus 4 vulnerabilidades altas (F1-17, EB-26) | Imágenes separadas; producción sin CLI y como `node` |
| K3-03 | MEDIA | La aplicación usaba la cuenta dueña de las tablas: un error o inyección podía apagar los disparadores de solo anexar (EB-08, EF-15) | `scripts/lib/roles-bd.ts` + tarea de migración de `infra/` + prueba de que no puede |
| K3-04 | MEDIA | Los puertos de la demo (backend, Chatwoot, Postgres con contraseñas públicas) se publicaban a toda la red (EB-20) | Solo `127.0.0.1` |
| K3-05 | BAJA | Contraseñas comunes aceptadas por la política (EB-20) | Lista de comunes + la de la demo |
| K3-06 | BAJA | Ningún mecanismo detectaba un secreto subido al repositorio | `check:secretos` dentro de `validar` |
| K3-07 | BAJA | Un teléfono completo podía llegar a un log dentro de un mensaje de error o un campo no previsto | Enmascarado automático en `src/lib/log.ts` + prueba que recorre los flujos |
| K3-08 | BAJA | `/salud` consultaba la base: una caída de la base reiniciaba las tareas en bucle | `/salud` (vivo) sin base y `/salud/lista` (listo) |
| ED-08 | BAJA | Orden de candados invertido entre el bot y la API (interbloqueo) | Orden LEAD → GRUPO → CLASE en todo el código que toca esas filas, con prueba que fuerza el cruce |

## Riesgos residuales y decisiones

- **EF-25 (`Origin: null` en la landing)**: se sigue aceptando a propósito (Firefox con `Referrer-Policy: no-referrer` lo manda en un POST legítimo). La defensa es `Sec-Fetch-Site`, el límite por IP, el honeypot y el WAF. Lo peor que puede pasar es un lead basura.
- **EB-16 (enumeración del slug por tiempo)**: un slug de organización no es un secreto. Sin cambio.
- **EB-18 (inundación del login anónimo, cuerpos de 100 MB/s por IP)**: lo frena el WAF por tasa y el límite del backend (`infra/alb.tf`); no se resuelve en la aplicación.
- **EB-19 (retención de `acceso_dato_sensible` y `registro_cambio`)**: son de solo anexar y no se purgan; cuánto conservarlos es decisión de Eduardo (`docs/SUPUESTOS-Y-DECISIONES.md`).
- **EC-26 (crecimiento de `acceso_dato_sensible` por un usuario sin permiso que insiste)**: solo lo frena el límite por IP y el WAF; vigílese el tamaño de la tabla (`inscripciones_*` en métricas, alarma de espacio de RDS).
- **EB-10 (directorio de agentes y sonda de salud llaman a Chatwoot fuera de `MessagingProvider`)**: no mandan mensajes; decisión de Eduardo sobre si se amplía la letra del invariante 4.
- **TLS entre el backend y Redis (Chatwoot)**: sin cifrar dentro de la VPC privada (`infra/base_datos.tf`), `[SUPUESTO]`.
- **Sin pruebas de penetración externas ni revisión de la configuración real de AWS**: nada se desplegó. La revisión del Terraform es de texto (`scripts/infra-validar.test.ts`).
- **Contraseña inicial de cada cuenta**: no hay cambio obligatorio en el primer acceso (EB-20, decisión abierta).
