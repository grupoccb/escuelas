// V2, decisión 7, de punta a punta: la app real con la protección de orígenes de /api y de la landing, en tres entornos (desarrollo con ORIGEN_PUBLICO, desarrollo sin nada
// configurado y producción) × los orígenes que importan: localhost, 127.0.0.1, ORIGEN_PUBLICO, uno ajeno, sin cabecera Origin, `null` y subdominios que parecen locales.
// Se prueba lo que cambia algo (iniciar sesión, cerrar sesión) y la cookie que sale (o que no sale).

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { crearPrismaDePruebas, type PrismaPruebas } from "../testutil/prisma-pruebas.ts";
import { sembrarOrganizacion, type OrganizacionDePrueba } from "../testutil/semilla.ts";
import { levantarApi, sembrarUsuario, type ApiLevantada } from "../testutil/api.ts";

let prisma: PrismaPruebas;
let org: OrganizacionDePrueba;
before(async () => {
  prisma = crearPrismaDePruebas();
  org = await sembrarOrganizacion(prisma, "Origenes");
});
after(async () => {
  await prisma.$disconnect();
});

const PUBLICO = "https://app.escuela.example";
type Veredicto = "pasa" | "rechaza";

/** [origen que manda el navegador (undefined = sin cabecera), desarrollo con ORIGEN_PUBLICO, desarrollo sin configurar, producción] */
const MATRIZ: [string | undefined, Veredicto, Veredicto, Veredicto][] = [
  ["http://localhost:3000", "pasa", "pasa", "rechaza"],
  ["http://localhost:5173", "pasa", "pasa", "rechaza"],
  ["http://127.0.0.1:3000", "pasa", "pasa", "rechaza"],
  ["http://127.0.0.1:4318", "pasa", "pasa", "rechaza"],
  [PUBLICO, "pasa", "rechaza", "pasa"],
  ["https://malo.example", "rechaza", "rechaza", "rechaza"],
  ["null", "rechaza", "rechaza", "rechaza"],
  [undefined, "pasa", "pasa", "pasa"], // sin Origin ni Referer no es un navegador: lo frena la capa del JSON, que aquí se cumple
  ["http://localhost.evil.com", "rechaza", "rechaza", "rechaza"],
  ["http://localhost@evil.com", "rechaza", "rechaza", "rechaza"],
  ["http://127.0.0.1.evil.com", "rechaza", "rechaza", "rechaza"],
  ["https://localhost:3000", "rechaza", "rechaza", "rechaza"],
];

interface Escenario {
  nombre: string;
  api: Parameters<typeof levantarApi>[1];
  columna: 1 | 2 | 3;
  /** ¿La cookie de sesión sale con Secure y el prefijo __Host-? */
  cookieSegura: boolean;
}

const ESCENARIOS: Escenario[] = [
  { nombre: "desarrollo con ORIGEN_PUBLICO", api: { origenesPermitidos: [PUBLICO], origenesLocales: true }, columna: 1, cookieSegura: false },
  { nombre: "desarrollo sin configurar nada", api: { origenesPermitidos: [], origenesLocales: true }, columna: 2, cookieSegura: false },
  { nombre: "producción", api: { origenesPermitidos: [PUBLICO], origenesLocales: false, cookieSegura: true }, columna: 3, cookieSegura: true },
];

for (const e of ESCENARIOS) {
  test(`V2 matriz de orígenes en ${e.nombre}: iniciar y cerrar sesión, y la cookie`, async () => {
    const api: ApiLevantada = levantarApi(prisma, e.api);
    await api.listo;
    try {
      const u = await sembrarUsuario(prisma, org.organizacionId, { rol: "asesor" });
      const cuerpo = { organizacion: org.slug, correo: u.correo, contrasena: u.contrasena };
      const nombreCookie = e.cookieSegura ? "__Host-sesion" : "sesion";
      for (const fila of MATRIZ) {
        const origen = fila[0];
        const esperado = fila[e.columna] as Veredicto;
        const c = api.cliente();
        const antes = await prisma.sesion.count({ where: { usuario_id: u.id } });
        const cab: Record<string, string> = origen === undefined ? {} : { origin: origen };
        const login = await c.pedir<{ error?: { codigo: string } }>("POST", "/api/sesion", cuerpo, cab);
        const setCookie = login.cabeceras.getSetCookie()[0] ?? "";
        const despues = await prisma.sesion.count({ where: { usuario_id: u.id } });
        const que = `${e.nombre} · ${JSON.stringify(origen)}`;
        if (esperado === "pasa") {
          assert.equal(login.estado, 201, `iniciar sesión: ${que}`);
          assert.equal(despues, antes + 1, `se creó la sesión: ${que}`);
          assert.match(setCookie, new RegExp(`^${nombreCookie}=`), `nombre de la cookie: ${que}`);
          assert.match(setCookie, /HttpOnly/i);
          assert.match(setCookie, /SameSite=Lax/i);
          if (e.cookieSegura) assert.match(setCookie, /Secure/i, `la cookie de producción es Secure: ${que}`);
          else assert.doesNotMatch(setCookie, /Secure/i, `en local la cookie no es Secure (se entra por http): ${que}`);
          // Cerrar sesión (DELETE) con el mismo origen también pasa; con uno ajeno ya está cubierto por las filas que rechazan.
          const cierre = await c.pedir("DELETE", "/api/sesion", undefined, cab);
          assert.equal(cierre.estado, 204, `cerrar sesión: ${que}`);
        } else {
          assert.equal(login.estado, 403, `iniciar sesión: ${que}`);
          assert.equal(login.cuerpo.error?.codigo, "prohibido");
          assert.equal(setCookie, "", `no sale cookie: ${que}`);
          assert.equal(despues, antes, `no se creó ninguna sesión: ${que}`);
          assert.equal(c.cookieDeSesion, undefined);
        }
      }
      // Con sesión iniciada, una escritura de otro origen no pasa, y la misma desde un origen bueno sí.
      const c = api.cliente();
      assert.equal((await c.pedir("POST", "/api/sesion", cuerpo, e.columna === 3 ? { origin: PUBLICO } : { origin: "http://127.0.0.1:3000" })).estado, 201);
      assert.equal((await c.pedir("DELETE", "/api/sesion", undefined, { origin: "http://localhost.evil.com" })).estado, 403, "el cierre de sesión ajeno no cierra nada");
      assert.equal((await c.get("/api/yo")).estado, 200);
    } finally {
      await api.cerrar();
    }
  });

  test(`V2 el Referer cuenta igual que el Origin (sin Origin) en ${e.nombre}`, async () => {
    const api = levantarApi(prisma, e.api);
    await api.listo;
    try {
      const u = await sembrarUsuario(prisma, org.organizacionId, { rol: "asesor" });
      const cuerpo = { organizacion: org.slug, correo: u.correo, contrasena: u.contrasena };
      for (const [referer, localOk, publicoOk] of [
        ["http://localhost:3000/pantalla", true, false],
        ["http://127.0.0.1:3000/", true, false],
        [`${PUBLICO}/inicio`, false, true],
        ["https://malo.example/pagina", false, false],
        ["http://localhost.evil.com/x", false, false],
      ] as const) {
        const local = e.columna !== 3;
        const publicoConfigurado = e.columna !== 2;
        const esperado = (local && localOk) || (publicoConfigurado && publicoOk);
        const r = await api.cliente().pedir("POST", "/api/sesion", cuerpo, { referer });
        assert.equal(r.estado, esperado ? 201 : 403, `${e.nombre} · Referer ${referer}`);
      }
    } finally {
      await api.cerrar();
    }
  });
}

test("V2 el valor por omisión sale del entorno: sin NODE_ENV=production es local; con él, producción acepta solo ORIGEN_PUBLICO", async () => {
  for (const [entorno, localOk, publicoOk] of [
    [{ ORIGEN_PUBLICO: PUBLICO }, true, true],
    [{ NODE_ENV: "development", ORIGEN_PUBLICO: PUBLICO }, true, true],
    [{ NODE_ENV: "production", ORIGEN_PUBLICO: PUBLICO, COOKIE_SEGURA: "false" }, false, true],
    [{ NODE_ENV: "production", ORIGEN_PUBLICO: "http://localhost:3000", ENTORNO_DEMO: "si", COOKIE_SEGURA: "false" }, true, true], // la demo de docker compose
  ] as const) {
    // `entorno` manda en los valores por omisión; la cookie la fijamos sin Secure para que el cliente de prueba pueda seguir usándola.
    const api = levantarApi(prisma, { entorno: entorno as NodeJS.ProcessEnv, origenesPermitidos: undefined as never, cookieSegura: false });
    await api.listo;
    try {
      const u = await sembrarUsuario(prisma, org.organizacionId, { rol: "asesor" });
      const cuerpo = { organizacion: org.slug, correo: u.correo, contrasena: u.contrasena };
      assert.equal((await api.cliente().pedir("POST", "/api/sesion", cuerpo, { origin: "http://127.0.0.1:3000" })).estado, localOk ? 201 : 403, JSON.stringify(entorno));
      assert.equal((await api.cliente().pedir("POST", "/api/sesion", cuerpo, { origin: "http://localhost:3000" })).estado, localOk ? 201 : 403, JSON.stringify(entorno));
      assert.equal((await api.cliente().pedir("POST", "/api/sesion", cuerpo, { origin: new URL(entorno.ORIGEN_PUBLICO).origin })).estado, publicoOk ? 201 : 403);
      assert.equal((await api.cliente().pedir("POST", "/api/sesion", cuerpo, { origin: "https://malo.example" })).estado, 403);
    } finally {
      await api.cerrar();
    }
  }
});
