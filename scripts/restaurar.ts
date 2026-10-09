// Restaura un respaldo en una base NUEVA (K5) y compara lo restaurado con lo que el respaldo dice que tenía.
//
//   npm run restaurar -- --archivo respaldos/inscripciones-20261009-120000Z.dump --base inscripciones_restaurada
//   RESPALDO_CLAVE='frase' npm run restaurar -- --archivo respaldos/….dump.enc --base inscripciones_restaurada
//   ... --reemplazar    borra la base destino si ya tiene tablas (pide --confirmar)
//
// El servidor es el de DATABASE_URL (otra base en el mismo servidor). Nunca restaura sobre la base de origen sin --reemplazar --confirmar.

import { parseArgs } from "node:util";
import { existsSync } from "node:fs";
import { restaurar, leerConexion, verificarRespaldo, type MetadatosDeRespaldo } from "./lib/respaldo.ts";

if (existsSync(".env")) process.loadEnvFile(".env");

const { values: o } = parseArgs({ options: { archivo: { type: "string" }, base: { type: "string" }, reemplazar: { type: "boolean", default: false }, confirmar: { type: "boolean", default: false } } });
try {
  if (!o.archivo || !o.base) throw new Error("Uso: npm run restaurar -- --archivo <respaldo> --base <nombre_de_la_base_nueva> [--reemplazar --confirmar]");
  const origen = process.env["DATABASE_URL"];
  if (!origen) throw new Error("Falta DATABASE_URL (el servidor donde se restaura)");
  const frase = process.env["RESPALDO_CLAVE"];
  const con = leerConexion(origen);
  if (o.base === con.base && !(o.reemplazar && o.confirmar)) throw new Error(`«${o.base}» es la base de DATABASE_URL: restaurar encima exige --reemplazar --confirmar`);
  if (o.reemplazar && !o.confirmar) throw new Error("--reemplazar borra la base destino: confirma con --confirmar");
  const meta: MetadatosDeRespaldo = await verificarRespaldo(o.archivo, frase);
  const u = new URL(origen);
  u.pathname = `/${o.base}`;
  const r = await restaurar({ archivo: o.archivo, urlDestino: u.toString(), ...(frase ? { frase } : {}), ...(o.reemplazar ? { reemplazar: true } : {}) });
  const distintas = Object.entries(meta.filasPorTabla).filter(([t, n]) => r.filasPorTabla[t] !== n);
  console.log(`✓ restaurado en «${r.base}»: ${Object.keys(r.filasPorTabla).length} tablas, ${r.migraciones} migraciones`);
  if (distintas.length > 0 || r.migraciones !== meta.migraciones) {
    for (const [t, n] of distintas) console.error(`  ✗ ${t}: el respaldo decía ${n} filas y hay ${r.filasPorTabla[t] ?? "ninguna (falta la tabla)"}`);
    throw new Error("Lo restaurado NO coincide con el respaldo");
  }
  console.log("✓ los conteos de cada tabla y las migraciones coinciden con los del respaldo.");
  console.log(`  Siguiente paso: DATABASE_URL=… npm run cuadratura   (el dinero cuadra)  y  npx prisma migrate status   (migraciones al día)`);
} catch (e) {
  console.error(`✗ ${(e as Error).message}`);
  process.exit(1);
}
