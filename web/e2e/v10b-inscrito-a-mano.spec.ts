// V10b: «Marcar como inscrito» en navegador real. Con la inscripción APAGADA el asesor deja anotado a mano que una familia ya se inscribió (nota obligatoria, confirmación y resultado);
// con la inscripción ENCENDIDA la acción no existe y, si alguien lo intenta por la API, el mensaje dice qué hacer. Escritorio (1366×768) y celular (390 px), con capturas en
// `docs/capturas/v1/v10b-*.png`. Cada escuela es una organización propia del mundo de pruebas, así que no toca a las demás.

import { request, type APIRequestContext, type BrowserContext, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { expect, mundo, test, VISTA_CELULAR, VISTA_ESCRITORIO } from "./fixtura.ts";
import { RAIZ } from "./mundo.ts";
import { CONTRASENA_DE_PRUEBA, sembrarUsuario } from "../../src/testutil/api.ts";
import { fijarConfiguracion, sembrarEmbudo, sembrarFamilia, sembrarOrganizacion, type OrganizacionDePrueba } from "../../src/testutil/semilla.ts";
import { crearPrismaDePruebas, type PrismaPruebas } from "../../src/testutil/prisma-pruebas.ts";

test.describe.configure({ mode: "serial" });
test.setTimeout(45_000);

const CARPETA = resolve(RAIZ, "docs/capturas/v1");
const SOLO_CAPTACION = { modulo_cotizador: false, modulo_clase_muestra: false, modulo_inscripcion: false, modulo_operacion: false, modulo_finanzas: false, modulo_tableros: false };
const TODO_ENCENDIDO = { modulo_cotizador: true, modulo_clase_muestra: true, modulo_inscripcion: true, modulo_operacion: true, modulo_finanzas: true, modulo_tableros: true };
const NOTA = "Se inscribió en persona con la maestra y pagó en efectivo";

let prisma: PrismaPruebas;
let org: OrganizacionDePrueba;
let etapas: Record<string, string>;
let asesor: { correo: string; id: string };
let administrador: { correo: string; id: string };

async function foto(page: Page, nombre: string, vista: "escritorio" | "celular", completa = false): Promise<void> {
  mkdirSync(CARPETA, { recursive: true });
  await page.waitForLoadState("networkidle", { timeout: 4000 }).catch(() => undefined);
  await page.screenshot({ path: resolve(CARPETA, `v10b-${nombre}-${vista}.png`), animations: "disabled", fullPage: completa });
}

/** Una sesión nueva de ese usuario en la vista pedida. */
async function abrir(browser: import("@playwright/test").Browser, correo: string, vista: typeof VISTA_ESCRITORIO | typeof VISTA_CELULAR): Promise<{ page: Page; context: BrowserContext; api: APIRequestContext }> {
  const api = await request.newContext({ baseURL: mundo.base, extraHTTPHeaders: { "x-requested-with": "prueba" } });
  expect((await api.post("/api/sesion", { data: { organizacion: org.slug, correo, contrasena: CONTRASENA_DE_PRUEBA } })).status()).toBe(201);
  const context = await browser.newContext({ baseURL: mundo.base, locale: "es-MX", timezoneId: "America/Mexico_City", viewport: vista, storageState: await api.storageState(), extraHTTPHeaders: { "x-requested-with": "prueba" } });
  return { page: await context.newPage(), context, api };
}

async function familia(nombre: string, etapa = "negociacion"): Promise<string> {
  const f = await sembrarFamilia(prisma, org, { sucursalId: org.sucursales[0]!.id, nombre: `Niño de ${nombre}`, edad: 7, etapaId: etapas[etapa]! });
  await prisma.lead.update({ where: { id: f.leadId }, data: { nombre_contacto: nombre } });
  return f.leadId;
}

test.beforeAll(async () => {
  prisma = crearPrismaDePruebas(process.env["DATABASE_URL"], 4);
  org = await sembrarOrganizacion(prisma, "Escuela V10b");
  const ids = await sembrarEmbudo(prisma, org);
  etapas = ids;
  await fijarConfiguracion(prisma, org.organizacionId, SOLO_CAPTACION);
  const a = await sembrarUsuario(prisma, org.organizacionId, { rol: "asesor", contrasena: CONTRASENA_DE_PRUEBA, sucursales: [org.sucursales[0]!.id], nombre: "Alba Asesora" });
  const d = await sembrarUsuario(prisma, org.organizacionId, { rol: "administrador", contrasena: CONTRASENA_DE_PRUEBA, nombre: "Daniel Administrador" });
  asesor = { correo: a.correo, id: a.id };
  administrador = { correo: d.correo, id: d.id };
});
test.afterAll(async () => {
  await prisma.organizacion.update({ where: { id: org.organizacionId }, data: { eliminado_en: new Date() } });
  await prisma.$disconnect();
});

for (const vista of ["escritorio", "celular"] as const) {
  const tamano = vista === "escritorio" ? VISTA_ESCRITORIO : VISTA_CELULAR;

  test(`${vista}: desde la ficha — nota obligatoria, confirmación, resultado y etiqueta «Inscrito a mano por …» en el historial`, async ({ browser }) => {
    await prisma.configuracion_organizacion.updateMany({ where: { organizacion_id: org.organizacionId }, data: SOLO_CAPTACION });
    const leadId = await familia(`Familia Ficha ${vista}`);
    const { page, context, api } = await abrir(browser, asesor.correo, tamano);
    try {
      await page.goto(`/leads/${leadId}`);
      await expect(page.getByRole("heading", { name: `Familia Ficha ${vista}` })).toBeVisible();
      const accion = page.getByTestId("marcar-como-inscrito");
      await expect(accion).toHaveText("Marcar como inscrito");
      await foto(page, "ficha-con-la-accion", vista);
      await accion.click();
      const d = page.getByRole("dialog");
      await expect(d).toContainText("La inscripción todavía no está activada en tu escuela");
      await expect(d).toContainText("¿Cómo se inscribió? ¿Pagó? ¿En qué grupo?");
      await foto(page, "nota", vista);
      // La nota es obligatoria: vacía, de espacios o muy corta no pasa y dice qué hacer.
      await d.getByTestId("marcar-inscrito-continuar").click();
      await expect(d.getByText("Escribe cómo se inscribió")).toBeVisible();
      await d.getByTestId("marcar-inscrito-nota").fill("          ");
      await d.getByTestId("marcar-inscrito-continuar").click();
      await expect(d.getByText("Escribe cómo se inscribió")).toBeVisible();
      await d.getByTestId("marcar-inscrito-nota").fill("pagó");
      await d.getByTestId("marcar-inscrito-continuar").click();
      await expect(d.getByText("la nota necesita al menos 10 caracteres")).toBeVisible();
      await foto(page, "nota-corta", vista);
      await d.getByTestId("marcar-inscrito-nota").fill(NOTA);
      await d.getByTestId("marcar-inscrito-continuar").click();
      // Confirmar.
      const confirmacion = d.getByTestId("marcar-inscrito-confirmacion");
      await expect(confirmacion).toContainText(NOTA);
      await expect(confirmacion).toContainText("Queda guardado que lo hiciste tú");
      await foto(page, "confirmar", vista);
      // Volver conserva la nota.
      await d.getByRole("button", { name: "Volver" }).click();
      await expect(d.getByTestId("marcar-inscrito-nota")).toHaveValue(NOTA);
      await d.getByTestId("marcar-inscrito-continuar").click();
      await d.getByTestId("marcar-inscrito-confirmar").click();
      // Resultado.
      await expect(d.getByTestId("marcar-inscrito-listo")).toContainText(`Familia Ficha ${vista} quedó como inscrito`);
      await foto(page, "listo", vista);
      await d.getByRole("button", { name: "Cerrar" }).click();
      // La ficha ya lo dice: etapa, etiqueta, historial con quién y cuándo, y sin la acción.
      await expect(page.getByTestId("etapa-actual")).toContainText("Etapa F");
      await expect(page.getByTestId("etapa-actual")).toContainText("Inscrito a mano");
      await expect(page.getByTestId("marcar-como-inscrito")).toHaveCount(0);
      const marca = page.getByTestId("cambio-a-mano");
      await expect(marca).toContainText("Inscrito a mano por Alba Asesora el ");
      await expect(marca).toContainText(`Nota: ${NOTA}`);
      await foto(page, "ficha-historial", vista, true);
      // Quedó en el servidor, con la marca y quién.
      const h = await (await api.get(`/api/leads/${leadId}/historial`)).json() as { cambios: { a_mano: boolean; usuario: { id: string } | null; nota: string }[] };
      expect(h.cambios).toHaveLength(1);
      expect([h.cambios[0]!.a_mano, h.cambios[0]!.usuario?.id, h.cambios[0]!.nota]).toEqual([true, asesor.id, NOTA]);
    } finally {
      await context.close();
      await api.dispose();
    }
  });
}

test("escritorio: desde el embudo — la tarjeta ofrece «Marcar como inscrito», el lead pasa a la columna de inscrito y los ya inscritos o perdidos no la ofrecen", async ({ browser }) => {
  await prisma.configuracion_organizacion.updateMany({ where: { organizacion_id: org.organizacionId }, data: SOLO_CAPTACION });
  const abierto = await familia("Familia Embudo");
  const inscrito = await familia("Familia Ya Inscrita", "inscrito");
  const perdido = await familia("Familia Perdida", "perdido");
  const { page, context, api } = await abrir(browser, asesor.correo, VISTA_ESCRITORIO);
  try {
    await page.goto("/embudo");
    const tarjeta = page.getByTestId(`lead-${abierto}`);
    await expect(tarjeta.getByRole("button", { name: "Marcar como inscrito" })).toBeVisible();
    await expect(page.getByTestId(`lead-${inscrito}`).getByRole("button", { name: "Marcar como inscrito" })).toHaveCount(0);
    await expect(page.getByTestId(`lead-${perdido}`).getByRole("button", { name: "Marcar como inscrito" })).toHaveCount(0);
    await foto(page, "embudo-con-la-accion", "escritorio");
    await tarjeta.getByRole("button", { name: "Marcar como inscrito" }).click();
    const d = page.getByRole("dialog");
    await d.getByTestId("marcar-inscrito-nota").fill(NOTA);
    await d.getByTestId("marcar-inscrito-continuar").click();
    await d.getByTestId("marcar-inscrito-confirmar").click();
    await expect(d.getByTestId("marcar-inscrito-listo")).toBeVisible();
    await d.getByRole("button", { name: "Cerrar" }).click();
    await expect(page.getByTestId(`columna-${etapas["inscrito"]}`).getByTestId(`lead-${abierto}`)).toBeVisible();
    await foto(page, "embudo-despues", "escritorio");
  } finally {
    await context.close();
    await api.dispose();
  }
});

test("escritorio: «Mover de etapa» no ofrece inscrito (apunta a «Marcar como inscrito») y la lista también tiene la acción", async ({ browser }) => {
  await prisma.configuracion_organizacion.updateMany({ where: { organizacion_id: org.organizacionId }, data: SOLO_CAPTACION });
  const leadId = await familia("Familia Lista");
  const { page, context, api } = await abrir(browser, asesor.correo, VISTA_ESCRITORIO);
  try {
    await page.goto(`/leads/${leadId}`);
    await page.getByRole("button", { name: "Mover de etapa" }).click();
    const opcion = page.getByRole("dialog").getByRole("option", { name: /^Etapa F/ });
    await expect(opcion).toHaveText("Etapa F (usa «Marcar como inscrito»)");
    await expect(opcion).toBeDisabled();
    await page.keyboard.press("Escape");
    await page.goto("/embudo");
    await page.getByRole("tab", { name: "Lista" }).click();
    await expect(page.getByTestId(`lead-${leadId}`).getByRole("button", { name: "Marcar como inscrito" })).toBeVisible();
    await foto(page, "embudo-lista", "escritorio");
  } finally {
    await context.close();
    await api.dispose();
  }
});

test("con la inscripción encendida la acción no existe, el mover de etapa dice cómo se llega y la API contesta qué hacer", async ({ browser }) => {
  await prisma.configuracion_organizacion.updateMany({ where: { organizacion_id: org.organizacionId }, data: TODO_ENCENDIDO });
  const leadId = await familia("Familia Con Inscripción");
  const { page, context, api } = await abrir(browser, asesor.correo, VISTA_ESCRITORIO);
  try {
    await page.goto("/embudo");
    await expect(page.getByTestId(`lead-${leadId}`).getByRole("button", { name: "Mover de etapa" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Marcar como inscrito" })).toHaveCount(0);
    await foto(page, "embudo-con-inscripcion", "escritorio");
    await page.goto(`/leads/${leadId}`);
    await expect(page.getByTestId("marcar-como-inscrito")).toHaveCount(0);
    await page.getByRole("button", { name: "Mover de etapa" }).click();
    const opcion = page.getByRole("dialog").getByRole("option", { name: /^Etapa F/ });
    await expect(opcion).toHaveText("Etapa F (se llega inscribiendo)");
    await expect(opcion).toBeDisabled();
    await page.keyboard.press("Escape");
    // Aunque se intente por la dirección o por la API con todo bien armado, el servidor dice qué hacer y no cambia nada.
    const r = await api.patch(`/api/leads/${leadId}/etapa`, { data: { etapa_id: etapas["inscrito"], nota: NOTA } });
    expect(r.status()).toBe(409);
    expect(((await r.json()) as { error: { mensaje: string } }).error.mensaje).toBe("Para marcar a la familia como inscrita, inscríbela desde la ficha");
    expect((await (await api.get(`/api/leads/${leadId}`)).json() as { etapa: { id: string } }).etapa.id).toBe(etapas["negociacion"]);
  } finally {
    await context.close();
    await api.dispose();
  }
});

test("si la familia cambió mientras se veía la pantalla, se avisa y no se duplica nada", async ({ browser }) => {
  await prisma.configuracion_organizacion.updateMany({ where: { organizacion_id: org.organizacionId }, data: SOLO_CAPTACION });
  const leadId = await familia("Familia Carrera");
  const { page, context, api } = await abrir(browser, asesor.correo, VISTA_ESCRITORIO);
  const otro = await abrir(browser, administrador.correo, VISTA_ESCRITORIO);
  try {
    await page.goto(`/leads/${leadId}`);
    await page.getByTestId("marcar-como-inscrito").click();
    const d = page.getByRole("dialog");
    await d.getByTestId("marcar-inscrito-nota").fill(NOTA);
    await d.getByTestId("marcar-inscrito-continuar").click();
    // Mientras, el administrador la marca por su lado.
    expect((await otro.api.patch(`/api/leads/${leadId}/etapa`, { data: { etapa_id: etapas["inscrito"], nota: "La marcó el administrador en recepción" } })).status()).toBe(200);
    await d.getByTestId("marcar-inscrito-confirmar").click();
    await expect(d.getByText("La familia cambió mientras lo veías")).toBeVisible();
    await foto(page, "conflicto", "escritorio");
    await d.getByRole("button", { name: "Volver" }).click();
    await page.keyboard.press("Escape");
    const h = (await (await api.get(`/api/leads/${leadId}/historial`)).json()) as { cambios: { a_mano: boolean }[] };
    expect(h.cambios.filter((c) => c.a_mano)).toHaveLength(1);
  } finally {
    await context.close();
    await api.dispose();
    await otro.context.close();
    await otro.api.dispose();
  }
});

test("el administrador ve el desglose «a mano» en el costo por campaña y en la conversión de clases muestra", async ({ browser }) => {
  await prisma.configuracion_organizacion.updateMany({ where: { organizacion_id: org.organizacionId }, data: TODO_ENCENDIDO });
  const campana = await prisma.campana.create({ data: { organizacion_id: org.organizacionId, nombre: "Campaña de la escuela", origen: "facebook" } });
  const leadId = await familia("Familia Reporte");
  await prisma.lead.update({ where: { id: leadId }, data: { campana_id: campana.id } });
  await prisma.gasto_campana.create({ data: { organizacion_id: org.organizacionId, campana_id: campana.id, fecha: new Date(), monto: "900.00" } });
  const { page, context, api } = await abrir(browser, administrador.correo, VISTA_ESCRITORIO);
  try {
    // Con la inscripción encendida no se marca (se inscribe); para el desglose se apaga un momento, se marca y se vuelve a encender, como haría la escuela al activar la inscripción.
    await prisma.configuracion_organizacion.updateMany({ where: { organizacion_id: org.organizacionId }, data: SOLO_CAPTACION });
    expect((await api.patch(`/api/leads/${leadId}/etapa`, { data: { etapa_id: etapas["inscrito"], nota: NOTA } })).status()).toBe(200);
    await prisma.configuracion_organizacion.updateMany({ where: { organizacion_id: org.organizacionId }, data: TODO_ENCENDIDO });
    await page.goto("/tableros?vista=costo");
    await expect(page.getByTestId("ind-costo-alumno")).toContainText("$900.00");
    await expect(page.getByTestId("ind-costo-alumno")).toContainText("1 inscrito a mano");
    await expect(page.getByTestId("nota-inscritos-a-mano")).toContainText("1 familia marcada a mano como inscrita");
    await foto(page, "tablero-costo", "escritorio", true);
  } finally {
    await context.close();
    await api.dispose();
  }
});
