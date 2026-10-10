// `npm run ensayo:entrante -- --desde +5215512345678 [--texto Hola]` (V9): manda al sistema, por la dirección pública del túnel, un mensaje entrante firmado con tu token,
// como si lo llamara Twilio. Sirve para comprobar `+521…` contra `+52…` con tu propio celular. OJO: el asistente contestará DE VERDAD por Twilio a ese número.

import { entranteDePrueba } from "../src/mensajeria/ensayo/entrante-de-prueba.ts";
import { leerEntornoEnsayo } from "../src/mensajeria/ensayo/entorno.ts";

const args = process.argv.slice(2);
const valor = (b: string): string | undefined => (args.indexOf(b) >= 0 ? args[args.indexOf(b) + 1] : undefined);
const desde = valor("--desde");
if (!desde) {
  console.error("✘ Falta --desde: tu celular tal como quieres que llegue, por ejemplo --desde +5215512345678 (y luego otra vez con +525512345678).");
  process.exit(1);
}
const lectura = leerEntornoEnsayo(process.env);
if (!lectura.entorno) {
  console.error(["✘ Falta configurar el ensayo:", ...lectura.problemas.map((p) => `  - ${p}`)].join("\n"));
  process.exit(1);
}
const e = lectura.entorno!;
try {
  const p = entranteDePrueba({ origen: e.origen, token: e.twilio.token, sid: e.twilio.sid, numeroEscuela: e.twilio.numero, desde: desde!, texto: valor("--texto") ?? "Hola" });
  const res = await fetch(p.url, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", "x-twilio-signature": p.firma }, body: p.cuerpo, redirect: "manual", signal: AbortSignal.timeout(10_000) });
  await res.arrayBuffer();
  console.log(res.status === 200 ? `✔ El sistema lo recibió (200). Mira Chatwoot y tu celular.` : `✘ El sistema contestó ${res.status}. Corre npm run ensayo:diagnostico.`);
  process.exit(res.status === 200 ? 0 : 1);
} catch (error) {
  console.error(`✘ ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
