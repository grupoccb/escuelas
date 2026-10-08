// Directorio real de agentes contra un servidor HTTP local (sin Chatwoot).

import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import { ErrorDirectorio } from "../directorio.ts";
import { directorioAgentesDesdeEntorno } from "../index.ts";
import { DirectorioAgentesChatwoot } from "./directorio.ts";

async function servidor(responder: (req: IncomingMessage) => { estado: number; cuerpo: string }) {
  const peticiones: IncomingMessage[] = [];
  const s = createServer((req, res) => {
    peticiones.push(req);
    const r = responder(req);
    res.writeHead(r.estado, { "content-type": "application/json" }).end(r.cuerpo);
  });
  await new Promise<void>((ok) => s.listen(0, "127.0.0.1", ok));
  const url = `http://127.0.0.1:${(s.address() as AddressInfo).port}`;
  return { url, peticiones, cerrar: () => new Promise<void>((ok) => { s.closeAllConnections(); s.close(() => ok()); }) };
}

test("lista los agentes de la cuenta con el token de administrador y normaliza el correo", async () => {
  const s = await servidor(() => ({
    estado: 200,
    cuerpo: JSON.stringify([
      { id: 2, name: "Asesor demo", email: "Asesor@Demo.test", role: "administrator" },
      { id: 3, available_name: "Otra", email: "otra@demo.test" },
      { id: "x", email: "malo@demo.test" }, // sin id numérico: se ignora
      { id: 4 }, // sin correo: se ignora
      "basura",
    ]),
  }));
  try {
    const d = new DirectorioAgentesChatwoot({ url: `${s.url}/`, tokenAdmin: "token-admin" });
    assert.deepEqual(await d.listarAgentes(7), [
      { id: 2, correo: "asesor@demo.test", nombre: "Asesor demo" },
      { id: 3, correo: "otra@demo.test", nombre: "Otra" },
    ]);
    assert.equal(s.peticiones[0]!.url, "/api/v1/accounts/7/agents");
    assert.equal(s.peticiones[0]!.headers["api_access_token"], "token-admin");
  } finally {
    await s.cerrar();
  }
});

test("errores: HTTP de error, cuerpo ilegible, no es una lista, conexión rechazada y redirección → ErrorDirectorio", async () => {
  for (const [estado, cuerpo] of [[401, "{}"], [500, "x"], [200, "no es json"], [200, '{"payload":[]}'], [302, ""]] as const) {
    const s = await servidor(() => ({ estado, cuerpo }));
    try {
      await assert.rejects(new DirectorioAgentesChatwoot({ url: s.url, tokenAdmin: "t" }).listarAgentes(1), ErrorDirectorio, `${estado} ${cuerpo}`);
    } finally {
      await s.cerrar();
    }
  }
  await assert.rejects(new DirectorioAgentesChatwoot({ url: "http://127.0.0.1:1", tokenAdmin: "t", timeoutMs: 500 }).listarAgentes(1), ErrorDirectorio);
});

test("desde el entorno: real con URL y token; sin ellos, falso fuera de producción y nulo en producción", () => {
  assert.ok(directorioAgentesDesdeEntorno({ CHATWOOT_URL: "http://x", CHATWOOT_ADMIN_TOKEN: "t" }) instanceof DirectorioAgentesChatwoot);
  assert.notEqual(directorioAgentesDesdeEntorno({}), null);
  assert.equal(directorioAgentesDesdeEntorno({ NODE_ENV: "production" }), null);
  assert.equal(directorioAgentesDesdeEntorno({ NODE_ENV: "production", CHATWOOT_URL: "http://x" }), null);
});

test("EB-12 (N24): una redirección NO se sigue: el token de administrador nunca llega al destino ajeno", async () => {
  const ajeno = await servidor(() => ({ estado: 200, cuerpo: "[]" }));
  // El servidor consultado redirige a otro lado con `Location`.
  const redirige = createServer((_req, res) => res.writeHead(302, { location: `${ajeno.url}/robar` }).end());
  await new Promise<void>((ok) => redirige.listen(0, "127.0.0.1", ok));
  const url = `http://127.0.0.1:${(redirige.address() as AddressInfo).port}`;
  try {
    await assert.rejects(new DirectorioAgentesChatwoot({ url, tokenAdmin: "token-secreto-de-administrador" }).listarAgentes(1), ErrorDirectorio);
    assert.equal(ajeno.peticiones.length, 0, "el destino de la redirección no recibió nada");
  } finally {
    await new Promise<void>((ok) => { redirige.closeAllConnections(); redirige.close(() => ok()); });
    await ajeno.cerrar();
  }
});
