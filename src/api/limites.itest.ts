// Límites de peticiones sobre la API real (B6): login y resto de /api, por IP, con 429 + Retry-After.
// Postgres real (el login consulta la base). El reloj del limitador es de mentira para ver la recarga.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { limitesDesdeEntorno } from "../http/config-limites.ts";
import { LimitadorDeTasa, perfilPorMinuto } from "../http/limite.ts";
import { firmarCuerpoChatwoot } from "../mensajeria/chatwoot/webhook.ts";
import { crearPrismaDePruebas, type PrismaPruebas } from "../testutil/prisma-pruebas.ts";
import { sembrarOrganizacion, type OrganizacionDePrueba } from "../testutil/semilla.ts";
import { levantarApi, sembrarUsuario, type UsuarioDePrueba } from "../testutil/api.ts";

let prisma: PrismaPruebas;
let org: OrganizacionDePrueba;
let usuario: UsuarioDePrueba;

before(async () => {
  prisma = crearPrismaDePruebas();
  org = await sembrarOrganizacion(prisma, "Limites");
  usuario = await sembrarUsuario(prisma, org.organizacionId, { rol: "administrador" });
});
after(async () => {
  await prisma.$disconnect();
});

function montar(o: { login?: number; api?: number; confiarEnProxy?: boolean | number | string } = {}) {
  let ms = 5_000_000;
  const reloj = { ahora: () => ms, avanzar: (n: number) => void (ms += n) };
  const limites = { ...limitesDesdeEntorno({}), login: perfilPorMinuto(o.login ?? 4), api: perfilPorMinuto(o.api ?? 100) };
  const api = levantarApi(prisma, {}, { limites, limitador: new LimitadorDeTasa({ reloj: reloj.ahora }), ...(o.confiarEnProxy !== undefined ? { confiarEnProxy: o.confiarEnProxy } : {}) });
  return { api, reloj };
}

const intentoMalo = (c: ReturnType<ReturnType<typeof montar>["api"]["cliente"]>) =>
  c.post<{ error: { codigo: string } }>("/api/sesion", { organizacion: org.slug, correo: `nadie-${randomUUID().slice(0, 8)}@prueba.test`, contrasena: "contrasena-equivocada" });

test("login: tras el cupo por IP responde 429 `limite_excedido` con Retry-After, incluso con la contraseña correcta", async () => {
  const { api } = montar({ login: 4 });
  try {
    const c = api.cliente();
    for (let i = 0; i < 4; i++) assert.equal((await intentoMalo(c)).estado, 401, `intento ${i + 1}`);
    const r = await intentoMalo(c);
    assert.equal(r.estado, 429);
    assert.equal(r.cuerpo.error.codigo, "limite_excedido");
    assert.ok(Number(r.cabeceras.get("retry-after")) >= 1);
    assert.equal((await c.login(org.slug, usuario.correo, usuario.contrasena)).estado, 429, "ni el correcto pasa mientras la IP está limitada");
    assert.equal(c.cookieDeSesion, undefined);
  } finally {
    await api.cerrar();
  }
});

test("login: otra IP (detrás de un proxy de confianza) no se afecta, y la recarga devuelve el acceso", async () => {
  const { api, reloj } = montar({ login: 4, confiarEnProxy: 1 });
  try {
    const a = api.cliente();
    a.cabecerasExtra = { "x-forwarded-for": "203.0.113.5" };
    for (let i = 0; i < 4; i++) await intentoMalo(a);
    assert.equal((await intentoMalo(a)).estado, 429);

    const b = api.cliente();
    b.cabecerasExtra = { "x-forwarded-for": "198.51.100.7" };
    assert.equal((await b.login(org.slug, usuario.correo, usuario.contrasena)).estado, 201, "otra IP entra normal");

    reloj.avanzar(16_000); // 4 por minuto = 1 ficha cada 15 s
    assert.equal((await a.login(org.slug, usuario.correo, usuario.contrasena)).estado, 201, "recargó una ficha");
  } finally {
    await api.cerrar();
  }
});

test("sin `trust proxy`, falsificar X-Forwarded-For no da cupo nuevo", async () => {
  const { api } = montar({ login: 3 });
  try {
    const c = api.cliente();
    for (let i = 0; i < 3; i++) {
      c.cabecerasExtra = { "x-forwarded-for": `10.1.1.${i + 1}` };
      assert.equal((await intentoMalo(c)).estado, 401);
    }
    c.cabecerasExtra = { "x-forwarded-for": "10.9.9.9" };
    assert.equal((await intentoMalo(c)).estado, 429);
  } finally {
    await api.cerrar();
  }
});

test("el resto de /api también tiene su límite por IP (más holgado), antes de revisar la sesión", async () => {
  const { api } = montar({ api: 5, login: 100 });
  try {
    const c = api.cliente();
    for (let i = 0; i < 5; i++) assert.equal((await c.get("/api/yo")).estado, 401);
    const r = await c.get<{ error: { codigo: string } }>("/api/yo");
    assert.equal(r.estado, 429);
    assert.equal(r.cuerpo.error.codigo, "limite_excedido");
    assert.ok(r.cabeceras.get("retry-after"));
  } finally {
    await api.cerrar();
  }
});

test("el límite de la API no ahoga el uso normal: 90 peticiones de un usuario con sesión pasan con el cupo por defecto", async () => {
  const api = levantarApi(prisma, {}, { limites: limitesDesdeEntorno({}), limitador: new LimitadorDeTasa() });
  try {
    const c = api.cliente();
    assert.equal((await c.login(org.slug, usuario.correo, usuario.contrasena)).estado, 201);
    for (let i = 0; i < 90; i++) assert.equal((await c.get("/api/yo")).estado, 200);
  } finally {
    await api.cerrar();
  }
});

test("un webhook de Chatwoot firmado pasa aunque la IP haya agotado el cupo de login y de API (cupos separados)", async () => {
  const { api } = montar({ login: 2, api: 3 });
  try {
    const c = api.cliente();
    for (let i = 0; i < 3; i++) await intentoMalo(c);
    assert.equal((await intentoMalo(c)).estado, 429);
    const cuerpo = JSON.stringify({ event: "message_updated" });
    const ts = String(Math.floor(Date.now() / 1000));
    const r = await fetch(`${api.base}/webhooks/chatwoot`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-chatwoot-timestamp": ts, "x-chatwoot-signature": firmarCuerpoChatwoot("secreto-de-prueba", ts, Buffer.from(cuerpo)) },
      body: cuerpo,
    });
    await r.arrayBuffer();
    assert.equal(r.status, 200);
  } finally {
    await api.cerrar();
  }
});
