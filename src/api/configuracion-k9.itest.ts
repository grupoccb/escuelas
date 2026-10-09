// K9: EK-A5 (primer cambio de configuración simultáneo). Postgres real, la app real.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { crearPrismaDePruebas, type PrismaPruebas } from "../testutil/prisma-pruebas.ts";
import { sembrarOrganizacion, type OrganizacionDePrueba } from "../testutil/semilla.ts";
import { levantarApi, sembrarUsuario, type ApiLevantada, type ClienteApi } from "../testutil/api.ts";

let prisma: PrismaPruebas;
let api: ApiLevantada;

const entrar = async (o: OrganizacionDePrueba): Promise<ClienteApi> => {
  const u = await sembrarUsuario(prisma, o.organizacionId, { rol: "administrador" });
  const c = api.cliente();
  assert.equal((await c.login(o.slug, u.correo, u.contrasena)).estado, 201);
  return c;
};
before(async () => {
  prisma = crearPrismaDePruebas();
  api = levantarApi(prisma);
});
after(async () => {
  await api.cerrar();
  await prisma.$disconnect();
});


test("EK-A5: los primeros cambios de configuración simultáneos de una organización sin fila no dan 500 y dejan una sola fila", async () => {
  for (let i = 0; i < 4; i++) {
    const o = await sembrarOrganizacion(prisma, "Config K9");
    const [x, y] = [await entrar(o), await entrar(o)];
    const rs = await Promise.all([x.patch("/api/configuracion", { umbral_dias_deuda: 10 }), y.patch("/api/configuracion", { umbral_faltas_consecutivas: 4 })]);
    assert.deepEqual(rs.map((q) => q.estado), [200, 200]);
    assert.equal(await prisma.configuracion_organizacion.count({ where: { organizacion_id: o.organizacionId, eliminado_en: null } }), 1);
  }
});
