// Reporte de clases muestra (I1): agendadas, asistidas, no asistidas y conversión, por fuente, vertical y sucursal.
//
//   npm run reporte:clases-muestra
//   npm run reporte:clases-muestra -- --desde 2026-09-01 --hasta 2026-09-30 --organizacion "Escuela demo" --json
//
// Lee la base de DATABASE_URL (.env). Con una sola organización no hace falta indicarla. Definiciones en `src/reportes/clases-muestra.ts`.

import { parseArgs } from "node:util";
import { conAlcance } from "../src/datos/alcance.ts";
import { crearPrisma } from "../src/datos/prisma.ts";
import { listarOrganizaciones } from "../src/datos/sistema.ts";
import { oGuion } from "../src/lib/razon.ts";
import { reporteDeClasesMuestra, type FilaDeClasesMuestra } from "../src/reportes/clases-muestra.ts";

const { values: o } = parseArgs({ options: { organizacion: { type: "string" }, desde: { type: "string" }, hasta: { type: "string" }, json: { type: "boolean", default: false } } });
const fecha = (v: string | undefined, nombre: string): string | undefined => {
  if (v === undefined) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(new Date(`${v}T00:00:00Z`).getTime())) throw new Error(`--${nombre} debe ser AAAA-MM-DD, no "${v}"`);
  return v;
};

const prisma = crearPrisma();
try {
  const todas = await listarOrganizaciones(prisma);
  const elegida = o.organizacion ? todas.find((x) => x.id === o.organizacion || x.nombre === o.organizacion) : todas.length === 1 ? todas[0] : undefined;
  if (!elegida) throw new Error(o.organizacion ? `No hay una organización «${o.organizacion}»` : "Hay varias organizaciones: indica cuál con --organizacion");
  const desde = fecha(o.desde, "desde");
  const hasta = fecha(o.hasta, "hasta");
  const r = await reporteDeClasesMuestra(conAlcance(prisma, elegida.id), { ...(desde ? { desde } : {}), ...(hasta ? { hasta } : {}) });
  if (o.json) console.log(JSON.stringify(r, null, 2));
  else {
    const linea = (f: FilaDeClasesMuestra): string => `  ${f.nombre.padEnd(28)} agendadas ${String(f.agendadas).padStart(4)} · asistidas ${String(f.asistidas).padStart(4)} · no asistieron ${String(f.no_asistidas).padStart(4)} · canceladas ${String(f.canceladas).padStart(4)} · inscritas ${String(f.inscritas).padStart(4)} · conversión ${oGuion(f.conversion)}${f.conversion ? " %" : ""}`;
    console.log(`Clases muestra de ${elegida.nombre}${desde || hasta ? ` (${desde ?? "…"} a ${hasta ?? "…"})` : ""}`);
    console.log(linea(r.total));
    for (const [titulo, filas] of [["Por fuente", r.por_fuente], ["Por vertical", r.por_vertical], ["Por sucursal", r.por_sucursal]] as const) {
      console.log(`\n${titulo}`);
      for (const f of filas) console.log(linea(f));
    }
  }
} finally {
  await prisma.$disconnect();
}
