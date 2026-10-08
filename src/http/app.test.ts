import { test } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { crearApp, type AppDeps } from "./app.ts";

async function get(deps: AppDeps, path: string): Promise<{ status: number; body: unknown }> {
  const server = crearApp(deps).listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}${path}`);
    return { status: res.status, body: await res.json() };
  } finally {
    server.close();
  }
}

test("/salud responde 200 cuando la base contesta", async () => {
  const r = await get({ pingDb: async () => {} }, "/salud");
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { ok: true, db: "ok" });
});

test("/salud responde 503 cuando la base falla", async () => {
  const r = await get({ pingDb: async () => { throw new Error("caída"); } }, "/salud");
  assert.equal(r.status, 503);
  assert.deepEqual(r.body, { ok: false, db: "sin conexión" });
});
