// K3/K6: lo que la imagen y el compose prometen, comprobado sobre el texto de `Dockerfile` y `docker-compose.yml`. Si alguien los debilita, esto lo dice.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

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
  const puertos = [...c.matchAll(/^\s*- "([0-9.:]+:\d+:\d+)"$/gm)].map((m) => m[1]!);
  assert.ok(puertos.length >= 3, `puertos: ${puertos.join(", ")}`);
  for (const p of puertos) assert.ok(p.startsWith("127.0.0.1:"), `el puerto ${p} se publica a toda la red`);
  assert.match(c, /TRUST_PROXY: "false"/);
});
