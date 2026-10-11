// Ayudas de las escenas de las secciones 05 a 08 de Tableros (R3b-B). Viven en su propio archivo para no mezclarse con las de `escenas-tableros.ts`. No es un archivo de escenas
// (no se llama `escenas-*.ts`): lo importa `escenas-tableros.ts`.

import type { Route } from "@playwright/test";
import { irA, type Contexto } from "./escenas.ts";

type Json = any;
type Reporte = Json;

export const SECCION_RETENCION = "web/src/pantallas/tableros/SeccionRetencion.tsx";
export const SECCION_INGRESO = "web/src/pantallas/tableros/SeccionIngreso.tsx";
export const SECCION_MAPA = "web/src/pantallas/tableros/SeccionMapaDeCalor.tsx";
export const SECCION_COMPARATIVO = "web/src/pantallas/tableros/SeccionComparativo.tsx";
export const LEYENDA_CALOR = "web/src/pantallas/tableros/LeyendaDeCalor.tsx";
export const GRAFICAS_B = "web/src/pantallas/tableros/graficas-b.ts";

const esApi = (u: URL): boolean => u.pathname.startsWith("/api/");
const esReporte = (parte: string) => (u: URL): boolean => u.pathname === `/api/reportes/${parte}`;

/** Parcha la respuesta (JSON) de las peticiones GET que cumplan `coincide`. */
export async function parchearGet(c: Contexto, coincide: (u: URL) => boolean, parche: (cuerpo: Json) => Json): Promise<void> {
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

export interface Parches {
  evolucion?: (r: Reporte) => Reporte;
  ejecutivo?: (r: Reporte) => Reporte;
}

/** Deja a la vista solo la sección pedida (las demás se esconden desde la escena, no desde la aplicación) y la lleva al inicio de la página. */
export async function soloSeccion(c: Contexto, id: string): Promise<void> {
  await c.page.getByTestId(`seccion-${id}`).waitFor();
  await c.page.evaluate((visible) => {
    document.querySelectorAll<HTMLElement>(".tablero-seccion").forEach((el) => {
      if (el.dataset["seccion"] !== visible) el.style.display = "none";
    });
    window.scrollTo(0, 0);
  }, id);
  await c.page.waitForTimeout(200);
}

/** La página de Tableros con la respuesta de `evolucion` y de `ejecutivo` parchadas, mostrando solo una sección. */
export async function seccionB(c: Contexto, id: string, p: Parches): Promise<void> {
  if (p.evolucion) await parchearGet(c, esReporte("evolucion"), p.evolucion);
  if (p.ejecutivo) await parchearGet(c, esReporte("ejecutivo"), p.ejecutivo);
  await irA(c, "/tableros");
  await soloSeccion(c, id);
}

const MESES_DE_EJEMPLO = ["2025-10", "2025-11", "2025-12", "2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"];
const INGRESO_DE_EJEMPLO = [177500, 183100, 178200, 198000, 210000, 216400, 217800, 218500, 213500, 200800, 203600, 220700];
const COHORTES_DE_EJEMPLO: [number, number[]][] = [[24, [90, 85, 80, 75, 70, 66]], [19, [88, 84, 79, 74, 69, 65]], [11, [85, 80, 76, 70, 66, 61]], [38, [91, 86, 80, 74, 70, 64]], [26, [89, 84, 79, 72, 68, 63]], [21, [90, 86, 76, 71, 67, 62]], [16, [88, 81, 75, 69, 63]], [14, [93, 86, 79, 71]], [12, [83, 75, 67]], [8, [88, 75]], [22, [91]], [41, []]];

/** Doce cohortes de ejemplo que terminan en el mes de la serie (los meses más viejos con más seguimiento). */
export function conCohortes(e: Reporte): Reporte {
  const meses = (e.meses as Json[]).map((m) => m.mes as string);
  const cohortes = COHORTES_DE_EJEMPLO.map(([altas, v], i) => ({
    mes: meses[i] ?? MESES_DE_EJEMPLO[i],
    altas,
    seguimiento: [1, 2, 3, 4, 5, 6].map((k) => ({ mes_n: k, siguen: v[k - 1] === undefined ? null : Math.round((altas * v[k - 1]!) / 100), porcentaje: v[k - 1] === undefined ? null : `${v[k - 1]}.0` })),
  }));
  const promedio = [1, 2, 3, 4, 5, 6].map((k) => {
    const con = COHORTES_DE_EJEMPLO.filter((x) => x[1][k - 1] !== undefined);
    const suma = con.reduce((a, x) => a + x[1][k - 1]!, 0);
    return { mes_n: k, siguen: con.length, altas: con.length, porcentaje: con.length ? (suma / con.length).toFixed(1) : null };
  });
  return { ...e, cohortes, promedio };
}

export function conIngreso(e: Reporte): Reporte {
  const meses = (e.meses as Json[]).map((m, i) => ({ ...m, ingreso_mensual_recurrente: `${INGRESO_DE_EJEMPLO[i] ?? 0}.00` }));
  return { ...e, meses };
}

export const CARTERA_EN_CERO = { total: "0.00", antiguedad: { de_0_a_30: "0.00", de_31_a_60: "0.00", de_61_a_90: "0.00", mas_de_90: "0.00" }, familias: 0, familias_por_tramo: { de_0_a_30: 0, de_31_a_60: 0, de_61_a_90: 0, mas_de_90: 0 } };

export function conCartera(e: Reporte): Reporte {
  return { ...e, cartera_vencida: { total: "18650.00", antiguedad: { de_0_a_30: "10900.00", de_31_a_60: "4350.00", de_61_a_90: "2100.00", mas_de_90: "1300.00" }, familias: 22, familias_por_tramo: { de_0_a_30: 14, de_31_a_60: 6, de_61_a_90: 3, mas_de_90: 2 } } };
}

const OCUPACION_DE_EJEMPLO = [[0, 0, 0, 0, 0, 72], [0, 0, 0, 0, 0, 80], [0, 0, 0, 0, 0, 55], [0, 0, 0, 0, 0, 31], [96, 62, 98, 60, 45, 0], [100, 75, 97, 71, 52, 0], [85, 80, 88, 77, 44, 0], [68, 84, 66, 82, 50, 0], [41, 56, 38, 61, 0, 0]];
const HORAS_DE_EJEMPLO = [9, 10, 11, 12, 16, 17, 18, 19, 20];

/** Un mapa con celdas en cada nivel de la escala (y vacías) y grupos a reventar y con lugares (se les pone el estado a los reales, sin cambiar sus nombres). */
export function conMapa(e: Reporte): Reporte {
  const mapa: Json[] = [];
  OCUPACION_DE_EJEMPLO.forEach((fila, i) =>
    fila.forEach((v, j) => {
      if (v > 0) mapa.push({ dia_semana: j + 1, hora: HORAS_DE_EJEMPLO[i], grupos: v >= 95 ? 2 : 1, ocupados: v, cupo_maximo: 100, ocupacion: `${v}.0`, estado: v >= 95 ? "a_reventar" : v < 50 ? "vacio" : "normal" });
    }),
  );
  const grupos = (e.ocupacion_por_grupo as Json[]).map((g, i) => (i < 3 ? { ...g, ocupados: g.cupo_maximo, ocupacion: "100.0", estado: "a_reventar" } : i < 5 ? { ...g, ocupados: Math.floor(g.cupo_maximo / 3), ocupacion: "33.3", estado: "vacio" } : g));
  return { ...e, mapa_ocupacion: mapa, ocupacion_por_grupo: grupos };
}

/** Repite los grupos con id distinto hasta pasar de seis a reventar y seis con lugares. */
export function multiplicarGrupos(lista: Json[]): Json[] {
  const salida: Json[] = [];
  for (let i = 0; i < 16 && lista.length > 0; i++) {
    const g = lista[i % lista.length]!;
    const llenos = i % 2 === 0;
    salida.push({ ...g, grupo: { id: `${g.grupo.id}-r${i}`, nombre: `${g.grupo.nombre} ${i + 1}` }, ocupados: llenos ? g.cupo_maximo : 1, ocupacion: llenos ? "100.0" : "7.1", estado: llenos ? "a_reventar" : "vacio" });
  }
  return salida;
}

/** Las parejas reales más una con grupos y sin alumnos, otra sin grupos (ocupación nula) con deserción alta y otra con deserción media, para ver los tres tonos de la deserción. */
export function conComparativo(e: Reporte): Reporte {
  const reales = e.comparativo as Json[];
  const primera = reales[0];
  if (!primera) return e;
  const copia = (sufijo: string, cambios: Json): Json => ({ ...primera, sucursal: { id: `${primera.sucursal.id}-${sufijo}`, nombre: `${primera.sucursal.nombre} ${sufijo}` }, ...cambios });
  const mas = [
    copia("a", { alumnos: 0, inscripciones: 0, ingreso_mensual_recurrente: "0.00", ocupados: 0, cupo_maximo: 16, ocupacion: "0.0", altas_del_mes: 0, bajas_del_mes: 0, base_al_inicio_del_mes: 0, desercion: null, desercion_texto: "—" }),
    copia("b", { alumnos: 28, inscripciones: 28, ingreso_mensual_recurrente: "16800.00", ocupados: 0, cupo_maximo: 0, ocupacion: null, altas_del_mes: 1, bajas_del_mes: 3, base_al_inicio_del_mes: 32, desercion: "9.4", desercion_texto: "9.4 %" }),
    copia("c", { alumnos: 43, inscripciones: 43, ingreso_mensual_recurrente: "25800.00", ocupados: 52, cupo_maximo: 70, ocupacion: "74.3", altas_del_mes: 4, bajas_del_mes: 3, base_al_inicio_del_mes: 49, desercion: "6.1", desercion_texto: "6.1 %" }),
  ];
  return { ...e, comparativo: [...reales, ...mas] };
}
