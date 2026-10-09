// V3, «segundo hijo», en el navegador: el asesor agrega otro niño desde la ficha (escritorio y celular de 390 px), lo corrige y lo quita con confirmación, cotiza a cada niño por
// separado, y el asistente inscribe a los hermanos en UNA operación: el adulto se pregunta una sola vez, los datos que ya escribió el asesor no se piden otra vez, la promoción por
// hermanos se ve en el precio antes de confirmar (y es lo que se cobra) y el saldo de la familia queda con los cargos de los dos hijos. También la salida cuando a uno no le alcanza
// el lugar (dejarlo fuera) y la ficha con el cotizador apagado (sin nada de cotización).
//
// Este archivo se llama `v3-…` para correr DESPUÉS de los demás (Playwright ordena por nombre): crea su propio programa, grupos, promoción y familias, e inscribe alumnos, y
// ninguna otra prueba espera conteos sin ellos. Al terminar da de baja lo que creó (soft delete) y deja los módulos como estaban.

import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import type { APIRequestContext, Page } from "@playwright/test";
import { apiComo, json } from "./ayudas.ts";
import { comoRol, contextoNuevo, expect, mundo, test } from "./fixtura.ts";
import { RAIZ } from "./mundo.ts";
import { crearPrismaDePruebas, type PrismaPruebas } from "../../src/testutil/prisma-pruebas.ts";

test.use(comoRol("asesor"));
test.describe.configure({ mode: "serial" });

let prisma: PrismaPruebas;
let admin: APIRequestContext;
let asesor: APIRequestContext;
const org = mundo.organizacion.id;
const norte = mundo.sucursales.norte.id;
const creados = { programa: "", promo: "", leads: [] as string[], apagadas: [] as string[] };
let grupos: { a: string; b: string; c: string };
let n = 0;

/** La fecha de nacimiento de alguien que hoy tiene `anios` años cumplidos (más unos meses): estable mientras corre la prueba. */
function nacidoHaceAnios(anios: number): string {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - anios);
  d.setUTCMonth(d.getUTCMonth() - 3);
  return d.toISOString().slice(0, 10);
}

async function capturaV1(page: Page, nombre: string): Promise<void> {
  const carpeta = resolve(RAIZ, "docs/capturas/v1");
  mkdirSync(carpeta, { recursive: true });
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: resolve(carpeta, `${nombre}.png`), animations: "disabled" });
}

/** Un lead del bot en negociación con su primer niño (con nombre y edad, como lo deja el bot) y el reglamento ya aceptado por la familia. */
async function leadDelBot(contacto: string, primero: string): Promise<{ leadId: string; prospectoId: string }> {
  const lead = await prisma.lead.create({
    data: { organizacion_id: org, vertical_interes_id: mundo.verticalId, sucursal_interes_id: norte, etapa_id: mundo.etapas["negociacion"] ?? "", nombre_contacto: contacto, telefono: `+5255${String(70_000_000 + ++n * 7919 + (Date.now() % 1_000_000))}`, ultima_interaccion_en: new Date() },
  });
  creados.leads.push(lead.id);
  const prospecto = await prisma.prospecto.create({ data: { organizacion_id: org, lead_id: lead.id, vertical_interes_id: mundo.verticalId, nombre: primero, edad_declarada: 8, origen: "asesor" } });
  const doc = await prisma.documento_legal.findFirstOrThrow({ where: { organizacion_id: org, tipo: "reglamento" }, orderBy: { version: "desc" } });
  await prisma.aceptacion_legal.create({ data: { organizacion_id: org, documento_id: doc.id, tipo: "reglamento", version_aceptada: doc.version, resultado: "aceptada", lead_id: lead.id, prospecto_id: prospecto.id, aceptante_nombre: "Rosa Prueba", aceptante_parentesco: "madre", canal: "presencial", aceptado_en: new Date(), texto_hash: doc.texto_hash } });
  return { leadId: lead.id, prospectoId: prospecto.id };
}

test.beforeAll(async () => {
  prisma = crearPrismaDePruebas(process.env["DATABASE_URL"], 4);
  admin = await apiComo("administrador");
  asesor = await apiComo("asesor");
  // Las promociones que dejaron las otras pruebas del mundo (por ejemplo la de recepción) valen para todos los programas y se sumarían a la de esta prueba: se apagan mientras
  // corre y se vuelven a encender al terminar.
  const ajenas = await prisma.promocion.findMany({ where: { organizacion_id: org, activo: true }, select: { id: true } });
  creados.apagadas = ajenas.map((p) => p.id);
  await prisma.promocion.updateMany({ where: { id: { in: creados.apagadas } }, data: { activo: false } });
  // Un programa propio (3 a 14 años) con tres grupos y una promoción por hermanos que SOLO vale para él.
  const programa = await prisma.programa.create({ data: { organizacion_id: org, vertical_id: mundo.verticalId, sucursal_id: norte, nombre: "Programa V3", edad_min: 3, edad_max: 14 } });
  creados.programa = programa.id;
  await prisma.precio.create({ data: { organizacion_id: org, programa_id: programa.id, costo_inscripcion: "500.00", costo_mensualidad: "800.00", vigencia_desde: new Date("2020-01-01") } });
  const grupo = async (nombre: string, cupo: number) => {
    const g = await prisma.grupo.create({ data: { organizacion_id: org, programa_id: programa.id, nombre, cupo_maximo: cupo } });
    for (const dia of [0, 1, 2, 3, 4, 5, 6]) await prisma.grupo_horario.create({ data: { organizacion_id: org, grupo_id: g.id, dia_semana: dia, hora_inicio_min: 600, hora_fin_min: 660 } });
    return g.id;
  };
  grupos = { a: await grupo("Grupo V3 A", 20), b: await grupo("Grupo V3 B", 20), c: await grupo("Grupo V3 C", 1) };
  const promo = await prisma.promocion.create({ data: { organizacion_id: org, nombre: "Hermanos V3", codigo: "HERMANOS-V3", vigencia_desde: new Date("2020-01-01"), condicion_tipo: "min_hermanos", condicion_valor: { hermanos: 2 }, acumulable: true, prioridad: 5 } });
  creados.promo = promo.id;
  await prisma.promocion_beneficio.create({ data: { organizacion_id: org, promocion_id: promo.id, tipo: "descuento_mensualidad", modo: "porcentaje", valor: "10.00" } });
  await prisma.promocion_programa.create({ data: { organizacion_id: org, promocion_id: promo.id, programa_id: programa.id } });
});
test.afterAll(async () => {
  // Las inscripciones y los cargos no se borran (un cargo se cancela, no se borra: `cargo_inmutable`), y esta prueba corre la última sobre una base que se recrea en cada corrida. Solo se
  // desactivan el programa y la promoción para que no estorben si alguien la corre dos veces sobre la misma base, y se reactivan las promociones ajenas.
  await prisma.promocion.update({ where: { id: creados.promo }, data: { activo: false } });
  await prisma.promocion.updateMany({ where: { id: { in: creados.apagadas } }, data: { activo: true } });
  await prisma.programa.update({ where: { id: creados.programa }, data: { activo: false } });
  await prisma.$disconnect();
  await admin.dispose();
  await asesor.dispose();
});

/** Escribe un niño en el formulario de la ficha. */
async function agregarNino(page: Page, datos: { nombre: string; apellidos?: string; fecha: string }, boton: "Guardar" | "Guardar y agregar otro" = "Guardar"): Promise<void> {
  const dialogo = page.getByRole("dialog");
  await dialogo.getByLabel(/^Nombre/).fill(datos.nombre);
  if (datos.apellidos) await dialogo.getByLabel("Apellidos (opcional)").fill(datos.apellidos);
  await dialogo.getByLabel("Fecha de nacimiento").fill(datos.fecha);
  await dialogo.getByRole("button", { name: boton, exact: true }).click();
}

test("ESCRITORIO: en la ficha se agrega otro niño (formulario corto), se corrige y se quita con confirmación; sin fecha ni edad no deja guardar", async ({ page }) => {
  const f = await leadDelBot("Familia Tres", "Camila");
  await page.goto(`/leads/${f.leadId}`);
  const ninos = page.getByTestId("ninos");
  await expect(page.getByRole("heading", { name: "Niños" })).toBeVisible();
  await expect(ninos).toContainText("Camila");
  await expect(ninos).toContainText("Por inscribir");
  await capturaV1(page, "v3-01-ficha-antes-escritorio");

  await page.getByRole("button", { name: "Agregar otro niño" }).click();
  const dialogo = page.getByRole("dialog", { name: "Agregar otro niño" });
  await expect(dialogo.getByLabel(/^Nombre/)).toBeFocused();
  await expect(dialogo.getByLabel("Disciplina de interés")).toHaveCount(0); // una sola disciplina: no se pregunta
  await expect(dialogo.getByRole("button", { name: "Guardar", exact: true })).toBeDisabled();
  await dialogo.getByLabel(/^Nombre/).fill("Mateo");
  await expect(dialogo.getByText("Escribe la fecha de nacimiento o, si no la saben, la edad")).toBeVisible();
  await dialogo.getByLabel("Edad (si no saben la fecha)").fill("abc");
  await expect(dialogo.getByRole("button", { name: "Guardar", exact: true })).toBeDisabled();
  await dialogo.getByLabel("Edad (si no saben la fecha)").fill("");
  await dialogo.getByLabel("Apellidos (opcional)").fill("Ruiz");
  await dialogo.getByLabel("Fecha de nacimiento").fill(nacidoHaceAnios(6));
  await capturaV1(page, "v3-02-agregar-nino-escritorio");
  await dialogo.getByRole("button", { name: "Guardar y agregar otro" }).click();
  // El formulario sigue abierto y limpio para el siguiente; el que se guardó ya está en la ficha.
  await expect(dialogo.getByText("Listo, ya está en la ficha")).toBeVisible();
  await expect(dialogo.getByLabel(/^Nombre/)).toHaveValue("");
  await agregarNino(page, { nombre: "Temporal", fecha: nacidoHaceAnios(4) });
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(ninos).toContainText("Mateo Ruiz");
  await expect(ninos).toContainText("6 años");
  await expect(ninos).toContainText("Temporal");

  // Quitar con confirmación: «No quitar» lo deja; «Sí, quitar» lo saca de la ficha (baja lógica).
  await page.getByRole("button", { name: "Quitar a Temporal" }).click();
  const confirmacion = page.getByRole("dialog", { name: "Quitar a Temporal" });
  await confirmacion.getByRole("button", { name: "No quitar" }).click();
  await expect(ninos).toContainText("Temporal");
  await page.getByRole("button", { name: "Quitar a Temporal" }).click();
  await page.getByRole("dialog", { name: "Quitar a Temporal" }).getByRole("button", { name: "Sí, quitar" }).click();
  await expect(ninos).not.toContainText("Temporal");

  // Corregir a la que trajo el bot: sus apellidos y su fecha de nacimiento (así la inscripción no los vuelve a pedir).
  await page.getByRole("button", { name: "Corregir los datos de Camila" }).click();
  const corregir = page.getByRole("dialog", { name: "Corregir a Camila" });
  await corregir.getByLabel("Apellidos (opcional)").fill("Ruiz");
  await corregir.getByLabel("Fecha de nacimiento").fill(nacidoHaceAnios(8));
  await corregir.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(ninos).toContainText("Camila Ruiz");
  await expect(ninos).toContainText("8 años");
  await capturaV1(page, "v3-03-ficha-despues-escritorio");

  const lista = await json<{ datos: { nombre: string; origen: string; fecha_nacimiento: string | null }[] }>(asesor, `/api/leads/${f.leadId}/prospectos`);
  expect(lista.datos.map((x) => [x.nombre, x.origen])).toEqual([["Camila", "asesor"], ["Mateo", "asesor"]]);
  // Lo que el asesor escribe no deja datos identificables en el registro de cambios.
  const registro = await prisma.registro_cambio.findMany({ where: { organizacion_id: org, entidad_tipo: "prospecto" } });
  expect(JSON.stringify(registro.map((r) => [r.antes, r.despues]))).not.toMatch(/Mateo|Camila|Ruiz/);
});

test("COTIZAR a cada niño por separado: «Cotizar» abre el formulario con ese niño, los hermanos sugeridos y el precio con la promoción por hermanos", async ({ page }) => {
  const f = await leadDelBot("Familia Cotiza", "Primera");
  await asesor.post(`/api/leads/${f.leadId}/prospectos`, { data: { nombre: "Segundo", fecha_nacimiento: nacidoHaceAnios(6) } });
  await page.goto(`/leads/${f.leadId}`);
  await page.getByRole("button", { name: "Cotizar a Segundo" }).click();
  const formulario = page.getByTestId("cotizar-a-mano");
  await expect(formulario.getByLabel("Niño")).toContainText("Segundo");
  await formulario.getByLabel("Programa").selectOption({ label: "Programa V3 · $800.00 al mes" });
  await expect(formulario.getByLabel("Hermanos ya inscritos (opcional)")).toHaveValue("1");
  await expect(page.getByTestId("precio-con-promociones")).toContainText("mensualidad $720.00");
  await formulario.getByLabel("Niño").selectOption({ label: "Primera (8 años)" });
  await expect(formulario.getByLabel("Hermanos ya inscritos (opcional)")).toHaveValue("0");
  await formulario.getByLabel("Programa").selectOption({ label: "Programa V3 · $800.00 al mes" });
  await expect(page.getByTestId("precio-con-promociones")).toContainText("mensualidad $800.00");
  await page.getByRole("button", { name: "Guardar cotización" }).click();
  await expect(page.locator("[data-prueba^='cotizacion-']").first()).toContainText("Programa V3 · Primera");
});

/** Recorre el asistente con una familia de dos niños: ya tienen apellidos y fecha; solo se pregunta el parentesco del adulto, una vez, y los grupos. */
async function inscribirALosDos(page: Page, f: { leadId: string; prospectoId: string }, segundo: { id: string; nombre: string }, o: { capturas: "escritorio" | "celular" }): Promise<string> {
  await page.goto(`/leads/${f.leadId}/convertir`);
  await expect(page.getByTestId("marcar-ninos")).toContainText("Se inscriben todos juntos");
  await expect(page.getByTestId(`marcar-${f.prospectoId}`)).toBeChecked();
  await expect(page.getByTestId(`marcar-${segundo.id}`)).toBeChecked();
  // Paso 1: el adulto se pregunta UNA vez.
  await expect(page.getByLabel(/^Parentesco con el alumno/)).toHaveCount(1);
  await page.getByLabel(/^Parentesco con el alumno/).fill("madre");
  await page.getByRole("button", { name: "Siguiente" }).click();
  // Paso 2: nombre, apellidos y fecha de los dos ya los escribió el asesor en la ficha: se ven, no se piden.
  await expect(page.getByTestId(`alumno-${f.prospectoId}`).getByTestId("dato-capturado")).toHaveCount(3);
  await expect(page.getByTestId(`alumno-${segundo.id}`).getByTestId("dato-capturado")).toHaveCount(3);
  await expect(page.locator("main input:not([type=checkbox]):not([type=radio])")).toHaveCount(0);
  await page.getByRole("button", { name: "Siguiente" }).click();
  // Paso 3: un grupo para cada uno.
  await page.getByTestId(`grupo-${f.prospectoId}`).getByRole("radio", { name: /Grupo V3 A/ }).check();
  await page.getByTestId(`grupo-${segundo.id}`).getByRole("radio", { name: /Grupo V3 B/ }).check();
  await page.getByRole("button", { name: "Siguiente" }).click();
  // Paso 4: el primero paga completo y el segundo ya se cotiza con la promoción por hermanos: es lo que se cobra.
  await expect(page.getByTestId(`precio-${f.prospectoId}`)).toContainText("Mensualidad$800.00");
  await expect(page.getByTestId(`precio-${segundo.id}`)).toContainText("Mensualidad$800.00 → $720.00");
  await expect(page.getByTestId(`precio-${segundo.id}`)).toContainText("Hermanos V3");
  await expect(page.getByTestId(`hermanos-${segundo.id}`)).toContainText("1 hermano ya inscrito");
  await capturaV1(page, `v3-05-precio-hermanos-${o.capturas}`);
  await page.getByRole("button", { name: "Siguiente" }).click();
  // Paso 5: el primero ya aceptó el reglamento; el segundo lo acepta como su hermano con un clic.
  await expect(page.getByTestId(`reglamento-${f.prospectoId}`)).toContainText("La familia ya aceptó el reglamento vigente");
  await expect(page.getByTestId(`reglamento-${segundo.id}`)).toContainText("Falta que la familia acepte el reglamento vigente");
  await page.getByTestId(`reglamento-del-hermano-${segundo.id}`).getByRole("button", { name: /Aceptan lo mismo que por/ }).click();
  await expect(page.getByTestId(`reglamento-${segundo.id}`)).toContainText("La familia ya aceptó el reglamento vigente");
  await page.getByRole("button", { name: "Revisar y confirmar" }).click();
  await expect(page.getByTestId("lo-que-falta")).toHaveCount(0);
  await expect(page.getByTestId(`resumen-${segundo.id}`)).toContainText("mensualidad $720.00");
  await capturaV1(page, `v3-06-confirmar-hermanos-${o.capturas}`);
  // Una sola operación; un doble clic no inscribe dos veces.
  await page.getByRole("button", { name: "Convertir e inscribir" }).dblclick();
  await expect(page.getByTestId("conversion-lista")).toBeVisible();
  await expect(page.getByTestId(`resultado-${f.prospectoId}`)).toContainText("Alumno creado · inscrito");
  await expect(page.getByTestId(`resultado-${segundo.id}`)).toContainText("Alumno creado · inscrito");
  await expect(page.getByTestId(`resultado-${segundo.id}`)).toContainText("mensualidad $720.00");
  await expect(page.getByTestId(`resultado-${segundo.id}`)).toContainText("Hermanos V3");
  await capturaV1(page, `v3-07-inscritos-${o.capturas}`);
  const lead = await json<{ tutor_id: string }>(admin, `/api/leads/${f.leadId}`);
  return lead.tutor_id;
}

test("ESCRITORIO: convertir a los dos hermanos en una operación — promoción por hermanos a la segunda, un solo adulto y el saldo con los cargos de los dos hijos", async ({ page, browser, baseURL }) => {
  const f = await leadDelBot("Familia Cuatro", "Primera");
  await asesor.patch(`/api/leads/${f.leadId}/prospectos/${f.prospectoId}`, { data: { apellidos: "Soto Pérez", fecha_nacimiento: nacidoHaceAnios(8) } });
  const nuevo = await (await asesor.post(`/api/leads/${f.leadId}/prospectos`, { data: { nombre: "Segundo", apellidos: "Soto Pérez", fecha_nacimiento: nacidoHaceAnios(6) } })).json();
  await page.goto(`/leads/${f.leadId}`);
  await expect(page.getByRole("link", { name: "Inscribir a los niños" })).toBeVisible();
  const tutorId = await inscribirALosDos(page, f, { id: nuevo.id, nombre: "Segundo" }, { capturas: "escritorio" });
  const inscripciones = await json<{ datos: { alumno: string; precio_mensualidad_aplicado: string; descuento_mensualidad_aplicado: string }[] }>(admin, `/api/inscripciones?limite=100`);
  const suyas = inscripciones.datos.filter((i) => i.alumno.endsWith("Soto Pérez"));
  expect(suyas.map((i) => [i.alumno, i.descuento_mensualidad_aplicado]).sort()).toEqual([["Primera Soto Pérez", "0.00"], ["Segundo Soto Pérez", "80.00"]]);
  // El saldo de la familia (lo ve recepción): 500 + 800 + 500 + 720.
  const recepcion = await contextoNuevo(browser, baseURL ?? "", "escritorio", "recepcion");
  try {
    await recepcion.page.goto(`/cuenta/${tutorId}`);
    await expect(recepcion.page.getByTestId("saldo")).toContainText("$2,520.00");
    await capturaV1(recepcion.page, "v3-08-saldo-familia-escritorio");
  } finally {
    await recepcion.cerrar();
  }
});

test("CELULAR (390 px): agregar otro niño en la ficha y convertir a los dos hermanos", async ({ browser, baseURL }) => {
  const m = await contextoNuevo(browser, baseURL ?? "", "celular", "asesor");
  try {
    const page = m.page;
    const f = await leadDelBot("Familia Cinco", "Primera");
    await asesor.patch(`/api/leads/${f.leadId}/prospectos/${f.prospectoId}`, { data: { apellidos: "Mena Díaz", fecha_nacimiento: nacidoHaceAnios(8) } });
    await page.goto(`/leads/${f.leadId}`);
    await page.getByRole("button", { name: "Agregar otro niño" }).click();
    const dialogo = page.getByRole("dialog", { name: "Agregar otro niño" });
    await expect(dialogo.getByLabel(/^Nombre/)).toBeVisible();
    // Todo cabe en 390 px sin desplazarse de lado.
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await dialogo.getByLabel(/^Nombre/).fill("Segundo");
    await dialogo.getByLabel("Apellidos (opcional)").fill("Mena Díaz");
    await dialogo.getByLabel("Fecha de nacimiento").fill(nacidoHaceAnios(6));
    await capturaV1(page, "v3-04-agregar-nino-celular");
    await dialogo.getByRole("button", { name: "Guardar", exact: true }).click();
    await expect(page.getByTestId("ninos")).toContainText("Segundo Mena Díaz");
    const lista = await json<{ datos: { id: string; nombre: string }[] }>(asesor, `/api/leads/${f.leadId}/prospectos`);
    const segundo = lista.datos.find((x) => x.nombre === "Segundo")!;
    await inscribirALosDos(page, f, segundo, { capturas: "celular" });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  } finally {
    await m.cerrar();
  }
});

test("SIN LUGAR para uno: la operación completa se rechaza con un mensaje claro y sin nada a medias; se deja fuera a ese niño y se inscribe al otro", async ({ page }) => {
  const f = await leadDelBot("Familia Seis", "Primera");
  await asesor.patch(`/api/leads/${f.leadId}/prospectos/${f.prospectoId}`, { data: { apellidos: "Luna Vega", fecha_nacimiento: nacidoHaceAnios(8) } });
  const segundo = await (await asesor.post(`/api/leads/${f.leadId}/prospectos`, { data: { nombre: "Segundo", apellidos: "Luna Vega", fecha_nacimiento: nacidoHaceAnios(6) } })).json();
  const tercero = await (await asesor.post(`/api/leads/${f.leadId}/prospectos/${f.prospectoId}/aceptaciones-del-hermano`, { data: { desde_prospecto_id: f.prospectoId } })).status();
  expect(tercero).toBe(400); // no se extiende a sí mismo
  expect((await asesor.post(`/api/leads/${f.leadId}/prospectos/${segundo.id}/aceptaciones-del-hermano`, { data: { desde_prospecto_id: f.prospectoId } })).status()).toBe(201);
  await page.goto(`/leads/${f.leadId}/convertir`);
  await page.getByLabel(/^Parentesco con el alumno/).fill("madre");
  await page.getByRole("button", { name: "Siguiente" }).click();
  await page.getByRole("button", { name: "Siguiente" }).click();
  // El grupo C tiene UN lugar y los dos lo eligen: la pantalla lo permite (hoy hay un lugar) y el servidor rechaza al segundo.
  await page.getByTestId(`grupo-${f.prospectoId}`).getByRole("radio", { name: /Grupo V3 C/ }).check();
  await page.getByTestId(`grupo-${segundo.id}`).getByRole("radio", { name: /Grupo V3 C/ }).check();
  await page.getByRole("button", { name: "Siguiente" }).click();
  await page.getByRole("button", { name: "Siguiente" }).click();
  await page.getByRole("button", { name: "Revisar y confirmar" }).click();
  await page.getByRole("button", { name: "Convertir e inscribir" }).click();
  const salida = page.getByTestId("salida-grupo-lleno");
  await expect(salida).toContainText("No se inscribió a nadie");
  await expect(salida).toContainText("Segundo se quedó sin lugar");
  await expect(salida.getByRole("button", { name: "Dejar fuera a Segundo" })).toBeVisible();
  await expect(salida.getByRole("button", { name: "Ponerlo en lista de espera" })).toBeVisible();
  await capturaV1(page, "v3-09-sin-lugar-escritorio");
  // Nada a medias en el servidor.
  expect((await json<{ datos: { alumno_id: string | null }[] }>(admin, `/api/leads/${f.leadId}/prospectos`)).datos.every((p) => p.alumno_id === null)).toBe(true);
  expect((await json<{ datos: unknown[] }>(admin, `/api/inscripciones?grupo_id=${grupos.c}`)).datos).toHaveLength(0);
  // Se deja fuera a Segundo y se inscribe a la primera.
  await salida.getByRole("button", { name: "Dejar fuera a Segundo" }).click();
  await expect(page.getByTestId(`marcar-${segundo.id}`)).not.toBeChecked();
  await expect(page.getByTestId("salida-grupo-lleno")).toHaveCount(0);
  await page.getByRole("button", { name: "Convertir e inscribir" }).click();
  await expect(page.getByTestId("conversion-lista")).toContainText("Primera");
  const ficha = await json<{ prospectos: { nombre: string; alumno_id: string | null }[] }>(admin, `/api/leads/${f.leadId}`);
  expect(ficha.prospectos.map((p) => [p.nombre, p.alumno_id !== null])).toEqual([["Primera", true], ["Segundo", false]]);
  // Segundo sigue en la ficha, por inscribir; el botón para inscribirlo sigue disponible aunque el lead ya esté inscrito.
  await page.goto(`/leads/${f.leadId}`);
  await expect(page.getByTestId(`prospecto-${segundo.id}`)).toContainText("Por inscribir");
  await expect(page.getByRole("link", { name: "Convertir e inscribir" })).toBeVisible();
});

test("COTIZADOR APAGADO: la ficha no enseña nada de cotización (ni «Cotizar» ni el programa sugerido), pero agregar niños sigue funcionando", async ({ page }) => {
  const f = await leadDelBot("Familia Siete", "Primera");
  await prisma.prospecto.update({ where: { id: f.prospectoId }, data: { programa_sugerido_id: creados.programa } });
  await page.goto(`/leads/${f.leadId}`);
  await expect(page.getByTestId(`programa-sugerido-${f.prospectoId}`)).toContainText("Programa sugerido: Programa V3");
  await expect(page.getByRole("button", { name: "Cotizar a Primera" })).toBeVisible();
  const antes = (await json<{ modulos: { id: string; encendido: boolean }[] }>(admin, "/api/modulos")).modulos;
  const apagar = { inscripcion: false, operacion: false, finanzas: false, tableros: false, clase_muestra: false, cotizador: false };
  try {
    // Sin cascada: se apagan primero los que dependen del cotizador.
    for (const m of ["tableros", "operacion", "finanzas", "inscripcion", "clase_muestra", "cotizador"] as const) expect((await admin.put("/api/modulos", { data: { [m]: apagar[m] } })).status()).toBe(200);
    await page.goto(`/leads/${f.leadId}`);
    await expect(page.getByRole("heading", { name: "Niños" })).toBeVisible();
    await expect(page.getByTestId(`programa-sugerido-${f.prospectoId}`)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Cotizar a Primera" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Cotizaciones" })).toHaveCount(0);
    await page.getByRole("button", { name: "Agregar otro niño" }).click();
    await agregarNino(page, { nombre: "Sin cotizador", fecha: nacidoHaceAnios(5) });
    await expect(page.getByTestId("ninos")).toContainText("Sin cotizador");
    await capturaV1(page, "v3-10-ficha-sin-cotizador-escritorio");
  } finally {
    // Se dejan los módulos como estaban (en el orden inverso: primero lo que otros necesitan).
    for (const m of ["cotizador", "clase_muestra", "inscripcion", "finanzas", "operacion", "tableros"] as const) {
      const era = antes.find((x) => x.id === m)?.encendido ?? true;
      await admin.put("/api/modulos", { data: { [m]: era } });
    }
  }
});
