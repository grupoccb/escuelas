// J1: la interfaz web se sirve desde el backend sin tapar nada de él.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express from "express";
import { CSP_WEB, rutasDeWeb } from "./web.ts";
import { escucharSinReuso, puertoDe } from "../testutil/servidor.ts";

async function conBuild<T>(f: (pedir: (metodo: string, ruta: string) => Promise<{ estado: number; texto: string; cabeceras: Headers }>) => Promise<T>): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), "web-dist-"));
  mkdirSync(join(dir, "assets"));
  writeFileSync(join(dir, "index.html"), "<!doctype html><title>app</title>");
  writeFileSync(join(dir, "assets", "app-abc123.js"), "console.log(1)");
  writeFileSync(join(dir, "favicon.svg"), "<svg/>");
  const app = express();
  const web = rutasDeWeb(dir);
  assert.ok(web);
  app.use(web);
  // Lo que viene después de la interfaz en la app real: lo que ella deja pasar cae aquí.
  app.use((_req, res) => res.status(404).type("text").send("del-backend"));
  app.use((err: { status?: number }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(err.status ?? 500).end();
  });
  const server = escucharSinReuso(app);
  try {
    const puerto = await puertoDe(server);
    return await f(async (metodo, ruta) => {
      const r = await fetch(`http://127.0.0.1:${puerto}${ruta}`, { method: metodo });
      return { estado: r.status, texto: await r.text(), cabeceras: r.headers };
    });
  } finally {
    server.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

test("la raíz y cualquier ruta de la interfaz devuelven index.html, sin caché y con su política de seguridad", async () => {
  await conBuild(async (pedir) => {
    for (const ruta of ["/", "/hoy", "/leads/abc-123/convertir", "/cuenta/9"]) {
      const r = await pedir("GET", ruta);
      assert.equal(r.estado, 200, ruta);
      assert.match(r.texto, /<title>app<\/title>/, ruta);
      assert.equal(r.cabeceras.get("cache-control"), "no-cache", ruta);
      assert.equal(r.cabeceras.get("content-security-policy"), CSP_WEB, ruta);
    }
    assert.match(CSP_WEB, /script-src 'self'(?:;|$)/);
    assert.match(CSP_WEB, /frame-ancestors 'none'/);
    assert.match(CSP_WEB, /connect-src 'self'/);
    assert.doesNotMatch(CSP_WEB, /unsafe-inline|unsafe-eval|https?:/, "sin inline, sin eval, sin orígenes externos");
  });
});

test("/assets son inmutables; un asset que no existe es 404 (nunca el HTML) y un archivo con extensión tampoco cae al fallback", async () => {
  await conBuild(async (pedir) => {
    const a = await pedir("GET", "/assets/app-abc123.js");
    assert.equal(a.estado, 200);
    assert.match(a.cabeceras.get("cache-control") ?? "", /immutable/);
    assert.match(a.cabeceras.get("cache-control") ?? "", /max-age=31536000/);
    assert.equal((await pedir("GET", "/assets/nada.js")).estado, 404);
    assert.equal((await pedir("GET", "/nada.js")).estado, 404);
    assert.equal((await pedir("GET", "/favicon.svg")).estado, 200);
  });
});

test("lo que es del backend pasa de largo: /api, /webhooks, /l y /salud", async () => {
  await conBuild(async (pedir) => {
    for (const ruta of ["/api", "/api/yo", "/webhooks/chatwoot", "/l/vertical", "/salud"]) {
      const r = await pedir("GET", ruta);
      assert.equal(r.texto, "del-backend", ruta);
    }
    // Una ruta de la interfaz que solo EMPIEZA igual no es del backend.
    assert.match((await pedir("GET", "/leads/1")).texto, /<title>app/);
    assert.match((await pedir("GET", "/lista")).texto, /<title>app/);
  });
});

test("la interfaz solo responde a GET: un POST a una ruta suya no devuelve el HTML", async () => {
  await conBuild(async (pedir) => {
    assert.equal((await pedir("POST", "/hoy")).texto, "del-backend");
  });
});

test("sin build (sin index.html) no hay interfaz", () => {
  const dir = mkdtempSync(join(tmpdir(), "web-vacio-"));
  try {
    assert.equal(rutasDeWeb(dir), null);
    assert.equal(rutasDeWeb(join(dir, "no-existe")), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
