// V10b-fix: prueba de humo del arnés del reloj simulado. Corre siempre (en `npm run validar`): si el desplazamiento del «ahora» dejara de llegar a los procesos
// de las pruebas, la suite entera volvería a depender de la hora real sin que nadie lo note.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { ahoraReal, desfaseDesdeEntorno, entornoConRelojSimulado } from "./reloj-simulado.ts";
import { hoyEn, problemaDePase } from "../../src/asistencia/pase.ts";
import { HORARIO_DE_CLASE_YA_EMPEZADA } from "../navegador/horarios.ts";

const SHIM = fileURLToPath(new URL("./reloj-simulado-import.ts", import.meta.url));
const MX = "America/Mexico_City";

/** Corre un proceso de Node con el entorno del arnés a un instante dado y devuelve lo que imprime. */
function correr(ahora: string | null, codigo: string, extra: NodeJS.ProcessEnv = {}): string {
  const base: NodeJS.ProcessEnv = { ...process.env, ...extra };
  delete base["PRUEBAS_AHORA"];
  delete base["PRUEBAS_DESFASE_MS"];
  delete base["NODE_OPTIONS"];
  const env = ahora ? entornoConRelojSimulado({ ...base, PRUEBAS_AHORA: ahora }, SHIM) : base;
  return execFileSync(process.execPath, ["-e", codigo], { env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

test("el desfase sale de PRUEBAS_AHORA (con zona) y PRUEBAS_DESFASE_MS manda sobre él", () => {
  assert.equal(desfaseDesdeEntorno({}, 1_000), 0);
  assert.equal(desfaseDesdeEntorno({ PRUEBAS_AHORA: "1970-01-01T00:00:10Z" }, 4_000), 6_000);
  assert.equal(desfaseDesdeEntorno({ PRUEBAS_AHORA: "1970-01-01T00:00:10Z", PRUEBAS_DESFASE_MS: "-50" }, 4_000), -50);
  assert.throws(() => desfaseDesdeEntorno({ PRUEBAS_AHORA: "2026-10-10T06:30:00" }), /con zona/, "sin zona dependería de la máquina");
  assert.throws(() => desfaseDesdeEntorno({ PRUEBAS_AHORA: "mañana" }), /ISO/);
  assert.throws(() => desfaseDesdeEntorno({ PRUEBAS_DESFASE_MS: "abc" }), /número/);
});

test("sin PRUEBAS_AHORA el entorno no se toca; con él, los hijos reciben el desfase UNA vez y el shim", () => {
  const sin = { PATH: "x" };
  assert.equal(entornoConRelojSimulado(sin, SHIM), sin);
  const con = entornoConRelojSimulado({ PRUEBAS_AHORA: "1970-01-01T00:00:10Z", NODE_OPTIONS: "--no-warnings" }, SHIM, 4_000);
  assert.equal(con["PRUEBAS_DESFASE_MS"], "6000");
  assert.equal(con["NODE_OPTIONS"], `--no-warnings --import=${SHIM}`);
  assert.equal(entornoConRelojSimulado(con, SHIM, 99_999)["NODE_OPTIONS"], con["NODE_OPTIONS"], "no duplica el shim");
});

test("un proceso de Node arranca en el instante pedido, sigue corriendo y lo hereda a sus hijos", () => {
  const instante = "2026-10-10T06:30:00Z";
  const impreso = correr(instante, "const t = Date.now(); process.stdout.write(JSON.stringify([new Date().toISOString(), t, new Date(2020, 0, 1).getFullYear(), new Date('2020-01-01T00:00:00Z').getTime()]))");
  const [iso, t, anio, fijo] = JSON.parse(impreso) as [string, number, number, number];
  const llegada = Date.parse(iso);
  assert.ok(llegada >= Date.parse(instante) && llegada < Date.parse(instante) + 30_000, `el «ahora» arranca en el instante pedido (${iso})`);
  assert.ok(Math.abs(t - llegada) < 30_000);
  assert.equal(anio, 2020, "con argumentos, Date se comporta igual");
  assert.equal(fijo, Date.parse("2020-01-01T00:00:00Z"));
  const nieto = correr(instante, `process.stdout.write(require('node:child_process').execFileSync(process.execPath, ['-e', 'process.stdout.write(new Date().toISOString())'], { encoding: 'utf8' }))`);
  assert.ok(Date.parse(nieto) >= Date.parse(instante) && Date.parse(nieto) < Date.parse(instante) + 60_000, `el hijo del hijo también vive en el instante pedido (${nieto})`);
});

test("sin variable el reloj es el real", () => {
  const t = Number(correr(null, "process.stdout.write(String(Date.now()))"));
  assert.ok(Math.abs(t - ahoraReal()) < 30_000);
});

test("el reloj simulado se niega en producción real, pero no en la demo local", () => {
  const codigo = "process.stdout.write(new Date().toISOString())";
  const produccion = { NODE_ENV: "production" };
  assert.throws(() => correr("2026-10-10T06:30:00Z", codigo, produccion), "producción real: el proceso ni arranca con el reloj desplazado");
  assert.match(correr("2026-10-10T06:30:00Z", codigo, { ...produccion, ENTORNO_DEMO: "si" }), /^2026-10-10T06:3/);
});

// Los instantes críticos que recorre `docs/BITACORA-V1.md` (V10b-fix): lo que dependía de la hora o del día se decide con el reloj de la aplicación, no con el de la máquina.
const CRITICOS: ReadonlyArray<{ instante: string; hoyMx: string; claseDeLas16: "ya empezó" | "aun no" }> = [
  { instante: "2026-10-10T06:30:00Z", hoyMx: "2026-10-10", claseDeLas16: "aun no" }, // 00:30 sábado
  { instante: "2026-10-10T12:00:00Z", hoyMx: "2026-10-10", claseDeLas16: "aun no" }, // 06:00
  { instante: "2026-10-10T18:00:00Z", hoyMx: "2026-10-10", claseDeLas16: "aun no" }, // 12:00
  { instante: "2026-10-10T21:59:00Z", hoyMx: "2026-10-10", claseDeLas16: "aun no" }, // 15:59
  { instante: "2026-10-10T22:01:00Z", hoyMx: "2026-10-10", claseDeLas16: "ya empezó" }, // 16:01
  { instante: "2026-10-11T05:30:00Z", hoyMx: "2026-10-10", claseDeLas16: "ya empezó" }, // 23:30 sábado (en UTC ya es domingo)
  { instante: "2026-12-01T05:30:00Z", hoyMx: "2026-11-30", claseDeLas16: "ya empezó" }, // fin de mes a las 23:30 en México
];

for (const c of CRITICOS) {
  test(`reloj simulado ${c.instante}: «hoy» en México es ${c.hoyMx} y la clase de las 16:00 ${c.claseDeLas16}`, () => {
    const impreso = correr(c.instante, "process.stdout.write(new Date().toISOString())");
    const ahora = new Date(impreso);
    assert.equal(hoyEn(MX, ahora), c.hoyMx);
    const horarios = [{ dia_semana: new Date(`${c.hoyMx}T12:00:00Z`).getUTCDay(), hora_inicio_min: 960 }];
    const problema = problemaDePase(c.hoyMx, { horarios, zona: MX, ahora });
    assert.equal(problema, c.claseDeLas16 === "ya empezó" ? null : "fecha_futura");
  });
}

test("causa raíz de V10b-fix: el horario fijo de la guía del maestro (18:00) NO había empezado a la 1 de la mañana; el de los datos de prueba sí, a cualquier hora y cualquier día", () => {
  for (const c of CRITICOS) {
    const ahora = new Date(c.instante);
    const hoy = hoyEn(MX, ahora);
    const dia = new Date(`${hoy}T12:00:00Z`).getUTCDay();
    const conHorario = (h: { hora_inicio_min: number }) => problemaDePase(hoy, { horarios: [{ dia_semana: dia, hora_inicio_min: h.hora_inicio_min }], zona: MX, ahora });
    assert.equal(conHorario(HORARIO_DE_CLASE_YA_EMPEZADA), null, `a las ${c.instante} la clase de los datos de prueba tiene que haber empezado`);
  }
  const madrugada = new Date("2026-10-10T07:36:00Z"); // 01:36 en México: la hora a la que falló
  assert.equal(problemaDePase("2026-10-10", { horarios: [{ dia_semana: 6, hora_inicio_min: 1080 }], zona: MX, ahora: madrugada }), "fecha_futura", "con el horario fijo de antes, el pase de hoy no se podía tomar");
  assert.equal(problemaDePase("2026-10-10", { horarios: [{ dia_semana: 6, hora_inicio_min: HORARIO_DE_CLASE_YA_EMPEZADA.hora_inicio_min }], zona: MX, ahora: madrugada }), null);
});
