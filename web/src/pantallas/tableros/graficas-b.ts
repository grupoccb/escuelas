// Lógica pura de las secciones 05 a 08 del tablero (retención, ingreso y cartera, mapa de calor, comparativo). Sin React: se prueba con `node:test` (`graficas-b.test.ts`).
//
// Todo con enteros: los porcentajes del servidor llegan como texto con un decimal («42.9») y aquí se manejan en DÉCIMAS (`bigint`, 429n); los importes, como centavos (`bigint`).
// Las coordenadas de las gráficas salen como TEXTO con dos decimales. Ninguna cifra pasa por un número de punto flotante.

import type { CeldaDeMapaDeOcupacion, EjecutivoDelTablero, EstadoDeOcupacion, FilaDeComparativo, OcupacionDeGrupo, PuntoMensual, ReporteDeEvolucion, TramoDeAntiguedad } from "../../api/tipos.ts";
import { aCentavos, formatear } from "../../lib/dinero.ts";
import { DIAS_LARGOS } from "../../lib/fechas.ts";

// ─── Meses ───────────────────────────────────────────────────────────────────────────────────

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"] as const;
const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"] as const;

const NUMEROS_DE_MES = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"];

function partesDeMes(mes: string): { anio: string; indice: number } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(mes);
  if (!m) return null;
  const indice = NUMEROS_DE_MES.indexOf(m[2]!);
  return indice >= 0 ? { anio: m[1]!, indice } : null;
}

/** «2026-09» → «septiembre». */
export function nombreDeMes(mes: string): string {
  const p = partesDeMes(mes);
  return p ? MESES[p.indice]! : mes;
}

/** «2026-09» → «sep». */
export function mesCorto(mes: string): string {
  const p = partesDeMes(mes);
  return p ? MESES_CORTOS[p.indice]! : mes;
}

const capitalizar = (t: string): string => t.charAt(0).toUpperCase() + t.slice(1);

/** El mes de una cohorte: «Marzo»; con el año («Marzo 2025») si no es el del último mes de la serie. */
export function nombreDeCohorte(mes: string, mesFinal: string): string {
  const p = partesDeMes(mes);
  const f = partesDeMes(mesFinal);
  if (!p) return mes;
  return f && f.anio !== p.anio ? `${capitalizar(MESES[p.indice]!)} ${p.anio}` : capitalizar(MESES[p.indice]!);
}

// ─── Porcentajes en décimas ──────────────────────────────────────────────────────────────────

/** «42.9» → 429n; «100.0» → 1000n. Un decimal; si hay más, el segundo redondea hacia arriba a partir de 5. Lo que no es un porcentaje → null. */
export function decimasDe(texto: string | null | undefined): bigint | null {
  if (texto === null || texto === undefined) return null;
  const m = /^(\d{1,6})(?:\.(\d+))?$/.exec(texto.trim());
  if (!m) return null;
  const dec = m[2] ?? "";
  let v = BigInt(m[1]!) * 10n + BigInt(dec.charAt(0) || "0");
  if (dec.charAt(1) >= "5" && dec.length > 1) v += 1n;
  return v;
}

/** Décimas → porcentaje entero más cercano (la mitad hacia arriba): 944n → 94n; 945n → 95n. */
export function enteroDeDecimas(d: bigint): bigint {
  return (d + 5n) / 10n;
}

/** «94.6» → 95n. */
export function porcentajeEntero(texto: string | null | undefined): bigint | null {
  const d = decimasDe(texto);
  return d === null ? null : enteroDeDecimas(d);
}

/** Décimas → texto con un decimal: 429n → «42.9»; 1000n → «100.0». */
export function textoDeDecimas(d: bigint): string {
  const neg = d < 0n;
  const abs = neg ? -d : d;
  return `${neg ? "-" : ""}${abs / 10n}.${abs % 10n}`;
}

/** parte / total en décimas, redondeando a la más cercana (mitad hacia arriba). 0 si el total no es positivo. */
export function decimasDeRazon(parte: bigint, total: bigint): bigint {
  if (total <= 0n || parte <= 0n) return 0n;
  return (parte * 2000n + total) / (total * 2n);
}

/** Centésimas (bigint) → texto con dos decimales: 12345n → «123.45». Para coordenadas. */
function centesimas(c: bigint): string {
  const neg = c < 0n;
  const abs = neg ? -c : c;
  return `${neg ? "-" : ""}${abs / 100n}.${(abs % 100n).toString().padStart(2, "0")}`;
}

// ─── Escala de calor (README «Mapa de calor y retención») ───────────────────────────────────

export type NivelDeCalor = 1 | 2 | 3 | 4 | 5;

/** Menos de 40 → 1 · 40–59 → 2 · 60–79 → 3 · 80–94 → 4 · 95 o más → 5. Recibe el porcentaje ENTERO que se escribe en la celda: lo que se ve y el color no pueden discrepar. */
export function nivelDeCalor(porcentaje: bigint): NivelDeCalor {
  if (porcentaje >= 95n) return 5;
  if (porcentaje >= 80n) return 4;
  if (porcentaje >= 60n) return 3;
  if (porcentaje >= 40n) return 2;
  return 1;
}

export const LEYENDA_DE_CALOR: readonly { nivel: NivelDeCalor; texto: string }[] = [
  { nivel: 1, texto: "Menos de 40 %" },
  { nivel: 2, texto: "40 a 59 %" },
  { nivel: 3, texto: "60 a 79 %" },
  { nivel: 4, texto: "80 a 94 %" },
  { nivel: 5, texto: "95 % o más" },
];

// ─── 05 Retención por cohortes ───────────────────────────────────────────────────────────────

export type EstadoDeCeldaDeRetencion = "dato" | "futuro" | "sin_altas";

export interface CeldaDeRetencion {
  mes_n: number;
  estado: EstadoDeCeldaDeRetencion;
  nivel: NivelDeCalor | null;
  /** Lo que se escribe en la celda: «90%» (vacío si todavía no pasa). */
  texto: string;
  /** Lo que dice al pasar el cursor y a un lector de pantalla. */
  titulo: string;
}

export interface FilaDeRetencion {
  clave: string;
  nombre: string;
  altas: number;
  celdas: CeldaDeRetencion[];
}

export const MESES_DE_SEGUIMIENTO = [1, 2, 3, 4, 5, 6] as const;

function celdaDeRetencion(nombre: string, altas: number, mesN: number, siguen: number | null, porcentaje: string | null): CeldaDeRetencion {
  if (siguen === null) return { mes_n: mesN, estado: "futuro", nivel: null, texto: "", titulo: "Todavía no pasa ese tiempo" };
  const p = porcentajeEntero(porcentaje);
  if (p === null) return { mes_n: mesN, estado: "sin_altas", nivel: null, texto: "—", titulo: `${nombre}: sin inscripciones ese mes` };
  return { mes_n: mesN, estado: "dato", nivel: nivelDeCalor(p), texto: `${p}%`, titulo: `${nombre}: ${p} % sigue al mes ${mesN} (${siguen} de ${altas})` };
}

/** Una fila por cohorte (mes de inscripción), con sus 6 meses de seguimiento. */
export function filasDeRetencion(evolucion: Pick<ReporteDeEvolucion, "cohortes" | "meses">): FilaDeRetencion[] {
  const final = evolucion.meses.at(-1)?.mes ?? evolucion.cohortes.at(-1)?.mes ?? "";
  return evolucion.cohortes.map((c) => {
    const nombre = nombreDeCohorte(c.mes, final);
    return {
      clave: c.mes,
      nombre,
      altas: c.altas,
      celdas: MESES_DE_SEGUIMIENTO.map((k) => {
        const s = c.seguimiento.find((x) => x.mes_n === k);
        return celdaDeRetencion(nombre, c.altas, k, s ? s.siguen : null, s ? s.porcentaje : null);
      }),
    };
  });
}

/** La fila «Promedio» (ponderado, el que calcula el servidor). */
export function filaDePromedio(promedio: ReporteDeEvolucion["promedio"]): CeldaDeRetencion[] {
  return MESES_DE_SEGUIMIENTO.map((k) => {
    const p = promedio.find((x) => x.mes_n === k);
    if (!p || p.altas === 0) return { mes_n: k, estado: "futuro", nivel: null, texto: "", titulo: "Todavía no pasa ese tiempo" } satisfies CeldaDeRetencion;
    const e = porcentajeEntero(p.porcentaje);
    if (e === null) return { mes_n: k, estado: "futuro", nivel: null, texto: "", titulo: "Todavía no pasa ese tiempo" } satisfies CeldaDeRetencion;
    return { mes_n: k, estado: "dato", nivel: nivelDeCalor(e), texto: `${e}%`, titulo: `En promedio, ${e} % sigue al mes ${k} (${p.siguen} de ${p.altas})` } satisfies CeldaDeRetencion;
  });
}

/** ¿Hay alguna inscripción en las cohortes? Sin ninguna no hay nada que medir. */
export function hayCohortes(cohortes: ReporteDeEvolucion["cohortes"]): boolean {
  return cohortes.some((c) => c.altas > 0);
}

const ORDINAL = ["primer", "segundo", "tercer", "cuarto", "quinto", "sexto"] as const;

/** «De cada 10 alumnos que se inscriben, 7 siguen a los 3 meses y 6 a los 6. El primer mes es el más delicado: ahí se va 1 de cada 10.» Null si todavía no hay ningún mes medido. */
export function fraseDeRetencion(promedio: ReporteDeEvolucion["promedio"]): string | null {
  const p = new Map<number, bigint>();
  for (const x of promedio) {
    const d = x.altas > 0 ? decimasDe(x.porcentaje) : null;
    if (d !== null) p.set(x.mes_n, d);
  }
  if (p.size === 0) return null;
  const deCada10 = (d: bigint): bigint => (d + 50n) / 100n;
  const ks = [3, 6].filter((k) => p.has(k));
  if (ks.length === 0) ks.push(Math.max(...p.keys()));
  const cuando = (k: number): string => (k === 1 ? "al mes" : `a los ${k} meses`);
  const primera =
    ks.length === 2
      ? `De cada 10 alumnos que se inscriben, ${deCada10(p.get(ks[0]!)!)} siguen ${cuando(ks[0]!)} y ${deCada10(p.get(ks[1]!)!)} a los ${ks[1]}.`
      : `De cada 10 alumnos que se inscriben, ${deCada10(p.get(ks[0]!)!)} siguen ${cuando(ks[0]!)}.`;
  // El mes en que más se pierde (el primero, si empatan): cada mes se compara con el anterior; el mes 0 es el 100 %.
  let peorMes = 0;
  let peorCaida = 0n;
  let anterior = 1000n;
  for (const k of MESES_DE_SEGUIMIENTO) {
    const v = p.get(k);
    if (v === undefined) break;
    const caida = anterior - v;
    if (caida > peorCaida) {
      peorCaida = caida;
      peorMes = k;
    }
    anterior = v;
  }
  const n = deCada10(peorCaida);
  if (peorMes === 0 || n < 1n) return primera;
  return `${primera} El ${ORDINAL[peorMes - 1]} mes es el más delicado: ahí ${n === 1n ? "se va 1" : `se van ${n}`} de cada 10.`;
}

// ─── Dinero para el texto ────────────────────────────────────────────────────────────────────

const AGRUPAR = new Intl.NumberFormat("es-MX", { useGrouping: true, maximumFractionDigits: 0 });

/** «$4,350» si son pesos cabales; «$4,350.50» si hay centavos. */
export function pesos(importe: string | null | undefined): string {
  const t = formatear(importe);
  return t.endsWith(".00") ? t.slice(0, -3) : t;
}

/** Pesos redondeados al entero más cercano (para los extremos del eje de una gráfica, que son una escala y no un dato). */
export function pesosEnteros(centavos: bigint): string {
  const c = (centavos + 50n) / 100n;
  return `$${AGRUPAR.format(c)}`;
}

// ─── 06 Ingreso recurrente y cartera vencida ─────────────────────────────────────────────────

export interface PuntoDeIngreso {
  mes: string;
  /** «sep». */
  corto: string;
  /** «septiembre 2026». */
  largo: string;
  valor: bigint;
  texto: string;
}

export function puntosDeIngreso(meses: readonly PuntoMensual[]): PuntoDeIngreso[] {
  return meses.map((m) => {
    const p = partesDeMes(m.mes);
    return { mes: m.mes, corto: mesCorto(m.mes), largo: p ? `${MESES[p.indice]} ${p.anio}` : m.mes, valor: aCentavos(m.ingreso_mensual_recurrente), texto: pesos(m.ingreso_mensual_recurrente) };
  });
}

export const ANCHO_DEL_AREA = 1200;
export const ALTO_DEL_AREA = 190;
/** La línea base del área y los márgenes verticales de la serie (el prototipo: 180 abajo, 15 arriba). */
const BASE_DEL_AREA = 180n;
const ALTO_UTIL_DEL_AREA = 165n;

export interface GeometriaDeArea {
  /** `points` de la polilínea. */
  linea: string;
  /** `d` del relleno bajo la línea. */
  area: string;
  ultimo: { x: string; y: string };
  /** Los extremos de la escala vertical (96 % del menor y 101 % del mayor): el eje, no un dato. */
  eje: { minimo: bigint; maximo: bigint };
}

/**
 * Una serie de importes como línea y área dentro de un lienzo de 1200 × 190 (el SVG se estira con `preserveAspectRatio="none"`): un punto por mes, centrado en su columna.
 * La escala deja 15 de margen arriba y la base en 180. Una serie sin variación se dibuja a media altura.
 */
export function geometriaDeArea(valores: readonly bigint[]): GeometriaDeArea | null {
  const n = valores.length;
  if (n === 0) return null;
  const menor = valores.reduce((a, v) => (v < a ? v : a));
  const mayor = valores.reduce((a, v) => (v > a ? v : a));
  const minimo = (menor * 96n) / 100n;
  const maximo = (mayor * 101n) / 100n;
  const rango = maximo - minimo;
  const puntos = valores.map((v, i) => {
    const x = (BigInt((2 * i + 1) * (ANCHO_DEL_AREA / 2)) * 100n) / BigInt(n);
    const y = rango > 0n ? BASE_DEL_AREA * 100n - ((v - minimo) * ALTO_UTIL_DEL_AREA * 100n) / rango : 10500n;
    return { x: centesimas(x), y: centesimas(y) };
  });
  const base = centesimas(BASE_DEL_AREA * 100n);
  const primero = puntos[0]!;
  const ultimo = puntos[n - 1]!;
  return {
    linea: puntos.map((p) => `${p.x},${p.y}`).join(" "),
    area: `M${primero.x},${base} ${puntos.map((p) => `L${p.x},${p.y}`).join(" ")} L${ultimo.x},${base} Z`,
    ultimo,
    eje: { minimo, maximo },
  };
}

/** Cambio de `anterior` a `actual` en porcentaje con un decimal y signo («4.1», «-3.0»); null si no hay base para comparar. */
export function cambioPorcentual(actual: string, anterior: string): string | null {
  const a = aCentavos(actual);
  const b = aCentavos(anterior);
  if (b <= 0n) return null;
  const dif = a - b;
  const abs = dif < 0n ? -dif : dif;
  const d = (abs * 2000n + b) / (b * 2n);
  return textoDeDecimas(dif < 0n && d > 0n ? -d : d);
}

/** «+4.1 %» / «-3.0 %» / «0.0 %». */
export function textoDeCambio(cambio: string): string {
  return cambio.startsWith("-") ? `${cambio} %` : cambio === "0.0" ? "0.0 %" : `+${cambio} %`;
}

export const TRAMOS_DE_CARTERA: readonly { clave: TramoDeAntiguedad; nombre: string }[] = [
  { clave: "de_0_a_30", nombre: "1 a 30 días" },
  { clave: "de_31_a_60", nombre: "31 a 60 días" },
  { clave: "de_61_a_90", nombre: "61 a 90 días" },
  { clave: "mas_de_90", nombre: "Más de 90 días" },
];

export const textoDeFamilias = (n: number): string => (n === 0 ? "sin familias" : n === 1 ? "1 familia" : `${n} familias`);

export interface TramoDeCartera {
  clave: TramoDeAntiguedad;
  nombre: string;
  nivel: 1 | 2 | 3 | 4;
  monto: string;
  texto: string;
  familias: number;
  textoFamilias: string;
  /** Posición y largo del tramo en la barra apilada, en % con un decimal («66.3»). */
  x: string;
  ancho: string;
}

export function tramosDeCartera(cartera: EjecutivoDelTablero["cartera_vencida"]): TramoDeCartera[] {
  const total = TRAMOS_DE_CARTERA.reduce((a, t) => a + aCentavos(cartera.antiguedad[t.clave]), 0n);
  let corrido = 0n;
  return TRAMOS_DE_CARTERA.map((t, i) => {
    const monto = cartera.antiguedad[t.clave];
    const ancho = decimasDeRazon(aCentavos(monto), total);
    const x = corrido;
    corrido += ancho;
    const familias = cartera.familias_por_tramo[t.clave];
    return { clave: t.clave, nombre: t.nombre, nivel: (i + 1) as 1 | 2 | 3 | 4, monto, texto: pesos(monto), familias, textoFamilias: textoDeFamilias(familias), x: textoDeDecimas(x), ancho: textoDeDecimas(ancho) };
  });
}

export function hayCartera(cartera: EjecutivoDelTablero["cartera_vencida"]): boolean {
  return aCentavos(cartera.total) > 0n;
}

/** «El ingreso recurrente creció 4.1 % en septiembre. De lo vencido, 66 % tiene menos de 30 días: todavía se recupera con un recordatorio.» */
export function fraseDeIngreso(meses: readonly PuntoMensual[], cartera: EjecutivoDelTablero["cartera_vencida"]): string {
  const partes: string[] = [];
  const ultimo = meses.at(-1);
  const previo = meses.at(-2);
  if (ultimo && previo) {
    const c = cambioPorcentual(ultimo.ingreso_mensual_recurrente, previo.ingreso_mensual_recurrente);
    const mes = nombreDeMes(ultimo.mes);
    if (c !== null) {
      const d = decimasDe(c.replace("-", ""));
      if (d === 0n) partes.push(`El ingreso recurrente se mantuvo igual en ${mes}.`);
      else partes.push(c.startsWith("-") ? `El ingreso recurrente bajó ${c.slice(1)} % en ${mes}.` : `El ingreso recurrente creció ${c} % en ${mes}.`);
    }
  }
  if (hayCartera(cartera)) {
    const t = aCentavos(cartera.total);
    const reciente = decimasDeRazon(aCentavos(cartera.antiguedad.de_0_a_30), t);
    partes.push(`De lo vencido, ${enteroDeDecimas(reciente)} % tiene menos de 30 días${reciente >= 500n ? ": todavía se recupera con un recordatorio." : "."}`);
  } else {
    partes.push("Nadie tiene saldo vencido.");
  }
  return partes.join(" ");
}

// ─── 07 Mapa de calor por día y hora ─────────────────────────────────────────────────────────

/** Lunes a sábado siempre; el domingo, solo si algún grupo empieza ese día. */
export function diasDelMapa(celdas: readonly CeldaDeMapaDeOcupacion[]): number[] {
  return celdas.some((c) => c.dia_semana === 0) ? [1, 2, 3, 4, 5, 6, 0] : [1, 2, 3, 4, 5, 6];
}

export const DIA_CORTO = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"] as const;

export interface CeldaDelMapa {
  dia: number;
  hora: number;
  conClases: boolean;
  nivel: NivelDeCalor | null;
  /** «96%» (vacío si no hay clases). */
  texto: string;
  /** Para pasar el cursor. */
  titulo: string;
  /** Para un lector de pantalla, tras el porcentaje: «2 grupos, 26 de 27 lugares». Vacío si no hay clases. */
  detalle: string;
  estado: EstadoDeOcupacion | null;
}

export interface FilaDelMapa {
  hora: number;
  /** «16:00». */
  etiqueta: string;
  celdas: CeldaDelMapa[];
}

export const etiquetaDeHora = (hora: number): string => `${hora}:00`;

const grupos = (n: number): string => (n === 1 ? "1 grupo" : `${n} grupos`);

/** Solo las horas en que empieza alguna clase (el prototipo salta las demás), de la más temprana a la más tarde. */
export function filasDelMapa(celdas: readonly CeldaDeMapaDeOcupacion[]): FilaDelMapa[] {
  const dias = diasDelMapa(celdas);
  const horas = [...new Set(celdas.map((c) => c.hora))].sort((a, b) => a - b);
  return horas.map((hora) => ({
    hora,
    etiqueta: etiquetaDeHora(hora),
    celdas: dias.map((dia) => {
      const c = celdas.find((x) => x.dia_semana === dia && x.hora === hora);
      const donde = `${DIAS_LARGOS[dia]} ${etiquetaDeHora(hora)}`;
      const p = c ? porcentajeEntero(c.ocupacion) : null;
      if (!c || p === null) return { dia, hora, conClases: false, nivel: null, texto: "", titulo: `${donde}: sin clases`, detalle: "", estado: null } satisfies CeldaDelMapa;
      const detalle = `${grupos(c.grupos)}, ${c.ocupados} de ${c.cupo_maximo} lugares`;
      return { dia, hora, conClases: true, nivel: nivelDeCalor(p), texto: `${p}%`, titulo: `${donde}: ${p} % ocupado (${detalle})`, detalle, estado: c.estado } satisfies CeldaDelMapa;
    }),
  }));
}

function nombreDeFranja(c: CeldaDeMapaDeOcupacion): string {
  return `${DIAS_LARGOS[c.dia_semana]} ${etiquetaDeHora(c.hora)} (${porcentajeEntero(c.ocupacion)} %)`;
}

function porOcupacion(a: CeldaDeMapaDeOcupacion, b: CeldaDeMapaDeOcupacion, descendente: boolean): number {
  const x = decimasDe(a.ocupacion) ?? 0n;
  const y = decimasDe(b.ocupacion) ?? 0n;
  const dif = descendente ? y - x : x - y;
  return dif > 0n ? 1 : dif < 0n ? -1 : a.hora - b.hora || a.dia_semana - b.dia_semana;
}

/** «Los horarios más llenos: lunes 16:00 (98 %), … Los que más lugares tienen: viernes 17:00 (45 %), … Ahí conviene abrir otro grupo o promover los que tienen lugar.» */
export function fraseDeMapa(celdas: readonly CeldaDeMapaDeOcupacion[]): string {
  if (celdas.length === 0) return "Todavía no hay grupos con horario para dibujar el mapa.";
  const llenos = celdas.filter((c) => c.estado === "a_reventar").sort((a, b) => porOcupacion(a, b, true)).slice(0, 3);
  const vacios = celdas.filter((c) => c.estado === "vacio").sort((a, b) => porOcupacion(a, b, false)).slice(0, 3);
  const partes: string[] = [];
  if (llenos.length > 0) partes.push(`Están a reventar: ${llenos.map(nombreDeFranja).join(", ")}.`);
  if (vacios.length > 0) partes.push(`Sobran lugares: ${vacios.map(nombreDeFranja).join(", ")}.`);
  if (partes.length === 0) return "Ningún horario está a reventar ni con lugares de sobra.";
  partes.push(llenos.length > 0 && vacios.length > 0 ? "Ahí conviene mover o promover grupos." : llenos.length > 0 ? "Ahí conviene abrir otro grupo." : "Ahí conviene promover los grupos.");
  return partes.join(" ");
}

export interface ItemDeGrupo {
  id: string;
  nombre: string;
  /** «lunes y miércoles de 16:00 a 17:00 · Sucursal». */
  detalle: string;
  /** «20 de 20». */
  cupo: string;
  /** «100 %». */
  ocupacion: string;
}

/** Los grupos de un estado (los más llenos primero para «a reventar»; los más vacíos primero para «vacío») y cuántos quedaron fuera por el límite. */
export function gruposDelEstado(lista: readonly OcupacionDeGrupo[], estado: EstadoDeOcupacion, limite: number): { visibles: ItemDeGrupo[]; fuera: number } {
  const delEstado = lista.filter((g) => g.estado === estado);
  const ordenados = [...delEstado].sort((a, b) => {
    const x = decimasDe(a.ocupacion) ?? 0n;
    const y = decimasDe(b.ocupacion) ?? 0n;
    const dif = estado === "vacio" ? x - y : y - x;
    return dif > 0n ? 1 : dif < 0n ? -1 : a.grupo.nombre.localeCompare(b.grupo.nombre, "es");
  });
  return {
    visibles: ordenados.slice(0, limite).map((g) => ({
      id: g.grupo.id,
      nombre: g.grupo.nombre,
      detalle: [g.horario_texto, g.sucursal.nombre].filter((t) => t !== "").join(" · "),
      cupo: `${g.ocupados} de ${g.cupo_maximo}`,
      ocupacion: `${porcentajeEntero(g.ocupacion) ?? 0n} %`,
    })),
    fuera: Math.max(0, ordenados.length - limite),
  };
}

// ─── 08 Comparativo disciplina × sucursal ────────────────────────────────────────────────────

export type NivelDeDesercion = "alta" | "media" | "baja";

/** 8 % o más es alta; 6 % o más, media. Se mide con el valor exacto del servidor. */
export function nivelDeDesercion(desercion: string | null): NivelDeDesercion | null {
  const d = decimasDe(desercion);
  if (d === null) return null;
  return d >= 80n ? "alta" : d >= 60n ? "media" : "baja";
}

export interface TarjetaComparativa {
  clave: string;
  verticalId: string;
  disciplina: string;
  sucursal: string;
  alumnos: number;
  /** «alumno» / «alumnos». */
  alumnosTexto: string;
  ingreso: string;
  /** Null: la disciplina no tiene grupos activos en esa sucursal. */
  ocupacion: { texto: string; ancho: string; lugares: string } | null;
  desercion: { texto: string; nivel: NivelDeDesercion | null };
  altas: number;
  bajas: number;
  sinAlumnos: boolean;
}

export function tarjetasComparativas(filas: readonly FilaDeComparativo[]): TarjetaComparativa[] {
  return filas.map((f) => {
    const dec = decimasDe(f.ocupacion);
    const ancho = dec === null ? "0.0" : textoDeDecimas(dec > 1000n ? 1000n : dec);
    return {
      clave: `${f.vertical.id}|${f.sucursal.id}`,
      verticalId: f.vertical.id,
      disciplina: f.vertical.nombre,
      sucursal: f.sucursal.nombre,
      alumnos: f.alumnos,
      alumnosTexto: f.alumnos === 1 ? "alumno" : "alumnos",
      ingreso: pesos(f.ingreso_mensual_recurrente),
      ocupacion: dec === null ? null : { texto: `${enteroDeDecimas(dec)}%`, ancho, lugares: `${f.ocupados} de ${f.cupo_maximo} lugares` },
      desercion: { texto: f.desercion === null ? "—" : f.desercion_texto, nivel: nivelDeDesercion(f.desercion) },
      altas: f.altas_del_mes,
      bajas: f.bajas_del_mes,
      sinAlumnos: f.alumnos === 0,
    };
  });
}

/** «X en Y es el programa más grande y está casi lleno. Z en W tiene la deserción más alta: vale la pena preguntar a quienes se fueron.» Vacío si no hay con qué comparar. */
export function fraseDeComparativo(filas: readonly FilaDeComparativo[]): string {
  if (filas.length === 0) return "";
  const nombre = (f: FilaDeComparativo): string => `${f.vertical.nombre} en ${f.sucursal.nombre}`;
  const partes: string[] = [];
  const mayor = filas.reduce((a, f) => (f.alumnos > a.alumnos ? f : a));
  if (mayor.alumnos > 0) {
    const oc = decimasDe(mayor.ocupacion);
    partes.push(`${nombre(mayor)} es el programa más grande (${mayor.alumnos} ${mayor.alumnos === 1 ? "alumno" : "alumnos"})${oc !== null && oc >= 900n ? " y está casi lleno" : ""}.`);
  }
  let peor: FilaDeComparativo | null = null;
  let peorD = 0n;
  for (const f of filas) {
    const d = decimasDe(f.desercion);
    if (d !== null && d > peorD) {
      peor = f;
      peorD = d;
    }
  }
  if (peor && filas.length > 1) partes.push(`${nombre(peor)} tiene la deserción más alta (${peor.desercion_texto}): vale la pena preguntar a quienes se fueron.`);
  return partes.join(" ");
}
