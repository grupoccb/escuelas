// Servidor de las pruebas en navegador (J): el backend REAL (la app de `src/http/app.ts`) con la interfaz compilada (`web/dist`), contra una base
// `*_pruebas` PROPIA (nunca la de la demo), con datos de prueba y un usuario por rol. Playwright lo levanta (`web/playwright.config.ts`).
//
//   DATABASE_URL=postgresql://…/inscripciones_navegador_pruebas PUERTO=4318 node scripts/navegador/servidor.ts
//
// Escribe `.tmp/navegador/mundo.json` (ids y credenciales de PRUEBA) para los tests. Sin Twilio ni Chatwoot: los envíos van a un transporte falso y la
// interfaz solo arma el enlace a Chatwoot (el navegador de pruebas bloquea toda petición fuera de este origen).

import { randomBytes } from "node:crypto";
import { mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PARAMETROS_PRUEBA } from "../../src/auth/contrasena.ts";
import { crearApp } from "../../src/http/app.ts";
import { limitesDesdeEntorno } from "../../src/http/config-limites.ts";
import { LimitadorDeTasa } from "../../src/http/limite.ts";
import { InscripcionesActivas } from "../../src/catalogo/cupo.ts";
import { ProveedorEconomicoDeFinanzas } from "../../src/finanzas/estado-cuenta.ts";
import { ProveedorProductosDeFinanzas } from "../../src/finanzas/productos.ts";
import { cifradorDesdeEntorno } from "../../src/sensibles/index.ts";
import { crearPrismaDePruebas } from "../../src/testutil/prisma-pruebas.ts";
import { ClienteApi } from "../../src/testutil/api.ts";
import { sembrarMundo } from "./mundo.ts";

const RAIZ = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const url = process.env["DATABASE_URL"];
if (!url || !/inscripciones_navegador_pruebas$/.test(url)) throw new Error("El servidor del navegador solo corre contra la base inscripciones_navegador_pruebas");
const puerto = Number(process.env["PUERTO"] ?? 4318);
// Un `mundo.json` de una corrida anterior no vale: quien espera (e2e/preparar.ts) lo espera NUEVO.
rmSync(resolve(RAIZ, ".tmp/navegador/mundo.json"), { force: true });

// Datos de salud de prueba: una clave aleatoria por corrida (no es la de nadie).
process.env["CLAVE_DATOS_SENSIBLES"] = randomBytes(32).toString("base64");
// La interfaz arma el enlace a Chatwoot con esta URL pública; el navegador de pruebas nunca la visita.
process.env["CHATWOOT_URL_PUBLICA"] = "https://chatwoot.prueba.invalid";

const prisma = crearPrismaDePruebas(url);
// Sin límites estrechos de login: las pruebas inician sesión muchas veces desde la misma IP. El bloqueo por (correo, IP) sí sigue activo.
const limites = limitesDesdeEntorno({ ...process.env, LIMITE_LOGIN_POR_MINUTO: "5000", LIMITE_API_POR_MINUTO: "100000" });
const reloj = () => new Date();
// /salud responde 200 solo cuando el mundo ya está sembrado: Playwright espera ahí.
let listo = false;

const app = crearApp({
  limites,
  limitador: new LimitadorDeTasa({ maxClaves: limites.maxClaves }),
  pingDb: async () => {
    if (!listo) throw new Error("sembrando");
  },
  secretoWebhookChatwoot: "secreto-de-prueba",
  procesarEntrante: async () => ({ resultado: "procesado" }),
  registrarTomaDeConversacion: async () => "tomada",
  estadosEntrega: { interpretar: () => null },
  registrarEstadoEntrega: async () => "actualizado",
  web: { directorio: resolve(RAIZ, "web/dist") },
  // La landing pública (`/l/<vertical>`): sin ella el recorrido del anuncio no tendría a dónde llegar.
  landing: { prisma },
  reloj,
  api: {
    prisma,
    parametrosHash: PARAMETROS_PRUEBA,
    cookieSegura: false,
    // V2 (decisión 7): como la demo de docker compose, ORIGEN_PUBLICO es `localhost`; las pruebas entran por `127.0.0.1` (baseURL) y por `localhost` (origenes.spec.ts), y las dos
    // tienen que funcionar: en local la aplicación acepta ambos hosts sin configurar nada más.
    origenesPermitidos: [`http://localhost:${puerto}`],
    reloj,
    sensibles: { cifrador: cifradorDesdeEntorno() },
    fuenteOcupacion: new InscripcionesActivas(),
    expediente: { economico: new ProveedorEconomicoDeFinanzas(), productos: new ProveedorProductosDeFinanzas() },
  },
});

const servidor = app.listen(puerto, "127.0.0.1", () => {
  void (async () => {
    const mundo = await sembrarMundo(prisma, () => new ClienteApi(`http://127.0.0.1:${puerto}`), `http://127.0.0.1:${puerto}`);
    mkdirSync(resolve(RAIZ, ".tmp/navegador"), { recursive: true });
    // Escritura atómica: quien espera el archivo nunca lo lee a medias.
    writeFileSync(resolve(RAIZ, ".tmp/navegador/mundo.json.tmp"), JSON.stringify(mundo, null, 2));
    renameSync(resolve(RAIZ, ".tmp/navegador/mundo.json.tmp"), resolve(RAIZ, ".tmp/navegador/mundo.json"));
    listo = true;
  })().catch((e: unknown) => {
    process.stderr.write(`No se pudo sembrar el mundo de pruebas: ${e instanceof Error ? e.stack : String(e)}\n`);
    process.exit(1);
  });
});
for (const senal of ["SIGINT", "SIGTERM"] as const) {
  process.on(senal, () => {
    servidor.close(() => void prisma.$disconnect().finally(() => process.exit(0)));
  });
}
