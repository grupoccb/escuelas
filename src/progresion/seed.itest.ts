// G3: el seed de progresión (prisma/seed/progresion.sql) sobre la organización de demo: los peldaños de las tres verticales son FILAS [SUPUESTO], con órdenes y
// colores válidos, y volver a correrlo no duplica. Este archivo no nombra ninguna vertical (check:generico): lee lo que dicen las tablas y los ids del seed.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import pg from "pg";
import { conAlcance } from "../datos/alcance.ts";
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
const verticalDeSeed = (n: string): string => `${prefijo}-0000-4000-8000-000000000${n}`;

before(async () => {
  prisma = crearPrismaDePruebas();
  prefijo = randomBytes(4).toString("hex");
  orgId = `${prefijo}-0000-4000-8000-000000000001`;
  cliente = new pg.Client({ connectionString: process.env["DATABASE_URL"] });
  await cliente.connect();
  for (const s of ["demo", "catalogo", "catalogo-completo", "progresion"]) await aplicar(s);
});
after(async () => {
  await cliente.end();
  await prisma.$disconnect();
});

const db = () => conAlcance(prisma, orgId);

test("G3 seed: las tres verticales de la demo traen sus peldaños como filas, en orden, con color válido y mínimos que no bajan; marcados [SUPUESTO]", async () => {
  const por = async (vertical: string) => db().nivel_progresion.findMany({ where: { vertical_id: verticalDeSeed(vertical) }, orderBy: { orden: "asc" }, select: { orden: true, color_hex: true, clases_minimas: true, horas_minimas: true, requisitos_texto: true } });
  const siete = await por("101");
  const seis = await por("102");
  const tres = await por("103");
  assert.deepEqual([siete.length, seis.length, tres.length], [7, 6, 3], "siete, seis (los del contexto §7) y tres");
  for (const niveles of [siete, seis, tres]) {
    assert.deepEqual(niveles.map((n) => n.orden), niveles.map((_, i) => i + 1), "órdenes consecutivos desde 1");
    assert.ok(niveles.every((n) => n.color_hex === null || /^#[0-9A-Fa-f]{6}$/.test(n.color_hex)));
    assert.deepEqual(niveles.map((n) => n.clases_minimas), [...niveles.map((n) => n.clases_minimas)].sort((a, b) => a - b), "los mínimos no bajan");
    assert.equal(niveles[0]!.clases_minimas, 0, "el primer peldaño no exige clases");
    assert.ok(niveles.slice(1).every((n) => (n.requisitos_texto ?? "").includes("[SUPUESTO]")), "cada requisito de ejemplo dice que es un supuesto");
  }
  assert.equal(await db().nivel_progresion.count(), 16);
});

test("G3 seed: idempotente — volver a correrlo no duplica ni falla", async () => {
  await aplicar("progresion");
  await aplicar("progresion");
  assert.equal(await db().nivel_progresion.count(), 16);
});

test("G3 seed: es la prueba de fuego del invariante 2 — una vertical nueva solo con filas: otra vertical con peldaños propios convive sin tocar el código", async () => {
  const v = await prisma.vertical.create({ data: { organizacion_id: orgId, nombre: "Vertical nueva", slug: `nueva-${prefijo}`, usa_progresion: true, etiqueta_progresion: "Grado" } });
  await prisma.nivel_progresion.create({ data: { organizacion_id: orgId, vertical_id: v.id, nombre: "Primer grado", orden: 1 } });
  assert.equal(await db().nivel_progresion.count({ where: { vertical_id: v.id } }), 1);
  assert.equal(await db().nivel_progresion.count(), 17);
});
