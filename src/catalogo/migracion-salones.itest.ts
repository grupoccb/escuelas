// C1: la migración que convierte `grupo.salon` (texto) en filas de `salon` por sucursal no pierde datos.
// Crea una base DESCARTABLE, le aplica todas las migraciones anteriores a la de C1, siembra datos «de
// antes» (incluidos casos feos: espacios, texto vacío, un grupo dado de baja, el mismo nombre en dos
// sucursales y hasta un choque heredado), aplica la migración de C1 y comprueba el resultado.

import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import pg from "pg";

const MIGRACION_C1 = "20261011000000_instructores_y_salones";
const ORG = "00000000-0000-4000-8000-0000000000aa";
const id = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

test("migración de salones: cada texto distinto por sucursal pasa a una fila, los grupos conservan su salón y no se pierde ningún dato", async () => {
  const base = new URL(process.env["DATABASE_URL"] ?? "");
  const nombre = `migracion_salones_${randomBytes(4).toString("hex")}_pruebas`;
  const mantenimiento = new URL(base);
  mantenimiento.pathname = "/postgres";
  const admin = new pg.Client({ connectionString: mantenimiento.toString() });
  await admin.connect();
  await admin.query(`CREATE DATABASE "${nombre}"`);
  const aqui = new URL(base);
  aqui.pathname = `/${nombre}`;
  const cliente = new pg.Client({ connectionString: aqui.toString() });
  try {
    await cliente.connect();
    const carpetas = readdirSync("prisma/migrations", { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
    const idx = carpetas.indexOf(MIGRACION_C1);
    assert.ok(idx > 0, "existe la migración de C1");
    for (const c of carpetas.slice(0, idx)) await cliente.query(readFileSync(`prisma/migrations/${c}/migration.sql`, "utf8"));

    // Datos «de antes»: texto libre en grupo.salon.
    await cliente.query(`INSERT INTO organizacion (id, nombre, slug) VALUES ($1, 'Org', 'org-migracion')`, [ORG]);
    await cliente.query(`INSERT INTO vertical (id, organizacion_id, nombre, slug) VALUES ($1, $2, 'V', 'v')`, [id(1), ORG]);
    for (const [n, nombreSucursal] of [[11, "Norte"], [12, "Sur"]] as const) {
      await cliente.query(`INSERT INTO sucursal (id, organizacion_id, nombre, zona_horaria) VALUES ($1, $2, $3, 'America/Mexico_City')`, [id(n), ORG, nombreSucursal]);
    }
    const programa = (n: number, sucursal: number, nombrePrograma: string) =>
      cliente.query(`INSERT INTO programa (id, organizacion_id, vertical_id, sucursal_id, nombre, edad_min, edad_max) VALUES ($1, $2, $3, $4, $5, 3, 12)`, [id(n), ORG, id(1), id(sucursal), nombrePrograma]);
    await programa(21, 11, "P norte");
    await programa(22, 12, "P sur");
    const grupo = (n: number, programaN: number, nombreGrupo: string, salon: string | null, eliminado = false) =>
      cliente.query(`INSERT INTO grupo (id, organizacion_id, programa_id, nombre, salon, cupo_maximo, eliminado_en) VALUES ($1, $2, $3, $4, $5, 10, ${eliminado ? "now()" : "NULL"})`, [id(n), ORG, id(programaN), nombreGrupo, salon]);
    await grupo(31, 21, "N1", "Sala uno");
    await grupo(32, 21, "N2", "Sala uno"); // mismo texto, misma sucursal → UNA fila
    await grupo(33, 21, "N3", "  Sala dos  "); // espacios → «Sala dos»
    await grupo(34, 21, "N4", null);
    await grupo(35, 21, "N5", "   "); // vacío → sin salón
    await grupo(36, 21, "N6", "Antiguo", true); // dado de baja: no se pierde su dato
    await grupo(37, 22, "S1", "Sala uno"); // mismo nombre, OTRA sucursal → otra fila
    // Un choque heredado (dos grupos, mismo salón, misma hora): la migración no puede fallar por él.
    for (const g of [31, 32]) {
      await cliente.query(`INSERT INTO grupo_horario (organizacion_id, grupo_id, dia_semana, hora_inicio_min, hora_fin_min) VALUES ($1, $2, 2, 600, 660)`, [ORG, id(g)]);
    }
    const antes = (await cliente.query(`SELECT count(*)::int AS n FROM grupo`)).rows[0].n as number;

    await cliente.query(readFileSync(`prisma/migrations/${MIGRACION_C1}/migration.sql`, "utf8"));

    const salones = (await cliente.query(`SELECT s.nombre, su.nombre AS sucursal FROM salon s JOIN sucursal su ON su.id = s.sucursal_id ORDER BY su.nombre, s.nombre`)).rows.map((r) => `${r.sucursal}/${r.nombre}`);
    assert.deepEqual(salones, ["Norte/Antiguo", "Norte/Sala dos", "Norte/Sala uno", "Sur/Sala uno"]);
    const porGrupo = (await cliente.query(`SELECT g.nombre AS grupo, s.nombre AS salon, s.sucursal_id = p.sucursal_id AS misma_sucursal FROM grupo g JOIN programa p ON p.id = g.programa_id LEFT JOIN salon s ON s.id = g.salon_id ORDER BY g.nombre`)).rows;
    assert.deepEqual(
      porGrupo.map((r) => [r.grupo, r.salon]),
      [["N1", "Sala uno"], ["N2", "Sala uno"], ["N3", "Sala dos"], ["N4", null], ["N5", null], ["N6", "Antiguo"], ["S1", "Sala uno"]],
    );
    assert.ok(porGrupo.filter((r) => r.salon !== null).every((r) => r.misma_sucursal === true), "cada grupo apunta al salón de SU sucursal");
    assert.equal((await cliente.query(`SELECT count(*)::int AS n FROM grupo`)).rows[0].n, antes, "no se perdió ningún grupo");
    assert.equal((await cliente.query(`SELECT count(*)::int AS n FROM information_schema.columns WHERE table_name = 'grupo' AND column_name = 'salon'`)).rows[0].n, 0, "la columna de texto desapareció");

    // Y los disparadores ya rigen desde ahora: el choque heredado sigue ahí, pero uno nuevo no entra.
    const sala = (await cliente.query(`SELECT id FROM salon WHERE nombre = 'Sala uno' AND sucursal_id = $1`, [id(11)])).rows[0].id as string;
    await cliente.query(`INSERT INTO grupo (id, organizacion_id, programa_id, nombre, salon_id, cupo_maximo) VALUES ($1, $2, $3, 'N7', $4, 10)`, [id(38), ORG, id(21), sala]);
    await assert.rejects(cliente.query(`INSERT INTO grupo_horario (organizacion_id, grupo_id, dia_semana, hora_inicio_min, hora_fin_min) VALUES ($1, $2, 2, 630, 700)`, [ORG, id(38)]), /choque_de_ocupacion/);
  } finally {
    await cliente.end().catch(() => {});
    await admin.query(`DROP DATABASE IF EXISTS "${nombre}" WITH (FORCE)`);
    await admin.end();
  }
});
