// Lectura de los valores de una celda (V6): enteros, importes, fechas, horas, días, sí/no, listas y nombres. PURO.
//
// Cada función recibe el texto de la celda ya recortado y devuelve el valor o un `mensaje` en español dicho a la persona que llena la hoja (sin términos técnicos). Los
// mensajes empiezan en minúscula porque se muestran después de «Fila 7, columna “Cupo”: ». El dinero va en centavos exactos (`src/lib/dinero.ts`), nunca en flotantes.

import { PATRON_DE_COLOR, zonaCanonica } from "../organizacion.ts";
import { MAXIMO_DECIMAL_12_2, deTexto } from "../../lib/dinero.ts";
import { normalizarTelefono } from "../../lib/telefono.ts";

export type Leido<T> = { ok: true; valor: T } | { ok: false; mensaje: string };

const bien = <T>(valor: T): Leido<T> => ({ ok: true, valor });
const mal = (mensaje: string): Leido<never> => ({ ok: false, mensaje });

/** Sin acentos, en minúsculas, sin signos y con los espacios colapsados: «  Salón   A. » → «salon a». Para comparar nombres y encabezados. */
export function claveDeNombre(texto: string): string {
  return texto
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("es-MX")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** El texto como se guarda: sin espacios en los extremos y con los internos colapsados. */
export const nombreLimpio = (texto: string): string => texto.replace(/\s+/gu, " ").trim();

// ── Enteros ──────────────────────────────────────────────────────────────────────────────────────

export function leerEntero(texto: string, min: number, max: number): Leido<number> {
  // Excel a veces escribe «12.0» o «12,0» cuando la celda tiene formato de número.
  const t = texto.replace(/[.,]0+$/, "");
  if (!/^\d{1,9}$/.test(t)) return mal(`«${texto}» no es un número entero. Escribe solo dígitos, por ejemplo ${Math.min(Math.max(10, min), max)}.`);
  const n = parseInt(t, 10);
  if (n < min || n > max) return mal(`«${texto}» está fuera de rango: debe estar entre ${min} y ${max}.`);
  return bien(n);
}

// ── Importes ─────────────────────────────────────────────────────────────────────────────────────

const AGRUPADO_CON_COMA = /^\d{1,3}(?:,\d{3})+$/;
const AGRUPADO_CON_PUNTO = /^\d{1,3}(?:\.\d{3})+$/;

/**
 * Un importe escrito como lo escribe la gente en Excel → texto decimal exacto con dos decimales, o null si no se entiende:
 * «1500», «1500.50», «1500,50» (coma decimal), «$1,500.00», «1.500,50» y «1,500» (coma de miles) valen. «1.500» (un punto y tres dígitos) NO: puede ser mil quinientos o uno con
 * cincuenta, y con dinero no se adivina.
 */
function importeANormalizado(texto: string): string | null {
  const t = texto.replace(/\s+/g, "").replace(/^\$/, "").replace(/(?:mxn|pesos|mn)$/i, "");
  if (/^\d+$/.test(t)) return t;
  const ultimaComa = t.lastIndexOf(",");
  const ultimoPunto = t.lastIndexOf(".");
  if (ultimaComa >= 0 && ultimoPunto >= 0) {
    const decimal = ultimaComa > ultimoPunto ? "," : ".";
    const miles = decimal === "," ? "." : ",";
    const corte = Math.max(ultimaComa, ultimoPunto);
    const enteros = t.slice(0, corte);
    const centavos = t.slice(corte + 1);
    const agrupado = miles === "," ? AGRUPADO_CON_COMA : AGRUPADO_CON_PUNTO;
    if (!/^\d{1,2}$/.test(centavos) || !agrupado.test(enteros)) return null;
    return `${enteros.split(miles).join("")}.${centavos}`;
  }
  const sep = ultimaComa >= 0 ? "," : ultimoPunto >= 0 ? "." : "";
  if (sep === "") return null;
  const partes = t.split(sep);
  if (partes.length === 2) {
    const [enteros = "", resto = ""] = partes;
    if (!/^\d+$/.test(enteros) || !/^\d+$/.test(resto)) return null;
    if (resto.length <= 2) return `${enteros}.${resto}`;
    // Tres dígitos tras la coma: es la coma de miles («1,500»). Tras un punto es ambiguo.
    return sep === "," && AGRUPADO_CON_COMA.test(t) ? enteros + resto : null;
  }
  return (sep === "," ? AGRUPADO_CON_COMA : AGRUPADO_CON_PUNTO).test(t) ? partes.join("") : null;
}

/** Un importe en centavos exactos (≥ 0, con a lo más dos decimales, dentro de lo que cabe en la base). */
export function leerImporte(texto: string): Leido<bigint> {
  if (/^\s*-/.test(texto)) return mal(`«${texto}» es negativo. Escribe la cantidad sin signo, por ejemplo 500 o 500.50.`);
  const normalizado = importeANormalizado(texto);
  if (normalizado === null) return mal(`«${texto}» no se entiende como cantidad de dinero. Escríbela sin separador de miles y con punto para los centavos, por ejemplo 1500 o 1500.50.`);
  // V13-fix (EV-32): `deTexto` solo admite hasta 15 dígitos enteros y lanzaba con más (la carga respondía 500 «Ocurrió un error» sin fila ni columna). Lo que cabe en la base son 10.
  const [enteros = "", decimales] = normalizado.split(".");
  const sinCeros = enteros.replace(/^0+(?=\d)/, "");
  if (sinCeros.length > 10) return mal(`«${texto}» es demasiado grande.`);
  const centavos = deTexto(decimales === undefined ? sinCeros : `${sinCeros}.${decimales}`);
  if (centavos > MAXIMO_DECIMAL_12_2) return mal(`«${texto}» es demasiado grande.`);
  return bien(centavos);
}

// ── Fechas y horas ───────────────────────────────────────────────────────────────────────────────

const HORA_OPCIONAL = String.raw`(?:[ T]\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?)?`;
const ISO = new RegExp(String.raw`^(\d{4})-(\d{1,2})-(\d{1,2})${HORA_OPCIONAL}$`);
const LATINA = new RegExp(String.raw`^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})${HORA_OPCIONAL}$`);

/** dd/mm/aaaa o aaaa-mm-dd (con o sin ceros, y con la hora «0:00» que a veces agrega Excel) → «AAAA-MM-DD»; valida que el día exista. */
export function leerFecha(texto: string): Leido<string> {
  let a: number, m: number, d: number;
  const iso = ISO.exec(texto);
  const latina = LATINA.exec(texto);
  if (iso) [a, m, d] = [parseInt(iso[1]!, 10), parseInt(iso[2]!, 10), parseInt(iso[3]!, 10)];
  else if (latina) [d, m, a] = [parseInt(latina[1]!, 10), parseInt(latina[2]!, 10), parseInt(latina[3]!, 10)];
  else return mal(`«${texto}» no es una fecha. Escríbela como día/mes/año, por ejemplo 15/09/2026.`);
  const fecha = new Date(Date.UTC(a, m - 1, d));
  if (fecha.getUTCFullYear() !== a || fecha.getUTCMonth() !== m - 1 || fecha.getUTCDate() !== d) return mal(`«${texto}» no es una fecha que exista en el calendario.`);
  if (a < 2000 || a > 2100) return mal(`«${texto}» tiene un año poco probable (${a}). Revisa la fecha.`);
  return bien(`${String(a).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
}

/** Hora de 24 horas («17:00», «9:30», «17:00:00») → minutos desde la medianoche. `24:00` solo vale como hora de fin. */
export function leerHora(texto: string, opciones: { esFin?: boolean } = {}): Leido<number> {
  if (/\b[ap]\.?\s?m\b\.?/i.test(texto)) return mal(`«${texto}» está en formato de 12 horas. Escribe la hora en formato de 24 horas, por ejemplo 17:00 en lugar de 5:00 p. m.`);
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?(?:\s*(?:h|hrs?)\.?)?$/i.exec(texto);
  if (!m) return mal(`«${texto}» no es una hora. Escríbela en formato de 24 horas, por ejemplo 17:00.`);
  const horas = parseInt(m[1]!, 10);
  const minutos = parseInt(m[2]!, 10);
  if (minutos > 59 || horas > 24 || (horas === 24 && (minutos !== 0 || opciones.esFin !== true))) return mal(`«${texto}» no es una hora válida. Usa horas de 00:00 a 23:59.`);
  return bien(horas * 60 + minutos);
}

const DIAS: Record<string, number> = {
  domingo: 0, dom: 0,
  lunes: 1, lun: 1,
  martes: 2, mar: 2,
  miercoles: 3, mie: 3, mier: 3,
  jueves: 4, jue: 4,
  viernes: 5, vie: 5,
  sabado: 6, sab: 6,
};

/** Un día de la semana en español, sin distinguir mayúsculas ni acentos → 0 (domingo) a 6 (sábado). */
export function leerDia(texto: string): Leido<number> {
  const v = DIAS[claveDeNombre(texto)];
  return v === undefined ? mal(`«${texto}» no es un día de la semana. Escribe lunes, martes, miércoles, jueves, viernes, sábado o domingo.`) : bien(v);
}

// ── Otros ────────────────────────────────────────────────────────────────────────────────────────

const SI = new Set(["si", "s", "x", "verdadero", "true", "1", "yes", "y"]);
const NO = new Set(["no", "n", "falso", "false", "0"]);

/** Sí / No (con o sin acento, «s», «n», «x»). */
export function leerSiNo(texto: string): Leido<boolean> {
  const c = claveDeNombre(texto);
  if (SI.has(c)) return bien(true);
  if (NO.has(c)) return bien(false);
  return mal(`«${texto}» no se entiende. Escribe Sí o No.`);
}

/** Una lista en una celda: separada por «|», «;» o «/». */
export function leerLista(texto: string): string[] {
  return texto
    .split(/[|;/]/)
    .map(nombreLimpio)
    .filter((x) => x !== "");
}

/** Un teléfono → E.164 con `normalizarTelefono()` (invariante 7). */
export function leerTelefono(texto: string): Leido<string> {
  const e164 = normalizarTelefono(texto);
  return e164 ? bien(e164) : mal(`«${texto}» no es un teléfono válido. Escríbelo con lada, por ejemplo 55 1234 5678.`);
}

export function leerCorreo(texto: string): Leido<string> {
  const c = texto.trim().toLowerCase();
  return /^[^@\s,;]+@[^@\s,;]+\.[^@\s,;]+$/.test(c) && c.length <= 200 ? bien(c) : mal(`«${texto}» no parece un correo electrónico (por ejemplo nombre@dominio.com).`);
}

export function leerColor(texto: string): Leido<string> {
  const c = texto.startsWith("#") ? texto : `#${texto}`;
  return PATRON_DE_COLOR.test(c) ? bien(c.toUpperCase()) : mal(`«${texto}» no es un color. Escríbelo como #RRGGBB, por ejemplo #2E7D32, o déjalo vacío.`);
}

/** Zonas horarias de México con los nombres que usa la gente; también vale el nombre técnico (America/Mexico_City). */
const ZONAS_AMIGABLES: Record<string, string> = {
  centro: "America/Mexico_City",
  "centro de mexico": "America/Mexico_City",
  "ciudad de mexico": "America/Mexico_City",
  cdmx: "America/Mexico_City",
  "hora del centro": "America/Mexico_City",
  pacifico: "America/Mazatlan",
  "hora del pacifico": "America/Mazatlan",
  sonora: "America/Hermosillo",
  noroeste: "America/Tijuana",
  "hora del noroeste": "America/Tijuana",
  "baja california": "America/Tijuana",
  "quintana roo": "America/Cancun",
  sureste: "America/Cancun",
  "hora del sureste": "America/Cancun",
};

export const ZONAS_QUE_SE_ENTIENDEN = "Centro, Pacífico, Sonora, Noroeste o Quintana Roo";

export function leerZonaHoraria(texto: string): Leido<string> {
  const amigable = ZONAS_AMIGABLES[claveDeNombre(texto)];
  if (amigable) return bien(amigable);
  const canonica = zonaCanonica(texto);
  if (canonica !== null) return bien(canonica);
  return mal(`«${texto}» no es una zona horaria que el sistema conozca. Escribe ${ZONAS_QUE_SE_ENTIENDEN} (para el resto del mundo, el nombre como America/Bogota).`);
}
