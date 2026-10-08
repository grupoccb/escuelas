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
