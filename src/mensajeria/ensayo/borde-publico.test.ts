import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type IncomingHttpHeaders } from "node:http";
import { crearBordePublico, esRutaPublica, LIMITE_CUERPO_BORDE } from "./borde-publico.ts";

interface Visto {
  metodo: string;
  ruta: string;
  cabeceras: IncomingHttpHeaders;
  cuerpo: Buffer;
}

/** Un «backend» que anota lo que le llega y contesta lo que se le diga. */
async function conBorde(fn: (borde: string, vistos: Visto[]) => Promise<void>, destinoMuerto = false): Promise<void> {
  const vistos: Visto[] = [];
  const backend = createServer((req, res) => {
    const trozos: Buffer[] = [];
    req.on("data", (t: Buffer) => trozos.push(t));
    req.on("end", () => {
      vistos.push({ metodo: req.method ?? "", ruta: req.url ?? "", cabeceras: req.headers, cuerpo: Buffer.concat(trozos) });
      res.setHeader("content-type", "text/xml");
      res.setHeader("retry-after", "5");
      res.statusCode = 202;
      res.end("<Response/>");
    });
  }).listen(0, "127.0.0.1");
  await new Promise<void>((ok) => backend.once("listening", ok));
  const puertoBackend = (backend.address() as { port: number }).port;
  const borde = crearBordePublico({ destino: `http://127.0.0.1:${destinoMuerto ? 1 : puertoBackend}`, plazoMs: 2000 }).listen(0, "127.0.0.1");
  await new Promise<void>((ok) => borde.once("listening", ok));
  try {
    await fn(`http://127.0.0.1:${(borde.address() as { port: number }).port}`, vistos);
  } finally {
    borde.close();
    backend.close();
  }
}

test("solo las rutas de Twilio con su método son públicas", () => {
  for (const r of ["/webhooks/twilio/entrantes", "/webhooks/twilio/estados", "/webhooks/twilio/diagnostico", "/twilio/delivery_status"]) {
    assert.ok(esRutaPublica("POST", r), r);
    assert.ok(!esRutaPublica("GET", r), `GET ${r}`);
    assert.ok(!esRutaPublica("PUT", r), `PUT ${r}`);
  }
  assert.ok(esRutaPublica("GET", "/salud"));
  assert.ok(!esRutaPublica("POST", "/salud"));
  for (const r of ["/", "/api/yo", "/api/login", "/metricas", "/salud/lista", "/webhooks/chatwoot", "/l/x", "/webhooks/twilio/entrantes/", "/webhooks/twilio", "/assets/x.js"]) {
    assert.ok(!esRutaPublica("GET", r) || r === "/salud", `GET ${r}`);
    assert.ok(!esRutaPublica("POST", r), `POST ${r}`);
  }
});

test("lo que no es de Twilio da 404 sin cuerpo y NUNCA llega al backend", async () => {
  await conBorde(async (borde, vistos) => {
    for (const [metodo, ruta] of [["GET", "/"], ["GET", "/api/yo"], ["POST", "/api/login"], ["GET", "/metricas"], ["POST", "/webhooks/chatwoot"], ["GET", "/salud/lista"], ["GET", "/webhooks/twilio/entrantes"], ["DELETE", "/webhooks/twilio/estados"]] as const) {
      const r = await fetch(`${borde}${ruta}`, { method: metodo });
      assert.equal(r.status, 404, `${metodo} ${ruta}`);
      assert.equal(await r.text(), "");
    }
    assert.equal(vistos.length, 0);
  });
});

test("reenvía el POST de Twilio SIN tocar el cuerpo ni la query, con las cabeceras de la firma, y no pasa cookies ni autorización", async () => {
  await conBorde(async (borde, vistos) => {
    const cuerpo = Buffer.from("Body=Hola%2C+qu%C3%A9+tal&From=whatsapp%3A%2B5215512345678&MessageSid=SM1&ReferralCtwaClid=Aff%2Fx%3D%3D");
    const r = await fetch(`${borde}/webhooks/twilio/entrantes?canal=uno`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", "x-twilio-signature": "firma-de-prueba", "i-twilio-idempotency-token": "idem-1", cookie: "sesion=secreta", authorization: "Bearer secreto", "x-forwarded-for": "198.51.100.7" },
      body: new Uint8Array(cuerpo),
    });
    assert.equal(r.status, 202, "devuelve lo que contestó el backend");
    assert.equal(await r.text(), "<Response/>");
    assert.equal(r.headers.get("content-type"), "text/xml");
    assert.equal(r.headers.get("retry-after"), "5");
    const visto = vistos[0]!;
    assert.equal(visto.ruta, "/webhooks/twilio/entrantes?canal=uno");
    assert.ok(Buffer.compare(visto.cuerpo, cuerpo) === 0, "los bytes llegan idénticos");
    assert.equal(visto.cabeceras["x-twilio-signature"], "firma-de-prueba");
    assert.equal(visto.cabeceras["i-twilio-idempotency-token"], "idem-1");
    assert.equal(visto.cabeceras["content-type"], "application/x-www-form-urlencoded");
    assert.equal(visto.cabeceras["x-forwarded-proto"], "https", "el túnel termina el TLS: si no avisó, https");
    assert.equal(visto.cabeceras["cookie"], undefined);
    assert.equal(visto.cabeceras["authorization"], undefined);
  });
});

test("respeta el X-Forwarded-Proto que mande el túnel", async () => {
  await conBorde(async (borde, vistos) => {
    await (await fetch(`${borde}/salud`, { headers: { "x-forwarded-proto": "http" } })).text();
    assert.equal(vistos[0]!.cabeceras["x-forwarded-proto"], "http");
  });
});

test("un cuerpo de más de 100 KB da 413 y no llega al backend", async () => {
  await conBorde(async (borde, vistos) => {
    const r = await fetch(`${borde}/webhooks/twilio/estados`, { method: "POST", body: new Uint8Array(LIMITE_CUERPO_BORDE + 1) });
    assert.equal(r.status, 413);
    await r.arrayBuffer();
    assert.equal(vistos.length, 0);
  });
});

test("con el backend caído da 502 (Twilio puede reintentar) y no revela nada", async () => {
  await conBorde(async (borde) => {
    const r = await fetch(`${borde}/webhooks/twilio/estados`, { method: "POST", body: "MessageSid=SM1" });
    assert.equal(r.status, 502);
    assert.equal(await r.text(), "");
  }, true);
});
