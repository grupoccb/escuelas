// K9: EK-A3 (baja con referencias) y EK-A4 (carreras de «se imparte aquí»).  Postgres real, la app real.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { crearPrismaDePruebas, type PrismaPruebas } from "../testutil/prisma-pruebas.ts";
import { sembrarOrganizacion, type OrganizacionDePrueba } from "../testutil/semilla.ts";
import { levantarApi, sembrarUsuario, type ApiLevantada, type ClienteApi } from "../testutil/api.ts";

let prisma: PrismaPruebas;
let api: ApiLevantada;
let org: OrganizacionDePrueba;
let admin: ClienteApi;
let admin2: ClienteApi;

const entrar = async (o: OrganizacionDePrueba): Promise<ClienteApi> => {
  const u = await sembrarUsuario(prisma, o.organizacionId, { rol: "administrador" });
  const c = api.cliente();
  assert.equal((await c.login(o.slug, u.correo, u.contrasena)).estado, 201);
  return c;
};
before(async () => {
  prisma = crearPrismaDePruebas();
  api = levantarApi(prisma);
  org = await sembrarOrganizacion(prisma, "Administración K9");
  admin = await entrar(org);
  admin2 = await entrar(org);
});
after(async () => {
  await api.cerrar();
  await prisma.$disconnect();
});

interface Plantilla { id: string; clase_mensaje: string }
const plantilla = async (codigo: string, clase: "servicio" | "marketing", extra: Record<string, unknown> = {}): Promise<Plantilla> => {
  const r = await admin.post<Plantilla>("/api/plantillas", { codigo, content_sid: `HX${codigo}`, categoria: "utility", clase_mensaje: clase, ...extra });
  assert.equal(r.estado, 201, JSON.stringify(r.cuerpo));
  return r.cuerpo;
};
const automatizacion = (evento: "lead_frio" | "cargo_vencido" | "clase_muestra_proxima", plantillaId: string | null, extra: Record<string, unknown> = {}) =>
  prisma.automatizacion.create({ data: { organizacion_id: org.organizacionId, nombre: `Aviso ${evento} ${Math.random()}`, evento_disparador: evento, offset_minutos: evento === "clase_muestra_proxima" ? -60 : 60, plantilla_id: plantillaId, max_intentos: 1, ...extra } });

test("EK-A3: no se da de baja lo que aún tiene referencias (automatizaciones, instructores, prospectos, cotizaciones)", async () => {
  const s = (await admin.post<{ id: string }>("/api/sucursales", { nombre: "Con referencias", zona_horaria: "UTC" })).cuerpo;
  const p = await plantilla("ref", "servicio");
  await automatizacion("cargo_vencido", p.id, { sucursal_id: s.id });
  const r = await admin.delete<{ error: { mensaje: string } }>(`/api/sucursales/${s.id}`);
  assert.equal(r.estado, 409);
  assert.match(r.cuerpo.error.mensaje, /automatizaciones/);
  const inst = await prisma.instructor.create({ data: { organizacion_id: org.organizacionId, nombre: "Inst K9" } });
  const s2 = (await admin.post<{ id: string }>("/api/sucursales", { nombre: "Con instructor", zona_horaria: "UTC" })).cuerpo;
  await prisma.instructor_sucursal.create({ data: { organizacion_id: org.organizacionId, instructor_id: inst.id, sucursal_id: s2.id } });
  assert.equal((await admin.delete(`/api/sucursales/${s2.id}`)).estado, 409);

  const v = (await admin.post<{ id: string }>("/api/verticales", { nombre: "Con prospecto" })).cuerpo;
  const lead = await prisma.lead.create({ data: { organizacion_id: org.organizacionId, vertical_interes_id: org.verticalId, etapa_id: org.etapaInicialId } });
  await prisma.prospecto.create({ data: { organizacion_id: org.organizacionId, lead_id: lead.id, vertical_interes_id: v.id } });
  const rv = await admin.delete<{ error: { mensaje: string } }>(`/api/verticales/${v.id}`);
  assert.equal(rv.estado, 409);
  assert.match(rv.cuerpo.error.mensaje, /prospectos/);

  const prog = (await admin.post<{ id: string }>("/api/programas", { vertical_id: org.verticalId, sucursal_id: org.sucursales[0]!.id, nombre: "Con sugerencia", edad_min: 1, edad_max: 3 })).cuerpo;
  const lead2 = await prisma.lead.create({ data: { organizacion_id: org.organizacionId, vertical_interes_id: org.verticalId, etapa_id: org.etapaInicialId } });
  await prisma.prospecto.create({ data: { organizacion_id: org.organizacionId, lead_id: lead2.id, vertical_interes_id: org.verticalId, programa_sugerido_id: prog.id } });
  assert.equal((await admin.delete(`/api/programas/${prog.id}`)).estado, 409);
  // Sin referencias sí se da de baja.
  const libre = (await admin.post<{ id: string }>("/api/sucursales", { nombre: "Libre", zona_horaria: "UTC" })).cuerpo;
  assert.equal((await admin.delete(`/api/sucursales/${libre.id}`)).estado, 204);
});

test("EK-A4: crear un programa y quitar «se imparte aquí» a la vez nunca deja un programa vivo sin su relación; ni una vertical dada de baja con una relación viva", async () => {
  const v = (await admin.post<{ id: string }>("/api/verticales", { nombre: "Carrera A4" })).cuerpo;
  const s = (await admin.post<{ id: string }>("/api/sucursales", { nombre: "Carrera A4 S", zona_horaria: "UTC" })).cuerpo;
  for (let i = 0; i < 10; i++) {
    assert.equal((await admin.put(`/api/sucursales/${s.id}/verticales/${v.id}`, {})).estado, 200);
    await Promise.all([
      admin.post("/api/programas", { vertical_id: v.id, sucursal_id: s.id, nombre: `P${i}`, edad_min: 5, edad_max: 9 }),
      admin2.delete(`/api/sucursales/${s.id}/verticales/${v.id}`),
    ]);
    const rel = await prisma.sucursal_vertical.count({ where: { sucursal_id: s.id, vertical_id: v.id, eliminado_en: null } });
    const progs = await prisma.programa.count({ where: { sucursal_id: s.id, vertical_id: v.id, eliminado_en: null } });
    assert.ok(rel > 0 || progs === 0, `iteración ${i}: ${progs} programa(s) vivo(s) sin la relación`);
    await prisma.programa.updateMany({ where: { sucursal_id: s.id }, data: { eliminado_en: new Date() } });
  }
  for (let i = 0; i < 8; i++) {
    const vv = (await admin.post<{ id: string }>("/api/verticales", { nombre: `Carrera A4 V${i}` })).cuerpo;
    await Promise.all([admin.put(`/api/sucursales/${s.id}/verticales/${vv.id}`, {}), admin2.delete(`/api/verticales/${vv.id}`)]);
    const viva = await prisma.vertical.count({ where: { id: vv.id, eliminado_en: null } });
    const rel = await prisma.sucursal_vertical.count({ where: { vertical_id: vv.id, eliminado_en: null } });
    assert.ok(viva > 0 || rel === 0, `iteración ${i}: vertical dada de baja con ${rel} relación(es) viva(s)`);
  }
});
