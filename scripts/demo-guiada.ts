// Demo guiada con un solo comando (K8): narra en español el camino de una familia, del anuncio simulado al primer pago, contra servicios simulados
// (sin Twilio ni Chatwoot reales) y sobre una base propia que se recrea en cada corrida. Reproducible e idempotente. Termina con la cuadratura y las ligas.
//
//   npm run demo:guiada                 # corre, narra, imprime las ligas y termina
//   npm run demo:guiada -- --servir     # además deja la interfaz encendida (Ctrl+C para terminar) para recorrerla con esos datos
//   npm run demo:guiada -- --puerto 3100 --base inscripciones_demo_guiada
//
// Necesita un Postgres (el de docker compose sirve): DATABASE_URL de .env (solo se usa el servidor; la base es otra) y `npm run web:build` para ver la interfaz.

import { existsSync } from "node:fs";
import { parseArgs } from "node:util";
import { ejecutarDemoGuiada } from "./lib/demo-guiada.ts";

if (existsSync(".env")) process.loadEnvFile(".env");
const { values: o } = parseArgs({ options: { base: { type: "string", default: "inscripciones_demo_guiada" }, puerto: { type: "string" }, servir: { type: "boolean", default: false } } });
const url = process.env["DATABASE_URL_DEMO_GUIADA"] ?? process.env["DATABASE_URL"] ?? "postgresql://inscripciones:inscripciones@localhost:5432/postgres";
// El relato sale tal cual; las líneas «Reloj» y la duración no cambian entre corridas (todo es reproducible).
try {
  const r = await ejecutarDemoGuiada({ urlServidor: url, base: o.base!, ...(o.puerto ? { puerto: Number(o.puerto) } : o.servir ? { puerto: 3100 } : {}), servir: o.servir!, narrar: (l) => console.log(l) });
  console.log("");
  for (const liga of r.ligas) console.log(` ${liga}`);
  if (!existsSync("web/dist")) console.log("\n (La interfaz no está compilada: corre `npm run web:build` para verla en esas ligas.)");
  if (o.servir && r.servidor) {
    console.log("\n Servidor encendido. Ctrl+C para terminar.");
    process.once("SIGINT", () => void r.cerrar().then(() => process.exit(r.cuadra ? 0 : 1)));
    process.once("SIGTERM", () => void r.cerrar().then(() => process.exit(r.cuadra ? 0 : 1)));
  } else {
    process.exitCode = r.cuadra ? 0 : 1;
  }
} catch (e) {
  console.error(`✗ ${(e as Error).message}`);
  process.exit(1);
}
