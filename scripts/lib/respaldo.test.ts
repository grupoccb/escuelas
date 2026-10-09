// EK-B1: las herramientas de Postgres del contenedor solo atienden una conexión que sea de ese contenedor.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { aplicarRetencion, elegirContenedor, leerConexion, respaldar, type EjecutarDocker } from "./respaldo.ts";

const con = (url: string) => leerConexion(url);
const dockerCon = (nombres: string[]): EjecutarDocker => (args) => (args[0] === "ps" ? { status: 0, stdout: nombres.join("\n") + "\n" } : { status: 0, stdout: "true\n" });

test("un host local elige el contenedor que publica el puerto de la URL", () => {
  const llamadas: string[][] = [];
  const docker: EjecutarDocker = (args) => {
    llamadas.push(args);
    return { status: 0, stdout: "mi-postgres\n" };
  };
  assert.equal(elegirContenedor(con("postgresql://u:p@localhost:55432/x"), {}, docker), "mi-postgres");
  assert.ok(llamadas[0]!.includes("publish=55432"), "filtra por el puerto de la conexión, no por uno fijo");
});

test("un servidor remoto no se atiende con el contenedor local (nunca respaldar o restaurar la base equivocada)", () => {
  assert.equal(elegirContenedor(con("postgresql://u:p@db.interno.example:5432/x"), {}, dockerCon(["inscripciones-postgres-1"])), null);
});

test("sin contenedor que publique ese puerto, o con dos que lo publican, no se adivina", () => {
  assert.equal(elegirContenedor(con("postgresql://u:p@127.0.0.1:5999/x"), {}, dockerCon([])), null);
  assert.equal(elegirContenedor(con("postgresql://u:p@127.0.0.1:5432/x"), {}, dockerCon(["a", "b"])), null);
});

test("RESPALDO_CONTENEDOR explícito manda, si corre", () => {
  assert.equal(elegirContenedor(con("postgresql://u:p@db.interno.example:5432/x"), { RESPALDO_CONTENEDOR: "otro" }, dockerCon([])), "otro");
  assert.equal(elegirContenedor(con("postgresql://u:p@localhost:5432/x"), { RESPALDO_CONTENEDOR: "otro" }, () => ({ status: 0, stdout: "false\n" })), null);
});

test("EK-07: una retención de 0, negativa o decimal se rechaza y no borra nada (antes --retener -5 borraba también el respaldo recién hecho)", async () => {
  const dir = mkdtempSync(join(tmpdir(), "retener-"));
  for (const f of ["base_x-20261001-000000Z.dump", "base_x-20261002-000000Z.dump", "base_x-20261003-000000Z.dump"]) writeFileSync(join(dir, f), "x");
  for (const n of [-5, 0, 1.5, Number.NaN]) assert.throws(() => aplicarRetencion(dir, "base_x", n), /entero de 1 o más/, String(n));
  assert.equal(readdirSync(dir).length, 3);
  await assert.rejects(respaldar({ url: "postgresql://u:p@localhost:1/x", directorio: dir, retener: -5 }), /entero de 1 o más/);
  assert.equal(readdirSync(dir).length, 3);
  assert.deepEqual(aplicarRetencion(dir, "base_x", 2), ["base_x-20261001-000000Z.dump"]);
});
