// Administración, catálogo: el inicio de administración (primeros pasos y menú), disciplinas, sucursales, programas, grupos y horarios, instructores y salones, precios, promociones y
// la carga del catálogo desde hojas. Prefijo de ids: `adminc-`. Solo las abre el administrador (`catalogo:escribir`).
//
// Para no depender del orden ni mutar la base, lo que escribiría (guardar, activar, dar de baja, aplicar la carga) se simula interceptando la escritura con una respuesta de éxito, o se hace
// fallar. La revisión de la carga del catálogo (`modo: "simulacion"`) no guarda nada, así que va contra la API real. Lo que el mundo de pruebas no trae (primeros pasos pendientes o listos,
// un historial de precios con vigente, futuro y pasado, un archivo ya cargado) se arma editando la respuesta GET de la API, solo en esa escena.

import type { Route } from "@playwright/test";
import { conCargando, conError, conMuchosDatos, conVacio, cortarLaRed, esperarListo, fallarLaSiguienteEscritura, irA, type Contexto, type Escena } from "./escenas.ts";

const GRUPO = "Administración, catálogo";
const P = "web/src/pantallas/admin/";
const ADMIN = `${P}Administracion.tsx`;
const AVISO_PASOS = `${P}AvisoDePrimerosPasos.tsx`;
const VERTICALES = `${P}Verticales.tsx`;
const SUCURSALES = `${P}Sucursales.tsx`;
const PROGRAMAS = `${P}Programas.tsx`;
const GRUPOS = `${P}Grupos.tsx`;
const INSTRUCTORES = `${P}InstructoresYSalones.tsx`;
const PRECIOS = `${P}Precios.tsx`;
const PROMOCIONES = `${P}Promociones.tsx`;
const CATALOGO = `${P}CargarCatalogo.tsx`;
const COMUNES = `${P}comunes.tsx`;
const DIALOGO = "web/src/ui/Dialogo.tsx";
const AVISOS = "web/src/ui/avisos.tsx";
const PAGINADOR = "web/src/ui/Paginador.tsx";

// ─── Ayudas propias ──────────────────────────────────────────────────────────────────────────

type Json = any;  
type Coincide = (u: URL) => boolean;

const enApi = (ruta: string): Coincide => (u) => u.pathname === ruta;
const esEscritura = (r: Route): boolean => r.request().method() !== "GET";

/** Edita la respuesta JSON de un GET de la API antes de que llegue a la página. */
async function editarGet(c: Contexto, coincide: Coincide, editar: (cuerpo: Json, u: URL) => Json): Promise<void> {
  await c.page.route(
    (u) => coincide(u),
    async (r) => {
      if (esEscritura(r)) return r.fallback();
      const resp = await r.fetch();
      if (!resp.ok()) return r.fulfill({ response: resp });
      const cuerpo = (await resp.json()) as Json;
      return r.fulfill({ response: resp, body: JSON.stringify(editar(cuerpo, new URL(r.request().url()))) });
    },
  );
}

/** Que cualquier escritura (POST/PUT/PATCH/DELETE) a la API responda «ya quedó» sin tocar la base. */
async function simularEscritura(c: Contexto): Promise<void> {
  await c.page.route(
    (u) => u.pathname.startsWith("/api/") && u.pathname !== "/api/yo",
    (r) => (esEscritura(r) ? r.fulfill({ status: 200, contentType: "application/json", body: "{}" }) : r.fallback()),
  );
}

/** Una petición GET de la API que nunca termina. */
async function colgarGet(c: Contexto, coincide: Coincide): Promise<void> {
  await c.page.route(
    (u) => coincide(u),
    (r) => (esEscritura(r) ? r.fallback() : new Promise<void>(() => undefined)),
  );
}

const rx = (texto: string): RegExp => new RegExp(`^${texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`);
const dlg = (c: Contexto) => c.page.locator("dialog[open]");

async function esperarDialogo(c: Contexto): Promise<void> {
  await dlg(c).waitFor();
  await esperarListo(c.page);
}

async function llenar(c: Contexto, etiqueta: string, valor: string): Promise<void> {
  await dlg(c).getByLabel(rx(etiqueta)).first().fill(valor);
}

async function marcar(c: Contexto, etiqueta: string): Promise<void> {
  await dlg(c).getByLabel(rx(etiqueta)).first().check();
}

async function elegir(c: Contexto, etiqueta: string, opcion: string | { index: number }): Promise<void> {
  await dlg(c).getByLabel(rx(etiqueta)).first().selectOption(opcion);
}

async function guardar(c: Contexto, boton = "Guardar"): Promise<void> {
  await dlg(c).getByRole("button", { name: boton, exact: true }).click();
}

async function esperarTexto(c: Contexto, texto: string | RegExp): Promise<void> {
  await dlg(c).getByText(texto).first().waitFor();
  await esperarListo(c.page);
}

async function verTexto(c: Contexto, texto: string | RegExp): Promise<void> {
  await dlg(c).getByText(texto).first().scrollIntoViewIfNeeded();
  await c.page.waitForTimeout(100);
}

async function abrirNuevo(c: Contexto, ruta: string, boton: string): Promise<void> {
  await irA(c, ruta);
  await c.page.getByRole("button", { name: boton, exact: true }).click();
  await esperarDialogo(c);
}

async function abrirEditar(c: Contexto, ruta: string, indice = 0): Promise<void> {
  await irA(c, ruta);
  await c.page.getByRole("button", { name: "Editar", exact: true }).nth(indice).click();
  await esperarDialogo(c);
}

async function abrirBaja(c: Contexto, ruta: string, indice = 0): Promise<void> {
  await irA(c, ruta);
  await c.page.getByRole("button", { name: "Dar de baja", exact: true }).nth(indice).click();
  await esperarDialogo(c);
}

async function esperarAviso(c: Contexto): Promise<void> {
  await c.page.getByTestId("aviso-global").waitFor();
  await c.page.waitForTimeout(300);
}

/** Las cinco vistas de una lista: con datos (la pantalla), muchos datos, vacía, cargando y con error de carga. */
function estadosDeLista(prefijo: string, ruta: string, fuente: string, nombre: string, vacioEn = "lista vacía"): Escena[] {
  const base = { rol: "administrador" as const, grupo: GRUPO, ruta, fuentes: [fuente] };
  return [
    { ...base, id: `${prefijo}-con-datos`, titulo: `${nombre}, con datos`, tipo: "pantalla", ir: (c) => irA(c, ruta) },
    { ...base, id: `${prefijo}-muchos`, titulo: `${nombre}, con muchos datos`, tipo: "estado", ir: (c) => conMuchosDatos(c, ruta) },
    { ...base, id: `${prefijo}-vacio`, titulo: `${nombre}, ${vacioEn}`, tipo: "estado", ir: (c) => conVacio(c, ruta) },
    { ...base, id: `${prefijo}-cargando`, titulo: `${nombre}, cargando`, tipo: "estado", ir: (c) => conCargando(c, ruta) },
    { ...base, id: `${prefijo}-error`, titulo: `${nombre}, con error de carga (500) y «Reintentar»`, tipo: "estado", ir: (c) => conError(c, ruta, 500) },
  ];
}

/** Una cuenta de «Primeros pasos» armada: `hechos` pasos listos y el resto pendientes (los pasos y sus rutas son los que da el servidor). */
function conPasos(hechos: number | "todos"): (cuerpo: Json) => Json {
  return (cuerpo) => {
    const pasos = (cuerpo.pasos as { id: string; hecho: boolean; detalle: string | null }[]).map((p, i) => {
      const listo = hechos === "todos" || i < hechos;
      return { ...p, hecho: listo, detalle: listo ? null : (p.detalle ?? "Te falta este paso para dejar lista la escuela.") };
    });
    const pendiente = pasos.find((p) => !p.hecho);
    return { ...cuerpo, pasos, total: pasos.length, hechos: pasos.filter((p) => p.hecho).length, siguiente: pendiente ? pendiente.id : null };
  };
}

const PASOS = enApi("/api/administracion/primeros-pasos");

// Listas de mentira: el mundo de pruebas trae una sola disciplina, un programa, ningún salón y solo promociones apagadas. Estas respuestas GET dan variedad (activo e inactivo, con y sin
// datos opcionales) para ver cómo se ven los casos que una escuela de verdad tiene. Se usan solo en las escenas que lo dicen.

const SALON_1 = "salon-de-muestra-1";

/** Dos salones: uno activo con capacidad y otro inactivo sin capacidad. */
async function salonesFalsos(c: Contexto): Promise<void> {
  await editarGet(c, enApi("/api/salones"), (b) => ({
    ...b,
    datos: [
      { id: SALON_1, sucursal_id: c.mundo.sucursales.norte.id, nombre: "Salón principal", capacidad: 20, activo: true },
      { id: "salon-de-muestra-2", sucursal_id: c.mundo.sucursales.sur.id, nombre: "Salón de ensayo", capacidad: null, activo: false },
    ],
    paginacion: { ...b.paginacion, total: 2 },
  }));
}

/** Tres disciplinas: completa (progresión, evento, color, cotiza y agenda), inactiva sin color ni progresión, y con progresión sin cotizador. */
async function verticalesFalsas(c: Contexto): Promise<void> {
  const base = { logo_url: null, cotizador_whatsapp_activo: false, clase_muestra_whatsapp_activo: false, etiqueta_evento: null, etiqueta_progresion: null, usa_progresion: false, color_marca: null, activo: true };
  await editarGet(c, enApi("/api/verticales"), (b) => ({
    ...b,
    datos: [
      { ...base, id: c.mundo.verticalId, nombre: "Disciplina completa", slug: "completa", usa_progresion: true, etiqueta_progresion: "Nivel", etiqueta_evento: "Evento de fin de ciclo", color_marca: "#1F5FBF", logo_url: "https://ejemplo.test/logo.png", cotizador_whatsapp_activo: true, clase_muestra_whatsapp_activo: true },
      { ...base, id: "disciplina-inactiva", nombre: "Disciplina inactiva", slug: "inactiva", activo: false },
      { ...base, id: "disciplina-con-avance", nombre: "Disciplina con avance", slug: "con-avance", usa_progresion: true, etiqueta_progresion: "Grado", color_marca: "#2E7D32" },
    ],
  }));
}

/** Tres sucursales: con dirección y disciplina, inactiva sin disciplinas, y con una zona horaria que no está en la lista. */
async function sucursalesFalsas(c: Contexto): Promise<void> {
  await editarGet(c, enApi("/api/sucursales"), (b) => ({
    ...b,
    datos: [
      { id: c.mundo.sucursales.norte.id, nombre: "Sucursal con dirección", direccion: "Avenida Principal 742, Colonia Centro", zona_horaria: "America/Tijuana", activo: true, verticales: [{ vertical_id: c.mundo.verticalId, nombre: "Vertical Prueba", activo: true }] },
      { id: "sucursal-inactiva", nombre: "Sucursal inactiva", direccion: null, zona_horaria: "America/Bogota", activo: false, verticales: [] },
      { id: "sucursal-otra-zona", nombre: "Sucursal en otra zona", direccion: "Calle Lejana 5", zona_horaria: "Pacific/Auckland", activo: true, verticales: [] },
    ],
  }));
}

/** Tres programas: con fecha de corte, alternativa (traslape) e inactivo con edades abiertas. */
async function programasFalsos(c: Contexto): Promise<void> {
  const base = { vertical_id: c.mundo.verticalId, sucursal_id: c.mundo.sucursales.norte.id, nivel: null, descripcion_publica: null, permite_traslape: false, fecha_corte_edad: null, activo: true };
  await editarGet(c, enApi("/api/programas"), (b) => ({
    ...b,
    datos: [
      { ...base, id: c.mundo.programaId, nombre: "Programa con fecha de corte", edad_min: 5, edad_max: 8, nivel: "Iniciación", descripcion_publica: "Para quienes empiezan.", fecha_corte_edad: "2026-09-01" },
      { ...base, id: "programa-alternativa", nombre: "Programa alternativa", edad_min: 7, edad_max: 10, permite_traslape: true },
      { ...base, id: "programa-inactivo", nombre: "Programa inactivo", edad_min: 0, edad_max: 99, activo: false },
    ],
    paginacion: { ...b.paginacion, total: 3 },
  }));
}

/** Tres grupos: con salón, instructor, lista de espera y dos horarios; inactivo; y sin horario ni salón. */
async function gruposFalsos(c: Contexto): Promise<void> {
  const programa = { id: c.mundo.programaId, nombre: "Programa de prueba", vertical_id: c.mundo.verticalId, sucursal_id: c.mundo.sucursales.norte.id };
  const base = { programa, permite_lista_espera: false, activo: true, instructor_id: null, salon_id: null, salon: null, horarios: [] };
  await editarGet(c, enApi("/api/grupos"), (b) => ({
    ...b,
    datos: [
      { ...base, id: "grupo-completo", nombre: "Grupo completo", cupo_maximo: 12, permite_lista_espera: true, instructor_id: c.mundo.instructorId, salon_id: SALON_1, salon: { id: SALON_1, nombre: "Salón principal" }, horarios: [{ dia_semana: 1, hora_inicio_min: 960, hora_fin_min: 1020 }, { dia_semana: 3, hora_inicio_min: 960, hora_fin_min: 1020 }] },
      { ...base, id: "grupo-inactivo", nombre: "Grupo inactivo", cupo_maximo: 20, activo: false, horarios: [{ dia_semana: 6, hora_inicio_min: 600, hora_fin_min: 690 }] },
      { ...base, id: "grupo-sin-horario", nombre: "Grupo sin horario", cupo_maximo: 8 },
    ],
    paginacion: { ...b.paginacion, total: 3 },
  }));
}

/** Dos promociones activas: por hermanos (con cupo, fin, alcance y dos beneficios) y por pago anticipado (sin fin ni alcance). */
async function promocionesFalsas(c: Contexto): Promise<void> {
  const beneficio = (id: string, tipo: string, modo: string, valor: string | null) => ({ id, tipo, modo, valor, producto_id: null, descripcion: null, momento_disparo: "inmediato" });
  await editarGet(c, enApi("/api/promociones"), (b) => ({
    ...b,
    datos: [
      { id: "promo-hermanos", nombre: "Promoción de hermanos", codigo: "HERMANOS", vigencia_desde: "2026-01-01", vigencia_hasta: "2099-12-31", condicion_tipo: "min_hermanos", condicion_valor: { hermanos: 2 }, cupo_maximo: 50, cupo_usado: 12, acumulable: false, prioridad: 10, activo: true, verticales: [c.mundo.verticalId], sucursales: [c.mundo.sucursales.norte.id], programas: [c.mundo.programaId], beneficios: [beneficio("beneficio-1", "descuento_mensualidad", "porcentaje", "15.00"), beneficio("beneficio-2", "meses_gratis", "total", "1.00")] },
      { id: "promo-anticipado", nombre: "Pago anticipado", codigo: "ANTICIPADO", vigencia_desde: "2026-01-01", vigencia_hasta: null, condicion_tipo: "pago_anticipado", condicion_valor: { meses: 3 }, cupo_maximo: null, cupo_usado: 0, acumulable: true, prioridad: 0, activo: true, verticales: [], sucursales: [], programas: [], beneficios: [beneficio("beneficio-3", "descuento_inscripcion", "monto_fijo", "250.00")] },
    ],
    paginacion: { ...b.paginacion, total: 2 },
  }));
}

// ─── Hojas del catálogo (la carga de Excel/CSV) ──────────────────────────────────────────────

const celda = (v: string): string => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
const csv = (encabezados: string[], filas: string[][]): string => `\ufeff${[encabezados, ...filas].map((f) => f.map(celda).join(",")).join("\r\n")}\r\n`;

type Hoja = "disciplinas" | "sucursales" | "salones" | "instructores" | "programas" | "grupos" | "horarios" | "precios";
const ENCABEZADOS: Record<Hoja, string[]> = {
  disciplinas: ["Disciplina", "Color"],
  sucursales: ["Sucursal", "Dirección", "Zona horaria"],
  salones: ["Sucursal", "Salón", "Capacidad"],
  instructores: ["Instructor", "Teléfono", "Correo", "Sucursales"],
  programas: ["Disciplina", "Sucursal", "Programa", "Edad mínima", "Edad máxima", "Fecha de corte de edad", "Nivel", "Descripción", "Alternativa para la misma edad"],
  grupos: ["Sucursal", "Programa", "Grupo", "Cupo", "Salón", "Instructor", "Lista de espera"],
  horarios: ["Sucursal", "Programa", "Grupo", "Día", "Hora de inicio", "Hora de fin"],
  precios: ["Sucursal", "Programa", "Inscripción", "Mensualidad", "Vigente desde"],
};
const ORDEN: Hoja[] = ["disciplinas", "sucursales", "salones", "instructores", "programas", "grupos", "horarios", "precios"];

type Hojas = Record<Hoja, string[][]>;

/** Una escuela inventada, sin relación con el mundo de pruebas (revisarla no guarda nada). */
function hojas(): Hojas {
  const d = "Disciplina de muestra";
  const s1 = "Sede Muestra Uno";
  const s2 = "Sede Muestra Dos";
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
      ["Instructora Muestra", "55 5000 0101", "", s1],
      ["Instructor Muestra", "55 5000 0102", "", `${s1} | ${s2}`],
    ],
    programas: [
      [d, s1, "Pequeños", "5", "8", "", "", "", ""],
      [d, s1, "Mayores", "9", "13", "", "", "", ""],
      [d, s2, "Pequeños", "5", "8", "", "", "", ""],
    ],
    grupos: [
      [s1, "Pequeños", "Tarde", "15", "Taller grande", "Instructora Muestra", ""],
      [s1, "Mayores", "Sábado", "8", "Taller chico", "Instructor Muestra", "Sí"],
      [s2, "Pequeños", "Mañana", "10", "Taller grande", "Instructor Muestra", ""],
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

interface ArchivoDeSubida {
  name: string;
  mimeType: string;
  buffer: Buffer;
}

const archivoCsv = (nombre: string, encabezados: string[], filas: string[][]): ArchivoDeSubida => ({ name: nombre, mimeType: "text/csv", buffer: Buffer.from(csv(encabezados, filas), "utf8") });
const hojaCsv = (h: Hoja, filas: string[][]): ArchivoDeSubida => archivoCsv(`${h}.csv`, ENCABEZADOS[h], filas);
const todasLasHojas = (x: Hojas): ArchivoDeSubida[] => ORDEN.map((h) => hojaCsv(h, x[h]));

/** Las cinco cosas que salen mal a la vez: salón que no existe, importe ambiguo, edades traslapadas, hora de 12 horas y capacidad con letras. */
function hojasConErrores(): Hojas {
  const mal = hojas();
  mal.grupos[0]![4] = "Taller 3";
  mal.precios[1]![3] = "1.500";
  mal.programas[1]![3] = "4";
  mal.horarios[2]![4] = "5:00 pm";
  mal.salones[2]![2] = "diez";
  return mal;
}

/** Un instructor sin teléfono: no es un error, pero la revisión lo avisa («Para tomar en cuenta»). */
function hojasConAvisos(): Hojas {
  const x = hojas();
  x.instructores = [["Instructor Sin Telefono", "", "", ""]];
  return x;
}

async function elegirArchivos(c: Contexto, archivos: ArchivoDeSubida[]): Promise<void> {
  await irA(c, "/admin/catalogo");
  await c.page.getByTestId("entrada-de-archivos").setInputFiles(archivos);
  await c.page.getByTestId("archivos-elegidos").waitFor();
  await esperarListo(c.page);
}

async function revisarHojas(c: Contexto, archivos: ArchivoDeSubida[]): Promise<void> {
  await elegirArchivos(c, archivos);
  await c.page.getByTestId("boton-revisar").click();
  await c.page.getByTestId("resultado-de-carga").waitFor();
  await esperarListo(c.page);
}

/** Abre el diálogo «¿Cargar estos cambios?» después de una revisión limpia (nada se confirma). */
async function abrirConfirmacionDeCarga(c: Contexto): Promise<void> {
  await revisarHojas(c, todasLasHojas(hojas()));
  await c.page.getByTestId("boton-aplicar").click();
  await esperarDialogo(c);
}

const IMPORTACION = enApi("/api/catalogo/importacion");

/** Responde a «Revisar» y a «Aplicar» con la revisión real (que no guarda) pero editada: lo que se pida aplicar vuelve como «ya aplicado». */
async function simularAplicacion(c: Contexto, editar: (informe: Json) => Json): Promise<void> {
  await c.page.route(
    (u) => IMPORTACION(u),
    async (r) => {
      const cuerpo = JSON.parse(r.request().postData() ?? "{}") as { modo?: string };
      const resp = await r.fetch({ postData: JSON.stringify({ ...cuerpo, modo: "simulacion" }) });
      const informe = (await resp.json()) as Json;
      return r.fulfill({ response: resp, body: JSON.stringify(editar({ ...informe, modo: cuerpo.modo ?? "simulacion" })) });
    },
  );
}

// ─── Escenas ─────────────────────────────────────────────────────────────────────────────────

export const ESCENAS: Escena[] = [
  // ═══ Inicio de administración ═══
  {
    id: "adminc-inicio-con-datos",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Inicio de Administración con «Para empezar» (3 de 8 pasos hechos, «Lo que sigue», lista de pasos abierta) y el menú de cada área",
    tipo: "pantalla",
    ruta: "/admin",
    fuentes: [ADMIN],
    ir: async (c) => {
      await editarGet(c, PASOS, conPasos(3));
      await irA(c, "/admin");
    },
  },
  {
    id: "adminc-inicio-escuela-lista",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Inicio de Administración con la escuela lista: «Para empezar» plegado a una línea («Ver los pasos»)",
    tipo: "estado",
    ruta: "/admin",
    fuentes: [ADMIN],
    ir: async (c) => {
      await editarGet(c, PASOS, conPasos("todos"));
      await irA(c, "/admin");
    },
  },
  {
    id: "adminc-inicio-pasos-abiertos-lista",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Inicio de Administración con la escuela lista y «Ver los pasos» abierto (todos con «Listo»)",
    tipo: "estado",
    ruta: "/admin",
    fuentes: [ADMIN],
    ir: async (c) => {
      await editarGet(c, PASOS, conPasos("todos"));
      await irA(c, "/admin");
      await c.page.getByText("Ver los pasos", { exact: true }).click();
      await c.page.waitForTimeout(150);
    },
  },
  {
    id: "adminc-inicio-sin-hechos",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Inicio de Administración de una escuela nueva: «0 de 8 pasos hechos»",
    tipo: "estado",
    ruta: "/admin",
    fuentes: [ADMIN],
    ir: async (c) => {
      await editarGet(c, PASOS, conPasos(0));
      await irA(c, "/admin");
    },
  },
  {
    id: "adminc-inicio-busqueda",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Inicio de Administración con el buscador usado («precio»): solo lo que coincide y el aviso «Mostrando solo lo que coincide»",
    tipo: "estado",
    ruta: "/admin",
    fuentes: [ADMIN],
    ir: async (c) => {
      await editarGet(c, PASOS, conPasos(3));
      await irA(c, "/admin");
      await c.page.getByLabel(rx("Buscar una pantalla")).fill("precio");
      await c.page.waitForTimeout(150);
    },
  },
  {
    id: "adminc-inicio-busqueda-sin-resultados",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Inicio de Administración con una búsqueda sin resultados: «No hay ninguna pantalla con…»",
    tipo: "estado",
    ruta: "/admin",
    fuentes: [ADMIN],
    ir: async (c) => {
      await editarGet(c, PASOS, conPasos(3));
      await irA(c, "/admin");
      await c.page.getByLabel(rx("Buscar una pantalla")).fill("zzzxq");
      await c.page.waitForTimeout(150);
    },
  },
  {
    id: "adminc-inicio-muchos",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Inicio de Administración con muchos datos (la lista de pasos repetida)",
    tipo: "estado",
    ruta: "/admin",
    fuentes: [ADMIN],
    ir: (c) => conMuchosDatos(c, "/admin"),
  },
  {
    id: "adminc-inicio-vacio",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Inicio de Administración con la respuesta de los primeros pasos vacía",
    tipo: "estado",
    ruta: "/admin",
    fuentes: [ADMIN],
    ir: (c) => conVacio(c, "/admin"),
  },
  {
    id: "adminc-inicio-cargando",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Inicio de Administración mientras carga «Para empezar» (el menú ya se ve)",
    tipo: "estado",
    ruta: "/admin",
    fuentes: [ADMIN],
    ir: (c) => conCargando(c, "/admin"),
  },
  {
    id: "adminc-inicio-error",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Inicio de Administración con error al cargar los primeros pasos (500): el menú sigue funcionando y no sale «Para empezar»",
    tipo: "estado",
    ruta: "/admin",
    fuentes: [ADMIN],
    ir: (c) => conError(c, "/admin", 500),
  },
  {
    id: "adminc-aviso-primeros-pasos-embudo",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Aviso «Para empezar» arriba del embudo del administrador (van 3 de 8 pasos; botón «Ver los pasos»)",
    tipo: "estado",
    fuentes: [AVISO_PASOS],
    ir: async (c) => {
      await editarGet(c, PASOS, conPasos(3));
      await irA(c, "/embudo");
      await c.page.getByTestId("aviso-primeros-pasos").waitFor();
    },
  },

  // ═══ Disciplinas ═══
  ...estadosDeLista("adminc-verticales", "/admin/verticales", VERTICALES, "Disciplinas"),
  {
    id: "adminc-verticales-nueva-vacio",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Diálogo «Nueva disciplina» vacío",
    tipo: "flotante",
    ruta: "/admin/verticales",
    fuentes: [VERTICALES, DIALOGO],
    ir: (c) => abrirNuevo(c, "/admin/verticales", "Nueva disciplina"),
  },
  {
    id: "adminc-verticales-nueva-validacion",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Diálogo «Nueva disciplina» con errores de validación (sin nombre, color mal escrito, progresión sin nombre del avance, clase muestra sin cotizador)",
    tipo: "flotante",
    ruta: "/admin/verticales",
    fuentes: [VERTICALES, DIALOGO],
    ir: async (c) => {
      await abrirNuevo(c, "/admin/verticales", "Nueva disciplina");
      await marcar(c, "Lleva progresión");
      await llenar(c, "Color de marca", "azulito");
      await marcar(c, "El bot agenda la clase muestra");
      await guardar(c);
      await esperarTexto(c, "Escribe el nombre");
      await verTexto(c, "Escribe el nombre");
    },
  },
  {
    id: "adminc-verticales-nueva-error-servidor",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Diálogo «Nueva disciplina» con el error del servidor en el campo («Ya existe una disciplina con ese nombre»)",
    tipo: "flotante",
    ruta: "/admin/verticales",
    fuentes: [VERTICALES, DIALOGO, COMUNES],
    ir: async (c) => {
      await abrirNuevo(c, "/admin/verticales", "Nueva disciplina");
      await llenar(c, "Nombre de la disciplina", "Disciplina de muestra");
      await fallarLaSiguienteEscritura(c, 409, "Ya existe una disciplina con ese nombre.", [{ campo: "nombre", mensaje: "Ya existe una disciplina con ese nombre." }]);
      await guardar(c);
      await esperarTexto(c, "Ya existe una disciplina con ese nombre.");
    },
  },
  {
    id: "adminc-verticales-nueva-sin-conexion",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Diálogo «Nueva disciplina» sin conexión («No hay conexión con el servidor…»)",
    tipo: "flotante",
    ruta: "/admin/verticales",
    fuentes: [VERTICALES, DIALOGO],
    ir: async (c) => {
      await abrirNuevo(c, "/admin/verticales", "Nueva disciplina");
      await llenar(c, "Nombre de la disciplina", "Disciplina de muestra");
      await cortarLaRed(c);
      await guardar(c);
      await esperarTexto(c, /No hay conexión/);
      await c.page.context().setOffline(false);
    },
  },
  {
    id: "adminc-verticales-editar",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Diálogo «Editar disciplina» con los datos de una disciplina (su dirección de página fija)",
    tipo: "flotante",
    ruta: "/admin/verticales",
    fuentes: [VERTICALES, DIALOGO],
    ir: (c) => abrirEditar(c, "/admin/verticales"),
  },
  {
    id: "adminc-verticales-editar-error-servidor",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Diálogo «Editar disciplina» con un error general del servidor (500) sobre los botones",
    tipo: "flotante",
    ruta: "/admin/verticales",
    fuentes: [VERTICALES, DIALOGO, COMUNES],
    ir: async (c) => {
      await abrirEditar(c, "/admin/verticales");
      await fallarLaSiguienteEscritura(c, 500, "Algo salió mal en el servidor. Inténtalo de nuevo.");
      await guardar(c);
      await esperarTexto(c, "Algo salió mal en el servidor");
    },
  },
  {
    id: "adminc-verticales-desactivar-error-servidor",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Disciplinas con el error de «Desactivar» (el servidor lo rechaza) sobre la lista",
    tipo: "estado",
    ruta: "/admin/verticales",
    fuentes: [VERTICALES, COMUNES],
    ir: async (c) => {
      await irA(c, "/admin/verticales");
      await fallarLaSiguienteEscritura(c, 409, "No se puede desactivar: tiene captación en curso.");
      await c.page.getByRole("button", { name: /^(Desactivar|Activar)$/ }).first().click();
      await c.page.getByText("No se puede desactivar: tiene captación en curso.").first().waitFor();
      await esperarListo(c.page);
    },
  },
  {
    id: "adminc-verticales-desactivar-sin-conexion",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Disciplinas sin conexión: «Desactivar» muestra «No hay conexión con el servidor…» sobre la lista",
    tipo: "estado",
    ruta: "/admin/verticales",
    fuentes: [VERTICALES],
    ir: async (c) => {
      await irA(c, "/admin/verticales");
      await cortarLaRed(c);
      await c.page.getByRole("button", { name: /^(Desactivar|Activar)$/ }).first().click();
      await c.page.getByText(/No hay conexión/).first().waitFor();
      await c.page.context().setOffline(false);
      await esperarListo(c.page);
    },
  },
  {
    id: "adminc-verticales-baja-confirmar",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Confirmación «Dar de baja la disciplina» (qué pasa, que no hay botón para recuperarla y que mejor se desactive)",
    tipo: "flotante",
    ruta: "/admin/verticales",
    fuentes: [VERTICALES, COMUNES, DIALOGO],
    ir: (c) => abrirBaja(c, "/admin/verticales"),
  },
  {
    id: "adminc-verticales-baja-error-servidor",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Confirmación «Dar de baja la disciplina» con el error del servidor dentro («tiene programas»)",
    tipo: "flotante",
    ruta: "/admin/verticales",
    fuentes: [VERTICALES, COMUNES, DIALOGO],
    ir: async (c) => {
      await abrirBaja(c, "/admin/verticales");
      await fallarLaSiguienteEscritura(c, 409, "No se puede dar de baja: la usan programas y canales.");
      await guardar(c, "Dar de baja");
      await esperarTexto(c, "No se puede dar de baja: la usan programas y canales.");
    },
  },

  // ═══ Sucursales ═══
  ...estadosDeLista("adminc-sucursales", "/admin/sucursales", SUCURSALES, "Sucursales"),
  {
    id: "adminc-sucursales-nueva-vacio",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Diálogo «Nueva sucursal» vacío",
    tipo: "flotante",
    ruta: "/admin/sucursales",
    fuentes: [SUCURSALES, DIALOGO],
    ir: (c) => abrirNuevo(c, "/admin/sucursales", "Nueva sucursal"),
  },
  {
    id: "adminc-sucursales-nueva-validacion",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Diálogo «Nueva sucursal» enviado vacío («Escribe el nombre»)",
    tipo: "flotante",
    ruta: "/admin/sucursales",
    fuentes: [SUCURSALES, DIALOGO],
    ir: async (c) => {
      await abrirNuevo(c, "/admin/sucursales", "Nueva sucursal");
      await guardar(c);
      await esperarTexto(c, "Escribe el nombre");
    },
  },
  {
    id: "adminc-sucursales-nueva-error-servidor",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Diálogo «Nueva sucursal» con el error del servidor en el campo («Ya existe una sucursal con ese nombre»)",
    tipo: "flotante",
    ruta: "/admin/sucursales",
    fuentes: [SUCURSALES, DIALOGO, COMUNES],
    ir: async (c) => {
      await abrirNuevo(c, "/admin/sucursales", "Nueva sucursal");
      await llenar(c, "Nombre de la sucursal", "Sede de muestra");
      await fallarLaSiguienteEscritura(c, 409, "Ya existe una sucursal con ese nombre.", [{ campo: "nombre", mensaje: "Ya existe una sucursal con ese nombre." }]);
      await guardar(c);
      await esperarTexto(c, "Ya existe una sucursal con ese nombre.");
    },
  },
  {
    id: "adminc-sucursales-nueva-sin-conexion",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Diálogo «Nueva sucursal» sin conexión",
    tipo: "flotante",
    ruta: "/admin/sucursales",
    fuentes: [SUCURSALES, DIALOGO],
    ir: async (c) => {
      await abrirNuevo(c, "/admin/sucursales", "Nueva sucursal");
      await llenar(c, "Nombre de la sucursal", "Sede de muestra");
      await cortarLaRed(c);
      await guardar(c);
      await esperarTexto(c, /No hay conexión/);
      await c.page.context().setOffline(false);
    },
  },
  {
    id: "adminc-sucursales-editar",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Diálogo «Editar sucursal» con los datos de una sucursal",
    tipo: "flotante",
    ruta: "/admin/sucursales",
    fuentes: [SUCURSALES, DIALOGO],
    ir: (c) => abrirEditar(c, "/admin/sucursales"),
  },
  {
    id: "adminc-sucursales-editar-cambia-zona",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Diálogo «Editar sucursal» con otra zona horaria elegida (sale la advertencia «Ojo: lo que ya está programado conserva la hora…»)",
    tipo: "flotante",
    ruta: "/admin/sucursales",
    fuentes: [SUCURSALES, DIALOGO],
    ir: async (c) => {
      await abrirEditar(c, "/admin/sucursales");
      await elegir(c, "Zona horaria", "America/Tijuana");
      await esperarTexto(c, /Ojo:/);
    },
  },
  {
    id: "adminc-sucursales-editar-error-servidor",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Diálogo «Editar sucursal» con un error general del servidor (500)",
    tipo: "flotante",
    ruta: "/admin/sucursales",
    fuentes: [SUCURSALES, DIALOGO],
    ir: async (c) => {
      await abrirEditar(c, "/admin/sucursales");
      await fallarLaSiguienteEscritura(c, 500, "Algo salió mal en el servidor. Inténtalo de nuevo.");
      await guardar(c);
      await esperarTexto(c, "Algo salió mal en el servidor");
    },
  },
  {
    id: "adminc-sucursales-ofrece-error-servidor",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Sucursales con el error al marcar o desmarcar una disciplina que se imparte ahí (el servidor lo rechaza)",
    tipo: "estado",
    ruta: "/admin/sucursales",
    fuentes: [SUCURSALES],
    ir: async (c) => {
      await irA(c, "/admin/sucursales");
      await fallarLaSiguienteEscritura(c, 409, "No se puede quitar: hay programas de esa disciplina en esta sucursal.");
      await c.page.getByTestId(/^ofrece-/).first().getByRole("checkbox").first().click();
      await c.page.getByText("No se puede quitar: hay programas de esa disciplina en esta sucursal.").first().waitFor();
      await esperarListo(c.page);
    },
  },
  {
    id: "adminc-sucursales-baja-confirmar",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Confirmación «Dar de baja la sucursal»",
    tipo: "flotante",
    ruta: "/admin/sucursales",
    fuentes: [SUCURSALES, COMUNES, DIALOGO],
    ir: (c) => abrirBaja(c, "/admin/sucursales"),
  },
  {
    id: "adminc-sucursales-baja-error-servidor",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Confirmación «Dar de baja la sucursal» con el error del servidor dentro («tiene programas, usuarios, leads o alumnos»)",
    tipo: "flotante",
    ruta: "/admin/sucursales",
    fuentes: [SUCURSALES, COMUNES, DIALOGO],
    ir: async (c) => {
      await abrirBaja(c, "/admin/sucursales");
      await fallarLaSiguienteEscritura(c, 409, "No se puede dar de baja: tiene programas, usuarios, leads o alumnos.");
      await guardar(c, "Dar de baja");
      await esperarTexto(c, "No se puede dar de baja: tiene programas, usuarios, leads o alumnos.");
    },
  },

  // ═══ Programas ═══
  ...estadosDeLista("adminc-programas", "/admin/programas", PROGRAMAS, "Programas", "sin programas con el filtro («No hay programas con ese filtro»)"),
  {
    id: "adminc-programas-filtro-sucursal",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Programas filtrados por una sucursal",
    tipo: "estado",
    ruta: "/admin/programas",
    fuentes: [PROGRAMAS],
    ir: async (c) => {
      await irA(c, "/admin/programas");
      await c.page.locator("main").getByLabel(rx("Sucursal")).selectOption({ label: c.mundo.sucursales.sur.nombre });
      await esperarListo(c.page);
    },
  },
  {
    id: "adminc-programas-paginado",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Programas con paginador («Página 1 de 3 · 60 en total», Anterior deshabilitado)",
    tipo: "estado",
    ruta: "/admin/programas",
    fuentes: [PROGRAMAS, PAGINADOR],
    ir: async (c) => {
      await editarGet(c, enApi("/api/programas"), (b, u) => (u.searchParams.has("limite") && u.searchParams.get("limite") === "25" ? { ...b, paginacion: { ...b.paginacion, total: 60, pagina: 1, limite: 25 } } : b));
      await irA(c, "/admin/programas");
    },
  },
  {
    id: "adminc-programas-nuevo-vacio",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Diálogo «Nuevo programa» vacío",
    tipo: "flotante",
    ruta: "/admin/programas",
    fuentes: [PROGRAMAS, DIALOGO],
    ir: (c) => abrirNuevo(c, "/admin/programas", "Nuevo programa"),
  },
  {
    id: "adminc-programas-nuevo-validacion",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Diálogo «Nuevo programa» enviado vacío (elige la disciplina, la sucursal, escribe el nombre y las edades)",
    tipo: "flotante",
    ruta: "/admin/programas",
    fuentes: [PROGRAMAS, DIALOGO],
    ir: async (c) => {
      await abrirNuevo(c, "/admin/programas", "Nuevo programa");
      await guardar(c);
      await esperarTexto(c, "Elige la disciplina");
    },
  },
  {
    id: "adminc-programas-nuevo-edades-invertidas",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Diálogo «Nuevo programa» con la edad máxima menor que la mínima («La edad máxima no puede ser menor que la mínima») al final del formulario",
    tipo: "flotante",
    ruta: "/admin/programas",
    fuentes: [PROGRAMAS, DIALOGO],
    ir: async (c) => {
      await abrirNuevo(c, "/admin/programas", "Nuevo programa");
      await elegir(c, "Disciplina", { index: 1 });
      await elegir(c, "Sucursal", { index: 1 });
      await llenar(c, "Nombre del programa", "Programa de muestra");
      await llenar(c, "Edad mínima", "10");
      await llenar(c, "Edad máxima", "5");
      await marcar(c, "Permite traslape");
      await guardar(c);
      await esperarTexto(c, "La edad máxima no puede ser menor que la mínima");
      await verTexto(c, "La edad máxima no puede ser menor que la mínima");
    },
  },
  {
    id: "adminc-programas-nuevo-error-servidor",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Diálogo «Nuevo programa» con el error del servidor (edades que se traslapan con otro programa)",
    tipo: "flotante",
    ruta: "/admin/programas",
    fuentes: [PROGRAMAS, DIALOGO, COMUNES],
    ir: async (c) => {
      await abrirNuevo(c, "/admin/programas", "Nuevo programa");
      await elegir(c, "Disciplina", { index: 1 });
      await elegir(c, "Sucursal", { index: 1 });
      await llenar(c, "Nombre del programa", "Programa de muestra");
      await llenar(c, "Edad mínima", "5");
      await llenar(c, "Edad máxima", "8");
      await fallarLaSiguienteEscritura(c, 409, "Las edades 5–8 se traslapan con las del programa «Programa de prueba».");
      await guardar(c);
      await esperarTexto(c, /se traslapan/);
      await verTexto(c, /se traslapan/);
    },
  },
  {
    id: "adminc-programas-nuevo-sin-conexion",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Diálogo «Nuevo programa» sin conexión",
    tipo: "flotante",
    ruta: "/admin/programas",
    fuentes: [PROGRAMAS, DIALOGO],
    ir: async (c) => {
      await abrirNuevo(c, "/admin/programas", "Nuevo programa");
      await elegir(c, "Disciplina", { index: 1 });
      await elegir(c, "Sucursal", { index: 1 });
      await llenar(c, "Nombre del programa", "Programa de muestra");
      await llenar(c, "Edad mínima", "5");
      await llenar(c, "Edad máxima", "8");
      await cortarLaRed(c);
      await guardar(c);
      await esperarTexto(c, /No hay conexión/);
      await verTexto(c, /No hay conexión/);
      await c.page.context().setOffline(false);
    },
  },
  {
    id: "adminc-programas-editar",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Diálogo «Editar programa» con los datos de un programa (disciplina y sucursal fijas)",
    tipo: "flotante",
    ruta: "/admin/programas",
    fuentes: [PROGRAMAS, DIALOGO],
    ir: (c) => abrirEditar(c, "/admin/programas"),
  },
  {
    id: "adminc-programas-baja-confirmar",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Confirmación «Dar de baja el programa»",
    tipo: "flotante",
    ruta: "/admin/programas",
    fuentes: [PROGRAMAS, COMUNES, DIALOGO],
    ir: (c) => abrirBaja(c, "/admin/programas"),
  },
  {
    id: "adminc-programas-baja-error-servidor",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Confirmación «Dar de baja el programa» con el error del servidor dentro («tiene grupos o inscripciones»)",
    tipo: "flotante",
    ruta: "/admin/programas",
    fuentes: [PROGRAMAS, COMUNES, DIALOGO],
    ir: async (c) => {
      await abrirBaja(c, "/admin/programas");
      await fallarLaSiguienteEscritura(c, 409, "No se puede dar de baja: tiene grupos o inscripciones.");
      await guardar(c, "Dar de baja");
      await esperarTexto(c, "No se puede dar de baja: tiene grupos o inscripciones.");
    },
  },

  // ═══ Grupos y horarios ═══
  ...estadosDeLista("adminc-grupos", "/admin/grupos", GRUPOS, "Grupos y horarios", "sin grupos («No hay grupos con ese filtro»)"),
  {
    id: "adminc-grupos-filtro-programa",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Grupos filtrados por programa",
    tipo: "estado",
    ruta: "/admin/grupos",
    fuentes: [GRUPOS],
    ir: async (c) => {
      await irA(c, "/admin/grupos");
      await c.page.getByLabel(rx("Programa")).selectOption(c.mundo.programaId);
      await esperarListo(c.page);
    },
  },
  {
    id: "adminc-grupos-busqueda",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Grupos con el buscador usado (el nombre de un grupo)",
    tipo: "estado",
    ruta: "/admin/grupos",
    fuentes: [GRUPOS],
    ir: async (c) => {
      await irA(c, "/admin/grupos");
      await c.page.getByLabel(rx("Buscar un grupo")).fill(c.mundo.grupos.a.nombre);
      await c.page.waitForTimeout(150);
    },
  },
  {
    id: "adminc-grupos-busqueda-sin-resultados",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Grupos con una búsqueda sin coincidencias («Ningún grupo coincide con…»)",
    tipo: "estado",
    ruta: "/admin/grupos",
    fuentes: [GRUPOS],
    ir: async (c) => {
      await irA(c, "/admin/grupos");
      await c.page.getByLabel(rx("Buscar un grupo")).fill("zzzxq");
      await c.page.waitForTimeout(150);
    },
  },
  {
    id: "adminc-grupos-paginado",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Grupos con paginador («Página 1 de 3 · 250 en total»)",
    tipo: "estado",
    ruta: "/admin/grupos",
    fuentes: [GRUPOS, PAGINADOR],
    ir: async (c) => {
      await editarGet(c, enApi("/api/grupos"), (b) => ({ ...b, paginacion: { ...b.paginacion, total: 250, pagina: 1, limite: 100 } }));
      await irA(c, "/admin/grupos");
    },
  },
  {
    id: "adminc-grupos-nuevo-vacio",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Diálogo «Nuevo grupo» vacío (sin horarios: «el grupo no aparecerá en el cotizador»)",
    tipo: "flotante",
    ruta: "/admin/grupos",
    fuentes: [GRUPOS, DIALOGO],
    ir: (c) => abrirNuevo(c, "/admin/grupos", "Nuevo grupo"),
  },
  {
    id: "adminc-grupos-nuevo-con-horarios",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Diálogo «Nuevo grupo» con programa, salón, instructor y dos horarios agregados",
    tipo: "flotante",
    ruta: "/admin/grupos",
    fuentes: [GRUPOS, DIALOGO],
    ir: async (c) => {
      await abrirNuevo(c, "/admin/grupos", "Nuevo grupo");
      await elegir(c, "Programa", c.mundo.programaId);
      await llenar(c, "Nombre del grupo", "Grupo de muestra");
      await llenar(c, "Cupo máximo", "12");
      await marcar(c, "Permite lista de espera");
      for (let i = 0; i < 2; i++) await dlg(c).getByRole("button", { name: "Agregar un horario", exact: true }).click();
      await elegir(c, "Día 1", "0");
      await elegir(c, "Día 2", "2");
      await verTexto(c, "Horarios");
    },
  },
  {
    id: "adminc-grupos-nuevo-validacion",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Diálogo «Nuevo grupo» con errores de validación (elige el programa, nombre, cupo y un horario sin día)",
    tipo: "flotante",
    ruta: "/admin/grupos",
    fuentes: [GRUPOS, DIALOGO],
    ir: async (c) => {
      await abrirNuevo(c, "/admin/grupos", "Nuevo grupo");
      await dlg(c).getByRole("button", { name: "Agregar un horario", exact: true }).click();
      await guardar(c);
      await esperarTexto(c, "Elige el programa");
    },
  },
  {
    id: "adminc-grupos-nuevo-validacion-horario",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Diálogo «Nuevo grupo» con el error del horario sin día, visto en la parte de los horarios",
    tipo: "flotante",
    ruta: "/admin/grupos",
    fuentes: [GRUPOS, DIALOGO],
    ir: async (c) => {
      await abrirNuevo(c, "/admin/grupos", "Nuevo grupo");
      await elegir(c, "Programa", c.mundo.programaId);
      await llenar(c, "Nombre del grupo", "Grupo de muestra");
      await llenar(c, "Cupo máximo", "12");
      await dlg(c).getByRole("button", { name: "Agregar un horario", exact: true }).click();
      await guardar(c);
      await dlg(c).locator("[data-prueba='horario-0'] .campo-error").first().waitFor();
      await verTexto(c, "Quitar este horario");
    },
  },
  {
    id: "adminc-grupos-nuevo-error-servidor",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Diálogo «Nuevo grupo» con el choque de salón o de instructor que detecta el servidor (qué se pisa con qué), junto a los botones",
    tipo: "flotante",
    ruta: "/admin/grupos",
    fuentes: [GRUPOS, DIALOGO, COMUNES],
    ir: async (c) => {
      await abrirNuevo(c, "/admin/grupos", "Nuevo grupo");
      await elegir(c, "Programa", c.mundo.programaId);
      await llenar(c, "Nombre del grupo", "Grupo de muestra");
      await llenar(c, "Cupo máximo", "12");
      await dlg(c).getByRole("button", { name: "Agregar un horario", exact: true }).click();
      await elegir(c, "Día 1", "0");
      await fallarLaSiguienteEscritura(c, 409, "El salón ya está ocupado: lunes 16:00 a 17:00 se pisa con «Grupo A».", [{ campo: "salon_id", mensaje: "El salón «Salón 1» ya está ocupado el lunes de 16:00 a 17:00 por «Grupo A»." }]);
      await guardar(c);
      await esperarTexto(c, /ya está ocupado/);
      await verTexto(c, /ya está ocupado/);
    },
  },
  {
    id: "adminc-grupos-nuevo-sin-conexion",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Diálogo «Nuevo grupo» sin conexión",
    tipo: "flotante",
    ruta: "/admin/grupos",
    fuentes: [GRUPOS, DIALOGO],
    ir: async (c) => {
      await abrirNuevo(c, "/admin/grupos", "Nuevo grupo");
      await elegir(c, "Programa", c.mundo.programaId);
      await llenar(c, "Nombre del grupo", "Grupo de muestra");
      await llenar(c, "Cupo máximo", "12");
      await cortarLaRed(c);
      await guardar(c);
      await esperarTexto(c, /No hay conexión/);
      await verTexto(c, /No hay conexión/);
      await c.page.context().setOffline(false);
    },
  },
  {
    id: "adminc-grupos-editar",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Diálogo «Editar grupo» con los datos de un grupo (programa fijo, salón, instructor y horarios)",
    tipo: "flotante",
    ruta: "/admin/grupos",
    fuentes: [GRUPOS, DIALOGO],
    ir: (c) => abrirEditar(c, "/admin/grupos"),
  },
  {
    id: "adminc-grupos-baja-confirmar",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Confirmación «Dar de baja el grupo»",
    tipo: "flotante",
    ruta: "/admin/grupos",
    fuentes: [GRUPOS, COMUNES, DIALOGO],
    ir: (c) => abrirBaja(c, "/admin/grupos"),
  },
  {
    id: "adminc-grupos-baja-error-servidor",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Confirmación «Dar de baja el grupo» con el error del servidor dentro («tiene alumnos inscritos»)",
    tipo: "flotante",
    ruta: "/admin/grupos",
    fuentes: [GRUPOS, COMUNES, DIALOGO],
    ir: async (c) => {
      await abrirBaja(c, "/admin/grupos");
      await fallarLaSiguienteEscritura(c, 409, "No se puede dar de baja: tiene alumnos inscritos.");
      await guardar(c, "Dar de baja");
      await esperarTexto(c, "No se puede dar de baja: tiene alumnos inscritos.");
    },
  },

  // ═══ Instructores y salones ═══
  ...estadosDeLista("adminc-instructores", "/admin/instructores", INSTRUCTORES, "Instructores y salones"),
  {
    id: "adminc-instructores-nuevo-vacio",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Diálogo «Nuevo instructor» vacío",
    tipo: "flotante",
    ruta: "/admin/instructores",
    fuentes: [INSTRUCTORES, DIALOGO],
    ir: (c) => abrirNuevo(c, "/admin/instructores", "Nuevo instructor"),
  },
  {
    id: "adminc-instructores-nuevo-validacion",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Diálogo «Nuevo instructor» enviado vacío («Escribe el nombre»)",
    tipo: "flotante",
    ruta: "/admin/instructores",
    fuentes: [INSTRUCTORES, DIALOGO],
    ir: async (c) => {
      await abrirNuevo(c, "/admin/instructores", "Nuevo instructor");
      await guardar(c);
      await esperarTexto(c, "Escribe el nombre");
    },
  },
  {
    id: "adminc-instructores-nuevo-error-servidor",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Diálogo «Nuevo instructor» con el error del servidor en un campo (correo mal escrito)",
    tipo: "flotante",
    ruta: "/admin/instructores",
    fuentes: [INSTRUCTORES, DIALOGO, COMUNES],
    ir: async (c) => {
      await abrirNuevo(c, "/admin/instructores", "Nuevo instructor");
      await llenar(c, "Nombre", "Instructora de muestra");
      await llenar(c, "Correo", "correo-mal");
      await fallarLaSiguienteEscritura(c, 400, "Escribe un correo válido.", [{ campo: "correo", mensaje: "Escribe un correo válido." }]);
      await guardar(c);
      await esperarTexto(c, "Escribe un correo válido.");
    },
  },
  {
    id: "adminc-instructores-nuevo-sin-conexion",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Diálogo «Nuevo instructor» sin conexión",
    tipo: "flotante",
    ruta: "/admin/instructores",
    fuentes: [INSTRUCTORES, DIALOGO],
    ir: async (c) => {
      await abrirNuevo(c, "/admin/instructores", "Nuevo instructor");
      await llenar(c, "Nombre", "Instructora de muestra");
      await cortarLaRed(c);
      await guardar(c);
      await esperarTexto(c, /No hay conexión/);
      await verTexto(c, /No hay conexión/);
      await c.page.context().setOffline(false);
    },
  },
  {
    id: "adminc-instructores-editar",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Diálogo «Editar instructor» con los datos de un instructor (su usuario y sus sucursales)",
    tipo: "flotante",
    ruta: "/admin/instructores",
    fuentes: [INSTRUCTORES, DIALOGO],
    ir: (c) => abrirEditar(c, "/admin/instructores"),
  },
  {
    id: "adminc-instructores-baja-confirmar",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Confirmación «Dar de baja al instructor»",
    tipo: "flotante",
    ruta: "/admin/instructores",
    fuentes: [INSTRUCTORES, COMUNES, DIALOGO],
    ir: (c) => abrirBaja(c, "/admin/instructores"),
  },
  {
    id: "adminc-instructores-baja-error-servidor",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Confirmación «Dar de baja al instructor» con el error del servidor dentro («todavía imparte grupos»)",
    tipo: "flotante",
    ruta: "/admin/instructores",
    fuentes: [INSTRUCTORES, COMUNES, DIALOGO],
    ir: async (c) => {
      await abrirBaja(c, "/admin/instructores");
      await fallarLaSiguienteEscritura(c, 409, "No se puede dar de baja: todavía imparte grupos.");
      await guardar(c, "Dar de baja");
      await esperarTexto(c, "No se puede dar de baja: todavía imparte grupos.");
    },
  },
  {
    id: "adminc-salones-nuevo-vacio",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Diálogo «Nuevo salón» vacío",
    tipo: "flotante",
    ruta: "/admin/instructores",
    fuentes: [INSTRUCTORES, DIALOGO],
    ir: (c) => abrirNuevo(c, "/admin/instructores", "Nuevo salón"),
  },
  {
    id: "adminc-salones-nuevo-validacion",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Diálogo «Nuevo salón» con errores de validación (sin sucursal, sin nombre, capacidad con letras)",
    tipo: "flotante",
    ruta: "/admin/instructores",
    fuentes: [INSTRUCTORES, DIALOGO],
    ir: async (c) => {
      await abrirNuevo(c, "/admin/instructores", "Nuevo salón");
      await llenar(c, "Capacidad", "muchos");
      await guardar(c);
      await esperarTexto(c, "Elige la sucursal");
    },
  },
  {
    id: "adminc-salones-nuevo-error-servidor",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Diálogo «Nuevo salón» con el error del servidor en el campo («Ya hay un salón con ese nombre en la sucursal»)",
    tipo: "flotante",
    ruta: "/admin/instructores",
    fuentes: [INSTRUCTORES, DIALOGO, COMUNES],
    ir: async (c) => {
      await abrirNuevo(c, "/admin/instructores", "Nuevo salón");
      await elegir(c, "Sucursal", { index: 1 });
      await llenar(c, "Nombre del salón", "Salón de muestra");
      await fallarLaSiguienteEscritura(c, 409, "Ya hay un salón con ese nombre en la sucursal.", [{ campo: "nombre", mensaje: "Ya hay un salón con ese nombre en la sucursal." }]);
      await guardar(c);
      await esperarTexto(c, "Ya hay un salón con ese nombre en la sucursal.");
    },
  },
  {
    id: "adminc-salones-nuevo-sin-conexion",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Diálogo «Nuevo salón» sin conexión",
    tipo: "flotante",
    ruta: "/admin/instructores",
    fuentes: [INSTRUCTORES, DIALOGO],
    ir: async (c) => {
      await abrirNuevo(c, "/admin/instructores", "Nuevo salón");
      await elegir(c, "Sucursal", { index: 1 });
      await llenar(c, "Nombre del salón", "Salón de muestra");
      await cortarLaRed(c);
      await guardar(c);
      await esperarTexto(c, /No hay conexión/);
      await c.page.context().setOffline(false);
    },
  },
  {
    id: "adminc-salones-editar",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Diálogo «Editar salón» con los datos de un salón (sin selector de sucursal)",
    tipo: "flotante",
    ruta: "/admin/instructores",
    fuentes: [INSTRUCTORES, DIALOGO],
    ir: async (c) => {
      await salonesFalsos(c);
      await irA(c, "/admin/instructores");
      await c.page.getByTestId("lista-de-salones").getByRole("button", { name: "Editar", exact: true }).first().click();
      await esperarDialogo(c);
    },
  },
  {
    id: "adminc-salones-baja-confirmar",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Confirmación «Dar de baja el salón»",
    tipo: "flotante",
    ruta: "/admin/instructores",
    fuentes: [INSTRUCTORES, COMUNES, DIALOGO],
    ir: async (c) => {
      await salonesFalsos(c);
      await irA(c, "/admin/instructores");
      await c.page.getByTestId("lista-de-salones").getByRole("button", { name: "Dar de baja", exact: true }).first().click();
      await esperarDialogo(c);
    },
  },
  {
    id: "adminc-salones-baja-error-servidor",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Confirmación «Dar de baja el salón» con el error del servidor dentro («algún grupo lo usa»)",
    tipo: "flotante",
    ruta: "/admin/instructores",
    fuentes: [INSTRUCTORES, COMUNES, DIALOGO],
    ir: async (c) => {
      await salonesFalsos(c);
      await irA(c, "/admin/instructores");
      await c.page.getByTestId("lista-de-salones").getByRole("button", { name: "Dar de baja", exact: true }).first().click();
      await esperarDialogo(c);
      await fallarLaSiguienteEscritura(c, 409, "No se puede dar de baja: algún grupo lo usa.");
      await guardar(c, "Dar de baja");
      await esperarTexto(c, "No se puede dar de baja: algún grupo lo usa.");
    },
  },

  // ═══ Precios ═══
  {
    id: "adminc-precios-sin-programa",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Precios sin programa elegido (solo el selector «Elige un programa»)",
    tipo: "pantalla",
    ruta: "/admin/precios",
    fuentes: [PRECIOS],
    ir: (c) => irA(c, "/admin/precios"),
  },
  {
    id: "adminc-precios-con-datos",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Precios de un programa: historial con un precio vigente y el botón «Nueva vigencia»",
    tipo: "estado",
    ruta: "/admin/precios",
    fuentes: [PRECIOS],
    ir: async (c) => {
      await irA(c, "/admin/precios");
      await c.page.getByLabel(rx("Programa")).selectOption(c.mundo.programaId);
      await esperarListo(c.page);
    },
  },
  {
    id: "adminc-precios-historial-completo",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Historial de precios con una vigencia pasada, una vigente y una futura (insignias «Pasada», «Vigente» y «Futura»; «Abierta» y fechas de cierre)",
    tipo: "estado",
    ruta: "/admin/precios",
    fuentes: [PRECIOS],
    ir: async (c) => {
      await editarGet(c, enApi("/api/precios"), (b) => ({
        ...b,
        datos: [
          { id: "precio-pasado", programa_id: c.mundo.programaId, costo_inscripcion: "400.00", costo_mensualidad: "850.00", moneda: "MXN", vigencia_desde: "2020-01-01", vigencia_hasta: "2024-12-31" },
          { id: "precio-vigente", programa_id: c.mundo.programaId, costo_inscripcion: "500.00", costo_mensualidad: "1000.00", moneda: "MXN", vigencia_desde: "2025-01-01", vigencia_hasta: "2098-12-31" },
          { id: "precio-futuro", programa_id: c.mundo.programaId, costo_inscripcion: "550.00", costo_mensualidad: "1150.50", moneda: "MXN", vigencia_desde: "2099-01-01", vigencia_hasta: null },
        ],
        paginacion: { ...b.paginacion, total: 3 },
      }));
      await irA(c, "/admin/precios");
      await c.page.getByLabel(rx("Programa")).selectOption(c.mundo.programaId);
      await esperarListo(c.page);
    },
  },
  {
    id: "adminc-precios-muchos",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Precios con muchos datos (historial largo)",
    tipo: "estado",
    ruta: "/admin/precios",
    fuentes: [PRECIOS],
    ir: async (c) => {
      await conMuchosDatos(c, "/admin/precios");
      await c.page.getByLabel(rx("Programa")).selectOption(c.mundo.programaId);
      await esperarListo(c.page);
    },
  },
  {
    id: "adminc-precios-programa-sin-precio",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Precios de un programa sin ningún precio («Este programa todavía no tiene precio»)",
    tipo: "estado",
    ruta: "/admin/precios",
    fuentes: [PRECIOS],
    ir: async (c) => {
      await editarGet(c, enApi("/api/precios"), (b) => ({ ...b, datos: [], paginacion: { ...b.paginacion, total: 0 } }));
      await irA(c, "/admin/precios");
      await c.page.getByLabel(rx("Programa")).selectOption(c.mundo.programaId);
      await esperarListo(c.page);
    },
  },
  {
    id: "adminc-precios-cargando-programas",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Precios mientras cargan los programas",
    tipo: "estado",
    ruta: "/admin/precios",
    fuentes: [PRECIOS],
    ir: (c) => conCargando(c, "/admin/precios"),
  },
  {
    id: "adminc-precios-cargando-historial",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Precios con un programa elegido mientras carga su historial",
    tipo: "estado",
    ruta: "/admin/precios",
    fuentes: [PRECIOS],
    ir: async (c) => {
      await irA(c, "/admin/precios");
      await colgarGet(c, enApi("/api/precios"));
      await c.page.getByLabel(rx("Programa")).selectOption(c.mundo.programaId);
      await c.page.locator(".giro, .cargando").first().waitFor({ timeout: 8000 }).catch(() => undefined);
      await c.page.waitForTimeout(150);
    },
  },
  {
    id: "adminc-precios-error-programas",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Precios con error al cargar los programas (500) y «Reintentar»",
    tipo: "estado",
    ruta: "/admin/precios",
    fuentes: [PRECIOS],
    ir: (c) => conError(c, "/admin/precios", 500),
  },
  {
    id: "adminc-precios-error-historial",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Precios con error al cargar el historial de un programa (500) y «Reintentar»",
    tipo: "estado",
    ruta: "/admin/precios",
    fuentes: [PRECIOS],
    ir: async (c) => {
      await irA(c, "/admin/precios");
      await c.page.route(
        (u) => u.pathname === "/api/precios",
        (r) => (esEscritura(r) ? r.fallback() : r.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: { codigo: "interno", mensaje: "Algo salió mal en el servidor. Inténtalo de nuevo." } }) })),
      );
      await c.page.getByLabel(rx("Programa")).selectOption(c.mundo.programaId);
      await esperarListo(c.page);
    },
  },
  {
    id: "adminc-precios-nueva-vigencia-vacio",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Diálogo «Nueva vigencia de precio» vacío (la fecha de hoy ya puesta)",
    tipo: "flotante",
    ruta: "/admin/precios",
    fuentes: [PRECIOS, DIALOGO],
    ir: async (c) => {
      await irA(c, "/admin/precios");
      await c.page.getByLabel(rx("Programa")).selectOption(c.mundo.programaId);
      await c.page.getByRole("button", { name: "Nueva vigencia", exact: true }).click();
      await esperarDialogo(c);
    },
  },
  {
    id: "adminc-precios-nueva-vigencia-validacion",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Diálogo «Nueva vigencia de precio» con errores de validación (importes inválidos y fecha vacía)",
    tipo: "flotante",
    ruta: "/admin/precios",
    fuentes: [PRECIOS, DIALOGO],
    ir: async (c) => {
      await irA(c, "/admin/precios");
      await c.page.getByLabel(rx("Programa")).selectOption(c.mundo.programaId);
      await c.page.getByRole("button", { name: "Nueva vigencia", exact: true }).click();
      await esperarDialogo(c);
      await llenar(c, "Mensualidad", "mil pesos");
      await llenar(c, "Rige desde", "");
      await guardar(c, "Guardar la nueva vigencia");
      await esperarTexto(c, /Escribe un importe válido \(por ejemplo 500/);
    },
  },
  {
    id: "adminc-precios-nueva-vigencia-error-servidor",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Diálogo «Nueva vigencia de precio» con el error del servidor (la fecha no puede ser anterior a la vigencia actual)",
    tipo: "flotante",
    ruta: "/admin/precios",
    fuentes: [PRECIOS, DIALOGO, COMUNES],
    ir: async (c) => {
      await irA(c, "/admin/precios");
      await c.page.getByLabel(rx("Programa")).selectOption(c.mundo.programaId);
      await c.page.getByRole("button", { name: "Nueva vigencia", exact: true }).click();
      await esperarDialogo(c);
      await llenar(c, "Inscripción", "600");
      await llenar(c, "Mensualidad", "1200.50");
      await fallarLaSiguienteEscritura(c, 409, "Ya hay una vigencia que empieza después de esa fecha.", [{ campo: "vigencia_desde", mensaje: "Ya hay una vigencia que empieza después de esa fecha." }]);
      await guardar(c, "Guardar la nueva vigencia");
      await esperarTexto(c, "Ya hay una vigencia que empieza después de esa fecha.");
    },
  },
  {
    id: "adminc-precios-nueva-vigencia-sin-conexion",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Diálogo «Nueva vigencia de precio» sin conexión",
    tipo: "flotante",
    ruta: "/admin/precios",
    fuentes: [PRECIOS, DIALOGO],
    ir: async (c) => {
      await irA(c, "/admin/precios");
      await c.page.getByLabel(rx("Programa")).selectOption(c.mundo.programaId);
      await c.page.getByRole("button", { name: "Nueva vigencia", exact: true }).click();
      await esperarDialogo(c);
      await llenar(c, "Inscripción", "600");
      await llenar(c, "Mensualidad", "1200.50");
      await cortarLaRed(c);
      await guardar(c, "Guardar la nueva vigencia");
      await esperarTexto(c, /No hay conexión/);
      await c.page.context().setOffline(false);
    },
  },

  // ═══ Promociones ═══
  ...estadosDeLista("adminc-promociones", "/admin/promociones", PROMOCIONES, "Promociones"),
  {
    id: "adminc-promociones-paginado",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Promociones con paginador («Página 1 de 3 · 60 en total»)",
    tipo: "estado",
    ruta: "/admin/promociones",
    fuentes: [PROMOCIONES, PAGINADOR],
    ir: async (c) => {
      await editarGet(c, enApi("/api/promociones"), (b) => ({ ...b, paginacion: { ...b.paginacion, total: 60, pagina: 1, limite: 25 } }));
      await irA(c, "/admin/promociones");
    },
  },
  {
    id: "adminc-promociones-nueva-vacio",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Diálogo «Nueva promoción» vacío (arriba del formulario)",
    tipo: "flotante",
    ruta: "/admin/promociones",
    fuentes: [PROMOCIONES, DIALOGO],
    ir: (c) => abrirNuevo(c, "/admin/promociones", "Nueva promoción"),
  },
  {
    id: "adminc-promociones-nueva-alcance-y-beneficios",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Diálogo «Nueva promoción» visto abajo: «Dónde vale» (disciplinas, sucursales, programas), «Beneficios» y los botones",
    tipo: "flotante",
    ruta: "/admin/promociones",
    fuentes: [PROMOCIONES, DIALOGO],
    ir: async (c) => {
      await abrirNuevo(c, "/admin/promociones", "Nueva promoción");
      await dlg(c).getByRole("button", { name: "Agregar este beneficio", exact: true }).scrollIntoViewIfNeeded();
      await c.page.waitForTimeout(150);
    },
  },
  {
    id: "adminc-promociones-nueva-validacion",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Diálogo «Nueva promoción» enviado vacío (nombre, código, fecha de inicio; arriba del formulario)",
    tipo: "flotante",
    ruta: "/admin/promociones",
    fuentes: [PROMOCIONES, DIALOGO],
    ir: async (c) => {
      await abrirNuevo(c, "/admin/promociones", "Nueva promoción");
      await guardar(c);
      await esperarTexto(c, "Escribe el nombre");
    },
  },
  {
    id: "adminc-promociones-nueva-validacion-beneficios",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Diálogo «Nueva promoción» enviado vacío, visto abajo («Agrega al menos un beneficio»)",
    tipo: "flotante",
    ruta: "/admin/promociones",
    fuentes: [PROMOCIONES, DIALOGO],
    ir: async (c) => {
      await abrirNuevo(c, "/admin/promociones", "Nueva promoción");
      await guardar(c);
      await esperarTexto(c, "Agrega al menos un beneficio");
      await verTexto(c, "Agrega al menos un beneficio");
    },
  },
  {
    id: "adminc-promociones-nueva-validacion-fechas-y-cupo",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Diálogo «Nueva promoción» con código inválido, fecha final antes del inicio, cupo y prioridad fuera de rango",
    tipo: "flotante",
    ruta: "/admin/promociones",
    fuentes: [PROMOCIONES, DIALOGO],
    ir: async (c) => {
      await abrirNuevo(c, "/admin/promociones", "Nueva promoción");
      await llenar(c, "Nombre de la promoción", "Promoción de muestra");
      await llenar(c, "Código", "mal código!");
      await llenar(c, "Vigente desde", "2026-11-01");
      await llenar(c, "Hasta", "2026-10-01");
      await llenar(c, "Cupo máximo", "cero");
      await llenar(c, "Prioridad", "5000");
      await guardar(c);
      await esperarTexto(c, "No puede ser antes del inicio");
    },
  },
  {
    id: "adminc-promociones-nueva-condicion-hermanos",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Diálogo «Nueva promoción» con la condición «hermanos inscritos» (aparece «Hermanos inscritos mínimos») y su error («2 a 20»)",
    tipo: "flotante",
    ruta: "/admin/promociones",
    fuentes: [PROMOCIONES, DIALOGO],
    ir: async (c) => {
      await abrirNuevo(c, "/admin/promociones", "Nueva promoción");
      await elegir(c, "Condición", "min_hermanos");
      await llenar(c, "Hermanos inscritos mínimos", "1");
      await guardar(c);
      await esperarTexto(c, /Escribe cuántos hermanos inscritos/);
      await verTexto(c, /Escribe cuántos hermanos inscritos/);
    },
  },
  {
    id: "adminc-promociones-nueva-condicion-pago-anticipado",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Diálogo «Nueva promoción» con la condición «pago anticipado» (aparece «Meses pagados por adelantado») y su error («1 a 24»)",
    tipo: "flotante",
    ruta: "/admin/promociones",
    fuentes: [PROMOCIONES, DIALOGO],
    ir: async (c) => {
      await abrirNuevo(c, "/admin/promociones", "Nueva promoción");
      await elegir(c, "Condición", "pago_anticipado");
      await llenar(c, "Meses pagados por adelantado", "40");
      await guardar(c);
      await esperarTexto(c, /Escribe cuántos meses/);
      await verTexto(c, /Escribe cuántos meses/);
    },
  },
  {
    id: "adminc-promociones-beneficio-validacion",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Captura de un beneficio sin valor («Agregar este beneficio» con el porcentaje vacío: error en el campo)",
    tipo: "flotante",
    ruta: "/admin/promociones",
    fuentes: [PROMOCIONES, DIALOGO],
    ir: async (c) => {
      await abrirNuevo(c, "/admin/promociones", "Nueva promoción");
      await dlg(c).getByRole("button", { name: "Agregar este beneficio", exact: true }).click();
      await dlg(c).getByLabel(rx("Porcentaje")).waitFor();
      await dlg(c).getByRole("button", { name: "Agregar este beneficio", exact: true }).scrollIntoViewIfNeeded();
      await c.page.waitForTimeout(150);
    },
  },
  {
    id: "adminc-promociones-beneficio-tipos",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Captura de un beneficio de producto gratis (cambian los campos: descripción con su ayuda «Qué producto se entrega»)",
    tipo: "flotante",
    ruta: "/admin/promociones",
    fuentes: [PROMOCIONES, DIALOGO],
    ir: async (c) => {
      await abrirNuevo(c, "/admin/promociones", "Nueva promoción");
      await elegir(c, "Qué da", "producto");
      await dlg(c).getByRole("button", { name: "Agregar este beneficio", exact: true }).scrollIntoViewIfNeeded();
      await c.page.waitForTimeout(150);
    },
  },
  {
    id: "adminc-promociones-nueva-con-beneficios-listos",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Diálogo «Nueva promoción» con dos beneficios ya agregados a la lista (cada uno con «Quitar»)",
    tipo: "flotante",
    ruta: "/admin/promociones",
    fuentes: [PROMOCIONES, DIALOGO],
    ir: async (c) => {
      await abrirNuevo(c, "/admin/promociones", "Nueva promoción");
      await elegir(c, "Qué da", "mens_pct");
      await llenar(c, "Porcentaje", "15");
      await dlg(c).getByRole("button", { name: "Agregar este beneficio", exact: true }).click();
      await dlg(c).getByRole("button", { name: "Quitar", exact: true }).first().waitFor();
      await elegir(c, "Qué da", "meses");
      await llenar(c, "Cuántos meses", "1");
      await dlg(c).getByRole("button", { name: "Agregar este beneficio", exact: true }).click();
      await dlg(c).getByRole("button", { name: "Quitar", exact: true }).nth(1).waitFor();
      await dlg(c).getByRole("button", { name: "Agregar este beneficio", exact: true }).scrollIntoViewIfNeeded();
      await c.page.waitForTimeout(400);
    },
  },
  {
    id: "adminc-promociones-nueva-error-servidor",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Diálogo «Nueva promoción» con el error del servidor en el campo («Ya existe una promoción con ese código»)",
    tipo: "flotante",
    ruta: "/admin/promociones",
    fuentes: [PROMOCIONES, DIALOGO, COMUNES],
    ir: async (c) => {
      await abrirNuevo(c, "/admin/promociones", "Nueva promoción");
      await llenar(c, "Nombre de la promoción", "Promoción de muestra");
      await llenar(c, "Código", "MUESTRA-1");
      await llenar(c, "Vigente desde", "2026-11-01");
      await elegir(c, "Qué da", "mens_pct");
      await llenar(c, "Porcentaje", "10");
      await dlg(c).getByRole("button", { name: "Agregar este beneficio", exact: true }).click();
      await dlg(c).getByRole("button", { name: "Quitar", exact: true }).first().waitFor();
      await fallarLaSiguienteEscritura(c, 409, "Ya existe una promoción con ese código.", [{ campo: "codigo", mensaje: "Ya existe una promoción con ese código." }]);
      await guardar(c);
      await esperarTexto(c, "Ya existe una promoción con ese código.");
    },
  },
  {
    id: "adminc-promociones-nueva-sin-conexion",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Diálogo «Nueva promoción» sin conexión",
    tipo: "flotante",
    ruta: "/admin/promociones",
    fuentes: [PROMOCIONES, DIALOGO],
    ir: async (c) => {
      await abrirNuevo(c, "/admin/promociones", "Nueva promoción");
      await llenar(c, "Nombre de la promoción", "Promoción de muestra");
      await llenar(c, "Código", "MUESTRA-1");
      await llenar(c, "Vigente desde", "2026-11-01");
      await elegir(c, "Qué da", "mens_pct");
      await llenar(c, "Porcentaje", "10");
      await dlg(c).getByRole("button", { name: "Agregar este beneficio", exact: true }).click();
      await dlg(c).getByRole("button", { name: "Quitar", exact: true }).first().waitFor();
      await cortarLaRed(c);
      await guardar(c);
      await esperarTexto(c, /No hay conexión/);
      await verTexto(c, /No hay conexión/);
      await c.page.context().setOffline(false);
    },
  },
  {
    id: "adminc-promociones-editar",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Diálogo «Editar promoción» con los datos de una promoción (cupo usado, dónde vale y sus beneficios con «Quitar»; botón «Cerrar»)",
    tipo: "flotante",
    ruta: "/admin/promociones",
    fuentes: [PROMOCIONES, DIALOGO],
    ir: (c) => abrirEditar(c, "/admin/promociones"),
  },
  {
    id: "adminc-promociones-editar-beneficios",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Diálogo «Editar promoción» visto abajo: sus beneficios ya guardados, con «Quitar», y la captura de un beneficio nuevo",
    tipo: "flotante",
    ruta: "/admin/promociones",
    fuentes: [PROMOCIONES, DIALOGO],
    ir: async (c) => {
      await abrirEditar(c, "/admin/promociones");
      await dlg(c).getByRole("button", { name: "Agregar este beneficio", exact: true }).scrollIntoViewIfNeeded();
      await c.page.waitForTimeout(150);
    },
  },
  {
    id: "adminc-promociones-editar-quitar-error-servidor",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Diálogo «Editar promoción» con el error al quitar un beneficio (el servidor lo rechaza)",
    tipo: "flotante",
    ruta: "/admin/promociones",
    fuentes: [PROMOCIONES, DIALOGO, COMUNES],
    ir: async (c) => {
      await abrirEditar(c, "/admin/promociones");
      await fallarLaSiguienteEscritura(c, 409, "No se puede quitar: el beneficio ya tiene entregas pendientes.");
      await dlg(c).getByRole("button", { name: "Quitar", exact: true }).first().click();
      await esperarTexto(c, "No se puede quitar: el beneficio ya tiene entregas pendientes.");
      await verTexto(c, "No se puede quitar: el beneficio ya tiene entregas pendientes.");
    },
  },
  {
    id: "adminc-promociones-baja-confirmar",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Confirmación «Dar de baja la promoción»",
    tipo: "flotante",
    ruta: "/admin/promociones",
    fuentes: [PROMOCIONES, COMUNES, DIALOGO],
    ir: (c) => abrirBaja(c, "/admin/promociones"),
  },
  {
    id: "adminc-promociones-baja-error-servidor",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Confirmación «Dar de baja la promoción» con el error del servidor dentro («tiene beneficios por entregar»)",
    tipo: "flotante",
    ruta: "/admin/promociones",
    fuentes: [PROMOCIONES, COMUNES, DIALOGO],
    ir: async (c) => {
      await abrirBaja(c, "/admin/promociones");
      await fallarLaSiguienteEscritura(c, 409, "No se puede dar de baja: tiene beneficios por entregar.");
      await guardar(c, "Dar de baja");
      await esperarTexto(c, "No se puede dar de baja: tiene beneficios por entregar.");
    },
  },

  // ═══ Cargar catálogo ═══
  {
    id: "adminc-catalogo-con-datos",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Cargar catálogo al abrir: paso 1 con «Descargar todas las plantillas», paso 2 sin archivos («Todavía no elegiste archivos») y «Revisar» deshabilitado",
    tipo: "pantalla",
    ruta: "/admin/catalogo",
    fuentes: [CATALOGO],
    ir: (c) => irA(c, "/admin/catalogo"),
  },
  {
    id: "adminc-catalogo-plantillas-una-por-una",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Cargar catálogo con «Descargar una por una» abierto (la lista de plantillas con su descripción)",
    tipo: "estado",
    ruta: "/admin/catalogo",
    fuentes: [CATALOGO],
    ir: async (c) => {
      await irA(c, "/admin/catalogo");
      await c.page.getByText("Descargar una por una", { exact: true }).click();
      await c.page.getByTestId("catalogo-descargas").waitFor();
      await c.page.waitForTimeout(150);
    },
  },
  {
    id: "adminc-catalogo-muchos",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Cargar catálogo con muchos datos (la lista de plantillas repetida, abierta)",
    tipo: "estado",
    ruta: "/admin/catalogo",
    fuentes: [CATALOGO],
    ir: async (c) => {
      await conMuchosDatos(c, "/admin/catalogo");
      await c.page.getByText("Descargar una por una", { exact: true }).click();
      await c.page.waitForTimeout(150);
    },
  },
  {
    id: "adminc-catalogo-vacio",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Cargar catálogo con la lista de plantillas vacía",
    tipo: "estado",
    ruta: "/admin/catalogo",
    fuentes: [CATALOGO],
    ir: (c) => conVacio(c, "/admin/catalogo"),
  },
  {
    id: "adminc-catalogo-cargando",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Cargar catálogo mientras cargan las plantillas",
    tipo: "estado",
    ruta: "/admin/catalogo",
    fuentes: [CATALOGO],
    ir: (c) => conCargando(c, "/admin/catalogo"),
  },
  {
    id: "adminc-catalogo-error",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Cargar catálogo con error al cargar las plantillas (500) y «Reintentar»",
    tipo: "estado",
    ruta: "/admin/catalogo",
    fuentes: [CATALOGO],
    ir: (c) => conError(c, "/admin/catalogo", 500),
  },
  {
    id: "adminc-catalogo-archivos-elegidos",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Cargar catálogo con los ocho archivos CSV elegidos (nombre y tamaño de cada uno, «Quitar», «Revisar» habilitado)",
    tipo: "estado",
    ruta: "/admin/catalogo",
    fuentes: [CATALOGO],
    ir: (c) => elegirArchivos(c, todasLasHojas(hojas())),
  },
  {
    id: "adminc-catalogo-archivo-de-excel",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Cargar catálogo con un archivo de Excel (.xlsx) elegido: el aviso de que se leen CSV y cómo guardarlo; «Revisar» deshabilitado",
    tipo: "estado",
    ruta: "/admin/catalogo",
    fuentes: [CATALOGO],
    ir: async (c) => {
      // Un .xlsx de mentira: la pantalla solo mira el nombre y el tamaño, no lo abre.
      await elegirArchivos(c, [{ name: "precios.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: Buffer.from("PK\u0003\u0004 archivo de ejemplo", "utf8") }]);
      await c.page.getByTestId("problema-de-archivos").waitFor();
    },
  },
  {
    id: "adminc-catalogo-demasiados-archivos",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Cargar catálogo con 13 archivos elegidos (el aviso «se aceptan hasta 12»; «Revisar» deshabilitado)",
    tipo: "estado",
    ruta: "/admin/catalogo",
    fuentes: [CATALOGO],
    ir: async (c) => {
      const muchos = Array.from({ length: 13 }, (_, i) => archivoCsv(`hoja-${i + 1}.csv`, ["Columna"], [["a"]]));
      await elegirArchivos(c, muchos);
      await c.page.getByTestId("problema-de-archivos").waitFor();
    },
  },
  {
    id: "adminc-catalogo-archivo-pesado",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Cargar catálogo con un archivo de más de 5 MB (el aviso «pesan demasiado»; el tamaño en MB)",
    tipo: "estado",
    ruta: "/admin/catalogo",
    fuentes: [CATALOGO],
    ir: async (c) => {
      const grande = Buffer.alloc(5_300_000, "a");
      await elegirArchivos(c, [{ name: "salones.csv", mimeType: "text/csv", buffer: grande }]);
      await c.page.getByTestId("problema-de-archivos").waitFor();
    },
  },
  {
    id: "adminc-catalogo-revisando",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Cargar catálogo con el botón «Revisar» ocupado (esperando al servidor)",
    tipo: "estado",
    ruta: "/admin/catalogo",
    fuentes: [CATALOGO],
    ir: async (c) => {
      await elegirArchivos(c, todasLasHojas(hojas()));
      await c.page.route(
        (u) => IMPORTACION(u),
        () => new Promise<void>(() => undefined),
      );
      await c.page.getByTestId("boton-revisar").click();
      await c.page.locator("[data-prueba='boton-revisar'][aria-busy='true'], [data-prueba='boton-revisar'] .giro").first().waitFor({ timeout: 3000 }).catch(() => undefined);
      await c.page.waitForTimeout(200);
    },
  },
  {
    id: "adminc-catalogo-errores-por-fila",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Cargar catálogo: resultado de la revisión con cinco errores, por archivo, fila y columna («No se guardó nada»; sin botón «Aplicar»)",
    tipo: "estado",
    ruta: "/admin/catalogo",
    fuentes: [CATALOGO],
    ir: async (c) => {
      await revisarHojas(c, todasLasHojas(hojasConErrores()));
      await c.page.getByTestId("resultado-errores").waitFor();
    },
  },
  {
    id: "adminc-catalogo-errores-archivo-desconocido",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Cargar catálogo: errores de un archivo que no es plantilla («no se parece a ninguna») y de otro al que le falta una columna",
    tipo: "estado",
    ruta: "/admin/catalogo",
    fuentes: [CATALOGO],
    ir: async (c) => {
      await revisarHojas(c, [archivoCsv("notas.csv", ["uno", "dos"], [["1", "2"]]), archivoCsv("salones.csv", ["Sucursal", "Capacidad"], [["X", "3"]])]);
      await c.page.getByTestId("resultado-errores").waitFor();
    },
  },
  {
    id: "adminc-catalogo-errores-muchos",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Cargar catálogo: resultado con muchos errores y «… y 40 más. Corrige estas primero.»",
    tipo: "estado",
    ruta: "/admin/catalogo",
    fuentes: [CATALOGO],
    ir: async (c) => {
      await simularAplicacion(c, (informe) => {
        const errores = Array.from({ length: 25 }, (_, i) => ({ archivo: i % 2 === 0 ? "grupos.csv" : "precios.csv", fila: i + 2, columna: i % 2 === 0 ? "Salón" : "Mensualidad", mensaje: i % 2 === 0 ? `no existe el salón “Taller ${i}”` : "no se entiende como cantidad de dinero", texto: "" }));
        return { ...informe, limpia: false, aplicado: false, sin_cambios: false, errores, errores_omitidos: 40, resumen: [], cambios: [], cambios_omitidos: 0 };
      });
      await revisarHojas(c, todasLasHojas(hojas()));
      await c.page.getByTestId("resultado-errores").waitFor();
    },
  },
  {
    id: "adminc-catalogo-revision-limpia",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Cargar catálogo: revisión limpia («Todo está en orden»), la frase, la tabla de resumen y el botón «Aplicar» (nada se guardó)",
    tipo: "estado",
    ruta: "/admin/catalogo",
    fuentes: [CATALOGO],
    ir: async (c) => {
      await revisarHojas(c, todasLasHojas(hojas()));
      await c.page.getByTestId("boton-aplicar").waitFor();
    },
  },
  {
    id: "adminc-catalogo-revision-detalle-y-avisos",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Cargar catálogo: revisión limpia con «Ver cada cambio» y «Para tomar en cuenta» abiertos (instructor sin teléfono)",
    tipo: "estado",
    ruta: "/admin/catalogo",
    fuentes: [CATALOGO],
    ir: async (c) => {
      await revisarHojas(c, [hojaCsv("instructores", hojasConAvisos().instructores)]);
      await c.page.getByText("Ver cada cambio", { exact: true }).click();
      await c.page.getByText(/Para tomar en cuenta/).click();
      await c.page.getByTestId("avisos-de-carga").waitFor();
      await c.page.waitForTimeout(150);
    },
  },
  {
    id: "adminc-catalogo-revision-con-omitidos",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Cargar catálogo: revisión limpia con muchos cambios («Ver cada cambio» abierto, «… y 120 más.»)",
    tipo: "estado",
    ruta: "/admin/catalogo",
    fuentes: [CATALOGO],
    ir: async (c) => {
      await simularAplicacion(c, (informe) => ({
        ...informe,
        cambios: Array.from({ length: 30 }, (_, i) => ({ entidad: "salon", accion: i < 20 ? "crear" : "actualizar", descripcion: i < 20 ? `Salón nuevo: “Taller ${i + 1}” de “Sede Muestra Uno”` : `Salón “Taller ${i + 1}” de “Sede Muestra Uno”: capacidad 10 → 12` })),
        cambios_omitidos: 120,
      }));
      await revisarHojas(c, todasLasHojas(hojas()));
      await c.page.getByText("Ver cada cambio", { exact: true }).click();
      await c.page.getByTestId("detalle-de-cambios").waitFor();
      await c.page.waitForTimeout(150);
    },
  },
  {
    id: "adminc-catalogo-sin-cambios",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Cargar catálogo: «Sin cambios» (todo lo subido ya está en el sistema; sin botón «Aplicar»)",
    tipo: "estado",
    ruta: "/admin/catalogo",
    fuentes: [CATALOGO],
    ir: async (c) => {
      await simularAplicacion(c, (informe) => ({
        ...informe,
        sin_cambios: true,
        limpia: true,
        errores: [],
        avisos: [],
        cambios: [],
        resumen: (informe.resumen as { creados: number; actualizados: number; sin_cambios: number }[]).map((r) => ({ ...r, sin_cambios: r.sin_cambios + r.creados + r.actualizados, creados: 0, actualizados: 0 })),
      }));
      await revisarHojas(c, todasLasHojas(hojas()));
      await c.page.getByText("Sin cambios", { exact: true }).first().waitFor();
    },
  },
  {
    id: "adminc-catalogo-revisar-error-servidor",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Cargar catálogo con error del servidor al revisar (500) debajo del botón «Revisar»",
    tipo: "estado",
    ruta: "/admin/catalogo",
    fuentes: [CATALOGO, COMUNES],
    ir: async (c) => {
      await elegirArchivos(c, todasLasHojas(hojas()));
      await fallarLaSiguienteEscritura(c, 500, "Algo salió mal en el servidor. Inténtalo de nuevo.");
      await c.page.getByTestId("boton-revisar").click();
      await c.page.getByText("Algo salió mal en el servidor").first().waitFor();
      await esperarListo(c.page);
    },
  },
  {
    id: "adminc-catalogo-revisar-sin-conexion",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Cargar catálogo sin conexión al revisar («No hay conexión con el servidor…»)",
    tipo: "estado",
    ruta: "/admin/catalogo",
    fuentes: [CATALOGO],
    ir: async (c) => {
      await elegirArchivos(c, todasLasHojas(hojas()));
      await cortarLaRed(c);
      await c.page.getByTestId("boton-revisar").click();
      await c.page.getByText(/No hay conexión/).first().waitFor();
      await c.page.context().setOffline(false);
      await esperarListo(c.page);
    },
  },
  {
    id: "adminc-catalogo-confirmar",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Diálogo «¿Cargar estos cambios?» (la frase de lo que se crea, la nota de precios e inscripciones; «Sí, aplicar» no peligroso y «Cancelar»)",
    tipo: "flotante",
    ruta: "/admin/catalogo",
    fuentes: [CATALOGO, COMUNES, DIALOGO],
    ir: abrirConfirmacionDeCarga,
  },
  {
    id: "adminc-catalogo-confirmar-error-servidor",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Diálogo «¿Cargar estos cambios?» con el error del servidor dentro (no se cargó nada)",
    tipo: "flotante",
    ruta: "/admin/catalogo",
    fuentes: [CATALOGO, COMUNES, DIALOGO],
    ir: async (c) => {
      await abrirConfirmacionDeCarga(c);
      await fallarLaSiguienteEscritura(c, 409, "Cambió el catálogo mientras revisabas. Vuelve a revisar los archivos.");
      await guardar(c, "Sí, aplicar");
      await esperarTexto(c, "Cambió el catálogo mientras revisabas. Vuelve a revisar los archivos.");
    },
  },
  {
    id: "adminc-catalogo-confirmar-sin-conexion",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Diálogo «¿Cargar estos cambios?» sin conexión",
    tipo: "flotante",
    ruta: "/admin/catalogo",
    fuentes: [CATALOGO, COMUNES, DIALOGO],
    ir: async (c) => {
      await abrirConfirmacionDeCarga(c);
      await cortarLaRed(c);
      await guardar(c, "Sí, aplicar");
      await esperarTexto(c, /No hay conexión/);
      await c.page.context().setOffline(false);
    },
  },

  // ═══ Variedad de datos (respuestas GET armadas; no se escribe nada) ═══
  {
    id: "adminc-verticales-variedad",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Disciplinas variadas: completa (con color, avance, evento y «Cotiza por WhatsApp»), inactiva (botón «Activar») y con avance sin cotizador",
    tipo: "estado",
    ruta: "/admin/verticales",
    fuentes: [VERTICALES],
    ir: async (c) => {
      await verticalesFalsas(c);
      await irA(c, "/admin/verticales");
    },
  },
  {
    id: "adminc-verticales-editar-completa",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Diálogo «Editar disciplina» con todos los campos llenos (progresión, avance, evento, color, logotipo, cotizador y clase muestra marcados)",
    tipo: "flotante",
    ruta: "/admin/verticales",
    fuentes: [VERTICALES, DIALOGO],
    ir: async (c) => {
      await verticalesFalsas(c);
      await abrirEditar(c, "/admin/verticales");
    },
  },
  {
    id: "adminc-sucursales-variedad",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Sucursales variadas: con dirección y disciplina, inactiva sin disciplinas, y con una zona horaria que no está en la lista («Otra zona horaria»)",
    tipo: "estado",
    ruta: "/admin/sucursales",
    fuentes: [SUCURSALES],
    ir: async (c) => {
      await sucursalesFalsas(c);
      await irA(c, "/admin/sucursales");
    },
  },
  {
    id: "adminc-sucursales-editar-otra-zona",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Diálogo «Editar sucursal» con una zona horaria que no está en la lista (se agrega como «Otra zona horaria (…)» para no perderla)",
    tipo: "flotante",
    ruta: "/admin/sucursales",
    fuentes: [SUCURSALES, DIALOGO],
    ir: async (c) => {
      await sucursalesFalsas(c);
      await abrirEditar(c, "/admin/sucursales", 2);
    },
  },
  {
    id: "adminc-programas-variedad",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Programas variados: con fecha de corte, «Alternativa» (traslape) e inactivo",
    tipo: "estado",
    ruta: "/admin/programas",
    fuentes: [PROGRAMAS],
    ir: async (c) => {
      await programasFalsos(c);
      await irA(c, "/admin/programas");
    },
  },
  {
    id: "adminc-programas-editar-completo",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Diálogo «Editar programa» con fecha de corte, nivel, descripción y traslape marcados, visto abajo",
    tipo: "flotante",
    ruta: "/admin/programas",
    fuentes: [PROGRAMAS, DIALOGO],
    ir: async (c) => {
      await programasFalsos(c);
      await abrirEditar(c, "/admin/programas", 1);
      await dlg(c).getByRole("button", { name: "Guardar", exact: true }).scrollIntoViewIfNeeded();
      await dlg(c).getByLabel(rx("Permite traslape")).scrollIntoViewIfNeeded();
      await c.page.waitForTimeout(150);
    },
  },
  {
    id: "adminc-grupos-variedad",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Grupos variados: completo (salón, instructor, lista de espera, dos horarios), inactivo y sin horario ni salón",
    tipo: "estado",
    ruta: "/admin/grupos",
    fuentes: [GRUPOS],
    ir: async (c) => {
      await gruposFalsos(c);
      await irA(c, "/admin/grupos");
    },
  },
  {
    id: "adminc-grupos-editar-completo",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Diálogo «Editar grupo» con salón, instructor, lista de espera y dos horarios (cada uno con «Quitar este horario»), visto abajo",
    tipo: "flotante",
    ruta: "/admin/grupos",
    fuentes: [GRUPOS, DIALOGO],
    ir: async (c) => {
      await salonesFalsos(c);
      await gruposFalsos(c);
      await abrirEditar(c, "/admin/grupos");
      await dlg(c).getByRole("button", { name: "Agregar un horario", exact: true }).scrollIntoViewIfNeeded();
      await c.page.waitForTimeout(150);
    },
  },
  {
    id: "adminc-instructores-con-salones",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Instructores y salones con salones (uno activo con capacidad y otro inactivo sin capacidad registrada)",
    tipo: "estado",
    ruta: "/admin/instructores",
    fuentes: [INSTRUCTORES],
    ir: async (c) => {
      await salonesFalsos(c);
      await irA(c, "/admin/instructores");
    },
  },
  {
    id: "adminc-promociones-variedad",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Promociones variadas: activas, con prioridad, acumulable, cupo usado, vigencia con y sin fin y varios beneficios",
    tipo: "estado",
    ruta: "/admin/promociones",
    fuentes: [PROMOCIONES],
    ir: async (c) => {
      await promocionesFalsas(c);
      await irA(c, "/admin/promociones");
    },
  },
  {
    id: "adminc-promociones-editar-completa",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Diálogo «Editar promoción» con condición de hermanos, cupo usado, fecha de fin y prioridad (arriba del formulario)",
    tipo: "flotante",
    ruta: "/admin/promociones",
    fuentes: [PROMOCIONES, DIALOGO],
    ir: async (c) => {
      await promocionesFalsas(c);
      await abrirEditar(c, "/admin/promociones");
    },
  },
  {
    id: "adminc-promociones-editar-completa-alcance",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Diálogo «Editar promoción» visto abajo: «Dónde vale» con disciplina, sucursal y programa marcados, y dos beneficios con «Quitar»",
    tipo: "flotante",
    ruta: "/admin/promociones",
    fuentes: [PROMOCIONES, DIALOGO],
    ir: async (c) => {
      await promocionesFalsas(c);
      await abrirEditar(c, "/admin/promociones");
      await dlg(c).getByText("Dónde vale", { exact: true }).scrollIntoViewIfNeeded();
      await c.page.waitForTimeout(150);
    },
  },
  {
    id: "adminc-verticales-nueva-validacion-abajo",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Diálogo «Nueva disciplina» con errores de validación, visto abajo (color mal escrito y clase muestra sin cotizador)",
    tipo: "flotante",
    ruta: "/admin/verticales",
    fuentes: [VERTICALES, DIALOGO],
    ir: async (c) => {
      await abrirNuevo(c, "/admin/verticales", "Nueva disciplina");
      await marcar(c, "Lleva progresión");
      await llenar(c, "Color de marca", "azulito");
      await marcar(c, "El bot agenda la clase muestra");
      await guardar(c);
      await esperarTexto(c, "Necesita el cotizador por WhatsApp encendido");
      await verTexto(c, "Necesita el cotizador por WhatsApp encendido");
    },
  },

  // ═══ El aviso «ya quedó» (al final; todo se simula, no se escribe nada en la base) ═══
  {
    id: "adminc-verticales-aviso-guardada",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Aviso «ya quedó» sobre Disciplinas: «La disciplina … se guardó.» (guardando sin cambios; la escritura se simula)",
    tipo: "flotante",
    ruta: "/admin/verticales",
    fuentes: [VERTICALES, AVISOS],
    completa: false,
    ir: async (c) => {
      await abrirEditar(c, "/admin/verticales");
      await simularEscritura(c);
      await guardar(c);
      await esperarAviso(c);
    },
  },
  {
    id: "adminc-verticales-aviso-desactivada",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Aviso «ya quedó» sobre Disciplinas: «… quedó desactivada: deja de recibir captación nueva…» (la escritura se simula)",
    tipo: "flotante",
    ruta: "/admin/verticales",
    fuentes: [VERTICALES, AVISOS],
    completa: false,
    ir: async (c) => {
      await editarGet(c, enApi("/api/verticales"), (b) => ({ ...b, datos: (b.datos as Json[]).map((v) => ({ ...v, activo: true })) }));
      await irA(c, "/admin/verticales");
      await simularEscritura(c);
      await c.page.getByRole("button", { name: "Desactivar", exact: true }).first().click();
      await esperarAviso(c);
    },
  },
  {
    id: "adminc-verticales-aviso-activada",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Aviso «ya quedó» sobre Disciplinas: «… quedó activa otra vez.» (una disciplina inactiva con el botón «Activar»; la escritura se simula)",
    tipo: "flotante",
    ruta: "/admin/verticales",
    fuentes: [VERTICALES, AVISOS],
    completa: false,
    ir: async (c) => {
      await editarGet(c, enApi("/api/verticales"), (b) => ({ ...b, datos: (b.datos as Json[]).map((v) => ({ ...v, activo: false })) }));
      await irA(c, "/admin/verticales");
      await simularEscritura(c);
      await c.page.getByRole("button", { name: "Activar", exact: true }).first().click();
      await esperarAviso(c);
    },
  },
  {
    id: "adminc-verticales-aviso-baja",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Aviso «ya quedó» sobre Disciplinas: «La disciplina … se dio de baja.» (la escritura se simula)",
    tipo: "flotante",
    ruta: "/admin/verticales",
    fuentes: [VERTICALES, AVISOS],
    completa: false,
    ir: async (c) => {
      await abrirBaja(c, "/admin/verticales");
      await simularEscritura(c);
      await guardar(c, "Dar de baja");
      await esperarAviso(c);
    },
  },
  {
    id: "adminc-sucursales-aviso-guardada",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Aviso «ya quedó» sobre Sucursales: «La sucursal … se guardó.» (la escritura se simula)",
    tipo: "flotante",
    ruta: "/admin/sucursales",
    fuentes: [SUCURSALES, AVISOS],
    completa: false,
    ir: async (c) => {
      await abrirEditar(c, "/admin/sucursales");
      await simularEscritura(c);
      await guardar(c);
      await esperarAviso(c);
    },
  },
  {
    id: "adminc-sucursales-aviso-ofrece",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Aviso «ya quedó» sobre Sucursales: «… ahora imparte / ya no imparte …» al marcar una disciplina (la escritura se simula)",
    tipo: "flotante",
    ruta: "/admin/sucursales",
    fuentes: [SUCURSALES, AVISOS],
    completa: false,
    ir: async (c) => {
      await irA(c, "/admin/sucursales");
      await simularEscritura(c);
      await c.page.getByTestId(/^ofrece-/).first().getByRole("checkbox").first().click();
      await esperarAviso(c);
    },
  },
  {
    id: "adminc-sucursales-aviso-baja",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Aviso «ya quedó» sobre Sucursales: «La sucursal … se dio de baja.» (la escritura se simula)",
    tipo: "flotante",
    ruta: "/admin/sucursales",
    fuentes: [SUCURSALES, AVISOS],
    completa: false,
    ir: async (c) => {
      await abrirBaja(c, "/admin/sucursales");
      await simularEscritura(c);
      await guardar(c, "Dar de baja");
      await esperarAviso(c);
    },
  },
  {
    id: "adminc-programas-aviso-guardado",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Aviso «ya quedó» sobre Programas: «El programa … se guardó.» (la escritura se simula)",
    tipo: "flotante",
    ruta: "/admin/programas",
    fuentes: [PROGRAMAS, AVISOS],
    completa: false,
    ir: async (c) => {
      await abrirEditar(c, "/admin/programas");
      await simularEscritura(c);
      await guardar(c);
      await esperarAviso(c);
    },
  },
  {
    id: "adminc-programas-aviso-baja",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Aviso «ya quedó» sobre Programas: «El programa … se dio de baja.» (la escritura se simula)",
    tipo: "flotante",
    ruta: "/admin/programas",
    fuentes: [PROGRAMAS, AVISOS],
    completa: false,
    ir: async (c) => {
      await abrirBaja(c, "/admin/programas");
      await simularEscritura(c);
      await guardar(c, "Dar de baja");
      await esperarAviso(c);
    },
  },
  {
    id: "adminc-grupos-aviso-guardado",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Aviso «ya quedó» sobre Grupos y horarios: «El grupo … se guardó.» (la escritura se simula)",
    tipo: "flotante",
    ruta: "/admin/grupos",
    fuentes: [GRUPOS, AVISOS],
    completa: false,
    ir: async (c) => {
      await abrirEditar(c, "/admin/grupos");
      await simularEscritura(c);
      await guardar(c);
      await esperarAviso(c);
    },
  },
  {
    id: "adminc-grupos-aviso-baja",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Aviso «ya quedó» sobre Grupos y horarios: «El grupo … se dio de baja.» (la escritura se simula)",
    tipo: "flotante",
    ruta: "/admin/grupos",
    fuentes: [GRUPOS, AVISOS],
    completa: false,
    ir: async (c) => {
      await abrirBaja(c, "/admin/grupos");
      await simularEscritura(c);
      await guardar(c, "Dar de baja");
      await esperarAviso(c);
    },
  },
  {
    id: "adminc-instructores-aviso-guardado",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Aviso «ya quedó» sobre Instructores y salones: «… se guardó como instructor.» (la escritura se simula)",
    tipo: "flotante",
    ruta: "/admin/instructores",
    fuentes: [INSTRUCTORES, AVISOS],
    completa: false,
    ir: async (c) => {
      await abrirEditar(c, "/admin/instructores");
      await simularEscritura(c);
      await guardar(c);
      await esperarAviso(c);
    },
  },
  {
    id: "adminc-instructores-aviso-baja",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Aviso «ya quedó» sobre Instructores y salones: «… se dio de baja como instructor.» (la escritura se simula)",
    tipo: "flotante",
    ruta: "/admin/instructores",
    fuentes: [INSTRUCTORES, AVISOS],
    completa: false,
    ir: async (c) => {
      await abrirBaja(c, "/admin/instructores");
      await simularEscritura(c);
      await guardar(c, "Dar de baja");
      await esperarAviso(c);
    },
  },
  {
    id: "adminc-salones-aviso-guardado",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Aviso «ya quedó» sobre Instructores y salones: «El salón … se guardó.» (la escritura se simula)",
    tipo: "flotante",
    ruta: "/admin/instructores",
    fuentes: [INSTRUCTORES, AVISOS],
    completa: false,
    ir: async (c) => {
      await salonesFalsos(c);
      await irA(c, "/admin/instructores");
      await c.page.getByTestId("lista-de-salones").getByRole("button", { name: "Editar", exact: true }).first().click();
      await esperarDialogo(c);
      await simularEscritura(c);
      await guardar(c);
      await esperarAviso(c);
    },
  },
  {
    id: "adminc-salones-aviso-baja",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Aviso «ya quedó» sobre Instructores y salones: «El salón … se dio de baja.» (la escritura se simula)",
    tipo: "flotante",
    ruta: "/admin/instructores",
    fuentes: [INSTRUCTORES, AVISOS],
    completa: false,
    ir: async (c) => {
      await salonesFalsos(c);
      await irA(c, "/admin/instructores");
      await c.page.getByTestId("lista-de-salones").getByRole("button", { name: "Dar de baja", exact: true }).first().click();
      await esperarDialogo(c);
      await simularEscritura(c);
      await guardar(c, "Dar de baja");
      await esperarAviso(c);
    },
  },
  {
    id: "adminc-precios-aviso-nueva-vigencia",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Aviso «ya quedó» sobre Precios: «El nuevo precio de … rige desde hoy: inscripción … y mensualidad … Lo ya inscrito conserva el precio…» (la escritura se simula)",
    tipo: "flotante",
    ruta: "/admin/precios",
    fuentes: [PRECIOS, AVISOS],
    completa: false,
    ir: async (c) => {
      await irA(c, "/admin/precios");
      await c.page.getByLabel(rx("Programa")).selectOption(c.mundo.programaId);
      await c.page.getByRole("button", { name: "Nueva vigencia", exact: true }).click();
      await esperarDialogo(c);
      await llenar(c, "Inscripción", "500");
      await llenar(c, "Mensualidad", "1000");
      await simularEscritura(c);
      await guardar(c, "Guardar la nueva vigencia");
      await esperarAviso(c);
    },
  },
  {
    id: "adminc-promociones-aviso-guardada",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Aviso «ya quedó» sobre Promociones: «La promoción … se guardó.» (la escritura se simula)",
    tipo: "flotante",
    ruta: "/admin/promociones",
    fuentes: [PROMOCIONES, AVISOS],
    completa: false,
    ir: async (c) => {
      await abrirEditar(c, "/admin/promociones");
      await simularEscritura(c);
      await guardar(c);
      await esperarAviso(c);
    },
  },
  {
    id: "adminc-promociones-aviso-beneficio",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Aviso «ya quedó» sobre Promociones: «Beneficio agregado. Se guarda con la promoción.» (al agregar un beneficio a una promoción nueva)",
    tipo: "flotante",
    ruta: "/admin/promociones",
    fuentes: [PROMOCIONES, AVISOS],
    completa: false,
    ir: async (c) => {
      await abrirNuevo(c, "/admin/promociones", "Nueva promoción");
      await elegir(c, "Qué da", "mens_pct");
      await llenar(c, "Porcentaje", "10");
      await dlg(c).getByRole("button", { name: "Agregar este beneficio", exact: true }).click();
      await esperarAviso(c);
    },
  },
  {
    id: "adminc-promociones-aviso-baja",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Aviso «ya quedó» sobre Promociones: «La promoción … se dio de baja.» (la escritura se simula)",
    tipo: "flotante",
    ruta: "/admin/promociones",
    fuentes: [PROMOCIONES, AVISOS],
    completa: false,
    ir: async (c) => {
      await abrirBaja(c, "/admin/promociones");
      await simularEscritura(c);
      await guardar(c, "Dar de baja");
      await esperarAviso(c);
    },
  },
  {
    id: "adminc-catalogo-aplicado",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Cargar catálogo ya aplicado: «Listo: el catálogo se cargó» con su frase en pasado y el resumen (la aplicación se simula; la base no cambia)",
    tipo: "estado",
    ruta: "/admin/catalogo",
    fuentes: [CATALOGO, COMUNES],
    ir: async (c) => {
      await revisarHojas(c, todasLasHojas(hojas()));
      await simularAplicacion(c, (informe) => ({ ...informe, modo: "aplicar", aplicado: true }));
      await c.page.getByTestId("boton-aplicar").click();
      await esperarDialogo(c);
      await guardar(c, "Sí, aplicar");
      await c.page.getByText("Listo: el catálogo se cargó").waitFor();
      await esperarListo(c.page);
    },
  },
];
