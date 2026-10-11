// V6, carga del catálogo desde Excel, en navegador real (Chromium): el administrador descarga las plantillas, sube sus hojas con errores y los ve por archivo, fila y columna, los
// corrige, vuelve a revisar y aplica; al subir lo mismo otra vez la pantalla dice «Sin cambios». Todo en escritorio y en celular de 390 px, con capturas en `docs/capturas/v1/v6-*`.
// Lo que la pantalla muestra se comprueba contra la API, y al terminar el catálogo cargado se da de baja (en orden, por la API de administración) para dejar el mundo como estaba.
//
// Se llama `v6-…` para correr DESPUÉS de los demás (Playwright ordena por nombre).

import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import type { APIRequestContext, Page } from "@playwright/test";
import { apiComo, json } from "./ayudas.ts";
import { comoRol, expect, test } from "./fixtura.ts";
import { carpetaDeCapturas } from "./mundo.ts";

test.describe.configure({ mode: "serial" });

let admin: APIRequestContext;
test.beforeAll(async () => {
  admin = await apiComo("administrador");
});

const ESCRITORIO = { width: 1366, height: 800 } as const;
const CELULAR = { width: 390, height: 844 } as const;
const TERMINOS_TECNICOS = /_id\b|_min\b|uuid|undefined|null|\[object|NaN|\bJSON\b|\bAPI\b|\bslug\b|base64/;

async function captura(page: Page, nombre: string, opciones: { completa?: boolean } = {}): Promise<void> {
  const carpeta = carpetaDeCapturas("v1");
  mkdirSync(carpeta, { recursive: true });
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: resolve(carpeta, `${nombre}.png`), animations: "disabled", fullPage: opciones.completa ?? false });
}

// ── Las hojas de una escuela inventada (nada que ver con las del mundo de pruebas) ───────────────

const celda = (v: string): string => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
const csv = (encabezados: string[], filas: string[][]): string => `\uFEFF${[encabezados, ...filas].map((f) => f.map(celda).join(",")).join("\r\n")}\r\n`;

interface Hojas {
  disciplinas: string[][];
  sucursales: string[][];
  salones: string[][];
  instructores: string[][];
  programas: string[][];
  grupos: string[][];
  horarios: string[][];
  precios: string[][];
}

/** Una escuela de ejemplo; `n` distingue una corrida de otra (escritorio y celular) para que no choquen. */
function hojas(n: string): Hojas {
  const d = `Disciplina de carga ${n}`;
  const s1 = `Sede ${n} Uno`;
  const s2 = `Sede ${n} Dos`;
  return {
    disciplinas: [[d, "#6A1B9A"]],
    sucursales: [
      [s1, "Calle de prueba 1", "Centro"],
      [s2, "Calle de prueba 2", "Centro"],
    ],
    salones: [
      [s1, "Taller grande", "20"],
      [s1, "Taller chico", "8"],
      [s2, "Taller grande", "12"],
    ],
    instructores: [
      [`Instructora ${n}`, "55 5000 0101", "", s1],
      [`Instructor ${n}`, "", "", `${s1} | ${s2}`],
    ],
    programas: [
      [d, s1, "Pequeños", "5", "8", "", "", "", ""],
      [d, s1, "Mayores", "9", "13", "", "", "", ""],
      [d, s2, "Pequeños", "5", "8", "", "", "", ""],
    ],
    grupos: [
      [s1, "Pequeños", "Tarde", "15", "Taller grande", `Instructora ${n}`, ""],
      [s1, "Mayores", "Sábado", "8", "Taller chico", `Instructor ${n}`, "Sí"],
      [s2, "Pequeños", "Mañana", "10", "Taller grande", `Instructor ${n}`, ""],
    ],
    horarios: [
      [s1, "Pequeños", "Tarde", "lunes", "17:00", "18:00"],
      [s1, "Pequeños", "Tarde", "miércoles", "17:00", "18:00"],
      [s1, "Mayores", "Sábado", "sábado", "10:00", "12:00"],
      [s2, "Pequeños", "Mañana", "martes", "9:00", "10:30"],
    ],
    precios: [
      [s1, "Pequeños", "500", "800", "01/09/2026"],
      [s1, "Mayores", "500", "950,50", "01/09/2026"],
      [s2, "Pequeños", "450", "750", "01/09/2026"],
    ],
  };
}

const ENCABEZADOS = {
  disciplinas: ["Disciplina", "Color"],
  sucursales: ["Sucursal", "Dirección", "Zona horaria"],
  salones: ["Sucursal", "Salón", "Capacidad"],
  instructores: ["Instructor", "Teléfono", "Correo", "Sucursales"],
  programas: ["Disciplina", "Sucursal", "Programa", "Edad mínima", "Edad máxima", "Fecha de corte de edad", "Nivel", "Descripción", "Alternativa para la misma edad"],
  grupos: ["Sucursal", "Programa", "Grupo", "Cupo", "Salón", "Instructor", "Lista de espera"],
  horarios: ["Sucursal", "Programa", "Grupo", "Día", "Hora de inicio", "Hora de fin"],
  precios: ["Sucursal", "Programa", "Inscripción", "Mensualidad", "Vigente desde"],
} as const;

type Hoja = keyof Hojas;
const NOMBRES: Hoja[] = ["disciplinas", "sucursales", "salones", "instructores", "programas", "grupos", "horarios", "precios"];

const archivo = (h: Hoja, filas: string[][]): { name: string; mimeType: string; buffer: Buffer } => ({ name: `${h}.csv`, mimeType: "text/csv", buffer: Buffer.from(csv([...ENCABEZADOS[h]], filas), "utf8") });
const todos = (x: Hojas): { name: string; mimeType: string; buffer: Buffer }[] => NOMBRES.map((h) => archivo(h, x[h]));

interface Sucursal { id: string; nombre: string }
const sucursalesDe = async (): Promise<Sucursal[]> => (await json<{ datos: Sucursal[] }>(admin, "/api/sucursales")).datos;

/** Da de baja lo cargado, en el orden que piden las reglas (grupos → programas → salones/instructores → sucursales → disciplina). */
async function limpiar(nombres: { disciplina: string; sucursales: string[]; instructores: string[] }): Promise<void> {
  const programas = await json<{ datos: { id: string; sucursal_id: string }[] }>(admin, "/api/programas?limite=100");
  const sucursales = (await sucursalesDe()).filter((s) => nombres.sucursales.includes(s.nombre));
  const ids = new Set(sucursales.map((s) => s.id));
  const delSistema = programas.datos.filter((p) => ids.has(p.sucursal_id));
  const grupos = await json<{ datos: { id: string; programa: { id: string } }[] }>(admin, "/api/grupos?limite=100");
  for (const g of grupos.datos.filter((x) => delSistema.some((p) => p.id === x.programa.id))) await admin.delete(`/api/grupos/${g.id}`);
  for (const p of delSistema) await admin.delete(`/api/programas/${p.id}`);
  const salones = await json<{ datos: { id: string; sucursal_id: string }[] }>(admin, "/api/salones?limite=100");
  for (const s of salones.datos.filter((x) => ids.has(x.sucursal_id))) await admin.delete(`/api/salones/${s.id}`);
  const instructores = await json<{ datos: { id: string; nombre: string }[] }>(admin, "/api/instructores?limite=100");
  for (const i of instructores.datos.filter((x) => nombres.instructores.includes(x.nombre))) await admin.delete(`/api/instructores/${i.id}`);
  for (const s of sucursales) {
    const ofrece = await json<{ verticales: { vertical_id: string }[] }>(admin, `/api/sucursales/${s.id}`);
    for (const v of ofrece.verticales) await admin.delete(`/api/sucursales/${s.id}/verticales/${v.vertical_id}`);
    await admin.delete(`/api/sucursales/${s.id}`);
  }
  const verticales = await json<{ datos: { id: string; nombre: string }[] }>(admin, "/api/verticales");
  for (const v of verticales.datos.filter((x) => x.nombre === nombres.disciplina)) await admin.delete(`/api/verticales/${v.id}`);
}

test.afterAll(async () => {
  for (const n of ["E", "C"]) {
    const h = hojas(n);
    await limpiar({ disciplina: h.disciplinas[0]![0]!, sucursales: h.sucursales.map((s) => s[0]!), instructores: [...h.instructores.map((i) => i[0]!), `Instructor Nuevo ${n}`] });
  }
  await admin.dispose();
});

test.describe("quien no administra no entra a la pantalla ni a la carga", () => {
  test.use(comoRol("asesor"));
  test("el asesor ve «Sin acceso» y la API le responde 403", async ({ page }) => {
    await page.goto("/admin");
    await expect(page.getByRole("link", { name: "Cargar catálogo" })).toHaveCount(0);
    await page.goto("/admin/catalogo");
    await expect(page.getByRole("heading", { name: "Sin acceso" })).toBeVisible();
    const asesor = await apiComo("asesor");
    expect((await asesor.post("/api/catalogo/importacion", { data: { modo: "simulacion", archivos: [] } })).status()).toBe(403);
    expect((await asesor.get("/api/catalogo/plantillas")).status()).toBe(403);
    await asesor.dispose();
  });
});

test.describe("ESCRITORIO: el administrador carga un catálogo", () => {
  test.use({ ...comoRol("administrador"), viewport: ESCRITORIO });
  const buenas = hojas("E");

  test("está en el menú de Administración y descarga las plantillas (todas juntas y una por una)", async ({ page }) => {
    await page.goto("/admin");
    await page.getByRole("link", { name: "Cargar catálogo" }).click();
    await expect(page.getByRole("heading", { name: "Cargar catálogo" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Descarga las plantillas y llénalas" })).toBeVisible();
    const [descarga] = await Promise.all([page.waitForEvent("download"), page.getByTestId("descarga-todas").click()]);
    expect(descarga.suggestedFilename()).toBe("plantillas-catalogo.zip");
    await page.getByText("Descargar una por una").click();
    for (const n of ["LEEME.txt", "disciplinas.csv", "sucursales.csv", "salones.csv", "instructores.csv", "programas.csv", "grupos.csv", "horarios.csv", "precios.csv"]) await expect(page.getByTestId(`descarga-${n}`)).toBeVisible();
    const [una] = await Promise.all([page.waitForEvent("download"), page.getByTestId("descarga-salones.csv").click()]);
    expect(una.suggestedFilename()).toBe("salones.csv");
    expect(await page.locator("main").innerText(), "sin términos técnicos a la vista").not.toMatch(TERMINOS_TECNICOS);
    await captura(page, "v6-01-cargar-catalogo-escritorio", { completa: true });
  });

  test("sube hojas con errores: cada uno sale con su archivo, su fila y su columna, no hay botón «Aplicar» y no se guardó nada", async ({ page }) => {
    const antes = (await sucursalesDe()).length;
    const mal = hojas("E");
    mal.grupos[0]![4] = "Taller 3"; // salón que no existe
    mal.precios[1]![3] = "1.500"; // importe ambiguo
    mal.programas[1]![3] = "4"; // traslape de edades con «Pequeños» (5–8)
    mal.horarios[2]![4] = "5:00 pm"; // formato de 12 horas
    mal.salones[2]![2] = "diez"; // capacidad con letras
    await page.goto("/admin/catalogo");
    await page.getByTestId("entrada-de-archivos").setInputFiles(todos(mal));
    await expect(page.getByTestId("archivos-elegidos")).toContainText("grupos.csv");
    await page.getByTestId("boton-revisar").click();
    const errores = page.getByTestId("resultado-errores");
    await expect(errores).toBeVisible();
    await expect(errores).toContainText("Hay 5 cosas por corregir. No se guardó nada.");
    await expect(errores.getByTestId("errores-de-grupos.csv")).toContainText("Fila 2, columna “Salón”: no existe el salón “Taller 3” en la sucursal “Sede E Uno”. Revisa el nombre o agrégalo en el archivo de salones.");
    await expect(errores.getByTestId("errores-de-precios.csv")).toContainText("Fila 3, columna “Mensualidad”");
    await expect(errores.getByTestId("errores-de-precios.csv")).toContainText("no se entiende como cantidad de dinero");
    await expect(errores.getByTestId("errores-de-programas.csv")).toContainText("Fila 3, columna “Edad mínima”: las edades 4–13 se traslapan con las del programa “Pequeños” (en la fila 2 de este archivo)");
    await expect(errores.getByTestId("errores-de-horarios.csv")).toContainText("Fila 4, columna “Hora de inicio”");
    await expect(errores.getByTestId("errores-de-horarios.csv")).toContainText("formato de 12 horas");
    await expect(errores.getByTestId("errores-de-salones.csv")).toContainText("Fila 4, columna “Capacidad”");
    await expect(page.getByTestId("error-de-carga")).toHaveCount(5);
    await expect(page.getByTestId("boton-aplicar")).toHaveCount(0);
    expect(await page.getByTestId("resultado-de-carga").innerText(), "sin términos técnicos a la vista").not.toMatch(TERMINOS_TECNICOS);
    await captura(page, "v6-02-errores-escritorio", { completa: true });
    expect((await sucursalesDe()).length, "la revisión no guardó nada").toBe(antes);
  });

  test("corrige y vuelve a subir (los archivos con el mismo nombre se reemplazan): la revisión sale limpia, con su resumen y avisos, y aparece «Aplicar»", async ({ page }) => {
    await page.goto("/admin/catalogo");
    const mal = hojas("E");
    mal.grupos[0]![4] = "Taller 3";
    await page.getByTestId("entrada-de-archivos").setInputFiles(todos(mal));
    await page.getByTestId("boton-revisar").click();
    await expect(page.getByTestId("error-de-carga")).toHaveCount(1);
    // «Corrige» solo el archivo malo y lo vuelve a elegir: reemplaza al anterior y lo ya revisado se borra de la vista.
    await page.getByTestId("entrada-de-archivos").setInputFiles([archivo("grupos", buenas.grupos)]);
    await expect(page.getByTestId("resultado-de-carga")).toHaveCount(0);
    await expect(page.getByTestId("archivos-elegidos").getByRole("listitem")).toHaveCount(8);
    await page.getByTestId("boton-revisar").click();
    await expect(page.getByText("Todo está en orden")).toBeVisible();
    await expect(page.getByTestId("frase-de-carga")).toHaveText("Se crearán 23 cosas nuevas. Nada se borra.");
    const resumen = page.getByTestId("resumen-carga");
    for (const [fila, nuevos] of [["Disciplinas", "1"], ["Sucursales", "2"], ["Disciplinas por sucursal", "2"], ["Salones", "3"], ["Instructores", "2"], ["Programas", "3"], ["Grupos", "3"], ["Horarios", "4"], ["Precios", "3"]] as const) {
      await expect(resumen.getByRole("row").filter({ has: page.getByRole("cell", { name: fila, exact: true }) })).toContainText(nuevos);
    }
    await page.getByText("Ver cada cambio").click();
    await expect(page.getByTestId("detalle-de-cambios")).toContainText("Sucursal nueva: “Sede E Uno”");
    await expect(page.getByTestId("boton-aplicar")).toBeVisible();
    expect(await page.getByTestId("resultado-de-carga").innerText()).not.toMatch(TERMINOS_TECNICOS);
    await captura(page, "v6-03-revision-limpia-escritorio", { completa: true });
    // Nada guardado todavía.
    expect((await sucursalesDe()).some((s) => s.nombre === "Sede E Uno")).toBe(false);
  });

  test("«Aplicar» pide confirmar, carga todo y queda en el sistema; subir lo mismo otra vez dice «Sin cambios» y no ofrece aplicar", async ({ page }) => {
    await page.goto("/admin/catalogo");
    await page.getByTestId("entrada-de-archivos").setInputFiles(todos(buenas));
    await page.getByTestId("boton-revisar").click();
    await page.getByTestId("boton-aplicar").click();
    const dialogo = page.getByRole("dialog");
    await expect(dialogo).toContainText("¿Cargar estos cambios?");
    await expect(dialogo).toContainText("Se crearán 23 cosas nuevas. Nada se borra.");
    await captura(page, "v6-04-confirmar-escritorio");
    await dialogo.getByRole("button", { name: "Sí, aplicar" }).click();
    await expect(page.getByText("Listo: el catálogo se cargó")).toBeVisible();
    await expect(page.getByTestId("frase-de-carga")).toHaveText("Se crearon 23 cosas nuevas. Nada se borró.");
    await expect(page.getByTestId("boton-aplicar")).toHaveCount(0);
    await captura(page, "v6-05-aplicado-escritorio", { completa: true });

    // Lo cargado está en el sistema, listo para usarse.
    const sucursales = await sucursalesDe();
    expect(sucursales.map((s) => s.nombre)).toEqual(expect.arrayContaining(["Sede E Uno", "Sede E Dos"]));
    const grupos = await json<{ datos: { nombre: string; cupo_maximo: number; salon: { nombre: string } | null; horarios: unknown[] }[] }>(admin, "/api/grupos?limite=100");
    const tarde = grupos.datos.find((g) => g.nombre === "Tarde" && g.salon?.nombre === "Taller grande" && g.cupo_maximo === 15);
    expect(tarde?.horarios).toHaveLength(2);
    const registro = await json<{ paginacion: { total: number } }>(admin, "/api/registro-cambios?entidad_tipo=sucursal_vertical&limite=5");
    expect(registro.paginacion.total).toBeGreaterThanOrEqual(2);

    // Otra vez lo mismo: «Sin cambios».
    await page.goto("/admin/catalogo");
    await page.getByTestId("entrada-de-archivos").setInputFiles(todos(buenas));
    await page.getByTestId("boton-revisar").click();
    await expect(page.getByTestId("resultado-de-carga")).toContainText("Sin cambios");
    await expect(page.getByTestId("resultado-de-carga")).toContainText("Todo lo que subiste ya está en el sistema tal cual");
    await expect(page.getByTestId("boton-aplicar")).toHaveCount(0);
    await captura(page, "v6-06-sin-cambios-escritorio");
    expect((await sucursalesDe()).filter((s) => s.nombre === "Sede E Uno")).toHaveLength(1);
  });

  test("un cambio en un archivo ya cargado se reporta como actualizado, sin borrar lo que no viene, y avisa lo que no bloquea", async ({ page }) => {
    const cambiado = hojas("E");
    cambiado.salones = [[cambiado.sucursales[0]![0]!, "Taller grande", "25"]];
    cambiado.instructores = [["Instructor Nuevo E", "", "", ""]]; // sin teléfono: aviso, no error
    await page.goto("/admin/catalogo");
    await page.getByTestId("entrada-de-archivos").setInputFiles([archivo("salones", cambiado.salones), archivo("instructores", cambiado.instructores)]);
    await page.getByTestId("boton-revisar").click();
    await expect(page.getByTestId("frase-de-carga")).toHaveText("Se creará 1 cosa nueva y se actualizará 1. Nada se borra.");
    await page.getByText("Para tomar en cuenta").click();
    await expect(page.getByTestId("avisos-de-carga")).toContainText("no le llegarán por WhatsApp los avisos de las clases muestra");
    await page.getByText("Ver cada cambio").click();
    await expect(page.getByTestId("detalle-de-cambios")).toContainText("Salón “Taller grande” de “Sede E Uno”: capacidad 20 → 25");
    await captura(page, "v6-07-actualizacion-escritorio", { completa: true });
    await page.getByTestId("boton-aplicar").click();
    await page.getByRole("dialog").getByRole("button", { name: "Sí, aplicar" }).click();
    await expect(page.getByText("Listo: el catálogo se cargó")).toBeVisible();
    const salones = await json<{ datos: { nombre: string; capacidad: number }[] }>(admin, "/api/salones?limite=100");
    expect(salones.datos.filter((s) => s.nombre === "Taller grande").map((s) => s.capacidad).sort()).toEqual([12, 25]);
    expect(salones.datos.some((s) => s.nombre === "Taller chico"), "los salones que no venían en el archivo siguen ahí").toBe(true);
  });

  test("archivos que no son plantillas: se dice cuál no se entiende y por qué", async ({ page }) => {
    await page.goto("/admin/catalogo");
    await page.getByTestId("entrada-de-archivos").setInputFiles([{ name: "notas.csv", mimeType: "text/csv", buffer: Buffer.from("uno,dos\n1,2\n") }, { name: "salones.csv", mimeType: "text/csv", buffer: Buffer.from("Sucursal,Capacidad\nX,3\n") }]);
    await page.getByTestId("boton-revisar").click();
    await expect(page.getByTestId("errores-de-notas.csv")).toContainText("no se parece a ninguna de las plantillas");
    await expect(page.getByTestId("errores-de-salones.csv")).toContainText("le falta la columna «Salón»");
    await expect(page.getByTestId("boton-aplicar")).toHaveCount(0);
    await page.getByRole("button", { name: "Quitar notas.csv" }).click();
    await expect(page.getByTestId("resultado-de-carga")).toHaveCount(0);
  });
});

test.describe("CELULAR (390 px): el mismo recorrido, legible y sin desbordes", () => {
  test.use({ ...comoRol("administrador"), viewport: CELULAR, hasTouch: true, isMobile: true });
  const buenas = hojas("C");

  test("errores, corrección, revisión limpia y aplicar", async ({ page }) => {
    const sinDesborde = async (): Promise<void> => {
      const ancho = await page.evaluate(() => ({ cuerpo: document.documentElement.scrollWidth, ventana: window.innerWidth }));
      expect(ancho.cuerpo, "sin desplazamiento horizontal de la página").toBeLessThanOrEqual(ancho.ventana);
    };
    await page.goto("/admin/catalogo");
    await expect(page.getByRole("heading", { name: "Cargar catálogo" })).toBeVisible();
    await sinDesborde();
    await captura(page, "v6-08-cargar-catalogo-celular");

    const mal = hojas("C");
    mal.grupos[1]![5] = "Fulano"; // instructor que no existe
    mal.salones[0]![2] = "0"; // capacidad fuera de rango
    await page.getByTestId("entrada-de-archivos").setInputFiles(todos(mal));
    await page.getByTestId("boton-revisar").click();
    await expect(page.getByTestId("resultado-errores")).toContainText("Hay 2 cosas por corregir. No se guardó nada.");
    await expect(page.getByTestId("errores-de-grupos.csv")).toContainText("Fila 3, columna “Instructor”: no existe el instructor “Fulano”. Revisa el nombre o agrégalo en el archivo de instructores.");
    await expect(page.getByTestId("errores-de-salones.csv")).toContainText("Fila 2, columna “Capacidad”");
    await expect(page.getByTestId("boton-aplicar")).toHaveCount(0);
    await sinDesborde();
    await page.getByTestId("resultado-errores").scrollIntoViewIfNeeded();
    await captura(page, "v6-09-errores-celular", { completa: true });

    await page.getByTestId("entrada-de-archivos").setInputFiles([archivo("grupos", buenas.grupos), archivo("salones", buenas.salones)]);
    await page.getByTestId("boton-revisar").click();
    await expect(page.getByTestId("frase-de-carga")).toHaveText("Se crearán 23 cosas nuevas. Nada se borra.");
    await expect(page.getByTestId("boton-aplicar")).toBeVisible();
    await sinDesborde();
    await captura(page, "v6-10-revision-limpia-celular", { completa: true });

    await page.getByTestId("boton-aplicar").click();
    await expect(page.getByRole("dialog")).toContainText("¿Cargar estos cambios?");
    await page.getByRole("dialog").getByRole("button", { name: "Sí, aplicar" }).click();
    await expect(page.getByText("Listo: el catálogo se cargó")).toBeVisible();
    await sinDesborde();
    await captura(page, "v6-11-aplicado-celular", { completa: true });
    expect((await sucursalesDe()).map((s) => s.nombre)).toEqual(expect.arrayContaining(["Sede C Uno", "Sede C Dos"]));
  });
});
