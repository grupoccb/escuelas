// V10 / EA-23: el ARRANQUE de `src/server.ts` (el cableado de dependencias, `listen`, el barrido y el cierre) corre de verdad, como proceso, y no solo por partes.
//   · arranca contra la base de pruebas, responde `/salud` (vivo) y `/salud/lista` (listo) y la interfaz de la API pide sesión;
//   · una señal SIGTERM (cada despliegue) lo cierra en orden y sale con 0;
//   · en producción con valores de demostración NO arranca: sale con 1 y dice por qué.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";

const puertoLibre = (): Promise<number> =>
  new Promise((resolver, rechazar) => {
    const s = createServer();
    s.once("error", rechazar);
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address() as { port: number };
      s.close(() => resolver(port));
    });
  });

interface Corrida {
  proceso: ChildProcess;
  salida: () => string;
  termino: Promise<{ codigo: number | null; senal: NodeJS.Signals | null }>;
}

function lanzar(env: Record<string, string>): Corrida {
  // Sin lo heredado que cambie el arranque (otro puerto, otro modo): solo la base de pruebas y lo que la prueba fija.
  const base: Record<string, string> = { PATH: process.env["PATH"] ?? "", DATABASE_URL: process.env["DATABASE_URL"]!, HOME: process.env["HOME"] ?? "" };
  const proceso = spawn(process.execPath, ["src/server.ts"], { env: { ...base, ...env }, stdio: ["ignore", "pipe", "pipe"] });
  let texto = "";
  proceso.stdout?.on("data", (d: Buffer) => (texto += d.toString()));
  proceso.stderr?.on("data", (d: Buffer) => (texto += d.toString()));
  const termino = new Promise<{ codigo: number | null; senal: NodeJS.Signals | null }>((resolver) => proceso.once("exit", (codigo, senal) => resolver({ codigo, senal })));
  return { proceso, salida: () => texto, termino };
}

async function esperarA(que: () => Promise<boolean>, limiteMs: number, descripcion: string, corrida: Corrida): Promise<void> {
  const hasta = Date.now() + limiteMs;
  while (Date.now() < hasta) {
    if (await que().catch(() => false)) return;
    await new Promise((r) => setTimeout(r, 150));
  }
  corrida.proceso.kill("SIGKILL");
  throw new Error(`No ocurrió a tiempo: ${descripcion}\n--- salida del proceso ---\n${corrida.salida()}`);
}

test("el servidor arranca como proceso, atiende /salud y /salud/lista y se cierra en orden con SIGTERM (exit 0)", { timeout: 60_000 }, async () => {
  const puerto = await puertoLibre();
  const c = lanzar({ NODE_ENV: "development", PORT: String(puerto) });
  try {
    await esperarA(async () => (await fetch(`http://127.0.0.1:${puerto}/salud`)).status === 200, 30_000, "/salud responde 200", c);
    assert.match(c.salida(), /backend_escuchando/);
    const lista = await fetch(`http://127.0.0.1:${puerto}/salud/lista`);
    assert.ok([200, 503].includes(lista.status), `/salud/lista responde con su estado (${lista.status})`);
    const cuerpo = (await lista.json()) as { listo?: boolean; comprobaciones?: unknown };
    assert.equal(typeof cuerpo, "object");
    // La API exige sesión: el cableado de /api está de pie.
    assert.equal((await fetch(`http://127.0.0.1:${puerto}/api/yo`)).status, 401);
    // Un webhook sin firma se rechaza (nada se acepta sin autenticar).
    assert.equal((await fetch(`http://127.0.0.1:${puerto}/webhooks/chatwoot`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })).status, 401);
    c.proceso.kill("SIGTERM");
    const fin = await Promise.race([c.termino, new Promise<never>((_, rechazar) => setTimeout(() => rechazar(new Error(`no se cerró con SIGTERM\n${c.salida()}`)), 20_000))]);
    assert.deepEqual([fin.codigo, fin.senal], [0, null], `salida limpia: ${c.salida().slice(-600)}`);
    assert.match(c.salida(), /backend_cerrando/);
  } finally {
    if (c.proceso.exitCode === null) c.proceso.kill("SIGKILL");
  }
});

test("en producción con valores de demostración NO arranca: sale con 1, dice por qué y no llega a escuchar", { timeout: 30_000 }, async () => {
  const puerto = await puertoLibre();
  const c = lanzar({ NODE_ENV: "production", PORT: String(puerto), COOKIE_SEGURA: "false" });
  const fin = await Promise.race([c.termino, new Promise<never>((_, rechazar) => setTimeout(() => rechazar(new Error(`debió salir solo\n${c.salida()}`)), 20_000))]);
  assert.equal(fin.codigo, 1, c.salida());
  assert.match(c.salida(), /entorno_inseguro_no_arranca/);
  assert.ok(!/backend_escuchando/.test(c.salida()), "nunca escuchó");
  // Es una salida CONTROLADA por la revisión del entorno, no una excepción más adelante (que también sale con 1 pero con traza y sin haber revisado nada).
  assert.ok(!/\bat .*\.ts:\d+/.test(c.salida()) && !/Error:/.test(c.salida()), `sin traza ni excepción: ${c.salida().slice(-500)}`);
});
