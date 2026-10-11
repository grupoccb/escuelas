// Fechas y horas en español de México. Los días de calendario (`AAAA-MM-DD`) se manejan como TEXTO (sin pasar por la zona del
// navegador); los instantes (`2026-10-12T22:00:00.000Z`) se muestran en la zona de la sucursal que manda la API.

const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"] as const;
const MESES_LARGOS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"] as const;
export const DIAS_LARGOS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"] as const;

const FECHA = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Hoy en el calendario del dispositivo, `AAAA-MM-DD`. */
export function hoyLocal(ahora: Date = new Date()): string {
  const m = String(ahora.getMonth() + 1).padStart(2, "0");
  const d = String(ahora.getDate()).padStart(2, "0");
  return `${ahora.getFullYear()}-${m}-${d}`;
}

function partes(fecha: string): { a: number; m: number; d: number } | null {
  const x = FECHA.exec(fecha);
  if (!x) return null;
  return { a: Number(x[1]), m: Number(x[2]), d: Number(x[3]) };
}

/** «2026-11-10» → «10 nov 2026». */
export function formatearFecha(fecha: string | null | undefined): string {
  const p = fecha ? partes(fecha) : null;
  return p ? `${p.d} ${MESES_CORTOS[p.m - 1] ?? "?"} ${p.a}` : "—";
}

/** «2026-11-10» → «martes 10 de noviembre». */
export function formatearFechaLarga(fecha: string | null | undefined): string {
  const p = fecha ? partes(fecha) : null;
  if (!p) return "—";
  return `${DIAS_LARGOS[diaDeSemana(fecha!)] ?? ""} ${p.d} de ${MESES_LARGOS[p.m - 1] ?? "?"}`;
}

/** «2026-10-15» → «15 de octubre»; con otro año que el de `hoy`, «15 de octubre de 2025» (un vencimiento viejo no debe leerse como de este año). */
export function formatearDiaYMes(fecha: string | null | undefined, hoy: string): string {
  const p = fecha ? partes(fecha) : null;
  if (!p) return "—";
  const dePartes = partes(hoy);
  const base = `${p.d} de ${MESES_LARGOS[p.m - 1] ?? "?"}`;
  return dePartes && dePartes.a === p.a ? base : `${base} de ${p.a}`;
}

/** 0 = domingo … 6 = sábado, del día de calendario `AAAA-MM-DD`. */
export function diaDeSemana(fecha: string): number {
  const p = partes(fecha);
  return p ? new Date(Date.UTC(p.a, p.m - 1, p.d)).getUTCDay() : 0;
}

export function sumarDias(fecha: string, dias: number): string {
  const p = partes(fecha);
  if (!p) return fecha;
  const d = new Date(Date.UTC(p.a, p.m - 1, p.d + dias));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/** 960 → «16:00». */
export function horaDeMinutos(minutos: number): string {
  return `${String(Math.floor(minutos / 60)).padStart(2, "0")}:${String(minutos % 60).padStart(2, "0")}`;
}

/** Un instante en la zona dada: «10 nov 2026, 16:00». */
export function formatearInstante(iso: string | null | undefined, zona?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("es-MX", { timeZone: zona, day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(d).replace(",", ",");
}

/** Cuántos días enteros pasaron de `desdeISO` a ahora. */
export function diasDesde(desdeISO: string, ahora: Date = new Date()): number {
  const t = new Date(desdeISO).getTime();
  return Number.isNaN(t) ? 0 : Math.max(0, Math.floor((ahora.getTime() - t) / 86_400_000));
}

/** Edad en años cumplidos a `hoy` (ambos `AAAA-MM-DD`); `null` si la fecha no es válida o es futura. */
export function edadEn(nacimiento: string, hoy: string): number | null {
  const n = partes(nacimiento);
  const h = partes(hoy);
  if (!n || !h || nacimiento > hoy) return null;
  return h.a - n.a - (h.m < n.m || (h.m === n.m && h.d < n.d) ? 1 : 0);
}

/** ¿Es un día real del calendario (no el 31 de febrero)? */
export function esFechaReal(fecha: string): boolean {
  const p = partes(fecha);
  if (!p) return false;
  const d = new Date(Date.UTC(p.a, p.m - 1, p.d));
  return d.getUTCFullYear() === p.a && d.getUTCMonth() === p.m - 1 && d.getUTCDate() === p.d;
}

/** El día de calendario (`AAAA-MM-DD`) de un instante en la zona de la sucursal. */
export function diaEnZona(iso: string, zona: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: zona, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/**
 * Qué decirle a quien captura la fecha de un pago que ya recibió (`null` si está bien o vacía, que es «hoy»). Con `noValidate` el aviso ya no lo da el navegador (en el idioma del
 * navegador y sin decir qué hacer): lo dice la pantalla (V10).
 */
export function mensajeDeFechaDePago(fecha: string, hoy: string): string | null {
  if (fecha === "") return null;
  if (!esFechaReal(fecha)) return "Esa fecha no existe en el calendario. Revísala.";
  if (fecha > hoy) return "La fecha del pago no puede ser de mañana en adelante.";
  return null;
}
