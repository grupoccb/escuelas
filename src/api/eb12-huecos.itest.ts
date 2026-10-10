// V10 / EB-12: los cuatro huecos de prueba que la auditoría de la etapa B dejó sin defender (M23, M56, M64 y N03; los demás se cerraron en B-fix). Cada prueba
// falla si se deshace la regla que protege:
//   · M23: un administrador no se desactiva a sí mismo aunque haya otro administrador (antes solo lo frenaba «debe quedar uno»).
//   · M56: la lista de usuarios pagina de forma estable cuando hay nombres repetidos (el desempate por id).
//   · M64: el log de un error interno de Prisma NO lleva su mensaje (cita los valores que mandó una persona).
//   · N03: una sucursal dada de baja deja de estar en el alcance de quien la tenía asignada.

import { after, before, mock, test } from "node:test";
import assert from "node:assert/strict";
import type { NextFunction, Request, Response } from "express";
import { conAlcance } from "../datos/alcance.ts";
import { crearPrismaDePruebas, type PrismaPruebas } from "../testutil/prisma-pruebas.ts";
import { sembrarOrganizacion, type OrganizacionDePrueba } from "../testutil/semilla.ts";
import { levantarApi, sembrarUsuario, type ApiLevantada } from "../testutil/api.ts";
import { alcanceDeSucursales } from "./alcance.ts";
import { manejadorDeErroresApi } from "./errores-http.ts";

let prisma: PrismaPruebas;
let api: ApiLevantada;
let org: OrganizacionDePrueba;

before(async () => {
  prisma = crearPrismaDePruebas();
  api = levantarApi(prisma);
  org = await sembrarOrganizacion(prisma, "Huecos EB-12");
});
after(async () => {
  await api.cerrar();
  await prisma.$disconnect();
});

test("EB-12 (M23): un administrador no puede desactivarse ni quitarse el rol AUNQUE haya otro administrador activo", async () => {
  const a1 = await sembrarUsuario(prisma, org.organizacionId, { rol: "administrador" });
  await sembrarUsuario(prisma, org.organizacionId, { rol: "administrador" });
  const c = api.cliente();
  assert.equal((await c.login(org.slug, a1.correo, a1.contrasena)).estado, 201);
  assert.equal((await c.patch(`/api/usuarios/${a1.id}`, { activo: false })).estado, 409, "desactivarse");
  assert.equal((await c.patch(`/api/usuarios/${a1.id}`, { rol: "asesor" })).estado, 409, "quitarse el rol");
  assert.equal((await prisma.usuario.findFirstOrThrow({ where: { id: a1.id } })).activo, true);
  // A otro administrador sí se le puede (queda uno).
  const otro = await prisma.usuario.findFirstOrThrow({ where: { organizacion_id: org.organizacionId, rol: "administrador", id: { not: a1.id } } });
  assert.equal((await c.patch(`/api/usuarios/${otro.id}`, { activo: false })).estado, 200);
});

test("EB-12 (M56): la lista de usuarios pagina de forma estable aunque los nombres se repitan (desempate por id): ninguna fila se repite ni se pierde entre páginas", async () => {
  const o = await sembrarOrganizacion(prisma, "Paginación estable");
  const admin = await sembrarUsuario(prisma, o.organizacionId, { rol: "administrador", nombre: "Aaa Admin" });
  for (let i = 0; i < 11; i++) await sembrarUsuario(prisma, o.organizacionId, { rol: "asesor", nombre: "Mismo Nombre" });
  const c = api.cliente();
  assert.equal((await c.login(o.slug, admin.correo, admin.contrasena)).estado, 201);
  const todos = new Set<string>();
  const orden: string[] = [];
  for (let pagina = 1; pagina <= 4; pagina++) {
    const r = await c.get<{ datos: { id: string }[] }>(`/api/usuarios?limite=3&pagina=${pagina}`);
    assert.equal(r.estado, 200);
    for (const u of r.cuerpo.datos) {
      assert.ok(!todos.has(u.id), `el usuario ${u.id} aparece dos veces`);
      todos.add(u.id);
      orden.push(u.id);
    }
  }
  assert.equal(todos.size, 12, "las 12 filas, cada una una vez");
  // Dentro de los nombres iguales, el orden es el del id.
  const iguales = orden.slice(1);
  assert.deepEqual(iguales, [...iguales].sort());
});

test("EB-12 (M64): el log de un error interno de Prisma lleva el tipo y el código, NUNCA su mensaje (que cita los valores que mandó una persona)", () => {
  const error = Object.assign(new Error("Unique constraint failed on the fields: (`correo`) con CENTINELA-VALOR-DE-UNA-PERSONA"), { name: "PrismaClientKnownRequestError", code: "P2002", clientVersion: "7.10.0" });
  const salida = mock.method(console, "error", () => undefined);
  try {
    const res = { headersSent: false, setHeader: () => undefined, status() { return this; }, json: () => undefined } as unknown as Response;
    manejadorDeErroresApi(error, { method: "POST", path: "/api/x" } as Request, res, (() => undefined) as NextFunction);
    const lineas = salida.mock.calls.map((c) => String(c.arguments[0]));
    assert.equal(lineas.length, 1);
    assert.ok(!lineas[0]!.includes("CENTINELA-VALOR-DE-UNA-PERSONA"), lineas[0]);
    assert.match(lineas[0]!, /"codigo":"P2002"/);
    assert.match(lineas[0]!, /PrismaClientKnownRequestError/);
  } finally {
    salida.mock.restore();
  }
});

test("EB-12 (N03): una sucursal dada de baja sale del alcance de quien la tenía asignada (el asesor deja de verla)", async () => {
  const o = await sembrarOrganizacion(prisma, "Alcance con baja");
  const [norte, sur] = [o.sucursales[0]!.id, o.sucursales[1]!.id];
  const asesor = await sembrarUsuario(prisma, o.organizacionId, { rol: "asesor", sucursales: [norte, sur] });
  const db = conAlcance(prisma, o.organizacionId);
  const antes = await alcanceDeSucursales(db, { id: asesor.id, rol: "asesor" });
  assert.deepEqual(antes.todas === false && [...antes.sucursalIds].sort(), [norte, sur].sort());
  await prisma.sucursal.update({ where: { id: sur }, data: { eliminado_en: new Date() } });
  const despues = await alcanceDeSucursales(db, { id: asesor.id, rol: "asesor" });
  assert.deepEqual(despues.todas === false && despues.sucursalIds, [norte], "la sucursal dada de baja ya no cuenta");
});
