// Lo que se le dice a un contacto al cotizarle y lo que se guarda (C8): funciones PURAS sobre una `ProgramaCotizado`.
//
//   · `vigenteHasta`: el último día en que vale la cotización.
//   · `opcionesDeHorario`: los grupos que puede elegir (con lugar o con lista de espera), en el orden en que se le
//     muestran; se guardan en el snapshot para que el número que responda apunte a lo MISMO que vio.
//   · `snapshotDeCotizacion` / `opcionesDeSnapshot`: ida y vuelta del JSON guardado.
//   · `descripcionDePromociones`: texto corto y genérico de las promociones aplicadas.

import type { OfertaDeLugar } from "../catalogo/cupo.ts";
import { sumarDias, type FechaISO } from "../catalogo/precios.ts";
import { deTexto, formatear } from "../lib/dinero.ts";
import { programaAJson } from "./json.ts";
import type { ProgramaCotizado } from "./tipos.ts";

export const VERSION_DE_SNAPSHOT = 1;

/** Un horario (grupo) que el contacto puede elegir. */
export interface OpcionHorario {
  grupoId: string;
  nombre: string;
  horarioTexto: string;
  oferta: Exclude<OfertaDeLugar, "sin_lugar">;
  lugares: number;
}

/**
 * El último día (inclusive) en que vale lo cotizado: `fecha + dias`, y antes si vence el precio o una promoción que
 * se cotizó. Nunca antes de `fecha`.
 */
export function vigenteHasta(p: Pick<ProgramaCotizado, "venceEl">, fecha: FechaISO, dias: number): FechaISO {
  if (!Number.isInteger(dias) || dias < 1) throw new RangeError(`Días de vigencia inválidos: ${dias}`);
  const tope = sumarDias(fecha, dias);
  return p.venceEl !== null && p.venceEl < tope ? p.venceEl : tope;
}

/** Los grupos que se pueden elegir: con lugar o con lista de espera (los llenos sin lista no se ofrecen). */
export function opcionesDeHorario(p: Pick<ProgramaCotizado, "grupos">): OpcionHorario[] {
  const opciones: OpcionHorario[] = [];
  for (const g of p.grupos) {
    if (g.cupo.oferta === "sin_lugar") continue;
    opciones.push({ grupoId: g.grupoId, nombre: g.nombre, horarioTexto: g.horarioTexto, oferta: g.cupo.oferta, lugares: g.cupo.disponibles });
  }
  return opciones;
}

export interface SnapshotDeCotizacion {
  version: number;
  fecha: FechaISO;
  programa: ReturnType<typeof programaAJson>;
}

export function snapshotDeCotizacion(p: ProgramaCotizado, fecha: FechaISO): SnapshotDeCotizacion {
  return { version: VERSION_DE_SNAPSHOT, fecha, programa: programaAJson(p) };
}

const esObjeto = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

/** Los horarios elegibles de un snapshot guardado; lista vacía si el JSON no tiene la forma esperada. */
export function opcionesDeSnapshot(snapshot: unknown): OpcionHorario[] {
  if (!esObjeto(snapshot) || !esObjeto(snapshot["programa"])) return [];
  const grupos = snapshot["programa"]["grupos"];
  if (!Array.isArray(grupos)) return [];
  const opciones: OpcionHorario[] = [];
  for (const g of grupos) {
    if (!esObjeto(g)) continue;
    const { grupo_id, nombre, horario_texto, oferta, lugares_disponibles } = g;
    if (typeof grupo_id !== "string" || typeof nombre !== "string" || typeof horario_texto !== "string" || typeof lugares_disponibles !== "number") continue;
    if (oferta !== "lugar" && oferta !== "lista_de_espera") continue;
    opciones.push({ grupoId: grupo_id, nombre, horarioTexto: horario_texto, oferta, lugares: lugares_disponibles });
  }
  return opciones;
}

/**
 * Líneas cortas con lo que ahorra cada promoción aplicada, en lenguaje genérico: los nombres y descripciones son de
 * las tablas. Vacío si no hay promociones aplicadas.
 */
export function descripcionDePromociones(p: Pick<ProgramaCotizado, "promociones" | "precio">): string[] {
  const r = p.promociones;
  if (!r || r.aplicadas.length === 0) return [];
  const moneda = p.precio?.moneda ?? "MXN";
  const lineas: string[] = [];
  for (const a of r.aplicadas) {
    const suyas = r.lineas.filter((l) => l.promocionId === a.promocionId);
    const partes: string[] = [];
    for (const l of suyas) {
      const cuando = l.estado === "pendiente" ? " al pagar la primera mensualidad" : "";
      if (l.tipo === "descuento_inscripcion" && l.descuento > 0n) partes.push(`${formatear(l.descuento, moneda)} menos en la inscripción${cuando}`);
      else if (l.tipo === "descuento_mensualidad" && l.descuento > 0n) partes.push(`${formatear(l.descuento, moneda)} menos en cada mensualidad${cuando}`);
      else if (l.tipo === "meses_gratis" && l.meses > 0) partes.push(`${l.meses} ${l.meses === 1 ? "mes gratis" : "meses gratis"}${cuando}`);
      else if (l.tipo === "producto_gratis") partes.push(`${l.descripcion ?? "un regalo"}${cuando}`);
    }
    lineas.push(partes.length > 0 ? `${a.nombre}: ${partes.join(", ")}` : a.nombre);
  }
  return lineas;
}

const texto = (x: unknown): string | null => (typeof x === "string" ? x : null);
const dinero = (x: unknown, moneda: string): string | null => {
  const t = texto(x);
  if (t === null) return null;
  try {
    return formatear(deTexto(t), moneda);
  } catch {
    return null;
  }
};

/**
 * Líneas para la nota del asesor a partir del snapshot guardado: lo que se le cotizó (precios con la promoción de ese
 * día), las promociones y el horario que eligió. Sin datos de salud (no los hay en una cotización). Si el snapshot no
 * tiene la forma esperada, devuelve lo poco que sepa.
 */
export function resumenDeCotizacion(c: { snapshot: unknown; vigenteHasta: FechaISO; grupoElegidoId: string | null }): string[] {
  const snap = esObjeto(c.snapshot) && esObjeto(c.snapshot["programa"]) ? c.snapshot["programa"] : null;
  if (!snap) return [`• Cotización (vale hasta ${c.vigenteHasta})`];
  const precio = esObjeto(snap["precio"]) ? snap["precio"] : null;
  const promos = esObjeto(snap["promociones"]) ? snap["promociones"] : null;
  const moneda = texto(precio?.["moneda"]) ?? "MXN";
  const lineas: string[] = [];
  if (precio) {
    const insc = dinero(esObjeto(promos?.["inscripcion"]) ? promos["inscripcion"]["final_ahora"] : precio["costo_inscripcion"], moneda);
    const mens = dinero(esObjeto(promos?.["mensualidad"]) ? promos["mensualidad"]["final_ahora"] : precio["costo_mensualidad"], moneda);
    lineas.push(`• Cotización (vale hasta ${c.vigenteHasta}): inscripción ${insc ?? "—"}, mensualidad ${mens ?? "—"}`);
  } else {
    lineas.push(`• Cotización (vale hasta ${c.vigenteHasta}): sin precio vigente`);
  }
  const aplicadas = Array.isArray(promos?.["aplicadas"]) ? (promos["aplicadas"] as unknown[]).filter(esObjeto).map((a) => texto(a["nombre"])).filter((n): n is string => n !== null) : [];
  if (aplicadas.length > 0) lineas.push(`• Promociones cotizadas: ${aplicadas.join("; ")}`);
  const opciones = opcionesDeSnapshot(c.snapshot);
  if (c.grupoElegidoId) {
    const g = opciones.find((o) => o.grupoId === c.grupoElegidoId);
    lineas.push(`• Horario elegido: ${g ? `${g.nombre} — ${g.horarioTexto}${g.oferta === "lista_de_espera" ? " (lista de espera)" : ""}` : "—"}`);
  } else if (opciones.length > 0) {
    lineas.push("• Horario elegido: todavía no eligió");
  }
  return lineas;
}

/**
 * El estatus que ve quien consulta: una cotización `vigente` cuyo último día ya pasó (con el mismo margen de un día de
 * `vencerCotizaciones`, que es lo que la guarda como `vencida`) se muestra `vencida` aunque el barrido no haya corrido.
 */
export function estatusEfectivo(estatus: "vigente" | "aceptada" | "vencida", vigenteHasta: FechaISO, ahora: Date): "vigente" | "aceptada" | "vencida" {
  if (estatus !== "vigente") return estatus;
  return vigenteHasta < sumarDias(ahora.toISOString().slice(0, 10), -1) ? "vencida" : "vigente";
}
