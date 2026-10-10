// Corre TODAS las escenas del inventario en paralelo, repartidas en tandas con su propio servidor, base y puerto (cada tanda tarda 5–15 min en vez de una hora).
//
//   node scripts/diseno-todo.ts capturas [antes|despues]      (por omisión «despues»; «antes» exige SIN_COMPILAR con WEB_DIST apuntando a la interfaz anterior)
//   node scripts/diseno-todo.ts a11y
//
// Cada tanda lleva su carpeta de estado (.tmp/nav-todo-<n>), su base (todo<n>_inscripciones_navegador_pruebas) y su puerto (4400+n). La interfaz se compila UNA vez en .tmp/dist-todo
// y las tandas la comparten (SIN_COMPILAR=1). Termina con la suma de resultados y sale 1 si alguna tanda falló.

import { execFileSync, spawn } from "node:child_process";
import { createWriteStream, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = resolve(fileURLToPath(new URL("..", import.meta.url)));
const modo = process.argv[2] ?? "capturas";
const fase = process.argv[3] ?? "despues";
if (!["capturas", "a11y"].includes(modo)) throw new Error("uso: diseno-todo.ts capturas|a11y [antes|despues]");

// Tandas por prefijo de id, con un peso parecido (número de escenas aproximado entre paréntesis).
const TANDAS = [
  "recep-",
  "adminc-",
  "admins-",
  "asesor-",
  "maestro-",
  "acceso-,fuera-,tabl-",
  "conv-,familia-",
];

const dist = resolve(RAIZ, process.env["WEB_DIST"] ?? ".tmp/dist-todo");
if (process.env["SIN_COMPILAR"] !== "1") {
  execFileSync("npm", ["--prefix", "web", "run", "build", "--", "--outDir", dist, "--emptyOutDir"], { cwd: RAIZ, stdio: "inherit" });
}
mkdirSync(resolve(RAIZ, ".tmp"), { recursive: true });

const guion = modo === "capturas" ? "e2e-diseno/capturar.spec.ts" : "e2e-diseno/accesibilidad.spec.ts";
const resultados = await Promise.all(
  TANDAS.map(
    (prefijos, i) =>
      new Promise<{ prefijos: string; codigo: number; log: string }>((ok) => {
        const n = i + 1;
        const log = resolve(RAIZ, `.tmp/todo-${modo}-${n}.log`);
        const salida = createWriteStream(log);
        const hijo = spawn(process.execPath, ["scripts/test-navegador.ts", "--", "--config", "playwright.diseno.config.ts", guion], {
          cwd: RAIZ,
          env: {
            ...process.env,
            SIN_COMPILAR: "1",
            WEB_DIST: dist,
            DISENO_FASE: fase,
            DISENO_FILTRO: prefijos,
            PUERTO: String(4400 + n),
            DIR_NAVEGADOR: `.tmp/nav-todo-${n}`,
            DATABASE_URL_NAVEGADOR: `postgresql://inscripciones:inscripciones@localhost:5432/todo${n}_inscripciones_navegador_pruebas`,
          },
          stdio: ["ignore", "pipe", "pipe"],
        });
        hijo.stdout.pipe(salida);
        hijo.stderr.pipe(salida);
        hijo.on("close", (codigo) => ok({ prefijos, codigo: codigo ?? 1, log }));
      }),
  ),
);
let fallo = false;
for (const r of resultados) {
  console.log(`${r.codigo === 0 ? "✔" : "✘"} ${r.prefijos} (exit ${r.codigo}) → ${r.log}`);
  if (r.codigo !== 0) fallo = true;
}
process.exit(fallo ? 1 : 0);
