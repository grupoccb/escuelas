// Estado de cuenta (H3): lo que debe una familia, por hijo y en total, y qué tan viejo es lo vencido. Dinero en centavos `bigint`; sale como texto con dos decimales.
//
// DEFINICIONES
//   · SALDO de un cargo = `monto_final − monto_pagado`; un cargo CANCELADO no cuenta (ni como cargo ni como saldo).
//   · VENCIDO = el saldo de los cargos cuyo vencimiento ya pasó en el calendario de SU sucursal (con o sin el barrido que lo materializa).
//   · ANTIGÜEDAD de lo vencido, en días de atraso (hoy − vencimiento): de 0 a 30 (1 a 30 días de atraso), de 31 a 60, de 61 a 90 y más de 90. Cada
//     renglón suma el SALDO de sus cargos; la suma de los cuatro es lo vencido.
//   · Σ cargos − Σ pagos aplicados = saldo total (la cuadratura de H7 lo comprueba contra la base).
//
// También implementa `ProveedorEconomico` del expediente del alumno (G5): `server.ts` lo enchufa.

import { deFecha, type FechaISO } from "../catalogo/precios.ts";
import type { Consultas } from "../datos/alcance.ts";
import type { EstadoDeCuentaDelAlumno, ProveedorEconomico } from "../expediente/proveedores.ts";
import { aTexto, deDecimal, sumar, type Centavos } from "../lib/dinero.ts";
import { fechaLocal } from "../lib/horario.ts";
import { diasEntre } from "../lib/periodo.ts";

export interface Antiguedad {
  de_0_a_30: Centavos;
  de_31_a_60: Centavos;
  de_61_a_90: Centavos;
  mas_de_90: Centavos;
}

export const antiguedadVacia = (): Antiguedad => ({ de_0_a_30: 0n, de_31_a_60: 0n, de_61_a_90: 0n, mas_de_90: 0n });

/** En qué renglón cae un atraso en días (>= 1). PURA. */
export function renglonDeAntiguedad(diasDeAtraso: number): keyof Antiguedad {
  if (diasDeAtraso <= 30) return "de_0_a_30";
  if (diasDeAtraso <= 60) return "de_31_a_60";
  if (diasDeAtraso <= 90) return "de_61_a_90";
  return "mas_de_90";
}

export interface SaldoDeCargo {
  saldo: Centavos;
  /** Días de atraso: 0 si aún no vence. */
  diasDeAtraso: number;
}

/** Reparte los saldos vencidos en los renglones de antigüedad. Lo que no ha vencido no entra. PURA. */
export function antiguedadDe(cargos: readonly SaldoDeCargo[]): Antiguedad {
  const a = antiguedadVacia();
  for (const c of cargos) if (c.saldo > 0n && c.diasDeAtraso > 0) a[renglonDeAntiguedad(c.diasDeAtraso)] += c.saldo;
  return a;
}

export const totalDeAntiguedad = (a: Antiguedad): Centavos => sumar(a.de_0_a_30, a.de_31_a_60, a.de_61_a_90, a.mas_de_90);

export const antiguedadATexto = (a: Antiguedad) => ({ de_0_a_30: aTexto(a.de_0_a_30), de_31_a_60: aTexto(a.de_31_a_60), de_61_a_90: aTexto(a.de_61_a_90), mas_de_90: aTexto(a.mas_de_90) });

/** Días de atraso de un vencimiento a hoy (0 si no ha vencido). */
export function atrasoEn(vencimiento: FechaISO, hoy: FechaISO): number {
  const d = diasEntre(vencimiento, hoy);
  return d > 0 ? d : 0;
}

interface FilaDeCargoDeCuenta {
  id: string;
  alumno_id: string;
  inscripcion_id: string | null;
  sucursal_id: string;
  concepto: string;
  periodo: string | null;
  descripcion: string | null;
  monto_final: { toFixed(decimales: number): string };
  monto_pagado: { toFixed(decimales: number): string };
  fecha_vencimiento: Date;
  estatus: string;
}

export async function hoyDeCadaSucursal(db: Consultas, ahora: Date): Promise<Map<string, FechaISO>> {
  const m = new Map<string, FechaISO>();
  for (const s of await db.sucursal.findMany({ select: { id: true, zona_horaria: true } })) m.set(s.id, fechaLocal(ahora, s.zona_horaria));
  return m;
}

function cargoDeCuenta(c: FilaDeCargoDeCuenta, hoy: Map<string, FechaISO>) {
  const vence = deFecha(c.fecha_vencimiento);
  const cancelado = c.estatus === "cancelado";
  const final = deDecimal(c.monto_final);
  const pagado = deDecimal(c.monto_pagado);
  const saldo = cancelado ? 0n : final - pagado;
  const atraso = saldo > 0n ? atrasoEn(vence, hoy.get(c.sucursal_id) ?? vence) : 0;
  return { c, vence, cancelado, final, pagado, saldo, atraso };
}

export interface CuentaDeAlumno {
  alumno: { id: string; nombre: string; apellidos: string };
  cargos: {
    id: string;
    inscripcion_id: string | null;
    concepto: string;
    periodo: string | null;
    descripcion: string | null;
    monto_final: string;
    monto_pagado: string;
    saldo: string;
    fecha_vencimiento: FechaISO;
    estatus: string;
    estatus_efectivo: string;
    dias_de_atraso: number;
  }[];
  total_cargado: string;
  total_pagado: string;
  saldo: string;
  vencido: string;
  antiguedad: ReturnType<typeof antiguedadATexto>;
}

/** El estado de cuenta de una familia (tutor): cargos por hijo, pagos, saldo y antigüedad de lo vencido. Solo lee. */
export async function estadoDeCuentaDeFamilia(db: Consultas, tutorId: string, ahora: Date) {
  const hoy = await hoyDeCadaSucursal(db, ahora);
  const filas = await db.cargo.findMany({
    where: { tutor_id: tutorId },
    orderBy: [{ fecha_vencimiento: "asc" }, { concepto: "asc" }, { creado_en: "asc" }, { id: "asc" }], // el mismo orden de antigüedad que el reparto de un pago (`compararAntiguedad`; el enum `concepto_cargo` ordena inscripción, mensualidad, evento, producto)
    select: { id: true, alumno_id: true, inscripcion_id: true, sucursal_id: true, concepto: true, periodo: true, descripcion: true, monto_final: true, monto_pagado: true, fecha_vencimiento: true, estatus: true, alumno: { select: { id: true, nombre: true, apellidos: true } } },
  });
  const porAlumno = new Map<string, { alumno: { id: string; nombre: string; apellidos: string }; items: ReturnType<typeof cargoDeCuenta>[] }>();
  for (const f of filas) {
    const g = porAlumno.get(f.alumno_id) ?? { alumno: f.alumno, items: [] };
    g.items.push(cargoDeCuenta(f, hoy));
    porAlumno.set(f.alumno_id, g);
  }
  const resumenDe = (items: ReturnType<typeof cargoDeCuenta>[]) => {
    const vivos = items.filter((i) => !i.cancelado);
    const antiguedad = antiguedadDe(vivos.map((i) => ({ saldo: i.saldo, diasDeAtraso: i.atraso })));
    return {
      total_cargado: sumar(...vivos.map((i) => i.final)),
      total_pagado: sumar(...vivos.map((i) => i.pagado)),
      saldo: sumar(...vivos.map((i) => i.saldo)),
      vencido: totalDeAntiguedad(antiguedad),
      antiguedad,
    };
  };
  const hijos: CuentaDeAlumno[] = [...porAlumno.values()]
    .sort((a, b) => (a.alumno.nombre < b.alumno.nombre ? -1 : a.alumno.nombre > b.alumno.nombre ? 1 : a.alumno.id < b.alumno.id ? -1 : 1))
    .map(({ alumno, items }) => {
      const r = resumenDe(items);
      return {
        alumno,
        cargos: items.map(({ c, vence, final, pagado, saldo, atraso }) => ({
          id: c.id,
          inscripcion_id: c.inscripcion_id,
          concepto: c.concepto,
          periodo: c.periodo,
          descripcion: c.descripcion,
          monto_final: aTexto(final),
          monto_pagado: aTexto(pagado),
          saldo: aTexto(saldo),
          fecha_vencimiento: vence,
          estatus: c.estatus,
          estatus_efectivo: c.estatus === "pendiente" && atraso > 0 ? "vencido" : c.estatus,
          dias_de_atraso: atraso,
        })),
        total_cargado: aTexto(r.total_cargado),
        total_pagado: aTexto(r.total_pagado),
        saldo: aTexto(r.saldo),
        vencido: aTexto(r.vencido),
        antiguedad: antiguedadATexto(r.antiguedad),
      };
    });
  const total = resumenDe([...porAlumno.values()].flatMap((g) => g.items));
  const pagos = await db.pago.findMany({
    where: { tutor_id: tutorId },
    orderBy: [{ fecha: "desc" }, { creado_en: "desc" }, { id: "desc" }],
    take: 100,
    select: { id: true, monto: true, monto_aplicado: true, metodo: true, referencia: true, fecha: true, estatus: true, motivo_cancelacion: true, registrado_por: { select: { nombre: true } }, aplicaciones: { select: { cargo_id: true, monto_aplicado: true, estatus: true } } },
  });
  return {
    resumen: {
      total_cargado: aTexto(total.total_cargado),
      total_pagado: aTexto(total.total_pagado),
      saldo: aTexto(total.saldo),
      vencido: aTexto(total.vencido),
      antiguedad: antiguedadATexto(total.antiguedad),
    },
    hijos,
    pagos: pagos.map((p) => ({
      id: p.id,
      monto: aTexto(deDecimal(p.monto)),
      monto_aplicado: aTexto(deDecimal(p.monto_aplicado)),
      metodo: p.metodo,
      referencia: p.referencia,
      fecha: deFecha(p.fecha),
      estatus: p.estatus,
      // R5b: por qué se canceló (el renglón cancelado lo dice) y quién lo registró («por Rocío Méndez»).
      motivo_cancelacion: p.motivo_cancelacion,
      registrado_por: p.registrado_por?.nombre ?? null,
      aplicaciones: p.aplicaciones.map((a) => ({ cargo_id: a.cargo_id, monto: aTexto(deDecimal(a.monto_aplicado)), estatus: a.estatus })),
    })),
  };
}

/** La implementación REAL de `ProveedorEconomico` (G5): saldo, vencido y antigüedad del cargo vencido más viejo de un alumno. */
export class ProveedorEconomicoDeFinanzas implements ProveedorEconomico {
  async estadoDeCuenta(db: Consultas, alumnoId: string, ahora: Date): Promise<EstadoDeCuentaDelAlumno> {
    const hoy = await hoyDeCadaSucursal(db, ahora);
    const filas = await db.cargo.findMany({
      where: { alumno_id: alumnoId, estatus: { in: ["pendiente", "vencido", "pagado"] } },
      select: { id: true, alumno_id: true, inscripcion_id: true, sucursal_id: true, concepto: true, periodo: true, descripcion: true, monto_final: true, monto_pagado: true, fecha_vencimiento: true, estatus: true },
    });
    const items = filas.map((f) => cargoDeCuenta(f, hoy));
    const vencidos = items.filter((i) => i.saldo > 0n && i.atraso > 0);
    return {
      disponible: true,
      saldo: aTexto(sumar(...items.map((i) => i.saldo))),
      vencido: aTexto(sumar(...vencidos.map((i) => i.saldo))),
      antiguedadCarteraVencidaDias: vencidos.length === 0 ? null : vencidos.reduce((m, i) => (i.atraso > m ? i.atraso : m), 0),
    };
  }
}
