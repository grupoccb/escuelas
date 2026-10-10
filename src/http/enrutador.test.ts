// V13-fix EV-01: todos los routers distinguen mayúsculas y barra final, y nadie vuelve a crear un `Router()` suelto.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { appReal, pilaDe } from "../testutil/rutas-reales.ts";
import { escucharSinReuso, puertoDe } from "../testutil/servidor.ts";

/* eslint-disable @typescript-eslint/no-explicit-any -- internos de Express 5 */
function routers(stack: any[], ruta = "app"): { ruta: string; router: any }[] {
  return stack.flatMap((capa, i) => (capa.handle?.stack ? [{ ruta: `${ruta}/${i}`, router: capa.handle }, ...routers(capa.handle.stack, `${ruta}/${i}`)] : []));
}

test("el router de la aplicación y TODOS los que cuelgan de él distinguen mayúsculas y barra final (caseSensitive y strict)", () => {
  const app: any = appReal();
  assert.equal(app.router.caseSensitive, true, "la aplicación");
  assert.equal(app.router.strict, true, "la aplicación");
  const todos = routers(pilaDe(app));
  assert.ok(todos.length >= 50, `deben verse los routers de /api, /l y la interfaz (hubo ${todos.length})`);
  const flojos = todos.filter(({ router }) => router.caseSensitive !== true || router.strict !== true).map((x) => x.ruta);
  assert.deepEqual(flojos, [], "un router sin caseSensitive/strict deja pasar /API/… por la ruta sin guarda de módulos");
});

test("el código de producción no crea `Router()` sueltos: usa crearRouter() de src/http/enrutador.ts", () => {
  const raiz = resolve(import.meta.dirname, "..");
  const archivos: string[] = [];
  const recorrer = (d: string): void => {
    for (const n of readdirSync(d)) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) {
        if (n !== "generated" && n !== "node_modules") recorrer(p);
      } else if (n.endsWith(".ts") && !/\.(?:test|itest)\.ts$/.test(n) && !p.includes("/testutil/")) archivos.push(p);
    }
  };
  recorrer(raiz);
  const sinComentarios = (p: string): string => readFileSync(p, "utf8").replace(/\/\/.*$/gm, "").replace(/\bcrearRouter\(/g, "");
  const sueltos = archivos.filter((p) => !p.endsWith("/http/enrutador.ts") && /(?<![\w.])Router\(/.test(sinComentarios(p)));
  assert.deepEqual(sueltos.map((p) => relative(raiz, p)), []);
});

test("una petición real: /API/…, la barra final y la interfaz en otra capitalización no llegan a un manejador", async () => {
  const app = appReal();
  const servidor = escucharSinReuso(app);
  try {
    const base = `http://127.0.0.1:${await puertoDe(servidor)}`;
    for (const [metodo, ruta] of [["GET", "/API/cargos"], ["POST", "/Api/pagos"], ["GET", "/api/CARGOS"], ["GET", "/api/cargos/"], ["DELETE", "/API/eventos"]] as const) {
      const r = await fetch(base + ruta, { method: metodo });
      // /api/CARGOS y /api/cargos/ llegan al router de la API (sin sesión: 401 de la autenticación, que va antes que cualquier ruta); /API y /Api, a la ruta inexistente.
      assert.ok(r.status === 404 || r.status === 401, `${metodo} ${ruta} → ${r.status}`);
      if (ruta.toLowerCase().startsWith("/api") && !ruta.startsWith("/api/")) assert.equal(r.status, 404, ruta);
    }
  } finally {
    servidor.close();
  }
});
