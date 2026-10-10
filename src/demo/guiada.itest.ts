// K8: `npm run demo:guiada` se ejecuta de verdad (el script real, contra servicios simulados y una base propia que crea y borra): recorre los quince pasos (con módulos y hermanos), termina con la
// cuadratura en verde y es REPRODUCIBLE e IDEMPOTENTE (dos corridas seguidas dan el mismo relato palabra por palabra; la segunda recrea la base). Nada sale a Twilio ni a
// Chatwoot (el transporte es falso) y la base de la demo normal no se toca.

import { after, test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import pg from "pg";
import { exigirBaseDePruebas } from "../testutil/prisma-pruebas.ts";

// Una base de la demo guiada POR cada base de pruebas (V10b-fix): dos corridas de `test:int` a la vez (cada una con su `DATABASE_URL_PRUEBAS`, p. ej. para correr la suite a otra hora)
// no se pisan. Con la base por omisión (`inscripciones_pruebas`) el nombre es el de siempre.
const BASE = `${new URL(process.env["DATABASE_URL"] ?? "postgresql://x/inscripciones_pruebas").pathname.slice(1).replace(/_pruebas$/, "")}_demo_guiada_pruebas`;
const servidor = (): string => {
  exigirBaseDePruebas(process.env["DATABASE_URL"]);
  const u = new URL(process.env["DATABASE_URL"]!);
  u.pathname = "/postgres";
  return u.toString();
};

function correr(extra: string[] = []): { salida: string; codigo: number | null } {
  const r = spawnSync(process.execPath, ["scripts/demo-guiada.ts", "--base", BASE, ...extra], {
    env: { ...process.env, DATABASE_URL_DEMO_GUIADA: servidor(), NODE_ENV: "development" },
    encoding: "utf8",
    timeout: 240_000,
  });
  return { salida: r.stdout, codigo: r.status };
}

/** El relato sin lo que cambia entre corridas por construcción (puerto e identificadores de las ligas) ni los avisos de Node. */
const relato = (s: string): string =>
  s
    .split("\n")
    .filter((l) => !/https?:\/\//.test(l) && !/^\{"t":/.test(l) && !/DeprecationWarning|trace-deprecation|Prisma schema|Loaded Prisma/.test(l))
    .join("\n");

after(async () => {
  const admin = new pg.Client({ connectionString: servidor() });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS "${BASE}" WITH (FORCE)`);
  await admin.end();
});

test("la demo guiada recorre los quince pasos (con módulos y hermanos), termina con la cuadratura en verde y dos corridas dan el MISMO relato", { timeout: 600_000 }, () => {
  const una = correr();
  assert.equal(una.codigo, 0, una.salida.slice(-1500));
  for (const paso of ["Paso 0.", "Paso 1.", "Paso 2.", "Paso 3.", "Paso 4.", "Paso 5.", "Paso 6.", "Paso 7.", "Paso 8.", "Paso 9.", "Paso 10.", "Paso 11.", "Paso 12.", "Paso 13.", "Paso 14.", "Paso 15."]) assert.ok(una.salida.includes(paso), `falta el ${paso}`);
  assert.match(una.salida, /✓ cuadra — \d+ cargos/);
  assert.match(una.salida, /Cuadratura: en verde\./);
  // Los hitos del recorrido, dichos con lo que salió de las tablas:
  for (const hito of [/atribuyó a la campaña/, /bot de tres preguntas/i, /Cotización vigente/, /clase muestra de .* en «/i, /plantilla «aviso_maestro_agendada»/, /plantilla «recordatorio_clase_muestra»/, /asistió/, /precio CONGELADO/, /agrega a Valentina/, /ya estaba \(no la duplica\)/, /La promoción por hermanos se aplicó sola a Valentina/, /Coincide con la cotización previa/, /dos alumnos y dos inscripciones/, /repartido entre los cargos|propone el reparto/, /Por entregar: /, /Estado de cuenta/,
    // V12: los módulos. Apagar el cotizador (el bot pasa al asesor sin cotizar), marcar a mano con la inscripción apagada y, al encender, inscribir de verdad.
    /Apaga «Cotizador»/, /el bot solo toma nombre, edad y sucursal y pasa al asesor, SIN cotizar ni ofrecer horarios/, /Sin nota \(400\) o con una nota de menos de diez letras \(400\)/, /inscrito a mano por Asesor demo/, /Cómo se inscribió.*A mano/, /marcar a mano ya no se puede \(409\): «Para marcar a la familia como inscrita, inscríbela desde la ficha»/, /el lead YA NO figura como «a mano»/, /1 inscripción real/]) assert.match(una.salida, hito);
  assert.match(una.salida, /Interfaz: +http:\/\/127\.0\.0\.1:\d+\//, "el resumen trae las ligas locales a la interfaz");
  assert.match(una.salida, /Estado de cuenta: +http:\/\/127\.0\.0\.1:\d+\/cuenta\//);
  // Sin términos que dependan de la escuela en el código: todo lo nombrado sale de las tablas, así que el relato cambia con el catálogo, no con el script.
  const dos = correr();
  assert.equal(dos.codigo, 0);
  const a = relato(una.salida).split("\n");
  const b = relato(dos.salida).split("\n");
  const i = a.findIndex((l, k) => l !== b[k]);
  assert.equal(i, -1, `reproducible: la segunda corrida (que recrea la base) cuenta lo mismo; difieren en la línea ${i + 1}:\n  1.ª: ${a[i]}\n  2.ª: ${b[i]}`);
  assert.equal(a.length, b.length);
});

test("la demo guiada se niega a tocar una base que no sea suya", () => {
  const r = spawnSync(process.execPath, ["scripts/demo-guiada.ts", "--base", "inscripciones"], { env: { ...process.env, DATABASE_URL_DEMO_GUIADA: servidor() }, encoding: "utf8", timeout: 60_000 });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /demo_guiada/);
});
