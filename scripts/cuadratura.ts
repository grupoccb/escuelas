// Cuadratura del dinero (H7): comprueba que pagos, aplicaciones, cargos, ventas y stock cuadran, en decimales exactos.
//
//   npm run cuadratura                                   (todas las organizaciones de DATABASE_URL)
//   npm run cuadratura -- --organizacion <id|nombre>     (una)
//   npm run cuadratura -- --json
//
// Sale con código 0 si todo cuadra y 1 si hay una sola discrepancia. Solo lee.

import { parseArgs } from "node:util";
import { conAlcance } from "../src/datos/alcance.ts";
import { crearPrisma } from "../src/datos/prisma.ts";
import { listarOrganizaciones } from "../src/datos/sistema.ts";
import { cuadratura } from "../src/finanzas/cuadratura.ts";

if (process.argv[1] && process.argv[1].endsWith("cuadratura.ts")) {
  const { values: o } = parseArgs({ options: { organizacion: { type: "string" }, json: { type: "boolean", default: false } } });
  const prisma = crearPrisma();
  let malas = 0;
  try {
    const todas = await listarOrganizaciones(prisma);
    const elegidas = o.organizacion ? todas.filter((x) => x.id === o.organizacion || x.nombre === o.organizacion) : todas;
    if (elegidas.length === 0) throw new Error(o.organizacion ? `No hay una organización «${o.organizacion}»` : "No hay organizaciones");
    const salida = [];
    for (const org of elegidas) {
      const r = await cuadratura(conAlcance(prisma, org.id));
      if (!r.ok) malas++;
      salida.push({ organizacion: org.nombre, id: org.id, ...r });
      if (!o.json) {
        console.log(`${r.ok ? "✓ cuadra" : "✗ NO CUADRA"} — ${org.nombre}`);
        console.log(`  cargos: ${r.resumen.cargos} · pagos: ${r.resumen.pagos} · aplicaciones: ${r.resumen.aplicaciones} · ventas: ${r.resumen.ventas}`);
        console.log(`  cargado: ${r.resumen.totalCargado} · pagado: ${r.resumen.totalPagado} · saldo: ${r.resumen.saldoTotal}`);
        for (const d of r.discrepancias) console.log(`  ✗ [${d.regla}]${d.id ? ` ${d.id}` : ""}: ${d.detalle}`);
      }
    }
    if (o.json) console.log(JSON.stringify(salida, null, 2));
  } finally {
    await prisma.$disconnect();
  }
  process.exitCode = malas > 0 ? 1 : 0;
}
