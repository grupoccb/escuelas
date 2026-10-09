// Resolutor de promociones (C3). PURO y determinista (invariante 10): dado el conjunto de promociones y un
// contexto, devuelve cuáles aplican, cuáles no (y por qué) y el desglose exacto de beneficios en centavos.
// Nada de base de datos, reloj ni flotantes (zona de dinero de `check:dinero`).
//
// REGLAS
//  1. Candidata = activa, con vigencia que cubre la fecha (desde y hasta inclusivos), dentro del alcance
//     (vertical, sucursal y programa; una lista de alcance VACÍA vale para todos), con cupo (cupo_usado <
//     cupo_maximo, o sin tope) y con la condición cumplida:
//       sin_condicion → siempre · min_hermanos(n) → hermanosInscritos + 1 ≥ n (cuenta al que se inscribe)
//       pago_anticipado(m) → mesesPagadosPorAdelantado ≥ m · al_pagar_primera_mensualidad → no se puede saber aún:
//       es candidata y sus beneficios «al_cumplir_condicion» quedan PENDIENTES.
//  2. Orden: mayor `prioridad` primero; a igualdad, menor id. Siempre el mismo.
//  3. Acumulación (V2, decisión 6): una promoción NO acumulable no se combina con NINGUNA otra, ni acumulable ni no acumulable. Compiten «opciones»: cada no acumulable
//     por sí sola, y el grupo de TODAS las acumulables (que se suman entre sí). Gana UNA opción y las promociones de las demás pierden. Una acumulable nunca se suma a una
//     no acumulable ganadora, y una no acumulable nunca entra en el grupo de acumulables ganador. La opción ganadora es la primera de este orden (total y determinista):
//       a. mayor `prioridad` de su cabeza (la de una no acumulable es la suya; la del grupo de acumulables, la mayor prioridad entre ellas);
//       b. a igualdad de prioridad, la que MÁS BENEFICIA al cliente: la suma de los descuentos de sus líneas, en centavos (descuento de inscripción + descuento de UNA mensualidad
//          + ahorro de los meses gratis, inmediatos y diferidos; un producto gratis no tiene precio y vale 0);
//       c. a igualdad de beneficio, el menor id de la cabeza (el mismo criterio que el orden del paso 2).
//     El orden en que lleguen las promociones no cambia el resultado (hay pruebas de permutaciones).
//  4. Beneficio inmediato = se aplica ya. Un beneficio `al_cumplir_condicion` solo queda pendiente si la condición de
//     su promoción es `al_pagar_primera_mensualidad`; con cualquier otra condición, ya se cumplió (se verificó en el paso 1).
//  5. Descuentos: cada uno se calcula sobre el importe ORIGINAL (no en cascada: dos de 10 % son 20 %), se asignan en orden
//     de promoción y de beneficio (id) y nunca dejan un importe por debajo de cero (lo que sobra se recorta). Porcentaje: redondeo
//     de `src/lib/dinero.ts` (mitad alejándose de cero). `descuento_mensualidad` rige en CADA mensualidad; `meses_gratis(n)` deja
//     gratis las primeras n (su ahorro = n × la mensualidad ya con el descuento recurrente inmediato).

import { cantidadEntera, deTexto, porcentaje, restar, sumar, type Centavos } from "../lib/dinero.ts";
import type { FechaISO } from "../catalogo/precios.ts";
import type { Condicion, ModoDeBeneficio, MomentoDeDisparo, TipoDeBeneficio } from "./tipos.ts";

export interface BeneficioDef {
  id: string;
  tipo: TipoDeBeneficio;
  modo: ModoDeBeneficio;
  /** Texto decimal de la columna («15.00», «150.00», «2.00») o null. */
  valor: string | null;
  productoId: string | null;
  descripcion: string | null;
  momento: MomentoDeDisparo;
}

export interface PromocionDef {
  id: string;
  nombre: string;
  codigo: string;
  activa: boolean;
  vigenciaDesde: FechaISO;
  vigenciaHasta: FechaISO | null;
  condicion: Condicion;
  cupoMaximo: number | null;
  cupoUsado: number;
  acumulable: boolean;
  prioridad: number;
  /** Listas vacías = todas. */
  alcance: { verticales: readonly string[]; sucursales: readonly string[]; programas: readonly string[] };
  beneficios: readonly BeneficioDef[];
}

export interface ContextoPromocion {
  fecha: FechaISO;
  verticalId: string;
  sucursalId: string;
  programaId: string;
  /** Hermanos YA inscritos de la familia, sin contar a quien se inscribe. */
  hermanosInscritos: number;
  /** Meses que paga por adelantado al inscribirse (0 = mes a mes). */
  mesesPagadosPorAdelantado: number;
  costoInscripcion: Centavos;
  costoMensualidad: Centavos;
}

export type MotivoDeDescarte = "inactiva" | "fuera_de_vigencia" | "fuera_de_alcance" | "condicion_no_cumplida" | "sin_cupo" | "pierde_por_prioridad";

export interface LineaDeBeneficio {
  promocionId: string;
  promocionNombre: string;
  beneficioId: string;
  tipo: TipoDeBeneficio;
  modo: ModoDeBeneficio;
  estado: "inmediato" | "pendiente";
  /** Dinero que descuenta (0 en producto_gratis; el ahorro total en meses_gratis). */
  descuento: Centavos;
  /** Meses gratis (0 si no aplica). */
  meses: number;
  productoId: string | null;
  descripcion: string | null;
}

export interface TotalesDeImporte {
  original: Centavos;
  descuentoAhora: Centavos;
  descuentoDiferido: Centavos;
  /** Lo que se paga ya (original − descuento inmediato). */
  finalAhora: Centavos;
  /** Cuando los diferidos se cumplan (original − todos los descuentos). */
  finalConDiferidos: Centavos;
}

export interface ResultadoPromociones {
  aplicadas: { promocionId: string; nombre: string; codigo: string; prioridad: number; acumulable: boolean }[];
  descartadas: { promocionId: string; nombre: string; motivo: MotivoDeDescarte }[];
  lineas: LineaDeBeneficio[];
  inscripcion: TotalesDeImporte;
  /** Importes de CADA mensualidad (el descuento de mensualidad es recurrente). */
  mensualidad: TotalesDeImporte;
  mesesGratisAhora: number;
  mesesGratisDiferidos: number;
}

const enLista = (lista: readonly string[], id: string): boolean => lista.length === 0 || lista.includes(id);
const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Por qué una promoción NO es candidata, o null si lo es. */
export function motivoDeDescarte(p: PromocionDef, ctx: ContextoPromocion): MotivoDeDescarte | null {
  if (!p.activa) return "inactiva";
  if (ctx.fecha < p.vigenciaDesde || (p.vigenciaHasta !== null && ctx.fecha > p.vigenciaHasta)) return "fuera_de_vigencia";
  if (!enLista(p.alcance.verticales, ctx.verticalId) || !enLista(p.alcance.sucursales, ctx.sucursalId) || !enLista(p.alcance.programas, ctx.programaId)) return "fuera_de_alcance";
  const c = p.condicion;
  if (c.tipo === "min_hermanos" && ctx.hermanosInscritos + 1 < c.hermanos) return "condicion_no_cumplida";
  if (c.tipo === "pago_anticipado" && ctx.mesesPagadosPorAdelantado < c.meses) return "condicion_no_cumplida";
  if (p.cupoMaximo !== null && p.cupoUsado >= p.cupoMaximo) return "sin_cupo";
  return null;
}

/** Mayor prioridad primero; a igualdad, menor id. */
export const porPrioridad = (a: PromocionDef, b: PromocionDef): number => b.prioridad - a.prioridad || cmp(a.id, b.id);

/** Qué descuenta un beneficio de importe sobre su base ORIGINAL (sin recortar). */
function descuentoDeseado(b: BeneficioDef, base: Centavos): Centavos {
  if (b.modo === "total") return base;
  if (b.valor === null) throw new Error(`Beneficio ${b.id} sin valor`);
  return b.modo === "porcentaje" ? porcentaje(base, b.valor) : deTexto(b.valor);
}

interface Sumas {
  inscripcion: { ahora: Centavos; diferido: Centavos };
  mensualidad: { ahora: Centavos; diferido: Centavos };
}

/**
 * Las líneas de beneficio (y lo que suman) de un conjunto de promociones YA elegido, en orden de promoción y de beneficio. Cada descuento se calcula sobre el importe ORIGINAL
 * (no en cascada) y nunca deja un importe por debajo de cero. Es la misma asignación para la opción ganadora y para medir el beneficio de las que compiten (`elegirOpcion`).
 */
function asignarBeneficios(promociones: readonly PromocionDef[], ctx: ContextoPromocion): { lineas: LineaDeBeneficio[]; sumas: Sumas } {
  const restante = { descuento_inscripcion: ctx.costoInscripcion, descuento_mensualidad: ctx.costoMensualidad };
  const lineas: LineaDeBeneficio[] = [];
  const sumas: Sumas = { inscripcion: { ahora: 0n, diferido: 0n }, mensualidad: { ahora: 0n, diferido: 0n } };
  const pendientesDeMeses: LineaDeBeneficio[] = [];

  for (const p of promociones) {
    for (const b of [...p.beneficios].sort((x, y) => cmp(x.id, y.id))) {
      const diferido = b.momento === "al_cumplir_condicion" && p.condicion.tipo === "al_pagar_primera_mensualidad";
      const base: LineaDeBeneficio = {
        promocionId: p.id,
        promocionNombre: p.nombre,
        beneficioId: b.id,
        tipo: b.tipo,
        modo: b.modo,
        estado: diferido ? "pendiente" : "inmediato",
        descuento: 0n,
        meses: 0,
        productoId: b.productoId,
        descripcion: b.descripcion,
      };
      if (b.tipo === "descuento_inscripcion" || b.tipo === "descuento_mensualidad") {
        const original = b.tipo === "descuento_inscripcion" ? ctx.costoInscripcion : ctx.costoMensualidad;
        const deseado = descuentoDeseado(b, original);
        const concedido = deseado < restante[b.tipo] ? deseado : restante[b.tipo];
        restante[b.tipo] = restar(restante[b.tipo], concedido);
        const suma = b.tipo === "descuento_inscripcion" ? sumas.inscripcion : sumas.mensualidad;
        if (diferido) suma.diferido += concedido;
        else suma.ahora += concedido;
        lineas.push({ ...base, descuento: concedido });
      } else if (b.tipo === "meses_gratis") {
        if (b.valor === null) throw new Error(`Beneficio ${b.id} sin valor`);
        const linea = { ...base, meses: cantidadEntera(b.valor) };
        lineas.push(linea);
        pendientesDeMeses.push(linea);
      } else {
        lineas.push(base);
      }
    }
  }

  // Ahorro de los meses gratis: n × la mensualidad ya con el descuento recurrente inmediato.
  const mensualidadAhora = restar(ctx.costoMensualidad, sumas.mensualidad.ahora);
  for (const l of pendientesDeMeses) l.descuento = mensualidadAhora * BigInt(l.meses);
  return { lineas, sumas };
}

/** Cuánto beneficia al cliente un conjunto de promociones, en centavos: la suma de los descuentos de sus líneas (inmediatos y diferidos; un producto gratis vale 0). */
function beneficioDelConjunto(promociones: readonly PromocionDef[], ctx: ContextoPromocion): Centavos {
  return asignarBeneficios(promociones, ctx).lineas.reduce((total, l) => total + l.descuento, 0n);
}

/**
 * Entre las candidatas (ya en orden de prioridad) devuelve las que se aplican juntas. Con solo acumulables, todas. Con una o más no acumulables, UNA opción: una no acumulable
 * sola, o el grupo de todas las acumulables; ganan la mayor prioridad de la cabeza, a igualdad el mayor beneficio al cliente y a igualdad el menor id (paso 3 de arriba).
 */
function elegirOpcion(candidatas: readonly PromocionDef[], ctx: ContextoPromocion): PromocionDef[] {
  const acumulables = candidatas.filter((p) => p.acumulable);
  const noAcumulables = candidatas.filter((p) => !p.acumulable);
  if (noAcumulables.length === 0) return acumulables;
  const opciones: { cabeza: PromocionDef; promociones: PromocionDef[] }[] = noAcumulables.map((p) => ({ cabeza: p, promociones: [p] }));
  // `candidatas` viene ordenada por `porPrioridad`: la primera acumulable es la de mayor prioridad (y, a igualdad, la de menor id).
  if (acumulables.length > 0) opciones.push({ cabeza: acumulables[0]!, promociones: acumulables });
  // Un solo candidato: nada que medir (es el caso de casi todas las inscripciones).
  if (opciones.length === 1) return opciones[0]!.promociones;
  const medidas = opciones.map((o) => ({ ...o, beneficio: beneficioDelConjunto(o.promociones, ctx) }));
  medidas.sort((a, b) => b.cabeza.prioridad - a.cabeza.prioridad || (a.beneficio === b.beneficio ? 0 : a.beneficio > b.beneficio ? -1 : 1) || cmp(a.cabeza.id, b.cabeza.id));
  return medidas[0]!.promociones;
}

export function resolverPromociones(promociones: readonly PromocionDef[], ctx: ContextoPromocion): ResultadoPromociones {
  const descartadas: ResultadoPromociones["descartadas"] = [];
  const candidatas: PromocionDef[] = [];
  for (const p of [...promociones].sort(porPrioridad)) {
    const motivo = motivoDeDescarte(p, ctx);
    if (motivo) descartadas.push({ promocionId: p.id, nombre: p.nombre, motivo });
    else candidatas.push(p);
  }

  // Compiten las opciones (cada no acumulable sola, o el grupo de acumulables): gana una sola; ver el paso 3 de arriba.
  const elegidas = elegirOpcion(candidatas, ctx);
  const ganadoras = new Set(elegidas.map((p) => p.id));
  for (const p of candidatas) if (!ganadoras.has(p.id)) descartadas.push({ promocionId: p.id, nombre: p.nombre, motivo: "pierde_por_prioridad" });

  const { lineas, sumas } = asignarBeneficios(elegidas, ctx);

  const totales = (original: Centavos, s: { ahora: Centavos; diferido: Centavos }): TotalesDeImporte => ({
    original,
    descuentoAhora: s.ahora,
    descuentoDiferido: s.diferido,
    finalAhora: restar(original, s.ahora),
    finalConDiferidos: restar(original, sumar(s.ahora, s.diferido)),
  });

  return {
    aplicadas: elegidas.map((p) => ({ promocionId: p.id, nombre: p.nombre, codigo: p.codigo, prioridad: p.prioridad, acumulable: p.acumulable })),
    descartadas: descartadas.sort((a, b) => cmp(a.promocionId, b.promocionId)),
    lineas,
    inscripcion: totales(ctx.costoInscripcion, sumas.inscripcion),
    mensualidad: totales(ctx.costoMensualidad, sumas.mensualidad),
    mesesGratisAhora: lineas.filter((l) => l.tipo === "meses_gratis" && l.estado === "inmediato").reduce((n, l) => n + l.meses, 0),
    mesesGratisDiferidos: lineas.filter((l) => l.tipo === "meses_gratis" && l.estado === "pendiente").reduce((n, l) => n + l.meses, 0),
  };
}
