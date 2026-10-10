// K3/K6: lo que la imagen y el compose prometen, comprobado sobre el texto de `Dockerfile` y `docker-compose.yml`. Si alguien los debilita, esto lo dice.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";

const leer = (ruta: string): string => readFileSync(new URL(`../../${ruta}`, import.meta.url), "utf8");
const dockerfile = leer("Dockerfile");

/** El texto de una etapa del Dockerfile (desde su `FROM … AS nombre` hasta el siguiente `FROM`). */
function etapa(nombre: string): string {
  const inicio = dockerfile.search(new RegExp(`^FROM .* AS ${nombre}$`, "m"));
  assert.ok(inicio >= 0, `no hay etapa «${nombre}»`);
  const resto = dockerfile.slice(inicio + 1);
  const siguiente = resto.search(/^FROM /m);
  return dockerfile.slice(inicio, siguiente < 0 ? undefined : inicio + 1 + siguiente);
}

test("Dockerfile: la imagen de producción es la última (la que se construye sin --target), sin la CLI de Prisma, sin dependencias de desarrollo y sin root", () => {
  const ultimo = [...dockerfile.matchAll(/^FROM .* AS (\w+)$/gm)].at(-1)![1];
  assert.equal(ultimo, "produccion");
  const p = etapa("produccion");
  assert.match(p, /npm ci --omit=dev --omit=optional/, "sin devDependencies ni la CLI de Prisma (dependencia opcional de @prisma/client)");
  assert.match(p, /^USER node$/m);
  assert.ok(!/npx prisma|prisma generate|COPY .*prisma\.config/.test(p), "la imagen de producción no ejecuta la CLI de Prisma");
  assert.match(p, /CMD \["node", "src\/server\.ts"\]/);
  assert.ok(!/migrate deploy/.test(p), "no migra al arrancar: migrar es una tarea aparte");
  assert.match(p, /COPY --from=base \/app\/prisma\/migrations/, "lleva los nombres de las migraciones para /salud/lista");
});

test("Dockerfile: la imagen de migración y la de la demo existen, corren sin root y migran; solo la de migración prepara la cuenta de la aplicación", () => {
  const m = etapa("migrar");
  assert.match(m, /^USER node$/m);
  assert.match(m, /prisma migrate deploy && node scripts\/preparar-roles\.ts/);
  const d = etapa("demo");
  assert.match(d, /^USER node$/m);
  assert.match(d, /prisma migrate deploy && node src\/server\.ts/);
});

test("docker-compose: el backend y demo-preparar usan el objetivo «demo», se declara como demo, y los puertos solo se publican en 127.0.0.1", () => {
  const c = leer("docker-compose.yml");
  assert.match(c, /x-backend: &backend\n(?:\s*#.*\n)*\s*build:\n\s*context: \.\n\s*target: demo/);
  assert.match(c, /ENTORNO_DEMO: "si"/);
  // V12: el puerto del anfitrión puede venir de una variable con su valor de siempre por omisión (`${DEMO_PUERTO:-3000}`): otra demo aparte usa otros puertos. La IP sigue fija.
  const puertos = [...c.matchAll(/^\s*- "([0-9.]+:[^"]*:\d+)"$/gm)].map((m) => m[1]!);
  assert.ok(puertos.length >= 3, `puertos: ${puertos.join(", ")}`);
  for (const p of puertos) assert.ok(p.startsWith("127.0.0.1:"), `el puerto ${p} se publica a toda la red`);
  assert.match(c, /TRUST_PROXY: "false"/);
});

// V9: el ensayo con WhatsApp real relaja UNA cosa del compose (el bloqueo de los dominios de Twilio, por variable) y agrega UN servicio con perfil. Esto lo vigila.
test("V9 docker-compose: el ensayo es un perfil, no cambia la demo por omisión y su puerta pública solo deja pasar a Twilio", () => {
  const c = leer("docker-compose.yml");
  // El servicio del ensayo solo existe con su perfil y se publica en el loopback.
  const borde = c.slice(c.indexOf("  ensayo-borde:"), c.indexOf("  chatwoot-postgres:"));
  assert.match(borde, /profiles: \["ensayo"\]/);
  assert.match(borde, /"127\.0\.0\.1:3100:3100"/);
  assert.match(borde, /scripts\/ensayo-borde\.ts/);
  // Por omisión (sin .env): el bloqueo de Twilio sigue, y Chatwoot y el backend conservan sus direcciones de siempre.
  for (const dominio of ["api", "messaging", "content", "media"]) {
    assert.ok(c.includes(`"\${ENSAYO_TWILIO_BLOQUEO_PREFIJO:-}${dominio}.twilio.com:127.0.0.1"`), `el bloqueo de ${dominio}.twilio.com se apaga solo con ENSAYO_TWILIO_BLOQUEO_PREFIJO`);
  }
  assert.match(c, /FRONTEND_URL: \$\{ORIGEN_PUBLICO:-http:\/\/localhost:\$\{DEMO_PUERTO_CHATWOOT:-3001\}\}/);
  assert.match(c, /ORIGEN_PUBLICO: \$\{ORIGEN_PUBLICO:-http:\/\/localhost:\$\{DEMO_PUERTO:-3000\}\}/);
  assert.match(c, /PUBLIC_BASE_URL: \$\{ORIGEN_PUBLICO:-\}/);
  assert.match(c, /TWILIO_AUTH_TOKEN: \$\{TWILIO_AUTH_TOKEN:-\}/);
  // Nada del ensayo viene fijo en el archivo (ni un token, ni la marca).
  assert.ok(!/ENSAYO_LOCAL: (?:si|"si")/.test(c));
  assert.ok(!/TWILIO_AUTH_TOKEN: [^$\s]/.test(c));
});

// V12: otra demo aparte (npm run demo:todo -- --proyecto …) cambia los tres puertos y la imagen por variables; sin ellas la demo principal es exactamente la de siempre.
test("V12 docker-compose: los puertos y la imagen de la demo se pueden cambiar por variable y, sin ellas, son los de siempre", () => {
  const c = leer("docker-compose.yml");
  assert.ok(c.includes('"127.0.0.1:${DEMO_PUERTO:-3000}:3000"'), "interfaz");
  assert.ok(c.includes('"127.0.0.1:${DEMO_PUERTO_CHATWOOT:-3001}:3000"'), "Chatwoot");
  assert.ok(c.includes('"127.0.0.1:${DEMO_PUERTO_POSTGRES:-5432}:5432"'), "Postgres");
  assert.match(c, /CHATWOOT_URL_PUBLICA: http:\/\/localhost:\$\{DEMO_PUERTO_CHATWOOT:-3001\}/);
  assert.equal([...c.matchAll(/image: \$\{DEMO_IMAGEN:-inscripciones-backend:local\}/g)].length, 2, "el backend y el borde del ensayo comparten la imagen");
  assert.ok(!/image: inscripciones-backend:local\b/.test(c), "ninguna imagen fija: otra demo aparte retocaría la de la principal");
});

test("V9: ningún archivo de infraestructura de AWS lleva variables del ensayo (el ensayo es solo local)", () => {
  const dir = new URL("../../infra/", import.meta.url);
  const archivos = readdirSync(dir).filter((f) => /\.(?:tf|tfvars|example|hcl)$/.test(f));
  assert.ok(archivos.length > 5);
  for (const f of archivos) assert.ok(!/ENSAYO_|ensayo-borde/.test(readFileSync(new URL(f, dir), "utf8")), `${f} menciona el ensayo`);
});
