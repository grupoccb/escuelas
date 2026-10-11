// J9 (R3b-A): tableros — una sola página narrativa: héroe, pestañas fijas y secciones numeradas con gráficas de SVG propio, filtros y descarga de CSV. Antes eran tres pestañas (clases muestra I1,
// costo por campaña I2 y ejecutivo I3); lo que mostraban sigue en la página: clases muestra en la sección 03, el costo por campaña (con el gasto capturado a mano) dentro de la 02 y el ejecutivo
// en el héroe y en las secciones 04 a 08. Cada número de la pantalla se compara con la API; el dinero es texto exacto.

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
/** La sección 06 escribe los importes enteros sin centavos («$800»); con centavos los deja («$800.50»). */
const sinCentavosCero = (t: string): string => t.replace(/\.00$/, "");

/** Las pruebas piden TODO el historial (desde una fecha remota): así comparan con la API sin depender de en qué día del mes se sembraron los datos. */
const DESDE_REMOTO = "2020-01-01";
const nombres = ["Resumen", "Captación", "Fuentes y costo", "Clases muestra", "Altas y bajas", "Retención", "Dinero", "Ocupación", "Comparativo"];

const pestanas = (page: Page) => page.getByRole("navigation", { name: "Secciones del tablero" });
const filtros = (page: Page) => page.getByTestId("filtros-del-tablero");
async function desdeRemoto(page: Page): Promise<void> {
  await filtros(page).getByLabel("Desde").fill(DESDE_REMOTO);
}

async function descargar(page: Page, enlace: ReturnType<Page["getByTestId"]>): Promise<string> {
  const [descarga] = await Promise.all([page.waitForEvent("download"), enlace.click()]);
  expect(descarga.suggestedFilename()).toMatch(/\.csv$/);
  return readFileSync((await descarga.path())!, "utf8");
}

test.describe("administrador", () => {
  test.use(comoRol("administrador"));
  test.describe.configure({ mode: "serial" });

  test("la página es una sola, con pestañas fijas que saltan a cada sección y se marcan al desplazar", async ({ page }) => {
    await page.goto("/tableros");
    await expect(page.getByRole("heading", { name: "Tableros", level: 1 })).toBeVisible();
    // Ya no hay pestañas con paneles (`role=tab`): es un índice de la misma página.
    await expect(page.getByRole("tab")).toHaveCount(0);
    await expect(pestanas(page).getByRole("button")).toHaveText(nombres);
    await expect(pestanas(page).getByRole("button", { name: "Resumen" })).toHaveAttribute("aria-current", "true");
    for (const id of ["embudo", "fuentes", "clases", "altas-y-bajas", "retencion", "ingreso", "mapa", "comparativo"]) await expect(page.getByTestId(`seccion-${id}`)).toBeAttached();
    // Un clic salta a la sección, la marca y deja el foco en su título.
    await pestanas(page).getByRole("button", { name: "Altas y bajas" }).click();
    await expect(pestanas(page).getByRole("button", { name: "Altas y bajas" })).toHaveAttribute("aria-current", "true");
    await expect(pestanas(page).getByRole("button", { name: "Resumen" })).not.toHaveAttribute("aria-current", "true");
    await expect(page.getByRole("heading", { name: "Altas, bajas y alumnos activos" })).toBeFocused();
    await expect(page.getByRole("heading", { name: "Altas, bajas y alumnos activos" })).toBeInViewport();
    // La pestaña se queda fija arriba mientras se desplaza.
    expect((await pestanas(page).boundingBox())!.y).toBeLessThan(2);
    // Al desplazar con la rueda, la marca sigue a la sección que se lee.
    await page.getByTestId("seccion-embudo").scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollTo(0, document.querySelector('[data-seccion="clases"]')!.getBoundingClientRect().top + window.scrollY - 60));
    await expect(pestanas(page).getByRole("button", { name: "Clases muestra" })).toHaveAttribute("aria-current", "true");
    await capturar(page, "80-tableros-pagina", "escritorio");
    await capturar(page, "80-tableros-pagina", "celular", { completa: true });
  });

  test("con el teclado: Tab recorre las pestañas, Enter salta a la sección y el foco llega a su título", async ({ page }) => {
    await page.goto("/tableros");
    await pestanas(page).getByRole("button", { name: "Fuentes y costo" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { name: "¿Qué fuente trae alumnos y a qué costo?" })).toBeFocused();
    await expect(pestanas(page).getByRole("button", { name: "Fuentes y costo" })).toHaveAttribute("aria-current", "true");
  });

  test("con «reducir movimiento» el salto no se anima (llega de inmediato)", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/tableros");
    await pestanas(page).getByRole("button", { name: "Clases muestra" }).click();
    await expect(page.getByRole("heading", { name: "Clases muestra: quién llega y quién se queda" })).toBeInViewport({ timeout: 500 });
  });

  test("héroe: titular, indicadores y frases salen de la API (ejecutivo, evolución y embudo)", async ({ page }) => {
    await page.goto("/tableros");
    const ej = await json<{ activos: { total_alumnos: number }; altas_del_mes: number; bajas_del_mes: number; desercion_texto: string; ingreso_mensual_recurrente: string; cartera_vencida: { total: string } }>(admin, "/api/reportes/ejecutivo");
    const ev = await json<{ meses: { activos: number; ingreso_mensual_recurrente: string }[] }>(admin, "/api/reportes/evolucion");
    const heroe = page.getByTestId("heroe");
    await expect(heroe.getByTestId("ind-activos")).toContainText(`${ej.activos.total_alumnos} alumno`);
    expect(ev.meses.at(-1)!.activos).toBe(ej.activos.total_alumnos);
    await expect(heroe.getByTestId("ind-altas")).toContainText(String(ej.altas_del_mes));
    await expect(heroe.getByTestId("ind-bajas")).toContainText(String(ej.bajas_del_mes));
    await expect(heroe.getByTestId("ind-desercion")).toContainText(ej.desercion_texto);
    await expect(heroe.getByTestId("ind-ingreso")).toContainText(pesos(ev.meses.at(-1)!.ingreso_mensual_recurrente));
    await expect(heroe.getByTestId("ind-ingreso")).toContainText(pesos(ej.ingreso_mensual_recurrente));
    await expect(heroe.getByTestId("ind-cartera")).toContainText(pesos(ej.cartera_vencida.total));
    // La cartera con atraso (las familias sembradas deben $800) pide atención con texto además de color.
    await expect(heroe.getByTestId("ind-cartera")).toContainText(/familias? con atraso/);
    await expect(heroe.getByTestId("ind-conversion-embudo")).toContainText("de lead a alumno inscrito");
    // Las frases salen del mes (siempre hay altas y bajas que decir) y no dicen nada que no esté en los datos.
    await expect(heroe.getByTestId("heroe-frases")).toContainText(/Entraron \d+ alumnos? y se (fue|fueron) \d+/);
    await capturar(page, "80-tableros-heroe", "celular");
    await capturar(page, "80-tableros-heroe", "escritorio");
  });

  test("clases muestra (03): los totales y la fila de la fuente son los de la API; hay tarjetas por disciplina, gráficas y CSV", async ({ page }) => {
    await page.goto("/tableros");
    await desdeRemoto(page);
    const api = await json<{ total: { agendadas: number; asistidas: number; no_asistidas: number; inscritas: number; conversion: string | null }; por_fuente: { clave: string; agendadas: number; asistidas: number; no_asistidas: number; inscritas: number; conversion: string | null }[]; por_vertical: { clave: string; agendadas: number }[] }>(admin, `/api/reportes/clases-muestra?desde=${DESDE_REMOTO}`);
    await expect(page.getByTestId("ind-agendadas")).toContainText(String(api.total.agendadas));
    await expect(page.getByTestId("ind-asistidas")).toContainText(String(api.total.asistidas));
    await expect(page.getByTestId("ind-no-asistidas")).toContainText(String(api.total.no_asistidas));
    await expect(page.getByTestId("ind-inscritas")).toContainText(String(api.total.inscritas));
    await expect(page.getByTestId("ind-conversion")).toContainText(`${api.total.conversion} %`);
    // Una tarjeta por disciplina, con su asistencia y su cierre.
    const tarjeta = page.getByTestId(`clases-${api.por_vertical[0]!.clave}`);
    await expect(tarjeta).toContainText(`${api.por_vertical[0]!.agendadas} agendadas`);
    await expect(tarjeta).toContainText("llegaron a su clase");
    await expect(tarjeta).toContainText("de ellos se inscribió");
    // La fuente «Facebook» trae al menos lo de la campaña sembrada (4 agendadas, 2 asistidas, 1 no asistió, 1 inscrita); otras pruebas pueden haber agendado más: la pantalla dice lo que dice la API.
    const facebook = api.por_fuente.find((f) => f.clave === "facebook")!;
    expect(facebook.agendadas).toBeGreaterThanOrEqual(clases.agendadas);
    expect(facebook.asistidas).toBeGreaterThanOrEqual(clases.asistidas);
    expect(facebook.inscritas).toBeGreaterThanOrEqual(clases.inscritas);
    await page.getByTestId("clases-por-fuente-y-sucursal").getByText("Ver por fuente y por sucursal").click();
    const barras = page.getByTestId("grafica-Por fuente");
    await expect(barras).toContainText("Facebook");
    await expect(barras).toContainText(`${facebook.asistidas} de ${facebook.agendadas}`);
    await expect(barras).toContainText(`Conversión ${facebook.conversion} %`);
    // La gráfica es de SVG propio y no depende del color: cada fila trae su cifra escrita.
    await expect(barras.locator("svg.barra").first()).toHaveAttribute("aria-hidden", "true");
    await capturar(page, "80-tableros-clases-muestra", "celular");
    await capturar(page, "80-tableros-clases-muestra", "escritorio");
    // Filtro por sucursal: la sur no tiene clases.
    await filtros(page).getByLabel("Sucursal").selectOption({ label: mundo.sucursales.sur.nombre });
    await expect(page.getByTestId("ind-agendadas")).toHaveText(/0/);
    await expect(page.getByText("No hay clases muestra en este rango.")).toBeVisible();
    await filtros(page).getByLabel("Sucursal").selectOption("");
    await expect(page.getByTestId("ind-agendadas")).toContainText(String(api.total.agendadas));
    // CSV con el BOM y las cifras exactas.
    const csv = await descargar(page, page.getByTestId("descargar-clases"));
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain(`facebook,${facebook.agendadas},${facebook.asistidas},${facebook.no_asistidas}`);
  });

  test("fuentes y campañas (02): la tabla es la de la API; el gasto se captura en el costo por campaña, el costo se divide al centavo y «—» cuando no hay con qué dividir", async ({ page }) => {
    await page.goto("/tableros");
    await desdeRemoto(page);
    const fuentes = await json<{ incluye_gasto: boolean; filas: { clave: string; campana: { id: string } | null; leads: number; inscritos: number; gasto: string | null }[]; total: { gasto: string | null } }>(admin, `/api/reportes/fuentes?desde=${DESDE_REMOTO}`);
    expect(fuentes.incluye_gasto).toBe(true);
    const suya = fuentes.filas.find((f) => f.campana?.id === campana.id)!;
    await expect(page.getByTestId(`fuente-${suya.clave}`)).toContainText(String(suya.leads));
    await expect(page.getByTestId("tabla-de-fuentes").getByRole("columnheader", { name: "Gasto" })).toBeVisible();

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
    const api = await json<{ filas: { campana: { id: string }; gasto: string; leads: number; clases_muestra: number; costo_por_lead_texto: string; costo_por_alumno_texto: string; inscripciones_activas: number }[]; total: { gasto: string } }>(admin, `/api/reportes/costo-por-alumno?desde=${DESDE_REMOTO}`);
    const suyaCosto = api.filas.find((f) => f.campana.id === campana.id)!;
    expect([suyaCosto.gasto, suyaCosto.leads, suyaCosto.clases_muestra, suyaCosto.inscripciones_activas, suyaCosto.costo_por_lead_texto, suyaCosto.costo_por_alumno_texto]).toEqual(["1500.50", 4, 4, 1, "375.13", "1500.50"]);
    await expect(page.getByTestId("ind-gasto")).toContainText(pesos(api.total.gasto));
    // Capturar el gasto recarga también la tabla de fuentes: la campaña ya muestra su gasto y su costo por alumno.
    await expect(page.getByTestId(`fuente-${suya.clave}`)).toContainText("$1,500.50");
    // Una campaña sin gasto y sin alumnos inscritos: «—», nunca una división por cero.
    const sinDivisor = api.filas.find((f) => f.inscripciones_activas === 0)!;
    await expect(page.getByTestId(`costo-${sinDivisor.campana.id}`)).toContainText("—");
    await capturar(page, "81-tableros-fuentes-y-costo", "celular");
    await capturar(page, "81-tableros-fuentes-y-costo", "escritorio");
    const csv = await descargar(page, page.getByTestId("descargar-costo"));
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain("1500.50");
    // Dar de baja un gasto: el total y el costo se recalculan.
    await fila.getByRole("button", { name: "Gastos" }).click();
    await page.getByRole("dialog").getByTestId("gastos").getByRole("listitem").filter({ hasText: "Segunda semana" }).getByRole("button", { name: "Dar de baja" }).click();
    // V7: quitar un gasto se confirma en la misma fila.
    await page.getByRole("dialog").getByRole("button", { name: "Sí, quitarlo" }).click();
    await expect(page.getByRole("dialog").getByTestId("gasto-total")).toHaveText("$1,000.00");
    await page.getByRole("dialog").getByRole("button", { name: "Cerrar" }).click();
    await expect(fila).toContainText("$250.00");
  });

  test("con un filtro de sucursal o de disciplina, el gasto se dice aproximado", async ({ page }) => {
    await page.goto("/tableros");
    await expect(page.getByTestId("aviso-gasto-aproximado")).toHaveCount(0);
    await filtros(page).getByLabel("Sucursal").selectOption({ label: mundo.sucursales.norte.nombre });
    await expect(page.getByTestId("aviso-gasto-aproximado")).toContainText("aproximación");
    await expect(page.getByTestId("aviso-gasto-aproximado")).toContainText("proporción de leads");
  });

  test("embudo (01): las etapas son las de la escuela, la caída entre etapas se dice con texto y «Por qué se pierden» suma lo perdido", async ({ page }) => {
    await page.goto("/tableros");
    await desdeRemoto(page);
    const api = await json<{ llegaron: number; etapas: { etapa: { id: string; nombre: string }; alcanzaron: number; es_mayor_caida: boolean; caida: number }[]; perdidos: { total: number; por_motivo: { leads: number }[] } }>(admin, `/api/reportes/embudo?desde=${DESDE_REMOTO}`);
    expect(api.llegaron).toBeGreaterThan(0);
    for (const e of api.etapas) await expect(page.getByTestId(`embudo-etapa-${e.etapa.id}`)).toContainText(e.etapa.nombre);
    await expect(page.getByTestId(`embudo-etapa-${api.etapas[0]!.etapa.id}`)).toContainText(`${api.etapas[0]!.alcanzaron} `);
    if (api.etapas.some((e) => e.es_mayor_caida)) await expect(page.getByTestId("embudo-mayor-caida")).toContainText("la mayor caída");
    await expect(page.getByTestId("grafica-por-que-se-pierden")).toContainText(`${api.perdidos.total} lead`);
    expect(api.perdidos.por_motivo.reduce((a, m) => a + m.leads, 0)).toBe(api.perdidos.total);
    // La barra es un adorno: la cifra de cada etapa está escrita (también para el lector de pantalla).
    await expect(page.getByTestId("grafica-embudo").locator("svg.embudo-barra").first()).toHaveAttribute("aria-hidden", "true");
    await capturar(page, "82-tableros-embudo", "celular");
    await capturar(page, "82-tableros-embudo", "escritorio");
  });

  test("altas y bajas (04): al pasar el cursor o enfocar un mes se ven sus cifras, y hay una tabla equivalente con los doce meses", async ({ page }) => {
    await page.goto("/tableros");
    const api = await json<{ meses: { mes: string; altas: number; bajas: number; activos: number }[] }>(admin, "/api/reportes/evolucion");
    expect(api.meses).toHaveLength(12);
    const meses = page.locator(".tendencia-meses button");
    await expect(meses).toHaveCount(12);
    const elegido = page.getByTestId("tendencia-mes-elegido");
    // Por omisión, el último mes.
    const ultimo = api.meses.at(-1)!;
    await expect(elegido).toContainText(`Altas ${ultimo.altas}`);
    await expect(elegido).toContainText(`Activos ${ultimo.activos}`);
    // El cursor sobre un mes lo elige; al salir vuelve al último.
    const a = api.meses[8]!;
    await meses.nth(8).scrollIntoViewIfNeeded();
    await meses.nth(8).hover();
    await expect(elegido).toContainText(`Altas ${a.altas}`);
    await expect(elegido).toContainText(`Bajas ${a.bajas}`);
    await expect(elegido).toContainText(`Activos ${a.activos}`);
    await page.mouse.move(0, 0);
    await expect(elegido).toContainText(`Activos ${ultimo.activos}`);
    // El foco del teclado hace lo mismo y cada botón dice sus cifras con palabras.
    const b = api.meses[3]!;
    await meses.nth(3).focus();
    await expect(elegido).toContainText(`Altas ${b.altas}`);
    await expect(meses.nth(3)).toHaveAttribute("aria-label", new RegExp(`${b.altas} alta.*${b.bajas} baja.*${b.activos} activos`));
    await page.keyboard.press("Tab");
    await expect(meses.nth(4)).toBeFocused();
    // Texto primero: la tabla de los doce meses dice lo mismo que la gráfica.
    const tabla = page.getByTestId("tendencia-tabla");
    await tabla.getByText(/Ver las cifras de los 12 meses/).click();
    await expect(tabla.locator("tbody tr")).toHaveCount(12);
    await expect(tabla.locator("tbody tr").last()).toContainText(String(ultimo.activos));
    // En celular, dos botones de 44 px pasan de un mes a otro (el cursor no existe).
    await expect(page.locator('button[aria-label="Mes siguiente"]')).toBeAttached();
    await capturar(page, "83-tableros-altas-y-bajas", "celular");
    await capturar(page, "83-tableros-altas-y-bajas", "escritorio");
  });

  test("el mes: altas, bajas y deserción son de ese mes; un mes sin historia queda en cero y la deserción en «—», sin división por cero", async ({ page }) => {
    await page.goto("/tableros");
    await page.getByLabel("Mes", { exact: true }).fill("2020-01");
    await expect(page.getByTestId("ind-altas")).toContainText("0");
    await expect(page.getByTestId("ind-desercion")).toContainText("—");
    await expect(page.getByTestId("ind-activos")).toContainText("0 alumnos activos");
  });

  test("ejecutivo: ingreso, cartera y descargas en CSV siguen en la página (héroe y secciones 06 a 08)", async ({ page }) => {
    await page.goto("/tableros");
    const api = await json<{ ingreso_mensual_recurrente: string; cartera_vencida: { total: string; antiguedad: Record<string, string> } }>(admin, "/api/reportes/ejecutivo");
    // La cartera vencida de las familias sembradas ($800 con 40 días de atraso) se ve en su tramo.
    expect(api.cartera_vencida.antiguedad["de_31_a_60"]).toMatch(/^[1-9]\d*\.\d\d$/);
    await expect(page.getByTestId("seccion-ingreso")).toContainText(sinCentavosCero(pesos(api.cartera_vencida.antiguedad["de_31_a_60"]!)));
    await expect(page.getByTestId("seccion-ingreso")).toContainText(sinCentavosCero(pesos(api.cartera_vencida.total)));
    await expect(page.getByTestId("seccion-mapa")).toBeAttached();
    await expect(page.getByTestId("seccion-comparativo")).toBeAttached();
    // El resumen en CSV (con el BOM y la cifra exacta) y, en «Más descargas», los otros dos.
    const csv = await descargar(page, page.getByTestId("descargar-ejecutivo"));
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain(api.ingreso_mensual_recurrente);
    await page.getByText("Más descargas").click();
    await expect(page.getByRole("link", { name: "Activos por disciplina (CSV)" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Ocupación por grupo (CSV)" })).toBeVisible();
  });

  test("filtros: «Hasta» antes de «Desde» se dice junto al campo y las secciones de captación esperan, sin pedirle nada inválido al servidor", async ({ page }) => {
    const pedidas: string[] = [];
    page.on("request", (r) => {
      if (/\/api\/reportes\/(embudo|fuentes|clases-muestra)/.test(r.url())) pedidas.push(r.url());
    });
    await page.goto("/tableros");
    await expect(page.getByTestId("ind-agendadas")).toBeVisible();
    pedidas.length = 0;
    await filtros(page).getByLabel("Desde").fill("2026-05-10");
    await filtros(page).getByLabel("Hasta").fill("2026-05-01");
    await expect(filtros(page)).toContainText("La fecha «Desde» debe ser anterior a «Hasta».");
    await expect(page.getByTestId("seccion-embudo")).toContainText("Corrige las fechas");
    await expect(page.getByTestId("seccion-fuentes")).toContainText("Corrige las fechas");
    await expect(page.getByTestId("seccion-clases")).toContainText("Corrige las fechas");
    expect(pedidas.filter((u) => /desde=2026-05-10&hasta=2026-05-01/.test(u)), "no se pide un rango al revés").toEqual([]);
    // Corregido, vuelven los datos.
    await filtros(page).getByLabel("Hasta").fill("2026-05-31");
    await expect(page.getByTestId("seccion-embudo")).not.toContainText("Corrige las fechas");
  });

  test("filtro de disciplina: la píldora activa se marca y las cifras se piden con el filtro", async ({ page }) => {
    const verticales = await json<{ datos: { id: string; nombre: string }[] }>(admin, "/api/verticales");
    const una = verticales.datos[0]!;
    const peticiones: string[] = [];
    page.on("request", (r) => {
      if (r.url().includes("/api/reportes/evolucion")) peticiones.push(r.url());
    });
    await page.goto("/tableros");
    const grupo = page.getByRole("group", { name: "Disciplina", exact: true });
    await expect(grupo.getByRole("button", { name: "Todas las disciplinas" })).toHaveAttribute("aria-pressed", "true");
    await grupo.getByRole("button", { name: una.nombre }).click();
    await expect(grupo.getByRole("button", { name: una.nombre })).toHaveAttribute("aria-pressed", "true");
    await expect.poll(() => peticiones.some((u) => u.includes(`vertical_id=${una.id}`))).toBe(true);
    await expect(page.getByTestId("heroe")).toContainText(una.nombre);
  });
});

test.describe("asesor", () => {
  test.use(comoRol("asesor"));
  test("ve la página con captación, clases muestra y ejecutivo, pero sin el dinero de marketing: ni gasto, ni costo, ni costo por campaña", async ({ page }) => {
    const peticiones: string[] = [];
    page.on("request", (r) => {
      if (r.url().includes("/api/reportes/costo-por-alumno")) peticiones.push(r.url());
    });
    await page.goto("/tableros");
    await expect(pestanas(page).getByRole("button")).toHaveText(nombres);
    await desdeRemoto(page);
    await expect(page.getByTestId("seccion-clases")).toBeVisible();
    await expect(page.getByTestId("tabla-de-fuentes")).toBeVisible();
    await expect(page.getByTestId("tabla-de-fuentes").getByRole("columnheader", { name: "Gasto" })).toHaveCount(0);
    await expect(page.getByTestId("tabla-de-fuentes").getByRole("columnheader", { name: /Costo por alumno/ })).toHaveCount(0);
    await expect(page.getByTestId("indicadores-fuentes")).not.toContainText("Gasto en campañas");
    await expect(page.getByTestId("costo-por-campana")).toHaveCount(0);
    await expect(page.getByTestId("detalle-de-costo")).toHaveCount(0);
    expect(peticiones, "el asesor no pide el costo por campaña").toEqual([]);
    const api = await page.request.get("/api/reportes/costo-por-alumno");
    expect(api.status()).toBe(403);
    // La API tampoco le manda gasto en las fuentes.
    const fuentes = (await (await page.request.get(`/api/reportes/fuentes?desde=${DESDE_REMOTO}`)).json()) as { incluye_gasto: boolean; filas: { gasto: string | null; costo_por_alumno: string | null }[] };
    expect(fuentes.incluye_gasto).toBe(false);
    expect(fuentes.filas.every((f) => f.gasto === null && f.costo_por_alumno === null)).toBe(true);
    await capturar(page, "84-tableros-asesor", "celular");
    await capturar(page, "84-tableros-asesor", "escritorio");
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
