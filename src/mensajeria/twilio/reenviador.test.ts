// El reenviador HTTP REAL contra un servidor HTTP local (EA-04): lo que transporta el mensaje de
// un contacto no puede quedarse sin pruebas. Sin red externa (invariante 11).

import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { ErrorReenvio, ReenviadorTwilioHttp } from "./reenviador.ts";

interface Peticion {
  metodo: string;
  ruta: string;
  cabeceras: IncomingMessage["headers"];
  cuerpo: Buffer;
}

let servidor: Server;
let base: string;
let recibidas: Peticion[] = [];
let manejador: (req: IncomingMessage, res: ServerResponse, cuerpo: Buffer) => void = (_req, res) => {
  res.writeHead(200).end();
};
const sockets = new Set<import("node:net").Socket>();

before(async () => {
  servidor = createServer((req, res) => {
    const trozos: Buffer[] = [];
    req.on("data", (t: Buffer) => trozos.push(t));
    req.on("end", () => {
      const cuerpo = Buffer.concat(trozos);
      recibidas.push({ metodo: req.method ?? "", ruta: req.url ?? "", cabeceras: req.headers, cuerpo });
      manejador(req, res, cuerpo);
    });
  });
  servidor.on("connection", (s) => {
    sockets.add(s);
    s.on("close", () => sockets.delete(s));
  });
  await new Promise<void>((resolver) => servidor.listen(0, "127.0.0.1", resolver));
  base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
});
after(async () => {
  for (const s of sockets) s.destroy();
  await new Promise<void>((resolver) => servidor.close(() => resolver()));
});
beforeEach(() => {
  recibidas = [];
  manejador = (_req, res) => {
    res.writeHead(200).end();
  };
});

const reenviador = (timeoutMs?: number) =>
  new ReenviadorTwilioHttp({ urlEntrantes: `${base}/twilio/callback`, urlEstados: `${base}/twilio/delivery_status`, ...(timeoutMs ? { timeoutMs } : {}) });

/** Cuerpo con todo lo delicado: `+`, `=`, `&` escapados, `%`, un `ñ` en UTF-8 crudo y bytes que no son UTF-8. */
const CUERPO = Buffer.concat([
  Buffer.from("Body=Hola%2C+qu%C3%A9+tal&ProfileName=Mam%c3%a1+de+So"),
  Buffer.from("ñ"), // 0xC3 0xB1 crudo
  Buffer.from("&ReferralCtwaClid=AffXyz_-123%2Fabc%3D%3D&Extra=a%26b%3Dc+d&From=whatsapp%3A%2B5215512345678&Raro="),
  Buffer.from([0xff, 0xfe, 0x00, 0x7f]),
]);

test("el cuerpo llega BYTE A BYTE (ReferralCtwaClid, +, =, &, ñ, bytes inválidos) y por POST a la ruta del tipo", async () => {
  await reenviador().reenviar({ tipo: "entrante", cuerpo: CUERPO, cabeceras: { "content-type": "application/x-www-form-urlencoded" } });
  assert.equal(recibidas.length, 1);
  assert.equal(recibidas[0]!.metodo, "POST");
  assert.equal(recibidas[0]!.ruta, "/twilio/callback");
  assert.ok(Buffer.compare(recibidas[0]!.cuerpo, CUERPO) === 0, "los bytes son idénticos");

  await reenviador().reenviar({ tipo: "estado", cuerpo: Buffer.from("MessageSid=SM1&MessageStatus=read"), cabeceras: {} });
  assert.equal(recibidas[1]!.ruta, "/twilio/delivery_status");
  assert.equal(recibidas[1]!.cuerpo.toString(), "MessageSid=SM1&MessageStatus=read");
});

test("las cabeceras permitidas viajan y se marca el reenvío; el cuerpo vacío también se reenvía", async () => {
  await reenviador().reenviar({
    tipo: "entrante",
    cuerpo: Buffer.alloc(0),
    cabeceras: { "content-type": "application/x-www-form-urlencoded", "x-twilio-signature": "firma-original", "i-twilio-idempotency-token": "token-1" },
  });
  const h = recibidas[0]!.cabeceras;
  assert.equal(h["content-type"], "application/x-www-form-urlencoded");
  assert.equal(h["x-twilio-signature"], "firma-original");
  assert.equal(h["i-twilio-idempotency-token"], "token-1");
  assert.equal(h["x-reenviado-por"], "borde-inscripciones");
  assert.equal(recibidas[0]!.cuerpo.length, 0);
});

test("cualquier 2xx es éxito (200, 204); 4xx y 5xx son fallo con el estado en el mensaje", async () => {
  for (const estado of [200, 201, 204]) {
    manejador = (_req, res) => void res.writeHead(estado).end();
    await reenviador().reenviar({ tipo: "entrante", cuerpo: CUERPO, cabeceras: {} });
  }
  for (const estado of [400, 401, 404, 422, 500, 502, 503]) {
    manejador = (_req, res) => void res.writeHead(estado).end("error");
    await assert.rejects(reenviador().reenviar({ tipo: "entrante", cuerpo: CUERPO, cabeceras: {} }), (e: unknown) => e instanceof ErrorReenvio && e.message.includes(String(estado)), String(estado));
  }
});

test("EA-04: una redirección (301, 302, 307, 308) es FALLO y NO se sigue: el POST sin cuerpo nunca llega al destino", async () => {
  for (const estado of [301, 302, 303, 307, 308]) {
    recibidas = [];
    manejador = (req, res) => {
      if (req.url === "/login") res.writeHead(200).end("<html>login</html>"); // el destino de la redirección «responde bien»
      else res.writeHead(estado, { location: "/login" }).end();
    };
    await assert.rejects(reenviador().reenviar({ tipo: "entrante", cuerpo: CUERPO, cabeceras: {} }), (e: unknown) => e instanceof ErrorReenvio && /redirecci[oó]n/.test(e.message), String(estado));
    assert.deepEqual(recibidas.map((r) => `${r.metodo} ${r.ruta}`), ["POST /twilio/callback"], `${estado}: no se siguió la redirección`);
  }
});

test("tiempo agotado: el servidor no responde a tiempo → ErrorReenvio", async () => {
  manejador = () => {
    /* nunca responde */
  };
  const inicio = Date.now();
  await assert.rejects(reenviador(150).reenviar({ tipo: "entrante", cuerpo: CUERPO, cabeceras: {} }), ErrorReenvio);
  assert.ok(Date.now() - inicio < 2000, "corta cerca del límite configurado");
});

test("conexión rechazada (Chatwoot caído) → ErrorReenvio", async () => {
  const caido = new ReenviadorTwilioHttp({ urlEntrantes: "http://127.0.0.1:1/twilio/callback", urlEstados: "http://127.0.0.1:1/x", timeoutMs: 500 });
  await assert.rejects(caido.reenviar({ tipo: "entrante", cuerpo: CUERPO, cabeceras: {} }), ErrorReenvio);
});

test("una conexión cortada a media respuesta → ErrorReenvio (ante la duda, fallo: el reenvío se reintenta)", async () => {
  manejador = (req) => void req.socket.destroy();
  await assert.rejects(reenviador().reenviar({ tipo: "entrante", cuerpo: CUERPO, cabeceras: {} }), ErrorReenvio);
});
