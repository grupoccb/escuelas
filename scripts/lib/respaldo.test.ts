// EK-B1: las herramientas de Postgres del contenedor solo atienden una conexión que sea de ese contenedor.
import { test } from "node:test";
import assert from "node:assert/strict";
import { elegirContenedor, leerConexion, type EjecutarDocker } from "./respaldo.ts";

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
