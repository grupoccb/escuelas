// C8: las cotizaciones guardadas por la API (el asesor cotiza a mano), el vencimiento y las garantías de la base.
// Postgres real, la app real.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { esViolacionUnica } from "../datos/prisma.ts";
import { crearPrismaDePruebas, type PrismaPruebas } from "../testutil/prisma-pruebas.ts";
import { fijarConfiguracion, sembrarOrganizacion, sembrarPrograma, type OrganizacionDePrueba, type ProgramaSembrado } from "../testutil/semilla.ts";
import { levantarApi, sembrarUsuario, type ApiLevantada, type ClienteApi } from "../testutil/api.ts";
import { conAlcance } from "../datos/alcance.ts";
import { elegirHorario, vencerCotizaciones } from "./guardar.ts";
import { resumenDeCotizacion } from "./cotizacion.ts";
import { vencerCotizacionesDeTodas } from "./vencer.ts";
import { correrCiclo } from "../ciclo.ts";
import { MessagingProvider, TransporteFalso } from "../mensajeria/index.ts";
import { soloOrganizaciones } from "../testutil/carrera.ts";

let prisma: PrismaPruebas;
let api: ApiLevantada;
let org: OrganizacionDePrueba;
let ajena: OrganizacionDePrueba;
let norte: string;
let sur: string;
let admin: ClienteApi;
let asesorNorte: ClienteApi;
let asesorSur: ClienteApi;
let recepcion: ClienteApi;
let maestro: ClienteApi;
let adminId: string;
let pNinos: ProgramaSembrado;
let pAdultos: ProgramaSembrado;
let pSur: ProgramaSembrado;
let leadNorte: string;
let prospectoNino: string;
let prospectoAdulto: string;
let prospectoSinEdad: string;
const AHORA = new Date("2026-10-08T20:00:00Z"); // 14:00 del 8 de octubre en Ciudad de México
const db = () => conAlcance(prisma, org.organizacionId);

interface Cot {
  id: string; lead_id: string; prospecto_id: string; programa_id: string; sucursal_id: string; grupo_elegido_id: string | null; origen: string;
  creado_por_usuario_id: string | null; fecha: string; vigente_hasta: string; estatus: string; snapshot: { version: number; programa: { nombre: string; precio: { costo_mensualidad: string }; promociones: { aplicadas: { nombre: string }[]; inscripcion: { final_ahora: string } } } };
}
interface Errores { error: { codigo: string; mensaje: string; detalles?: { campo?: string; mensaje: string }[] } }

before(async () => {
  prisma = crearPrismaDePruebas();
  api = levantarApi(prisma, { reloj: () => AHORA });
  org = await sembrarOrganizacion(prisma, "Cotizaciones");
  ajena = await sembrarOrganizacion(prisma, "CotizacionesAjena");
  norte = org.sucursales[0]!.id;
  sur = org.sucursales[1]!.id;
  const entrar = async (rol: "administrador" | "asesor" | "maestro" | "recepcion", sucursales: string[] = []) => {
    const u = await sembrarUsuario(prisma, org.organizacionId, { rol, sucursales });
    const c = api.cliente();
    assert.equal((await c.login(org.slug, u.correo, u.contrasena)).estado, 201);
    return { c, id: u.id };
  };
  const a = await entrar("administrador");
  admin = a.c;
  adminId = a.id;
  asesorNorte = (await entrar("asesor", [norte])).c;
  asesorSur = (await entrar("asesor", [sur])).c;
  recepcion = (await entrar("recepcion", [norte])).c;
  maestro = (await entrar("maestro")).c;

  const H = (dia: number): [number, number, number] => [dia, 960, 1020];
  pNinos = await sembrarPrograma(prisma, org, { sucursalId: norte, nombre: "Programa niños", edadMin: 3, edadMax: 12, grupos: [{ nombre: "Tarde", cupoMaximo: 8, horarios: [H(1)] }, { nombre: "Sábado", horarios: [H(6)] }], precio: { inscripcion: "500.00", mensualidad: "800.00" } });
  pAdultos = await sembrarPrograma(prisma, org, { sucursalId: norte, nombre: "Programa adultos", edadMin: 18, edadMax: 99, grupos: [{ nombre: "Noche", horarios: [H(2)] }], precio: { inscripcion: "600.00", mensualidad: "900.00" } });
  pSur = await sembrarPrograma(prisma, org, { sucursalId: sur, nombre: "Programa sur", edadMin: 3, edadMax: 99, grupos: [{ nombre: "Sur", horarios: [H(3)] }], precio: { inscripcion: "700.00", mensualidad: "1000.00" } });

  const lead = await prisma.lead.create({ data: { organizacion_id: org.organizacionId, vertical_interes_id: org.verticalId, sucursal_interes_id: norte, etapa_id: org.etapaInicialId, telefono: "+525511110001", nombre_contacto: "Mamá" } });
  leadNorte = lead.id;
  const prospecto = (nombre: string, edad: number | null) =>
    prisma.prospecto.create({ data: { organizacion_id: org.organizacionId, lead_id: lead.id, vertical_interes_id: org.verticalId, nombre, edad_declarada: edad, origen: "asesor" } }).then((p) => p.id);
  prospectoNino = await prospecto("Niño", 8);
  prospectoAdulto = await prospecto("Adulto", 30);
  prospectoSinEdad = await prospecto("Sin edad", null);
});
after(async () => {
  await api.cerrar();
  await prisma.$disconnect();
});

const cotizar = (c: ClienteApi, leadId: string, cuerpo: object) => c.post<Cot & Errores>(`/api/leads/${leadId}/cotizaciones`, cuerpo);
const listar = (c: ClienteApi, leadId: string, q = "") => c.get<{ datos: Cot[]; paginacion: { total: number } } & Errores>(`/api/leads/${leadId}/cotizaciones${q}`);

test("el asesor cotiza a mano: guarda lo cotizado congelado, con la fecha de hoy en la zona de la sucursal y la vigencia de la configuración", async () => {
  const r = await cotizar(asesorNorte, leadNorte, { prospecto_id: prospectoNino, programa_id: pNinos.id });
  assert.equal(r.estado, 201, JSON.stringify(r.cuerpo));
  const c = r.cuerpo;
  assert.deepEqual([c.lead_id, c.prospecto_id, c.programa_id, c.sucursal_id, c.origen, c.estatus, c.grupo_elegido_id], [leadNorte, prospectoNino, pNinos.id, norte, "asesor", "vigente", null]);
  assert.deepEqual([c.fecha, c.vigente_hasta], ["2026-10-08", "2026-10-15"]);
  assert.notEqual(c.creado_por_usuario_id, null);
  assert.equal(c.snapshot.programa.nombre, "Programa niños");
  assert.equal(c.snapshot.programa.precio.costo_mensualidad, "800.00");
  // La fila guardada es la misma.
  const fila = await db().cotizacion.findFirstOrThrow({ where: { id: c.id } });
  assert.equal(fila.conversacion_id, null);
  assert.equal(fila.origen, "asesor");
});

test("la vigencia de la configuración se aplica (3 días) y una promoción que vence antes acorta la cotización", async () => {
  const o = await sembrarOrganizacion(prisma, "CotizacionesVigencia");
  const apiLocal = levantarApi(prisma, { reloj: () => AHORA });
  try {
    const u = await sembrarUsuario(prisma, o.organizacionId, { rol: "administrador" });
    const c = apiLocal.cliente();
    assert.equal((await c.login(o.slug, u.correo, u.contrasena)).estado, 201);
    const p = await sembrarPrograma(prisma, o, { sucursalId: o.sucursales[0]!.id, nombre: "P", edadMin: 3, edadMax: 12, grupos: [{ nombre: "G", horarios: [[1, 960, 1020]] }], precio: { inscripcion: "100.00", mensualidad: "200.00" } });
    const lead = await prisma.lead.create({ data: { organizacion_id: o.organizacionId, vertical_interes_id: o.verticalId, sucursal_interes_id: o.sucursales[0]!.id, etapa_id: o.etapaInicialId } });
    const pro = await prisma.prospecto.create({ data: { organizacion_id: o.organizacionId, lead_id: lead.id, vertical_interes_id: o.verticalId, nombre: "N", edad_declarada: 8, origen: "asesor" } });
    await fijarConfiguracion(prisma, o.organizacionId, { cotizacion_vigencia_dias: 3 });
    const r1 = await cotizar(c, lead.id, { prospecto_id: pro.id, programa_id: p.id });
    assert.equal(r1.cuerpo.vigente_hasta, "2026-10-11");
    // Una promoción que vence en dos días acorta la vigencia.
    const promo = await c.post<{ id: string }>("/api/promociones", { nombre: "Corta", codigo: `C-${randomUUID().slice(0, 6)}`.toUpperCase(), vigencia_desde: "2026-10-01", vigencia_hasta: "2026-10-10", programas: [p.id], beneficios: [{ tipo: "descuento_inscripcion", modo: "porcentaje", valor: "10.00" }] });
    assert.equal(promo.estado, 201, JSON.stringify(promo.cuerpo));
    const r2 = await cotizar(c, lead.id, { prospecto_id: pro.id, programa_id: p.id });
    assert.equal(r2.cuerpo.vigente_hasta, "2026-10-10");
    assert.deepEqual(r2.cuerpo.snapshot.programa.promociones.aplicadas.map((a) => a.nombre), ["Corta"]);
    assert.equal(r2.cuerpo.snapshot.programa.promociones.inscripcion.final_ahora, "90.00");
  } finally {
    await apiLocal.cerrar();
  }
});

test("una cotización nueva del mismo prospecto y programa reemplaza (vence) a la anterior; solo queda una vigente", async () => {
  const lead = await prisma.lead.create({ data: { organizacion_id: org.organizacionId, vertical_interes_id: org.verticalId, sucursal_interes_id: norte, etapa_id: org.etapaInicialId } });
  const pro = await prisma.prospecto.create({ data: { organizacion_id: org.organizacionId, lead_id: lead.id, vertical_interes_id: org.verticalId, nombre: "N", edad_declarada: 9, origen: "asesor" } });
  const primera = await cotizar(asesorNorte, lead.id, { prospecto_id: pro.id, programa_id: pNinos.id });
  const segunda = await cotizar(asesorNorte, lead.id, { prospecto_id: pro.id, programa_id: pNinos.id, hermanos_inscritos: 1 });
  assert.equal(primera.estado, 201);
  assert.equal(segunda.estado, 201);
  const l = await listar(asesorNorte, lead.id);
  assert.equal(l.cuerpo.paginacion.total, 2);
  assert.deepEqual(l.cuerpo.datos.map((c) => [c.id, c.estatus]), [[segunda.cuerpo.id, "vigente"], [primera.cuerpo.id, "vencida"]], "la más reciente primero");
  // El registro de cambios dice quién cotizó y cuál se reemplazó.
  // (El orden dentro de una misma transacción no está definido —comparten la hora—: se compara el conjunto.)
  const cambios = await db().registro_cambio.findMany({ where: { entidad_tipo: "cotizacion", entidad_id: { in: [primera.cuerpo.id, segunda.cuerpo.id] } } });
  const como = (a: string, id: string) => `${a}:${id}`;
  assert.deepEqual(cambios.map((x) => como(x.accion, x.entidad_id)).sort(), [como("crear", primera.cuerpo.id), como("actualizar", primera.cuerpo.id), como("crear", segunda.cuerpo.id)].sort());
  // Otro programa del mismo prospecto no la reemplaza.
  const otra = await cotizar(asesorNorte, lead.id, { prospecto_id: pro.id, programa_id: pSur.id }); // Sur: fuera del alcance de este asesor
  assert.equal(otra.estado, 400);
});

test("seis cotizaciones simultáneas del mismo prospecto y programa: todas se guardan y solo UNA queda vigente", async () => {
  const lead = await prisma.lead.create({ data: { organizacion_id: org.organizacionId, vertical_interes_id: org.verticalId, sucursal_interes_id: norte, etapa_id: org.etapaInicialId } });
  const pro = await prisma.prospecto.create({ data: { organizacion_id: org.organizacionId, lead_id: lead.id, vertical_interes_id: org.verticalId, nombre: "N", edad_declarada: 9, origen: "asesor" } });
  const rs = await Promise.all(Array.from({ length: 6 }, () => cotizar(asesorNorte, lead.id, { prospecto_id: pro.id, programa_id: pNinos.id })));
  assert.deepEqual(rs.map((r) => r.estado), [201, 201, 201, 201, 201, 201]);
  const todas = await db().cotizacion.findMany({ where: { prospecto_id: pro.id } });
  assert.equal(todas.length, 6);
  assert.equal(todas.filter((c) => c.estatus === "vigente").length, 1);
  assert.equal(todas.filter((c) => c.estatus === "vencida").length, 5);
});

test("un programa de otra edad se rechaza (409), y también un prospecto sin edad, ajeno o un programa de otra vertical o sucursal", async () => {
  const e1 = await cotizar(asesorNorte, leadNorte, { prospecto_id: prospectoNino, programa_id: pAdultos.id });
  assert.equal(e1.estado, 409);
  assert.match(e1.cuerpo.error.mensaje, /no corresponde a la edad del prospecto \(8 años\)/);
  assert.equal((await cotizar(asesorNorte, leadNorte, { prospecto_id: prospectoAdulto, programa_id: pAdultos.id })).estado, 201, "el programa de su edad sí");
  assert.equal((await cotizar(asesorNorte, leadNorte, { prospecto_id: prospectoAdulto, programa_id: pNinos.id })).estado, 409);
  assert.equal((await cotizar(asesorNorte, leadNorte, { prospecto_id: prospectoSinEdad, programa_id: pNinos.id })).estado, 400);
  const otroLead = await prisma.lead.create({ data: { organizacion_id: org.organizacionId, vertical_interes_id: org.verticalId, sucursal_interes_id: norte, etapa_id: org.etapaInicialId } });
  const ajenoProspecto = await cotizar(asesorNorte, otroLead.id, { prospecto_id: prospectoNino, programa_id: pNinos.id });
  assert.equal(ajenoProspecto.estado, 400, "el prospecto es de otro lead");
  assert.equal((await cotizar(asesorNorte, leadNorte, { prospecto_id: prospectoNino, programa_id: randomUUID() })).estado, 400);
  const otraVertical = await prisma.vertical.create({ data: { organizacion_id: org.organizacionId, nombre: "Otra", slug: `otra-${randomUUID().slice(0, 6)}` } });
  const pOtra = await prisma.programa.create({ data: { organizacion_id: org.organizacionId, vertical_id: otraVertical.id, sucursal_id: norte, nombre: "De otra vertical", edad_min: 3, edad_max: 12 } });
  assert.equal((await cotizar(asesorNorte, leadNorte, { prospecto_id: prospectoNino, programa_id: pOtra.id })).estado, 400);
  // Datos que el cliente no puede mandar.
  for (const extra of [{ precio: "1.00" }, { costo_mensualidad: "1.00" }, { descuento: "50" }, { estatus: "aceptada" }]) {
    assert.equal((await cotizar(asesorNorte, leadNorte, { prospecto_id: prospectoNino, programa_id: pNinos.id, ...extra })).estado, 400, JSON.stringify(extra));
  }
  assert.equal((await cotizar(asesorNorte, leadNorte, { prospecto_id: "no-es-uuid", programa_id: pNinos.id })).estado, 400);
  assert.equal((await cotizar(asesorNorte, leadNorte, { prospecto_id: prospectoNino, programa_id: pNinos.id, hermanos_inscritos: -1 })).estado, 400);
});

test("permisos: administrador y asesor cotizan; recepción lee pero no cotiza; el maestro ni lee ni cotiza; sin sesión, 401", async () => {
  assert.equal((await cotizar(admin, leadNorte, { prospecto_id: prospectoNino, programa_id: pNinos.id })).estado, 201);
  assert.equal((await cotizar(recepcion, leadNorte, { prospecto_id: prospectoNino, programa_id: pNinos.id })).estado, 403);
  assert.equal((await cotizar(maestro, leadNorte, { prospecto_id: prospectoNino, programa_id: pNinos.id })).estado, 403);
  assert.equal((await listar(recepcion, leadNorte)).estado, 200);
  assert.equal((await listar(maestro, leadNorte)).estado, 403);
  assert.equal((await listar(api.cliente(), leadNorte)).estado, 401);
  assert.equal((await cotizar(api.cliente(), leadNorte, {})).estado, 401);
});

test("alcance: el asesor de otra sucursal no ve ni cotiza el lead (404); un lead sin sucursal solo lo ve el administrador", async () => {
  assert.equal((await listar(asesorSur, leadNorte)).estado, 404);
  assert.equal((await cotizar(asesorSur, leadNorte, { prospecto_id: prospectoNino, programa_id: pNinos.id })).estado, 404);
  const sinSucursal = await prisma.lead.create({ data: { organizacion_id: org.organizacionId, vertical_interes_id: org.verticalId, etapa_id: org.etapaInicialId } });
  assert.equal((await listar(asesorNorte, sinSucursal.id)).estado, 404);
  assert.equal((await listar(admin, sinSucursal.id)).estado, 200);
  assert.equal((await listar(admin, randomUUID())).estado, 404);
});

test("no-fuga: un lead de otra organización no se ve ni se cotiza; y un programa ajeno no se acepta", async () => {
  const leadAjeno = await prisma.lead.create({ data: { organizacion_id: ajena.organizacionId, vertical_interes_id: ajena.verticalId, sucursal_interes_id: ajena.sucursales[0]!.id, etapa_id: ajena.etapaInicialId } });
  assert.equal((await listar(admin, leadAjeno.id)).estado, 404);
  assert.equal((await cotizar(admin, leadAjeno.id, { prospecto_id: prospectoNino, programa_id: pNinos.id })).estado, 404);
  const pAjeno = await sembrarPrograma(prisma, ajena, { sucursalId: ajena.sucursales[0]!.id, nombre: "Ajeno", edadMin: 3, edadMax: 12, grupos: [{ nombre: "G", horarios: [[1, 960, 1020]] }], precio: { inscripcion: "1.00", mensualidad: "1.00" } });
  assert.equal((await cotizar(admin, leadNorte, { prospecto_id: prospectoNino, programa_id: pAjeno.id })).estado, 400);
  const todas = await listar(admin, leadNorte);
  assert.ok(todas.cuerpo.datos.every((c) => c.lead_id === leadNorte));
});

test("la lista pagina y muestra «vencida» una cotización vigente cuyo último día ya pasó, aunque el barrido no haya corrido", async () => {
  const lead = await prisma.lead.create({ data: { organizacion_id: org.organizacionId, vertical_interes_id: org.verticalId, sucursal_interes_id: norte, etapa_id: org.etapaInicialId } });
  const pro = await prisma.prospecto.create({ data: { organizacion_id: org.organizacionId, lead_id: lead.id, vertical_interes_id: org.verticalId, nombre: "N", edad_declarada: 9, origen: "asesor" } });
  const vieja = await prisma.cotizacion.create({
    data: { organizacion_id: org.organizacionId, lead_id: lead.id, prospecto_id: pro.id, programa_id: pNinos.id, sucursal_id: norte, origen: "asesor", fecha: new Date("2026-09-01T00:00:00Z"), vigente_hasta: new Date("2026-09-08T00:00:00Z"), snapshot: {} },
  });
  const l = await listar(admin, lead.id, "?limite=1&pagina=1");
  assert.equal(l.cuerpo.paginacion.total, 1);
  assert.deepEqual([l.cuerpo.datos[0]!.id, l.cuerpo.datos[0]!.estatus], [vieja.id, "vencida"]);
  assert.equal((await db().cotizacion.findFirstOrThrow({ where: { id: vieja.id } })).estatus, "vigente", "la fila sigue vigente hasta que corra el barrido");
  assert.equal((await listar(admin, lead.id, "?limite=1&pagina=1&x=1")).estado, 400);
});

test("vencerCotizaciones pasa a «vencida» las que ya pasaron, con un día de margen, no toca las aceptadas y es idempotente", async () => {
  const o = await sembrarOrganizacion(prisma, "CotizacionesVence");
  const p = await sembrarPrograma(prisma, o, { sucursalId: o.sucursales[0]!.id, nombre: "P", edadMin: 3, edadMax: 12 });
  const lead = await prisma.lead.create({ data: { organizacion_id: o.organizacionId, vertical_interes_id: o.verticalId, etapa_id: o.etapaInicialId } });
  const pro = async (n: string) => (await prisma.prospecto.create({ data: { organizacion_id: o.organizacionId, lead_id: lead.id, vertical_interes_id: o.verticalId, nombre: n, edad_declarada: 8, origen: "asesor" } })).id;
  const hacer = async (hasta: string, estatus: "vigente" | "aceptada" = "vigente") =>
    (await prisma.cotizacion.create({ data: { organizacion_id: o.organizacionId, lead_id: lead.id, prospecto_id: await pro(hasta + estatus), programa_id: p.id, sucursal_id: o.sucursales[0]!.id, origen: "asesor", fecha: new Date("2026-09-01T00:00:00Z"), vigente_hasta: new Date(`${hasta}T00:00:00Z`), estatus, snapshot: {} } })).id;
  const ayer = await hacer("2026-10-07"); // ayer en UTC: todavía puede valer en México
  const anteayer = await hacer("2026-10-06");
  const hoy = await hacer("2026-10-08");
  const aceptada = await hacer("2026-09-10", "aceptada");
  const base = conAlcance(prisma, o.organizacionId);
  const estado = async (id: string) => (await base.cotizacion.findFirstOrThrow({ where: { id } })).estatus;
  assert.equal(await vencerCotizaciones(base, new Date("2026-10-08T01:00:00Z")), 1, "solo la de anteayer");
  assert.deepEqual([await estado(anteayer), await estado(ayer), await estado(hoy), await estado(aceptada)], ["vencida", "vigente", "vigente", "aceptada"]);
  assert.equal(await vencerCotizaciones(base, new Date("2026-10-08T01:00:00Z")), 0, "idempotente");
  assert.equal(await vencerCotizaciones(base, new Date("2026-10-09T05:00:00Z")), 1, "al día siguiente vence la de ayer");
  assert.deepEqual([await estado(ayer), await estado(hoy), await estado(aceptada)], ["vencida", "vigente", "aceptada"]);
  assert.equal(await vencerCotizaciones(base, new Date("2026-10-10T05:00:00Z")), 1, "y un día después la de hoy");
  assert.deepEqual([await estado(hoy), await estado(aceptada)], ["vencida", "aceptada"]);
});

test("la base: una vigente por (prospecto, programa), vigencia coherente, origen coherente, snapshot objeto y FKs de la misma organización", async () => {
  const lead = await prisma.lead.create({ data: { organizacion_id: org.organizacionId, vertical_interes_id: org.verticalId, sucursal_interes_id: norte, etapa_id: org.etapaInicialId } });
  const pro = await prisma.prospecto.create({ data: { organizacion_id: org.organizacionId, lead_id: lead.id, vertical_interes_id: org.verticalId, nombre: "N", edad_declarada: 9, origen: "asesor" } });
  const base = { organizacion_id: org.organizacionId, lead_id: lead.id, prospecto_id: pro.id, programa_id: pNinos.id, sucursal_id: norte, origen: "asesor" as const, fecha: new Date("2026-10-08T00:00:00Z"), vigente_hasta: new Date("2026-10-15T00:00:00Z"), snapshot: {} };
  const una = await prisma.cotizacion.create({ data: base });
  await assert.rejects(prisma.cotizacion.create({ data: base }), (e) => esViolacionUnica(e), "dos vigentes del mismo prospecto y programa");
  await prisma.cotizacion.update({ where: { id: una.id }, data: { estatus: "vencida" } });
  await prisma.cotizacion.create({ data: base }); // ahora sí
  await assert.rejects(prisma.cotizacion.create({ data: { ...base, programa_id: pAdultos.id, vigente_hasta: new Date("2026-10-07T00:00:00Z") } }), /cotizacion_vigencia_check/);
  const conv = await prisma.conversacion.create({ data: { organizacion_id: org.organizacionId, bandeja_chatwoot_id: org.bandejaId, lead_id: lead.id, chatwoot_conversacion_id: Math.floor(Math.random() * 1_000_000_000) + 1 } });
  await assert.rejects(prisma.cotizacion.create({ data: { ...base, programa_id: pAdultos.id, origen: "bot" } }), /cotizacion_origen_check/, "el bot la manda dentro de una conversación");
  await assert.rejects(prisma.cotizacion.create({ data: { ...base, programa_id: pAdultos.id, origen: "bot", conversacion_id: conv.id, creado_por_usuario_id: adminId } }), /cotizacion_origen_check/, "y ningún asesor la hizo");
  await assert.rejects(prisma.cotizacion.create({ data: { ...base, programa_id: pAdultos.id, origen: "asesor", conversacion_id: conv.id } }), /cotizacion_origen_check/, "la de un asesor no viene de una conversación");
  await assert.rejects(prisma.cotizacion.create({ data: { ...base, programa_id: pAdultos.id, snapshot: [] } }), /cotizacion_snapshot_check/);
  // Una FK de otra organización no cabe (llave compuesta).
  const pAjeno = await sembrarPrograma(prisma, ajena, { sucursalId: ajena.sucursales[0]!.id, nombre: "Ajeno 2", edadMin: 3, edadMax: 12 });
  await assert.rejects(prisma.cotizacion.create({ data: { ...base, programa_id: pAjeno.id } }), /foreign key|clave foránea|cotizacion_programa_id/i);
  await assert.rejects(prisma.cotizacion.create({ data: { ...base, programa_id: pAdultos.id, grupo_elegido_id: pAjeno.grupos[0]?.id ?? randomUUID() } }), /foreign key|clave foránea|cotizacion_grupo/i);
  // La configuración no acepta vigencias absurdas.
  await assert.rejects(fijarConfiguracion(prisma, org.organizacionId, { cotizacion_vigencia_dias: 0 }), /configuracion_cotizacion_vigencia_check/);
  await assert.rejects(fijarConfiguracion(prisma, org.organizacionId, { cotizacion_vigencia_dias: 400 }), /configuracion_cotizacion_vigencia_check/);
});

test("el barrido por organizaciones y el ciclo (mantenimiento horario) vencen las cotizaciones pasadas, sin tocar las vigentes", async () => {
  const o = await sembrarOrganizacion(prisma, "CotizacionesCiclo");
  const p = await sembrarPrograma(prisma, o, { sucursalId: o.sucursales[0]!.id, nombre: "P", edadMin: 3, edadMax: 12 });
  const lead = await prisma.lead.create({ data: { organizacion_id: o.organizacionId, vertical_interes_id: o.verticalId, etapa_id: o.etapaInicialId } });
  const hacer = async (hasta: string) => {
    const pro = await prisma.prospecto.create({ data: { organizacion_id: o.organizacionId, lead_id: lead.id, vertical_interes_id: o.verticalId, nombre: hasta, edad_declarada: 8, origen: "asesor" } });
    return (await prisma.cotizacion.create({ data: { organizacion_id: o.organizacionId, lead_id: lead.id, prospecto_id: pro.id, programa_id: p.id, sucursal_id: o.sucursales[0]!.id, origen: "asesor", fecha: new Date("2026-09-01T00:00:00Z"), vigente_hasta: new Date(`${hasta}T00:00:00Z`), snapshot: {} } })).id;
  };
  const vieja = await hacer("2026-09-15");
  const nueva = await hacer("2026-12-31");
  const reloj = () => AHORA;
  const r = await vencerCotizacionesDeTodas({ prisma, reloj, organizacionId: o.organizacionId });
  assert.deepEqual(r, { organizaciones: 1, vencidas: 1, errores: 0 });
  const estado = async (id: string) => (await conAlcance(prisma, o.organizacionId).cotizacion.findFirstOrThrow({ where: { id } })).estatus;
  assert.deepEqual([await estado(vieja), await estado(nueva)], ["vencida", "vigente"]);
  assert.deepEqual(await vencerCotizacionesDeTodas({ prisma, reloj, organizacionId: o.organizacionId }), { organizaciones: 1, vencidas: 0, errores: 0 }, "idempotente");

  // Por el ciclo: el mantenimiento horario también lo hace (y solo de esta organización en la prueba).
  const otra = await hacer("2026-09-20");
  const ciclo = await correrCiclo({ prisma: soloOrganizaciones(prisma, [o.organizacionId]), mensajeria: new MessagingProvider({ transporte: new TransporteFalso() }), retencion: {}, reloj });
  assert.equal(ciclo.cotizaciones?.vencidas, 1);
  assert.equal(await estado(otra), "vencida");
});

test("EC-08: los supuestos del asesor (hermanos inscritos, meses por adelantado) que habilitan una promoción quedan en el snapshot y en el registro de cambios", async () => {
  const o = await sembrarOrganizacion(prisma, "CotizacionesSupuestos");
  const apiLocal = levantarApi(prisma, { reloj: () => AHORA });
  try {
    const u = await sembrarUsuario(prisma, o.organizacionId, { rol: "administrador" });
    const c = apiLocal.cliente();
    assert.equal((await c.login(o.slug, u.correo, u.contrasena)).estado, 201);
    const p = await sembrarPrograma(prisma, o, { sucursalId: o.sucursales[0]!.id, nombre: "P", edadMin: 3, edadMax: 12, grupos: [{ nombre: "G", horarios: [[1, 960, 1020]] }], precio: { inscripcion: "100.00", mensualidad: "200.00" } });
    const lead = await prisma.lead.create({ data: { organizacion_id: o.organizacionId, vertical_interes_id: o.verticalId, sucursal_interes_id: o.sucursales[0]!.id, etapa_id: o.etapaInicialId } });
    const pro = await prisma.prospecto.create({ data: { organizacion_id: o.organizacionId, lead_id: lead.id, vertical_interes_id: o.verticalId, nombre: "N", edad_declarada: 8, origen: "asesor" } });
    const promo = await c.post("/api/promociones", { nombre: "Hermanos", codigo: `H-${randomUUID().slice(0, 6)}`.toUpperCase(), vigencia_desde: "2026-01-01", condicion_tipo: "min_hermanos", condicion_valor: { hermanos: 2 }, programas: [p.id], beneficios: [{ tipo: "descuento_mensualidad", modo: "porcentaje", valor: "10.00" }] });
    assert.equal(promo.estado, 201, JSON.stringify(promo.cuerpo));

    const sin = await cotizar(c, lead.id, { prospecto_id: pro.id, programa_id: p.id });
    assert.equal(sin.estado, 201);
    assert.equal("supuestos" in sin.cuerpo.snapshot, false, "sin supuestos no hay campo");
    assert.deepEqual(sin.cuerpo.snapshot.programa.promociones.aplicadas, []);

    const con = await cotizar(c, lead.id, { prospecto_id: pro.id, programa_id: p.id, hermanos_inscritos: 1, meses_pagados: 3 });
    assert.equal(con.estado, 201, JSON.stringify(con.cuerpo));
    assert.deepEqual((con.cuerpo.snapshot as unknown as { supuestos: object }).supuestos, { hermanos_inscritos: 1, meses_pagados: 3 });
    assert.deepEqual(con.cuerpo.snapshot.programa.promociones.aplicadas.map((a) => a.nombre), ["Hermanos"], "con 1 hermano ya inscrito (2 contándolo) la promoción aplica");
    // Quedan en el registro de cambios (el de «crear» de esa cotización).
    const reg = await conAlcance(prisma, o.organizacionId).registro_cambio.findFirstOrThrow({ where: { entidad_tipo: "cotizacion", entidad_id: con.cuerpo.id, accion: "crear" } });
    const despues = reg.despues as Record<string, unknown>;
    assert.deepEqual([despues["hermanos_inscritos"], despues["meses_pagados"]], [1, 3]);
    // Y se ven en la nota que lee el asesor.
    assert.deepEqual(resumenDeCotizacion({ snapshot: con.cuerpo.snapshot, vigenteHasta: con.cuerpo.vigente_hasta, grupoElegidoId: null }).filter((l) => l.includes("suponiendo")), ["• Cotizado suponiendo: 1 hermano ya inscrito y 3 meses pagados por adelantado (lo capturó el asesor)"]);
  } finally {
    await apiLocal.cerrar();
  }
});

test("EC-09 (Z06): elegirHorario no anota un grupo que no es del programa cotizado (ni uno inexistente): devuelve false y no cambia nada", async () => {
  const o = await sembrarOrganizacion(prisma, "CotizacionesGrupoAjeno");
  const dbo = conAlcance(prisma, o.organizacionId);
  const p1 = await sembrarPrograma(prisma, o, { sucursalId: o.sucursales[0]!.id, nombre: "P1", edadMin: 3, edadMax: 12, grupos: [{ nombre: "G1", horarios: [[1, 960, 1020]] }] });
  const p2 = await sembrarPrograma(prisma, o, { sucursalId: o.sucursales[0]!.id, nombre: "P2", edadMin: 3, edadMax: 12, grupos: [{ nombre: "G2", horarios: [[2, 960, 1020]] }] });
  const lead = await prisma.lead.create({ data: { organizacion_id: o.organizacionId, vertical_interes_id: o.verticalId, sucursal_interes_id: o.sucursales[0]!.id, etapa_id: o.etapaInicialId, telefono: "+525511110077" } });
  const pro = await prisma.prospecto.create({ data: { organizacion_id: o.organizacionId, lead_id: lead.id, vertical_interes_id: o.verticalId, nombre: "N", edad_declarada: 8, origen: "bot" } });
  const bandejaConv = await prisma.conversacion.create({ data: { organizacion_id: o.organizacionId, bandeja_chatwoot_id: o.bandejaId, lead_id: lead.id, chatwoot_conversacion_id: 987654, estado: "bot" } });
  await prisma.cotizacion.create({ data: { organizacion_id: o.organizacionId, lead_id: lead.id, prospecto_id: pro.id, programa_id: p1.id, sucursal_id: o.sucursales[0]!.id, origen: "bot", conversacion_id: bandejaConv.id, fecha: new Date("2026-10-08T00:00:00Z"), vigente_hasta: new Date("2026-10-15T00:00:00Z"), snapshot: { version: 1 } } });
  const intento = (grupoId: string | null) => elegirHorario(dbo, { conversacionId: bandejaConv.id, prospectoId: pro.id, grupoId });
  assert.equal(await intento(p2.grupos[0]!.id), false, "un grupo de OTRO programa");
  assert.equal(await intento(randomUUID()), false, "un grupo inexistente");
  assert.equal((await dbo.cotizacion.findFirstOrThrow({ where: { prospecto_id: pro.id } })).grupo_elegido_id, null);
  assert.equal(await intento(p1.grupos[0]!.id), true);
  assert.equal((await dbo.cotizacion.findFirstOrThrow({ where: { prospecto_id: pro.id } })).grupo_elegido_id, p1.grupos[0]!.id);
  assert.equal(await intento(null), true, "descartar el horario tentativo");
  assert.equal((await dbo.cotizacion.findFirstOrThrow({ where: { prospecto_id: pro.id } })).grupo_elegido_id, null);
});
