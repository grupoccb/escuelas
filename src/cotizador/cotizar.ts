// Cotizador determinista (C5, invariante 10): dados el catálogo ya cargado, la edad (o la fecha de nacimiento),
// la vertical y la sucursal, devuelve los programas que le corresponden y, de cada uno, sus grupos activos con
// horarios y lugares reales, el precio vigente y las promociones aplicables con su desglose. PURO: sin base de
// datos, sin reloj (la fecha viene en el catálogo) y sin flotantes. La consulta a la base vive en `cargar.ts`.
//
// EDAD (documentado a propósito):
//   · con `fechaNacimiento` y un programa con `fecha_corte_edad`: años cumplidos A ESA FECHA, no a hoy (p. ej.
//     «la edad al inicio de ciclo»). Quien aún no había nacido en la fecha de corte no entra al programa.
//   · con `fechaNacimiento` y sin corte: años cumplidos a la fecha de la consulta.
//   · solo con `edadDeclarada` («como 6»): se usa TAL CUAL; no hay forma de recalcularla a un corte.
//   Rango del programa: `edad_min ≤ edad ≤ edad_max`, ambos inclusivos (años cumplidos).

import { calcularCupo } from "../catalogo/cupo.ts";
import { edadCumplida, partesDeFecha } from "../lib/edad.ts";
import { formatearHorarios } from "../lib/horario.ts";
import { resolverPromociones } from "../promociones/resolver.ts";
import type {
  CatalogoCotizable,
  Cotizacion,
  EntradaCotizador,
  FuenteDeEdad,
  GrupoCotizado,
  ProgramaCotizable,
  ProgramaCotizado,
} from "./tipos.ts";

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export interface EdadDePrograma {
  edad: number;
  fuente: FuenteDeEdad;
}

/**
 * La edad con la que se compara a alguien contra un programa, o null si todavía no era elegible (nació después de
 * la fecha de corte). Lanza RangeError con entradas imposibles.
 */
export function edadParaPrograma(
  programa: Pick<ProgramaCotizable, "fechaCorteEdad">,
  entrada: Pick<EntradaCotizador, "edadDeclarada" | "fechaNacimiento">,
  fechaConsulta: string,
): EdadDePrograma | null {
  if (entrada.fechaNacimiento) {
    const referencia = programa.fechaCorteEdad ?? fechaConsulta;
    if (entrada.fechaNacimiento > referencia) return null;
    return { edad: edadCumplida(entrada.fechaNacimiento, referencia), fuente: programa.fechaCorteEdad ? "nacimiento_a_corte" : "nacimiento_a_fecha" };
  }
  const e = entrada.edadDeclarada;
  if (e === undefined || e === null) throw new RangeError("Falta la edad o la fecha de nacimiento");
  return { edad: e, fuente: "declarada" };
}

function validar(entrada: EntradaCotizador, fecha: string): void {
  const nac = entrada.fechaNacimiento;
  if (nac) {
    partesDeFecha(nac);
    if (nac > fecha) throw new RangeError(`La fecha de nacimiento (${nac}) es posterior a la fecha de la consulta (${fecha})`);
  }
  const e = entrada.edadDeclarada;
  if (e !== undefined && e !== null && (!Number.isInteger(e) || e < 0 || e > 120)) throw new RangeError(`Edad inválida: ${e}`);
  if (!nac && (e === undefined || e === null)) throw new RangeError("Falta la edad o la fecha de nacimiento");
  const h = entrada.hermanosInscritos ?? 0;
  const m = entrada.mesesPagadosPorAdelantado ?? 0;
  if (!Number.isInteger(h) || h < 0 || !Number.isInteger(m) || m < 0) throw new RangeError("Hermanos o meses por adelantado inválidos");
}

/** Los grupos cotizables de un programa: solo los que tienen horario (sin horario no se puede ofrecer). */
function gruposCotizados(p: ProgramaCotizable): GrupoCotizado[] {
  return p.grupos
    .filter((g) => g.horarios.length > 0)
    .map((g) => ({
      grupoId: g.id,
      nombre: g.nombre,
      cupo: calcularCupo(g.cupoMaximo, g.ocupados, g.permiteListaEspera),
      horarios: g.horarios,
      horarioTexto: formatearHorarios(g.horarios),
    }))
    .sort((a, b) => b.cupo.disponibles - a.cupo.disponibles || a.nombre.localeCompare(b.nombre, "es-MX") || cmp(a.grupoId, b.grupoId));
}

/** ¿Este programa corresponde a la persona? Misma vertical y sucursal, activo (ya filtrado al cargar) y rango de edad. */
function programaDeLaPersona(p: ProgramaCotizable, entrada: EntradaCotizador, fecha: string): EdadDePrograma | null {
  if (p.verticalId !== entrada.verticalId || p.sucursalId !== entrada.sucursalId) return null;
  const e = edadParaPrograma(p, entrada, fecha);
  return e && e.edad >= p.edadMin && e.edad <= p.edadMax ? e : null;
}

/** Cotiza un programa que ya se sabe que corresponde: grupos, precio y promociones. */
function cotizarPrograma(p: ProgramaCotizable, e: EdadDePrograma, entrada: EntradaCotizador, cat: CatalogoCotizable): ProgramaCotizado {
  const precio = p.precio
    ? { precioId: p.precio.id, costoInscripcion: p.precio.costoInscripcion, costoMensualidad: p.precio.costoMensualidad, moneda: p.precio.moneda, vigenteDesde: p.precio.desde, vigenteHasta: p.precio.hasta }
    : null;
  return {
    programaId: p.id,
    nombre: p.nombre,
    descripcionPublica: p.descripcionPublica,
    nivel: p.nivel,
    verticalId: p.verticalId,
    sucursalId: p.sucursalId,
    permiteTraslape: p.permiteTraslape,
    edad: e.edad,
    fuenteEdad: e.fuente,
    fechaCorteEdad: p.fechaCorteEdad,
    precio,
    grupos: gruposCotizados(p),
    promociones: precio
      ? resolverPromociones(cat.promociones, {
          fecha: cat.fecha,
          verticalId: p.verticalId,
          sucursalId: p.sucursalId,
          programaId: p.id,
          hermanosInscritos: entrada.hermanosInscritos ?? 0,
          mesesPagadosPorAdelantado: entrada.mesesPagadosPorAdelantado ?? 0,
          costoInscripcion: precio.costoInscripcion,
          costoMensualidad: precio.costoMensualidad,
        })
      : null,
  };
}

/**
 * La cotización. `programas` queda vacío si ninguno corresponde a la edad en esa vertical y sucursal («sin
 * programa»); con varios (programas marcados `permite_traslape`) son alternativas. Orden: nombre y luego id.
 */
export function cotizar(cat: CatalogoCotizable, entrada: EntradaCotizador): Cotizacion {
  validar(entrada, cat.fecha);
  const programas: ProgramaCotizado[] = [];
  for (const p of cat.programas) {
    const e = programaDeLaPersona(p, entrada, cat.fecha);
    if (e) programas.push(cotizarPrograma(p, e, entrada, cat));
  }
  programas.sort((a, b) => a.nombre.localeCompare(b.nombre, "es-MX") || cmp(a.programaId, b.programaId));
  return { fecha: cat.fecha, verticalId: entrada.verticalId, sucursalId: entrada.sucursalId, programas };
}

/** Los ids de las sucursales (de la vertical) donde hay al menos un programa para esa persona. Orden por id. */
export function sucursalesConPrograma(cat: CatalogoCotizable, entrada: Omit<EntradaCotizador, "sucursalId">): string[] {
  const ids = new Set<string>();
  for (const p of cat.programas) {
    if (programaDeLaPersona(p, { ...entrada, sucursalId: p.sucursalId }, cat.fecha)) ids.add(p.sucursalId);
  }
  return [...ids].sort(cmp);
}
