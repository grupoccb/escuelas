// V7 (recorrido del asesor): lo que la API ganó al ver trabajar a un asesor.
//  - `PATCH /api/leads/:id {sucursal_interes_id}`: un lead sin sucursal (el bot a medias, una landing sin sucursal) no se podía cotizar y la pantalla decía «pídele que la elija» sin dar
//    cómo. Solo se PONE (no se cambia), solo en las sucursales que ve quien la pone, solo si la sucursal da la disciplina del lead, queda en el registro de cambios y no se pisa entre
//    dos personas.
//  - `GET /api/tareas` dice de qué familia es cada tarea (nombre y teléfono de contacto del lead).
// Postgres real, la app real.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { crearPrismaDePruebas, type PrismaPruebas } from "../testutil/prisma-pruebas.ts";
import { sembrarEmbudo, sembrarFamilia, sembrarOrganizacion } from "../testutil/semilla.ts";
import { levantarApi, sembrarUsuario, type ClienteApi } from "../testutil/api.ts";

let prisma: PrismaPruebas;
before(() => {
  prisma = crearPrismaDePruebas();
});
after(async () => {
  await prisma.$disconnect();
});

async function escenario() {
  const org = await sembrarOrganizacion(prisma, "V7 asesor");
  await sembrarEmbudo(prisma, org);
  const api = levantarApi(prisma);
  const entrar = async (rol: "administrador" | "asesor" | "maestro" | "recepcion", sucursales: string[] = [], o = org): Promise<ClienteApi> => {
    const u = await sembrarUsuario(prisma, o.organizacionId, { rol, sucursales });
    const c = api.cliente();
    assert.equal((await c.login(o.slug, u.correo, u.contrasena)).estado, 201);
    return c;
  };
  return { org, api, entrar, norte: org.sucursales[0]!.id, sur: org.sucursales[1]!.id };
}

const ponerSucursal = (c: ClienteApi, leadId: string, sucursalId: string) => c.patch<{ id: string; sucursal: { id: string; nombre: string } }>(`/api/leads/${leadId}`, { sucursal_interes_id: sucursalId });

test("un asesor le pone sucursal a un lead que no la tiene: queda en la ficha, en el registro de cambios y el lead pasa a ser de esa sucursal", async () => {
  const e = await escenario();
  try {
    const asesor = await e.entrar("asesor", [e.norte]);
    const otro = await e.entrar("asesor", [e.sur]);
    const { leadId } = await sembrarFamilia(prisma, e.org, { sucursalId: null });
    assert.equal(((await asesor.get<{ sucursal: unknown }>(`/api/leads/${leadId}`)).cuerpo).sucursal, null);

    const r = await ponerSucursal(asesor, leadId, e.norte);
    assert.equal(r.estado, 200);
    assert.deepEqual(r.cuerpo, { id: leadId, sucursal: { id: e.norte, nombre: "Norte" } });
    assert.deepEqual((await asesor.get<{ sucursal: unknown }>(`/api/leads/${leadId}`)).cuerpo.sucursal, { id: e.norte, nombre: "Norte" });
    // Ahora es de Norte: el asesor del Sur ya no lo ve (decisión 5 de V2).
    assert.equal((await otro.get(`/api/leads/${leadId}`)).estado, 404);

    const admin = await e.entrar("administrador");
    const registro = (await admin.get<{ datos: { accion: string; antes: unknown; despues: unknown }[] }>(`/api/registro-cambios?entidad_tipo=lead&entidad_id=${leadId}`)).cuerpo.datos;
    assert.equal(registro.length, 1);
    assert.equal(registro[0]!.accion, "actualizar");
    assert.deepEqual(registro[0]!.antes, { sucursal_interes_id: null });
    assert.deepEqual(registro[0]!.despues, { sucursal_interes_id: e.norte });

    // Repetir lo mismo no cambia nada ni falla (un doble clic, un reintento) y no deja otro registro.
    assert.equal((await ponerSucursal(asesor, leadId, e.norte)).estado, 200);
    assert.equal((await admin.get<{ datos: unknown[] }>(`/api/registro-cambios?entidad_tipo=lead&entidad_id=${leadId}`)).cuerpo.datos.length, 1);
  } finally {
    await e.api.cerrar();
  }
});

test("solo se pone, no se cambia: un lead que ya tiene sucursal responde 409 con qué hacer (también para el administrador)", async () => {
  const e = await escenario();
  try {
    const asesor = await e.entrar("asesor", [e.norte, e.sur]);
    const admin = await e.entrar("administrador");
    const { leadId } = await sembrarFamilia(prisma, e.org, { sucursalId: e.norte });
    for (const c of [asesor, admin]) {
      const r = await ponerSucursal(c, leadId, e.sur);
      assert.equal(r.estado, 409);
      assert.match(JSON.stringify(r.cuerpo), /ya tiene sucursal/);
    }
    assert.equal((await prisma.lead.findFirstOrThrow({ where: { id: leadId } })).sucursal_interes_id, e.norte);
  } finally {
    await e.api.cerrar();
  }
});

test("alcance y reglas: una sucursal que no ve, una que no da la disciplina, una de otra organización y un lead ajeno; recepción y maestro no escriben", async () => {
  const e = await escenario();
  const ajena = await escenario();
  try {
    const asesorNorte = await e.entrar("asesor", [e.norte]);
    const { leadId } = await sembrarFamilia(prisma, e.org, { sucursalId: null });
    // Una sucursal que el asesor no ve: 404 (no se confirma que exista).
    assert.equal((await ponerSucursal(asesorNorte, leadId, e.sur)).estado, 404);
    // Una sucursal de otra organización: para el scope no existe (400, igual que un identificador inventado), y el lead no cambia.
    const admin = await e.entrar("administrador");
    assert.equal((await ponerSucursal(admin, leadId, ajena.norte)).estado, 400);
    // Una sucursal que no da la disciplina del lead: 400 con el motivo.
    await prisma.sucursal_vertical.updateMany({ where: { sucursal_id: e.sur }, data: { activo: false } });
    const sinDisciplina = await ponerSucursal(admin, leadId, e.sur);
    assert.equal(sinDisciplina.estado, 400);
    assert.match(JSON.stringify(sinDisciplina.cuerpo), /no da la disciplina/);
    // Una sucursal dada de baja o inactiva no se acepta.
    await prisma.sucursal_vertical.updateMany({ where: { sucursal_id: e.sur }, data: { activo: true } });
    await prisma.sucursal.update({ where: { id: e.sur }, data: { activo: false } });
    assert.equal((await ponerSucursal(admin, leadId, e.sur)).estado, 400);
    await prisma.sucursal.update({ where: { id: e.sur }, data: { activo: true } });
    // Un identificador mal escrito y un cuerpo vacío son 400.
    assert.equal((await asesorNorte.patch(`/api/leads/${leadId}`, { sucursal_interes_id: "no-es-uuid" })).estado, 400);
    assert.equal((await asesorNorte.patch(`/api/leads/${leadId}`, {})).estado, 400);
    // Un lead de otra organización: 404.
    const ajeno = await sembrarFamilia(prisma, ajena.org, { sucursalId: null });
    assert.equal((await ponerSucursal(asesorNorte, ajeno.leadId, e.norte)).estado, 404);
    // Un lead de otra sucursal: 404 (el asesor del Norte no ve los del Sur).
    const delSur = await sembrarFamilia(prisma, e.org, { sucursalId: e.sur });
    assert.equal((await ponerSucursal(asesorNorte, delSur.leadId, e.norte)).estado, 404);
    // Recepción y maestro no escriben leads.
    for (const rol of ["recepcion", "maestro"] as const) {
      const c = await e.entrar(rol, rol === "recepcion" ? [e.norte] : []);
      assert.equal((await ponerSucursal(c, leadId, e.norte)).estado, 403);
    }
    // Nada de lo anterior tocó al lead.
    assert.equal((await prisma.lead.findFirstOrThrow({ where: { id: leadId } })).sucursal_interes_id, null);
    // Sin sesión: 401.
    assert.equal((await e.api.cliente().patch(`/api/leads/${leadId}`, { sucursal_interes_id: e.norte })).estado, 401);
  } finally {
    await e.api.cerrar();
    await ajena.api.cerrar();
  }
});

test("dos personas le ponen sucursal al mismo lead a la vez: una gana, la otra recibe 409 o el mismo resultado, y queda UN cambio registrado", async () => {
  const e = await escenario();
  try {
    const a = await e.entrar("asesor", [e.norte, e.sur]);
    const b = await e.entrar("asesor", [e.norte, e.sur]);
    const { leadId } = await sembrarFamilia(prisma, e.org, { sucursalId: null });
    const [ra, rb] = await Promise.all([ponerSucursal(a, leadId, e.norte), ponerSucursal(b, leadId, e.sur)]);
    assert.deepEqual([ra.estado, rb.estado].sort(), [200, 409]);
    const final = (await prisma.lead.findFirstOrThrow({ where: { id: leadId } })).sucursal_interes_id;
    assert.equal(final, ra.estado === 200 ? e.norte : e.sur);
    const registro = await prisma.registro_cambio.count({ where: { entidad_tipo: "lead", entidad_id: leadId } });
    assert.equal(registro, 1);
  } finally {
    await e.api.cerrar();
  }
});

test("GET /api/tareas trae de qué familia es cada tarea (nombre y teléfono del lead) y null si no se pudo atar a ninguna", async () => {
  const e = await escenario();
  try {
    const asesor = await e.entrar("asesor", [e.norte]);
    const admin = await e.entrar("administrador");
    const f = await sembrarFamilia(prisma, e.org, { sucursalId: e.norte, telefono: "+525512340001" });
    await prisma.lead.update({ where: { id: f.leadId }, data: { nombre_contacto: "Laura Pérez" } });
    const t = await prisma.tarea_asesor.create({ data: { organizacion_id: e.org.organizacionId, lead_id: f.leadId, tipo: "entrega_fallida", codigo_error: 63016, descripcion: "No se pudo entregar un mensaje al contacto (código de error 63016)." } });
    const sinLead = await prisma.tarea_asesor.create({ data: { organizacion_id: e.org.organizacionId, tipo: "evento_inesperado", descripcion: "Llegó algo que el sistema no pudo procesar." } });
    const mias = (await asesor.get<{ datos: { id: string; lead_id: string | null; lead: { nombre_contacto: string | null; telefono: string | null } | null }[] }>("/api/tareas?estado=pendiente")).cuerpo.datos;
    const suya = mias.find((x) => x.id === t.id)!;
    assert.deepEqual(suya.lead, { nombre_contacto: "Laura Pérez", telefono: "+525512340001" });
    assert.equal(suya.lead_id, f.leadId);
    // La tarea sin lead solo la ve el administrador y trae `lead: null`.
    assert.equal(mias.some((x) => x.id === sinLead.id), false);
    const deAdmin = (await admin.get<{ datos: { id: string; lead: unknown }[] }>("/api/tareas?estado=pendiente&sin_lead=true")).cuerpo.datos.find((x) => x.id === sinLead.id)!;
    assert.equal(deAdmin.lead, null);
    // Resolverla devuelve la misma forma.
    const r = await asesor.patch<{ lead: { nombre_contacto: string | null } }>(`/api/tareas/${t.id}`, { estado: "hecha" });
    assert.equal(r.estado, 200);
    assert.equal(r.cuerpo.lead.nombre_contacto, "Laura Pérez");
  } finally {
    await e.api.cerrar();
  }
});
