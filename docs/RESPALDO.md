# Respaldo y restauración (bloque K5)

Probado en local con los datos de la demo generada (I4): `src/respaldo/respaldo.itest.ts`. En AWS el respaldo principal son los automáticos de RDS (`infra/base_datos.tf`); esto es el respaldo LÓGICO: portátil, abre en otra versión, otra cuenta o una laptop.

## Comandos

```bash
# Respaldar (formato custom de pg_dump: comprimido). Cifrado con AES-256-GCM si hay frase.
RESPALDO_CLAVE='una frase larga y secreta (16+ caracteres)' npm run respaldo -- --destino respaldos --retener 14
npm run respaldo -- --verificar respaldos/inscripciones-20261009-120000Z.dump.enc     # suma de verificación y que la frase abre

# Restaurar SIEMPRE en una base nueva y comparar
RESPALDO_CLAVE='…' npm run restaurar -- --archivo respaldos/inscripciones-20261009-120000Z.dump.enc --base inscripciones_restaurada
DATABASE_URL=postgresql://…/inscripciones_restaurada npm run cuadratura
DATABASE_URL=postgresql://…/inscripciones_restaurada npx prisma migrate status
```

- Lee `DATABASE_URL`. Sin `pg_dump` instalado usa el contenedor de Postgres de docker compose (`RESPALDO_CONTENEDOR`, por omisión `inscripciones-postgres-1`). La contraseña viaja por variable de entorno, nunca por argumentos.
- Cada respaldo deja `…dump[.enc]` y `…dump[.enc].json` (base, fecha, SHA-256, tamaño, filas por tabla, migraciones). `restaurar` verifica la suma ANTES de tocar nada y, al terminar, compara el conteo de CADA tabla y las migraciones con los del respaldo; si algo no coincide, sale con error.
- **Retención**: `--retener N` conserva los N más recientes de esa base y borra los demás con su metadato (nunca toca otras bases ni archivos ajenos).
- **Cifrado**: AES-256-GCM, clave derivada con scrypt de la frase (sal propia por archivo). El archivo cifrado no deja ver ni el encabezado de `pg_dump`. Una frase equivocada o un byte alterado fallan (etiqueta GCM y suma de verificación). **En producción el respaldo va cifrado** (sin `RESPALDO_CLAVE` el comando se niega salvo `--sin-cifrar`). Un respaldo sin cifrar contiene datos de menores (los de salud están cifrados DENTRO de la base con otra clave, pero el resto, nombres, teléfonos, importes, no).
- **Restaurar nunca pisa**: si la base destino ya tiene tablas se niega (`--reemplazar --confirmar` la borra y la crea de nuevo). Restaura sin dueños ni permisos del origen; después se corre `scripts/preparar-roles.ts` para la cuenta de la aplicación.

## La clave de los datos de salud se respalda APARTE

Los datos de salud de los menores viven cifrados en la base con `CLAVE_DATOS_SENSIBLES`. **Esa clave no está en ningún respaldo de la base.** Sin ella, un respaldo restaurado conserva todo MENOS poder leer alergias, condiciones, medicamentos y contactos de emergencia. Guárdala en al menos dos lugares independientes:

1. Secrets Manager (lo crea `infra/secretos.tf`, con una copia protegida contra destrucción por Terraform).
2. Un gestor de contraseñas de la dirección, fuera de AWS.

Si se rota (`CLAVES_DATOS_SENSIBLES_ANTERIORES`, ver `docs/API.md`), conserva TAMBIÉN las anteriores mientras exista un respaldo que las use. La frase de `RESPALDO_CLAVE` tampoco vive en el repositorio ni en la base.

## RPO y RTO `[SUPUESTO]`

| | Valor | Cómo |
|---|---|---|
| **RPO** (cuánto se puede perder) | Minutos con RDS (restauración a un punto en el tiempo, retención 14–35 días). Hasta 24 h con el respaldo lógico diario. | `infra/base_datos.tf`; programar `npm run respaldo` cada noche en una tarea con acceso a la base |
| **RTO** (cuánto tarda volver) | 30–60 min desde RDS a una instancia nueva + cambiar `DATABASE_URL`. 5–15 min por cada 10 GB con el respaldo lógico, más migraciones y cuadratura. | Ensayo medido en local: base de demo chica en menos de 40 s (`respaldo.itest.ts`) |

Los números reales se miden en el primer ensayo con la base de la escuela; hay que repetir el ensayo de restauración cada trimestre, con el procedimiento de arriba, y anotar la fecha.

## Procedimiento de recuperación

1. Parar el backend (o dejarlo fuera del balanceador).
2. Restaurar en una base NUEVA (`npm run restaurar`) y comprobar: conteos coinciden, `npm run cuadratura`, `prisma migrate status`.
3. Preparar la cuenta de la aplicación (`scripts/preparar-roles.ts`) y apuntar `DATABASE_URL` a la base nueva.
4. Con la clave de datos de salud correcta, comprobar que una ficha se lee (`GET /api/salud/…` de un alumno de prueba).
5. Levantar el backend. El barrido recupera lo que quedó a medias (reclamos huérfanos, envíos inciertos).
6. Los mensajes que Twilio reintentó durante la caída llegan solos (los webhooks son idempotentes).
