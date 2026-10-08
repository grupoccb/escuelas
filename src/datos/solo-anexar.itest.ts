// EB-08: el registro de cambios y el de accesos a salud son de solo anexar en la BASE: ni UPDATE, ni
// DELETE, ni TRUNCATE (ni directo ni en cascada desde otra tabla). Postgres real.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { crearPrismaDePruebas, type PrismaPruebas } from "../testutil/prisma-pruebas.ts";
import { sembrarOrganizacion } from "../testutil/semilla.ts";
import { sembrarUsuario } from "../testutil/api.ts";

let prisma: PrismaPruebas;
before(() => {
  prisma = crearPrismaDePruebas();
});
after(async () => {
  await prisma.$disconnect();
});

test("registro_cambio y acceso_dato_sensible rechazan UPDATE, DELETE y TRUNCATE (también en cascada); las filas siguen ahí", async () => {
  const org = await sembrarOrganizacion(prisma, "SoloAnexar");
  const u = await sembrarUsuario(prisma, org.organizacionId, { rol: "administrador" });
  const cambio = await prisma.registro_cambio.create({ data: { organizacion_id: org.organizacionId, usuario_id: u.id, entidad_tipo: "usuario", entidad_id: u.id, accion: "crear" } });
  const acceso = await prisma.acceso_dato_sensible.create({
    data: { organizacion_id: org.organizacionId, usuario_id: u.id, sujeto_tipo: "prospecto", sujeto_id: u.id, accion: "leer", resultado: "permitido", campos: [] },
  });

  await assert.rejects(prisma.registro_cambio.update({ where: { id: cambio.id }, data: { accion: "x" } }), /de solo anexar/);
  await assert.rejects(prisma.acceso_dato_sensible.update({ where: { id: acceso.id }, data: { resultado: "denegado" } }), /de solo anexar/);
  await assert.rejects(prisma.registro_cambio.delete({ where: { id: cambio.id } }), /de solo anexar/);
  await assert.rejects(prisma.acceso_dato_sensible.delete({ where: { id: acceso.id } }), /de solo anexar/);
  // Cada TRUNCATE va en una transacción que SIEMPRE se revierte (si el disparador faltara, no se pierde nada).
  const ensayo = (sql: string) =>
    prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(sql);
      throw new Error("EL TRUNCATE SE EJECUTÓ");
    });
  await assert.rejects(ensayo(`TRUNCATE TABLE "registro_cambio"`), /de solo anexar/);
  await assert.rejects(ensayo(`TRUNCATE TABLE "acceso_dato_sensible"`), /de solo anexar/);
  // En cascada desde las tablas de las que cuelgan.
  await assert.rejects(ensayo(`TRUNCATE TABLE "usuario" CASCADE`), /de solo anexar/);
  await assert.rejects(ensayo(`TRUNCATE TABLE "organizacion" CASCADE`), /de solo anexar/);

  assert.equal(await prisma.registro_cambio.count({ where: { id: cambio.id } }), 1);
  assert.equal(await prisma.acceso_dato_sensible.count({ where: { id: acceso.id } }), 1);
  assert.equal(await prisma.usuario.count({ where: { id: u.id } }), 1, "el TRUNCATE en cascada tampoco vació lo demás");
});
