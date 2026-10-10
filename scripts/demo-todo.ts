// `npm run demo:todo` (V12): reconstruye la demo local desde cero y la deja en http://localhost:3000 con datos y los cuatro usuarios.
//
//   npm run demo:todo                       # imprime QUÉ borraría y se detiene (código 2); no ejecuta nada
//   npm run demo:todo -- --si               # reconstruye la demo (o DEMO_CONFIRMAR=si)
//   npm run demo:todo -- --simulacro        # imprime el plan paso a paso y termina, sin ejecutar nada
//   npm run demo:todo -- --si --con-chatwoot   # además borra y recrea Chatwoot (conversaciones y bandejas)
//   npm run demo:todo -- --si --proyecto otra --puerto 3300   # otra demo aparte, con sus puertos, sin tocar la principal
//   npm run demo:todo -- --apagar           # detiene la demo conservando los datos
//   npm run demo:todo -- --borrar --si      # quita el proyecto entero (contenedores y volúmenes)
//
// La lógica (opciones, guardas, plan, comprobaciones, resumen) está en scripts/lib/demo-todo.ts y se prueba con un Docker falso. Aquí solo está la capa que de verdad ejecuta.
// Códigos de salida: 0 todo bien · 1 algo falló o una comprobación no pasó · 2 falta la confirmación, o se negó (guardas), o el uso es inválido.

import { spawn } from "node:child_process";
import { connect } from "node:net";
import { parseArgs } from "node:util";
import { construirPlan, describirBorrado, ejecutarPlan, ErrorDeUso, resolverOpciones, resumenFinal, revisarGuardas, textoDeConfirmacion, type Ejecutor, type Red } from "./lib/demo-todo.ts";

const ejecutor: Ejecutor = {
  correr: (cmd, args, op = {}) =>
    new Promise((resolver) => {
      const hijo = spawn(cmd, args, { env: { ...process.env, ...op.env }, stdio: ["ignore", "pipe", "pipe"] });
      let salida = "";
      const temporizador = op.timeoutMs ? setTimeout(() => hijo.kill("SIGKILL"), op.timeoutMs) : null;
      // En vivo se muestran las líneas para personas; las de bitácora del sistema (una línea JSON por evento) quedan en la salida guardada pero no en pantalla.
      const pendiente = { stdout: "", stderr: "" };
      const recibir = (flujo: NodeJS.WriteStream, cual: "stdout" | "stderr") => (trozo: Buffer) => {
        salida += trozo.toString();
        if (!op.enVivo) return;
        const lineas = (pendiente[cual] + trozo.toString()).split("\n");
        pendiente[cual] = lineas.pop() ?? "";
        for (const l of lineas) if (!l.startsWith('{"t":')) flujo.write(`${l}\n`);
      };
      hijo.stdout.on("data", recibir(process.stdout, "stdout"));
      hijo.stderr.on("data", recibir(process.stderr, "stderr"));
      hijo.on("error", (e) => {
        if (temporizador) clearTimeout(temporizador);
        resolver({ codigo: 127, salida: salida + String(e.message) });
      });
      hijo.on("close", (codigo) => {
        if (temporizador) clearTimeout(temporizador);
        resolver({ codigo: codigo ?? 1, salida });
      });
    }),
};

const red: Red = {
  async http(metodo, url, cuerpo, cookie) {
    const r = await fetch(url, {
      method: metodo,
      headers: { "x-requested-with": "demo-todo", ...(cuerpo !== undefined ? { "content-type": "application/json" } : {}), ...(cookie ? { cookie } : {}) },
      ...(cuerpo !== undefined ? { body: JSON.stringify(cuerpo) } : {}),
      signal: AbortSignal.timeout(30_000),
    });
    return { estado: r.status, texto: await r.text(), cookie: r.headers.getSetCookie()[0]?.split(";")[0] ?? null };
  },
  puertoOcupado: (puerto) =>
    new Promise((resolver) => {
      const s = connect({ port: puerto, host: "127.0.0.1" });
      s.once("connect", () => (s.destroy(), resolver(true)));
      s.once("error", () => resolver(false));
      s.setTimeout(1500, () => (s.destroy(), resolver(false)));
    }),
  esperar: (ms) => new Promise((r) => setTimeout(r, ms)),
};

const { values } = parseArgs({
  options: {
    si: { type: "boolean", default: false },
    simulacro: { type: "boolean", default: false },
    apagar: { type: "boolean", default: false },
    borrar: { type: "boolean", default: false },
    "con-chatwoot": { type: "boolean", default: false },
    proyecto: { type: "string" },
    puerto: { type: "string" },
    "puerto-chatwoot": { type: "string" },
    "puerto-postgres": { type: "string" },
    alumnos: { type: "string" },
    meses: { type: "string" },
    semilla: { type: "string" },
    hasta: { type: "string" },
  },
});

try {
  const hoy = (): string => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Mexico_City" });
  // El fin de la historia es un DÍA (no un instante): así dos corridas el mismo día dan exactamente la misma historia, sin importar a qué hora se lancen.
  const o = resolverOpciones(values, process.env);
  if (o.hasta === null) o.hasta = hoy();
  const negativas = revisarGuardas(o, process.env);
  if (negativas.length > 0) {
    console.error("✗ Este comando se niega a correr:");
    for (const n of negativas) console.error(`  - ${n.mensaje}`);
    process.exit(2);
  }
  const plan = construirPlan(o);
  if (o.simulacro) {
    console.log(`Simulacro: no se ejecuta nada. Proyecto «${o.proyecto}», interfaz en el puerto ${o.puertoBackend}.\n`);
    plan.forEach((p, i) => console.log(`${i + 1}. ${p.titulo}${p.destructivo ? "   [BORRA]" : ""}\n   ${p.tipo === "comando" ? `${p.cmd.replace(/^.*\/node$/, "node")} ${p.args.join(" ")}` : `(interno: ${p.accion})`}`));
    console.log("\n" + describirBorrado(o).join("\n"));
    process.exit(0);
  }
  if (!o.confirmado && o.accion !== "apagar") {
    console.error(textoDeConfirmacion(o));
    process.exit(2);
  }
  const r = await ejecutarPlan(o, plan, { ejecutor, red, versionDeNode: process.versions.node, ahora: Date.now, decir: (l) => console.log(l) }, hoy);
  if (r.falloEn) {
    console.error(`\n✗ Falló el paso «${r.falloEn.paso}» (${Math.round(r.ms / 1000)} s):\n${r.falloEn.detalle}`);
    console.error("\nQué hacer: lee el mensaje de arriba; si es de Docker, abre Docker Desktop. Puedes repetir el comando: reconstruye todo desde cero. Más ayuda: docs/DEMO-LOCAL.md («Problemas comunes»).");
    process.exit(1);
  }
  if (o.accion === "reconstruir") console.log("\n" + resumenFinal(o, r.comprobaciones, r.ms));
  else console.log(`\nListo (${Math.round(r.ms / 1000)} s).`);
  process.exit(r.ok ? 0 : 1);
} catch (e) {
  if (e instanceof ErrorDeUso) {
    console.error(`✗ ${e.message}`);
    process.exit(2);
  }
  throw e;
}
