// V8: las capturas de las guías de una página por rol (`docs/guias/*.md`). Cada guía cita pantallas y botones tal como están HOY en la interfaz: este recorrido las abre de verdad (si un botón
// citado ya no existe, el paso falla) y deja las imágenes con nombres estables (`asesor-01-embudo.png`…).
//
//   npm run guias:capturas      escribe las imágenes en `docs/guias/img/` (y `docs/guias/chatwoot-textos.json`); corre sola, con la base recién creada
//   npm run test:navegador      también corre este recorrido, pero escribe en la carpeta de la corrida (`<DIR_NAVEGADOR>/guias-img`): comprueba que los pasos de las guías siguen existiendo sin tocar `docs/`
//
// Datos: el spec crea los suyos (una familia para el asesor, una clase y un grupo para el maestro, una familia con cargos y un uniforme por entregar para recepción) para no depender de lo
// que dejen las demás pruebas en el mundo compartido. Además maquilla lo que se ve (nombre de la escuela, de las etapas, de las familias del embudo) y lo deshace al terminar: las guías las lee
// alguien que nunca vio el sistema y no debería ver «de prueba» ni «Etapa B» por todos lados. Nada de salud a la vista (el registro del maestro se captura solo en su sección «Alumno») ni
// datos de personas reales.
//
// Chatwoot (la sección «En Chatwoot» de la guía del asesor) se captura SOLO con `guias:capturas` y solo si el Chatwoot local está arriba (`docker compose up`): se entra con el usuario público
// de la demo y se abren conversaciones que ya existan (no se crea ni se cambia nada). Si no hay Chatwoot, se dejan las imágenes que ya estaban y el paso se marca como omitido.

import { test as libre, expect as esperar, type APIRequestContext, type APIResponse, type Locator, type Page } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { apiComo, haceDiasEnMexico, hoyEnMexico, json } from "./ayudas.ts";
import { comoRol, expect, mundo, test } from "./fixtura.ts";
import { DIR_NAVEGADOR, RAIZ } from "./mundo.ts";
import { sembrarAlumno, sembrarFamilia, type DocumentosLegalesSembrados, type OrganizacionDePrueba } from "../../src/testutil/semilla.ts";
import { crearPrismaDePruebas, type PrismaPruebas } from "../../src/testutil/prisma-pruebas.ts";
import { HORARIO_DE_CLASE_YA_EMPEZADA } from "../../scripts/navegador/horarios.ts";

test.describe.configure({ mode: "serial" });
test.setTimeout(90_000);

const ESCRIBIR_EN_DOCS = process.env["GUIAS_ESCRIBIR"] === "1";
const CARPETA = ESCRIBIR_EN_DOCS ? resolve(RAIZ, "docs/guias/img") : resolve(DIR_NAVEGADOR, "guias-img");
const org = mundo.organizacion.id;
const norte = mundo.sucursales.norte.id;
const ESCRITORIO = { width: 1100, height: 800 } as const;
const CELULAR = { width: 390, height: 780 } as const;

// ── Datos propios y maquillaje (todo se deshace en afterAll) ─────────────────────────────────────────────────────────────────────────────────────

let prisma: PrismaPruebas;
let admin: APIRequestContext;
const deshacer: (() => Promise<unknown>)[] = [];
let n = 0;
const telefonoUnico = (): string => `55${String(50_000_000 + ++n * 7919 + (Date.now() % 1_000_000)).padStart(8, "0")}`;
const ok = async (r: Promise<APIResponse>, que: string): Promise<APIResponse> => {
  const x = await r;
  if (!x.ok()) throw new Error(`${que}: ${x.status()} ${await x.text()}`);
  return x;
};
const orgDePrueba = (): OrganizacionDePrueba =>
  ({ organizacionId: org, slug: mundo.organizacion.slug, verticalId: mundo.verticalId, sucursales: [mundo.sucursales.norte, mundo.sucursales.sur], etapaInicialId: mundo.etapas["nuevo"] ?? "" }) as unknown as OrganizacionDePrueba;

const F = {} as {
  /** El asesor: una familia nueva con su conversación y una tarea, y otra que lleva días sin respuesta. */
  asesor: { leadId: string };
  /** El maestro: una clase muestra que empezó hace 90 minutos y un grupo con tres alumnos para el pase. */
  maestro: { claseId: string; grupoPase: string; alumnos: { id: string; nombre: string }[] };
  /** Recepción: una familia con dos hijos y cargos (uno vencido) y un uniforme por entregar. */
  recepcion: { tutorId: string; apellido: string; uniformeBeneficioId: string };
};

const ADULTOS = ["Lucía Ramírez", "Carlos Torres", "Mariana Hernández", "Jorge Morales", "Paola Castillo", "Ricardo Vázquez", "Daniela Ortega", "Miguel Delgado", "Fernanda Ibarra", "Andrés Navarro", "Verónica Salinas", "Hugo Medina"];
const NIÑOS: Record<string, string> = { "Niña Alfa": "Valeria", "Niño Beta": "Emiliano", "Niña Gamma": "Regina", "Alumna Uno": "Valentina", "Alumno Dos": "Santiago", "Alumna Ajena": "Renata", "Niño Épsilon": "Mateo", "Hijo Uno": "Mateo", "Hija Dos": "Sofía", "Alumno Uniforme": "Emilio" };
const ETAPAS: Record<string, string> = { nuevo: "Nuevo", contactado: "Contactado", muestra_agendada: "Clase muestra agendada", muestra_asistida: "Clase muestra asistida", negociacion: "En negociación", inscrito: "Inscrito", perdido: "Perdido" };

/** Lo que se ve de la escuela en las capturas: con nombres de verdad. Cada cambio guarda cómo deshacerse. */
async function maquillar(): Promise<void> {
  const recordar = <T extends { id: string }>(modelo: { update: (a: { where: { id: string }; data: Record<string, unknown> }) => Promise<unknown> }, antes: T, campos: string[]): void => {
    deshacer.push(() => modelo.update({ where: { id: antes.id }, data: Object.fromEntries(campos.map((c) => [c, (antes as unknown as Record<string, unknown>)[c]])) }));
  };
  const escuela = await prisma.organizacion.findUniqueOrThrow({ where: { id: org } });
  recordar(prisma.organizacion, escuela, ["nombre"]);
  await prisma.organizacion.update({ where: { id: org }, data: { nombre: "Escuela Modelo" } });

  const disciplina = await prisma.vertical.findUniqueOrThrow({ where: { id: mundo.verticalId } });
  recordar(prisma.vertical, disciplina, ["nombre"]);
  await prisma.vertical.update({ where: { id: disciplina.id }, data: { nombre: "Natación" } });

  const programa = await prisma.programa.findUniqueOrThrow({ where: { id: mundo.programaId } });
  recordar(prisma.programa, programa, ["nombre"]);
  await prisma.programa.update({ where: { id: programa.id }, data: { nombre: "Clases para niños de 6 a 13 años" } });

  for (const e of await prisma.etapa_pipeline.findMany({ where: { organizacion_id: org, eliminado_en: null } })) {
    const nuevo = ETAPAS[e.tipo_sistema ?? ""];
    if (!nuevo) continue;
    recordar(prisma.etapa_pipeline, e, ["nombre"]);
    await prisma.etapa_pipeline.update({ where: { id: e.id }, data: { nombre: nuevo } });
  }

  // Los adultos del embudo: «Mamá» y «Familia Alfa» pasan a nombres de persona (los de la prueba vuelven en afterAll).
  let i = 0;
  for (const l of await prisma.lead.findMany({ where: { organizacion_id: org, eliminado_en: null }, orderBy: { creado_en: "asc" } })) {
    if (!/^(Mamá|Familia )/.test(l.nombre_contacto ?? "")) continue;
    recordar(prisma.lead, l, ["nombre_contacto"]);
    await prisma.lead.update({ where: { id: l.id }, data: { nombre_contacto: ADULTOS[i++ % ADULTOS.length]! } });
  }
  for (const p of await prisma.prospecto.findMany({ where: { organizacion_id: org, eliminado_en: null } })) {
    const nuevo = NIÑOS[p.nombre ?? ""];
    if (!nuevo) continue;
    recordar(prisma.prospecto, p, ["nombre"]);
    await prisma.prospecto.update({ where: { id: p.id }, data: { nombre: nuevo } });
  }
  for (const a of await prisma.alumno.findMany({ where: { organizacion_id: org, eliminado_en: null } })) {
    const nuevo = NIÑOS[a.nombre];
    if (!nuevo) continue;
    recordar(prisma.alumno, a, ["nombre"]);
    await prisma.alumno.update({ where: { id: a.id }, data: { nombre: nuevo } });
  }
}

/** Una familia nueva para la guía del asesor: lo que el asesor abre en «Embudo», su ficha y «Tareas». */
async function sembrarAsesor(): Promise<void> {
  await prisma.etapa_pipeline.update({ where: { id: mundo.etapas["contactado"]! }, data: { dias_alerta_sin_movimiento: 3 } });
  const nueva = await sembrarFamilia(prisma, orgDePrueba(), { sucursalId: norte, nombre: "Valeria", edad: 6, etapaId: mundo.etapas["nuevo"]!, telefono: `+52${telefonoUnico()}` });
  await prisma.lead.update({ where: { id: nueva.leadId }, data: { nombre_contacto: "Mariana Vázquez", atribucion: { fuente: "codigo", codigo_rastreo: "GUIA2345" } } });
  await prisma.conversacion.create({ data: { organizacion_id: org, bandeja_chatwoot_id: (await prisma.bandeja_chatwoot.findFirstOrThrow({ where: { organizacion_id: org } })).id, lead_id: nueva.leadId, chatwoot_conversacion_id: 8800 + n } });
  await prisma.tarea_asesor.create({ data: { organizacion_id: org, lead_id: nueva.leadId, tipo: "revision_manual", descripcion: "Revisar los datos de Mariana Vázquez" } });
  // Una que lleva diez días sin respuesta: es la que enciende el aviso amarillo del embudo.
  const fria = await sembrarFamilia(prisma, orgDePrueba(), { sucursalId: norte, nombre: "Regina", edad: 10, etapaId: mundo.etapas["contactado"]!, telefono: `+52${telefonoUnico()}` });
  await prisma.lead.update({ where: { id: fria.leadId }, data: { nombre_contacto: "Claudia Navarro", ultima_interaccion_en: new Date(Date.now() - 10 * 86_400_000) } });
  await prisma.tarea_asesor.create({ data: { organizacion_id: org, lead_id: fria.leadId, tipo: "lead_frio", descripcion: "Retomar el contacto con Claudia Navarro" } });
  F.asesor = { leadId: nueva.leadId };
}

/** Para la guía del maestro: una clase muestra de hoy sin captura y un grupo propio con tres alumnos para el pase de lista. */
async function sembrarMaestro(docs: DocumentosLegalesSembrados): Promise<void> {
  const familia = await sembrarFamilia(prisma, orgDePrueba(), { sucursalId: norte, nombre: "Valentina", edad: 7, etapaId: mundo.etapas["muestra_agendada"] ?? mundo.etapas["nuevo"]!, telefono: `+52${telefonoUnico()}` });
  await prisma.lead.update({ where: { id: familia.leadId }, data: { nombre_contacto: "Laura Pérez" } });
  const cuando = new Date(Math.floor((Date.now() - 90 * 60_000) / 60_000) * 60_000);
  const clase = await prisma.clase_muestra.create({
    data: { organizacion_id: org, lead_id: familia.leadId, prospecto_id: familia.prospectoId, grupo_id: mundo.grupos.a.id, fecha_hora: cuando, estatus: "agendada", agendada_por: "usuario", agendada_por_usuario_id: mundo.usuarios.administrador.id },
  });
  const g = await prisma.grupo.create({ data: { organizacion_id: org, programa_id: mundo.programaId, nombre: "Grupo de la tarde", cupo_maximo: 30, instructor_id: mundo.instructorId } });
  // La guía pasa lista de HOY: la clase tiene que haber empezado a cualquier hora en que se corra la prueba (V10b-fix: con 18:00 fallaba antes de esa hora, p. ej. de madrugada).
  for (const dia of [0, 1, 2, 3, 4, 5, 6]) await prisma.grupo_horario.create({ data: { organizacion_id: org, grupo_id: g.id, dia_semana: dia, ...HORARIO_DE_CLASE_YA_EMPEZADA } });
  const alumnos: { id: string; nombre: string }[] = [];
  for (const [nombre, apellidos] of [["Ana", "Ruiz"], ["Beto", "Gómez"], ["Cira", "López"]] as const) {
    const a = await sembrarAlumno(prisma, orgDePrueba(), { docs, sucursalId: norte, nombre, telefono: `+52${telefonoUnico()}` });
    await prisma.alumno.update({ where: { id: a.alumnoId }, data: { apellidos } });
    await ok(admin.post("/api/inscripciones", { data: { alumno_id: a.alumnoId, grupo_id: g.id } }), `inscribir a ${nombre}`);
    alumnos.push({ id: a.alumnoId, nombre });
  }
  // Precondición explícita (si falla, el defecto es del fixture, no de la pantalla): el pase de hoy se puede tomar.
  const hoyDelPase = await json<{ problema: string | null; puede_registrar: boolean }>(admin, `/api/grupos/${g.id}/pase?fecha=${hoyEnMexico()}`);
  expect(hoyDelPase, "el pase de hoy del grupo sembrado debe poder tomarse a cualquier hora").toMatchObject({ problema: null, puede_registrar: true });
  F.maestro = { claseId: clase.id, grupoPase: g.id, alumnos };
  deshacer.push(() => prisma.grupo.update({ where: { id: g.id }, data: { activo: false } }));
}

/** Para la guía de recepción: una familia con dos hijos, un cargo vencido y un uniforme por entregar (con su pieza en existencia). */
async function sembrarRecepcion(docs: DocumentosLegalesSembrados): Promise<void> {
  const grupoD = mundo.recepcion.grupoD.id;
  const apellido = "Quintana";
  const mateo = await sembrarAlumno(prisma, orgDePrueba(), { docs, sucursalId: norte, nombre: "Mateo", telefono: `+52${telefonoUnico()}` });
  const sofia = await sembrarAlumno(prisma, orgDePrueba(), { docs, sucursalId: norte, nombre: "Sofía", conTutor: mateo.tutorId });
  await prisma.tutor.update({ where: { id: mateo.tutorId }, data: { nombre: "Rosa", apellidos: apellido } });
  await prisma.alumno.updateMany({ where: { id: { in: [mateo.alumnoId, sofia.alumnoId] } }, data: { apellidos: apellido } });
  for (const a of [mateo, sofia]) await ok(admin.post("/api/inscripciones", { data: { alumno_id: a.alumnoId, grupo_id: grupoD } }), "inscribir");
  await ok(admin.post("/api/cargos", { data: { alumno_id: mateo.alumnoId, descripcion: "Examen anterior", monto: "800.00", fecha_vencimiento: haceDiasEnMexico(40) } }), "cargo vencido");

  // Un uniforme por entregar: la promoción «al pagar la primera mensualidad» se apaga enseguida para que no afecte a nadie más.
  await ok(admin.post("/api/productos", { data: { vertical_id: mundo.verticalId, nombre: "Uniforme", talla: "6", precio: "350.00", stock: 5 } }), "producto");
  const promo = await prisma.promocion.create({ data: { organizacion_id: org, nombre: "Uniforme de bienvenida (guías)", codigo: `UNIFORME-GUIAS-${Date.now()}`, vigencia_desde: new Date("2020-01-01"), condicion_tipo: "al_pagar_primera_mensualidad", acumulable: true, prioridad: 5 } });
  await prisma.promocion_beneficio.create({ data: { organizacion_id: org, promocion_id: promo.id, tipo: "producto_gratis", modo: "total", momento_disparo: "al_cumplir_condicion", descripcion: "Uniforme" } });
  const emilia = await sembrarAlumno(prisma, orgDePrueba(), { docs, sucursalId: norte, nombre: "Emilia", telefono: `+52${telefonoUnico()}` });
  await prisma.alumno.update({ where: { id: emilia.alumnoId }, data: { talla_uniforme: "6", apellidos: "Orozco" } });
  await prisma.tutor.update({ where: { id: emilia.tutorId }, data: { nombre: "Elena", apellidos: "Orozco" } });
  const insc = (await (await ok(admin.post("/api/inscripciones", { data: { alumno_id: emilia.alumnoId, grupo_id: grupoD } }), "inscribir a Emilia")).json()) as { id: string };
  const cuenta = await json<{ hijos: { cargos: { id: string; concepto: string; saldo: string }[] }[] }>(admin, `/api/tutores/${emilia.tutorId}/estado-cuenta`);
  const mensualidad = cuenta.hijos.flatMap((h) => h.cargos).find((c) => c.concepto === "mensualidad")!;
  await ok(admin.post("/api/pagos", { data: { tutor_id: emilia.tutorId, monto: mensualidad.saldo, metodo: "efectivo", aplicaciones: [{ cargo_id: mensualidad.id, monto: mensualidad.saldo }] } }), "pago de la mensualidad");
  await prisma.promocion.update({ where: { id: promo.id }, data: { activo: false } });
  const beneficio = await prisma.promocion_aplicacion.findFirstOrThrow({ where: { inscripcion_id: insc.id, estatus: "liberado" } });
  F.recepcion = { tutorId: mateo.tutorId, apellido, uniformeBeneficioId: beneficio.id };
}

test.beforeAll(async () => {
  prisma = crearPrismaDePruebas(process.env["DATABASE_URL"], 4);
  admin = await apiComo("administrador");
  mkdirSync(CARPETA, { recursive: true });
  const docsDb = await prisma.documento_legal.findMany({ where: { organizacion_id: org, version: 1 } });
  const docs = { reglamento: docsDb.find((d) => d.tipo === "reglamento")?.id ?? "", usoImagen: docsDb.find((d) => d.tipo === "uso_imagen")?.id ?? "", avisoPrivacidad: docsDb.find((d) => d.tipo === "aviso_privacidad")?.id ?? "" } as DocumentosLegalesSembrados;
  await maquillar();
  await sembrarAsesor();
  await sembrarMaestro(docs);
  await sembrarRecepcion(docs);
});

test.afterAll(async () => {
  for (const f of deshacer.reverse()) await f().catch(() => undefined);
  await prisma.$disconnect();
  await admin.dispose();
  process.stdout.write(`\nGUÍAS: ${hechas.length} imágenes en ${ESCRIBIR_EN_DOCS ? "docs/guias/img/" : CARPETA}\n`);
});

// ── Capturas ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

const hechas: string[] = [];

/**
 * Una imagen de la guía. Con `sobre`, el recorte es ese elemento; con `completa`, toda la ventana; si no, la parte de arriba del área de trabajo (`altura`). `resaltar` marca con un
 * contorno rojo los botones que cita la guía: quien nunca vio el sistema sabe así cuál es. Si uno no está a la vista, el paso falla (la guía cita algo que ya no existe).
 */
async function foto(page: Page, nombre: string, o: { sobre?: Locator; altura?: number; resaltar?: Locator[]; completa?: boolean } = {}): Promise<void> {
  await page.waitForLoadState("networkidle", { timeout: 4000 }).catch(() => undefined);
  for (const r of o.resaltar ?? []) {
    await expect(r.first()).toBeVisible();
    await r.first().evaluate((el) => {
      (el as HTMLElement).style.outline = "3px solid #e11d48";
      (el as HTMLElement).style.outlineOffset = "2px";
    });
  }
  const destino = resolve(CARPETA, `${nombre}.png`);
  if (o.sobre) {
    await o.sobre.screenshot({ path: destino, animations: "disabled" });
  } else if (o.completa) {
    await page.screenshot({ path: destino, animations: "disabled" });
  } else {
    const caja = await page.locator("main").boundingBox();
    if (!caja) throw new Error("No hay área de trabajo");
    await page.screenshot({ path: destino, animations: "disabled", clip: { x: caja.x, y: caja.y, width: Math.min(caja.width, 900), height: o.altura ?? 550 } });
  }
  hechas.push(nombre);
}


/**
 * V13-fix (EV-34): abrir una pantalla COMO LA PERSONA, no escribiendo su dirección. Si se quita una sección de la barra (o un enlace de «Más» o de Administración), las guías la siguen
 * citando pero nadie puede llegar: antes este recorrido usaba `goto` y seguía en verde. Con la barra visible se hace clic en su sección; si no cabe en la barra, se pasa por «Más».
 */
async function irPorLaBarra(page: Page, etiqueta: string, ruta: string): Promise<void> {
  const barra = page.getByRole("navigation", { name: "Secciones" });
  const enBarra = barra.getByRole("link", { name: etiqueta, exact: true });
  if ((await enBarra.count()) > 0) await enBarra.first().click();
  else {
    await barra.getByRole("link", { name: "Más", exact: true }).first().click();
    await expect(page).toHaveURL(/\/mas$/);
    const enMas = page.getByRole("main").getByRole("link", { name: etiqueta, exact: true }).first();
    await expect(enMas, `«${etiqueta}» no está en la barra ni en «Más»: la guía la cita y nadie puede llegar`).toBeVisible({ timeout: 4000 });
    await enMas.click();
  }
  await expect(page, `«${etiqueta}» no lleva a ${ruta}`).toHaveURL(new RegExp(`${ruta.replace(/\//g, "\\/")}$`));
}

/** Un enlace visible de la pantalla actual (un botón de una tarjeta, una área de Administración) que lleva a `ruta`. */
async function irPorUnEnlace(page: Page, ruta: string): Promise<void> {
  const enlace = page.getByRole("main").locator(`a[href="${ruta}"]:visible`).first();
  await expect(enlace, `ninguna pantalla visible enlaza a ${ruta}`).toBeVisible();
  await enlace.click();
  await expect(page).toHaveURL(new RegExp(`${ruta.replace(/\//g, "\\/")}$`));
}

/** La pantalla de inicio de quien acaba de entrar (sin escribir ninguna dirección más que la raíz). */
async function entrarAlInicio(page: Page, ruta: string): Promise<void> {
  await page.goto("/");
  await expect(page).toHaveURL(new RegExp(`${ruta.replace(/\//g, "\\/")}$`));
}

// ── Asesor ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

test.describe("asesor", () => {
  test.use({ ...comoRol("asesor"), viewport: ESCRITORIO });

  test("embudo, ficha, mover de etapa y tareas", async ({ page }) => {
    await entrarAlInicio(page, "/embudo");
    await expect(page.getByRole("heading", { name: "Embudo" })).toBeVisible();
    await foto(page, "asesor-01-embudo", { resaltar: [page.getByRole("button", { name: "Ver solo estos" })] });

    await page.getByRole("link", { name: "Mariana Vázquez" }).first().click();
    await expect(page.getByRole("heading", { name: "Mariana Vázquez" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Agendar clase muestra" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Cotizar a mano" }).or(page.getByRole("button", { name: "Cotizar a mano" }))).toBeVisible();
    await foto(page, "asesor-02-ficha", { resaltar: [page.getByTestId("enlace-chatwoot"), page.getByRole("link", { name: "Convertir e inscribir" })] });

    await page.getByRole("button", { name: "Mover de etapa" }).click();
    const d = page.getByRole("dialog");
    await expect(d).toBeVisible();
    await d.getByLabel(/^Nueva etapa/).selectOption({ label: "Contactado" });
    await d.getByLabel(/^Nota/).fill("Le llamé y quedamos en que viene el sábado.");
    await foto(page, "asesor-03-mover-de-etapa", { sobre: d, resaltar: [d.getByRole("button", { name: "Mover", exact: true })] });
    await d.getByRole("button", { name: "Cancelar" }).click();

    await irPorLaBarra(page, "Tareas", "/tareas");
    await expect(page.getByRole("heading", { name: "Tareas" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Marcar como hecha" }).first()).toBeVisible();
    await foto(page, "asesor-04-tareas", { resaltar: [page.getByRole("button", { name: "Marcar como hecha" }), page.getByRole("button", { name: "Descartar" })] });
  });
});

// ── Maestro ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

test.describe("maestro", () => {
  test.use({ ...comoRol("maestro"), viewport: CELULAR, hasTouch: true, isMobile: true });

  test("hoy, registro, pase de lista y sin señal", async ({ page }) => {
    await entrarAlInicio(page, "/hoy");
    await expect(page.getByRole("heading", { name: "Hoy", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Asistió" }).first()).toBeVisible();
    await foto(page, "maestro-01-hoy", { completa: true, resaltar: [page.getByRole("link", { name: "Registro del alumno" }).first()] });

    await irPorUnEnlace(page, `/clases/${F.maestro.claseId}/registro`);
    await expect(page.getByRole("heading", { name: "Registro del alumno" })).toBeVisible();
    const seccion = page.getByTestId("seccion-alumno");
    await expect(seccion).toBeVisible();
    // Se llena con datos inventados y NO se guarda (la captura es solo de la sección «Alumno»: nada de salud a la vista).
    await seccion.getByLabel(/^Nombre/).fill("Valentina");
    await seccion.getByLabel(/^Apellidos/).fill("Pérez Luna");
    await seccion.getByLabel(/^Fecha de nacimiento/).fill("2018-03-02");
    await expect(seccion.getByRole("button", { name: "Guardar esta sección" })).toBeVisible();
    // Se baja hasta los campos: arriba, la lista de lo que falta nombra las secciones de salud (solo sus títulos), y las capturas de las guías no muestran nada de salud.
    await seccion.getByLabel(/^Nombre/).evaluate((el) => el.scrollIntoView({ block: "start" }));
    await page.evaluate(() => window.scrollBy(0, -90));
    await foto(page, "maestro-02-registro", { completa: true, resaltar: [page.getByRole("button", { name: "Guardar borrador" })] });

    await irPorLaBarra(page, "Pase de lista", "/pase");
    await expect(page.getByRole("heading", { name: "Pase de lista" })).toBeVisible();
    await page.getByLabel("Grupo").selectOption(F.maestro.grupoPase);
    await expect(page.getByTestId(`alumno-${F.maestro.alumnos[0]!.id}`)).toBeVisible();
    await page.getByRole("button", { name: "Marcar presentes a todos los que faltan por marcar" }).click();
    await page.getByTestId(`alumno-${F.maestro.alumnos[2]!.id}`).getByRole("radio", { name: "Falta" }).click();
    await foto(page, "maestro-03-pase", { completa: true, resaltar: [page.getByRole("button", { name: "Marcar presentes a todos los que faltan por marcar" }), page.getByRole("button", { name: "Guardar pase de lista" })] });

    // Sin señal: el aviso aparece junto al botón y lo marcado sigue ahí.
    await page.context().setOffline(true);
    await page.getByRole("button", { name: "Guardar pase de lista" }).click();
    await expect(page.getByText(/No se guardó nada todavía/)).toBeVisible();
    await foto(page, "maestro-04-sin-senal", { completa: true });
    await page.context().setOffline(false);
  });
});

// ── Recepción ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

test.describe("recepción", () => {
  test.use({ ...comoRol("recepcion"), viewport: ESCRITORIO });

  test("cobrar, repartir, estado de cuenta, uniformes y cierre", async ({ page }) => {
    await entrarAlInicio(page, "/pagos");
    await page.getByLabel("Teléfono o nombre de la familia").fill(F.recepcion.apellido);
    await page.getByRole("button", { name: "Buscar" }).click();
    const tarjeta = page.getByTestId(`familia-${F.recepcion.tutorId}`);
    await expect(tarjeta).toBeVisible();
    await foto(page, "recepcion-01-buscar", { resaltar: [tarjeta.getByRole("button", { name: "Elegir" })] });

    await tarjeta.getByRole("button", { name: "Elegir" }).click();
    await expect(page.getByTestId("saldo-total")).toBeVisible();
    await page.getByLabel(/^Monto recibido/).fill("1500");
    await foto(page, "recepcion-02-cobro", { resaltar: [page.getByRole("button", { name: "Registrar pago" })] });

    await page.getByRole("button", { name: "Ajustar el reparto a mano" }).click();
    await expect(page.getByTestId("suma-del-reparto")).toContainText("cuadra");
    await foto(page, "recepcion-03-reparto", { sobre: page.getByTestId("ajuste"), resaltar: [page.getByRole("button", { name: "Volver al reparto sugerido" })] });

    // «Estado de cuenta» de la barra: se busca a la familia y se elige (así llega la persona; no escribiendo la dirección de una familia).
    await irPorLaBarra(page, "Estado de cuenta", "/cuenta");
    await page.getByLabel("Teléfono o nombre de la familia").fill(F.recepcion.apellido);
    await page.getByRole("button", { name: "Buscar" }).click();
    await page.getByTestId(`familia-${F.recepcion.tutorId}`).getByRole("button", { name: "Elegir" }).click();
    await expect(page).toHaveURL(new RegExp(`/cuenta/${F.recepcion.tutorId}$`));
    await expect(page.getByTestId("saldo")).toBeVisible();
    await foto(page, "recepcion-04-cuenta", { resaltar: [page.getByTestId("imprimir-cuenta")] });

    await irPorLaBarra(page, "Uniformes", "/uniformes");
    await expect(page.getByTestId(`beneficio-${F.recepcion.uniformeBeneficioId}`)).toBeVisible();
    await foto(page, "recepcion-05-uniformes", { resaltar: [page.getByTestId(`beneficio-${F.recepcion.uniformeBeneficioId}`).getByRole("button", { name: "Marcar entregado" })] });

    await irPorLaBarra(page, "Ventas", "/ventas");
    await expect(page.getByRole("heading", { name: "Ventas", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Registrar venta" })).toBeVisible();

    await irPorLaBarra(page, "Cierre del día", "/corte");
    await expect(page.getByRole("heading", { name: "Cierre del día" })).toBeVisible();
    await foto(page, "recepcion-06-cierre", { resaltar: [page.getByTestId("imprimir-corte")] });
  });
});

// ── Administrador ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

test.describe("administrador", () => {
  test.use({ ...comoRol("administrador"), viewport: ESCRITORIO });

  test("para empezar, módulos, catálogo, usuarios, configuración y tableros", async ({ page }) => {
    await entrarAlInicio(page, "/embudo");
    await irPorLaBarra(page, "Administración", "/admin");
    await expect(page.getByRole("heading", { name: "Administración" })).toBeVisible();
    await expect(page.getByText("Para empezar", { exact: true }).first()).toBeVisible();
    await expect(page.getByLabel("Buscar una pantalla")).toBeVisible();
    // Con la escuela lista el plegable dice «Ver los pasos» (y está cerrado); si todavía falta algo, «Ver todos los pasos» (y ya está abierto).
    const pasos = page.getByText(/^Ver (todos )?los pasos$/);
    if ((await pasos.textContent()) === "Ver los pasos") await pasos.click();
    await foto(page, "administrador-01-para-empezar", { resaltar: [pasos] });

    await irPorLaBarra(page, "Administración", "/admin");
    await irPorUnEnlace(page, "/admin/modulos");
    await expect(page.getByRole("heading", { name: "Módulos" })).toBeVisible();
    await foto(page, "administrador-02-modulos");

    await irPorLaBarra(page, "Administración", "/admin");
    await irPorUnEnlace(page, "/admin/catalogo");
    await expect(page.getByRole("heading", { name: "Cargar catálogo" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Descargar todas las plantillas" })).toBeVisible();
    await foto(page, "administrador-03-catalogo", { resaltar: [page.getByRole("link", { name: "Descargar todas las plantillas" })] });

    await irPorLaBarra(page, "Administración", "/admin");
    await irPorUnEnlace(page, "/admin/usuarios");
    await expect(page.getByRole("heading", { name: "Usuarios y roles" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Agente de Chatwoot" }).first()).toBeVisible();
    await foto(page, "administrador-04-usuarios", { resaltar: [page.getByRole("button", { name: "Nuevo usuario" })] });

    await irPorLaBarra(page, "Administración", "/admin");
    await irPorUnEnlace(page, "/admin/configuracion");
    await expect(page.getByRole("heading", { name: "Configuración" })).toBeVisible();
    await foto(page, "administrador-05-configuracion");

    await irPorLaBarra(page, "Tableros", "/tableros");
    await expect(page.getByRole("heading", { name: "Tableros" })).toBeVisible();
    for (const solapa of ["Clases muestra", "Costo por campaña", "Ejecutivo"]) await expect(page.getByRole("tab", { name: solapa })).toBeVisible();
    await foto(page, "administrador-06-tableros");
  });
});

// ── Chatwoot (solo con `guias:capturas` y si el Chatwoot local está arriba) ─────────────────────────────────────────────────────────────────────────

libre.describe("Chatwoot", () => {
  libre.use({ viewport: { width: 1366, height: 800 }, locale: "es-MX" });
  const URL_CHATWOOT = process.env["GUIAS_CHATWOOT_URL"] ?? "http://localhost:3001";
  const ARCHIVO_TEXTOS = resolve(RAIZ, "docs/guias/chatwoot-textos.json");
  const demo = readFileSync(resolve(RAIZ, "config/demo-local.env"), "utf8");
  const dato = (k: string): string => demo.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.trim() ?? "";
  /** Los textos de Chatwoot que la guía cita en negritas y que se vieron en pantalla (los lee `scripts/guias-validar.test.ts`; se suman a los de corridas anteriores). */
  const comprobados = new Set<string>((() => { try { return (JSON.parse(readFileSync(ARCHIVO_TEXTOS, "utf8")) as { textos: string[] }).textos; } catch { return []; } })());
  const vistos = async (page: Page, textos: string[]): Promise<void> => {
    for (const t of textos) {
      // Un nombre que lleva un contador al lado («Sin asignar 1») se busca por su comienzo.
      const donde = t === "Sin asignar" ? page.getByText(/^Sin asignar/) : page.getByText(t, { exact: true });
      await esperar(donde.first(), `Chatwoot ya no muestra «${t}»`).toBeVisible();
      comprobados.add(t);
    }
  };
  /** Las conversaciones de un estado, por la API de Chatwoot (solo lectura; el usuario y el token son los públicos de la demo). */
  const conversaciones = async (cuenta: number, estado: "open" | "pending", sinAsignar: boolean): Promise<number[]> => {
    const cabeceras = { api_access_token: dato("CHATWOOT_ADMIN_TOKEN") };
    const r = (await (await fetch(`${URL_CHATWOOT}/api/v1/accounts/${cuenta}/conversations?status=${estado}${sinAsignar ? "&assignee_type=unassigned" : ""}`, { headers: cabeceras })).json()) as { data: { payload: { id: number }[] } };
    return r.data.payload.map((c) => c.id);
  };
  const entrar = async (page: Page): Promise<number> => {
    await page.goto(`${URL_CHATWOOT}/app/login`);
    await page.locator("input").nth(0).fill(dato("CHATWOOT_ADMIN_EMAIL"));
    await page.locator("input").nth(1).fill(dato("CHATWOOT_ADMIN_PASSWORD"));
    await page.getByRole("button", { name: /iniciar|login/i }).click();
    await esperar(page).toHaveURL(/dashboard/, { timeout: 30_000 });
    await page.waitForTimeout(2000);
    return Number(/accounts\/(\d+)/.exec(page.url())?.[1] ?? 1);
  };
  /** El contorno rojo de las capturas de las guías, también en Chatwoot. */
  const marcar = async (page: Page, textos: string[]): Promise<void> => {
    for (const t of textos)
      await page.getByText(t, { exact: true }).first().evaluate((el) => {
        (el as HTMLElement).style.outline = "3px solid #e11d48";
        (el as HTMLElement).style.outlineOffset = "2px";
      });
  };
  const levantado = (): Promise<boolean> => fetch(`${URL_CHATWOOT}/app/login`, { signal: AbortSignal.timeout(4000) }).then((r) => r.ok, () => false);

  // Una sola entrada a Chatwoot: su protección contra intentos repetidos bloquea unos minutos a quien inicia sesión varias veces seguidas.
  libre("la conversación que deja el asistente y cómo tomarla", async ({ page }) => {
    libre.skip(!ESCRIBIR_EN_DOCS, "Chatwoot solo se captura con `npm run guias:capturas` (la prueba de navegador no depende de docker)");
    libre.skip(!(await levantado()), `Chatwoot no está en ${URL_CHATWOOT}: se dejan las imágenes de Chatwoot que ya estaban (docker compose up -d --wait y vuelve a correr)`);
    const cuenta = await entrar(page);
    const guardar = (): void => writeFileSync(ARCHIVO_TEXTOS, `${JSON.stringify({ comprobado: new Date().toISOString().slice(0, 10), textos: [...comprobados].sort() }, null, 2)}\n`);
    const omitir = (que: string): void => {
      libre.info().annotations.push({ type: "omitido", description: que });
      process.stdout.write(`\nOMITIDO: ${que}\n`);
    };

    /** La primera conversación de la lista que muestra ese texto (Chatwoot cambia de estado una conversación cuando alguien la abre o la toma: no se supone cuál es cuál). */
    const buscar = async (ids: number[], texto: string): Promise<boolean> => {
      for (const id of ids) {
        await page.goto(`${URL_CHATWOOT}/app/accounts/${cuenta}/conversations/${id}`);
        if (await page.getByText(texto).first().waitFor({ timeout: 8000 }).then(() => true, () => false)) return true;
      }
      return false;
    };

    // 1. Una conversación abierta y sin asignar que ya traiga la nota del asistente (la deja `npm run demo:contacto` hasta la palabra «asesor»).
    if (!(await buscar(await conversaciones(cuenta, "open", true), "Datos capturados"))) omitir("No hay una conversación abierta y sin asignar con la nota del asistente en Chatwoot: corre `npm run demo:contacto -- --bandeja <nombre> --respuestas \"Hola|Mateo|9|1|asesor\"` y vuelve a correr");
    else {
      await vistos(page, ["Responder", "Nota privada", "Resolver", "Sin asignar"]);
      await marcar(page, ["Responder", "Nota privada"]);
      await page.waitForTimeout(500);
      await page.screenshot({ path: resolve(CARPETA, "asesor-05-chatwoot-conversacion.png"), clip: { x: 540, y: 130, width: 826, height: 520 } });
      guardar();
    }

    // 2. Una que el asistente todavía atiende: ahí se ve «Tomar el control» y, en el panel de la derecha, quién la tiene y las etiquetas.
    const candidatas = [...(await conversaciones(cuenta, "pending", false)), ...(await conversaciones(cuenta, "open", false))];
    if (!(await buscar(candidatas, "Tomar el control"))) omitir("No hay una conversación que el asistente todavía atienda: corre `npm run demo:contacto -- --bandeja <nombre> --respuestas \"Hola|Elena\"` y vuelve a correr");
    else {
      // Chatwoot recuerda qué paneles dejó abiertos cada persona: solo se abre el de acciones si está cerrado.
      if (!(await page.getByText("Acciones de conversación").isVisible())) await page.mouse.click(1334, 118);
      if (!(await page.getByText("Agente asignado").isVisible())) await page.getByText("Acciones de conversación").click();
      await vistos(page, ["Tomar el control", "Acciones de conversación", "Agente asignado", "Asignar a mi", "Etiquetas de conversación", "Añadir etiquetas"]);
      await marcar(page, ["Tomar el control", "Asignar a mi", "Añadir etiquetas"]);
      await page.waitForTimeout(500);
      await page.screenshot({ path: resolve(CARPETA, "asesor-06-chatwoot-tomar.png"), clip: { x: 540, y: 130, width: 826, height: 520 } });
      guardar();
    }
  });
});
