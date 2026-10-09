// Cargos (H1): lo que una familia debe. Dinero SIEMPRE en centavos `bigint` (`src/lib/dinero.ts`); las columnas son `Decimal(12,2)`.
//
// QUÉ SE COBRA Y CUÁNDO
//   · Al inscribir (F3) se generan, en la MISMA transacción de la inscripción, el cargo de INSCRIPCIÓN y la PRIMERA MENSUALIDAD (la del mes en que empieza el
//     alumno). Los descuentos son los de las promociones INMEDIATAS ya congeladas en la inscripción: `monto = precio de lista`, `descuento = descuento_*`,
//     `monto_final = monto − descuento`. Los meses gratis (`meses_gratis_aplicados`) dejan en cero las primeras n mensualidades. Si la familia declaró meses
//     pagados por adelantado (`meses_pagados_por_adelantado = n`), se generan las n primeras mensualidades, todas con vencimiento el día de la inscripción.
//   · Cada mes, el barrido (`generarMensualidades`) genera la mensualidad del mes en curso de las inscripciones ACTIVAS (no congeladas ni dadas de baja), con el
//     precio y el descuento congelados en la inscripción. Idempotente por (inscripción, periodo) con un único parcial en la base: un reintento o dos barridos en
//     paralelo nunca generan dos veces. Solo se genera el mes en curso (no se recupera lo que el barrido no vio en meses pasados).
//   · VENCIMIENTO: el día de corte de la inscripción (`dia_corte_pago`, con la regla del fin de mes de `src/inscripciones/corte.ts`) dentro del periodo. La
//     primera mensualidad no vence antes del día de la inscripción.
//
// ESTATUS. `pendiente | pagado | vencido | cancelado`. «Vencido» se DERIVA de la fecha (`estatusEfectivo`) y se materializa con el barrido
// (`materializarVencidos`): quien lee nunca depende de que el barrido haya corrido. Pagado ⇔ lo pagado es todo el monto final (CHECK en la base); un cargo
// sin importe (mes gratis) nace pagado. Cancelar un cargo es cambiar su estatus (nunca se borra) y solo se puede si no tiene pagos vivos.

import { aFecha, deFecha, type FechaISO } from "../catalogo/precios.ts";
import { altaConAlcance, type BaseDatos, type Consultas } from "../datos/alcance.ts";
import { cancelarEjecucionesDeCobro } from "../cobranza/ejecuciones.ts";
import { fechaDeCorte } from "../inscripciones/corte.ts";
import { aTexto, deDecimal, minimo, restar, type Centavos } from "../lib/dinero.ts";
import { fechaLocal } from "../lib/horario.ts";
import { diasEntre, nombreDelPeriodo, partesDePeriodo, periodoDe, sumarMeses, type Periodo } from "../lib/periodo.ts";

export type ConceptoDeCargo = "inscripcion" | "mensualidad" | "evento" | "producto";
export type EstatusDeCargo = "pendiente" | "pagado" | "vencido" | "cancelado";

// ── Reglas puras ────────────────────────────────────────────────────────────────────────────────────

export interface PlanDeCargo {
  concepto: "inscripcion" | "mensualidad";
  periodo: Periodo | null;
  monto: Centavos;
  descuento: Centavos;
  fechaVencimiento: FechaISO;
  descripcion: string;
}

export interface InscripcionParaCargos {
  fechaInscripcion: FechaISO;
  fechaInicio: FechaISO;
  diaCorte: number;
  precioInscripcion: Centavos;
  precioMensualidad: Centavos;
  descuentoInscripcion: Centavos;
  descuentoMensualidad: Centavos;
  mesesGratis: number;
  mesesPagadosPorAdelantado: number;
}

/** El vencimiento de la mensualidad de un periodo: el día de corte de ese mes; no antes de `noAntesDe` (si se da). */
export function vencimientoDeMensualidad(diaCorte: number, periodo: Periodo, noAntesDe: FechaISO | null = null): FechaISO {
  const { anio, mes } = partesDePeriodo(periodo);
  const corte = fechaDeCorte(diaCorte, anio, mes);
  return noAntesDe !== null && corte < noAntesDe ? noAntesDe : corte;
}

/**
 * El descuento de la mensualidad número `indice` (0 = la primera) de una inscripción: los primeros `mesesGratis` meses se condonan por completo; el resto lleva
 * el descuento de mensualidad congelado (nunca más que el monto).
 */
export function descuentoDeMensualidad(precio: Centavos, descuentoFijo: Centavos, mesesGratis: number, indice: number): Centavos {
  if (indice < mesesGratis) return precio;
  return minimo(descuentoFijo, precio);
}

const descripcionDeMensualidad = (periodo: Periodo): string => `Mensualidad de ${nombreDelPeriodo(periodo)}`;

/** Un cargo de mensualidad del periodo dado (sin lógica de cuándo generarlo). */
export function planDeMensualidad(i: InscripcionParaCargos, periodo: Periodo, indice: number, vencimiento: FechaISO): PlanDeCargo {
  return {
    concepto: "mensualidad",
    periodo,
    monto: i.precioMensualidad,
    descuento: descuentoDeMensualidad(i.precioMensualidad, i.descuentoMensualidad, i.mesesGratis, indice),
    fechaVencimiento: vencimiento,
    descripcion: descripcionDeMensualidad(periodo),
  };
}

/** Los cargos que nacen con la inscripción: el de inscripción y las primeras mensualidades (una, o las que se pagan por adelantado). */
export function planAlInscribir(i: InscripcionParaCargos): PlanDeCargo[] {
  const planes: PlanDeCargo[] = [
    {
      concepto: "inscripcion",
      periodo: null,
      monto: i.precioInscripcion,
      descuento: minimo(i.descuentoInscripcion, i.precioInscripcion),
      fechaVencimiento: i.fechaInscripcion,
      descripcion: "Inscripción",
    },
  ];
  const primero = periodoDe(i.fechaInicio);
  const cuantas = Math.max(1, i.mesesPagadosPorAdelantado);
  for (let k = 0; k < cuantas; k++) {
    const periodo = sumarMeses(primero, k);
    // Lo pagado por adelantado se cobra al inscribirse; la primera mensualidad normal vence en su corte (no antes de inscribirse).
    const vence = i.mesesPagadosPorAdelantado > 0 ? i.fechaInscripcion : vencimientoDeMensualidad(i.diaCorte, periodo, i.fechaInscripcion);
    planes.push(planDeMensualidad(i, periodo, k, vence));
  }
  return planes;
}

/** Lo que falta por pagar de un cargo. */
export const saldoDe = (montoFinal: Centavos, montoPagado: Centavos): Centavos => restar(montoFinal, montoPagado);

/** El estatus que se muestra: un pendiente con saldo cuyo vencimiento ya pasó es «vencido» aunque el barrido no lo haya materializado. */
export function estatusEfectivo(estatus: EstatusDeCargo, vencimiento: FechaISO, hoy: FechaISO): EstatusDeCargo {
  return estatus === "pendiente" && vencimiento < hoy ? "vencido" : estatus;
}

/** Días de atraso de un cargo (0 si aún no vence). */
export function diasDeAtraso(vencimiento: FechaISO, hoy: FechaISO): number {
  const d = diasEntre(vencimiento, hoy);
  return d > 0 ? d : 0;
}

// ── Base de datos ───────────────────────────────────────────────────────────────────────────────────

/** El responsable de pago de un alumno; si ninguno lo es, el primer tutor ligado. Null si no tiene tutores. */
export async function responsableDePago(tx: Consultas, alumnoId: string): Promise<string | null> {
  const v = await tx.tutor_alumno.findFirst({
    where: { alumno_id: alumnoId, tutor: { eliminado_en: null } },
    orderBy: [{ es_responsable_pago: "desc" }, { creado_en: "asc" }, { id: "asc" }],
    select: { tutor_id: true },
  });
  return v?.tutor_id ?? null;
}

export interface ContextoDeCargo {
  ahora: Date;
  usuarioId: string | null;
}

export interface CargoCreado {
  id: string;
  concepto: ConceptoDeCargo;
  periodo: string | null;
  montoFinal: string;
  fechaVencimiento: FechaISO;
  estatus: EstatusDeCargo;
}

const SELECCION_CREADO = { id: true, concepto: true, periodo: true, monto_final: true, fecha_vencimiento: true, estatus: true } as const;
const comoCreado = (c: { id: string; concepto: ConceptoDeCargo; periodo: string | null; monto_final: { toFixed(decimales: number): string }; fecha_vencimiento: Date; estatus: EstatusDeCargo }): CargoCreado => ({
  id: c.id,
  concepto: c.concepto,
  periodo: c.periodo,
  montoFinal: aTexto(deDecimal(c.monto_final)),
  fechaVencimiento: deFecha(c.fecha_vencimiento),
  estatus: c.estatus,
});

function datosDeAlta(p: PlanDeCargo, base: { tutorId: string; alumnoId: string; inscripcionId: string; sucursalId: string; usuarioId: string | null }) {
  const final = restar(p.monto, p.descuento);
  return altaConAlcance({
    tutor_id: base.tutorId,
    alumno_id: base.alumnoId,
    inscripcion_id: base.inscripcionId,
    sucursal_id: base.sucursalId,
    concepto: p.concepto,
    periodo: p.periodo,
    descripcion: p.descripcion,
    monto: aTexto(p.monto),
    descuento: aTexto(p.descuento),
    monto_final: aTexto(final),
    monto_pagado: "0.00",
    fecha_vencimiento: aFecha(p.fechaVencimiento),
    // Un cargo sin importe (mes gratis, inscripción gratis) nace pagado: no hay nada que cobrar (CHECK de coherencia con el saldo).
    estatus: final === 0n ? ("pagado" as const) : ("pendiente" as const),
    creado_por_usuario_id: base.usuarioId,
  });
}

/** Genera los cargos de una inscripción recién creada para su responsable de pago. Corre DENTRO de la transacción de la inscripción. Idempotente (únicos parciales). */
export async function crearCargosAlInscribir(
  tx: Consultas,
  ctx: ContextoDeCargo,
  i: InscripcionParaCargos & { inscripcionId: string; alumnoId: string; sucursalId: string; tutorId: string },
): Promise<CargoCreado[]> {
  const filas = await tx.cargo.createManyAndReturn({
    data: planAlInscribir(i).map((p) => datosDeAlta(p, { tutorId: i.tutorId, alumnoId: i.alumnoId, inscripcionId: i.inscripcionId, sucursalId: i.sucursalId, usuarioId: ctx.usuarioId })),
    skipDuplicates: true,
    select: SELECCION_CREADO,
  });
  return filas.map(comoCreado);
}

export interface ResumenDeGeneracion {
  inscripciones: number;
  creados: number;
  sinResponsable: number;
}

const LOTE = 200;

/**
 * Genera la mensualidad del MES EN CURSO (calendario local de la sucursal de cada grupo) de las inscripciones activas que ya empezaron su periodo. Idempotente
 * por (inscripción, periodo) —único parcial en la base—, así que correrlo dos veces, o dos barridos a la vez, no duplica. Las congeladas y las bajas no generan.
 */
export async function generarMensualidades(db: BaseDatos, ahora: Date): Promise<ResumenDeGeneracion> {
  const resumen: ResumenDeGeneracion = { inscripciones: 0, creados: 0, sinResponsable: 0 };
  let cursor: string | undefined;
  for (;;) {
    const lote = await db.inscripcion.findMany({
      where: { estatus: "activa" },
      orderBy: { id: "asc" },
      take: LOTE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        alumno_id: true,
        fecha_inscripcion: true,
        fecha_inicio: true,
        dia_corte_pago: true,
        precio_mensualidad_aplicado: true,
        descuento_mensualidad_aplicado: true,
        meses_gratis_aplicados: true,
        grupo: { select: { programa: { select: { sucursal_id: true, sucursal: { select: { zona_horaria: true } } } } } },
      },
    });
    if (lote.length === 0) break;
    cursor = lote[lote.length - 1]!.id;
    resumen.inscripciones += lote.length;

    const conPeriodo = lote
      .map((i) => ({ i, periodo: periodoDe(fechaLocal(ahora, i.grupo.programa.sucursal.zona_horaria)) }))
      .filter((x) => periodoDe(deFecha(x.i.fecha_inicio)) <= x.periodo);
    if (conPeriodo.length === 0) continue;

    const existentes = await db.cargo.findMany({
      where: { inscripcion_id: { in: conPeriodo.map((x) => x.i.id) }, concepto: "mensualidad" },
      select: { inscripcion_id: true, periodo: true },
    });
    const porInscripcion = new Map<string, string[]>();
    for (const c of existentes) if (c.inscripcion_id && c.periodo) (porInscripcion.get(c.inscripcion_id) ?? porInscripcion.set(c.inscripcion_id, []).get(c.inscripcion_id)!).push(c.periodo);
    const faltantes = conPeriodo.filter((x) => !(porInscripcion.get(x.i.id) ?? []).includes(x.periodo));
    if (faltantes.length === 0) continue;

    const vinculos = await db.tutor_alumno.findMany({
      where: { alumno_id: { in: faltantes.map((x) => x.i.alumno_id) }, tutor: { eliminado_en: null } },
      orderBy: [{ es_responsable_pago: "desc" }, { creado_en: "asc" }, { id: "asc" }],
      select: { alumno_id: true, tutor_id: true },
    });
    const tutorDe = new Map<string, string>();
    for (const v of vinculos) if (!tutorDe.has(v.alumno_id)) tutorDe.set(v.alumno_id, v.tutor_id);

    const data = [];
    for (const { i, periodo } of faltantes) {
      const tutorId = tutorDe.get(i.alumno_id);
      if (!tutorId) {
        resumen.sinResponsable++;
        continue;
      }
      // La posición de este mes entre las mensualidades de la inscripción (para los meses gratis): las anteriores, canceladas o no.
      const indice = (porInscripcion.get(i.id) ?? []).filter((p) => p < periodo).length;
      const plan = planDeMensualidad(
        {
          fechaInscripcion: deFecha(i.fecha_inscripcion),
          fechaInicio: deFecha(i.fecha_inicio),
          diaCorte: i.dia_corte_pago,
          precioInscripcion: 0n,
          precioMensualidad: deDecimal(i.precio_mensualidad_aplicado),
          descuentoInscripcion: 0n,
          descuentoMensualidad: deDecimal(i.descuento_mensualidad_aplicado),
          mesesGratis: i.meses_gratis_aplicados,
          mesesPagadosPorAdelantado: 0,
        },
        periodo,
        indice,
        vencimientoDeMensualidad(i.dia_corte_pago, periodo),
      );
      data.push(datosDeAlta(plan, { tutorId, alumnoId: i.alumno_id, inscripcionId: i.id, sucursalId: i.grupo.programa.sucursal_id, usuarioId: null }));
    }
    if (data.length === 0) continue;
    const r = await db.cargo.createMany({ data, skipDuplicates: true });
    resumen.creados += r.count;
  }
  return resumen;
}

/** Marca `vencido` los cargos pendientes cuyo vencimiento ya pasó (según el calendario local de su sucursal). Idempotente. Devuelve cuántos cambió. */
export async function materializarVencidos(db: BaseDatos, ahora: Date): Promise<number> {
  let cambiados = 0;
  for (const s of await db.sucursal.findMany({ select: { id: true, zona_horaria: true } })) {
    const hoy = fechaLocal(ahora, s.zona_horaria);
    const r = await db.cargo.updateMany({ where: { sucursal_id: s.id, estatus: "pendiente", fecha_vencimiento: { lt: aFecha(hoy) } }, data: { estatus: "vencido" } });
    cambiados += r.count;
  }
  return cambiados;
}

export type ResultadoDeCancelacion =
  | { ok: true; cargoId: string }
  | { ok: false; motivo: "inexistente" | "ya_cancelado" | "tiene_pagos" | "ya_pagado" | "de_venta" };

/**
 * Cancela un cargo (estatus, no borrado). UNA sentencia condicional: solo si sigue abierto y SIN pagos vivos (la base lo exige también: CHECK
 * `cancelado ⇒ monto_pagado = 0`). Si tiene pagos, primero se cancela el pago.
 */
export async function cancelarCargo(tx: Consultas, ctx: ContextoDeCargo, e: { cargoId: string; motivo: string }): Promise<ResultadoDeCancelacion> {
  const r = await tx.cargo.updateMany({
    where: { id: e.cargoId, venta_id: null, estatus: { in: ["pendiente", "vencido"] }, monto_pagado: "0.00" },
    data: { estatus: "cancelado", cancelado_en: ctx.ahora, cancelado_por_usuario_id: ctx.usuarioId, motivo_cancelacion: e.motivo },
  });
  if (r.count === 1) {
    await cancelarEjecucionesDeCobro(tx, [e.cargoId], "cargo_cancelado");
    return { ok: true, cargoId: e.cargoId };
  }
  const c = await tx.cargo.findFirst({ where: { id: e.cargoId }, select: { estatus: true, monto_pagado: true, monto_final: true, venta_id: true } });
  if (!c) return { ok: false, motivo: "inexistente" };
  // El cargo de una venta se cancela anulando la venta (devuelve las piezas); cancelarlo suelto dejaría la venta sin su cargo.
  if (c.venta_id) return { ok: false, motivo: "de_venta" };
  if (c.estatus === "cancelado") return { ok: false, motivo: "ya_cancelado" };
  if (deDecimal(c.monto_pagado) > 0n) return { ok: false, motivo: c.estatus === "pagado" ? "ya_pagado" : "tiene_pagos" };
  return { ok: false, motivo: "ya_pagado" }; // un cargo sin importe, ya «pagado»
}
