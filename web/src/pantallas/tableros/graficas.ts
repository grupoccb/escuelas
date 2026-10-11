import { formatearFecha } from "../../lib/fechas.ts";
import { enteroDeTexto, pixelAbajo, pixelEntero, pixelesDelPorcentaje } from "../../ui/numeros.ts";

// Geometría de las gráficas, sin números flotantes: el largo de una barra es un porcentaje con un decimal calculado con enteros (`bigint`), también para los importes.

/** Cuánto mide `valor` frente a `maximo`, de 0 a 100 con un decimal, como texto («37.5»). Sin máximo (o máximo cero) no hay barra: «0.0». */
export function porcentajeDeBarra(valor: bigint, maximo: bigint): string {
  if (maximo <= 0n || valor <= 0n) return "0.0";
  const p = valor >= maximo ? 1000n : (valor * 1000n) / maximo;
  return `${p / 10n}.${p % 10n}`;
}

/** El mayor de una lista de bigint (0 si está vacía). */
export function maximoDe(valores: readonly bigint[]): bigint {
  return valores.reduce((m, v) => (v > m ? v : m), 0n);
}

export interface FilaDeBarra {
  clave: string;
  etiqueta: string;
  valor: bigint;
  /** Lo que se escribe junto a la barra («$1,200.00», «12 de 15»). */
  texto: string;
  /** Un segundo valor dibujado detrás (por ejemplo, las agendadas detrás de las asistidas). */
  fondo?: bigint;
  nota?: string;
}

// ── Meses y rangos ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"] as const;
const MESES_CORTOS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"] as const;

/** `AAAA-MM` → año y mes (1 a 12); null si no es un mes. */
export function partesDeMes(mes: string): { anio: number; mes: number } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(mes);
  if (!m) return null;
  const n = enteroDeTexto(m[2]!);
  return n >= 1 && n <= 12 ? { anio: enteroDeTexto(m[1]!), mes: n } : null;
}

/** «septiembre» (en minúsculas, para media frase). */
export function nombreDeMes(mes: string): string {
  const p = partesDeMes(mes);
  return p ? MESES[p.mes - 1]! : mes;
}

/** «Septiembre 2026». */
export function etiquetaDeMes(mes: string): string {
  const p = partesDeMes(mes);
  if (!p) return mes;
  const nombre = MESES[p.mes - 1]!;
  return `${nombre.charAt(0).toUpperCase()}${nombre.slice(1)} ${p.anio}`;
}

/** «Sep» (tres letras). */
export function mesCorto(mes: string): string {
  const p = partesDeMes(mes);
  return p ? MESES_CORTOS[p.mes - 1]! : mes;
}

/** El mes anterior: `2026-01` → `2025-12`. */
export function mesAnterior(mes: string): string {
  const p = partesDeMes(mes);
  if (!p) return mes;
  const anio = p.mes === 1 ? p.anio - 1 : p.anio;
  const n = p.mes === 1 ? 12 : p.mes - 1;
  return `${String(anio).padStart(4, "0")}-${String(n).padStart(2, "0")}`;
}

/** Del primer al último día del mes, `AAAA-MM-DD`. */
export function rangoDelMes(mes: string): { desde: string; hasta: string } {
  const p = partesDeMes(mes);
  if (!p) return { desde: "", hasta: "" };
  const ultimo = new Date(Date.UTC(p.anio, p.mes, 0)).getUTCDate();
  const base = `${String(p.anio).padStart(4, "0")}-${String(p.mes).padStart(2, "0")}`;
  return { desde: `${base}-01`, hasta: `${base}-${String(ultimo).padStart(2, "0")}` };
}

/**
 * El rango de las secciones de captación (01 a 03): el que la persona escribió (cualquiera de las dos fechas, el otro extremo queda abierto, como siempre) o, si no escribió nada,
 * el mes elegido.
 */
export function rangoDeCaptacion(mes: string, desde: string, hasta: string): { desde: string; hasta: string; delMes: boolean } {
  if (desde !== "" || hasta !== "") return { desde, hasta, delMes: false };
  return { ...rangoDelMes(mes), delMes: true };
}

/** Cómo se dice el rango en una frase: «en septiembre», «del 1 ene 2026 al 31 mar 2026», «desde el 1 ene 2026», «hasta el 31 mar 2026». */
export function textoDelRango(mes: string, rango: { desde: string; hasta: string; delMes: boolean }): string {
  if (rango.delMes) return `en ${nombreDeMes(mes)}`;
  if (rango.desde !== "" && rango.hasta !== "") return `del ${formatearFecha(rango.desde)} al ${formatearFecha(rango.hasta)}`;
  if (rango.desde !== "") return `desde el ${formatearFecha(rango.desde)}`;
  return rango.hasta !== "" ? `hasta el ${formatearFecha(rango.hasta)}` : "en todo el historial";
}

// ── Porcentajes y cambios, con enteros ───────────────────────────────────────────────────────────────────────────────────────────────────────────

/** `"42.9"` → 429 (décimas); null si no es un porcentaje con a lo más un decimal. */
export function decimasDe(texto: string | null | undefined): number | null {
  if (texto === null || texto === undefined) return null;
  const m = /^(-?)(\d+)(?:\.(\d))?$/.exec(texto);
  if (!m) return null;
  const v = enteroDeTexto(m[2]!) * 10 + enteroDeTexto(m[3] ?? "0");
  return m[1] === "-" ? -v : v;
}

/** `"42.9"` → «43» (al entero más cercano; .5 sube). */
export function redondeado(texto: string | null | undefined): string | null {
  const d = decimasDe(texto);
  if (d === null) return null;
  return String(d < 0 ? -pixelAbajo((-d + 5) / 10) : pixelAbajo((d + 5) / 10));
}

/** El cambio de `actual` frente a `anterior` en porcentaje con un decimal, con enteros (centavos): «+3.2», «-1.5», «0.0». null si no hay con qué comparar. */
export function cambioPorcentual(actual: bigint, anterior: bigint): string | null {
  if (anterior <= 0n) return null;
  const diferencia = (actual - anterior) * 1000n;
  const negativo = diferencia < 0n;
  const absoluta = negativo ? -diferencia : diferencia;
  const decimas = (absoluta * 2n + anterior) / (anterior * 2n);
  const texto = `${decimas / 10n}.${decimas % 10n}`;
  if (decimas === 0n) return "0.0";
  return `${negativo ? "-" : "+"}${texto}`;
}

/** Cuánto es `parte` de `total`, en porcentaje entero («56»); null sin total. */
export function porcentajeEntero(parte: number, total: number): string | null {
  if (total <= 0) return null;
  return String(pixelAbajo((parte * 100 * 2 + total) / (total * 2)));
}

// ── Barras divergentes de 12 meses (sección 04) ──────────────────────────────────────────────────────────────────────────────────────────────────

export interface MesDeTendencia {
  mes: string;
  altas: number;
  bajas: number;
  activos: number;
}

export interface PuntoGeometrico {
  mes: string;
  /** Centro de la columna. */
  x: number;
  /** Lado izquierdo y ancho de la columna (la que se resalta al elegir el mes). */
  columnaX: number;
  columnaAncho: number;
  barraX: number;
  barraAncho: number;
  /** Arriba del eje: la barra de altas va de `altaY` al eje. Abajo: la de bajas va del eje a `eje + bajaAlto`. */
  altaY: number;
  altaAlto: number;
  bajaAlto: number;
  /** Altura del punto de la línea de activos. */
  activoY: number;
}

export interface GeometriaDeTendencia {
  ancho: number;
  alto: number;
  /** La línea del eje (donde se juntan las barras de altas y de bajas). */
  eje: number;
  /** Dónde empieza la zona de barras (la línea de activos va arriba). */
  zonaDeBarras: number;
  /** Dónde se escribe el nombre del mes. */
  etiquetaY: number;
  /** Los puntos de la línea de activos, `x,y x,y …`. */
  linea: string;
  puntos: PuntoGeometrico[];
}

const LINEA_ALTO = 110;
const BARRAS_ALTO = 190;
const EJE_EN_BARRAS = 100;
const ALTAS_MAXIMO = 82;
const BAJAS_MAXIMO = 52;
const LINEA_ARRIBA = 14;
const LINEA_ABAJO = 96;

const proporcional = (valor: number, maximo: number, tope: number): number => (maximo <= 0 || valor <= 0 ? 0 : pixelEntero((valor * tope) / maximo));

/** Dónde va cada cosa de la gráfica de altas, bajas y activos para un ancho dado, en píxeles enteros (el SVG se dibuja a su tamaño real: el texto no se deforma). */
export function geometriaDeTendencia(meses: readonly MesDeTendencia[], ancho: number): GeometriaDeTendencia {
  const n = Math.max(1, meses.length);
  const ranura = ancho / n;
  const maximoAB = Math.max(1, ...meses.map((m) => Math.max(m.altas, m.bajas)));
  const minimoA = meses.length > 0 ? Math.min(...meses.map((m) => m.activos)) : 0;
  const maximoA = meses.length > 0 ? Math.max(...meses.map((m) => m.activos)) : 0;
  const rango = Math.max(1, maximoA - minimoA);
  const eje = LINEA_ALTO + EJE_EN_BARRAS;
  const puntos = meses.map((m, i): PuntoGeometrico => {
    const x = pixelEntero((i + 0.5) * ranura);
    const barraAncho = Math.max(2, pixelesDelPorcentaje(ranura, 52));
    const altaAlto = proporcional(m.altas, maximoAB, ALTAS_MAXIMO);
    return {
      mes: m.mes,
      x,
      columnaX: pixelEntero(i * ranura),
      columnaAncho: pixelEntero((i + 1) * ranura) - pixelEntero(i * ranura),
      barraX: pixelEntero(x - barraAncho / 2),
      barraAncho,
      altaY: eje - altaAlto,
      altaAlto,
      bajaAlto: proporcional(m.bajas, maximoAB, BAJAS_MAXIMO),
      activoY: LINEA_ABAJO - pixelEntero(((m.activos - minimoA) * (LINEA_ABAJO - LINEA_ARRIBA)) / rango),
    };
  });
  return {
    ancho,
    alto: LINEA_ALTO + BARRAS_ALTO,
    eje,
    zonaDeBarras: LINEA_ALTO,
    etiquetaY: LINEA_ALTO + BARRAS_ALTO - 6,
    linea: puntos.map((p) => `${p.x},${p.activoY}`).join(" "),
    puntos,
  };
}

/** El índice del mes con el mayor valor de `campo` (el primero si empatan); -1 si todos son cero o no hay meses. */
export function indiceDelMaximo(meses: readonly MesDeTendencia[], campo: "altas" | "bajas"): number {
  let mejor = -1;
  let valor = 0;
  meses.forEach((m, i) => {
    if (m[campo] > valor) {
      valor = m[campo];
      mejor = i;
    }
  });
  return mejor;
}
