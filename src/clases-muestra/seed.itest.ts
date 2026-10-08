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
