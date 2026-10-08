// El seed de seguimiento (prisma/seed/seguimiento.sql) sobre la organización de demo: documentos legales de ejemplo con su huella correcta,
// idempotente. Este archivo no nombra ninguna vertical ni sucursal (check:generico): lee lo que dicen las tablas.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import pg from "pg";
import { conAlcance } from "../datos/alcance.ts";
import { documentosVigentes } from "./documentos.ts";
import { crearPrismaDePruebas, type PrismaPruebas } from "../testutil/prisma-pruebas.ts";

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
  for (const s of ["demo", "catalogo", "catalogo-completo", "clase-muestra", "seguimiento"]) await aplicar(s);
});
after(async () => {
  await cliente.end();
  await prisma.$disconnect();
});

const db = () => conAlcance(prisma, orgId);

test("D6 seed: reglamento, uso de imagen y aviso de privacidad v1 vigentes, con la huella SHA-256 de su texto, marcados [SUPUESTO]; idempotente", async () => {
  const docs = await documentosVigentes(db(), null, new Date("2026-10-15T12:00:00Z"));
  assert.deepEqual(docs.map((d) => [d.tipo, d.version]).sort(), [["aviso_privacidad", 1], ["reglamento", 1], ["uso_imagen", 1]]);
  for (const d of docs) {
    assert.equal(d.textoHash, createHash("sha256").update(d.texto, "utf8").digest("hex"), `huella de ${d.tipo}`);
    assert.match(d.texto, /\[SUPUESTO/);
  }
  assert.equal((await documentosVigentes(db(), null, new Date("2025-12-31T00:00:00Z"))).length, 0, "antes de su fecha no rigen");
  await aplicar("seguimiento");
  assert.equal(await db().documento_legal.count(), 3, "volver a correr el seed no duplica");
});

test("D7 seed: los motivos de pérdida de ejemplo y los umbrales de días sin movimiento por etapa (de demo.sql); idempotente", async () => {
  const motivos = await db().motivo_perdida.findMany({ orderBy: { orden: "asc" }, select: { codigo: true, activo: true } });
  assert.deepEqual(motivos.map((m) => m.codigo), ["precio", "horario", "distancia", "no_contesto", "eligio_otra_escuela", "otro"]);
  assert.ok(motivos.every((m) => m.activo));
  const etapas = await db().etapa_pipeline.findMany({ select: { tipo_sistema: true, dias_alerta_sin_movimiento: true } });
  const umbral = (tipo: string) => etapas.find((e) => e.tipo_sistema === tipo)!.dias_alerta_sin_movimiento;
  assert.deepEqual(["nuevo", "contactado", "muestra_agendada", "muestra_asistida", "negociacion"].map(umbral), [2, 3, 3, 3, 5]);
  assert.equal(umbral("inscrito"), null, "las etapas de cierre nunca alertan");
  assert.equal(umbral("perdido"), null);
  await aplicar("seguimiento");
  assert.equal(await db().motivo_perdida.count(), 6, "volver a correr el seed no duplica");
});

test("D8 seed: plantillas de marketing y las dos automatizaciones (lead frío y promoción por vencer) con los tiempos de ejemplo; idempotente", async () => {
  const plantillas = await db().plantilla_mensaje.findMany({ where: { codigo: { in: ["reenganche_lead_frio", "promocion_por_vencer"] } }, select: { codigo: true, categoria: true, estado_aprobacion: true, variables: true, cuerpo_referencia: true } });
  assert.equal(plantillas.length, 2);
  assert.ok(plantillas.every((p) => p.categoria === "marketing" && p.estado_aprobacion === "aprobada"));
  // Cada variable de la plantilla es una que el motor sabe resolver (si no, se omite con tarea).
  const conocidas = new Set(["nombre_vertical", "nombre_contacto", "nombre_prospecto", "nombre_sucursal", "nombre_grupo", "fecha_clase", "hora_clase", "nombre_promocion", "fecha_vencimiento"]);
  for (const p of plantillas) {
    const vars = p.variables as { pos: number; nombre: string }[];
    assert.ok(vars.every((v) => conocidas.has(v.nombre)), p.codigo);
    for (const v of vars) assert.ok(p.cuerpo_referencia!.includes(`{{${v.pos}}}`), `${p.codigo} usa la variable ${v.pos}`);
  }
  const autos = await db().automatizacion.findMany({ where: { evento_disparador: { in: ["lead_frio", "promocion_por_vencer"] } }, orderBy: { offset_minutos: "asc" }, select: { evento_disparador: true, offset_minutos: true, max_intentos: true, dias_permitidos: true, activo: true, condiciones: true } });
  assert.deepEqual(autos.map((a) => [a.evento_disparador, a.offset_minutos, a.max_intentos, a.activo]), [["promocion_por_vencer", -4320, 1, true], ["lead_frio", 0, 3, true]]);
  assert.ok(autos.every((a) => !a.dias_permitidos.includes(0)), "marketing: no los domingos");
  await aplicar("seguimiento");
  assert.equal(await db().automatizacion.count({ where: { evento_disparador: { in: ["lead_frio", "promocion_por_vencer"] } } }), 2);
});
