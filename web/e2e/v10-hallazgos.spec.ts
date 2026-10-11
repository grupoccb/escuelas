// V10 (hallazgos abiertos): lo de pantalla que las auditorías y los recorridos de V7/V8 dejaron pendiente y que no depende de una decisión de producto. Cada prueba
// falla sin su arreglo:
//   · el maestro con «Guardar borrador» sin señal ve un aviso dentro de la barra fija (V8);
//   · con cambios sin guardar la barra de abajo del celular sigue a un toque (V8);
//   · la fecha en que la familia aceptó el reglamento es la del día local de la sucursal y se lee en español (V8);
//   · el motivo de una consulta de salud no viaja en la dirección (EB-21);
//   · un formulario enviado vacío en los otros roles muestra el mensaje propio en español, no el aviso del navegador (V7-ADMIN-32);
//   · y lo que se agregue abajo.
// Datos: el spec crea los suyos (un grupo, familias y clases propias) para no depender del orden de las demás pruebas del mundo compartido.

import type { APIRequestContext, Page } from "@playwright/test";
import { abrirSeccion, apiComo, json } from "./ayudas.ts";
import { comoRol, expect, mundo, test, VISTA_CELULAR, contextoConReloj } from "./fixtura.ts";
import { crearPrismaDePruebas, type PrismaPruebas } from "../../src/testutil/prisma-pruebas.ts";

test.setTimeout(45_000);

let prisma: PrismaPruebas;
let admin: APIRequestContext;
let grupoId = "";
let n = 0;
const org = mundo.organizacion.id;
const norte = mundo.sucursales.norte.id;
const telefonoUnico = (): string => `55${String(30_000_000 + ++n * 7919 + (Date.now() % 1_000_000)).padStart(8, "0")}`;

/** Un lead con su hijo y una clase muestra que empezó hace 90 minutos en el grupo propio de la prueba. */
async function claseNueva(nombre: string): Promise<{ leadId: string; claseId: string; prospectoId: string }> {
  const lead = await prisma.lead.create({
    data: { organizacion_id: org, vertical_interes_id: mundo.verticalId, sucursal_interes_id: norte, etapa_id: mundo.etapas["muestra_asistida"] ?? "", nombre_contacto: `Familia de ${nombre}`, telefono: `+52${telefonoUnico()}`, ultima_interaccion_en: new Date() },
  });
  const prospecto = await prisma.prospecto.create({ data: { organizacion_id: org, lead_id: lead.id, vertical_interes_id: mundo.verticalId, nombre, edad_declarada: 8, origen: "asesor" } });
  const cuando = new Date(Math.floor((Date.now() - 90 * 60_000) / 60_000) * 60_000);
  const clase = await prisma.clase_muestra.create({
    data: { organizacion_id: org, lead_id: lead.id, prospecto_id: prospecto.id, grupo_id: grupoId, fecha_hora: cuando, estatus: "agendada", agendada_por: "usuario", agendada_por_usuario_id: mundo.usuarios.administrador.id },
  });
  return { leadId: lead.id, claseId: clase.id, prospectoId: prospecto.id };
}

test.beforeAll(async () => {
  prisma = crearPrismaDePruebas(process.env["DATABASE_URL"], 4);
  admin = await apiComo("administrador");
  const programa = await prisma.programa.findFirstOrThrow({ where: { organizacion_id: org, nombre: "Programa de prueba" } });
  const g = await prisma.grupo.create({ data: { organizacion_id: org, programa_id: programa.id, nombre: "Grupo V10", cupo_maximo: 30, instructor_id: mundo.instructorId } });
  for (const dia of [0, 1, 2, 3, 4, 5, 6]) await prisma.grupo_horario.create({ data: { organizacion_id: org, grupo_id: g.id, dia_semana: dia, hora_inicio_min: 1080, hora_fin_min: 1140 } });
  grupoId = g.id;
});
test.afterAll(async () => {
  await prisma.grupo.update({ where: { id: grupoId }, data: { activo: false } }).catch(() => undefined);
  await prisma.$disconnect();
  await admin.dispose();
});


/** ¿La barra de abajo del celular se ve y se puede tocar? El centro de su primer enlace es el enlace mismo y no otra cosa encima (ni escondida con `display: none`). */
async function barraSeToca(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const el = document.querySelector(".barra-inferior a");
    if (!el || getComputedStyle(el.closest(".barra-inferior")!).display === "none") return false;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) return false;
    const encima = document.elementFromPoint(x, y);
    return encima === el || el.contains(encima);
  });
}

test.describe("maestro en el celular", () => {
  test.describe.configure({ mode: "serial" });
  test.use({ ...comoRol("maestro"), viewport: VISTA_CELULAR, hasTouch: true, isMobile: true });

  test("V8: la barra de abajo sigue a un toque con el registro a medio llenar y solo se esconde cuando hay un teclado de verdad (la pantalla visible se achicó)", async ({ page }) => {
    const f = await claseNueva("Teclado");
    await page.goto(`/clases/${f.claseId}/registro`);
    const a = await abrirSeccion(page, "alumno");
    expect(await barraSeToca(page), "al abrir").toBe(true);
    // Escribe (el foco se queda en el campo) sin teclado de pantalla: hay cambios sin guardar y la barra sigue a la vista.
    await a.getByLabel("Escuela", { exact: true }).fill("Escuela del recorrido");
    await expect(a).toContainText("Sin guardar");
    expect(await page.evaluate(() => document.activeElement?.tagName), "el foco sigue en el campo").toBe("INPUT");
    expect(await barraSeToca(page), "con cambios sin guardar y el foco en un campo, sin teclado").toBe(true);
    // El teclado sube (la pantalla visible se queda en unos 430 px): ahora sí se esconde, y el botón de guardar de la sección sigue a la vista.
    await page.setViewportSize({ width: 390, height: 430 });
    await expect.poll(() => barraSeToca(page)).toBe(false);
    // Lo baja (la pantalla vuelve a su tamaño) sin tocar fuera del campo: la barra regresa sola.
    await page.setViewportSize(VISTA_CELULAR);
    await expect.poll(() => barraSeToca(page)).toBe(true);
    expect(await page.evaluate(() => document.activeElement?.tagName), "y el campo conserva el foco").toBe("INPUT");
  });

  test("V8: «Guardar borrador» sin señal avisa DENTRO de la barra fija que no se guardó nada y que lo escrito sigue ahí; con señal guarda una vez", async ({ page }) => {
    const f = await claseNueva("Sin señal");
    await page.goto(`/clases/${f.claseId}/registro`);
    const a = await abrirSeccion(page, "alumno");
    await a.getByLabel("Escuela", { exact: true }).fill("Escuela sin señal");
    let intentos = 0;
    await page.route("**/api/clases-muestra/*/registro", (r) => {
      if (r.request().method() !== "PATCH") return r.continue();
      intentos += 1;
      return r.abort("internetdisconnected");
    });
    await page.getByRole("button", { name: "Guardar borrador" }).click();
    const aviso = page.getByTestId("error-del-borrador");
    await expect(aviso).toBeVisible();
    await expect(aviso).toContainText("No hay conexión con el servidor");
    await expect(aviso).toContainText("No se guardó nada todavía");
    await expect(aviso).toContainText("lo que escribiste sigue aquí");
    await expect(aviso).not.toContainText("Revisa la sección");
    // El aviso está en pantalla y no tapado por ninguna barra.
    expect(await aviso.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const encima = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return r.top >= 0 && r.bottom <= innerHeight && (encima === el || el.contains(encima));
    }), "el aviso se ve entero y nada lo tapa").toBe(true);
    await expect(a.getByLabel("Escuela", { exact: true })).toHaveValue("Escuela sin señal");
    // Vuelve la señal: guarda UNA vez y el aviso desaparece.
    await page.unroute("**/api/clases-muestra/*/registro");
    await page.getByRole("button", { name: "Guardar borrador" }).click();
    await expect(page.getByText("Todo guardado.")).toBeVisible();
    await expect(aviso).toHaveCount(0);
    expect(intentos).toBe(1);
    const r = await json<{ alumno: { escuela: string } }>(admin, `/api/clases-muestra/${f.claseId}/registro`);
    expect(r.alumno.escuela).toBe("Escuela sin señal");
  });
});

// ── Orden de los títulos (EK-26: heading-order) ─────────────────────────────────────────────────────────────
// En cada pantalla, los títulos (h1 … h6) en el orden de la página no se saltan un nivel hacia abajo (de h1 a h3): un lector de pantalla los usa como índice.

const RUTAS_POR_ROL: Record<"administrador" | "asesor" | "maestro" | "recepcion", string[]> = {
  administrador: ["/embudo", "/tareas", "/pagos", "/cuenta", "/uniformes", "/ventas", "/corte", "/alumnos", "/familias", "/familias/un-solo-hijo", "/tableros", "/mas", "/admin", "/admin/verticales", "/admin/sucursales", "/admin/programas", "/admin/grupos", "/admin/instructores", "/admin/precios", "/admin/promociones", "/admin/canales", "/admin/campanas", "/admin/configuracion", "/admin/plantillas", "/admin/automatizaciones", "/admin/usuarios", "/admin/modulos", "/admin/textos", "/admin/etapas", "/admin/catalogo", "/admin/motivos", "/admin/bandeja"],
  asesor: ["/embudo", "/tareas", "/alumnos", "/familias", "/mas"],
  maestro: ["/hoy", "/pase", "/alumnos", "/mas"],
  recepcion: ["/pagos", "/cuenta", "/uniformes", "/ventas", "/corte", "/alumnos", "/familias", "/mas"],
};

async function saltosDeTitulo(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const visibles = [...document.querySelectorAll("h1, h2, h3, h4, h5, h6")].filter((h) => {
      const r = (h as HTMLElement).getBoundingClientRect();
      return getComputedStyle(h).display !== "none" && getComputedStyle(h).visibility !== "hidden" && (r.width > 0 || r.height > 0);
    });
    const saltos: string[] = [];
    let previo = 0;
    for (const h of visibles) {
      const nivel = Number(h.tagName.slice(1));
      if (previo !== 0 && nivel > previo + 1) saltos.push(`h${previo} → h${nivel} «${(h.textContent ?? "").trim().slice(0, 50)}»`);
      if (previo === 0 && nivel > 1) saltos.push(`la página empieza en h${nivel} «${(h.textContent ?? "").trim().slice(0, 50)}»`);
      previo = nivel;
    }
    return saltos;
  });
}

for (const rol of ["administrador", "asesor", "maestro", "recepcion"] as const) {
  test.describe(`orden de los títulos · ${rol}`, () => {
    test.use({ ...comoRol(rol) });
    test(`ninguna pantalla de ${rol} salta de nivel`, async ({ page }) => {
      const problemas: string[] = [];
      for (const ruta of RUTAS_POR_ROL[rol]) {
        await page.goto(ruta);
        await page.waitForLoadState("networkidle");
        for (const s of await saltosDeTitulo(page)) problemas.push(`${ruta}: ${s}`);
      }
      expect(problemas, "títulos que se saltan un nivel").toEqual([]);
    });
  });
}

test.describe("orden de los títulos · pantallas con un identificador", () => {
  test("registro del alumno (maestro, con todas las secciones abiertas), ficha del lead y conversión (asesor), expediente y ficha de la familia (administrador)", async ({ browser, baseURL }) => {
    const problemas: string[] = [];
    const revisar = async (rol: "administrador" | "asesor" | "maestro", ruta: string, abrir?: (p: Page) => Promise<void>): Promise<void> => {
      const context = await contextoConReloj(browser, { baseURL: baseURL!, storageState: comoRol(rol).storageState, viewport: VISTA_CELULAR });
      const page = await context.newPage();
      await page.goto(ruta);
      await page.waitForLoadState("networkidle");
      if (abrir) await abrir(page);
      for (const s of await saltosDeTitulo(page)) problemas.push(`${rol} ${ruta.replace(/[0-9a-f-]{36}/g, ":id")}: ${s}`);
      await context.close();
    };
    const f = await claseNueva("Títulos");
    await revisar("maestro", `/clases/${f.claseId}/registro`, async (page) => {
      for (const id of ["alumno", "tutores", "salud", "antecedentes", "observacion", "legal"]) await abrirSeccion(page, id);
    });
    await revisar("asesor", `/leads/${f.leadId}`);
    await revisar("asesor", `/leads/${f.leadId}/convertir`);
    const alumno = (await json<{ datos: { id: string }[] }>(admin, "/api/alumnos?limite=1")).datos[0]!;
    await revisar("administrador", `/alumnos/${alumno.id}`);
    await revisar("administrador", `/alumnos/${alumno.id}/salud`);
    const tutor = (await json<{ datos: { id: string }[] }>(admin, "/api/tutores?limite=1")).datos[0]!;
    await revisar("administrador", `/familias/${tutor.id}`);
    await revisar("administrador", `/cuenta/${tutor.id}`);
    expect(problemas, "títulos que se saltan un nivel").toEqual([]);
  });
});

// ── Pestañas accesibles (EK-26) ────────────────────────────────────────────────────────────────────────────

test.describe("pestañas accesibles", () => {
  test.use({ ...comoRol("administrador") });

  /** Cada pestaña apunta a su panel, solo la elegida entra con Tab y el panel de la elegida se nombra con su pestaña. */
  async function pestanasBienEnlazadas(page: Page): Promise<string[]> {
    return page.evaluate(() => {
      const problemas: string[] = [];
      for (const lista of document.querySelectorAll('[role="tablist"]')) {
        const nombre = lista.getAttribute("aria-label") ?? "(sin nombre)";
        const tabs = [...lista.querySelectorAll('[role="tab"]')] as HTMLElement[];
        const elegidas = tabs.filter((t) => t.getAttribute("aria-selected") === "true");
        if (elegidas.length !== 1) problemas.push(`${nombre}: ${elegidas.length} pestañas elegidas`);
        for (const t of tabs) {
          const elegida = t.getAttribute("aria-selected") === "true";
          if (!t.id) problemas.push(`${nombre}: una pestaña sin id`);
          if (!t.getAttribute("aria-controls")) problemas.push(`${nombre}: «${t.textContent}» sin aria-controls`);
          if (t.tabIndex !== (elegida ? 0 : -1)) problemas.push(`${nombre}: «${t.textContent}» tiene tabindex ${t.tabIndex} y debería tener ${elegida ? 0 : -1}`);
          if (elegida) {
            const panel = document.getElementById(t.getAttribute("aria-controls") ?? "");
            if (!panel) problemas.push(`${nombre}: el panel de «${t.textContent}» no existe`);
            else {
              if (panel.getAttribute("role") !== "tabpanel") problemas.push(`${nombre}: el panel no tiene role=tabpanel`);
              if (panel.getAttribute("aria-labelledby") !== t.id) problemas.push(`${nombre}: el panel no se nombra con su pestaña`);
              if (panel.tabIndex !== 0) problemas.push(`${nombre}: el panel no recibe el foco con Tab`);
            }
          }
        }
      }
      return problemas;
    });
  }

  test("tareas, embudo y expediente: pestañas enlazadas con su panel (Tableros ya no tiene pestañas: sus secciones son un índice de la misma página, R3b-A)", async ({ page }) => {
    const alumno = (await json<{ datos: { id: string }[] }>(admin, "/api/alumnos?limite=1")).datos[0]!;
    for (const ruta of ["/tareas", "/embudo", `/alumnos/${alumno.id}`]) {
      await page.goto(ruta);
      await expect(page.locator('[role="tab"]').first()).toBeVisible();
      expect(await page.locator('[role="tablist"]').count(), `${ruta}: tiene pestañas`).toBeGreaterThan(0);
      expect(await pestanasBienEnlazadas(page), ruta).toEqual([]);
    }
  });

  test("con el teclado: las flechas, Inicio y Fin cambian de pestaña y llevan el foco; Tab pasa de la pestaña al panel", async ({ page }) => {
    await page.goto("/tareas");
    const pendientes = page.getByRole("tab", { name: "Pendientes" });
    const resueltas = page.getByRole("tab", { name: "Resueltas" });
    await expect(pendientes).toHaveAttribute("aria-selected", "true");
    await pendientes.focus();
    await page.keyboard.press("ArrowRight");
    await expect(resueltas).toHaveAttribute("aria-selected", "true");
    await expect(resueltas).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(pendientes, "da la vuelta").toHaveAttribute("aria-selected", "true");
    await expect(pendientes).toBeFocused();
    await page.keyboard.press("End");
    await expect(resueltas).toBeFocused();
    await page.keyboard.press("Home");
    await expect(pendientes).toBeFocused();
    // Tab sale de la lista de pestañas (la otra tiene tabindex -1) y cae en el panel.
    await page.keyboard.press("Tab");
    await expect(page.getByRole("tabpanel")).toBeFocused();
  });
});

// ── El motivo de una consulta de salud no viaja en la dirección (EB-21) ──────────────────────────────────

test.describe("motivo de la consulta de salud", () => {
  test.use({ ...comoRol("administrador") });
  test("la pantalla manda el motivo (con acentos) en una cabecera y la dirección no lo lleva; el registro de accesos lo guarda completo", async ({ page }) => {
    const alumno = (await json<{ datos: { id: string }[] }>(admin, "/api/alumnos?limite=1")).datos[0]!;
    const peticiones: { url: string; cabecera: string | undefined }[] = [];
    page.on("request", (r) => {
      if (r.url().includes("/api/salud/")) peticiones.push({ url: r.url(), cabecera: r.headers()["x-motivo-de-consulta"] });
    });
    await page.goto(`/alumnos/${alumno.id}/salud`);
    const frase = "Revisión de la niña antes de la clase";
    await page.getByLabel("Motivo de la consulta").fill(frase);
    await page.getByRole("button", { name: "Ver datos de salud" }).click();
    await expect(page.getByTestId("ficha-de-salud")).toBeVisible();
    expect(peticiones).toHaveLength(1);
    expect(peticiones[0]!.url, "la dirección no lleva el motivo").not.toMatch(/motivo|Revisi/i);
    expect(decodeURIComponent(peticiones[0]!.cabecera ?? "")).toBe(frase);
    const accesos = await json<{ datos: { accion: string; resultado: string; motivo: string }[] }>(admin, `/api/salud-accesos?sujeto_id=${alumno.id}`);
    expect(accesos.datos.some((a) => a.accion === "leer" && a.resultado === "permitido" && a.motivo === frase)).toBe(true);
  });
});

// ── El foco acompaña al cambio de pantalla (EK-26) ──────────────────────────────────────────────────────

test.describe("foco al navegar", () => {
  test.use({ ...comoRol("asesor") });
  test("al pasar de una sección a otra el foco llega al contenido nuevo (no se queda en el enlace de la barra)", async ({ page }) => {
    await page.goto("/embudo");
    await expect(page.getByRole("heading", { level: 1, name: "Embudo" })).toBeVisible();
    await page.getByRole("navigation", { name: "Secciones" }).first().getByRole("link", { name: /Tareas/ }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Tareas" })).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.activeElement?.id)).toBe("contenido");
    // Un cambio que no es de pantalla (cambiar de pestaña dentro de ella) no mueve el foco.
    await page.getByRole("tab", { name: "Resueltas" }).focus();
    await page.getByRole("tab", { name: "Resueltas" }).click();
    expect(await page.evaluate(() => document.activeElement?.getAttribute("role"))).toBe("tab");
  });
});

// ── La ficha dice dónde está el resumen del asistente (V7-ASESOR-19) ──────────────────────────────────

test.describe("ficha del lead", () => {
  test.use({ ...comoRol("asesor") });
  test("un lead con conversación de WhatsApp avisa que el resumen del asistente también está en Chatwoot; uno sin conversación no", async ({ page }) => {
    const sin = await claseNueva("Sin conversación");
    await page.goto(`/leads/${sin.leadId}`);
    await expect(page.getByRole("heading", { level: 2, name: "De dónde llegó" })).toBeVisible();
    await expect(page.getByTestId("aviso-resumen-del-asistente")).toHaveCount(0);
    // Con conversación (la sembramos directo, como la deja el bot).
    const con = await claseNueva("Con conversación");
    const bandeja = await prisma.bandeja_chatwoot.findFirstOrThrow({ where: { organizacion_id: org } });
    await prisma.conversacion.create({ data: { organizacion_id: org, lead_id: con.leadId, bandeja_chatwoot_id: bandeja.id, chatwoot_conversacion_id: 900_000 + n, estado: "bot" } });
    await page.goto(`/leads/${con.leadId}`);
    await expect(page.getByTestId("aviso-resumen-del-asistente")).toContainText("nota privada");
  });
});

// ── Cambiar la zona de una sucursal avisa que lo ya programado no se mueve (EK-25) ────────────────────

test.describe("zona horaria de la sucursal", () => {
  test.use({ ...comoRol("administrador") });
  test("al elegir otra zona la ayuda dice que lo ya programado conserva la hora anterior; sin cambiarla, no lo dice", async ({ page }) => {
    await page.goto("/admin/sucursales");
    await page.getByTestId(`sucursal-${norte}`).getByRole("button", { name: "Editar" }).click();
    const dialogo = page.getByRole("dialog");
    await expect(dialogo).toContainText("Decide a qué hora salen los mensajes automáticos");
    await expect(dialogo).not.toContainText("conserva la hora de la zona anterior");
    const zona = dialogo.getByLabel("Zona horaria");
    const actual = await zona.inputValue();
    const otra = (await zona.locator("option").evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value))).find((v) => v !== actual)!;
    await zona.selectOption(otra);
    await expect(dialogo).toContainText("lo que ya está programado conserva la hora de la zona anterior");
    await zona.selectOption(actual);
    await expect(dialogo).not.toContainText("conserva la hora de la zona anterior");
  });
});
