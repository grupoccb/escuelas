// V13-fix EV-35: las cuentas de la bitácora de V7 se comprueban contra sus propias filas. La auditoría encontró «73 corregidas» cuando las tablas de los cuatro roles suman 72: aquí se
// cuentan las filas `V7-<ROL>-NN` de la bitácora y las que dicen «**Corregido…**», y se compara con la nota que corrige el total.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const bitacora = readFileSync(fileURLToPath(new URL("../docs/BITACORA-V1.md", import.meta.url)), "utf8");
const filasDe = (rol: string): string[] => bitacora.split("\n").filter((l) => new RegExp(`^\\| V7-${rol}-\\d+ \\|`).test(l));

test("EV-35: las filas de fricciones de V7 suman 92, las corregidas 72 y las documentadas 20, y la nota de la bitácora dice exactamente eso", () => {
  const roles = ["ASESOR", "MAESTRO", "RECEPCION", "ADMIN"];
  const totales = roles.map((r) => ({ rol: r, filas: filasDe(r).length, corregidas: filasDe(r).filter((l) => l.includes("**Corregido")).length }));
  assert.deepEqual(totales.map((t) => t.filas), [21, 18, 21, 32]);
  assert.deepEqual(totales.map((t) => t.corregidas), [14, 13, 18, 27], "el asesor tiene 14 filas corregidas, no 15");
  const filas = totales.reduce((n, t) => n + t.filas, 0);
  const corregidas = totales.reduce((n, t) => n + t.corregidas, 0);
  assert.equal(filas, 92);
  assert.equal(corregidas, 72);
  assert.match(bitacora, new RegExp(`\\*\\*${corregidas} corregidas y ${filas - corregidas} documentadas o para Eduardo\\*\\*`), "la nota de V7 debe decir el total real");
  assert.match(bitacora, /el recuento real es 72 y 20/, "la fila de la tabla de bloques remite a la nota");
});
