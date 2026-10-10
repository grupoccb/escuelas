// EB-08 / EF-15: la cuenta de la aplicación (sin dueño) NO puede apagar las defensas de la base, y aun así TODO el sistema funciona con ella
// (se crea el mundo de finanzas, se inscribe, se paga, se cancela y se cuadra con esa cuenta). Postgres real, un rol nuevo por corrida.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import pg from "pg";
import { cuadratura } from "../finanzas/cuadratura.ts";
import { mundoDeFinanzas } from "../testutil/finanzas.ts";
import { crearPrismaDePruebas, exigirBaseDePruebas, type PrismaPruebas } from "../testutil/prisma-pruebas.ts";
import { prepararRolDeAplicacion, TABLAS_SOLO_ANEXAR } from "../../scripts/lib/roles-bd.ts";

const ROL = `app_prueba_${randomBytes(4).toString("hex")}`;
const CLAVE = randomBytes(18).toString("hex");
let urlDueno: string;
let urlApp: string;
let prismaApp: PrismaPruebas;

before(async () => {
  urlDueno = process.env["DATABASE_URL"]!;
  exigirBaseDePruebas(urlDueno);
  const r = await prepararRolDeAplicacion({ urlMigrador: urlDueno, rolAplicacion: ROL, claveAplicacion: CLAVE });
  assert.equal(r.tablasSoloAnexar.length, TABLAS_SOLO_ANEXAR.length, "las seis tablas de solo anexar existen");
  const u = new URL(urlDueno);
  u.username = ROL;
  u.password = CLAVE;
  urlApp = u.toString();
  prismaApp = crearPrismaDePruebas(urlApp, 10);
});
after(async () => {
  await prismaApp.$disconnect();
  const c = new pg.Client({ connectionString: urlDueno });
  await c.connect();
  // Se devuelven los permisos y se quita el rol de prueba para no acumular roles en el clúster.
  await c.query(`REVOKE ALL ON ALL TABLES IN SCHEMA public FROM "${ROL}"`);
  await c.query(`REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM "${ROL}"`);
  await c.query(`REVOKE ALL ON SCHEMA public FROM "${ROL}"`);
  await c.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM "${ROL}"`);
  await c.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM "${ROL}"`);
  await c.query(`REVOKE ALL ON DATABASE "${new URL(urlDueno).pathname.slice(1)}" FROM "${ROL}"`);
  await c.query(`DROP ROLE IF EXISTS "${ROL}"`);
  await c.end();
});

async function comoApp(sql: string): Promise<{ ok: true; filas: number } | { ok: false; error: string }> {
  const c = new pg.Client({ connectionString: urlApp });
  await c.connect();
  try {
    const r = await c.query(sql);
    return { ok: true, filas: r.rowCount ?? 0 };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  } finally {
    await c.end();
  }
}

test("la cuenta de la aplicación no es dueña, no es superusuaria y no puede borrar, truncar, alterar ni apagar disparadores", async () => {
  const c = new pg.Client({ connectionString: urlDueno });
  await c.connect();
  const { rows } = await c.query("SELECT rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls FROM pg_roles WHERE rolname = $1", [ROL]);
  assert.deepEqual(Object.values(rows[0]), [false, false, false, false, false]);
  assert.equal((await c.query("SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tableowner = $1", [ROL])).rowCount, 0, "no es dueña de ninguna tabla");
  await c.end();

  for (const sql of [
    "DELETE FROM lead",
    "TRUNCATE lead CASCADE",
    "TRUNCATE registro_cambio",
    "ALTER TABLE registro_cambio DISABLE TRIGGER ALL",
    "ALTER TABLE cargo DISABLE TRIGGER cargo_no_se_borra_trg",
    "DROP TABLE lead CASCADE",
    "CREATE TABLE intruso (id int)",
    "CREATE OR REPLACE FUNCTION cargo_no_se_borra() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN OLD; END $$",
    "SET session_replication_role = replica",
    // V10 (EK-29): el historial de migraciones se lee, no se escribe.
    "UPDATE _prisma_migrations SET applied_steps_count = applied_steps_count",
    "INSERT INTO _prisma_migrations (id, checksum, migration_name) VALUES ('x', 'x', 'x')",
    ...TABLAS_SOLO_ANEXAR.map((t) => `UPDATE ${t} SET creado_en = creado_en`),
  ]) {
    const r = await comoApp(sql);
    assert.equal(r.ok, false, `«${sql}» no debería poder ejecutarse con la cuenta de la aplicación`);
    assert.match((r as { error: string }).error, /permission denied|must be owner|permiso denegado|debe ser due/i, `«${sql}»: ${(r as { error: string }).error}`);
  }
});

test("con ESA cuenta el sistema funciona completo: inscribir, pagar, cancelar un pago, barrer y cuadrar", async () => {
  const m = await mundoDeFinanzas(prismaApp, "Cuenta de la aplicación");
  try {
    const ins = await m.inscribir();
    const c = ins.cargos.find((x) => x.concepto === "inscripcion")!;
    const p = await m.recepcion.post<{ id: string }>("/api/pagos", { tutor_id: ins.tutorId, monto: "200.00", metodo: "efectivo", aplicaciones: [{ cargo_id: c.id, monto: "200.00" }] });
    assert.equal(p.estado, 201, JSON.stringify(p.cuerpo));
    assert.equal((await m.admin.post(`/api/pagos/${p.cuerpo.id}/cancelar`, { motivo: "Prueba" })).estado, 200);
    assert.equal((await cuadratura(m.db)).ok, true);
  } finally {
    await m.cerrar();
  }
});

test("volver a correrlo es idempotente y cambia la contraseña", async () => {
  const otra = randomBytes(18).toString("hex");
  await prepararRolDeAplicacion({ urlMigrador: urlDueno, rolAplicacion: ROL, claveAplicacion: otra });
  const u = new URL(urlApp);
  u.password = otra;
  const c = new pg.Client({ connectionString: u.toString() });
  await c.connect();
  await c.end();
  await prepararRolDeAplicacion({ urlMigrador: urlDueno, rolAplicacion: ROL, claveAplicacion: CLAVE });
  await assert.rejects(() => prepararRolDeAplicacion({ urlMigrador: urlDueno, rolAplicacion: "Rol Malo; DROP", claveAplicacion: CLAVE }), /inválido/);
  await assert.rejects(() => prepararRolDeAplicacion({ urlMigrador: urlDueno, rolAplicacion: ROL, claveAplicacion: "corta" }), /16 caracteres/);
});
