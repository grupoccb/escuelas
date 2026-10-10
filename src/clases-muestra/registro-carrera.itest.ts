// V10 / ED-16: guardar el registro de una clase muestra justo cuando otra persona la reprograma no deja un registro huérfano en la clase vieja.
// `guardarRegistro` leía la clase ANTES de abrir su transacción: si en ese hueco la clase pasaba a «reagendada», el registro se creaba igual en la clase que ya no
// está vigente (y la familia seguía sin registro en la nueva). Ahora la transacción toma el lead (orden de la casa: lead → clase) y vuelve a leer la clase.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { conAlcance } from "../datos/alcance.ts";
import { crearPrismaDePruebas, type PrismaPruebas } from "../testutil/prisma-pruebas.ts";
import { conGanchos } from "../testutil/carrera.ts";
import { sembrarEmbudo, sembrarFamilia, sembrarOrganizacion, sembrarPrograma, type OrganizacionDePrueba } from "../testutil/semilla.ts";
import { levantarApi, sembrarUsuario, type ApiLevantada, type ClienteApi } from "../testutil/api.ts";

const AHORA = new Date("2026-11-02T18:00:00Z"); // lunes 2 de noviembre, 12:00 en la Ciudad de México
const LUNES_9 = new Date("2026-11-09T22:00:00Z"); // 16:00 locales: la clase de la familia
const LUNES_16 = "2026-11-16T16:00:00-06:00"; // la sesión a la que la reprograman

let prisma: PrismaPruebas;
let api: ApiLevantada;
let org: OrganizacionDePrueba;
let admin: ClienteApi;
let otroAdmin: ClienteApi;
let adminId = "";
let grupoId = "";
/** Lo que corre justo después de que el registro lee lo que ya existía y antes de que abra su transacción. */
let alLeerElRegistro: (() => Promise<void>) | null = null;

before(async () => {
  prisma = crearPrismaDePruebas();
  const raiz = conGanchos(prisma, {
    modelo: "registro_clase_muestra",
    operacion: "findFirst",
    despues: async () => {
      const f = alLeerElRegistro;
      alLeerElRegistro = null;
      if (f) await f();
    },
  });
  api = levantarApi(raiz, { reloj: () => AHORA });
  org = await sembrarOrganizacion(prisma, "Registro carrera");
  await sembrarEmbudo(prisma, org);
  const entrar = async (): Promise<{ c: ClienteApi; id: string }> => {
    const u = await sembrarUsuario(prisma, org.organizacionId, { rol: "administrador" });
    const c = api.cliente();
    assert.equal((await c.login(org.slug, u.correo, u.contrasena)).estado, 201);
    return { c, id: u.id };
  };
  const a = await entrar();
  admin = a.c;
  adminId = a.id;
  otroAdmin = (await entrar()).c;
  const p = await sembrarPrograma(prisma, org, { sucursalId: org.sucursales[0]!.id, nombre: "Programa R", edadMin: 3, edadMax: 14, grupos: [{ nombre: "Grupo R", cupoMaximo: 20, horarios: [[1, 960, 1020]] }] });
  grupoId = p.grupos[0]!.id;
});

after(async () => {
  await api.cerrar();
  await prisma.$disconnect();
});

test("ED-16: si la clase se reprograma entre la lectura y la escritura del registro, el registro NO se crea en la clase vieja (409) y la nueva queda limpia", async () => {
  const f = await sembrarFamilia(prisma, org, { sucursalId: org.sucursales[0]!.id });
  const vieja = await prisma.clase_muestra.create({
    data: { organizacion_id: org.organizacionId, lead_id: f.leadId, prospecto_id: f.prospectoId, grupo_id: grupoId, fecha_hora: LUNES_9, agendada_por: "usuario", agendada_por_usuario_id: adminId },
  });
  let nuevaId = "";
  alLeerElRegistro = async () => {
    const r = await otroAdmin.post<{ id: string }>(`/api/clases-muestra/${vieja.id}/reprogramar`, { fecha_hora: LUNES_16 });
    assert.equal(r.estado, 201, JSON.stringify(r.cuerpo));
    nuevaId = r.cuerpo.id;
  };
  const r = await admin.patch<{ error?: { codigo: string; mensaje: string } }>(`/api/clases-muestra/${vieja.id}/registro`, { alumno: { nombre: "Mateo" } });
  assert.ok(nuevaId, "la reprogramación sí ocurrió en el hueco");
  assert.equal(r.estado, 409, JSON.stringify(r.cuerpo));
  assert.match(r.cuerpo.error?.mensaje ?? "", /ya no está vigente/);
  const db = conAlcance(prisma, org.organizacionId);
  assert.equal(await db.registro_clase_muestra.count({ where: { clase_muestra_id: vieja.id } }), 0, "nada quedó colgado de la clase reagendada");
  assert.equal((await db.clase_muestra.findFirstOrThrow({ where: { id: vieja.id } })).estatus, "reagendada");
  // Reintentar contra la clase NUEVA sí funciona.
  const bien = await admin.patch<{ existe: boolean }>(`/api/clases-muestra/${nuevaId}/registro`, { alumno: { nombre: "Mateo" } });
  assert.equal(bien.estado, 200, JSON.stringify(bien.cuerpo));
  assert.equal(await db.registro_clase_muestra.count({ where: { clase_muestra_id: nuevaId } }), 1);
});
