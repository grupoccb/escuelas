// V7 (recepción): el día de Rita, recepcionista de la sucursal Norte, en la computadora del mostrador (1366×768), como alguien que nunca vio el sistema. El guion está en
// `docs/capturas/v1/v7-recepcion/ARGUMENTO.md`. Cada pantalla relevante deja una captura `<fase>-NN-<nombre>.png` en esa carpeta (`FASE=antes` antes de corregir, `FASE=despues`
// —lo normal— ya corregido). Sin credenciales y sin salir del origen (la fixtura aborta cualquier otra petición).
//
// Datos: el spec crea los suyos (dos familias con sus cargos, un uniforme por entregar y sus productos) para no depender de lo que dejen las demás pruebas en el mundo compartido
// (recepcion.spec cobra a «Gómez» y entrega el uniforme de «Alumno Uniforme»). Todo importe se compara como TEXTO contra la API; aquí no hay flotantes.

import type { APIRequestContext, APIResponse, Locator, Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { apiComo, haceDiasEnMexico, json } from "./ayudas.ts";
import { comoRol, contextoNuevo, expect, mundo, test, VISTA_ESCRITORIO, contextoConReloj } from "./fixtura.ts";
import { carpetaDeCapturas } from "./mundo.ts";
import { sembrarAlumno, sembrarFamilia, type DocumentosLegalesSembrados, type OrganizacionDePrueba } from "../../src/testutil/semilla.ts";
import { crearPrismaDePruebas, type PrismaPruebas } from "../../src/testutil/prisma-pruebas.ts";

test.use({ ...comoRol("recepcion"), viewport: VISTA_ESCRITORIO });
test.describe.configure({ mode: "serial" });
test.setTimeout(45_000);

const FASE = process.env["FASE"] === "antes" ? "antes" : "despues";
const CARPETA = carpetaDeCapturas("v1/v7-recepcion");
// `FOTO_DESDE` permite correr solo una parte del recorrido sin pisar las capturas de las pruebas anteriores.
let numeroDeCaptura = Number.parseInt(process.env["FOTO_DESDE"] ?? "0", 10);

/** Una captura numerada de lo que ve Rita. `completa`: toda la página. */
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
const META_DE_PASOS = 3;

const hallazgos: string[] = [];
/** Una expectativa de lo corregido en V7: antes de corregir solo anota que NO se cumple; ya corregido, falla la prueba si no se cumple. */
async function corregido(hallazgo: string, comprobar: () => Promise<void>): Promise<void> {
  if (FASE !== "antes") return comprobar();
  await comprobar().catch(() => {
    hallazgos.push(hallazgo);
  });
}

/** El texto de la pantalla (sin la barra lateral ni el encabezado), para leer lo que ve Rita y para buscar jerga o identificadores. */
const leer = (page: Page): Promise<string> => page.locator("main").innerText();

/** Lo que Rita no debería leer nunca: identificadores, códigos, inglés técnico. */
const JERGA = /\b[0-9a-f]{8}-[0-9a-f]{4}-|undefined|\bnull\b|NaN|\[object|payload|UUID|soft delete|stock_|sin_stock|cargo_con_pagos|ya_entregado|excedente_sin_cargo|\bError\b|exception/i;

/** La organización del mundo de pruebas con la forma que piden las semillas (`sembrarAlumno`, `sembrarFamilia`). */
const orgDePrueba = (): OrganizacionDePrueba =>
  ({ organizacionId: mundo.organizacion.id, slug: mundo.organizacion.slug, verticalId: mundo.verticalId, sucursales: [mundo.sucursales.norte, mundo.sucursales.sur], etapaInicialId: mundo.etapas["nuevo"] ?? "" }) as unknown as OrganizacionDePrueba;

let prisma: PrismaPruebas;
let admin: APIRequestContext;
let recepcionApi: APIRequestContext;
const org = mundo.organizacion.id;
const norte = mundo.sucursales.norte.id;
let n = 0;
const telefonoUnico = (): string => `55${String(30_000_000 + ++n * 7919 + (Date.now() % 1_000_000)).padStart(8, "0")}`;

interface Cuenta {
  resumen: { saldo: string; vencido: string; total_cargado: string; total_pagado: string; antiguedad: Record<string, string> };
  hijos: { alumno: { id: string; nombre: string }; cargos: { id: string; concepto: string; saldo: string; descripcion: string | null; estatus: string }[] }[];
}
interface PagoApi {
  id: string;
  estatus: string;
  monto: string;
  metodo: string;
  fecha: string;
  creado_en: string;
  registrado_por: { id: string; nombre: string } | null;
  aplicaciones: { monto: string; estatus: string; cargo_id: string; alumno: { nombre: string } }[];
}
const cuentaDe = (tutorId: string): Promise<Cuenta> => json<Cuenta>(admin, `/api/tutores/${tutorId}/estado-cuenta`);
const pagosDe = async (tutorId: string): Promise<PagoApi[]> => (await json<{ datos: PagoApi[] }>(admin, `/api/pagos?tutor_id=${tutorId}&limite=100`)).datos;

/** Suma exacta de importes de prueba (centavos enteros, sin flotantes). */
function sumar(...t: string[]): string {
  const total = t.reduce((a, x) => a + BigInt(x.replace(".", "")), 0n);
  return `${total / 100n}.${(total % 100n).toString().padStart(2, "0")}`;
}
/** «1234.5» → «$1,234.50» (para comparar lo que muestra la pantalla con lo que dice la API). */
const pesos = (t: string): string => `$${(t.split(".")[0] ?? "0").replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${t.split(".")[1] ?? "00"}`;

interface FamiliaV7 {
  tutorId: string;
  telefono: string;
  hijos: { alumnoId: string; nombre: string }[];
  cargoVencidoId: string;
  cargoViejoId: string;
}
const F = {} as { baez: FamiliaV7; sinDeuda: { tutorId: string; telefono: string; alumnoId: string }; sinCargos: { tutorId: string; telefono: string }; uniforme: { tutorId: string; alumnoId: string; beneficioId: string; telefono: string }; uniformeConPiezas: { beneficioId: string }; uniformeSinTalla: { beneficioId: string }; uniformeConListaVieja: { beneficioId: string } };
const P = {} as { mochila: { id: string }; agotado: { id: string }; uniforme6: { id: string }; ultima: { id: string }; uniforme7: string };


test.beforeAll(async () => {
  prisma = crearPrismaDePruebas(process.env["DATABASE_URL"], 4);
  admin = await apiComo("administrador");
  recepcionApi = await apiComo("recepcion");
  const organizacion = orgDePrueba();
  const docsDb = await prisma.documento_legal.findMany({ where: { organizacion_id: org, version: 1 } });
  const docs = { reglamento: docsDb.find((d) => d.tipo === "reglamento")?.id ?? "", usoImagen: docsDb.find((d) => d.tipo === "uso_imagen")?.id ?? "", avisoPrivacidad: docsDb.find((d) => d.tipo === "aviso_privacidad")?.id ?? "" } as DocumentosLegalesSembrados;
  const ok = async (r: Promise<APIResponse>, que: string): Promise<APIResponse> => {
    const x = await r;
    if (!x.ok()) throw new Error(`${que}: ${x.status()} ${await x.text()}`);
    return x;
  };
  const grupoD = mundo.recepcion.grupoD.id;

  // Los productos de la tienda de Rita.
  const producto = async (nombre: string, talla: string | null, precio: string, stock: number): Promise<{ id: string }> =>
    (await (await ok(admin.post("/api/productos", { data: { vertical_id: mundo.verticalId, nombre, ...(talla ? { talla } : {}), precio, stock } }), `producto ${nombre}`)).json()) as { id: string };
  P.mochila = await producto("Mochila escolar", null, "1234.50", 3);
  P.agotado = await producto("Botella térmica", null, "95.00", 0);
  P.uniforme6 = await producto("Uniforme", "6", "350.00", 1);
  P.ultima = await producto("Libreta de tareas", null, "45.00", 1);
  P.uniforme7 = (await producto("Uniforme", "7", "350.00", 3)).id;

  // La familia Báez: dos hijos inscritos, un cargo vencido hace 40 días y otro hace 100 (el tramo de más de 90).
  const lucia = await sembrarAlumno(prisma, organizacion, { docs, sucursalId: norte, nombre: "Ángel", telefono: `+52${telefonoUnico()}` });
  const ines = await sembrarAlumno(prisma, organizacion, { docs, sucursalId: norte, nombre: "Inés", conTutor: lucia.tutorId });
  await prisma.tutor.update({ where: { id: lucia.tutorId }, data: { nombre: "Lucía", apellidos: "Báez Ñúñez" } });
  await prisma.alumno.updateMany({ where: { id: { in: [lucia.alumnoId, ines.alumnoId] } }, data: { apellidos: "Báez Ñúñez" } });
  for (const al of [lucia, ines]) await ok(admin.post("/api/inscripciones", { data: { alumno_id: al.alumnoId, grupo_id: grupoD } }), "inscribir");
  const vencido = (await (await ok(admin.post("/api/cargos", { data: { alumno_id: lucia.alumnoId, descripcion: "Examen anterior", monto: "800.00", fecha_vencimiento: haceDiasEnMexico(40) } }), "cargo vencido")).json()) as { id: string };
  const viejo = (await (await ok(admin.post("/api/cargos", { data: { alumno_id: ines.alumnoId, descripcion: "Festival del año pasado", monto: "1234.56", fecha_vencimiento: haceDiasEnMexico(100) } }), "cargo viejo")).json()) as { id: string };
  const telefonoBaez = (await prisma.tutor.findFirstOrThrow({ where: { id: lucia.tutorId } })).telefono;
  F.baez = { tutorId: lucia.tutorId, telefono: telefonoBaez, hijos: [{ alumnoId: lucia.alumnoId, nombre: "Ángel" }, { alumnoId: ines.alumnoId, nombre: "Inés" }], cargoVencidoId: vencido.id, cargoViejoId: viejo.id };

  // Una familia que ya pagó todo, y otra con un hijo sin inscribir (no tiene cargos).
  const paga = await sembrarAlumno(prisma, organizacion, { docs, sucursalId: norte, nombre: "Camila", telefono: `+52${telefonoUnico()}` });
  await prisma.tutor.update({ where: { id: paga.tutorId }, data: { nombre: "Paula", apellidos: "Saldívar" } });
  await prisma.alumno.update({ where: { id: paga.alumnoId }, data: { apellidos: "Saldívar" } });
  await ok(admin.post("/api/inscripciones", { data: { alumno_id: paga.alumnoId, grupo_id: grupoD } }), "inscribir a Camila");
  const deuda = await cuentaDe(paga.tutorId);
  await ok(admin.post("/api/pagos", { data: { tutor_id: paga.tutorId, monto: deuda.resumen.saldo, metodo: "efectivo" } }), "pago total de Camila");
  F.sinDeuda = { tutorId: paga.tutorId, telefono: (await prisma.tutor.findFirstOrThrow({ where: { id: paga.tutorId } })).telefono, alumnoId: paga.alumnoId };
  const nueva = await sembrarAlumno(prisma, organizacion, { docs, sucursalId: norte, nombre: "Tomás", telefono: `+52${telefonoUnico()}` });
  await prisma.tutor.update({ where: { id: nueva.tutorId }, data: { nombre: "Nora", apellidos: "Quiroz" } });
  F.sinCargos = { tutorId: nueva.tutorId, telefono: (await prisma.tutor.findFirstOrThrow({ where: { id: nueva.tutorId } })).telefono };

  // Un uniforme por entregar (talla 6, una sola pieza en existencia): promoción «al pagar la primera mensualidad» que se apaga enseguida.
  const promo = await prisma.promocion.create({ data: { organizacion_id: org, nombre: "Bienvenida V7", codigo: "BIENVENIDA-V7-REC", vigencia_desde: new Date("2020-01-01"), condicion_tipo: "al_pagar_primera_mensualidad", acumulable: true, prioridad: 5 } });
  await prisma.promocion_beneficio.create({ data: { organizacion_id: org, promocion_id: promo.id, tipo: "producto_gratis", modo: "total", momento_disparo: "al_cumplir_condicion", descripcion: "Uniforme" } });
  const uni = await sembrarAlumno(prisma, organizacion, { docs, sucursalId: norte, nombre: "Emiliano", telefono: `+52${telefonoUnico()}` });
  await prisma.alumno.update({ where: { id: uni.alumnoId }, data: { talla_uniforme: "6", apellidos: "Orozco" } });
  await prisma.tutor.update({ where: { id: uni.tutorId }, data: { nombre: "Elena", apellidos: "Orozco" } });
  const insc = (await (await ok(admin.post("/api/inscripciones", { data: { alumno_id: uni.alumnoId, grupo_id: grupoD } }), "inscribir a Emiliano")).json()) as { id: string };
  const cu = await cuentaDe(uni.tutorId);
  const mensualidad = cu.hijos.flatMap((h) => h.cargos).find((c) => c.concepto === "mensualidad")!;
  await ok(admin.post("/api/pagos", { data: { tutor_id: uni.tutorId, monto: mensualidad.saldo, metodo: "efectivo", aplicaciones: [{ cargo_id: mensualidad.id, monto: mensualidad.saldo }] } }), "pago de la mensualidad de Emiliano");
  // Dos niños más: una con talla 7 (hay piezas; sirve para entregar desde dos pantallas) y otro con una talla de la que no hay piezas (la 14).
  const alumnoConUniforme = async (nombre: string, talla: string, apellido: string) => {
    const x = await sembrarAlumno(prisma, organizacion, { docs, sucursalId: norte, nombre, telefono: `+52${telefonoUnico()}` });
    await prisma.alumno.update({ where: { id: x.alumnoId }, data: { talla_uniforme: talla, apellidos: apellido } });
    await prisma.tutor.update({ where: { id: x.tutorId }, data: { nombre: `Mamá de ${nombre}`, apellidos: apellido } });
    const i = (await (await ok(admin.post("/api/inscripciones", { data: { alumno_id: x.alumnoId, grupo_id: grupoD } }), `inscribir a ${nombre}`)).json()) as { id: string };
    const cu = await cuentaDe(x.tutorId);
    const m = cu.hijos.flatMap((h) => h.cargos).find((c) => c.concepto === "mensualidad")!;
    await ok(admin.post("/api/pagos", { data: { tutor_id: x.tutorId, monto: m.saldo, metodo: "efectivo", aplicaciones: [{ cargo_id: m.id, monto: m.saldo }] } }), `pago de la mensualidad de ${nombre}`);
    return i.id;
  };
  const insc2 = await alumnoConUniforme("Valentina", "7", "Ibarra");
  const insc3 = await alumnoConUniforme("Dante", "14", "Lozano");
  const insc4 = await alumnoConUniforme("Renata", "7", "Cabrera");
  await prisma.promocion.update({ where: { id: promo.id }, data: { activo: false } });
  const beneficio = await prisma.promocion_aplicacion.findFirstOrThrow({ where: { inscripcion_id: insc.id, estatus: "liberado" } });
  const beneficio2 = await prisma.promocion_aplicacion.findFirstOrThrow({ where: { inscripcion_id: insc2, estatus: "liberado" } });
  const beneficio3 = await prisma.promocion_aplicacion.findFirstOrThrow({ where: { inscripcion_id: insc3, estatus: "liberado" } });
  const beneficio4 = await prisma.promocion_aplicacion.findFirstOrThrow({ where: { inscripcion_id: insc4, estatus: "liberado" } });
  F.uniforme = { tutorId: uni.tutorId, alumnoId: uni.alumnoId, beneficioId: beneficio.id, telefono: (await prisma.tutor.findFirstOrThrow({ where: { id: uni.tutorId } })).telefono };
  F.uniformeConPiezas = { beneficioId: beneficio2.id };
  F.uniformeSinTalla = { beneficioId: beneficio3.id };
  F.uniformeConListaVieja = { beneficioId: beneficio4.id };
});

test.afterAll(async () => {
  await restaurarModulos().catch(() => undefined);
  await prisma.$disconnect();
  await admin.dispose();
  await recepcionApi.dispose();
  if (hallazgos.length > 0) process.stdout.write(`\nHALLAZGOS (${FASE}):\n- ${hallazgos.join("\n- ")}\n`);
  process.stdout.write(`\nPASOS POR TAREA: ${JSON.stringify(pasosPorTarea, null, 1)}\n`);
});


/** Todos los módulos encendidos (el mundo de pruebas los trae así). */
async function restaurarModulos(): Promise<void> {
  const r = await admin.put("/api/modulos", { data: { cotizador: true, clase_muestra: true, inscripcion: true, operacion: true, finanzas: true } });
  expect(r.status(), await r.text()).toBe(200);
  const t = await admin.put("/api/modulos", { data: { tableros: true } });
  expect(t.status(), await t.text()).toBe(200);
}

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

const buscador = (page: Page): Locator => page.getByLabel("Teléfono o nombre de la familia");
const buscar = async (page: Page, texto: string): Promise<void> => {
  await buscador(page).fill(texto);
  await page.getByRole("button", { name: "Buscar" }).click();
};
const tarjeta = (page: Page, tutorId: string): Locator => page.getByTestId(`familia-${tutorId}`);
async function elegir(page: Page, f: { tutorId: string; telefono: string }): Promise<void> {
  await page.goto("/pagos");
  await buscar(page, f.telefono);
  await tarjeta(page, f.tutorId).getByRole("button", { name: "Elegir" }).click();
  await expect(page.getByTestId("saldo-total")).toBeVisible();
}
const monto = (page: Page): Locator => page.getByLabel(/^Monto recibido/);

test.describe("la mañana de Rita", () => {
  test("1. abre el sistema en la computadora del mostrador: entra y llega a «Registrar pago»", async ({ browser, baseURL }) => {
    const c = await contextoNuevo(browser, baseURL!, "escritorio", null);
    await c.context.clearCookies();
    const p = c.page;
    cuenta("1. entrar");
    await p.goto("/");
    await expect(p.getByRole("heading", { name: "Iniciar sesión" })).toBeVisible();
    await foto(p, "acceso");
    await p.getByLabel("Correo").fill(mundo.usuarios.recepcion.correo);
    await p.getByLabel("Contraseña").fill(mundo.usuarios.recepcion.contrasena);
    await p.getByRole("button", { name: "Entrar" }).click();
    paso();
    await expect(p.getByRole("heading", { name: "Registrar pago" })).toBeVisible();
    await foto(p, "inicio-al-entrar");
    const barra = await p.getByRole("navigation", { name: "Secciones" }).first().innerText();
    process.stdout.write(`\n[barra de Rita]\n${barra}\n`);
    expect(pasosPorTarea["1. entrar"]).toBeLessThanOrEqual(META_DE_PASOS);
    await c.cerrar();
  });

  test("2. busca a la mamá: por el niño, la mamá y el teléfono, con acentos, mayúsculas, +52 y +521", async ({ page }) => {
    cuenta("2. buscar");
    await page.goto("/pagos");
    const intentos: [string, string][] = [
      ["Ángel", "nombre del niño con acento"],
      ["ANGEL", "nombre del niño sin acento y en mayúsculas"],
      ["ines baez", "otro niño, sin acentos"],
      ["Lucía", "mamá con acento"],
      ["LUCIA BAEZ", "mamá sin acento y en mayúsculas"],
      ["bAEz nunez", "apellidos sin acento y mezclando mayúsculas"],
      [F.baez.telefono, "teléfono con +52"],
      [F.baez.telefono.replace("+52", "+521"), "teléfono con +521"],
      [`(${F.baez.telefono.slice(3, 5)}) ${F.baez.telefono.slice(5, 9)}-${F.baez.telefono.slice(9)}`, "teléfono con paréntesis y guion"],
      [F.baez.telefono.slice(3), "teléfono de diez dígitos"],
    ];
    for (const [texto, que] of intentos) {
      await buscar(page, texto);
      await corregido(`Buscar «${texto}» (${que}) no encuentra a la familia Báez`, async () => {
        await expect(tarjeta(page, F.baez.tutorId)).toBeVisible({ timeout: 3000 });
      });
    }
    paso();
    await buscar(page, "ANGEL");
    await foto(page, "buscar-por-el-nino");
    await buscar(page, "Zzzzzz");
    await expect(page.getByText("No encontré a esa familia")).toBeVisible();
    await foto(page, "buscar-sin-resultado");
    await buscar(page, F.baez.telefono.slice(3, 9));
    await foto(page, "buscar-telefono-incompleto");
    const textoIncompleto = await leer(page);
    process.stdout.write(`\n[teléfono incompleto]\n${textoIncompleto}\n`);
    await corregido("Un teléfono incompleto sale como «No se pudo cargar» con «Reintentar», sin decir cuántos dígitos faltan", async () => {
      expect(textoIncompleto).not.toContain("No se pudo cargar");
      expect(textoIncompleto).toMatch(/10 dígitos/);
    });
    await buscador(page).fill("a");
    await expect(page.getByRole("button", { name: "Buscar" })).toBeDisabled();
    await corregido("Con una sola letra el botón «Buscar» está apagado y no dice por qué", async () => {
      await expect(page.getByText(/al menos dos letras/i)).toBeVisible();
    });
    expect(pasosPorTarea["2. buscar"]).toBeLessThanOrEqual(META_DE_PASOS);
  });

  test("3. elige a la familia y lee lo que debe", async ({ page }) => {
    cuenta("3. ver lo que debe");
    await page.goto("/pagos");
    await buscar(page, "Báez");
    await tarjeta(page, F.baez.tutorId).getByRole("button", { name: "Elegir" }).click();
    paso(2);
    const c = await cuentaDe(F.baez.tutorId);
    await expect(page.getByTestId("saldo-total")).toHaveText(pesos(c.resumen.saldo));
    await expect(page.getByTestId("saldo-vencido")).toHaveText(pesos(c.resumen.vencido));
    await foto(page, "lo-que-debe", true);
    const texto = await leer(page);
    process.stdout.write(`\n[lo que debe]\n${texto}\n`);
    expect(texto).not.toMatch(JERGA);
    // El cargo de más de 90 días y el de 40 se distinguen; el de $1,234.56 usa separador de miles y centavos.
    await expect(page.getByTestId(`cargo-${F.baez.cargoViejoId}`)).toContainText("$1,234.56");
    await expect(page.getByTestId(`cargo-${F.baez.cargoViejoId}`)).toContainText("Vencido 100 d");
    expect(pasosPorTarea["3. ver lo que debe"]).toBeLessThanOrEqual(META_DE_PASOS);
  });

  test("4. cobra: un pago parcial; se equivoca y lo cancela; un pago repartido a mano entre los dos hijos; y uno completo", async ({ page }) => {
    await elegir(page, F.baez);
    const antes = await cuentaDe(F.baez.tutorId);
    cuenta("4a. pago parcial");
    await monto(page).fill("300");
    paso(0);
    await expect(page.getByTestId("propuesta")).toContainText("Pago parcial");
    await foto(page, "pago-parcial-propuesta");
    await page.getByRole("button", { name: "Registrar pago" }).click();
    paso();
    await expect(page.getByTestId("pago-registrado")).toContainText("$300.00");
    await foto(page, "pago-parcial-registrado");
    expect((await cuentaDe(F.baez.tutorId)).resumen.saldo).toBe(sumar(antes.resumen.saldo, "-300.00"));

    // Se equivocó de familia/monto: cancela el pago (dos pasos: botón y confirmar con motivo).
    cuenta("4b. cancelar un pago");
    await page.getByRole("button", { name: "Registrar otro pago" }).click();
    const pagos = await pagosDe(F.baez.tutorId);
    const ultimo = pagos.find((p) => p.monto === "300.00" && p.estatus === "aplicado")!;
    await page.getByTestId(`pago-${ultimo.id}`).getByRole("button", { name: "Cancelar pago" }).click();
    paso();
    await foto(page, "cancelar-pago-dialogo");
    const d = page.getByRole("dialog");
    await d.getByLabel(/^Motivo de la cancelación/).fill("Cobré de más");
    await d.getByRole("button", { name: "Cancelar el pago" }).click();
    paso();
    await expect(page.getByTestId(`pago-${ultimo.id}`)).toContainText("Cancelado");
    await foto(page, "pago-cancelado");
    expect((await cuentaDe(F.baez.tutorId)).resumen.saldo).toBe(antes.resumen.saldo);
    expect(pasosPorTarea["4b. cancelar un pago"]).toBeLessThanOrEqual(META_DE_PASOS);

    // Un pago repartido entre los dos hijos: la inscripción de Ángel y la mensualidad de Inés (los importes salen de la cuenta: los precios los cambian otras pruebas del mundo).
    cuenta("4c. repartido entre dos hijos");
    const cargosAhora = (await cuentaDe(F.baez.tutorId)).hijos;
    const saldoDe = (hijo: string, concepto: string): string => cargosAhora.find((h) => h.alumno.nombre === hijo)!.cargos.find((c) => c.concepto === concepto)!.saldo;
    const aAngel = saldoDe("Ángel", "inscripcion");
    const aInes = saldoDe("Inés", "mensualidad");
    const reparto = sumar(aAngel, aInes);
    await monto(page).fill(pesos(reparto).slice(1));
    await page.getByRole("radio", { name: "Transferencia" }).check();
    await page.getByLabel("Referencia (opcional)").fill("TRANS-V7-1");
    await page.getByRole("button", { name: "Ajustar el reparto a mano" }).click();
    paso(2);
    const ajuste = page.getByTestId("ajuste");
    for (const campo of await ajuste.getByRole("textbox").all()) await campo.fill("");
    await ajuste.getByLabel(/Ángel · Inscripción/).fill(aAngel);
    await ajuste.getByLabel(/Inés · Mensualidad/).fill(aInes);
    await expect(page.getByTestId("suma-del-reparto")).toContainText("cuadra");
    await foto(page, "pago-repartido-a-mano");
    await page.getByRole("button", { name: "Registrar pago" }).click();
    paso();
    const listo = page.getByTestId("pago-registrado");
    await expect(listo).toContainText(pesos(reparto));
    await expect(listo).toContainText("Saldo después del pago");
    await foto(page, "pago-repartido-registrado");
    const repartido = (await pagosDe(F.baez.tutorId)).find((p) => p.monto === reparto && p.metodo === "transferencia")!;
    expect(repartido.aplicaciones.map((a) => `${a.alumno.nombre}:${a.monto}`).sort()).toEqual([`Inés:${aInes}`, `Ángel:${aAngel}`].sort());
    expect(pasosPorTarea["4c. repartido entre dos hijos"]).toBeLessThanOrEqual(META_DE_PASOS + 1);

    // El pago completo: lo que falta.
    cuenta("4d. pago completo");
    const resto = (await cuentaDe(F.baez.tutorId)).resumen.saldo;
    await page.getByRole("button", { name: "Registrar otro pago" }).click();
    await monto(page).fill(resto);
    await page.getByRole("radio", { name: "Tarjeta" }).check();
    await expect(page.getByTestId("propuesta")).toBeVisible();
    await foto(page, "pago-completo-propuesta");
    await page.getByRole("button", { name: "Registrar pago" }).click();
    paso();
    await expect(page.getByTestId("pago-registrado")).toContainText(pesos(resto));
    await foto(page, "pago-completo-registrado");
    const final = await cuentaDe(F.baez.tutorId);
    expect(final.resumen.saldo).toBe("0.00");
    expect(final.resumen.vencido).toBe("0.00");
    await expect(page.getByTestId("saldo-total")).toHaveText("$0.00");
    await expect(page.getByText("Esta familia no debe nada.")).toBeVisible();
    expect(pasosPorTarea["4d. pago completo"]).toBeLessThanOrEqual(META_DE_PASOS);
  });

  test("5. importes absurdos: negativo, cero, muchos decimales, letras, notación científica, un número enorme", async ({ page }) => {
    // La familia Báez ya no debe nada: se usa a la de Tomás (sin cargos) para ver el formulario... y a Camila (sin deuda). Para ver un formulario con deuda se usa la de Elena.
    await elegir(page, F.uniforme);
    const deuda = (await cuentaDe(F.uniforme.tutorId)).resumen.saldo;
    process.stdout.write(`\n[deuda de Elena: ${deuda}]\n`);
    const casos: { texto: string; ayuda: RegExp | null; que: string }[] = [
      { texto: "-50", ayuda: /válido|negativ/i, que: "negativo" },
      { texto: "0", ayuda: /mayor|cero|0\.01/i, que: "cero" },
      { texto: "0.00", ayuda: /mayor|cero|0\.01/i, que: "cero con decimales" },
      { texto: "12.345", ayuda: /dos decimales/i, que: "tres decimales" },
      { texto: "abc", ayuda: /válido/i, que: "letras" },
      { texto: "1e5", ayuda: /válido/i, que: "notación científica" },
      { texto: "99999999999", ayuda: /válido|demasiado|grande/i, que: "enorme" },
      { texto: "12,34,5", ayuda: /válido/i, que: "comas mal puestas" },
    ];
    for (const caso of casos) {
      await monto(page).fill(caso.texto);
      await expect(page.getByRole("button", { name: "Registrar pago" })).toBeDisabled();
      const cuerpo = await leer(page);
      await corregido(`Importe «${caso.texto}» (${caso.que}): el botón se apaga pero la pantalla no dice qué hacer`, async () => {
        const formulario = page.getByRole("form").or(page.locator("form")).first();
        await expect(formulario).toContainText(caso.ayuda ?? /./);
      });
      void cuerpo;
    }
    await monto(page).fill("-50");
    await foto(page, "importe-negativo");
    await monto(page).fill("0");
    await foto(page, "importe-cero");
    await monto(page).fill("abc");
    await foto(page, "importe-letras");
    // Con formato de dinero lo acepta y lo muestra bien.
    await monto(page).fill("$ 1,250.5");
    await expect(page.getByText("Se muestra como $1,250.50")).toBeVisible();
  });

  test("6. cobra a una familia que no debe nada, y a una que todavía no tiene cargos", async ({ page }) => {
    await elegir(page, F.sinDeuda);
    await expect(page.getByTestId("saldo-total")).toHaveText("$0.00");
    await foto(page, "familia-sin-deuda");
    const t1 = await leer(page);
    process.stdout.write(`\n[sin deuda]\n${t1}\n`);
    expect(t1).not.toMatch(JERGA);
    // En lugar de un formulario que solo se podría rechazar, se dice que no hay nada que cobrar y qué hacer si trae dinero para algo nuevo.
    await corregido("Cobrar a quien no debe nada: el formulario se ofrece, y el mensaje habla de «saldo a favor» y del cambio, pero no dice que no hay nada que cobrar", async () => {
      await expect(page.getByRole("heading", { name: "No hay nada que cobrar" })).toBeVisible();
      await expect(page.getByText(/está al corriente/)).toBeVisible();
      await expect(monto(page)).toHaveCount(0);
      await expect(page.getByRole("link", { name: "Ir a Ventas" })).toBeVisible();
      await expect(page.getByRole("link", { name: "Ver el estado de cuenta" })).toBeVisible();
    });
    // El servidor lo rechaza aunque la pantalla se saltara: nunca se registra.
    const intento = await recepcionApi.post("/api/pagos", { data: { tutor_id: F.sinDeuda.tutorId, monto: "100.00", metodo: "efectivo" } });
    expect(intento.status()).toBe(409);
    expect((await pagosDe(F.sinDeuda.tutorId)).filter((p) => p.monto === "100.00")).toHaveLength(0);
    await elegir(page, F.sinCargos);
    await foto(page, "familia-sin-cargos");
    const t2 = await leer(page);
    process.stdout.write(`\n[sin cargos]\n${t2}\n`);
    await corregido("Una familia sin cargos dice «no debe nada» y ofrece cobrarle", async () => {
      await expect(page.getByText("Esta familia todavía no tiene cargos")).toBeVisible();
      await expect(monto(page)).toHaveCount(0);
    });
    await page.getByRole("link", { name: "Ir a Ventas" }).click();
    await expect(page.getByRole("heading", { name: "Ventas", exact: true })).toBeVisible();
  });

  test("7. estado de cuenta: cómo se lee el saldo, la antigüedad de lo vencido; ¿se puede imprimir o mandar?", async ({ page }) => {
    // Una familia con deuda vencida de varios tramos: la de Elena (el cargo de inscripción) no alcanza; se arma una cuenta con vencidos propia.
    const sofia = await sembrarFamiliaConVencidos();
    cuenta("7. consultar el estado de cuenta");
    await page.goto("/cuenta");
    await buscar(page, sofia.telefono);
    await tarjeta(page, sofia.tutorId).getByRole("button", { name: "Elegir" }).click();
    paso(2);
    const c = await cuentaDe(sofia.tutorId);
    await expect(page.getByTestId("saldo")).toHaveText(pesos(c.resumen.saldo));
    await foto(page, "estado-de-cuenta", true);
    const texto = await leer(page);
    process.stdout.write(`\n[estado de cuenta]\n${texto}\n`);
    expect(texto).not.toMatch(JERGA);
    await expect(page.getByTestId("antiguedad")).toContainText(`61 a 90 días${pesos(c.resumen.antiguedad["de_61_a_90"] ?? "0.00")}`);
    await corregido("El estado de cuenta no se puede imprimir ni descargar", async () => {
      await expect(page.getByRole("button", { name: /Imprimir/ })).toBeVisible();
      await expect(page.getByRole("link", { name: /Descargar/ })).toBeVisible();
    });
    await corregido("«Saldo» no dice que es lo que la familia debe", async () => {
      await expect(page.getByTestId("resumen-de-cuenta")).toContainText(/Saldo \(lo que debe\)|Saldo de la familia|Debe/);
    });
    expect(pasosPorTarea["7. consultar el estado de cuenta"]).toBeLessThanOrEqual(META_DE_PASOS);
  });

  test("8. entrega un uniforme: la lista, la entrega, entregarlo dos veces y una talla sin existencia", async ({ page, browser, baseURL }) => {
    cuenta("8. entregar un uniforme");
    await page.goto("/uniformes");
    const b = page.getByTestId(`beneficio-${F.uniforme.beneficioId}`);
    await expect(b).toContainText("Emiliano");
    await expect(b).toContainText("talla 6");
    await foto(page, "uniformes-por-entregar");
    const texto = await leer(page);
    process.stdout.write(`\n[uniformes]\n${texto}\n`);
    expect(texto).not.toMatch(JERGA);

    // El doble clic entrega UNA pieza.
    await b.getByRole("button", { name: "Marcar entregado" }).click();
    paso();
    await foto(page, "uniformes-entregar-dialogo");
    await page.getByRole("dialog").getByRole("button", { name: "Marcar como entregado" }).dblclick();
    paso();
    await expect(b).toHaveCount(0);
    await foto(page, "uniformes-entregado");
    const ventas = await json<{ datos: { es_promocional: boolean; cantidad: number }[] }>(admin, `/api/ventas?producto_id=${P.uniforme6.id}`);
    expect(ventas.datos.filter((v) => v.es_promocional), "el doble clic entregó UNA pieza").toHaveLength(1);
    expect((await json<{ stock: number }>(admin, `/api/productos/${P.uniforme6.id}`)).stock).toBe(0);
    expect(pasosPorTarea["8. entregar un uniforme"]).toBeLessThanOrEqual(META_DE_PASOS);

    // Dos pantallas abiertas (Rita y su compañera). La compañera tiene el diálogo abierto y, mientras, el uniforme se entrega por otro lado: al confirmar, el servidor dice que ya se entregó.
    const otra = await contextoNuevo(browser, baseURL!, "escritorio", "recepcion");
    const p2 = otra.page;
    await p2.goto("/uniformes");
    const tarjetaDeValentina = p2.getByTestId(`beneficio-${F.uniformeConPiezas.beneficioId}`);
    await expect(tarjetaDeValentina).toBeVisible();
    await tarjetaDeValentina.getByRole("button", { name: "Marcar entregado" }).click();
    await expect(p2.getByRole("dialog").getByLabel("Pieza que se entrega")).toBeVisible();
    const r = await recepcionApi.post(`/api/beneficios/${F.uniformeConPiezas.beneficioId}/entregar`, { data: { producto_id: P.uniforme7 } });
    expect([200, 201], await r.text()).toContain(r.status());
    await p2.getByRole("dialog").getByRole("button", { name: "Marcar como entregado" }).click();
    await expect(p2.getByRole("dialog").getByRole("alert")).toBeVisible();
    const dos = await p2.getByRole("dialog").innerText();
    process.stdout.write(`\n[entregarlo dos veces]\n${dos}\n`);
    await foto(p2, "uniformes-entregado-dos-veces");
    await corregido("Entregar dos veces: el diálogo sigue ofreciendo «Marcar como entregado» y la lista no se actualiza", async () => {
      await expect(p2.getByRole("dialog")).toContainText("Este uniforme ya se entregó");
      await expect(p2.getByRole("dialog").getByRole("button", { name: "Marcar como entregado" })).toBeDisabled();
    });
    expect(dos).not.toMatch(JERGA);
    await p2.getByRole("dialog").getByRole("button", { name: /Cerrar|Todavía no/ }).click();
    await corregido("Después de «ya se entregó», el uniforme sigue en la lista de por entregar", async () => {
      await expect(tarjetaDeValentina).toHaveCount(0);
    });

    // La lista VIEJA: otra persona entrega mientras la pantalla de la compañera sigue como estaba; al abrir el diálogo la lista se refresca y se dice que ya se entregó.
    const vieja = p2.getByTestId(`beneficio-${F.uniformeConListaVieja.beneficioId}`);
    await expect(vieja).toBeVisible();
    const r2 = await recepcionApi.post(`/api/beneficios/${F.uniformeConListaVieja.beneficioId}/entregar`, { data: { producto_id: P.uniforme7 } });
    expect([200, 201], await r2.text()).toContain(r2.status());
    await vieja.getByRole("button", { name: "Marcar entregado" }).click();
    await corregido("Abrir un uniforme que otra persona ya entregó (lista vieja) deja entregarlo otra vez", async () => {
      await expect(p2.getByRole("dialog")).toContainText("Este uniforme ya se entregó");
      await expect(p2.getByRole("dialog").getByRole("button", { name: "Marcar como entregado" })).toBeDisabled();
    });
    await foto(p2, "uniformes-lista-vieja");
    await otra.cerrar();

    // Una talla sin piezas.
    await page.reload();
    const sin = page.getByTestId(`beneficio-${F.uniformeSinTalla.beneficioId}`);
    await expect(sin).toContainText("talla 14");
    // R5b: la tarjeta ya dice que no hay piezas de esa talla y el botón queda apagado («Sin existencia»): no se llega a un diálogo que fallaría.
    await expect(sin).toContainText("Sin existencia: pide más piezas");
    await expect(sin.getByRole("button", { name: "Sin existencia" })).toBeDisabled();
    await foto(page, "uniformes-sin-existencia");
  });

  test("9. vende un producto: con existencia, la última pieza, sin existencia, doble clic y anular una venta", async ({ page }) => {
    cuenta("9. vender un producto");
    await page.goto("/ventas");
    await foto(page, "ventas", true);
    const texto = await leer(page);
    process.stdout.write(`\n[ventas]\n${texto}\n`);
    expect(texto).not.toMatch(JERGA);
    await expect(page.getByTestId(`producto-${P.agotado.id}`)).toContainText("Agotado");
    // El producto agotado no se puede elegir: su tarjeta está apagada y dice «Agotado».
    await expect(page.getByTestId(`producto-${P.agotado.id}`)).toBeDisabled();
    await page.getByLabel("Buscar al alumno por nombre").fill("angel");
    await page.getByRole("button", { name: "Buscar", exact: true }).click();
    paso();
    await corregido("Buscar al alumno «angel» (sin acento) no encuentra a Ángel", async () => {
      await expect(page.getByLabel("Alumno", { exact: true })).toContainText("Ángel", { timeout: 3000 });
    });
    await page.getByLabel("Buscar al alumno por nombre").fill("Ángel");
    await page.getByRole("button", { name: "Buscar", exact: true }).click();
    await expect(page.getByLabel("Alumno", { exact: true })).toContainText("Ángel");
    await page.getByTestId(`producto-${P.mochila.id}`).click();
    await expect(page.getByTestId("producto-elegido")).toContainText("Mochila escolar");
    paso();
    await page.getByRole("button", { name: "Una más" }).click();
    await expect(page.getByTestId("cantidad-de-piezas")).toHaveText("2");
    await expect(page.getByTestId("total-de-la-venta")).toContainText("$2,469.00");
    await foto(page, "venta-lista");
    await page.getByRole("button", { name: "Registrar venta" }).dblclick();
    paso();
    await expect(page.getByTestId("venta-registrada")).toContainText("2 × Mochila escolar");
    await foto(page, "venta-registrada");
    const ventas = await json<{ datos: { id: string; estatus: string; total: string }[] }>(admin, `/api/ventas?producto_id=${P.mochila.id}`);
    expect(ventas.datos.filter((v) => v.estatus === "registrada"), "el doble clic vendió UNA vez").toHaveLength(1);
    expect(ventas.datos[0]?.total).toBe("2469.00");
    expect((await json<{ stock: number }>(admin, `/api/productos/${P.mochila.id}`)).stock).toBe(1);
    expect(pasosPorTarea["9. vender un producto"]).toBeLessThanOrEqual(META_DE_PASOS);

    // Más de lo que hay: queda 1 y la cantidad ya no puede subir.
    await expect(page.getByRole("button", { name: "Una más" })).toBeDisabled();
    await expect(page.getByText("Solo hay 1 en existencia")).toBeVisible();
    await expect(page.getByTestId("cantidad-de-piezas")).toHaveText("1");

    // La última pieza de otra cosa, y luego anular.
    await page.getByTestId(`producto-${P.ultima.id}`).click();
    await page.getByRole("button", { name: "Registrar venta" }).click();
    await expect(page.getByTestId(`producto-${P.ultima.id}`)).toContainText("Agotado");
    await page.getByTestId("ventas-recientes").locator("li").filter({ hasText: "Libreta de tareas" }).getByRole("button", { name: "Anular" }).click();
    await foto(page, "venta-anular-dialogo");
    await page.getByRole("dialog").getByLabel(/^Motivo de la anulación/).fill("Se equivocó de producto");
    await page.getByRole("dialog").getByRole("button", { name: "Anular la venta" }).click();
    await expect(page.getByTestId(`producto-${P.ultima.id}`).getByTestId("existencia-del-producto")).toHaveText("Queda 1");
    await foto(page, "venta-anulada");
  });

  test("10. cierra el día: cuánto se cobró hoy, por persona y por forma de pago, para cuadrar la caja", async ({ page }) => {
    cuenta("10. cierre del día");
    await page.goto("/pagos");
    await expect(page.getByRole("heading", { name: "Registrar pago" })).toBeVisible();
    const enlace = page.getByRole("navigation", { name: "Secciones" }).first().getByRole("link", { name: "Cierre del día" });
    if (FASE === "antes" && (await enlace.count()) === 0) {
      hallazgos.push("No hay dónde ver lo cobrado hoy ni cuadrar la caja (no existe «Cierre del día»)");
    } else {
      await enlace.click();
      paso();
      await expect(page.getByRole("heading", { name: "Cierre del día" })).toBeVisible();
    }
    if (FASE === "antes") return;
    const hoy = haceDiasEnMexico(0);
    // Rita cobra tres cosas (por la API, como si ya hubiera pasado el día) y cancela una: lo cancelado no cuenta como cobrado.
    const sofia = await sembrarFamiliaConVencidos();
    const cobra = async (monto: string, metodo: string) => {
      const r = await recepcionApi.post("/api/pagos", { data: { tutor_id: sofia.tutorId, monto, metodo, ...(metodo === "transferencia" ? { referencia: "SPEI-V7" } : {}) } });
      expect(r.status(), await r.text()).toBe(201);
      return ((await r.json()) as { id: string }).id;
    };
    await cobra("250.00", "efectivo");
    await cobra("99.99", "tarjeta");
    const equivocado = await cobra("10.01", "transferencia");
    const c = await recepcionApi.post(`/api/pagos/${equivocado}/cancelar`, { data: { motivo: "Se equivocó de familia" } });
    expect(c.status(), await c.text()).toBe(200);
    await page.reload();
    await expect(page.getByRole("heading", { name: "Cierre del día" })).toBeVisible();
    await foto(page, "cierre-del-dia", true);
    const texto = await leer(page);
    process.stdout.write(`\n[cierre del día]\n${texto}\n`);
    expect(texto).not.toMatch(JERGA);

    // La caja de Rita, calculada aparte desde la lista de pagos (con BigInt, sin flotantes), igual a lo que muestra la pantalla.
    const todos = (await json<{ datos: PagoApi[] }>(admin, `/api/pagos?desde=${hoy}&hasta=${hoy}&limite=100`)).datos;
    const deRita = todos.filter((p) => p.registrado_por?.id === mundo.usuarios.recepcion.id && p.estatus === "aplicado");
    const total = (metodo?: string): string => sumar("0.00", ...deRita.filter((p) => !metodo || p.metodo === metodo).map((p) => p.monto));
    expect(BigInt(total().replace(".", "")) >= 34999n, "lo que cobró Rita (250.00 + 99.99 como mínimo)").toBe(true);
    const caja = page.getByTestId(`caja-${mundo.usuarios.recepcion.id}`);
    await expect(caja.getByTestId("efectivo")).toHaveText(pesos(total("efectivo")));
    await expect(caja.getByTestId("tarjeta")).toHaveText(pesos(total("tarjeta")));
    await expect(caja.getByTestId("transferencia")).toHaveText(pesos(total("transferencia")));
    await expect(caja).toContainText(pesos(total()));
    await expect(page.getByText(`Tu caja (${mundo.usuarios.recepcion.nombre})`)).toBeVisible();
    // Lo cobrado está en la lista del día con su referencia; lo cancelado, en los cancelados con su motivo, y no en la caja.
    await expect(page.getByTestId("pagos-del-dia")).toContainText("$250.00");
    await expect(page.getByTestId("pagos-del-dia")).toContainText("Ana Villaseñor");
    await expect(page.getByTestId("pagos-del-dia")).not.toContainText("$10.01");
    await expect(page.getByTestId("cancelados")).toContainText("$10.01");
    await expect(page.getByTestId("cancelados")).toContainText("Se equivocó de familia");
    await expect(page.getByTestId("cancelados")).toContainText("no cuenta");
    // El corte de la pantalla es el de la API.
    const api = await json<{ cajas: { usuario: { id: string } | null; cobrado: { total: string } }[] }>(recepcionApi, "/api/pagos/corte");
    expect(api.cajas.find((x) => x.usuario?.id === mundo.usuarios.recepcion.id)?.cobrado.total).toBe(total());
    // Un día anterior: sin cobros.
    await page.getByLabel("Día").fill(haceDiasEnMexico(3));
    await expect(page.getByText("Ese día no se registró ningún cobro.")).toBeVisible();
    await foto(page, "cierre-de-un-dia-sin-cobros");
    expect(pasosPorTarea["10. cierre del día"]).toBeLessThanOrEqual(META_DE_PASOS);
  });

  test("11. módulo de finanzas apagado: qué ve Rita al entrar (escuela con la captación y poco más)", async ({ browser, baseURL }) => {
    try {
      // Solo finanzas apagado (tableros depende de él).
      expect((await admin.put("/api/modulos", { data: { tableros: false } })).status()).toBe(200);
      expect((await admin.put("/api/modulos", { data: { finanzas: false } })).status()).toBe(200);
      const c = await contextoNuevo(browser, baseURL!, "escritorio", "recepcion");
      const p = c.page;
      await p.goto("/");
      await expect(p.getByRole("navigation", { name: "Secciones" }).first()).toBeVisible();
      const barra = await p.getByRole("navigation", { name: "Secciones" }).first().innerText();
      process.stdout.write(`\n[barra con finanzas apagado]\n${barra}\n`);
      await foto(p, "finanzas-apagado-inicio");
      for (const oculto of ["Registrar pago", "Estado de cuenta", "Uniformes", "Ventas", "Cierre del día"]) await expect(p.getByRole("navigation", { name: "Secciones" }).first().getByRole("link", { name: oculto })).toHaveCount(0);
      const inicio = await leer(p);
      process.stdout.write(`\n[inicio con finanzas apagado]\n${inicio}\n`);
      expect(inicio).not.toMatch(JERGA);
      // Una dirección directa dice que no está disponible y cómo volver; la API no responde.
      await p.goto("/pagos");
      await expect(p.getByRole("heading", { name: "No disponible" })).toBeVisible();
      await foto(p, "finanzas-apagado-pagos-directo");
      const textoPagos = await leer(p);
      process.stdout.write(`\n[/pagos con finanzas apagado]\n${textoPagos}\n`);
      // Ya decía qué hacer («pídele a la persona que administra el sistema que la active»): se comprueba para que no se pierda.
      await expect(p.getByText(/pídele a la persona que administra el sistema/i)).toBeVisible();
      await expect(p.getByRole("link", { name: "Ir a mi inicio" })).toBeVisible();
      expect((await recepcionApi.get("/api/pagos")).status()).toBe(404);
      expect((await recepcionApi.get("/api/pagos/corte")).status()).toBe(404);
      await c.cerrar();

      // La escuela con solo la captación: recepción no tiene nada que hacer en el menú.
      expect((await admin.put("/api/modulos", { data: { cotizador: false, clase_muestra: false, inscripcion: false, operacion: false } })).status()).toBe(200);
      const d = await contextoNuevo(browser, baseURL!, "escritorio", "recepcion");
      await d.page.goto("/");
      await expect(d.page.locator("main")).toBeVisible();
      await foto(d.page, "solo-captacion-inicio");
      const solo = await leer(d.page);
      process.stdout.write(`\n[recepción con solo captación]\n${solo}\n`);
      expect(solo).not.toMatch(JERGA);
      await corregido("Con solo la captación, recepción llega a una pantalla sin nada que hacer y sin decir por qué", async () => {
        await expect(d.page.getByText("Todavía no tienes secciones activas")).toBeVisible();
      });
      await d.cerrar();
    } finally {
      await restaurarModulos();
    }
    // Ya encendido todo, Rita vuelve a ver sus pantallas sin reiniciar nada.
    const e = await contextoNuevo(browser, baseURL!, "escritorio", "recepcion");
    await e.page.goto("/");
    await expect(e.page.getByRole("heading", { name: "Registrar pago" })).toBeVisible();
    await e.cerrar();
  });

  test("12. tableta (768×1024) y celular (390): cobro, cuenta, uniformes, ventas y cierre caben, sin desborde y con botones de 44 px", async ({ browser, baseURL }) => {
    for (const vista of [{ nombre: "tableta", ancho: 768, alto: 1024, tactil: true }, { nombre: "celular", ancho: 390, alto: 844, tactil: true }] as const) {
      const contexto = await contextoConReloj(browser, { baseURL: baseURL!, locale: "es-MX", timezoneId: "America/Mexico_City", viewport: { width: vista.ancho, height: vista.alto }, hasTouch: vista.tactil, isMobile: true, storageState: comoRol("recepcion").storageState });
      const p = await contexto.newPage();
      const externas: string[] = [];
      await contexto.route((u) => u.protocol.startsWith("http") && u.origin !== new URL(baseURL!).origin, (r) => { externas.push(r.request().url()); return r.abort("blockedbyclient"); });
      const pantallas: [string, () => Promise<void>][] = [
        ["buscar", async () => { await p.goto("/pagos"); await expect(buscador(p)).toBeVisible(); }],
        ["resultados", async () => { await buscar(p, "Báez"); await expect(tarjeta(p, F.baez.tutorId)).toBeVisible(); }],
        ["cobro", async () => { await tarjeta(p, F.baez.tutorId).getByRole("button", { name: "Elegir" }).click(); await expect(p.getByTestId("saldo-total")).toBeVisible(); }],
        ["cuenta", async () => { await p.goto(`/cuenta/${F.baez.tutorId}`); await expect(p.getByTestId("saldo")).toBeVisible(); }],
        ["uniformes", async () => { await p.goto("/uniformes"); await expect(p.getByRole("heading", { name: "Uniformes", exact: true })).toBeVisible(); }],
        ["ventas", async () => { await p.goto("/ventas"); await expect(p.getByRole("heading", { name: "Ventas", exact: true })).toBeVisible(); }],
        ["cierre", async () => { await p.goto("/corte"); await expect(p.getByRole("heading", { name: "Cierre del día" })).toBeVisible(); await expect(p.getByTestId("cajas")).toBeVisible(); }],
      ];
      const problemas: string[] = [];
      for (const [nombre, ir] of pantallas) {
        if (FASE === "antes") {
          // Antes de corregir, una pantalla que todavía no existe («cierre») solo se anota.
          const llego = await ir().then(() => true, () => false);
          if (!llego) {
            hallazgos.push(`${vista.nombre}/${nombre}: la pantalla no existe o no cargó`);
            continue;
          }
        } else await ir();
        await p.waitForLoadState("networkidle", { timeout: 4000 }).catch(() => undefined);
        const m = await medir(p);
        if (m.anchoDelDocumento > m.ancho) problemas.push(`${vista.nombre}/${nombre}: desborde horizontal (${m.anchoDelDocumento} > ${m.ancho})`);
        for (const c of m.chicos) problemas.push(`${vista.nombre}/${nombre}: objetivo táctil chico: ${c}`);
        if (vista.nombre === "celular") for (const l of m.letraChica) problemas.push(`${vista.nombre}/${nombre}: letra de menos de 16 px (zoom automático): ${l}`);
        await p.screenshot({ path: resolve(CARPETA, `${FASE}-${vista.nombre}-${nombre}.png`), fullPage: true, animations: "disabled" });
      }
      await contexto.close();
      expect(externas).toEqual([]);
      if (FASE === "antes") hallazgos.push(...problemas);
      else expect(problemas, `lo ilegible o inalcanzable en ${vista.nombre}`).toEqual([]);
    }
  });

  test("13. lo que recepción NO ve: ni la ficha de salud ni las notas del asesor, en pantalla ni por la API", async ({ page }) => {
    const { alumnoId, centinela } = mundo.familia.salud;
    await page.goto(`/alumnos/${alumnoId}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.waitForLoadState("networkidle");
    const exp = await page.locator("body").innerText();
    expect(exp).not.toContain(centinela);
    expect(await page.getByRole("link", { name: /salud/i }).count(), "no hay enlace a la salud").toBe(0);
    expect(await page.getByRole("tab", { name: /salud/i }).count(), "ni pestaña de salud").toBe(0);
    await foto(page, "expediente-sin-salud", true);
    await page.goto(`/alumnos/${alumnoId}/salud`);
    await expect(page.getByRole("heading", { name: "Sin acceso" })).toBeVisible();
    expect(await page.locator("body").innerText()).not.toContain(centinela);
    const api = await recepcionApi.get(`/api/salud/alumno/${alumnoId}`);
    expect(api.status()).toBe(403);
    expect(await api.text()).not.toContain(centinela);
    const expediente = await recepcionApi.get(`/api/alumnos/${alumnoId}/expediente`);
    expect(await expediente.text()).not.toContain(centinela);
    // Las notas del asesor: el avance del lead se lee, la nota no.
    const lead = await sembrarFamilia(prisma, orgDePrueba(), { sucursalId: norte, nombre: "Niño de la nota" });
    const asesorApi = await apiComo("asesor");
    const etapas = (await json<{ datos?: { id: string; tipo_sistema: string | null }[] } | { id: string; tipo_sistema: string | null }[]>(asesorApi, "/api/etapas"));
    const lista = Array.isArray(etapas) ? etapas : (etapas.datos ?? []);
    const nota = "NOTA-PRIVADA-DEL-ASESOR-V7 la mamá pidió que no la llamen";
    const mover = await asesorApi.patch(`/api/leads/${lead.leadId}/etapa`, { data: { etapa_id: lista.find((e) => e.tipo_sistema === "contactado")!.id, nota } });
    expect(mover.status(), await mover.text()).toBe(200);
    const historial = await recepcionApi.get(`/api/leads/${lead.leadId}/historial`);
    const textoDelHistorial = await historial.text();
    await corregido("Recepción leía la nota privada del asesor por la API (GET /api/leads/:id/historial)", async () => {
      expect(textoDelHistorial).not.toContain("NOTA-PRIVADA");
    });
    expect(textoDelHistorial, "el avance del lead sí se lee").toContain("Etapa B");
    await page.goto(`/leads/${lead.leadId}`);
    await page.waitForLoadState("networkidle");
    const ficha = await page.locator("body").innerText();
    process.stdout.write(`\n[la ficha del lead, vista por recepción]\n${ficha.slice(0, 1500)}\n`);
    await corregido("Recepción veía la nota privada del asesor en la ficha del lead (y una tarjeta «No se pudo cargar» que nunca podía cargar)", async () => {
      expect(ficha).not.toContain("NOTA-PRIVADA");
      await expect(page.getByRole("heading", { name: "Sin acceso" })).toBeVisible();
      expect(ficha).not.toContain("No se pudo cargar");
    });
    await foto(page, "ficha-de-lead-vista-por-recepcion", true);
    await asesorApi.dispose();
  });
});

/** Una familia con un cargo vencido de cada tramo de antigüedad (15, 45, 75 y 120 días) y uno por vencer. */
async function sembrarFamiliaConVencidos(): Promise<{ tutorId: string; telefono: string }> {
  if (sofiaCache) return sofiaCache;
  const organizacion = orgDePrueba();
  const al = await sembrarAlumno(prisma, organizacion, { sucursalId: norte, nombre: "Sofía", telefono: `+52${telefonoUnico()}` });
  await prisma.tutor.update({ where: { id: al.tutorId }, data: { nombre: "Ana", apellidos: "Villaseñor" } });
  await prisma.alumno.update({ where: { id: al.alumnoId }, data: { apellidos: "Villaseñor" } });
  for (const [dias, monto, que] of [[15, "250.00", "Material de enero"], [45, "1500.50", "Examen de diciembre"], [75, "99.99", "Paseo"], [120, "12345.67", "Uniforme del año pasado"], [-10, "600.00", "Torneo próximo"]] as const) {
    const r = await admin.post("/api/cargos", { data: { alumno_id: al.alumnoId, descripcion: que, monto, fecha_vencimiento: haceDiasEnMexico(dias) } });
    expect([200, 201], await r.text()).toContain(r.status());
  }
  sofiaCache = { tutorId: al.tutorId, telefono: (await prisma.tutor.findFirstOrThrow({ where: { id: al.tutorId } })).telefono };
  return sofiaCache;
}
let sofiaCache: { tutorId: string; telefono: string } | null = null;
