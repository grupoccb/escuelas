// EH-09: los índices únicos que importan al dinero y que SÍ expresa Prisma tienen que estar declarados en `prisma/schema.prisma`: si no, `prisma migrate dev` genera un `DROP INDEX`
// en silencio (pasó con `pago_aplicacion_pago_cargo_key`). Los parciales (`WHERE …`) no caben en Prisma y viven solo en el SQL de la migración.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const esquema = readFileSync(new URL("../../prisma/schema.prisma", import.meta.url), "utf8");
const modelo = (nombre: string): string => {
  const m = new RegExp(`^model ${nombre} \\{[\\s\\S]*?^\\}`, "m").exec(esquema);
  assert.ok(m, `el modelo ${nombre} existe`);
  return m[0];
};

test("pago_aplicacion declara su único (pago, cargo) con el nombre que le dio la migración", () => {
  assert.match(modelo("pago_aplicacion"), /@@unique\(\[pago_id, cargo_id\], map: "pago_aplicacion_pago_cargo_key"\)/);
});

test("el único (pago, cargo) existe en el SQL de la migración de pagos con ese mismo nombre", () => {
  const sql = readFileSync(new URL("../../prisma/migrations/20261021010000_pagos/migration.sql", import.meta.url), "utf8");
  assert.match(sql, /CREATE UNIQUE INDEX "pago_aplicacion_pago_cargo_key" ON "pago_aplicacion" \("pago_id", "cargo_id"\)/);
});
