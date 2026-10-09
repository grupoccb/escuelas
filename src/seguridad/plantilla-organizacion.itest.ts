// K7: la plantilla de alta de una escuela (prisma/seed/plantilla-organizacion.sql) funciona tal cual, con solo cambiar sus tres valores, es idempotente y deja
// una organización que SÍ puede operar: etapas con su papel para el sistema, configuración y ninguna cuenta (el primer administrador se crea aparte).

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import pg from "pg";
import { exigirBaseDePruebas } from "../testutil/prisma-pruebas.ts";

const slug = `nueva-${randomBytes(4).toString("hex")}`;
let c: pg.Client;
before(async () => {
  exigirBaseDePruebas(process.env["DATABASE_URL"]);
  c = new pg.Client({ connectionString: process.env["DATABASE_URL"] });
  await c.connect();
});
after(async () => {
  await c.end();
});

test("la plantilla de alta de una escuela crea la organización, las siete etapas del embudo y la configuración; correrla dos veces no duplica; no crea cuentas", async () => {
  const sql = readFileSync(new URL("../../prisma/seed/plantilla-organizacion.sql", import.meta.url), "utf8").replace("CAMBIAR-identificador-corto", slug).replace("CAMBIAR: nombre de la escuela", "Escuela de prueba K7");
  await c.query(sql);
  await c.query(sql);
  const org = (await c.query("SELECT id, nombre FROM organizacion WHERE slug = $1", [slug])).rows;
  assert.equal(org.length, 1);
  const id = org[0].id as string;
  const etapas = (await c.query("SELECT tipo_sistema, es_ganado, es_perdido FROM etapa_pipeline WHERE organizacion_id = $1 AND eliminado_en IS NULL ORDER BY orden", [id])).rows;
  assert.deepEqual(etapas.map((e) => e.tipo_sistema), ["nuevo", "contactado", "muestra_agendada", "muestra_asistida", "negociacion", "inscrito", "perdido"]);
  assert.deepEqual([etapas[5].es_ganado, etapas[6].es_perdido], [true, true]);
  assert.equal((await c.query("SELECT count(*)::int AS n FROM configuracion_organizacion WHERE organizacion_id = $1", [id])).rows[0].n, 1);
  // V1 (decisión 3): la escuela nueva arranca con SOLO la captación (que no tiene columna: no se apaga); los demás módulos se encienden después, desde Administración.
  const modulos = (await c.query("SELECT modulo_cotizador, modulo_clase_muestra, modulo_inscripcion, modulo_operacion, modulo_finanzas, modulo_tableros FROM configuracion_organizacion WHERE organizacion_id = $1", [id])).rows[0];
  assert.deepEqual(Object.values(modulos), [false, false, false, false, false, false]);
  // Volver a correr la plantilla nunca apaga ni enciende nada de una organización que ya tiene su fila.
  await c.query("UPDATE configuracion_organizacion SET modulo_cotizador = true WHERE organizacion_id = $1", [id]);
  await c.query(sql);
  assert.equal((await c.query("SELECT modulo_cotizador FROM configuracion_organizacion WHERE organizacion_id = $1", [id])).rows[0].modulo_cotizador, true);
  assert.equal((await c.query("SELECT count(*)::int AS n FROM usuario WHERE organizacion_id = $1", [id])).rows[0].n, 0, "ninguna cuenta: ni las de la demo, con su contraseña pública");
  assert.ok(!/demo|Demo-local/.test(sql.replace(/--.*$/gm, "")), "la plantilla no lleva nada de la demo");
});
