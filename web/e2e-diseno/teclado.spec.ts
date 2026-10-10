// D16: recorrido solo con teclado. En cada pantalla principal se avanza con Tab de un extremo al otro: todo lo que recibe el foco lo muestra (anillo de 2 px o la caja que lo contiene),
// el foco nunca se queda atrapado ni sale de la página, y en un diálogo abierto el foco se queda dentro y Esc lo cierra.
//   npm run diseno:teclado

import { contextoNuevo, expect, mundo, test } from "../e2e/fixtura.ts";
import type { Page } from "@playwright/test";

interface Parada {
  rol: "administrador" | "asesor" | "maestro" | "recepcion";
  ruta: string;
}

const PANTALLAS: Parada[] = [
  { rol: "asesor", ruta: "/embudo" },
  { rol: "asesor", ruta: "/tareas" },
  { rol: "recepcion", ruta: "/pagos" },
  { rol: "recepcion", ruta: "/cuenta" },
  { rol: "recepcion", ruta: "/ventas" },
  { rol: "maestro", ruta: "/hoy" },
  { rol: "maestro", ruta: "/pase" },
  { rol: "administrador", ruta: "/admin" },
  { rol: "administrador", ruta: "/admin/usuarios" },
  { rol: "administrador", ruta: "/tableros" },
  { rol: "administrador", ruta: "/familias" },
  { rol: "administrador", ruta: "/mas" },
];

/** Lo que dice el foco actual: qué elemento es y si se ve (anillo propio o el de la caja que lo contiene). */
async function estadoDelFoco(page: Page): Promise<{ descripcion: string; visible: boolean; dentro: boolean } | null> {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return null;
    const anillo = (e: Element): boolean => {
      const c = getComputedStyle(e);
      return c.outlineStyle !== "none" && parseFloat(c.outlineWidth) >= 2 && c.outlineColor !== "rgba(0, 0, 0, 0)";
    };
    let visible = anillo(el);
    // Un campo dentro de una caja (contraseña, búsqueda) muestra el anillo en la caja.
    for (let p: Element | null = el.parentElement; p && !visible && p !== document.body; p = p.parentElement) {
      if (p.matches(":focus-within") && anillo(p) && /campo-clave|campo-busqueda|opcion/.test(p.className)) visible = true;
    }
    const r = el.getBoundingClientRect();
    const dentro = r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight && r.right > 0 && r.left < window.innerWidth;
    return { descripcion: `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""} «${(el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 40)}»`, visible, dentro };
  });
}

test.describe.configure({ mode: "serial" });
for (const p of PANTALLAS) {
  test(`teclado ${p.rol} ${p.ruta}`, async ({ browser, baseURL }) => {
    const { page, cerrar } = await contextoNuevo(browser, baseURL ?? mundo.base, "escritorio", p.rol);
    try {
      await page.goto(p.ruta);
      await page.waitForLoadState("networkidle");
      const sinAnillo: string[] = [];
      const vistos = new Set<string>();
      for (let i = 0; i < 60; i++) {
        await page.keyboard.press("Tab");
        const e = await estadoDelFoco(page);
        if (!e) continue;
        if (vistos.has(e.descripcion) && vistos.size > 3) break;
        vistos.add(e.descripcion);
        if (!e.visible) sinAnillo.push(e.descripcion);
        if (!e.dentro) sinAnillo.push(`${e.descripcion} (fuera de la ventana)`);
      }
      expect(vistos.size, "el foco debe recorrer la pantalla").toBeGreaterThan(2);
      expect(sinAnillo, `elementos con foco sin anillo visible en ${p.ruta}`).toEqual([]);
    } finally {
      await cerrar();
    }
  });
}

test("teclado: en un diálogo el foco se queda dentro y Esc lo cierra", async ({ browser, baseURL }) => {
  const { page, cerrar } = await contextoNuevo(browser, baseURL ?? mundo.base, "escritorio", "administrador");
  try {
    await page.goto("/mas");
    await page.getByRole("button", { name: "Cambiar mi contraseña" }).click();
    const dialogo = page.locator("dialog[open]");
    await expect(dialogo).toBeVisible();
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press("Tab");
      const dentro = await page.evaluate(() => !!document.activeElement?.closest("dialog[open]"));
      expect(dentro, "el foco salió del diálogo").toBe(true);
    }
    await page.keyboard.press("Escape");
    await expect(dialogo).toHaveCount(0);
  } finally {
    await cerrar();
  }
});
