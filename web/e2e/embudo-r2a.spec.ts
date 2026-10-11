// R2a (rediseño v2): el embudo con arrastrar y soltar (ratón), selección en lote, columnas plegables y la versión de celular. Lo que se hace en pantalla se comprueba por la API.
// Datos: tres leads propios de esta prueba (en «nuevo», sucursal norte); se dan de baja al terminar (soft delete, invariante 3) para no mover los conteos de las demás pruebas.

import type { APIRequestContext, Locator, Page } from "@playwright/test";
import { apiComo, json } from "./ayudas.ts";
import { contextoNuevo, expect, mundo, test } from "./fixtura.ts";
import { crearPrismaDePruebas, type PrismaPruebas } from "../../src/testutil/prisma-pruebas.ts";

test.describe.configure({ mode: "serial" });
test.setTimeout(60_000);

let prisma: PrismaPruebas;
let admin: APIRequestContext;
const ids: string[] = [];
const org = mundo.organizacion.id;
const etapa = (tipo: string): string => mundo.etapas[tipo] ?? "";
const NOMBRES = ["Familia R2a Uno", "Familia R2a Dos", "Familia R2a Tres"] as const;
const [UNO, DOS, TRES] = [0, 1, 2] as const;

const etapaDe = async (i: number): Promise<string> => (await json<{ etapa: { id: string } }>(admin, `/api/leads/${ids[i]}`)).etapa.id;
const volverANuevo = async (): Promise<void> => {
  await prisma.lead.updateMany({ where: { id: { in: ids } }, data: { etapa_id: etapa("nuevo"), motivo_perdida_id: null, ultima_interaccion_en: new Date() } });
};

test.beforeAll(async () => {
  prisma = crearPrismaDePruebas(process.env["DATABASE_URL"], 4);
  admin = await apiComo("administrador");
  for (const [i, nombre] of NOMBRES.entries()) {
    const lead = await prisma.lead.create({
      data: { organizacion_id: org, vertical_interes_id: mundo.verticalId, sucursal_interes_id: mundo.sucursales.norte.id, etapa_id: etapa("nuevo"), nombre_contacto: nombre, telefono: `+52559${String(8_100_000 + i * 17 + (Date.now() % 100_000)).padStart(7, "0")}`, ultima_interaccion_en: new Date() },
    });
    ids.push(lead.id);
  }
});
test.afterAll(async () => {
  await prisma.lead.updateMany({ where: { id: { in: ids } }, data: { eliminado_en: new Date() } });
  await prisma.$disconnect();
  await admin.dispose();
});
test.beforeEach(async () => {
  await volverANuevo();
});

const tarjeta = (page: Page, i: number): Locator => page.getByTestId(`lead-${ids[i]}`);
const columna = (page: Page, tipo: string): Locator => page.getByTestId(`columna-${etapa(tipo)}`);

/** Presiona la tarjeta, la lleva sobre la columna (si queda fuera de la ventana, el puntero espera cerca del borde del tablero hasta que el tablero se desplaza solo) y, con `soltar`, la suelta. */
async function arrastrar(page: Page, desde: Locator, hacia: Locator, soltar = true): Promise<void> {
  const fila = (await desde.locator(".lead-disciplina").boundingBox())!;
  const x0 = fila.x + fila.width - 14;
  const y0 = fila.y + fila.height / 2;
  await page.mouse.move(x0, y0);
  await page.mouse.down();
  await page.mouse.move(x0 + 10, y0 + 24, { steps: 4 });
  const tablero = (await page.locator(".tablero").boundingBox())!;
  for (let i = 0; i < 60; i++) {
    const c = (await hacia.boundingBox())!;
    if (c.x > tablero.x && c.x + c.width / 2 < tablero.x + tablero.width - 100) break;
    await page.mouse.move(tablero.x + tablero.width - 30, y0 + 60, { steps: 2 });
    await page.waitForTimeout(100);
  }
  const c = (await hacia.boundingBox())!;
  await page.mouse.move(c.x + c.width / 2, c.y + 160, { steps: 10 });
  await page.waitForTimeout(150);
  if (soltar) await page.mouse.up();
}

test.describe("escritorio", () => {
  test("arrastrar una tarjeta a otra columna la mueve (con la columna destino resaltada mientras tanto) y el aviso lo confirma", async ({ browser, baseURL }) => {
    const { page, cerrar } = await contextoNuevo(browser, baseURL ?? mundo.base, "escritorio", "asesor");
    try {
      await page.goto("/embudo");
      await expect(tarjeta(page, UNO)).toBeVisible();
      await arrastrar(page, tarjeta(page, UNO), columna(page, "contactado"), false);
      await expect(page.locator(".arrastre-fantasma")).toHaveCount(1);
      await expect(columna(page, "contactado")).toHaveAttribute("data-destino", "");
      await expect(columna(page, "contactado")).toContainText("Suelta para mover aquí");
      await page.mouse.up();
      await expect(page.locator(".arrastre-fantasma")).toHaveCount(0);
      await expect(columna(page, "contactado").getByTestId(`lead-${ids[UNO]}`)).toBeVisible();
      await expect(page.getByTestId("aviso-global")).toContainText(`${NOMBRES[UNO]} pasó a`);
      expect(await etapaDe(UNO)).toBe(etapa("contactado"));
    } finally {
      await cerrar();
    }
  });

  test("Esc cancela el arrastre: no se mueve nada y no se abre la ficha al soltar", async ({ browser, baseURL }) => {
    const { page, cerrar } = await contextoNuevo(browser, baseURL ?? mundo.base, "escritorio", "asesor");
    try {
      await page.goto("/embudo");
      await arrastrar(page, tarjeta(page, UNO), columna(page, "contactado"), false);
      await expect(page.locator(".arrastre-fantasma")).toHaveCount(1);
      await page.keyboard.press("Escape");
      await expect(page.locator(".arrastre-fantasma")).toHaveCount(0);
      await page.mouse.up();
      await expect(page).toHaveURL(/\/embudo$/);
      expect(await etapaDe(UNO)).toBe(etapa("nuevo"));
    } finally {
      await cerrar();
    }
  });

  test("un lead seleccionado arrastra toda la selección (pila con contador)", async ({ browser, baseURL }) => {
    const { page, cerrar } = await contextoNuevo(browser, baseURL ?? mundo.base, "escritorio", "asesor");
    try {
      await page.goto("/embudo");
      await tarjeta(page, UNO).getByRole("button", { name: /^Seleccionar a/ }).click();
      await tarjeta(page, DOS).getByRole("button", { name: /^Seleccionar a/ }).click();
      await arrastrar(page, tarjeta(page, UNO), columna(page, "contactado"), false);
      await expect(page.locator(".arrastre-fantasma-cuenta")).toHaveText("2");
      await page.mouse.up();
      await expect(page.getByTestId("aviso-global")).toContainText("2 leads pasaron a");
      expect(await etapaDe(UNO)).toBe(etapa("contactado"));
      expect(await etapaDe(DOS)).toBe(etapa("contactado"));
      expect(await etapaDe(TRES)).toBe(etapa("nuevo"));
      await expect(page.getByRole("region", { name: "Leads seleccionados" })).toHaveCount(0);
    } finally {
      await cerrar();
    }
  });

  test("soltar sobre la columna de perdidos (plegada, el tablero se desplaza solo) abre «¿Por qué se perdió …?» y exige el motivo", async ({ browser, baseURL }) => {
    // R2b: el selector de etapa de «Mover» se sustituyó, al soltar, por el diálogo del motivo con botones (lo mismo que afirmaba: el motivo es obligatorio y el lead queda en perdidos).
    const { page, cerrar } = await contextoNuevo(browser, baseURL ?? mundo.base, "escritorio", "asesor");
    try {
      await page.goto("/embudo");
      await expect(columna(page, "perdido")).toHaveAttribute("class", /columna-plegada/);
      await arrastrar(page, tarjeta(page, TRES), columna(page, "perdido"), false);
      await expect(columna(page, "perdido")).toContainText("Suelta y elige el motivo");
      await page.mouse.up();
      const d = page.getByRole("dialog");
      await expect(d).toContainText(`¿Por qué se perdió ${NOMBRES[TRES]}?`);
      await expect(d.getByRole("button", { name: "Mover a Etapa G", exact: true })).toBeDisabled();
      await expect(d).toContainText("Elige el motivo de pérdida.");
      await d.getByRole("button", { name: "Precio", exact: true }).click();
      await d.getByRole("button", { name: "Mover a Etapa G", exact: true }).click();
      // La columna de cierre se muestra para que se vea dónde quedó.
      await expect(columna(page, "perdido").getByTestId(`lead-${ids[TRES]}`)).toBeVisible();
      expect(await etapaDe(TRES)).toBe(etapa("perdido"));
    } finally {
      await cerrar();
    }
  });

  test("selección en lote: la barra con el conteo, «Mover a…» con inscrito deshabilitado, mover y Esc para limpiar", async ({ browser, baseURL }) => {
    const { page, cerrar } = await contextoNuevo(browser, baseURL ?? mundo.base, "escritorio", "asesor");
    try {
      await page.goto("/embudo");
      await tarjeta(page, UNO).getByRole("button", { name: /^Seleccionar a/ }).click();
      const barra = page.getByRole("region", { name: "Leads seleccionados" });
      await expect(barra).toContainText("1");
      await expect(barra).toContainText("seleccionado");
      await expect(tarjeta(page, UNO)).toHaveClass(/lead-tarjeta-seleccionada/);
      await tarjeta(page, DOS).focus();
      await page.keyboard.press("Space");
      await expect(barra).toContainText("seleccionados");
      await barra.getByRole("button", { name: "Mover a…" }).click();
      await expect(page.getByRole("menuitem", { name: /^Etapa F/ })).toBeDisabled();
      await expect(page.getByRole("menuitem", { name: /^Etapa F/ })).toContainText("De una en una");
      // Esc cierra primero el menú y después vacía la selección.
      await page.keyboard.press("Escape");
      await expect(page.getByRole("menu")).toHaveCount(0);
      await expect(barra).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(barra).toHaveCount(0);
      // Y mover en lote: dos llamadas, un aviso.
      await tarjeta(page, UNO).getByRole("button", { name: /^Seleccionar a/ }).click();
      await tarjeta(page, DOS).getByRole("button", { name: /^Seleccionar a/ }).click();
      await barra.getByRole("button", { name: "Mover a…" }).click();
      await page.getByRole("menuitem", { name: /^Etapa C/ }).click();
      await expect(page.getByTestId("aviso-global")).toContainText("2 leads pasaron a Etapa C.");
      await expect(columna(page, "muestra_agendada").getByTestId(`lead-${ids[UNO]}`)).toBeVisible();
      expect(await etapaDe(UNO)).toBe(etapa("muestra_agendada"));
      expect(await etapaDe(DOS)).toBe(etapa("muestra_agendada"));
      expect(await etapaDe(TRES)).toBe(etapa("nuevo"));
    } finally {
      await cerrar();
    }
  });

  test("si uno de los leads cambió mientras tanto (409), se avisa, se recarga y los demás sí se mueven", async ({ browser, baseURL }) => {
    const { page, cerrar } = await contextoNuevo(browser, baseURL ?? mundo.base, "escritorio", "asesor");
    try {
      await page.goto("/embudo");
      await tarjeta(page, UNO).getByRole("button", { name: /^Seleccionar a/ }).click();
      await tarjeta(page, DOS).getByRole("button", { name: /^Seleccionar a/ }).click();
      // Otra persona mueve a «Uno» antes de que se pida el cambio.
      await prisma.lead.update({ where: { id: ids[UNO]! }, data: { etapa_id: etapa("contactado") } });
      await page.getByRole("region", { name: "Leads seleccionados" }).getByRole("button", { name: "Mover a…" }).click();
      await page.getByRole("menuitem", { name: /^Etapa D/ }).click();
      await expect(page.getByRole("alert").filter({ hasText: "cambió de etapa mientras lo veías" })).toBeVisible();
      expect(await etapaDe(DOS)).toBe(etapa("muestra_asistida"));
      expect(await etapaDe(UNO)).toBe(etapa("contactado"));
      await expect(columna(page, "contactado").getByTestId(`lead-${ids[UNO]}`)).toBeVisible();
    } finally {
      await cerrar();
    }
  });

  test("las columnas se pliegan y la elección se recuerda; las de cierre empiezan plegadas", async ({ browser, baseURL }) => {
    const { page, cerrar } = await contextoNuevo(browser, baseURL ?? mundo.base, "escritorio", "asesor");
    try {
      await page.goto("/embudo");
      await expect(columna(page, "inscrito")).toHaveAttribute("class", /columna-plegada/);
      await expect(columna(page, "perdido")).toHaveAttribute("class", /columna-plegada/);
      await expect(columna(page, "contactado")).not.toHaveAttribute("class", /columna-plegada/);
      await page.getByRole("button", { name: "Plegar la columna Etapa B" }).click();
      await expect(columna(page, "contactado")).toHaveAttribute("class", /columna-plegada/);
      expect((await columna(page, "contactado").boundingBox())!.width).toBeCloseTo(56, 0);
      await page.getByRole("button", { name: /^Desplegar la columna Etapa F/ }).click();
      await expect(columna(page, "inscrito")).not.toHaveAttribute("class", /columna-plegada/);
      await page.reload();
      await expect(columna(page, "contactado")).toHaveAttribute("class", /columna-plegada/);
      await expect(columna(page, "inscrito")).not.toHaveAttribute("class", /columna-plegada/);
      await expect(columna(page, "perdido")).toHaveAttribute("class", /columna-plegada/);
    } finally {
      await cerrar();
    }
  });

  test("con el teclado: Espacio selecciona la tarjeta y Enter abre la ficha lateral (ya no navega)", async ({ browser, baseURL }) => {
    const { page, cerrar } = await contextoNuevo(browser, baseURL ?? mundo.base, "escritorio", "asesor");
    try {
      await page.goto("/embudo");
      await tarjeta(page, UNO).focus();
      await page.keyboard.press("Space");
      await expect(tarjeta(page, UNO).getByRole("button", { name: /^Quitar a/ })).toHaveAttribute("aria-pressed", "true");
      await page.keyboard.press("Enter");
      await expect(page.getByRole("dialog", { name: `Ficha de ${NOMBRES[UNO]}` })).toBeVisible();
      await expect(page).toHaveURL(/\/embudo$/);
    } finally {
      await cerrar();
    }
  });
});

test.describe("celular", () => {
  test("píldoras de etapa, modo «Seleccionar» y la hoja «Mover a…» (la alternativa sin arrastre)", async ({ browser, baseURL }) => {
    const { page, cerrar } = await contextoNuevo(browser, baseURL ?? mundo.base, "celular", "asesor");
    try {
      await page.goto("/embudo");
      await expect(page.getByRole("tab", { name: "Lista" })).toHaveCount(0);
      const etapas = page.getByRole("group", { name: "Etapas" });
      await expect(etapas.getByRole("button", { name: /^Primera/ })).toHaveAttribute("aria-pressed", "true");
      await expect(tarjeta(page, UNO)).toBeVisible();
      // Modo «Seleccionar»: tocar la tarjeta la selecciona (no la abre).
      await page.getByRole("button", { name: "Seleccionar", exact: true }).click();
      await tarjeta(page, UNO).click({ position: { x: 150, y: 70 } });
      await expect(page).toHaveURL(/\/embudo$/);
      await expect(page.getByRole("region", { name: "Leads seleccionados" })).toContainText("1");
      await page.getByRole("button", { name: "Listo", exact: true }).click();
      await expect(page.getByRole("region", { name: "Leads seleccionados" })).toHaveCount(0);
      // La hoja: «Mover de etapa» de una tarjeta lista las etapas; la actual, deshabilitada.
      await tarjeta(page, UNO).getByRole("button", { name: "Mover de etapa" }).click();
      const hoja = page.getByRole("dialog");
      await expect(hoja).toContainText(`Mover a ${NOMBRES[UNO]}`);
      await expect(hoja.getByRole("button", { name: /^Primera/ })).toBeDisabled();
      await hoja.getByRole("button", { name: /^Etapa B/ }).click();
      await expect(page.getByTestId("aviso-global")).toContainText(`${NOMBRES[UNO]} pasó a Etapa B.`);
      expect(await etapaDe(UNO)).toBe(etapa("contactado"));
      await etapas.getByRole("button", { name: /^Etapa B/ }).click();
      await expect(tarjeta(page, UNO)).toBeVisible();
    } finally {
      await cerrar();
    }
  });
});
