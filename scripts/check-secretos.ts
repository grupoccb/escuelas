// Guarda de secretos (K3): ningún secreto real en el repositorio. Revisa los archivos que git versiona (o, con --raiz, los de un directorio) y falla si encuentra:
//  - una llave privada, una llave de acceso de AWS, un SID o una API key de Twilio, un token de GitHub o de Slack, una llave de Stripe en vivo;
//  - un archivo `.env` real versionado (solo `.env.example` y `config/demo-local.env` se versionan);
//  - una asignación de contraseña, secreto o token con un valor largo y aleatorio en un archivo de configuración fuera de la lista de excepciones.
//
// Excepciones por RUTA EXACTA y con motivo (EXCEPCIONES): los valores de la demo local, que son públicos a propósito y que el backend se niega a usar en
// producción (src/seguridad/entorno.ts). Los tests y la documentación pueden llevar valores de ejemplo; no se revisan para el patrón genérico, sí para las llaves.
//
//   npm run check:secretos
//   node scripts/check-secretos.ts --raiz <dir>

import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ_REPO = resolve(fileURLToPath(new URL("..", import.meta.url)));

/** Patrones que NUNCA deben aparecer, en ningún archivo (ni siquiera en tests o docs). */
export const PATRONES_DE_LLAVES: { re: RegExp; que: string }[] = [
  { re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY(?: BLOCK)?-----/, que: "llave privada" },
  { re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/, que: "llave de acceso de AWS" },
  { re: /\bAC(?!0{32}\b)[0-9a-f]{32}\b/, que: "SID de cuenta de Twilio" },
  { re: /\bSK(?!0{32}\b)[0-9a-f]{32}\b/, que: "API key de Twilio" },
  { re: /\bgh[pousr]_[A-Za-z0-9]{30,}\b/, que: "token de GitHub" },
  { re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/, que: "token de Slack" },
  { re: /\b[sr]k_live_[A-Za-z0-9]{16,}\b/, que: "llave de Stripe en vivo" },
  { re: /\beyJ[A-Za-z0-9_-]{15,}\.eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{10,}\b/, que: "JWT" },
  { re: /\baws_secret_access_key\s*[=:]\s*\S{20,}/i, que: "llave secreta de AWS" },
];

/** Asignaciones de secretos con un valor que parece aleatorio (24+ caracteres sin espacios). Solo en archivos de configuración. */
const ASIGNACION = /(?:^|[\s,{;"'])([A-Za-z0-9_.-]*(?:SECRET|SECRETO|PASSWORD|PASSWD|CONTRASENA|TOKEN|API_?KEY|CLAVE)[A-Za-z0-9_.-]*)\s*[:=]\s*["']?([A-Za-z0-9+/_=.-]{24,})["']?\s*$/i;
const ES_CONFIGURACION = /(?:^|\/)(?:\.env[^/]*|[^/]+\.(?:ya?ml|tf|tfvars|hcl|ini|conf|properties|rb))$/;
const ES_PRUEBA_O_DOC = /(?:^docs\/|\.test\.|\.itest\.|(?:^|\/)testutil\/|(?:^|\/)e2e\/|(?:^|\/)fixtures?\b)/;

/** Excepciones por ruta exacta: valores públicos de la demo local, con el motivo. */
export const EXCEPCIONES: Record<string, string> = {
  "config/demo-local.env": "valores de la demo local, públicos a propósito; el backend se niega a arrancar con ellos en producción (src/seguridad/entorno.ts)",
  "docker-compose.yml": "valores de la demo local (SECRET_KEY_BASE de Chatwoot, clave de datos de la demo), públicos a propósito",
  "chatwoot/setup.rb": "script de la demo local: lee sus valores de config/demo-local.env",
  "chatwoot/n2-bandeja-twilio.rb": "script de la demo local",
  "infra/ambientes/staging.tfvars.example": "ejemplo con valores ficticios (ARN y dominios de muestra)",
  "infra/ambientes/produccion.tfvars.example": "ejemplo con valores ficticios (ARN y dominios de muestra)",
};

export interface HallazgoDeSecreto {
  archivo: string;
  linea: number;
  que: string;
}

const EXTENSIONES_BINARIAS = /\.(?:png|jpe?g|gif|webp|ico|pdf|woff2?|ttf|zip|gz|lock|svg)$/i;

function archivosVersionados(raiz: string): string[] {
  try {
    const salida = execFileSync("git", ["-C", raiz, "ls-files", "-z", "--cached", "--others", "--exclude-standard"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    const lista = salida.split("\0").filter(Boolean);
    if (lista.length > 0) return lista;
  } catch {
    // no es un repositorio: se recorre el directorio
  }
  const salida: string[] = [];
  const recorrer = (dir: string): void => {
    for (const e of readdirSync(dir)) {
      if (e === "node_modules" || e === ".git" || e === ".terraform") continue;
      const ruta = join(dir, e);
      if (statSync(ruta).isDirectory()) recorrer(ruta);
      else salida.push(relative(raiz, ruta).split(sep).join("/"));
    }
  };
  recorrer(raiz);
  return salida;
}

export function revisarSecretos(raiz: string = RAIZ_REPO): HallazgoDeSecreto[] {
  const hallazgos: HallazgoDeSecreto[] = [];
  for (const archivo of archivosVersionados(raiz)) {
    if (EXTENSIONES_BINARIAS.test(archivo) || archivo === "package-lock.json" || archivo === "web/package-lock.json" || archivo === "infra/.terraform.lock.hcl") continue;
    const nombre = archivo.split("/").pop()!;
    if (/^\.env(?:\.|$)/.test(nombre) && nombre !== ".env.example" && !EXCEPCIONES[archivo]) hallazgos.push({ archivo, linea: 0, que: "archivo .env real versionado" });
    let texto: string;
    try {
      texto = readFileSync(join(raiz, archivo), "utf8");
    } catch {
      continue;
    }
    if (texto.includes("\0")) continue;
    const lineas = texto.split("\n");
    const exceptuado = archivo in EXCEPCIONES;
    for (let i = 0; i < lineas.length; i++) {
      const l = lineas[i]!;
      for (const p of PATRONES_DE_LLAVES) if (p.re.test(l)) hallazgos.push({ archivo, linea: i + 1, que: p.que });
      if (exceptuado || ES_PRUEBA_O_DOC.test(archivo) || !ES_CONFIGURACION.test(archivo)) continue;
      const m = ASIGNACION.exec(l);
      if (m && !/^\s*#/.test(l) && !/\$\{|\$\(|var\.|random_|aws_secretsmanager|valueFrom|data\./.test(l)) hallazgos.push({ archivo, linea: i + 1, que: `asignación de «${m[1]}» con un valor largo` });
    }
  }
  return hallazgos;
}

if (process.argv[1] && process.argv[1].endsWith("check-secretos.ts")) {
  const i = process.argv.indexOf("--raiz");
  const raiz = i >= 0 ? resolve(process.argv[i + 1] ?? ".") : RAIZ_REPO;
  const hallazgos = revisarSecretos(raiz);
  if (hallazgos.length > 0) {
    console.error("Posibles secretos en el repositorio:");
    for (const h of hallazgos) console.error(`  ${h.archivo}${h.linea ? `:${h.linea}` : ""}  ${h.que}`);
    console.error("\nSi es un valor público de la demo, agrégalo a EXCEPCIONES en scripts/check-secretos.ts con su motivo. Si es real, rótalo: ya quedó en el historial.");
    process.exit(1);
  }
  console.log("check:secretos: sin secretos en el repositorio.");
}
