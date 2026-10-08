// Reporte de leads por campaña, sucursal y etapa (Fase 1, bloque 1.7).
//
//   npm run reporte:leads
//   npm run reporte:leads -- --organizacion "Escuela demo" --desde 2026-10-01 --hasta 2026-11-01
//   npm run reporte:leads -- --vertical <slug> --json
//
// Lee la base de DATABASE_URL (.env). Con una sola organización no hace falta indicarla.

import { parseArgs } from "node:util";
import { conAlcance } from "../src/datos/alcance.ts";
import { crearPrisma } from "../src/datos/prisma.ts";
import { listarOrganizaciones } from "../src/datos/sistema.ts";
import { formatearReporteLeads, reporteLeads } from "../src/reportes/leads.ts";

const { values: o } = parseArgs({
  options: {
    organizacion: { type: "string" },
    desde: { type: "string" },
    hasta: { type: "string" },
    vertical: { type: "string" },
    json: { type: "boolean", default: false },
  },
});

function fecha(valor: string | undefined, nombre: string): Date | undefined {
  if (valor === undefined) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor) || Number.isNaN(new Date(`${valor}T00:00:00Z`).getTime())) {
    throw new Error(`--${nombre} debe ser AAAA-MM-DD, no "${valor}"`);
  }
  return new Date(`${valor}T00:00:00Z`);
}

const prisma = crearPrisma();
try {
  const organizaciones = await listarOrganizaciones(prisma);
  const elegida = o.organizacion
    ? organizaciones.find((x) => x.id === o.organizacion || x.nombre === o.organizacion)
    : organizaciones.length === 1
      ? organizaciones[0]
      : undefined;
  if (!elegida) {
    const nombres = organizaciones.map((x) => `"${x.nombre}"`).join(", ") || "ninguna";
    throw new Error(`Indica la organización con --organizacion <nombre o id> (existentes: ${nombres}).`);
  }

  const desde = fecha(o.desde, "desde");
  const hasta = fecha(o.hasta, "hasta");
  const reporte = await reporteLeads(conAlcance(prisma, elegida.id), {
    ...(desde ? { desde } : {}),
    ...(hasta ? { hasta } : {}),
    ...(o.vertical ? { verticalSlug: o.vertical } : {}),
  });
  console.log(o.json ? JSON.stringify(reporte, null, 2) : `${elegida.nombre}\n\n${formatearReporteLeads(reporte)}`);
} catch (e) {
  console.error(`reporte:leads: ${(e as Error).message}`);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
