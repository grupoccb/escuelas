// V13-fix (EV-01): las formas en que alguien puede escribir una ruta de módulo para saltarse la guarda. La usan `modulos-rutas.test.ts` (qué módulo clasifica cada una, sin base)
// y `modulos-api.itest.ts` (qué responde la API real con el módulo apagado). Una ruta concreta entra (`/api/cargos`) y salen todas sus disfraces.

export interface VarianteDeRuta {
  /** Para el mensaje de la prueba. */
  tipo: string;
  ruta: string;
  /** Solo tiene sentido contra el servidor completo (el router decide qué es «ruta»): `;a=b` no es parte del nombre de la ruta para la tabla. */
  soloServidor?: boolean;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `%xx` de la primera letra minúscula de un segmento (`cargos` → `%63argos`). */
function codificarLetra(segmento: string): string {
  const i = segmento.search(/[a-z]/);
  if (i < 0) return segmento;
  return segmento.slice(0, i) + "%" + segmento.charCodeAt(i).toString(16).toUpperCase() + segmento.slice(i + 1);
}

/** Todas las variantes (sin la ruta original). Cada una debe quedar en el MISMO módulo; los identificadores (uuid) no se tocan. */
export function variantesDeRuta(ruta: string): VarianteDeRuta[] {
  const segmentos = ruta.split("/"); // ["", "api", "cargos", …]
  const fijos = segmentos.map((s, i) => (i >= 2 && s !== "" && !UUID.test(s) ? i : -1)).filter((i) => i >= 0);
  const salida: VarianteDeRuta[] = [];
  const con = (tipo: string, f: (segs: string[]) => string[]) => salida.push({ tipo, ruta: f([...segmentos]).join("/") });

  con("«/API» en mayúsculas", (s) => ((s[1] = "API"), s));
  con("«/Api» mixto", (s) => ((s[1] = "Api"), s));
  con("todo en mayúsculas (menos los identificadores)", (s) => s.map((x) => (UUID.test(x) ? x : x.toUpperCase())));
  con("todo con inicial mayúscula", (s) => s.map((x, i) => (i >= 1 && !UUID.test(x) && x ? x[0]!.toUpperCase() + x.slice(1) : x)));
  // Solo la cola en otra capitalización: el prefijo «/api» correcto (aquí se escapaban 18 rutas: cotizaciones, convertir, gastos, pase…).
  for (const i of fijos) {
    con(`solo el segmento ${i} en mayúsculas`, (s) => ((s[i] = s[i]!.toUpperCase()), s));
    con(`solo el segmento ${i} con inicial mayúscula`, (s) => ((s[i] = s[i]![0]!.toUpperCase() + s[i]!.slice(1)), s));
    con(`segmento ${i} con una letra codificada (%xx)`, (s) => ((s[i] = codificarLetra(s[i]!)), s));
  }
  salida.push({ tipo: "barra final", ruta: ruta + "/" });
  salida.push({ tipo: "dos barras finales", ruta: ruta + "//" });
  salida.push({ tipo: "barra final y mayúsculas", ruta: ruta.toUpperCase().replace(/[0-9A-F]{8}-[0-9A-F-]{27}/g, (u) => u.toLowerCase()) + "/" });
  salida.push({ tipo: "doble barra después de /api", ruta: ruta.replace("/api/", "/api//") });
  salida.push({ tipo: "doble barra en la cola", ruta: ruta.replace(/^(\/api\/[^/]+)\//, "$1//") });
  salida.push({ tipo: "punto y coma", ruta: ruta + ";a=b", soloServidor: true });
  salida.push({ tipo: "con consulta", ruta: ruta + "?x=1" });
  salida.push({ tipo: "con consulta y mayúsculas", ruta: ruta.replace("/api/", "/Api/") + "?x=1" });
  return salida.filter((v) => v.ruta !== ruta);
}
