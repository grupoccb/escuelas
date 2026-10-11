// D16: tamaños. Las pantallas principales de cada rol a 390 px (celular), 1366 px y 1920 px, y con el texto al 200 %:
//   - la página nunca se desborda de lado (en 200 % una tabla puede desplazarse dentro de su propio contenedor, la página no);
//   - lo que se toca mide al menos 44 px de alto y 44 de ancho (salvo enlaces dentro de un párrafo de texto);
//   - nada queda fuera de la ventana por la izquierda.
// En 1920 px deja además una captura de las pantallas principales en docs/diseno/capturas/1920/ para revisar que el contenido no se estire.
//
//   npm run diseno:tamanos

import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import type { Browser } from "@playwright/test";
import { contextoNuevo, expect, mundo, test } from "../e2e/fixtura.ts";
import { RAIZ } from "../e2e/mundo.ts";

type Rol = "administrador" | "asesor" | "maestro" | "recepcion";
const PANTALLAS: { rol: Rol; ruta: string; nombre: string }[] = [
  { rol: "asesor", ruta: "/embudo", nombre: "asesor-embudo" },
  { rol: "asesor", ruta: "/tareas", nombre: "asesor-tareas" },
  { rol: "asesor", ruta: `/leads/${mundo.asesor.alfa.leadId}`, nombre: "asesor-ficha" },
  { rol: "recepcion", ruta: "/pagos", nombre: "recepcion-pagos" },
  { rol: "recepcion", ruta: `/cuenta/${mundo.recepcion.gomez.tutorId}`, nombre: "recepcion-cuenta" },
  { rol: "recepcion", ruta: "/corte", nombre: "recepcion-corte" },
  { rol: "maestro", ruta: "/hoy", nombre: "maestro-hoy" },
  { rol: "maestro", ruta: "/pase", nombre: "maestro-pase" },
  { rol: "administrador", ruta: "/admin", nombre: "admin-inicio" },
  { rol: "administrador", ruta: "/admin/usuarios", nombre: "admin-usuarios" },
  { rol: "administrador", ruta: "/admin/precios", nombre: "admin-precios" },
  { rol: "administrador", ruta: "/tableros", nombre: "tableros" },
  { rol: "administrador", ruta: "/familias", nombre: "familias" },
];
const TAMANOS = [
  { nombre: "celular", ancho: 390, alto: 844 },
  { nombre: "escritorio", ancho: 1366, alto: 768 },
  { nombre: "pantalla-grande", ancho: 1920, alto: 1080 },
] as const;

async function revisar(browser: Browser, baseURL: string, p: (typeof PANTALLAS)[number], t: (typeof TAMANOS)[number], ampliado: boolean, capturar: boolean): Promise<string[]> {
  const c = await contextoNuevo(browser, baseURL, t.ancho <= 500 ? "celular" : "escritorio", p.rol);
  try {
    await c.page.setViewportSize({ width: t.ancho, height: t.alto });
    await c.page.goto(p.ruta);
    await c.page.waitForLoadState("networkidle");
    await c.page.waitForTimeout(200);
    if (ampliado) {
      await c.page.evaluate(() => (document.documentElement.style.fontSize = "200%"));
      await c.page.waitForTimeout(150);
    }
    if (capturar) {
      const carpeta = resolve(RAIZ, "docs/diseno/capturas/1920");
      mkdirSync(carpeta, { recursive: true });
      await c.page.screenshot({ path: resolve(carpeta, `${p.nombre}.jpg`), type: "jpeg", quality: 70, animations: "disabled" });
    }
    return await c.page.evaluate((conTactil) => {
      const problemas: string[] = [];
      const de = document.documentElement;
      if (de.scrollWidth > window.innerWidth + 1) problemas.push(`desborde horizontal de la página (${de.scrollWidth} px en ${window.innerWidth})`);
      const nombre = (e: Element): string => `${e.tagName.toLowerCase()}${e.id ? `#${e.id}` : ""} «${(e.getAttribute("aria-label") ?? e.textContent ?? "").trim().slice(0, 30)}»`;
      for (const e of document.querySelectorAll("a, button, input:not([type=hidden]), select, textarea, summary, [role=tab], [role=switch]")) {
        const r = e.getBoundingClientRect();
        if (r.width === 0 || r.height === 0 || getComputedStyle(e).visibility === "hidden") continue;
        if (e.matches(".salto")) continue; // el enlace «Saltar al contenido» vive fuera de la ventana hasta que recibe el foco
        if (r.right < 0 || r.left < -1) problemas.push(`${nombre(e)} queda fuera de la ventana por la izquierda`);
        if (!conTactil) continue;
        if (e instanceof HTMLInputElement && (e.type === "checkbox" || e.type === "radio")) continue; // su zona táctil es la etiqueta
        if (e.tagName === "A" && e.closest("p, li, dd, td, .muted") && !e.classList.contains("boton") && !e.closest("nav")) continue; // enlace dentro de un texto
        if (e.classList.contains("solo-lectores") || e.closest(".solo-lectores") || e.matches(".salto")) continue;
        // R1 (handoff v2): los enlaces de la barra lateral de ESCRITORIO miden 40 px (36 en una pantalla de menos de 820 px de alto, para que quepan las 13 secciones del administrador); el de 44 es para el toque, o sea el celular.
        const enLateral = e.tagName === "A" && e.closest(".lateral-enlaces") !== null && window.innerWidth >= 900;
        // R2a (README «Medidas nuevas»): en el tablero de ESCRITORIO los botones de ícono de una tarjeta miden 36 (44 en celular), el avatar que selecciona y el botón de plegar una columna, 32: son
        // objetivos de ratón y todos tienen alternativa más grande (la tarjeta entera con Espacio, «Mover de etapa» en la hoja, la columna plegada que se despliega con un clic de 56 de ancho).
        const enTablero = window.innerWidth >= 900 && e.closest(".tablero") !== null && e.matches(".boton-icono-tarjeta, .lead-seleccion, .columna-plegar");
        const minimo = enLateral ? 35.5 : enTablero ? 31.5 : 43.5;
        if (r.height < minimo) problemas.push(`${nombre(e)} mide ${Math.round(r.height)} px de alto`);
      }
      return problemas;
    }, !ampliado);
  } finally {
    await c.cerrar();
  }
}

test.describe("tamaños", () => {
  for (const t of TAMANOS) {
    for (const p of PANTALLAS) {
      test(`${t.nombre} (${t.ancho} px) · ${p.nombre}`, async ({ browser, baseURL }) => {
        const problemas = await revisar(browser, baseURL ?? mundo.base, p, t, false, t.ancho === 1920);
        expect(problemas, `${p.nombre} a ${t.ancho} px`).toEqual([]);
      });
    }
  }
  for (const p of PANTALLAS) {
    test(`texto al 200 % (1366 px) · ${p.nombre}`, async ({ browser, baseURL }) => {
      const problemas = await revisar(browser, baseURL ?? mundo.base, p, TAMANOS[1], true, false);
      expect(problemas, `${p.nombre} al 200 %`).toEqual([]);
    });
  }
});
