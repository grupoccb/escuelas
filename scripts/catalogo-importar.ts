// Carga el catálogo de una escuela desde una carpeta con las plantillas llenas (V6): el mismo importador de Administración → «Cargar catálogo», desde la línea de comandos.
//
//   npm run catalogo:importar -- --organizacion <identificador> --carpeta <carpeta con los .csv>
//   npm run catalogo:importar -- --organizacion <identificador> --carpeta <carpeta> --aplicar --administrador <correo>
//
// Sin `--aplicar` SOLO SIMULA: valida todo, imprime los errores por archivo, fila y columna y no escribe nada. Con `--aplicar` simula primero y, si no hay errores, escribe todo o nada
// (idempotente: volver a correrlo no duplica ni cambia nada). `--administrador` es el correo de un administrador de la organización: a su nombre queda el registro de cambios.
// `--json` imprime el informe completo en JSON. Código de salida: 0 todo bien (o «sin cambios»), 1 hay errores o la carga no se pudo hacer.
//
// Lee la base de DATABASE_URL (.env). Las plantillas vacías: `npm run catalogo:plantillas` (o Administración → Cargar catálogo).

import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { conAlcance } from "../src/datos/alcance.ts";
import { crearPrisma } from "../src/datos/prisma.ts";
import { resolverOrganizacionPorSlug } from "../src/datos/sistema.ts";
import { importarCatalogo, type Informe } from "../src/catalogo/importacion/index.ts";

const { values: o } = parseArgs({
  options: {
    organizacion: { type: "string" },
    carpeta: { type: "string" },
    aplicar: { type: "boolean", default: false },
    administrador: { type: "string" },
    json: { type: "boolean", default: false },
  },
});

function imprimir(informe: Informe): void {
  if (informe.archivos.length > 0) {
    console.log("Archivos leídos:");
    for (const a of informe.archivos) console.log(`  ${a.nombre}: ${a.hoja ? `${a.hoja} (${a.filas} filas)` : "no se reconoció"}`);
  }
  if (informe.errores.length > 0) {
    console.log(`\nErrores (${informe.errores.length + informe.errores_omitidos}):`);
    let archivo = "";
    for (const e of informe.errores) {
      if (e.archivo !== archivo) {
        archivo = e.archivo;
        console.log(`\n  ${archivo}`);
      }
      console.log(`    ${e.texto}`);
    }
    if (informe.errores_omitidos > 0) console.log(`\n  … y ${informe.errores_omitidos} más.`);
  }
  if (informe.avisos.length > 0) {
    console.log(`\nAvisos (no impiden cargar):`);
    for (const a of informe.avisos) console.log(`  ${a.archivo}: ${a.texto}`);
  }
  if (informe.limpia) {
    console.log("\nResumen:");
    for (const r of informe.resumen) console.log(`  ${r.nombre}: ${r.creados} nuevos, ${r.actualizados} actualizados, ${r.sin_cambios} sin cambios`);
    if (informe.cambios.length > 0) {
      console.log("\nCambios:");
      for (const c of informe.cambios) console.log(`  - ${c.descripcion}`);
      if (informe.cambios_omitidos > 0) console.log(`  … y ${informe.cambios_omitidos} más.`);
    }
  }
}

const prisma = crearPrisma();
try {
  if (!o.organizacion || !o.carpeta) throw new Error("Faltan --organizacion <identificador> y --carpeta <carpeta con los .csv>.");
  const org = await resolverOrganizacionPorSlug(prisma, o.organizacion);
  if (!org) throw new Error(`No existe la organización «${o.organizacion}».`);
  const carpeta = resolve(o.carpeta);
  const nombres = readdirSync(carpeta).filter((n) => /\.csv$/i.test(n)).sort();
  if (nombres.length === 0) throw new Error(`No hay archivos .csv en ${carpeta}.`);
  const archivos = nombres.map((nombre) => ({ nombre, bytes: readFileSync(join(carpeta, nombre)) }));
  const db = conAlcance(prisma, org.id);

  let usuarioId: string | undefined;
  if (o.aplicar) {
    if (!o.administrador) throw new Error("Para aplicar indica quién lo hace con --administrador <correo de un administrador de la organización>.");
    const u = await db.usuario.findFirst({ where: { correo: o.administrador.trim().toLowerCase(), rol: "administrador", activo: true }, select: { id: true } });
    if (!u) throw new Error(`No hay un administrador activo con el correo «${o.administrador}» en esa organización.`);
    usuarioId = u.id;
  }

  const simulacion = await importarCatalogo(db, { archivos, modo: "simulacion", organizacionId: org.id });
  let informe = simulacion;
  if (o.aplicar && simulacion.limpia) informe = await importarCatalogo(db, { archivos, modo: "aplicar", organizacionId: org.id, ...(usuarioId ? { usuarioId } : {}) });

  if (o.json) console.log(JSON.stringify(informe, null, 2));
  else {
    imprimir(informe);
    if (!informe.limpia) console.log("\nNo se guardó nada: corrige los errores y vuelve a intentar.");
    else if (informe.sin_cambios) console.log("\nSin cambios: todo lo del archivo ya estaba en el sistema.");
    else if (informe.aplicado) console.log("\nListo: el catálogo se cargó.");
    else console.log("\nSimulación limpia: no se escribió nada. Para cargarlo de verdad agrega --aplicar --administrador <correo>.");
  }
  if (!informe.limpia) process.exitCode = 1;
} catch (e) {
  console.error(`catalogo:importar: ${(e as Error).message}`);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
