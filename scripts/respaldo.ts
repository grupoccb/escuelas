// Respaldo lógico de la base de datos (K5): pg_dump en formato custom, cifrado opcional, suma de verificación y retención.
//
//   npm run respaldo                                       # a ./respaldos, sin cifrar (solo desarrollo)
//   RESPALDO_CLAVE='frase larga' npm run respaldo -- --destino /ruta --retener 14   # cifrado (AES-256-GCM); conserva los 14 más recientes
//   npm run respaldo -- --verificar respaldos/archivo.dump.enc     # comprueba la suma de verificación y que la frase lo abre
//
// La conexión sale de DATABASE_URL (.env). Sin pg_dump instalado se usa el contenedor de Postgres local que publique el puerto de DATABASE_URL (o RESPALDO_CONTENEDOR).
// La clave de cifrado de los datos de salud (CLAVE_DATOS_SENSIBLES) NO está en la base ni en este respaldo: se respalda aparte (docs/RESPALDO.md).

import { parseArgs } from "node:util";
import { existsSync } from "node:fs";
import { respaldar, verificarRespaldo } from "./lib/respaldo.ts";
import { esProduccion } from "../src/seguridad/entorno.ts";

if (existsSync(".env")) process.loadEnvFile(".env");

const { values: o } = parseArgs({ options: { destino: { type: "string", default: "respaldos" }, retener: { type: "string" }, verificar: { type: "string" }, "sin-cifrar": { type: "boolean", default: false } } });
const frase = process.env["RESPALDO_CLAVE"];

try {
  if (o.verificar) {
    const meta = await verificarRespaldo(o.verificar, frase);
    console.log(`✓ ${o.verificar}: íntegro (${meta.bytes} bytes, ${meta.cifrado ? "cifrado" : "sin cifrar"}, ${Object.keys(meta.filasPorTabla).length} tablas, ${meta.migraciones} migraciones)`);
  } else {
    const url = process.env["DATABASE_URL"];
    if (!url) throw new Error("Falta DATABASE_URL");
    if (!frase && !o["sin-cifrar"] && esProduccion(process.env)) throw new Error("En producción el respaldo va cifrado: define RESPALDO_CLAVE (o --sin-cifrar si de verdad lo quieres)");
    if (frase && frase.length < 16) throw new Error("RESPALDO_CLAVE debe tener al menos 16 caracteres");
    const r = await respaldar({ url, directorio: o.destino!, ...(frase && !o["sin-cifrar"] ? { frase } : {}), ...(o.retener !== undefined ? { retener: Number(o.retener) } : {}) });
    const total = Object.values(r.metadatos.filasPorTabla).reduce((a, b) => a + b, 0);
    console.log(`✓ respaldo ${r.archivo} (${r.metadatos.bytes} bytes, ${r.metadatos.cifrado ? "cifrado" : "SIN cifrar"}, ${Object.keys(r.metadatos.filasPorTabla).length} tablas, ${total} filas, ${r.metadatos.migraciones} migraciones)`);
    if (r.borrados.length > 0) console.log(`  retención: se borraron ${r.borrados.length} respaldos viejos`);
    if (!r.metadatos.cifrado) console.warn("  ⚠ sin cifrar: contiene datos de menores. Úsalo solo en desarrollo.");
  }
} catch (e) {
  console.error(`✗ ${(e as Error).message}`);
  process.exit(1);
}
