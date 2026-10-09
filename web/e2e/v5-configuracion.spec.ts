// V5, configuración sin SQL, en navegador real (Chromium): lo que la escuela cambia desde Administración sin que nadie toque la base. El administrador ajusta el horario de los mensajes
// automáticos, los tiempos del asistente y los umbrales (con el rango, el valor de siempre y qué pasa si se cambia a la vista); redacta los textos del asistente con su vista previa; ordena y
// nombra las etapas del embudo; y arma sus motivos de pérdida y de baja. Cada pantalla se prueba en escritorio y en celular de 390 px, con sus errores (fuera de rango, hueco que no existe,
// enlace, etapa de sistema) y dejando capturas en `docs/capturas/v1/v5-*`. Lo que cambia se comprueba también contra la API, y al terminar todo queda como estaba.
//
// Se llama `v5-…` para correr DESPUÉS de los demás (Playwright ordena por nombre).

import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import type { APIRequestContext, Page } from "@playwright/test";
import { apiComo, json } from "./ayudas.ts";
import { comoRol, expect, test } from "./fixtura.ts";
import { RAIZ } from "./mundo.ts";

test.describe.configure({ mode: "serial" });

let admin: APIRequestContext;
test.beforeAll(async () => {
  admin = await apiComo("administrador");
});
test.afterAll(async () => {
  await admin.dispose();
});

const ESCRITORIO = { width: 1366, height: 800 } as const;
const CELULAR = { width: 390, height: 844 } as const;

async function captura(page: Page, nombre: string, opciones: { completa?: boolean } = {}): Promise<void> {
  const carpeta = resolve(RAIZ, "docs/capturas/v1");
  mkdirSync(carpeta, { recursive: true });
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: resolve(carpeta, `${nombre}.png`), animations: "disabled", fullPage: opciones.completa ?? false });
}

interface Config extends Record<string, unknown> {
  horario_envio_inicio_min: number;
  horario_envio_fin_min: number;
  lead_a_medias_minutos: number;
  bot_max_intentos: number;
  ocupacion_a_reventar_pct: number;
  ocupacion_vacio_pct: number;
}
const config = (): Promise<Config> => json<Config>(admin, "/api/configuracion");
const DE_SIEMPRE = { horario_envio_inicio_min: 540, horario_envio_fin_min: 1200, lead_a_medias_minutos: 30, bot_max_intentos: 3, ocupacion_a_reventar_pct: 90, ocupacion_vacio_pct: 25 };
const TERMINOS_TECNICOS = /_min\b|_pct\b|_dias\b|tipo_sistema|\bcodigo\b|undefined|null|\[object|NaN/;

test.afterAll(async () => {
  // Todo como estaba para quien corra después.
  const a = await apiComo("administrador");
  await a.patch("/api/configuracion", { data: DE_SIEMPRE });
  await a.put("/api/modulos", { data: { tableros: true } });
  const textos = await json<{ datos: { clave: string; personalizado: boolean }[] }>(a, "/api/textos-bot");
  for (const t of textos.datos.filter((x) => x.personalizado)) await a.delete(`/api/textos-bot/${t.clave}`);
  await a.dispose();
});

test.describe("quien no administra no entra a estas pantallas", () => {
  test.use(comoRol("asesor"));
  test("el asesor ve «Sin acceso» en las tres pantallas nuevas y la API le responde 403", async ({ page }) => {
    for (const ruta of ["/admin/textos", "/admin/etapas", "/admin/motivos"]) {
      await page.goto(ruta);
      await expect(page.getByRole("heading", { name: "Sin acceso" })).toBeVisible();
    }
    const asesor = await apiComo("asesor");
    for (const [metodo, ruta] of [["get", "/api/textos-bot"], ["put", "/api/textos-bot/saludo"], ["post", "/api/etapas"], ["put", "/api/etapas/orden"]] as const) {
      const r = await asesor[metodo](ruta, metodo === "get" ? {} : { data: { texto: "x", nombre: "x", ids: [] } });
      expect(r.status(), `${metodo} ${ruta}`).toBe(403);
    }
    await asesor.dispose();
  });
});

test.describe("ESCRITORIO: el administrador", () => {
  test.use({ ...comoRol("administrador"), viewport: ESCRITORIO });

  test("el menú de Administración trae las áreas nuevas, con palabras de la escuela", async ({ page }) => {
    await page.goto("/admin");
    for (const area of ["Configuración", "Textos del asistente", "Etapas del embudo", "Motivos de pérdida y de baja"]) await expect(page.getByRole("link", { name: area, exact: true })).toBeVisible();
    expect(await page.locator("main").innerText()).not.toMatch(TERMINOS_TECNICOS);
  });

  test("Configuración: cada ajuste muestra su rango, su valor de siempre y qué pasa si se cambia; sin términos técnicos", async ({ page }) => {
    await page.goto("/admin/configuracion");
    await expect(page.getByRole("heading", { name: "Configuración de la escuela" })).toBeVisible();
    for (const titulo of ["Horario de los mensajes automáticos", "Frecuencia de mensajes", "El asistente de WhatsApp", "Cotizaciones y lista de espera", "Clase muestra", "Avisos al asesor", "Tablero ejecutivo"]) {
      await expect(page.getByRole("heading", { name: titulo })).toBeVisible();
    }
    await expect(page.getByLabel("Los mensajes automáticos salen desde las")).toHaveValue("09:00");
    await expect(page.getByLabel("Y hasta las")).toHaveValue("20:00");
    await expect(page.getByLabel(/Minutos de silencio antes de avisar a los asesores/)).toHaveValue("30");
    const bloque = page.getByTestId("formulario-configuracion");
    await expect(bloque).toContainText("De siempre: 30 minutos");
    await expect(bloque).toContainText("Qué pasa si lo cambias:");
    await expect(bloque).toContainText("(de 1 a 10 intentos)");
    await expect(bloque).toContainText("nunca más largo");
    expect(await page.locator("main").innerText(), "sin términos técnicos a la vista").not.toMatch(TERMINOS_TECNICOS);
    await captura(page, "v5-01-configuracion-escritorio", { completa: true });
  });

  test("Configuración: se estrecha el horario, se ajustan los tiempos del asistente y los umbrales, y la API lo confirma", async ({ page }) => {
    await page.goto("/admin/configuracion");
    await page.getByLabel("Los mensajes automáticos salen desde las").fill("10:00");
    await page.getByLabel("Y hasta las").fill("18:00");
    await page.getByLabel(/Minutos de silencio antes de avisar a los asesores/).fill("45");
    await page.getByLabel(/Respuestas que no entiende antes de pasar con una persona/).fill("4");
    await page.getByLabel("Un grupo está «a reventar» desde el").fill("85");
    await page.getByLabel("Un grupo está «vacío» hasta el").fill("20");
    await page.getByRole("button", { name: "Guardar la configuración" }).click();
    await expect(page.getByText("Configuración guardada.")).toBeVisible();
    expect(await config()).toMatchObject({ horario_envio_inicio_min: 600, horario_envio_fin_min: 1080, lead_a_medias_minutos: 45, bot_max_intentos: 4, ocupacion_a_reventar_pct: 85, ocupacion_vacio_pct: 20 });
    // Al volver a abrir la pantalla, lo guardado se ve (surte efecto sin reiniciar nada).
    await page.reload();
    await expect(page.getByLabel("Los mensajes automáticos salen desde las")).toHaveValue("10:00");
    await expect(page.getByLabel("Y hasta las")).toHaveValue("18:00");
    await expect(page.getByLabel(/Minutos de silencio/)).toHaveValue("45");
    // Y queda en el registro de cambios.
    const registro = await json<{ datos: { entidad_tipo: string; despues: Record<string, unknown> }[] }>(admin, "/api/registro-cambios?entidad_tipo=configuracion_organizacion&limite=5");
    expect(registro.datos.some((r) => r.despues["horario_envio_inicio_min"] === 600)).toBe(true);
  });

  test("Configuración: fuera de rango se avisa qué hacer y NO se guarda; el horario no se puede ampliar más allá de 09:00 a 20:00", async ({ page }) => {
    await page.goto("/admin/configuracion");
    await page.getByLabel("Los mensajes automáticos salen desde las").fill("08:00");
    await page.getByLabel("Y hasta las").fill("21:30");
    await page.getByLabel(/Minutos de silencio antes de avisar a los asesores/).fill("3");
    await page.getByLabel(/Respuestas que no entiende/).fill("11");
    await page.getByRole("button", { name: "Guardar la configuración" }).click();
    await expect(page.getByText(/solo pueden salir entre las 09:00 y las 20:00\. Elige una hora de 09:00 a 19:59/)).toBeVisible();
    await expect(page.getByText(/Elige una hora de 09:01 a 20:00/)).toBeVisible();
    await expect(page.getByText("Escribe un número de 5 a 1440")).toBeVisible();
    await expect(page.getByText("Escribe un número de 1 a 10")).toBeVisible();
    await expect(page.getByText("Configuración guardada.")).toHaveCount(0);
    await page.getByText(/Elige una hora de 09:00 a 19:59/).scrollIntoViewIfNeeded();
    await captura(page, "v5-02-configuracion-fuera-de-rango-escritorio");
    // Nada se guardó (sigue lo del cambio anterior).
    expect(await config()).toMatchObject({ horario_envio_inicio_min: 600, horario_envio_fin_min: 1080, lead_a_medias_minutos: 45, bot_max_intentos: 4 });
    // Dos ajustes que se contradicen: el inicio no puede ser después del fin, «vacío» no puede ser más que «a reventar».
    await page.reload();
    await page.getByLabel("Los mensajes automáticos salen desde las").fill("17:00");
    await page.getByLabel("Y hasta las").fill("12:00");
    await page.getByLabel("Un grupo está «vacío» hasta el").fill("95");
    await page.getByRole("button", { name: "Guardar la configuración" }).click();
    await expect(page.getByText("La hora de inicio debe ser antes que la hora de fin. Cambia una de las dos.")).toBeVisible();
    await expect(page.getByText(/«vacío» debe ser menor que el de «a reventar»\. Baja uno o sube el otro/)).toBeVisible();
  });

  test("Configuración: lo que el servidor rechaza se muestra con su mensaje, sin perder lo escrito", async ({ page }) => {
    await page.goto("/admin/configuracion");
    // La pantalla ya revisa lo que se puede revisar sola; esto prueba el rechazo del servidor: mientras la pantalla está abierta con «vacío» en 20, otra persona lo sube a 40.
    // Al guardar solo «a reventar» = 30, la pantalla no ve el choque (20 < 30), pero el servidor lo juzga con lo que quedaría (40 ≥ 30) y lo rechaza.
    await page.getByLabel("Un grupo está «a reventar» desde el").fill("30");
    const r = await admin.patch("/api/configuracion", { data: { ocupacion_vacio_pct: 40 } });
    expect(r.status()).toBe(200);
    await page.getByRole("button", { name: "Guardar la configuración" }).click();
    await expect(page.getByText(/«vacío» debe ser menor que el de «a reventar»\. Baja uno o sube el otro/).first()).toBeVisible();
    await expect(page.getByLabel("Un grupo está «a reventar» desde el")).toHaveValue("30");
    expect((await config()).ocupacion_a_reventar_pct, "no se guardó").toBe(85);
    await admin.patch("/api/configuracion", { data: { ocupacion_vacio_pct: 20 } });
  });

  test("Configuración: el ajuste de un módulo apagado se puede editar, pero la pantalla avisa que no hace nada hasta encenderlo", async ({ page }) => {
    const apagar = await admin.put("/api/modulos", { data: { tableros: false } });
    expect(apagar.status()).toBe(200);
    await page.goto("/admin/configuracion");
    await expect(page.getByText(/Ojo:.*el módulo «Tableros» está apagado.*no hace nada hasta que lo enciendas/).first()).toBeVisible();
    await page.getByLabel("Un grupo está «a reventar» desde el").fill("88");
    await page.getByRole("button", { name: "Guardar la configuración" }).click();
    await expect(page.getByText("Configuración guardada.")).toBeVisible();
    expect((await config()).ocupacion_a_reventar_pct).toBe(88);
    await captura(page, "v5-03-ajuste-de-modulo-apagado-escritorio");
    await admin.put("/api/modulos", { data: { tableros: true } });
    await admin.patch("/api/configuracion", { data: { ocupacion_a_reventar_pct: 85 } });
  });

  test("Textos del asistente: se redacta un mensaje con su vista previa, se rechazan huecos que no existen y enlaces, y se vuelve al texto de siempre", async ({ page }) => {
    await page.goto("/admin/textos");
    await expect(page.getByRole("heading", { name: "Textos del asistente" })).toBeVisible();
    const tarjeta = page.getByTestId("texto-saludo");
    await expect(tarjeta).toContainText("De siempre");
    await expect(tarjeta).toContainText("Gracias por escribir a {disciplina}");
    await captura(page, "v5-04-textos-del-asistente-escritorio");

    await tarjeta.getByRole("button", { name: "Cambiar" }).click();
    const dialogo = page.getByRole("dialog");
    await expect(dialogo.getByText("Huecos que puedes usar")).toBeVisible();
    // Un hueco que no existe: se avisa antes de guardar.
    await dialogo.getByLabel("Lo que dice el asistente").fill("¡Bienvenida a {escuela}!");
    await dialogo.getByRole("button", { name: "Guardar" }).click();
    await expect(dialogo.getByText(/«\{escuela\}» no se puede usar en este mensaje\. Puedes usar: \{disciplina\}/)).toBeVisible();
    // Un enlace: lo rechaza el servidor y se muestra su mensaje.
    await dialogo.getByLabel("Lo que dice el asistente").fill("Bienvenida a {disciplina}. Más en https://escuela.mx");
    await dialogo.getByRole("button", { name: "Guardar" }).click();
    await expect(dialogo.getByText(/no puede llevar enlaces/)).toBeVisible();
    // Un texto bueno, con los huecos a un clic y su vista previa.
    await dialogo.getByLabel("Lo que dice el asistente").fill("¡Bienvenida a ");
    await dialogo.getByRole("button", { name: "Agregar {disciplina}" }).click();
    await dialogo.getByLabel("Lo que dice el asistente").press("End");
    await dialogo.getByLabel("Lo que dice el asistente").pressSequentially("! Te hago tres preguntas rápidas.");
    await expect(dialogo.getByTestId("vista-previa")).toHaveText("¡Bienvenida a la escuela! Te hago tres preguntas rápidas.");
    await expect(dialogo.getByText(/no puede llevar enlaces/), "al editar, el error anterior se quita").toHaveCount(0);
    await page.evaluate(() => window.scrollTo(0, 0));
    await captura(page, "v5-05-cambiar-un-texto-escritorio");
    await dialogo.getByRole("button", { name: "Guardar" }).click();
    await expect(dialogo).toHaveCount(0);
    await expect(tarjeta).toContainText("Personalizado");
    await expect(tarjeta).toContainText("¡Bienvenida a {disciplina}! Te hago tres preguntas rápidas.");
    const guardado = await json<{ datos: { clave: string; texto: string; personalizado: boolean }[] }>(admin, "/api/textos-bot");
    expect(guardado.datos.find((t) => t.clave === "saludo")).toMatchObject({ personalizado: true, texto: "¡Bienvenida a {disciplina}! Te hago tres preguntas rápidas." });

    // Un mensaje con lista: el hueco {lista} es obligatorio.
    const sucursal = page.getByTestId("texto-pregunta_sucursal");
    await sucursal.getByRole("button", { name: "Cambiar" }).click();
    await dialogo.getByLabel("Lo que dice el asistente").fill("¿Qué sede prefieres?");
    await dialogo.getByRole("button", { name: "Guardar" }).click();
    await expect(dialogo.getByText(/Falta \{lista\}/)).toBeVisible();
    await dialogo.getByRole("button", { name: "Cancelar" }).click();

    // Volver al texto de siempre.
    await tarjeta.getByRole("button", { name: "Cambiar" }).click();
    await dialogo.getByRole("button", { name: "Volver al texto de siempre" }).click();
    await expect(dialogo).toHaveCount(0);
    await expect(tarjeta).toContainText("De siempre");
    expect((await json<{ datos: { clave: string; personalizado: boolean }[] }>(admin, "/api/textos-bot")).datos.find((t) => t.clave === "saludo")?.personalizado).toBe(false);
    expect(await page.locator("main").innerText()).not.toMatch(TERMINOS_TECNICOS);
  });

  test("Etapas del embudo: se agrega una propia, se mueve, se renombra y se quita; las del sistema no se quitan ni se cambian de lugar entre sí", async ({ page }) => {
    await page.goto("/admin/etapas");
    await expect(page.getByRole("heading", { name: "Etapas del embudo" })).toBeVisible();
    const lista = page.getByTestId("lista-de-etapas");
    await expect(lista.getByText("Del sistema").first()).toBeVisible();
    await expect(lista.getByRole("button", { name: "Quitar" }), "ninguna etapa de sistema se puede quitar").toHaveCount(0);
    await captura(page, "v5-06-etapas-del-embudo-escritorio", { completa: true });

    // La primera no sube; ni «Contactado» pasa a «Nuevo» (las de sistema conservan su orden).
    await expect(lista.getByRole("button", { name: /^Subir / }).first()).toBeDisabled();
    const etapas = await json<{ datos: { id: string; nombre: string; tipo_sistema: string | null }[] }>(admin, "/api/etapas");
    const contactado = etapas.datos.find((e) => e.tipo_sistema === "contactado")!;
    await expect(lista.getByRole("button", { name: `Subir ${contactado.nombre}` })).toBeDisabled();

    await page.getByRole("button", { name: "Agregar una etapa" }).click();
    const dialogo = page.getByRole("dialog");
    await dialogo.getByRole("button", { name: "Guardar" }).click();
    await expect(dialogo.getByText("Escribe el nombre de la etapa")).toBeVisible();
    await dialogo.getByLabel(/Nombre de la etapa/).fill("Visita a la sede");
    await dialogo.getByLabel("Días sin movimiento que avisan").fill("0");
    await dialogo.getByRole("button", { name: "Guardar" }).click();
    await expect(dialogo.getByText(/Escribe un número de 1 a 365/)).toBeVisible();
    await dialogo.getByLabel("Días sin movimiento que avisan").fill("4");
    await dialogo.getByRole("button", { name: "Guardar" }).click();
    await expect(dialogo).toHaveCount(0);
    const nueva = lista.locator("li", { hasText: "Visita a la sede" });
    await expect(nueva).toContainText("Tuya");
    await expect(nueva).toContainText("Avisa a los 4 días sin movimiento");
    // Quedó justo antes de las de cierre.
    const orden = (await json<{ datos: { nombre: string; tipo_sistema: string | null }[] }>(admin, "/api/etapas")).datos;
    const i = orden.findIndex((e) => e.nombre === "Visita a la sede");
    expect(orden[i + 1]?.tipo_sistema).toBe("inscrito");
    expect(orden[i + 2]?.tipo_sistema).toBe("perdido");

    // Subir la propia un lugar, y volver a bajarla.
    await nueva.getByRole("button", { name: "Subir Visita a la sede" }).click();
    await expect.poll(async () => (await json<{ datos: { nombre: string }[] }>(admin, "/api/etapas")).datos.findIndex((e) => e.nombre === "Visita a la sede")).toBe(i - 1);
    await lista.locator("li", { hasText: "Visita a la sede" }).getByRole("button", { name: "Bajar Visita a la sede" }).click();
    await expect.poll(async () => (await json<{ datos: { nombre: string }[] }>(admin, "/api/etapas")).datos.findIndex((e) => e.nombre === "Visita a la sede")).toBe(i);

    // Renombrar una de sistema: cambia el nombre, no el papel.
    const antes = contactado.nombre;
    await lista.locator("li", { hasText: antes }).getByRole("button", { name: "Cambiar" }).first().click();
    await dialogo.getByLabel(/Nombre de la etapa/).fill("Ya hablamos con la familia");
    await dialogo.getByRole("button", { name: "Guardar" }).click();
    await expect(lista.getByText("Ya hablamos con la familia")).toBeVisible();
    const despues = (await json<{ datos: { nombre: string; tipo_sistema: string | null }[] }>(admin, "/api/etapas")).datos.find((e) => e.tipo_sistema === "contactado");
    expect(despues?.nombre).toBe("Ya hablamos con la familia");
    await lista.locator("li", { hasText: "Ya hablamos con la familia" }).getByRole("button", { name: "Cambiar" }).click();
    await dialogo.getByLabel(/Nombre de la etapa/).fill(antes);
    await dialogo.getByRole("button", { name: "Guardar" }).click();
    await expect(lista.locator("li", { hasText: new RegExp(`^\\d+\\. ${antes}`) })).toBeVisible();

    // Quitar la propia (sin leads).
    await lista.locator("li", { hasText: "Visita a la sede" }).getByRole("button", { name: "Quitar" }).click();
    await dialogo.getByRole("button", { name: "Quitar" }).click();
    await expect(lista.getByText("Visita a la sede")).toHaveCount(0);
    expect((await json<{ datos: { nombre: string }[] }>(admin, "/api/etapas")).datos.some((e) => e.nombre === "Visita a la sede")).toBe(false);
    expect(await page.locator("main").innerText()).not.toMatch(TERMINOS_TECNICOS);
  });

  test("Etapas del embudo: una etapa propia con leads no se quita y el mensaje dice cuántos y qué hacer", async ({ page }) => {
    const creada = await admin.post("/api/etapas", { data: { nombre: "Etapa con leads" } });
    expect(creada.status()).toBe(201);
    const etapa = (await creada.json()) as { id: string };
    // Un lead en ella (por la API de leads).
    const leads = await json<{ datos: { id: string }[] }>(admin, "/api/leads?limite=1");
    const lead = leads.datos[0]!;
    const movido = await admin.patch(`/api/leads/${lead.id}/etapa`, { data: { etapa_id: etapa.id } });
    expect(movido.status(), await movido.text()).toBe(200);
    await page.goto("/admin/etapas");
    const fila = page.getByTestId("lista-de-etapas").locator("li", { hasText: "Etapa con leads" });
    await fila.getByRole("button", { name: "Quitar" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Quitar" }).click();
    await expect(page.getByRole("dialog").getByText(/Hay 1 lead en esta etapa\. Muévelos a otra etapa antes de quitarla/)).toBeVisible();
    await captura(page, "v5-07-etapa-con-leads-escritorio");
    await page.getByRole("dialog").getByRole("button", { name: "Cancelar" }).click();
    // Se deja como estaba: el lead de vuelta en su etapa y la propia quitada.
    const etapas = await json<{ datos: { id: string; tipo_sistema: string | null }[] }>(admin, "/api/etapas");
    const nuevo = etapas.datos.find((e) => e.tipo_sistema === "nuevo")!;
    await admin.patch(`/api/leads/${lead.id}/etapa`, { data: { etapa_id: nuevo.id, desde_etapa_id: etapa.id } });
    expect((await admin.delete(`/api/etapas/${etapa.id}`)).status()).toBe(204);
  });

  test("Motivos de pérdida y de baja: se agrega, se cambia, se apaga y se quita; lo apagado ya no se ofrece", async ({ page }) => {
    await page.goto("/admin/motivos");
    await expect(page.getByRole("heading", { name: "Motivos de pérdida y de baja" })).toBeVisible();
    const perdida = page.getByTestId("motivos-de-perdida");
    const tarjetaPerdida = page.locator("section.tarjeta", { has: page.getByRole("heading", { name: "Motivos de pérdida de un lead" }) });
    const tarjetaBaja = page.locator("section.tarjeta", { has: page.getByRole("heading", { name: "Motivos de baja de una inscripción" }) });
    const dialogo = page.getByRole("dialog");
    await captura(page, "v5-08-motivos-escritorio", { completa: true });

    await tarjetaPerdida.getByRole("button", { name: "Agregar un motivo" }).click();
    await dialogo.getByRole("button", { name: "Guardar" }).click();
    await expect(dialogo.getByText("Escribe el motivo")).toBeVisible();
    await dialogo.getByLabel(/^Motivo/).fill("Se fue con otra escuela");
    await dialogo.getByLabel("Lugar en la lista").fill("5000");
    await dialogo.getByRole("button", { name: "Guardar" }).click();
    await expect(dialogo.getByText("Escribe un número de 0 a 1000")).toBeVisible();
    await dialogo.getByLabel("Lugar en la lista").fill("90");
    await dialogo.getByRole("button", { name: "Guardar" }).click();
    await expect(dialogo).toHaveCount(0);
    const fila = perdida.locator("li", { hasText: "Se fue con otra escuela" });
    await expect(fila).toContainText("Se ofrece");
    let motivos = await json<{ datos: { nombre: string; activo: boolean; orden: number }[] }>(admin, "/api/motivos-perdida");
    expect(motivos.datos.find((m) => m.nombre === "Se fue con otra escuela")).toMatchObject({ activo: true, orden: 90 });

    // Apagarlo: ya no sale al marcar un lead perdido, pero sigue en la lista.
    await fila.getByRole("button", { name: "Cambiar" }).click();
    await dialogo.getByLabel("Se ofrece al registrar").uncheck();
    await dialogo.getByRole("button", { name: "Guardar" }).click();
    await expect(fila).toContainText("Apagado");
    const activos = await json<{ datos: { nombre: string }[] }>(admin, "/api/motivos-perdida?activo=true");
    expect(activos.datos.some((m) => m.nombre === "Se fue con otra escuela")).toBe(false);
    motivos = await json(admin, "/api/motivos-perdida");
    expect(motivos.datos.some((m) => m.nombre === "Se fue con otra escuela")).toBe(true);

    // Un motivo de baja de una inscripción, y quitar ambos.
    const baja = page.getByTestId("motivos-de-baja");
    await tarjetaBaja.getByRole("button", { name: "Agregar un motivo" }).click();
    await dialogo.getByLabel(/^Motivo/).fill("Cambio de domicilio");
    await dialogo.getByRole("button", { name: "Guardar" }).click();
    await expect(baja.locator("li", { hasText: "Cambio de domicilio" })).toBeVisible();
    await captura(page, "v5-09-motivos-con-cambios-escritorio", { completa: true });
    await baja.locator("li", { hasText: "Cambio de domicilio" }).getByRole("button", { name: "Quitar" }).click();
    await dialogo.getByRole("button", { name: "Quitar" }).click();
    await expect(baja.getByText("Cambio de domicilio")).toHaveCount(0);
    await fila.getByRole("button", { name: "Quitar" }).click();
    await dialogo.getByRole("button", { name: "Quitar" }).click();
    await expect(perdida.getByText("Se fue con otra escuela")).toHaveCount(0);
    expect(await page.locator("main").innerText()).not.toMatch(TERMINOS_TECNICOS);
  });
});

test.describe("CELULAR (390 px): el administrador", () => {
  test.use({ ...comoRol("administrador"), viewport: CELULAR, hasTouch: true, isMobile: true });

  const sinDesbordeHorizontal = async (page: Page): Promise<void> => {
    const ancho = await page.evaluate(() => ({ cuerpo: document.documentElement.scrollWidth, ventana: window.innerWidth }));
    expect(ancho.cuerpo, "sin desplazamiento horizontal").toBeLessThanOrEqual(ancho.ventana);
  };

  test("Configuración se lee y se edita en el celular: horario, error de rango y guardado", async ({ page }) => {
    await page.goto("/admin/configuracion");
    await sinDesbordeHorizontal(page);
    await expect(page.getByLabel("Los mensajes automáticos salen desde las")).toBeVisible();
    await captura(page, "v5-10-configuracion-celular", { completa: true });
    await page.getByLabel("Y hasta las").fill("21:00");
    await page.getByRole("button", { name: "Guardar la configuración" }).click();
    await expect(page.getByText(/Elige una hora de 09:01 a 20:00/)).toBeVisible();
    await page.getByText(/Elige una hora de 09:01 a 20:00/).scrollIntoViewIfNeeded();
    await captura(page, "v5-11-configuracion-error-celular");
    await page.getByLabel("Y hasta las").fill("19:00");
    await page.getByRole("button", { name: "Guardar la configuración" }).click();
    await expect(page.getByText("Configuración guardada.")).toBeVisible();
    expect((await config()).horario_envio_fin_min).toBe(1140);
    await admin.patch("/api/configuracion", { data: { horario_envio_fin_min: 1080 } });
  });

  test("Textos del asistente en el celular: la lista y el diálogo para cambiar un mensaje", async ({ page }) => {
    await page.goto("/admin/textos");
    await sinDesbordeHorizontal(page);
    await captura(page, "v5-12-textos-celular");
    await page.getByTestId("texto-pidio_asesor").getByRole("button", { name: "Cambiar" }).click();
    const dialogo = page.getByRole("dialog");
    await dialogo.getByLabel("Lo que dice el asistente").fill("Con gusto, una persona del equipo te escribe en unos minutos.");
    await expect(dialogo.getByTestId("vista-previa")).toContainText("una persona del equipo");
    await captura(page, "v5-13-cambiar-texto-celular");
    await dialogo.getByRole("button", { name: "Guardar" }).click();
    await expect(page.getByTestId("texto-pidio_asesor")).toContainText("Personalizado");
    await page.getByTestId("texto-pidio_asesor").getByRole("button", { name: "Cambiar" }).click();
    await dialogo.getByRole("button", { name: "Volver al texto de siempre" }).click();
    await expect(page.getByTestId("texto-pidio_asesor")).toContainText("De siempre");
  });

  test("Etapas del embudo y motivos en el celular", async ({ page }) => {
    await page.goto("/admin/etapas");
    await sinDesbordeHorizontal(page);
    await captura(page, "v5-14-etapas-celular", { completa: true });
    await page.goto("/admin/motivos");
    await sinDesbordeHorizontal(page);
    await captura(page, "v5-15-motivos-celular", { completa: true });
  });
});
