// R3b-B: secciones 05 a 08 de la página de Tableros (retención, ingreso y cartera, mapa de calor, comparativo). Cada cifra de la pantalla se compara con la API; la tabla de la
// retención y la del mapa son tablas de verdad (encabezados de fila y de columna) y el color nunca es la única señal: cada celda escribe su porcentaje.

import type { APIRequestContext } from "@playwright/test";
import { apiComo, json } from "./ayudas.ts";
import { comoRol, expect, test } from "./fixtura.ts";

let admin: APIRequestContext;
test.beforeAll(async () => {
  admin = await apiComo("administrador");
});
test.afterAll(async () => {
  await admin.dispose();
});

/** «18650.00» → «$18,650»; «4350.50» → «$4,350.50» (la interfaz quita los «.00»). */
const pesos = (t: string): string => {
  const [entero = "0", dec = "00"] = t.split(".");
  return `$${entero.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}${dec === "00" ? "" : `.${dec}`}`;
};

interface Evolucion {
  cohortes: { mes: string; altas: number }[];
  meses: { mes: string }[];
}
interface Ejecutivo {
  cartera_vencida: { total: string; familias: number };
  mapa_ocupacion: { dia_semana: number; hora: number }[];
  comparativo: { vertical: { nombre: string }; sucursal: { nombre: string }; alumnos: number }[];
}

test.describe("secciones 05 a 08", () => {
  test.use(comoRol("administrador"));

  test("la retención es una tabla con una fila por cohorte, su promedio y el porcentaje escrito en cada celda", async ({ page }) => {
    const evolucion = await json<Evolucion>(admin, "/api/reportes/evolucion");
    await page.goto("/tableros");
    const seccion = page.getByTestId("seccion-retencion");
    await expect(seccion.getByRole("heading", { name: "¿Cuántos siguen después de inscribirse?" })).toBeVisible();
    if (!evolucion.cohortes.some((c) => c.altas > 0)) {
      await expect(seccion.getByText("Todavía no hay inscripciones que medir")).toBeVisible();
      return;
    }
    const tabla = seccion.getByRole("table");
    await expect(tabla.getByRole("rowheader")).toHaveCount(evolucion.cohortes.length + 1);
    await expect(tabla.getByRole("rowheader").last()).toHaveText("Promedio");
    await expect(tabla.getByRole("columnheader")).toHaveText(["Se inscribieron", "Alumnos", "Mes 1", "Mes 2", "Mes 3", "Mes 4", "Mes 5", "Mes 6"]);
    // Toda celda con dato escribe su porcentaje (el color es un refuerzo) y la leyenda dice qué significa cada rango.
    const conDato = tabla.locator("tbody td.retencion-celda:not(.calor-sin)");
    expect(await conDato.count()).toBeGreaterThan(0);
    for (const texto of await conDato.allTextContents()) expect(texto).toMatch(/^\d{1,3}%$/);
    // Lo que todavía no pasa no es un hueco mudo: va rayado y lo dice (texto para lectores de pantalla).
    for (const texto of await tabla.locator("td.calor-sin").allTextContents()) expect(texto).toMatch(/^(Todavía no pasa|Sin inscripciones ese mes—?)$/);
    for (const texto of await tabla.locator("tfoot td.retencion-celda").allTextContents()) expect(texto).toMatch(/^(\d{1,3}%|Todavía no pasa)$/);
    await expect(seccion.getByRole("list", { name: "Qué significa cada color de la retención" })).toContainText("95 % o más");
  });

  test("ingreso y cartera: el total es el de la API, cada tramo escribe su monto y «Ver la cifra de cada mes» se abre con el teclado", async ({ page }) => {
    const ejecutivo = await json<Ejecutivo>(admin, "/api/reportes/ejecutivo");
    await page.goto("/tableros");
    const seccion = page.getByTestId("seccion-ingreso");
    await expect(seccion.getByTestId("cartera-total")).toHaveText(pesos(ejecutivo.cartera_vencida.total));
    if (ejecutivo.cartera_vencida.total === "0.00") await expect(seccion.getByTestId("cartera-sin-atraso")).toBeVisible();
    else {
      await expect(seccion.getByRole("list", { name: "Cartera vencida por antigüedad" }).getByRole("listitem")).toHaveCount(4);
      await seccion.getByRole("link", { name: "Ver las familias con atraso" }).click();
      await expect(page).toHaveURL(/\/familias$/);
      await page.goBack();
    }
    const resumen = page.getByTestId("seccion-ingreso").getByText("Ver la cifra de cada mes");
    await resumen.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("seccion-ingreso").getByRole("table", { name: /Ingreso mensual recurrente de los últimos 12 meses/ }).getByRole("row")).toHaveCount(13);
  });

  test("mapa de calor y comparativo: una celda con porcentaje por cada franja de la API y una tarjeta por pareja", async ({ page }) => {
    const ejecutivo = await json<Ejecutivo>(admin, "/api/reportes/ejecutivo");
    await page.goto("/tableros");
    const mapa = page.getByTestId("seccion-mapa").getByRole("table");
    await expect(mapa.getByRole("columnheader", { name: "Lun" })).toBeVisible();
    await expect(mapa.locator("td.mapa-celda:not(.calor-sin)")).toHaveCount(ejecutivo.mapa_ocupacion.length);
    for (const texto of await mapa.locator("td.mapa-celda:not(.calor-sin)").allTextContents()) expect(texto).toMatch(/^\d{1,3}%/);
    const comparativo = page.getByTestId("seccion-comparativo");
    await expect(comparativo.locator("article")).toHaveCount(ejecutivo.comparativo.length);
    for (const f of ejecutivo.comparativo) await expect(comparativo.getByRole("heading", { level: 3, name: `${f.vertical.nombre} en ${f.sucursal.nombre}` }).first()).toBeVisible();
  });

  test("en celular las secciones no desbordan la pantalla y la retención cabe entera", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/tableros");
    await expect(page.getByTestId("seccion-comparativo")).toBeVisible();
    const ancho = await page.evaluate(() => ({ pagina: document.documentElement.scrollWidth, ventana: document.documentElement.clientWidth }));
    expect(ancho.pagina).toBeLessThanOrEqual(ancho.ventana);
    const retencion = page.locator(".retencion-desplazable");
    if (await retencion.count()) expect(await retencion.evaluate((e) => e.scrollWidth <= e.clientWidth + 1)).toBe(true);
  });
});
