// `npm run ensayo:preparar` (V9): deja listo el ensayo con WhatsApp real (docs/ENSAYO-WHATSAPP-REAL.md). Idempotente: se puede correr las veces que haga falta.
//
//   npm run ensayo:preparar -- --url https://algo.trycloudflare.com    primera vez, o cuando el túnel cambia de dirección
//   npm run ensayo:preparar                                              vuelve a aplicar con lo que dice .env
//   npm run ensayo:preparar -- --simulado                                ensayo en seco contra el Twilio falso: no toca Chatwoot ni la base
//   npm run ensayo:preparar -- --revertir                                regresa al modo simulado (quita el número; no borra nada en Chatwoot)
//   opciones: --ver (muestra qué haría sin escribir) · --sin-docker (no recrea los servicios)
//
// Lee .env y config/demo-local.env (package.json los pasa con --env-file). Nunca imprime un secreto completo y nunca escribe uno en un archivo: solo ORIGEN_PUBLICO
// en `.env`, y solo si git lo ignora.

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { crearPrisma } from "../src/datos/prisma.ts";
import { apagarEnEnv, fusionarEnv } from "../src/mensajeria/ensayo/env-archivo.ts";
import { enmascararSecreto, leerEntornoEnsayo, sinSecretos, validarOrigenPublico } from "../src/mensajeria/ensayo/entorno.ts";
import { ErrorDeEnsayo, prepararEnsayo, revertirEnsayo, type PuertoChatwootEnsayo } from "../src/mensajeria/ensayo/preparar.ts";
import { API_TWILIO_REAL, TwilioApiHttp } from "../src/mensajeria/ensayo/twilio-api.ts";
import { ChatwootAdminFalso } from "../src/testutil/chatwoot-admin-falso.ts";
import { TwilioFalso } from "../src/testutil/twilio-falso.ts";
import { ClienteChatwoot } from "./lib/chatwoot.ts";

const args = process.argv.slice(2);
const tiene = (b: string): boolean => args.includes(b);
const valorDe = (b: string): string | undefined => {
  const i = args.indexOf(b);
  return i >= 0 ? args[i + 1] : undefined;
};
const simulado = tiene("--simulado");
const revertir = tiene("--revertir");
const soloVer = tiene("--ver") || simulado;
const sinDocker = tiene("--sin-docker") || simulado;

const fallar = (...lineas: string[]): never => {
  for (const l of lineas) console.error(l);
  process.exit(1);
};
const ok = (t: string): void => console.log(`✔ ${t}`);
const aviso = (t: string): void => console.log(`• ${t}`);

/** `.env` tiene que estar ignorado por git antes de escribirle nada. */
function envIgnorado(): boolean {
  return spawnSync("git", ["check-ignore", "-q", ".env"]).status === 0;
}

// 1. Con --url: la dirección nueva del túnel se guarda en .env y se recrean los servicios que la leen.
const urlNueva = valorDe("--url");
if (urlNueva !== undefined && !revertir) {
  const v = validarOrigenPublico(urlNueva, { permitirNoHttps: simulado });
  if ("problema" in v) fallar(`✘ ${v.problema}`);
  else {
    process.env["ORIGEN_PUBLICO"] = v.origen;
    if (simulado || soloVer) aviso(`(en seco) ORIGEN_PUBLICO sería ${v.origen}; no se escribe .env`);
    else {
      if (!existsSync(".env")) fallar("✘ No existe .env. Copia config/ensayo.env.example a .env y llénalo (docs/ENSAYO-WHATSAPP-REAL.md, paso 1).");
      if (!envIgnorado()) fallar("✘ git no ignora .env: no escribo nada ahí. Revisa .gitignore (debe tener una línea «.env»).");
      writeFileSync(".env", fusionarEnv(readFileSync(".env", "utf8"), { ORIGEN_PUBLICO: v.origen }));
      ok(`ORIGEN_PUBLICO=${v.origen} guardado en .env`);
      if (!sinDocker) {
        aviso("Recreando backend, Chatwoot y el borde del ensayo con la dirección nueva (tarda un par de minutos; no se borra nada)…");
        const r = spawnSync("docker", ["compose", "--profile", "ensayo", "up", "-d", "--build", "--wait"], { stdio: "inherit" });
        if (r.status !== 0) fallar("✘ docker compose no pudo levantar los servicios. Mira el error de arriba; con `docker compose logs backend chatwoot` ves el detalle.");
        ok("servicios arriba con la dirección nueva");
      }
    }
  }
}

// 2. Variables.
if (revertir) {
  const cuenta = process.env["CHATWOOT_CUENTA"];
  const url = process.env["CHATWOOT_URL_HOST"] ?? process.env["CHATWOOT_URL"];
  const token = process.env["CHATWOOT_ADMIN_TOKEN"];
  if (!cuenta || !url || !token) fallar("✘ Faltan CHATWOOT_CUENTA, CHATWOOT_URL_HOST o CHATWOOT_ADMIN_TOKEN (vienen en config/demo-local.env; usa `npm run ensayo:preparar -- --revertir`).");
  const prisma = crearPrisma(process.env["DATABASE_URL"] ?? "postgresql://inscripciones:inscripciones@localhost:5432/inscripciones");
  try {
    const chatwoot = new ClienteChatwoot({ url: url!, tokenAdmin: token! }) satisfies PuertoChatwootEnsayo;
    const r = await revertirEnsayo({ prisma, chatwoot, cuentaNombre: cuenta!, soloVer });
    if (r.canales.length === 0) aviso("No había nada que deshacer: ningún canal está usando la bandeja del ensayo.");
    else for (const c of r.cambios) ok(`${soloVer ? "(en seco) " : ""}${c}`);
    if (!soloVer) {
      if (existsSync(".env") && envIgnorado()) {
        writeFileSync(".env", apagarEnEnv(readFileSync(".env", "utf8"), ["ENSAYO_LOCAL", "ENSAYO_TWILIO_BLOQUEO_PREFIJO", "ORIGEN_PUBLICO", "TWILIO_AUTH_TOKEN"]));
        ok("en .env quedaron comentadas (con #) ENSAYO_LOCAL, ENSAYO_TWILIO_BLOQUEO_PREFIJO, ORIGEN_PUBLICO y TWILIO_AUTH_TOKEN; tus valores siguen ahí por si ensayas otra vez");
      }
      if (!sinDocker) {
        aviso("Recreando los servicios sin el ensayo (no se borra nada)…");
        const detener = spawnSync("docker", ["compose", "--profile", "ensayo", "stop", "ensayo-borde"], { stdio: "inherit" });
        const subir = spawnSync("docker", ["compose", "up", "-d", "--build", "--wait"], { stdio: "inherit" });
        if (detener.status !== 0 || subir.status !== 0) fallar("✘ docker compose no pudo regresar los servicios. Corre a mano: docker compose up -d --build --wait");
        ok("la demo volvió a su modo simulado");
      }
    }
    console.log(["", "Cierra el túnel (Ctrl+C en su ventana). La bandeja de Twilio y sus conversaciones siguen en Chatwoot; bórralas ahí si no las quieres.", "Comprueba que la demo volvió: npm run demo:contacto"].join("\n"));
  } finally {
    await (prisma as unknown as { $disconnect(): Promise<void> }).$disconnect();
  }
  process.exit(0);
}

const lectura = leerEntornoEnsayo(process.env, { simulado });
if (!lectura.entorno) fallar("✘ Falta configurar el ensayo:", ...lectura.problemas.map((p) => `  - ${p}`), "", "Detalle y pasos: docs/ENSAYO-WHATSAPP-REAL.md");
const entorno = lectura.entorno!;
ok(`variables completas (token ${enmascararSecreto(entorno.twilio.token)})`);

// 3. Los puertos: el Twilio falso local con --simulado, y los reales en caso contrario.
let falso: TwilioFalso | null = null;
let twilio: TwilioApiHttp;
let chatwoot: PuertoChatwootEnsayo;
if (simulado) {
  falso = new TwilioFalso({ sid: entorno.twilio.sid, token: entorno.twilio.token, numero: entorno.twilio.numero });
  twilio = new TwilioApiHttp(await falso.iniciar());
  chatwoot = new ChatwootAdminFalso();
  aviso("SIMULADO: Twilio falso en este equipo y Chatwoot en memoria. No se toca Chatwoot, ni la base, ni la red.");
} else {
  twilio = new TwilioApiHttp(process.env["TWILIO_API_BASE"] ?? API_TWILIO_REAL);
  chatwoot = new ClienteChatwoot({ url: entorno.chatwoot.url, tokenAdmin: entorno.chatwoot.tokenAdmin });
}

const prisma = crearPrisma(process.env["DATABASE_URL"] ?? "postgresql://inscripciones:inscripciones@localhost:5432/inscripciones");
try {
  const r = await prepararEnsayo({ prisma, entorno, chatwoot, twilio, soloVer });
  const e = soloVer ? "(en seco) " : "";
  ok(`credenciales de Twilio aceptadas (token ${r.tokenEnmascarado})`);
  ok(`${e}bandeja de WhatsApp en Chatwoot: «${r.chatwoot.nombre}» (${r.chatwoot.estado}), con el Agent Bot y sin asignación automática`);
  ok(`${e}canal «${r.canal}» de ${r.organizacion} recibe por ${r.numero}`);
  for (const c of r.cambios) aviso(`${e}${c}`);
  console.log(
    [
    "",
    "AHORA, en la consola de Twilio (Messaging → Try it out → Send a WhatsApp message → Sandbox settings), pega EXACTAMENTE esto y pulsa Save:",
    `  When a message comes in:   ${r.consolaTwilio.cuandoLlegaUnMensaje}      Method: POST`,
    `  Status callback URL:       ${r.consolaTwilio.urlDeEstados}`,
    "",
    "Después: npm run ensayo:diagnostico",
    ].join("\n"),
  );
} catch (error) {
  if (error instanceof ErrorDeEnsayo) fallar(`✘ ${error.message}`);
  fallar(`✘ ${sinSecretos(error instanceof Error ? error.message : String(error), [entorno.twilio.token, entorno.chatwoot.tokenAdmin])}`);
} finally {
  await falso?.cerrar();
  await (prisma as unknown as { $disconnect(): Promise<void> }).$disconnect();
}

