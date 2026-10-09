// J9: tableros — clases muestra (I1), costo por alumno inscrito por campaña con el gasto capturado a mano (I2) y ejecutivo (I3), con gráficas de SVG propio, filtros y
// descarga de CSV. Cada número de la pantalla se compara con la API; el dinero es texto exacto.

import { readFileSync } from "node:fs";
import type { APIRequestContext, Page } from "@playwright/test";
import { apiComo, json } from "./ayudas.ts";
import { capturar, comoRol, expect, mundo, test } from "./fixtura.ts";

let admin: APIRequestContext;
test.beforeAll(async () => {
  admin = await apiComo("administrador");
});
test.afterAll(async () => {
  await admin.dispose();
});

const pesos = (t: string): string => {
  const [entero = "0", dec = "00"] = t.split(".");
  return `$${entero.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${dec}`;
};
const { campana, clases } = mundo.tableros;

async function descargar(page: Page, enlace: ReturnType<Page["getByTestId"]>): Promise<string> {
  const [descarga] = await Promise.all([page.waitForEvent("download"), enlace.click()]);
  expect(descarga.suggestedFilename()).toMatch(/\.csv$/);
  return readFileSync((await descarga.path())!, "utf8");
}

test.describe("administrador", () => {
  test.use(comoRol("administrador"));
  test.describe.configure({ mode: "serial" });

  test("clases muestra: los totales y la fila de la fuente son los de la API; hay gráfica, tabla y CSV", async ({ page }) => {
    await page.goto("/tableros");
    await expect(page.getByRole("tab")).toHaveText(["Clases muestra", "Costo por campaña", "Ejecutivo"]);
    const api = await json<{ total: { agendadas: number; asistidas: number; no_asistidas: number; inscritas: number; conversion: string | null }; por_fuente: { clave: string; agendadas: number; asistidas: number; no_asistidas: number; inscritas: number; conversion: string | null }[] }>(admin, "/api/reportes/clases-muestra");
    await expect(page.getByTestId("ind-agendadas")).toContainText(String(api.total.agendadas));
    await expect(page.getByTestId("ind-asistidas")).toContainText(String(api.total.asistidas));
    await expect(page.getByTestId("ind-no-asistidas")).toContainText(String(api.total.no_asistidas));
    await expect(page.getByTestId("ind-inscritas")).toContainText(String(api.total.inscritas));
    await expect(page.getByTestId("ind-conversion")).toContainText(`${api.total.conversion} %`);
    // La fuente «Facebook» trae al menos lo de la campaña sembrada (4 agendadas, 2 asistidas, 1 no asistió, 1 inscrita); otras pruebas pueden haber agendado más: la pantalla dice lo que dice la API.
    const facebook = api.por_fuente.find((f) => f.clave === "facebook")!;
    expect(facebook.agendadas).toBeGreaterThanOrEqual(clases.agendadas);
    expect(facebook.asistidas).toBeGreaterThanOrEqual(clases.asistidas);
    expect(facebook.inscritas).toBeGreaterThanOrEqual(clases.inscritas);
    const barras = page.getByTestId("grafica-Por fuente");
    await expect(barras).toContainText("Facebook");
    await expect(barras).toContainText(`${facebook.asistidas} de ${facebook.agendadas}`);
    await expect(barras).toContainText(`Conversión ${facebook.conversion} %`);
    // La gráfica es de SVG propio y no depende del color: cada fila trae su cifra escrita.
    await expect(barras.locator("svg.barra").first()).toHaveAttribute("aria-hidden", "true");
    await capturar(page, "80-tablero-clases-muestra", "celular", { completa: true });
    await capturar(page, "80-tablero-clases-muestra", "escritorio");
    // Filtro por sucursal: la sur no tiene clases.
    await page.getByTestId("tablero-clases-muestra").getByLabel("Sucursal").selectOption({ label: mundo.sucursales.sur.nombre });
    await expect(page.getByTestId("ind-agendadas")).toHaveText(/0/);
    await expect(page.getByText("No hay clases muestra en este rango.")).toBeVisible();
    await page.getByTestId("tablero-clases-muestra").getByLabel("Sucursal").selectOption("");
    await expect(page.getByTestId("ind-agendadas")).toContainText(String(api.total.agendadas));
    // CSV con el BOM y las cifras exactas.
    const csv = await descargar(page, page.getByTestId("descargar-clases"));
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain(`facebook,${facebook.agendadas},${facebook.asistidas},${facebook.no_asistidas}`);
  });

  test("costo por campaña: el gasto se captura a mano, el costo se divide al centavo y «—» cuando no hay con qué dividir", async ({ page }) => {
    await page.goto("/tableros?vista=costo");
    const fila = page.getByTestId(`costo-${campana.id}`);
    await expect(fila).toContainText(campana.nombre);
    await expect(fila).toContainText("$0.00");
    await fila.getByRole("button", { name: "Gastos" }).click();
    const d = page.getByRole("dialog");
    // Importes inválidos: se rechazan en la pantalla.
    for (const malo of ["12.345", "abc", "0", ""]) {
      await d.getByLabel("Monto (MXN)").fill(malo);
      await d.getByRole("button", { name: "Capturar el gasto" }).click();
      await expect(d).toContainText("Escribe un importe válido");
    }
    await d.getByLabel("Monto (MXN)").fill("1,000");
    await d.getByRole("button", { name: "Capturar el gasto" }).click();
    await expect(d.getByTestId("gasto-total")).toHaveText("$1,000.00");
    await d.getByLabel("Monto (MXN)").fill("500.50");
    await d.getByLabel(/Nota/).fill("Segunda semana");
    await d.getByRole("button", { name: "Capturar el gasto" }).click();
    await expect(d.getByTestId("gasto-total")).toHaveText("$1,500.50");
    await d.getByRole("button", { name: "Cerrar" }).click();
    // 1500.50 entre 4 leads = 375.125 → $375.13; entre 4 clases = 375.13; entre 1 alumno inscrito = $1,500.50.
    await expect(fila).toContainText("$1,500.50");
    await expect(fila).toContainText("$375.13");
    const api = await json<{ filas: { campana: { id: string }; gasto: string; leads: number; clases_muestra: number; costo_por_lead_texto: string; costo_por_alumno_texto: string; inscripciones_activas: number }[]; total: { gasto: string } }>(admin, "/api/reportes/costo-por-alumno");
    const suya = api.filas.find((f) => f.campana.id === campana.id)!;
    expect([suya.gasto, suya.leads, suya.clases_muestra, suya.inscripciones_activas, suya.costo_por_lead_texto, suya.costo_por_alumno_texto]).toEqual(["1500.50", 4, 4, 1, "375.13", "1500.50"]);
    await expect(page.getByTestId("ind-gasto")).toContainText(pesos(api.total.gasto));
    // Una campaña sin gasto y sin alumnos inscritos: «—», nunca una división por cero.
    const sinDivisor = api.filas.find((f) => f.inscripciones_activas === 0)!;
    await expect(page.getByTestId(`costo-${sinDivisor.campana.id}`)).toContainText("—");
    await capturar(page, "81-tablero-costo-por-campana", "celular", { completa: true });
    await capturar(page, "81-tablero-costo-por-campana", "escritorio");
    const csv = await descargar(page, page.getByTestId("descargar-costo"));
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain("1500.50");
    // Dar de baja un gasto: el total y el costo se recalculan.
    await fila.getByRole("button", { name: "Gastos" }).click();
    await page.getByRole("dialog").getByTestId("gastos").getByRole("listitem").filter({ hasText: "Segunda semana" }).getByRole("button", { name: "Dar de baja" }).click();
    await expect(page.getByRole("dialog").getByTestId("gasto-total")).toHaveText("$1,000.00");
    await page.getByRole("dialog").getByRole("button", { name: "Cerrar" }).click();
    await expect(fila).toContainText("$250.00");
  });

  test("ejecutivo: activos, altas, bajas, ingreso, cartera y ocupación son los de la API", async ({ page }) => {
    await page.goto("/tableros?vista=ejecutivo");
    const api = await json<{ activos: { total_alumnos: number }; altas_del_mes: number; bajas_del_mes: number; desercion_texto: string; ingreso_mensual_recurrente: string; cartera_vencida: { total: string; antiguedad: Record<string, string> }; ocupacion_por_grupo: { grupo: { nombre: string }; ocupados: number; cupo_maximo: number; ocupacion: string }[] }>(admin, "/api/reportes/ejecutivo");
    await expect(page.getByTestId("ind-activos")).toContainText(String(api.activos.total_alumnos));
    await expect(page.getByTestId("ind-altas")).toContainText(String(api.altas_del_mes));
    await expect(page.getByTestId("ind-bajas")).toContainText(String(api.bajas_del_mes));
    await expect(page.getByTestId("ind-desercion")).toContainText(api.desercion_texto);
    await expect(page.getByTestId("ind-ingreso")).toContainText(pesos(api.ingreso_mensual_recurrente));
    await expect(page.getByTestId("ind-cartera")).toContainText(pesos(api.cartera_vencida.total));
    // La cartera vencida de las familias sembradas ($800 con 40 días de atraso) se ve en su tramo.
    expect(api.cartera_vencida.antiguedad["de_31_a_60"]).toMatch(/^[1-9]\d*\.\d\d$/);
    await expect(page.getByTestId("grafica-Antigüedad de la cartera vencida")).toContainText(pesos(api.cartera_vencida.antiguedad["de_31_a_60"]!));
    const ocupacion = page.getByTestId("tabla-de-ocupacion");
    const primero = api.ocupacion_por_grupo[0]!;
    await expect(ocupacion).toContainText(primero.grupo.nombre);
    await expect(page.getByTestId("grafica-Ocupación por grupo")).toContainText(`${primero.ocupados} de ${primero.cupo_maximo} (${primero.ocupacion} %)`);
    await capturar(page, "82-tablero-ejecutivo", "celular", { completa: true });
    await capturar(page, "82-tablero-ejecutivo", "escritorio");
    const csv = await descargar(page, page.getByTestId("descargar-ejecutivo"));
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain(api.ingreso_mensual_recurrente);
    // Un mes sin historia: altas y bajas en cero y la deserción «—», sin división por cero.
    await page.getByLabel("Mes").fill("2020-01");
    await expect(page.getByTestId("ind-altas")).toContainText("0");
    await expect(page.getByTestId("ind-desercion")).toContainText("—");
  });
});

test.describe("asesor", () => {
  test.use(comoRol("asesor"));
  test("ve clases muestra y ejecutivo, pero no el costo por campaña (dinero de marketing)", async ({ page }) => {
    await page.goto("/tableros?vista=costo");
    await expect(page.getByRole("tab")).toHaveText(["Clases muestra", "Ejecutivo"]);
    await expect(page.getByTestId("tablero-clases-muestra")).toBeVisible();
    await expect(page.getByTestId("tablero-costo")).toHaveCount(0);
    const r = await page.request.get("/api/reportes/costo-por-alumno");
    expect(r.status()).toBe(403);
  });
});

test.describe("recepción y maestro", () => {
  for (const rol of ["recepcion", "maestro"] as const) {
    test.describe(rol, () => {
      test.use(comoRol(rol));
      test("no ven los tableros ni por la dirección, y no se hace ninguna petición a los reportes", async ({ page }) => {
        const peticiones: string[] = [];
        page.on("request", (r) => {
          if (r.url().includes("/api/reportes")) peticiones.push(r.url());
        });
        await page.goto("/tableros");
        await expect(page.getByRole("heading", { name: "Sin acceso" })).toBeVisible();
        await expect(page.getByRole("link", { name: "Tableros" })).toHaveCount(0);
        expect(peticiones).toEqual([]);
      });
    });
  }
});
