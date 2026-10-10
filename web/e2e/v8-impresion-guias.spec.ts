// V8: (corre DESPUÉS de las capturas: va después en orden alfabético) cada guía impresa a PDF desde el navegador: hoja carta, en el número de páginas que se le permite (una hoja cada una), y la del maestro además en
// formato de celular (390 px: tarjetas cortas, sin desborde horizontal). Los PDF quedan en `docs/guias/pdf/`. Lo corre `npm run guias:capturas` después de tomar las imágenes.

import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { guiaAHtml } from "./guias-md.ts";
import { DIR_NAVEGADOR, RAIZ } from "./mundo.ts";

const CARPETA = resolve(RAIZ, "docs/guias");
// Con `npm run guias:capturas` (GUIAS_ESCRIBIR=1) los PDF quedan en `docs/guias/pdf/`; en `test:navegador` solo se comprueba que caben, en la carpeta de la corrida.
const PDF = process.env["GUIAS_ESCRIBIR"] === "1" ? resolve(CARPETA, "pdf") : resolve(DIR_NAVEGADOR, "guias-pdf");

/** Páginas que se le permiten a cada guía en hoja carta. */
const GUIAS: { nombre: string; paginas: number; columnas: boolean; galeria?: { columnas: number; alto: string } }[] = [
  { nombre: "asesor", paginas: 1, columnas: true, galeria: { columnas: 3, alto: "33mm" } },
  { nombre: "maestro", paginas: 1, columnas: true, galeria: { columnas: 4, alto: "62mm" } },
  { nombre: "recepcion", paginas: 1, columnas: true },
  { nombre: "administrador", paginas: 1, columnas: true, galeria: { columnas: 3, alto: "30mm" } },
];

/** Las páginas de un PDF (cada una trae su `/Type /Page`; el árbol de páginas es `/Type /Pages`). */
const contarPaginas = (pdf: Buffer): number => (pdf.toString("latin1").match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length;

test.beforeAll(() => mkdirSync(PDF, { recursive: true }));

for (const g of GUIAS) {
  test(`${g.nombre}: cabe en ${g.paginas === 1 ? "una hoja carta" : `${g.paginas} hojas carta`}`, async ({ page }) => {
    await page.setContent(guiaAHtml(resolve(CARPETA, `${g.nombre}.md`), { presentacion: "carta", columnas: g.columnas, ...(g.galeria ? { galeria: g.galeria } : {}) }));
    await page.emulateMedia({ media: "print" });
    const pdf = await page.pdf({ format: "Letter", printBackground: true, preferCSSPageSize: true });
    writeFileSync(resolve(PDF, `${g.nombre}.pdf`), pdf);
    expect(contarPaginas(pdf), `La guía «${g.nombre}» ya no cabe en ${g.paginas} hoja(s) carta: recórtala o achica las capturas`).toBeLessThanOrEqual(g.paginas);
  });
}

test("maestro: la versión para el celular se lee a 390 px, sin desborde ni letra chica", async ({ browser }) => {
  const html = guiaAHtml(resolve(CARPETA, "maestro.md"), { presentacion: "celular" });
  const contexto = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "es-MX" });
  const page = await contexto.newPage();
  await page.setContent(html);
  const medidas = await page.evaluate(() => {
    const letra = [...document.querySelectorAll("p, li, td, h2")].map((e) => parseFloat(getComputedStyle(e).fontSize));
    return { ancho: document.documentElement.clientWidth, anchoDelDocumento: document.documentElement.scrollWidth, letraMinima: Math.min(...letra) };
  });
  expect(medidas.anchoDelDocumento, "la guía del maestro se desborda en un celular de 390 px").toBeLessThanOrEqual(medidas.ancho);
  expect(medidas.letraMinima).toBeGreaterThanOrEqual(16);
  await page.screenshot({ path: resolve(DIR_NAVEGADOR, "maestro-celular.png"), fullPage: true });
  // PDF del tamaño de un celular: una tarjeta tras otra, para guardarlo o mandarlo por WhatsApp.
  const alto = await page.evaluate(() => document.documentElement.scrollHeight);
  const pdf = await page.pdf({ width: "390px", height: `${alto + 4}px`, printBackground: true, margin: { top: "0", right: "0", bottom: "0", left: "0" } });
  writeFileSync(resolve(PDF, "maestro-celular.pdf"), pdf);
  expect(contarPaginas(pdf)).toBeGreaterThanOrEqual(1);
  await contexto.close();
});
