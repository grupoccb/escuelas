// K5: respaldo y restauración PROBADOS. Se arma una base de origen con migraciones y con los datos de la demo generada (I4: leads, clases muestra, inscripciones,
// cargos, pagos, pases, ventas), se respalda (con y sin cifrar), se restaura en una base NUEVA y se comprueba: el conteo de CADA tabla, las migraciones en
// verde (`prisma migrate status`) y la cuadratura del dinero. También: clave equivocada, archivo alterado, restaurar sobre una base con tablas y retención.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { appendFileSync, existsSync, mkdtempSync, readdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pg from "pg";
import { crearPrisma } from "../datos/prisma.ts";
import { conAlcance } from "../datos/alcance.ts";
import { cuadratura } from "../finanzas/cuadratura.ts";
import { generarDatosDeDemo } from "../demo/generador.ts";
import { listarOrganizaciones } from "../datos/sistema.ts";
import { contarFilasPorTabla, estaCifrado, leerConexion, respaldar, restaurar, aplicarRetencion, verificarRespaldo } from "../../scripts/lib/respaldo.ts";
import { crearPrismaDePruebas, exigirBaseDePruebas, type PrismaPruebas } from "../testutil/prisma-pruebas.ts";
import { mundoDeFinanzas } from "../testutil/finanzas.ts";
import { sembrarPrograma } from "../testutil/semilla.ts";

const sufijo = randomBytes(3).toString("hex");
const BASE_ORIGEN = `respaldo_origen_${sufijo}_pruebas`;
const BASES_CREADAS: string[] = [BASE_ORIGEN];
let urlOrigen: string;
let directorio: string;
let prisma: PrismaPruebas;
let organizacionId: string;

const urlDe = (base: string): string => {
  const u = new URL(process.env["DATABASE_URL"]!);
  u.pathname = `/${base}`;
  return u.toString();
};

before(async () => {
  const mantenimiento = process.env["DATABASE_URL"]!;
  exigirBaseDePruebas(mantenimiento);
  urlOrigen = urlDe(BASE_ORIGEN);
  const admin = new pg.Client({ connectionString: urlDe("postgres") });
  await admin.connect();
  await admin.query(`CREATE DATABASE "${BASE_ORIGEN}"`);
  await admin.end();
  execFileSync("npx", ["prisma", "migrate", "deploy"], { env: { ...process.env, DATABASE_URL: urlOrigen }, stdio: ["ignore", "ignore", "inherit"] });
  directorio = mkdtempSync(join(tmpdir(), "respaldos-"));
  prisma = crearPrismaDePruebas(urlOrigen, 15);
  // Una escuela chica con la historia de la demo (misma generación que `npm run demo:datos`).
  const m = await mundoDeFinanzas(prisma, "Respaldo", new Date("2026-10-08T16:00:00Z"));
  organizacionId = m.org.organizacionId;
  let k = 0;
  for (const [sucursal, nombre, edades] of [[m.norte, "Programa 1", [4, 8]], [m.sur, "Programa 2", [9, 12]]] as const) {
    k++;
    await sembrarPrograma(prisma, m.org, { sucursalId: sucursal, nombre, edadMin: edades[0], edadMax: edades[1], grupos: [{ nombre: `Grupo ${k}A`, cupoMaximo: 8, horarios: [[1, 960, 1020], [3, 960, 1020]] }, { nombre: `Grupo ${k}B`, cupoMaximo: 8, horarios: [[2, 1020, 1080], [4, 1020, 1080]] }], precio: { inscripcion: "500.00", mensualidad: "900.00", desde: "2020-01-01" } });
  }
  const resumen = await generarDatosDeDemo(prisma, { organizacionId, hasta: new Date("2026-10-08T22:00:00Z"), semilla: 11, alumnos: 25, meses: 2 });
  assert.ok(resumen.inscripciones >= 10 && resumen.cuadratura?.ok, "la base de origen tiene la historia de la demo y cuadra");
  await m.cerrar();
});
after(async () => {
  await prisma.$disconnect();
  const admin = new pg.Client({ connectionString: urlDe("postgres") });
  await admin.connect();
  for (const b of BASES_CREADAS) await admin.query(`DROP DATABASE IF EXISTS "${b}" WITH (FORCE)`);
  await admin.end();
});

async function compararYCuadrar(urlDestino: string, filasOrigen: Record<string, number>, migracionesOrigen: number): Promise<void> {
  const { filas, migraciones } = await contarFilasPorTabla(urlDestino);
  assert.deepEqual(filas, filasOrigen, "el conteo de CADA tabla coincide con el origen");
  assert.equal(migraciones, migracionesOrigen);
  assert.ok(Object.values(filas).reduce((a, b) => a + b, 0) > 500, "no es una base vacía");
  // Migraciones en verde: Prisma ve la base restaurada al día.
  const estado = spawnSync("npx", ["prisma", "migrate", "status"], { env: { ...process.env, DATABASE_URL: urlDestino }, encoding: "utf8" });
  assert.equal(estado.status, 0, estado.stdout + estado.stderr);
  assert.match(estado.stdout + estado.stderr, /Database schema is up to date/);
  // El dinero cuadra en la base restaurada.
  const p = crearPrisma(urlDestino, 5);
  try {
    const orgs = await listarOrganizaciones(p);
    const nuestra = orgs.find((o) => o.id === organizacionId);
    assert.ok(nuestra, "la organización de la demo está en la restaurada");
    const c = await cuadratura(conAlcance(p, organizacionId));
    assert.equal(c.ok, true, JSON.stringify(c.discrepancias.slice(0, 3)));
    assert.ok(Number(c.resumen.cargos) > 20 && Number(c.resumen.pagos) > 10);
  } finally {
    await p.$disconnect();
  }
}

test("respaldo SIN cifrar → restaurar en una base nueva: mismos conteos por tabla, migraciones en verde y cuadratura en orden", { timeout: 300_000 }, async () => {
  const r = await respaldar({ url: urlOrigen, directorio });
  assert.match(r.archivo, /\.dump$/);
  assert.equal(r.metadatos.cifrado, false);
  assert.equal(estaCifrado(r.archivo), false);
  assert.equal((await verificarRespaldo(r.archivo)).sha256, r.metadatos.sha256);
  const base = `respaldo_restaurada_${sufijo}_a_pruebas`;
  BASES_CREADAS.push(base);
  const res = await restaurar({ archivo: r.archivo, urlDestino: urlDe(base) });
  assert.deepEqual(res.filasPorTabla, r.metadatos.filasPorTabla);
  await compararYCuadrar(urlDe(base), r.metadatos.filasPorTabla, r.metadatos.migraciones);
});

test("respaldo CIFRADO: no contiene el texto de la base, restaura con la frase, y una frase equivocada o un archivo alterado fallan sin dejar una base a medias creíble", { timeout: 300_000 }, async () => {
  const frase = `frase-de-prueba-${randomBytes(8).toString("hex")}`;
  const r = await respaldar({ url: urlOrigen, directorio, frase, ahora: new Date("2026-10-09T10:00:00Z") });
  assert.match(r.archivo, /\.dump\.enc$/);
  assert.equal(r.metadatos.cifrado, true);
  // El archivo cifrado no deja ver ni los encabezados del formato de pg_dump ni un nombre de tabla.
  const bytes = readFileSync(r.archivo);
  assert.ok(!bytes.subarray(0, 5).equals(Buffer.from("PGDMP")), "no empieza con el encabezado de pg_dump");
  assert.ok(!bytes.includes(Buffer.from("registro_cambio")) && !bytes.includes(Buffer.from("CREATE TABLE")), "no deja ver nada legible");

  const base = `respaldo_restaurada_${sufijo}_b_pruebas`;
  BASES_CREADAS.push(base);
  await assert.rejects(() => restaurar({ archivo: r.archivo, urlDestino: urlDe(base) }), /falta la frase/);
  await assert.rejects(() => verificarRespaldo(r.archivo, "otra frase distinta y larga"), /./, "una frase equivocada no abre el archivo");
  await assert.rejects(() => restaurar({ archivo: r.archivo, urlDestino: urlDe(`${base}_mala`), frase: "otra frase distinta y larga" }), /./);
  BASES_CREADAS.push(`${base}_mala`);

  const ok = await restaurar({ archivo: r.archivo, urlDestino: urlDe(base), frase });
  assert.deepEqual(ok.filasPorTabla, r.metadatos.filasPorTabla);
  await compararYCuadrar(urlDe(base), r.metadatos.filasPorTabla, r.metadatos.migraciones);

  // Alterar un solo byte del archivo: la suma de verificación lo delata antes de tocar la base.
  const alterado = join(directorio, "alterado.dump.enc");
  const copia = Buffer.from(bytes);
  copia[copia.length >> 1] = copia[copia.length >> 1]! ^ 0xff;
  writeFileSync(alterado, copia);
  writeFileSync(`${alterado}.json`, readFileSync(`${r.archivo}.json`));
  await assert.rejects(() => verificarRespaldo(alterado, frase), /suma de verificación/);
  await assert.rejects(() => restaurar({ archivo: alterado, urlDestino: urlDe(`${base}_alt`), frase }), /./, "ni el descifrado (etiqueta GCM) lo acepta");
  BASES_CREADAS.push(`${base}_alt`);
});

test("restaurar nunca pisa una base con datos sin --reemplazar; con él, la reemplaza", { timeout: 300_000 }, async () => {
  const r = await respaldar({ url: urlOrigen, directorio, ahora: new Date("2026-10-09T11:00:00Z") });
  const base = `respaldo_restaurada_${sufijo}_c_pruebas`;
  BASES_CREADAS.push(base);
  await restaurar({ archivo: r.archivo, urlDestino: urlDe(base) });
  await assert.rejects(() => restaurar({ archivo: r.archivo, urlDestino: urlDe(base) }), /ya tiene \d+ tablas/);
  // La base destino no cambió tras el rechazo.
  assert.deepEqual((await contarFilasPorTabla(urlDe(base))).filas, r.metadatos.filasPorTabla);
  // Con --reemplazar sí la borra y la deja como el respaldo.
  await restaurar({ archivo: r.archivo, urlDestino: urlDe(base), reemplazar: true });
  assert.deepEqual((await contarFilasPorTabla(urlDe(base))).filas, r.metadatos.filasPorTabla);
});

test("retención: conserva los N respaldos más recientes de la base, borra los demás con su metadato y no toca los de otra base ni archivos ajenos", async () => {
  const d = mkdtempSync(join(tmpdir(), "retencion-"));
  const base = "mi_base";
  const nombres = ["20261001-100000Z", "20261002-100000Z", "20261003-100000Z", "20261004-100000Z"].map((s) => `${base}-${s}.dump.enc`);
  for (const n of nombres) {
    writeFileSync(join(d, n), "x");
    writeFileSync(join(d, `${n}.json`), "{}");
  }
  writeFileSync(join(d, "otra_base-20260101-100000Z.dump"), "x");
  writeFileSync(join(d, "notas.txt"), "x");
  const borrados = aplicarRetencion(d, base, 2);
  assert.deepEqual(borrados.sort(), [nombres[0], nombres[1]].sort());
  assert.deepEqual(readdirSync(d).sort(), [nombres[2], `${nombres[2]}.json`, nombres[3], `${nombres[3]}.json`, "notas.txt", "otra_base-20260101-100000Z.dump"].sort());
  assert.ok(!existsSync(join(d, `${nombres[0]}.json`)));
  appendFileSync(join(d, "notas.txt"), "y");
});

test("la conexión se lee sin exponer la clave en los argumentos de los procesos", () => {
  const c = leerConexion("postgresql://usuario:cl%40ve@localhost:5433/mi_base?sslmode=require");
  assert.deepEqual(c, { usuario: "usuario", clave: "cl@ve", host: "localhost", puerto: "5433", base: "mi_base" });
});
