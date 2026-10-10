// V8: de la guía en Markdown (`docs/guias/*.md`) a una página HTML para imprimirla a PDF (hoja carta) o leerla en el celular. Solo entiende lo que las guías usan: títulos, párrafos, listas,
// tablas de dos columnas, imágenes (en fila, todas juntas), enlaces, *cursivas* y **negritas**. Las imágenes van incrustadas: la página no depende de ningún archivo ni de internet.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const escapar = (t: string): string => t.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

function imagen(ruta: string, base: string): string {
  const bytes = readFileSync(resolve(base, ruta));
  return `data:image/png;base64,${bytes.toString("base64")}`;
}

function enLinea(texto: string, base: string): string {
  return escapar(texto)
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt: string, ruta: string) => `<img alt="${alt}" src="${imagen(ruta, base)}">`)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "<span class=\"enlace\">$1</span>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");
}

export type Presentacion = "carta" | "celular";

const CSS_COMUN = `
  * { box-sizing: border-box; }
  body { margin: 0; color: #14181f; font-family: -apple-system, "Helvetica Neue", Arial, sans-serif; }
  h1 { margin: 0 0 1.5mm; color: #14181f; border-bottom: 2px solid #1d5fbf; padding-bottom: 1mm; }
  h2 { color: #1d5fbf; }
  p, ol, ul, table { margin-top: 0; }
  img { display: block; border: 1px solid #c9cfd8; border-radius: 3px; }
  em { color: #4a5361; }
  strong { color: #8a3b00; }
  .enlace { color: #1d5fbf; text-decoration: underline; }
  table { border-collapse: collapse; width: 100%; }
  th { text-align: left; background: #eef2f8; }
  td, th { border: 1px solid #c9cfd8; vertical-align: top; }
`;

const CSS_CARTA = `
  @page { size: Letter; margin: 9mm 11mm; }
  body { font-size: 9pt; line-height: 1.3; }
  h1 { font-size: 15pt; }
  h2 { font-size: 10pt; margin: 2.2mm 0 0.8mm; }
  p { margin-bottom: 1.2mm; }
  ol, ul { margin-bottom: 1.2mm; padding-left: 4.5mm; }
  li { margin-bottom: 0.6mm; }
  td, th { padding: 0.6mm 1.4mm; font-size: 8pt; }
  .galeria { display: grid; grid-template-columns: repeat(var(--columnas, 3), 1fr); gap: 1.6mm; margin: 1.5mm 0; }
  .galeria img { width: 100%; height: var(--alto, 39mm); object-fit: contain; object-position: center top; background: #f4f6fa; }
  .columnas { column-count: 2; column-gap: 6mm; }
  .columnas h2, .columnas table, .columnas li { break-inside: avoid; }
`;

const CSS_CELULAR = `
  body { margin: 0; padding: 0 14px 20px; font-size: 16px; line-height: 1.45; }
  h1 { font-size: 24px; margin-top: 14px; }
  h2 { font-size: 19px; margin: 22px 0 8px; }
  ol, ul { padding-left: 22px; }
  li { margin-bottom: 10px; }
  p, li { overflow-wrap: anywhere; }
  .galeria { margin: 10px 0; }
  .galeria img { width: 100%; max-width: 360px; height: auto; margin: 0 auto 10px; }
  table, tbody, tr, td { display: block; width: 100%; }
  thead { display: none; }
  tr { border: 1px solid #c9cfd8; border-radius: 8px; margin-bottom: 10px; padding: 8px 10px; background: #f7f9fc; }
  td { border: 0; padding: 2px 0; }
  td:first-child { font-weight: 600; }
`;

/** El documento completo, listo para `page.setContent`. `columnas`: en la hoja carta, el texto va en dos columnas (para las guías más largas). */
export function guiaAHtml(rutaMd: string, o: { presentacion: Presentacion; columnas?: boolean; galeria?: { columnas: number; alto: string } }): string {
  const base = dirname(rutaMd);
  const lineas = readFileSync(rutaMd, "utf8").split("\n");
  const salida: string[] = [];
  let i = 0;
  while (i < lineas.length) {
    const l = lineas[i]!;
    if (l.trim() === "") {
      i++;
    } else if (/^#{1,3}\s/.test(l)) {
      const n = /^#+/.exec(l)![0].length;
      salida.push(`<h${n}>${enLinea(l.replace(/^#+\s*/, ""), base)}</h${n}>`);
      i++;
    } else if (/^!\[/.test(l)) {
      const imgs: string[] = [];
      while (i < lineas.length && /^!\[/.test(lineas[i]!)) imgs.push(enLinea(lineas[i++]!, base));
      salida.push(`<div class="galeria">${imgs.join("")}</div>`);
    } else if (/^\|/.test(l)) {
      const filas: string[][] = [];
      while (i < lineas.length && /^\|/.test(lineas[i]!)) {
        const celdas = lineas[i++]!.replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
        if (!celdas.every((c) => /^:?-+:?$/.test(c))) filas.push(celdas);
      }
      const [cabecera, ...cuerpo] = filas;
      salida.push(`<table><thead><tr>${cabecera!.map((c) => `<th>${enLinea(c, base)}</th>`).join("")}</tr></thead><tbody>${cuerpo.map((f) => `<tr>${f.map((c) => `<td>${enLinea(c, base)}</td>`).join("")}</tr>`).join("")}</tbody></table>`);
    } else if (/^(\d+\.|-)\s/.test(l)) {
      const ordenada = /^\d+\./.test(l);
      const items: string[] = [];
      while (i < lineas.length && /^(\d+\.|-)\s/.test(lineas[i]!)) items.push(`<li>${enLinea(lineas[i++]!.replace(/^(\d+\.|-)\s+/, ""), base)}</li>`);
      salida.push(`<${ordenada ? "ol" : "ul"}>${items.join("")}</${ordenada ? "ol" : "ul"}>`);
    } else {
      const parrafo: string[] = [];
      while (i < lineas.length && lineas[i]!.trim() !== "" && !/^(#|!\[|\||\d+\.\s|-\s)/.test(lineas[i]!)) parrafo.push(lineas[i++]!);
      salida.push(`<p>${enLinea(parrafo.join(" "), base)}</p>`);
    }
  }
  const css = CSS_COMUN + (o.presentacion === "carta" ? CSS_CARTA : CSS_CELULAR);
  // El título y la nota de arriba ocupan todo el ancho; el resto va en columnas si se pidió.
  let cuerpo = salida.join("\n");
  if (o.presentacion === "carta") {
    // En la hoja, las imágenes van juntas al final y a todo lo ancho; el texto, en dos columnas si se pidió.
    const imagenes = salida.filter((s) => s.startsWith('<div class="galeria">')).flatMap((s) => s.match(/<img [^>]*>/g) ?? []);
    const galerias = imagenes.length > 0 ? [`<div class="galeria">${imagenes.join("")}</div>`] : [];
    const texto = salida.filter((s) => !s.startsWith('<div class="galeria">'));
    const corte = texto.findIndex((s) => s.startsWith("<h2"));
    cuerpo = o.columnas ? `${texto.slice(0, corte).join("\n")}<div class="columnas">${texto.slice(corte).join("\n")}</div>` : texto.join("\n");
    cuerpo += galerias.join("\n");
  }
  const g = o.galeria ?? { columnas: 3, alto: "39mm" };
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Guía</title><style>:root { --columnas: ${g.columnas}; --alto: ${g.alto}; }${css}</style></head><body>${cuerpo}</body></html>`;
}
