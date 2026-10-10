// V13-fix EV-01: todos los routers distinguen mayúsculas y barra final, y nadie vuelve a crear un `Router()` suelto.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { createHmac } from "node:crypto";
import { crearApp } from "./app.ts";
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

// V13-fix (verificación): `strict routing` quitó la barra final de TODO fuera de /api. Twilio, Chatwoot, el balanceador y Prometheus llaman a la dirección tal cual se escribió en su consola: con
// una barra final antes entraban y después eran un 404 (un WhatsApp entrante perdido en silencio). Las rutas públicas aceptan UNA barra final; /api y lo demás siguen exactas.
test("las rutas públicas de fuera de /api (webhooks, salud, métricas) siguen aceptando una barra final; /api, otra capitalización y dos barras no", async () => {
  const TOKEN = "token-de-prueba";
  const BASE = "https://escuela.example.test";
  const cuerpo = "Body=Hola&From=whatsapp%3A%2B5215512345678&MessageSid=SM1&To=whatsapp%3A%2B14155238886";
  const firmar = (ruta: string): string => {
    const p = Object.fromEntries(new URLSearchParams(cuerpo));
    let datos = `${BASE}${ruta}`;
    for (const k of Object.keys(p).sort()) datos += k + p[k];
    return createHmac("sha1", TOKEN).update(datos).digest("base64");
  };
  const recibidos: string[] = [];
  const app = crearApp({
    pingDb: async () => {},
    secretoWebhookChatwoot: "s",
    procesarEntrante: async () => ({ resultado: "procesado" }),
    registrarTomaDeConversacion: async () => "tomada",
    estadosEntrega: { interpretar: () => null },
    registrarEstadoEntrega: async () => "actualizado",
    metricas: { token: "tok", texto: async () => "x 1\n" },
    twilio: {
      authToken: TOKEN,
      publicBaseUrl: BASE,
      borde: {
        procesar: async (e: { tipo: string }) => {
          recibidos.push(e.tipo);
          return "reenviado" as const;
        },
        reenviarPendientes: async () => ({ reenviados: 0, fallidos: 0, abandonados: 0, errores: 0 }),
        reenviarSinRegistro: async () => true,
        alertas: { organizacionDesconocida: 0, eventosAbandonados: 0 },
      } as never,
    },
    api: { prisma: {} as never },
    landing: { prisma: {} as never },
  });
  const servidor = escucharSinReuso(app);
  try {
    const base = `http://127.0.0.1:${await puertoDe(servidor)}`;
    const pedir = (metodo: string, ruta: string, cab: Record<string, string> = {}, body?: string) => fetch(base + ruta, { method: metodo, headers: cab, ...(body !== undefined ? { body } : {}) });
    for (const ruta of ["/webhooks/twilio/entrantes", "/webhooks/twilio/estados", "/twilio/delivery_status"]) {
      for (const con of [ruta, `${ruta}/`, `${ruta}/?x=1`]) {
        // Twilio firma la dirección TAL CUAL la llamó (con la barra y la consulta, si las trae).
        const r = await pedir("POST", con, { "content-type": "application/x-www-form-urlencoded", "x-twilio-signature": firmar(con) }, cuerpo);
        assert.equal(r.status, 200, `${con} firmado`);
        assert.equal((await pedir("POST", con, { "content-type": "application/x-www-form-urlencoded" }, cuerpo)).status, 403, `${con} sin firma: existe pero no entra`);
      }
    }
    assert.equal(recibidos.length, 9);
    assert.equal((await pedir("POST", "/webhooks/twilio/diagnostico/", { "content-type": "application/x-www-form-urlencoded", "x-twilio-signature": firmar("/webhooks/twilio/diagnostico/") }, cuerpo)).status, 200);
    assert.equal((await pedir("POST", "/webhooks/chatwoot/", { "content-type": "application/json" }, "{}")).status, 401, "existe; sin firma no entra");
    assert.equal((await pedir("GET", "/salud/")).status, 200);
    assert.equal((await pedir("HEAD", "/salud/")).status, 200);
    assert.equal((await pedir("GET", "/salud/lista/")).status, 200);
    assert.equal((await pedir("GET", "/metricas/", { authorization: "Bearer tok" })).status, 200);
    assert.equal((await pedir("GET", "/metricas/")).status, 401);
    // Lo que NO se afloja: otra capitalización (también /API) y dos barras. (/api/… con barra final sigue siendo 404 con sesión: lo prueba modulos-api.itest.ts.)
    for (const ruta of ["/Webhooks/chatwoot", "/webhooks/chatwoot//", "/Salud", "/API/yo"]) assert.equal((await pedir(ruta.startsWith("/webhooks") ? "POST" : "GET", ruta, { "content-type": "application/json" }, ruta.startsWith("/webhooks") ? "{}" : undefined)).status, 404, ruta);
  } finally {
    servidor.close();
  }
});
