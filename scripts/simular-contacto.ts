// Simula a un contacto que escribe a la bandeja de la demo y muestra lo que contesta el bot.
// Escribe por la API pública de Chatwoot, igual que lo haría un canal externo, así que todo
// pasa por el camino real: Chatwoot → webhook firmado → backend → MessagingProvider → Chatwoot.
//
//   npm run demo:contacto                       guion por defecto
//   npm run demo:contacto -- --interactivo      tú escribes las respuestas
//   npm run demo:contacto -- --telefono +5215512345678 --nombre "Laura"
//   npm run demo:contacto -- --respuestas "Hola|Ana|7|1"
//
// Requiere `docker compose up` (Chatwoot en :3001 y el backend).

import { randomInt } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";
import { clienteDesdeEntorno, type ClienteChatwoot } from "./lib/chatwoot.ts";

const GUION = ["Hola, quiero informes de las clases", "sofía", "tiene 8 años", "2"];

const { values: opciones } = parseArgs({
  options: {
    telefono: { type: "string" },
    nombre: { type: "string", default: "Contacto de prueba" },
    bandeja: { type: "string" },
    respuestas: { type: "string" },
    interactivo: { type: "boolean", default: false },
  },
});

const urlHost = process.env["CHATWOOT_URL_HOST"] ?? "http://localhost:3001";
const chatwoot = clienteDesdeEntorno(urlHost);
// Un número nuevo en cada corrida, en formato +521 como lo manda WhatsApp a veces. El backend
// lo guarda como +52 (invariante 7).
const telefono = opciones.telefono ?? `+52155${randomInt(10_000_000, 99_999_999)}`;

const cuenta = await chatwoot.cuentaPorNombre(process.env["CHATWOOT_CUENTA"] ?? "Demo local");
const bandejas = (await chatwoot.bandejas(cuenta)).filter((b) => b.channel_type === "Channel::Api");
const bandeja = opciones.bandeja ? bandejas.find((b) => b.name === opciones.bandeja) : bandejas.length === 1 ? bandejas[0] : undefined;
if (!bandeja?.inbox_identifier) {
  const nombres = bandejas.map((b) => b.name).join(", ") || "ninguna";
  throw new Error(`No hay una bandeja tipo API clara (encontradas: ${nombres}). Usa --bandeja <nombre> o corre docker compose up.`);
}
const identificador = bandeja.inbox_identifier;

const contacto = await chatwoot.crearContacto(identificador, { name: opciones.nombre, phone_number: telefono });
const conversacion = await chatwoot.crearConversacion(identificador, contacto);

console.log(`\nBandeja "${bandeja.name}" · conversación #${conversacion} · contacto ${opciones.nombre} ${telefono}\n`);

const vistos = new Set<number>();

if (opciones.interactivo) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  console.log("Escribe como el contacto. Línea vacía para terminar.\n");
  for (;;) {
    const linea = (await rl.question("👤 ")).trim();
    if (!linea) break;
    await turno(chatwoot, linea, false);
  }
  rl.close();
} else {
  const guion = opciones.respuestas ? opciones.respuestas.split("|") : GUION;
  for (const texto of guion) await turno(chatwoot, texto, true);
}

const estado = await chatwoot.estadoConversacion(cuenta, conversacion);
console.log(`\nEstado en Chatwoot: ${estado}${estado === "open" ? " (la conversación pasó a los asesores)" : ""}`);
// Con el guion, terminar en "open" es el resultado esperado; si no, que falle (sirve en CI).
if (!opciones.interactivo && estado !== "open") process.exitCode = 1;
console.log(`Ver en Chatwoot: ${urlHost}/app/accounts/${cuenta}/conversations/${conversacion}`);
console.log(`Acceso: ${process.env["CHATWOOT_ADMIN_EMAIL"]} / ${process.env["CHATWOOT_ADMIN_PASSWORD"]}\n`);

async function turno(cw: ClienteChatwoot, texto: string, mostrar: boolean): Promise<void> {
  if (mostrar) console.log(`👤 ${texto}`);
  await cw.escribirComoContacto(identificador, contacto, conversacion, texto);
  for (const respuesta of await esperarRespuestas(cw)) console.log(`🤖 ${respuesta.replace(/\n/g, "\n   ")}`);
}

/** Espera las respuestas del bot: hasta que deja de escribir 1.5 s, o 15 s sin nada. */
async function esperarRespuestas(cw: ClienteChatwoot): Promise<string[]> {
  const nuevas: string[] = [];
  const limite = Date.now() + 15_000;
  let ultimaNueva = 0;
  while (Date.now() < limite) {
    await new Promise((r) => setTimeout(r, 400));
    for (const m of await cw.mensajesDeConversacion(identificador, contacto, conversacion)) {
      if (vistos.has(m.id)) continue;
      vistos.add(m.id);
      if (m.message_type === 1 && m.content) {
        nuevas.push(m.content);
        ultimaNueva = Date.now();
      }
    }
    if (ultimaNueva && Date.now() - ultimaNueva > 1500) break;
  }
  if (nuevas.length === 0) console.log("   (sin respuesta del bot; revisa `docker compose logs backend`)");
  return nuevas;
}
