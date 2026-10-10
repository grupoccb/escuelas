// V7 (asesor): el día de Alba, asesora de la sucursal Norte, en escritorio (1366×768), como alguien que nunca vio el sistema. El guion está en
// `docs/capturas/v1/v7-asesor/ARGUMENTO.md`. Cada pantalla relevante deja una captura `<fase>-NN-<nombre>.png` en esa carpeta (`FASE=antes` antes de corregir, `FASE=despues`
// —lo normal— ya corregido). Lo que «llega» durante el día entra por los caminos reales: el bot (`procesarEntrante` con transporte falso, como un contacto de Chatwoot), la
// landing pública y las tareas con el texto que escribe el sistema. Sin credenciales y sin salir del origen (la fixtura aborta cualquier otra petición).

import { request, type APIRequestContext, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { randomInt } from "node:crypto";
import { apiComo, json } from "./ayudas.ts";
import { comoRol, contextoNuevo, expect, mundo, test, VISTA_ESCRITORIO } from "./fixtura.ts";
import { RAIZ } from "./mundo.ts";
import { CONTRASENA_DE_PRUEBA, sembrarUsuario } from "../../src/testutil/api.ts";
import { fijarConfiguracion, sembrarEmbudo, sembrarFamilia, sembrarOrganizacion } from "../../src/testutil/semilla.ts";
import { crearPrismaDePruebas, type PrismaPruebas } from "../../src/testutil/prisma-pruebas.ts";
import { MessagingProvider, TransporteFalso, type EventoEntrante } from "../../src/mensajeria/index.ts";
import { procesarEntrante } from "../../src/captacion/entrante.ts";

test.use({ ...comoRol("asesor"), viewport: VISTA_ESCRITORIO });
test.describe.configure({ mode: "serial" });
test.setTimeout(30_000);

const FASE = process.env["FASE"] === "antes" ? "antes" : "despues";
const CARPETA = resolve(RAIZ, "docs/capturas/v1/v7-asesor");
let numeroDeCaptura = 0;

/** Una captura numerada de lo que ve Alba. `completa`: toda la página (la ficha es larga). */
async function foto(page: Page, nombre: string, completa = false): Promise<void> {
  mkdirSync(CARPETA, { recursive: true });
  numeroDeCaptura += 1;
  const original = page.viewportSize();
  await page.waitForLoadState("networkidle", { timeout: 4000 }).catch(() => undefined);
  if (completa) {
    const alto = await page.evaluate(() => document.documentElement.scrollHeight);
    await page.setViewportSize({ width: VISTA_ESCRITORIO.width, height: Math.min(Math.max(alto, VISTA_ESCRITORIO.height), 4000) });
    await page.waitForTimeout(150);
  }
  await page.screenshot({ path: resolve(CARPETA, `${FASE}-${String(numeroDeCaptura).padStart(2, "0")}-${nombre}.png`), animations: "disabled" });
  if (original) await page.setViewportSize(original);
}

/** Cuenta los pasos (clics y elecciones) de una tarea diaria: escribir en un campo no cuenta. */
const pasosPorTarea: Record<string, number> = {};
let tareaActual = "";
const cuenta = (tarea: string): void => {
  tareaActual = tarea;
  pasosPorTarea[tarea] = 0;
};
const paso = (): void => {
  pasosPorTarea[tareaActual] = (pasosPorTarea[tareaActual] ?? 0) + 1;
};

let prisma: PrismaPruebas;
let admin: APIRequestContext;
let transporte: TransporteFalso;
let siguienteMensaje = randomInt(1_000_000, 2_000_000_000);
const etapa = (tipo: string): string => mundo.etapas[tipo] ?? "";
const cuentaChatwoot = mundo.asesor.alfa.chatwoot;

/** Un contacto que escribe por WhatsApp (entra por Chatwoot): `escribe` lo procesa como el webhook y devuelve lo que contestó el bot; `notas` son las notas internas para el asesor. */
function contactoPorWhatsApp(telefono: string, nombre: string) {
  const conversacion = randomInt(1, 2_000_000_000);
  const deps = { prisma, mensajeria: new MessagingProvider({ transporte }) };
  const delContacto = (e: (typeof transporte.envios)[number]) => e.destino.chatwootConversacionId === conversacion;
  return {
    telefono,
    conversacion,
    async escribe(contenido: string): Promise<string[]> {
      const antes = transporte.envios.filter((e) => delContacto(e) && e.tipo === "mensaje").length;
      const id = String(siguienteMensaje++);
      const evento: EventoEntrante = {
        chatwootAccountId: cuentaChatwoot.cuentaId,
        chatwootInboxId: cuentaChatwoot.bandejaId,
        chatwootConversacionId: conversacion,
        idMensaje: id,
        contenido,
        estadoConversacion: "pending",
        contacto: { nombre, telefono },
        creadoEn: null,
        llave: { proveedor: "chatwoot", id },
        numeroReceptor: null,
        crudo: null,
      };
      await procesarEntrante(deps, evento);
      return transporte.envios.filter((e) => delContacto(e) && e.tipo === "mensaje").slice(antes).map((e) => e.texto ?? "");
    },
    notas: (): string[] => transporte.envios.filter((e) => delContacto(e) && e.tipo === "nota_interna").map((e) => e.texto ?? ""),
  };
}

test.beforeAll(async () => {
  prisma = crearPrismaDePruebas(process.env["DATABASE_URL"], 4);
  admin = await apiComo("administrador");
  transporte = new TransporteFalso();
});
test.afterAll(async () => {
  process.stdout.write(`PASOS POR TAREA ${JSON.stringify(pasosPorTarea)}\n`);
  await prisma.$disconnect();
  await admin.dispose();
});

const L = {
  bot: { id: "", nombre: "Laura Mamá", telefono: "+5215588001001" },
  landing: { id: "", nombre: "Familia Landing" },
  medias: { id: "", nombre: "Rosa Mamá", telefono: "+5215588001002" },
  baja: { id: "", nombre: "Pedro Papá" },
};
/** Una lista de pasos de una tarea no pasa de tres (la meta del recorrido) salvo las que se anotan aparte con su motivo. */
const META_DE_PASOS = 3;

test.describe("un día de Alba", () => {
  test("1. llega un lead por el bot: embudo, ficha, resumen y conversación en Chatwoot", async ({ page }) => {
    const c = contactoPorWhatsApp(L.bot.telefono, L.bot.nombre);
    for (const m of ["Hola, quiero informes de las clases", "Sofía", "7 años", "Norte"]) await c.escribe(m);
    // El resumen que el bot deja a los asesores (en Chatwoot): en español, sin identificadores ni términos técnicos.
    const nota = c.notas().join("\n");
    expect(nota).toContain("Datos capturados por el bot");
    expect(nota).not.toMatch(/uuid|payload|null|undefined|\{|\}/i);
    L.bot.id = (await prisma.lead.findFirstOrThrow({ where: { telefono: "+525588001001" } })).id;

    cuenta("1. lead del bot");
    await page.goto("/embudo");
    paso(); // el embudo es su inicio al entrar
    await expect(page.getByRole("heading", { name: "Embudo" })).toBeVisible();
    await foto(page, "embudo-con-el-lead-del-bot");
    const tarjeta = page.locator("[data-prueba^='lead-']", { hasText: L.bot.nombre }).first();
    await expect(tarjeta).toBeVisible();
    await expect(tarjeta).toContainText("Norte");
    await tarjeta.getByRole("link", { name: L.bot.nombre }).click();
    paso();
    await expect(page.getByRole("heading", { name: L.bot.nombre })).toBeVisible();
    await foto(page, "ficha-del-lead-del-bot", true);
    const enlace = page.getByTestId("enlace-chatwoot");
    await expect(enlace).toHaveAttribute("href", /\/conversations\/\d+$/);
    await expect(enlace).toHaveAttribute("target", "_blank");
    paso(); // abrir la conversación (no se visita: el navegador de pruebas no sale del origen)
    expect(pasosPorTarea["1. lead del bot"]).toBeLessThanOrEqual(META_DE_PASOS);
  });

  test("2. llega un lead por la landing (anuncio): su origen se lee en español", async ({ browser, baseURL, page }) => {
    const familia = await contextoNuevo(browser, baseURL!, "escritorio", null);
    const p = familia.page;
    await p.route(/\/l\/vertical-prueba/, async (ruta) => {
      if (ruta.request().method() !== "POST") return ruta.continue();
      await ruta.fetch({ maxRedirects: 0 });
      return ruta.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: "<!doctype html><meta charset=utf-8><title>WhatsApp (simulado)</title><h1>WhatsApp (simulado)</h1>" });
    });
    await p.goto(`${mundo.recorridos.rutaLanding}?utm_source=facebook&utm_medium=anuncio&utm_campaign=otono`);
    await p.getByLabel("¿Quién tomará la clase?").fill("Diego");
    await p.getByLabel("Edad").fill("9");
    await p.getByLabel("¿En qué sucursal quieres la clase?").selectOption({ label: mundo.sucursales.norte.nombre });
    await p.getByLabel("Tu teléfono de contacto").fill("5588001003");
    await p.getByLabel("Tu nombre (opcional)").fill(L.landing.nombre);
    await p.getByLabel(/He leído y acepto/).check();
    await p.getByRole("button", { name: "Enviar y continuar a WhatsApp" }).click();
    await expect(p.getByRole("heading", { name: "WhatsApp (simulado)" })).toBeVisible();
    await familia.cerrar();
    L.landing.id = (await prisma.lead.findFirstOrThrow({ where: { telefono: "+525588001003" } })).id;
    // La atribución que trae un anuncio (la landing de este mundo solo guarda la fuente): con sus claves de rastreo, como llegan de la plataforma.
    await prisma.lead.update({ where: { id: L.landing.id }, data: { atribucion: { fuente: "landing", utm_source: "facebook", utm_medium: "anuncio", utm_campaign: "otono", codigo_rastreo: "ABCD2345" } } });

    cuenta("2. lead de la landing");
    await page.goto("/embudo");
    paso();
    const tarjeta = page.locator("[data-prueba^='lead-']", { hasText: L.landing.nombre }).first();
    await expect(tarjeta).toBeVisible();
    await foto(page, "embudo-con-el-lead-de-la-landing");
    await tarjeta.getByRole("link", { name: L.landing.nombre }).click();
    paso();
    // V7-ASESOR-11: la atribución se lee en español (antes: «utm_source», «utm_medium»…).
    await expect(page.getByText("Plataforma del anuncio")).toBeVisible();
    await expect(page.getByText("Tipo de anuncio")).toBeVisible();
    await expect(page.getByText("Campaña del anuncio")).toBeVisible();
    await expect(page.locator("main")).not.toContainText(/utm_/);
    await expect(page.getByText("landing", { exact: true })).toHaveCount(0); // el valor crudo de la fuente no se repite
    await foto(page, "ficha-del-lead-de-la-landing", true);
    expect(pasosPorTarea["2. lead de la landing"]).toBeLessThanOrEqual(META_DE_PASOS);
  });

  test("3. agrega al segundo hijo", async ({ page }) => {
    await page.goto(`/leads/${L.bot.id}`);
    cuenta("3. segundo hijo");
    await page.getByRole("button", { name: "Agregar otro niño" }).click();
    paso();
    const d = page.getByRole("dialog");
    await d.getByLabel(/^Nombre/).fill("Mateo");
    await d.getByLabel("Edad (si no saben la fecha)").fill("5");
    await foto(page, "agregar-otro-nino");
    await d.getByRole("button", { name: "Guardar", exact: true }).click();
    paso();
    await expect(page.getByTestId("ninos")).toContainText("Mateo");
    await foto(page, "ficha-con-dos-hijos", true);
    expect(pasosPorTarea["3. segundo hijo"]).toBeLessThanOrEqual(META_DE_PASOS);
  });

  test("4. cotiza a cada niño", async ({ page }) => {
    await page.goto(`/leads/${L.bot.id}`);
    cuenta("4. cotizar");
    await page.getByRole("button", { name: "Cotizar a Sofía" }).click();
    paso();
    await foto(page, "cotizar-a-mano", true);
    await page.getByRole("button", { name: "Guardar cotización" }).click();
    paso();
    await expect(page.locator("[data-prueba^='cotizacion-']").first()).toContainText("Sofía");
    await page.getByRole("button", { name: "Cotizar a Mateo" }).click();
    await page.getByRole("button", { name: "Guardar cotización" }).click();
    await expect(page.locator("[data-prueba^='cotizacion-']")).toHaveCount(2);
    // V7-ASESOR-06: «1 lugares» → «1 lugar» (la regla está en `textoDeLugares`, con su prueba unitaria; aquí, que ninguna cotización diga «1 lugares», sea cual sea el cupo que dejaron las demás pruebas).
    await expect(page.locator("main")).not.toContainText(/\b1 lugares/);
    await foto(page, "cotizaciones-de-los-dos", true);
    expect(pasosPorTarea["4. cotizar"]).toBeLessThanOrEqual(META_DE_PASOS);
  });

  test("5. agenda la clase muestra: las sesiones se leen sin esfuerzo", async ({ page }) => {
    await page.goto(`/leads/${L.bot.id}`);
    cuenta("5. agendar clase muestra");
    await page.getByRole("button", { name: "Agendar clase muestra" }).click();
    paso();
    const d = page.getByRole("dialog");
    await expect(d.getByRole("radio").first()).toBeAttached();
    // V7-ASESOR-08: cada sesión es una opción ancha de una o dos líneas (antes, cinco chips de seis líneas apretados en una fila).
    const opciones = d.locator("label.opcion");
    const n = await opciones.count();
    expect(n).toBeGreaterThanOrEqual(5);
    for (let i = 0; i < n; i++) {
      const caja = (await opciones.nth(i).boundingBox())!;
      expect(caja.width, `la sesión ${i + 1} es muy angosta`).toBeGreaterThanOrEqual(170);
      expect(caja.height, `la sesión ${i + 1} es muy alta`).toBeLessThanOrEqual(80);
    }
    await foto(page, "agendar-clase-muestra");
    await d.getByRole("radio").first().check();
    paso();
    await d.getByRole("button", { name: "Agendar", exact: true }).click();
    paso();
    await expect(page.locator("[data-prueba^='clase-']").first()).toContainText("Agendada");
    await foto(page, "clase-agendada", true);
    expect(pasosPorTarea["5. agendar clase muestra"]).toBeLessThanOrEqual(META_DE_PASOS);
  });

  test("6. da seguimiento: mover de etapa con nota", async ({ page }) => {
    await page.goto(`/leads/${L.bot.id}`);
    cuenta("6. mover de etapa con nota");
    await page.getByRole("button", { name: "Mover de etapa" }).click();
    paso();
    const d = page.getByRole("dialog");
    await d.getByLabel(/^Nueva etapa/).selectOption({ label: "Etapa D" });
    paso();
    await d.getByLabel("Nota (opcional)").fill("Le llamé, quiere ver el horario de la tarde");
    await foto(page, "mover-de-etapa");
    await d.getByRole("button", { name: "Mover", exact: true }).click();
    paso();
    await expect(page.getByTestId("etapa-actual")).toContainText("Etapa D");
    await expect(page.getByTestId("historial")).toContainText("Nota: Le llamé, quiere ver el horario de la tarde");
    await foto(page, "ficha-tras-mover", true);
    expect(pasosPorTarea["6. mover de etapa con nota"]).toBeLessThanOrEqual(META_DE_PASOS);
  });

  test("7. reprograma y cancela la clase muestra", async ({ page }) => {
    await page.goto(`/leads/${L.bot.id}`);
    cuenta("7a. reprogramar clase");
    const clase = page.locator("[data-prueba^='clase-']").first();
    await clase.getByRole("button", { name: "Reprogramar" }).click();
    paso();
    const d = page.getByRole("dialog");
    await foto(page, "reprogramar-clase");
    await d.getByRole("radio").nth(1).check();
    paso();
    await d.getByRole("button", { name: "Reprogramar", exact: true }).click();
    paso();
    await expect(d).toBeHidden();
    expect(pasosPorTarea["7a. reprogramar clase"]).toBeLessThanOrEqual(META_DE_PASOS);
    cuenta("7b. cancelar clase");
    await page.locator("[data-prueba^='clase-']").filter({ hasText: "Agendada" }).getByRole("button", { name: "Cancelar" }).click();
    paso();
    await foto(page, "cancelar-clase");
    await page.getByRole("dialog").getByLabel("Motivo (opcional)").fill("Cambió de planes");
    await page.getByRole("dialog").getByRole("button", { name: "Cancelar la clase" }).click();
    paso();
    await expect(page.locator("[data-prueba^='clase-']").filter({ hasText: "Cancelada" })).toBeVisible();
    await foto(page, "clase-cancelada", true);
    expect(pasosPorTarea["7b. cancelar clase"]).toBeLessThanOrEqual(META_DE_PASOS);
  });

  test("8. cierra tareas: baja que vuelve a escribir, entrega fallida, listo para cerrar (y el lead a medias, que no genera tarea)", async ({ page }) => {
    // Lead a medias: la mamá dejó de contestar tras el nombre (nunca dio edad ni sucursal). El sistema NO crea una tarea: lo deja en Chatwoot (nota a los 30 minutos).
    const medias = contactoPorWhatsApp(L.medias.telefono, L.medias.nombre);
    for (const m of ["Hola", "Camila"]) await medias.escribe(m);
    L.medias.id = (await prisma.lead.findFirstOrThrow({ where: { telefono: "+525588001002" } })).id;
    // Una baja que vuelve a escribir: pide BAJA y luego escribe otra vez (el sistema calla y deja la tarea).
    const baja = contactoPorWhatsApp("+5215588001004", L.baja.nombre);
    for (const m of ["Hola", "Luis", "8", "Norte", "BAJA", "oye, sí quiero la clase"]) await baja.escribe(m);
    L.baja.id = (await prisma.lead.findFirstOrThrow({ where: { telefono: "+525588001004" } })).id;
    // Entrega fallida y listo para cerrar: con el texto que de verdad escribe el sistema (src/mensajeria/estados.ts, src/conversion/cierre.ts).
    const conv = await prisma.conversacion.findFirstOrThrow({ where: { lead_id: L.bot.id } });
    const entrega = await prisma.tarea_asesor.create({ data: { organizacion_id: mundo.organizacion.id, lead_id: L.bot.id, conversacion_id: conv.id, tipo: "entrega_fallida", codigo_error: 63016, descripcion: "No se pudo entregar un mensaje al contacto (código de error 63016). Revisa la conversación y, si hace falta, escríbele tú. Mensaje: «Hola Laura, te escribo para confirmar tu clase»" } });
    const listo = await prisma.tarea_asesor.create({ data: { organizacion_id: mundo.organizacion.id, lead_id: L.landing.id, tipo: "listo_para_cerrar", descripcion: "Diego terminó su clase muestra y la familia quedó lista para cerrar la inscripción. Convierte al lead (la vista previa de la conversión dice qué falta) y registra el pago." } });

    cuenta("8. tareas");
    await page.goto("/tareas");
    paso();
    await expect(page.getByRole("heading", { name: "Tareas" })).toBeVisible();
    const deEntrega = page.getByTestId(`tarea-${entrega.id}`);
    const deListo = page.getByTestId(`tarea-${listo.id}`);
    // V7-ASESOR-01: cada tarea dice DE QUÉ FAMILIA es (nombre y teléfono); antes había que abrir cada ficha para saberlo.
    await expect(deEntrega.getByTestId("familia-de-la-tarea")).toContainText(L.bot.nombre);
    await expect(deEntrega.getByTestId("familia-de-la-tarea")).toContainText("+525588001001");
    await expect(deListo.getByTestId("familia-de-la-tarea")).toContainText(L.landing.nombre);
    const deBaja = page.locator("[data-prueba^='tarea-']").filter({ hasText: "volvió a escribir" }).filter({ has: page.getByTestId("familia-de-la-tarea").filter({ hasText: L.baja.nombre }) });
    await expect(deBaja).toHaveCount(1);
    // V7-ASESOR-02: el código de error se dice una sola vez (ya viene en el texto de la tarea) y sin jerga repetida.
    await expect(deEntrega).toContainText("código de error 63016");
    await expect(deEntrega).not.toContainText("Código de error:");
    await foto(page, "tareas-pendientes", true);
    // Cerrar cada una: un clic en «Marcar como hecha».
    await deEntrega.getByRole("button", { name: "Marcar como hecha" }).click();
    paso();
    await expect(deEntrega).toHaveCount(0);
    expect(pasosPorTarea["8. tareas"]).toBeLessThanOrEqual(META_DE_PASOS);
    await deBaja.getByRole("button", { name: "Marcar como hecha" }).click();
    await expect(deBaja).toHaveCount(0);
    // «Listo para cerrar»: en un paso llega a la ficha, de ahí a convertir.
    await expect(deListo.getByRole("link", { name: "Abrir la ficha" })).toHaveAttribute("href", `/leads/${L.landing.id}`);
    await deListo.getByRole("button", { name: "Marcar como hecha" }).click();
    await expect(deListo).toHaveCount(0);
    await foto(page, "tareas-cerradas");
    await page.getByRole("tab", { name: "Resueltas" }).click();
    await expect(page.getByTestId(`tarea-${entrega.id}`)).toContainText("Hecha");
    // El lead a medias: no hay tarea, pero el embudo y la ficha DICEN qué le falta.
    await page.goto("/embudo");
    await expect(page.locator("[data-prueba^='lead-']", { hasText: L.medias.nombre }).first()).toContainText("Sin sucursal");
  });

  test("9. un lead perdido y recuperado", async ({ page }) => {
    const beta = mundo.asesor.beta;
    await page.goto("/embudo");
    cuenta("9a. perder un lead");
    const tarjeta = () => page.getByTestId(`lead-${beta.leadId}`);
    await tarjeta().getByRole("button", { name: "Mover de etapa" }).click();
    paso();
    const d = page.getByRole("dialog");
    await d.getByLabel(/^Nueva etapa/).selectOption({ label: "Etapa G" });
    paso();
    await d.getByLabel(/^Motivo de pérdida/).selectOption({ label: "Precio" });
    paso();
    await foto(page, "perder-un-lead");
    await d.getByRole("button", { name: "Mover", exact: true }).click();
    paso();
    await expect(page.getByTestId(`columna-${etapa("perdido")}`).getByTestId(`lead-${beta.leadId}`)).toBeVisible();
    // Perder es la única tarea diaria de cuatro pasos: etapa Y motivo son dos decisiones que el servidor exige (no se pueden quitar).
    expect(pasosPorTarea["9a. perder un lead"]).toBeLessThanOrEqual(META_DE_PASOS + 1);
    cuenta("9b. recuperar un lead");
    await tarjeta().getByRole("button", { name: "Mover de etapa" }).click();
    paso();
    const r = page.getByRole("dialog");
    await r.getByLabel(/^Nueva etapa/).selectOption({ label: "Etapa B" });
    paso();
    await r.getByLabel(/^Nota/).fill("Volvió a escribir");
    await foto(page, "recuperar-un-lead");
    await r.getByRole("button", { name: "Mover", exact: true }).click();
    paso();
    await expect(page.getByTestId(`columna-${etapa("contactado")}`).getByTestId(`lead-${beta.leadId}`)).toContainText("Recuperado");
    expect(pasosPorTarea["9b. recuperar un lead"]).toBeLessThanOrEqual(META_DE_PASOS);
  });

  test("10. convierte e inscribe a los dos hermanos: la fecha se teclea sin perder el foco, cada falta dice de quién es y no dice «todo listo» si falta el reglamento", async ({ page }) => {
    await page.goto(`/leads/${L.bot.id}`);
    cuenta("10. convertir e inscribir");
    await page.getByRole("link", { name: "Inscribir a los niños" }).click();
    paso();
    const main = page.locator("main");
    await foto(page, "convertir-paso-1", true);
    await main.getByLabel(/^Parentesco/).fill("Madre");
    await page.getByRole("button", { name: "Siguiente" }).click();
    paso();
    // Paso 2: dos niños sin apellidos ni fecha. V7-ASESOR-05: la falta dice de cuál es cada uno (antes: dos «Apellidos del alumno» idénticos).
    await expect(page.getByTestId("falta-en-el-paso")).toContainText("Apellidos de Sofía");
    await expect(page.getByTestId("falta-en-el-paso")).toContainText("Apellidos de Mateo");
    await expect(page.getByTestId("falta-en-el-paso")).toContainText("Fecha de nacimiento de Sofía");
    await expect(page.getByTestId("falta-en-el-paso")).not.toContainText("del alumno");
    await foto(page, "convertir-paso-2", true);
    const apellidos = main.getByLabel("Apellidos");
    await apellidos.nth(0).fill("Mamá Ruiz");
    await apellidos.nth(1).fill("Mamá Ruiz");
    // V7-ASESOR-04: teclear la fecha tecla por tecla. Al cambiar la fecha se recalcula la oferta; antes TODO el formulario se reemplazaba por «Juntando lo que ya se capturó…» y el campo
    // perdía el foco a mitad de la fecha (las teclas que seguían se perdían). Ahora el formulario no se va y el foco se queda.
    await page.evaluate(() => {
      (window as unknown as { __juntando: boolean }).__juntando = false;
      new MutationObserver(() => {
        if (document.body.textContent?.includes("Juntando lo que ya se capturó")) (window as unknown as { __juntando: boolean }).__juntando = true;
      }).observe(document.body, { childList: true, subtree: true, characterData: true });
    });
    const fecha = main.locator("input[type=date]").first();
    await fecha.click();
    await page.keyboard.type("03042019", { delay: 150 }); // mes, día y año (el orden lo pone el navegador; ver el valor abajo)
    await page.waitForTimeout(600);
    await expect(fecha).toBeFocused();
    expect(await page.evaluate(() => (window as unknown as { __juntando: boolean }).__juntando), "el formulario no se reemplaza por «Juntando…» al teclear").toBe(false);
    await expect(fecha).toHaveValue("2019-03-04");
    await foto(page, "convertir-escribiendo-la-fecha");
    await main.locator("input[type=date]").nth(1).fill("2021-02-02");
    await page.getByRole("button", { name: "Siguiente" }).click();
    paso();
    // Paso 3: el grupo de cada niño.
    await foto(page, "convertir-paso-3", true);
    for (const f of await main.locator("fieldset.grupo-opciones").all()) await f.getByRole("radio").nth(1).check();
    await page.getByRole("button", { name: "Siguiente" }).click();
    paso();
    await foto(page, "convertir-paso-4", true);
    await page.getByRole("button", { name: "Siguiente" }).click();
    paso();
    await foto(page, "convertir-paso-5", true);
    for (const c of await main.getByRole("checkbox").all()) if ((await c.isVisible()) && !(await c.isChecked())) await c.check();
    await page.getByRole("button", { name: /Revisar y confirmar/ }).click();
    paso();
    // V7-ASESOR-14: la clase muestra de esta familia se canceló en el paso 7, así que no hay dónde registrar el reglamento. La pantalla de confirmar ya NO dice «Todo listo para inscribir»
    // (antes lo decía y el servidor rechazaba al confirmar): dice qué falta y dónde se arregla. Inscribir de punta a punta está probado en conversion.spec.ts y v3-segundo-hijo.spec.ts.
    await expect(page.getByText("Todo listo para inscribir")).toHaveCount(0);
    await expect(page.getByText("Todavía falta el reglamento")).toBeVisible();
    await expect(page.getByText(/reglamento de Sofía ni de Mateo/)).toBeVisible();
    await foto(page, "convertir-confirmar", true);
    await page.getByRole("button", { name: "Convertir e inscribir" }).click();
    const rechazo = page.getByRole("alert").filter({ hasText: /reglamento/i });
    await expect(rechazo).toBeVisible();
    await expect(rechazo).toContainText("Reglamento aceptado por la familia (Sofía)");
    await expect(rechazo.getByRole("button", { name: /Volver al paso «Reglamento e imagen»/ })).toBeVisible();
    await foto(page, "convertir-rechazo-por-reglamento", true);
    // El servidor no dejó nada a medias.
    expect((await json<{ etapa: { tipo_sistema: string } }>(admin, `/api/leads/${L.bot.id}`)).etapa.tipo_sistema).not.toBe("inscrito");
    // Inscribir a una familia con dos hijos es de una vez por familia, no de todos los días: son 7 clics (cada niño exige apellidos, fecha, grupo y el reglamento). Se documenta, no se acorta.
    process.stdout.write(`PASOS DE LA CONVERSIÓN: ${pasosPorTarea["10. convertir e inscribir"]}\n`);
  });

  test("11. consulta el embudo y los estancados", async ({ page }) => {
    // Un lead propio de esta prueba, sin movimiento hace diez días en una etapa con alerta (los de las demás pruebas del mundo compartido cambian según el orden en que corran).
    const org = mundo.organizacion.id;
    const f = await prisma.lead.create({ data: { organizacion_id: org, vertical_interes_id: mundo.verticalId, sucursal_interes_id: mundo.sucursales.norte.id, etapa_id: etapa("contactado"), nombre_contacto: "Familia Estancada V7", telefono: "+525599990777", ultima_interaccion_en: new Date(Date.now() - 10 * 86_400_000) } });
    await prisma.prospecto.create({ data: { organizacion_id: org, lead_id: f.id, vertical_interes_id: mundo.verticalId, nombre: "Niño Estancado", edad_declarada: 8, origen: "asesor" } });
    await page.goto("/embudo");
    cuenta("11. estancados");
    await foto(page, "embudo-completo", true);
    // V7-ASESOR-13: el aviso concuerda en número («1 lead lleva…» / «3 leads llevan…», nunca «lead(s)»).
    const aviso = page.getByRole("alert").filter({ hasText: /días sin movimiento/ });
    await expect(aviso).toContainText(/^(1 lead lleva|\d+ leads llevan) días sin movimiento/);
    await expect(aviso).not.toContainText("(s)");
    await page.getByRole("button", { name: "Ver solo los estancados" }).click();
    paso();
    await expect(page.getByTestId(`lead-${f.id}`)).toBeVisible();
    await expect(page.getByTestId(`lead-${f.id}`)).toContainText("Sin movimiento 10 d");
    await foto(page, "solo-estancados");
    expect(pasosPorTarea["11. estancados"]).toBeLessThanOrEqual(META_DE_PASOS);
    await prisma.lead.update({ where: { id: f.id }, data: { eliminado_en: new Date() } }); // soft delete (invariante 3): para las demás pruebas nunca existió
  });

  test("12. reporte de leads: la lista se descarga para Excel desde el embudo, solo con lo que Alba ve", async ({ page }) => {
    await page.goto("/embudo");
    cuenta("12. exportar CSV");
    paso(); // el embudo
    const boton = page.getByTestId("descargar-leads");
    await expect(boton).toBeVisible();
    await expect(boton).toHaveText("Descargar lista (CSV para Excel)");
    await foto(page, "embudo-con-descarga");
    const descarga = page.waitForEvent("download");
    await boton.click();
    paso();
    const archivo = await descarga;
    expect(archivo.suggestedFilename()).toMatch(/\.csv$/);
    const ruta = await archivo.path();
    const { readFileSync } = await import("node:fs");
    const bytes = readFileSync(ruta);
    expect([bytes[0], bytes[1], bytes[2]], "UTF-8 con BOM: Excel abre bien los acentos").toEqual([0xef, 0xbb, 0xbf]);
    const texto = bytes.toString("utf8");
    expect(texto).toContain("Fecha,Contacto,Teléfono,Vertical,Sucursal,Etapa,Campaña,Fuente");
    expect(texto).toContain(L.bot.nombre);
    expect(texto).toContain(L.landing.nombre);
    // Lo que Alba no ve en pantalla (los leads de la sucursal Sur) tampoco sale en el archivo.
    expect(texto).not.toContain("Familia Delta");
    // Sin datos de salud ni identificadores internos.
    expect(texto).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/);
    expect(pasosPorTarea["12. exportar CSV"]).toBeLessThanOrEqual(META_DE_PASOS);
    // El reporte por fuente y por sucursal vive en Tableros (con su propia descarga).
    await page.goto("/tableros");
    await foto(page, "tableros");
    await expect(page.getByTestId("descargar-clases")).toBeVisible();
  });

  test("13. un lead sin sucursal: el embudo lo marca, la ficha dice qué hacer y un clic se la pone", async ({ page }) => {
    await page.goto("/embudo");
    cuenta("13. lead sin sucursal");
    const tarjeta = () => page.locator("[data-prueba^='lead-']", { hasText: L.medias.nombre }).first();
    await expect(tarjeta()).toContainText("Sin sucursal");
    await foto(page, "embudo-lead-sin-sucursal");
    await tarjeta().getByRole("link", { name: L.medias.nombre }).click();
    paso();
    await expect(page.getByRole("heading", { name: L.medias.nombre })).toBeVisible();
    // V7-ASESOR-03/12: aviso con qué hacer, falta la edad del niño y la sucursal se elige ahí mismo.
    await expect(page.getByRole("alert").filter({ hasText: "Falta la sucursal" })).toBeVisible();
    await expect(page.getByTestId("ninos")).toContainText("falta la edad");
    await foto(page, "lead-a-medias-sin-sucursal", true);
    await page.getByRole("button", { name: "Cotizar a mano" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Elígela arriba, en «Sucursal»" })).toBeVisible();
    await page.getByRole("button", { name: "Cerrar" }).click();
    const elegir = page.getByTestId("elegir-sucursal");
    await expect(elegir).toContainText("¿Cuál le queda mejor a la familia?");
    await elegir.getByRole("button", { name: mundo.sucursales.norte.nombre }).click();
    paso();
    await expect(page.getByTestId("elegir-sucursal")).toHaveCount(0);
    await expect(page.getByRole("alert").filter({ hasText: "Falta la sucursal" })).toHaveCount(0);
    await expect(page.getByText(mundo.sucursales.norte.nombre, { exact: true }).first()).toBeVisible();
    await foto(page, "lead-con-sucursal", true);
    // Quedó guardado y en el registro de cambios (una sola vez).
    expect((await json<{ sucursal: { id: string } }>(admin, `/api/leads/${L.medias.id}`)).sucursal.id).toBe(mundo.sucursales.norte.id);
    expect((await json<{ datos: unknown[] }>(admin, `/api/registro-cambios?entidad_tipo=lead&entidad_id=${L.medias.id}`)).datos).toHaveLength(1);
    expect(pasosPorTarea["13. lead sin sucursal"]).toBeLessThanOrEqual(META_DE_PASOS);
    // Con sucursal, el embudo ya no lo marca.
    await page.goto("/embudo");
    await expect(tarjeta()).not.toContainText("Sin sucursal");
    await expect(tarjeta()).toContainText("Norte");
  });

  test("14. una escuela con solo captación: la barra es corta, la ficha no promete lo que no hay y el mover de etapa lo dice", async ({ browser }) => {
    const org = await sembrarOrganizacion(prisma, "Escuela solo captación");
    await sembrarEmbudo(prisma, org);
    await fijarConfiguracion(prisma, org.organizacionId, { modulo_cotizador: false, modulo_clase_muestra: false, modulo_inscripcion: false, modulo_operacion: false, modulo_finanzas: false, modulo_tableros: false });
    const u = await sembrarUsuario(prisma, org.organizacionId, { rol: "asesor", contrasena: CONTRASENA_DE_PRUEBA, sucursales: [org.sucursales[0]!.id] });
    const f = await sembrarFamilia(prisma, org, { sucursalId: org.sucursales[0]!.id, nombre: "Niña de captación", edad: 7 });
    await prisma.lead.update({ where: { id: f.leadId }, data: { nombre_contacto: "Familia Captación" } });
    const api = await request.newContext({ baseURL: mundo.base, extraHTTPHeaders: { "x-requested-with": "prueba" } });
    expect((await api.post("/api/sesion", { data: { organizacion: org.slug, correo: u.correo, contrasena: u.contrasena } })).status()).toBe(201);
    const context = await browser.newContext({ baseURL: mundo.base, locale: "es-MX", timezoneId: "America/Mexico_City", viewport: VISTA_ESCRITORIO, storageState: await api.storageState() });
    const page = await context.newPage();
    try {
      cuenta("14. solo captación");
      await page.goto("/");
      await expect(page.getByRole("heading", { name: "Embudo" })).toBeVisible();
      const barra = page.getByRole("navigation", { name: "Secciones" }).first();
      await expect(barra.getByRole("link")).toHaveText([/Embudo/, /Tareas/]);
      await foto(page, "solo-captacion-embudo");
      await page.goto(`/leads/${f.leadId}`);
      await expect(page.getByRole("heading", { name: "Familia Captación" })).toBeVisible();
      // Nada de cotizar, clase muestra ni inscribir; lo que sí hay es mover de etapa, niños y de dónde llegó.
      await expect(page.getByRole("button", { name: /Cotizar|Agendar|Inscribir/ })).toHaveCount(0);
      await expect(page.getByRole("link", { name: /Inscribir|Convertir/ })).toHaveCount(0);
      await foto(page, "solo-captacion-ficha", true);
      await page.getByRole("button", { name: "Mover de etapa" }).click();
      // V7-ASESOR-09: la etapa de inscrito no promete un camino que no existe («se llega inscribiendo» sin inscripción activada).
      const inscrito = page.getByRole("dialog").getByRole("option", { name: /^Etapa F/ });
      await expect(inscrito).toHaveText("Etapa F (todavía no está activada la inscripción)");
      await expect(inscrito).toBeDisabled();
      await foto(page, "solo-captacion-mover");
      await page.keyboard.press("Escape");
      await page.goto("/tareas");
      await foto(page, "solo-captacion-tareas");
      await page.goto(`/leads/${f.leadId}/convertir`);
      await expect(page.getByRole("heading", { name: "No disponible" })).toBeVisible();
      await expect(page.getByRole("link", { name: "Ir a mi inicio" })).toBeVisible();
      await foto(page, "solo-captacion-convertir-directo");
    } finally {
      await context.close();
      await api.dispose();
      await prisma.organizacion.update({ where: { id: org.organizacionId }, data: { eliminado_en: new Date() } });
    }
  });
});
