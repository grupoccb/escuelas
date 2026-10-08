// Candado consultivo por (organización, clave) — EA-11. Contra Postgres real.
// Los tests de carrera usan barreras (src/testutil/carrera.ts) para forzar el choque, y se
// comprueban con la mutación (sin el candado, fallan).

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomInt } from "node:crypto";
import { crearPrismaDePruebas, type PrismaPruebas } from "../testutil/prisma-pruebas.ts";
import { sembrarOrganizacion, type OrganizacionDePrueba } from "../testutil/semilla.ts";
import { Barrera, dormir } from "../testutil/carrera.ts";
import { altaConAlcance, conAlcance, ErrorAlcance } from "./alcance.ts";
import { transaccionConBloqueo, transaccionConBloqueoDeTelefono } from "./bloqueos.ts";

let prisma: PrismaPruebas;
let A: OrganizacionDePrueba;
let B: OrganizacionDePrueba;

before(async () => {
  prisma = crearPrismaDePruebas();
  A = await sembrarOrganizacion(prisma, "Bloqueo A");
  B = await sembrarOrganizacion(prisma, "Bloqueo B");
});
after(async () => {
  await prisma.$disconnect();
});

/** Lee un contador, espera, y escribe contador+1: sin exclusión mutua se pierden actualizaciones. */
async function incrementarLento(organizacion: OrganizacionDePrueba, clave: string, filaId: string, esperaMs = 30) {
  const db = conAlcance(prisma, organizacion.organizacionId);
  await transaccionConBloqueo(db, organizacion.organizacionId, clave, async (tx) => {
    const fila = await tx.configuracion_organizacion.findFirstOrThrow({ where: { id: filaId } });
    await dormir(esperaMs);
    await tx.configuracion_organizacion.update({ where: { id: filaId }, data: { max_automaticos_por_dia: fila.max_automaticos_por_dia + 1 } });
  });
}

/** La fila de configuración de la organización (una sola, por índice único) con el contador en `valor`. */
async function filaContador(organizacion: OrganizacionDePrueba, valor: number) {
  const db = conAlcance(prisma, organizacion.organizacionId);
  const viva = await db.configuracion_organizacion.findFirst({});
  if (viva) {
    await db.configuracion_organizacion.update({ where: { id: viva.id }, data: { max_automaticos_por_dia: valor } });
    return viva.id;
  }
  return (await db.configuracion_organizacion.create({ data: altaConAlcance({ max_automaticos_por_dia: valor }) })).id;
}

test("misma clave: cinco transacciones simultáneas se turnan y no se pierde ninguna actualización", async () => {
  const id = await filaContador(A, 0);
  await Promise.all([1, 2, 3, 4, 5].map(() => incrementarLento(A, "contador", id)));
  const fila = await conAlcance(prisma, A.organizacionId).configuracion_organizacion.findFirstOrThrow({ where: { id } });
  assert.equal(fila.max_automaticos_por_dia, 5, "sin el candado se pierden incrementos (lectura-espera-escritura)");
});

test("claves distintas no se esperan; la misma clave en otra organización tampoco", async () => {
  const dbA = conAlcance(prisma, A.organizacionId);
  const dbB = conAlcance(prisma, B.organizacionId);
  const barrera = new Barrera(3);
  await Promise.all([
    transaccionConBloqueo(dbA, A.organizacionId, "uno", () => barrera.esperar(3000)),
    transaccionConBloqueo(dbA, A.organizacionId, "dos", () => barrera.esperar(3000)),
    transaccionConBloqueo(dbB, B.organizacionId, "uno", () => barrera.esperar(3000)),
  ]);
  assert.equal(barrera.completa, true, "las tres estuvieron dentro a la vez");
});

test("la misma clave sí se espera: la segunda no entra mientras la primera sigue dentro", async () => {
  const db = conAlcance(prisma, A.organizacionId);
  const barrera = new Barrera(2);
  const clave = `solo-una-${randomInt(1e9)}`;
  await Promise.all([
    transaccionConBloqueo(db, A.organizacionId, clave, () => barrera.esperar(300)),
    transaccionConBloqueo(db, A.organizacionId, clave, () => barrera.esperar(300)),
  ]);
  assert.equal(barrera.completa, false, "no coincidieron dentro: se turnaron");
});

test("el candado se suelta aunque la sección crítica falle (rollback), y otros pueden tomarlo", async () => {
  const db = conAlcance(prisma, A.organizacionId);
  await assert.rejects(transaccionConBloqueo(db, A.organizacionId, "falla", async () => { throw new Error("boom"); }), /boom/);
  assert.equal(await transaccionConBloqueo(db, A.organizacionId, "falla", async () => "libre"), "libre");
});

test("el bloqueo de teléfono usa su propia clave por teléfono", async () => {
  const db = conAlcance(prisma, A.organizacionId);
  const barrera = new Barrera(2);
  await Promise.all([
    transaccionConBloqueoDeTelefono(db, A.organizacionId, "+525511111111", () => barrera.esperar(3000)),
    transaccionConBloqueoDeTelefono(db, A.organizacionId, "+525522222222", () => barrera.esperar(3000)),
  ]);
  assert.equal(barrera.completa, true);
});

test("pedir el candado de otra organización distinta del alcance se rechaza (invariante 1)", async () => {
  const dbA = conAlcance(prisma, A.organizacionId);
  await assert.rejects(transaccionConBloqueo(dbA, B.organizacionId, "x", async () => 1), ErrorAlcance);
});

test("dentro de la transacción con candado el alcance es el mismo: solo se ve lo propio, las altas llevan la organización, no hay borrado físico ni SQL crudo", async () => {
  const idA = await filaContador(A, 7);
  const idB = await filaContador(B, 9);
  const dbA = conAlcance(prisma, A.organizacionId);
  await transaccionConBloqueo(dbA, A.organizacionId, "alcance", async (tx) => {
    // lecturas: A ve lo suyo, no lo de B, ni pidiéndolo por id
    assert.ok(await tx.configuracion_organizacion.findFirst({ where: { id: idA } }));
    assert.equal(await tx.configuracion_organizacion.findFirst({ where: { id: idB } }), null);
    assert.equal(await tx.configuracion_organizacion.findFirst({ where: { id: idB, organizacion_id: B.organizacionId } }), null);
    // escrituras: no toca a B
    assert.equal((await tx.configuracion_organizacion.updateMany({ where: { id: idB }, data: { max_automaticos_por_dia: 1 } })).count, 0);
    // altas: el alcance pone la organización y rechaza otra
    const creada = await tx.vertical.create({ data: altaConAlcance({ nombre: "Dentro del candado", slug: `dentro-${randomInt(1e9)}` }) });
    assert.equal(creada.organizacion_id, A.organizacionId);
    await assert.rejects(
      async () => tx.vertical.create({ data: { organizacion_id: B.organizacionId, nombre: "Ajena", slug: `ajena-${randomInt(1e9)}` } }),
      ErrorAlcance,
    );
    // soft delete: delete físico prohibido
    assert.throws(() => tx.vertical.delete({ where: { id: creada.id } }), ErrorAlcance);
    assert.throws(() => tx.vertical.deleteMany({ where: {} }), ErrorAlcance);
    // lo borrado con eliminado_en no se ve
    await tx.vertical.update({ where: { id: creada.id }, data: { eliminado_en: new Date() } });
    assert.equal(await tx.vertical.findFirst({ where: { id: creada.id } }), null);
    // SQL crudo: no existe
    const crudo = tx as unknown as Record<string, (...a: unknown[]) => unknown>;
    for (const metodo of ["$queryRaw", "$queryRawUnsafe", "$executeRaw", "$executeRawUnsafe"]) {
      assert.throws(() => crudo[metodo]!("SELECT 1"), ErrorAlcance, metodo);
    }
  });
  const intacta = await prisma.configuracion_organizacion.findFirstOrThrow({ where: { id: idB } });
  assert.equal(intacta.max_automaticos_por_dia, 9);
});

test("lo escrito dentro de la transacción con candado se confirma junto, o se revierte junto", async () => {
  const id = await filaContador(A, 1);
  const db = conAlcance(prisma, A.organizacionId);
  await assert.rejects(
    transaccionConBloqueo(db, A.organizacionId, "atomica", async (tx) => {
      await tx.configuracion_organizacion.update({ where: { id }, data: { max_automaticos_por_dia: 99 } });
      throw new Error("se revierte");
    }),
  );
  assert.equal((await db.configuracion_organizacion.findFirstOrThrow({ where: { id } })).max_automaticos_por_dia, 1);
  await transaccionConBloqueo(db, A.organizacionId, "atomica", (tx) => tx.configuracion_organizacion.update({ where: { id }, data: { max_automaticos_por_dia: 2 } }));
  assert.equal((await db.configuracion_organizacion.findFirstOrThrow({ where: { id } })).max_automaticos_por_dia, 2);
});
