// Escenas del área Tableros (`/tableros`): clases muestra, costo por campaña (con su diálogo «Gastos de la campaña») y ejecutivo, con sus filtros, estados y gráficas de barras.
// Prefijo de ids: `tabl-`.
//
// Ninguna escena escribe en la base. Los estados que el mundo de datos no trae (vacío, muchos datos, gastos capturados, un mes sin historia…) se arman parchando la respuesta real de la
// API desde el navegador, y las escrituras del diálogo de gastos (capturar, dar de baja) se SIMULAN con una lista de gastos que vive solo en la página de la escena: así lo que se
// ve no depende de lo que otra escena haya hecho, ni cambia el costo que ven las demás.

import type { Route } from "@playwright/test";
import { conCargando, conError, cortarLaRed, esperarListo, fallarLaSiguienteEscritura, irA, type Contexto, type Escena, type RolEscena } from "./escenas.ts";

const GRUPO = "Tableros";
const TABLEROS = "web/src/pantallas/tableros/Tableros.tsx";
const CLASES = "web/src/pantallas/tableros/ClasesMuestra.tsx";
const COSTO = "web/src/pantallas/tableros/CostoPorCampana.tsx";
const EJECUTIVO = "web/src/pantallas/tableros/Ejecutivo.tsx";
const FILTROS = "web/src/pantallas/tableros/Filtros.tsx";
const BARRAS = "web/src/pantallas/tableros/Barras.tsx";
const DIALOGO = "web/src/ui/Dialogo.tsx";
const AVISOS = "web/src/ui/avisos.tsx";
const BASICOS = "web/src/ui/basicos.tsx";

const RUTA_CLASES = "/tableros";
const RUTA_COSTO = "/tableros?vista=costo";
const RUTA_EJECUTIVO = "/tableros?vista=ejecutivo";

// ─── Ayudas propias ──────────────────────────────────────────────────────────────────────────

type Json = any;  
const esApi = (u: URL): boolean => u.pathname.startsWith("/api/");
const esReporte = (parte: string) => (u: URL): boolean => u.pathname === `/api/reportes/${parte}`;
const esGastos = (u: URL): boolean => /^\/api\/campanas\/[^/]+\/gastos(\/[^/]+)?$/.test(u.pathname);

/** `AAAA-MM-DD` de hace `dias` días (hora de la zona de las sucursales de prueba). */
function fechaMx(dias: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(Date.now() - dias * 86_400_000));
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

async function conMuchos(c: Contexto, parte: string, ruta: string): Promise<void> {
  await parchearGet(c, esReporte(parte), (cuerpo) => multiplicar(cuerpo, 8));
  await irA(c, ruta);
}

const CLASES_EN_CERO = { agendadas: 0, asistidas: 0, no_asistidas: 0, canceladas: 0, pendientes: 0, inscritas: 0, inscritas_a_mano: 0, conversion: null };

async function clasesVacio(c: Contexto): Promise<void> {
  await parchearGet(c, esReporte("clases-muestra"), (r) => ({ ...r, total: { ...r.total, ...CLASES_EN_CERO }, por_fuente: [], por_vertical: [], por_sucursal: [] }));
  await irA(c, RUTA_CLASES);
}

async function costoVacio(c: Contexto): Promise<void> {
  await parchearGet(c, esReporte("costo-por-alumno"), (r) => ({
    ...r,
    filas: [],
    total: { ...r.total, gasto: "0.00", leads: 0, clases_muestra: 0, clases_asistidas: 0, inscripciones_activas: 0, inscritos_a_mano: 0, alumnos_inscritos: 0, costo_por_lead_texto: "—", costo_por_clase_muestra_texto: "—", costo_por_alumno_texto: "—" },
  }));
  await irA(c, RUTA_COSTO);
}

/** Todas las campañas con gasto capturado y algunos inscritos a mano: sin el aviso de «campañas sin gasto» y con la nota de los inscritos a mano. */
async function costoConGastoEnTodas(c: Contexto): Promise<void> {
  await parchearGet(c, esReporte("costo-por-alumno"), (r) => {
    const filas = (r.filas as Json[]).map((f) => ({ ...f, gasto: "1500.00", inscritos_a_mano: 1, alumnos_inscritos: f.inscripciones_activas + 1, costo_por_lead_texto: f.leads > 0 ? "375.00" : "—", costo_por_clase_muestra_texto: f.clases_muestra > 0 ? "375.00" : "—", costo_por_alumno_texto: "750.00" }));
    return { ...r, filas, total: { ...r.total, gasto: `${1500 * filas.length}.00`, inscritos_a_mano: filas.length, costo_por_lead_texto: "375.00", costo_por_clase_muestra_texto: "375.00", costo_por_alumno_texto: "750.00" } };
  });
  await irA(c, RUTA_COSTO);
}

async function ejecutivoVacio(c: Contexto): Promise<void> {
  const cero = "0.00";
  await parchearGet(c, esReporte("ejecutivo"), (r) => ({
    ...r,
    activos: { total_alumnos: 0, total_inscripciones: 0, por_vertical_y_sucursal: [] },
    altas_del_mes: 0,
    bajas_del_mes: 0,
    base_al_inicio_del_mes: 0,
    desercion: null,
    desercion_texto: "—",
    ingreso_mensual_recurrente: cero,
    cartera_vencida: { total: cero, antiguedad: { de_0_a_30: cero, de_31_a_60: cero, de_61_a_90: cero, mas_de_90: cero } },
    ocupacion_por_grupo: [],
  }));
  await irA(c, RUTA_EJECUTIVO);
}

/** La pantalla carga con red; después se corta, se pide otra cosa (`pedir`) y se espera el error de carga «No hay conexión…». */
async function sinConexion(c: Contexto, ruta: string, pedir: () => Promise<void>): Promise<void> {
  await irA(c, ruta);
  await cortarLaRed(c);
  await pedir();
  await c.page.getByText(/No hay conexión/).first().waitFor();
  await c.page.context().setOffline(false);
  await esperarListo(c.page);
}

const tablero = (c: Contexto, id: string) => c.page.getByTestId(id);

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
  await irA(c, RUTA_COSTO);
  const fila = tablero(c, `costo-${c.mundo.tableros.campana.id}`);
  await fila.getByRole("button", { name: "Capturar o ver gastos" }).click();
  await c.page.locator("dialog[open]").waitFor();
  if (esperarLista) await c.page.getByTestId("gasto-total").waitFor();
  await esperarListo(c.page);
}

const dialogo = (c: Contexto) => c.page.locator("dialog[open]");
const capturarElGasto = (c: Contexto) => dialogo(c).getByRole("button", { name: "Capturar el gasto" }).click();

// ─── Escenas ─────────────────────────────────────────────────────────────────────────────────

/** Las tres pestañas son del administrador; el asesor ve «Clases muestra» y «Ejecutivo» (sin dinero de marketing). */
const ROL_ASESOR: RolEscena = "asesor";

export const ESCENAS: Escena[] = [
  // ── Clases muestra ──
  {
    id: "tabl-clases-con-datos",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Tableros, pestaña «Clases muestra» del administrador: filtros, indicadores, barras por fuente, disciplina y sucursal, y tablas",
    tipo: "pantalla",
    ruta: "/tableros",
    fuentes: [TABLEROS, CLASES, FILTROS, BARRAS],
    ir: (c) => irA(c, RUTA_CLASES),
  },
  {
    id: "tabl-clases-asesor",
    rol: ROL_ASESOR,
    grupo: GRUPO,
    titulo: "Tableros, pestaña «Clases muestra» del asesor (solo «Clases muestra» y «Ejecutivo»; sin «Costo por campaña»)",
    tipo: "pantalla",
    ruta: "/tableros",
    fuentes: [TABLEROS, CLASES],
    ir: (c) => irA(c, RUTA_CLASES),
  },
  {
    id: "tabl-clases-asesor-pide-costo",
    rol: ROL_ASESOR,
    grupo: GRUPO,
    titulo: "El asesor abre /tableros?vista=costo: no hay esa pestaña y se queda en «Clases muestra»",
    tipo: "estado",
    ruta: "/tableros",
    fuentes: [TABLEROS],
    ir: (c) => irA(c, RUTA_COSTO),
  },
  {
    id: "tabl-clases-muchos-datos",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "«Clases muestra» con muchos datos (cada lista repetida ocho veces: barras y tablas largas)",
    tipo: "estado",
    fuentes: [CLASES, BARRAS],
    ir: (c) => conMuchos(c, "clases-muestra", RUTA_CLASES),
  },
  {
    id: "tabl-clases-vacio",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "«Clases muestra» vacía: indicadores en cero, aviso «No hay clases muestra en este rango.» y barras sin datos",
    tipo: "estado",
    fuentes: [CLASES, BARRAS, BASICOS],
    ir: clasesVacio,
  },
  {
    id: "tabl-clases-cargando",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "«Clases muestra» cargando (filtros y descarga ya puestos; el reporte todavía no llega)",
    tipo: "estado",
    fuentes: [CLASES, BASICOS],
    ir: (c) => conCargando(c, RUTA_CLASES),
  },
  {
    id: "tabl-clases-error",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "«Clases muestra» con error de carga (500) y botón «Reintentar»",
    tipo: "estado",
    fuentes: [CLASES, BASICOS],
    ir: (c) => conError(c, RUTA_CLASES),
  },
  {
    id: "tabl-clases-sin-conexion",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "«Clases muestra» sin conexión: al cambiar un filtro el error dice «No hay conexión…» sobre los datos que ya estaban",
    tipo: "estado",
    fuentes: [CLASES, BASICOS],
    ir: (c) => sinConexion(c, RUTA_CLASES, () => tablero(c, "tablero-clases-muestra").getByLabel("Desde").fill(fechaMx(30))),
  },
  {
    id: "tabl-clases-filtro-sucursal",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "«Clases muestra» filtrada por una sucursal sin clases (la sur): ceros y el aviso de rango sin clases",
    tipo: "estado",
    fuentes: [CLASES, FILTROS],
    ir: async (c) => {
      await irA(c, RUTA_CLASES);
      await tablero(c, "tablero-clases-muestra").getByLabel("Sucursal").selectOption({ label: c.mundo.sucursales.sur.nombre });
      await c.page.getByText("No hay clases muestra en este rango.").waitFor();
      await esperarListo(c.page);
    },
  },
  {
    id: "tabl-clases-filtro-disciplina",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "«Clases muestra» filtrada por una disciplina (la primera de la lista)",
    tipo: "estado",
    fuentes: [CLASES, FILTROS],
    ir: async (c) => {
      await irA(c, RUTA_CLASES);
      await tablero(c, "tablero-clases-muestra").getByLabel("Disciplina").selectOption({ index: 1 });
      await esperarListo(c.page);
    },
  },
  {
    id: "tabl-clases-filtro-rango",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "«Clases muestra» con rango de fechas elegido (últimos 30 días, con «Desde» y «Hasta» escritos)",
    tipo: "estado",
    fuentes: [CLASES, FILTROS],
    ir: async (c) => {
      await irA(c, RUTA_CLASES);
      await tablero(c, "tablero-clases-muestra").getByLabel("Desde").fill(fechaMx(30));
      await tablero(c, "tablero-clases-muestra").getByLabel("Hasta").fill(fechaMx(0));
      await esperarListo(c.page);
    },
  },
  {
    id: "tabl-clases-filtro-rango-invertido",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "«Clases muestra» con el rango al revés («Hasta» anterior a «Desde»): el servidor lo rechaza y se ve el error de carga",
    tipo: "estado",
    fuentes: [CLASES, FILTROS, BASICOS],
    ir: async (c) => {
      await irA(c, RUTA_CLASES);
      await tablero(c, "tablero-clases-muestra").getByLabel("Hasta").fill("2026-01-01");
      await c.page.getByRole("button", { name: "Reintentar" }).waitFor();
      await esperarListo(c.page);
    },
  },
  {
    id: "tabl-clases-filtro-rango-sin-fechas",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "«Clases muestra» con «Desde» borrado (sin ninguna fecha: todo el historial)",
    tipo: "estado",
    fuentes: [CLASES, FILTROS],
    ir: async (c) => {
      await irA(c, RUTA_CLASES);
      await tablero(c, "tablero-clases-muestra").getByLabel("Desde").fill("");
      await esperarListo(c.page);
    },
  },

  // ── Costo por campaña ──
  {
    id: "tabl-costo-con-datos",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Tableros, pestaña «Costo por campaña» del administrador: indicadores, aviso de campañas sin gasto, barras de gasto y tabla con «Capturar o ver gastos»",
    tipo: "pantalla",
    ruta: "/tableros",
    fuentes: [TABLEROS, COSTO, FILTROS, BARRAS, BASICOS],
    ir: (c) => irA(c, RUTA_COSTO),
  },
  {
    id: "tabl-costo-con-gasto-en-todas",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "«Costo por campaña» con gasto en todas las campañas y con inscritos a mano (sin aviso de campañas sin gasto; con la nota de inscritos a mano; respuesta ajustada)",
    tipo: "estado",
    fuentes: [COSTO],
    ir: costoConGastoEnTodas,
  },
  {
    id: "tabl-costo-muchos-datos",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "«Costo por campaña» con muchos datos (campañas repetidas ocho veces: barras y tabla largas)",
    tipo: "estado",
    fuentes: [COSTO, BARRAS],
    ir: (c) => conMuchos(c, "costo-por-alumno", RUTA_COSTO),
  },
  {
    id: "tabl-costo-vacio",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "«Costo por campaña» sin campañas: aviso «Todavía no hay campañas…», barras y tabla vacías",
    tipo: "estado",
    fuentes: [COSTO, BARRAS, BASICOS],
    ir: costoVacio,
  },
  {
    id: "tabl-costo-cargando",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "«Costo por campaña» cargando",
    tipo: "estado",
    fuentes: [COSTO, BASICOS],
    ir: (c) => conCargando(c, RUTA_COSTO),
  },
  {
    id: "tabl-costo-error",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "«Costo por campaña» con error de carga (500) y botón «Reintentar»",
    tipo: "estado",
    fuentes: [COSTO, BASICOS],
    ir: (c) => conError(c, RUTA_COSTO),
  },
  {
    id: "tabl-costo-sin-conexion",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "«Costo por campaña» sin conexión: al cambiar el rango el error dice «No hay conexión…»",
    tipo: "estado",
    fuentes: [COSTO, BASICOS],
    ir: (c) => sinConexion(c, RUTA_COSTO, () => tablero(c, "tablero-costo").getByLabel("Desde").fill(fechaMx(30))),
  },
  {
    id: "tabl-costo-filtro-rango",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "«Costo por campaña» con rango de fechas elegido (últimos 30 días; este tablero no tiene filtro de sucursal ni de disciplina)",
    tipo: "estado",
    fuentes: [COSTO, FILTROS],
    ir: async (c) => {
      await irA(c, RUTA_COSTO);
      await tablero(c, "tablero-costo").getByLabel("Desde").fill(fechaMx(30));
      await tablero(c, "tablero-costo").getByLabel("Hasta").fill(fechaMx(0));
      await esperarListo(c.page);
    },
  },
  {
    id: "tabl-costo-filtro-rango-invertido",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "«Costo por campaña» con el rango al revés: el servidor lo rechaza y se ve el error de carga",
    tipo: "estado",
    fuentes: [COSTO, FILTROS, BASICOS],
    ir: async (c) => {
      await irA(c, RUTA_COSTO);
      await tablero(c, "tablero-costo").getByLabel("Hasta").fill("2026-01-01");
      await c.page.getByRole("button", { name: "Reintentar" }).waitFor();
      await esperarListo(c.page);
    },
  },

  // ── Ejecutivo ──
  {
    id: "tabl-ejecutivo-con-datos",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Tableros, pestaña «Ejecutivo» del administrador: mes, descargas, seis indicadores, barras de activos, cartera y ocupación, y tabla de ocupación",
    tipo: "pantalla",
    ruta: "/tableros",
    fuentes: [TABLEROS, EJECUTIVO, BARRAS, BASICOS],
    ir: (c) => irA(c, RUTA_EJECUTIVO),
  },
  {
    id: "tabl-ejecutivo-asesor",
    rol: ROL_ASESOR,
    grupo: GRUPO,
    titulo: "Tableros, pestaña «Ejecutivo» del asesor (mismas cifras que el administrador; solo dos pestañas)",
    tipo: "pantalla",
    ruta: "/tableros",
    fuentes: [TABLEROS, EJECUTIVO],
    ir: (c) => irA(c, RUTA_EJECUTIVO),
  },
  {
    id: "tabl-ejecutivo-muchos-datos",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "«Ejecutivo» con muchos datos (disciplinas y grupos repetidos ocho veces)",
    tipo: "estado",
    fuentes: [EJECUTIVO, BARRAS],
    ir: (c) => conMuchos(c, "ejecutivo", RUTA_EJECUTIVO),
  },
  {
    id: "tabl-ejecutivo-vacio",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "«Ejecutivo» vacío (escuela sin alumnos ni grupos): indicadores en cero, deserción «—», barras con «Todavía no hay…»",
    tipo: "estado",
    fuentes: [EJECUTIVO, BARRAS, BASICOS],
    ir: ejecutivoVacio,
  },
  {
    id: "tabl-ejecutivo-cargando",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "«Ejecutivo» cargando",
    tipo: "estado",
    fuentes: [EJECUTIVO, BASICOS],
    ir: (c) => conCargando(c, RUTA_EJECUTIVO),
  },
  {
    id: "tabl-ejecutivo-error",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "«Ejecutivo» con error de carga (500) y botón «Reintentar»",
    tipo: "estado",
    fuentes: [EJECUTIVO, BASICOS],
    ir: (c) => conError(c, RUTA_EJECUTIVO),
  },
  {
    id: "tabl-ejecutivo-sin-conexion",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "«Ejecutivo» sin conexión: al cambiar el mes el error dice «No hay conexión…»",
    tipo: "estado",
    fuentes: [EJECUTIVO, BASICOS],
    ir: (c) => sinConexion(c, RUTA_EJECUTIVO, () => c.page.getByLabel("Mes").fill("2026-08")),
  },
  {
    id: "tabl-ejecutivo-mes-sin-historia",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "«Ejecutivo» con un mes sin historia (enero de 2020): altas y bajas en cero y deserción «—»",
    tipo: "estado",
    fuentes: [EJECUTIVO],
    ir: async (c) => {
      await irA(c, RUTA_EJECUTIVO);
      await c.page.getByLabel("Mes").fill("2020-01");
      await esperarListo(c.page);
    },
  },
  {
    id: "tabl-ejecutivo-mes-futuro",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "«Ejecutivo» con un mes futuro escrito a mano (el campo lo limita al mes actual; lo que responda el servidor se ve)",
    tipo: "estado",
    fuentes: [EJECUTIVO, BASICOS],
    ir: async (c) => {
      await irA(c, RUTA_EJECUTIVO);
      await c.page.getByLabel("Mes").fill("2031-01");
      await esperarListo(c.page);
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
      await dialogo(c).getByText("Escribe un importe válido").waitFor();
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
];
