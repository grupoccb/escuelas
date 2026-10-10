// D16: revisión de accesibilidad sobre TODAS las escenas del inventario, en las dos vistas.
//   - axe (WCAG 2.0/2.1 A y AA): contraste, nombres accesibles de botones, enlaces y campos, etiquetas, roles y atributos ARIA;
//   - 390 px (celular) y 1366 px (escritorio): ningún desborde horizontal de la página;
//   - texto al 200 %: nada queda cortado ni desborda la página.
// Sale con fallo si alguna escena tiene una violación. El detalle queda en .tmp/diseno-a11y.json.
//
//   npm run diseno:a11y            (todas)        DISENO_FILTRO=asesor- npm run diseno:a11y   (algunas)

import AxeBuilder from "@axe-core/playwright";
import { appendFileSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { contextoNuevo, expect, mundo, test } from "../e2e/fixtura.ts";
import { RAIZ } from "../e2e/mundo.ts";
import type { Escena, Vista } from "./escenas.ts";

const FILTRO = process.env["DISENO_FILTRO"] ?? "";
const SALIDA = resolve(RAIZ, ".tmp/diseno-a11y.jsonl");
mkdirSync(resolve(RAIZ, ".tmp"), { recursive: true });
writeFileSync(SALIDA, "");

const escenas: Escena[] = [];
for (const archivo of readdirSync(import.meta.dirname).filter((n) => /^escenas-.+\.ts$/.test(n)).sort()) {
  const modulo = (await import(`./${archivo}`)) as { ESCENAS: Escena[] };
  escenas.push(...modulo.ESCENAS);
}

const VISTAS: Vista[] = ["escritorio", "celular"];
// Escenas cuyo único propósito es mostrar algo roto a propósito (sin red, sin JavaScript): no se les pide pasar axe, pero sí el desborde.
const SOLO_DESBORDE = new Set<string>(["acceso-marco-con-teclado"]); // simula el teclado achicando `visualViewport`: axe se queda esperando

test.describe.configure({ mode: "serial" });
for (const e of escenas.filter((x) => x.id.includes(FILTRO))) {
  for (const vista of VISTAS.filter((v) => (e.vistas ?? VISTAS).includes(v))) {
    test(`a11y ${e.id} · ${vista}`, async ({ browser, baseURL }) => {
      const { page, cerrar } = await contextoNuevo(browser, baseURL ?? mundo.base, vista, e.rol === "anonimo" ? null : e.rol);
      try {
        await e.ir({ page, mundo, vista });
        await page.context().setOffline(false);
        const problemas: string[] = [];

        if (!SOLO_DESBORDE.has(e.id) && !e.impresion) {
          const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
          for (const v of r.violations) problemas.push(`axe ${v.id} (${v.impact ?? "?"}): ${v.nodes.length} elemento(s), p. ej. ${v.nodes[0]?.target.join(" ")} — ${v.help}`);
        }

        const desborde = await page.evaluate(() => ({ ancho: document.documentElement.scrollWidth, ventana: window.innerWidth }));
        if (!e.impresion && desborde.ancho > desborde.ventana + 1) problemas.push(`desborde horizontal: la página mide ${desborde.ancho} px en una ventana de ${desborde.ventana}`);

        if (!e.impresion) {
          await page.evaluate(() => (document.documentElement.style.fontSize = "200%"));
          await page.waitForTimeout(100);
          const ampliado = await page.evaluate(() => ({ ancho: document.documentElement.scrollWidth, ventana: window.innerWidth }));
          // Al 200 % una tabla ancha puede desplazarse dentro de su propio contenedor, pero la página no.
          if (ampliado.ancho > ampliado.ventana + 1) problemas.push(`texto al 200 %: la página desborda (${ampliado.ancho} px en ${ampliado.ventana})`);
        }

        appendFileSync(SALIDA, `${JSON.stringify({ id: e.id, vista, problemas })}\n`);
        expect(problemas, `accesibilidad de ${e.id} (${vista})`).toEqual([]);
      } finally {
        await cerrar();
      }
    });
  }
}
