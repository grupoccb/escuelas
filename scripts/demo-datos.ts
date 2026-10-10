// Datos de demo (I4): ~300 alumnos y seis meses de historia, generados de forma determinista por los servicios reales del sistema (ver `src/demo/generador.ts`).
//
//   npm run demo:datos -- --confirmar-base-de-demo
//   npm run demo:datos -- --organizacion "Escuela demo" --semilla 20261008 --alumnos 300 --meses 6 --hasta 2026-10-08 --confirmar-base-de-demo
//
// SEGURIDAD. Escribe MUCHOS datos: no corre contra la base de la demo (`inscripciones`) a menos que se pida explícitamente con `--confirmar-base-de-demo`. Contra una base de
// pruebas (nombre terminado en `_pruebas` o `_test`) corre sin más. Es idempotente: si la organización ya tiene filas del generador (teléfonos `+52 55 9900 NNNN`), no hace nada.
// Al terminar corre la cuadratura del dinero y sale con 1 si no cuadra.

import { parseArgs } from "node:util";
import { revisarGuardasDeScript } from "./lib/demo-todo.ts";
import { crearPrisma } from "../src/datos/prisma.ts";
import { listarOrganizaciones } from "../src/datos/sistema.ts";
import { generarDatosDeDemo } from "../src/demo/generador.ts";

const { values: o } = parseArgs({
  options: {
    organizacion: { type: "string" },
    semilla: { type: "string" },
    alumnos: { type: "string" },
    meses: { type: "string" },
    hasta: { type: "string" },
    "confirmar-base-de-demo": { type: "boolean", default: false },
    json: { type: "boolean", default: false },
  },
});

const url = process.env["DATABASE_URL"];
if (!url) {
  console.error("Falta DATABASE_URL.");
  process.exit(2);
}
const base = decodeURIComponent(new URL(url).pathname.replace(/^\//, ""));
const esDePruebas = /(?:_pruebas|_test)$/.test(base);
if (!esDePruebas && !o["confirmar-base-de-demo"]) {
  console.error(`La base «${base}» no es una base de pruebas. Los datos de demo escriben miles de filas: si de verdad quieres cargarlos en ella, repite el comando con --confirmar-base-de-demo.`);
  process.exit(2);
}
// V13-fix (EV-09): además de la bandera, las guardas de `demo:todo`: nunca con NODE_ENV=production, solo con una base local y, fuera de una base de pruebas, solo en la organización de la demo.
function negarSi(h: ReturnType<typeof revisarGuardasDeScript>): void {
  if (h.length === 0) return;
  for (const x of h) console.error(`demo:datos se niega: ${x.mensaje}`);
  process.exit(2);
}
const QUE = "este guion escribe miles de filas de ejemplo";
negarSi(revisarGuardasDeScript(process.env, { que: QUE }));
process.env["NODE_ENV"] ??= "development";
const entero = (v: string | undefined, nombre: string, min: number, max: number): number | undefined => {
  if (v === undefined) return undefined;
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(`--${nombre} debe ser un entero entre ${min} y ${max}`);
  return n;
};
const hasta = o.hasta ? new Date(`${o.hasta}T22:00:00Z`) : new Date();
if (Number.isNaN(hasta.getTime())) throw new Error("--hasta debe ser AAAA-MM-DD");

const prisma = crearPrisma();
let codigo = 0;
try {
  const todas = await listarOrganizaciones(prisma);
  const elegida = o.organizacion ? todas.find((x) => x.id === o.organizacion || x.nombre === o.organizacion) : todas.length === 1 ? todas[0] : undefined;
  if (!elegida) throw new Error(o.organizacion ? `No hay una organización «${o.organizacion}»` : "Hay varias organizaciones: indica cuál con --organizacion");
  negarSi(revisarGuardasDeScript(process.env, { organizacion: { slug: elegida.slug ?? "", nombre: elegida.nombre }, que: QUE }));
  const semilla = entero(o.semilla, "semilla", 1, 2_147_483_647);
  const alumnos = entero(o.alumnos, "alumnos", 1, 5000);
  const meses = entero(o.meses, "meses", 1, 24);
  const r = await generarDatosDeDemo(prisma, { organizacionId: elegida.id, hasta, ...(semilla !== undefined ? { semilla } : {}), ...(alumnos !== undefined ? { alumnos } : {}), ...(meses !== undefined ? { meses } : {}), progreso: o.json ? () => {} : (l) => console.log(l) });
  if (o.json) console.log(JSON.stringify(r, null, 2));
  else {
    console.log(r.yaExistia ? `Ya había datos de demo en ${elegida.nombre}: no se generó nada.` : `Datos de demo generados en ${elegida.nombre} (${r.segundos.toFixed(1)} s).`);
    console.log(`  leads: ${r.leads} · clases muestra: ${r.clasesMuestra} (asistidas ${r.asistidas}) · inscripciones: ${r.inscripciones} (bajas ${r.bajas})`);
    console.log(`  cargos: ${r.cargos} · pagos: ${r.pagos} · ventas: ${r.ventas} · asistencias registradas: ${r.pases}`);
    console.log(`  conversiones rechazadas (el grupo se llenó): ${r.conversionesRechazadas} · beneficios entregados: ${r.beneficiosEntregados}`);
    console.log(r.cuadratura ? (r.cuadratura.ok ? `✓ cuadra — cargado ${r.cuadratura.resumen.totalCargado} · pagado ${r.cuadratura.resumen.totalPagado} · saldo ${r.cuadratura.resumen.saldoTotal}` : `✗ NO CUADRA (${r.cuadratura.discrepancias.length})`) : "");
  }
  if (r.catalogo) console.log(`  catálogo: traslapes de edad ${r.catalogo.traslapesDeEdad} · choques de salón ${r.catalogo.choquesDeSalon} · choques de instructor ${r.catalogo.choquesDeInstructor}`);
  if (r.cuadratura && !r.cuadratura.ok) codigo = 1;
  if (r.catalogo && (r.catalogo.traslapesDeEdad > 0 || r.catalogo.choquesDeSalon > 0 || r.catalogo.choquesDeInstructor > 0)) codigo = 1;
} finally {
  await prisma.$disconnect();
}
process.exitCode = codigo;
