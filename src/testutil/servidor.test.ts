// EG-08: todo servidor de prueba escucha en 127.0.0.1, nunca en el comodín (ver src/testutil/servidor.ts: en macOS un servidor del comodín puede recibir un puerto
// que otro proceso ya tiene en 127.0.0.1 y las peticiones llegan al equivocado — la causa de los tests intermitentes de EF-17).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { escucharSinReuso, puertoDe } from "./servidor.ts";

const archivos = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const ruta = join(dir, n);
    if (statSync(ruta).isDirectory()) return n === "generated" ? [] : archivos(ruta);
    return /\.ts$/.test(n) ? [ruta] : [];
  });

/** Las líneas con un `.listen(` que no nombran el loopback (comodín por omisión, `0.0.0.0`, `::`, `localhost`…). */
export function listenSinLoopback(texto: string): string[] {
  return texto.split("\n").filter((l) => /\.listen\(/.test(l) && !/\.listen\([^)]*["'`]127\.0\.0\.1["'`]/.test(l));
}

test("EG-08: ningún servidor de prueba escucha en el comodín: todo `.listen(` de una prueba o de testutil nombra 127.0.0.1", () => {
  const infractores = archivos("src")
    .filter((f) => /(?:\.test\.ts|\.itest\.ts)$/.test(f) || f.startsWith(join("src", "testutil")))
    .filter((f) => f !== join("src", "testutil", "servidor.test.ts"))
    .flatMap((f) => listenSinLoopback(readFileSync(f, "utf8")).map((l) => `${f}: ${l.trim()}`));
  assert.deepEqual(infractores, [], "estos servidores de prueba no escuchan en 127.0.0.1: usa escucharSinReuso() o listen(0, \"127.0.0.1\", …)");
});

test("EG-08: el guardián detecta el comodín y la dirección que no es el loopback (mutación)", () => {
  for (const mala of ["s.listen(0)", "s.listen(0, r)", "await new Promise<void>((r) => servidor.listen(0, resolver));", 's.listen(0, "0.0.0.0", r)', "s.listen(0, 'localhost', r)", "s.listen({ port: 0 })", 's.listen(0, "::", r)']) {
    assert.equal(listenSinLoopback(mala).length, 1, mala);
  }
  for (const buena of ['s.listen(0, "127.0.0.1", r)', "servidor.listen(0, '127.0.0.1', resolver)", 'x.listen(0, "127.0.0.1")', "const n = 1;"]) {
    assert.equal(listenSinLoopback(buena).length, 0, buena);
  }
});

test("EG-08: el servidor de prueba escucha en 127.0.0.1, cierra cada conexión y dos servidores simultáneos tienen puertos distintos", async () => {
  const app = ((_req: unknown, res: { end(): void }) => res.end()) as never;
  const a = escucharSinReuso(app);
  const b = escucharSinReuso(app);
  try {
    const [pa, pb] = await Promise.all([puertoDe(a), puertoDe(b)]);
    assert.notEqual(pa, pb);
    assert.equal((a.address() as { address: string }).address, "127.0.0.1");
    const r = await fetch(`http://127.0.0.1:${pa}/`);
    await r.arrayBuffer();
    assert.equal(r.headers.get("connection"), "close");
  } finally {
    a.close();
    b.close();
  }
});
