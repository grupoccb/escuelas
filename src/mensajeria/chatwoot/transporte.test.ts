// TransporteChatwoot contra un servidor HTTP local: distingue "no se pudo contactar a Chatwoot /
// error definitivo" (el mensaje NO salió) de "resultado desconocido" (pudo haber salido). F1-03b.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { EnvioIncierto, ErrorTransporte } from "../transporte.ts";
import { TransporteChatwoot, clasificarFalloDeRed } from "./transporte.ts";

const DESTINO = { chatwootAccountId: 1, chatwootConversacionId: 2 };

let servidor: Server;
let puerto: number;
let manejador: (req: IncomingMessage, res: ServerResponse) => void = () => {};
const sockets = new Set<import("node:net").Socket>();

before(async () => {
  servidor = createServer((req, res) => manejador(req, res));
  servidor.on("connection", (s) => {
    sockets.add(s);
    s.on("close", () => sockets.delete(s));
  });
  await new Promise<void>((r) => servidor.listen(0, "127.0.0.1", r));
  puerto = (servidor.address() as AddressInfo).port;
});
after(async () => {
  for (const s of sockets) s.destroy();
  await new Promise<void>((r) => servidor.close(() => r()));
});

const transporte = (url = `http://127.0.0.1:${puerto}`, timeoutMs = 300) => new TransporteChatwoot({ url, tokenBot: "t", timeoutMs });
const responder = (estado: number, cuerpo: string) => (_req: IncomingMessage, res: ServerResponse) => {
  res.writeHead(estado, { "content-type": "application/json" });
  res.end(cuerpo);
};

test("200 con id: devuelve el id", async () => {
  manejador = responder(200, '{"id": 77}');
  assert.deepEqual(await transporte().enviarMensaje(DESTINO, "hola"), { idExterno: "77" });
});

test("tiempo agotado (Chatwoot no responde): EnvioIncierto, no un fallo simple", async () => {
  manejador = () => {}; // nunca responde
  const t = transporte(undefined, 80);
  await assert.rejects(t.enviarMensaje(DESTINO, "hola"), (e) => e instanceof EnvioIncierto);
});

test("conexión cortada a media respuesta: EnvioIncierto", async () => {
  manejador = (req) => req.socket.destroy();
  await assert.rejects(transporte().enviarMensaje(DESTINO, "hola"), (e) => e instanceof EnvioIncierto);
});

test("Chatwoot responde 2xx pero sin id, o con un cuerpo ilegible: EnvioIncierto (el mensaje se creó)", async () => {
  manejador = responder(200, "{}");
  await assert.rejects(transporte().enviarMensaje(DESTINO, "hola"), (e) => e instanceof EnvioIncierto);
  manejador = responder(200, "no es json");
  await assert.rejects(transporte().enviarMensaje(DESTINO, "hola"), (e) => e instanceof EnvioIncierto);
  manejador = responder(200, "null");
  await assert.rejects(transporte().enviarMensaje(DESTINO, "hola"), (e) => e instanceof EnvioIncierto);
});

test("error HTTP definitivo (401, 404, 422, 500): ErrorTransporte con su estado, NO incierto", async () => {
  for (const estado of [401, 404, 422, 500]) {
    manejador = responder(estado, '{"error":"x"}');
    await assert.rejects(transporte().enviarMensaje(DESTINO, "hola"), (e) => {
      assert.ok(e instanceof ErrorTransporte);
      assert.ok(!(e instanceof EnvioIncierto), `${estado} no es incierto`);
      assert.equal((e as ErrorTransporte).status, estado);
      return true;
    });
  }
});

test("408, 502 y 504 (se acabó el tiempo en el camino): EnvioIncierto", async () => {
  for (const estado of [408, 502, 504]) {
    manejador = responder(estado, "");
    await assert.rejects(transporte().enviarMensaje(DESTINO, "hola"), (e) => e instanceof EnvioIncierto, String(estado));
  }
});

test("no se pudo contactar a Chatwoot (conexión rechazada): ErrorTransporte definitivo, NO incierto", async () => {
  // Un puerto que acaba de cerrarse: nadie escucha.
  const efimero = createServer();
  await new Promise<void>((r) => efimero.listen(0, "127.0.0.1", r));
  const cerrado = (efimero.address() as AddressInfo).port;
  await new Promise<void>((r) => efimero.close(() => r()));
  await assert.rejects(transporte(`http://127.0.0.1:${cerrado}`).enviarMensaje(DESTINO, "hola"), (e) => {
    assert.ok(e instanceof ErrorTransporte);
    assert.ok(!(e instanceof EnvioIncierto));
    return true;
  });
});

test("abrir la conversación y la nota interna usan la misma clasificación", async () => {
  manejador = () => {};
  const t = transporte(undefined, 60);
  await assert.rejects(t.enviarNotaInterna(DESTINO, "nota"), (e) => e instanceof EnvioIncierto);
  await assert.rejects(t.abrirConversacion(DESTINO), (e) => e instanceof EnvioIncierto);
});

test("clasificarFalloDeRed: solo los errores que prueban que nunca llegó son definitivos; ante la duda, incierto", () => {
  const conCausa = (codigo: string) => Object.assign(new TypeError("fetch failed"), { cause: Object.assign(new Error("x"), { code: codigo }) });
  const agregado = Object.assign(new TypeError("fetch failed"), {
    cause: Object.assign(new AggregateError([]), { errors: [{ code: "ECONNREFUSED" }, { code: "ECONNREFUSED" }] }),
  });
  for (const c of ["ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "EHOSTUNREACH", "ENETUNREACH"]) {
    assert.ok(!(clasificarFalloDeRed(conCausa(c)) instanceof EnvioIncierto), c);
  }
  assert.ok(!(clasificarFalloDeRed(agregado) instanceof EnvioIncierto));
  for (const c of ["ECONNRESET", "UND_ERR_SOCKET", "ETIMEDOUT", "EPIPE"]) {
    assert.ok(clasificarFalloDeRed(conCausa(c)) instanceof EnvioIncierto, c);
  }
  assert.ok(clasificarFalloDeRed(new DOMException("timeout", "TimeoutError")) instanceof EnvioIncierto);
  assert.ok(clasificarFalloDeRed("algo raro") instanceof EnvioIncierto);
  assert.ok(clasificarFalloDeRed(null) instanceof EnvioIncierto);
});

test("clasificarFalloDeRed con códigos MEZCLADOS o ninguno: ante la duda, incierto (A5k)", () => {
  // Un error agregado donde una dirección rechazó la conexión y otra se cortó a media petición:
  // la segunda pudo haber llegado. No se puede dar por definitivo.
  const mezclado = Object.assign(new TypeError("fetch failed"), {
    cause: Object.assign(new AggregateError([]), { errors: [{ code: "ECONNREFUSED" }, { code: "ECONNRESET" }] }),
  });
  assert.ok(clasificarFalloDeRed(mezclado) instanceof EnvioIncierto);
  // Propio y de la causa, uno de cada clase.
  const propioYCausa = Object.assign(new Error("x"), { code: "ECONNREFUSED", cause: { code: "ETIMEDOUT" } });
  assert.ok(clasificarFalloDeRed(propioYCausa) instanceof EnvioIncierto);
  // Sin ningún código no hay con qué probar que nunca llegó.
  assert.ok(clasificarFalloDeRed(new TypeError("fetch failed")) instanceof EnvioIncierto);
  assert.ok(clasificarFalloDeRed(Object.assign(new Error("x"), { cause: {} })) instanceof EnvioIncierto);
  // Todos definitivos: sí es definitivo.
  assert.ok(!(clasificarFalloDeRed(Object.assign(new Error("x"), { code: "ENOTFOUND", cause: { code: "ECONNREFUSED" } })) instanceof EnvioIncierto));
});
