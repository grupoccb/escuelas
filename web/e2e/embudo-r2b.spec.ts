// R2b (rediseño v2): la ficha lateral del embudo y sus diálogos — perdido (motivo con botones), recuperar (nota obligatoria), inscribir en 3 pasos (con el rechazo del servidor dentro del diálogo y lo que
// cae a «Abrir la inscripción completa») y agendar la clase muestra. Lo que se hace en pantalla se comprueba por la API.
// Datos: leads propios de esta prueba (sucursal norte); al terminar se dan de baja, con lo que crearon (soft delete, invariante 3), para no mover los conteos de las demás pruebas.

import type { APIRequestContext, Locator, Page } from "@playwright/test";
import { createHash } from "node:crypto";
import { apiComo, json } from "./ayudas.ts";
import { contextoNuevo, expect, mundo, test } from "./fixtura.ts";
import { crearPrismaDePruebas, type PrismaPruebas } from "../../src/testutil/prisma-pruebas.ts";

test.describe.configure({ mode: "serial" });
test.setTimeout(60_000);

let prisma: PrismaPruebas;
let admin: APIRequestContext;
const org = mundo.organizacion.id;
const etapa = (tipo: string): string => mundo.etapas[tipo] ?? "";
const NOMBRES = { nuevo: "Familia R2b Nueva", frio: "Familia R2b Fría", perdido: "Familia R2b Perdida", inscribir: "Familia R2b Inscribir", dos: "Familia R2b Dos Niños", revocable: "Familia R2b Revocable" } as const;
type Clave = keyof typeof NOMBRES;
const ids = {} as Record<Clave, string>;
const prospectos = {} as Record<Clave, string>;

const etapaDe = async (c: Clave): Promise<{ id: string; recuperaciones: number; motivo_perdida_id: string | null }> => {
  const l = await json<{ etapa: { id: string }; recuperaciones: number; motivo_perdida_id: string | null }>(admin, `/api/leads/${ids[c]}`);
  return { id: l.etapa.id, recuperaciones: l.recuperaciones, motivo_perdida_id: l.motivo_perdida_id };
};

async function crearLead(c: Clave, etapaId: string, niños: { nombre: string; edad: number }[]): Promise<void> {
  const n = Object.keys(ids).length;
  const lead = await prisma.lead.create({
    data: { organizacion_id: org, vertical_interes_id: mundo.verticalId, sucursal_interes_id: mundo.sucursales.norte.id, etapa_id: etapaId, nombre_contacto: NOMBRES[c], telefono: `+52559${String(8_300_000 + n * 23 + (Date.now() % 100_000)).padStart(7, "0")}`, ultima_interaccion_en: new Date() },
  });
  ids[c] = lead.id;
  for (const [i, nino] of niños.entries()) {
    const p = await prisma.prospecto.create({ data: { organizacion_id: org, lead_id: lead.id, vertical_interes_id: mundo.verticalId, nombre: nino.nombre, edad_declarada: nino.edad, origen: "asesor" } });
    if (i === 0) prospectos[c] = p.id;
  }
}

test.beforeAll(async () => {
  prisma = crearPrismaDePruebas(process.env["DATABASE_URL"], 4);
  admin = await apiComo("administrador");
  await crearLead("nuevo", etapa("nuevo"), [{ nombre: "Niña R2b Uno", edad: 6 }]);
  await crearLead("frio", etapa("contactado"), [{ nombre: "Niño R2b Frío", edad: 7 }]);
  await crearLead("perdido", etapa("perdido"), [{ nombre: "Niño R2b Perdido", edad: 7 }]);
  await prisma.lead.update({ where: { id: ids.perdido }, data: { motivo_perdida_id: mundo.asesor.motivos.precio } });
  // Un lead con la clase asistida y el reglamento ya aceptado: lo único que le falta son los apellidos del niño.
  await crearLead("inscribir", etapa("muestra_asistida"), [{ nombre: "Niño R2b Inscribir", edad: 8 }]);
  await aceptarReglamento("inscribir");
  await crearLead("dos", etapa("muestra_asistida"), [{ nombre: "Niña R2b Dos A", edad: 8 }, { nombre: "Niño R2b Dos B", edad: 6 }]);
  await crearLead("revocable", etapa("muestra_asistida"), [{ nombre: "Niño R2b Revocable", edad: 8 }]);
  await aceptarReglamento("revocable");
  await prisma.tarea_asesor.create({ data: { organizacion_id: org, lead_id: ids.frio, tipo: "lead_frio", descripcion: "Retomar a la familia R2b Fría por WhatsApp." } });
});
test.afterAll(async () => {
  // Se da de baja lo que se puede (soft delete): los leads que no llegaron a inscribirse, sus clases y su tarea. Un cargo no se borra ni de forma lógica (se cancela) y la familia
  // inscrita queda completa: el lead que sí se inscribió se queda como está, con su alumno, su inscripción y sus cargos.
  const ahora = new Date();
  const sinInscribir = Object.entries(ids).filter(([c]) => c !== "inscribir").map(([, id]) => id);
  await prisma.clase_muestra.updateMany({ where: { lead_id: { in: sinInscribir } }, data: { eliminado_en: ahora } });
  await prisma.tarea_asesor.updateMany({ where: { lead_id: { in: sinInscribir } }, data: { eliminado_en: ahora } });
  await prisma.lead.updateMany({ where: { id: { in: sinInscribir } }, data: { eliminado_en: ahora } });
  await prisma.$disconnect();
  await admin.dispose();
});

/** El reglamento ya aceptado por la familia de ese lead (como si lo hubiera firmado el maestro): el servidor deja de pedirlo. */
async function aceptarReglamento(c: Clave): Promise<void> {
  const doc = await prisma.documento_legal.findFirstOrThrow({ where: { organizacion_id: org, tipo: "reglamento" }, orderBy: { version: "desc" } });
  await prisma.aceptacion_legal.create({
    data: { organizacion_id: org, documento_id: doc.id, tipo: "reglamento", version_aceptada: doc.version, resultado: "aceptada", lead_id: ids[c], prospecto_id: prospectos[c], aceptante_nombre: "Rosa Prueba", canal: "presencial", aceptado_en: new Date(), texto_hash: createHash("sha256").update(doc.texto, "utf8").digest("hex") },
  });
}

/** La familia revoca el reglamento: una aceptación es de solo anexar, así que se agrega la fila de la revocación. */
async function revocarReglamento(c: Clave): Promise<void> {
  const previa = await prisma.aceptacion_legal.findFirstOrThrow({ where: { lead_id: ids[c], tipo: "reglamento" }, orderBy: { aceptado_en: "desc" } });
  await prisma.aceptacion_legal.create({
    data: { organizacion_id: org, documento_id: previa.documento_id, tipo: "reglamento", version_aceptada: previa.version_aceptada, resultado: "revocada", lead_id: ids[c], prospecto_id: prospectos[c], aceptante_nombre: "Rosa Prueba", canal: "presencial", aceptado_en: new Date(), texto_hash: previa.texto_hash },
  });
}

test.beforeEach(async () => {
  const ahora = new Date();
  await prisma.lead.update({ where: { id: ids.nuevo }, data: { etapa_id: etapa("nuevo"), motivo_perdida_id: null, recuperaciones: 0, ultima_interaccion_en: ahora } });
  await prisma.lead.update({ where: { id: ids.frio }, data: { etapa_id: etapa("contactado"), motivo_perdida_id: null, recuperaciones: 0, ultima_interaccion_en: new Date(ahora.getTime() - 10 * 86_400_000) } });
  await prisma.lead.update({ where: { id: ids.perdido }, data: { etapa_id: etapa("perdido"), motivo_perdida_id: mundo.asesor.motivos.precio, recuperaciones: 0, ultima_interaccion_en: ahora } });
  await prisma.clase_muestra.updateMany({ where: { lead_id: ids.nuevo }, data: { eliminado_en: ahora } });
});

const tarjeta = (page: Page, c: Clave): Locator => page.getByTestId(`lead-${ids[c]}`);
const ficha = (page: Page, c: Clave): Locator => page.getByRole("dialog", { name: `Ficha de ${NOMBRES[c]}` });
const columna = (page: Page, tipo: string): Locator => page.getByTestId(`columna-${etapa(tipo)}`);

/** Un clic en un hueco de la tarjeta (no en un botón ni en el enlace del nombre): abre la ficha lateral. */
async function clicEnLaTarjeta(page: Page, c: Clave): Promise<void> {
  await tarjeta(page, c).scrollIntoViewIfNeeded();
  const fila = (await tarjeta(page, c).locator(".lead-disciplina").boundingBox())!;
  await page.mouse.click(fila.x + fila.width - 14, fila.y + fila.height / 2);
}

/** Presiona la tarjeta, la lleva sobre la columna (si queda fuera de la ventana, el puntero espera cerca del borde del tablero hasta que el tablero se desplaza solo) y la suelta. */
async function arrastrar(page: Page, desde: Locator, hacia: Locator): Promise<void> {
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
  await page.mouse.up();
}

async function desplegarPerdidos(page: Page): Promise<void> {
  await page.getByRole("button", { name: /^Desplegar la columna Etapa G/ }).click();
}

test.describe("ficha lateral", () => {
  test("un clic abre la ficha (no navega): el foco entra al panel, trae lo real del lead; Esc la cierra y el foco vuelve a la tarjeta", async ({ browser, baseURL }) => {
    const { page, cerrar } = await contextoNuevo(browser, baseURL ?? mundo.base, "escritorio", "asesor");
    try {
      await page.goto("/embudo");
      await clicEnLaTarjeta(page, "nuevo");
      const f = ficha(page, "nuevo");
      await expect(f).toBeVisible();
      await expect(page).toHaveURL(/\/embudo$/);
      await expect(f).toBeFocused();
      await expect(f.getByRole("heading", { name: NOMBRES.nuevo })).toBeVisible();
      await expect(f).toContainText("Ficha del lead");
      await expect(f.locator(".etapa-pildora")).toHaveText("Primera");
      // Para quién son las clases, de dónde llegó (con la fuente en español) y la acción principal de su etapa.
      await expect(f.getByRole("heading", { name: "Para quién son las clases" })).toBeVisible();
      await expect(f).toContainText("Niña R2b Uno · 6 años");
      await expect(f.getByRole("heading", { name: "De dónde llegó" })).toBeVisible();
      await expect(f.locator(".ficha-origen")).toContainText("Fuente");
      await expect(f.locator(".ficha-origen")).toContainText("Sin campaña");
      await expect(f.locator(".ficha-origen")).toContainText("Norte");
      await expect(f.getByRole("button", { name: "Agendar clase muestra", exact: true })).toBeVisible();
      await expect(f.getByRole("button", { name: "Abrir conversación" })).toBeVisible();
      await expect(f.getByLabel("Mover de etapa")).toHaveValue(etapa("nuevo"));
      await expect(f.locator(".linea-tiempo, [data-prueba='ficha-historial']")).toHaveCount(0); // un lead sin cambios de etapa: el historial dice que no hay
      await expect(f).toContainText("Todavía no hay cambios de etapa registrados");
      // Esc la cierra y el foco regresa a la tarjeta.
      await page.keyboard.press("Escape");
      await expect(f).toBeHidden();
      await expect(tarjeta(page, "nuevo")).toBeFocused();
      // Enter en la tarjeta también la abre.
      await page.keyboard.press("Enter");
      await expect(f).toBeVisible();
      // «Abrir completa» lleva a la ficha del lead.
      await f.getByRole("link", { name: "Abrir completa" }).click();
      await expect(page).toHaveURL(new RegExp(`/leads/${ids.nuevo}$`));
      await expect(page.getByRole("heading", { name: NOMBRES.nuevo })).toBeVisible();
    } finally {
      await cerrar();
    }
  });

  test("Esc cierra en orden: primero la ficha y después la selección; el velo y «Cerrar la ficha» también la cierran", async ({ browser, baseURL }) => {
    const { page, cerrar } = await contextoNuevo(browser, baseURL ?? mundo.base, "escritorio", "asesor");
    try {
      await page.goto("/embudo");
      await tarjeta(page, "nuevo").getByRole("button", { name: /^Seleccionar a/ }).click();
      const barra = page.getByRole("region", { name: "Leads seleccionados" });
      await expect(barra).toBeVisible();
      await clicEnLaTarjeta(page, "frio");
      const f = ficha(page, "frio");
      await expect(f).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(f).toBeHidden();
      await expect(barra).toBeVisible(); // la selección sigue: Esc solo cerró la ficha
      await page.keyboard.press("Escape");
      await expect(barra).toHaveCount(0);
      // «Cerrar la ficha» y el clic en el velo.
      await clicEnLaTarjeta(page, "frio");
      await ficha(page, "frio").getByRole("button", { name: "Cerrar la ficha" }).click();
      await expect(f).toBeHidden();
      await clicEnLaTarjeta(page, "frio");
      await expect(f).toBeVisible();
      await page.mouse.click(60, 400);
      await expect(f).toBeHidden();
    } finally {
      await cerrar();
    }
  });

  test("un lead estancado muestra su tarea pendiente y su historial en línea de tiempo, con lo que pasó de verdad", async ({ browser, baseURL }) => {
    // Un movimiento real (con nota) deja una fila en el historial; después se envejece el último movimiento para que cuente como estancado.
    expect((await admin.patch(`/api/leads/${ids.frio}/etapa`, { data: { etapa_id: etapa("negociacion"), nota: "Pidió el precio" } })).status()).toBe(200);
    expect((await admin.patch(`/api/leads/${ids.frio}/etapa`, { data: { etapa_id: etapa("contactado"), nota: "Dejó de contestar" } })).status()).toBe(200);
    await prisma.lead.update({ where: { id: ids.frio }, data: { ultima_interaccion_en: new Date(Date.now() - 10 * 86_400_000) } });
    const { page, cerrar } = await contextoNuevo(browser, baseURL ?? mundo.base, "escritorio", "asesor");
    try {
      await page.goto("/embudo");
      await clicEnLaTarjeta(page, "frio");
      const f = ficha(page, "frio");
      await expect(f.getByTestId("ficha-estancado")).toContainText("10 días sin movimiento en Etapa B");
      await expect(f.getByTestId("ficha-estancado")).toContainText("Tarea pendiente: decide cómo retomarlo.");
      await expect(f.getByTestId("ficha-estancado")).toContainText("Retomar a la familia R2b Fría por WhatsApp.");
      const h = f.getByTestId("ficha-historial");
      const puntos = h.getByRole("listitem");
      await expect(puntos).toHaveCount(2);
      await expect(puntos.nth(0)).toContainText("Pasó a Etapa B"); // lo más reciente primero
      await expect(puntos.nth(0)).toContainText("Dejó de contestar");
      await expect(puntos.nth(1)).toContainText("Pasó a Etapa E");
      await expect(puntos.nth(1)).toContainText("Pidió el precio");
      // Un lead que no está estancado no lleva el aviso.
      await f.getByRole("button", { name: "Cerrar la ficha" }).click();
      await clicEnLaTarjeta(page, "nuevo");
      await expect(ficha(page, "nuevo").getByTestId("ficha-estancado")).toHaveCount(0);
    } finally {
      await cerrar();
    }
  });

  test("en celular la ficha ocupa toda la pantalla", async ({ browser, baseURL }) => {
    const { page, cerrar } = await contextoNuevo(browser, baseURL ?? mundo.base, "celular", "asesor");
    try {
      await page.goto("/embudo");
      await page.getByRole("group", { name: "Etapas" }).getByRole("button", { name: /^Primera/ }).click();
      await tarjeta(page, "nuevo").click({ position: { x: 150, y: 60 } });
      const f = ficha(page, "nuevo");
      await expect(f).toBeVisible();
      const caja = (await f.boundingBox())!;
      const ventana = page.viewportSize()!;
      expect(Math.round(caja.width)).toBe(ventana.width);
      expect(Math.round(caja.height)).toBe(ventana.height);
      await expect(f.getByRole("button", { name: "Cerrar la ficha" })).toBeVisible();
    } finally {
      await cerrar();
    }
  });
});

test.describe("perder y recuperar", () => {
  test("perder exige el motivo: los motivos son botones, la nota es opcional y todo queda en el historial", async ({ browser, baseURL }) => {
    const { page, cerrar } = await contextoNuevo(browser, baseURL ?? mundo.base, "escritorio", "asesor");
    try {
      await page.goto("/embudo");
      await clicEnLaTarjeta(page, "nuevo");
      await ficha(page, "nuevo").getByLabel("Mover de etapa").selectOption({ label: "Etapa G (pide el motivo)" });
      const d = page.getByRole("dialog", { name: `¿Por qué se perdió ${NOMBRES.nuevo}?` });
      await expect(d).toBeVisible();
      await expect(d).toContainText("Ahora está en: Primera");
      const enviar = d.getByRole("button", { name: "Mover a Etapa G", exact: true });
      await expect(enviar).toBeDisabled();
      await expect(d).toContainText("Elige el motivo de pérdida.");
      const precio = d.getByRole("button", { name: "Precio", exact: true });
      await precio.click();
      await expect(precio).toHaveAttribute("aria-pressed", "true");
      await expect(enviar).toBeEnabled();
      await expect(d.getByText("Elige el motivo de pérdida.")).toHaveCount(0);
      await d.getByLabel("Nota (opcional)").fill("Le pareció caro");
      await enviar.click();
      await expect(page.getByTestId("aviso-global")).toContainText(`${NOMBRES.nuevo} pasó a Etapa G.`);
      const l = await etapaDe("nuevo");
      expect(l.id).toBe(etapa("perdido"));
      expect(l.motivo_perdida_id).toBe(mundo.asesor.motivos.precio);
      // La ficha (que sigue abierta) ya lo dice en su línea de tiempo.
      await expect(ficha(page, "nuevo").getByTestId("ficha-historial")).toContainText("Motivo: Precio");
      await expect(ficha(page, "nuevo").getByTestId("ficha-historial")).toContainText("Le pareció caro");
      await expect(ficha(page, "nuevo").getByRole("button", { name: "Recuperar lead" })).toBeVisible();
    } finally {
      await cerrar();
    }
  });

  test("recuperar exige una nota (en blanco no vale) y el lead vuelve a una etapa abierta con su recuperación contada", async ({ browser, baseURL }) => {
    const { page, cerrar } = await contextoNuevo(browser, baseURL ?? mundo.base, "escritorio", "asesor");
    try {
      await page.goto("/embudo");
      await desplegarPerdidos(page);
      await clicEnLaTarjeta(page, "perdido");
      await ficha(page, "perdido").getByRole("button", { name: "Recuperar lead" }).click();
      const d = page.getByRole("dialog", { name: `Recuperar a ${NOMBRES.perdido}` });
      await expect(d).toBeVisible();
      await expect(d).toContainText("Pasa de Etapa G a Etapa B");
      await expect(d).toContainText("Estás recuperando un lead que se había perdido: la nota es obligatoria.");
      const enviar = d.getByRole("button", { name: "Mover a Etapa B", exact: true });
      await expect(enviar).toBeDisabled();
      await expect(d).toContainText("Escribe una nota: por qué se recupera.");
      await d.getByLabel(/^Nota/).fill("   ");
      await expect(enviar).toBeDisabled();
      await d.getByLabel(/^Nota/).fill("Volvió a escribir por el horario");
      await expect(enviar).toBeEnabled();
      await enviar.click();
      await expect(page.getByTestId("aviso-global")).toContainText(`${NOMBRES.perdido} pasó a Etapa B.`);
      const l = await etapaDe("perdido");
      expect(l.id).toBe(etapa("contactado"));
      expect(l.recuperaciones).toBe(1);
      expect(l.motivo_perdida_id).toBeNull();
      const h = await json<{ cambios: { nota: string | null; es_recuperacion: boolean }[] }>(admin, `/api/leads/${ids.perdido}/historial`);
      expect(h.cambios.at(-1)).toMatchObject({ nota: "Volvió a escribir por el horario", es_recuperacion: true });
    } finally {
      await cerrar();
    }
  });

  test("si otra persona movió al lead mientras se elegía el motivo (409), el diálogo lo dice y al cerrar el tablero se actualiza", async ({ browser, baseURL }) => {
    const { page, cerrar } = await contextoNuevo(browser, baseURL ?? mundo.base, "escritorio", "asesor");
    try {
      await page.goto("/embudo");
      await clicEnLaTarjeta(page, "nuevo");
      await ficha(page, "nuevo").getByLabel("Mover de etapa").selectOption({ label: "Etapa G (pide el motivo)" });
      const d = page.getByRole("dialog", { name: `¿Por qué se perdió ${NOMBRES.nuevo}?` });
      await d.getByRole("button", { name: "Precio", exact: true }).click();
      expect((await admin.patch(`/api/leads/${ids.nuevo}/etapa`, { data: { etapa_id: etapa("negociacion") } })).status()).toBe(200);
      await d.getByRole("button", { name: "Mover a Etapa G", exact: true }).click();
      await expect(d).toContainText("El lead cambió mientras lo veías");
      expect((await etapaDe("nuevo")).id).toBe(etapa("negociacion"));
      await d.getByRole("button", { name: "Cancelar" }).click();
      await expect(columna(page, "negociacion").getByTestId(`lead-${ids.nuevo}`)).toBeVisible();
    } finally {
      await cerrar();
    }
  });
});

test.describe("inscribir", () => {
  test("en 3 pasos: lo capturado se ve y solo se pide lo que falta, el grupo trae sus lugares y la confirmación sus montos; queda inscrito", async ({ browser, baseURL }) => {
    const { page, cerrar } = await contextoNuevo(browser, baseURL ?? mundo.base, "escritorio", "asesor");
    try {
      await page.goto("/embudo");
      await tarjeta(page, "inscribir").getByRole("button", { name: `Inscribir a ${NOMBRES.inscribir}` }).click();
      const d = page.getByRole("dialog", { name: "Inscribir a Niño R2b Inscribir" });
      await expect(d).toBeVisible();
      await expect(d).toContainText(`${NOMBRES.inscribir} · `);
      // Paso 1 (Alumno): lo capturado con «Capturado», y el campo de lo que falta.
      await expect(d.getByRole("list", { name: "Pasos" }).getByRole("listitem")).toHaveText([/Alumno$/, /Grupo$/, /Confirmar$/]);
      const paso1 = d.getByTestId("paso-alumno");
      await expect(paso1).toContainText("Lo que ya capturaron el asistente, la página o el maestro no se vuelve a pedir.");
      await expect(paso1.getByTestId("dato-capturado").filter({ hasText: "Alumno: Niño R2b Inscribir" })).toContainText("Capturado");
      await expect(paso1.getByTestId("dato-capturado").filter({ hasText: "Sucursal:" })).toBeVisible();
      await expect(paso1.getByLabel(/^Nombre del alumno/)).toHaveCount(0); // el nombre ya está: no se vuelve a pedir
      const siguiente = d.getByRole("button", { name: "Siguiente", exact: true });
      await expect(siguiente).toBeDisabled();
      // Este lead no tiene registro del maestro: el servidor dice que faltan el parentesco, los apellidos y la fecha de nacimiento (y nada más).
      await expect(d.getByTestId("falta-del-dialogo")).toContainText("Para seguir falta: Parentesco del adulto responsable, Apellidos del alumno, Fecha de nacimiento del alumno.");
      await expect(paso1).toContainText("Edad que dijo la familia: 8 años.");
      await paso1.getByLabel(/^Apellidos del alumno/).fill("Prueba Dos");
      await paso1.getByLabel(/^Fecha de nacimiento del alumno/).fill("2018-03-02");
      await expect(siguiente).toBeDisabled();
      await paso1.getByLabel(/^Parentesco con el alumno/).fill("madre");
      await expect(d.getByTestId("falta-del-dialogo")).toHaveCount(0);
      await siguiente.click();
      // Paso 2 (Grupo): los grupos de su edad con los lugares que quedan hoy (los calcula el servidor).
      const paso2 = d.getByTestId("paso-grupo");
      await expect(paso2).toContainText("Grupo, con los lugares que quedan hoy");
      const grupoB = paso2.getByRole("button", { name: new RegExp(`^${mundo.grupos.b.nombre}`) });
      await expect(grupoB).toContainText(/\d+ lugares?/);
      await expect(d.getByRole("button", { name: "Siguiente", exact: true })).toBeDisabled();
      await expect(d.getByTestId("falta-del-dialogo")).toContainText("Elige un grupo con lugar.");
      await grupoB.click();
      await expect(grupoB).toHaveAttribute("aria-pressed", "true");
      await d.getByRole("button", { name: "Siguiente", exact: true }).click();
      // Paso 3 (Confirmar): el alumno, el grupo y los montos que calculó el servidor.
      const paso3 = d.getByTestId("paso-confirmar");
      await expect(paso3).toContainText("Niño R2b Inscribir Prueba Dos");
      await expect(paso3).toContainText(mundo.grupos.b.nombre);
      await expect(paso3.getByTestId("montos")).toContainText("Inscripción$500.00");
      await expect(paso3.getByTestId("montos")).toContainText("Primera mensualidad$1,000.00");
      await expect(paso3.getByTestId("montos")).toContainText("Primer pago$1,500.00");
      // Atrás conserva lo escrito.
      await d.getByRole("button", { name: "Atrás" }).click();
      await d.getByRole("button", { name: "Atrás" }).click();
      await expect(d.getByLabel(/^Apellidos del alumno/)).toHaveValue("Prueba Dos");
      await d.getByRole("button", { name: "Siguiente", exact: true }).click();
      await d.getByRole("button", { name: "Siguiente", exact: true }).click();
      await d.getByRole("button", { name: "Inscribir a Niño R2b Inscribir" }).click();
      await expect(page.getByTestId("aviso-global")).toContainText(`Niño R2b Inscribir quedó inscrito en ${mundo.grupos.b.nombre}`);
      await expect(columna(page, "inscrito")).toHaveAttribute("class", /^columna(?!.*plegada)/);
      await expect(columna(page, "inscrito").getByTestId(`lead-${ids.inscribir}`)).toBeVisible();
      // Quedó en el servidor: el lead inscrito, con su alumno e inscripción activa en ese grupo y los dos cargos.
      expect((await etapaDe("inscribir")).id).toBe(etapa("inscrito"));
      const alumnos = await json<{ datos: { id: string; nombre: string; apellidos: string }[] }>(admin, "/api/alumnos?nombre=R2b");
      expect(alumnos.datos).toHaveLength(1);
      expect(alumnos.datos[0]).toMatchObject({ nombre: "Niño R2b Inscribir", apellidos: "Prueba Dos" });
      const insc = await json<{ datos: { grupo_id: string; estatus: string; precio_inscripcion_aplicado: string }[] }>(admin, `/api/inscripciones?alumno_id=${alumnos.datos[0]!.id}`);
      expect(insc.datos).toHaveLength(1);
      expect(insc.datos[0]).toMatchObject({ grupo_id: mundo.grupos.b.id, estatus: "activa", precio_inscripcion_aplicado: "500.00" });
      // Un lead ya inscrito no se vuelve a inscribir: la ficha lo manda al expediente.
      await clicEnLaTarjeta(page, "inscribir");
      await expect(ficha(page, "inscribir").getByRole("button", { name: "Ver expediente" })).toBeVisible();
    } finally {
      await cerrar();
    }
  });

  test("un rechazo del servidor al confirmar se dice dentro del diálogo: el grupo lleno regresa al grupo y el reglamento manda a la inscripción completa", async ({ browser, baseURL }) => {
    const { page, cerrar } = await contextoNuevo(browser, baseURL ?? mundo.base, "escritorio", "asesor");
    try {
      await page.goto("/embudo");
      await tarjeta(page, "revocable").getByRole("button", { name: `Inscribir a ${NOMBRES.revocable}` }).click();
      const d = page.getByRole("dialog", { name: "Inscribir a Niño R2b Revocable" });
      await d.getByLabel(/^Apellidos del alumno/).fill("Prueba Tres");
      await d.getByLabel(/^Fecha de nacimiento del alumno/).fill("2018-03-02");
      await d.getByLabel(/^Parentesco con el alumno/).fill("tío");
      await d.getByRole("button", { name: "Siguiente", exact: true }).click();
      await d.getByTestId("paso-grupo").getByRole("button", { name: new RegExp(`^${mundo.grupos.b.nombre}`) }).click();
      await d.getByRole("button", { name: "Siguiente", exact: true }).click();
      const inscribir = d.getByRole("button", { name: "Inscribir a Niño R2b Revocable" });
      // 1) Mientras se confirmaba, otra persona llenó el grupo: el servidor responde 409 «grupo_lleno» (aquí se simula la respuesta; las demás pruebas comparten ese grupo). Nada se inscribió.
      await page.route(/\/api\/leads\/[^/]+\/convertir$/, (r) => r.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ error: { codigo: "conflicto", mensaje: "El grupo ya no tiene lugares", detalles: [{ campo: "motivo", mensaje: "grupo_lleno" }, { campo: "prospecto_id", mensaje: prospectos.revocable }] } }) }));
      await inscribir.click();
      const lleno = d.getByTestId("rechazo-de-grupo");
      await expect(lleno).toContainText("No se inscribió a nadie");
      await expect(d).toContainText("El grupo ya no tiene lugares");
      await lleno.getByRole("button", { name: "Elegir otro grupo" }).click();
      await expect(d.getByTestId("paso-grupo")).toBeVisible();
      await page.unroute(/\/api\/leads\/[^/]+\/convertir$/);
      // 2) Se revoca el reglamento: el servidor (real) rechaza con «faltan_datos» y el diálogo manda a la inscripción completa, donde se registra.
      await revocarReglamento("revocable");
      await d.getByRole("button", { name: "Siguiente", exact: true }).click();
      await inscribir.click();
      const salida = d.getByTestId("rechazo-a-completa");
      await expect(salida).toContainText("Esto se resuelve en la inscripción completa");
      await expect(d).toContainText("Reglamento aceptado por la familia");
      expect((await json<{ datos: unknown[] }>(admin, "/api/alumnos?nombre=Revocable")).datos).toHaveLength(0);
      expect((await etapaDe("revocable")).id).toBe(etapa("muestra_asistida"));
      await salida.getByRole("button", { name: "Abrir la inscripción completa" }).click();
      await expect(page).toHaveURL(new RegExp(`/leads/${ids.revocable}/convertir$`));
    } finally {
      await cerrar();
    }
  });

  test("soltar varios leads sobre «Inscrito» lo explica: la inscripción es de una familia a la vez, y soltar uno abre la inscripción", async ({ browser, baseURL }) => {
    const { page, cerrar } = await contextoNuevo(browser, baseURL ?? mundo.base, "escritorio", "asesor");
    try {
      await page.goto("/embudo");
      await tarjeta(page, "nuevo").getByRole("button", { name: /^Seleccionar a/ }).click();
      await tarjeta(page, "frio").getByRole("button", { name: /^Seleccionar a/ }).click();
      await arrastrar(page, tarjeta(page, "nuevo"), columna(page, "inscrito"));
      const d = page.getByRole("dialog", { name: "Inscribir de una familia a la vez" });
      await expect(d).toContainText("La inscripción se hace de una familia a la vez: suelta los leads uno por uno.");
      await expect(d).toContainText(NOMBRES.nuevo);
      await d.getByRole("button", { name: "Entendido" }).click();
      await expect(d).toBeHidden();
      expect((await etapaDe("nuevo")).id).toBe(etapa("nuevo"));
      expect((await etapaDe("frio")).id).toBe(etapa("contactado"));
      // Uno solo sí: la inscripción en 3 pasos.
      await page.getByRole("button", { name: "Quitar la selección" }).click();
      await arrastrar(page, tarjeta(page, "dos"), columna(page, "inscrito"));
      await expect(page.getByRole("dialog", { name: /^Inscribir a / })).toBeVisible();
    } finally {
      await cerrar();
    }
  });

  test("lo que no cabe en el diálogo se dice y se ofrece «Abrir la inscripción completa»: varios niños por inscribir", async ({ browser, baseURL }) => {
    const { page, cerrar } = await contextoNuevo(browser, baseURL ?? mundo.base, "escritorio", "asesor");
    try {
      await page.goto("/embudo");
      await tarjeta(page, "dos").getByRole("button", { name: `Inscribir a ${NOMBRES.dos}` }).click();
      const d = page.getByRole("dialog", { name: /^Inscribir a / });
      const aviso = d.getByTestId("no-cabe-en-el-dialogo");
      await expect(aviso).toContainText("Esto se hace en la inscripción completa");
      await expect(aviso).toContainText("2 niños por inscribir");
      await aviso.getByRole("button", { name: "Abrir la inscripción completa" }).click();
      await expect(page).toHaveURL(new RegExp(`/leads/${ids.dos}/convertir$`));
    } finally {
      await cerrar();
    }
  });
});

test.describe("agendar", () => {
  test("«Agendar clase muestra» de la ficha: elegir día y hora entre las sesiones con lugar; queda agendada y el lead pasa a su etapa", async ({ browser, baseURL }) => {
    const { page, cerrar } = await contextoNuevo(browser, baseURL ?? mundo.base, "escritorio", "asesor");
    try {
      await page.goto("/embudo");
      await clicEnLaTarjeta(page, "nuevo");
      await ficha(page, "nuevo").getByRole("button", { name: "Agendar clase muestra", exact: true }).click();
      const d = page.getByRole("dialog", { name: "Agendar la clase muestra de Niña R2b Uno" });
      await expect(d).toBeVisible();
      await expect(d).toContainText(`${NOMBRES.nuevo} · `);
      const enviar = d.getByRole("button", { name: "Agendar y avisar", exact: true });
      await expect(enviar).toBeDisabled();
      await expect(d.getByTestId("falta-del-dialogo")).toContainText("Elige el día y la hora.");
      const sesiones = d.getByRole("group", { name: "Elige día y hora" }).getByRole("button");
      await expect(sesiones.first()).toBeVisible();
      await expect(sesiones.first()).toContainText("El más próximo");
      await expect(sesiones.first()).toContainText(/\d+ lugares?/);
      await sesiones.first().click();
      await expect(sesiones.first()).toHaveAttribute("aria-pressed", "true");
      await expect(enviar).toBeEnabled();
      await enviar.click();
      await expect(page.getByTestId("aviso-global")).toContainText("Clase muestra agendada para Niña R2b Uno:");
      const clases = await json<{ datos: { estatus: string }[] }>(admin, `/api/clases-muestra?lead_id=${ids.nuevo}&limite=50`);
      expect(clases.datos.filter((c) => c.estatus === "agendada")).toHaveLength(1);
      expect((await etapaDe("nuevo")).id).toBe(etapa("muestra_agendada"));
      // La ficha (abierta) ya muestra la clase y ofrece cambiarla; el diálogo de cambio reprograma la misma clase.
      await expect(ficha(page, "nuevo").getByTestId("ficha-clase")).toContainText("Agendada");
      await ficha(page, "nuevo").getByRole("button", { name: "Cambiar la clase muestra", exact: true }).click();
      const c = page.getByRole("dialog", { name: "Cambiar la clase muestra de Niña R2b Uno" });
      await expect(c).toBeVisible();
      await c.getByRole("group", { name: "Elige día y hora" }).getByRole("button").nth(1).click();
      await c.getByRole("button", { name: "Reprogramar y avisar", exact: true }).click();
      await expect(page.getByTestId("aviso-global")).toContainText("Clase muestra cambiada para Niña R2b Uno:");
      await expect
        .poll(async () => ((await json<{ datos: { estatus: string }[] }>(admin, `/api/clases-muestra?lead_id=${ids.nuevo}&limite=50`)).datos.map((x) => x.estatus).sort()))
        .toEqual(["agendada", "reagendada"]);
    } finally {
      await cerrar();
    }
  });

  test("el botón de la tarjeta agenda sin pasar por la ficha, y un error del servidor se queda dentro del diálogo", async ({ browser, baseURL }) => {
    const { page, cerrar } = await contextoNuevo(browser, baseURL ?? mundo.base, "escritorio", "asesor");
    try {
      await page.goto("/embudo");
      await tarjeta(page, "nuevo").getByRole("button", { name: `Agendar la clase muestra de ${NOMBRES.nuevo}` }).click();
      const d = page.getByRole("dialog", { name: "Agendar la clase muestra de Niña R2b Uno" });
      await d.getByRole("group", { name: "Elige día y hora" }).getByRole("button").first().click();
      await page.route(/\/api\/clases-muestra$/, (r) => (r.request().method() === "POST" ? r.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ error: { codigo: "conflicto", mensaje: "Ese horario ya no tiene lugares.", detalles: [] } }) }) : r.fallback()));
      await d.getByRole("button", { name: "Agendar y avisar", exact: true }).click();
      await expect(d.getByTestId("error-de-guardado")).toContainText("Ese horario ya no tiene lugares.");
      await expect(d).toBeVisible();
      expect((await etapaDe("nuevo")).id).toBe(etapa("nuevo"));
    } finally {
      await cerrar();
    }
  });
});
