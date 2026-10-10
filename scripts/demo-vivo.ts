// Demo viva (V12): deja a la vista el primer día de cada rol (leads para el asesor, clases muestra de hoy para el maestro, una familia con cobros para recepción).
// Lo corre `npm run demo:todo` después de `demo:datos`; también se puede repetir solo (es idempotente: si ya hay, no hace nada).
//
//   DATABASE_URL=… npm run demo:vivo -- --confirmar-base-de-demo
//
// Igual que `demo:datos`: no corre contra la base de la demo (`inscripciones`) sin `--confirmar-base-de-demo`; contra una base de pruebas (`_pruebas`, `_test`) corre sin más.

import { parseArgs } from "node:util";
import { crearPrisma } from "../src/datos/prisma.ts";
import { listarOrganizaciones } from "../src/datos/sistema.ts";
import { FAMILIA_CON_COBRO, sembrarDemoViva } from "../src/demo/vivos.ts";

const { values: o } = parseArgs({ options: { organizacion: { type: "string" }, "confirmar-base-de-demo": { type: "boolean", default: false }, ahora: { type: "string" } } });
const url = process.env["DATABASE_URL"];
if (!url) {
  console.error("Falta DATABASE_URL.");
  process.exit(2);
}
const base = decodeURIComponent(new URL(url).pathname.replace(/^\//, ""));
if (!/(?:_pruebas|_test)$/.test(base) && !o["confirmar-base-de-demo"]) {
  console.error(`La base «${base}» no es una base de pruebas. Si de verdad quieres sembrar la demo viva en ella, repite el comando con --confirmar-base-de-demo.`);
  process.exit(2);
}
const ahora = o.ahora ? new Date(o.ahora) : new Date();
if (Number.isNaN(ahora.getTime())) throw new Error("--ahora debe ser un instante ISO con zona (p. ej. 2026-10-12T16:00:00Z)");

const prisma = crearPrisma();
try {
  const todas = await listarOrganizaciones(prisma);
  const elegida = o.organizacion ? todas.find((x) => x.id === o.organizacion || x.nombre === o.organizacion) : todas.length === 1 ? todas[0] : undefined;
  if (!elegida) throw new Error(o.organizacion ? `No hay una organización «${o.organizacion}»` : "Hay varias organizaciones: indica cuál con --organizacion");
  const r = await sembrarDemoViva(prisma, { organizacionId: elegida.id, ahora, progreso: (l) => console.log(l) });
  if (r.yaExistia) console.log(`Ya había demo viva en ${elegida.nombre}: no se sembró nada.`);
  else {
    console.log(`Demo viva sembrada en ${elegida.nombre}.`);
    for (const c of r.clasesDelMaestro) console.log(`  clase muestra ${c.esHoy ? "de hoy" : `del ${c.fecha}`} a las ${c.hora} en «${c.grupo}»`);
    if (r.bajasParaLugar > 0) console.log(`  (la escuela está llena: se dieron de baja ${r.bajasParaLugar} alumno(s) de ejemplo para dejar lugar)`);
    console.log(`  recepción: ${FAMILIA_CON_COBRO.tutor} ${FAMILIA_CON_COBRO.apellidos} (${FAMILIA_CON_COBRO.telefonoNacional})`);
  }
} finally {
  await prisma.$disconnect();
}
