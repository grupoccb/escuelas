// ED-03 (auditoría de la etapa D): el texto libre de la clase muestra no es para datos de salud (decisión 12), y el motivo de cancelación no va al
// registro de cambios (de solo anexar, nunca se purga). Postgres real, la app real.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { conAlcance } from "../datos/alcance.ts";
import { crearPrismaDePruebas, type PrismaPruebas } from "../testutil/prisma-pruebas.ts";
import { sembrarEmbudo, sembrarFamilia, sembrarOrganizacion, sembrarPrograma, type OrganizacionDePrueba } from "../testutil/semilla.ts";
import { levantarApi, sembrarUsuario, type ApiLevantada, type ClienteApi } from "../testutil/api.ts";

const AHORA = new Date("2026-11-02T18:00:00Z"); // lunes 2 de noviembre, 12:00 en la Ciudad de México
const MIERCOLES_4 = "2026-11-04T18:00:00-06:00";
const MIERCOLES_11 = "2026-11-11T18:00:00-06:00";

let prisma: PrismaPruebas;
let api: ApiLevantada;
let org: OrganizacionDePrueba;
let admin: ClienteApi;
let maestro: ClienteApi;
let grupoId: string;
const db = () => conAlcance(prisma, org.organizacionId);

interface Errores { error: { codigo: string; detalles?: { campo?: string; mensaje: string }[] } }
const campos = (r: { cuerpo: unknown }): string[] => ((r.cuerpo as Errores).error.detalles ?? []).map((d) => d.campo ?? "");

before(async () => {
  prisma = crearPrismaDePruebas();
  api = levantarApi(prisma, { reloj: () => AHORA });
  org = await sembrarOrganizacion(prisma, "Texto libre");
  await sembrarEmbudo(prisma, org);
  const entrar = async (rol: "administrador" | "maestro") => {
    const u = await sembrarUsuario(prisma, org.organizacionId, { rol });
    const c = api.cliente();
    assert.equal((await c.login(org.slug, u.correo, u.contrasena)).estado, 201);
    return { c, id: u.id };
  };
  admin = (await entrar("administrador")).c;
  const m = await entrar("maestro");
  maestro = m.c;
  const instructor = await prisma.instructor.create({ data: { organizacion_id: org.organizacionId, usuario_id: m.id, nombre: "Maestra" } });
  const p = await sembrarPrograma(prisma, org, { sucursalId: org.sucursales[0]!.id, nombre: "Programa", edadMin: 3, edadMax: 12, grupos: [{ nombre: "Grupo", cupoMaximo: 30, horarios: [[3, 1080, 1140]] }] });
  grupoId = p.grupos[0]!.id;
  await prisma.grupo.update({ where: { id: grupoId }, data: { instructor_id: instructor.id } });
});
after(async () => {
  await api.cerrar();
  await prisma.$disconnect();
});

async function agenda(notas?: string): Promise<{ estado: number; cuerpo: { id: string } }> {
  const f = await sembrarFamilia(prisma, org, { sucursalId: org.sucursales[0]!.id });
  return admin.post<{ id: string }>("/api/clases-muestra", { prospecto_id: f.prospectoId, grupo_id: grupoId, fecha_hora: MIERCOLES_4, ...(notas ? { notas } : {}) });
}

test("ED-03: las notas de la clase y el motivo de cancelación rechazan lo evidente de salud (400, no se guarda) y aceptan texto normal", async () => {
  for (const mala of ["toma medicamentos para el asma", "Alergia a la penicilina", "tiene diabetes", "viene de una lesión de rodilla"]) {
    const antes = await db().clase_muestra.count();
    const r = await agenda(mala);
    assert.equal(r.estado, 400, mala);
    assert.deepEqual(campos(r), ["notas"]);
    assert.equal(await db().clase_muestra.count(), antes, "no se agendó nada");
  }
  const buena = await agenda("Prefiere los sábados");
  assert.equal(buena.estado, 201);

  const reprog = await admin.post(`/api/clases-muestra/${buena.cuerpo.id}/reprogramar`, { fecha_hora: MIERCOLES_11, notas: "su asma no la deja correr" });
  assert.equal(reprog.estado, 400);
  assert.deepEqual(campos(reprog), ["notas"]);
  assert.equal((await db().clase_muestra.findFirstOrThrow({ where: { id: buena.cuerpo.id } })).estatus, "agendada", "la clase sigue como estaba");

  const cancelarMal = await admin.post(`/api/clases-muestra/${buena.cuerpo.id}/cancelar`, { motivo: "tiene alergia y está enfermo" });
  assert.equal(cancelarMal.estado, 400);
  assert.deepEqual(campos(cancelarMal), ["motivo"]);
  assert.equal((await db().clase_muestra.findFirstOrThrow({ where: { id: buena.cuerpo.id } })).estatus, "agendada");

  const cancelarBien = await admin.post<{ motivo_cancelacion: string }>(`/api/clases-muestra/${buena.cuerpo.id}/cancelar`, { motivo: "Se mudó de ciudad" });
  assert.equal(cancelarBien.estado, 200);
  assert.equal(cancelarBien.cuerpo.motivo_cancelacion, "Se mudó de ciudad", "el motivo vive en la clase");
});

test("ED-03: el motivo de cancelación NO queda en el registro de cambios (de solo anexar, no se purga)", async () => {
  const c = await agenda();
  assert.equal(c.estado, 201);
  assert.equal((await admin.post(`/api/clases-muestra/${c.cuerpo.id}/cancelar`, { motivo: "Viaje de la familia" })).estado, 200);
  const filas = await db().registro_cambio.findMany({ where: { entidad_tipo: "clase_muestra", entidad_id: c.cuerpo.id }, select: { antes: true, despues: true } });
  assert.ok(filas.length >= 2, "sí hay entradas (crear y cancelar)");
  assert.equal(JSON.stringify(filas).includes("Viaje de la familia"), false);
  assert.equal(JSON.stringify(filas).includes("motivo_cancelacion"), false);
  assert.ok(filas.some((f) => (f.despues as { estatus?: string } | null)?.estatus === "cancelada"), "el cambio de estatus sí se registra");
});

test("ED-03: en el registro, los textos narrativos (dónde practicó, nivel, detalle del motivo) rechazan lo evidente de salud y no guardan nada", async () => {
  const c = await agenda();
  const url = `/api/clases-muestra/${c.cuerpo.id}/registro`;
  const casos: [string, Record<string, unknown>][] = [
    ["antecedentes.practico_donde", { practico_antes: true, practico_donde: "dejó el deporte por una lesión de rodilla" }],
    ["antecedentes.practico_nivel", { practico_antes: true, practico_nivel: "toma medicamentos" }],
    ["antecedentes.motivo_clase_detalle", { motivo_clase: "otro", motivo_clase_detalle: "su médico lo recomendó por la epilepsia" }],
  ];
  for (const [campo, antecedentes] of casos) {
    const r = await maestro.patch(url, { antecedentes });
    assert.equal(r.estado, 400, campo);
    assert.deepEqual(campos(r), [campo]);
  }
  assert.equal(await db().registro_clase_muestra.count({ where: { clase_muestra_id: c.cuerpo.id } }), 0, "no se creó ningún registro");

  const bien = await maestro.patch<{ antecedentes: { practico_donde: string; motivo_clase_detalle: string } }>(url, { antecedentes: { practico_antes: true, practico_donde: "Club del barrio", practico_nivel: "principiante", motivo_clase: "otro", motivo_clase_detalle: "Se lo recomendó una amiga" } });
  assert.equal(bien.estado, 200);
  assert.equal(bien.cuerpo.antecedentes.practico_donde, "Club del barrio");
});
