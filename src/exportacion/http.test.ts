// I5: la descarga por lotes pide por tramos con cursor, escribe a medida que llega, respeta el tope y, si falla a la mitad, corta la conexión (no deja un archivo que parezca completo).
import { test } from "node:test";
import assert from "node:assert/strict";
import { enviarCsv, enviarCsvPorLotes, type RespuestaDeDescarga } from "./http.ts";
import type { Columna } from "./csv.ts";

/** Una respuesta falsa que guarda todo lo que se le escribe. `contrapresion` simula un cliente lento: la primera escritura devuelve false hasta que se emite `drain`. */
function respuestaFalsa(o: { contrapresion?: boolean } = {}) {
  const cabeceras = new Map<string, string>();
  const trozos: string[] = [];
  const oyentes = new Map<string, (() => void)[]>();
  const r = {
    codigo: 0,
    terminada: false,
    destruida: false,
    error: undefined as Error | undefined,
    cabeceras,
    trozos,
    get texto() {
      return trozos.join("");
    },
    status(c: number) {
      r.codigo = c;
      return r;
    },
    setHeader(n: string, v: string) {
      cabeceras.set(n.toLowerCase(), v);
      return r;
    },
    send(c: string) {
      trozos.push(c);
      r.terminada = true;
      return r;
    },
    write(t: string) {
      trozos.push(t);
      if (o.contrapresion && trozos.length === 1) {
        setImmediate(() => (oyentes.get("drain") ?? []).forEach((f) => f()));
        return false;
      }
      return true;
    },
    end() {
      r.terminada = true;
      return r;
    },
    once(e: string, f: () => void) {
      oyentes.set(e, [...(oyentes.get(e) ?? []), f]);
      return r;
    },
    destroy(e?: Error) {
      r.destruida = true;
      r.error = e;
      return r;
    },
    get destroyed() {
      return r.destruida;
    },
  };
  return r satisfies RespuestaDeDescarga & Record<string, unknown>;
}
interface Fila {
  id: number;
  nombre: string;
}
const columnas: Columna<Fila>[] = [
  { titulo: "Id", tipo: "entero", valor: (f) => f.id },
  { titulo: "Nombre", valor: (f) => f.nombre },
];
/** Una fuente de `total` filas ordenadas por id, con cursor: devuelve el lote que sigue a `ultima`. */
function fuente(total: number, llamadas: number[] = []) {
  return async (ultima: Fila | null, tamano: number): Promise<Fila[]> => {
    const desde = ultima ? ultima.id + 1 : 1;
    const lote = Array.from({ length: Math.max(0, Math.min(tamano, total - desde + 1)) }, (_, i) => ({ id: desde + i, nombre: `N${desde + i}` }));
    llamadas.push(lote.length);
    return lote;
  };
}

test("enviarCsv: cabeceras de descarga seguras", () => {
  const res = respuestaFalsa();
  enviarCsv(res, "Reporte — de prueba", "x");
  assert.equal(res.codigo, 200);
  assert.equal(res.cabeceras.get("content-type"), "text/csv; charset=utf-8");
  assert.equal(res.cabeceras.get("content-disposition"), `attachment; filename="Reporte-de-prueba.csv"; filename*=UTF-8''Reporte-de-prueba.csv`);
  assert.equal(res.cabeceras.get("cache-control"), "no-store");
  assert.equal(res.cabeceras.get("x-content-type-options"), "nosniff");
});

test("por lotes: pide por tramos con cursor, no repite ni se salta filas, y escribe BOM y encabezado una sola vez", async () => {
  const res = respuestaFalsa();
  const llamadas: number[] = [];
  const n = await enviarCsvPorLotes(res, "lista", columnas, fuente(1_050, llamadas), { tamano: 500 });
  assert.equal(n, 1_050);
  assert.deepEqual(llamadas, [500, 500, 50], "tres lotes; el último, corto, termina");
  assert.ok(res.trozos.length >= 3, "se escribió por trozos, no de una vez");
  const lineas = res.texto.replace(/^\uFEFF/, "").split("\r\n");
  assert.equal(lineas[0], "Id,Nombre");
  assert.equal(lineas.length, 1 + 1_050 + 1, "encabezado, filas y el cierre vacío del último CRLF");
  assert.deepEqual(lineas.slice(1, -1).map((l) => Number(l.split(",")[0])), Array.from({ length: 1_050 }, (_, i) => i + 1));
  assert.equal(res.texto.charCodeAt(0), 0xfeff);
  assert.equal(res.terminada, true);
  assert.equal(res.destruida, false);
});

test("por lotes: una lista vacía es un archivo con solo el encabezado; una lista de exactamente un lote pide uno más para saber que terminó", async () => {
  const vacia = respuestaFalsa();
  assert.equal(await enviarCsvPorLotes(vacia, "v", columnas, fuente(0), { tamano: 500 }), 0);
  assert.equal(vacia.texto, "\uFEFFId,Nombre\r\n");
  const llamadas: number[] = [];
  const exacta = respuestaFalsa();
  assert.equal(await enviarCsvPorLotes(exacta, "e", columnas, fuente(500, llamadas), { tamano: 500 }), 500);
  assert.deepEqual(llamadas, [500, 0]);
});

test("por lotes: el tope de filas corta la descarga aunque haya más", async () => {
  const res = respuestaFalsa();
  const n = await enviarCsvPorLotes(res, "t", columnas, fuente(5_000), { tamano: 100, maximo: 250 });
  assert.equal(n, 250);
  assert.equal(res.texto.split("\r\n").length, 1 + 250 + 1);
});

test("por lotes: un cliente lento (contrapresión) no pierde filas", async () => {
  const res = respuestaFalsa({ contrapresion: true });
  assert.equal(await enviarCsvPorLotes(res, "l", columnas, fuente(30), { tamano: 10 }), 30);
  assert.equal(res.texto.split("\r\n").length, 1 + 30 + 1);
});

test("por lotes: si falla el PRIMER lote no se escribe nada (el error sale como HTTP normal); si falla uno posterior se corta la conexión y se avisa", async () => {
  const antes = respuestaFalsa();
  await assert.rejects(() => enviarCsvPorLotes(antes, "x", columnas, async () => Promise.reject(new Error("base caída")), { tamano: 10 }), /base caída/);
  assert.equal(antes.trozos.length, 0);
  assert.equal(antes.cabeceras.size, 0);
  const aMedias = respuestaFalsa();
  let llamada = 0;
  const avisos: unknown[] = [];
  const n = await enviarCsvPorLotes(
    aMedias,
    "x",
    columnas,
    async (ultima, tamano) => {
      if (++llamada === 2) throw new Error("se cayó a la mitad");
      return fuente(100)(ultima, tamano);
    },
    { tamano: 10, alFallar: (e) => avisos.push(e) },
  );
  assert.equal(n, 10);
  assert.equal(aMedias.destruida, true, "la conexión se corta: el archivo no parece completo");
  assert.equal(aMedias.terminada, false);
  assert.match(aMedias.error?.message ?? "", /se cayó a la mitad/);
  assert.equal(avisos.length, 1);
});

test("por lotes: las fórmulas se neutralizan también en la descarga por lotes", async () => {
  const res = respuestaFalsa();
  await enviarCsvPorLotes(res, "f", columnas, async (ultima) => (ultima ? [] : [{ id: 1, nombre: "=1+1" }]), { tamano: 10 });
  assert.equal(res.texto, "\uFEFFId,Nombre\r\n1,'=1+1\r\n");
});
