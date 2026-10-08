// Catálogo de Fase 2 (N11) contra Postgres real: el seed de la primera vertical, las tres
// consultas de verificación del insumo sobre esos datos, las restricciones de la base y el cupo.
// Este archivo no nombra ninguna vertical ni sucursal (check:generico): usa lo que dicen las tablas.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import pg from "pg";
import { esViolacionUnica } from "../datos/prisma.ts";
import { crearPrismaDePruebas, type PrismaPruebas } from "../testutil/prisma-pruebas.ts";
import { conAlcance } from "../datos/alcance.ts";
import { sembrarOrganizacion } from "../testutil/semilla.ts";
import { calcularCupo, cupoPorGrupo, type FuenteOcupacion } from "./cupo.ts";
import { cargarCatalogo, choquesDeSalon, resumenDeCapacidad, traslapesDeEdad } from "./verificacion.ts";

let prisma: PrismaPruebas;
let orgId: string;

const ID_FIJO = /00000000-0000-4000-8000-000000000(\d{3})/g;

before(async () => {
  prisma = crearPrismaDePruebas();
  // Los seeds usan ids fijos; cada corrida los lleva a una organización propia.
  const prefijo = randomBytes(4).toString("hex");
  const aOrganizacionNueva = (sql: string): string => sql.replace(ID_FIJO, `${prefijo}-0000-4000-8000-000000000$1`).replaceAll("escuela-demo", `escuela-${prefijo}`);
  orgId = `${prefijo}-0000-4000-8000-000000000001`;

  const cliente = new pg.Client({ connectionString: process.env["DATABASE_URL"] });
  await cliente.connect();
  try {
    await cliente.query(aOrganizacionNueva(readFileSync("prisma/seed/demo.sql", "utf8")));
    const catalogo = aOrganizacionNueva(readFileSync("prisma/seed/catalogo.sql", "utf8"));
    await cliente.query(catalogo);
    await cliente.query(catalogo); // idempotente
  } finally {
    await cliente.end();
  }
});

after(async () => {
  await prisma.$disconnect();
});

const db = () => conAlcance(prisma, orgId);

test("el seed de la primera vertical: 6 programas, 9 grupos y 17 horarios, y correrlo dos veces no duplica", async () => {
  assert.equal(await db().programa.count(), 6);
  assert.equal(await db().grupo.count(), 9);
  assert.equal(await db().grupo_horario.count(), 17);
  // Todo cuelga de la única vertical de la demo y de sus dos sucursales.
  const c = await cargarCatalogo(db());
  assert.equal(new Set(c.programas.map((p) => p.verticalId)).size, 1);
  assert.equal(new Set(c.programas.map((p) => p.sucursalId)).size, 2);
});

test("verificación 1: ningún traslape de edad dentro de una misma vertical y sucursal", async () => {
  assert.deepEqual(traslapesDeEdad(await cargarCatalogo(db())), []);
});

test("verificación 2: resumen de capacidad por sucursal y vertical", async () => {
  const resumen = await resumenDeCapacidad(await cargarCatalogo(db()));
  assert.equal(resumen.length, 2);
  // 3 programas por sucursal; una sucursal con 6 grupos (98 lugares) y la otra con 3 (50).
  assert.deepEqual(
    resumen.map((r) => [r.programas, r.grupos, r.capacidad]).sort((a, b) => b[2]! - a[2]!),
    [[3, 6, 98], [3, 3, 50]],
  );
});

test("verificación 3: ningún choque de salón", async () => {
  assert.deepEqual(choquesDeSalon(await cargarCatalogo(db())), []);
});

test("las verificaciones sí detectan un catálogo mal armado (control negativo)", async () => {
  const o = await sembrarOrganizacion(prisma, "CatalogoMalo");
  const norte = o.sucursales[0]!;
  const sur = o.sucursales[1]!;
  const p = (nombre: string, sucursal: string, min: number, max: number) =>
    prisma.programa.create({ data: { organizacion_id: o.organizacionId, vertical_id: o.verticalId, sucursal_id: sucursal, nombre, edad_min: min, edad_max: max } });
  const a = await p("A", norte.id, 3, 6);
  const b = await p("B", norte.id, 6, 13); // traslapa con A en la edad 6
  await p("C", sur.id, 3, 6); // misma edad pero otra sucursal: no traslapa
  const g = (programa: string, nombre: string) =>
    prisma.grupo.create({ data: { organizacion_id: o.organizacionId, programa_id: programa, nombre, salon: "Salón", cupo_maximo: 10 } });
  const g1 = await g(a.id, "G1");
  const g2 = await g(b.id, "G2");
  for (const grupo of [g1, g2]) {
    await prisma.grupo_horario.create({ data: { organizacion_id: o.organizacionId, grupo_id: grupo.id, dia_semana: 2, hora_inicio_min: 960, hora_fin_min: 1020 } });
  }
  const c = await cargarCatalogo(conAlcance(prisma, o.organizacionId));
  assert.equal(traslapesDeEdad(c).length, 1);
  assert.equal(choquesDeSalon(c).length, 1);
});

test("la base rechaza rangos de edad, cupos y horarios imposibles, y duplicados del catálogo", async () => {
  const o = await sembrarOrganizacion(prisma, "CatalogoChecks");
  const org = o.organizacionId;
  const programa = await prisma.programa.create({ data: { organizacion_id: org, vertical_id: o.verticalId, sucursal_id: o.sucursales[0]!.id, nombre: "P", edad_min: 3, edad_max: 5 } });
  const grupo = await prisma.grupo.create({ data: { organizacion_id: org, programa_id: programa.id, nombre: "G", cupo_maximo: 5 } });
  const p = (nombre: string, min: number, max: number) =>
    prisma.programa.create({ data: { organizacion_id: org, vertical_id: o.verticalId, sucursal_id: o.sucursales[1]!.id, nombre, edad_min: min, edad_max: max } });
  const h = (dia: number, ini: number, fin: number) =>
    prisma.grupo_horario.create({ data: { organizacion_id: org, grupo_id: grupo.id, dia_semana: dia, hora_inicio_min: ini, hora_fin_min: fin } });

  await assert.rejects(p("edades al revés", 9, 3), /programa_edades_check/);
  await assert.rejects(p("edad fuera de rango", 3, 120), /programa_edades_check/);
  await assert.rejects(prisma.grupo.create({ data: { organizacion_id: org, programa_id: programa.id, nombre: "sin cupo", cupo_maximo: 0 } }), /grupo_cupo_check/);
  await assert.rejects(h(7, 600, 660), /grupo_horario_rango_check/);
  await assert.rejects(h(1, 660, 600), /grupo_horario_rango_check/);
  await assert.rejects(h(1, 600, 600), /grupo_horario_rango_check/);
  await assert.rejects(h(1, 600, 1500), /grupo_horario_rango_check/);

  await h(1, 600, 660);
  await assert.rejects(h(1, 600, 700), (e) => esViolacionUnica(e), "mismo grupo, día y hora de inicio");
  await assert.rejects(
    prisma.grupo.create({ data: { organizacion_id: org, programa_id: programa.id, nombre: "G", cupo_maximo: 5 } }),
    (e) => esViolacionUnica(e),
    "mismo nombre de grupo en el programa",
  );
  await assert.rejects(
    prisma.programa.create({ data: { organizacion_id: org, vertical_id: o.verticalId, sucursal_id: o.sucursales[0]!.id, nombre: "P", edad_min: 6, edad_max: 8 } }),
    (e) => esViolacionUnica(e),
    "mismo nombre de programa en la sucursal",
  );
});

test("cupo por grupo: el máximo mientras no haya inscripciones; la fuente de ocupación decide el resto", async () => {
  const grupo = await db().grupo.findFirstOrThrow({ orderBy: { cupo_maximo: "desc" } });
  const sinInscripciones = await cupoPorGrupo(db(), grupo.id);
  assert.deepEqual(sinInscripciones, { cupoMaximo: grupo.cupo_maximo, ocupados: 0, disponibles: grupo.cupo_maximo, lleno: false, oferta: "lugar" });

  const ocupando = (n: number): FuenteOcupacion => ({ ocupados: async () => n });
  const casi = await cupoPorGrupo(db(), grupo.id, ocupando(grupo.cupo_maximo - 1));
  assert.deepEqual([casi!.disponibles, casi!.lleno, casi!.oferta], [1, false, "lugar"]);
  const lleno = await cupoPorGrupo(db(), grupo.id, ocupando(grupo.cupo_maximo));
  assert.deepEqual([lleno!.disponibles, lleno!.lleno, lleno!.oferta], [0, true, "lista_de_espera"]); // el seed permite lista de espera
});

test("cupo por grupo: sin lista de espera, un grupo lleno no ofrece lugar", async () => {
  const grupo = await db().grupo.findFirstOrThrow();
  await prisma.grupo.update({ where: { id: grupo.id }, data: { permite_lista_espera: false } });
  const lleno = await cupoPorGrupo(db(), grupo.id, { ocupados: async () => grupo.cupo_maximo });
  assert.equal(lleno!.oferta, "sin_lugar");
  await prisma.grupo.update({ where: { id: grupo.id }, data: { permite_lista_espera: true } });
});

test("cupo por grupo: inexistente, inactivo, borrado o de otra organización devuelven null", async () => {
  const grupo = await db().grupo.findFirstOrThrow({ orderBy: { nombre: "asc" } });
  assert.equal(await cupoPorGrupo(db(), "00000000-0000-4000-8000-00000000ffff"), null);

  const otra = await sembrarOrganizacion(prisma, "CupoOtra");
  assert.equal(await cupoPorGrupo(conAlcance(prisma, otra.organizacionId), grupo.id), null, "otra organización no ve este grupo");

  await prisma.grupo.update({ where: { id: grupo.id }, data: { activo: false } });
  assert.equal(await cupoPorGrupo(db(), grupo.id), null);
  await prisma.grupo.update({ where: { id: grupo.id }, data: { activo: true, eliminado_en: new Date() } });
  assert.equal(await cupoPorGrupo(db(), grupo.id), null);
  await prisma.grupo.update({ where: { id: grupo.id }, data: { eliminado_en: null } });
  assert.notEqual(await cupoPorGrupo(db(), grupo.id), null);
});

test("calcularCupo coincide con la consulta de la base para todos los grupos del seed", async () => {
  for (const g of await db().grupo.findMany()) {
    const cupo = await cupoPorGrupo(db(), g.id);
    assert.deepEqual(cupo, calcularCupo(g.cupo_maximo, 0, g.permite_lista_espera));
  }
});
