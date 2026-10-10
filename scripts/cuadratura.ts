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
import { log } from "../src/lib/log.ts";
import { cuadratura } from "../src/finanzas/cuadratura.ts";

if (process.argv[1] && process.argv[1].endsWith("cuadratura.ts")) {
  const { values: o } = parseArgs({ options: { organizacion: { type: "string" }, json: { type: "boolean", default: false } } });
  const prisma = crearPrisma();
  let malas = 0;
  try {
    const todas = await listarOrganizaciones(prisma);
    const elegidas = o.organizacion ? todas.filter((x) => x.id === o.organizacion || x.nombre === o.organizacion) : todas;
    // V10 (EK-29): antes lanzaba una excepción con su traza (sobre una base sin organizaciones, que es lo normal en una instalación recién migrada). Una base sin organizaciones no tiene
    // nada que cuadrar (sale 0 y lo dice); una organización pedida por nombre que no existe sí es un error de quien lo pidió (sale 1, sin traza).
    if (elegidas.length === 0) {
      if (o.organizacion) {
        console.error(`No hay una organización «${o.organizacion}» en esta base.`);
        malas++;
      } else {
        if (!o.json) console.log("No hay organizaciones en esta base: no hay nada que cuadrar.");
      }
    }
    const salida = [];
    for (const org of elegidas) {
      const r = await cuadratura(conAlcance(prisma, org.id));
      if (!r.ok) malas++;
      // K4: una línea JSON por organización para que la alarma de CloudWatch (infra/monitoreo.tf) y los logs lo vean. Solo conteos, nunca importes de una persona.
      if (r.ok) log.info("cuadratura_ok", { organizacion: org.id, cargos: r.resumen.cargos, pagos: r.resumen.pagos });
      else log.error("cuadratura_descuadre", { organizacion: org.id, discrepancias: r.discrepancias.length, reglas: [...new Set(r.discrepancias.map((d) => d.regla))] });
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
