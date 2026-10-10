// V7 (administrador): el día de Adela, administradora de la escuela, en la computadora de la oficina (1366×768), con la revisión de tableta y celular de las pantallas que más usa,
// como alguien que nunca vio el sistema. El guion está en `docs/capturas/v1/v7-administrador/ARGUMENTO.md`. Cada pantalla relevante deja una captura `<fase>-NN-<nombre>.png` en esa
// carpeta (`FASE=antes` antes de corregir, `FASE=despues` —lo normal— ya corregido). Sin credenciales y sin salir del origen (la fixtura aborta cualquier otra petición).
//
// Datos: el spec crea los suyos (una disciplina, una sucursal, un programa, grupos, usuarios, una campaña…) y los da de baja al terminar; lo que cambia del mundo compartido (módulos,
// configuración, una automatización) lo deja como estaba. Corre ANTES que los otros recorridos (`v7-a…`), así que no toca sus datos.

import { request, type APIRequestContext, type Locator, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { apiComo, json, mananaEnMexico } from "./ayudas.ts";
import { comoRol, contextoNuevo as contextoNuevoBase, expect as expectBase, mundo, test, VISTA_ESCRITORIO, contextoConReloj } from "./fixtura.ts";
import { carpetaDeCapturas } from "./mundo.ts";
import { hashContrasena, PARAMETROS_PRUEBA } from "../../src/auth/contrasena.ts";
import { crearPrismaDePruebas, type PrismaPruebas } from "../../src/testutil/prisma-pruebas.ts";

const FASE = process.env["FASE"] === "antes" ? "antes" : "despues";
// Antes de corregir, lo que todavía no existe se anota en vez de esperar los 10 s de siempre.
const expect = FASE === "antes" ? expectBase.configure({ timeout: 2500 }) : expectBase;

test.use({ ...comoRol("administrador"), viewport: VISTA_ESCRITORIO, ...(FASE === "antes" ? { actionTimeout: 4000 } : {}) });

/** Un contexto aparte; antes de corregir también con esperas cortas en lo que todavía no existe. */
const contextoNuevo: typeof contextoNuevoBase = async (...args) => {
  const c = await contextoNuevoBase(...args);
  if (FASE === "antes") c.page.setDefaultTimeout(4000);
  return c;
};
test.describe.configure({ mode: "serial" });
test.setTimeout(FASE === "antes" ? 240_000 : 90_000);

const CARPETA = carpetaDeCapturas("v1/v7-administrador");
/** El número de la prueba en curso (su título empieza con él): las capturas se emparejan «antes/después» por prueba y nombre, aunque en una fase salgan más o menos. */
let pruebaActual = "00";
test.beforeEach(({ baseURL: _origen }, info) => {
  pruebaActual = (/^(\d+)/.exec(info.title)?.[1] ?? "0").padStart(2, "0");
});

/** Una captura numerada de lo que ve Adela. `completa`: toda la página. */
async function foto(page: Page, nombre: string, completa = false): Promise<void> {
  mkdirSync(CARPETA, { recursive: true });
  const original = page.viewportSize();
  await page.waitForLoadState("networkidle", { timeout: 4000 }).catch(() => undefined);
  if (completa && original) {
    const alto = await page.evaluate(() => document.documentElement.scrollHeight);
    await page.setViewportSize({ width: original.width, height: Math.min(Math.max(alto, original.height), 4500) });
    await page.waitForTimeout(150);
  }
  await page.screenshot({ path: resolve(CARPETA, `${FASE}-${pruebaActual}-${nombre}.png`), animations: "disabled" });
  if (original) await page.setViewportSize(original);
}

/** Pasos (clics o elecciones) de una tarea diaria; escribir en un campo no cuenta. Meta: 3 o menos. */
const pasosPorTarea: Record<string, number> = {};
let tareaActual = "";
const cuenta = (tarea: string): void => {
  tareaActual = tarea;
  pasosPorTarea[tarea] = 0;
};
const paso = (n = 1): void => {
  pasosPorTarea[tareaActual] = (pasosPorTarea[tareaActual] ?? 0) + n;
};

const hallazgos: string[] = [];
/** Una expectativa de lo corregido en V7: antes de corregir solo anota que NO se cumple; ya corregido, falla la prueba si no se cumple. */
async function corregido(hallazgo: string, comprobar: () => Promise<void>): Promise<void> {
  if (FASE !== "antes") return comprobar();
  await comprobar().catch(() => {
    hallazgos.push(hallazgo);
  });
}

/** Lo que Adela no debería leer nunca: identificadores, códigos, inglés técnico, plurales a medias. */
const JERGA = /\b[0-9a-f]{8}-[0-9a-f]{4}-|undefined|\bnull\b|\bNaN\b|\[object|payload|UUID|soft delete|\bJSON\b|\bAPI\b|\bPOST \/|\bPATCH\b|America\/|Europe\/|\butility\b|\bauthentication\b|\bes_MX\b|\(es\)|\(s\)|\bintento\(s\)|\b1 (mensajes|inscripciones|leads|alumnos inscritos|clases muestra)\b|Failed|Please fill|\bError:|exception/i;

/** Los textos de lo que está a la vista dentro de `main` (sin la barra lateral ni el encabezado). */
const leer = (page: Page): Promise<string> => page.locator("main").innerText();
const dialogo = (page: Page): Locator => page.getByRole("dialog");
const aviso = (page: Page): Locator => page.getByTestId("aviso-global");

let prisma: PrismaPruebas;
let admin: APIRequestContext;
const org = mundo.organizacion.id;
const dia = (d = new Date()): string => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

// Lo que el recorrido crea (y da de baja al terminar).
const DISCIPLINA = "Natación";
const SUCURSAL = "Sucursal Poniente";
const PROGRAMA = "Natación infantil";
const CORREOS = { asesor: "v7a.asesora@escuela.test", maestro: "v7a.maestro@escuela.test", recepcion: "v7a.recepcion@escuela.test", segundo: "v7a.segundo.admin@escuela.test" } as const;
const CONTRASENA = "Contrasena-v7-admin-1";
const ids = {} as { vertical: string; sucursal: string; programa: string; grupo: string; salon: string; instructor: string; campana: string; plantilla: string };

/** Lo que el mundo compartido tenía antes del recorrido, para dejarlo igual. */
let configuracionOriginal: Record<string, unknown> = {};
let automatizacionOriginal: { offset_minutos: number; hora_inicio_min: number; hora_fin_min: number } | null = null;

test.beforeAll(async () => {
  prisma = crearPrismaDePruebas(process.env["DATABASE_URL"], 4);
  admin = await apiComo("administrador");
  const c = await json<Record<string, unknown>>(admin, "/api/configuracion");
  configuracionOriginal = { horario_envio_inicio_min: c["horario_envio_inicio_min"], horario_envio_fin_min: c["horario_envio_fin_min"], modo_cierre: c["modo_cierre"] };
  const autos = await json<{ datos: { id: string; offset_minutos: number; hora_inicio_min: number; hora_fin_min: number }[] }>(admin, "/api/automatizaciones?limite=50");
  automatizacionOriginal = autos.datos.find((a) => a.id === mundo.mensajeria.automatizaciones.pagoAtrasado.id) ?? null;
});

async function restaurarModulos(): Promise<void> {
  const r = await admin.put("/api/modulos", { data: { cotizador: true, clase_muestra: true, inscripcion: true, operacion: true, finanzas: true } });
  expect(r.status(), await r.text()).toBe(200);
  const t = await admin.put("/api/modulos", { data: { tableros: true } });
  expect(t.status(), await t.text()).toBe(200);
}

test.afterAll(async () => {
  // El mundo compartido queda como estaba: módulos, configuración y la automatización de pago atrasado.
  await restaurarModulos().catch(() => undefined);
  if (automatizacionOriginal) await admin.patch(`/api/automatizaciones/${mundo.mensajeria.automatizaciones.pagoAtrasado.id}`, { data: { offset_minutos: automatizacionOriginal.offset_minutos, hora_inicio_min: automatizacionOriginal.hora_inicio_min, hora_fin_min: automatizacionOriginal.hora_fin_min } }).catch(() => undefined);
  await admin.patch("/api/configuracion", { data: configuracionOriginal }).catch(() => undefined);
  // Lo creado se da de baja en el orden que piden las reglas (grupos → programas → salones/instructores → sucursales → disciplina → campañas → plantilla → promociones).
  const grupos = await json<{ datos: { id: string; programa: { id: string } }[] }>(admin, "/api/grupos?limite=100").catch(() => ({ datos: [] }));
  for (const g of grupos.datos.filter((x) => x.programa.id === ids.programa)) await admin.delete(`/api/grupos/${g.id}`);
  const programas = await json<{ datos: { id: string; nombre: string; sucursal_id: string }[] }>(admin, "/api/programas?limite=100").catch(() => ({ datos: [] }));
  for (const p of programas.datos.filter((x) => x.sucursal_id === ids.sucursal)) await admin.delete(`/api/programas/${p.id}`);
  const salones = await json<{ datos: { id: string; sucursal_id: string }[] }>(admin, "/api/salones?limite=100").catch(() => ({ datos: [] }));
  for (const s of salones.datos.filter((x) => x.sucursal_id === ids.sucursal)) await admin.delete(`/api/salones/${s.id}`);
  const instructores = await json<{ datos: { id: string; nombre: string }[] }>(admin, "/api/instructores?limite=100").catch(() => ({ datos: [] }));
  for (const i of instructores.datos.filter((x) => x.nombre === "Irma Instructora")) await admin.delete(`/api/instructores/${i.id}`);
  if (ids.sucursal) {
    await admin.delete(`/api/sucursales/${ids.sucursal}/verticales/${ids.vertical}`).catch(() => undefined);
    await admin.delete(`/api/sucursales/${ids.sucursal}`).catch(() => undefined);
  }
  if (ids.vertical) await admin.delete(`/api/verticales/${ids.vertical}`).catch(() => undefined);
  const campanas = await json<{ datos: { id: string; nombre: string }[] }>(admin, "/api/campanas?limite=100").catch(() => ({ datos: [] }));
  for (const c of campanas.datos.filter((x) => x.nombre.startsWith("Campaña V7 admin"))) {
    const codigos = await json<{ datos: { id: string }[] }>(admin, `/api/codigos-rastreo?campana_id=${c.id}&limite=100`).catch(() => ({ datos: [] }));
    for (const k of codigos.datos) await admin.delete(`/api/codigos-rastreo/${k.id}`);
    await admin.delete(`/api/campanas/${c.id}`);
  }
  const plantillas = await json<{ datos: { id: string; codigo: string }[] }>(admin, "/api/plantillas?limite=100").catch(() => ({ datos: [] }));
  for (const p of plantillas.datos.filter((x) => x.codigo === "aviso_v7_admin")) await admin.delete(`/api/plantillas/${p.id}`);
  const promos = await json<{ datos: { id: string; codigo: string }[] }>(admin, "/api/promociones?limite=100").catch(() => ({ datos: [] }));
  for (const p of promos.datos.filter((x) => x.codigo.startsWith("V7ADM"))) await admin.delete(`/api/promociones/${p.id}`);
  if (FASE === "antes") {
    mkdirSync(CARPETA, { recursive: true });
    writeFileSync(resolve(CARPETA, "hallazgos-antes.txt"), `${hallazgos.join("\n")}\n\nPasos por tarea:\n${JSON.stringify(pasosPorTarea, null, 2)}\n`);
  }
  // eslint-disable-next-line no-console -- el resumen del recorrido es parte de la evidencia
  console.log(`\n[V7 administrador · ${FASE}] hallazgos medidos: ${hallazgos.length}\n${hallazgos.map((h) => ` - ${h}`).join("\n")}\npasos por tarea: ${JSON.stringify(pasosPorTarea)}`);
  await admin.dispose();
  await prisma.$disconnect();
});

/** Lo ilegible o inalcanzable de la pantalla de ahora: desborde horizontal, objetivos táctiles de menos de 44 px y campos con letra de menos de 16 px. */
interface Medidas {
  ancho: number;
  anchoDelDocumento: number;
  chicos: string[];
  letraChica: string[];
}
async function medir(page: Page): Promise<Medidas> {
  return page.evaluate(() => {
    const visible = (e: Element): boolean => {
      const r = e.getBoundingClientRect();
      const st = getComputedStyle(e);
      return r.width > 0 && r.height > 0 && st.visibility !== "hidden" && st.display !== "none";
    };
    const nombre = (e: Element): string => ((e as HTMLElement).getAttribute("aria-label") || (e as HTMLElement).innerText || e.textContent || e.tagName).trim().replace(/\s+/g, " ").slice(0, 40);
    const chicos: string[] = [];
    for (const e of document.querySelectorAll("button, a[href], summary, select, input:not([type=hidden]), textarea")) {
      if (!visible(e) || e.closest(".salto")) continue;
      let objetivo: Element = e;
      if (e.matches("input[type=checkbox], input[type=radio]")) {
        if (e.closest("label.opcion")) continue;
        objetivo = e.closest("label") ?? document.querySelector(`label[for="${e.id}"]`) ?? e;
      }
      const r = objetivo.getBoundingClientRect();
      if (r.height < 43.5 || r.width < 43.5) chicos.push(`${objetivo.tagName.toLowerCase()} «${nombre(objetivo)}» ${Math.round(r.width)}×${Math.round(r.height)}`);
    }
    const letraChica = [...document.querySelectorAll("input:not([type=checkbox]):not([type=radio]), select, textarea")].filter(visible).filter((e) => parseFloat(getComputedStyle(e).fontSize) < 16).map((e) => nombre(e));
    return { ancho: document.documentElement.clientWidth, anchoDelDocumento: document.documentElement.scrollWidth, chicos, letraChica };
  });
}

/** ¿Está el elemento por completo dentro de lo que se ve de la ventana (sin bajar)? */
async function aLaVista(l: Locator): Promise<boolean> {
  const caja = await l.boundingBox();
  const alto = l.page().viewportSize()?.height ?? 0;
  return caja !== null && caja.y >= 0 && caja.y + caja.height <= alto;
}

/** Inicia sesión por la pantalla de acceso en un contexto nuevo. */
async function entrarComo(browser: Parameters<typeof contextoNuevo>[0], baseURL: string, correo: string, contrasena: string, vista: "escritorio" | "celular" = "escritorio", escuela?: string) {
  const c = await contextoNuevo(browser, baseURL, vista, null);
  await c.context.clearCookies(); // el contexto hereda la sesión del archivo (test.use): se parte sin ella
  await c.page.goto("/");
  await c.page.getByLabel("Correo").fill(correo);
  await c.page.getByLabel("Contraseña").fill(contrasena);
  if (escuela) await c.page.getByLabel(/^Escuela/).fill(escuela);
  await c.page.getByRole("button", { name: "Entrar" }).click();
  return c;
}

/** El estado de la sesión por la API con las credenciales dadas (201 = entró). */
async function intentarEntrar(correo: string, contrasena: string): Promise<number> {
  const c = await request.newContext({ baseURL: mundo.base });
  const r = await c.post("/api/sesion", { data: { organizacion: mundo.organizacion.slug, correo, contrasena }, headers: { "x-requested-with": "prueba" } });
  await c.dispose();
  return r.status();
}

const RUTAS_DE_ADMINISTRACION = ["/admin", "/admin/catalogo", "/admin/verticales", "/admin/sucursales", "/admin/programas", "/admin/grupos", "/admin/instructores", "/admin/precios", "/admin/promociones", "/admin/canales", "/admin/campanas", "/admin/modulos", "/admin/configuracion", "/admin/textos", "/admin/etapas", "/admin/motivos", "/admin/plantillas", "/admin/automatizaciones", "/admin/usuarios", "/admin/bandeja", "/tableros", "/mas"];

test.describe("el primer día de una escuela nueva", () => {
  test("1. entra a Administración: ¿se entiende qué hay y por dónde seguir? ¿se encuentra una pantalla sin recorrer la lista?", async ({ browser, baseURL }) => {
    const c = await contextoNuevo(browser, baseURL!, "escritorio", null);
    await c.context.clearCookies();
    const p = c.page;
    cuenta("1. entrar y llegar a Administración");
    await p.goto("/");
    await foto(p, "acceso");
    await p.getByLabel("Correo").fill(mundo.usuarios.administrador.correo);
    await p.getByLabel("Contraseña").fill(mundo.usuarios.administrador.contrasena);
    await p.getByRole("button", { name: "Entrar" }).click();
    paso();
    await expect(p.getByTestId("usuario")).toContainText(mundo.usuarios.administrador.nombre);
    await foto(p, "inicio-al-entrar");
    await p.getByRole("link", { name: "Administración" }).first().click();
    paso();
    await expect(p.getByRole("heading", { name: "Administración", level: 1 })).toBeVisible();
    await foto(p, "administracion-inicio", true);
    await corregido("Administración no dice por dónde empezar (no hay lista de primeros pasos)", async () => {
      await expect(p.getByTestId("primeros-pasos")).toBeVisible();
      // Con la escuela lista los pasos se pliegan en una línea (y se abren con «Ver los pasos»).
      const detalles = p.getByTestId("primeros-pasos").locator("details");
      if ((await detalles.getAttribute("open")) === null) await detalles.locator("summary").click();
      await expect(p.getByTestId("primeros-pasos").getByRole("listitem")).toHaveCount(8);
    });
    // Encontrar una pantalla sin recorrer la lista de 20.
    await corregido("Administración tiene 20 pantallas y ningún buscador", async () => {
      await p.getByLabel("Buscar una pantalla").fill("precio");
      await expect(p.getByRole("link", { name: "Precios" })).toBeVisible();
      await expect(p.getByRole("link", { name: "Usuarios y roles" })).toHaveCount(0);
      await foto(p, "administracion-buscar");
      await p.getByLabel("Buscar una pantalla").fill("zzzz");
      await expect(p.getByText(/No hay ninguna pantalla con/)).toBeVisible();
      await p.getByLabel("Buscar una pantalla").fill("");
    });
    // Una cuenta a la que se llega en un clic desde el encabezado: su sesión (y cambiar su contraseña) no se alcanza en escritorio.
    await corregido("en escritorio no hay forma de llegar a «Mi sesión» (solo existe en la barra del celular)", async () => {
      await p.getByRole("link", { name: "Mi cuenta" }).click();
      await expect(p.getByRole("heading", { name: "Más" })).toBeVisible();
      await expect(p.getByRole("button", { name: "Cambiar mi contraseña" })).toBeVisible();
    });
    await c.cerrar();
  });

  test("2. una escuela vacía: la primera pantalla dice qué sigue, paso por paso, según el estado real", async ({ browser, baseURL }) => {
    // Otra organización, sin nada más que su administradora y la captación encendida.
    const slug = `v7-vacia-${Date.now().toString(36)}`;
    const organizacion = await prisma.organizacion.create({ data: { nombre: "Escuela vacía V7", slug } });
    await prisma.configuracion_organizacion.create({ data: { organizacion_id: organizacion.id, modulo_cotizador: false, modulo_clase_muestra: false, modulo_inscripcion: false, modulo_operacion: false, modulo_finanzas: false, modulo_tableros: false } });
    await prisma.usuario.create({ data: { organizacion_id: organizacion.id, correo: "vacia@escuela.test", nombre: "Vera Vacía", rol: "administrador", contrasena_hash: await hashContrasena(CONTRASENA, PARAMETROS_PRUEBA) } });
    try {
      cuenta("2. primer día de una escuela vacía");
      const c = await entrarComo(browser, baseURL!, "vacia@escuela.test", CONTRASENA, "escritorio", slug);
      const p = c.page;
      await expect(p.getByTestId("usuario")).toContainText("Vera Vacía");
      await foto(p, "escuela-vacia-al-entrar");
      await p.goto("/admin");
      await expect(p.getByRole("heading", { name: "Administración", level: 1 })).toBeVisible();
      await foto(p, "escuela-vacia-administracion", true);
      await corregido("una escuela vacía no dice qué hacer primero", async () => {
        const pasos = p.getByTestId("primeros-pasos");
        await expect(pasos).toContainText("0 de 8");
        await expect(p.getByTestId("paso-disciplinas")).toContainText("Falta");
        await expect(p.getByTestId("paso-modulos")).toContainText("Falta");
        await expect(p.getByTestId("siguiente-paso")).toContainText("disciplina");
        paso();
        await p.getByTestId("siguiente-paso").getByRole("link").click();
        await expect(p.getByRole("heading", { name: "Disciplinas", level: 1 })).toBeVisible();
      });
      // Da de alta la primera disciplina y vuelve: el paso queda hecho y el siguiente cambia (se verifica contra el estado real).
      await p.goto("/admin/verticales");
      await p.getByRole("button", { name: "Nueva disciplina" }).click();
      await dialogo(p).getByLabel("Nombre de la disciplina").fill("Primera disciplina");
      await dialogo(p).getByRole("button", { name: "Guardar" }).click();
      await expect(dialogo(p)).toHaveCount(0);
      await p.goto("/admin");
      await corregido("el paso de la disciplina no queda hecho al darla de alta", async () => {
        await expect(p.getByTestId("primeros-pasos")).toContainText("1 de 8");
        await expect(p.getByTestId("paso-disciplinas")).toContainText("Listo");
        await expect(p.getByTestId("siguiente-paso")).toContainText("sucursal");
        await foto(p, "escuela-vacia-un-paso");
      });
      // La bandeja de entrada de quien administra una escuela sin nada también orienta.
      await p.goto("/embudo");
      await corregido("el embudo de una escuela vacía no lleva a los primeros pasos", async () => {
        await expect(p.getByTestId("aviso-primeros-pasos")).toContainText("Tu escuela todavía no está lista");
        await foto(p, "escuela-vacia-embudo");
      });
      await c.cerrar();
    } finally {
      await prisma.organizacion.update({ where: { id: organizacion.id }, data: { eliminado_en: new Date() } });
    }
  });

  test("3. la prueba de fuego en navegador: disciplina, sucursal, programa, precio y grupo nuevos solo desde Administración", async ({ page, request: api }) => {
    cuenta("3. alta de una disciplina nueva de punta a punta");
    // Disciplina
    await page.goto("/admin/verticales");
    await page.getByRole("button", { name: "Nueva disciplina" }).click();
    paso();
    await dialogo(page).getByLabel("Nombre de la disciplina").fill(DISCIPLINA);
    await foto(page, "disciplina-nueva");
    await dialogo(page).getByRole("button", { name: "Guardar" }).click();
    paso();
    await expect(dialogo(page)).toHaveCount(0);
    await corregido("guardar una disciplina no avisa que ya quedó", async () => {
      await expect(aviso(page)).toContainText(`«${DISCIPLINA}»`);
      await foto(page, "disciplina-guardada");
    });
    const vertical = (await json<{ datos: { id: string; nombre: string; slug: string }[] }>(admin, "/api/verticales")).datos.find((v) => v.nombre === DISCIPLINA)!;
    ids.vertical = vertical.id;
    await corregido("el enlace de la disciplina se muestra como una ruta técnica («/l/…»)", async () => {
      expect(await leer(page)).not.toContain(`/l/${vertical.slug}`);
      await expect(page.getByTestId(`vertical-${vertical.slug}`)).toContainText("Página para recibir familias");
    });
    // Sucursal (con su zona horaria en palabras) y la disciplina que ofrece.
    await page.goto("/admin/sucursales");
    await page.getByRole("button", { name: "Nueva sucursal" }).click();
    await dialogo(page).getByLabel("Nombre de la sucursal").fill(SUCURSAL);
    await dialogo(page).getByLabel("Dirección").fill("Avenida de las Pruebas 100");
    await corregido("la zona horaria se pide con un nombre técnico («America/Mexico_City»)", async () => {
      await expect(dialogo(page).locator("select#zona-horaria, select").filter({ hasText: "Ciudad de México" }).first()).toBeVisible();
    });
    await foto(page, "sucursal-nueva");
    await dialogo(page).getByRole("button", { name: "Guardar" }).click();
    await expect(dialogo(page)).toHaveCount(0);
    const sucursal = (await json<{ datos: { id: string; nombre: string }[] }>(admin, "/api/sucursales")).datos.find((s) => s.nombre === SUCURSAL)!;
    ids.sucursal = sucursal.id;
    const tarjetaSucursal = page.getByTestId(`sucursal-${sucursal.id}`);
    await corregido("la sucursal muestra la zona horaria como identificador técnico", async () => {
      expect(await tarjetaSucursal.innerText()).not.toContain("America/");
      await expect(tarjetaSucursal).toContainText("Hora del centro de México");
    });
    await tarjetaSucursal.getByLabel(DISCIPLINA).click();
    await expect(tarjetaSucursal.getByLabel(DISCIPLINA)).toBeChecked();
    await foto(page, "sucursal-ofrece-disciplina");
    // Programa
    await page.goto("/admin/programas");
    await page.getByRole("button", { name: "Nuevo programa" }).click();
    await dialogo(page).getByLabel("Disciplina").selectOption({ label: DISCIPLINA });
    await dialogo(page).getByLabel("Sucursal").selectOption({ label: SUCURSAL });
    await dialogo(page).getByLabel("Nombre del programa").fill(PROGRAMA);
    await dialogo(page).getByLabel("Edad mínima").fill("4");
    await dialogo(page).getByLabel("Edad máxima").fill("10");
    await dialogo(page).getByLabel("Fecha de corte").fill("2026-09-01");
    await dialogo(page).getByRole("button", { name: "Guardar" }).click();
    await expect(dialogo(page)).toHaveCount(0);
    const programa = (await json<{ datos: { id: string; nombre: string }[] }>(admin, "/api/programas?limite=100")).datos.find((x) => x.nombre === PROGRAMA)!;
    ids.programa = programa.id;
    await corregido("el programa muestra la fecha de corte como «2026-09-01»", async () => {
      expect(await page.getByTestId(`programa-${programa.id}`).innerText()).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    });
    await foto(page, "programa-nuevo");
    // Precio (sin él no se puede inscribir a nadie): se ve la señal en la lista de pasos.
    await page.goto("/admin/precios");
    await page.getByLabel("Programa").selectOption({ label: PROGRAMA });
    await expect(page.getByText("Este programa todavía no tiene precio")).toBeVisible();
    await foto(page, "programa-sin-precio");
    await page.getByRole("button", { name: "Nueva vigencia" }).click();
    await dialogo(page).getByLabel(/^Inscripción/).fill("450");
    await dialogo(page).getByLabel(/^Mensualidad/).fill("900");
    await dialogo(page).getByRole("button", { name: "Guardar la nueva vigencia" }).click();
    await expect(dialogo(page)).toHaveCount(0);
    await expect(page.getByTestId("historial-de-precios")).toContainText("$900.00");
    // Salón, instructor y grupo.
    await page.goto("/admin/instructores");
    await page.getByRole("button", { name: "Nuevo salón" }).click();
    await dialogo(page).getByLabel("Sucursal").selectOption({ label: SUCURSAL });
    await dialogo(page).getByLabel("Nombre del salón").fill("Alberca 1");
    await dialogo(page).getByLabel("Capacidad").fill("12");
    await dialogo(page).getByRole("button", { name: "Guardar" }).click();
    await expect(dialogo(page)).toHaveCount(0);
    await page.getByRole("button", { name: "Nuevo instructor" }).click();
    await dialogo(page).getByRole("textbox", { name: /^Nombre/ }).fill("Irma Instructora");
    await dialogo(page).getByLabel(SUCURSAL).check();
    await dialogo(page).getByRole("button", { name: "Guardar" }).click();
    await expect(dialogo(page)).toHaveCount(0);
    ids.salon = (await json<{ datos: { id: string; nombre: string }[] }>(admin, "/api/salones?limite=100")).datos.find((s) => s.nombre === "Alberca 1")!.id;
    ids.instructor = (await json<{ datos: { id: string; nombre: string }[] }>(admin, "/api/instructores?limite=100")).datos.find((i) => i.nombre === "Irma Instructora")!.id;
    await page.goto("/admin/grupos");
    await page.getByRole("button", { name: "Nuevo grupo" }).click();
    await dialogo(page).getByLabel("Programa").selectOption({ label: PROGRAMA });
    await dialogo(page).getByLabel("Nombre del grupo").fill("Natación martes");
    await dialogo(page).getByLabel("Cupo máximo").fill("10");
    await dialogo(page).getByLabel("Salón").selectOption({ label: "Alberca 1" });
    await dialogo(page).getByLabel("Instructor").selectOption({ label: "Irma Instructora" });
    await dialogo(page).getByRole("button", { name: "Agregar un horario" }).click();
    await dialogo(page).getByLabel("Día 1").selectOption({ label: "Martes" });
    await dialogo(page).getByRole("button", { name: "Guardar" }).click();
    await expect(dialogo(page)).toHaveCount(0);
    ids.grupo = (await json<{ datos: { id: string; nombre: string }[] }>(admin, `/api/grupos?programa_id=${ids.programa}`)).datos.find((g) => g.nombre === "Natación martes")!.id;
    await foto(page, "grupo-nuevo-en-la-lista");
    // La página pública de la disciplina ya existe (nadie tocó código ni SQL).
    const publica = await api.get(`${mundo.base}/l/${vertical.slug}`);
    expect(publica.status(), "la página pública de la disciplina nueva responde").toBe(200);
    expect(await publica.text()).toContain(DISCIPLINA);
    // Y la disciplina aparece sola donde se filtra (tableros) y en la lista de pasos.
    await page.goto("/tableros");
    await expect(page.getByLabel("Disciplina")).toContainText(DISCIPLINA);
    await page.goto("/admin");
    await corregido("la lista de primeros pasos no refleja que ya hay disciplina, sucursal, programa, precio y grupo", async () => {
      for (const id of ["disciplinas", "sucursales", "programas", "grupos"]) await expect(page.getByTestId(`paso-${id}`)).toContainText("Listo");
      // El mundo compartido trae programas de otras pruebas sin precio: el paso puede faltar, pero NO por el programa que se acaba de dar de alta con su precio.
      expect((await page.getByTestId("paso-precios").innerText()).includes(`«${PROGRAMA}»`)).toBe(false);
    });
  });
});

test.describe("un día normal", () => {
  test("4. alta de un grupo: formulario vacío, choque de instructor, choque de salón y traslape de edad, cada uno con su mensaje", async ({ page }) => {
    cuenta("4. alta de un grupo");
    await page.goto("/admin/grupos");
    await page.getByRole("button", { name: "Nuevo grupo" }).click();
    paso();
    // Todo vacío.
    await dialogo(page).getByRole("button", { name: "Guardar" }).click();
    await corregido("con el formulario vacío salen avisos del navegador en inglés («Please fill out this field») en vez de los de la pantalla", async () => {
      await expect(dialogo(page)).toContainText("Elige el programa");
      await expect(dialogo(page)).toContainText("Escribe el nombre");
      await expect(dialogo(page)).toContainText("Escribe un cupo de 1 a 500");
      await foto(page, "grupo-formulario-vacio");
    });
    await dialogo(page).getByLabel("Programa").selectOption({ label: PROGRAMA });
    await dialogo(page).getByLabel("Nombre del grupo").fill("Natación martes B");
    await dialogo(page).getByLabel("Cupo máximo").fill("10");
    await dialogo(page).getByLabel("Salón").selectOption({ label: "Alberca 1" });
    await dialogo(page).getByLabel("Instructor").selectOption({ label: "Irma Instructora" });
    await dialogo(page).getByRole("button", { name: "Agregar un horario" }).click();
    await dialogo(page).getByLabel("Día 1").selectOption({ label: "Martes" });
    await foto(page, "grupo-lleno");
    await dialogo(page).getByRole("button", { name: "Guardar" }).click();
    paso();
    // Choque (mismo salón e instructor, martes 16:00–17:00).
    const choque = dialogo(page).getByTestId("error-de-guardado");
    await expect(dialogo(page)).toContainText("ya está ocupado");
    await foto(page, "grupo-choque-salon-e-instructor");
    await corregido("el choque aparece dos veces en el mismo diálogo (junto al campo y otra vez abajo)", async () => {
      const t = await dialogo(page).innerText();
      // El salón y el instructor chocan con el mismo grupo: una frase por cada uno, y cada frase UNA sola vez.
      expect((t.match(/El salón ya está ocupado por el grupo «Natación martes»/g) ?? []).length).toBe(1);
      expect((t.match(/El instructor ya está ocupado por el grupo «Natación martes»/g) ?? []).length).toBe(1);
      await expect(choque).toHaveCount(1);
    });
    await corregido("el choque dice «(se traslapa con 16:00–17:00)» sin decir qué hacer, y el aviso queda fuera de la vista (hay que bajar)", async () => {
      const t = await dialogo(page).innerText();
      expect(t).not.toContain("(se traslapa con");
      expect(t).toContain("Cambia el horario o elige otro");
      expect(await aLaVista(choque), "el error del guardado se ve sin bajar").toBe(true);
      expect(await aLaVista(dialogo(page).getByRole("button", { name: "Guardar" })), "el botón Guardar se alcanza sin bajar").toBe(true);
    });
    // Se cambia solo el instructor: sigue chocando el salón.
    await dialogo(page).getByLabel("Instructor").selectOption({ label: "Sin instructor asignado" });
    await dialogo(page).getByRole("button", { name: "Guardar" }).click();
    await expect(dialogo(page)).toContainText("El salón ya está ocupado");
    // Con otro horario (miércoles) se guarda.
    await dialogo(page).getByLabel("Día 1").selectOption({ label: "Miércoles" });
    await dialogo(page).getByRole("button", { name: "Guardar" }).click();
    paso();
    await expect(dialogo(page)).toHaveCount(0);
    await corregido("guardar el grupo no avisa que ya quedó", async () => {
      await expect(aviso(page)).toContainText("Natación martes B");
    });
    await foto(page, "grupo-guardado");
    // Traslape de edad entre programas.
    await page.goto("/admin/programas");
    await page.getByRole("button", { name: "Nuevo programa" }).click();
    await dialogo(page).getByLabel("Disciplina").selectOption({ label: DISCIPLINA });
    await dialogo(page).getByLabel("Sucursal").selectOption({ label: SUCURSAL });
    await dialogo(page).getByLabel("Nombre del programa").fill("Natación juvenil");
    await dialogo(page).getByLabel("Edad mínima").fill("8");
    await dialogo(page).getByLabel("Edad máxima").fill("14");
    await dialogo(page).getByRole("button", { name: "Guardar" }).click();
    await expect(dialogo(page)).toContainText("se traslapan");
    await foto(page, "programa-traslape-de-edad");
    await corregido("el traslape de edad dice «marca \"permite traslape\" en AMBOS» (el campo se llama distinto en pantalla) y queda fuera de la vista", async () => {
      const t = await dialogo(page).innerText();
      expect((t.match(/Las edades se traslapan con/g) ?? []).length).toBe(1);
      expect(t).toContain("«Permite traslape de edad»");
      expect(await aLaVista(dialogo(page).getByTestId("error-de-guardado")), "el error del guardado se ve sin bajar").toBe(true);
    });
    await dialogo(page).getByRole("button", { name: "Cancelar" }).click();
  });

  test("5. cambia un precio: versión nueva con fecha, lo ya inscrito conserva el suyo, y una fecha ocupada se explica", async ({ page }) => {
    cuenta("5. cambiar un precio");
    await page.goto("/admin/precios");
    await page.getByLabel("Programa").selectOption({ label: PROGRAMA });
    await foto(page, "precio-historial");
    await page.getByRole("button", { name: "Nueva vigencia" }).click();
    paso();
    await expect(dialogo(page)).toContainText("Las familias ya inscritas conservan el precio con el que se inscribieron");
    await dialogo(page).getByLabel(/^Inscripción/).fill("500");
    await dialogo(page).getByLabel(/^Mensualidad/).fill("1,050.50");
    await dialogo(page).getByLabel("Rige desde").fill(mananaEnMexico());
    await foto(page, "precio-nueva-vigencia");
    await dialogo(page).getByRole("button", { name: "Guardar la nueva vigencia" }).click();
    paso();
    await expect(dialogo(page)).toHaveCount(0);
    const historial = page.getByTestId("historial-de-precios");
    await expect(historial).toContainText("$1,050.50");
    await expect(historial.getByRole("row").filter({ hasText: "$1,050.50" })).toContainText("Futura");
    await expect(historial.getByRole("row").filter({ hasText: "$900.00" })).toContainText("Vigente");
    await corregido("cambiar el precio no avisa desde cuándo rige ni qué pasa con lo ya inscrito", async () => {
      await expect(aviso(page)).toContainText("rige desde");
      await expect(aviso(page)).toContainText("ya inscrito");
    });
    await foto(page, "precio-guardado");
    // La vigencia de hoy se cerró el día antes de la nueva (la API lo dice con exactitud).
    const precios = (await json<{ datos: { vigencia_desde: string; vigencia_hasta: string | null; costo_mensualidad: string }[] }>(admin, `/api/precios?programa_id=${ids.programa}&limite=100`)).datos;
    expect(precios.find((x) => x.costo_mensualidad === "900.00")?.vigencia_hasta).toBe(dia());
    // La misma fecha otra vez: el mensaje no repite ni enseña fechas técnicas.
    await page.getByRole("button", { name: "Nueva vigencia" }).click();
    await dialogo(page).getByLabel(/^Inscripción/).fill("500");
    await dialogo(page).getByLabel(/^Mensualidad/).fill("1100");
    await dialogo(page).getByLabel("Rige desde").fill(mananaEnMexico());
    await dialogo(page).getByRole("button", { name: "Guardar la nueva vigencia" }).click();
    await expect(dialogo(page)).toContainText("Ya hay un precio");
    await foto(page, "precio-fecha-ocupada");
    await corregido("la fecha ocupada sale como «2026-10-10», repetida, sin decir qué hacer", async () => {
      const t = await dialogo(page).innerText();
      expect(t).not.toMatch(/\d{4}-\d{2}-\d{2}/);
      expect((t.match(/Ya hay un precio/g) ?? []).length).toBe(1);
      expect(t).toMatch(/elige una fecha posterior/i);
    });
    // Importes mal escritos: lo dice la pantalla (no el navegador).
    await dialogo(page).getByLabel(/^Mensualidad/).fill("1,5");
    await dialogo(page).getByRole("button", { name: "Guardar la nueva vigencia" }).click();
    await expect(dialogo(page)).toContainText("Escribe un importe válido");
    await dialogo(page).getByRole("button", { name: "Cancelar" }).click();
  });

  test("6. crea y edita promociones: una acumulable y una que no; el formulario vacío y el código repetido se explican", async ({ page }) => {
    cuenta("6. crear una promoción");
    await page.goto("/admin/promociones");
    await page.getByRole("button", { name: "Nueva promoción" }).click();
    paso();
    await dialogo(page).getByRole("button", { name: "Guardar", exact: true }).click();
    await corregido("el formulario de promoción vacío muestra el aviso en inglés del navegador", async () => {
      await expect(dialogo(page)).toContainText("Escribe el nombre");
      await expect(dialogo(page)).toContainText("Agrega al menos un beneficio");
      await foto(page, "promocion-formulario-vacio");
    });
    const llenar = async (nombre: string, codigo: string, acumulable: boolean, porcentaje: string) => {
      const d = dialogo(page);
      await d.getByLabel("Nombre de la promoción").fill(nombre);
      await d.getByLabel(/^Código/).fill(codigo);
      await d.getByLabel("Vigente desde").fill(dia());
      await d.getByLabel("Prioridad").fill("3");
      if (acumulable) await d.getByLabel("Se puede acumular con otras promociones").check();
      await d.getByLabel("Qué da").selectOption({ index: 0 });
      await d.getByLabel(/^Porcentaje|^Monto/).fill(porcentaje);
      await d.getByRole("button", { name: "Agregar este beneficio" }).click();
      await expect(d.getByTestId("beneficios")).toContainText("%");
      await d.getByRole("button", { name: "Guardar", exact: true }).click();
    };
    await llenar("Descuento acumulable V7", "V7ADM-ACUM", true, "10");
    paso();
    await expect(dialogo(page)).toHaveCount(0);
    const acum = page.getByTestId("promocion-V7ADM-ACUM");
    await expect(acum).toContainText("Acumulable");
    await corregido("guardar una promoción no avisa que ya quedó", async () => {
      await expect(aviso(page)).toContainText("Descuento acumulable V7");
    });
    // La que NO se acumula, con el mismo código: lo dice.
    await page.getByRole("button", { name: "Nueva promoción" }).click();
    await llenar("Descuento solo V7", "V7ADM-ACUM", false, "15");
    await expect(dialogo(page)).toContainText("código");
    await foto(page, "promocion-codigo-repetido");
    await dialogo(page).getByLabel(/^Código/).fill("V7ADM-SOLA");
    await dialogo(page).getByRole("button", { name: "Guardar", exact: true }).click();
    await expect(dialogo(page)).toHaveCount(0);
    const sola = page.getByTestId("promocion-V7ADM-SOLA");
    await expect(sola).not.toContainText("Acumulable");
    await foto(page, "promociones-las-dos");
    // Editar: cambia el nombre y la prioridad.
    await sola.getByRole("button", { name: "Editar" }).click();
    await dialogo(page).getByLabel("Nombre de la promoción").fill("Descuento solo V7 (editado)");
    await dialogo(page).getByLabel("Prioridad").fill("8");
    await dialogo(page).getByRole("button", { name: "Guardar", exact: true }).click();
    await expect(dialogo(page)).toHaveCount(0);
    await expect(page.getByTestId("promocion-V7ADM-SOLA")).toContainText("Prioridad 8");
    await expect(page.getByTestId("promocion-V7ADM-SOLA")).toContainText("(editado)");
    const guardada = (await json<{ datos: { codigo: string; acumulable: boolean; prioridad: number }[] }>(admin, "/api/promociones?limite=100")).datos;
    expect(guardada.find((x) => x.codigo === "V7ADM-ACUM")?.acumulable).toBe(true);
    expect(guardada.find((x) => x.codigo === "V7ADM-SOLA")).toMatchObject({ acumulable: false, prioridad: 8 });
  });

  test("7. enciende y apaga módulos: dice qué cambia para cada rol, avisa de las dependencias con palabras claras y confirma antes de apagar", async ({ page }) => {
    cuenta("7. apagar y encender un módulo");
    const recepcion = await apiComo("recepcion");
    const permisosDeRecepcion = async (): Promise<string[]> => (await json<{ permisos: string[] }>(recepcion, "/api/yo")).permisos;
    expect(await permisosDeRecepcion()).toContain("pagos:registrar");
    await page.goto("/admin/modulos");
    await foto(page, "modulos", true);
    await corregido("cada módulo explica qué cambia al apagarlo o encenderlo, para quién", async () => {
      await expect(page.getByTestId("efecto-finanzas")).toContainText("Recepción");
      await expect(page.getByTestId("efecto-clase_muestra")).toContainText("maestro");
    });
    // Dependencias en cadena: para apagar Cotizador hay que apagar antes lo que está encima, en orden.
    await corregido("la dependencia en cadena se explica a medias («primero apaga: Inscripción» sin decir que a Inscripción le falta apagar otras tres)", async () => {
      const ayuda = page.getByTestId("modulo-cotizador");
      await expect(ayuda).toContainText(/Tableros.*Finanzas.*Operación diaria.*Inscripción/s);
    });
    await expect(page.getByTestId("interruptor-finanzas")).toBeDisabled();
    // Tableros primero (de él depende nada), luego Finanzas.
    await page.getByTestId("interruptor-tableros").click();
    paso();
    await corregido("apagar un módulo no pide confirmación ni dice qué se pierde", async () => {
      await expect(dialogo(page)).toContainText("Tableros");
      await expect(dialogo(page)).toContainText("Lo que ya estaba guardado se conserva");
      // V13-fix (EV-03): y no promete que todo vuelve: lo de ese tiempo no se recupera.
      await expect(dialogo(page)).toContainText("al encenderlo no se recupera");
      await expect(dialogo(page)).not.toContainText("vuelven en cuanto");
      await foto(page, "modulo-confirmar-apagar");
      await dialogo(page).getByRole("button", { name: "Apagar Tableros" }).click();
      paso();
    });
    await expect(page.getByTestId("modulo-tableros")).toContainText("Apagado");
    await corregido("apagar un módulo no avisa que ya surtió efecto", async () => {
      await expect(aviso(page)).toContainText("Tableros quedó apagado");
    });
    await expect(page.locator("nav.lateral")).not.toContainText("Tableros");
    await foto(page, "modulo-apagado");
    await page.getByTestId("interruptor-finanzas").click();
    if (FASE !== "antes") await dialogo(page).getByRole("button", { name: "Apagar Finanzas" }).click();
    await expect(page.getByTestId("modulo-finanzas")).toContainText("Apagado");
    // Recepción ya no tiene sus pantallas de cobro (surte efecto sin reiniciar nada).
    expect(await permisosDeRecepcion()).not.toContain("pagos:registrar");
    expect((await recepcion.get("/api/pagos")).status(), "la API de cobros de recepción responde 404 con finanzas apagado").toBe(404);
    // Volver a encender: finanzas y luego tableros (necesita finanzas).
    await expect(page.getByTestId("interruptor-tableros")).toBeDisabled();
    await expect(page.getByTestId("modulo-tableros")).toContainText(/primero enciende: Finanzas/);
    await page.getByTestId("interruptor-finanzas").click();
    await expect(page.getByTestId("modulo-finanzas")).toContainText("Encendido");
    await corregido("encender un módulo no avisa que ya surtió efecto y para quién", async () => {
      await expect(aviso(page)).toContainText("Finanzas quedó encendido");
      await foto(page, "modulo-encendido");
    });
    await page.getByTestId("interruptor-tableros").click();
    await expect(page.getByTestId("modulo-tableros")).toContainText("Encendido");
    expect(await permisosDeRecepcion()).toContain("pagos:registrar");
    await recepcion.dispose();
  });

  test("8. carga el catálogo desde Excel con un archivo que no es CSV: dice qué hacer", async ({ page }) => {
    cuenta("8. llegar a la carga de catálogo");
    await page.goto("/admin");
    await page.getByRole("link", { name: "Cargar catálogo" }).click();
    paso();
    await expect(page.getByRole("heading", { name: "Cargar catálogo", level: 1 })).toBeVisible();
    await page.getByTestId("entrada-de-archivos").setInputFiles([{ name: "sucursales.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: Buffer.from("PK\u0003\u0004contenido binario") }]);
    await foto(page, "catalogo-xlsx-elegido");
    await corregido("subir un .xlsx dice «no se parece a ninguna plantilla» sin explicar que hay que guardarlo como CSV", async () => {
      await expect(page.getByTestId("problema-de-archivos")).toContainText("CSV UTF-8");
      await expect(page.getByTestId("boton-revisar")).toBeDisabled();
    });
    await page.getByTestId("archivos-elegidos").getByRole("button", { name: "Quitar" }).first().click();
    await page.getByTestId("entrada-de-archivos").setInputFiles([{ name: "salones.csv", mimeType: "text/csv", buffer: Buffer.from("Sede,Sala,Cap\r\nNorte,Uno,5\r\n") }]);
    await page.getByTestId("boton-revisar").click();
    await expect(page.getByTestId("resultado-de-carga")).toContainText("no se parece a ninguna de las plantillas");
    await foto(page, "catalogo-encabezados-distintos");
    expect(await leer(page)).not.toMatch(JERGA);
  });

  test("9. cambia la configuración: horario de los mensajes automáticos y modo de cierre, con aviso de que ya surtió efecto", async ({ page }) => {
    cuenta("9. cambiar el horario de los mensajes automáticos");
    await page.goto("/admin/configuracion");
    await foto(page, "configuracion", true);
    await corregido("la configuración dice «1 mensajes» (plural a medias)", async () => {
      expect(await leer(page)).not.toMatch(/\b1 (mensajes|días|intentos|horas|faltas|minutos)\b/);
    });
    await page.getByLabel("Los mensajes automáticos salen desde las").fill("10:00");
    await page.getByLabel("Y hasta las").fill("19:00");
    await page.getByLabel("Modo de cierre").selectOption("maestro_en_sitio");
    await page.getByRole("button", { name: "Guardar la configuración" }).click();
    paso();
    await expect(page.getByText("Configuración guardada").first()).toBeVisible();
    const c = await json<Record<string, unknown>>(admin, "/api/configuracion");
    expect(c["horario_envio_inicio_min"]).toBe(600);
    expect(c["horario_envio_fin_min"]).toBe(1140);
    expect(c["modo_cierre"]).toBe("maestro_en_sitio");
    await foto(page, "configuracion-guardada");
    // Fuera del horario permitido: se dice cuál es el permitido.
    await page.getByLabel("Los mensajes automáticos salen desde las").fill("07:00");
    await page.getByRole("button", { name: "Guardar la configuración" }).click();
    await expect(page.getByText(/09:00 y las 20:00/).first()).toBeVisible();
    await foto(page, "configuracion-fuera-de-rango");
  });

  test("10. crea un usuario de cada rol y cada uno ve solo lo suyo; restablece una contraseña; desactiva a alguien; alguien se equivoca de contraseña", async ({ page, browser, baseURL }) => {
    cuenta("10. crear un usuario");
    await page.goto("/admin/usuarios");
    await foto(page, "usuarios-lista");
    const crear = async (correo: string, nombre: string, rol: string, sucursales: string[]) => {
      await page.getByRole("button", { name: "Nuevo usuario" }).click();
      const d = dialogo(page);
      await d.getByLabel(/^Correo/).fill(correo);
      await d.getByRole("textbox", { name: /^Nombre/ }).fill(nombre);
      await d.getByLabel("Rol").selectOption({ label: rol });
      for (const s of sucursales) await d.getByLabel(s, { exact: true }).check();
      await d.getByLabel("Contraseña inicial").fill(CONTRASENA);
      await d.getByRole("button", { name: "Guardar" }).click();
      await expect(dialogo(page)).toHaveCount(0);
    };
    await page.getByRole("button", { name: "Nuevo usuario" }).click();
    paso();
    await corregido("al elegir el rol no se dice qué va a ver esa persona", async () => {
      await dialogo(page).getByLabel("Rol").selectOption({ label: "Recepción" });
      await expect(dialogo(page).getByTestId("ayuda-del-rol")).toContainText("cobros");
      await foto(page, "usuario-nuevo-rol");
    });
    await dialogo(page).getByRole("button", { name: "Cancelar" }).click();
    await crear(CORREOS.asesor, "Ana Asesora V7", "Asesor", [mundo.sucursales.norte.nombre]);
    await crear(CORREOS.maestro, "Mateo Maestro V7", "Maestro", []);
    await crear(CORREOS.recepcion, "Rosa Recepción V7", "Recepción", [mundo.sucursales.norte.nombre]);
    await crear(CORREOS.segundo, "Sergio Segundo V7", "Administrador", []);
    paso();
    await corregido("crear un usuario no avisa que ya quedó ni le recuerda al administrador darle su contraseña", async () => {
      await expect(aviso(page)).toContainText("Sergio Segundo V7");
      await foto(page, "usuario-creado");
    });
    for (const [correo, nombre] of [[CORREOS.asesor, "Ana Asesora V7"], [CORREOS.maestro, "Mateo Maestro V7"], [CORREOS.recepcion, "Rosa Recepción V7"], [CORREOS.segundo, "Sergio Segundo V7"]] as const) {
      await expect(page.getByTestId(`usuario-${correo}`)).toContainText(nombre);
    }
    // Lo que ve cada rol (entrando de verdad por la pantalla de acceso).
    const secciones = async (correo: string): Promise<string> => {
      const c = await entrarComo(browser, baseURL!, correo, CONTRASENA);
      await expect(c.page.locator("nav.lateral")).toBeVisible();
      const t = await c.page.locator("nav.lateral").innerText();
      await c.cerrar();
      return t;
    };
    const delAsesor = await secciones(CORREOS.asesor);
    expect(delAsesor).toContain("Embudo");
    expect(delAsesor).not.toContain("Administración");
    const delMaestro = await secciones(CORREOS.maestro);
    expect(delMaestro).toContain("Hoy");
    expect(delMaestro).not.toContain("Administración");
    const deRecepcion = await secciones(CORREOS.recepcion);
    expect(deRecepcion).toContain("Registrar pago");
    expect(deRecepcion).not.toContain("Administración");
    expect(await secciones(CORREOS.segundo)).toContain("Administración");
    // Buscar a alguien en la lista.
    await corregido("la lista de usuarios no tiene buscador", async () => {
      await page.reload();
      await page.getByLabel("Buscar por nombre o correo").fill("rosa");
      await expect(page.getByTestId(`usuario-${CORREOS.recepcion}`)).toBeVisible();
      await expect(page.getByTestId(`usuario-${CORREOS.asesor}`)).toHaveCount(0);
      await page.getByLabel("Buscar por nombre o correo").fill("");
    });
    // Restablecer la contraseña de otra persona: botón propio, no escondido dentro de «Editar».
    cuenta("10b. restablecer la contraseña de otra persona");
    const tarjeta = page.getByTestId(`usuario-${CORREOS.asesor}`);
    if (FASE === "antes") {
      await tarjeta.getByRole("button", { name: "Editar" }).click();
      paso();
      await dialogo(page).getByLabel(/Restablecer la contraseña/).fill("Contrasena-nueva-v7-2");
      await dialogo(page).getByRole("button", { name: "Guardar" }).click();
      paso();
      await expect(dialogo(page)).toHaveCount(0);
    } else {
      await tarjeta.getByRole("button", { name: "Restablecer contraseña" }).click();
      paso();
      await foto(page, "usuario-restablecer-contrasena");
      await dialogo(page).getByLabel(/^Contraseña nueva/).fill("Contrasena-nueva-v7-2");
      await dialogo(page).getByRole("button", { name: "Restablecer contraseña" }).click();
      paso();
      await expect(dialogo(page)).toHaveCount(0);
      await expect(aviso(page)).toContainText("Ana Asesora V7");
      await expect(aviso(page)).toContainText("sesiones");
    }
    await corregido("restablecer la contraseña no hay un botón visible en la tarjeta del usuario", async () => {
      await expect(tarjeta.getByRole("button", { name: "Restablecer contraseña" })).toBeVisible();
    });
    expect(await intentarEntrar(CORREOS.asesor, CONTRASENA), "la contraseña vieja ya no sirve").toBe(401);
    expect(await intentarEntrar(CORREOS.asesor, "Contrasena-nueva-v7-2"), "la nueva sí").toBe(201);
    // Desactivar: con confirmación y con lo que pasa dicho.
    cuenta("10c. desactivar a alguien");
    const deMaestro = page.getByTestId(`usuario-${CORREOS.maestro}`);
    if (FASE === "antes") {
      await deMaestro.getByRole("button", { name: "Editar" }).click();
      paso();
      await dialogo(page).getByLabel("Activo").uncheck();
      paso();
      await dialogo(page).getByRole("button", { name: "Guardar" }).click();
      paso();
    } else {
      await deMaestro.getByRole("button", { name: "Desactivar" }).click();
      paso();
      await expect(dialogo(page)).toContainText("ya no podrá entrar");
      await foto(page, "usuario-desactivar-confirmar");
      await dialogo(page).getByRole("button", { name: "Desactivar a Mateo Maestro V7" }).click();
      paso();
      await expect(aviso(page)).toContainText("Mateo Maestro V7");
    }
    await expect(deMaestro).toContainText("Inactivo");
    await foto(page, "usuario-desactivado");
    expect(await intentarEntrar(CORREOS.maestro, CONTRASENA), "quien está desactivado ya no entra").toBe(401);
    await corregido("en la lista, quien está desactivado no tiene cómo volver a activarse a la vista", async () => {
      await expect(deMaestro.getByRole("button", { name: "Activar" })).toBeVisible();
    });
    await corregido("la pantalla de acceso no dice qué hacer cuando no se puede entrar (usuario desactivado o contraseña olvidada)", async () => {
      const c = await contextoNuevo(browser, baseURL!, "escritorio", null);
      await c.context.clearCookies();
      await c.page.goto("/");
      await c.page.getByLabel("Correo").fill(CORREOS.maestro);
      await c.page.getByLabel("Contraseña").fill(CONTRASENA);
      await c.page.getByRole("button", { name: "Entrar" }).click();
      await expect(c.page.getByText("Correo o contraseña incorrectos")).toBeVisible();
      await expect(c.page.getByText(/administra el sistema/)).toBeVisible();
      await foto(c.page, "acceso-no-puedo-entrar");
      await c.cerrar();
    });
    // Editarse a uno mismo: nada de textos técnicos; su propia contraseña se cambia desde su cuenta.
    await page.getByTestId(`usuario-${mundo.usuarios.administrador.correo}`).getByRole("button", { name: "Editar" }).click();
    await foto(page, "usuario-editarme-a-mi");
    await corregido("al editarse a sí misma, Adela puede escribir una contraseña y recibe «usa POST /api/yo/contrasena»", async () => {
      await expect(dialogo(page).getByLabel(/Restablecer la contraseña/)).toHaveCount(0);
      await expect(dialogo(page)).toContainText("Mi cuenta");
    });
    await dialogo(page).getByRole("button", { name: "Cancelar" }).click();
    // Se equivoca de contraseña cinco veces: el bloqueo lo dice y se libera solo (y la pantalla lo anticipa).
    const intentos: number[] = [];
    for (let i = 0; i < 6; i++) intentos.push(await intentarEntrar(CORREOS.recepcion, "equivocada-123456"));
    expect(intentos.slice(0, 5)).toEqual([401, 401, 401, 401, 401]);
    expect(intentos[5], "al sexto intento seguido el acceso se bloquea unos minutos").toBe(429);
    expect(await intentarEntrar(CORREOS.recepcion, CONTRASENA), "mientras dura el bloqueo ni la contraseña buena entra").toBe(429);
    await corregido("la pantalla de usuarios no dice que un bloqueo por equivocarse se libera solo", async () => {
      await expect(page.getByText(/se libera solo/)).toBeVisible();
    });
  });

  test("11. cambia su propia contraseña desde «Mi cuenta» (una persona nueva, con la que le dieron en persona)", async ({ browser, baseURL }) => {
    cuenta("11. cambiar mi contraseña");
    const c = await entrarComo(browser, baseURL!, CORREOS.segundo, CONTRASENA);
    const p = c.page;
    await expect(p.locator("nav.lateral")).toBeVisible();
    await corregido("no existe en ninguna pantalla cómo cambiar la propia contraseña", async () => {
      await p.getByRole("link", { name: "Mi cuenta" }).click();
      paso();
      await p.getByRole("button", { name: "Cambiar mi contraseña" }).click();
      paso();
      const d = p.getByRole("dialog");
      await d.getByLabel("Contraseña actual").fill("equivocada-123456");
      await d.getByLabel(/^Contraseña nueva/).fill("Contrasena-propia-v7-3");
      await d.getByLabel("Repite la contraseña nueva").fill("Contrasena-propia-v7-3");
      await d.getByRole("button", { name: "Cambiar contraseña" }).click();
      await expect(d).toContainText("La contraseña actual no es correcta");
      await d.getByLabel("Contraseña actual").fill(CONTRASENA);
      await d.getByLabel("Repite la contraseña nueva").fill("otra-distinta-1234");
      await d.getByRole("button", { name: "Cambiar contraseña" }).click();
      await expect(d).toContainText("no es igual");
      await foto(p, "mi-cuenta-contrasena");
      await d.getByLabel("Repite la contraseña nueva").fill("Contrasena-propia-v7-3");
      await d.getByRole("button", { name: "Cambiar contraseña" }).click();
      paso();
      await expect(p.getByTestId("aviso-global")).toContainText("Tu contraseña cambió");
      expect(await intentarEntrar(CORREOS.segundo, CONTRASENA)).toBe(401);
      expect(await intentarEntrar(CORREOS.segundo, "Contrasena-propia-v7-3")).toBe(201);
    });
    await c.cerrar();
  });

  test("12. revisa los tableros: clases muestra, costo por campaña con gasto capturado (y sin él) y el ejecutivo; descarga un CSV", async ({ page }) => {
    cuenta("12. ver el costo de una campaña");
    // Una campaña propia (la de las pruebas de tableros no se toca).
    const creada = await admin.post("/api/campanas", { data: { nombre: "Campaña V7 admin", origen: "facebook" } });
    expect(creada.status()).toBe(201);
    ids.campana = ((await creada.json()) as { id: string }).id;
    await page.goto("/tableros");
    await foto(page, "tablero-clases");
    await page.getByRole("tab", { name: "Costo por campaña" }).click();
    paso();
    const fila = page.getByTestId(`costo-${ids.campana}`);
    await expect(fila).toBeVisible();
    await corregido("una campaña sin gasto capturado muestra costos de $0.00 sin avisar que falta capturarlo", async () => {
      await expect(page.getByTestId("aviso-sin-gasto")).toContainText("gasto");
    });
    await foto(page, "tablero-costo-sin-gasto", true);
    await corregido("el botón «Gastos» no dice qué se hace con él", async () => {
      await expect(fila.getByRole("button", { name: "Capturar o ver gastos" })).toBeVisible();
    });
    await fila.getByRole("button", { name: /gastos/i }).click();
    paso();
    await dialogo(page).getByLabel("Monto (MXN)").fill("1,500.50");
    await dialogo(page).getByRole("button", { name: "Capturar el gasto" }).click();
    paso();
    await expect(dialogo(page).getByTestId("gasto-total")).toHaveText("$1,500.50");
    await foto(page, "tablero-gasto-capturado");
    // Antes de corregir, un clic en «Dar de baja» quitaba el gasto sin preguntar (lo que se anota, sin hacerlo para no perder lo capturado).
    if (FASE === "antes") hallazgos.push("dar de baja un gasto capturado no pide confirmación (se pierde con un clic)");
    else
      await (async () => {
      await dialogo(page).getByTestId("gastos").getByRole("button", { name: "Dar de baja" }).click();
      await expect(dialogo(page)).toContainText("¿Quitar el gasto de");
      await dialogo(page).getByRole("button", { name: "No", exact: true }).click();
      await expect(dialogo(page).getByTestId("gasto-total")).toHaveText("$1,500.50");
    })();
    await dialogo(page).getByRole("button", { name: "Cerrar" }).click();
    await expect(fila).toContainText("$1,500.50");
    // Descargar el CSV (con su BOM y la cifra exacta).
    const [descarga] = await Promise.all([page.waitForEvent("download"), page.getByTestId("descargar-costo").click()]);
    paso();
    expect(descarga.suggestedFilename()).toMatch(/\.csv$/);
    const { createReadStream } = await import("node:fs");
    const texto = await new Promise<string>((ok, mal) => {
      const trozos: Buffer[] = [];
      void descarga.path().then((ruta) => {
        if (!ruta) return mal(new Error("sin archivo"));
        createReadStream(ruta).on("data", (t) => trozos.push(t as Buffer)).on("end", () => ok(Buffer.concat(trozos).toString("utf8"))).on("error", mal);
      });
    });
    expect(texto).toContain("1500.50");
    await page.getByRole("tab", { name: "Ejecutivo" }).click();
    await expect(page.getByTestId("indicador-alumnos-activos").or(page.getByText("Alumnos activos").first())).toBeVisible();
    await foto(page, "tablero-ejecutivo", true);
    await corregido("el tablero ejecutivo dice «1 inscripciones» o «Descargar resumen (CSV)» sin explicar", async () => {
      expect(await leer(page)).not.toMatch(/\b1 (inscripciones|leads|alumnos)\b/);
    });
    await admin.delete(`/api/campanas/${ids.campana}`).catch(() => undefined);
  });

  test("13. la bandeja de eventos inesperados y de tareas sin lead: se entiende qué pasó y qué hacer, sin términos técnicos", async ({ page }) => {
    cuenta("13. atender la bandeja");
    const tarea = await prisma.tarea_asesor.create({ data: { organizacion_id: org, tipo: "evento_inesperado", descripcion: "Llegó un mensaje de WhatsApp sin remitente (V7)" } });
    const evento = await prisma.evento_inesperado.create({ data: { organizacion_id: org, origen: "chatwoot", clave: `v7-admin-${Date.now()}`, causa: "json_invalido", detalle: "el cuerpo no se pudo leer", forma: { cuerpo: "objeto(3)" }, tarea_id: tarea.id } });
    const sinLead = await prisma.tarea_asesor.create({ data: { organizacion_id: org, tipo: "revision_manual", descripcion: "Revisar un contacto que no se pudo ligar a ningún lead (V7)" } });
    await page.goto("/admin/bandeja");
    await expect(page.getByTestId(`evento-${evento.id}`)).toBeVisible();
    await foto(page, "bandeja", true);
    await corregido("la causa del evento sale con lenguaje técnico («El cuerpo no era un JSON válido»)", async () => {
      expect(await page.getByTestId(`evento-${evento.id}`).innerText()).not.toMatch(/JSON|cuerpo/i);
    });
    await corregido("la bandeja no explica qué hacer con un evento ni con una tarea sin lead", async () => {
      await expect(page.getByText("Qué hacer:")).toHaveCount(2);
    });
    await page.getByTestId(`evento-${evento.id}`).getByRole("button", { name: "Marcar atendido" }).click();
    paso();
    await expect(page.getByTestId(`evento-${evento.id}`)).toHaveCount(0);
    await corregido("atender un evento no avisa que ya quedó", async () => {
      await expect(aviso(page)).toContainText("atendido");
    });
    await page.getByTestId(`tarea-${sinLead.id}`).getByRole("button", { name: "Marcar hecha" }).click();
    await expect(page.getByTestId(`tarea-${sinLead.id}`)).toHaveCount(0);
    await foto(page, "bandeja-atendida");
  });

  test("14. edita una plantilla de mensaje (clase servicio o marketing) y una automatización", async ({ page }) => {
    cuenta("14. editar una plantilla");
    await page.goto("/admin/plantillas");
    await foto(page, "plantillas");
    await corregido("la lista de plantillas muestra «es_MX», «categoría utility» y «automatización(es)»", async () => {
      const t = await leer(page);
      expect(t).not.toMatch(/es_MX|utility|\(es\)/);
    });
    await page.getByRole("button", { name: "Nueva plantilla" }).click();
    paso();
    const d = dialogo(page);
    await d.getByLabel(/^Código/).fill("aviso_v7_admin");
    await d.getByLabel(/Identificador en Twilio/).fill("HX00000000000000000000000000000077");
    await d.locator("label.opcion", { hasText: "Servicio" }).click();
    await d.getByLabel("Categoría ante Meta").selectOption({ label: "Utilidad (aviso de algo acordado)" });
    await foto(page, "plantilla-nueva");
    await d.getByRole("button", { name: "Guardar" }).click();
    paso();
    await expect(dialogo(page)).toHaveCount(0);
    const tarjeta = page.getByTestId("plantilla-aviso_v7_admin");
    await expect(tarjeta).toContainText("Servicio");
    await corregido("guardar una plantilla no avisa que ya quedó (y que falta aprobarla para que se pueda mandar)", async () => {
      await expect(aviso(page)).toContainText("aviso_v7_admin");
    });
    // Cambia la clase: de servicio a marketing (y la categoría que lo permite).
    await tarjeta.getByRole("button", { name: "Editar" }).click();
    await dialogo(page).locator("label.opcion", { hasText: "Marketing" }).click();
    await dialogo(page).getByLabel("Categoría ante Meta").selectOption({ label: "Marketing" });
    await dialogo(page).getByLabel("Estado de aprobación").selectOption({ label: "Aprobada" });
    await dialogo(page).getByRole("button", { name: "Guardar" }).click();
    await expect(tarjeta).toContainText("Marketing");
    await expect(tarjeta).toContainText("Aprobada");
    ids.plantilla = (await json<{ datos: { id: string; codigo: string }[] }>(admin, "/api/plantillas?limite=100")).datos.find((x) => x.codigo === "aviso_v7_admin")!.id;
    // Una automatización: el aviso de pago atrasado, de 10:00 a 18:00.
    cuenta("14b. ajustar una automatización");
    await page.goto("/admin/automatizaciones");
    const auto = page.getByTestId(`automatizacion-${mundo.mensajeria.automatizaciones.pagoAtrasado.id}`);
    await foto(page, "automatizaciones");
    await auto.getByRole("button", { name: "Ajustar" }).click();
    paso();
    await dialogo(page).getByLabel("Envía desde").fill("10:00");
    await dialogo(page).getByLabel("Envía hasta").fill("18:00");
    await dialogo(page).getByRole("button", { name: "Guardar" }).click();
    paso();
    await expect(auto).toContainText("de 10:00 a 18:00");
    await corregido("la automatización dice «2 intento(s)»", async () => {
      expect(await auto.innerText()).not.toMatch(/\(s\)|\(es\)/);
    });
    await corregido("ajustar una automatización no avisa que ya quedó", async () => {
      await expect(aviso(page)).toContainText("quedó guardada");
    });
    await foto(page, "automatizacion-ajustada");
  });

  test("15. da de baja un grupo: dice qué pasa, ofrece desactivarlo (eso sí se deshace) y un grupo con inscritos no se deja", async ({ page }) => {
    cuenta("15. dar de baja un grupo");
    await page.goto("/admin/grupos");
    const tarjeta = page.getByTestId(`grupo-${ids.grupo}`);
    await tarjeta.getByRole("button", { name: "Dar de baja" }).click();
    paso();
    await expect(dialogo(page)).toContainText("Natación martes");
    await foto(page, "grupo-dar-de-baja-confirmar");
    await corregido("el diálogo de baja no dice que se quita de las listas, que no se puede deshacer desde aquí, ni ofrece desactivar", async () => {
      await expect(dialogo(page)).toContainText("ya no aparecerá");
      await expect(dialogo(page)).toContainText("desactívalo");
    });
    await dialogo(page).getByRole("button", { name: "Dar de baja", exact: true }).click();
    paso();
    await expect(page.getByTestId(`grupo-${ids.grupo}`)).toHaveCount(0);
    await corregido("dar de baja no avisa que ya quedó", async () => {
      await expect(aviso(page)).toContainText("Natación martes");
    });
    await foto(page, "grupo-dado-de-baja");
    // Un grupo con inscritos (el A del mundo de pruebas): el sistema no lo deja y dice qué hacer.
    await page.getByTestId(`grupo-${mundo.grupos.a.id}`).getByRole("button", { name: "Dar de baja" }).click();
    await dialogo(page).getByRole("button", { name: "Dar de baja", exact: true }).click();
    await expect(dialogo(page).getByRole("alert").last()).toContainText("inscripci");
    await foto(page, "grupo-con-inscritos-no-se-da-de-baja");
    await corregido("el mensaje de un grupo con inscritos dice «inscripción(es) vigente(s)»", async () => {
      expect(await dialogo(page).innerText()).not.toMatch(/\(es\)|\(s\)/);
    });
    await dialogo(page).getByRole("button", { name: "Cancelar" }).click();
    expect((await json<{ datos: { id: string }[] }>(admin, "/api/grupos?limite=100")).datos.some((g) => g.id === mundo.grupos.a.id), "el grupo con inscritos sigue ahí").toBe(true);
  });

  test("16. campañas y códigos QR: dar de alta una campaña y bajar su código", async ({ page }) => {
    cuenta("16. crear una campaña y bajar su QR");
    await page.goto("/admin");
    await corregido("no hay pantalla de campañas ni de códigos QR (solo por la API)", async () => {
      await page.getByRole("link", { name: "Campañas y códigos QR" }).click();
      paso();
      await expect(page.getByRole("heading", { name: "Campañas y códigos QR", level: 1 })).toBeVisible();
      await page.getByRole("button", { name: "Nueva campaña" }).click();
      paso();
      await dialogo(page).getByLabel("Nombre de la campaña").fill("Campaña V7 admin QR");
      await dialogo(page).getByLabel("¿Dónde se anuncia?").selectOption({ label: "Facebook" });
      await dialogo(page).getByRole("button", { name: "Guardar" }).click();
      await expect(dialogo(page)).toHaveCount(0);
      const tarjeta = page.getByTestId("lista-de-campanas").getByRole("listitem").filter({ hasText: "Campaña V7 admin QR" });
      await expect(tarjeta).toBeVisible();
      await foto(page, "campana-creada");
      await tarjeta.getByRole("button", { name: "Código QR" }).click();
      paso();
      // La campaña no tiene disciplina: se elige aquí, y solo salen las sucursales que la dan.
      await dialogo(page).getByLabel("Disciplina").selectOption({ label: "Vertical Prueba" });
      await dialogo(page).getByLabel("Sucursal").selectOption({ label: mundo.sucursales.norte.nombre });
      await expect(dialogo(page).getByTestId("direccion-del-qr")).toContainText("/l/vertical-prueba");
      const [descarga] = await Promise.all([page.waitForEvent("download"), dialogo(page).getByRole("link", { name: /Descargar el QR \(imagen/ }).click()]);
      expect(descarga.suggestedFilename()).toMatch(/\.png$/);
      const { readFileSync } = await import("node:fs");
      expect(readFileSync((await descarga.path())!).subarray(1, 4).toString("latin1"), "es una imagen PNG de verdad").toBe("PNG");
      await foto(page, "campana-qr");
    });
  });
});

test.describe("otros días", () => {
  test("17. lectura de las pantallas de administración: sin términos técnicos, sin inglés, sin identificadores", async ({ page }) => {
    const problemas: string[] = [];
    for (const ruta of RUTAS_DE_ADMINISTRACION) {
      if (ruta === "/admin/campanas" && FASE === "antes") continue;
      await page.goto(ruta);
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(250);
      const t = await leer(page);
      const m = t.match(new RegExp(JERGA.source, "gi"));
      if (m) problemas.push(`${ruta}: ${[...new Set(m)].join(", ")}`);
    }
    if (FASE === "antes") hallazgos.push(...problemas.map((x) => `texto técnico a la vista en ${x}`));
    else expect(problemas, "términos técnicos a la vista").toEqual([]);
  });

  test("18. tableta (768×1024) y celular (390): las pantallas más usadas caben, sin desborde y con botones de 44 px", async ({ browser, baseURL }) => {
    for (const vista of [{ nombre: "tableta", ancho: 768, alto: 1024 }, { nombre: "celular", ancho: 390, alto: 844 }] as const) {
      const contexto = await contextoConReloj(browser, { baseURL: baseURL!, locale: "es-MX", timezoneId: "America/Mexico_City", viewport: { width: vista.ancho, height: vista.alto }, hasTouch: true, isMobile: true, storageState: comoRol("administrador").storageState });
      const p = await contexto.newPage();
      const externas: string[] = [];
      await contexto.route((u) => u.protocol.startsWith("http") && u.origin !== new URL(baseURL!).origin, (r) => { externas.push(r.request().url()); return r.abort("blockedbyclient"); });
      const pantallas: [string, () => Promise<void>][] = [
        ["inicio", async () => { await p.goto("/admin"); await expect(p.getByRole("heading", { name: "Administración", level: 1 })).toBeVisible(); }],
        ["grupos", async () => { await p.goto("/admin/grupos"); await expect(p.getByRole("heading", { name: "Grupos y horarios", level: 1 })).toBeVisible(); }],
        ["grupo-formulario", async () => { await p.goto("/admin/grupos"); await p.getByRole("button", { name: "Nuevo grupo" }).click(); await expect(dialogo(p)).toBeVisible(); }],
        ["precios", async () => { await p.goto("/admin/precios"); await p.getByLabel("Programa").selectOption({ label: PROGRAMA }); await expect(p.getByTestId("historial-de-precios")).toBeVisible(); }],
        ["modulos", async () => { await p.goto("/admin/modulos"); await expect(p.getByTestId("interruptor-finanzas")).toBeVisible(); }],
        ["usuarios", async () => { await p.goto("/admin/usuarios"); await expect(p.getByRole("heading", { name: "Usuarios y roles", level: 1 })).toBeVisible(); }],
        ["usuario-formulario", async () => { await p.goto("/admin/usuarios"); await p.getByRole("button", { name: "Nuevo usuario" }).click(); await expect(dialogo(p)).toBeVisible(); }],
        ["promociones", async () => { await p.goto("/admin/promociones"); await expect(p.getByRole("heading", { name: "Promociones", level: 1 })).toBeVisible(); }],
        ["tableros", async () => { await p.goto("/tableros"); await expect(p.getByRole("heading", { name: "Tableros", level: 1 })).toBeVisible(); }],
        ["mas", async () => { await p.goto("/mas"); await expect(p.getByRole("heading", { name: "Más", level: 1 })).toBeVisible(); }],
      ];
      const problemas: string[] = [];
      for (const [nombre, ir] of pantallas) {
        await ir();
        await p.waitForLoadState("networkidle", { timeout: 4000 }).catch(() => undefined);
        const m = await medir(p);
        if (m.anchoDelDocumento > m.ancho) problemas.push(`${vista.nombre}/${nombre}: desborde horizontal (${m.anchoDelDocumento} > ${m.ancho})`);
        for (const c of m.chicos) problemas.push(`${vista.nombre}/${nombre}: objetivo táctil chico: ${c}`);
        if (vista.nombre === "celular") for (const l of m.letraChica) problemas.push(`${vista.nombre}/${nombre}: letra de menos de 16 px (zoom automático): ${l}`);
        await p.screenshot({ path: resolve(CARPETA, `${FASE}-${vista.nombre}-${nombre}.png`), fullPage: !nombre.endsWith("formulario"), animations: "disabled" });
      }
      await contexto.close();
      expect(externas).toEqual([]);
      if (FASE === "antes") hallazgos.push(...problemas);
      else expect(problemas, `lo ilegible o inalcanzable en ${vista.nombre}`).toEqual([]);
    }
  });

  test("19. lo que no ve cada rol: asesor, maestro y recepción no entran a Administración (ni por la pantalla ni por la API)", async ({ browser, baseURL }) => {
    for (const rol of ["asesor", "maestro", "recepcion"] as const) {
      const c = await contextoNuevo(browser, baseURL!, "escritorio", rol);
      const p = c.page;
      await p.goto("/admin/modulos");
      await expect(p.getByRole("heading", { name: "Sin acceso" })).toBeVisible();
      await p.goto("/admin/usuarios");
      await expect(p.getByRole("heading", { name: "Sin acceso" })).toBeVisible();
      if (FASE !== "antes") {
        await p.goto("/admin/campanas");
        await expect(p.getByRole("heading", { name: "Sin acceso" })).toBeVisible();
      }
      const api = await apiComo(rol);
      for (const ruta of ["/api/usuarios", "/api/modulos", "/api/configuracion", "/api/administracion/primeros-pasos"]) expect((await api.get(ruta)).status(), `${rol} → ${ruta}`).toBe(FASE === "antes" && ruta.endsWith("primeros-pasos") ? 404 : 403);
      await api.dispose();
      await c.cerrar();
    }
  });
});
