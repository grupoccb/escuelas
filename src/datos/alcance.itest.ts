// Test de no-fuga entre dos organizaciones (invariante 1) y guarda de soft delete (invariante 3).

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { crearPrisma, type PrismaClient } from "./prisma.ts";
import { altaConAlcance, conAlcance, ErrorAlcance } from "./alcance.ts";
import { sembrarOrganizacion, type OrganizacionDePrueba } from "../testutil/semilla.ts";

let prisma: PrismaClient;
let A: OrganizacionDePrueba;
let B: OrganizacionDePrueba;
let leadA: string;
let leadB: string;

before(async () => {
  prisma = crearPrisma();
  A = await sembrarOrganizacion(prisma, "A");
  B = await sembrarOrganizacion(prisma, "B");
  leadA = (await conAlcance(prisma, A.organizacionId).lead.create({
    data: altaConAlcance({ vertical_interes_id: A.verticalId, etapa_id: A.etapaInicialId, telefono: "+525511111111" }),
  })).id;
  leadB = (await conAlcance(prisma, B.organizacionId).lead.create({
    data: altaConAlcance({ vertical_interes_id: B.verticalId, etapa_id: B.etapaInicialId, telefono: "+525522222222" }),
  })).id;
});

after(async () => {
  await prisma.$disconnect();
});

test("lecturas: A solo ve lo suyo", async () => {
  const dbA = conAlcance(prisma, A.organizacionId);
  const leads = await dbA.lead.findMany();
  assert.deepEqual(leads.map((l) => l.id), [leadA]);
  assert.equal(await dbA.lead.findUnique({ where: { id: leadB } }), null);
  assert.equal(await dbA.lead.findFirst({ where: { telefono: "+525522222222" } }), null);
  assert.equal(await dbA.lead.count(), 1);
  assert.deepEqual((await dbA.organizacion.findMany()).map((o) => o.id), [A.organizacionId]);
  assert.deepEqual((await dbA.sucursal.findMany()).map((s) => s.id).sort(), A.sucursales.map((s) => s.id).sort());
});

test("lecturas: ni pidiendo otra organización en el where se cruza", async () => {
  const dbA = conAlcance(prisma, A.organizacionId);
  const leads = await dbA.lead.findMany({ where: { organizacion_id: B.organizacionId } });
  assert.deepEqual(leads.map((l) => l.id), [leadA]);
});

test("escrituras: A no puede modificar lo de B", async () => {
  const dbA = conAlcance(prisma, A.organizacionId);
  await assert.rejects(dbA.lead.update({ where: { id: leadB }, data: { ctwa_clid: "intruso" } }));
  const masivo = await dbA.lead.updateMany({ data: { nombre_contacto: "solo A" } });
  assert.equal(masivo.count, 1);
  const enB = await prisma.lead.findUniqueOrThrow({ where: { id: leadB } });
  assert.equal(enB.ctwa_clid, null);
  assert.equal(enB.nombre_contacto, null);
});

test("altas: el scope pone la organización y rechaza otra", async () => {
  const dbA = conAlcance(prisma, A.organizacionId);
  const nuevo = await dbA.lead.create({ data: altaConAlcance({ vertical_interes_id: A.verticalId, etapa_id: A.etapaInicialId, telefono: "+525533333333" }) });
  assert.equal(nuevo.organizacion_id, A.organizacionId);
  await assert.rejects(
    dbA.lead.create({ data: { organizacion_id: B.organizacionId, vertical_interes_id: B.verticalId, etapa_id: B.etapaInicialId, telefono: "+525544444444" } }),
    ErrorAlcance,
  );
  await assert.rejects(dbA.organizacion.create({ data: { nombre: "nueva" } }), ErrorAlcance);
});

test("transacciones: el scope aplica también dentro", async () => {
  const dbA = conAlcance(prisma, A.organizacionId);
  const ids = await dbA.$transaction(async (tx) => (await tx.lead.findMany({ where: { id: { in: [leadA, leadB] } } })).map((l) => l.id));
  assert.deepEqual(ids, [leadA]);
});

test("soft delete: delete y deleteMany están prohibidos y lo borrado no se ve", async () => {
  const dbA = conAlcance(prisma, A.organizacionId);
  await assert.rejects(dbA.lead.delete({ where: { id: leadA } }), ErrorAlcance);
  await assert.rejects(dbA.lead.deleteMany({}), ErrorAlcance);

  const temporal = await dbA.lead.create({ data: altaConAlcance({ vertical_interes_id: A.verticalId, etapa_id: A.etapaInicialId, telefono: "+525555555555" }) });
  await dbA.lead.update({ where: { id: temporal.id }, data: { eliminado_en: new Date() } });
  assert.equal(await dbA.lead.findUnique({ where: { id: temporal.id } }), null);
  // La fila sigue en la base.
  assert.ok(await prisma.lead.findUnique({ where: { id: temporal.id } }));
});

test("índice parcial: un lead borrado no bloquea dar de alta el mismo teléfono", async () => {
  const dbA = conAlcance(prisma, A.organizacionId);
  const tel = "+525566666666";
  const primero = await dbA.lead.create({ data: altaConAlcance({ vertical_interes_id: A.verticalId, etapa_id: A.etapaInicialId, telefono: tel }) });
  await assert.rejects(dbA.lead.create({ data: altaConAlcance({ vertical_interes_id: A.verticalId, etapa_id: A.etapaInicialId, telefono: tel }) }));
  await dbA.lead.update({ where: { id: primero.id }, data: { eliminado_en: new Date() } });
  await dbA.lead.create({ data: altaConAlcance({ vertical_interes_id: A.verticalId, etapa_id: A.etapaInicialId, telefono: tel }) });
});

test("la base rechaza un teléfono que no está normalizado", async () => {
  const dbA = conAlcance(prisma, A.organizacionId);
  for (const malo of ["+5215577777777", "5577777777", "whatsapp:+525577777777"]) {
    await assert.rejects(dbA.lead.create({ data: altaConAlcance({ vertical_interes_id: A.verticalId, etapa_id: A.etapaInicialId, telefono: malo }) }), malo);
  }
});

test("el cliente con alcance no ofrece SQL crudo, ni fuera ni dentro de una transacción (F1-14)", async () => {
  const dbA = conAlcance(prisma, A.organizacionId);
  // En el tipo: no existe.
  // @ts-expect-error BaseDatos no ofrece $queryRaw
  void dbA.$queryRaw;
  // En ejecución: si alguien lo fuerza con un cast, lanza en vez de ver todas las organizaciones.
  const crudo = dbA as unknown as Record<string, (...args: unknown[]) => unknown>;
  for (const metodo of ["$queryRaw", "$queryRawUnsafe", "$executeRaw", "$executeRawUnsafe"]) {
    assert.throws(() => crudo[metodo]!("SELECT 1"), ErrorAlcance, metodo);
  }
  await dbA.$transaction(async (tx) => {
    const dentro = tx as unknown as Record<string, (...args: unknown[]) => unknown>;
    assert.throws(() => dentro["$queryRaw"]!("SELECT count(*) FROM lead"), ErrorAlcance);
  });
});
