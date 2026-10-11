// Escenas del área Tableros (`/tableros`): una sola página narrativa (héroe oscuro, pestañas fijas y ocho secciones numeradas). Prefijo de ids: `tabl-`.
//
// Ninguna escena escribe en la base. Los estados que el mundo de datos no trae (vacío, muchos datos, gastos capturados, un mes sin historia, doce meses de historia…) se arman parchando la
// respuesta real de la API desde el navegador, y las escrituras del diálogo de gastos (capturar, dar de baja) se SIMULAN con una lista de gastos que vive solo en la página de la escena:
// así lo que se ve no depende de lo que otra escena haya hecho, ni cambia el costo que ven las demás.
//
// Dos bloques: `// === R3b-A ===` (héroe, pestañas y secciones 01 a 04, con el costo por campaña y su diálogo de gastos) y `// === R3b-B ===` (secciones 05 a 08).

import type { Route } from "@playwright/test";
import { conCargando, conError, cortarLaRed, esperarListo, fallarLaSiguienteEscritura, irA, type Contexto, type Escena, type RolEscena } from "./escenas.ts";
import { conCartera, conCohortes, conComparativo, conIngreso, conMapa, CARTERA_EN_CERO, GRAFICAS_B, LEYENDA_CALOR, multiplicarGrupos, parchearGet as parchearGetB, seccionB, SECCION_COMPARATIVO, SECCION_INGRESO, SECCION_MAPA, SECCION_RETENCION, soloSeccion } from "./ayudas-tableros-b.ts";

const GRUPO = "Tableros";
const CARPETA = "web/src/pantallas/tableros";
const TABLEROS = `${CARPETA}/Tableros.tsx`;
const HEROE = `${CARPETA}/Heroe.tsx`;
const NAVEGACION = `${CARPETA}/NavegacionDeSecciones.tsx`;
const FILTROS = `${CARPETA}/FiltrosDelTablero.tsx`;
const EMBUDO = `${CARPETA}/SeccionEmbudo.tsx`;
const FUENTES = `${CARPETA}/SeccionFuentes.tsx`;
const CLASES = `${CARPETA}/SeccionClases.tsx`;
const ALTAS = `${CARPETA}/SeccionAltasYBajas.tsx`;
const COSTO = `${CARPETA}/CostoPorCampana.tsx`;
const CARGA = `${CARPETA}/CargaDeSeccion.tsx`;
const BARRAS = `${CARPETA}/Barras.tsx`;
const NUMERADA = `${CARPETA}/SeccionNumerada.tsx`;
const DIALOGO = "web/src/ui/Dialogo.tsx";
const AVISOS = "web/src/ui/avisos.tsx";
const BASICOS = "web/src/ui/basicos.tsx";

const RUTA = "/tableros";

// ─── Ayudas propias ──────────────────────────────────────────────────────────────────────────

type Json = any;
const esApi = (u: URL): boolean => u.pathname.startsWith("/api/");
const esReporte = (parte: string) => (u: URL): boolean => u.pathname === `/api/reportes/${parte}`;
const esGastos = (u: URL): boolean => /^\/api\/campanas\/[^/]+\/gastos(\/[^/]+)?$/.test(u.pathname);

/** `AAAA-MM-DD` de hace `dias` días (hora de la zona de las sucursales de prueba). */
function fechaMx(dias: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(Date.now() - dias * 86_400_000));
}

/** Los 12 meses que terminan en el mes en curso, `AAAA-MM`. */
function docePasado(): string[] {
  const [a, m] = fechaMx(0).split("-").map(Number) as [number, number];
  return Array.from({ length: 12 }, (_, i) => {
    const idx = a * 12 + (m - 1) - (11 - i);
    return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`;
  });
}

/** Parcha la respuesta (JSON) de las peticiones GET que cumplan `coincide`. */
async function parchearGet(c: Contexto, coincide: (u: URL) => boolean, parche: (cuerpo: Json) => Json): Promise<void> {
  await c.page.route(
    (u) => esApi(u) && coincide(u),
    async (r: Route) => {
      if (r.request().method() !== "GET") return r.fallback();
      const resp = await r.fetch();
      if (!resp.ok()) return r.fulfill({ response: resp });
      const cuerpo = (await resp.json()) as Json;
      return r.fulfill({ response: resp, body: JSON.stringify(parche(cuerpo)) });
    },
  );
}

/** Repite cada lista `veces` veces; todo `id` y `clave` de las copias lleva un sufijo para que las llaves de React sean únicas. */
function multiplicar(valor: Json, veces: number, copia = 0): Json {
  if (Array.isArray(valor)) {
    if (valor.length === 0) return valor;
    const salida: Json[] = [];
    for (let i = 0; i < veces; i++) for (const x of valor) salida.push(multiplicar(x, veces, i));
    return salida;
  }
  if (valor && typeof valor === "object") {
    const salida: Record<string, Json> = {};
    for (const [k, v] of Object.entries(valor as Record<string, Json>)) {
      if (copia > 0 && (k === "id" || k === "clave") && typeof v === "string") salida[k] = `${v}-copia-${copia}`;
      else salida[k] = multiplicar(v, veces, copia);
    }
    return salida;
  }
  return valor;
}

const tablero = (c: Contexto, id: string) => c.page.getByTestId(id);
const seccion = (c: Contexto, id: string) => c.page.locator(`[data-seccion="${id}"]`);

/**
 * Deja a la vista UNA sección tal como la ve la persona: la ventana se alarga hasta el alto de la sección (más las pestañas fijas) y la sección queda arriba, bajo las pestañas.
 * Se captura la ventana, no la página entera.
 */
async function verSeccion(c: Contexto, id: string): Promise<void> {
  const sec = seccion(c, id);
  await sec.waitFor();
  const ancho = c.page.viewportSize()?.width ?? 1366;
  const alto = await sec.evaluate((el) => Math.ceil(el.getBoundingClientRect().height));
  await c.page.setViewportSize({ width: ancho, height: Math.min(Math.max(alto + 140, 600), 4000) });
  await sec.evaluate((el) => el.scrollIntoView({ block: "start" }));
  await c.page.waitForTimeout(300);
}

/** Va a la página, espera a que cargue y deja a la vista la sección `id`. */
async function irASeccion(c: Contexto, id: string, antes?: () => Promise<void>): Promise<void> {
  if (antes) await antes();
  await irA(c, RUTA);
  await verSeccion(c, id);
}

/** Como `irASeccion`, pero con las respuestas parchadas antes de cargar la página. */
async function conParche(c: Contexto, id: string, parte: string, parche: (cuerpo: Json) => Json): Promise<void> {
  await irASeccion(c, id, () => parchearGet(c, esReporte(parte), parche));
}

/** La pantalla carga con red; después se corta, se pide otra cosa (`pedir`) y se espera el error de carga «No hay conexión…». */
async function sinConexion(c: Contexto, pedir: () => Promise<void>): Promise<void> {
  await irA(c, RUTA);
  await cortarLaRed(c);
  await pedir();
  await c.page.getByText(/No hay conexión/).first().waitFor();
  await c.page.context().setOffline(false);
  await esperarListo(c.page);
}

// ─── Datos de ejemplo para ver las gráficas con doce meses de historia ───────────────────────

const ALTAS_12 = [24, 19, 11, 38, 26, 21, 16, 14, 12, 8, 22, 41];
const BAJAS_12 = [9, 11, 18, 10, 9, 12, 14, 13, 19, 26, 18, 17];
const ACTIVOS_12 = [251, 259, 252, 280, 297, 306, 308, 309, 302, 284, 288, 312];
const INGRESO_12 = [177500, 183100, 178200, 198000, 210000, 216400, 217800, 218500, 213500, 200800, 203600, 220700];

/** La evolución con doce meses de historia (las cohortes que trae la API real se dejan como están). */
const evolucionRica = (cuerpo: Json): Json => ({
  ...cuerpo,
  meses: docePasado().map((mes, i) => ({ mes, altas: ALTAS_12[i], bajas: BAJAS_12[i], activos: ACTIVOS_12[i], inscripciones_activas: ACTIVOS_12[i]! + 18, ingreso_mensual_recurrente: `${INGRESO_12[i]}.00` })),
});

/** Una evolución de la escuela sin nadie: doce meses en ceros. */
const evolucionVacia = (cuerpo: Json): Json => ({
  ...cuerpo,
  meses: docePasado().map((mes) => ({ mes, altas: 0, bajas: 0, activos: 0, inscripciones_activas: 0, ingreso_mensual_recurrente: "0.00" })),
  cohortes: [],
  promedio: [],
});

const decimas = (a: number, b: number): string => (b === 0 ? "0.0" : (Math.round((a * 1000) / b) / 10).toFixed(1));

/** El embudo con la forma del ejemplo: 236 leads que se van quedando en el camino (las etapas y sus nombres son los de la escuela de prueba). */
const embudoRico = (cuerpo: Json): Json => {
  const base = [236, 189, 104, 79, 56, 41, 38, 36];
  const etapas = (cuerpo.etapas as Json[]).map((e, i) => ({ ...e, alcanzaron: Math.max(1, base[i] ?? 36 - (i - 7)) }));
  let mayor = -1;
  let caidaMayor = 0;
  const conCaida = etapas.map((e, i) => {
    const previa = i > 0 ? etapas[i - 1].alcanzaron : e.alcanzaron;
    const caida = i > 0 ? previa - e.alcanzaron : 0;
    if (caida > caidaMayor) {
      caidaMayor = caida;
      mayor = i;
    }
    return { ...e, caida, caida_porcentaje: i > 0 ? decimas(caida, previa) : null, porcentaje: decimas(e.alcanzaron, 236) };
  });
  const ultima = conCaida[conCaida.length - 1]?.alcanzaron ?? 0;
  return {
    ...cuerpo,
    llegaron: 236,
    etapas: conCaida.map((e, i) => ({ ...e, es_mayor_caida: i === mayor })),
    inscritos: ultima,
    conversion: decimas(ultima, 236),
    perdidos: { total: 128, por_motivo: [["No contestó", 41], ["Horario", 29], ["Precio", 24], ["Distancia", 14], ["Eligió otra escuela", 11], ["Sin motivo", 9]].map(([nombre, leads], i) => ({ motivo: i === 5 ? null : { id: `motivo-ejemplo-${i}`, nombre }, leads })) },
  };
};

/** Un embudo en el que nadie llegó en el rango. */
const embudoSinLeads = (cuerpo: Json): Json => ({
  ...cuerpo,
  llegaron: 0,
  etapas: (cuerpo.etapas as Json[]).map((e) => ({ ...e, alcanzaron: 0, porcentaje: null, caida: 0, caida_porcentaje: null, es_mayor_caida: false })),
  inscritos: 0,
  conversion: null,
  perdidos: { total: 0, por_motivo: [] },
});

/** Las fuentes del ejemplo: siete filas, con gasto solo si quien pregunta puede verlo (administrador). */
const fuentesRicas = (cuerpo: Json): Json => {
  const conGasto: boolean = cuerpo.incluye_gasto;
  const filas = (
    [
      ["facebook", "Regreso a clases", 72, 12, 6840],
      ["instagram", "Temporada", 48, 7, 5180],
      ["tiktok", "Sin pareja", 39, 6, 2460],
      ["google", "Búsqueda local", 22, 3, 2850],
      ["referido", null, 26, 8, 0],
      ["presencial", "Cartel en recepción", 17, 4, 0],
      ["landing", null, 12, 1, 0],
    ] as [string, string | null, number, number, number][]
  ).map(([fuente, campana, leads, inscritos, gasto]) => ({
    clave: campana ? `campana-${fuente}` : `fuente-${fuente}`,
    fuente,
    campana: campana ? { id: `campana-ejemplo-${fuente}`, nombre: campana } : null,
    leads,
    inscritos,
    conversion: decimas(inscritos, leads),
    gasto: conGasto ? `${gasto}.00` : null,
    costo_por_alumno: conGasto && gasto > 0 ? `${(Math.round((gasto * 100) / inscritos) / 100).toFixed(2)}` : null,
    es_mas_barato: false,
  }));
  const masBarato = filas.filter((f) => f.costo_por_alumno !== null).sort((a, b) => Number(a.costo_por_alumno) - Number(b.costo_por_alumno))[0];
  if (masBarato) masBarato.es_mas_barato = true;
  const inscritos = filas.reduce((a, f) => a + f.inscritos, 0);
  const leads = filas.reduce((a, f) => a + f.leads, 0);
  const pagados = filas.filter((f) => f.gasto !== null && Number(f.gasto) > 0);
  const gastoTotal = pagados.reduce((a, f) => a + Number(f.gasto), 0);
  const inscritosPagados = pagados.reduce((a, f) => a + f.inscritos, 0);
  return {
    ...cuerpo,
    filas,
    total: {
      leads,
      inscritos,
      conversion: decimas(inscritos, leads),
      gasto: conGasto ? `${gastoTotal}.00` : null,
      inscritos_con_gasto: conGasto ? inscritosPagados : null,
      inscritos_sin_costo: conGasto ? inscritos - inscritosPagados : null,
      costo_por_alumno: conGasto && inscritosPagados > 0 ? (Math.round((gastoTotal * 100) / inscritosPagados) / 100).toFixed(2) : null,
    },
  };
};

const fuentesVacias = (cuerpo: Json): Json => ({ ...cuerpo, filas: [], total: { ...cuerpo.total, leads: 0, inscritos: 0, conversion: null, gasto: cuerpo.incluye_gasto ? "0.00" : null, inscritos_con_gasto: cuerpo.incluye_gasto ? 0 : null, inscritos_sin_costo: cuerpo.incluye_gasto ? 0 : null, costo_por_alumno: null } });

const CLASES_EN_CERO = { agendadas: 0, asistidas: 0, no_asistidas: 0, canceladas: 0, pendientes: 0, inscritas: 0, inscritas_a_mano: 0, conversion: null };

const clasesVacio = (r: Json): Json => ({ ...r, total: { ...r.total, ...CLASES_EN_CERO }, por_fuente: [], por_vertical: [], por_sucursal: [] });

/** Tres disciplinas con su color: la real y dos de ejemplo (el color es el DATO `color_marca`; aquí se le pone a la de prueba y se agregan dos). */
const COLORES_DE_EJEMPLO = ["#c8502a", "#c4437a", "#1f8a86"];
async function conDisciplinasConColor(c: Contexto): Promise<void> {
  await parchearGet(c, (u) => u.pathname === "/api/verticales", (r) => {
    const base = (r.datos as Json[])[0];
    const extra = [1, 2].map((i) => ({ ...base, id: `vertical-ejemplo-${i}`, nombre: `Disciplina de ejemplo ${i + 1}`, slug: `disciplina-ejemplo-${i + 1}`, color_marca: COLORES_DE_EJEMPLO[i] }));
    return { ...r, datos: [{ ...base, color_marca: COLORES_DE_EJEMPLO[0] }, ...extra, ...(r.datos as Json[]).slice(1)] };
  });
}

/** Clases muestra de las tres disciplinas de ejemplo (la primera es la real del mundo de pruebas, para que su color venga del dato). */
const clasesRicas = (r: Json): Json => {
  const real = (r.por_vertical as Json[])[0]?.clave ?? "vertical-real";
  const filas = [
    [real, "Disciplina de ejemplo 1", 46, 37, 22, 4],
    ["vertical-ejemplo-1", "Disciplina de ejemplo 2", 33, 24, 11, 2],
    ["vertical-ejemplo-2", "Disciplina de ejemplo 3", 25, 18, 8, 1],
  ].map(([clave, nombre, agendadas, asistidas, inscritas, pendientes]) => ({ clave, nombre, agendadas, asistidas, no_asistidas: (agendadas as number) - (asistidas as number) - (pendientes as number), canceladas: 0, pendientes, inscritas, inscritas_a_mano: 0, conversion: decimas(inscritas as number, asistidas as number) }));
  const suma = (k: string): number => filas.reduce((a, f) => a + (f as Json)[k], 0);
  const total = { clave: "total", nombre: "Total", agendadas: suma("agendadas"), asistidas: suma("asistidas"), no_asistidas: suma("no_asistidas"), canceladas: 0, pendientes: suma("pendientes"), inscritas: suma("inscritas"), inscritas_a_mano: 0, conversion: decimas(suma("inscritas"), suma("asistidas")) };
  return { ...r, total, por_vertical: filas, por_sucursal: [{ ...total, clave: "sucursal-ejemplo", nombre: "Sucursal de ejemplo" }] };
};

/** El ejecutivo de una escuela sin alumnos ni grupos (los campos de siempre y los de las gráficas, en cero). */
const ejecutivoVacio = (r: Json): Json => {
  const cero = "0.00";
  return {
    ...r,
    activos: { total_alumnos: 0, total_inscripciones: 0, por_vertical_y_sucursal: [] },
    altas_del_mes: 0,
    bajas_del_mes: 0,
    base_al_inicio_del_mes: 0,
    desercion: null,
    desercion_texto: "—",
    ingreso_mensual_recurrente: cero,
    cartera_vencida: { total: cero, antiguedad: { de_0_a_30: cero, de_31_a_60: cero, de_61_a_90: cero, mas_de_90: cero }, familias: 0, familias_por_tramo: { de_0_a_30: 0, de_31_a_60: 0, de_61_a_90: 0, mas_de_90: 0 } },
    ocupacion_por_grupo: [],
    mapa_ocupacion: [],
    bajas_por_motivo: [],
    comparativo: [],
  };
};

/** El ejecutivo con un grupo lleno y una cartera con atraso, para ver las tres frases y el indicador de alerta del héroe aunque el mundo de pruebas no los tenga. */
const ejecutivoConGrupoLleno = (r: Json): Json => {
  const primero = (r.ocupacion_por_grupo as Json[])[0];
  const lleno = primero ? { ...primero, ocupados: primero.cupo_maximo, ocupacion: "100.0", estado: "a_reventar" } : null;
  return {
    ...r,
    ocupacion_por_grupo: lleno ? [lleno, ...(r.ocupacion_por_grupo as Json[]).slice(1)] : r.ocupacion_por_grupo,
    bajas_por_motivo: r.bajas_por_motivo?.length ? r.bajas_por_motivo : [{ motivo: { id: "motivo-baja-ejemplo", nombre: "Horario" }, bajas: 8 }],
  };
};

/** Hover o foco sobre un mes de la gráfica de altas y bajas (por posición: 0 = el más antiguo). */
const mesDeLaGrafica = (c: Contexto, i: number) => c.page.locator(".tendencia-meses button").nth(i);

// ─── El diálogo «Gastos de la campaña» ───────────────────────────────────────────────────────
// ─── El diálogo «Gastos de la campaña» ───────────────────────────────────────────────────────

interface Gasto {
  id: string;
  fecha: string;
  monto: string;
  nota: string | null;
}

const GASTOS_DE_EJEMPLO: Gasto[] = [
  { id: "gasto-ejemplo-1", fecha: "2026-10-05", monto: "1200.00", nota: "Anuncios de la primera semana" },
  { id: "gasto-ejemplo-2", fecha: "2026-09-28", monto: "850.50", nota: null },
  { id: "gasto-ejemplo-3", fecha: "2026-09-14", monto: "3000.00", nota: "Volantes y lona en la sucursal" },
];

const aCentavos = (t: string): number => Math.round(Number(t) * 100);
const deCentavos = (n: number): string => `${Math.trunc(n / 100)}.${String(n % 100).padStart(2, "0")}`;

/** Una lista de gastos que solo existe en la página: GET la devuelve, POST agrega y DELETE quita. No toca la base. */
async function simularGastos(c: Contexto, inicial: Gasto[]): Promise<void> {
  const lista = [...inicial];
  await c.page.route(
    (u) => esApi(u) && esGastos(u),
    async (r: Route) => {
      const metodo = r.request().method();
      if (metodo === "GET") return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ datos: lista, total: deCentavos(lista.reduce((s, g) => s + aCentavos(g.monto), 0)) }) });
      if (metodo === "POST") {
        const cuerpo = r.request().postDataJSON() as { fecha: string; monto: string; nota?: string };
        const nuevo: Gasto = { id: `gasto-nuevo-${lista.length + 1}`, fecha: cuerpo.fecha, monto: cuerpo.monto, nota: cuerpo.nota ?? null };
        lista.unshift(nuevo);
        return r.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify(nuevo) });
      }
      if (metodo === "DELETE") {
        const id = new URL(r.request().url()).pathname.split("/").pop();
        const i = lista.findIndex((g) => g.id === id);
        if (i >= 0) lista.splice(i, 1);
        return r.fulfill({ status: 204, body: "" });
      }
      return r.fallback();
    },
  );
}

/** Abre «Gastos de la campaña» de la campaña del mundo de tableros. `antes` prepara la API (rutas simuladas) antes de cargar la pantalla. */
async function abrirGastos(c: Contexto, antes?: (c: Contexto) => Promise<void>, esperarLista = true): Promise<void> {
  if (antes) await antes(c);
  await irA(c, RUTA);
  const fila = tablero(c, `costo-${c.mundo.tableros.campana.id}`);
  await fila.scrollIntoViewIfNeeded();
  await fila.getByRole("button", { name: "Capturar o ver gastos" }).click();
  await c.page.locator("dialog[open]").waitFor();
  if (esperarLista) await c.page.getByTestId("gasto-total").waitFor();
  await esperarListo(c.page);
}

const dialogo = (c: Contexto) => c.page.locator("dialog[open]");
const capturarElGasto = (c: Contexto) => dialogo(c).getByRole("button", { name: "Capturar el gasto" }).click();

// ─── Escenas ─────────────────────────────────────────────────────────────────────────────────

/** El administrador ve todo; el asesor ve lo mismo sin el dinero de marketing (gasto y costo). */
const ROL_ASESOR: RolEscena = "asesor";

export const ESCENAS: Escena[] = [
  // === R3b-A ===

  // ── La página entera y el héroe ──
  {
    id: "tabl-pagina-administrador",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Tableros del administrador: encabezado con mes y descargas, filtros, pestañas fijas, héroe oscuro y las ocho secciones (datos reales del mundo de pruebas)",
    tipo: "pantalla",
    ruta: RUTA,
    fuentes: [TABLEROS, HEROE, NAVEGACION, FILTROS, EMBUDO, FUENTES, CLASES, ALTAS, NUMERADA, BARRAS],
    ir: (c) => irA(c, RUTA),
  },
  {
    id: "tabl-pagina-asesor",
    rol: ROL_ASESOR,
    grupo: GRUPO,
    titulo: "Tableros del asesor: las mismas secciones sin el dinero de marketing (la sección 02 sin gasto ni costo y sin el costo por campaña)",
    tipo: "pantalla",
    ruta: RUTA,
    fuentes: [TABLEROS, FUENTES],
    ir: (c) => irA(c, RUTA),
  },
  {
    id: "tabl-pagina-datos-de-ejemplo",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Tableros con doce meses de historia, un embudo de 236 leads, siete fuentes y tres disciplinas con color (respuestas parchadas con datos de ejemplo)",
    tipo: "estado",
    fuentes: [TABLEROS, HEROE, EMBUDO, FUENTES, CLASES, ALTAS],
    ir: async (c) => {
      await conDisciplinasConColor(c);
      await parchearGet(c, esReporte("evolucion"), evolucionRica);
      await parchearGet(c, esReporte("embudo"), embudoRico);
      await parchearGet(c, esReporte("fuentes"), fuentesRicas);
      await parchearGet(c, esReporte("clases-muestra"), clasesRicas);
      await parchearGet(c, esReporte("ejecutivo"), ejecutivoConGrupoLleno);
      await irA(c, RUTA);
    },
  },
  {
    id: "tabl-pagina-vacia",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Tableros de una escuela sin alumnos, sin leads y sin clases (todo en cero; sin frases ni indicadores de más)",
    tipo: "estado",
    fuentes: [TABLEROS, HEROE, EMBUDO, FUENTES, CLASES, ALTAS, BASICOS],
    ir: async (c) => {
      await parchearGet(c, esReporte("evolucion"), evolucionVacia);
      await parchearGet(c, esReporte("ejecutivo"), ejecutivoVacio);
      await parchearGet(c, esReporte("embudo"), embudoSinLeads);
      await parchearGet(c, esReporte("fuentes"), fuentesVacias);
      await parchearGet(c, esReporte("clases-muestra"), clasesVacio);
      await irA(c, RUTA);
    },
  },
  {
    id: "tabl-pagina-cargando",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Tableros cargando: encabezado, filtros y pestañas ya puestos; el héroe y cada sección con su «Cargando…»",
    tipo: "estado",
    fuentes: [TABLEROS, HEROE, CARGA, BASICOS],
    ir: (c) => conCargando(c, RUTA, "Tableros"),
  },
  {
    id: "tabl-pagina-error",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Tableros con error de carga (500): el héroe y cada sección dicen que no se pudo cargar y ofrecen «Reintentar»",
    tipo: "estado",
    fuentes: [TABLEROS, HEROE, CARGA, BASICOS],
    ir: (c) => conError(c, RUTA),
  },
  {
    id: "tabl-heroe-con-datos",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Héroe oscuro con datos: titular, tres frases (mes, mayor caída del embudo, grupo a reventar) y seis indicadores, con la cartera en alerta",
    tipo: "estado",
    fuentes: [HEROE],
    completa: false,
    ir: async (c) => {
      await parchearGet(c, esReporte("evolucion"), evolucionRica);
      await parchearGet(c, esReporte("embudo"), embudoRico);
      await parchearGet(c, esReporte("ejecutivo"), ejecutivoConGrupoLleno);
      await irASeccion(c, "resumen");
    },
  },
  {
    id: "tabl-heroe-asesor",
    rol: ROL_ASESOR,
    grupo: GRUPO,
    titulo: "Héroe del asesor (mismas cifras que el administrador: no trae dinero de marketing)",
    tipo: "estado",
    fuentes: [HEROE],
    completa: false,
    ir: (c) => irASeccion(c, "resumen"),
  },
  {
    id: "tabl-heroe-vacio",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Héroe de una escuela sin alumnos: titular «0 alumnos activos…», sin frases y con los indicadores en cero y deserción «—»",
    tipo: "estado",
    fuentes: [HEROE],
    completa: false,
    ir: async (c) => {
      await parchearGet(c, esReporte("evolucion"), evolucionVacia);
      await parchearGet(c, esReporte("ejecutivo"), ejecutivoVacio);
      await parchearGet(c, esReporte("embudo"), embudoSinLeads);
      await irASeccion(c, "resumen");
    },
  },
  {
    id: "tabl-heroe-cargando",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Héroe cargando («Armando el resumen…»)",
    tipo: "estado",
    fuentes: [HEROE, BASICOS],
    completa: false,
    ir: (c) => conCargando(c, RUTA, "Tableros"),
  },
  {
    id: "tabl-heroe-error",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Héroe con error de carga (500) y «Reintentar» dentro del panel oscuro",
    tipo: "estado",
    fuentes: [HEROE, BASICOS],
    completa: false,
    ir: async (c) => {
      await conError(c, RUTA);
      await verSeccion(c, "resumen");
    },
  },

  // ── Pestañas fijas ──
  {
    id: "tabl-pestanas-seccion-activa",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Pestañas fijas con la sección 03 marcada (se llegó con un clic en «Clases muestra»: la página se desplazó y la pestaña quedó con `aria-current`)",
    tipo: "estado",
    fuentes: [NAVEGACION],
    completa: false,
    ir: async (c) => {
      await irA(c, RUTA);
      await c.page.getByRole("navigation", { name: "Secciones del tablero" }).getByRole("button", { name: "Clases muestra" }).click();
      await c.page.waitForTimeout(1200);
      await esperarListo(c.page);
    },
  },
  {
    id: "tabl-pestanas-foco-teclado",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Pestañas fijas con el foco del teclado en una de ellas (anillo de foco visible)",
    tipo: "estado",
    fuentes: [NAVEGACION],
    completa: false,
    ir: async (c) => {
      await irA(c, RUTA);
      await c.page.getByRole("navigation", { name: "Secciones del tablero" }).getByRole("button", { name: "Fuentes y costo" }).focus();
      await c.page.keyboard.press("Tab");
      await c.page.waitForTimeout(150);
    },
  },

  // ── Filtros ──
  {
    id: "tabl-filtro-disciplina",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Tableros filtrados por una disciplina (la píldora activa va oscura, con su punto de color; el héroe lo dice en su encabezado)",
    tipo: "estado",
    fuentes: [FILTROS, TABLEROS],
    completa: false,
    ir: async (c) => {
      await conDisciplinasConColor(c);
      await irA(c, RUTA);
      await c.page.getByRole("group", { name: "Disciplina" }).getByRole("button").nth(1).click();
      await esperarListo(c.page);
      await verSeccion(c, "resumen");
    },
  },
  {
    id: "tabl-filtro-sucursal",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Tableros filtrados por una sucursal sin clases (la sur): la sección 03 queda en ceros y el gasto de la sección 02 lleva su aviso de aproximación",
    tipo: "estado",
    fuentes: [FILTROS, TABLEROS, FUENTES],
    completa: false,
    ir: async (c) => {
      await irA(c, RUTA);
      await tablero(c, "filtros-del-tablero").getByLabel("Sucursal").selectOption({ label: c.mundo.sucursales.sur.nombre });
      await esperarListo(c.page);
      await verSeccion(c, "fuentes");
    },
  },
  {
    id: "tabl-filtro-rango",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Tableros con un rango de fechas elegido (últimos 30 días): las secciones 01 a 03 hablan de ese rango en lugar del mes",
    tipo: "estado",
    fuentes: [FILTROS, TABLEROS, EMBUDO],
    completa: false,
    ir: async (c) => {
      await irA(c, RUTA);
      await c.page.getByLabel("Desde").fill(fechaMx(30));
      await c.page.getByLabel("Hasta").fill(fechaMx(0));
      await esperarListo(c.page);
      await verSeccion(c, "embudo");
    },
  },
  {
    id: "tabl-filtro-rango-invertido",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Tableros con el rango al revés («Hasta» antes de «Desde»): el mensaje junto al campo y las secciones 01 a 03 piden corregir las fechas",
    tipo: "estado",
    fuentes: [FILTROS, TABLEROS, CARGA, BASICOS],
    completa: false,
    ir: async (c) => {
      await irA(c, RUTA);
      await c.page.getByLabel("Desde").fill(fechaMx(0));
      await c.page.getByLabel("Hasta").fill("2026-01-01");
      await c.page.getByText("La fecha «Desde» debe ser anterior a «Hasta».").first().waitFor();
      await esperarListo(c.page);
      await verSeccion(c, "embudo");
    },
  },
  {
    id: "tabl-filtro-mes-sin-historia",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Tableros con un mes sin historia (enero de 2020): altas y bajas en cero, deserción «—» y secciones de captación vacías",
    tipo: "estado",
    fuentes: [TABLEROS, HEROE],
    completa: false,
    ir: async (c) => {
      await irA(c, RUTA);
      await c.page.getByLabel("Mes", { exact: true }).fill("2020-01");
      await esperarListo(c.page);
      await verSeccion(c, "resumen");
    },
  },
  {
    id: "tabl-filtro-sin-conexion",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Tableros sin conexión: al cambiar el mes el error dice «No hay conexión…» en el héroe y en las secciones",
    tipo: "estado",
    fuentes: [TABLEROS, HEROE, CARGA, BASICOS],
    completa: false,
    ir: async (c) => {
      await sinConexion(c, () => c.page.getByLabel("Mes", { exact: true }).fill("2026-08"));
      await verSeccion(c, "resumen");
    },
  },
  {
    id: "tabl-descargas",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Encabezado con el menú «Más descargas» abierto (activos por disciplina y ocupación por grupo, en CSV)",
    tipo: "estado",
    fuentes: [TABLEROS],
    completa: false,
    ir: async (c) => {
      await irA(c, RUTA);
      await c.page.getByText("Más descargas").click();
      await c.page.waitForTimeout(150);
    },
  },

  // ── 01 Embudo ──
  {
    id: "tabl-embudo-con-datos",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Sección 01 con un embudo de 236 leads: barras por etapa con su cifra, la caída entre etapas (la mayor en ámbar y con «la mayor caída») y «Por qué se pierden»",
    tipo: "estado",
    fuentes: [EMBUDO],
    completa: false,
    ir: (c) => conParche(c, "embudo", "embudo", embudoRico),
  },
  {
    id: "tabl-embudo-datos-reales",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Sección 01 con los leads reales del mundo de pruebas (el mes en curso)",
    tipo: "estado",
    fuentes: [EMBUDO],
    completa: false,
    ir: (c) => irASeccion(c, "embudo"),
  },
  {
    id: "tabl-embudo-vacia",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Sección 01 sin leads en el rango: «Ningún lead llegó en este rango.»",
    tipo: "estado",
    fuentes: [EMBUDO, BASICOS],
    completa: false,
    ir: (c) => conParche(c, "embudo", "embudo", embudoSinLeads),
  },
  {
    id: "tabl-embudo-sin-perdidos",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Sección 01 con leads que ninguno se ha perdido («Ninguno de estos leads se ha perdido.»)",
    tipo: "estado",
    fuentes: [EMBUDO],
    completa: false,
    ir: (c) => conParche(c, "embudo", "embudo", (b) => ({ ...embudoRico(b), perdidos: { total: 0, por_motivo: [] } })),
  },
  {
    id: "tabl-embudo-cargando",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Sección 01 cargando",
    tipo: "estado",
    fuentes: [EMBUDO, CARGA, BASICOS],
    completa: false,
    ir: async (c) => {
      await conCargando(c, RUTA, "Tableros");
      await verSeccion(c, "embudo");
    },
  },
  {
    id: "tabl-embudo-error",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Sección 01 con error de carga (500) y «Reintentar»",
    tipo: "estado",
    fuentes: [EMBUDO, CARGA, BASICOS],
    completa: false,
    ir: async (c) => {
      await conError(c, RUTA);
      await verSeccion(c, "embudo");
    },
  },

  // ── 02 Fuentes y campañas ──
  {
    id: "tabl-fuentes-con-datos",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Sección 02 del administrador con siete fuentes: indicadores de gasto y costo, tabla con barras, conversión destacada, «Lo más barato» y el costo por campaña",
    tipo: "estado",
    fuentes: [FUENTES, COSTO],
    completa: false,
    ir: (c) => conParche(c, "fuentes", "fuentes", fuentesRicas),
  },
  {
    id: "tabl-fuentes-datos-reales",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Sección 02 con las fuentes reales del mundo de pruebas (campañas sin gasto y con él)",
    tipo: "estado",
    fuentes: [FUENTES],
    completa: false,
    ir: (c) => irASeccion(c, "fuentes"),
  },
  {
    id: "tabl-fuentes-asesor",
    rol: ROL_ASESOR,
    grupo: GRUPO,
    titulo: "Sección 02 del asesor: leads, inscritos y conversión, SIN gasto ni costo (la API los manda vacíos) y sin el costo por campaña",
    tipo: "estado",
    fuentes: [FUENTES],
    completa: false,
    ir: (c) => conParche(c, "fuentes", "fuentes", fuentesRicas),
  },
  {
    id: "tabl-fuentes-vacia",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Sección 02 sin leads en el rango: «No llegó ningún lead en este rango.»",
    tipo: "estado",
    fuentes: [FUENTES, BASICOS],
    completa: false,
    ir: (c) => conParche(c, "fuentes", "fuentes", fuentesVacias),
  },
  {
    id: "tabl-fuentes-cargando",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Sección 02 cargando",
    tipo: "estado",
    fuentes: [FUENTES, CARGA, BASICOS],
    completa: false,
    ir: async (c) => {
      await conCargando(c, RUTA, "Tableros");
      await verSeccion(c, "fuentes");
    },
  },
  {
    id: "tabl-fuentes-error",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Sección 02 con error de carga (500) y «Reintentar»",
    tipo: "estado",
    fuentes: [FUENTES, CARGA, BASICOS],
    completa: false,
    ir: async (c) => {
      await conError(c, RUTA);
      await verSeccion(c, "fuentes");
    },
  },

  // ── Costo por campaña (dentro de la 02, solo administrador) ──
  {
    id: "tabl-costo-con-datos",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Costo por campaña (dentro de la sección 02): indicadores, aviso de campañas sin gasto y tabla con «Capturar o ver gastos»",
    tipo: "estado",
    fuentes: [COSTO, FUENTES, BASICOS],
    completa: false,
    ir: (c) => irASeccion(c, "fuentes"),
  },
  {
    id: "tabl-costo-con-gasto-en-todas",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Costo por campaña con gasto en todas las campañas y con inscritos a mano (sin aviso de campañas sin gasto; con la nota de inscritos a mano; respuesta ajustada)",
    tipo: "estado",
    fuentes: [COSTO],
    completa: false,
    ir: async (c) => {
      await parchearGet(c, esReporte("costo-por-alumno"), (r) => {
        const filas = (r.filas as Json[]).map((f) => ({ ...f, gasto: "1500.00", inscritos_a_mano: 1, alumnos_inscritos: f.inscripciones_activas + 1, costo_por_lead_texto: f.leads > 0 ? "375.00" : "—", costo_por_clase_muestra_texto: f.clases_muestra > 0 ? "375.00" : "—", costo_por_alumno_texto: "750.00" }));
        return { ...r, filas, total: { ...r.total, gasto: `${1500 * filas.length}.00`, inscritos_a_mano: filas.length, costo_por_lead_texto: "375.00", costo_por_clase_muestra_texto: "375.00", costo_por_alumno_texto: "750.00" } };
      });
      await irASeccion(c, "fuentes");
    },
  },
  {
    id: "tabl-costo-muchos-datos",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Costo por campaña con muchos datos (campañas repetidas ocho veces: tabla larga)",
    tipo: "estado",
    fuentes: [COSTO],
    completa: false,
    ir: async (c) => {
      await parchearGet(c, esReporte("costo-por-alumno"), (cuerpo) => multiplicar(cuerpo, 8));
      await irASeccion(c, "fuentes");
    },
  },
  {
    id: "tabl-costo-vacio",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Costo por campaña sin campañas: aviso «Todavía no hay campañas…» y tabla vacía",
    tipo: "estado",
    fuentes: [COSTO, BASICOS],
    completa: false,
    ir: async (c) => {
      await parchearGet(c, esReporte("costo-por-alumno"), (r) => ({
        ...r,
        filas: [],
        total: { ...r.total, gasto: "0.00", leads: 0, clases_muestra: 0, clases_asistidas: 0, inscripciones_activas: 0, inscritos_a_mano: 0, alumnos_inscritos: 0, costo_por_lead_texto: "—", costo_por_clase_muestra_texto: "—", costo_por_alumno_texto: "—" },
      }));
      await irASeccion(c, "fuentes");
    },
  },
  {
    id: "tabl-costo-cargando",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Costo por campaña cargando (el resto de la sección 02 ya llegó)",
    tipo: "estado",
    fuentes: [COSTO, BASICOS],
    completa: false,
    ir: async (c) => {
      await c.page.route(esReporte("costo-por-alumno"), () => new Promise<void>(() => undefined));
      await c.page.goto(RUTA);
      await c.page.getByRole("heading", { name: "Gasto y costo por campaña" }).waitFor();
      await c.page.waitForTimeout(600);
      await verSeccion(c, "fuentes");
    },
  },
  {
    id: "tabl-costo-error",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Costo por campaña con error de carga (500) y «Reintentar»",
    tipo: "estado",
    fuentes: [COSTO, BASICOS],
    completa: false,
    ir: async (c) => {
      await c.page.route(esReporte("costo-por-alumno"), (r: Route) => r.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: { codigo: "interno", mensaje: "Algo salió mal en el servidor. Inténtalo de nuevo." } }) }));
      await irA(c, RUTA);
      await verSeccion(c, "fuentes");
    },
  },

  // ── 03 Clases muestra ──
  {
    id: "tabl-clases-con-datos",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Sección 03 con tres disciplinas de color: tarjetas con asistencia y cierre, tres barras con su cifra, totales, descarga de CSV y el desglose por fuente y sucursal",
    tipo: "estado",
    fuentes: [CLASES, BARRAS],
    completa: false,
    ir: async (c) => {
      await conDisciplinasConColor(c);
      await conParche(c, "clases", "clases-muestra", clasesRicas);
    },
  },
  {
    id: "tabl-clases-datos-reales",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Sección 03 con las clases reales del mundo de pruebas (una disciplina, sin color de marca: punto y banda neutros)",
    tipo: "estado",
    fuentes: [CLASES],
    completa: false,
    ir: (c) => irASeccion(c, "clases"),
  },
  {
    id: "tabl-clases-detalle-abierto",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Sección 03 con «Ver por fuente y por sucursal» abierto (barras de asistidas contra agendadas, con la conversión de cada fila)",
    tipo: "estado",
    fuentes: [CLASES, BARRAS],
    completa: false,
    ir: async (c) => {
      await conDisciplinasConColor(c);
      await parchearGet(c, esReporte("clases-muestra"), clasesRicas);
      await irA(c, RUTA);
      await seccion(c, "clases").getByText("Ver por fuente y por sucursal").click();
      await verSeccion(c, "clases");
    },
  },
  {
    id: "tabl-clases-asesor",
    rol: ROL_ASESOR,
    grupo: GRUPO,
    titulo: "Sección 03 del asesor (mismas cifras que el administrador)",
    tipo: "estado",
    fuentes: [CLASES],
    completa: false,
    ir: (c) => irASeccion(c, "clases"),
  },
  {
    id: "tabl-clases-muchos-datos",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Sección 03 con muchos datos (cada lista repetida ocho veces: ocho tarjetas por disciplina)",
    tipo: "estado",
    fuentes: [CLASES, BARRAS],
    completa: false,
    ir: (c) => conParche(c, "clases", "clases-muestra", (cuerpo) => multiplicar(cuerpo, 8)),
  },
  {
    id: "tabl-clases-vacio",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Sección 03 vacía: indicadores en cero y «No hay clases muestra en este rango.»",
    tipo: "estado",
    fuentes: [CLASES, BASICOS],
    completa: false,
    ir: (c) => conParche(c, "clases", "clases-muestra", clasesVacio),
  },
  {
    id: "tabl-clases-cargando",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Sección 03 cargando",
    tipo: "estado",
    fuentes: [CLASES, CARGA, BASICOS],
    completa: false,
    ir: async (c) => {
      await conCargando(c, RUTA, "Tableros");
      await verSeccion(c, "clases");
    },
  },
  {
    id: "tabl-clases-error",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Sección 03 con error de carga (500) y «Reintentar»",
    tipo: "estado",
    fuentes: [CLASES, CARGA, BASICOS],
    completa: false,
    ir: async (c) => {
      await conError(c, RUTA);
      await verSeccion(c, "clases");
    },
  },
  {
    id: "tabl-clases-sin-conexion",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Sección 03 sin conexión: al cambiar el rango el error dice «No hay conexión…» sobre los datos que ya estaban",
    tipo: "estado",
    fuentes: [CLASES, CARGA, BASICOS],
    completa: false,
    ir: async (c) => {
      await sinConexion(c, () => c.page.getByLabel("Desde").fill(fechaMx(30)));
      await verSeccion(c, "clases");
    },
  },

  // ── 04 Altas y bajas ──
  {
    id: "tabl-altas-con-datos",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Sección 04 con doce meses de historia: barras divergentes (altas arriba, bajas abajo, cada una con su cifra), la línea de activos y el mes elegido (el último)",
    tipo: "estado",
    fuentes: [ALTAS],
    completa: false,
    ir: (c) => conParche(c, "altas-y-bajas", "evolucion", evolucionRica),
  },
  {
    id: "tabl-altas-datos-reales",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Sección 04 con la historia real del mundo de pruebas (casi todo en el mes en curso)",
    tipo: "estado",
    fuentes: [ALTAS],
    completa: false,
    ir: (c) => irASeccion(c, "altas-y-bajas"),
  },
  {
    id: "tabl-altas-mes-elegido",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Sección 04 con el cursor sobre un mes (julio): la columna se resalta y sus cifras salen arriba",
    tipo: "estado",
    fuentes: [ALTAS],
    completa: false,
    ir: async (c) => {
      await parchearGet(c, esReporte("evolucion"), evolucionRica);
      await irASeccion(c, "altas-y-bajas");
      if (c.vista === "escritorio") await mesDeLaGrafica(c, 9).hover();
      else await mesDeLaGrafica(c, 9).click();
      await c.page.waitForTimeout(200);
    },
  },
  {
    id: "tabl-altas-teclado",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Sección 04 con el foco del teclado en un mes (el anillo de foco y las cifras de ese mes; los botones «Mes anterior» y «Mes siguiente» sirven en el celular)",
    tipo: "estado",
    fuentes: [ALTAS],
    completa: false,
    ir: async (c) => {
      await parchearGet(c, esReporte("evolucion"), evolucionRica);
      await irASeccion(c, "altas-y-bajas");
      await mesDeLaGrafica(c, 3).focus();
      await c.page.waitForTimeout(200);
    },
  },
  {
    id: "tabl-altas-tabla-abierta",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Sección 04 con la tabla de las cifras de los doce meses abierta (la alternativa en texto de la gráfica)",
    tipo: "estado",
    fuentes: [ALTAS],
    completa: false,
    ir: async (c) => {
      await parchearGet(c, esReporte("evolucion"), evolucionRica);
      await irA(c, RUTA);
      await seccion(c, "altas-y-bajas").getByText(/Ver las cifras de los 12 meses/).click();
      await verSeccion(c, "altas-y-bajas");
    },
  },
  {
    id: "tabl-altas-vacia",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Sección 04 de una escuela sin historia: doce meses en cero, sin barras (las cifras «0» escritas) y la línea plana",
    tipo: "estado",
    fuentes: [ALTAS],
    completa: false,
    ir: (c) => conParche(c, "altas-y-bajas", "evolucion", evolucionVacia),
  },
  {
    id: "tabl-altas-sin-meses",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Sección 04 sin ningún mes en la respuesta: «Todavía no hay historia que mostrar.»",
    tipo: "estado",
    fuentes: [ALTAS, BASICOS],
    completa: false,
    ir: (c) => conParche(c, "altas-y-bajas", "evolucion", (cuerpo) => ({ ...cuerpo, meses: [], cohortes: [], promedio: [] })),
  },
  {
    id: "tabl-altas-cargando",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Sección 04 cargando",
    tipo: "estado",
    fuentes: [ALTAS, TABLEROS, BASICOS],
    completa: false,
    ir: async (c) => {
      await conCargando(c, RUTA, "Tableros");
      await verSeccion(c, "altas-y-bajas");
    },
  },
  {
    id: "tabl-altas-error",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Sección 04 con error de carga (500) y «Reintentar»",
    tipo: "estado",
    fuentes: [ALTAS, TABLEROS, BASICOS],
    completa: false,
    ir: async (c) => {
      await conError(c, RUTA);
      await verSeccion(c, "altas-y-bajas");
    },
  },

  // ── Diálogo «Gastos de la campaña» ──
  {
    id: "tabl-gastos-vacio",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Diálogo «Gastos de la campaña» de una campaña sin gastos: total $0.00, lista vacía y formulario «Capturar un gasto»",
    tipo: "flotante",
    ruta: "/tableros",
    fuentes: [COSTO, DIALOGO],
    ir: (c) => abrirGastos(c, (x) => simularGastos(x, [])),
  },
  {
    id: "tabl-gastos-con-gastos",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Diálogo «Gastos de la campaña» con tres gastos capturados (uno sin nota) y su total",
    tipo: "flotante",
    fuentes: [COSTO, DIALOGO],
    ir: (c) => abrirGastos(c, (x) => simularGastos(x, GASTOS_DE_EJEMPLO)),
  },
  {
    id: "tabl-gastos-cargando",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Diálogo «Gastos de la campaña» cargando la lista de gastos («Cargando…»)",
    tipo: "flotante",
    fuentes: [COSTO, BASICOS],
    ir: async (c) => {
      await abrirGastos(
        c,
        async (x) => {
          await x.page.route(
            (u) => esApi(u) && esGastos(u),
            (r: Route) => (r.request().method() === "GET" ? new Promise<void>(() => undefined) : r.fallback()),
          );
        },
        false,
      );
      await c.page.waitForTimeout(200);
    },
  },
  {
    id: "tabl-gastos-error-de-carga",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Diálogo «Gastos de la campaña» con error al cargar la lista de gastos (500) y botón «Reintentar»",
    tipo: "flotante",
    fuentes: [COSTO, BASICOS],
    ir: async (c) => {
      await abrirGastos(
        c,
        async (x) => {
          await x.page.route(
            (u) => esApi(u) && esGastos(u),
            (r: Route) => (r.request().method() === "GET" ? r.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: { codigo: "interno", mensaje: "Algo salió mal en el servidor. Inténtalo de nuevo." } }) }) : r.fallback()),
          );
        },
        false,
      );
      await dialogo(c).getByRole("button", { name: "Reintentar" }).waitFor();
      await esperarListo(c.page);
    },
  },
  {
    id: "tabl-gastos-validacion-vacio",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Diálogo «Gastos de la campaña» enviado sin monto: «Escribe un importe válido mayor que cero…»",
    tipo: "flotante",
    fuentes: [COSTO, DIALOGO],
    ir: async (c) => {
      await abrirGastos(c, (x) => simularGastos(x, []));
      await capturarElGasto(c);
      await dialogo(c).getByText("Escribe un importe válido").waitFor();
      await esperarListo(c.page);
    },
  },
  {
    id: "tabl-gastos-validacion-monto-con-decimales",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Diálogo «Gastos de la campaña» con un monto de tres decimales («12.345»): importe inválido",
    tipo: "flotante",
    fuentes: [COSTO, DIALOGO],
    ir: async (c) => {
      await abrirGastos(c, (x) => simularGastos(x, GASTOS_DE_EJEMPLO));
      await dialogo(c).getByLabel("Monto (MXN)").fill("12.345");
      await capturarElGasto(c);
      const mensaje = dialogo(c).getByText("Escribe un importe válido");
      await mensaje.waitFor();
      // El cuadro es largo (tres gastos): se baja hasta el final para que el campo y su mensaje queden sobre el pie, no tapados por él.
      await mensaje.evaluate((el) => {
        let nodo: HTMLElement | null = el.parentElement;
        while (nodo && !(/auto|scroll/.test(getComputedStyle(nodo).overflowY) && nodo.scrollHeight > nodo.clientHeight)) nodo = nodo.parentElement;
        if (nodo) nodo.scrollTop = nodo.scrollHeight;
      });
      await c.page.waitForTimeout(250);
      await esperarListo(c.page);
    },
  },
  {
    id: "tabl-gastos-validacion-monto-cero",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Diálogo «Gastos de la campaña» con monto cero («0»): importe inválido",
    tipo: "flotante",
    fuentes: [COSTO, DIALOGO],
    ir: async (c) => {
      await abrirGastos(c, (x) => simularGastos(x, []));
      await dialogo(c).getByLabel("Monto (MXN)").fill("0");
      await capturarElGasto(c);
      await dialogo(c).getByText("Escribe un importe válido").waitFor();
      await esperarListo(c.page);
    },
  },
  {
    id: "tabl-gastos-validacion-monto-letras",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Diálogo «Gastos de la campaña» con un monto que no es número («abc»): importe inválido",
    tipo: "flotante",
    fuentes: [COSTO, DIALOGO],
    ir: async (c) => {
      await abrirGastos(c, (x) => simularGastos(x, []));
      await dialogo(c).getByLabel("Monto (MXN)").fill("abc");
      await capturarElGasto(c);
      await dialogo(c).getByText("Escribe un importe válido").waitFor();
      await esperarListo(c.page);
    },
  },
  {
    id: "tabl-gastos-validacion-fecha-y-monto",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Diálogo «Gastos de la campaña» con la fecha borrada y sin monto: «Elige la fecha» y el error del importe a la vez",
    tipo: "flotante",
    fuentes: [COSTO, DIALOGO],
    ir: async (c) => {
      await abrirGastos(c, (x) => simularGastos(x, []));
      await dialogo(c).getByLabel("Fecha").fill("");
      await capturarElGasto(c);
      await dialogo(c).getByText("Elige la fecha").waitFor();
      await esperarListo(c.page);
    },
  },
  {
    id: "tabl-gastos-capturando",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Diálogo «Gastos de la campaña» con el gasto lleno y el botón «Capturar el gasto» ocupado (esperando al servidor)",
    tipo: "flotante",
    fuentes: [COSTO, BASICOS],
    ir: async (c) => {
      await abrirGastos(c, async (x) => {
        await simularGastos(x, GASTOS_DE_EJEMPLO);
        // Se registra después de la simulación para ir primero: el POST nunca contesta.
        await x.page.route(
          (u) => esApi(u) && esGastos(u),
          (r: Route) => (r.request().method() === "POST" ? new Promise<void>(() => undefined) : r.fallback()),
        );
      });
      await dialogo(c).getByLabel("Monto (MXN)").fill("1500.50");
      await dialogo(c).getByLabel(/Nota/).fill("Segunda semana");
      await capturarElGasto(c);
      await dialogo(c).locator("button[aria-busy='true'], button .giro").first().waitFor({ timeout: 3000 }).catch(() => undefined);
      await c.page.waitForTimeout(200);
    },
  },
  {
    id: "tabl-gastos-error-servidor-en-el-campo",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Diálogo «Gastos de la campaña» con el servidor rechazando el monto (400, mensaje bajo el campo «Monto (MXN)»)",
    tipo: "flotante",
    fuentes: [COSTO, DIALOGO, BASICOS],
    ir: async (c) => {
      await abrirGastos(c, (x) => simularGastos(x, GASTOS_DE_EJEMPLO));
      await fallarLaSiguienteEscritura(c, 400, "El monto es demasiado grande.", [{ campo: "monto", mensaje: "El monto es demasiado grande." }]);
      await dialogo(c).getByLabel("Monto (MXN)").fill("999999999");
      await capturarElGasto(c);
      await dialogo(c).getByText("El monto es demasiado grande.").first().waitFor();
      await esperarListo(c.page);
    },
  },
  {
    id: "tabl-gastos-error-servidor",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Diálogo «Gastos de la campaña» con error general del servidor al capturar (500)",
    tipo: "flotante",
    fuentes: [COSTO, DIALOGO, BASICOS],
    ir: async (c) => {
      await abrirGastos(c, (x) => simularGastos(x, GASTOS_DE_EJEMPLO));
      await fallarLaSiguienteEscritura(c, 500, "Algo salió mal en el servidor. Inténtalo de nuevo.");
      await dialogo(c).getByLabel("Monto (MXN)").fill("1500.50");
      await capturarElGasto(c);
      await dialogo(c).getByText("Algo salió mal en el servidor").first().waitFor();
      await esperarListo(c.page);
    },
  },
  {
    id: "tabl-gastos-sin-conexion",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Diálogo «Gastos de la campaña» sin conexión al capturar («No hay conexión con el servidor…»)",
    tipo: "flotante",
    fuentes: [COSTO, DIALOGO, BASICOS],
    ir: async (c) => {
      await abrirGastos(c, (x) => simularGastos(x, GASTOS_DE_EJEMPLO));
      await dialogo(c).getByLabel("Monto (MXN)").fill("1500.50");
      // Las rutas simuladas contestan aunque no haya red; para «cortarla» la escritura se aborta como lo haría el navegador sin conexión.
      await c.page.route(
        (u) => esApi(u) && esGastos(u),
        (r: Route) => (r.request().method() === "POST" ? r.abort("internetdisconnected") : r.fallback()),
      );
      await capturarElGasto(c);
      await dialogo(c).getByText("No hay conexión con el servidor").first().waitFor();
      await esperarListo(c.page);
    },
  },
  {
    id: "tabl-gastos-confirmar-baja",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Diálogo «Gastos de la campaña» pidiendo confirmar la baja de un gasto en su misma fila («¿Quitar el gasto de …?», «Sí, quitarlo» / «No»)",
    tipo: "flotante",
    fuentes: [COSTO, DIALOGO],
    ir: async (c) => {
      await abrirGastos(c, (x) => simularGastos(x, GASTOS_DE_EJEMPLO));
      await dialogo(c).getByRole("button", { name: "Dar de baja" }).first().click();
      await dialogo(c).getByRole("button", { name: "Sí, quitarlo" }).waitFor();
      await esperarListo(c.page);
    },
  },
  {
    id: "tabl-gastos-baja-error-servidor",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Diálogo «Gastos de la campaña» con error del servidor al dar de baja un gasto (500)",
    tipo: "flotante",
    fuentes: [COSTO, DIALOGO, BASICOS],
    ir: async (c) => {
      await abrirGastos(c, (x) => simularGastos(x, GASTOS_DE_EJEMPLO));
      await dialogo(c).getByRole("button", { name: "Dar de baja" }).first().click();
      await fallarLaSiguienteEscritura(c, 500, "Algo salió mal en el servidor. Inténtalo de nuevo.");
      await dialogo(c).getByRole("button", { name: "Sí, quitarlo" }).click();
      await dialogo(c).getByText("Algo salió mal en el servidor").first().waitFor();
      await esperarListo(c.page);
    },
  },

  // El aviso global «ya quedó» va al final. Las escrituras son simuladas (la lista de gastos vive solo en la página), así que no cambian nada para otras escenas.
  {
    id: "tabl-gastos-aviso-capturado",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Aviso global «ya quedó» al capturar un gasto («Se capturó el gasto de $1,500.50 …: el costo ya está recalculado.») sobre el diálogo, con el gasto nuevo en la lista",
    tipo: "flotante",
    ruta: "/tableros",
    fuentes: [AVISOS, COSTO],
    completa: false,
    ir: async (c) => {
      await abrirGastos(c, (x) => simularGastos(x, GASTOS_DE_EJEMPLO));
      await dialogo(c).getByLabel("Monto (MXN)").fill("1500.50");
      await dialogo(c).getByLabel(/Nota/).fill("Segunda semana");
      await capturarElGasto(c);
      await c.page.getByTestId("aviso-global").waitFor();
      await dialogo(c).getByText("Segunda semana").waitFor();
      await c.page.waitForTimeout(300);
    },
  },
  {
    id: "tabl-gastos-aviso-quitado",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Aviso global «ya quedó» al dar de baja un gasto («Se quitó el gasto de … : el costo ya está recalculado.») sobre el diálogo",
    tipo: "flotante",
    fuentes: [AVISOS, COSTO],
    completa: false,
    ir: async (c) => {
      await abrirGastos(c, (x) => simularGastos(x, GASTOS_DE_EJEMPLO));
      await dialogo(c).getByRole("button", { name: "Dar de baja" }).first().click();
      await dialogo(c).getByRole("button", { name: "Sí, quitarlo" }).click();
      await c.page.getByTestId("aviso-global").waitFor();
      await c.page.waitForTimeout(300);
    },
  },

  // === R3b-B ===
  // Secciones 05 a 08 de la página narrativa (`/tableros`). Cada escena esconde las demás secciones (con un estilo puesto desde la escena, no desde la aplicación) para que la captura
  // muestre la sección completa dentro de la página real. Los datos salen de la API real; lo que el mundo de datos no trae (cohortes con historia, cartera, mapa con muchas celdas,
  // parejas sin alumnos) se arma parchando la respuesta de `evolucion` y `ejecutivo`.
  {
    id: "tabl-retencion-con-datos",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Tableros, sección 05 «¿Cuántos siguen después de inscribirse?»: 12 cohortes con la escala de calor, celdas rayadas «todavía no pasa», fila de promedio y leyenda",
    tipo: "pantalla",
    ruta: "/tableros",
    fuentes: [SECCION_RETENCION, LEYENDA_CALOR, GRAFICAS_B],
    ir: (c) => seccionB(c, "retencion", { evolucion: conCohortes }),
  },
  {
    id: "tabl-retencion-vacia",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Sección 05 sin inscripciones en los últimos 12 meses: «Todavía no hay inscripciones que medir»",
    tipo: "estado",
    fuentes: [SECCION_RETENCION, BASICOS],
    ir: (c) => seccionB(c, "retencion", { evolucion: (e) => ({ ...e, cohortes: [], promedio: [] }) }),
  },
  {
    id: "tabl-seccion-b-error",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Secciones 05 a 08 con error de carga (500): el aviso con «Reintentar» en el lugar de la sección",
    tipo: "estado",
    fuentes: [SECCION_RETENCION, BASICOS],
    ir: async (c) => {
      await conError(c, "/tableros");
      await soloSeccion(c, "retencion");
    },
  },
  {
    id: "tabl-seccion-b-cargando",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Secciones 05 a 08 cargando",
    tipo: "estado",
    fuentes: [SECCION_RETENCION, BASICOS],
    ir: async (c) => {
      await conCargando(c, "/tableros", "Tableros");
      await soloSeccion(c, "retencion");
    },
  },
  {
    id: "tabl-ingreso-con-datos",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Sección 06 «Ingreso recurrente y cartera vencida»: área de 12 meses con su cifra y cambio, cartera por antigüedad con familias por tramo y «Ver las familias con atraso»",
    tipo: "pantalla",
    ruta: "/tableros",
    fuentes: [SECCION_INGRESO, GRAFICAS_B],
    ir: (c) => seccionB(c, "ingreso", { evolucion: conIngreso, ejecutivo: conCartera }),
  },
  {
    id: "tabl-ingreso-cifras-abiertas",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Sección 06 con «Ver la cifra de cada mes» abierto: la tabla de 12 meses",
    tipo: "estado",
    fuentes: [SECCION_INGRESO],
    ir: async (c) => {
      await seccionB(c, "ingreso", { evolucion: conIngreso, ejecutivo: conCartera });
      await c.page.getByText("Ver la cifra de cada mes").click();
      await c.page.waitForTimeout(150);
    },
  },
  {
    id: "tabl-ingreso-sin-cartera",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Sección 06 sin saldo vencido: «Nadie tiene saldo vencido» y sin botón de familias",
    tipo: "estado",
    fuentes: [SECCION_INGRESO],
    ir: (c) => seccionB(c, "ingreso", { evolucion: conIngreso, ejecutivo: (e) => ({ ...e, cartera_vencida: CARTERA_EN_CERO }) }),
  },
  {
    id: "tabl-ingreso-sin-historia",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Sección 06 sin meses en la serie: «Todavía no hay meses con ingreso que dibujar»",
    tipo: "estado",
    fuentes: [SECCION_INGRESO],
    ir: (c) => seccionB(c, "ingreso", { evolucion: (e) => ({ ...e, meses: [], cohortes: [], promedio: [] }), ejecutivo: (e) => ({ ...e, cartera_vencida: CARTERA_EN_CERO }) }),
  },
  {
    id: "tabl-ingreso-baja",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Sección 06 con el ingreso del último mes por debajo del anterior: el cambio sale en rojo suave con su signo («-5.0 % vs …») y la frase dice «bajó»",
    tipo: "estado",
    fuentes: [SECCION_INGRESO],
    ir: (c) => seccionB(c, "ingreso", { evolucion: (e) => ({ ...e, meses: (e.meses as Json[]).map((m, i, todos) => ({ ...m, ingreso_mensual_recurrente: i === todos.length - 1 ? "190000.00" : "200000.00" })) }), ejecutivo: conCartera }),
  },
  {
    id: "tabl-ingreso-igual",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Sección 06 con el mismo ingreso que el mes anterior: el cambio sale neutro («0.0 % vs …») y la frase dice «se mantuvo igual»",
    tipo: "estado",
    fuentes: [SECCION_INGRESO],
    ir: (c) => seccionB(c, "ingreso", { evolucion: (e) => ({ ...e, meses: (e.meses as Json[]).map((m) => ({ ...m, ingreso_mensual_recurrente: "200000.00" })) }), ejecutivo: conCartera }),
  },
  {
    id: "tabl-mapa-con-datos",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Sección 07 «¿Cuándo están llenos los salones?»: mapa de calor día × hora con el porcentaje en cada celda, rayado «sin clases», leyenda, «A reventar» y «Con lugares»",
    tipo: "pantalla",
    ruta: "/tableros",
    fuentes: [SECCION_MAPA, LEYENDA_CALOR, GRAFICAS_B],
    ir: (c) => seccionB(c, "mapa", { ejecutivo: conMapa }),
  },
  {
    id: "tabl-mapa-muchos-grupos",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Sección 07 con más de seis grupos a reventar y con lugares: la lista se corta y dice «Y N grupos más»",
    tipo: "estado",
    fuentes: [SECCION_MAPA],
    ir: (c) => seccionB(c, "mapa", { ejecutivo: (e) => conMapa({ ...e, ocupacion_por_grupo: multiplicarGrupos(e.ocupacion_por_grupo) }) }),
  },
  {
    id: "tabl-mapa-vacio",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Sección 07 sin grupos con horario: «No hay grupos con horario» y las dos listas vacías",
    tipo: "estado",
    fuentes: [SECCION_MAPA, BASICOS],
    ir: (c) => seccionB(c, "mapa", { ejecutivo: (e) => ({ ...e, mapa_ocupacion: [], ocupacion_por_grupo: [] }) }),
  },
  {
    id: "tabl-comparativo-con-datos",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Sección 08 «Por disciplina y sucursal»: una tarjeta por pareja con el color de su disciplina, alumnos, ingreso, ocupación y deserción; incluye una pareja con grupos y sin alumnos y otra sin grupos",
    tipo: "pantalla",
    ruta: "/tableros",
    fuentes: [SECCION_COMPARATIVO, GRAFICAS_B],
    ir: (c) => seccionB(c, "comparativo", { ejecutivo: conComparativo }),
  },
  {
    id: "tabl-comparativo-colores",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Sección 08 con tres disciplinas de color distinto (el punto y la barra toman su `color_marca`; cada tarjeta escribe el nombre de la disciplina)",
    tipo: "estado",
    fuentes: [SECCION_COMPARATIVO],
    ir: async (c) => {
      await parchearGetB(c, (u) => u.pathname === "/api/verticales", (r) => {
        const base = (r.datos as Json[])[0];
        return base ? { ...r, datos: [{ ...base, color_marca: "#d9531e" }, { ...base, id: `${base.id}-2`, nombre: "Disciplina B", color_marca: "#c43c78" }, { ...base, id: `${base.id}-3`, nombre: "Disciplina C", color_marca: "#1f8f8f" }] } : r;
      });
      await seccionB(c, "comparativo", {
        ejecutivo: (e) => {
          const base = (e.comparativo as Json[])[0];
          if (!base) return e;
          const fila = (n: string, v: string, alumnos: number, oc: string, des: string): Json => ({ ...base, vertical: { id: v, nombre: n }, alumnos, inscripciones: alumnos, ingreso_mensual_recurrente: `${alumnos * 650}.00`, ocupados: Math.round(Number(oc)), cupo_maximo: 100, ocupacion: `${oc}.0`, desercion: des, desercion_texto: `${des} %` });
          return { ...e, comparativo: [fila("Vertical Prueba", base.vertical.id, 61, "78", "4.1"), fila("Disciplina B", `${base.vertical.id}-2`, 55, "88", "5.2"), fila("Disciplina C", `${base.vertical.id}-3`, 28, "52", "9.4")] };
        },
      });
    },
  },
  {
    id: "tabl-comparativo-vacio",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Sección 08 sin parejas: «Todavía no hay nada que comparar»",
    tipo: "estado",
    fuentes: [SECCION_COMPARATIVO, BASICOS],
    ir: (c) => seccionB(c, "comparativo", { ejecutivo: (e) => ({ ...e, comparativo: [] }) }),
  },
];
