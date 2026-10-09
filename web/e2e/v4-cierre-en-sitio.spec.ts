// V4 (EK-15): el cierre del maestro en sitio, de punta a punta en navegador real. El administrador cambia el modo de cierre EN LA PANTALLA de Configuración; un lead con clase muestra
// asistida, registro completo y reglamento aceptado aparece en «Hoy» del maestro, que pulsa «Inscribir a mi alumno», confirma, y se comprueba lo que de verdad pasó: inscripción creada, un
// lugar menos, cargos de inscripción y primera mensualidad, lead «inscrito», cuadratura en verde, y que el maestro NO ve un solo importe. También los caminos que NO deben inscribir: el modo
// «el asesor cierra por WhatsApp», el módulo de inscripción apagado, el grupo que se llena mientras el maestro confirma, el doble clic y el reintento, un alumno que no es de sus grupos y un
// registro incompleto.
//
// Este archivo se llama `v4-…` para correr DESPUÉS de los demás (Playwright ordena por nombre): crea su propio programa y grupos e inscribe alumnos con cargos (un cargo no se borra:
// `cargo_inmutable`), así que no limpia lo inscrito; el mundo se recrea en cada corrida. Al terminar deja el modo de cierre, los módulos y las promociones como estaban.

import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import type { APIRequestContext, Page } from "@playwright/test";
import { apiComo, json } from "./ayudas.ts";
import { comoRol, expect, mundo, test } from "./fixtura.ts";
import { RAIZ } from "./mundo.ts";
import { crearPrismaDePruebas, type PrismaPruebas } from "../../src/testutil/prisma-pruebas.ts";

test.describe.configure({ mode: "serial" });

let prisma: PrismaPruebas;
let admin: APIRequestContext;
let asesor: APIRequestContext;
let maestro: APIRequestContext;
const org = mundo.organizacion.id;
const norte = mundo.sucursales.norte.id;
const MODULOS = ["cotizador", "clase_muestra", "inscripcion", "operacion", "finanzas", "tableros"] as const;
const creados = { programa: "", apagadas: [] as string[] };
let grupos: { a: string; lleno: string; ajeno: string };
let n = 0;

async function capturaV1(page: Page, nombre: string): Promise<void> {
  const carpeta = resolve(RAIZ, "docs/capturas/v1");
  mkdirSync(carpeta, { recursive: true });
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: resolve(carpeta, `${nombre}.png`), animations: "disabled" });
}

const telefonoUnico = (): string => `55${String(10_000_000 + ++n * 7919 + (Date.now() % 1_000_000)).padStart(8, "0")}`;

interface Familia {
  leadId: string;
  prospectoId: string;
  claseId: string;
  nombre: string;
  tutorTelefono: string;
}

/**
 * Un lead cuyo hijo terminó su clase muestra (asistió) en `claseEn`. Con `completo`, el maestro captura el registro por la API (como en la vida real) con el grupo recomendado, y la
 * familia acepta el reglamento por la API; sin él queda justo con lo que el bot dejó.
 */
async function familiaDeClase(nombre: string, o: { claseEn?: string; recomendado?: string; completo?: boolean; reglamento?: boolean; capturaCon?: APIRequestContext } = {}): Promise<Familia> {
  const tutorTelefono = telefonoUnico();
  const lead = await prisma.lead.create({
    data: { organizacion_id: org, vertical_interes_id: mundo.verticalId, sucursal_interes_id: norte, etapa_id: mundo.etapas["muestra_asistida"] ?? "", nombre_contacto: `Familia de ${nombre}`, telefono: `+52${tutorTelefono}`, ultima_interaccion_en: new Date() },
  });
  const prospecto = await prisma.prospecto.create({ data: { organizacion_id: org, lead_id: lead.id, vertical_interes_id: mundo.verticalId, nombre, edad_declarada: 8, origen: "asesor" } });
  const cuando = new Date(Math.floor((Date.now() - 90 * 60_000) / 60_000) * 60_000);
  const clase = await prisma.clase_muestra.create({
    data: { organizacion_id: org, lead_id: lead.id, prospecto_id: prospecto.id, grupo_id: o.claseEn ?? grupos.a, fecha_hora: cuando, estatus: "asistio", agendada_por: "usuario", agendada_por_usuario_id: mundo.usuarios.administrador.id, asistencia_marcada_en: new Date(), asistencia_marcada_por_usuario_id: mundo.usuarios.administrador.id },
  });
  if (o.completo !== false) {
    // El registro lo captura el maestro de la clase; el de un grupo ajeno lo captura el administrador (el maestro no puede escribir en lo que no es suyo).
    const quien = o.capturaCon ?? maestro;
    const r = await quien.patch(`/api/clases-muestra/${clase.id}/registro`, {
      data: {
        alumno: { nombre, apellidos: "Cierre Prueba", fecha_nacimiento: "2018-03-02", sexo: "femenino", escuela: "Escuela Nueva", turno_escolar: "matutino", talla_uniforme: "8" },
        tutores: [{ nombre: "Rosa", apellidos: "Cierre", parentesco: "madre", telefono: tutorTelefono, es_responsable_pago: true, lo_lleva: true }],
        antecedentes: { practico_antes: false, motivo_clase: "disciplina" },
        observacion: { grupo_recomendado_id: o.recomendado ?? grupos.a, interes_percibido: "alto" },
      },
    });
    expect(r.status(), await r.text()).toBe(200);
    if (o.reglamento !== false) {
      const doc = await prisma.documento_legal.findFirstOrThrow({ where: { organizacion_id: org, tipo: "reglamento" }, orderBy: { version: "desc" } });
      const a = await quien.post(`/api/clases-muestra/${clase.id}/registro/aceptaciones`, { data: { documento_id: doc.id, version: doc.version, resultado: "aceptada", aceptante: { nombre: "Rosa Cierre", parentesco: "madre" }, canal: "presencial" } });
      expect(a.status(), await a.text()).toBe(201);
    }
  }
  return { leadId: lead.id, prospectoId: prospecto.id, claseId: clase.id, nombre, tutorTelefono };
}

/** Lo que de verdad quedó en el sistema para esa familia (la base y la API del administrador). */
async function loQueQuedo(f: Familia) {
  const alumnos = await prisma.alumno.findMany({ where: { organizacion_id: org, nombre: f.nombre, eliminado_en: null }, select: { id: true } });
  const inscripciones = alumnos.length > 0 ? await prisma.inscripcion.findMany({ where: { alumno_id: { in: alumnos.map((a) => a.id) }, eliminado_en: null }, select: { id: true, grupo_id: true, estatus: true, precio_inscripcion_aplicado: true, precio_mensualidad_aplicado: true } }) : [];
  const tutor = (await json<{ datos: { id: string }[] }>(admin, `/api/tutores?telefono=${f.tutorTelefono}`)).datos[0];
  const cargos = tutor ? (await json<{ datos: { concepto: string; monto_final: string; estatus: string }[] }>(admin, `/api/cargos?tutor_id=${tutor.id}`)).datos : [];
  const lead = await json<{ etapa: { tipo_sistema: string } }>(admin, `/api/leads/${f.leadId}`);
  return { alumnos, inscripciones, cargos, etapa: lead.etapa.tipo_sistema };
}

const ocupados = (grupoId: string): Promise<number> => prisma.inscripcion.count({ where: { grupo_id: grupoId, estatus: "activa", eliminado_en: null } });

/** `npm run cuadratura` sobre la organización de la prueba: sale con 0 solo si cargos, pagos y existencias cuadran. */
function cuadraturaEnVerde(): void {
  const r = spawnSync("node", ["scripts/cuadratura.ts", "--json", "--organizacion", org], { cwd: RAIZ, env: process.env, encoding: "utf8" });
  expect(r.status, `cuadratura:\n${r.stdout}\n${r.stderr}`).toBe(0);
  const salida = JSON.parse(r.stdout.slice(r.stdout.indexOf("["))) as { ok: boolean; discrepancias: unknown[] }[];
  expect(salida[0]?.ok).toBe(true);
  expect(salida[0]?.discrepancias).toEqual([]);
}

const fijarModulos = async (encendidos: Record<(typeof MODULOS)[number], boolean>) => {
  const r = await admin.put("/api/modulos", { data: encendidos });
  expect(r.status(), await r.text()).toBe(200);
};
const todosEncendidos = (): Record<(typeof MODULOS)[number], boolean> => Object.fromEntries(MODULOS.map((m) => [m, true])) as Record<(typeof MODULOS)[number], boolean>;
const fijarModo = async (modo: "maestro_en_sitio" | "asesor_whatsapp") => {
  const r = await admin.patch("/api/configuracion", { data: { modo_cierre: modo } });
  expect(r.status(), await r.text()).toBe(200);
};

/** Ningún importe a la vista: ni un signo de pesos con cifras, ni las palabras del cobro con monto. */
async function sinImportes(page: Page): Promise<void> {
  const texto = await page.locator("main").innerText();
  expect(texto, "el maestro no ve importes").not.toMatch(/\$\s?\d|MXN|\d+\.\d{2}\b/);
}

test.beforeAll(async () => {
  prisma = crearPrismaDePruebas(process.env["DATABASE_URL"], 4);
  admin = await apiComo("administrador");
  asesor = await apiComo("asesor");
  maestro = await apiComo("maestro");
  // Las promociones que dejaron las otras pruebas del mundo valen para todos los programas: se apagan mientras corre (los montos de aquí son los del precio, sin descuentos) y se encienden al terminar.
  const ajenas = await prisma.promocion.findMany({ where: { organizacion_id: org, activo: true }, select: { id: true } });
  creados.apagadas = ajenas.map((p) => p.id);
  await prisma.promocion.updateMany({ where: { id: { in: creados.apagadas } }, data: { activo: false } });
  await fijarModulos(todosEncendidos());
  await fijarModo("asesor_whatsapp");
  const programa = await prisma.programa.create({ data: { organizacion_id: org, vertical_id: mundo.verticalId, sucursal_id: norte, nombre: "Programa V4", edad_min: 3, edad_max: 14 } });
  creados.programa = programa.id;
  await prisma.precio.create({ data: { organizacion_id: org, programa_id: programa.id, costo_inscripcion: "500.00", costo_mensualidad: "800.00", vigencia_desde: new Date("2020-01-01") } });
  // Un instructor no puede dar dos grupos a la misma hora: cada grupo tiene la suya.
  const grupo = async (nombre: string, cupo: number, instructorId: string | null, inicioMin: number) => {
    const g = await prisma.grupo.create({ data: { organizacion_id: org, programa_id: programa.id, nombre, cupo_maximo: cupo, ...(instructorId ? { instructor_id: instructorId } : {}) } });
    for (const dia of [0, 1, 2, 3, 4, 5, 6]) await prisma.grupo_horario.create({ data: { organizacion_id: org, grupo_id: g.id, dia_semana: dia, hora_inicio_min: inicioMin, hora_fin_min: inicioMin + 60 } });
    return g.id;
  };
  grupos = { a: await grupo("Grupo V4 A", 30, mundo.instructorId, 600), lleno: await grupo("Grupo V4 Lleno", 1, mundo.instructorId, 720), ajeno: await grupo("Grupo V4 Ajeno", 30, null, 600) };
});
test.afterAll(async () => {
  await fijarModulos(todosEncendidos()).catch(() => undefined);
  await fijarModo("asesor_whatsapp").catch(() => undefined);
  await prisma.promocion.updateMany({ where: { id: { in: creados.apagadas } }, data: { activo: true } });
  await prisma.programa.update({ where: { id: creados.programa }, data: { activo: false } });
  await prisma.$disconnect();
  await admin.dispose();
  await asesor.dispose();
  await maestro.dispose();
});

test.describe("el administrador cambia el modo de cierre en la pantalla de Configuración", () => {
  test.use(comoRol("administrador"));

  test("elige «el maestro, en sitio», guarda, y la aplicación lo respeta en la siguiente petición", async ({ page }) => {
    expect((await json<{ modo_cierre: string }>(admin, "/api/configuracion")).modo_cierre).toBe("asesor_whatsapp");
    await page.goto("/admin/configuracion");
    await expect(page.getByRole("heading", { name: "Configuración de la escuela" })).toBeVisible();
    await expect(page.getByText("Quién cierra la inscripción")).toBeVisible();
    const modo = page.getByLabel("Modo de cierre");
    await expect(modo).toHaveValue("asesor_whatsapp");
    await expect(page.getByText(/aparece «Inscribir a mi alumno» en su pantalla «Hoy»/)).toBeVisible();
    await modo.selectOption({ label: "El maestro, en sitio, al terminar la clase muestra" });
    await capturaV1(page, "v4-01-configuracion-escritorio");
    await page.getByRole("button", { name: "Guardar la configuración" }).click();
    await expect(page.getByText("Configuración guardada.")).toBeVisible();
    expect((await json<{ modo_cierre: string }>(admin, "/api/configuracion")).modo_cierre).toBe("maestro_en_sitio");
    const texto = await page.locator("main").innerText();
    expect(texto, "sin términos técnicos a la vista").not.toMatch(/maestro_en_sitio|asesor_whatsapp|modo_cierre/);
  });
});

test.describe("CELULAR (390 px): el maestro inscribe a su alumno", () => {
  test.use({ ...comoRol("maestro"), viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("«Hoy» → «Inscribir a mi alumno» → confirma: inscripción, lugar, cargos, lead inscrito, cuadratura en verde y ningún importe a la vista", async ({ page }) => {
    const f = await familiaDeClase("Alumna Cierre Uno");
    const antes = await ocupados(grupos.a);
    await page.goto("/hoy");
    const tarjeta = page.getByTestId(`clase-${f.claseId}`);
    await expect(tarjeta).toContainText(f.nombre);
    await expect(tarjeta).toContainText("Asistió");
    const cierre = tarjeta.getByTestId("cierre-en-sitio");
    await expect(cierre).toContainText("Ya está todo lo necesario");
    const boton = cierre.getByRole("button", { name: "Inscribir a mi alumno" });
    await expect(boton).toBeEnabled();
    await boton.scrollIntoViewIfNeeded();
    await sinImportes(page);
    await capturaV1(page, "v4-02-hoy-boton-celular");

    // Primero pide confirmar y dice en qué grupo queda; «Todavía no» no hace nada.
    await boton.click();
    const dialogo = page.getByRole("dialog", { name: `Inscribir a ${f.nombre}` });
    await expect(dialogo).toContainText("Quedará inscrito en el grupo Grupo V4 A");
    await expect(dialogo).toContainText("cobro de la inscripción y de la primera mensualidad");
    expect(await dialogo.innerText()).not.toMatch(/\$\s?\d/);
    await capturaV1(page, "v4-03-confirmar-celular");
    await dialogo.getByRole("button", { name: "Todavía no" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect((await loQueQuedo(f)).alumnos).toHaveLength(0);
    expect(await ocupados(grupos.a)).toBe(antes);

    await boton.click();
    await page.getByRole("dialog", { name: `Inscribir a ${f.nombre}` }).getByRole("button", { name: "Sí, inscribir" }).click();
    await expect(tarjeta.getByText("Listo: tu alumno quedó inscrito.")).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(boton).toHaveCount(0);
    await sinImportes(page);
    await capturaV1(page, "v4-04-inscrito-celular");

    // Lo que de verdad pasó.
    const q = await loQueQuedo(f);
    expect(q.alumnos).toHaveLength(1);
    expect(q.inscripciones).toHaveLength(1);
    expect(q.inscripciones[0]).toMatchObject({ grupo_id: grupos.a, estatus: "activa" });
    expect(String(q.inscripciones[0]?.precio_inscripcion_aplicado)).toBe("500");
    expect(String(q.inscripciones[0]?.precio_mensualidad_aplicado)).toBe("800");
    expect(await ocupados(grupos.a)).toBe(antes + 1);
    expect(q.cargos.map((c) => c.concepto).sort()).toEqual(["inscripcion", "mensualidad"]);
    expect(q.cargos.find((c) => c.concepto === "inscripcion")?.monto_final).toBe("500.00");
    expect(q.etapa).toBe("inscrito");
    cuadraturaEnVerde();

    // El maestro no ve dinero ni por la API: ni cargos ni precios en la inscripción.
    expect((await maestro.get("/api/cargos")).status()).toBe(403);
    const insc = await json<{ datos: Record<string, unknown>[] }>(maestro, `/api/inscripciones?alumno_id=${q.alumnos[0]!.id}`);
    expect(insc.datos).toHaveLength(1);
    expect(Object.keys(insc.datos[0]!).filter((k) => /precio|descuento|monto|promocion/.test(k))).toEqual([]);

    // Al volver a «Hoy» ya no ofrece inscribir otra vez.
    await page.reload();
    await expect(page.getByTestId(`clase-${f.claseId}`)).toContainText("Este alumno ya está inscrito.");
    await expect(page.getByTestId(`clase-${f.claseId}`).getByRole("button", { name: "Inscribir a mi alumno" })).toHaveCount(0);
  });

  test("un registro incompleto dice qué falta en palabras del maestro y no deja inscribir; nada queda a medias", async ({ page }) => {
    const f = await familiaDeClase("Alumna Cierre Falta", { completo: false });
    await page.goto("/hoy");
    const cierre = page.getByTestId(`clase-${f.claseId}`).getByTestId("cierre-en-sitio");
    await expect(cierre).toContainText("Todavía falta para poder inscribirlo");
    await expect(cierre).toContainText("El grupo en el que se inscribe");
    await expect(cierre.getByRole("button", { name: "Inscribir a mi alumno" })).toBeDisabled();
    const texto = await cierre.innerText();
    expect(texto).not.toMatch(/prospectos\.|grupo_id|tutor\./);
    await cierre.scrollIntoViewIfNeeded();
    await capturaV1(page, "v4-05-falta-celular");
    expect((await loQueQuedo(f)).alumnos).toHaveLength(0);
    // Con el registro completo y el grupo elegido, pero sin el reglamento: pide justo eso.
    const g = await familiaDeClase("Alumna Cierre Falta Dos", { reglamento: false });
    await page.reload();
    const c2 = page.getByTestId(`clase-${g.claseId}`).getByTestId("cierre-en-sitio");
    await expect(c2).toContainText("Que la familia acepte el reglamento");
    await c2.scrollIntoViewIfNeeded();
    await capturaV1(page, "v4-05b-falta-reglamento-celular");
    await expect(c2.getByRole("button", { name: "Inscribir a mi alumno" })).toBeDisabled();
  });

  test("el grupo se llena mientras el maestro confirma: mensaje claro, nada a medias y un siguiente paso (avisar al asesor)", async ({ page }) => {
    const f = await familiaDeClase("Alumna Cierre Lleno", { recomendado: grupos.lleno });
    await page.goto("/hoy");
    const tarjeta = page.getByTestId(`clase-${f.claseId}`);
    const boton = tarjeta.getByRole("button", { name: "Inscribir a mi alumno" });
    await expect(boton).toBeEnabled();
    await boton.click();
    const dialogo = page.getByRole("dialog", { name: `Inscribir a ${f.nombre}` });
    await expect(dialogo).toContainText("Grupo V4 Lleno");
    // Mientras el maestro lee, otra persona toma el único lugar.
    await prisma.inscripcion.create({
      data: { organizacion_id: org, alumno_id: mundo.conversion.rellenoAlumnoId, programa_id: creados.programa, grupo_id: grupos.lleno, fecha_inscripcion: new Date(), fecha_inicio: new Date(), estatus: "activa", precio_inscripcion_aplicado: "500.00", precio_mensualidad_aplicado: "800.00", dia_corte_pago: 5 },
    });
    await dialogo.getByRole("button", { name: "Sí, inscribir" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const aviso = tarjeta.getByTestId("cierre-en-sitio");
    await expect(aviso).toContainText("El grupo Grupo V4 Lleno ya no tiene lugares");
    await expect(aviso).toContainText("No se inscribió a nadie y no se generó ningún cobro");
    await expect(aviso).toContainText("lista de espera");
    const texto = await aviso.innerText();
    expect(texto).not.toMatch(/grupo_lleno|409|motivo/);
    await aviso.scrollIntoViewIfNeeded();
    await capturaV1(page, "v4-06-grupo-lleno-celular");
    // Nada a medias.
    const q = await loQueQuedo(f);
    expect(q.alumnos).toHaveLength(0);
    expect(q.cargos).toHaveLength(0);
    expect(q.etapa).not.toBe("inscrito");
    // El siguiente paso: avisar al asesor, que queda con una tarea.
    await aviso.getByRole("button", { name: "Avisar al asesor" }).click();
    await expect(aviso.getByText("Listo: el asesor recibió el aviso y se encarga.")).toBeVisible();
    expect(await prisma.tarea_asesor.count({ where: { lead_id: f.leadId, tipo: "listo_para_cerrar", estado: "pendiente" } })).toBe(1);
    // Y el asesor lo resuelve con el asistente completo: sigue sin haber inscripción hasta que él decida (lista de espera u otro grupo).
    expect(await ocupados(grupos.lleno)).toBe(1);
  });

  test("doble clic en «Sí, inscribir» y un reintento simultáneo por la API: UNA sola inscripción, un solo juego de cargos", async ({ page }) => {
    const f = await familiaDeClase("Alumna Cierre Doble");
    const antes = await ocupados(grupos.a);
    await page.goto("/hoy");
    const tarjeta = page.getByTestId(`clase-${f.claseId}`);
    await tarjeta.getByRole("button", { name: "Inscribir a mi alumno" }).click();
    await page.getByRole("dialog", { name: `Inscribir a ${f.nombre}` }).getByRole("button", { name: "Sí, inscribir" }).dblclick();
    await expect(tarjeta.getByText("Listo: tu alumno quedó inscrito.")).toBeVisible();
    const q = await loQueQuedo(f);
    expect(q.alumnos).toHaveLength(1);
    expect(q.inscripciones).toHaveLength(1);
    expect(q.cargos.map((c) => c.concepto).sort()).toEqual(["inscripcion", "mensualidad"]);
    expect(await ocupados(grupos.a)).toBe(antes + 1);
    // Un reintento después (la red se cortó y la pantalla volvió a mandar): no inscribe otra vez, avisa que ya estaba.
    const otra = await maestro.post(`/api/leads/${f.leadId}/convertir`, { data: {} });
    expect(otra.status()).toBe(200);
    expect(((await otra.json()) as { ya_convertido: boolean }).ya_convertido).toBe(true);

    // Dos peticiones al mismo tiempo (dos pantallas abiertas): una crea y la otra encuentra lo creado.
    const h = await familiaDeClase("Alumna Cierre Carrera");
    const respuestas = await Promise.all([maestro.post(`/api/leads/${h.leadId}/convertir`, { data: {} }), maestro.post(`/api/leads/${h.leadId}/convertir`, { data: {} }), maestro.post(`/api/leads/${h.leadId}/convertir`, { data: {} })]);
    expect(respuestas.map((r) => r.status()).sort()).toEqual([200, 200, 201]);
    const qh = await loQueQuedo(h);
    expect(qh.inscripciones).toHaveLength(1);
    expect(qh.cargos.map((c) => c.concepto).sort()).toEqual(["inscripcion", "mensualidad"]);
    cuadraturaEnVerde();
  });

  test("un alumno que no es de sus grupos: no aparece en «Hoy» y ni por la API ni por la dirección puede inscribirlo", async ({ page }) => {
    const ajeno = await familiaDeClase("Alumna Cierre Ajena", { claseEn: grupos.ajeno, recomendado: grupos.ajeno, capturaCon: admin });
    await page.goto("/hoy");
    await expect(page.getByRole("heading", { name: "Hoy", exact: true })).toBeVisible();
    await expect(page.getByTestId(`clase-${ajeno.claseId}`)).toHaveCount(0);
    await expect(page.getByText(ajeno.nombre)).toHaveCount(0);
    expect((await maestro.get(`/api/leads/${ajeno.leadId}/conversion`)).status()).toBe(404);
    const intento = await maestro.post(`/api/leads/${ajeno.leadId}/convertir`, { data: {} });
    expect(intento.status()).toBe(404);
    const q = await loQueQuedo(ajeno);
    expect(q.alumnos).toHaveLength(0);
    expect(q.etapa).not.toBe("inscrito");
    // Ni siquiera mandando el niño por su identificador.
    expect((await maestro.post(`/api/leads/${ajeno.leadId}/convertir`, { data: { prospectos: [{ prospecto_id: ajeno.prospectoId }] } })).status()).toBe(404);
    // Un alumno suyo con otro niño del mismo lead que NO tuvo clase con él tampoco se cuela: solo se inscribe a los suyos.
    const suyo = await familiaDeClase("Alumna Cierre Suya");
    const hermano = await prisma.prospecto.create({ data: { organizacion_id: org, lead_id: suyo.leadId, vertical_interes_id: mundo.verticalId, nombre: "Hermano Sin Clase", edad_declarada: 6, origen: "asesor" } });
    const r = await maestro.post(`/api/leads/${suyo.leadId}/convertir`, { data: { prospectos: [{ prospecto_id: hermano.id }] } });
    expect(r.status()).toBe(404);
    expect((await prisma.alumno.count({ where: { organizacion_id: org, nombre: "Hermano Sin Clase" } }))).toBe(0);
    // La dirección del asistente completo (del asesor) tampoco le sirve para inscribir lo ajeno.
    await page.goto(`/leads/${ajeno.leadId}/convertir`);
    await expect(page.getByRole("button", { name: "Convertir e inscribir" })).toHaveCount(0);
    expect((await loQueQuedo(ajeno)).alumnos).toHaveLength(0);
  });
});

test.describe("ESCRITORIO: el mismo cierre en pantalla grande", () => {
  test.use({ ...comoRol("maestro"), viewport: { width: 1366, height: 768 } });

  test("el maestro inscribe a su alumno desde «Hoy» en escritorio", async ({ page }) => {
    const f = await familiaDeClase("Alumno Cierre Escritorio");
    const antes = await ocupados(grupos.a);
    await page.goto("/hoy");
    const tarjeta = page.getByTestId(`clase-${f.claseId}`);
    await expect(tarjeta.getByRole("button", { name: "Inscribir a mi alumno" })).toBeEnabled();
    await capturaV1(page, "v4-07-hoy-boton-escritorio");
    await tarjeta.getByRole("button", { name: "Inscribir a mi alumno" }).click();
    const dialogo = page.getByRole("dialog", { name: `Inscribir a ${f.nombre}` });
    await expect(dialogo).toContainText("Grupo V4 A");
    await capturaV1(page, "v4-08-confirmar-escritorio");
    await dialogo.getByRole("button", { name: "Sí, inscribir" }).click();
    await expect(tarjeta.getByText("Listo: tu alumno quedó inscrito.")).toBeVisible();
    await sinImportes(page);
    await capturaV1(page, "v4-09-inscrito-escritorio");
    const q = await loQueQuedo(f);
    expect(q.inscripciones).toHaveLength(1);
    expect(await ocupados(grupos.a)).toBe(antes + 1);
    expect(q.cargos.map((c) => c.concepto).sort()).toEqual(["inscripcion", "mensualidad"]);
    expect(q.etapa).toBe("inscrito");
    cuadraturaEnVerde();
  });
});

test.describe("los caminos que NO inscriben", () => {
  test.use({ ...comoRol("maestro"), viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("modo «el asesor cierra por WhatsApp»: el maestro no ve «Inscribir a mi alumno», la API se lo niega y solo el asesor convierte", async ({ page }) => {
    const f = await familiaDeClase("Alumna Cierre Asesor");
    await fijarModo("asesor_whatsapp");
    try {
      await page.goto("/hoy");
      const tarjeta = page.getByTestId(`clase-${f.claseId}`);
      await expect(tarjeta).toContainText(f.nombre);
      await expect(tarjeta.getByRole("button", { name: "Listo para cerrar la inscripción" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Inscribir a mi alumno" })).toHaveCount(0);
      await expect(tarjeta.getByTestId("cierre-en-sitio")).toHaveCount(0);
      await tarjeta.scrollIntoViewIfNeeded();
      await capturaV1(page, "v4-10-modo-asesor-celular");
      // Con la API directa: 403 con la instrucción, y no se creó nada.
      const g = await maestro.get(`/api/leads/${f.leadId}/conversion`);
      expect(g.status()).toBe(403);
      expect(await g.text()).toContain("la inscripción la cierra el asesor");
      expect((await maestro.post(`/api/leads/${f.leadId}/convertir`, { data: {} })).status()).toBe(403);
      expect((await loQueQuedo(f)).alumnos).toHaveLength(0);
      // El maestro sí puede avisar al asesor ("listo para cerrar") y solo el asesor convierte.
      await tarjeta.getByRole("button", { name: "Listo para cerrar la inscripción" }).click();
      await expect(tarjeta.getByText("Listo: el asesor recibió el aviso para cerrar la inscripción.")).toBeVisible();
      const r = await asesor.post(`/api/leads/${f.leadId}/convertir`, { data: {} });
      expect(r.status(), await r.text()).toBe(201);
      const q = await loQueQuedo(f);
      expect(q.inscripciones).toHaveLength(1);
      expect(q.etapa).toBe("inscrito");
    } finally {
      await fijarModo("maestro_en_sitio");
    }
  });

  test("módulo de inscripción apagado: el botón no aparece (ni «listo para cerrar») y la API responde como una ruta que no existe", async ({ page }) => {
    const f = await familiaDeClase("Alumna Cierre Modulo");
    // Apagar la inscripción exige apagar antes lo que depende de ella.
    await fijarModulos({ ...todosEncendidos(), inscripcion: false, operacion: false, finanzas: false, tableros: false });
    try {
      await page.goto("/hoy");
      const tarjeta = page.getByTestId(`clase-${f.claseId}`);
      await expect(tarjeta).toContainText(f.nombre);
      await expect(page.getByRole("button", { name: "Inscribir a mi alumno" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Listo para cerrar la inscripción" })).toHaveCount(0);
      await expect(tarjeta.getByTestId("cierre-en-sitio")).toHaveCount(0);
      await tarjeta.scrollIntoViewIfNeeded();
      await capturaV1(page, "v4-11-modulo-apagado-celular");
      expect((await maestro.get(`/api/leads/${f.leadId}/conversion`)).status()).toBe(404);
      expect((await maestro.post(`/api/leads/${f.leadId}/convertir`, { data: {} })).status()).toBe(404);
      // Con el módulo apagado la API de familias tampoco responde: se comprueba directo en la base.
      expect(await prisma.alumno.count({ where: { organizacion_id: org, nombre: f.nombre } })).toBe(0);
      expect((await prisma.lead.findUniqueOrThrow({ where: { id: f.leadId }, select: { etapa: { select: { tipo_sistema: true } } } })).etapa.tipo_sistema).not.toBe("inscrito");
    } finally {
      await fijarModulos(todosEncendidos());
    }
    // Al encenderlo otra vez (sin reiniciar nada) el botón vuelve.
    await page.reload();
    await expect(page.getByTestId(`clase-${f.claseId}`).getByRole("button", { name: "Inscribir a mi alumno" })).toBeEnabled();
  });
});
