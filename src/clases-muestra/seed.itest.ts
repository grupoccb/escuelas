// El seed de la clase muestra (prisma/seed/clase-muestra.sql) sobre la organización de demo: marca las etapas con su tipo de
// sistema, enciende la clase muestra por WhatsApp en las verticales de la demo sin pisar lo que el administrador ya editó, y es
// idempotente. Este archivo no nombra ninguna vertical ni sucursal (check:generico): lee lo que dicen las tablas.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import pg from "pg";
import { conAlcance } from "../datos/alcance.ts";
import { crearPrismaDePruebas, type PrismaPruebas } from "../testutil/prisma-pruebas.ts";
import { OcupacionFija } from "../testutil/semilla.ts";
import { agendarClaseMuestra, proximasSesionesConLugar } from "./agenda.ts";

let prisma: PrismaPruebas;
let orgId: string;
let prefijo: string;
let cliente: pg.Client;

const ID_FIJO = /00000000-0000-4000-8000-000000000(\d{3})/g;
async function aplicar(archivo: string): Promise<void> {
  const sql = readFileSync(`prisma/seed/${archivo}.sql`, "utf8").replace(ID_FIJO, `${prefijo}-0000-4000-8000-000000000$1`).replaceAll("escuela-demo", `escuela-${prefijo}`);
  await cliente.query(sql);
}

before(async () => {
  prisma = crearPrismaDePruebas();
  prefijo = randomBytes(4).toString("hex");
  orgId = `${prefijo}-0000-4000-8000-000000000001`;
  cliente = new pg.Client({ connectionString: process.env["DATABASE_URL"] });
  await cliente.connect();
  for (const s of ["demo", "catalogo", "catalogo-completo", "clase-muestra"]) await aplicar(s);
});
after(async () => {
  await cliente.end();
  await prisma.$disconnect();
});

const db = () => conAlcance(prisma, orgId);

test("D1 seed: cada etapa de la demo queda con su tipo de sistema (el código nunca busca etapas por nombre) y los tipos no se repiten", async () => {
  const etapas = await db().etapa_pipeline.findMany({ orderBy: { orden: "asc" }, select: { tipo_sistema: true, es_ganado: true, es_perdido: true } });
  assert.deepEqual(etapas.map((e) => e.tipo_sistema), ["nuevo", "contactado", "muestra_agendada", "muestra_asistida", "negociacion", "inscrito", "perdido"]);
  assert.equal(etapas.find((e) => e.tipo_sistema === "inscrito")!.es_ganado, true);
  assert.equal(etapas.find((e) => e.tipo_sistema === "perdido")!.es_perdido, true);
});

test("D1 seed: la base impide dos etapas vivas del mismo tipo en la organización", async () => {
  await assert.rejects(() => prisma.etapa_pipeline.create({ data: { organizacion_id: orgId, nombre: "Otra", orden: 99, tipo_sistema: "contactado" } }), /etapa_pipeline_tipo_sistema_key|Unique constraint/);
  // Una etapa propia de la escuela (sin tipo) puede haber todas las que quiera.
  await prisma.etapa_pipeline.create({ data: { organizacion_id: orgId, nombre: "Propia 1", orden: 98 } });
  await prisma.etapa_pipeline.create({ data: { organizacion_id: orgId, nombre: "Propia 2", orden: 99 } });
});

test("D1 seed: enciende la clase muestra en las verticales de la demo, es idempotente y no pisa una vertical que el administrador ya editó", async () => {
  const antes = await db().vertical.findMany({ select: { slug: true, clase_muestra_whatsapp_activo: true, cotizador_whatsapp_activo: true }, orderBy: { slug: "asc" } });
  assert.equal(antes.length, 3);
  assert.ok(antes.every((v) => v.clase_muestra_whatsapp_activo && v.cotizador_whatsapp_activo));
  // El administrador apaga una (Prisma mueve actualizado_en) y el seed no la vuelve a encender.
  const una = await db().vertical.findFirstOrThrow({ orderBy: { slug: "asc" } });
  await db().vertical.update({ where: { id: una.id }, data: { clase_muestra_whatsapp_activo: false } });
  await aplicar("clase-muestra");
  await aplicar("clase-muestra");
  assert.equal((await db().vertical.findFirstOrThrow({ where: { id: una.id } })).clase_muestra_whatsapp_activo, false);
  assert.equal(await db().vertical.count({ where: { clase_muestra_whatsapp_activo: true } }), 2);
});

test("D1 seed: sobre el catálogo completo de la demo hay sesiones agendables en todos los grupos con horario", async () => {
  const ahora = new Date("2026-11-02T18:00:00Z");
  const grupos = await db().grupo.findMany({ select: { id: true, nombre: true } });
  assert.equal(grupos.length, 18);
  const fuente = new OcupacionFija();
  for (const g of grupos) {
    const sesiones = await proximasSesionesConLugar(db(), fuente, g.id, ahora, { maximo: 3 });
    assert.ok(sesiones.length >= 1, `${g.nombre} no tiene sesiones agendables`);
  }
  // Y se puede agendar de verdad en un grupo de la demo.
  const grupo = grupos[0]!;
  const [sesion] = await proximasSesionesConLugar(db(), fuente, grupo.id, ahora, { maximo: 1 });
  const programa = await db().grupo.findFirstOrThrow({ where: { id: grupo.id }, select: { programa: { select: { vertical_id: true, sucursal_id: true } } } });
  const lead = await prisma.lead.create({ data: { organizacion_id: orgId, vertical_interes_id: programa.programa.vertical_id, sucursal_interes_id: programa.programa.sucursal_id, etapa_id: `${prefijo}-0000-4000-8000-000000000601`, telefono: "+525512345678" } });
  const prospecto = await prisma.prospecto.create({ data: { organizacion_id: orgId, lead_id: lead.id, vertical_interes_id: programa.programa.vertical_id, nombre: "Prospecto", edad_declarada: 8, origen: "asesor" } });
  const usuarioId = `${prefijo}-0000-4000-8000-000000000502`;
  const r = await db().$transaction((tx) => agendarClaseMuestra(tx, { ahora, fuente, origen: { tipo: "usuario", usuarioId } }, { prospectoId: prospecto.id, grupoId: grupo.id, fechaHora: sesion!.fechaHora }));
  assert.ok(r.ok, JSON.stringify(r));
  assert.equal((await db().lead.findFirstOrThrow({ where: { id: lead.id } })).etapa_id, `${prefijo}-0000-4000-8000-000000000603`, "pasó a «muestra_agendada» por su tipo, no por su nombre");
});

test("D2 seed: las tres plantillas del aviso al maestro quedan aprobadas (utility) y con las variables que el provider sabe resolver; correr el seed otra vez no duplica", async () => {
  await aplicar("clase-muestra");
  const ps = await db().plantilla_mensaje.findMany({ where: { codigo: { startsWith: "aviso_maestro_" } }, orderBy: { codigo: "asc" } });
  assert.deepEqual(ps.map((p) => p.codigo), ["aviso_maestro_agendada", "aviso_maestro_cancelada", "aviso_maestro_reprogramada"]);
  assert.ok(ps.every((p) => p.categoria === "utility" && p.estado_aprobacion === "aprobada" && p.activo && p.vertical_id === null));
  const conocidas = ["nombre_alumno", "nombre_grupo", "nombre_sucursal", "fecha_clase", "hora_clase", "fecha_anterior"];
  for (const p of ps) {
    const vars = p.variables as { pos: number; nombre: string }[];
    assert.ok(vars.every((v) => conocidas.includes(v.nombre)), p.codigo);
    // Cada {{n}} del cuerpo tiene su variable, y nada de salud.
    const usados = [...(p.cuerpo_referencia ?? "").matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]));
    assert.deepEqual([...new Set(usados)].sort(), vars.map((v) => v.pos).sort(), p.codigo);
    assert.equal(/alergia|medic|salud|emergencia/i.test(p.cuerpo_referencia ?? ""), false);
  }
});

test("D3 seed: los recordatorios de 24 h y 2 h quedan como automatizaciones del evento de la clase, con offsets NEGATIVOS, todos los días y una plantilla aprobada; idempotente", async () => {
  await aplicar("clase-muestra");
  const autos = await db().automatizacion.findMany({ where: { evento_disparador: "clase_muestra_proxima" }, orderBy: { offset_minutos: "asc" }, include: { plantilla: true } });
  assert.deepEqual(autos.map((a) => a.offset_minutos), [-1440, -120]);
  for (const a of autos) {
    assert.deepEqual([...a.dias_permitidos].sort(), [0, 1, 2, 3, 4, 5, 6], "también el domingo: una clase en domingo se recuerda en domingo");
    assert.deepEqual([a.hora_inicio_min, a.hora_fin_min, a.activo, a.vertical_id, a.sucursal_id], [540, 1200, true, null, null]);
    assert.equal(a.plantilla?.estado_aprobacion, "aprobada");
    assert.equal(a.plantilla?.categoria, "utility");
  }
  const vars = (autos[0]!.plantilla!.variables as { nombre: string }[]).map((v) => v.nombre);
  assert.deepEqual(vars, ["nombre_prospecto", "nombre_grupo", "fecha_clase", "hora_clase", "nombre_sucursal"]);
  assert.equal(await db().plantilla_mensaje.count({ where: { codigo: "recordatorio_clase_muestra" } }), 1);
});

test("V2 seed: el aviso de que una persona reprogramó o canceló la clase — un evento por cambio, desfase 0, todos los días, plantilla de SERVICIO aprobada con las variables que el motor sabe resolver; idempotente", async () => {
  await aplicar("clase-muestra");
  for (const [evento, codigo, variables] of [
    ["clase_muestra_reprogramada", "aviso_clase_reprogramada", ["nombre_prospecto", "nombre_grupo", "fecha_clase", "hora_clase", "nombre_sucursal", "fecha_anterior"]],
    ["clase_muestra_cancelada", "aviso_clase_cancelada", ["nombre_prospecto", "nombre_grupo", "fecha_clase", "hora_clase", "nombre_sucursal"]],
  ] as const) {
    const autos = await db().automatizacion.findMany({ where: { evento_disparador: evento }, include: { plantilla: true } });
    assert.equal(autos.length, 1, evento);
    const a = autos[0]!;
    assert.deepEqual([a.offset_minutos, a.activo, a.vertical_id, a.sucursal_id, a.hora_inicio_min, a.hora_fin_min, a.max_intentos], [0, true, null, null, 540, 1200, 1], evento);
    assert.deepEqual([...a.dias_permitidos].sort(), [0, 1, 2, 3, 4, 5, 6]);
    assert.deepEqual([a.plantilla?.codigo, a.plantilla?.clase_mensaje, a.plantilla?.estado_aprobacion, a.plantilla?.categoria], [codigo, "servicio", "aprobada", "utility"], "es un aviso de servicio: sale aunque una persona atienda la conversación");
    assert.deepEqual((a.plantilla!.variables as { nombre: string }[]).map((v) => v.nombre), variables);
    const cuerpo = a.plantilla!.cuerpo_referencia ?? "";
    const usados = [...cuerpo.matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((m) => Number(m[1]));
    assert.deepEqual([...new Set(usados)].sort(), variables.map((_, i) => i + 1).sort(), "cada variable declarada se usa en el texto y viceversa");
    assert.equal(/alergia|medic|salud|emergencia/i.test(cuerpo), false);
    assert.equal(await db().plantilla_mensaje.count({ where: { codigo } }), 1, "correr el seed otra vez no duplica");
  }
});

test("D4 seed: la recuperación de quien no llegó — evento propio, offset positivo, intentos espaciados con tope y plantilla aprobada; idempotente", async () => {
  await aplicar("clase-muestra");
  const a = await db().automatizacion.findMany({ where: { evento_disparador: "clase_muestra_no_asistio" }, include: { plantilla: true } });
  assert.equal(a.length, 1);
  assert.deepEqual([a[0]!.offset_minutos, a[0]!.espaciado_minutos, a[0]!.max_intentos, a[0]!.activo], [120, 2880, 2, true]);
  assert.deepEqual([...a[0]!.dias_permitidos].sort(), [0, 1, 2, 3, 4, 5, 6]);
  assert.equal(a[0]!.plantilla?.codigo, "recuperacion_no_asistio");
  assert.equal(a[0]!.plantilla?.estado_aprobacion, "aprobada");
  assert.deepEqual((a[0]!.plantilla!.variables as { nombre: string }[]).map((v) => v.nombre), ["nombre_prospecto", "nombre_grupo", "fecha_clase"]);
  assert.equal(/alergia|medic|salud|emergencia/i.test(a[0]!.plantilla!.cuerpo_referencia ?? ""), false);
  assert.equal(await db().plantilla_mensaje.count({ where: { codigo: "recuperacion_no_asistio" } }), 1);
});
