// V7 (maestro): el día de Mario, maestro del Grupo A, en su CELULAR (390×844, con tacto), como alguien que nunca vio el sistema. El guion está en
// `docs/capturas/v1/v7-maestro/ARGUMENTO.md`. Cada pantalla relevante deja una captura `<fase>-NN-<nombre>.png` en esa carpeta (`FASE=antes` antes de corregir, `FASE=despues`
// —lo normal— ya corregido). Sin credenciales y sin salir del origen (la fixtura aborta cualquier otra petición).
//
// Datos: el spec crea los suyos (un grupo propio con horario, dos clases muestra con sus familias) para no depender de lo que dejen las demás pruebas en el mundo compartido
// (maestro.spec cierra el registro de «Alumna Uno», conversion.spec inscribe a «Épsilon»). El pase de lista usa a los alumnos de «Grupo A» en una fecha que nadie más toma.
// Las sesiones de entrar y salir se hacen con un inicio de sesión PROPIO: «Salir» revoca la sesión en el servidor y no debe tirar la que comparten las demás pruebas.

import type { APIRequestContext, Browser, BrowserContext, Locator, Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { abrirSeccion, apiComo, haceDiasEnMexico, json } from "./ayudas.ts";
import { comoRol, contextoNuevo, expect, mundo, test, VISTA_CELULAR } from "./fixtura.ts";
import { carpetaDeCapturas } from "./mundo.ts";
import { crearPrismaDePruebas, type PrismaPruebas } from "../../src/testutil/prisma-pruebas.ts";

test.use({ ...comoRol("maestro"), viewport: VISTA_CELULAR, hasTouch: true, isMobile: true });
test.describe.configure({ mode: "serial" });
test.setTimeout(45_000);

const FASE = process.env["FASE"] === "antes" ? "antes" : "despues";
const CARPETA = carpetaDeCapturas("v1/v7-maestro");
let numeroDeCaptura = 0;

/** Una captura numerada de lo que ve Mario. `completa`: toda la página (agranda la ventana a lo que mide, sin barras fijas partidas). */
async function foto(page: Page, nombre: string, completa = false): Promise<void> {
  mkdirSync(CARPETA, { recursive: true });
  numeroDeCaptura += 1;
  const original = page.viewportSize();
  await page.waitForLoadState("networkidle", { timeout: 4000 }).catch(() => undefined);
  if (completa && original) {
    const alto = await page.evaluate(() => document.documentElement.scrollHeight);
    await page.setViewportSize({ width: original.width, height: Math.min(Math.max(alto, original.height), 4500) });
    await page.waitForTimeout(150);
  }
  await page.screenshot({ path: resolve(CARPETA, `${FASE}-${String(numeroDeCaptura).padStart(2, "0")}-${nombre}.png`), animations: "disabled" });
  if (original) await page.setViewportSize(original);
}

/** Pasos (toques o elecciones) de una tarea diaria; escribir en un campo no cuenta. Meta: 3 o menos. */
const pasosPorTarea: Record<string, number> = {};
let tareaActual = "";
const cuenta = (tarea: string): void => {
  tareaActual = tarea;
  pasosPorTarea[tarea] = 0;
};
const paso = (n = 1): void => {
  pasosPorTarea[tareaActual] = (pasosPorTarea[tareaActual] ?? 0) + n;
};
const META_DE_PASOS = 3;

interface Medidas {
  ancho: number;
  anchoDelDocumento: number;
  chicos: string[];
  letraChica: string[];
}

/** Lo ilegible o inalcanzable de la pantalla de ahora: desborde horizontal, objetivos táctiles de menos de 44 px y campos con letra de menos de 16 px (el teléfono les haría zoom). */
async function medir(page: Page): Promise<Medidas> {
  return page.evaluate(() => {
    const visible = (e: Element): boolean => {
      const r = e.getBoundingClientRect();
      const s = getComputedStyle(e);
      return r.width > 0 && r.height > 0 && r.right > 0 && s.visibility !== "hidden" && s.display !== "none";
    };
    const nombre = (e: Element): string => ((e as HTMLElement).getAttribute("aria-label") || (e as HTMLElement).innerText || e.textContent || e.tagName).trim().replace(/\s+/g, " ").slice(0, 40);
    const chicos: string[] = [];
    for (const e of document.querySelectorAll("button, a[href], summary, select, input:not([type=hidden]), textarea")) {
      if (!visible(e)) continue;
      let objetivo: Element = e;
      if (e.matches("input[type=checkbox], input[type=radio]")) {
        if (e.closest("label.opcion")) continue;
        objetivo = e.closest("label") ?? document.querySelector(`label[for="${e.id}"]`) ?? e;
      }
      const r = objetivo.getBoundingClientRect();
      if (r.height < 43.5 || r.width < 43.5) chicos.push(`${objetivo.tagName.toLowerCase()} «${nombre(objetivo)}» ${Math.round(r.width)}×${Math.round(r.height)}`);
    }
    const letraChica = [...document.querySelectorAll("input:not([type=checkbox]):not([type=radio]), select, textarea")]
      .filter(visible)
      .filter((e) => parseFloat(getComputedStyle(e).fontSize) < 16)
      .map((e) => nombre(e));
    return { ancho: document.documentElement.clientWidth, anchoDelDocumento: document.documentElement.scrollWidth, chicos, letraChica };
  });
}

const hallazgos: string[] = [];
/** Revisa la pantalla: antes de corregir solo anota lo que encuentra (en la consola); ya corregido, cualquier hallazgo falla la prueba. */
async function revisar(page: Page, pantalla: string): Promise<void> {
  const m = await medir(page);
  const problemas = [...(m.anchoDelDocumento > m.ancho ? [`desborde horizontal (${m.anchoDelDocumento} > ${m.ancho})`] : []), ...m.chicos.map((c) => `objetivo táctil chico: ${c}`), ...m.letraChica.map((c) => `letra de menos de 16 px (zoom automático): ${c}`)];
  if (FASE === "antes") {
    for (const p of problemas) hallazgos.push(`${pantalla}: ${p}`);
    return;
  }
  expect(problemas, `${pantalla}: lo ilegible o inalcanzable en celular`).toEqual([]);
}

/** Una expectativa de lo corregido en V7: antes de corregir solo anota que NO se cumple (en `hallazgos`); ya corregido, falla la prueba si no se cumple. */
async function corregido(hallazgo: string, comprobar: () => Promise<void>): Promise<void> {
  if (FASE !== "antes") return comprobar();
  await comprobar().catch(() => {
    hallazgos.push(hallazgo);
  });
}

/** Ningún importe a la vista: ni un signo de pesos con cifras ni montos con centavos. */
async function sinImportes(page: Page): Promise<void> {
  const texto = await page.locator("main").innerText();
  expect(texto, "el maestro no ve importes").not.toMatch(/\$\s?\d|MXN|\d+\.\d{2}\b/);
}

let prisma: PrismaPruebas;
let admin: APIRequestContext;
let maestroApi: APIRequestContext;
const org = mundo.organizacion.id;
const norte = mundo.sucursales.norte.id;
let grupoV7 = "";
let programaId = "";
let n = 0;
const telefonoUnico = (): string => `55${String(20_000_000 + ++n * 7919 + (Date.now() % 1_000_000)).padStart(8, "0")}`;

interface Familia {
  leadId: string;
  claseId: string;
  prospectoId: string;
  nombre: string;
}

/** Un lead con su hijo y una clase muestra que empezó hace 90 minutos en el grupo propio de la prueba. */
async function claseNueva(nombre: string, estatus: "agendada" | "asistio"): Promise<Familia> {
  const telefono = telefonoUnico();
  const lead = await prisma.lead.create({
    data: { organizacion_id: org, vertical_interes_id: mundo.verticalId, sucursal_interes_id: norte, etapa_id: mundo.etapas[estatus === "asistio" ? "muestra_asistida" : "muestra_agendada"] ?? mundo.etapas["muestra_asistida"] ?? "", nombre_contacto: `Familia de ${nombre}`, telefono: `+52${telefono}`, ultima_interaccion_en: new Date() },
  });
  const prospecto = await prisma.prospecto.create({ data: { organizacion_id: org, lead_id: lead.id, vertical_interes_id: mundo.verticalId, nombre, edad_declarada: 8, origen: "asesor" } });
  const cuando = new Date(Math.floor((Date.now() - 90 * 60_000) / 60_000) * 60_000);
  const clase = await prisma.clase_muestra.create({
    data: { organizacion_id: org, lead_id: lead.id, prospecto_id: prospecto.id, grupo_id: grupoV7, fecha_hora: cuando, estatus, agendada_por: "usuario", agendada_por_usuario_id: mundo.usuarios.administrador.id, ...(estatus === "asistio" ? { asistencia_marcada_en: new Date(), asistencia_marcada_por_usuario_id: mundo.usuarios.administrador.id } : {}) },
  });
  return { leadId: lead.id, claseId: clase.id, prospectoId: prospecto.id, nombre };
}

const F: { registro: Familia; cierre: Familia } = { registro: { leadId: "", claseId: "", prospectoId: "", nombre: "" }, cierre: { leadId: "", claseId: "", prospectoId: "", nombre: "" } };
const modoDeCierre = async (modo: "maestro_en_sitio" | "asesor_whatsapp"): Promise<void> => {
  const r = await admin.patch("/api/configuracion", { data: { modo_cierre: modo } });
  expect(r.status(), await r.text()).toBe(200);
};

test.beforeAll(async () => {
  prisma = crearPrismaDePruebas(process.env["DATABASE_URL"], 4);
  admin = await apiComo("administrador");
  maestroApi = await apiComo("maestro");
  await modoDeCierre("asesor_whatsapp");
  const programa = await prisma.programa.findFirstOrThrow({ where: { organizacion_id: org, nombre: "Programa de prueba" } });
  programaId = programa.id;
  const g = await prisma.grupo.create({ data: { organizacion_id: org, programa_id: programaId, nombre: "Grupo V7 Maestro", cupo_maximo: 30, instructor_id: mundo.instructorId } });
  for (const dia of [0, 1, 2, 3, 4, 5, 6]) await prisma.grupo_horario.create({ data: { organizacion_id: org, grupo_id: g.id, dia_semana: dia, hora_inicio_min: 1080, hora_fin_min: 1140 } });
  grupoV7 = g.id;
  F.registro = await claseNueva("Valeria", "agendada");
  F.cierre = await claseNueva("Camila", "asistio");
  // Camila: la maestra ya capturó casi todo en la clase (falta el apellido y que la familia acepte el reglamento).
  const r = await maestroApi.patch(`/api/clases-muestra/${F.cierre.claseId}/registro`, {
    data: {
      alumno: { nombre: "Camila", fecha_nacimiento: "2018-03-02", sexo: "femenino", escuela: "Escuela Nueva", turno_escolar: "matutino", talla_uniforme: "8" },
      tutores: [{ nombre: "Rosa", apellidos: "Soto", parentesco: "madre", telefono: telefonoUnico(), es_responsable_pago: true, lo_lleva: true }],
      antecedentes: { practico_antes: false, motivo_clase: "disciplina" },
      observacion: { grupo_recomendado_id: grupoV7, interes_percibido: "alto" },
      salud: { alergias: "Ninguna", condiciones_medicas: "Ninguna", medicamentos: "Ninguno", contacto_emergencia: { nombre: "Marta Pérez", telefono: "5511112222" }, autorizacion_atencion_medica: true },
    },
  });
  expect(r.status(), await r.text()).toBe(200);
});
test.afterAll(async () => {
  await modoDeCierre("asesor_whatsapp").catch(() => undefined);
  await prisma.grupo.update({ where: { id: grupoV7 }, data: { activo: false } }).catch(() => undefined);
  await prisma.$disconnect();
  await admin.dispose();
  await maestroApi.dispose();
  if (hallazgos.length > 0) process.stdout.write(`\nHALLAZGOS (${FASE}):\n- ${hallazgos.join("\n- ")}\n`);
  process.stdout.write(`\nPASOS POR TAREA: ${JSON.stringify(pasosPorTarea, null, 1)}\n`);
});

/** Un contexto SIN sesión: `browser.newContext()` hereda del archivo el `storageState` del maestro, así que se le quitan las cookies. */
async function anonimo(browser: Browser, baseURL: string): ReturnType<typeof contextoNuevo> {
  const c = await contextoNuevo(browser, baseURL, "celular", null);
  await c.context.clearCookies();
  return c;
}

const guardar = (s: Locator): Locator => s.getByRole("button", { name: /Guardar esta sección|Reintentar guardado/ });
const barra = (page: Page): Locator => page.locator(".barra-inferior");

/** Inicio de sesión propio (por la pantalla de acceso) en un contexto nuevo: lo que se revoque al salir no es la sesión compartida. */
async function entrarComoMaestro(browser: Browser, baseURL: string): Promise<{ page: Page; context: BrowserContext; cerrar: () => Promise<void> }> {
  const c = await anonimo(browser, baseURL);
  await c.page.goto("/");
  await c.page.getByLabel("Correo").fill(mundo.usuarios.maestro.correo);
  await c.page.getByLabel("Contraseña").fill(mundo.usuarios.maestro.contrasena);
  await c.page.getByRole("button", { name: "Entrar" }).click();
  await expect(c.page.getByRole("heading", { name: "Hoy", exact: true })).toBeVisible();
  return c;
}

test.describe("la mañana de Mario", () => {
  test("1. abre la aplicación en el celular: entra y llega a «Hoy» con sus clases", async ({ browser, baseURL }) => {
    const c = await anonimo(browser, baseURL!);
    const p = c.page;
    cuenta("1. entrar");
    await p.goto("/");
    await expect(p.getByRole("heading", { name: "Iniciar sesión" })).toBeVisible();
    await foto(p, "acceso");
    await revisar(p, "acceso");
    await p.getByLabel("Correo").fill(mundo.usuarios.maestro.correo);
    await p.getByLabel("Contraseña").fill(mundo.usuarios.maestro.contrasena);
    await p.getByRole("button", { name: "Entrar" }).click();
    paso();
    await expect(p.getByRole("heading", { name: "Hoy", exact: true })).toBeVisible();
    await expect(p.getByTestId(`clase-${F.registro.claseId}`)).toContainText("Valeria");
    await foto(p, "hoy-al-entrar");
    expect(pasosPorTarea["1. entrar"]).toBeLessThanOrEqual(META_DE_PASOS);
    await c.cerrar();
  });

  test("2. «Hoy»: sus clases del día con hora, niño y grupo; sin teléfonos de la familia ni importes; cabe en el celular", async ({ page }) => {
    await page.goto("/hoy");
    await expect(page.getByRole("heading", { name: "Hoy", exact: true })).toBeVisible();
    const tarjeta = page.getByTestId(`clase-${F.registro.claseId}`);
    await expect(tarjeta).toContainText("Valeria");
    await expect(tarjeta).toContainText("Grupo V7 Maestro");
    await expect(tarjeta).toContainText(/\d{2}:\d{2}/);
    await expect(page.getByText(mundo.maestro.claseAjena.prospecto)).toHaveCount(0);
    expect(await page.locator("main").innerText()).not.toMatch(/\+52|Contacto:/);
    await sinImportes(page);
    await foto(page, "hoy");
    await revisar(page, "hoy");
    // La barra de abajo: lo que un maestro usa a diario, a un toque.
    await expect(barra(page).getByRole("link")).toHaveText([/Hoy/, /Pase de lista/, /Alumnos/]);
  });

  test("3. marca «Asistió» (un toque), se equivoca y lo corrige; la opción elegida se ve elegida, no apagada", async ({ page }) => {
    await page.goto("/hoy");
    const tarjeta = page.getByTestId(`clase-${F.registro.claseId}`);
    cuenta("3. marcar asistencia");
    await tarjeta.getByRole("button", { name: "No asistió" }).click();
    paso();
    await expect(tarjeta.locator(".insignia").first()).toHaveText("No asistió");
    await corregido("«Hoy»: la opción elegida («No asistió») no se distingue como elegida (queda en gris, como un botón que no se puede tocar)", () => expect(tarjeta.getByRole("button", { name: /No asistió/ })).toHaveAttribute("aria-pressed", "true"));
    expect((await json<{ estatus: string }>(admin, `/api/clases-muestra/${F.registro.claseId}`)).estatus).toBe("no_asistio");
    await foto(page, "no-asistio-por-error");
    // Corrige: un toque en la otra opción.
    cuenta("3b. corregir una marca equivocada");
    await tarjeta.getByRole("button", { name: "Asistió", exact: true }).click();
    paso();
    await expect(tarjeta.locator(".insignia").first()).toHaveText("Asistió");
    expect((await json<{ estatus: string }>(admin, `/api/clases-muestra/${F.registro.claseId}`)).estatus).toBe("asistio");
    // La elegida NO se ve apagada: se distingue de un botón que no se puede tocar (opacidad completa y color propio).
    const elegida = tarjeta.getByRole("button", { name: /Asistió/ }).first();
    await corregido("«Hoy»: «Asistió» elegido se ve apagado (opacidad menor a 1)", async () => expect(await elegida.evaluate((e) => getComputedStyle(e).opacity)).toBe("1"));
    await foto(page, "asistio-corregido");
    expect(pasosPorTarea["3. marcar asistencia"]).toBeLessThanOrEqual(META_DE_PASOS);
    expect(pasosPorTarea["3b. corregir una marca equivocada"]).toBeLessThanOrEqual(META_DE_PASOS);
  });

  test("4. «Asistió» sin señal: lo dice junto al botón, no se pierde nada y al reintentar se guarda una sola vez", async ({ page }) => {
    const otra = await claseNueva("Sin Señal", "agendada");
    await page.goto("/hoy");
    const tarjeta = page.getByTestId(`clase-${otra.claseId}`);
    let intentos = 0;
    await page.route("**/api/clases-muestra/*/asistencia", async (r) => {
      if (r.request().method() === "PATCH") {
        intentos += 1;
        return r.abort("internetdisconnected");
      }
      return r.continue();
    });
    await tarjeta.getByRole("button", { name: "Asistió", exact: true }).click();
    await expect(tarjeta.getByRole("alert")).toContainText("No hay conexión");
    await foto(page, "asistio-sin-senal");
    expect((await json<{ estatus: string }>(admin, `/api/clases-muestra/${otra.claseId}`)).estatus).toBe("agendada");
    await page.unroute("**/api/clases-muestra/*/asistencia");
    await tarjeta.getByRole("button", { name: "Asistió", exact: true }).click();
    await expect(tarjeta.locator(".insignia").first()).toHaveText("Asistió");
    expect(intentos).toBe(1);
    expect((await json<{ estatus: string }>(admin, `/api/clases-muestra/${otra.claseId}`)).estatus).toBe("asistio");
  });
});

test.describe("el registro del niño nuevo", () => {
  const ruta = (): string => `/clases/${F.registro.claseId}/registro`;

  test("5. abre el registro desde «Hoy» (un toque): ve qué falta y todo cabe a lo ancho", async ({ page }) => {
    await page.goto("/hoy");
    cuenta("5. abrir el registro");
    await page.getByTestId(`clase-${F.registro.claseId}`).getByRole("link", { name: "Registro del alumno" }).click();
    paso();
    await expect(page.getByRole("heading", { name: "Registro del alumno" })).toBeVisible();
    await expect(page.getByTestId("faltantes")).toContainText("Apellidos del alumno");
    await foto(page, "registro-al-abrir");
    // Todas las secciones abiertas y con un adulto agregado: ahí se ven los objetivos chicos y los desbordes.
    await page.evaluate(() => document.querySelectorAll("details").forEach((d) => (d.open = true)));
    await page.getByRole("button", { name: "Agregar adulto" }).click();
    await page.getByTestId("seccion-antecedentes").getByRole("radio", { name: "Sí" }).check();
    await foto(page, "registro-todas-las-secciones", true);
    await revisar(page, "registro");
    await page.reload();
    expect(pasosPorTarea["5. abrir el registro"]).toBeLessThanOrEqual(META_DE_PASOS);
  });

  test("6. lo escrito sin guardar NO se pierde al cambiar de pantalla (la barra de abajo, «Volver», el atrás del teléfono)", async ({ page }) => {
    await page.goto(ruta());
    const s = await abrirSeccion(page, "alumno");
    await s.getByLabel("Apellidos").fill("Mendoza Ríos");
    await s.getByLabel("Escuela", { exact: true }).fill("Escuela Benito Juárez");
    await foto(page, "registro-escrito-sin-guardar");
    // Se va a otra pantalla por la barra de abajo (con el teclado abierto esa barra se esconde: se cierra el teclado, como lo haría quien lo baja)…
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await barra(page).getByRole("link", { name: "Pase de lista" }).click();
    await expect(page.getByRole("heading", { name: "Pase de lista" })).toBeVisible();
    await barra(page).getByRole("link", { name: "Hoy" }).click();
    await page.getByTestId(`clase-${F.registro.claseId}`).getByRole("link", { name: "Registro del alumno" }).click();
    const s2 = await abrirSeccion(page, "alumno");
    if (FASE === "antes") {
      hallazgos.push(`registro: al volver, Apellidos = «${await s2.getByLabel("Apellidos").inputValue()}» (lo escrito se perdió si está vacío)`);
      await foto(page, "registro-al-volver");
      await s2.getByLabel("Apellidos").fill("Mendoza Ríos");
      await s2.getByLabel("Escuela", { exact: true }).fill("Escuela Benito Juárez");
    } else {
      await expect(s2.getByLabel("Apellidos")).toHaveValue("Mendoza Ríos");
      await expect(s2.getByLabel("Escuela", { exact: true })).toHaveValue("Escuela Benito Juárez");
      await expect(page.getByText("Recuperamos lo que habías escrito")).toBeVisible();
      await foto(page, "registro-recuperado-al-volver");
    }
    // …y con «Volver a Hoy» y el atrás del teléfono pasa lo mismo.
    await page.getByRole("link", { name: /Volver a «Hoy»/ }).click();
    await page.goBack();
    const s3 = await abrirSeccion(page, "alumno");
    if (FASE !== "antes") await expect(s3.getByLabel("Apellidos")).toHaveValue("Mendoza Ríos");
    // Nada de esto va a los almacenes del navegador (son datos de un menor).
    const almacenado = await page.evaluate(() => JSON.stringify({ l: { ...localStorage }, s: { ...sessionStorage } }));
    expect(almacenado).not.toMatch(/Mendoza|Benito/);
    await s3.getByLabel("Apellidos").fill("Mendoza Ríos");
  });

  test("7. alumno: fecha de nacimiento, sexo, escuela; guarda y llega al servidor (con el teclado abierto el botón de guardar sigue a la vista)", async ({ page }) => {
    await page.goto(ruta());
    const s = await abrirSeccion(page, "alumno");
    await s.getByLabel("Nombre", { exact: false }).first().fill("Valeria");
    await s.getByLabel("Apellidos").fill("Mendoza Ríos");
    await s.getByLabel("Fecha de nacimiento (del acta)").fill("2018-05-04");
    await s.getByRole("radio", { name: "Femenino" }).check();
    await s.getByLabel("Escuela", { exact: true }).fill("Escuela Benito Juárez");
    await s.getByLabel("Turno en la escuela").selectOption("matutino");
    // Teclado abierto (en un teléfono sube y deja unos 430 px): se simula con la ventana más baja y el foco en un campo de texto.
    await page.setViewportSize({ width: 390, height: 430 });
    const talla = s.getByLabel("Talla de uniforme");
    await talla.focus();
    await talla.fill("8");
    await page.waitForTimeout(250);
    cuenta("7. guardar una sección");
    const botonDeSeccion = guardar(s);
    await botonDeSeccion.scrollIntoViewIfNeeded();
    const cajas = await page.evaluate(() => {
      const r = (q: string) => {
        const e = document.querySelector(q);
        if (!e || getComputedStyle(e).display === "none") return null;
        const b = e.getBoundingClientRect();
        return { arriba: b.top, abajo: b.bottom };
      };
      return { nav: r(".barra-inferior"), guardado: r(".barra-guardado"), cabecera: r(".cabecera"), alto: window.innerHeight };
    });
    await foto(page, "registro-con-teclado");
    if (FASE === "antes") hallazgos.push(`teclado abierto (430 px de alto): la barra de abajo sigue fija (${cajas.nav ? "visible" : "oculta"}); fijas ocupan ${Math.round(((cajas.nav ? cajas.nav.abajo - cajas.nav.arriba : 0) + (cajas.guardado ? cajas.guardado.abajo - cajas.guardado.arriba : 0) + (cajas.cabecera ? cajas.cabecera.abajo - cajas.cabecera.arriba : 0)) / cajas.alto * 100)}% de la pantalla`);
    else {
      expect(cajas.nav, "con el teclado abierto la barra de abajo se esconde").toBeNull();
      // El botón de guardar de la sección no queda tapado por la barra de «Guardar borrador».
      const tapado = await botonDeSeccion.evaluate((b) => {
        const r = b.getBoundingClientRect();
        const arriba = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return !(arriba === b || b.contains(arriba));
      });
      expect(tapado, "el botón de guardar de la sección queda a la vista").toBe(false);
    }
    await botonDeSeccion.click();
    paso();
    await page.setViewportSize(VISTA_CELULAR);
    await expect(s.getByRole("status").filter({ hasText: "Guardado a las" })).toBeVisible();
    const r = await json<{ alumno: Record<string, string> }>(admin, `/api/clases-muestra/${F.registro.claseId}/registro`);
    expect(r.alumno).toMatchObject({ nombre: "Valeria", apellidos: "Mendoza Ríos", fecha_nacimiento: "2018-05-04", sexo: "femenino", escuela: "Escuela Benito Juárez", turno_escolar: "matutino", talla_uniforme: "8" });
    expect(pasosPorTarea["7. guardar una sección"]).toBeLessThanOrEqual(META_DE_PASOS);
  });

  test("8. adultos: dos filas con quien paga y quien recoge; guarda", async ({ page }) => {
    await page.goto(ruta());
    const s = await abrirSeccion(page, "tutores");
    await s.getByRole("button", { name: "Agregar adulto" }).click();
    const a1 = s.getByTestId("adulto-0");
    await a1.getByLabel(/^Nombre/).fill("Rosa");
    await a1.getByLabel("Apellidos").fill("Mendoza");
    await a1.getByLabel("Parentesco").fill("madre");
    await a1.getByLabel("Teléfono").fill("55 3344 5566");
    await a1.getByLabel("Es el responsable de pago").check();
    await a1.getByLabel("Es quien lo lleva").check();
    await s.getByRole("button", { name: "Agregar adulto" }).click();
    const a2 = s.getByTestId("adulto-1");
    await a2.getByLabel(/^Nombre/).fill("Luis");
    await a2.getByLabel("Parentesco").fill("tío");
    await a2.getByLabel("Teléfono").fill("5598765432");
    await a2.getByLabel("Puede recogerlo").check();
    await foto(page, "registro-adultos", true);
    await guardar(s).click();
    await expect(s.getByRole("status").filter({ hasText: "Guardado a las" })).toBeVisible();
    const r = await json<{ tutores: { nombre: string; es_responsable_pago: boolean }[] }>(admin, `/api/clases-muestra/${F.registro.claseId}/registro`);
    expect(r.tutores.map((t) => t.nombre)).toEqual(["Rosa", "Luis"]);
  });

  test("9. salud y seguridad: se captura, se guarda, y NO queda en pantalla ni en las capturas (ni al ver lo registrado y mandar la aplicación a segundo plano)", async ({ page }) => {
    await page.goto(ruta());
    const s = await abrirSeccion(page, "salud");
    await s.getByLabel("Alergias").fill("Polen de pino");
    await s.getByLabel("Condiciones médicas").fill("Asma leve");
    await s.getByLabel("Medicamentos").fill("Inhalador por las tardes");
    await s.getByLabel("Nombre del contacto").fill("Marta Pérez");
    await s.getByLabel("Teléfono del contacto").fill("5511112222");
    await s.getByRole("radio", { name: "Sí" }).check();
    // Esta captura NO se toma con los datos de salud escritos: son de un menor.
    await s.getByRole("button", { name: "Guardar salud y seguridad" }).click();
    await expect(s.getByText("Guardado", { exact: true })).toBeVisible();
    await expect(s.getByLabel("Condiciones médicas")).toHaveValue("");
    expect(await page.content(), "los datos de salud no quedan en el documento").not.toMatch(/Polen de pino|Asma leve|Inhalador|Marta Pérez/);
    await foto(page, "registro-salud-guardada");
    // «Ver lo registrado» los trae a la pantalla; al mandar la aplicación a segundo plano (bloquear el teléfono) se esconden solos.
    await s.getByRole("button", { name: "Ver lo registrado" }).click();
    await expect(s.getByLabel("Condiciones médicas")).toHaveValue("Asma leve");
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    if (FASE === "antes") hallazgos.push(`salud: al bloquear el teléfono con «Ver lo registrado» abierto, Condiciones médicas = «${await s.getByLabel("Condiciones médicas").inputValue()}» (a la vista si no está vacío)`);
    else await expect(s.getByLabel("Condiciones médicas")).toHaveValue("");
    const almacenado = await page.evaluate(() => JSON.stringify({ l: { ...localStorage }, s: { ...sessionStorage }, u: location.href }));
    expect(almacenado).not.toMatch(/Asma|Polen|Marta|Inhalador/);
    // Los campos de salud no le piden al teclado que aprenda ni autocomplete lo escrito.
    if (FASE !== "antes") for (const campo of ["Alergias", "Condiciones médicas", "Medicamentos"]) await expect(s.getByLabel(campo)).toHaveAttribute("autocomplete", "off");
  });

  test("10. antecedentes y observación: guarda; una nota con datos de salud la rechaza y lo dice en el campo", async ({ page }) => {
    await page.goto(ruta());
    const a = await abrirSeccion(page, "antecedentes");
    await a.getByRole("radio", { name: "Sí" }).check();
    await a.getByLabel("¿Dónde practicó?").fill("Escuela X");
    await a.getByLabel("¿Por qué quiere tomar la clase?").selectOption("otro");
    await a.getByLabel("Cuéntanos el motivo").fill("Se lo recomendó una amiga");
    await guardar(a).click();
    await expect(a.getByRole("status").filter({ hasText: "Guardado a las" })).toBeVisible();
    const o = await abrirSeccion(page, "observacion");
    await o.getByLabel("Nivel observado en la clase").fill("Básico");
    await o.getByLabel("Grupo recomendado").selectOption({ label: "Grupo V7 Maestro" });
    await o.getByRole("radio", { name: "Alto" }).check();
    await o.getByLabel("Notas del maestro").fill("Tiene alergia al polvo");
    await guardar(o).click();
    await expect(o.locator(".campo-error")).toContainText(/salud/i);
    await o.getByLabel("Notas del maestro").fill("Muy atenta y con ganas de aprender");
    await guardar(o).click();
    await expect(o.getByRole("status").filter({ hasText: "Guardado a las" })).toBeVisible();
    await foto(page, "registro-observacion", true);
  });

  test("11. reglamento e imagen: la familia responde (dos toques) y el registro se marca como completo", async ({ page }) => {
    await page.goto(ruta());
    const legal = await abrirSeccion(page, "legal");
    cuenta("11. reglamento e imagen");
    await legal.getByTestId("documento-reglamento").getByRole("button", { name: "Aceptan", exact: true }).click();
    paso();
    await expect(legal.getByTestId("documento-reglamento")).toContainText("Aceptado");
    await legal.getByTestId("documento-uso_imagen").getByRole("button", { name: "Aceptan", exact: true }).click();
    paso();
    await expect(legal.getByTestId("documento-uso_imagen")).toContainText("Aceptado");
    await foto(page, "registro-reglamento-e-imagen", true);
    await expect(page.getByTestId("faltantes")).toHaveCount(0);
    cuenta("11b. marcar completo");
    await page.getByRole("button", { name: "Marcar registro como completo" }).scrollIntoViewIfNeeded();
    await page.getByRole("button", { name: "Marcar registro como completo" }).click();
    paso();
    await expect(page.getByText("Registro: Completo")).toBeVisible();
    await foto(page, "registro-completo");
    expect((await json<{ estatus: string }>(admin, `/api/clases-muestra/${F.registro.claseId}/registro`)).estatus).toBe("completo");
    expect(pasosPorTarea["11. reglamento e imagen"]).toBeLessThanOrEqual(META_DE_PASOS);
  });

  test("12. un registro sin red: avisa a la altura del botón, conserva lo escrito y reintenta sin duplicar", async ({ page }) => {
    const otra = await claseNueva("Sin Red", "agendada");
    await page.goto(`/clases/${otra.claseId}/registro`);
    const o = await abrirSeccion(page, "observacion");
    await o.getByLabel("Nivel observado en la clase").fill("Intermedio alto");
    let intentos = 0;
    await page.route("**/api/clases-muestra/*/registro", async (r) => {
      if (r.request().method() === "PATCH") {
        intentos += 1;
        return r.abort("internetdisconnected");
      }
      return r.continue();
    });
    await guardar(o).click();
    await expect(o).toContainText("No hay conexión con el servidor");
    await expect(o).toContainText("Lo que escribiste sigue aquí");
    await foto(page, "registro-sin-red");
    await expect(o.getByLabel("Nivel observado en la clase")).toHaveValue("Intermedio alto");
    await page.unroute("**/api/clases-muestra/*/registro");
    await guardar(o).click();
    await expect(o.getByRole("status").filter({ hasText: "Guardado a las" })).toBeVisible();
    expect(intentos).toBe(1);
    const r = await json<{ observacion: { nivel_observado: string } }>(admin, `/api/clases-muestra/${otra.claseId}/registro`);
    expect(r.observacion.nivel_observado).toBe("Intermedio alto");
  });
});

test.describe("cerrar", () => {
  test("13. «Listo para cerrar» (la escuela cierra por WhatsApp): dos toques desde «Hoy» y el asesor recibe una tarea", async ({ page }) => {
    await modoDeCierre("asesor_whatsapp");
    await page.goto("/hoy");
    const tarjeta = page.getByTestId(`clase-${F.registro.claseId}`);
    cuenta("13. listo para cerrar");
    await expect(tarjeta).toContainText("Asistió");
    await tarjeta.getByRole("button", { name: "Listo para cerrar la inscripción" }).click();
    paso();
    await expect(tarjeta).toContainText("el asesor recibió el aviso");
    await foto(page, "listo-para-cerrar");
    const tareas = await json<{ datos: { tipo: string; estado: string }[] }>(admin, `/api/tareas?tipo=listo_para_cerrar&lead_id=${F.registro.leadId}`);
    expect(tareas.datos).toHaveLength(1);
    expect(pasosPorTarea["13. listo para cerrar"]).toBeLessThanOrEqual(META_DE_PASOS);
  });

  test("14. cierre en sitio: completa lo que falta (apellido y reglamento), vuelve a «Hoy», inscribe con confirmación; sin importes", async ({ page }) => {
    await modoDeCierre("maestro_en_sitio");
    await page.goto("/hoy");
    const tarjeta = page.getByTestId(`clase-${F.cierre.claseId}`);
    await expect(tarjeta.getByTestId("cierre-en-sitio")).toContainText("Todavía falta para poder inscribirlo");
    await expect(tarjeta.getByTestId("cierre-en-sitio")).toContainText("Apellidos del alumno");
    await foto(page, "cierre-en-sitio-falta-algo");
    await sinImportes(page);
    // Completa lo que falta en el registro.
    await tarjeta.getByRole("link", { name: "Registro del alumno" }).click();
    const s = await abrirSeccion(page, "alumno");
    await s.getByLabel("Apellidos").fill("Soto Vega");
    await guardar(s).click();
    await expect(s.getByRole("status").filter({ hasText: "Guardado a las" })).toBeVisible();
    const legal = await abrirSeccion(page, "legal");
    await legal.getByTestId("documento-reglamento").getByRole("button", { name: "Aceptan", exact: true }).click();
    await expect(legal.getByTestId("documento-reglamento")).toContainText("Aceptado");
    // De vuelta en «Hoy»: ahora sí se puede inscribir.
    await page.getByRole("link", { name: /Volver a «Hoy»/ }).click();
    const cierre = page.getByTestId(`clase-${F.cierre.claseId}`).getByTestId("cierre-en-sitio");
    await expect(cierre).toContainText("Ya está todo lo necesario");
    cuenta("14. inscribir a mi alumno");
    await cierre.getByRole("button", { name: "Inscribir a mi alumno" }).scrollIntoViewIfNeeded();
    await foto(page, "cierre-en-sitio-listo");
    await cierre.getByRole("button", { name: "Inscribir a mi alumno" }).click();
    paso();
    const dialogo = page.getByRole("dialog", { name: "Inscribir a Camila" });
    await expect(dialogo).toContainText("Quedará inscrito en el grupo Grupo V7 Maestro");
    expect(await dialogo.innerText()).not.toMatch(/\$\s?\d/);
    await foto(page, "cierre-en-sitio-confirmar");
    await revisar(page, "cierre en sitio (confirmación)");
    await dialogo.getByRole("button", { name: "Sí, inscribir" }).click();
    paso();
    await expect(page.getByTestId(`clase-${F.cierre.claseId}`)).toContainText("quedó inscrito");
    await sinImportes(page);
    await foto(page, "cierre-en-sitio-inscrito");
    const inscritos = await prisma.inscripcion.count({ where: { grupo_id: grupoV7, estatus: "activa", eliminado_en: null } });
    expect(inscritos).toBe(1);
    expect(pasosPorTarea["14. inscribir a mi alumno"]).toBeLessThanOrEqual(META_DE_PASOS);
    await modoDeCierre("asesor_whatsapp");
  });
});

test.describe("pase de lista de su grupo", () => {
  test.describe.configure({ mode: "serial" });
  const fecha = haceDiasEnMexico(3);
  const [ana, beto, cira] = mundo.maestro.alumnosDelPase as [(typeof mundo.maestro.alumnosDelPase)[number], (typeof mundo.maestro.alumnosDelPase)[number], (typeof mundo.maestro.alumnosDelPase)[number]];
  const alumno = (page: Page, a: { alumnoId: string }): Locator => page.getByTestId(`alumno-${a.alumnoId}`);
  const guardarPase = (page: Page): Locator => page.getByRole("button", { name: "Guardar pase de lista" });
  const listaDelServidor = async (): Promise<Record<string, string>> => {
    const l = await json<{ lista: { alumno: string; estatus: string }[] }>(admin, `/api/grupos/${mundo.grupos.a.id}/pase?fecha=${fecha}`);
    return Object.fromEntries(l.lista.map((f) => [f.alumno, f.estatus]));
  };

  test("15. pasa lista: todos presentes, una falta, guarda (tres toques); cabe en el celular y dice qué pasó", async ({ page }) => {
    await page.goto("/hoy");
    cuenta("15. pasar lista");
    await barra(page).getByRole("link", { name: "Pase de lista" }).click();
    paso(); // desde «Hoy» (su inicio) la sección está en la barra de abajo
    await expect(page.getByRole("heading", { name: "Pase de lista" })).toBeVisible();
    await foto(page, "pase-al-abrir");
    await page.getByLabel("Fecha de la clase").fill(fecha);
    await expect(page.getByTestId("resumen-pase")).toContainText("Sin marcar 3");
    await revisar(page, "pase de lista");
    await page.getByRole("button", { name: /Marcar presentes a todos/ }).click();
    paso();
    await alumno(page, cira).getByRole("radio", { name: "Falta" }).check();
    paso();
    await foto(page, "pase-marcado");
    await guardarPase(page).click();
    paso();
    await expect(page.getByTestId("resultado-pase")).toContainText("3 nuevas, 0 corregidas, 0 sin cambio");
    await corregido("pase: tras guardar, la barra fija no dice «Pase guardado a las…» (el resultado queda debajo de la barra)", () => expect(page.getByRole("status").filter({ hasText: "Pase guardado a las" })).toBeVisible());
    await foto(page, "pase-guardado");
    expect(await listaDelServidor()).toEqual({ "Ana Prueba": "presente", "Beto Prueba": "presente", "Cira Prueba": "falta" });
    // Abrir + «todos presentes» + la excepción + guardar: 4 toques el día que hay una falta (3 si todos vinieron). Cada pieza es una decisión distinta; se anota en la bitácora.
    expect(pasosPorTarea["15. pasar lista"]).toBeLessThanOrEqual(META_DE_PASOS + 1);
  });

  test("16. corrige una falta equivocada: dos toques", async ({ page }) => {
    await page.goto("/pase");
    await page.getByLabel("Fecha de la clase").fill(fecha);
    await expect(page.getByTestId("resumen-pase")).toContainText("Pase ya tomado");
    cuenta("16. corregir una falta");
    await alumno(page, cira).getByRole("radio", { name: "Justificada" }).check();
    paso();
    await guardarPase(page).click();
    paso();
    await expect(page.getByTestId("resultado-pase")).toContainText("0 nuevas, 1 corregidas, 2 sin cambio");
    expect(await listaDelServidor()).toMatchObject({ "Cira Prueba": "justificada" });
    expect(pasosPorTarea["16. corregir una falta"]).toBeLessThanOrEqual(META_DE_PASOS);
  });

  test("17. lo marcado y sin guardar no se pierde al cambiar de fecha ni de pantalla; el contador habla en singular", async ({ page }) => {
    await page.goto("/pase");
    await page.getByLabel("Fecha de la clase").fill(fecha);
    await expect(page.getByTestId("resumen-pase")).toContainText("Pase ya tomado");
    await alumno(page, beto).getByRole("radio", { name: "Falta" }).check();
    if (FASE === "antes") hallazgos.push(`pase: el contador dice «${await page.locator("[role=status]").filter({ hasText: /sin guardar/ }).first().innerText()}»`);
    else await expect(page.locator("[role=status]").filter({ hasText: /sin guardar/ })).toContainText("1 cambio sin guardar");
    // Cambia de fecha y regresa.
    await page.getByLabel("Fecha de la clase").fill(haceDiasEnMexico(4));
    await page.getByLabel("Fecha de la clase").fill(fecha);
    await expect(page.getByTestId("resumen-pase")).toContainText("Pase ya tomado");
    const resumen = await page.getByTestId("resumen-pase").innerText();
    if (FASE === "antes") hallazgos.push(`pase: tras cambiar de fecha y volver, el resumen dice «${resumen.replace(/\n/g, " ")}» (la falta de Beto se perdió si dice Faltas 0)`);
    else expect(resumen).toContain("Faltas 1");
    // Y por la barra de abajo.
    await barra(page).getByRole("link", { name: "Hoy" }).click();
    await barra(page).getByRole("link", { name: "Pase de lista" }).click();
    await page.getByLabel("Fecha de la clase").fill(fecha);
    await expect(page.getByTestId("resumen-pase")).toContainText("Pase ya tomado");
    if (FASE !== "antes") await expect(page.getByTestId("resumen-pase")).toContainText("Faltas 1");
    // Lo deja como estaba para lo que sigue: vuelve a presente (sin guardar nada).
    await alumno(page, beto).getByRole("radio", { name: "Presente" }).check();
  });

  test("18. sin señal: el aviso se ve junto al botón (no tapado por la barra), las marcas siguen ahí y el reintento guarda UNA vez; con red lenta, doble toque no duplica", async ({ page }) => {
    await page.goto("/pase");
    await page.getByLabel("Fecha de la clase").fill(fecha);
    await expect(page.getByTestId("resumen-pase")).toContainText("Pase ya tomado");
    await alumno(page, ana).getByRole("radio", { name: "Falta" }).check();
    let envios = 0;
    await page.route("**/api/grupos/*/pase", async (r) => {
      if (r.request().method() === "PUT") {
        envios += 1;
        return r.abort("internetdisconnected");
      }
      return r.continue();
    });
    await guardarPase(page).click();
    await page.waitForTimeout(400);
    // ¿Se ve el aviso? (que no quede debajo de la barra fija ni fuera de la pantalla)
    const aviso = page.getByRole("alert").filter({ hasText: "No hay conexión" }).first();
    const visible = await aviso.evaluate((e) => {
      const r = e.getBoundingClientRect();
      const arriba = document.elementFromPoint(Math.min(Math.max(r.left + 20, 0), window.innerWidth - 1), Math.min(Math.max(r.top + r.height / 2, 0), window.innerHeight - 1));
      return r.top >= 0 && r.bottom <= window.innerHeight && !!arriba && (e === arriba || e.contains(arriba));
    });
    await foto(page, "pase-sin-senal");
    if (FASE === "antes") hallazgos.push(`pase sin señal: el aviso «No hay conexión» ${visible ? "se ve" : "NO se ve (queda debajo de la barra fija)"}`);
    else {
      expect(visible, "el aviso de «sin señal» se ve en la pantalla").toBe(true);
      await expect(page.getByTestId("error-del-pase")).toContainText("Tus marcas siguen aquí");
      await expect(page.getByTestId("error-del-pase")).toContainText("No se guardó nada todavía");
    }
    expect(envios).toBe(1);
    expect((await listaDelServidor())["Ana Prueba"]).toBe("presente");
    await expect(alumno(page, ana).getByRole("radio", { name: "Falta" })).toBeChecked();
    // Vuelve la señal, pero lenta: dos toques seguidos mandan un solo envío.
    await page.unroute("**/api/grupos/*/pase");
    let lentos = 0;
    await page.route("**/api/grupos/*/pase", async (r) => {
      if (r.request().method() === "PUT") {
        lentos += 1;
        await new Promise((f) => setTimeout(f, 1200));
      }
      return r.continue();
    });
    await guardarPase(page).dblclick();
    await expect(page.getByTestId("resultado-pase")).toContainText("1 corregidas");
    expect(lentos).toBe(1);
    expect((await listaDelServidor())["Ana Prueba"]).toBe("falta");
    // Y guardar lo mismo otra vez no cambia nada.
    await page.unroute("**/api/grupos/*/pase");
    await alumno(page, ana).getByRole("radio", { name: "Presente" }).check();
    await alumno(page, ana).getByRole("radio", { name: "Falta" }).check();
    await guardarPase(page).click();
    await expect(page.getByTestId("resultado-pase")).toContainText("0 nuevas, 0 corregidas, 3 sin cambio");
  });
});

test.describe("consultar alumnos", () => {
  test("19. el expediente de un alumno suyo: trayectoria y operativo, sin importes ni pestañas de dinero", async ({ page }) => {
    const ana = mundo.maestro.alumnosDelPase[0]!;
    await page.goto("/hoy");
    cuenta("19. expediente de un alumno");
    await barra(page).getByRole("link", { name: "Alumnos" }).click();
    paso();
    await expect(page.getByTestId("lista-de-alumnos")).toContainText("Ana Prueba");
    await foto(page, "alumnos-lista");
    await revisar(page, "alumnos");
    await page.getByTestId("lista-de-alumnos").getByRole("link", { name: "Ana Prueba" }).click();
    paso();
    await expect(page.getByRole("heading", { name: "Ana Prueba" })).toBeVisible();
    await expect(page.getByRole("tab")).toHaveText(["Trayectoria", "Operativo"]);
    await sinImportes(page);
    await corregido("expediente: «Le faltan 0 clases (0 de 0)» sin ningún evento próximo", async () => expect(await page.locator("main").innerText(), "sin «Le faltan 0 clases (0 de 0)»").not.toMatch(/0 de 0/));
    await foto(page, "expediente-propio");
    await revisar(page, "expediente");
    expect(page.url()).toContain(ana.alumnoId);
    expect(pasosPorTarea["19. expediente de un alumno"]).toBeLessThanOrEqual(META_DE_PASOS);
  });

  test("20. un alumno que NO es suyo: se niega con un mensaje claro y un camino de regreso (no un «Reintentar» que no sirve)", async ({ page }) => {
    await page.goto(`/alumnos/${mundo.familia.rivera.hijos[0]!.alumnoId}`);
    const aviso = page.getByRole("alert").filter({ hasText: "No se pudo cargar" });
    await expect(aviso).toContainText("No se encontr");
    await foto(page, "alumno-ajeno");
    // Sin datos de la familia ni del alumno ajeno a la vista.
    expect(await page.locator("main").innerText()).not.toMatch(/Hija Mayor|Rosa Rivera|5555030303/);
    if (FASE === "antes") hallazgos.push(`alumno ajeno: «${(await aviso.innerText()).replace(/\n+/g, " | ")}»`);
    else {
      await expect(aviso).toContainText("de tus grupos");
      await expect(aviso.getByRole("button", { name: "Reintentar" })).toHaveCount(0);
      await aviso.getByRole("link", { name: "Ir a mi inicio" }).click();
      await expect(page.getByRole("heading", { name: "Hoy", exact: true })).toBeVisible();
    }
    // Y la clase muestra de otro grupo, por su dirección.
    await page.goto(`/clases/${mundo.maestro.claseAjena.id}/registro`);
    await expect(page.getByRole("alert").filter({ hasText: "No se pudo cargar" })).toContainText(/No se encontr/);
  });
});

test.describe("orientación horizontal", () => {
  test.use({ viewport: { width: 844, height: 390 } });

  test("21. de lado (844×390) las barras fijas no se comen la pantalla y nada se desborda", async ({ page }) => {
    for (const [nombre, ruta] of [["hoy", "/hoy"], ["pase", "/pase"], ["registro", `/clases/${F.registro.claseId}/registro`]] as const) {
      await page.goto(ruta);
      await page.waitForLoadState("networkidle");
      const fijas = await page.evaluate(() => {
        const alto = (q: string): number => {
          const e = document.querySelector(q);
          if (!e) return 0;
          const s = getComputedStyle(e);
          return s.position === "fixed" || s.position === "sticky" ? e.getBoundingClientRect().height : 0;
        };
        return { cabecera: alto(".cabecera"), nav: alto(".barra-inferior"), guardado: alto(".barra-guardado"), alto: window.innerHeight };
      });
      const porcentaje = Math.round(((fijas.cabecera + fijas.nav + fijas.guardado) / fijas.alto) * 100);
      await foto(page, `horizontal-${nombre}`);
      if (FASE === "antes") hallazgos.push(`horizontal ${nombre}: lo fijo (encabezado ${Math.round(fijas.cabecera)} + barra ${Math.round(fijas.nav)} + guardar ${Math.round(fijas.guardado)}) ocupa ${porcentaje}% de la pantalla`);
      else expect(porcentaje, `${nombre}: lo fijo no debe pasar de un tercio de la pantalla`).toBeLessThanOrEqual(34);
      const m = await medir(page);
      expect(m.anchoDelDocumento, `${nombre}: sin desborde horizontal`).toBeLessThanOrEqual(m.ancho);
    }
  });
});

test.describe("entrar y salir", () => {
  test("22. la sesión vence a media captura: vuelve a entrar y lo escrito sigue ahí", async ({ browser, baseURL }) => {
    const c = await entrarComoMaestro(browser, baseURL!);
    const p = c.page;
    await p.goto(`/clases/${F.registro.claseId}/registro`);
    const s = await abrirSeccion(p, "observacion");
    await s.getByLabel("Nivel observado en la clase").fill("Nivel que se escribió antes de vencer la sesión");
    await c.context.clearCookies();
    await s.getByRole("button", { name: /Guardar esta sección/ }).click();
    await expect(p.getByText("Tu sesión terminó")).toBeVisible();
    await foto(p, "sesion-vencida");
    await p.getByLabel("Correo").fill(mundo.usuarios.maestro.correo);
    await p.getByLabel("Contraseña").fill(mundo.usuarios.maestro.contrasena);
    await p.getByRole("button", { name: "Entrar" }).click();
    await expect(p.getByRole("heading", { name: "Registro del alumno" })).toBeVisible();
    const s2 = await abrirSeccion(p, "observacion");
    const valor = await s2.getByLabel("Nivel observado en la clase").inputValue();
    if (FASE === "antes") hallazgos.push(`sesión vencida: al volver a entrar el campo dice «${valor}» (lo escrito se perdió si no es el texto)`);
    else expect(valor).toBe("Nivel que se escribió antes de vencer la sesión");
    await foto(p, "sesion-vencida-recuperado");
    await c.cerrar();
  });

  test("23. cierra sesión (un toque, sin dejar borradores) y vuelve a entrar", async ({ browser, baseURL }) => {
    const c = await entrarComoMaestro(browser, baseURL!);
    const p = c.page;
    await p.goto(`/clases/${F.registro.claseId}/registro`);
    const s = await abrirSeccion(p, "observacion");
    await s.getByLabel("Notas del maestro").fill("Borrador que no debe sobrevivir al cierre de sesión");
    cuenta("23. cerrar sesión");
    await p.getByRole("button", { name: "Salir" }).click();
    paso();
    await expect(p.getByRole("heading", { name: "Iniciar sesión" })).toBeVisible();
    await expect(p.getByText("Cerraste tu sesión.")).toBeVisible();
    await foto(p, "sesion-cerrada");
    await p.getByLabel("Correo").fill(mundo.usuarios.maestro.correo);
    await p.getByLabel("Contraseña").fill(mundo.usuarios.maestro.contrasena);
    await p.getByRole("button", { name: "Entrar" }).click();
    await expect(p.getByRole("heading", { name: "Registro del alumno" })).toBeVisible();
    const s2 = await abrirSeccion(p, "observacion");
    // Lo que ya estaba guardado en el servidor sigue; el borrador sin guardar no sobrevive a cerrar sesión.
    await expect(s2.getByLabel("Notas del maestro")).not.toHaveValue(/Borrador que no debe/);
    await expect(p.getByText("Recuperamos lo que habías escrito")).toHaveCount(0);
    expect(pasosPorTarea["23. cerrar sesión"]).toBeLessThanOrEqual(META_DE_PASOS);
    await c.cerrar();
  });

  test("24. la pantalla de acceso se escribe bien en el teléfono: correo sin mayúscula automática, letra de 16 px, sin desborde", async ({ browser, baseURL }) => {
    const c = await anonimo(browser, baseURL!);
    await c.page.goto("/");
    await revisar(c.page, "acceso");
    const correo = c.page.getByLabel("Correo");
    if (FASE !== "antes") {
      await expect(correo).toHaveAttribute("autocapitalize", "none");
      await expect(correo).toHaveAttribute("autocorrect", "off");
    }
    await c.cerrar();
  });
});
