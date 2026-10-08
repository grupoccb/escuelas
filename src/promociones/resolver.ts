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
//  3. Acumulación: las NO acumulables compiten y gana solo la primera del orden (las demás pierden por
//     prioridad); las acumulables se suman todas. Resultado = la ganadora no acumulable (si hay) + todas las acumulables.
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

export function resolverPromociones(promociones: readonly PromocionDef[], ctx: ContextoPromocion): ResultadoPromociones {
  const descartadas: ResultadoPromociones["descartadas"] = [];
  const candidatas: PromocionDef[] = [];
  for (const p of [...promociones].sort(porPrioridad)) {
    const motivo = motivoDeDescarte(p, ctx);
    if (motivo) descartadas.push({ promocionId: p.id, nombre: p.nombre, motivo });
    else candidatas.push(p);
  }

  // Compiten las no acumulables: gana la primera del orden.
  const ganadoraNoAcumulable = candidatas.find((p) => !p.acumulable);
  const elegidas: PromocionDef[] = [];
  for (const p of candidatas) {
    if (p.acumulable || p === ganadoraNoAcumulable) elegidas.push(p);
    else descartadas.push({ promocionId: p.id, nombre: p.nombre, motivo: "pierde_por_prioridad" });
  }

  // Asignación de descuentos, en orden de promoción y de beneficio, sobre el importe original.
  const restante = { descuento_inscripcion: ctx.costoInscripcion, descuento_mensualidad: ctx.costoMensualidad };
  const lineas: LineaDeBeneficio[] = [];
  const sumas = { inscripcion: { ahora: 0n, diferido: 0n }, mensualidad: { ahora: 0n, diferido: 0n } };
  const pendientesDeMeses: LineaDeBeneficio[] = [];

  for (const p of elegidas) {
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
