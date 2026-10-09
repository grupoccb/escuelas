// V2, decisión 7: qué origen acepta la aplicación para una petición que cambia algo. En desarrollo local, `localhost` y `127.0.0.1` (cualquier puerto) sin
// configurar nada; en producción, SOLO `ORIGEN_PUBLICO`. Tabla entorno × origen sobre la regla pura; la misma regla pasa por la API real en origenes.itest.ts.

import { test } from "node:test";
import type { Request } from "express";
import assert from "node:assert/strict";
import { esOrigenLocal, origenAceptado, origenesPermitidosDesdeEntorno, politicaDeOrigenesDesdeEntorno, type PoliticaDeOrigenes } from "./csrf.ts";
import { esEntornoLocal } from "../seguridad/entorno.ts";
import { origenDelEnvioAceptable } from "../http/landing.ts";

const PUBLICO = "https://app.escuela.example";

test("esEntornoLocal: todo lo que no sea producción es local; producción solo si es la demo declarada (ENTORNO_DEMO=si)", () => {
  const casos: [NodeJS.ProcessEnv, boolean][] = [
    [{}, true],
    [{ NODE_ENV: "development" }, true],
    [{ NODE_ENV: "test" }, true],
    [{ NODE_ENV: "production" }, false],
    [{ NODE_ENV: "production", ENTORNO_DEMO: "no" }, false],
    [{ NODE_ENV: "production", ENTORNO_DEMO: "" }, false],
    [{ NODE_ENV: "production", ENTORNO_DEMO: "si" }, true],
    [{ NODE_ENV: "production", ENTORNO_DEMO: " SI " }, true],
  ];
  for (const [env, esperado] of casos) assert.equal(esEntornoLocal(env), esperado, JSON.stringify(env));
});

test("politicaDeOrigenesDesdeEntorno: lo configurado se normaliza (sin ruta, sin barra) y lo local sale de esEntornoLocal", () => {
  assert.deepEqual(politicaDeOrigenesDesdeEntorno({ ORIGEN_PUBLICO: `${PUBLICO}/ruta/, https://otro.example:8443` }), { exactos: [PUBLICO, "https://otro.example:8443"], locales: true });
  assert.deepEqual(politicaDeOrigenesDesdeEntorno({ NODE_ENV: "production", ORIGEN_PUBLICO: PUBLICO }), { exactos: [PUBLICO], locales: false });
  assert.deepEqual(origenesPermitidosDesdeEntorno({ ORIGEN_PUBLICO: "javascript:alert(1), no-es-url" }), [], "lo que no es http(s) no es un origen");
});

// [origen tal como llega, lo acepta el desarrollo local con ORIGEN_PUBLICO, lo acepta producción]
const ORIGENES: [string | undefined, boolean, boolean][] = [
  ["http://localhost:3000", true, false],
  ["http://localhost:5173", true, false],
  ["http://localhost", true, false],
  ["http://127.0.0.1:3000", true, false],
  ["http://127.0.0.1:4318", true, false],
  ["http://127.0.0.1", true, false],
  [PUBLICO, true, true],
  ["https://app.escuela.example:8443", false, false], // otro puerto del origen público: otro origen
  ["http://app.escuela.example", false, false], // otro esquema
  ["https://malo.example", false, false],
  ["null", false, false],
  ["", false, false],
  [undefined, false, false],
  ["no es una url", false, false],
  ["javascript:alert(1)", false, false],
  // Subdominios y trucos que PARECEN locales:
  ["http://localhost.evil.com", false, false],
  ["http://localhost.evil.com:3000", false, false],
  ["http://127.0.0.1.evil.com", false, false],
  ["http://localhost@evil.com", false, false],
  ["http://evil.com/localhost", false, false],
  ["http://evil.com?x=http://localhost:3000", false, false],
  ["http://mylocalhost", false, false],
  ["http://localhost:3000.evil.com", false, false],
  ["http://127.0.0.1:3000@evil.com", false, false],
  ["https://localhost:3000", false, false], // lo local es http: nada pone https en la máquina propia
  ["http://[::1]:3000", false, false], // solo los dos nombres acordados
  ["http://0.0.0.0:3000", false, false],
  ["http://127.0.0.2:3000", false, false],
];

test("matriz entorno × origen: en desarrollo valen localhost y 127.0.0.1 (cualquier puerto) además de ORIGEN_PUBLICO; en producción, SOLO ORIGEN_PUBLICO", () => {
  const desarrollo: PoliticaDeOrigenes = { exactos: [PUBLICO], locales: true };
  const produccion: PoliticaDeOrigenes = { exactos: [PUBLICO], locales: false };
  for (const [origen, enDesarrollo, enProduccion] of ORIGENES) {
    // Con un Host que NO coincide con ninguno de los orígenes de la prueba: lo único que cuenta es la política.
    assert.equal(origenAceptado(origen, desarrollo, "interno:3000"), enDesarrollo, `desarrollo con ${JSON.stringify(origen)}`);
    assert.equal(origenAceptado(origen, produccion, "interno:3000"), enProduccion, `producción con ${JSON.stringify(origen)}`);
  }
});

test("desarrollo sin ORIGEN_PUBLICO: valen los dos hosts locales y el propio host de la petición; producción sin ORIGEN_PUBLICO no acepta ningún origen de navegador", () => {
  const desarrollo: PoliticaDeOrigenes = { exactos: [], locales: true };
  const produccion: PoliticaDeOrigenes = { exactos: [], locales: false };
  assert.equal(origenAceptado("http://localhost:3000", desarrollo, "x"), true);
  assert.equal(origenAceptado("http://127.0.0.1:3000", desarrollo, "x"), true);
  assert.equal(origenAceptado("http://mi-equipo.local:3000", desarrollo, "mi-equipo.local:3000"), true, "el propio host, solo en local y sin nada configurado");
  assert.equal(origenAceptado("http://mi-equipo.local:3000", desarrollo, "otro:3000"), false);
  assert.equal(origenAceptado("https://malo.example", desarrollo, "app:3000"), false);
  for (const [origen] of ORIGENES) assert.equal(origenAceptado(origen, produccion, "app.escuela.example"), false, `producción vacía con ${JSON.stringify(origen)}`);
  assert.equal(origenAceptado(PUBLICO, produccion, new URL(PUBLICO).host), false, "ni el propio host: sin ORIGEN_PUBLICO no hay origen");
});

test("con ORIGEN_PUBLICO configurado el propio host ya no vale por sí solo (ni en local)", () => {
  assert.equal(origenAceptado("http://mi-equipo.local:3000", { exactos: [PUBLICO], locales: true }, "mi-equipo.local:3000"), false);
});

test("esOrigenLocal compara el nombre de host completo, no un prefijo", () => {
  for (const o of ["http://localhost", "http://localhost:1", "http://localhost:65535", "http://127.0.0.1:3000", "http://LOCALHOST:3000"]) assert.equal(esOrigenLocal(o), true, o);
  for (const o of ["http://localhost.evil.com", "http://localhost@evil.com", "http://evil.localhost.com", "https://localhost", "ftp://localhost", "localhost:3000", ""]) assert.equal(esOrigenLocal(o), false, o);
});

test("la landing usa la misma regla (origenDelEnvioAceptable): sin Origin o con null pasa; cross-site no; y el resto, la política", () => {
  const peticion = (cab: Record<string, string>) => ({ get: ((n: string) => cab[n.toLowerCase()]) as Request["get"] });
  const produccion: PoliticaDeOrigenes = { exactos: [PUBLICO], locales: false };
  const desarrollo: PoliticaDeOrigenes = { exactos: [PUBLICO], locales: true };
  assert.equal(origenDelEnvioAceptable(peticion({}), produccion), true);
  assert.equal(origenDelEnvioAceptable(peticion({ origin: "null" }), produccion), true);
  assert.equal(origenDelEnvioAceptable(peticion({ origin: "http://localhost:3000", "sec-fetch-site": "cross-site" }), desarrollo), false);
  assert.equal(origenDelEnvioAceptable(peticion({ origin: "http://localhost:3000" }), desarrollo), true);
  assert.equal(origenDelEnvioAceptable(peticion({ origin: "http://localhost:3000" }), produccion), false);
  assert.equal(origenDelEnvioAceptable(peticion({ origin: "http://127.0.0.1:3000" }), produccion), false);
  assert.equal(origenDelEnvioAceptable(peticion({ origin: PUBLICO }), produccion), true);
  assert.equal(origenDelEnvioAceptable(peticion({ origin: "no es una url" }), desarrollo), false);
});
