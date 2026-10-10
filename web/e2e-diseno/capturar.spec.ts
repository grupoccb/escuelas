// Captura cada escena del inventario (escenas-*.ts) en escritorio y celular. Ver playwright.diseno.config.ts.
//
// Salida: docs/diseno/capturas/<fase>/<id>-<vista>.jpg, con <fase> = DISENO_FASE (por omisión «despues»).
// También deja la unión de las clases CSS que se vieron en pantalla en docs/diseno/clases-observadas.json (la lee `npm run diseno:inventario`).

import { readdirSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { contextoNuevo, expect, mundo, test } from "../e2e/fixtura.ts";
import { RAIZ } from "../e2e/mundo.ts";
import type { Escena, Vista } from "./escenas.ts";

const FASE = process.env["DISENO_FASE"] ?? "despues";
const FILTRO = process.env["DISENO_FILTRO"] ?? "";
const CARPETA = resolve(RAIZ, "docs/diseno/capturas", FASE);
const ARCHIVO_CLASES = resolve(RAIZ, "docs/diseno/clases-observadas.json");
const ALTO_MAXIMO = 4000;

const escenas: Escena[] = [];
for (const archivo of readdirSync(import.meta.dirname).filter((n) => /^escenas-.+\.ts$/.test(n)).sort()) {
  const modulo = (await import(`./${archivo}`)) as { ESCENAS: Escena[] };
  escenas.push(...modulo.ESCENAS);
}

function recordarClases(clases: string[]): void {
  let actuales: string[] = [];
  try {
    actuales = JSON.parse(readFileSync(ARCHIVO_CLASES, "utf8")) as string[];
  } catch {
    // Primera vez.
  }
  const union = [...new Set([...actuales, ...clases])].sort();
  writeFileSync(ARCHIVO_CLASES, `${JSON.stringify(union, null, 1)}\n`);
}

const VISTAS: Vista[] = ["escritorio", "celular"];

test.describe.configure({ mode: "serial" });
for (const e of escenas.filter((x) => x.id.includes(FILTRO))) {
  for (const vista of VISTAS.filter((v) => (e.vistas ?? VISTAS).includes(v))) {
    test(`${e.id} · ${vista}`, async ({ browser, baseURL }) => {
      const { page, cerrar } = await contextoNuevo(browser, baseURL ?? mundo.base, vista, e.rol === "anonimo" ? null : e.rol);
      try {
        await e.ir({ page, mundo, vista });
        await page.context().setOffline(false);
        if (e.impresion) await page.emulateMedia({ media: "print" });
        mkdirSync(CARPETA, { recursive: true });
        const alto = await page.evaluate(() => document.documentElement.scrollHeight);
        const completa = e.completa ?? e.tipo !== "flotante";
        await page.screenshot({
          path: resolve(CARPETA, `${e.id}-${vista}.jpg`),
          type: "jpeg",
          quality: 70,
          animations: "disabled",
          ...(completa ? { fullPage: true, ...(alto > ALTO_MAXIMO ? { clip: { x: 0, y: 0, width: page.viewportSize()!.width, height: ALTO_MAXIMO } } : {}) } : {}),
        });
        recordarClases(await page.evaluate(() => [...new Set([...document.querySelectorAll("*")].flatMap((el) => [...el.classList]))]));
        expect(page.url(), "la escena no debe dejar la página en blanco").not.toBe("about:blank");
      } finally {
        await cerrar();
      }
    });
  }
}

test("hay escenas", () => {
  expect(escenas.length).toBeGreaterThan(0);
  expect(new Set(escenas.map((e) => e.id)).size, "ids de escena repetidos").toBe(escenas.length);
  expect(existsSync(resolve(RAIZ, "docs/diseno"))).toBe(true);
});
