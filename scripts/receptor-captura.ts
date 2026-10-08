// Receptor de capturas para pruebas manuales (N2): guarda cada POST que recibe, con sus
// encabezados, en el directorio dado. Herramienta de desarrollo; no es parte del producto.
//
//   node scripts/receptor-captura.ts <directorio> [puerto]

import { createServer } from "node:http";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const directorio = process.argv[2];
const puerto = Number(process.argv[3] ?? 4599);
if (!directorio) throw new Error("Uso: receptor-captura.ts <directorio> [puerto]");
mkdirSync(directorio, { recursive: true });

let n = 0;
createServer((req, res) => {
  const trozos: Buffer[] = [];
  req.on("data", (t: Buffer) => trozos.push(t));
  req.on("end", () => {
    const cuerpo = Buffer.concat(trozos).toString("utf8");
    let json: unknown = cuerpo;
    try {
      json = JSON.parse(cuerpo);
    } catch {
      /* se guarda como texto */
    }
    n += 1;
    const evento = typeof json === "object" && json !== null ? String((json as Record<string, unknown>)["event"] ?? "sin-evento") : "texto";
    const archivo = join(directorio, `${String(n).padStart(3, "0")}-${evento}.json`);
    writeFileSync(archivo, JSON.stringify({ recibido_en: new Date().toISOString(), encabezados: req.headers, cuerpo: json }, null, 2));
    console.log(`captura ${archivo}`);
    res.statusCode = 200;
    res.end("ok");
  });
}).listen(puerto, "0.0.0.0", () => console.log(`receptor en :${puerto} → ${directorio}`));
